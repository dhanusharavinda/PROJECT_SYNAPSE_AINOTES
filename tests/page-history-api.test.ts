import { afterEach, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { createApp } from "../server/app";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});
it("returns decoded old versions without altering the current note and preserves malformed history", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "synapse-history-"));
  roots.push(root);
  const app = await createApp(root, { test: true });
  app.app.use(app.errors);
  const owner = (method: "get" | "post" | "put", url: string) =>
    request(app.app)[method](url).set("x-test-owner", "true");
  const note = (
    await owner("post", "/api/notes")
      .send({ title: "Notebook", body: "Original explanation" })
      .expect(201)
  ).body;
  const saved = (
    await owner("put", "/api/notes/" + note.id)
      .send({ ...note, body: "New explanation" })
      .expect(200)
  ).body;
  const dir = path.join(root, ".synapse/history", note.id);
  await fs.writeFile(
    path.join(dir, "0-deadbeef.md"),
    "---\nid: invalid\n---\nStill recoverable as text",
  );
  await fs.writeFile(path.join(dir, "not-a-version.txt"), "ignore me");
  const history = (
    await owner("get", "/api/notes/" + note.id + "/history").expect(200)
  ).body;
  expect(history[0].note.body).toBe("Original explanation");
  expect(history[0].note.revision).toBe(note.revision);
  expect(history[1].note).toBeNull();
  expect(history[1].markdown).toContain("Still recoverable as text");
  expect(history).toHaveLength(2);
  expect((await app.vault.note(note.id)).body).toBe(saved.body);
  await owner("get", "/api/notes/not-valid/history").expect(400);
});
