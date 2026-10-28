import dagre from "@dagrejs/dagre";
import type { Proposal } from "./types";
export type Diagram = NonNullable<Proposal["diagram"]>;
export const diagramTokens = {
  paper: "#f5f5f5",
  ink: "#2d3142",
  muted: "#4f5d75",
  accent: "#bf4520",
  rule: "#bfc0c0",
};
export const xml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
const clean = (s: string) =>
  s
    .replace(/\u2014/g, ",")
    .replace(/\s+/g, " ")
    .trim();
export function diagramLayout(diagram: Diagram) {
  const horizontal =
    diagram.type === "architecture" || diagram.type === "data-flow";
  const graph = new dagre.graphlib.Graph({ multigraph: true });
  graph.setGraph({
    rankdir: horizontal ? "LR" : "TB",
    nodesep: 80,
    ranksep: 152,
    marginx: 40,
    marginy: 40,
  });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const n of diagram.nodes)
    graph.setNode(n.id, {
      width: 224,
      height: n.kind === "decision" ? 128 : 96,
    });
  diagram.edges.forEach((e, i) => graph.setEdge(e.from, e.to, {}, String(i)));
  dagre.layout(graph);
  const nodes = diagram.nodes.map((n) => ({ ...n, ...graph.node(n.id) }));
  const maxRight = Math.max(0, ...nodes.map((n) => n.x + n.width / 2));
  const edges = diagram.edges.map((e, i) => {
    const a = nodes.find((n) => n.id === e.from)!,
      b = nodes.find((n) => n.id === e.to)!;
    const out = diagram.edges.filter((x) => x.from === e.from),
      inc = diagram.edges.filter((x) => x.to === e.to);
    const ax = horizontal
        ? a.x + a.width / 2
        : a.x -
          a.width / 2 +
          (a.width * (out.indexOf(e) + 1)) / (out.length + 1),
      ay = horizontal
        ? a.y -
          a.height / 2 +
          (a.height * (out.indexOf(e) + 1)) / (out.length + 1)
        : a.y +
          a.height / 2 -
          (a.kind === "decision"
            ? (Math.abs(ax - a.x) * a.height) / a.width
            : 0);
    const bx = horizontal
        ? b.x - b.width / 2
        : b.x -
          b.width / 2 +
          (b.width * (inc.indexOf(e) + 1)) / (inc.length + 1),
      by = horizontal
        ? b.y -
          b.height / 2 +
          (b.height * (inc.indexOf(e) + 1)) / (inc.length + 1)
        : b.y -
          b.height / 2 +
          (b.kind === "decision"
            ? (Math.abs(bx - b.x) * b.height) / b.width
            : 0);
    const long = horizontal
      ? bx < ax ||
        nodes.some(
          (node) =>
            node.id !== a.id && node.id !== b.id && node.x > ax && node.x < bx,
        )
      : by < ay ||
        nodes.some(
          (node) =>
            node.id !== a.id && node.id !== b.id && node.y > ay && node.y < by,
        );
    const offset = 48 + (i % 4) * 16;
    const y = ay + offset;
    const outside = maxRight + 48 + i * 16;
    const bottom =
      Math.max(...nodes.map((node) => node.y + node.height / 2)) + 48 + i * 28;
    const points = horizontal
      ? long
        ? [
            [ax, ay],
            [ax + offset, ay],
            [ax + offset, bottom],
            [bx - 40, bottom],
            [bx - 40, by],
            [bx, by],
          ]
        : [
            [ax, ay],
            [ax + offset, ay],
            [ax + offset, by],
            [bx, by],
          ]
      : long
        ? [
            [ax, ay],
            [ax, y],
            [outside, y],
            [outside, by - 40],
            [bx, by - 40],
            [bx, by],
          ]
        : [
            [ax, ay],
            [ax, y],
            [bx, y],
            [bx, by],
          ];
    return {
      ...e,
      points,
      labelX: horizontal
        ? long
          ? (ax + offset + bx - 40) / 2
          : (ax + bx) / 2
        : long
          ? outside + 10
          : (ax + bx) / 2,
      labelY: horizontal
        ? long
          ? bottom - 14
          : ay - 14
        : long
          ? (y + by - 40) / 2
          : y - 14,
      labelRight: !horizontal && long,
    };
  });
  const width = Math.max(
    maxRight + 40,
    ...edges.flatMap((e) => e.points.map((p) => p[0] + 120)),
  );
  const height = Math.max(
    160,
    ...nodes.map((n) => n.y + n.height / 2 + 40),
    ...edges.flatMap((e) => e.points.map((p) => p[1] + 40)),
  );
  return {
    nodes,
    edges,
    width: Math.ceil(width / 4) * 4,
    height: Math.ceil(height / 4) * 4,
  };
}
function roundedPath(points: number[][]) {
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1],
      p = points[i],
      next = points[i + 1];
    const l1 = Math.hypot(p[0] - prev[0], p[1] - prev[1]),
      l2 = Math.hypot(next[0] - p[0], next[1] - p[1]);
    if (!l1 || !l2) continue;
    const r = Math.min(8, l1 / 2, l2 / 2);
    const before = [
      p[0] + ((prev[0] - p[0]) * r) / l1,
      p[1] + ((prev[1] - p[1]) * r) / l1,
    ];
    const after = [
      p[0] + ((next[0] - p[0]) * r) / l2,
      p[1] + ((next[1] - p[1]) * r) / l2,
    ];
    d += ` L ${before[0]} ${before[1]} Q ${p[0]} ${p[1]} ${after[0]} ${after[1]}`;
  }
  return d + ` L ${points.at(-1)![0]} ${points.at(-1)![1]}`;
}
function wrap(text: string, max = 24) {
  const words = clean(text).split(" "),
    lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line && line.length + word.length + 1 > max) {
      lines.push(line);
      line = "";
    }
    if (word.length > max) {
      if (line) {
        lines.push(line);
        line = "";
      }
      for (let i = 0; i < word.length; i += max)
        lines.push(word.slice(i, i + max));
    } else line += (line ? " " : "") + word;
  }
  if (line) lines.push(line);
  return lines;
}
export function renderDiagramSvg(diagram: Diagram, fontCss = "") {
  const layout = diagramLayout(diagram),
    t = diagramTokens;
  const edges = layout.edges
    .map((e) => {
      const label = clean(e.label).toUpperCase();
      const shown = label.length > 14 ? label.slice(0, 13) + "…" : label;
      const w = shown.length * 7 + 16;
      const vertical =
        Math.abs(e.points[0][0] - e.points.at(-1)![0]) < 1 &&
        e.points.length === 4;
      const labelX = vertical
          ? e.points[0][0] + w / 2 + 10
          : e.labelRight
            ? e.labelX + w / 2
            : e.labelX,
        labelY = e.labelY;
      return `<g><path d="${roundedPath(e.points)}" fill="none" stroke="${t.muted}" stroke-width="1.5" marker-end="url(#synapse-diagram-arrow)"/>${shown ? `<rect x="${labelX - w / 2}" y="${labelY - 13}" width="${w}" height="20" fill="${t.paper}"/><text x="${labelX}" y="${labelY + 1}" fill="${t.muted}" text-anchor="middle" font-family="Geist Mono,monospace" font-size="11"><title>${xml(label)}</title>${xml(shown)}</text>` : ""}</g>`;
    })
    .join("");
  const nodes = layout.nodes
    .map((n, i) => {
      const x = n.x - n.width / 2,
        y = n.y - n.height / 2,
        accent = i === 0,
        stroke = accent ? t.accent : t.ink,
        fill = accent ? "#f4e6df" : t.paper;
      const shape =
        n.kind === "decision"
          ? `<path d="M${n.x},${y} L${x + n.width},${n.y} L${n.x},${y + n.height} L${x},${n.y} Z" fill="${fill}" stroke="${stroke}"/>`
          : n.kind === "store"
            ? `<path d="M${x},${y + 14} C${x},${y - 4} ${x + n.width},${y - 4} ${x + n.width},${y + 14} V${y + n.height - 14} C${x + n.width},${y + n.height + 4} ${x},${y + n.height + 4} ${x},${y + n.height - 14} Z" fill="${fill}" stroke="${stroke}"/><path d="M${x},${y + 14} C${x},${y + 32} ${x + n.width},${y + 32} ${x + n.width},${y + 14}" fill="none" stroke="${stroke}"/>`
            : `<rect x="${x}" y="${y}" width="${n.width}" height="${n.height}" rx="${n.kind === "terminal" ? 40 : 6}" fill="${fill}" stroke="${stroke}"/>`;
      const lines = wrap(n.label, n.kind === "decision" ? 16 : 25);
      const start = n.y - (lines.length - 1) * 9;
      return `<g>${shape}<text x="${n.x}" y="${start}" fill="${t.ink}" font-family="Geist,Inter,sans-serif" font-size="14" font-weight="600" text-anchor="middle" dominant-baseline="middle">${lines.map((line, j) => `<tspan x="${n.x}" dy="${j ? 18 : 0}">${xml(line)}</tspan>`).join("")}</text></g>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${layout.width} ${layout.height}" width="${layout.width}" height="${layout.height}" role="img" aria-labelledby="synapse-diagram-title synapse-diagram-desc"><title id="synapse-diagram-title">${xml(clean(diagram.title || "Concept diagram"))}</title><desc id="synapse-diagram-desc">${xml(diagram.nodes.map((n) => clean(n.label)).join(", "))}. Connections: ${xml(diagram.edges.map((e) => `${e.from} ${clean(e.label)} ${e.to}`).join("; "))}.</desc><defs><style>${fontCss}</style><marker id="synapse-diagram-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="${t.muted}"/></marker></defs>${edges}${nodes}</svg>`;
}
