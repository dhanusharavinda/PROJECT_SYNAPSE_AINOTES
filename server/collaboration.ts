import fs from "node:fs/promises";
import crypto from "node:crypto";
import { AppError, atomic, Vault, safeId } from "./vault.js";
import { noteSchema } from "../src/noteSchema.js";
import type { Note, CanvasItem } from "../src/types.js";
export type MemberRole = "viewer" | "editor";
export type Principal = {
  session: string;
  email: string;
  name: string;
  localOwner?: boolean;
};
export type Presence = {
  session: string;
  name: string;
  email: string;
  cell: string;
  anchor?: number;
  head?: number;
  color: string;
  expires: number;
};
export type Membership = {
  files?: string[];
  owner: string;
  members: { email: string; role: MemberRole }[];
};
export type CellChange = { cell: string; base: string; value: unknown };
const cellHash = (value: unknown) =>
  crypto
    .createHash("sha256")
    .update(JSON.stringify(value ?? null))
    .digest("hex");
export function cellValue(note: Note, cell: string): unknown {
  if (["title", "body", "context", "group", "theme", "fileName"].includes(cell))
    return (note as any)[cell] ?? null;
  if (cell === "canvasSize")
    return {
      width: note.canvas?.width || 1100,
      height: note.canvas?.height || 500,
    };
  if (cell.startsWith("item/"))
    return note.canvas?.items.find((i) => i.id === cell.slice(5)) ?? null;
  throw new AppError(400, "Unknown notebook field.");
}
export function noteCells(note: Note) {
  return Object.fromEntries(
    [
      "title",
      "fileName",
      "body",
      "context",
      "group",
      "theme",
      "canvasSize",
      ...(note.canvas?.items || []).map((i) => "item/" + i.id),
    ].map((cell) => [
      cell,
      { value: cellValue(note, cell), hash: cellHash(cellValue(note, cell)) },
    ]),
  );
}
export class Collaboration {
  roster: Record<string, Membership> = {};
  presence = new Map<string, Map<string, Presence>>();
  listeners = new Map<string, Set<(event: unknown) => void>>();
  parents = new Map<string, string>();
  versions = new Map<string, number>();
  async syncHierarchy() {
    this.parents = new Map(
      (await this.vault.notes())
        .filter((n) => n.parentId)
        .map((n) => [n.id, n.parentId!]),
    );
  }
  membership(id: string): Membership | undefined {
    const seen = new Set<string>();
    while (id && !seen.has(id)) {
      seen.add(id);
      if (this.roster[id]) return this.roster[id];
      id = this.parents.get(id) || "";
    }
  }
  async watch(id: string, p: Principal, cursor?: number) {
    await this.syncHierarchy();
    this.role(id, p);
    if (
      cursor === this.versions.get(id) ||
      (cursor === 0 && !this.versions.has(id))
    ) {
      await new Promise<void>((resolve) => {
        let stop = () => {};
        const timer = setTimeout(() => {
          stop();
          resolve();
        }, 15000);
        stop = this.subscribe(id, p, () => {
          clearTimeout(timer);
          stop();
          resolve();
        });
        if ((this.versions.get(id) || 0) !== cursor) {
          clearTimeout(timer);
          stop();
          resolve();
        }
      });
    }
    return {
      cursor: this.versions.get(id) || 0,
      snapshot: await this.snapshot(id, p),
    };
  }
  constructor(private vault: Vault) {}
  async load() {
    try {
      this.roster = JSON.parse(
        await fs.readFile(
          this.vault.file(".synapse/collaborators.json"),
          "utf8",
        ),
      );
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  role(noteId: string, p: Principal) {
    const m = this.membership(noteId);
    if (p.localOwner) return "owner";
    if (!m) throw new AppError(403, "This page has not been shared with you.");
    if (p.email === m.owner) return "owner";
    const member = m.members.find((x) => x.email === p.email);
    if (!member)
      throw new AppError(403, "You no longer have access to this page.");
    return member.role;
  }
  async invite(
    noteId: string,
    owner: Principal,
    email: string,
    role: MemberRole,
  ) {
    safeId(noteId);
    if (this.role(noteId, owner) !== "owner")
      throw new AppError(403, "Only the owner can invite people.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
      throw new AppError(400, "Enter a valid email.");
    if (!["viewer", "editor"].includes(role))
      throw new AppError(400, "Choose viewer or editor.");
    const existingNote = await this.vault.note(noteId);
    await this.syncHierarchy();
    const notes = await this.vault.notes();
    const subtree = notes.filter((n) => {
      let id = n.id;
      const seen = new Set<string>();
      while (id && !seen.has(id)) {
        if (id === noteId) return true;
        seen.add(id);
        id = this.parents.get(id) || "";
      }
      return false;
    });
    const initialText = [
      ...subtree.flatMap((n) => [
        n.body || "",
        ...Object.values(n.layers),
        ...(n.canvas?.items.map((i) => i.src || "") || []),
      ]),
    ].join("\n");
    const initialFiles = [
      ...new Set(
        [
          ...initialText.matchAll(
            /(attachments|drawings)\/([a-f0-9-]{36}\.(?:png|jpe?g|webp|svg|pdf|json|txt|md))/gi,
          ),
        ].map((m) => m[1] + "/" + m[2]),
      ),
    ];
    email = email.trim().toLowerCase();
    if (!owner.email)
      throw new AppError(
        401,
        "Sign in with a verified email before inviting people.",
      );
    await this.vault.serial(async () => {
      const current = this.roster[noteId] || {
        owner: owner.email,
        members: [],
        files: initialFiles,
      };
      if (email === current.owner)
        throw new AppError(400, "This email already owns the page.");
      const next = {
        ...current,
        members: [
          ...current.members.filter((m) => m.email !== email),
          { email, role },
        ],
      };
      await atomic(
        this.vault.file(".synapse/collaborators.json"),
        JSON.stringify({ ...this.roster, [noteId]: next }),
      );
      this.roster[noteId] = next;
    });
    this.clearUserPresence(noteId, email);
    this.broadcast(noteId, { type: "members" });
    return this.roster[noteId];
  }
  async revoke(noteId: string, owner: Principal, email: string) {
    if (this.role(noteId, owner) !== "owner")
      throw new AppError(403, "Only the owner can remove people.");
    await this.vault.serial(async () => {
      const m = this.roster[noteId];
      if (!m) return;
      const next = {
        ...m,
        members: m.members.filter((p) => p.email !== email),
      };
      await atomic(
        this.vault.file(".synapse/collaborators.json"),
        JSON.stringify({ ...this.roster, [noteId]: next }),
      );
      this.roster[noteId] = next;
    });
    this.clearUserPresence(noteId, email);
    this.broadcast(noteId, { type: "members" });
  }
  clearUserPresence(id: string, email: string) {
    for (const [key, p] of this.presence.get(id) || [])
      if (p.email === email) this.presence.get(id)!.delete(key);
  }
  active(id: string) {
    const now = Date.now(),
      map = this.presence.get(id);
    for (const [key, p] of map || []) {
      try {
        this.role(id, p);
        if (p.expires < now) map!.delete(key);
      } catch {
        map!.delete(key);
      }
    }
    return [...(map?.values() || [])];
  }
  async snapshot(id: string, p: Principal) {
    await this.syncHierarchy();
    const role = this.role(id, p),
      note = await this.vault.note(id);
    return {
      note,
      cells: noteCells(note),
      role,
      presence: this.active(id),
      members: role === "owner" ? this.roster[id]?.members || [] : undefined,
    };
  }
  async acquire(
    id: string,
    p: Principal,
    cell: string,
    selection?: { anchor?: number; head?: number },
  ) {
    if (this.role(id, p) === "viewer")
      throw new AppError(403, "Viewer access does not allow editing.");
    const note = await this.vault.note(id);
    cellValue(note, cell);
    if (cell.startsWith("item/")) safeId(cell.slice(5));
    const holder = this.active(id).find(
      (a) => a.cell === cell && a.session !== p.session,
    );
    if (holder) throw new AppError(423, holder.name + " is editing this part.");
    const peers = this.presence.get(id) || new Map<string, Presence>();
    this.presence.set(id, peers);
    const color = ["#d8bc76", "#92bdbe", "#be99c8", "#b3c78c"][
      crypto.createHash("sha256").update(p.email).digest()[0] % 4
    ];
    peers.set(p.session + ":" + cell, {
      session: p.session,
      email: p.email,
      name: p.name.slice(0, 60) || p.email.split("@")[0],
      cell,
      ...selection,
      color,
      expires: Date.now() + 15000,
    });
    this.broadcast(id, { type: "presence", presence: this.active(id) });
    return {
      session: p.session,
      value: cellValue(note, cell),
      hash: cellHash(cellValue(note, cell)),
    };
  }
  release(id: string, p: Principal, cell?: string) {
    this.role(id, p);
    const peers = this.presence.get(id);
    for (const [key, v] of peers || [])
      if (v.session === p.session && (!cell || v.cell === cell))
        peers!.delete(key);
    this.broadcast(id, { type: "presence", presence: this.active(id) });
  }
  async change(id: string, p: Principal, changes: CellChange[]) {
    if (this.role(id, p) === "viewer")
      throw new AppError(403, "Viewer access does not allow editing.");
    if (!changes.length || changes.length > 200)
      throw new AppError(400, "Choose between one and 200 changes.");
    return this.vault.serial(async () => {
      if (this.role(id, p) === "viewer")
        throw new AppError(403, "Viewer access does not allow editing.");
      const note = await this.vault.note(id);
      let next: Note = structuredClone(note);
      const active = this.active(id);
      for (const change of changes) {
        const lock = active.find(
          (a) => a.cell === change.cell && a.session === p.session,
        );
        if (!lock) throw new AppError(423, "Select this part before editing.");
        if (cellHash(cellValue(note, change.cell)) !== change.base)
          throw new AppError(
            409,
            "This part changed elsewhere. Keep your draft and reload it.",
          );
        if (change.cell.startsWith("item/")) {
          const itemId = safeId(change.cell.slice(5)),
            canvas = next.canvas || { width: 1100, height: 500, items: [] };
          if (
            change.value !== null &&
            (change.value as CanvasItem)?.id !== itemId
          )
            throw new AppError(400, "Object identity cannot change.");
          const items = [...canvas.items],
            index = items.findIndex((i) => i.id === itemId);
          if (index >= 0) {
            if (change.value === null) items.splice(index, 1);
            else items[index] = change.value as CanvasItem;
          } else if (change.value !== null)
            items.push(change.value as CanvasItem);
          next.canvas = { ...canvas, items };
        } else if (change.cell === "canvasSize") {
          const size = change.value as any;
          next.canvas = {
            ...next.canvas!,
            items: next.canvas?.items || [],
            width: size?.width,
            height: size?.height,
          };
        } else (next as any)[change.cell] = change.value;
      }
      noteSchema.parse(next);
      const saved = await this.vault.writeUnlocked(next, note.revision);
      this.broadcast(id, {
        type: "change",
        note: saved,
        cells: noteCells(saved),
        by: p.session,
        presence: this.active(id),
      });
      return saved;
    });
  }
  subscribe(id: string, p: Principal, listener: (event: unknown) => void) {
    this.role(id, p);
    const callbacks = this.listeners.get(id) || new Set();
    this.listeners.set(id, callbacks);
    const guarded = (event: unknown) => {
      try {
        this.role(id, p);
        listener(event);
      } catch {
        listener({ type: "revoked" });
        callbacks.delete(guarded);
      }
    };
    callbacks.add(guarded);
    return () => {
      callbacks.delete(guarded);
    };
  }
  broadcast(id: string, event: unknown) {
    this.versions.set(id, (this.versions.get(id) || 0) + 1);
    for (const listener of this.listeners.get(id) || []) listener(event);
    if ((event as any)?.type === "members") {
      for (const child of this.parents.keys()) {
        let parent = this.parents.get(child);
        const seen = new Set<string>([child]);
        while (parent && !seen.has(parent)) {
          if (parent === id) {
            this.versions.set(child, (this.versions.get(child) || 0) + 1);
            for (const listener of this.listeners.get(child) || [])
              listener(event);
            break;
          }
          seen.add(parent);
          parent = this.parents.get(parent);
        }
      }
    }
  }
}
