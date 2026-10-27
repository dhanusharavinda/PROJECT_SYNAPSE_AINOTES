export const publicNotebookOrigin =
  "https://project-synapse-ainotes.vercel.app";
export type RelayAccess = {
  url: string;
  room: string;
  client: string;
  relayToken: string;
  hostPublic: string;
  privateKey: JsonWebKey;
};
export type PairInvite = {
  version: 1;
  url: string;
  room: string;
  client: string;
  relayToken: string;
  hostPublic: string;
  code: string;
  expires: string;
};
export type RelayPacket = {
  type: "packet";
  id: string;
  client: string;
  publicKey: string;
  index: number;
  total: number;
  payload: string;
};
export type RelayReply = {
  status: number;
  data?: any;
  binary?: string;
  contentType?: string;
};
export const chunkSize = 192 * 1024,
  maxEncodedBytes = 48 * 1024 * 1024;
export function to64(bytes: Uint8Array) {
  let text = "";
  for (let i = 0; i < bytes.length; i += 8192)
    text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function from64(s: string) {
  if (!/^[a-zA-Z0-9_-]*$/.test(s)) throw Error("Invalid encoded data.");
  return Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
    c.charCodeAt(0),
  );
}
export async function identityKeys() {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  return {
    privateKey: await crypto.subtle.exportKey("jwk", pair.privateKey),
    publicKey: to64(
      new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey)),
    ),
  };
}
export async function sharedKey(
  privateKey: JsonWebKey,
  publicKey: string,
  room: string,
) {
  const own = await crypto.subtle.importKey(
      "jwk",
      privateKey,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      ["deriveBits"],
    ),
    peer = await crypto.subtle.importKey(
      "spki",
      from64(publicKey),
      { name: "ECDH", namedCurve: "P-256" },
      false,
      [],
    );
  const secret = await crypto.subtle.deriveBits(
      { name: "ECDH", public: peer },
      own,
      256,
    ),
    raw = await crypto.subtle.importKey("raw", secret, "HKDF", false, [
      "deriveKey",
    ]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode(room),
      info: new TextEncoder().encode("Synapse device sync v1"),
    },
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function seal(key: CryptoKey, aad: string, value: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12)),
    plain = new TextEncoder().encode(JSON.stringify(value));
  if (plain.length > maxEncodedBytes * 0.7)
    throw Error(
      "This sync message is too large. Split the page into smaller pages.",
    );
  const encrypted = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) },
        key,
        plain,
      ),
    ),
    packed = new Uint8Array(12 + encrypted.length);
  packed.set(iv);
  packed.set(encrypted, 12);
  return to64(packed);
}
export async function unseal(key: CryptoKey, aad: string, text: string) {
  if (text.length > maxEncodedBytes)
    throw Error("Sync message exceeded its limit.");
  const b = from64(text);
  const plain = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: b.subarray(0, 12),
      additionalData: new TextEncoder().encode(aad),
    },
    key,
    b.subarray(12),
  );
  return JSON.parse(new TextDecoder().decode(plain));
}
export function aad(
  room: string,
  client: string,
  id: string,
  direction: "request" | "response",
) {
  return JSON.stringify(["synapse-v1", room, client, id, direction]);
}
export class PacketCollector {
  parts = new Map<
    string,
    {
      started: number;
      client: string;
      publicKey: string;
      parts: (string | undefined)[];
      bytes: number;
    }
  >();
  accept(p: RelayPacket) {
    for (const [id, item] of this.parts)
      if (Date.now() - item.started > 90000) this.parts.delete(id);
    if (
      p.type !== "packet" ||
      !/^[-a-f0-9]{36}$/.test(p.id) ||
      !/^[-a-f0-9]{36}$/.test(p.client) ||
      !Number.isInteger(p.total) ||
      p.total < 1 ||
      p.total > 256 ||
      !Number.isInteger(p.index) ||
      p.index < 0 ||
      p.index >= p.total ||
      typeof p.payload !== "string" ||
      p.payload.length > chunkSize ||
      typeof p.publicKey !== "string" ||
      p.publicKey.length > 200
    )
      throw Error("Invalid encrypted packet.");
    let item = this.parts.get(p.id);
    if (!item) {
      if (this.parts.size >= 4) throw Error("Too many pending messages.");
      item = {
        started: Date.now(),
        client: p.client,
        publicKey: p.publicKey,
        parts: Array(p.total).fill(undefined),
        bytes: 0,
      };
      this.parts.set(p.id, item);
    }
    if (
      item.client !== p.client ||
      item.publicKey !== p.publicKey ||
      item.parts.length !== p.total
    )
      throw Error("Packet identity changed.");
    if (item.parts[p.index] !== undefined) {
      if (item.parts[p.index] !== p.payload)
        throw Error("Conflicting duplicate packet.");
      return;
    }
    item.bytes += p.payload.length;
    if (item.bytes > maxEncodedBytes) {
      this.parts.delete(p.id);
      throw Error("Encrypted message is too large.");
    }
    item.parts[p.index] = p.payload;
    if (item.parts.every((part) => part !== undefined)) {
      this.parts.delete(p.id);
      return item.parts.join("");
    }
  }
  clear() {
    this.parts.clear();
  }
}
export async function sendPackets(
  socket: WebSocket,
  client: string,
  id: string,
  publicKey: string,
  text: string,
) {
  const total = Math.ceil(text.length / chunkSize);
  if (text.length > maxEncodedBytes)
    throw Error("Encrypted message too large.");
  for (let index = 0; index < total; index++) {
    const deadline = Date.now() + 15000;
    while (socket.bufferedAmount > 1024 * 1024) {
      if (Date.now() > deadline || socket.readyState !== 1)
        throw Error("Sync connection is busy. Retrying later.");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    if (socket.readyState !== 1)
      throw Error("PC disconnected. Your pages remain saved.");
    socket.send(
      JSON.stringify({
        type: "packet",
        client,
        id,
        publicKey,
        index,
        total,
        payload: text.slice(index * chunkSize, (index + 1) * chunkSize),
      }),
    );
  }
}
export function validateInvite(value: any): PairInvite {
  if (
    value?.version !== 1 ||
    !/^[-a-f0-9]{36}$/.test(value.room) ||
    !/^[-a-f0-9]{36}$/.test(value.client) ||
    !/^[a-zA-Z0-9_-]{43}$/.test(value.relayToken) ||
    !/^[a-zA-Z0-9_-]{90,160}$/.test(value.hostPublic) ||
    !/^[a-f0-9]{24}$/.test(value.code) ||
    !Number.isFinite(Date.parse(value.expires))
  )
    throw Error("This is not a valid Synapse pairing code.");
  const url = new URL(value.url);
  if (
    url.origin !== value.url ||
    !(
      url.protocol === "https:" ||
      (["localhost", "127.0.0.1"].includes(url.hostname) &&
        url.protocol === "http:")
    )
  )
    throw Error("Invalid connection service.");
  if (Date.parse(value.expires) < Date.now())
    throw Error("This QR code expired. Generate another one on your PC.");
  return value;
}
export async function discoverRelay(
  base = typeof location === "undefined"
    ? publicNotebookOrigin
    : location.origin,
) {
  const r = await fetch(base + "/relay-config.json", {
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok)
    throw Error(
      "Cannot reach Synapse connection service. Your offline pages are safe.",
    );
  const config = await r.json();
  if (config.version !== 1 || !config.relayOrigin)
    throw Error("The QR connection service has not been configured yet.");
  const url = new URL(config.relayOrigin);
  if (
    (url.protocol !== "https:" &&
      !(
        ["localhost", "127.0.0.1"].includes(url.hostname) &&
        new URL(base).hostname === url.hostname
      )) ||
    url.origin !== config.relayOrigin
  )
    throw Error("Invalid connection service configuration.");
  return url.origin;
}
