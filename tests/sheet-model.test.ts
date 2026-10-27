import { expect, it } from "vitest";
import {
  eraseStrokes,
  finishStroke,
  migrateScene,
  resizeItem,
  translate,
} from "../src/sheetModel";
import type { CanvasItem } from "../src/types";
const stroke: CanvasItem = {
  id: crypto.randomUUID(),
  kind: "pen",
  x: 100,
  y: 200,
  width: 108,
  height: 8,
  points: [
    [4, 4],
    [104, 4],
  ],
};
it("moves a group by one precise delta without changing the space between its items", () => {
  const second = { ...stroke, id: crypto.randomUUID(), x: 250, y: 240 };
  const moved = translate([stroke, second], [stroke.id, second.id], 95, 45);
  expect(moved.map((i) => [i.x, i.y])).toEqual([
    [195, 245],
    [345, 285],
  ]);
  expect(
    translate(
      moved,
      moved.map((i) => i.id),
      -1000,
      -1000,
    ).map((i) => [i.x, i.y]),
  ).toEqual([
    [0, 0],
    [150, 40],
  ]);
});
it("converts old relative positions only once and preserves rendered geometry", () => {
  const before = { height: 400, items: [stroke] },
    migrated = migrateScene(before, 1400);
  expect(migrated.items[0]).toMatchObject({ x: 140, y: 280, width: 151.2 });
  expect(migrateScene(migrated, 800)).toBe(migrated);
});
it("supports a visible pen dot and erases a portion without deleting the rest of a stroke", () => {
  const dot = finishStroke({
    ...stroke,
    width: 1,
    height: 1,
    points: [[0, 0]],
  });
  expect(dot.points).toEqual([[4, 4]]);
  expect(dot.width).toBeGreaterThan(2);
  const split = eraseStrokes([stroke], [150, 190], [150, 215], 5);
  expect(split).toHaveLength(2);
  expect(split[0].id).not.toBe(split[1].id);
  expect(split.every((i) => i.width < stroke.width)).toBe(true);
  expect(eraseStrokes([dot], [100, 200], [100, 200])).toHaveLength(0);
});
it("changes both dimensions of a table while preserving image proportions", () => {
  expect(
    resizeItem(
      { ...stroke, kind: "table", width: 400, height: 200 },
      -100,
      -100,
    ),
  ).toMatchObject({ width: 300, height: 100 });
  expect(
    resizeItem(
      { ...stroke, kind: "image", width: 400, height: 200 },
      -100,
      -100,
    ),
  ).toMatchObject({ width: 200, height: 100 });
});
