import type { Note } from "./types";
import { storedNoteSchema } from "./noteSchema";

type Draft = { key: string; token: string; note: Note; updated: number };
let database: Promise<IDBDatabase> | undefined;
const tails = new Map<string, Promise<unknown>>();

function open() {
  if (!database)
    database = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(
          new Error(
            "Draft storage is unavailable. Keep this page open until saving finishes.",
          ),
        );
        return;
      }
      const request = indexedDB.open("synapse-note-drafts", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("drafts", { keyPath: "key" });
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          database = undefined;
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(
          new Error("Close the other Synapse tab to enable draft recovery."),
        );
    }).catch((error) => {
      database = undefined;
      throw error;
    });
  return database;
}

function serial<T>(key: string, task: () => Promise<T>): Promise<T> {
  const pending = (tails.get(key) || Promise.resolve()).then(task, task);
  const settled = pending.catch(() => {});
  tails.set(key, settled);
  void settled.then(() => {
    if (tails.get(key) === settled) tails.delete(key);
  });
  return pending;
}

async function readRecord(key: string): Promise<Draft | undefined> {
  return serial(key, async () => {
    const db = await open();
    const draft = await new Promise<Draft | undefined>((resolve, reject) => {
      const request = db.transaction("drafts").objectStore("drafts").get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (!draft) return;
    // Keep malformed records in storage instead of silently deleting them.
    const parsed = storedNoteSchema.safeParse(draft.note);
    if (!parsed.success)
      throw new Error(
        "A recovered draft needs review. Its stored copy has not been removed.",
      );
    return { ...draft, note: parsed.data as Note };
  });
}
export async function readNoteDraft(key: string): Promise<Note | undefined> {
  return (await readRecord(key))?.note;
}

function writeDraft(draft: Draft) {
  return serial(draft.key, async () => {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("drafts", "readwrite");
      tx.objectStore("drafts").put(draft);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  });
}

function removeDraft(key: string, tokens: string[]) {
  return serial(key, async () => {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("drafts", "readwrite"),
        store = tx.objectStore("drafts");
      {
        const request = store.get(key);
        request.onsuccess = () => {
          if (tokens.includes(request.result?.token)) store.delete(key);
        };
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  });
}

/** Coalesce complete snapshots between strokes. No JSON serialization or disk work on pointermove. */
export class NoteDraftWriter {
  private latest?: Draft;
  private timer?: ReturnType<typeof setTimeout>;
  private writing?: Promise<void>;
  private persisted = "";
  private observed = "";
  constructor(
    public key: string,
    private onError: (error: Error) => void = () => {},
  ) {}
  async read() {
    const record = await readRecord(this.key);
    this.observed = record?.token || "";
    return record?.note;
  }
  hasStored(note?: Note) {
    return (
      !!note &&
      this.latest?.note === note &&
      this.persisted === this.latest.token
    );
  }
  stage(note: Note) {
    this.latest = {
      key: this.key,
      token: crypto.randomUUID(),
      note,
      updated: Date.now(),
    };
    if (!this.timer)
      this.timer = setTimeout(() => {
        this.timer = undefined;
        void this.flush().catch((error) => this.onError(error));
      }, 250);
  }
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.writing) {
      await this.writing;
      return this.flush();
    }
    const snapshot = this.latest;
    if (!snapshot || this.persisted === snapshot.token) return;
    this.writing = writeDraft(snapshot).then(() => {
      this.persisted = snapshot.token;
    });
    try {
      await this.writing;
    } finally {
      this.writing = undefined;
    }
    if (this.latest && this.latest !== snapshot && !this.timer)
      this.timer = setTimeout(() => {
        this.timer = undefined;
        void this.flush().catch((error) => this.onError(error));
      }, 250);
  }
  async acknowledge(note: Note) {
    if (this.latest?.note !== note) return;
    const snapshot = this.latest;
    this.latest = undefined;
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.writing) await this.writing.catch(() => {});
    await removeDraft(this.key, [snapshot.token]);
  }
  async discard() {
    const tokens = [this.latest?.token, this.persisted, this.observed].filter(
      (token): token is string => !!token,
    );
    this.latest = undefined;
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.writing) await this.writing.catch(() => {});
    if (this.latest) return;
    if (tokens.length) await removeDraft(this.key, tokens);
  }
}
