import type { Note, Source } from "../src/types.js";
import crypto from "node:crypto";

// Index references only. No remote content is fetched and no AI runs here.
export function indexResources(notes: Note[], existing: Source[]): Source[] {
  const resources = [...existing];
  const urls = new Set(existing.flatMap((s) => (s.url ? [s.url] : [])));
  const files = new Set(existing.flatMap((s) => (s.file ? [s.file] : [])));
  for (const note of notes) {
    const text = [
      note.body || "",
      ...Object.values(note.layers),
      ...(note.canvas?.items || []).flatMap((i) => [i.text || "", i.src || ""]),
    ].join("\n");
    for (const match of text.matchAll(/https?:\/\/[^\s<>"'\])]+/g)) {
      const url = match[0].replace(/[.,;!?]+$/, "");
      if (urls.has(url)) continue;
      try {
        const parsed = new URL(url);
        resources.unshift({
          id: crypto.randomUUID(),
          title: parsed.hostname + parsed.pathname,
          url,
          kind: "web",
          text: "",
          coverage: "Saved from a note. Content has not been extracted.",
          created: new Date().toISOString(),
        });
        urls.add(url);
      } catch {}
    }
    for (const match of text.matchAll(
      /(?:\.\.\/|\/files\/)attachments\/([-a-zA-Z0-9]+\.(pdf|png|jpe?g|webp|txt|md))/gi,
    )) {
      const file = match[1];
      if (files.has(file)) continue;
      resources.unshift({
        id: crypto.randomUUID(),
        title: file,
        file,
        kind: /png|jpe?g|webp/i.test(match[2])
          ? "image"
          : match[2].toLowerCase() === "pdf"
            ? "pdf"
            : "text",
        text: "",
        coverage: "Referenced by a note.",
        created: new Date().toISOString(),
      });
      files.add(file);
    }
  }
  return resources;
}
