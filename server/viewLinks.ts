import fs from "node:fs/promises";
import crypto from "node:crypto";
import type { Note } from "../src/types.js";
import { noteUsesResource } from "../src/resourceRefs.js";
import { AppError, type Vault } from "./vault.js";
export async function snapshot(vault: Vault, note: Note) {
  const files: Record<string, { type: string; data: string }> = {};
  const refs = new Set<string>();
  const text = JSON.stringify(note);
  for (const m of text.matchAll(
    /(?:\.\.\/|\/files\/)(attachments|drawings)\/([-a-zA-Z0-9]+\.[a-zA-Z0-9]+)/g,
  ))
    refs.add(m[1] + "/" + m[2]);
  for (const id of note.drawings) refs.add("drawings/" + id + ".svg");
  for (const item of note.canvas?.items || [])
    if (item.drawingId) refs.add("drawings/" + item.drawingId + ".svg");
  const sources = (await vault.state()).sources.filter((s) =>
    noteUsesResource(note, s),
  );
  for (const s of sources)
    if (s.file && /^[-a-zA-Z0-9]+\.[a-zA-Z0-9]+$/.test(s.file))
      refs.add("attachments/" + s.file);
  let bytes = 0;
  const types: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    svg: "image/svg+xml",
    pdf: "application/pdf",
    txt: "text/plain",
    md: "text/plain",
  };
  for (const ref of refs) {
    const type = types[ref.split(".").at(-1)!.toLowerCase()];
    if (!type)
      throw new AppError(
        400,
        "View links support images, PDFs and text. Remove other attached files from this page first.",
      );
    const stat = await fs.stat(vault.file(ref));
    bytes += stat.size;
    if (bytes > 2000000)
      throw new AppError(
        400,
        "This page has over 2 MB of attachments. Export slides or share with collaborators instead.",
      );
    files["/files/" + ref] = {
      type,
      data: (await fs.readFile(vault.file(ref))).toString("base64"),
    };
  }
  const publicNote = {
    ...note,
    links: [],
    fileName: undefined,
    etag: undefined,
  };
  const payload = Buffer.from(
    JSON.stringify({
      note: publicNote,
      files,
      sources: sources.map((s) => ({
        title: s.title,
        url: s.url,
        file: s.file,
      })),
    }),
  );
  if (payload.length > 2900000)
    throw new AppError(
      400,
      "This page is too large for a view link. Export slides instead.",
    );
  const key = crypto.randomBytes(32),
    iv = crypto.randomBytes(12),
    cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([
    cipher.update(payload),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString("base64url");
  return { data, iv: iv.toString("base64url"), key: key.toString("base64url") };
}
