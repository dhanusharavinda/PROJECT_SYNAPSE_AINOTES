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
it("persists video cards and speed-sensitive pen points without subject-specific defaults", async () => {
  const n = (
    await owner("post", "/api/notes").send({ title: "My subject", body: "" })
  ).body;
  expect(n.context).toBe("");
  const canvas = {
    width: 1000,
    height: 500,
    items: [
      {
        id: crypto.randomUUID(),
        kind: "video",
        src: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        text: "My reference",
        x: 10,
        y: 10,
        width: 280,
        height: 210,
      },
      {
        id: crypto.randomUUID(),
        kind: "pen",
        points: [
          [4, 4],
          [14, 20],
        ],
        pressures: [1, 0.9],
        strokeWidth: 3,
        x: 300,
        y: 40,
        width: 20,
        height: 30,
      },
    ],
  };
  await owner("put", "/api/notes/" + n.id)
    .send({ ...n, canvas })
    .expect(200);
  const reopened = await app.vault.note(n.id);
  expect(reopened.canvas).toEqual(canvas);
});
it("saves and clears a note date and preserves pixel geometry and additional shapes", async () => {
  const note = (
    await owner("post", "/api/notes").send({
      title: "Dated page",
      body: "My note",
      noteDate: "2026-10-27",
      canvas: {
        width: 1200,
        height: 600,
        items: [
          {
            id: uid(),
            kind: "ellipse",
            x: 800,
            y: 200,
            width: 200,
            height: 100,
            strokeWidth: 3,
          },
        ],
      },
    })
  ).body;
  expect(note.noteDate).toBe("2026-10-27");
  expect(note.canvas.width).toBe(1200);
  const updated = await owner("put", "/api/notes/" + note.id)
    .send({ ...note, noteDate: null })
    .expect(200);
  expect(updated.body.noteDate).toBeNull();
  expect((await new Vault(root).note(note.id)).canvas?.items[0].kind).toBe(
    "ellipse",
  );
  await owner("post", "/api/notes")
    .send({ title: "Invalid date", noteDate: "2026-02-31" })
    .expect(400);
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
it("shares explicitly placed images without granting unrelated vault files", async () => {
  const image = uid() + ".png",
    privateImage = uid() + ".png";
  await fs.writeFile(path.join(root, "attachments", image), "image fixture");
  await fs.writeFile(
    path.join(root, "attachments", privateImage),
    "private fixture",
  );
  const note = (
    await owner("post", "/api/notes").send({
      title: "Shared canvas",
      body: "Writing",
      canvas: {
        width: 1000,
        height: 400,
        items: [
          {
            id: uid(),
            kind: "image",
            src: "../attachments/" + image,
            x: 10,
            y: 10,
            width: 200,
            height: 120,
          },
        ],
      },
    })
  ).body;
  const share = (
    await owner("post", "/api/shares").send({
      noteId: note.id,
      role: "viewer",
      label: "Class",
    })
  ).body;
  await request(app.app)
    .get("/files/attachments/" + image + "?share=" + share.id)
    .expect(200);
  await request(app.app)
    .get("/files/attachments/" + privateImage + "?share=" + share.id)
    .expect(403);
});
it("accepts graph-view position keys and exports actual Markdown note identifiers", async () => {
  const note = (
    await owner("post", "/api/notes").send({ title: "Graph positions" })
  ).body;
  const key = `focus-${note.id}-${note.id}`;
  await owner("post", "/api/positions")
    .send({ [key]: { x: 155, y: 85, pinned: false } })
    .expect(200);
  expect((await owner("get", "/api/bootstrap")).body.positions[key]).toEqual({
    x: 155,
    y: 85,
    pinned: false,
  });
  const canvas = JSON.parse(
    await fs.readFile(
      path.join(root, "maps", "knowledge-graph.canvas"),
      "utf8",
    ),
  );
  expect(canvas.nodes[0]).toMatchObject({
    id: note.id,
    file: `notes/${note.id}.md`,
    x: 155,
    y: 85,
  });
  await owner("post", "/api/positions")
    .send({ "focus-invalid": { x: 1, y: 2, pinned: false } })
    .expect(400);
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
