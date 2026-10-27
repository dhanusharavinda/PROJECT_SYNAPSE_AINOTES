import type { CanvasItem } from "./types";
import type { Point } from "./sheetModel";
export function penWeight(distance: number, elapsed: number, previous = 1) {
  const speed = distance / Math.max(4, elapsed);
  const target = 1.1 - 0.24 * Math.min(1, speed / 1.8);
  return previous * 0.72 + target * 0.28;
}
// Smooth the outline, not the pointer position, so the nib remains under the cursor.
export function penOutline(item: CanvasItem) {
  const raw = item.points || [];
  if (raw.length < 2) return "";
  const points = raw.map((p, i): Point => {
    if (i === 0 || i === raw.length - 1) return p;
    return [
      p[0] * 0.75 + (raw[i - 1][0] + raw[i + 1][0]) * 0.125,
      p[1] * 0.75 + (raw[i - 1][1] + raw[i + 1][1]) * 0.125,
    ];
  });
  const left: Point[] = [],
    right: Point[] = [];
  points.forEach((p, i) => {
    const before = points[Math.max(0, i - 1)],
      after = points[Math.min(points.length - 1, i + 1)];
    const dx = after[0] - before[0],
      dy = after[1] - before[1];
    const length = Math.hypot(dx, dy) || 1;
    const radius = ((item.strokeWidth || 2.4) * (item.pressures?.[i] || 1)) / 2;
    left.push([p[0] - (dy / length) * radius, p[1] + (dx / length) * radius]);
    right.push([p[0] + (dy / length) * radius, p[1] - (dx / length) * radius]);
  });
  const outline = [...left, ...right.reverse()];
  const midpoint = (a: Point, b: Point) =>
    `${(a[0] + b[0]) / 2},${(a[1] + b[1]) / 2}`;
  return (
    `M${midpoint(outline.at(-1)!, outline[0])} ` +
    outline
      .map(
        (p, i) =>
          `Q${p[0]},${p[1]} ${midpoint(p, outline[(i + 1) % outline.length])}`,
      )
      .join(" ") +
    " Z"
  );
}
