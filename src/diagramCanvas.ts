import { diagramLayout, diagramTokens, type Diagram } from "./diagramDesign";
import type { CanvasItem, NoteCanvas } from "./types";
// Portable editable objects can sync through the existing collaboration protocol.
export function appendDiagram(
  canvas: NoteCanvas | undefined,
  diagram: Diagram,
): NoteCanvas {
  const base = canvas || { width: 1000, height: 0, items: [] };
  const layout = diagramLayout(diagram),
    scale = Math.min(1, ((base.width || 1000) - 64) / layout.width);
  const y =
    Math.max(240, base.height, ...base.items.map((i) => i.y + i.height)) + 24;
  const items: CanvasItem[] = [];
  const text = (
    x: number,
    top: number,
    width: number,
    height: number,
    value: string,
  ) => {
    items.push({
      id: crypto.randomUUID(),
      kind: "text",
      color: diagramTokens.ink,
      x: 32 + x * scale,
      y: y + top * scale,
      width: Math.max(40, width * scale),
      height: Math.max(24, height * scale),
      textScale: Math.max(0.65, scale),
      text: value.replace(/([\\`*_{}[\]<>#])/g, "\\$1"),
    });
  };
  for (const edge of layout.edges) {
    // Preserve routed edge segments and the terminal arrow direction.
    for (let i = 1; i < edge.points.length; i++) {
      const a = edge.points[i - 1],
        b = edge.points[i],
        left = Math.min(a[0], b[0]),
        top = Math.min(a[1], b[1]);
      items.push({
        id: crypto.randomUUID(),
        kind: i === edge.points.length - 1 ? "arrow" : "line",
        x: 32 + left * scale,
        y: y + top * scale,
        width: Math.max(2, Math.abs(a[0] - b[0]) * scale),
        height: Math.max(2, Math.abs(a[1] - b[1]) * scale),
        points: [
          [(a[0] - left) * scale, (a[1] - top) * scale],
          [(b[0] - left) * scale, (b[1] - top) * scale],
        ],
        color: diagramTokens.muted,
        strokeWidth: 1.5,
      });
    }
    if (edge.label)
      text(edge.labelX - 40, edge.labelY - 12, 120, 32, edge.label);
  }
  for (const node of layout.nodes) {
    const left = node.x - node.width / 2,
      top = node.y - node.height / 2;
    items.push({
      id: crypto.randomUUID(),
      kind:
        node.kind === "decision"
          ? "diamond"
          : node.kind === "terminal"
            ? "ellipse"
            : "rectangle",
      x: 32 + left * scale,
      y: y + top * scale,
      width: node.width * scale,
      height: node.height * scale,
      fill: diagramTokens.paper,
      color: diagramTokens.muted,
      strokeWidth: 1.5,
    });
    text(left + 14, top + 12, node.width - 28, node.height - 24, node.label);
  }
  const height = y + layout.height * scale + 40;
  if (items.length + base.items.length > 1500 || height > 100000)
    throw new Error("This page is full. Insert the diagram on a new page.");
  return { ...base, height, items: [...base.items, ...items] };
}
