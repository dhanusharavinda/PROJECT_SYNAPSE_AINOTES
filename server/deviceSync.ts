import crypto from "node:crypto";
import fs from "node:fs/promises";
import express, { Router } from "express";
import type { Server } from "node:http";
import { z } from "zod";
import { Vault, AppError, atomic, noteSchema, uid } from "./vault.js";
export class DeviceSync {
  records: {
    id: string;
    hash: string;
    origin: string;
    name: string;
    relayPublicKey?: string;
  }[] = [];
  codes = new Map<
    string,
    { origin: string; expires: number; attempts: number }
  >();
  identity = "";
  gateway?: Server;
  gatewayPort?: number;
  constructor(private vault: Vault) {}
  async load() {
    try {
      this.records = JSON.parse(
        await fs.readFile(this.vault.file(".synapse/devices.json"), "utf8"),
      );
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
    }
    try {
      this.identity = await fs.readFile(
        this.vault.file(".synapse/device-identity"),
        "utf8",
      );
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
      this.identity = uid();
      await atomic(this.vault.file(".synapse/device-identity"), this.identity);
    }
  }
  hash(s: string) {
    return crypto.createHash("sha256").update(s).digest("hex");
  }
  async save() {
    await atomic(
      this.vault.file(".synapse/devices.json"),
      JSON.stringify(this.records),
    );
  }
  async openGateway() {
    if (this.gateway) return { port: this.gatewayPort };
    let port = 0;
    try {
      port = JSON.parse(
        await fs.readFile(
          this.vault.file(".synapse/device-gateway.json"),
          "utf8",
        ),
      ).port;
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
    }
    const app = express();
    app.disable("x-powered-by");
    app.use((req, res, next) => {
      const origin = req.get("origin");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "no-referrer");
      if (origin) {
        if (!this.allows(origin))
          return res.status(403).json({
            error:
              "Generate a pairing code for this website in Windows Settings.",
          });
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
        if (req.method === "OPTIONS") {
          res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
          res.setHeader(
            "Access-Control-Allow-Headers",
            "Authorization, Content-Type",
          );
          res.setHeader("Access-Control-Allow-Private-Network", "true");
          return res.sendStatus(204);
        }
      }
      next();
    });
    app.use(express.json({ limit: "8mb" }));
    app.use("/api/device", this.router());
    app.use((_req, res) =>
      res.status(404).json({ error: "Only device sync is available here." }),
    );
    app.use(((e: any, _req: any, res: any, _next: any) =>
      res
        .status(
          e instanceof AppError
            ? e.status
            : e instanceof z.ZodError
              ? 400
              : e.code === "ENOENT"
                ? 404
                : 500,
        )
        .json({
          error:
            e instanceof AppError
              ? e.message
              : e instanceof z.ZodError
                ? "Invalid device request."
                : e.code === "ENOENT"
                  ? "Attachment is missing."
                  : "Device sync could not finish. Retry without clearing your local data.",
        })) as express.ErrorRequestHandler);
    const listen = (chosen: number) =>
      new Promise<Server>((resolve, reject) => {
        const server = app.listen(chosen, "127.0.0.1", () => resolve(server));
        server.once("error", reject);
      });
    try {
      this.gateway = await listen(
        Number.isInteger(port) && port > 1024 && port < 65536 ? port : 0,
      );
    } catch (e: any) {
      if (e.code !== "EADDRINUSE") throw e;
      this.gateway = await listen(0);
    }
    this.gatewayPort = (this.gateway.address() as any).port;
    await atomic(
      this.vault.file(".synapse/device-gateway.json"),
      JSON.stringify({ port: this.gatewayPort }),
    );
    return { port: this.gatewayPort };
  }
  closeGateway() {
    this.gateway?.close();
    this.gateway = undefined;
    this.gatewayPort = undefined;
  }
  allows(origin: string) {
    return (
      this.records.some((r) => r.origin === origin) ||
      [...this.codes.values()].some(
        (c) => c.origin === origin && c.expires > Date.now(),
      )
    );
  }
  start(origin: string) {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new AppError(
        400,
        "Enter the tablet website origin, such as https://your-site.example.",
      );
    }
    if (
      url.origin !== origin ||
      !(
        url.protocol === "https:" ||
        ["localhost", "127.0.0.1"].includes(url.hostname)
      )
    )
      throw new AppError(400, "Use the exact HTTPS tablet app origin.");
    for (const [key, c] of this.codes)
      if (c.expires < Date.now() || c.origin === origin) this.codes.delete(key);
    const code = crypto.randomBytes(12).toString("hex");
    this.codes.set(this.hash(code), {
      origin,
      expires: Date.now() + 300000,
      attempts: 0,
    });
    return { code, expires: new Date(Date.now() + 300000).toISOString() };
  }
  valid(req: any) {
    const token = req.get("authorization")?.replace(/^Bearer /, "");
    return (
      !!token &&
      this.records.some(
        (r) =>
          (!req.get("origin") || r.origin === req.get("origin")) &&
          r.hash === this.hash(token),
      )
    );
  }
  router() {
    const router = Router();
    router.post("/connect", async (req, res) => {
      const input = z
        .object({
          code: z.string().max(100),
          name: z.string().max(80),
          identity: z.string().optional(),
        })
        .parse(req.body);
      const hash = this.hash(input.code);
      const c = this.codes.get(hash);
      if (!c || c.origin !== req.get("origin") || c.expires < Date.now())
        throw new AppError(
          403,
          "Pairing expired. Generate a new code on the PC.",
        );
      if (input.identity && input.identity !== this.identity)
        throw new AppError(
          409,
          "This is a different PC notebook. Use a separate browser profile to keep notebooks separate.",
        );
      this.codes.delete(hash);
      const token = crypto.randomBytes(32).toString("hex");
      const record = {
        id: uid(),
        hash: this.hash(token),
        origin: c.origin,
        name: input.name,
      };
      this.records.push(record);
      await this.save();
      res.json({ token, id: record.id, identity: this.identity });
    });
    router.use((req, _res, next) => {
      if (!this.valid(req))
        throw new AppError(401, "Pair this device with the PC again.");
      next();
    });
    router.get("/notes", async (req, res) => {
      const notes = await this.vault.notes();
      const revision = this.hash(
        notes
          .map((n) => n.id + ":" + n.etag)
          .sort()
          .join("|"),
      );
      res.json(
        req.query.since === revision
          ? { unchanged: true, revision }
          : { notes, revision },
      );
    });
    router.get("/file", async (req, res) => {
      const folder = z
          .enum(["attachments", "drawings"])
          .parse(req.query.folder),
        name = z
          .string()
          .regex(/^[a-f0-9-]{36}\.(png|jpe?g|webp|svg|pdf|json)$/i)
          .parse(req.query.name);
      res.sendFile(this.vault.file(folder + "/" + name));
    });
    router.post("/file", async (req, res) => {
      const input = z
        .object({
          name: z.string().regex(/^[a-f0-9-]{36}\.(png|jpg|webp|pdf)$/i),
          data: z
            .string()
            .max(7100000)
            .regex(/^[A-Za-z0-9+/]*={0,2}$/),
        })
        .parse(req.body);
      const bytes = Buffer.from(input.data, "base64"),
        ext = input.name.split(".").pop()!.toLowerCase();
      if (bytes.length > 5 * 1024 * 1024 || !bytes.length)
        throw new AppError(413, "Choose an attachment smaller than 5 MB.");
      const valid =
        ext === "png"
          ? bytes
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : ext === "jpg"
            ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
            : ext === "webp"
              ? bytes.toString("ascii", 0, 4) === "RIFF" &&
                bytes.toString("ascii", 8, 12) === "WEBP"
              : bytes.toString("ascii", 0, 5) === "%PDF-";
      if (!valid)
        throw new AppError(
          400,
          "The file content does not match its image or PDF type.",
        );
      await this.vault.serial(async () => {
        const file = this.vault.file("attachments/" + input.name);
        let existing: Buffer | undefined;
        try {
          existing = await fs.readFile(file);
        } catch (e: any) {
          if (e.code !== "ENOENT") throw e;
        }
        if (existing && !existing.equals(bytes))
          throw new AppError(
            409,
            "This attachment already exists with different content.",
          );
        if (!existing) await atomic(file, bytes);
      });
      res.json({ ok: true });
    });
    router.post("/note", async (req, res) => {
      const input = z
        .object({
          note: noteSchema.extend({
            id: z.string().uuid(),
            revision: z.number(),
            updated: z.string(),
            etag: z.string().optional(),
          }),
          base: z.string().nullable(),
          operation: z.string().uuid(),
        })
        .parse(req.body);
      res.json(
        await this.vault.serial(async () => {
          const all = await this.vault.notes(true),
            old = all.find((n) => n.id === input.note.id);
          const receiptsFile = this.vault.file(".synapse/device-receipts.json");
          let receipts: Record<string, any> = {};
          try {
            receipts = JSON.parse(await fs.readFile(receiptsFile, "utf8"));
          } catch (e: any) {
            if (e.code !== "ENOENT") throw e;
          }
          const key =
            this.hash(req.get("authorization") || "") + ":" + input.operation;
          if (receipts[key]) {
            const existing = all.find((n) => n.id === receipts[key].id);
            if (existing)
              return { note: existing, conflict: receipts[key].conflict };
          }
          let conflict = !!old ? old.etag !== input.base : input.base !== null;
          let draft = { ...input.note };
          if (conflict) {
            delete draft.fileName;
            draft = {
              ...draft,
              id: receipts[key]?.id || uid(),
              title: draft.title.slice(0, 125) + " (device conflict copy)",
              parentId: null,
            };
          }
          receipts[key] = { id: draft.id, conflict };
          await atomic(
            receiptsFile,
            JSON.stringify(
              Object.fromEntries(Object.entries(receipts).slice(-2000)),
            ),
          );
          const note = await this.vault.writeUnlocked(
            draft,
            conflict || !old ? undefined : old.revision,
          );
          const result = { note, conflict };
          const entries = Object.entries(receipts).slice(-2000);
          await atomic(
            receiptsFile,
            JSON.stringify(Object.fromEntries(entries)),
          );
          return result;
        }),
      );
    });
    return router;
  }
}
