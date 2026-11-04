import { z } from "zod";
import { noteSchema, storedNoteSchema } from "./noteSchema";
import { bodyOf } from "./content";
import type { Note, CanvasItem } from "./types";

export const inputDraftSchema = z.object({
  text: z.string().max(20000),
  strokes: noteSchema.shape.canvas.unwrap().shape.items.max(300),
});
export type InputDraft = z.infer<typeof inputDraftSchema>;
export const submissionSchema = z.object({
  note: storedNoteSchema,
  base: z.string().nullable(),
  operation: z.string().uuid(),
});
export type InputSubmission = z.infer<typeof submissionSchema>;

// Append a separate block so sending input never moves or rewrites existing ink.
export function prepareInput(note: Note, input: InputDraft): InputSubmission {
  const draft = inputDraftSchema.parse(input);
  if (!draft.text.trim() && !draft.strokes.length)
    throw Error("Type or draw something before sending.");
  const canvas = note.canvas || { width: 1100, height: 0, items: [] };
  const bottom =
    Math.max(
      canvas.height,
      canvas.prose?.height || 0,
      bodyOf(note).trim() ? 800 : 0,
      ...canvas.items.map((item) => item.y + item.height),
    ) + 32;
  const added: CanvasItem[] = [];
  let y = bottom;
  if (draft.text.trim()) {
    const lines = draft.text
      .split("\n")
      .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / 65)), 0);
    const height = Math.max(80, lines * 32 + 32);
    added.push({
      id: crypto.randomUUID(),
      kind: "text",
      x: 24,
      y,
      width: 850,
      height,
      text: draft.text,
      fitted: true,
    });
    y += height + 24;
  }
  for (const stroke of draft.strokes)
    added.push({
      ...stroke,
      id: crypto.randomUUID(),
      x: stroke.x + 24,
      y: stroke.y + y,
    });
  const height = Math.max(y, ...added.map((item) => item.y + item.height)) + 32;
  const next = storedNoteSchema.parse({
    ...note,
    canvas: {
      ...canvas,
      width: Math.max(canvas.width || 1100, 950),
      height,
      items: [...canvas.items, ...added],
    },
  });
  return {
    note: next,
    base: note.etag || null,
    operation: crypto.randomUUID(),
  };
}
