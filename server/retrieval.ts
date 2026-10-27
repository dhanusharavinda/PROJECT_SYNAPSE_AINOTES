import type { Note } from "../src/types.js";
import { plainNote } from "../src/content.js";
import { readableText } from "../src/studyText.js";
const normalize = (word: string) =>
  word.length > 4 && word.endsWith("s") && !word.endsWith("ss")
    ? word.slice(0, -1)
    : word;
export function candidateNotes(text: string, notes: Note[], limit = 12) {
  const words = new Set(
    (text.toLowerCase().match(/[a-z0-9]{3,}/g) || [])
      .map(normalize)
      .filter(
        (w) =>
          ![
            "the",
            "and",
            "that",
            "this",
            "with",
            "from",
            "are",
            "for",
            "you",
            "can",
            "into",
            "have",
            "what",
          ].includes(w),
      ),
  );
  return notes
    .map((note, index) => {
      const title =
        (note.title + " " + note.context + " " + note.group)
          .toLowerCase()
          .match(/[a-z0-9]{3,}/g) || [];
      const body =
        plainNote(note)
          .toLowerCase()
          .match(/[a-z0-9]{3,}/g) || [];
      return {
        note,
        index,
        score:
          title.reduce((s, w) => s + (words.has(normalize(w)) ? 4 : 0), 0) +
          new Set(body.map(normalize).filter((w) => words.has(w))).size,
      };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((x) => x.note);
}
export function speechText(text: string) {
  return readableText(text)
    .replace(/<[^>]*>/g, "")
    .replace(/```[\s\S]*?```/g, "A code example is available in your note.")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "An image is available in your note.")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*\|.*\|\s*$/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
