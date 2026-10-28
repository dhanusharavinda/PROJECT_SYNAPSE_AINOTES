import {
  aad,
  from64,
  identityKeys,
  PacketCollector,
  sendPackets,
  sharedKey,
  seal,
  to64,
  unseal,
  type PairInvite,
  type RelayAccess,
  type RelayPacket,
  type RelayReply,
} from "./relayProtocol";
export async function publicFromPrivate(key: JsonWebKey) {
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    { kty: key.kty, crv: key.crv, x: key.x, y: key.y, ext: true },
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  );
  return to64(new Uint8Array(await crypto.subtle.exportKey("spki", publicKey)));
}
export class RelayClient {
  socket?: WebSocket;
  opening?: Promise<void>;
  collector = new PacketCollector();
  pending = new Map<
    string,
    {
      resolve: (r: RelayReply) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  key: Promise<CryptoKey>;
  publicKey: Promise<string>;
  closed = false;
  constructor(
    public access: RelayAccess,
    private socketFactory: (url: URL) => WebSocket = (url) =>
      new WebSocket(url),
  ) {
    this.key = sharedKey(access.privateKey, access.hostPublic, access.room);
    this.publicKey = publicFromPrivate(access.privateKey);
  }
  connect() {
    if (this.closed) throw Error("Connection closed.");
    if (this.socket?.readyState === 1 && !this.opening)
      return Promise.resolve();
    if (this.opening) return this.opening;
    this.opening = new Promise<void>((resolve, reject) => {
      const endpoint = new URL(
        this.access.url + "/rooms/" + this.access.room + "/socket",
      );
      endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
      endpoint.searchParams.set("client", this.access.client);
      const ws = (this.socket = this.socketFactory(endpoint));
      let ready = false;
      const timer = setTimeout(() => {
        ws.close();
        reject(
          Error(
            "Cannot reach the PC connection service. Your pages remain saved.",
          ),
        );
      }, 12000);
      ws.addEventListener("open", () =>
        ws.send(
          JSON.stringify({ type: "auth", token: this.access.relayToken }),
        ),
      );
      ws.addEventListener("message", (event) => {
        void (async () => {
          const data = JSON.parse(String(event.data));
          if (data.type === "ready") {
            ready = true;
            clearTimeout(timer);
            resolve();
            return;
          }
          if (data.type === "offline") {
            const pending = this.pending.get(data.id);
            if (pending) {
              clearTimeout(pending.timer);
              pending.reject(
                Error("PC is offline. Open Synapse on Windows to sync."),
              );
              this.pending.delete(data.id);
            }
            return;
          }
          if (
            data.type !== "packet" ||
            data.client !== this.access.client ||
            data.publicKey !== this.access.hostPublic ||
            !this.pending.has(data.id)
          )
            return;
          const packed = this.collector.accept(data as RelayPacket);
          if (!packed) return;
          const pending = this.pending.get(data.id)!;
          try {
            const result = await unseal(
              await this.key,
              aad(this.access.room, this.access.client, data.id, "response"),
              packed,
            );
            clearTimeout(pending.timer);
            this.pending.delete(data.id);
            pending.resolve(result);
          } catch {
            clearTimeout(pending.timer);
            this.pending.delete(data.id);
            pending.reject(
              Error(
                "Encrypted reply could not be verified. No local changes were lost.",
              ),
            );
          }
        })().catch(() => ws.close());
      });
      ws.addEventListener("close", () => {
        clearTimeout(timer);
        if (!ready)
          reject(Error("Pairing expired or the connection is unavailable."));
        this.collector.clear();
        for (const p of this.pending.values()) {
          clearTimeout(p.timer);
          p.reject(
            Error("Connection interrupted. Your pages will retry syncing."),
          );
        }
        this.pending.clear();
        if (this.socket === ws) this.socket = undefined;
      });
      ws.addEventListener("error", () => {
        if (!ready) reject(Error("Cannot reach the connection service."));
      });
    }).finally(() => {
      this.opening = undefined;
    });
    return this.opening;
  }
  async request(path: string, body?: unknown, token?: string) {
    await this.connect();
    const id = crypto.randomUUID();
    const packet = await seal(
      await this.key,
      aad(this.access.room, this.access.client, id, "request"),
      { path, body, token },
    );
    const pub = await this.publicKey;
    return new Promise<RelayReply>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.collector.parts.delete(id);
        reject(
          Error("PC did not respond. Your pages stay saved and will retry."),
        );
      }, 90000);
      this.pending.set(id, { resolve, reject, timer });
      void sendPackets(this.socket!, this.access.client, id, pub, packet).catch(
        (e) => {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(e);
        },
      );
    });
  }
  close() {
    this.closed = true;
    this.socket?.close();
    this.socket = undefined;
    this.collector.clear();
  }
}
export async function connectInvite(invite: PairInvite, identity?: string) {
  const keys = await identityKeys(),
    access: RelayAccess = {
      url: invite.url,
      room: invite.room,
      client: invite.client,
      relayToken: invite.relayToken,
      hostPublic: invite.hostPublic,
      privateKey: keys.privateKey,
    },
    client = new RelayClient(access);
  try {
    const reply = await client.request("connect", {
      code: invite.code,
      name: "Tablet notebook",
      identity,
    });
    if (reply.status !== 200)
      throw Error(reply.data?.error || "Pairing failed.");
    const data = reply.data;
    if (
      !data?.relay?.client ||
      !data?.relay?.token ||
      !data?.token ||
      !data?.identity
    )
      throw Error("Invalid pairing reply.");
    return {
      access: {
        ...access,
        client: data.relay.client,
        relayToken: data.relay.token,
      },
      token: data.token,
      identity: data.identity,
    };
  } finally {
    client.close();
  }
}
export function relayFile(reply: RelayReply) {
  if (!reply.binary)
    throw Error(reply.data?.error || "Attachment unavailable.");
  return new Blob([from64(reply.binary)], {
    type: reply.contentType || "application/octet-stream",
  });
}
