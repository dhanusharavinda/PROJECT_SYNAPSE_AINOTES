import { beforeEach, afterEach, it, expect, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { createApp } from "../server/app";
import { RelayClient } from "../src/relayClient";
import {
  publicNotebookOrigin,
  identityKeys,
  sharedKey,
  seal,
  unseal,
  aad,
  sendPackets,
  PacketCollector,
} from "../src/relayProtocol";
let root: string, a: Awaited<ReturnType<typeof createApp>>;
const owner = (url: string) =>
  request(a.app).post(url).set("x-test-owner", "true");
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "synapse-account-"));
  a = await createApp(root, { test: true });
  a.app.use(a.errors);
});
afterEach(async () => {
  vi.restoreAllMocks();
  for (const p of a.accounts.peers.values()) p.client.close();
  await fs.rm(root, { recursive: true, force: true });
});
it("creates a local shared subpage when the parent has no explicit theme", async () => {
  const parent = (
    await owner("/api/notes").send({ title: "Themeless parent" }).expect(201)
  ).body;
  const operation = crypto.randomUUID();
  await owner("/api/collaboration/local/" + parent.id + "/create-page")
    .send({ title: "Child", operation })
    .expect(200);
  expect(await a.vault.note(operation)).toMatchObject({
    title: "Child",
    parentId: parent.id,
  });
  const child = await a.vault.note(operation);
  await a.vault.write(
    {
      ...child,
      canvas: { width: 1000, height: 500, prose: undefined, items: [] },
    },
    child.revision,
  );
  expect((await a.vault.note(operation)).canvas?.prose).toBeUndefined();
});
it("creates nested shared pages for editors, inherits theme and permissions, and returns authorized breadcrumbs", async () => {
  const parent = (
    await owner("/api/notes").send({
      title: "Parent",
      theme: "paper",
      group: "Study",
    })
  ).body;
  await a.collaboration.invite(
    parent.id,
    {
      session: "owner",
      email: "owner@example.test",
      name: "Owner",
      localOwner: true,
    },
    "editor@example.test",
    "editor",
  );
  await a.collaboration.invite(
    parent.id,
    {
      session: "owner",
      email: "owner@example.test",
      name: "Owner",
      localOwner: true,
    },
    "viewer@example.test",
    "viewer",
  );
  vi.spyOn(a.accounts, "identity").mockImplementation(async (token) => ({
    sub: token || "",
    email: token === "editor" ? "editor@example.test" : "viewer@example.test",
    name: "Member",
    nonce: "",
    expires: Date.now() + 60000,
  }));
  const operation = crypto.randomUUID(),
    input = {
      path: "collab/create-page",
      token: "editor",
      body: { id: parent.id, title: "Child", operation },
    };
  expect((await a.accounts.dispatch("editor-client", input)).status).toBe(200);
  expect((await a.accounts.dispatch("editor-client", input)).status).toBe(200);
  expect(await a.vault.notes()).toHaveLength(2);
  expect(await a.vault.note(operation)).toMatchObject({
    theme: "paper",
    group: "Study",
    parentId: parent.id,
  });
  const child = await a.accounts.dispatch("editor-client", {
    path: "collab/snapshot",
    token: "editor",
    body: { id: operation },
  });
  expect(child.data.lineage).toEqual([{ id: parent.id, title: "Parent" }]);
  expect(
    (
      await a.accounts.dispatch("viewer-client", {
        ...input,
        token: "viewer",
        body: { ...input.body, operation: crypto.randomUUID() },
      })
    ).status,
  ).toBe(403);
});
it("keeps the parent connection usable in other windows when opening a shared subpage", async () => {
  const key = crypto.randomUUID(),
    parent = crypto.randomUUID(),
    child = crypto.randomUUID();
  const client = {
    request: vi.fn().mockResolvedValue({
      status: 200,
      data: { id: child, title: "Child", role: "viewer" },
    }),
    close: vi.fn(),
  } as any;
  a.accounts.peers.set(key, {
    client,
    page: { id: parent, room: "same-room" },
    expires: Date.now() + 600000,
  });
  const opened = await owner("/api/collaboration/remote/" + key + "/open")
    .send({ target: child })
    .expect(200);
  expect(client.request).toHaveBeenCalledWith(
    "collab/open",
    { id: parent, target: child },
    undefined,
  );
  expect(a.accounts.peers.has(key)).toBe(true);
  expect(a.accounts.peers.get(opened.body.connection)?.page.id).toBe(child);
  expect(client.close).not.toHaveBeenCalled();
});
it("opens inherited subpages directly through the shared transport without an account index entry", async () => {
  const parent = (await owner("/api/notes").send({ title: "Parent" })).body;
  const child = (
    await owner("/api/notes").send({ title: "Child", parentId: parent.id })
  ).body;
  const unrelated = (await owner("/api/notes").send({ title: "Private" })).body;
  await a.collaboration.invite(
    parent.id,
    {
      session: "owner",
      email: "owner@example.test",
      name: "Owner",
      localOwner: true,
    },
    "reader@example.test",
    "viewer",
  );
  vi.spyOn(a.accounts, "identity").mockResolvedValue({
    sub: "reader",
    email: "reader@example.test",
    name: "Reader",
    nonce: "",
    expires: Date.now() + 60000,
  });
  const opened = await a.accounts.dispatch("reader", {
    path: "collab/open",
    token: "synthetic",
    body: { id: parent.id, target: child.id },
  });
  expect(opened.status).toBe(200);
  expect(opened.data).toEqual({ id: child.id, title: "Child", role: "viewer" });
  expect(
    (
      await a.accounts.dispatch("reader", {
        path: "collab/open",
        token: "synthetic",
        body: { id: parent.id, target: unrelated.id },
      })
    ).status,
  ).toBe(403);
});
it("binds external sign-in to the one-use app state and Google nonce without exposing the account token", async () => {
  const token = "a".repeat(64);
  let nonce = "";
  vi.spyOn(a.accounts, "remote").mockImplementation(async (action) =>
    action === "config"
      ? { configured: true, clientId: "test.apps.googleusercontent.com" }
      : {
          sub: "alice",
          email: "alice@gmail.com",
          name: "Alice",
          nonce,
          expires: Date.now() + 3600000,
        },
  );
  const start = (await owner("/api/account/start").send({}).expect(200)).body;
  const args = new URLSearchParams(new URL(start.url).hash.slice(1));
  const state = args.get("state")!;
  await request(a.app)
    .post("/api/account/complete")
    .send({ state, token })
    .expect(403);
  await request(a.app)
    .post("/api/account/complete")
    .set("Origin", publicNotebookOrigin)
    .send({ state, token })
    .expect(401);
  a.accounts.cache.clear();
  nonce = args.get("nonce")!;
  await request(a.app)
    .post("/api/account/complete")
    .set("Origin", publicNotebookOrigin)
    .send({ state, token })
    .expect(200);
  const result = await request(a.app)
    .get("/api/account")
    .set("x-test-owner", "true")
    .expect(200);
  expect(result.body.identity.email).toBe("alice@gmail.com");
  expect(JSON.stringify(result.body)).not.toContain(token);
  await request(a.app)
    .post("/api/account/complete")
    .set("Origin", publicNotebookOrigin)
    .send({ state, token })
    .expect(401);
});
it("does not trust typed email and enforces viewer and attachment scope on encrypted RPC", async () => {
  const n = (
    await owner("/api/notes").send({ title: "Private page" }).expect(201)
  ).body;
  const p = {
    session: "owner",
    email: "owner@gmail.com",
    name: "Owner",
    localOwner: true,
  };
  await a.collaboration.invite(n.id, p, "reader@gmail.com", "viewer");
  vi.spyOn(a.accounts, "identity").mockResolvedValue({
    sub: "reader",
    email: "reader@gmail.com",
    name: "Reader",
    nonce: "",
    expires: Date.now() + 60000,
  });
  const forged = { email: "owner@gmail.com", localOwner: true, id: n.id };
  expect(
    (
      await a.accounts.dispatch("remote", {
        path: "collab/acquire",
        token: "x",
        body: { ...forged, cell: "body" },
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await a.accounts.dispatch("remote", {
        path: "collab/upload",
        token: "x",
        body: { ...forged, name: "image.png", data: "YQ==" },
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await a.accounts.dispatch("remote", {
        path: "collab/file",
        token: "x",
        body: {
          ...forged,
          folder: "attachments",
          name: crypto.randomUUID() + ".png",
        },
      })
    ).status,
  ).toBe(403);
  await a.collaboration.revoke(n.id, p, "reader@gmail.com");
  expect(
    (
      await a.accounts.dispatch("remote", {
        path: "collab/snapshot",
        token: "x",
        body: forged,
      })
    ).status,
  ).toBe(403);
});
it("keeps the local owner able to edit a shared page when signed out", async () => {
  const n = (
    await owner("/api/notes").send({ title: "Local owner" }).expect(201)
  ).body;
  await a.collaboration.invite(
    n.id,
    {
      session: "owner",
      email: "owner@gmail.com",
      name: "Owner",
      localOwner: true,
    },
    "other@gmail.com",
    "editor",
  );
  await request(a.app)
    .post("/api/collaboration/local/" + n.id + "/snapshot")
    .send({})
    .expect(401);
  const snapshot = (
    await owner("/api/collaboration/local/" + n.id + "/snapshot")
      .send({})
      .expect(200)
  ).body;
  await owner("/api/collaboration/local/" + n.id + "/acquire")
    .send({ cell: "title" })
    .expect(200);
  await owner("/api/collaboration/local/" + n.id + "/change")
    .send({
      changes: [
        {
          cell: "title",
          base: snapshot.cells.title.hash,
          value: "Edited offline",
        },
      ],
    })
    .expect(200);
  expect((await a.vault.note(n.id)).title).toBe("Edited offline");
  const child = (
    await owner("/api/notes")
      .send({ title: "Child", parentId: n.id })
      .expect(201)
  ).body;
  const acquired = await owner(
    "/api/collaboration/local/" + child.id + "/acquire",
  )
    .send({ cell: "title" })
    .expect(200);
  await owner("/api/collaboration/local/" + child.id + "/change")
    .send({
      changes: [
        { cell: "title", base: acquired.body.hash, value: "Owner edits child" },
      ],
    })
    .expect(200);
  expect((await a.vault.note(child.id)).title).toBe("Owner edits child");
});

it("routes encrypted collaborator packets through scoped identity checks and cannot reuse them for full-vault device requests", async () => {
  const n = (
    await owner("/api/notes")
      .send({ title: "Encrypted shared page" })
      .expect(201)
  ).body;
  await a.collaboration.invite(
    n.id,
    {
      session: "owner",
      email: "owner@gmail.com",
      name: "Owner",
      localOwner: true,
    },
    "reader@gmail.com",
    "editor",
  );
  vi.spyOn(a.accounts, "identity").mockResolvedValue({
    sub: "reader",
    email: "reader@gmail.com",
    name: "Reader",
    nonce: "",
    expires: Date.now() + 60000,
  });
  const host = await identityKeys(),
    peer = await identityKeys(),
    room = crypto.randomUUID(),
    client = crypto.randomUUID(),
    requestId = crypto.randomUUID();
  a.relay.config = {
    url: "https://relay.example",
    room,
    hostToken: "unused",
    ...host,
    origin: publicNotebookOrigin,
  };
  const replies: any[] = [];
  a.relay.socket = {
    readyState: 1,
    bufferedAmount: 0,
    send: (s: string) => replies.push(JSON.parse(s)),
  } as any;
  const key = await sharedKey(peer.privateKey, host.publicKey, room),
    frames: any[] = [];
  const encrypted = await seal(key, aad(room, client, requestId, "request"), {
    path: "collab/snapshot",
    token: "synthetic",
    body: { id: n.id },
  });
  await sendPackets(
    {
      readyState: 1,
      bufferedAmount: 0,
      send: (s: string) => frames.push(JSON.parse(s)),
    } as any,
    client,
    requestId,
    peer.publicKey,
    encrypted,
  );
  expect(JSON.stringify(frames)).not.toContain("synthetic");
  for (const frame of frames) await a.relay.packet(frame);
  const collector = new PacketCollector();
  let payload: string | undefined;
  for (const frame of replies) payload = collector.accept(frame) || payload;
  const result = await unseal(
    key,
    aad(room, client, requestId, "response"),
    payload!,
  );
  expect(result.status).toBe(200);
  expect(result.data.note.id).toBe(n.id);
  const badId = crypto.randomUUID(),
    bad = await seal(key, aad(room, client, badId, "request"), {
      path: "notes",
      token: "synthetic",
    });
  const badFrames: any[] = [];
  await sendPackets(
    {
      readyState: 1,
      bufferedAmount: 0,
      send: (s: string) => badFrames.push(JSON.parse(s)),
    } as any,
    client,
    badId,
    peer.publicKey,
    bad,
  );
  await expect(a.relay.packet(badFrames[0])).rejects.toThrow(
    "Pair this device first",
  );
});

it("does not grant file access when an editor inserts a private attachment path", async () => {
  const n = (
    await owner("/api/notes").send({ title: "Shared page" }).expect(201)
  ).body;
  const p = {
    session: "owner",
    email: "owner@gmail.com",
    name: "Owner",
    localOwner: true,
  };
  await a.collaboration.invite(n.id, p, "editor@gmail.com", "editor");
  const privateName = crypto.randomUUID() + ".txt";
  await fs.writeFile(
    a.vault.file("attachments/" + privateName),
    "Private material",
  );
  const fresh = await a.vault.note(n.id);
  await a.vault.write(
    { ...fresh, body: "[Hidden file](../attachments/" + privateName + ")" },
    fresh.revision,
  );
  vi.spyOn(a.accounts, "identity").mockResolvedValue({
    sub: "editor",
    email: "editor@gmail.com",
    name: "Editor",
    nonce: "",
    expires: Date.now() + 60000,
  });
  expect(
    (
      await a.accounts.dispatch("editor", {
        path: "collab/file",
        token: "synthetic",
        body: { id: n.id, folder: "attachments", name: privateName },
      })
    ).status,
  ).toBe(403);
});

it("stops serving an archived shared page and removes stale invitations from the account index", async () => {
  const n = (
    await owner("/api/notes").send({ title: "Shared page" }).expect(201)
  ).body;
  const p = {
    session: "owner",
    email: "owner@gmail.com",
    name: "Owner",
    localOwner: true,
  };
  await a.collaboration.invite(n.id, p, "reader@gmail.com", "viewer");
  vi.spyOn(a.accounts, "identity").mockResolvedValue({
    sub: "reader",
    email: "reader@gmail.com",
    name: "Reader",
    nonce: "",
    expires: Date.now() + 60000,
  });
  await a.vault.write(
    { ...(await a.vault.note(n.id)), archived: true },
    n.revision,
  );
  expect(
    (
      await a.accounts.dispatch("reader", {
        path: "collab/snapshot",
        token: "synthetic",
        body: { id: n.id },
      })
    ).status,
  ).toBe(404);
  a.accounts.session = {
    token: "synthetic",
    identity: {
      sub: "owner",
      email: "owner@gmail.com",
      name: "Owner",
      nonce: "",
      expires: Date.now() + 60000,
    },
  };
  a.relay.config = {
    url: "https://relay.example",
    room: crypto.randomUUID(),
    hostToken: "synthetic",
    publicKey: "synthetic",
    privateKey: {},
    origin: publicNotebookOrigin,
  };
  const remote = vi
    .spyOn(a.accounts, "remote")
    .mockImplementation(async (action) =>
      action === "pages"
        ? [{ id: n.id, room: a.relay.config!.room, ownerSub: "owner" }]
        : { ok: true },
    );
  await a.accounts.sweepIndex(true);
  expect(remote).toHaveBeenCalledWith("unpublish", {
    id: n.id,
    room: a.relay.config.room,
  });
});

it("renews an expiring shared transport once while preserving its encrypted peer identity", async () => {
  const host = await identityKeys(),
    own = await identityKeys(),
    access = {
      url: "https://relay.example",
      room: crypto.randomUUID(),
      client: crypto.randomUUID(),
      relayToken: "synthetic",
      hostPublic: host.publicKey,
      privateKey: own.privateKey,
    };
  const original = new RelayClient(access),
    key = crypto.randomUUID(),
    expires = Date.now() + 3600000;
  a.accounts.peers.set(key, {
    client: original,
    page: { id: crypto.randomUUID(), room: access.room },
    expires: Date.now() + 1000,
  });
  const remote = vi
    .spyOn(a.accounts, "remote")
    .mockResolvedValue({ ok: true, expires });
  const [one, two] = await Promise.all([
    a.accounts.peer(key),
    a.accounts.peer(key),
  ]);
  expect(remote).toHaveBeenCalledTimes(1);
  expect(original.closed).toBe(true);
  expect(one).toBe(two);
  expect(one.expires).toBe(expires);
  expect(one.client.access).toBe(access);
  await one.client.key;
});
