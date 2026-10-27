import { it, expect } from "vitest";
import { graphConnections, nearby, learningPath } from "../src/graphModel";
import {
  diagramLayout,
  renderDiagramSvg,
  type Diagram,
} from "../src/diagramDesign";
import { bodyOf, variantsMarkdown, inlineTargets } from "../src/content";
import type { Note } from "../src/types";
const page = (
  id: string,
  title: string,
  links: Note["links"] = [],
  parentId?: string,
): Note => ({
  id,
  title,
  context: "ML",
  group: "Study",
  links,
  parentId,
  body: title,
  layers: { intuition: "", technical: "", implementation: "" },
  sources: [],
  drawings: [],
  status: "collected",
  revision: 1,
  updated: "",
});
it("finds incoming links, outgoing links and subpages without inventing relationships", () => {
  const notes = [
    page("a", "Vectors", [
      { target: "b", relation: "prerequisite", reason: "Coordinates" },
    ]),
    page("b", "Embeddings", [
      { target: "c", relation: "used-in", reason: "Represent documents" },
    ]),
    page("c", "Search"),
    page("d", "Example", [], "b"),
    page("x", "Unconnected"),
  ];
  expect(nearby(notes, "b").map((n) => n.id)).toEqual(["a", "b", "c", "d"]);
  expect(graphConnections(notes)).toHaveLength(3);
  expect(learningPath(notes, "b").notes.map((n) => n.id)).toEqual(["a", "b"]);
});
it("reports prerequisite cycles instead of claiming an ordered learning path", () => {
  const notes = [
    page("a", "A", [{ target: "b", relation: "prerequisite", reason: "" }]),
    page("b", "B", [{ target: "a", relation: "prerequisite", reason: "" }]),
  ];
  expect(learningPath(notes, "a").cyclic).toBe(true);
});
it("uses orthogonal diagram routes, labelled edges and escaped accessible SVG", () => {
  const diagram: Diagram = {
    title: "A < B",
    nodes: [
      { id: "a", label: "Input", kind: "terminal" },
      { id: "b", label: "Valid?", kind: "decision" },
      { id: "c", label: "<script>alert(1)</script>", kind: "step" },
    ],
    edges: [
      { from: "a", to: "b", label: "check" },
      { from: "b", to: "c", label: "yes" },
    ],
  };
  const layout = diagramLayout(diagram);
  for (const edge of layout.edges)
    for (let i = 1; i < edge.points.length; i++)
      expect(
        edge.points[i][0] === edge.points[i - 1][0] ||
          edge.points[i][1] === edge.points[i - 1][1],
      ).toBe(true);
  const svg = renderDiagramSvg(diagram);
  expect(svg).toContain('role="img"');
  expect(svg).toContain("&lt;script&gt;");
  expect(svg).not.toContain("<script>");
  expect(svg).not.toContain("<rect width=");
  expect(svg).toContain("#bf4520");
});
it("migrates old layers to variants once and allows drawings to be removed from a new body", () => {
  const n = page("a", "A");
  n.drawings = ["11111111-1111-4111-8111-111111111111"];
  n.body = undefined;
  n.layers = {
    intuition: "Simple",
    technical: "Precise",
    implementation: "Example",
  };
  expect(bodyOf(n)).toContain(
    variantsMarkdown([
      { label: "", body: "Simple" },
      { label: "Technical", body: "Precise" },
      { label: "Implementation", body: "Example" },
    ]),
  );
  expect(bodyOf(n)).toContain(":::drawing");
  n.body = "Only my writing";
  expect(bodyOf(n)).toBe("Only my writing");
});
it("does not derive graph edges from code examples", () => {
  const link = "[A](11111111-1111-4111-8111-111111111111.md)";
  expect(inlineTargets("```md\n" + link + "\n```")).toEqual([]);
  expect(inlineTargets(link)).toHaveLength(1);
});
