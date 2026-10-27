import dagre from "@dagrejs/dagre";
import type { Note, Relation } from "./types";
export interface Connection {
  id: string;
  source: string;
  target: string;
  relation: Relation | "contains";
  reason: string;
}
export function graphConnections(notes: Note[]): Connection[] {
  const ids = new Set(notes.map((n) => n.id));
  return notes.flatMap((n) => [
    ...n.links
      .filter((l) => ids.has(l.target))
      .map((l, i) => ({
        id: `${n.id}-${l.target}-${l.relation}-${i}`,
        source: n.id,
        target: l.target,
        relation: l.relation,
        reason: l.reason,
      })),
    ...(n.parentId && ids.has(n.parentId)
      ? [
          {
            id: "contains-" + n.id,
            source: n.parentId,
            target: n.id,
            relation: "contains" as const,
            reason: "Page hierarchy",
          },
        ]
      : []),
  ]);
}
export const relationWords = {
  related: "relates to",
  prerequisite: "comes before",
  "used-in": "is used in",
  contrasts: "contrasts with",
  contains: "contains",
};
export function nearby(notes: Note[], id: string, hops = 1) {
  const edges = graphConnections(notes),
    ids = new Set([id]);
  for (let i = 0; i < hops; i++) {
    const current = new Set(ids);
    for (const e of edges)
      if (current.has(e.source) || current.has(e.target)) {
        ids.add(e.source);
        ids.add(e.target);
      }
  }
  return notes.filter((n) => ids.has(n.id));
}
export function learningPath(notes: Note[], goal: string) {
  const done = new Set<string>(),
    active = new Set<string>(),
    path: Note[] = [];
  let cyclic = false;
  function visit(id: string) {
    if (active.has(id)) {
      cyclic = true;
      return;
    }
    if (done.has(id)) return;
    active.add(id);
    for (const n of notes)
      if (n.links.some((l) => l.target === id && l.relation === "prerequisite"))
        visit(n.id);
    active.delete(id);
    done.add(id);
    const n = notes.find((n) => n.id === id);
    if (n) path.push(n);
  }
  visit(goal);
  return { notes: path, cyclic };
}
export function arrangeGraph(
  notes: Note[],
  edges: Connection[],
  roadmap = false,
) {
  const graph = new dagre.graphlib.Graph({ multigraph: true });
  graph.setGraph({
    rankdir: roadmap ? "TB" : "LR",
    nodesep: 56,
    ranksep: 100,
    marginx: 32,
    marginy: 32,
  });
  graph.setDefaultEdgeLabel(() => ({}));
  notes.forEach((n) => graph.setNode(n.id, { width: 230, height: 124 }));
  edges.forEach((e) =>
    graph.setEdge(
      e.source,
      e.target,
      { weight: e.relation === "prerequisite" ? 3 : 1 },
      e.id,
    ),
  );
  dagre.layout(graph);
  return Object.fromEntries(
    notes.map((n) => {
      const p = graph.node(n.id);
      return [n.id, { x: p.x - 115, y: p.y - 62 }];
    }),
  );
}
export function arrangeNeighborhood(
  notes: Note[],
  edges: Connection[],
  focus: string,
) {
  const before = new Set(
    edges
      .filter((e) => e.target === focus && e.source !== focus)
      .map((e) => e.source),
  );
  const upper = notes.filter((n) => before.has(n.id)),
    lower = notes.filter((n) => n.id !== focus && !before.has(n.id));
  const cols = Math.min(2, Math.max(1, upper.length, lower.length));
  const width = cols * 230 + (cols - 1) * 56;
  const positions: Record<string, { x: number; y: number }> = {};
  function row(items: Note[], start: number) {
    items.forEach((n, i) => {
      const count = Math.min(cols, items.length - Math.floor(i / cols) * cols);
      positions[n.id] = {
        x:
          32 +
          (width - (count * 230 + (count - 1) * 56)) / 2 +
          (i % cols) * 286,
        y: start + Math.floor(i / cols) * 204,
      };
    });
  }
  row(upper, 32);
  const centerY = 32 + Math.ceil(upper.length / cols) * 204;
  positions[focus] = { x: 32 + (width - 230) / 2, y: centerY };
  row(lower, centerY + 214);
  return positions;
}
