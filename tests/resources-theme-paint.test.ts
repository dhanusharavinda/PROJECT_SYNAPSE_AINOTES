import { it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { createApp } from "../server/app";
import { enclosedRegion } from "../src/paintBucket";
import { resizeItem } from "../src/sheetModel";
let root: string, a: Awaited<ReturnType<typeof createApp>>;
const owner = (method: "get" | "post" | "put", url: string) =>
  request(a.app)[method](url).set("x-test-owner", "true");
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "synapse-resources-"));
  a = await createApp(root, { test: true });
  a.app.use(a.errors);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});
it("fills a bounded area and refuses an open outline", () => {
  const alpha = new Uint8Array(100);
  for (let x = 1; x < 9; x++) {
    alpha[10 + x] = 255;
    alpha[80 + x] = 255;
  }
  for (let y = 1; y < 9; y++) {
    alpha[y * 10 + 1] = 255;
    alpha[y * 10 + 8] = 255;
  }
  const fill = enclosedRegion(alpha, 10, 10, 3, 3);
  expect(fill.width).toBe(6);
  expect(fill.height).toBe(6);
  expect(fill.path).toContain("h6v1h-6z");
  alpha[13] = 0;
  expect(() => enclosedRegion(alpha, 10, 10, 3, 3)).toThrow("open");
});
it("keeps fill coordinates stable when its object is resized", () => {
  const r = resizeItem(
    {
      id: crypto.randomUUID(),
      kind: "paint",
      x: 0,
      y: 0,
      width: 100,
      height: 80,
      text: "M0 0h10v10z",
      points: [[100, 80]],
    },
    100,
    80,
  );
  expect(r.width).toBe(200);
  expect(r.points).toEqual([[100, 80]]);
});
it("inherits a parent theme at creation and allows a child override", async () => {
  const p = (
    await owner("post", "/api/notes")
      .send({ title: "Paper parent", theme: "paper" })
      .expect(201)
  ).body;
  const child = (
    await owner("post", "/api/notes")
      .send({ title: "Child", parentId: p.id })
      .expect(201)
  ).body;
  expect(child.theme).toBe("paper");
  const dark = (
    await owner("post", "/api/notes")
      .send({ title: "Other child", parentId: p.id, theme: "dark" })
      .expect(201)
  ).body;
  expect(dark.theme).toBe("dark");
});
it("saves a restricted resource link without fetching, bookmarks it, and attaches one canonical resource", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  const resource = (
    await owner("post", "/api/sources")
      .send({
        title: "LinkedIn post",
        url: "https://www.linkedin.com/posts/example",
        extract: false,
      })
      .expect(201)
  ).body;
  expect(fetchSpy).not.toHaveBeenCalled();
  await owner("put", "/api/sources/" + resource.id)
    .send({ bookmarked: true })
    .expect(200);
  const n = (
    await owner("post", "/api/notes").send({ title: "Reading" }).expect(201)
  ).body;
  await owner("post", "/api/sources/" + resource.id + "/attach")
    .send({ noteId: n.id })
    .expect(200);
  await owner("post", "/api/sources/" + resource.id + "/attach")
    .send({ noteId: n.id })
    .expect(200);
  expect((await a.vault.note(n.id)).sources).toEqual([resource.id]);
  expect((await a.vault.state()).sources).toHaveLength(1);
  expect((await a.vault.state()).sources[0].bookmarked).toBe(true);
});

it("reuses a saved URL and preserves bookmarks instead of creating another resource", async () => {
  const payload = {
    title: "Saved resource",
    url: "https://www.linkedin.com/posts/example",
    extract: false,
  };
  const first = (await owner("post", "/api/sources").send(payload).expect(201))
    .body;
  await owner("put", "/api/sources/" + first.id)
    .send({ bookmarked: true })
    .expect(200);
  const again = (await owner("post", "/api/sources").send(payload).expect(200))
    .body;
  expect(again.id).toBe(first.id);
  expect(again.bookmarked).toBe(true);
  expect((await a.vault.state()).sources).toHaveLength(1);
});
it("attaches two resources concurrently without losing either reference", async () => {
  const n = (
    await owner("post", "/api/notes").send({ title: "References" }).expect(201)
  ).body;
  const a1 = (
    await owner("post", "/api/sources")
      .send({ title: "One", text: "One" })
      .expect(201)
  ).body;
  const a2 = (
    await owner("post", "/api/sources")
      .send({ title: "Two", text: "Two" })
      .expect(201)
  ).body;
  await Promise.all(
    [a1, a2].map((s) =>
      owner("post", "/api/sources/" + s.id + "/attach")
        .send({ noteId: n.id })
        .expect(200),
    ),
  );
  expect((await a.vault.note(n.id)).sources.sort()).toEqual(
    [a1.id, a2.id].sort(),
  );
});

it("renames the real Markdown file, preserves page identity and restores the same filename from trash", async () => {
  const n = (
    await owner("post", "/api/notes").send({ title: "Page" }).expect(201)
  ).body;
  const renamed = (
    await owner("put", "/api/notes/" + n.id)
      .send({
        ...n,
        fileName: "Study notes.md",
        title: "New title",
        group: "Learning",
        context: "My topic",
      })
      .expect(200)
  ).body;
  expect(renamed.id).toBe(n.id);
  expect(await fs.readdir(a.vault.file("notes"))).toEqual(["Study notes.md"]);
  expect((await a.vault.note(n.id)).title).toBe("New title");
  await a.vault.trash([n.id]);
  expect(await fs.readdir(a.vault.file("notes"))).toEqual([]);
  await a.vault.restoreTrash(n.id);
  expect((await a.vault.note(n.id)).fileName).toBe("Study notes.md");
  expect((await a.vault.note(n.id)).group).toBe("Learning");
  await owner("put", "/api/notes/" + n.id)
    .send({ ...renamed, fileName: "../outside.md" })
    .expect(400);
});
it("refuses filename collisions and retains both pages", async () => {
  const first = (
    await owner("post", "/api/notes")
      .send({ title: "One", fileName: "Existing.md" })
      .expect(201)
  ).body;
  const second = (
    await owner("post", "/api/notes").send({ title: "Two" }).expect(201)
  ).body;
  await owner("put", "/api/notes/" + second.id)
    .send({ ...second, fileName: "existing.md" })
    .expect(409);
  expect((await a.vault.notes()).map((n) => n.id).sort()).toEqual(
    [first.id, second.id].sort(),
  );
});
