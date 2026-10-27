import { it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { createApp } from "../server/app";
import { DeviceSync } from "../server/deviceSync";
import {
  newTabletNote,
  editRecord,
  acknowledge,
  tabletBackupSchema,
  type TabletRecord,
} from "../src/tabletStore";
let root: string, a: Awaited<ReturnType<typeof createApp>>;
const origin = "https://tablet.example";
const owner = (method: "post" | "get" | "delete", url: string) =>
  request(a.app)[method](url).set("x-test-owner", "true");
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "synapse-tablet-"));
  a = await createApp(root, { test: true });
  a.app.use(a.errors);
});
afterEach(async () => {
  await new Promise<void>((resolve) => {
    if (a.devices.gateway) a.devices.gateway.close(() => resolve());
    else resolve();
  });
  await fs.rm(root, { recursive: true, force: true });
});
async function pair() {
  const r = await owner("post", "/api/devices/pair")
    .send({ origin })
    .expect(200);
  return (
    await request(a.app)
      .post("/api/device/connect")
      .set("Origin", origin)
      .send({ code: r.body.code, name: "My tablet" })
      .expect(200)
  ).body;
}
const device = (token: string, method: "get" | "post", url: string) =>
  request(a.app)
    [method]("/api/device/" + url)
    .set("Origin", origin)
    .set("Authorization", "Bearer " + token);
it("only pairs a one-time code for the exact origin and persists revocable hashed tokens", async () => {
  await owner("post", "/api/devices/pair")
    .send({ origin: "bad origin" })
    .expect(400);
  const c = (await owner("post", "/api/devices/pair").send({ origin })).body;
  await request(a.app)
    .post("/api/device/connect")
    .set("Origin", "https://evil.example")
    .send({ code: c.code, name: "Wrong" })
    .expect(403);
  const p = (
    await request(a.app)
      .post("/api/device/connect")
      .set("Origin", origin)
      .send({ code: c.code, name: "Tablet" })
      .expect(200)
  ).body;
  await request(a.app)
    .post("/api/device/connect")
    .set("Origin", origin)
    .send({ code: c.code, name: "Again" })
    .expect(403);
  const stored = await fs.readFile(
    a.vault.file(".synapse/devices.json"),
    "utf8",
  );
  expect(stored).not.toContain(p.token);
  const reopened = new DeviceSync(a.vault);
  await reopened.load();
  expect(reopened.identity).toBe(p.identity);
  expect(reopened.records[0].hash).toBe(reopened.hash(p.token));
  await device(p.token, "get", "notes").expect(200);
  await owner("delete", "/api/devices/" + p.id).expect(200);
  await device(p.token, "get", "notes").expect(403);
});
it("refuses to pair an existing notebook to a different PC identity", async () => {
  const c = (await owner("post", "/api/devices/pair").send({ origin })).body;
  await request(a.app)
    .post("/api/device/connect")
    .set("Origin", origin)
    .send({ code: c.code, name: "Tablet", identity: crypto.randomUUID() })
    .expect(409);
});
it("retries uploads idempotently, preserves conflicts and never resurrects a removed note", async () => {
  const { token } = await pair(),
    draft = newTabletNote(),
    operation = crypto.randomUUID();
  const first = (
    await device(token, "post", "note")
      .send({ note: draft, base: null, operation })
      .expect(200)
  ).body;
  const retry = (
    await device(token, "post", "note")
      .send({ note: draft, base: null, operation })
      .expect(200)
  ).body;
  expect(retry.note.revision).toBe(first.note.revision);
  expect(await a.vault.notes()).toHaveLength(1);
  await a.vault.write(
    { ...first.note, body: "New on PC" },
    first.note.revision,
  );
  const conflict = (
    await device(token, "post", "note")
      .send({
        note: { ...first.note, body: "Offline writing" },
        base: first.note.etag,
        operation: crypto.randomUUID(),
      })
      .expect(200)
  ).body;
  expect(conflict.conflict).toBe(true);
  expect(conflict.note.id).not.toBe(draft.id);
  expect((await a.vault.note(draft.id)).body).toBe("New on PC");
  await fs.unlink(a.vault.file("notes/" + draft.id + ".md"));
  const removed = (
    await device(token, "post", "note")
      .send({
        note: { ...first.note, body: "Recovered offline" },
        base: first.note.etag,
        operation: crypto.randomUUID(),
      })
      .expect(200)
  ).body;
  expect(removed.conflict).toBe(true);
  expect(removed.note.id).not.toBe(draft.id);
});
it("rejects invalid and conflicting file bytes and supports unchanged pulls", async () => {
  const { token } = await pair(),
    name = crypto.randomUUID() + ".png",
    png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
  await device(token, "post", "file")
    .send({ name, data: Buffer.from("bad").toString("base64") })
    .expect(400);
  await device(token, "post", "file")
    .send({ name, data: png.toString("base64") })
    .expect(200);
  await device(token, "post", "file")
    .send({ name, data: png.toString("base64") })
    .expect(200);
  await device(token, "post", "file")
    .send({
      name,
      data: Buffer.concat([png, Buffer.from([2])]).toString("base64"),
    })
    .expect(409);
  await device(token, "get", "file?folder=attachments&name=" + name).expect(
    200,
  );
  await device(
    token,
    "get",
    "file?folder=attachments&name=../../secret",
  ).expect(400);
  const r = (await device(token, "get", "notes")).body;
  expect(
    (await device(token, "get", "notes?since=" + r.revision)).body.unchanged,
  ).toBe(true);
});
it("the private gateway exposes neither owner controls nor raw vault files", async () => {
  const { token } = await pair();
  const { port } = await a.devices.openGateway();
  const gateway = request("http://127.0.0.1:" + port);
  await gateway.get("/api/bootstrap").expect(404);
  await gateway.get("/files/attachments/test.png").expect(404);
  await gateway.get("/api/device/notes").expect(401);
  await gateway
    .get("/api/device/notes")
    .set("Origin", origin)
    .set("Authorization", "Bearer " + token)
    .expect(200);
  await gateway
    .options("/api/device/notes")
    .set("Origin", origin)
    .set("Access-Control-Request-Headers", "authorization")
    .expect(204);
});
it("late sync acknowledgements preserve newer local handwriting and remap conflict identities", () => {
  const note = newTabletNote(),
    sent: TabletRecord = {
      note,
      base: null,
      dirty: true,
      version: 1,
      operation: crypto.randomUUID(),
    },
    current = editRecord(sent, { ...note, body: "Kept typing" }),
    server = {
      ...note,
      id: crypto.randomUUID(),
      etag: "server-etag",
      revision: 1,
    };
  const next = acknowledge(current, sent, { note: server, conflict: true });
  expect(next.note.body).toBe("Kept typing");
  expect(next.note.id).toBe(server.id);
  expect(next.base).toBe("server-etag");
  expect(next.dirty).toBe(true);
  expect(next.note.etag).toBe("server-etag");
  expect(next.note.revision).toBe(1);
  expect(acknowledge(sent, sent, { note: server, conflict: false }).dirty).toBe(
    false,
  );
});
it("validates complete editable backups and rejects malformed geometry before importing", () => {
  const note = newTabletNote();
  expect(
    tabletBackupSchema.parse({ format: "synapse-tablet-1", pages: [{ note }] })
      .pages[0].note.id,
  ).toBe(note.id);
  expect(() =>
    tabletBackupSchema.parse({
      format: "synapse-tablet-1",
      pages: [
        {
          note: {
            ...note,
            canvas: {
              height: 3,
              items: [{ id: crypto.randomUUID(), kind: "pen", x: NaN }],
            },
          },
        },
      ],
    }),
  ).toThrow();
});
