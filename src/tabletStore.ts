import type { Note } from "./types";
import { z } from "zod";
import { storedNoteSchema } from "./noteSchema";
export type TabletRecord = {
  note: Note;
  base: string | null;
  dirty: boolean;
  version: number;
  operation: string;
};
export type TabletAsset = {
  name: string;
  type: string;
  blob: Blob;
  dirty: boolean;
};
export function openTabletDB() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("synapse-tablet", 2);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains("pages"))
        r.result.createObjectStore("pages", { keyPath: "note.id" });
      if (!r.result.objectStoreNames.contains("assets"))
        r.result.createObjectStore("assets", { keyPath: "name" });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () =>
      reject(Error("Close other Synapse tabs, then reopen this notebook."));
  });
}
export async function allPages() {
  const db = await openTabletDB();
  try {
    return await new Promise<TabletRecord[]>((resolve, reject) => {
      const r = db.transaction("pages").objectStore("pages").getAll();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}
export async function putPage(value: TabletRecord, oldId?: string) {
  const db = await openTabletDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("pages", "readwrite");
      if (oldId && oldId !== value.note.id)
        tx.objectStore("pages").delete(oldId);
      tx.objectStore("pages").put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export function newTabletNote(): Note {
  const theme =
    typeof document !== "undefined"
      ? (document.documentElement.dataset.theme as Note["theme"])
      : undefined;
  return {
    id: crypto.randomUUID(),
    title: "Untitled page",
    ...(theme && ["light", "dark", "paper", "dotted"].includes(theme)
      ? { theme }
      : {}),
    context: "",
    group: "Tablet",
    body: "",
    layers: { intuition: "", technical: "", implementation: "" },
    canvas: { width: 1100, height: 1200, items: [] },
    links: [],
    sources: [],
    drawings: [],
    status: "collected",
    revision: 0,
    updated: new Date().toISOString(),
  };
}
export function editRecord(record: TabletRecord, note: Note): TabletRecord {
  return {
    ...record,
    note,
    dirty: true,
    version: record.version + 1,
    operation: crypto.randomUUID(),
  };
}
export function acknowledge(
  current: TabletRecord,
  sent: TabletRecord,
  result: { note: Note; conflict: boolean },
): TabletRecord {
  if (current.version === sent.version)
    return {
      note: result.note,
      base: result.note.etag || null,
      dirty: false,
      version: current.version,
      operation: crypto.randomUUID(),
    };
  return {
    ...current,
    note: {
      ...current.note,
      id: result.note.id,
      etag: result.note.etag,
      revision: result.note.revision,
      updated: result.note.updated,
    },
    base: result.note.etag || null,
  };
}
export async function assets() {
  const db = await openTabletDB();
  try {
    return await new Promise<TabletAsset[]>((resolve, reject) => {
      const r = db.transaction("assets").objectStore("assets").getAll();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}
export async function putAsset(asset: TabletAsset) {
  const db = await openTabletDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("assets", "readwrite");
      tx.objectStore("assets").put(asset);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export function blobBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
export const tabletBackupSchema = z.object({
  format: z.literal("synapse-tablet-1"),
  pages: z.array(z.object({ note: storedNoteSchema })).max(2000),
  assets: z
    .array(
      z.object({
        name: z
          .string()
          .regex(
            /^(attachments|drawings)\/[a-f0-9-]{36}\.(png|jpe?g|webp|pdf|svg|json)$/i,
          ),
        type: z.string().max(100),
        data: z
          .string()
          .max(28000000)
          .regex(/^[A-Za-z0-9+/]*={0,2}$/),
      }),
    )
    .max(2000)
    .default([]),
});
