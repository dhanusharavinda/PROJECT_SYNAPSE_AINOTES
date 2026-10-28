import { it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Vault } from "../server/vault";
import { Collaboration, type Principal } from "../server/collaboration";
import { newTabletNote } from "../src/tabletStore";
let root: string, vault: Vault, service: Collaboration, id: string;
const owner: Principal = {
    session: "owner",
    email: "owner@example.test",
    name: "Owner",
    localOwner: true,
  },
  a: Principal = { session: "a", email: "a@example.test", name: "Alex" },
  b: Principal = { session: "b", email: "b@example.test", name: "Beth" },
  viewer: Principal = {
    session: "view",
    email: "view@example.test",
    name: "Visitor",
  };
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "synapse-collab-"));
  vault = new Vault(root);
  await vault.init();
  service = new Collaboration(vault);
  const n = newTabletNote();
  delete n.theme;
  id = (await vault.write(n)).id;
  await service.invite(id, owner, a.email, "editor");
  await service.invite(id, owner, b.email, "editor");
  await service.invite(id, owner, viewer.email, "viewer");
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});
it("keeps inherited parent access when a child also has its own separate collaborator list", async () => {
  const child = await vault.write({ ...newTabletNote(), parentId: id });
  await service.invite(child.id, owner, "different@example.test", "viewer");
  expect((await service.snapshot(child.id, a)).role).toBe("editor");
});
it("pushes changes immediately to a waiting second session and includes live presence", async () => {
  const first = await service.watch(id, b);
  const pending = service.watch(id, b, first.cursor);
  const acquired = await service.acquire(id, a, "body");
  const presence = await pending;
  expect(presence.snapshot.presence.some((p) => p.session === "a")).toBe(true);
  const next = service.watch(id, b, presence.cursor);
  await service.change(id, a, [
    { cell: "body", base: acquired.hash, value: "Live edit" },
  ]);
  expect((await next).snapshot.note.body).toBe("Live edit");
});
it("inherits parent access for children and grandchildren, and revokes it without granting unrelated pages", async () => {
  const child = await vault.write({ ...newTabletNote(), parentId: id });
  const grandchild = await vault.write({
    ...newTabletNote(),
    parentId: child.id,
  });
  const unrelated = await vault.write(newTabletNote());
  expect((await service.snapshot(grandchild.id, a)).role).toBe("editor");
  expect((await service.snapshot(child.id, viewer)).role).toBe("viewer");
  await expect(service.snapshot(unrelated.id, a)).rejects.toThrow("shared");
  const first = await service.watch(grandchild.id, a);
  const waiting = service.watch(grandchild.id, a, first.cursor);
  const rejected = expect(waiting).rejects.toThrow("access");
  await service.revoke(id, owner, a.email);
  await rejected;
});
it("enforces viewer and invite permissions in the service", async () => {
  await expect(service.acquire(id, viewer, "body")).rejects.toThrow("Viewer");
  await expect(
    service.change(id, viewer, [{ cell: "body", base: "x", value: "attack" }]),
  ).rejects.toThrow("Viewer");
  await expect(
    service.invite(id, a, "evil@example.test", "editor"),
  ).rejects.toThrow("owner");
});
it("lets editors change different parts without overwriting each other and shows live presence", async () => {
  const text = await service.acquire(id, a, "body"),
    title = await service.acquire(id, b, "title");
  expect(service.active(id)).toHaveLength(2);
  await service.change(id, a, [
    { cell: "body", base: text.hash, value: "Alex writes here" },
  ]);
  await service.change(id, b, [
    { cell: "title", base: title.hash, value: "Beth names this" },
  ]);
  const n = await vault.note(id);
  expect(n.body).toBe("Alex writes here");
  expect(n.title).toBe("Beth names this");
  await expect(service.acquire(id, b, "body")).rejects.toThrow("Alex");
});
it("rejects stale changes after restart or an external file edit", async () => {
  const cell = await service.acquire(id, a, "body"),
    n = await vault.note(id);
  await vault.write({ ...n, body: "Outside edit" }, n.revision);
  await expect(
    service.change(id, a, [{ cell: "body", base: cell.hash, value: "Stale" }]),
  ).rejects.toThrow("changed elsewhere");
  expect((await vault.note(id)).body).toBe("Outside edit");
});
it("revokes a live user and denies further edits immediately", async () => {
  const cell = await service.acquire(id, a, "body"),
    events: unknown[] = [];
  service.subscribe(id, a, (e) => events.push(e));
  await service.revoke(id, owner, a.email);
  expect(events).toContainEqual({ type: "revoked" });
  await expect(
    service.change(id, a, [{ cell: "body", base: cell.hash, value: "No" }]),
  ).rejects.toThrow("access");
});
