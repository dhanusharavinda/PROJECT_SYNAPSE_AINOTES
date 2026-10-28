import type { Note, Source } from "./types";
export function noteUsesResource(note: Note, source: Source) {
  if (note.sources.includes(source.id)) return true;
  const text = [
    note.body || "",
    ...Object.values(note.layers),
    ...(note.canvas?.items || []).flatMap((i) => [i.src || "", i.text || ""]),
  ].join("\n");
  return !!(
    (source.url && text.includes(source.url)) ||
    (source.file &&
      (text.includes("../attachments/" + source.file) ||
        text.includes("/files/attachments/" + source.file)))
  );
}
