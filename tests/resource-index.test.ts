import { expect, it } from "vitest";
import { indexResources } from "../server/resourceIndex";
import { newTabletNote } from "../src/tabletStore";
import type { AINotes } from "../src/types";

const ai = (text: string): AINotes => ({
  text,
  view: "typed",
  diagrams: [],
  generatedAt: new Date().toISOString(),
  sourceDigest: "a".repeat(64),
});

it("indexes exact bare URLs across line breaks in main text, sheets and AI notes without altering the notebook", () => {
  const note = newTabletNote();
  note.body = "https://example.test/main\nFollowup paragraph";
  note.aiNotes = ai("https://example.test/ai?one=1&two=2\n\nNext explanation");
  note.pages = [
    {
      id: crypto.randomUUID(),
      body: "https://example.test/sheet\r\nNext line",
      canvas: {
        width: 1100,
        height: 900,
        items: [
          {
            id: crypto.randomUUID(),
            kind: "text",
            x: 1,
            y: 1,
            width: 100,
            height: 60,
            text: "https://example.test/placed\tNext column",
          },
        ],
      },
      paperTexture: "plain",
      aiNotes: ai("https://example.test/sheet-ai\nFollowup"),
    },
  ];
  const before = structuredClone(note);
  const result = indexResources([note], []);
  expect(result.map((resource) => resource.url).sort()).toEqual([
    "https://example.test/ai?one=1&two=2",
    "https://example.test/main",
    "https://example.test/placed",
    "https://example.test/sheet",
    "https://example.test/sheet-ai",
  ]);
  expect(note).toEqual(before);
});

it("keeps nested image and PDF references and deduplicates resources without changing bookmarks", () => {
  const note = newTabletNote();
  note.body = "https://example.test/read\nNext line";
  note.pages = [
    {
      id: crypto.randomUUID(),
      body: "[Read again](https://example.test/read)\n[PDF](../attachments/lecture.pdf)",
      canvas: {
        width: 1100,
        height: 900,
        items: [
          {
            id: crypto.randomUUID(),
            kind: "image",
            x: 1,
            y: 1,
            width: 100,
            height: 60,
            src: "/files/attachments/figure.png",
          },
        ],
      },
      paperTexture: "plain",
    },
  ];
  const first = indexResources([note], []);
  const linked = first.find((resource) => resource.url)!;
  linked.bookmarked = true;
  expect(first).toHaveLength(3);
  expect(first.flatMap((resource) => resource.file || []).sort()).toEqual([
    "figure.png",
    "lecture.pdf",
  ]);
  expect(indexResources([note], first)).toEqual(first);
  expect(linked.bookmarked).toBe(true);
});
