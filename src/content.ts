import type { Note } from "./types";
export interface VariantText {
  label: string;
  body: string;
}
export function variantsMarkdown(options: VariantText[]) {
  return `:::variants\n\n${options.map((o) => `:::option ${JSON.stringify({ label: o.label })}\n\n${o.body}\n\n:::endoption`).join("\n\n")}\n\n:::endvariants`;
}
export function parseVariants(
  source: string,
): { raw: string; options: VariantText[] } | undefined {
  if (!/^:::variants\s*\n/.test(source)) return;
  const lines = source.split("\n");
  let depth = 0,
    end = -1,
    fence = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^(`{3,}|~{3,})/.test(line)) {
      const mark = line[0];
      fence = fence === mark ? "" : fence || mark;
    }
    if (fence) continue;
    if (line === ":::variants") depth++;
    if (line === ":::endvariants" && --depth === 0) {
      end = i;
      break;
    }
  }
  if (end < 0) return;
  const options: VariantText[] = [];
  let i = 1;
  while (i < end) {
    const match = lines[i].match(/^:::option(?:\s+(\{.*\}))?\s*$/);
    if (!match) {
      i++;
      continue;
    }
    let label = "";
    try {
      label = JSON.parse(match[1] || "{}").label || "";
    } catch {
      return;
    }
    const start = ++i;
    let nested = 0,
      code = "";
    for (; i < end; i++) {
      const line = lines[i].trim();
      if (/^(`{3,}|~{3,})/.test(line)) {
        const mark = line[0];
        code = code === mark ? "" : code || mark;
      }
      if (code) continue;
      if (line === ":::variants") nested++;
      if (line === ":::endvariants") nested--;
      if (line === ":::endoption" && nested === 0) break;
    }
    if (i >= end) return;
    options.push({
      label: String(label),
      body: lines.slice(start, i).join("\n").trim(),
    });
    i++;
  }
  if (!options.length) return;
  const raw =
    lines.slice(0, end + 1).join("\n") +
    (source[lines.slice(0, end + 1).join("\n").length] === "\n" ? "\n" : "");
  return { raw, options };
}
export function drawingMarkdown(id: string, width?: number) {
  return `:::drawing ${JSON.stringify({ id, ...(width ? { width } : {}) })} :::`;
}
export function bodyOf(note: Note) {
  if (note.body !== undefined) return note.body;
  let body: string | undefined = note.body;
  if (body === undefined) {
    const options = [
      { label: "", body: note.layers.intuition },
      ...(["technical", "implementation"] as const)
        .filter((k) => note.layers[k].trim())
        .map((k) => ({
          label: k === "technical" ? "Technical" : "Implementation",
          body: note.layers[k],
        })),
    ];
    body =
      options.length > 1 ? variantsMarkdown(options) : note.layers.intuition;
  }
  if (note.body === undefined)
    for (const id of note.drawings)
      if (!body.includes(`"id":"${id}"`)) body += "\n\n" + drawingMarkdown(id);
  return body
    .replace(/^See also:\s*(\[[^\]]+\]\([^)]+\))\.?\s*$/gm, "$1")
    .trim();
}
export function plainNote(note: Note) {
  return (
    bodyOf(note) +
    (note.canvas?.items
      .filter((item) => item.kind === "text" || item.kind === "table")
      .map((item) => "\n\n" + (item.text || ""))
      .join("") || "")
  )
    .replace(/^:::option.*$/gm, "")
    .replace(/^:::(?:variants|endvariants)\s*$/gm, "")
    .replace(/^:::endoption\s*$/gm, "")
    .replace(/^:::drawing.*$/gm, "[Drawing in note]")
    .trim();
}
export function inlineTargets(body: string) {
  const clean = body.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`]*`/g, "");
  return [
    ...new Set(
      [
        ...clean.matchAll(/(?<!!)\[[^\]]+\]\((?:\.\/)?([a-f0-9-]{36})\.md\)/g),
      ].map((m) => m[1]),
    ),
  ];
}
export function noteSummary(note: Note) {
  return plainNote(note)
    .replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .split("\n")
    .filter((line) => line.trim() && !/^\s*(\||[-:|\s]+$|\[Drawing)/.test(line))
    .join(" ")
    .replace(/[#*`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}
export function lineage(note: Note, notes: Note[]) {
  const chain: Note[] = [];
  const seen = new Set([note.id]);
  let parent = note.parentId;
  while (parent && !seen.has(parent)) {
    const found = notes.find((n) => n.id === parent);
    if (!found) break;
    chain.unshift(found);
    seen.add(parent);
    parent = found.parentId;
  }
  return chain;
}
