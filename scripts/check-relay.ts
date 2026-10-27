import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import request from "supertest";
import WebSocket from "ws";
import { createApp } from "../server/app";
import { RelayClient, connectInvite } from "../src/relayClient";
import { newTabletNote } from "../src/tabletStore";
const origin = "http://127.0.0.1:4331";
const NativeWS = globalThis.WebSocket;
globalThis.WebSocket = class extends WebSocket {
  constructor(url: any) {
    super(url, { origin });
  }
} as any;
process.env.SYNAPSE_RELAY_URL =
  process.env.SYNAPSE_RELAY_TEST_URL || "http://127.0.0.1:4340";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "synapse-qr-e2e-")),
  a = await createApp(root, { test: true });
a.app.use(a.errors);
try {
  console.log("Generating QR invite");
  const pair = await a.relay.invitation(origin);
  console.log("Pairing encrypted channel");
  const c = await connectInvite(pair.invite);
  const client = new RelayClient(c.access);
  const note = newTabletNote(),
    operation = crypto.randomUUID();
  note.body = "Private text never stored in the relay.";
  const saved = await client.request(
    "note",
    { note, base: null, operation },
    c.token,
  );
  if (saved.status !== 200) throw Error(JSON.stringify(saved));
  const retry = await client.request(
    "note",
    { note, base: null, operation },
    c.token,
  );
  if (retry.data.note.id !== saved.data.note.id)
    throw Error("Duplicate operation");
  const n = saved.data.note;
  await a.vault.write({ ...n, body: "Changed on PC" }, n.revision);
  const pulled = await client.request("notes", undefined, c.token);
  if (pulled.data.notes[0].body !== "Changed on PC")
    throw Error("PC changes missing");
  const conflict = await client.request(
    "note",
    {
      note: { ...n, body: "Offline edit" },
      base: n.etag,
      operation: crypto.randomUUID(),
    },
    c.token,
  );
  if (!conflict.data.conflict) throw Error("Conflict lost");
  client.socket!.close();
  await new Promise((r) => setTimeout(r, 150));
  const reopened = await client.request("notes", undefined, c.token);
  if (reopened.status !== 200) throw Error("Reconnect failed");
  const bytes = new Uint8Array(600000);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const name = crypto.randomUUID() + ".png";
  const blob = Buffer.from(bytes).toString("base64");
  const file = await client.request("file", { name, data: blob }, c.token);
  if (file.status !== 200) throw Error("File upload failed");
  const download = await client.request(
    "file?folder=attachments&name=" + name,
    undefined,
    c.token,
  );
  if (!download.binary) throw Error("File download failed");
  await request(a.app)
    .delete("/api/devices/" + c.access.client)
    .set("x-test-owner", "true")
    .expect(200);
  client.close();
  console.log(
    JSON.stringify({
      pairing: true,
      editableNotes: true,
      idempotent: true,
      conflicts: true,
      reconnect: true,
      chunkedFileTransfer: true,
      revocation: true,
    }),
  );
  await fs.writeFile(
    "work/qr-e2e-report.json",
    JSON.stringify(
      {
        pairing: true,
        editableNotes: true,
        idempotent: true,
        conflicts: true,
        reconnect: true,
        chunkedFileTransfer: true,
        revocation: true,
      },
      null,
      2,
    ),
  );
} finally {
  a.relay.close();
  a.devices.closeGateway();
  globalThis.WebSocket = NativeWS;
  await fs.rm(root, { recursive: true, force: true });
}
