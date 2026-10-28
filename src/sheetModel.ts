import type { CanvasItem, NoteCanvas } from "./types";
export type Point = [number, number];
export const shapeKinds = [
  "paint",
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
    textScale:
      item.kind === "text"
        ? Math.max(
            0.2,
            Math.min(
              20,
              (item.textScale || 1) *
                Math.max(width / item.width, height / item.height),
            ),
          )
        : item.textScale,
    points:
      item.kind === "paint"
        ? item.points
        : item.points?.map(([x, y]) => [
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
export function resizeGroup(
  items: CanvasItem[],
  ids: string[],
  dx: number,
  dy: number,
) {
  const picked = items.filter((i) => ids.includes(i.id));
  if (!picked.length) return items;
  const x = Math.min(...picked.map((i) => i.x)),
    y = Math.min(...picked.map((i) => i.y));
  const w = Math.max(...picked.map((i) => i.x + i.width)) - x,
    h = Math.max(...picked.map((i) => i.y + i.height)) - y;
  const rx = dx / Math.max(1, w),
    ry = dy / Math.max(1, h);
  const sx = Math.max(0.1, 1 + (Math.abs(rx) >= Math.abs(ry) ? rx : ry)),
    sy = sx;
  return items.map((i) =>
    ids.includes(i.id)
      ? {
          ...resizeItem(i, i.width * (sx - 1), i.height * (sy - 1)),
          x: x + (i.x - x) * sx,
          y: y + (i.y - y) * sy,
        }
      : i,
  );
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
      samples: Point[] = [],
      weights: number[] = [];
    for (let i = 0; i < input.length; i++) {
      const p = input[i],
        last = input[Math.max(0, i - 1)],
        steps = Math.max(
          1,
          Math.ceil(Math.hypot(p[0] - last[0], p[1] - last[1]) / 2),
        );
      for (let step = 1; step <= steps; step++) {
        samples.push([
          last[0] + ((p[0] - last[0]) * step) / steps,
          last[1] + ((p[1] - last[1]) * step) / steps,
        ]);
        weights.push(
          (item.pressures?.[Math.max(0, i - 1)] || 1) +
            (((item.pressures?.[i] || 1) -
              (item.pressures?.[Math.max(0, i - 1)] || 1)) *
              step) /
              steps,
        );
      }
    }
    const groups: { points: Point[]; pressures: number[] }[] = [];
    let group: Point[] = [],
      pressureGroup: number[] = [];
    for (const [index, p] of samples.entries()) {
      const hit =
        distance([p[0] + item.x, p[1] + item.y], a, b) <=
        radius + (item.strokeWidth || 2.4) / 2;
      if (hit) {
        if (group.length)
          groups.push({ points: group, pressures: pressureGroup });
        group = [];
        pressureGroup = [];
      } else {
        group.push(p);
        pressureGroup.push(weights[index]);
      }
    }
    if (group.length) groups.push({ points: group, pressures: pressureGroup });
    return groups.map(({ points, pressures }, index) =>
      finishStroke({
        ...item,
        id: index ? crypto.randomUUID() : item.id,
        points,
        pressures,
      }),
    );
  });
}

// Apply only the objects changed by one local action, retaining other people's edits.
export function rebaseScene(
  current: NoteCanvas,
  from: NoteCanvas,
  to: NoteCanvas,
) {
  const eq = (a?: CanvasItem, b?: CanvasItem) =>
    a && b
      ? JSON.stringify(a, Object.keys(a).sort()) ===
        JSON.stringify(b, Object.keys(b).sort())
      : a === b;
  let items = [...current.items],
    conflicts = 0;
  const ids = new Set([...from.items, ...to.items].map((i) => i.id));
  for (const id of ids) {
    const expected = from.items.find((i) => i.id === id),
      desired = to.items.find((i) => i.id === id);
    if (eq(expected, desired)) continue;
    const index = items.findIndex((i) => i.id === id),
      actual = items[index];
    if (!eq(actual, expected)) {
      conflicts++;
      continue;
    }
    if (desired) {
      if (index >= 0) items[index] = desired;
      else
        items.splice(
          Math.min(
            to.items.findIndex((i) => i.id === id),
            items.length,
          ),
          0,
          desired,
        );
    } else if (index >= 0) items.splice(index, 1);
  }
  const fromOrder = from.items.map((i) => i.id),
    toOrder = to.items.map((i) => i.id);
  if (
    fromOrder.length === toOrder.length &&
    fromOrder.every((id) => toOrder.includes(id)) &&
    fromOrder.join() !== toOrder.join() &&
    current.items
      .filter((i) => ids.has(i.id))
      .map((i) => i.id)
      .join() === fromOrder.join()
  ) {
    const ordered = toOrder
      .map((id) => items.find((i) => i.id === id)!)
      .filter(Boolean);
    let cursor = 0;
    items = items.map((i) => (ids.has(i.id) ? ordered[cursor++] : i));
  }
  return {
    scene: {
      ...current,
      width: current.width === from.width ? to.width : current.width,
      height: Math.max(
        current.height === from.height ? to.height : current.height,
        ...items.map((i) => i.y + i.height + 24),
      ),
      items,
    },
    conflicts,
  };
}
