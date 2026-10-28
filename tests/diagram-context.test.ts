import { it, expect, vi } from "vitest";
import {
  createDiagramDraft,
  diagramContext,
  diagramSettings,
} from "../server/diagramDraft";
import type { Providers } from "../server/providers";
import type { Note } from "../src/types";
import { diagramLayout, renderDiagramSvg } from "../src/diagramDesign";
import { diagramSchema } from "../server/diagramSchema";

const note = (
  body = "Browser sends a request to the API. The API reads the database.",
): Note => ({
  id: "abc",
  title: "Search system",
  context: "Components, not ordered learning steps",
  body,
  revision: 1,
  updated: "",
  status: "collected",
  group: "",
  links: [],
  sources: [],
  drawings: [],
  layers: { intuition: "", technical: "", implementation: "" },
});
const response = {
  type: "architecture" as const,
  rationale: "The note describes connected system components.",
  nodes: [
    { id: "a", label: "Browser", kind: "component" as const },
    { id: "b", label: "API", kind: "component" as const },
    { id: "c", label: "Database", kind: "store" as const },
  ],
  edges: [
    { from: "a", to: "b", label: "request" },
    { from: "b", to: "c", label: "read" },
  ],
};
const provider = () =>
  ({
    config: {
      provider: "ollama",
      ollamaModel: "local",
      ollamaUrl: "http://localhost:11434",
    },
    json: vi.fn().mockResolvedValue(response),
  }) as unknown as Providers;

it("uses selection with its surrounding context, strips UI markup and bounds the excerpt", () => {
  const context = diagramContext(
    [
      note(
        ":::variants\n:::option {}\nAPI uses a database.\n:::endoption\n:::endvariants\n" +
          "extra ".repeat(20000),
      ),
    ],
    "<b>API</b>",
  );
  expect(context.focus).toBe("API");
  expect(context.notes[0].text).toContain("API uses a database.");
  expect(context.notes[0].text).not.toContain(":::option");
  expect(context.notes[0].text.length).toBeLessThanOrEqual(8000);
  expect(context.limits).toContain("Images and handwriting are not read");
});
it("lets AI choose architecture and reuses concurrent or repeated unchanged drafts without another call", async () => {
  const p = provider(),
    settings = diagramSettings.parse({});
  const [a, b] = await Promise.all([
    createDiagramDraft(p, [note()], settings),
    createDiagramDraft(p, [note()], settings),
  ]);
  expect(p.json).toHaveBeenCalledTimes(1);
  expect(a.diagram.type).toBe("architecture");
  expect(b.cached).toBe(true);
  expect(vi.mocked(p.json).mock.calls[0][3]).toEqual({ maxOutputTokens: 1800 });
  a.diagram.nodes[0].label = "Changed draft";
  const c = await createDiagramDraft(p, [note()], settings);
  expect(c.diagram.nodes[0].label).toBe("Browser");
});
it("invalidates cache when note content or provider model changes", async () => {
  const p = provider(),
    settings = diagramSettings.parse({});
  await createDiagramDraft(p, [note()], settings);
  await createDiagramDraft(p, [note("A different system")], settings);
  p.config.ollamaModel = "different";
  await createDiagramDraft(p, [note()], settings);
  expect(p.json).toHaveBeenCalledTimes(3);
});
it("rejects empty notes and malformed relationships without retrying generation", async () => {
  const p = provider(),
    settings = diagramSettings.parse({});
  await expect(createDiagramDraft(p, [note("")], settings)).rejects.toThrow(
    "Write an explanation",
  );
  expect(p.json).not.toHaveBeenCalled();
  vi.mocked(p.json).mockResolvedValue({
    ...response,
    edges: [{ from: "a", to: "missing", label: "fake" }],
  });
  await expect(createDiagramDraft(p, [note()], settings)).rejects.toThrow(
    "invalid relationships",
  );
  expect(p.json).toHaveBeenCalledTimes(1);
});
it("renders architecture left to right with distinct data stores and orthogonal routes", () => {
  const d = diagramSchema.parse(response),
    layout = diagramLayout(d);
  expect(layout.nodes[0].x).toBeLessThan(layout.nodes[1].x);
  expect(layout.nodes[1].x).toBeLessThan(layout.nodes[2].x);
  for (const edge of layout.edges)
    for (let i = 1; i < edge.points.length; i++)
      expect(
        edge.points[i][0] === edge.points[i - 1][0] ||
          edge.points[i][1] === edge.points[i - 1][1],
      ).toBe(true);
  expect(renderDiagramSvg(d)).toContain("Database");
  expect(renderDiagramSvg(d)).toContain(" C");
});
it("requires labels on state transitions and decision branches", () => {
  expect(
    diagramSchema.safeParse({
      ...response,
      type: "state-machine",
      edges: response.edges.map((e) => ({ ...e, label: "" })),
    }).success,
  ).toBe(false);
});
