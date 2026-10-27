import type { CanvasItem, NoteCanvas } from "./types";
export type Point = [number, number];
export const shapeKinds = [
  "pen",
  "arrow",
  "rectangle",
  "ellipse",
  "diamond",
  "triangle",
  "line",
];
export const sameScene = (a?: NoteCanvas, b?: NoteCanvas) =>
  JSON.stringify(a) === JSON.stringify(b);
export function translate(
  items: CanvasItem[],
  ids: string[],
  dx: number,
  dy: number,
) {
  const picked = items.filter((i) => ids.includes(i.id));
  dx = Math.max(dx, -Math.min(...picked.map((i) => i.x)));
  dy = Math.max(dy, -Math.min(...picked.map((i) => i.y)));
  return items.map((i) =>
    ids.includes(i.id) ? { ...i, x: i.x + dx, y: i.y + dy } : i,
  );
}
export function resizeItem(
  item: CanvasItem,
  dx: number,
  dy: number,
): CanvasItem {
  const media = ["image", "drawing"].includes(item.kind);
  const ratio =
    Math.abs(dx / item.width) >= Math.abs(dy / item.height)
      ? dx / item.width
      : dy / item.height;
  const width = Math.max(
    16,
    media ? item.width * (1 + ratio) : item.width + dx,
  );
  const height = media
    ? Math.max(8, (item.height * width) / item.width)
    : Math.max(
        item.kind === "table"
          ? Math.max(
              1,
              (item.text || "")
                .split("\n")
                .filter(
                  (line) =>
                    line.trim().startsWith("|") &&
                    !/^\s*\|[\s|:-]+\|\s*$/.test(line),
                ).length,
            ) * 28
          : 16,
        item.height + dy,
      );
  return {
    ...item,
    width,
    height,
    points: item.points?.map(([x, y]) => [
      (x * width) / item.width,
      (y * height) / item.height,
    ]),
  };
}
export function finishStroke(item: CanvasItem): CanvasItem {
  const points = item.points || [[0, 0]],
    minX = Math.min(...points.map((p) => p[0])),
    minY = Math.min(...points.map((p) => p[1]));
  const maxX = Math.max(...points.map((p) => p[0])),
    maxY = Math.max(...points.map((p) => p[1])),
    pad = Math.max(4, (item.strokeWidth || 2.4) / 2 + 1);
  return {
    ...item,
    x: Math.max(0, item.x + minX - pad),
    y: Math.max(0, item.y + minY - pad),
    width: Math.max(1, maxX - minX) + pad * 2,
    height: Math.max(1, maxY - minY) + pad * 2,
    points: points.map(([x, y]) => [x - minX + pad, y - minY + pad]),
  };
}
function distance(p: Point, a: Point, b: Point) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    len = dx * dx + dy * dy,
    t = len
      ? Math.max(
          0,
          Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len),
        )
      : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
export function strokeCrosses(
  item: CanvasItem,
  a: Point,
  b: Point,
  radius = 9,
) {
  if (item.kind !== "pen") return false;
  const pad = radius + (item.strokeWidth || 2.4) / 2;
  if (
    Math.max(a[0], b[0]) + pad < item.x ||
    Math.min(a[0], b[0]) - pad > item.x + item.width ||
    Math.max(a[1], b[1]) + pad < item.y ||
    Math.min(a[1], b[1]) - pad > item.y + item.height
  )
    return false;
  const pts = item.points || [],
    steps = Math.max(
      1,
      Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / Math.max(2, radius / 2)),
    );
  for (let i = 0; i <= steps; i++) {
    const p: Point = [
      a[0] + ((b[0] - a[0]) * i) / steps - item.x,
      a[1] + ((b[1] - a[1]) * i) / steps - item.y,
    ];
    if (
      pts.some(
        (p2, j) =>
          distance(p, pts[Math.max(0, j - 1)], p2) <=
          radius + (item.strokeWidth || 2.4) / 2,
      )
    )
      return true;
  }
  return false;
}
export function migrateScene(value: NoteCanvas, width: number): NoteCanvas {
  if (value.width) return value;
  const scale = width / 1000;
  return {
    ...value,
    width,
    height: value.height * scale,
    items: value.items.map((i) => ({
      ...i,
      x: i.x * scale,
      y: i.y * scale,
      width: i.width * scale,
      height: i.height * scale,
      points: i.points?.map(([x, y]) => [x * scale, y * scale]),
    })),
  };
}
export function eraseStrokes(
  items: CanvasItem[],
  a: Point,
  b: Point,
  radius = 9,
): CanvasItem[] {
  return items.flatMap((item) => {
    if (!strokeCrosses(item, a, b, radius)) return [item];
    const input = item.points || [],
      samples: Point[] = [];
    for (let i = 0; i < input.length; i++) {
      const p = input[i],
        last = input[Math.max(0, i - 1)],
        steps = Math.max(
          1,
          Math.ceil(Math.hypot(p[0] - last[0], p[1] - last[1]) / 2),
        );
      for (let step = 1; step <= steps; step++)
        samples.push([
          last[0] + ((p[0] - last[0]) * step) / steps,
          last[1] + ((p[1] - last[1]) * step) / steps,
        ]);
    }
    const groups: Point[][] = [];
    let group: Point[] = [];
    for (const p of samples) {
      const hit =
        distance([p[0] + item.x, p[1] + item.y], a, b) <=
        radius + (item.strokeWidth || 2.4) / 2;
      if (hit) {
        if (group.length) groups.push(group);
        group = [];
      } else group.push(p);
    }
    if (group.length) groups.push(group);
    return groups.map((points, index) =>
      finishStroke({
        ...item,
        id: index ? crypto.randomUUID() : item.id,
        points,
      }),
    );
  });
}
