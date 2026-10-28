import { bodyOf } from "./content";
import { readableText } from "./studyText";
import type { Note } from "./types";

export interface RecallUnit {
  id: string;
  label: string;
  text: string;
  uncertain?: boolean;
}
export interface Flashcard {
  question: string;
  hint: string;
  answer: string;
  sourceId: string;
  evidence: string;
}
export interface PracticeDeck {
  units: RecallUnit[];
  cards: Flashcard[];
  cached: boolean;
  signature: string;
}
export function practiceText(source: string) {
  return readableText(source)
    .replace(/^[\t ]*[-*+]\s+(?:\[[ xX]\]\s*)?/gm, "")
    .replace(/^[\t ]*\d+[.)]\s+/gm, "")
    .replace(/^[\t ]*>\s?/gm, "")
    .replace(/^[\t ]*(`{3,}|~{3,})[^\n]*$/gm, "")
    .replace(/`([^`\n]+)`/g, "$1")
    .trim();
}
// Keep the same bounded source units in the prompt, evidence validator and UI.
export function recallUnits(note: Note): RecallUnit[] {
  const blocks = practiceText(bodyOf(note))
    .split(/\n\s*\n/)
    .filter((s) => s.trim());
  const units: RecallUnit[] = blocks.map((text, i) => ({
    id: `body-${i}`,
    label: `Passage ${i + 1}`,
    text: text.trim().slice(0, 1800),
  }));
  for (const item of note.canvas?.items || []) {
    const text = practiceText(item.text || "");
    if (text || item.uncertain)
      units.push({
        id: item.id,
        label:
          item.kind === "text"
            ? "Placed text"
            : item.kind === "drawing"
              ? "Diagram"
              : item.kind[0].toUpperCase() + item.kind.slice(1),
        text: text.slice(0, 1800),
        uncertain: item.uncertain,
      });
  }
  for (const link of note.links)
    if (link.reason.trim())
      units.push({
        id: `link-${link.target}`,
        label: "Connection",
        text: link.reason.trim().slice(0, 1000),
      });
  return units.slice(0, 80);
}
