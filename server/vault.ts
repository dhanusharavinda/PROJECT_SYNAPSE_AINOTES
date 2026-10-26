import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import matter from "gray-matter";
import { z } from "zod";
import type { Note, State, Layer } from "../src/types.js";

export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const uid = () => crypto.randomUUID();
export const linkSchema = z.object({
  target: z.string().uuid(),
  relation: z.enum(["related", "prerequisite", "used-in", "contrasts"]),
  reason: z.string().max(1000).default(""),
});
export const layersSchema = z.object({
  intuition: z.string().max(200000),
  technical: z.string().max(200000),
  implementation: z.string().max(200000),
});
export const noteSchema = z.object({
  title: z.string().trim().min(1).max(160),
  context: z.string().max(160),
  group: z
    .string()
    .trim()
    .max(120)
    .transform((s) => s || "Unsorted"),
  layers: layersSchema,
  links: z.array(linkSchema).max(500),
  sources: z.array(z.string().uuid()).max(500),
  drawings: z.array(z.string().uuid()).max(100),
  status: z.enum(["collected", "explained", "practiced"]),
  archived: z.boolean().optional(),
  reviewEnabled: z.boolean().default(true),
});
export async function atomic(file: string, data: string | Buffer) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = file + "." + uid() + ".tmp";
  await fs.writeFile(temp, data);
  try {
    await fs.rename(temp, file);
  } catch (e) {
    await fs.rm(temp, { force: true });
    throw e;
  }
}
export const safeId = (id: string) => {
  if (!z.string().uuid().safeParse(id).success)
    throw new AppError(400, "Invalid item identifier.");
  return id;
};
export function encodeNote(n: Note) {
  const { layers, etag, ...meta } = n;
  return matter.stringify(
    `\n<!-- synapse:layer:intuition -->\n## Intuition\n\n${layers.intuition}\n\n<!-- synapse:layer:technical -->\n## Technical\n\n${layers.technical}\n\n<!-- synapse:layer:implementation -->\n## Implementation\n\n${layers.implementation}\n`,
    meta,
  );
}
export function decodeNote(raw: string): Note {
  const { data, content } = matter(raw);
  const parsed = noteSchema.parse({
    ...data,
    layers: { intuition: "", technical: "", implementation: "" },
  });
  const layers = { intuition: "", technical: "", implementation: "" };
  const marked = content.includes("<!-- synapse:layer:intuition -->");
  const matches = [
    ...content.matchAll(
      marked
        ? /^<!-- synapse:layer:(intuition|technical|implementation) -->\s*$/gm
        : /^## (Intuition|Technical|Implementation)\s*$/gm,
    ),
  ];
  for (let i = 0; i < matches.length; i++) {
    const key = matches[i][1].toLowerCase() as Layer;
    let section = content
      .slice(
        matches[i].index! + matches[i][0].length,
        matches[i + 1]?.index ?? content.length,
      )
      .trim();
    if (marked)
      section = section
        .replace(/^## (Intuition|Technical|Implementation)\s*\n?/, "")
        .trim();
    layers[key] = section;
  }
  if (!matches.length) layers.intuition = content.trim();
  return {
    ...parsed,
    id: safeId(data.id),
    revision: z.number().int().min(1).parse(data.revision),
    updated: z.string().parse(data.updated),
    layers,
    etag: crypto.createHash("sha256").update(raw).digest("hex"),
  };
}
export class Vault {
  tail: Promise<unknown> = Promise.resolve();
  constructor(public root: string) {}
  async init() {
    for (const dir of [
      "notes",
      "attachments",
      "drawings",
      "maps",
      "audio",
      "study",
      ".synapse/history",
      ".synapse/outbox",
    ])
      await fs.mkdir(path.join(this.root, dir), { recursive: true });
    try {
      await fs.access(this.file(".synapse/state.json"));
    } catch {
      await atomic(
        this.file(".synapse/state.json"),
        JSON.stringify({
          sources: [],
          proposals: [],
          reviews: [],
          episodes: [],
          shares: [],
          comments: [],
          positions: {},
        }),
      );
    }
  }
  file(relative: string) {
    const p = path.resolve(this.root, relative);
    if (!p.startsWith(path.resolve(this.root) + path.sep))
      throw new AppError(400, "Path is outside the notebook.");
    return p;
  }
  async serial<T>(fn: () => Promise<T>): Promise<T> {
    const job = this.tail.then(fn, fn);
    this.tail = job.catch(() => {});
    return job;
  }
  async state(): Promise<State> {
    return JSON.parse(
      await fs.readFile(this.file(".synapse/state.json"), "utf8"),
    );
  }
  async mutate<T>(fn: (s: State) => T | Promise<T>): Promise<T> {
    return this.serial(async () => {
      const s = await this.state();
      const result = await fn(s);
      await atomic(
        this.file(".synapse/state.json"),
        JSON.stringify(s, null, 2),
      );
      return result;
    });
  }
  async notes(includeArchived = false) {
    const files = await fs.readdir(this.file("notes"));
    const result: Note[] = [];
    for (const f of files.filter((x) => x.endsWith(".md"))) {
      try {
        const n = decodeNote(
          await fs.readFile(this.file("notes/" + f), "utf8"),
        );
        if (includeArchived || !n.archived) result.push(n);
      } catch {
        throw new AppError(
          422,
          `Cannot parse notes/${f}. Restore it from history or fix the Markdown metadata.`,
        );
      }
    }
    return result.sort((a, b) => b.updated.localeCompare(a.updated));
  }
  async note(id: string) {
    safeId(id);
    const n = (await this.notes(true)).find((x) => x.id === id);
    if (!n) throw new AppError(404, "Note not found.");
    return n;
  }
  async write(n: Note, expected?: number) {
    return this.serial(() => this.writeUnlocked(n, expected));
  }
  async writeUnlocked(n: Note, expected?: number) {
    safeId(n.id);
    noteSchema.parse(n);
    const all = await this.notes(true);
    const old = all.find((x) => x.id === n.id);
    if (old && (expected !== old.revision || (n.etag && old.etag !== n.etag)))
      throw new AppError(
        409,
        "This note changed elsewhere. Your draft is preserved. Reload the latest version before saving.",
      );
    if (old) {
      const original = await fs.readFile(
        this.file("notes/" + n.id + ".md"),
        "utf8",
      );
      const digest = crypto
        .createHash("sha256")
        .update(original)
        .digest("hex")
        .slice(0, 12);
      await atomic(
        this.file(`.synapse/history/${n.id}/${old.revision}-${digest}.md`),
        original,
      );
    }
    for (const link of n.links) {
      if (link.target === n.id || !all.some((x) => x.id === link.target))
        throw new AppError(400, "Links must point to another existing note.");
    }
    const saved = {
      ...n,
      revision: (old?.revision ?? 0) + 1,
      updated: new Date().toISOString(),
    };
    const encoded = encodeNote(saved);
    await atomic(this.file("notes/" + n.id + ".md"), encoded);
    return {
      ...saved,
      etag: crypto.createHash("sha256").update(encoded).digest("hex"),
    };
  }
}
export function nextDue(
  rating: string,
  previousCount: number,
  now = new Date(),
) {
  const days =
    rating === "again"
      ? 0
      : rating === "hard"
        ? 1
        : rating === "good"
          ? Math.min(60, 3 * 2 ** previousCount)
          : Math.min(120, 7 * 2 ** previousCount);
  return new Date(
    now.getTime() + (days ? days * 86400000 : 10 * 60000),
  ).toISOString();
}
