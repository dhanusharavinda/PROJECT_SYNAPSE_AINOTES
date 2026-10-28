// @vitest-environment jsdom
import React from "react";
import { it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, screen, cleanup } from "@testing-library/react";
import NotebookSheet from "../src/NotebookSheet";
vi.mock("../src/RichEditor", () => ({ default: () => null }));
beforeEach(() => {
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
      constructor(type: string, props: any) {
        super(type, props);
        this.pointerId = props.pointerId || 1;
        this.pointerType = props.pointerType || "mouse";
      }
    },
  );
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = () => true;
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("zooms only with Ctrl/Meta scroll and pans with the middle mouse without creating objects", () => {
  const change = vi.fn();
  const { container } = render(
    <NotebookSheet
      value={{ width: 1000, height: 1400, items: [] }}
      onChange={change}
      onDrawing={() => {}}
      onImage={() => {}}
    >
      <p>Page</p>
    </NotebookSheet>,
  );
  const scroll = container.querySelector<HTMLElement>(".sheet-scroll")!,
    sheet = screen.getByRole("group", { name: "Write and draw on this page" });
  fireEvent.wheel(scroll, { deltaY: -100 });
  expect(sheet.style.zoom).toBe("1");
  fireEvent.wheel(scroll, { deltaY: -100, ctrlKey: true });
  expect(Number(sheet.style.zoom)).toBeGreaterThan(1);
  expect(
    screen.getByRole("button", { name: "Reset canvas zoom" }).textContent,
  ).not.toBe("100%");
  scroll.scrollLeft = 200;
  scroll.scrollTop = 300;
  fireEvent.pointerDown(scroll, {
    button: 1,
    clientX: 400,
    clientY: 300,
    pointerId: 3,
  });
  fireEvent.pointerMove(scroll, { clientX: 350, clientY: 250, pointerId: 3 });
  expect(scroll.scrollLeft).toBe(250);
  expect(scroll.scrollTop).toBe(350);
  fireEvent.pointerUp(scroll, { pointerId: 3 });
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Reset canvas zoom" }));
  expect(sheet.style.zoom).toBe("1");
});
it("exposes drag, rotate, resize and delete for a video selected from its thumbnail", () => {
  const change = vi.fn();
  const { container } = render(
    <NotebookSheet
      value={{
        width: 1000,
        height: 800,
        items: [
          {
            id: crypto.randomUUID(),
            kind: "video",
            src: "https://youtu.be/abcdefghijk",
            text: "Clip",
            x: 20,
            y: 20,
            width: 280,
            height: 210,
          },
        ],
      }}
      onChange={change}
      onDrawing={() => {}}
      onImage={() => {}}
    >
      <p />
    </NotebookSheet>,
  );
  fireEvent.click(screen.getByAltText("Clip"));
  expect(container.querySelector("iframe")).toBeNull();
  expect(screen.getByLabelText("Drag object")).toBeTruthy();
  expect(screen.getByLabelText("Rotate object")).toBeTruthy();
  expect(screen.getByLabelText("Resize object")).toBeTruthy();
  fireEvent.click(screen.getByLabelText("Delete selected objects"));
  expect(change.mock.calls.at(-1)![0].items).toHaveLength(0);
});
