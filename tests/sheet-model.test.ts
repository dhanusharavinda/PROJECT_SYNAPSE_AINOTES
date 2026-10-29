import { expect, it } from "vitest";
import {
  eraseStrokes,
  rebaseScene,
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
it("resizes a long text box in both directions without increasing its font size", () => {
  const item = {
    ...stroke,
    kind: "text" as const,
    width: 400,
    height: 200,
    text: "Long explanation ".repeat(50),
    textScale: 1,
  };
  expect(resizeItem(item, 250, -120)).toMatchObject({
    width: 650,
    height: 80,
    textScale: 1,
    fitted: true,
  });
});
it("erases a rotated highlighter where it is displayed and retains its opacity", () => {
  const rotated = { ...stroke, rotation: 90, opacity: 0.32 };
  const parts = eraseStrokes([rotated], [154, 204], [154, 204], 5);
  expect(parts).toHaveLength(2);
  expect(parts.every((p) => p.rotation === 0 && p.opacity === 0.32)).toBe(true);
  expect(eraseStrokes([rotated], [0, 0], [0, 0], 5)).toEqual([rotated]);
});
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

it("undoes a local object action without removing a collaborator's added object", () => {
  const before = { height: 600, width: 1100, items: [stroke] },
    after = { ...before, items: [{ ...stroke, x: 200 }] },
    other = { ...stroke, id: crypto.randomUUID(), x: 500 };
  const current = { ...after, items: [...after.items, other] },
    r = rebaseScene(current, after, before);
  expect(r.scene.items.map((i) => i.x)).toEqual([100, 500]);
  expect(r.conflicts).toBe(0);
});
it("keeps newer remote changes to the same object when undo would overwrite them", () => {
  const before = { height: 600, width: 1100, items: [stroke] },
    after = { ...before, items: [{ ...stroke, x: 200 }] },
    current = { ...after, items: [{ ...stroke, x: 350 }] };
  const r = rebaseScene(current, after, before);
  expect(r.scene.items[0].x).toBe(350);
  expect(r.conflicts).toBe(1);
});
