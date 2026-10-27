import { beforeEach, afterEach, it, expect, vi } from "vitest";
import request from "supertest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createApp } from "../server/app";
import { Vault } from "../server/vault";
import { bodyOf, variantsMarkdown, drawingMarkdown } from "../src/content";
let root: string, app: Awaited<ReturnType<typeof createApp>>;
const owner = (method: "get" | "post" | "put" | "delete", url: string) =>
  request(app.app)[method](url).set("x-test-owner", "true");
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "synapse-editor-test-"));
  app = await createApp(root, { test: true });
  app.app.use(app.errors);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});
async function note(body = "My explanation", title = "Embeddings") {
  return (await owner("post", "/api/notes").send({ title, body })).body;
}
it("persists a freeform Markdown page and variants across a fresh vault instance", async () => {
  const body =
    "A normal paragraph.\n\n" +
    variantsMarkdown([
      { label: "", body: "A high level explanation." },
      { label: "Example", body: "A practical example." },
    ]) +
    "\n\n## Practice\n\n- [ ] Explain it without looking";
  const n = await note(body);
  const reopened = await new Vault(root).note(n.id);
  expect(reopened.body).toBe(body);
  expect(reopened.layers.intuition).toBe("");
  expect(
    await fs.readFile(path.join(root, "notes", n.id + ".md"), "utf8"),
  ).toContain("format: 2");
});
it("accepts a large new page without treating its body as a legacy layer", async () => {
  const n = await note("a".repeat(220000));
  const reopened = await app.vault.note(n.id);
  expect(reopened.body).toHaveLength(220000);
  await owner("put", "/api/notes/" + n.id)
    .send({ ...reopened, body: reopened.body + " text" })
    .expect(200);
});
it("preserves the empty writing paragraph after an inline drawing across autosave", async () => {
  const body = "Explain the flow.\n\n" + drawingMarkdown("drawing-placeholder") + "\n\n\n";
  const n = await note(body);
  expect(bodyOf(n)).toBe(body);
  const reopened = await new Vault(root).note(n.id);
  expect(reopened.body).toBe(body);
  const saved = (await owner("put", "/api/notes/" + n.id).send({ ...reopened, body })).body;
  expect(bodyOf(saved)).toBe(body);
});
it("derives and removes inline graph links while preserving intentional typed relationships", async () => {
  const a = await note(),
    b = await note("Other", "Vector search");
  const saved = (
    await owner("put", "/api/notes/" + a.id).send({
      ...a,
      body: `A link to [Vector search](${b.id}.md).`,
    })
  ).body;
  expect(saved.links).toEqual([
    {
      target: b.id,
      relation: "related",
      reason: "Linked in this page",
      inline: true,
    },
  ]);
  const removed = (
    await owner("put", "/api/notes/" + a.id).send({
      ...saved,
      body: "No hyperlink",
    })
  ).body;
  expect(removed.links).toEqual([]);
  const typed = (
    await owner("put", "/api/notes/" + a.id).send({
      ...removed,
      links: [{ target: b.id, relation: "used-in", reason: "Semantic search" }],
    })
  ).body;
  expect(typed.links).toHaveLength(1);
});
it("prevents page lineage cycles and preserves children of archived parents", async () => {
  const a = await note(),
    b = (
      await owner("post", "/api/notes").send({
        title: "Example",
        body: "Subpage",
        parentId: a.id,
      })
    ).body;
  await owner("put", "/api/notes/" + a.id)
    .send({ ...a, parentId: b.id })
    .expect(400);
  await owner("delete", "/api/notes/" + a.id).expect(200);
  await owner("put", "/api/notes/" + b.id)
    .send({ ...b, body: "Still editable" })
    .expect(200);
});
it("generates from the selected excerpt and inserts a real transparent editable SVG only after approval", async () => {
  const n = await note("Private extra detail.");
  const generate = vi.spyOn(app.providers, "json").mockResolvedValue({
    nodes: [
      { id: "a", label: "Question", kind: "terminal" },
      { id: "b", label: "Retrieve", kind: "step" },
    ],
    edges: [{ from: "a", to: "b", label: "search" }],
  });
  const proposed = await owner("post", "/api/notes/" + n.id + "/ai").send({
    kind: "diagram",
    selection: "Question retrieves matching documents.",
    diagramType: "flowchart",
  });
  expect(proposed.status).toBe(200);
  expect(generate.mock.calls[0][1]).toContain("Question retrieves");
  expect(generate.mock.calls[0][1]).not.toContain("Private extra detail");
  expect((await app.vault.note(n.id)).drawings).toEqual([]);
  const accepted = await owner(
    "post",
    "/api/proposals/" + proposed.body[0].id,
  ).send({ action: "accept" });
  expect(accepted.status).toBe(200);
  const id = accepted.body.drawingId;
  expect(accepted.body.note.body).toContain(drawingMarkdown(id));
  const svg = await fs.readFile(
    path.join(root, "drawings", id + ".svg"),
    "utf8",
  );
  expect(svg).toContain('role="img"');
  expect(svg).toContain("data:font/woff2");
  expect(svg).not.toContain('<rect width="');
  expect(
    JSON.parse(
      await fs.readFile(path.join(root, "drawings", id + ".json"), "utf8"),
    ).diagram.nodes,
  ).toHaveLength(2);
});
it("edits a shared new-format note only through an editor link and checks the etag", async () => {
  const n = await note();
  const editor = (
    await owner("post", "/api/shares").send({
      noteId: n.id,
      role: "editor",
      label: "Study partner",
    })
  ).body;
  const viewer = (
    await owner("post", "/api/shares").send({
      noteId: n.id,
      role: "viewer",
      label: "Read",
    })
  ).body;
  await request(app.app)
    .put("/api/shared/" + viewer.id)
    .send({ body: "Changed", revision: n.revision, etag: n.etag })
    .expect(403);
  await request(app.app)
    .put("/api/shared/" + editor.id)
    .send({ body: "Changed", revision: n.revision, etag: n.etag })
    .expect(200);
  await request(app.app)
    .put("/api/shared/" + editor.id)
    .send({ body: "Stale", revision: n.revision, etag: n.etag })
    .expect(409);
  expect((await app.vault.note(n.id)).body).toBe("Changed");
});
it("pairs only an owner-approved HTTPS origin and revokes its bearer access", async () => {
  const origin = "https://synapse.example";
  await request(app.app)
    .options("/api/bootstrap")
    .set("Origin", origin)
    .expect(403);
  const challenge = await owner("post", "/api/pairing").send({ origin });
  expect(challenge.status).toBe(200);
  const preflight = await request(app.app)
    .options("/api/bootstrap")
    .set("Origin", origin);
  expect(preflight.status).toBe(204);
  expect(preflight.headers["access-control-allow-origin"]).toBe(origin);
  await request(app.app)
    .post("/api/connect")
    .set("Origin", origin)
    .send({ code: "wrong" })
    .expect(403);
  const connect = await request(app.app)
    .post("/api/connect")
    .set("Origin", origin)
    .send({ code: challenge.body.code })
    .expect(200);
  const token = connect.body.token;
  await request(app.app)
    .get("/api/bootstrap")
    .set("Origin", origin)
    .expect(401);
  await request(app.app)
    .get("/api/bootstrap")
    .set("Origin", origin)
    .set("Authorization", "Bearer " + token)
    .expect(200);
  await request(app.app)
    .get("/api/bootstrap")
    .set("Origin", "https://unapproved.example")
    .set("Authorization", "Bearer " + token)
    .expect(403);
  await request(app.app)
    .post("/api/connect")
    .set("Origin", origin)
    .send({ code: challenge.body.code })
    .expect(403);
  await owner("delete", "/api/pairing").expect(200);
  await request(app.app)
    .get("/api/bootstrap")
    .set("Origin", origin)
    .set("Authorization", "Bearer " + token)
    .expect(403);
});
it("rejects insecure or path-bearing pairing addresses", async () => {
  for (const origin of [
    "http://synapse.example",
    "https://synapse.example/path",
    "https://me:password@synapse.example",
  ])
    await owner("post", "/api/pairing").send({ origin }).expect(400);
});
