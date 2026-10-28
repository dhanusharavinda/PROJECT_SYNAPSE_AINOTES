import { createRemoteJWKSet, jwtVerify } from "jose";
type Namespace = {
  idFromName: (name: string) => any;
  get: (id: any) => {
    fetch: (request: Request | string, init?: RequestInit) => Promise<Response>;
  };
};
type AccountState = {
  storage: {
    get: <T>(key: string) => Promise<T | undefined>;
    put: <T>(key: string, value: T) => Promise<void>;
    delete: (key: string) => Promise<boolean>;
    list: <T>(options?: { prefix?: string }) => Promise<Map<string, T>>;
    setAlarm: (time: number) => Promise<void>;
  };
};
export interface AccountEnv {
  ACCOUNTS: Namespace;
  ROOMS: Namespace;
  GOOGLE_CLIENT_ID?: string;
}
const keys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);
const sha = async (s: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
const uuid = (s: any) => typeof s === "string" && /^[a-f0-9-]{36}$/.test(s);
const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
type Identity = {
  sub: string;
  email: string;
  name: string;
  nonce: string;
  expires: number;
};
type Page = {
  id: string;
  room: string;
  title: string;
  hostPublic: string;
  ownerSub: string;
  ownerEmail: string;
  members: { email: string; role: "viewer" | "editor" }[];
};
export class AccountHub {
  constructor(
    private ctx: AccountState,
    private env: AccountEnv,
  ) {}
  async identity(req: Request) {
    const token =
      req.headers.get("Authorization")?.replace(/^Bearer /, "") || "";
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    const value = await this.ctx.storage.get<Identity>(
      "session:" + (await sha(token)),
    );
    return value && value.expires > Date.now() ? value : null;
  }
  async fetch(req: Request): Promise<Response> {
    try {
      const action = new URL(req.url).pathname.split("/").pop();
      if (action === "config")
        return json({
          configured: !!this.env.GOOGLE_CLIENT_ID,
          clientId: this.env.GOOGLE_CLIENT_ID || "",
        });
      if (!this.env.GOOGLE_CLIENT_ID)
        return json(
          { error: "Google sign-in needs its client ID configured first." },
          503,
        );
      if (action === "login" && req.method === "POST") {
        const ip = await sha(req.headers.get("CF-Connecting-IP") || "local"),
          bucket = "rate:" + ip + ":" + Math.floor(Date.now() / 3600000);
        const n = (await this.ctx.storage.get<number>(bucket)) || 0;
        if (n >= 30)
          return json(
            { error: "Too many sign-in attempts. Try again later." },
            429,
          );
        await this.ctx.storage.put(bucket, n + 1);
        const b = (await req.json()) as any;
        if (typeof b.credential !== "string" || b.credential.length > 16000)
          return json({ error: "Invalid sign-in response." }, 400);
        const { payload: p } = await jwtVerify(b.credential, keys, {
          algorithms: ["RS256"],
          audience: this.env.GOOGLE_CLIENT_ID,
          issuer: ["accounts.google.com", "https://accounts.google.com"],
          requiredClaims: ["exp", "sub", "iat"],
        });
        if (
          p.email_verified !== true ||
          typeof p.email !== "string" ||
          p.email.length > 254 ||
          (!p.email.toLowerCase().endsWith("@gmail.com") && !p.hd)
        )
          return json(
            {
              error:
                "Use a Gmail or Google Workspace account with a verified email.",
            },
            401,
          );
        if (typeof p.nonce !== "string" || !/^[a-f0-9]{64}$/.test(p.nonce))
          return json({ error: "Start sign-in again from Synapse." }, 401);
        const token = Array.from(
          crypto.getRandomValues(new Uint8Array(32)),
          (x) => x.toString(16).padStart(2, "0"),
        ).join("");
        const identity: Identity = {
          sub: p.sub!,
          email: p.email.toLowerCase(),
          name:
            typeof p.name === "string"
              ? p.name.slice(0, 80)
              : p.email.split("@")[0],
          nonce: p.nonce,
          expires: Date.now() + 30 * 86400000,
        };
        await this.ctx.storage.put("session:" + (await sha(token)), identity);
        await this.ctx.storage.setAlarm(Date.now() + 86400000);
        return json({ token, identity });
      }
      const me = await this.identity(req);
      if (!me)
        return json({ error: "Sign in to your Synapse account again." }, 401);
      if (action === "me") return json(me);
      if (action === "logout" && req.method === "POST") {
        await this.ctx.storage.delete(
          "session:" + (await sha(req.headers.get("Authorization")!.slice(7))),
        );
        return json({ ok: true });
      }
      const all = [
        ...(await this.ctx.storage.list<Page>({ prefix: "page:" })).values(),
      ];
      const visible = (p: Page) =>
        p.ownerSub === me.sub || p.members.some((m) => m.email === me.email);
      if (action === "pages" && req.method === "GET")
        return json(
          all.filter(visible).map((p) => ({
            ...p,
            members: p.ownerSub === me.sub ? p.members : [],
            role:
              p.ownerSub === me.sub
                ? "owner"
                : p.members.find((m) => m.email === me.email)!.role,
          })),
        );
      if (action === "publish" && req.method === "POST") {
        const b = (await req.json()) as any;
        if (
          !uuid(b.id) ||
          !uuid(b.room) ||
          typeof b.title !== "string" ||
          b.title.length > 160 ||
          typeof b.hostPublic !== "string" ||
          b.hostPublic.length > 200 ||
          !Array.isArray(b.members) ||
          b.members.length > 50 ||
          b.members.some(
            (m: any) =>
              typeof m.email !== "string" ||
              m.email.length > 254 ||
              !["viewer", "editor"].includes(m.role),
          )
        )
          return json({ error: "Invalid page invitation." }, 400);
        const existing = all.find((p) => p.room === b.room && p.id === b.id);
        if (existing && existing.ownerSub !== me.sub)
          return json({ error: "Only the owner can change invitations." }, 403);
        const check = await this.env.ROOMS.get(
          this.env.ROOMS.idFromName(b.room),
        ).fetch("https://internal/status", {
          headers: { Authorization: "Bearer " + b.hostToken },
        });
        if (!check.ok)
          return json({ error: "PC ownership could not be verified." }, 403);
        const page: Page = {
          id: b.id,
          room: b.room,
          title: b.title,
          hostPublic: b.hostPublic,
          ownerSub: me.sub,
          ownerEmail: me.email,
          members: b.members.map((m: any) => ({
            email: m.email.trim().toLowerCase(),
            role: m.role,
          })),
        };
        await this.ctx.storage.put("page:" + b.room + ":" + b.id, page);
        return json({ ok: true });
      }
      if (action === "unpublish" && req.method === "POST") {
        const b = (await req.json()) as any,
          existing = all.find((p) => p.id === b.id && p.room === b.room);
        if (!existing) return json({ ok: true });
        if (existing.ownerSub !== me.sub)
          return json(
            { error: "Only the owner can remove this invitation." },
            403,
          );
        await this.ctx.storage.delete(
          "page:" + existing.room + ":" + existing.id,
        );
        return json({ ok: true });
      }
      if (action === "join" && req.method === "POST") {
        const b = (await req.json()) as any,
          page = all.find(
            (p) => p.room === b.room && p.id === b.id && visible(p),
          );
        if (!page)
          return json(
            { error: "This page is not shared with your account." },
            403,
          );
        if (
          !uuid(b.client) ||
          typeof b.hash !== "string" ||
          !/^[a-f0-9]{64}$/.test(b.hash)
        )
          return json({ error: "Invalid connection." }, 400);
        return this.env.ROOMS.get(this.env.ROOMS.idFromName(page.room)).fetch(
          "https://internal/collaborator",
          {
            method: "POST",
            body: JSON.stringify({
              id: b.client,
              hash: b.hash,
              expires: me.expires,
            }),
          },
        );
      }
      return json({ error: "Unknown account operation." }, 404);
    } catch {
      return json({ error: "Account request could not be verified." }, 401);
    }
  }
  async alarm() {
    for (const [key, value] of await this.ctx.storage.list<any>()) {
      if (
        (key.startsWith("session:") && value.expires < Date.now()) ||
        key.startsWith("rate:")
      )
        await this.ctx.storage.delete(key);
    }
    await this.ctx.storage.setAlarm(Date.now() + 86400000);
  }
}
