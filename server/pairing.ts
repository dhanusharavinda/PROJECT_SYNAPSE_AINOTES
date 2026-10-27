import crypto from "node:crypto";
import type { Request } from "express";
import { AppError } from "./vault.js";

export class Pairings {
  private challenges = new Map<
    string,
    { hash: string; expires: number; attempts: number }
  >();
  private sessions = new Map<string, { origin: string; expires: number }>();
  start(raw: string) {
    let origin: string;
    try {
      const url = new URL(raw);
      if (
        url.protocol !== "https:" ||
        url.origin !== raw.replace(/\/$/, "") ||
        url.username ||
        url.password
      )
        throw Error();
      origin = url.origin;
    } catch {
      throw new AppError(
        400,
        "Enter the exact HTTPS address of your deployed Synapse site.",
      );
    }
    const code = crypto.randomBytes(8).toString("hex").toUpperCase();
    const expires = Date.now() + 5 * 60 * 1000;
    this.challenges.set(origin, {
      hash: this.hash(code),
      expires,
      attempts: 0,
    });
    return {
      origin,
      code: code.match(/.{4}/g)!.join("-"),
      expires: new Date(expires).toISOString(),
    };
  }
  private hash(value: string) {
    return crypto
      .createHash("sha256")
      .update(value.replace(/[-\s]/g, "").toUpperCase())
      .digest("hex");
  }
  allows(origin: string) {
    return (
      (this.challenges.get(origin)?.expires || 0) > Date.now() ||
      [...this.sessions.values()].some(
        (s) => s.origin === origin && s.expires > Date.now(),
      )
    );
  }
  connect(origin: string, code: string) {
    const challenge = this.challenges.get(origin);
    if (
      !challenge ||
      challenge.expires <= Date.now() ||
      challenge.attempts >= 5
    )
      throw new AppError(
        403,
        "Pairing expired. Generate a new code in local Settings.",
      );
    challenge.attempts++;
    if (
      !crypto.timingSafeEqual(
        Buffer.from(challenge.hash),
        Buffer.from(this.hash(code)),
      )
    )
      throw new AppError(403, "Pairing code did not match.");
    this.challenges.delete(origin);
    const token = crypto.randomBytes(32).toString("hex");
    const expires = Date.now() + 12 * 60 * 60 * 1000;
    this.sessions.set(token, { origin, expires });
    return { token, expires: new Date(expires).toISOString() };
  }
  valid(req: Request, media = false) {
    const token =
      req.get("authorization")?.replace(/^Bearer /, "") ||
      (media && typeof req.query.access === "string" ? req.query.access : "");
    const session = this.sessions.get(token || "");
    if (!session || session.expires <= Date.now()) return false;
    const origin = req.get("origin");
    return media
      ? !origin || origin === session.origin
      : origin === session.origin;
  }
  revoke() {
    this.challenges.clear();
    this.sessions.clear();
  }
}
