import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import matter from "gray-matter";
import { z } from "zod";
import type { Note, State, Layer } from "../src/types.js";
import { inlineTargets } from "../src/content.js";

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
  inline: z.boolean().optional(),
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
  body: z.string().max(600000).optional(),
  noteDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => {
      const date = new Date(value + "T12:00:00Z");
      return (
        Number.isFinite(date.getTime()) &&
        date.toISOString().slice(0, 10) === value
      );
    }, "Choose a valid date.")
    .nullable()
    .optional(),
  canvas: z
    .object({
      height: z.number().finite().min(0).max(100000),
      width: z.number().finite().min(100).max(100000).optional(),
      items: z
        .array(
          z.object({
            id: z.string().uuid(),
            kind: z.enum([
              "text",
              "table",
              "image",
              "drawing",
              "pen",
              "arrow",
              "rectangle",
              "ellipse",
              "diamond",
              "triangle",
              "line",
            ]),
            x: z.number().finite().min(0).max(100000),
            y: z.number().finite().min(0).max(100000),
            width: z.number().finite().min(1).max(100000),
            height: z.number().finite().min(1).max(100000),
            text: z.string().max(200000).optional(),
            src: z.string().max(4000).optional(),
            drawingId: z.string().uuid().optional(),
            color: z
              .string()
              .regex(/^#[0-9a-fA-F]{6}$/)
              .optional(),
            points: z
              .array(z.tuple([z.number().finite(), z.number().finite()]))
              .max(15000)
              .optional(),
            fitted: z.boolean().optional(),
            strokeWidth: z.number().finite().min(0.5).max(50).optional(),
          }),
        )
        .max(1500),
    })
    .optional(),
  parentId: z.string().uuid().nullable().optional(),
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
  const { layers, etag, body, ...meta } = n;
  if (body !== undefined)
    return matter.stringify(`\n<!-- synapse:body -->\n\n${body}\n`, {
      ...meta,
      format: 2,
    });
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
  if (data.format === 2 || content.includes("<!-- synapse:body -->")) {
    const body = content
      .replace(/^\s*<!-- synapse:body -->\r?\n\r?\n/, "")
      .replace(/\r?\n$/, "");
    return {
      ...parsed,
      id: safeId(data.id),
      revision: z.number().int().min(1).parse(data.revision),
      updated: z.string().parse(data.updated),
      body,
      layers: { intuition: "", technical: "", implementation: "" },
      etag: crypto.createHash("sha256").update(raw).digest("hex"),
    };
  }
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
  fresh = false;
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
      this.fresh = true;
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
    if (!old && expected !== undefined)
      throw new AppError(
        404,
        "This note was deleted outside Synapse. Save your draft as a new note to keep it.",
      );
    if (n.parentId) {
      let parent: string | null | undefined = n.parentId;
      const seen = new Set([n.id]);
      while (parent) {
        if (seen.has(parent))
          throw new AppError(
            400,
            "A page cannot be inside itself or one of its subpages.",
          );
        seen.add(parent);
        const ancestor = all.find((x) => x.id === parent);
        if (!ancestor && old?.parentId === n.parentId) break;
        if (!ancestor)
          throw new AppError(400, "The parent page does not exist.");
        parent = ancestor.parentId;
      }
    }
    if (n.body !== undefined) {
      const ids = inlineTargets(
        n.body +
          "\n" +
          (n.canvas?.items.map((item) => item.text || "").join("\n") || ""),
      ).filter((id) => id !== n.id && all.some((x) => x.id === id));
      n = {
        ...n,
        links: [
          ...n.links.filter((l) => !l.inline || ids.includes(l.target)),
          ...ids
            .filter((id) => !n.links.some((l) => l.target === id))
            .map((target) => ({
              target,
              relation: "related" as const,
              reason: "Linked in this page",
              inline: true,
            })),
        ],
      };
    }
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
      if (
        link.target === n.id ||
        (!all.some((x) => x.id === link.target) &&
          !old?.links.some((l) => l.target === link.target))
      )
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
  async trash(ids: string[]) {
    return this.serial(async () => {
      const all = await this.notes(true);
      const selected = [...new Set(ids.map(safeId))];
      if (selected.some((id) => !all.some((n) => n.id === id)))
        throw new AppError(
          409,
          "A selected note has already changed or been deleted. Refresh and try again.",
        );
      const moved: string[] = [];
      try {
        for (const id of selected) {
          await fs.mkdir(this.file(".synapse/trash"), { recursive: true });
          await fs.rename(
            this.file(`notes/${id}.md`),
            this.file(`.synapse/trash/${id}.md`),
          );
          moved.push(id);
        }
      } catch (error) {
        for (const id of moved)
          await fs.rename(
            this.file(`.synapse/trash/${id}.md`),
            this.file(`notes/${id}.md`),
          );
        throw error;
      }
      return selected;
    });
  }
  async trashed() {
    await fs.mkdir(this.file(".synapse/trash"), { recursive: true });
    const files = await fs.readdir(this.file(".synapse/trash"));
    return Promise.all(
      files
        .filter((f) => f.endsWith(".md"))
        .map(async (f) =>
          decodeNote(
            await fs.readFile(this.file(".synapse/trash/" + f), "utf8"),
          ),
        ),
    );
  }
  async restoreTrash(id: string) {
    return this.serial(async () => {
      safeId(id);
      const source = this.file(`.synapse/trash/${id}.md`);
      const data = await fs.readFile(source, "utf8");
      const destination = this.file(`notes/${id}.md`);
      await fs.writeFile(destination, data, { flag: "wx" });
      await fs.unlink(source);
    });
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
