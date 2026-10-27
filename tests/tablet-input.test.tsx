// @vitest-environment jsdom
import React from "react";
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import NotebookSheet from "../src/NotebookSheet";
vi.mock("../src/RichEditor", () => ({
  default: () => React.createElement("div"),
}));
beforeEach(() => {
  document.body.classList.add("tablet-mode");
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "PointerEvent",
    class extends MouseEvent {
      pointerId: number;
      pointerType: string;
      pressure: number;
      constructor(type: string, init: any = {}) {
        super(type, init);
        this.pointerId = init.pointerId || 1;
        this.pointerType = init.pointerType || "pen";
        this.pressure = init.pressure || 0.5;
      }
    },
  );
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});
afterEach(() => {
  cleanup();
  document.body.classList.remove("tablet-mode");
  vi.unstubAllGlobals();
});
function setup() {
  const changed = vi.fn();
  render(
    <div className="tablet-pencil">
      <NotebookSheet
        value={{ width: 1100, height: 600, items: [] }}
        onChange={changed}
        onImage={() => {}}
        onDrawing={() => {}}
      >
        <div />
      </NotebookSheet>
    </div>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Pen tool" }));
  return {
    changed,
    sheet: screen.getByRole("group", { name: "Write and draw on this page" }),
  };
}
it("does not let a second touch or its cancellation erase the active pen gesture", () => {
  const { changed, sheet } = setup();
  fireEvent.pointerDown(sheet, {
    pointerId: 11,
    pointerType: "pen",
    clientX: 100,
    clientY: 150,
    button: 0,
  });
  fireEvent.pointerDown(sheet, {
    pointerId: 22,
    pointerType: "touch",
    clientX: 400,
    clientY: 400,
    button: 0,
  });
  fireEvent.pointerCancel(sheet, { pointerId: 22, pointerType: "touch" });
  fireEvent.pointerMove(sheet, {
    pointerId: 11,
    pointerType: "pen",
    clientX: 130,
    clientY: 180,
    pressure: 0.8,
  });
  fireEvent.pointerUp(sheet, {
    pointerId: 11,
    pointerType: "pen",
    clientX: 130,
    clientY: 180,
  });
  expect(changed).toHaveBeenCalledTimes(1);
  const saved = changed.mock.calls[0][0].items;
  expect(saved).toHaveLength(1);
  expect(saved[0].kind).toBe("pen");
  expect(saved[0].pressures.some((p: number) => p > 1)).toBe(true);
});
it("ignores finger ink by default and keeps pen dots undoable", () => {
  const { changed, sheet } = setup();
  fireEvent.pointerDown(sheet, {
    pointerId: 2,
    pointerType: "touch",
    clientX: 50,
    clientY: 50,
    button: 0,
  });
  fireEvent.pointerUp(sheet, {
    pointerId: 2,
    pointerType: "touch",
    clientX: 50,
    clientY: 50,
  });
  expect(changed).not.toHaveBeenCalled();
  fireEvent.pointerDown(sheet, {
    pointerId: 1,
    pointerType: "pen",
    clientX: 100,
    clientY: 100,
    button: 0,
  });
  fireEvent.pointerUp(sheet, {
    pointerId: 1,
    pointerType: "pen",
    clientX: 100,
    clientY: 100,
  });
  expect(changed.mock.calls.at(-1)![0].items).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  expect(changed.mock.calls.at(-1)![0].items).toHaveLength(0);
});
