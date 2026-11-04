import { z } from "zod";
import { diagramSchema } from "./diagramSchema.js";
import { MAX_CANVAS_ITEMS } from "./notebookCapacity.js";
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
export const fileNameSchema = z
  .string()
  .trim()
  .min(4)
  .max(160)
  .regex(
    /^[^<>:"/\\|?*\x00-\x1f]+\.md$/i,
    "Use a Markdown filename without slashes or special characters.",
  )
  .refine(
    (value) =>
      !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value) &&
      !/[. ]\.md$/i.test(value),
    "Choose another filename.",
  );
export const canvasSchema = z.object({
  height: z.number().finite().min(0).max(100000),
  prose: z
    .object({
      width: z.number().finite().min(80).max(100000),
      height: z.number().finite().min(32).max(100000),
    })
    .optional(),
  width: z.number().finite().min(100).max(100000).optional(),
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        kind: z.enum([
          "text",
          "table",
          "image",
          "video",
          "drawing",
          "paint",
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
        fill: z
          .string()
          .regex(/^(none|#[0-9a-fA-F]{6})$/)
          .optional(),
        opacity: z.number().min(0.1).max(1).optional(),
        rotation: z.number().finite().min(-36000).max(36000).optional(),
        arrowStyle: z
          .enum(["straight", "curved", "elbow", "double"])
          .optional(),
        textScale: z.number().min(0.2).max(20).optional(),
        uncertain: z.boolean().optional(),
        pressures: z
          .array(z.number().finite().min(0.7).max(1.3))
          .max(15000)
          .optional(),
      }),
    )
    .max(MAX_CANVAS_ITEMS, "This sheet is full. Continue on a new sheet. Your existing writing has not been removed."),
});

export const paperTextureSchema = z.enum(["plain", "ruled", "dotted", "grid"]);
export const aiNotesSchema = z.object({
  text: z.string().max(200000),
  sourceDigest: z.string().regex(/^[a-f0-9]{64}$/),
  generatedAt: z.string().datetime(),
  view: z.enum(["typed", "handwritten"]),
  diagrams: z
    .array(
      z.object({
        id: z.string().uuid(),
        title: z.string().max(160),
        description: z.string().max(12000).optional(),
        original: canvasSchema,
        recognized: diagramSchema.optional(),
        editable: canvasSchema.optional(),
        mode: z.enum(["original", "editable"]),
      }),
    )
    .max(20),
});
export const notebookPageSchema = z.object({
  id: z.string().uuid(),
  body: z.string().max(600000),
  canvas: canvasSchema,
  paperTexture: paperTextureSchema,
  aiNotes: aiNotesSchema.optional(),
});

export const noteSchema = z.object({
  fileName: fileNameSchema.optional(),
  theme: z.enum(["light", "dark", "paper", "dotted"]).optional(),
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
  canvas: canvasSchema.optional(),
  paperTexture: paperTextureSchema.optional(),
  aiNotes: aiNotesSchema.optional(),
  pages: z
    .array(notebookPageSchema)
    .max(100)
    .refine(
      (pages) => new Set(pages.map((p) => p.id)).size === pages.length,
      "Page identities must be unique.",
    )
    .optional(),
  parentId: z.string().uuid().nullable().optional(),
  links: z.array(linkSchema).max(500),
  sources: z.array(z.string().uuid()).max(500),
  drawings: z.array(z.string().uuid()).max(100),
  status: z.enum(["collected", "explained", "practiced"]),
  archived: z.boolean().optional(),
  reviewEnabled: z.boolean().default(true),
});

export const storedNoteSchema = noteSchema.extend({
  id: z.string().uuid(),
  revision: z.number().int().min(0),
  updated: z.string(),
  etag: z.string().optional(),
});
