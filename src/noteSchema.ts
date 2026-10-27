import { z } from "zod";
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
              "video",
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
            fill: z
              .string()
              .regex(/^(none|#[0-9a-fA-F]{6})$/)
              .optional(),
            opacity: z.number().min(0.1).max(1).optional(),
            textScale: z.number().min(0.2).max(20).optional(),
            pressures: z
              .array(z.number().finite().min(0.7).max(1.3))
              .max(15000)
              .optional(),
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

export const storedNoteSchema = noteSchema.extend({
  id: z.string().uuid(),
  revision: z.number().int().min(0),
  updated: z.string(),
  etag: z.string().optional(),
});
