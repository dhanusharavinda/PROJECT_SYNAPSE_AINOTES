import type { Note, NoteCanvas } from "./types";

// A warning is deliberately well below the storage ceiling. Turning a page
// should be a choice made before a save can fail, never a destructive trim.
export const MAX_CANVAS_ITEMS = 20000;
export const RECOMMENDED_CANVAS_ITEMS = 1000;
export const RECOMMENDED_CANVAS_POINTS = 80000;
export const MAX_NOTE_BYTES = 24 * 1024 * 1024;

export function getPageCapacity(canvas?: NoteCanvas) {
  const items = canvas?.items.length || 0;
  let points = 0;
  for (const item of canvas?.items || []) points += item.points?.length || 0;
  return {
    items,
    points,
    warning:
      items >= RECOMMENDED_CANVAS_ITEMS || points >= RECOMMENDED_CANVAS_POINTS,
    full: items >= MAX_CANVAS_ITEMS,
  };
}

export function noteByteLength(note: Note) {
  return new TextEncoder().encode(JSON.stringify(note)).byteLength;
}

export function assertNoteFits(note: Note) {
  if (noteByteLength(note) > MAX_NOTE_BYTES)
    throw Object.assign(
      new Error(
        "This notebook is too large to sync. Keep this page open or download a draft copy, then continue in a new note.",
      ),
      { status: 413 },
    );
}
