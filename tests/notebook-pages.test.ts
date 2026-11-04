import { it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Vault, encodeNote, decodeNote } from "../server/vault";
import { Collaboration, type Principal } from "../server/collaboration";
import { newTabletNote } from "../src/tabletStore";
import {
  notebookPages,
  addNotebookPage,
  changeNotebookPage,
  notebookExtraValue,
  applyNotebookExtra,
} from "../src/notebookModel";
import { storedNoteSchema } from "../src/noteSchema";
import { plainNote } from "../src/content";
let folder: string, vault: Vault, service: Collaboration;
const owner: Principal = {
  session: "owner",
  email: "owner@example.test",
  name: "Owner",
  localOwner: true,
};
beforeEach(async () => {
  folder = await fs.mkdtemp(path.join(os.tmpdir(), "synapse-pages-"));
  vault = new Vault(folder);
  await vault.init();
  service = new Collaboration(vault);
});
afterEach(async () => {
  await fs.rm(folder, { recursive: true, force: true });
});
it("reads a legacy note as Page 1 without copying or modifying its content", () => {
  const note = { ...newTabletNote(), body: "Original explanation" };
  const before = JSON.stringify(note),
    pages = notebookPages(note);
  expect(pages).toHaveLength(1);
  expect(pages[0].id).toBe(note.id);
  expect(pages[0].body).toBe(note.body);
  expect(pages[0].canvas).toEqual(note.canvas);
  expect(JSON.stringify(note)).toBe(before);
});
it("keeps extended paper, page content, textures and AI notes in one serialized note", () => {
  const original = { ...newTabletNote(), revision: 1, body: "First sheet" };
  const { note, page } = addNotebookPage(original);
  const edited = changeNotebookPage(note, page.id, {
    body: "Second sheet",
    paperTexture: "grid",
    canvas: { ...page.canvas, height: 2000 },
    aiNotes: {
      text: "Converted text",
      sourceDigest: "a".repeat(64),
      generatedAt: new Date().toISOString(),
      view: "handwritten",
      diagrams: [],
    },
  });
  const restored = decodeNote(encodeNote(edited));
  expect(restored.id).toBe(original.id);
  expect(restored.body).toBe("First sheet");
  expect(notebookPages(restored)[1]).toMatchObject({
    id: page.id,
    body: "Second sheet",
    paperTexture: "grid",
    canvas: { height: 2000 },
    aiNotes: { text: "Converted text", view: "handwritten" },
  });
  expect(storedNoteSchema.safeParse(restored).success).toBe(true);
  expect(plainNote(restored)).toContain("Second sheet");
  expect(plainNote(restored)).toContain("Converted text");
});
it("preserves extra sheets when an older client saves the original page", async () => {
  const { note, page } = addNotebookPage({
    ...newTabletNote(),
    body: "Page one",
  });
  const stored = await vault.write(
    changeNotebookPage(note, page.id, { body: "Keep this second sheet" }),
  );
  const { pages, ...legacy } = stored;
  const saved = await vault.write(
    { ...legacy, body: "Edited by legacy client" },
    stored.revision,
  );
  expect(saved.body).toBe("Edited by legacy client");
  expect(saved.pages?.[0].body).toBe("Keep this second sheet");
});
it("creates and edits a sheet through granular collaboration without changing Page 1", async () => {
  const stored = await vault.write({
    ...newTabletNote(),
    body: "Unchanged first sheet",
  });
  const pageId = crypto.randomUUID(),
    itemId = crypto.randomUUID();
  const values: [string, unknown][] = [
    ["pageOrder", [pageId]],
    [`page/${pageId}/body`, "Live second page"],
    [`page/${pageId}/paperTexture`, "ruled"],
    [
      `page/${pageId}/item/${itemId}`,
      {
        id: itemId,
        kind: "pen",
        x: 10,
        y: 20,
        width: 30,
        height: 20,
        points: [
          [0, 0],
          [30, 20],
        ],
      },
    ],
  ];
  const changes = [];
  for (const [cell, value] of values) {
    const lease = await service.acquire(stored.id, owner, cell);
    changes.push({ cell, value, base: lease.hash });
  }
  const saved = await service.change(
    stored.id,
    owner,
    changes,
    crypto.randomUUID(),
  );
  expect(saved.body).toBe("Unchanged first sheet");
  expect(saved.canvas?.items).toHaveLength(0);
  expect(saved.pages?.[0]).toMatchObject({
    id: pageId,
    body: "Live second page",
    paperTexture: "ruled",
  });
  expect(saved.pages?.[0].canvas.items[0].id).toBe(itemId);
  expect(await vault.notes()).toHaveLength(1);
});
it("merges collaborators working on separate sheets", async () => {
  const first = addNotebookPage(newTabletNote()),
    second = addNotebookPage(first.note);
  const stored = await vault.write(second.note);
  const other: Principal = {
    session: "other",
    email: "other@example.test",
    name: "Other",
  };
  await service.invite(stored.id, owner, other.email, "editor");
  const a = `page/${first.page.id}/body`,
    b = `page/${second.page.id}/body`;
  const la = await service.acquire(stored.id, owner, a),
    lb = await service.acquire(stored.id, other, b);
  await service.change(stored.id, owner, [
    { cell: a, base: la.hash, value: "First person's sheet" },
  ]);
  await service.change(stored.id, other, [
    { cell: b, base: lb.hash, value: "Second person's sheet" },
  ]);
  const saved = await vault.note(stored.id);
  expect(saved.pages?.map((p) => p.body)).toEqual([
    "First person's sheet",
    "Second person's sheet",
  ]);
});
it("rejects duplicate sheet identities and object identity changes", () => {
  const { note, page } = addNotebookPage(newTabletNote());
  expect(() =>
    applyNotebookExtra(note, "pageOrder", [page.id, page.id]),
  ).toThrow("unique");
  expect(() =>
    applyNotebookExtra(note, `page/${page.id}/item/${crypto.randomUUID()}`, {
      id: crypto.randomUUID(),
    }),
  ).toThrow("identity");
  expect(notebookExtraValue(note, `page/${page.id}/body`)).toBe("");
});
