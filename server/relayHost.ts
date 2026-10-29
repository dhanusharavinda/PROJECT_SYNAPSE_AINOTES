import fs from "node:fs/promises";
import crypto from "node:crypto";
import { atomic, AppError, uid } from "./vault.js";
import type { Vault } from "./vault.js";
import type { DeviceSync } from "./deviceSync.js";
import {
  aad,
  discoverRelay,
  identityKeys,
  PacketCollector,
  publicNotebookOrigin,
  sendPackets,
  sharedKey,
  seal,
  to64,
  unseal,
  type PairInvite,
  type RelayPacket,
} from "../src/relayProtocol.js";
type Config = {
  url: string;
  room: string;
  hostToken: string;
  privateKey: JsonWebKey;
  publicKey: string;
  origin: string;
};
export class RelayHost {
  onCollaboration?: (
    client: string,
    input: any,
  ) => Promise<import("../src/relayProtocol.js").RelayReply>;
  config?: Config;
  socket?: WebSocket;
  collector = new PacketCollector();
  timer?: ReturnType<typeof setTimeout>;
  status = "Not connected";
  stopped = false;
  starting?: Promise<void>;
  invites = new Map<string, number>();
  inflight = new Set<string>();
  watching = new Set<string>();
  constructor(
    private vault: Vault,
    private devices: DeviceSync,
  ) {}
  async load() {
    try {
      this.config = JSON.parse(
        await fs.readFile(this.vault.file(".synapse/relay.json"), "utf8"),
      );
      void this.start().catch(() => {});
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  async management(path: string, body?: unknown, method?: string) {
    const c = this.config!;
    const r = await fetch(c.url + "/rooms/" + c.room + "/" + path, {
      method: method || (body ? "POST" : "GET"),
      headers: {
        Authorization: "Bearer " + c.hostToken,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const result = await r.json();
    if (!r.ok)
      throw new AppError(
        r.status,
        result.error || "Connection service unavailable.",
      );
    return result;
  }
  async configure(
    origin = process.env.SYNAPSE_TABLET_ORIGIN || publicNotebookOrigin,
  ) {
    if (this.config) {
      if (this.config.origin !== origin)
        throw new AppError(
          400,
          "This notebook is already paired with another tablet site. Use its original site.",
        );
      return;
    }
    this.devices.start(origin);
    const url = process.env.SYNAPSE_RELAY_URL || (await discoverRelay()),
      keys = await identityKeys(),
      hostToken = crypto.randomBytes(32).toString("base64url"),
      config = { url, room: uid(), hostToken, ...keys, origin };
    const r = await fetch(url + "/rooms/" + config.room + "/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hostHash: this.devices.hash(hostToken), origin }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok)
      throw new AppError(
        502,
        "Could not prepare QR pairing. Try again shortly.",
      );
    this.config = config;
    await atomic(
      this.vault.file(".synapse/relay.json"),
      JSON.stringify(config),
    );
  }
  async invitation(
    origin = process.env.SYNAPSE_TABLET_ORIGIN || publicNotebookOrigin,
  ): Promise<{ invite: PairInvite; link: string }> {
    await this.configure(origin);
    await this.start();
    const c = this.config!,
      code = this.devices.start(c.origin),
      client = uid(),
      relayToken = crypto.randomBytes(32).toString("base64url");
    const expires = Date.parse(code.expires);
    for (const [id, expiry] of this.invites)
      if (expiry < Date.now()) this.invites.delete(id);
    await this.management("client", {
      id: client,
      hash: this.devices.hash(relayToken),
      expires,
    });
    this.invites.set(client, expires);
    const invite: PairInvite = {
      version: 1,
      url: c.url,
      room: c.room,
      client,
      relayToken,
      hostPublic: c.publicKey,
      code: code.code,
      expires: code.expires,
    };
    const link =
      c.origin +
      "/tablet/#pair=" +
      to64(new TextEncoder().encode(JSON.stringify(invite)));
    return { invite, link };
  }
  async start() {
    if (this.socket?.readyState === 1 && this.status === "Connected") return;
    if (this.starting) return this.starting;
    if (!this.config) return;
    this.stopped = false;
    this.starting = (async () => {
      await this.devices.openGateway();
      const c = this.config!,
        endpoint = new URL(c.url + "/rooms/" + c.room + "/socket?client=pc");
      endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
      this.status = "Connecting";
      await new Promise<void>((resolve, reject) => {
        const ws = (this.socket = new WebSocket(endpoint));
        const timeout = setTimeout(() => {
          ws.close();
          reject(Error("Connection service timed out."));
        }, 12000);
        let ready = false;
        ws.addEventListener("open", () =>
          ws.send(JSON.stringify({ type: "auth", token: c.hostToken })),
        );
        ws.addEventListener("message", (event) => {
          void (async () => {
            const p = JSON.parse(String(event.data));
            if (p.type === "ready") {
              ready = true;
              clearTimeout(timeout);
              this.status = "Connected";
              resolve();
              return;
            }
            if (p.type === "packet") await this.packet(p);
          })().catch(() => {});
        });
        ws.addEventListener("close", () => {
          clearTimeout(timeout);
          this.status = "Reconnecting";
          this.collector.clear();
          if (!ready) reject(Error("Connection service unavailable."));
          if (!this.stopped) {
            clearTimeout(this.timer);
            this.timer = setTimeout(
              () => void this.start().catch(() => {}),
              4000,
            );
          }
        });
        ws.addEventListener("error", () => {
          if (!ready) reject(Error("Connection service unavailable."));
        });
      });
    })().finally(() => {
      this.starting = undefined;
    });
    return this.starting;
  }
  async packet(p: RelayPacket) {
    if (!this.config) return;
    const peer = this.devices.records.find((r) => r.id === p.client),
      invite = this.invites.get(p.client);
    if ((!invite || invite < Date.now()) && !peer && !this.onCollaboration)
      return;
    if (peer && peer.relayPublicKey !== p.publicKey) return;
    const packed = this.collector.accept(p);
    if (!packed || this.inflight.has(p.id)) return;
    const c = this.config,
      key = await sharedKey(c.privateKey, p.publicKey, c.room);
    const input = await unseal(
      key,
      aad(c.room, p.client, p.id, "request"),
      packed,
    );
    if (
      typeof input.path === "string" &&
      /^collab\/(create-page|open|watch|snapshot|acquire|change|release|file|upload)$/.test(
        input.path,
      ) &&
      this.onCollaboration
    ) {
      const watching = input.path === "collab/watch";
      if (
        this.inflight.size - this.watching.size >= 8 ||
        (watching && this.watching.size >= 32)
      )
        return;
      this.inflight.add(p.id);
      if (watching) this.watching.add(p.id);
      try {
        const result = await this.onCollaboration(p.client, input);
        const encrypted = await seal(
          key,
          aad(c.room, p.client, p.id, "response"),
          result,
        );
        await sendPackets(this.socket!, p.client, p.id, c.publicKey, encrypted);
      } finally {
        this.inflight.delete(p.id);
        this.watching.delete(p.id);
      }
      return;
    }
    if (
      typeof input.path !== "string" ||
      !/^(connect|diagram|notes(?:\?since=[a-zA-Z0-9%_-]*)?|note|file(?:\?folder=(attachments|drawings)&name=[a-f0-9-]{36}\.(png|jpe?g|webp|svg|pdf|json))?)$/.test(
        input.path,
      )
    )
      throw Error("Operation not allowed");
    if (input.path === "connect" && peer) throw Error("Already paired");
    if (input.path !== "connect" && !peer)
      throw Error("Pair this device first");
    if (this.inflight.size - this.watching.size >= 4) return;
    this.inflight.add(p.id);
    try {
      const r = await fetch(
        "http://127.0.0.1:" +
          this.devices.gatewayPort +
          "/api/device/" +
          input.path,
        {
          method: input.body === undefined ? "GET" : "POST",
          headers: {
            Origin: c.origin,
            "Content-Type": "application/json",
            ...(input.token ? { Authorization: "Bearer " + input.token } : {}),
          },
          body:
            input.body === undefined ? undefined : JSON.stringify(input.body),
          signal: AbortSignal.timeout(
            input.path === "diagram" ? 185000 : 30000,
          ),
        },
      );
      let result: any;
      if (input.path.startsWith("file?") && r.ok) {
        const bytes = new Uint8Array(await r.arrayBuffer());
        if (bytes.length > 20 * 1024 * 1024)
          result = {
            status: 413,
            data: { error: "Attachment exceeds the 20 MB tablet limit." },
          };
        else
          result = {
            status: r.status,
            binary: to64(bytes),
            contentType: r.headers.get("content-type"),
          };
      } else {
        const data = await r.json();
        if (input.path === "connect" && r.ok) {
          const record = this.devices.records.find((n) => n.id === data.id)!;
          record.relayPublicKey = p.publicKey;
          await this.devices.save();
          const token = crypto.randomBytes(32).toString("base64url");
          await this.management("client", {
            id: data.id,
            hash: this.devices.hash(token),
            expires: Date.now() + 365 * 86400000 - 10000,
          });
          data.relay = { client: data.id, token };
        }
        result = { status: r.status, data };
      }
      const encrypted = await seal(
        key,
        aad(c.room, p.client, p.id, "response"),
        result,
      );
      await sendPackets(this.socket!, p.client, p.id, c.publicKey, encrypted);
    } finally {
      this.inflight.delete(p.id);
    }
  }
  async revoke(id: string) {
    if (this.config)
      await this.management("client?id=" + id, undefined, "DELETE");
  }
  close() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.socket?.close();
    this.socket = undefined;
    this.collector.clear();
  }
}
