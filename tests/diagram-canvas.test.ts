import { it, expect } from "vitest";
import { appendDiagram } from "../src/diagramCanvas";
import { newTabletNote } from "../src/tabletStore";
import { storedNoteSchema } from "../src/noteSchema";
import type { Diagram } from "../src/diagramDesign";
const diagram: Diagram = {
  type: "flowchart",
  title: "Two steps",
  nodes: [
    { id: "a", label: "Start", kind: "terminal" },
    { id: "b", label: "Read", kind: "step" },
  ],
  edges: [{ from: "a", to: "b", label: "Next" }],
};
it("appends editable diagram objects below existing content and preserves all prior objects", () => {
  const original = {
    width: 1000,
    height: 500,
    items: [
      {
        id: crypto.randomUUID(),
        kind: "text" as const,
        x: 5,
        y: 600,
        width: 160,
        height: 80,
        text: "Keep me",
      },
    ],
  };
  const result = appendDiagram(original, diagram);
  expect(result.items[0]).toEqual(original.items[0]);
  expect(original.items).toHaveLength(1);
  expect(result.items.slice(1).every((i) => i.y > 680)).toBe(true);
  expect(result.items.some((i) => i.kind === "arrow")).toBe(true);
  expect(
    result.items.filter((i) => i.kind === "text").map((i) => i.text),
  ).toContain("Start");
  expect(new Set(result.items.map((i) => i.id)).size).toBe(result.items.length);
  expect(
    storedNoteSchema.safeParse({ ...newTabletNote(), canvas: result }).success,
  ).toBe(true);
});
it("rejects an insertion that would exceed the saved-page object limit", () => {
  const item = {
    id: crypto.randomUUID(),
    kind: "text" as const,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    text: "Existing",
  };
  expect(() =>
    appendDiagram(
      {
        width: 1000,
        height: 500,
        items: Array.from({ length: 1500 }, () => ({
          ...item,
          id: crypto.randomUUID(),
        })),
      },
      diagram,
    ),
  ).toThrow("new page");
});
