import "fake-indexeddb/auto";
import { expect, it, vi } from "vitest";
import { NoteDraftWriter, readNoteDraft } from "../src/noteDrafts";
import { newTabletNote } from "../src/tabletStore";
import {
  getPageCapacity,
  MAX_CANVAS_ITEMS,
  assertNoteFits,
} from "../src/notebookCapacity";
import { storedNoteSchema } from "../src/noteSchema";

it("recovers a large notebook draft intact after reopening and clears only acknowledged content", async () => {
  const note = newTabletNote(),
    key = "test:" + note.id;
  note.canvas!.items = Array.from({ length: 1800 }, (_, index) => ({
    id: crypto.randomUUID(),
    kind: "pen" as const,
    x: index % 1000,
    y: index,
    width: 10,
    height: 10,
    points: [
      [0, 0],
      [10, 10],
    ],
  }));
  const writer = new NoteDraftWriter(key);
  writer.stage(note);
  await writer.flush();
  expect((await readNoteDraft(key))?.canvas?.items).toEqual(note.canvas!.items);
  const later = { ...note, body: "Written during saving" };
  writer.stage(later);
  await writer.acknowledge(note);
  await writer.flush();
  expect((await readNoteDraft(key))?.body).toBe(later.body);
  await writer.acknowledge(later);
  expect(await readNoteDraft(key)).toBeUndefined();
});

it("does not lose a new draft when an earlier acknowledgement races another writer", async () => {
  const note = newTabletNote(),
    key = "test:" + note.id;
  const first = new NoteDraftWriter(key),
    second = new NoteDraftWriter(key);
  first.stage(note);
  await first.flush();
  const edited = { ...note, body: "A newer window's draft" };
  second.stage(edited);
  await second.flush();
  await first.acknowledge(note);
  expect((await readNoteDraft(key))?.body).toBe(edited.body);
  await second.discard();
});
it("does not discard a newer window's draft when an old window abandons its copy", async () => {
  const note = newTabletNote(),
    key = "test:" + note.id;
  const first = new NoteDraftWriter(key),
    second = new NoteDraftWriter(key);
  first.stage(note);
  await first.flush();
  const reader = new NoteDraftWriter(key);
  await reader.read();
  second.stage({ ...note, body: "Newer window" });
  await second.flush();
  await first.discard();
  await reader.discard();
  expect((await readNoteDraft(key))?.body).toBe("Newer window");
  await second.discard();
});
it("reports storage quota failures and can persist the retained in-memory draft after recovery", async () => {
  const note = newTabletNote(),
    writer = new NoteDraftWriter("test:" + note.id);
  writer.stage(note);
  const failing = vi
    .spyOn(IDBObjectStore.prototype, "put")
    .mockImplementationOnce(() => {
      throw new DOMException("Storage is full", "QuotaExceededError");
    });
  await expect(writer.flush()).rejects.toThrow("Storage is full");
  expect(writer.hasStored(note)).toBe(false);
  failing.mockRestore();
  await writer.flush();
  expect(writer.hasStored(note)).toBe(true);
  expect((await readNoteDraft(writer.key))?.id).toBe(note.id);
  await writer.discard();
});

it("warns about heavy sheets before the storage ceiling and never trims objects", () => {
  const note = newTabletNote();
  note.canvas!.items = Array.from({ length: 1501 }, () => ({
    id: crypto.randomUUID(),
    kind: "pen" as const,
    x: 1,
    y: 2,
    width: 3,
    height: 4,
    points: [
      [0, 0],
      [3, 4],
    ],
  }));
  const parsed = storedNoteSchema.parse(note);
  expect(parsed.canvas?.items).toHaveLength(1501);
  expect(getPageCapacity(note.canvas)).toMatchObject({
    warning: true,
    full: false,
  });
  expect(() => assertNoteFits(note)).not.toThrow();
  expect(MAX_CANVAS_ITEMS).toBeGreaterThan(1501);
});

it("keeps the draft even when its payload exceeds the sync transport budget", async () => {
  const note = {
    ...newTabletNote(),
    body: "x".repeat(600000),
    pages: [] as any[],
  };
  for (let index = 0; index < 43; index++)
    note.pages.push({
      id: crypto.randomUUID(),
      body: "x".repeat(600000),
      canvas: { width: 1100, height: 900, items: [] },
      paperTexture: "plain",
    });
  const writer = new NoteDraftWriter("test:" + note.id);
  writer.stage(note);
  await writer.flush();
  expect(() => assertNoteFits(note)).toThrow("download a draft copy");
  expect((await readNoteDraft(writer.key))?.pages).toHaveLength(43);
  await writer.discard();
});
