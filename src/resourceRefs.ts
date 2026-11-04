import type { Note, Source } from "./types";
export function noteUsesResource(note: Note, source: Source) {
  if (note.sources.includes(source.id)) return true;
  const text = JSON.stringify(note);
  return !!(
    (source.url && text.includes(source.url)) ||
    (source.file &&
      (text.includes("../attachments/" + source.file) ||
        text.includes("/files/attachments/" + source.file)))
  );
}
