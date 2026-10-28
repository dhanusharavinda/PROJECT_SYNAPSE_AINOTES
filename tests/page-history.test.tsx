// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import PageHistory, {
  recoveredItems,
  recoveredDrawingIds,
} from "../src/PageHistory";
import type { Note } from "../src/types";

beforeEach(() =>
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  ),
);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const current: Note = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Current title",
  body: "Keep my new writing",
  context: "",
  group: "",
  revision: 2,
  updated: "2026-10-28T01:00:00Z",
  status: "collected",
  sources: [],
  drawings: [],
  links: [],
  layers: { intuition: "", technical: "", implementation: "" },
  canvas: {
    width: 1000,
    height: 900,
    items: [
      {
        id: "current",
        kind: "text",
        text: "Current placed text",
        x: 100,
        y: 100,
        width: 220,
        height: 60,
      },
    ],
  },
};
const old: Note = {
  ...current,
  body: "A lost paragraph",
  revision: 1,
  canvas: {
    width: 1200,
    height: 900,
    items: [
      {
        id: "old",
        kind: "text",
        text: "A recovered idea",
        x: 100,
        y: 200,
        width: 240,
        height: 90,
      },
    ],
  },
};
it("recovers objects with new IDs without changing current content or the historical source", () => {
  const before = structuredClone(current),
    previous = structuredClone(old);
  const result = recoveredItems(current, old.canvas!.items);
  expect(result.items).toHaveLength(2);
  expect(result.items[0]).toEqual(current.canvas!.items[0]);
  expect(result.items[1].id).not.toBe(old.canvas!.items[0].id);
  expect(result.items[1].text).toBe("A recovered idea");
  expect(current).toEqual(before);
  expect(old).toEqual(previous);
});
it("previews previous writing and restores only selected objects, then prevents duplicate click", () => {
  const restore = vi.fn();
  render(
    <PageHistory
      current={current}
      entries={[{ name: "1-abc.md", markdown: "stored markdown", note: old }]}
      onRestore={restore}
    />,
  );
  expect(screen.getByText("A lost paragraph")).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox"));
  const recover = screen.getByRole("button", { name: "Recover 1 object" });
  fireEvent.click(recover);
  expect(restore).toHaveBeenCalledTimes(1);
  expect(restore.mock.calls[0][0].body).toBeUndefined();
  expect(restore.mock.calls[0][0].canvas.items).toHaveLength(2);
  fireEvent.click(recover);
  expect(restore).toHaveBeenCalledTimes(1);
});
it("restoring writing never replaces current canvas, title, status or connections", () => {
  const restore = vi.fn();
  render(
    <PageHistory
      current={current}
      entries={[{ name: "1-abc.md", markdown: "", note: old }]}
      onRestore={restore}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Restore writing" }));
  expect(restore.mock.calls[0][0].body).toBe("A lost paragraph");
  for (const field of ["canvas", "title", "links", "status"])
    expect(restore.mock.calls[0][0][field]).toBeUndefined();
});
it("shows corrupt versions as inert original text and offers no restore action", () => {
  const { container } = render(
    <PageHistory
      current={current}
      entries={[
        { name: "1-abc.md", markdown: "<script>attack()</script>", note: null },
      ]}
      onRestore={vi.fn()}
    />,
  );
  expect(screen.getByText("<script>attack()</script>")).toBeTruthy();
  expect(container.querySelector("script")).toBeNull();
  expect(screen.queryByRole("button", { name: /restore|recover/i })).toBeNull();
});
it("expands the current canvas to include objects restored from a wider version", () => {
  const result = recoveredItems(current, [
    { ...old.canvas!.items[0], x: 1400, y: 1200 },
  ]);
  expect(result.width).toBeGreaterThanOrEqual(1400 + 16 + 240);
  expect(result.height).toBeGreaterThanOrEqual(1200 + 16 + 90);
});
it("restores only referenced drawings, preserving current attachments and rejecting malformed IDs", () => {
  const id = "22222222-2222-4222-8222-222222222222",
    currentId = "33333333-3333-4333-8333-333333333333";
  const n = { ...current, drawings: [currentId] };
  expect(
    recoveredDrawingIds(
      n,
      [],
      `:::drawing {"id":"${id}"} :::\n:::drawing {"id":"../../private"} :::`,
    ),
  ).toEqual([currentId, id]);
  expect(
    recoveredDrawingIds(n, [
      { ...old.canvas!.items[0], kind: "drawing", drawingId: id },
    ]),
  ).toEqual([currentId, id]);
  expect(recoveredDrawingIds(n, old.canvas!.items)).toEqual([currentId]);
  expect(
    recoveredDrawingIds(
      n,
      [],
      `\`\`\`md\n:::drawing {"id":"${id}"} :::\n\`\`\``,
    ),
  ).toEqual([currentId]);
});
