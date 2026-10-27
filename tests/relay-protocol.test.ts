import { it, expect } from "vitest";
import {
  aad,
  identityKeys,
  sharedKey,
  seal,
  unseal,
  PacketCollector,
  validateInvite,
} from "../src/relayProtocol";
it("only the paired keys can decrypt note data, with room and direction binding", async () => {
  const a = await identityKeys(),
    b = await identityKeys(),
    c = await identityKeys(),
    room = crypto.randomUUID();
  const keyA = await sharedKey(a.privateKey, b.publicKey, room),
    keyB = await sharedKey(b.privateKey, a.publicKey, room),
    other = await sharedKey(c.privateKey, a.publicKey, room);
  const context = aad(
      room,
      crypto.randomUUID(),
      crypto.randomUUID(),
      "request",
    ),
    text = await seal(keyA, context, { body: "A private handwritten idea" });
  expect(text).not.toContain("private");
  expect(await unseal(keyB, context, text)).toEqual({
    body: "A private handwritten idea",
  });
  await expect(unseal(other, context, text)).rejects.toThrow();
  await expect(unseal(keyB, context + "response", text)).rejects.toThrow();
  await expect(
    unseal(keyB, context, text.slice(0, -5) + "AAAAA"),
  ).rejects.toThrow();
});
it("reassembles out-of-order chunks and rejects conflicting duplicates and identity changes", () => {
  const collector = new PacketCollector(),
    p = {
      type: "packet" as const,
      id: crypto.randomUUID(),
      client: crypto.randomUUID(),
      publicKey: "key",
      total: 2,
      index: 1,
      payload: "b",
    };
  expect(collector.accept(p)).toBeUndefined();
  expect(collector.accept(p)).toBeUndefined();
  expect(() => collector.accept({ ...p, payload: "evil" })).toThrow();
  expect(() =>
    collector.accept({ ...p, client: crypto.randomUUID(), index: 0 }),
  ).toThrow();
  expect(collector.accept({ ...p, index: 0, payload: "a" })).toBe("ab");
  expect(collector.parts.size).toBe(0);
});
it("rejects expired invites and insecure remote relay addresses", async () => {
  const keys = await identityKeys(),
    v = {
      version: 1,
      url: "https://relay.example",
      room: crypto.randomUUID(),
      client: crypto.randomUUID(),
      relayToken: "a".repeat(43),
      hostPublic: keys.publicKey,
      code: "a".repeat(24),
      expires: new Date(Date.now() + 300000).toISOString(),
    };
  expect(validateInvite(v)).toEqual(v);
  expect(() => validateInvite({ ...v, expires: "2000-01-01" })).toThrow(
    "expired",
  );
  expect(() => validateInvite({ ...v, url: "http://evil.example" })).toThrow();
});
