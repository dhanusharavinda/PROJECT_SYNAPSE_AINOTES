import { afterEach, beforeEach, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import request from "supertest";
import { createApp } from "../server/app";
import { Vault, uid } from "../server/vault";
import { seed } from "../server/seed";
let root: string, app: Awaited<ReturnType<typeof createApp>>;
const owner = (method: "get" | "post" | "put", url: string) =>
  request(app.app)[method](url).set("x-test-owner", "true");
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "synapse-sheet-test-"));
  app = await createApp(root, { test: true });
  app.app.use(app.errors);
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});
it("rereads external deletions and refuses to recreate them from a stale autosave", async () => {
  const note = (
    await owner("post", "/api/notes").send({
      title: "External removal",
      body: "Saved writing",
    })
  ).body;
  await fs.unlink(path.join(root, "notes", note.id + ".md"));
  expect((await owner("get", "/api/bootstrap")).body.notes).toHaveLength(0);
  await owner("put", "/api/notes/" + note.id)
    .send({ ...note, body: "Stale draft" })
    .expect(404);
  expect(await fs.readdir(path.join(root, "notes"))).toHaveLength(0);
  const reopened = new Vault(root);
  await reopened.init();
  await seed(reopened);
  expect(await reopened.notes()).toHaveLength(0);
});
it("moves several Markdown files to Trash and restores the exact note", async () => {
  const first = (
    await owner("post", "/api/notes").send({ title: "First", body: "One" })
  ).body;
  const second = (
    await owner("post", "/api/notes").send({ title: "Second", body: "Two" })
  ).body;
  await owner("post", "/api/notes/trash")
    .send({ ids: [first.id, second.id] })
    .expect(200);
  expect((await owner("get", "/api/bootstrap")).body.notes).toHaveLength(0);
  expect((await owner("get", "/api/trash")).body).toHaveLength(2);
  await owner("post", "/api/trash/" + first.id + "/restore")
    .send({})
    .expect(200);
  expect((await new Vault(root).note(first.id)).body).toBe("One");
});
it("keeps a note editable when a linked note is deleted", async () => {
  const first = (
    await owner("post", "/api/notes").send({ title: "First", body: "One" })
  ).body;
  const second = (
    await owner("post", "/api/notes").send({ title: "Second", body: "Two" })
  ).body;
  const linked = (
    await owner("put", "/api/notes/" + first.id).send({
      ...first,
      links: [
        { target: second.id, relation: "related", reason: "A connection" },
      ],
    })
  ).body;
  await owner("post", "/api/notes/trash")
    .send({ ids: [second.id] })
    .expect(200);
  await owner("put", "/api/notes/" + first.id)
    .send({ ...linked, body: "Still writing" })
    .expect(200);
});
it("persists movable text, media, tables and tight stroke bounds in the Markdown file", async () => {
  const note = (
    await owner("post", "/api/notes").send({
      title: "Canvas",
      body: "My regular writing",
    })
  ).body;
  const canvas = {
    height: 600,
    items: [
      {
        id: uid(),
        kind: "text",
        text: "Beside the drawing",
        x: 320,
        y: 80,
        width: 300,
        height: 100,
      },
      {
        id: uid(),
        kind: "pen",
        x: 40,
        y: 80,
        width: 100,
        height: 120,
        color: "#24392f",
        points: [
          [4, 4],
          [50, 40],
          [80, 100],
        ],
      },
      {
        id: uid(),
        kind: "table",
        text: "| Topic | Example |\n| --- | --- |\n| AI | Notes |",
        x: 400,
        y: 300,
        width: 400,
        height: 140,
      },
    ],
  };
  await owner("put", "/api/notes/" + note.id)
    .send({ ...note, canvas })
    .expect(200);
  const reopened = await new Vault(root).note(note.id);
  expect(reopened.canvas).toEqual(canvas);
  expect(
    await fs.readFile(path.join(root, "notes", note.id + ".md"), "utf8"),
  ).toContain("Beside the drawing");
});
