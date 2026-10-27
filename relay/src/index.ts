interface Env {
  ROOMS: DurableObjectNamespace;
}
type Auth = {
  ok: boolean;
  client: string;
  expires: number;
  deadline: number;
  window: number;
  bytes: number;
};
const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
const digest = async (s: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
const id = (x: any) => typeof x === "string" && /^[a-f0-9-]{36}$/.test(x),
  hash = (x: any) => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
export default {
  async fetch(req: Request, env: Env) {
    const url = new URL(req.url);
    if (url.pathname === "/health")
      return json({ protocol: 1, service: "synapse-encrypted-relay" });
    const match = url.pathname.match(/^\/rooms\/([a-f0-9-]{36})\/([a-z]+)$/);
    if (!match) return json({ error: "Unknown route" }, 404);
    if (req.method === "POST" && match[2] === "register") {
      const guard = env.ROOMS.get(
          env.ROOMS.idFromName("registration-limit-v1"),
        ),
        key = await digest(req.headers.get("CF-Connecting-IP") || "local");
      const limited = await guard.fetch("https://internal/rate/" + key, {
        method: "POST",
      });
      if (!limited.ok) return limited;
    }
    return env.ROOMS.get(env.ROOMS.idFromName(match[1])).fetch(req);
  },
};
export class SyncRoom {
  constructor(
    private ctx: DurableObjectState,
    private env: Env,
  ) {}
  async schedule(time: number) {
    const old = await this.ctx.storage.getAlarm();
    if (old === null || old > time) await this.ctx.storage.setAlarm(time);
  }
  async fetch(req: Request): Promise<Response> {
    try {
      const url = new URL(req.url),
        action = url.pathname.split("/").pop();
      if (url.pathname.startsWith("/rate/")) {
        const key = "rate:" + action,
          now = Date.now();
        const allowed = await this.ctx.storage.transaction(async (tx) => {
          let r = await tx.get<{ n: number; expires: number }>(key);
          if (!r || r.expires < now) r = { n: 0, expires: now + 3600000 };
          if (r.n >= 5) return false;
          r.n++;
          await tx.put(key, r);
          return true;
        });
        await this.schedule(now + 3600000);
        return json({ ok: allowed }, allowed ? 200 : 429);
      }
      if (action === "register" && req.method === "POST") {
        const text = await req.text();
        if (text.length > 2000)
          return json({ error: "Request too large" }, 413);
        const b = JSON.parse(text);
        if (!hash(b.hostHash) || typeof b.origin !== "string")
          return json({ error: "Invalid registration" }, 400);
        const o = new URL(b.origin);
        if (
          o.origin !== b.origin ||
          !(
            o.protocol === "https:" ||
            ["localhost", "127.0.0.1"].includes(o.hostname)
          )
        )
          return json({ error: "Invalid app origin" }, 400);
        const created = await this.ctx.storage.transaction(async (tx) => {
          if (await tx.get("owner")) return false;
          await tx.put("owner", {
            hash: b.hostHash,
            origin: b.origin,
            expires: Date.now() + 365 * 86400000,
          });
          return true;
        });
        return json({ created }, created ? 201 : 409);
      }
      const owner = await this.ctx.storage.get<{
        hash: string;
        origin: string;
        expires: number;
      }>("owner");
      if (!owner || owner.expires < Date.now())
        return json({ error: "PC connection expired. Pair again." }, 404);
      if (action === "socket") {
        if (req.headers.get("Upgrade")?.toLowerCase() !== "websocket")
          return json({ error: "WebSocket required" }, 426);
        const client = url.searchParams.get("client") || "",
          origin = req.headers.get("Origin");
        if (client !== "pc" && !id(client))
          return json({ error: "Invalid device" }, 400);
        if ((origin && origin !== owner.origin) || (!origin && client !== "pc"))
          return json({ error: "App origin not allowed" }, 403);
        if (this.ctx.getWebSockets().length >= 16)
          return json({ error: "Too many connections" }, 429);
        const [front, back] = Object.values(new WebSocketPair());
        this.ctx.acceptWebSocket(back);
        back.serializeAttachment({
          ok: false,
          client,
          expires: 0,
          deadline: Date.now() + 10000,
          window: Date.now(),
          bytes: 0,
        } satisfies Auth);
        await this.schedule(Date.now() + 10000);
        return new Response(null, { status: 101, webSocket: front });
      }
      const token = req.headers.get("Authorization")?.replace(/^Bearer /, "");
      if (!token || (await digest(token)) !== owner.hash)
        return json({ error: "PC authorization required" }, 401);
      if (action === "client" && req.method === "POST") {
        const text = await req.text();
        if (text.length > 2000)
          return json({ error: "Request too large" }, 413);
        const b = JSON.parse(text);
        if (
          !id(b.id) ||
          !hash(b.hash) ||
          !Number.isFinite(b.expires) ||
          b.expires < Date.now() ||
          b.expires > Date.now() + 365 * 86400000
        )
          return json({ error: "Invalid device registration" }, 400);
        const key = "client:" + b.id,
          old = await this.ctx.storage.get<{ hash: string }>(key);
        if (old && old.hash !== b.hash)
          return json({ error: "Device identity conflict" }, 409);
        const records = await this.ctx.storage.list({ prefix: "client:" });
        if (!old && records.size >= 30)
          return json({ error: "Remove an old device first" }, 429);
        await this.ctx.storage.put(key, { hash: b.hash, expires: b.expires });
        await this.schedule(Date.now() + 300000);
        return json({ ok: true });
      }
      if (action === "client" && req.method === "DELETE") {
        const client = url.searchParams.get("id");
        if (!id(client)) return json({ error: "Invalid device" }, 400);
        await this.ctx.storage.delete("client:" + client);
        for (const ws of this.ctx.getWebSockets()) {
          const a = ws.deserializeAttachment() as Auth;
          if (a.client === client) ws.close(1008, "Device removed");
        }
        return json({ ok: true });
      }
      if (action === "status")
        return json({
          online: this.ctx.getWebSockets().some((ws) => {
            const a = ws.deserializeAttachment() as Auth;
            return a.ok && a.client === "pc";
          }),
        });
      return json({ error: "Unknown operation" }, 404);
    } catch {
      return json({ error: "Invalid relay request" }, 400);
    }
  }
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const a = ws.deserializeAttachment() as Auth;
    try {
      if (typeof message !== "string" || message.length > 210000) throw Error();
      const p = JSON.parse(message);
      if (!a.ok) {
        if (
          Date.now() > a.deadline ||
          p.type !== "auth" ||
          typeof p.token !== "string" ||
          p.token.length !== 43
        )
          throw Error();
        const record = await this.ctx.storage.get<{
          hash: string;
          expires: number;
        }>(a.client === "pc" ? "owner" : "client:" + a.client);
        if (
          !record ||
          record.expires < Date.now() ||
          record.hash !== (await digest(p.token))
        )
          throw Error();
        a.ok = true;
        a.expires = record.expires;
        ws.serializeAttachment(a);
        for (const peer of this.ctx.getWebSockets()) {
          if (peer !== ws) {
            const other = peer.deserializeAttachment() as Auth;
            if (other.ok && other.client === a.client)
              peer.close(1000, "New connection");
          }
        }
        ws.send(JSON.stringify({ type: "ready" }));
        return;
      }
      if (a.expires < Date.now()) throw Error();
      if (Date.now() - a.window > 60000) {
        a.window = Date.now();
        a.bytes = 0;
      }
      a.bytes += message.length;
      if (a.bytes > 96 * 1024 * 1024) throw Error();
      ws.serializeAttachment(a);
      if (p.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
        return;
      }
      if (
        p.type !== "packet" ||
        !id(p.client) ||
        !id(p.id) ||
        typeof p.publicKey !== "string" ||
        p.publicKey.length > 200 ||
        typeof p.payload !== "string" ||
        p.payload.length > 196608 ||
        !Number.isInteger(p.total) ||
        p.total < 1 ||
        p.total > 256 ||
        !Number.isInteger(p.index) ||
        p.index < 0 ||
        p.index >= p.total ||
        (a.client !== "pc" && p.client !== a.client)
      )
        throw Error();
      const target = a.client === "pc" ? p.client : "pc";
      let delivered = false;
      for (const peer of this.ctx.getWebSockets()) {
        const other = peer.deserializeAttachment() as Auth;
        if (other.ok && other.client === target && other.expires > Date.now()) {
          peer.send(message);
          delivered = true;
        }
      }
      if (!delivered && a.client !== "pc")
        ws.send(JSON.stringify({ type: "offline", id: p.id }));
    } catch {
      ws.close(1008, "Connection verification failed");
    }
  }
  webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code === 1006 ? 1000 : code, "Disconnected");
    } catch {}
  }
  webSocketError(ws: WebSocket) {
    try {
      ws.close(1011, "Reconnect");
    } catch {}
  }
  async alarm() {
    const now = Date.now();
    let next = Infinity;
    for (const [key, value] of await this.ctx.storage.list<{
      expires?: number;
    }>()) {
      if (value.expires && value.expires < now)
        await this.ctx.storage.delete(key);
      else if (value.expires) next = Math.min(next, value.expires);
    }
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Auth;
      const expiry = a.ok ? a.expires : a.deadline;
      if (expiry < now) ws.close(1008, "Connection expired");
      else next = Math.min(next, expiry);
    }
    if (Number.isFinite(next))
      await this.ctx.storage.setAlarm(Math.max(now + 1000, next));
  }
}
