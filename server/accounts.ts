import fs from "node:fs/promises";
import crypto from "node:crypto";
import { Router } from "express";
import WebSocket from "ws";
import { z } from "zod";
import { AppError, atomic, uid, type Vault } from "./vault.js";
import { Collaboration, type Principal } from "./collaboration.js";
import type { RelayHost } from "./relayHost.js";
import { RelayClient } from "../src/relayClient.js";
import {
  identityKeys,
  publicNotebookOrigin,
  discoverRelay,
  type RelayReply,
} from "../src/relayProtocol.js";
type Identity = {
  sub: string;
  email: string;
  name: string;
  nonce: string;
  expires: number;
};
type Session = { token: string; identity: Identity };
export class Accounts {
  session?: Session;
  pending = new Map<string, { nonce: string; expires: number }>();
  peers = new Map<
    string,
    {
      client: RelayClient;
      page: any;
      expires: number;
      renewing?: Promise<void>;
    }
  >();
  sweeping = false;
  lastSweep = 0;
  indexTimer?: ReturnType<typeof setInterval>;
  cache = new Map<string, { identity: Identity; until: number }>();
  constructor(
    private vault: Vault,
    public collaboration: Collaboration,
    private relay: RelayHost,
  ) {}
  async load() {
    try {
      this.session = JSON.parse(
        await fs.readFile(this.vault.file(".synapse/account.json"), "utf8"),
      );
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  async endpoint() {
    return (
      this.relay.config?.url || process.env.SYNAPSE_RELAY_URL || discoverRelay()
    );
  }
  async remote(path: string, body?: unknown, token = this.session?.token) {
    const response = await fetch(
      (await this.endpoint()) + "/accounts/" + path,
      {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      },
    );
    const result = await response.json();
    if (!response.ok)
      throw new AppError(
        response.status,
        result.error || "Account service unavailable.",
      );
    return result;
  }
  async identity(token = this.session?.token): Promise<Identity> {
    if (!token)
      throw new AppError(401, "Sign in before inviting collaborators.");
    const key = crypto.createHash("sha256").update(token).digest("hex"),
      cached = this.cache.get(key);
    if (cached && cached.until > Date.now()) return cached.identity;
    const identity = await this.remote("me", undefined, token);
    if (this.cache.size > 200) this.cache.clear();
    this.cache.set(key, {
      identity,
      until: Math.min(identity.expires, Date.now() + 30000),
    });
    return identity;
  }
  async principal(
    client: string,
    token?: string,
    localOwner = false,
  ): Promise<Principal> {
    const me =
      localOwner && this.session
        ? this.session.identity
        : await this.identity(token);
    return { session: client, email: me.email, name: me.name, localOwner };
  }
  async publish(id: string) {
    const n = await this.vault.note(id),
      membership = this.collaboration.roster[id];
    if (!membership)
      throw new AppError(404, "This page has no collaborators yet.");
    await this.relay.configure();
    await this.relay.start();
    const c = this.relay.config!;
    await this.remote("publish", {
      id,
      room: c.room,
      title: n.title,
      hostPublic: c.publicKey,
      hostToken: c.hostToken,
      members: membership.members,
    });
  }
  async peer(key: string) {
    const peer = this.peers.get(key);
    if (!peer) throw new AppError(404, "Reopen this shared page.");
    if (
      peer.expires < Date.now() + 60000 &&
      !peer.renewing &&
      peer.client.pending.size === 0 &&
      !peer.client.opening
    ) {
      const access = peer.client.access;
      peer.renewing = (async () => {
        const r = await this.remote("join", {
          id: peer.page.id,
          room: peer.page.room,
          client: access.client,
          hash: crypto
            .createHash("sha256")
            .update(access.relayToken)
            .digest("hex"),
        });
        peer.client.close();
        peer.client = new RelayClient(
          access,
          (url) =>
            new WebSocket(url, {
              headers: { Origin: publicNotebookOrigin },
            }) as any,
        );
        peer.expires = r.expires || Date.now() + 23 * 3600000;
      })().finally(() => {
        peer.renewing = undefined;
      });
    }
    await peer.renewing;
    return peer;
  }
  async sweepIndex(force = false) {
    if (
      this.sweeping ||
      !this.session ||
      this.session.identity.expires < Date.now() ||
      !this.relay.config ||
      (!force && Date.now() - this.lastSweep < 30000)
    )
      return;
    this.sweeping = true;
    this.lastSweep = Date.now();
    try {
      const c = this.relay.config,
        pages = await this.remote("pages"),
        notes = await this.vault.notes();
      for (const page of pages.filter(
        (p: any) =>
          p.room === c.room && p.ownerSub === this.session!.identity.sub,
      ))
        if (!notes.some((n) => n.id === page.id))
          await this.remote("unpublish", { id: page.id, room: c.room });
      for (const id of Object.keys(this.collaboration.roster)) {
        const n = notes.find((n) => n.id === id);
        if (!n) continue;
        const published = pages.find(
            (p: any) => p.room === c.room && p.id === id,
          ),
          membership = this.collaboration.roster[id];
        if (
          !published ||
          published.title !== n.title ||
          JSON.stringify(published.members) !==
            JSON.stringify(membership.members)
        )
          await this.publish(id);
      }
    } finally {
      this.sweeping = false;
    }
  }
  start() {
    this.indexTimer = setInterval(
      () => void this.sweepIndex().catch(() => {}),
      60000,
    );
    this.indexTimer.unref?.();
  }
  async complete(state: string, token: string) {
    const attempt = this.pending.get(state);
    if (!attempt || attempt.expires < Date.now())
      throw new AppError(401, "Sign-in expired. Start again in Synapse.");
    const identity = await this.identity(token);
    if (identity.nonce !== attempt.nonce)
      throw new AppError(401, "Sign-in did not match this app. Try again.");
    this.pending.delete(state);
    this.session = { token, identity };
    await atomic(
      this.vault.file(".synapse/account.json"),
      JSON.stringify(this.session),
    );
  }
  async dispatch(
    client: string,
    input: any,
    localOwner = false,
  ): Promise<RelayReply> {
    try {
      const body = input.body || {},
        id = z.string().uuid().parse(body.id);
      const principal = localOwner
        ? {
            session: "owner",
            email: this.collaboration.roster[id]?.owner || "",
            name: this.session?.identity.name || "You",
            localOwner: true,
          }
        : await this.principal(client, input.token);
      const action = input.path.slice(7),
        c = this.collaboration;
      c.role(id, principal);
      if ((await this.vault.note(id)).archived && !localOwner)
        throw new AppError(404, "This page has been archived by its owner.");
      if (action === "snapshot")
        return { status: 200, data: await c.snapshot(id, principal) };
      if (action === "acquire")
        return {
          status: 200,
          data: await c.acquire(
            id,
            principal,
            z.string().max(100).parse(body.cell),
            body.selection,
          ),
        };
      if (action === "change")
        return {
          status: 200,
          data: await c.change(
            id,
            principal,
            z
              .array(
                z.object({
                  cell: z.string().max(100),
                  base: z.string().regex(/^[a-f0-9]{64}$/),
                  value: z.unknown(),
                }),
              )
              .max(200)
              .parse(body.changes),
          ),
        };
      if (action === "release") {
        c.release(id, principal, body.cell);
        return { status: 200, data: { ok: true } };
      }
      if (action === "upload") {
        const access = c.role(id, principal);
        if (access === "viewer")
          throw new AppError(403, "Viewer access does not allow uploads.");
        const name = z.string().max(250).parse(body.name),
          ext = name.split(".").pop()?.toLowerCase();
        if (
          !ext ||
          !["png", "jpg", "jpeg", "webp", "pdf", "txt", "md"].includes(ext)
        )
          throw new AppError(
            415,
            "Choose a PNG, JPEG, WebP, PDF or text file.",
          );
        const data = z
            .string()
            .max(7 * 1024 * 1024)
            .parse(body.data),
          bytes = Buffer.from(data, "base64");
        if (bytes.length > 5 * 1024 * 1024)
          throw new AppError(413, "Shared uploads are limited to 5 MB.");
        const source = {
          id: uid(),
          title: name,
          file: uid() + "." + ext,
          kind: ["png", "jpg", "jpeg", "webp"].includes(ext)
            ? "image"
            : ext === "pdf"
              ? "pdf"
              : "text",
          text: "",
          coverage: "Uploaded to this shared page.",
          created: new Date().toISOString(),
        };
        await atomic(this.vault.file("attachments/" + source.file), bytes);
        await this.vault.mutate((state) => state.sources.unshift(source));
        await this.vault.serial(async () => {
          if (c.role(id, principal) === "viewer")
            throw new AppError(403, "Upload permission changed.");
          const n = await this.vault.note(id);
          await this.vault.writeUnlocked(
            { ...n, sources: [...n.sources, source.id] },
            n.revision,
          );
        });
        return { status: 200, data: source };
      }
      if (action === "file") {
        c.role(id, principal);
        const folder = z.enum(["attachments", "drawings"]).parse(body.folder),
          name = z
            .string()
            .regex(/^[a-f0-9-]{36}\.(png|jpe?g|webp|svg|pdf|json|txt|md)$/i)
            .parse(body.name),
          n = await this.vault.note(id);
        const state = await this.vault.state();
        const allowed =
          (c.roster[id]?.files || []).includes(folder + "/" + name) ||
          (folder === "drawings"
            ? n.drawings.includes(name.slice(0, 36))
            : state.sources.some(
                (s) => n.sources.includes(s.id) && s.file === name,
              ));
        if (!allowed)
          throw new AppError(
            403,
            "This file is not attached to the shared page.",
          );
        const data = await fs.readFile(this.vault.file(folder + "/" + name));
        if (data.length > 20 * 1024 * 1024)
          throw new AppError(413, "Shared files are limited to 20 MB.");
        const ext = name.split(".").pop()!,
          types: Record<string, string> = {
            png: "image/png",
            jpg: "image/jpeg",
            jpeg: "image/jpeg",
            webp: "image/webp",
            svg: "image/svg+xml",
            pdf: "application/pdf",
            json: "application/json",
            txt: "text/plain",
            md: "text/plain",
          };
        return {
          status: 200,
          binary: data.toString("base64url"),
          contentType: types[ext] || "application/octet-stream",
        };
      }
      throw new AppError(404, "Unknown collaboration operation.");
    } catch (e: any) {
      return {
        status:
          e instanceof AppError
            ? e.status
            : e instanceof z.ZodError
              ? 400
              : 500,
        data: {
          error:
            e instanceof AppError
              ? e.message
              : "The shared page could not be updated. Your draft is preserved.",
        },
      };
    }
  }
  router() {
    const r = Router();
    r.get("/account", async (_q, s) =>
      s.json({
        identity:
          this.session && this.session.identity.expires > Date.now()
            ? this.session.identity
            : null,
        ...(await this.remote("config")),
      }),
    );
    r.post("/account/start", async (q, s) => {
      const config = await this.remote("config");
      if (!config.configured)
        throw new AppError(
          503,
          "Google sign-in needs a one-time client ID setup. Your local notebook still works.",
        );
      const state = crypto.randomBytes(32).toString("hex"),
        nonce = crypto.randomBytes(32).toString("hex");
      for (const [id, v] of this.pending)
        if (v.expires < Date.now()) this.pending.delete(id);
      this.pending.set(state, { nonce, expires: Date.now() + 300000 });
      const callback = new URL(
        "/api/account/complete",
        q.protocol + "://" + q.get("host"),
      );
      const link = new URL("/signin/", publicNotebookOrigin);
      link.searchParams.set("callback", callback.href);
      link.hash = new URLSearchParams({ state, nonce }).toString();
      s.json({ url: link.href });
    });
    r.post("/account/logout", async (_q, s) => {
      if (this.session) await this.remote("logout", {}).catch(() => {});
      this.session = undefined;
      this.cache.clear();
      for (const p of this.peers.values()) p.client.close();
      this.peers.clear();
      await fs.rm(this.vault.file(".synapse/account.json"), { force: true });
      s.json({ ok: true });
    });
    r.get("/account/pages", async (_q, s) => {
      void this.sweepIndex().catch(() => {});
      s.json(await this.remote("pages"));
    });
    r.post("/account/open", async (q, s) => {
      const list = await this.remote("pages"),
        page = list.find(
          (p: any) => p.id === q.body.id && p.room === q.body.room,
        );
      if (!page)
        throw new AppError(403, "This page is not shared with your account.");
      const existing = [...this.peers.entries()].find(
        ([, p]) => p.page.id === page.id && p.page.room === page.room,
      );
      if (existing && existing[1].expires > Date.now() + 60000)
        return s.json({ connection: existing[0], page });
      if (existing) {
        existing[1].client.close();
        this.peers.delete(existing[0]);
      }
      const keys = await identityKeys(),
        client = uid(),
        relayToken = crypto.randomBytes(32).toString("base64url");
      const joined = await this.remote("join", {
        id: page.id,
        room: page.room,
        client,
        hash: crypto.createHash("sha256").update(relayToken).digest("hex"),
      });
      const access = {
        url: await this.endpoint(),
        room: page.room,
        client,
        relayToken,
        hostPublic: page.hostPublic,
        privateKey: keys.privateKey,
      };
      const peer = new RelayClient(
        access,
        (url) =>
          new WebSocket(url, {
            headers: { Origin: publicNotebookOrigin },
          }) as any,
      );
      const key = uid();
      if (this.peers.size >= 10) {
        const old = this.peers.keys().next().value!;
        this.peers.get(old)!.client.close();
        this.peers.delete(old);
      }
      this.peers.set(key, {
        client: peer,
        page,
        expires: joined.expires || Date.now() + 23 * 3600000,
      });
      s.json({ connection: key, page });
    });
    r.post("/collaboration/remote/:connection/:action", async (q, s) => {
      const peer = await this.peer(q.params.connection);
      if (
        !["snapshot", "acquire", "change", "release", "upload"].includes(
          q.params.action,
        )
      )
        throw new AppError(400, "Unknown operation.");
      const result = await peer.client.request(
        "collab/" + q.params.action,
        { ...q.body, id: peer.page.id },
        this.session?.token,
      );
      s.status(result.status).json(result.data);
    });
    r.get("/collaboration/files/:connection/:folder/:name", async (q, s) => {
      const peer = await this.peer(q.params.connection);
      const result = await peer.client.request(
        "collab/file",
        { id: peer.page.id, folder: q.params.folder, name: q.params.name },
        this.session?.token,
      );
      if (result.status !== 200)
        return s.status(result.status).json(result.data);
      s.setHeader(
        "Content-Type",
        result.contentType || "application/octet-stream",
      );
      s.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
      s.send(Buffer.from(result.binary!, "base64url"));
    });
    r.get("/collaboration/:id/members", async (q, s) =>
      s.json({
        ...(await this.collaboration.snapshot(
          q.params.id,
          await this.principal("owner", undefined, true),
        )),
        enabled: !!this.collaboration.roster[q.params.id],
      }),
    );
    r.post("/collaboration/:id/members", async (q, s) => {
      const me = await this.principal("owner", undefined, true),
        b = z
          .object({
            email: z.string().trim().email().max(254),
            role: z.enum(["viewer", "editor"]),
            remove: z.boolean().optional(),
          })
          .parse(q.body);
      if (b.remove)
        await this.collaboration.revoke(q.params.id, me, b.email.toLowerCase());
      else
        await this.collaboration.invite(
          q.params.id,
          me,
          b.email.toLowerCase(),
          b.role,
        );
      await this.publish(q.params.id);
      s.json({ ok: true });
    });
    r.post("/collaboration/local/:id/:action", async (q, s) => {
      const p: Principal = {
          session: "owner",
          email: this.collaboration.roster[q.params.id]?.owner || "",
          name: this.session?.identity.name || "You",
          localOwner: true,
        },
        b = q.body,
        c = this.collaboration;
      if (q.params.action === "upload") {
        const result = await this.dispatch(
          "owner",
          {
            path: "collab/upload",
            token: this.session?.token,
            body: { ...b, id: q.params.id },
          },
          true,
        );
        return s.status(result.status).json(result.data);
      }
      if (q.params.action === "snapshot")
        return s.json(await c.snapshot(q.params.id, p));
      if (q.params.action === "acquire")
        return s.json(
          await c.acquire(
            q.params.id,
            p,
            z.string().max(100).parse(b.cell),
            b.selection,
          ),
        );
      if (q.params.action === "change")
        return s.json(
          await c.change(
            q.params.id,
            p,
            z
              .array(
                z.object({
                  cell: z.string().max(100),
                  base: z.string().regex(/^[a-f0-9]{64}$/),
                  value: z.unknown(),
                }),
              )
              .max(200)
              .parse(b.changes),
          ),
        );
      if (q.params.action === "release") {
        c.release(q.params.id, p, b.cell);
        return s.json({ ok: true });
      }
      throw new AppError(404, "Unknown operation.");
    });
    return r;
  }
}
