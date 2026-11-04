// @vitest-environment jsdom
import React from "react";
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  act,
} from "@testing-library/react";
import NotebookSheet, { type SheetHandle } from "../src/NotebookSheet";
import type { CanvasItem } from "../src/types";
vi.mock("../src/RichEditor", () => ({
  default: React.forwardRef((props: any, ref) => {
    React.useImperativeHandle(ref, () => ({
      getEditor: () => ({ commands: { focus: () => {} } }),
    }));
    return React.createElement("textarea", {
      "aria-label": "Placed text",
      value: props.value || "",
      onChange: (e: any) => props.onChange(e.target.value),
    });
  }),
}));
beforeEach(() => {
  localStorage.clear();
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
        this.pressure = init.pressure ?? 0.5;
      }
    },
  );
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.body.classList.remove("tablet-mode");
  vi.unstubAllGlobals();
});
it.each(["pen", "mouse"])(
  "opens a persistent wheel on a stationary %s hold without saving an ink dot",
  (pointerType) => {
    vi.useFakeTimers();
    const { changed, sheet } = setup();
    fireEvent.pointerDown(sheet, {
      pointerId: 5,
      pointerType,
      clientX: 200,
      clientY: 200,
      button: 0,
    });
    act(() => vi.advanceTimersByTime(550));
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.pointerUp(sheet, { pointerId: 5, pointerType });
    act(() => vi.advanceTimersByTime(1500));
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(changed).not.toHaveBeenCalled();
    // Closing the wheel must leave the next stroke usable, including a reused pen ID.
    fireEvent.pointerDown(document.body, { pointerId: 5, pointerType: "pen" });
    fireEvent.pointerDown(sheet, {
      pointerId: 5,
      pointerType: "pen",
      clientX: 100,
      clientY: 100,
      button: 0,
    });
    fireEvent.pointerUp(sheet, { pointerId: 5, pointerType: "pen" });
    expect(changed.mock.calls.at(-1)![0].items).toHaveLength(1);
  },
);
it("keeps a moving pen stroke instead of opening the hold wheel", () => {
  vi.useFakeTimers();
  const { changed, sheet } = setup();
  fireEvent.pointerDown(sheet, {
    pointerId: 8,
    pointerType: "pen",
    clientX: 100,
    clientY: 100,
    button: 0,
  });
  fireEvent.pointerMove(sheet, {
    pointerId: 8,
    pointerType: "pen",
    clientX: 140,
    clientY: 130,
  });
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.queryByRole("menu")).toBeNull();
  fireEvent.pointerUp(sheet, { pointerId: 8, pointerType: "pen" });
  expect(changed.mock.calls.at(-1)![0].items).toHaveLength(1);
});
it("pans with the hand tool and ignores unrelated palm movement and cancellation", () => {
  const { changed, sheet } = setup();
  fireEvent.click(screen.getByRole("button", { name: "Hand tool" }));
  const scroll = sheet.parentElement!;
  scroll.scrollLeft = 120;
  scroll.scrollTop = 200;
  fireEvent.pointerDown(sheet, {
    pointerId: 4,
    pointerType: "pen",
    clientX: 100,
    clientY: 100,
    button: 0,
  });
  fireEvent.pointerMove(scroll, {
    pointerId: 22,
    pointerType: "touch",
    clientX: 500,
    clientY: 500,
  });
  fireEvent.pointerCancel(scroll, { pointerId: 22, pointerType: "touch" });
  expect(scroll.scrollTop).toBe(200);
  fireEvent.pointerMove(scroll, {
    pointerId: 4,
    pointerType: "pen",
    clientX: 80,
    clientY: 60,
  });
  fireEvent.pointerUp(scroll, { pointerId: 4, pointerType: "pen" });
  expect(scroll.scrollLeft).toBe(140);
  expect(scroll.scrollTop).toBe(240);
  expect(changed).not.toHaveBeenCalled();
});
it("lets a pen take over from finger panning without losing its stroke", () => {
  const { changed, sheet } = setup();
  fireEvent.pointerDown(sheet, {
    pointerId: 3,
    pointerType: "touch",
    clientX: 100,
    clientY: 100,
    button: 0,
  });
  fireEvent.pointerDown(sheet, {
    pointerId: 4,
    pointerType: "pen",
    clientX: 100,
    clientY: 100,
    button: 0,
  });
  fireEvent.pointerCancel(sheet, { pointerId: 3, pointerType: "touch" });
  fireEvent.pointerMove(sheet, {
    pointerId: 4,
    pointerType: "pen",
    clientX: 130,
    clientY: 140,
  });
  fireEvent.pointerUp(sheet, { pointerId: 4, pointerType: "pen" });
  expect(changed.mock.calls.at(-1)![0].items).toHaveLength(1);
});
it("fills the viewport on request and exits focus with Escape", () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Canvas focus" }));
  expect(
    screen
      .getByRole("region", { name: "Notebook sheet" })
      .classList.contains("canvas-focus"),
  ).toBe(true);
  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.getByRole("button", { name: "Canvas focus" })).toBeTruthy();
});
it("does not save objects from blank taps and discards the empty typing caret on blur", () => {
  const { changed, sheet } = setup();
  fireEvent.click(screen.getByRole("button", { name: "Write tool" }));
  for (const x of [100, 200, 300])
    fireEvent.pointerDown(sheet, {
      button: 0,
      clientX: x,
      clientY: 200,
      pointerType: "mouse",
    });
  expect(changed).not.toHaveBeenCalled();
  expect(screen.getAllByRole("textbox", { name: "Placed text" })).toHaveLength(
    1,
  );
  fireEvent.blur(screen.getByRole("textbox", { name: "Placed text" }), {
    relatedTarget: screen.getByRole("button", { name: "Pen tool" }),
  });
  expect(sheet.querySelectorAll("[data-object-id]")).toHaveLength(0);
  expect(changed).not.toHaveBeenCalled();
});
it("saves a placed object only when it contains text and removes it again when emptied", () => {
  const { changed, sheet } = setup();
  fireEvent.click(screen.getByRole("button", { name: "Write tool" }));
  fireEvent.pointerDown(sheet, {
    button: 0,
    clientX: 100,
    clientY: 100,
    pointerType: "mouse",
  });
  const input = screen.getByRole("textbox", { name: "Placed text" });
  fireEvent.change(input, { target: { value: "Study note" } });
  expect(changed.mock.calls.at(-1)![0].items).toHaveLength(1);
  expect(changed.mock.calls.at(-1)![0].items[0].text).toBe("Study note");
  fireEvent.change(input, { target: { value: "" } });
  expect(changed.mock.calls.at(-1)![0].items).toHaveLength(0);
  fireEvent.change(input, { target: { value: "Start again" } });
  expect(changed.mock.calls.at(-1)![0].items).toHaveLength(1);
  expect(changed.mock.calls.at(-1)![0].items[0].text).toBe("Start again");
});
it.each([0.85, 0.2])(
  "selects with the separate Select tool regardless of pressure (%s)",
  (pressure) => {
    const { changed, sheet } = setup([
      { id: "shape", kind: "rectangle", x: 100, y: 100, width: 40, height: 40 },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Canvas focus" }));
    fireEvent.click(screen.getByRole("button", { name: "Select tool" }));
    expect(
      screen
        .getByRole("button", { name: "Hand tool" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    fireEvent.pointerDown(sheet, {
      button: 0,
      pointerId: 9,
      pointerType: "pen",
      pressure,
      clientX: 50,
      clientY: 50,
    });
    fireEvent.pointerMove(sheet, {
      pointerId: 9,
      pointerType: "pen",
      pressure: 0.85,
      clientX: 200,
      clientY: 200,
    });
    fireEvent.pointerUp(sheet, {
      pointerId: 9,
      pointerType: "pen",
      clientX: 200,
      clientY: 200,
    });
    expect(changed).not.toHaveBeenCalled();
    const remove = screen.getByRole("button", {
      name: "Delete selected objects",
    }) as HTMLButtonElement;
    expect(remove.disabled).toBe(false);
    fireEvent.click(remove);
    expect(changed.mock.calls.at(-1)![0].items).toHaveLength(0);
  },
);
it("keeps the Hand tool panning even with firm pressure and Shift", () => {
  const { changed, sheet } = setup();
  fireEvent.click(screen.getByRole("button", { name: "Hand tool" }));
  const scroll = sheet.parentElement!;
  scroll.scrollTop = 200;
  fireEvent.pointerDown(sheet, {
    button: 0,
    pointerId: 9,
    pointerType: "pen",
    pressure: 0.9,
    shiftKey: true,
    clientX: 100,
    clientY: 100,
  });
  fireEvent.pointerMove(scroll, {
    pointerId: 9,
    pointerType: "pen",
    pressure: 0.2,
    clientX: 100,
    clientY: 80,
  });
  fireEvent.pointerMove(scroll, {
    pointerId: 9,
    pointerType: "pen",
    pressure: 0.9,
    clientX: 100,
    clientY: 60,
  });
  fireEvent.pointerUp(scroll, { pointerId: 9, pointerType: "pen" });
  expect(scroll.scrollTop).toBe(240);
  expect(sheet.querySelector(".selection-marquee")).toBeNull();
  expect(changed).not.toHaveBeenCalled();
});
it("discards queued zoom when a pen stroke has started", () => {
  vi.useFakeTimers();
  const { sheet } = setup();
  fireEvent.wheel(sheet.parentElement!, {
    ctrlKey: true,
    deltaY: -100,
    clientX: 100,
    clientY: 100,
  });
  fireEvent.pointerDown(sheet, {
    button: 0,
    pointerId: 1,
    pointerType: "pen",
    clientX: 100,
    clientY: 100,
  });
  act(() => vi.advanceTimersByTime(30));
  expect(sheet.style.zoom).toBe("1");
  fireEvent.pointerUp(sheet, {
    pointerId: 1,
    pointerType: "pen",
    clientX: 100,
    clientY: 100,
  });
});
it("recovers drawing after spacedesk loses pointer capture", () => {
  const { changed, sheet } = setup();
  fireEvent.pointerDown(sheet, {
    pointerId: 11,
    pointerType: "pen",
    button: 0,
    clientX: 100,
    clientY: 100,
  });
  fireEvent.lostPointerCapture(sheet, { pointerId: 11, pointerType: "pen" });
  fireEvent.pointerDown(sheet, {
    pointerId: 12,
    pointerType: "pen",
    button: 0,
    clientX: 200,
    clientY: 200,
  });
  fireEvent.pointerMove(sheet, {
    pointerId: 12,
    pointerType: "pen",
    clientX: 240,
    clientY: 240,
  });
  fireEvent.pointerUp(sheet, {
    pointerId: 12,
    pointerType: "pen",
    clientX: 240,
    clientY: 240,
  });
  expect(changed).toHaveBeenCalledTimes(1);
  expect(changed.mock.calls[0][0].items).toHaveLength(1);
});
it("recovers when a fresh pen contact arrives without the previous release", () => {
  const { changed, sheet } = setup();
  fireEvent.pointerDown(sheet, {
    pointerId: 11,
    pointerType: "pen",
    button: 0,
    clientX: 100,
    clientY: 100,
  });
  fireEvent.pointerDown(sheet, {
    pointerId: 12,
    pointerType: "pen",
    button: 0,
    clientX: 200,
    clientY: 200,
  });
  fireEvent.pointerUp(sheet, {
    pointerId: 12,
    pointerType: "pen",
    clientX: 200,
    clientY: 200,
  });
  expect(changed).toHaveBeenCalledTimes(1);
  expect(changed.mock.calls[0][0].items).toHaveLength(1);
});
it("commits the stroke tail when pen-up reports zero pressure", () => {
  const { changed, sheet } = setup();
  fireEvent.pointerDown(sheet, {
    pointerId: 11,
    pointerType: "pen",
    button: 0,
    buttons: 1,
    pressure: 0.5,
    clientX: 100,
    clientY: 100,
  });
  fireEvent.pointerMove(sheet, {
    pointerId: 11,
    pointerType: "pen",
    buttons: 1,
    pressure: 0.5,
    clientX: 150,
    clientY: 150,
  });
  fireEvent.pointerUp(sheet, {
    pointerId: 11,
    pointerType: "pen",
    buttons: 0,
    pressure: 0,
    clientX: 160,
    clientY: 160,
  });
  expect(changed).toHaveBeenCalledTimes(1);
  expect(changed.mock.calls[0][0].items).toHaveLength(1);
  expect(changed.mock.calls[0][0].items[0].width).toBeGreaterThan(60);
});
it("preserves moved ink when pointer capture is lost and can undo the recovered stroke", () => {
  const { changed, sheet } = setup();
  fireEvent.pointerDown(sheet, {
    pointerId: 10,
    pointerType: "pen",
    button: 0,
    clientX: 120,
    clientY: 120,
  });
  fireEvent.pointerMove(sheet, {
    pointerId: 10,
    pointerType: "pen",
    clientX: 180,
    clientY: 190,
  });
  fireEvent.lostPointerCapture(sheet, { pointerId: 10, pointerType: "pen" });
  expect(changed).toHaveBeenCalledTimes(1);
  expect(changed.mock.calls[0][0].items[0].height).toBeGreaterThan(70);
  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  expect(changed.mock.calls.at(-1)![0].items).toHaveLength(0);
});
it.each(["flush", "unmount"])("retains an unfinished stroke on %s", (mode) => {
  const changed = vi.fn(),
    ref = React.createRef<SheetHandle>();
  const { unmount } = render(
    <NotebookSheet
      ref={ref}
      value={{ width: 1100, height: 700, items: [] }}
      onChange={changed}
      onImage={() => {}}
    >
      <p>Notebook</p>
    </NotebookSheet>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Pen tool" }));
  const sheet = screen.getByRole("group", {
    name: "Write and draw on this page",
  });
  fireEvent.pointerDown(sheet, {
    pointerId: 10,
    pointerType: "pen",
    button: 0,
    clientX: 100,
    clientY: 100,
  });
  fireEvent.pointerMove(sheet, {
    pointerId: 10,
    pointerType: "pen",
    clientX: 150,
    clientY: 180,
  });
  if (mode === "flush") act(() => ref.current!.flush());
  unmount();
  expect(changed).toHaveBeenCalledTimes(1);
  expect(changed.mock.calls[0][0].items[0].height).toBeGreaterThan(80);
});
it("keeps remote objects received during an unfinished local stroke", () => {
  const changed = vi.fn();
  const initial = { width: 1100, height: 700, items: [] as CanvasItem[] };
  const { rerender } = render(
    <NotebookSheet value={initial} onChange={changed} onImage={() => {}}>
      <p>Notebook</p>
    </NotebookSheet>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Pen tool" }));
  const sheet = screen.getByRole("group", {
    name: "Write and draw on this page",
  });
  fireEvent.pointerDown(sheet, {
    pointerId: 10,
    pointerType: "pen",
    button: 0,
    clientX: 100,
    clientY: 100,
  });
  const remote: CanvasItem = {
    id: "remote",
    kind: "rectangle",
    x: 300,
    y: 300,
    width: 40,
    height: 40,
  };
  rerender(
    <NotebookSheet
      value={{ ...initial, items: [remote] }}
      onChange={changed}
      onImage={() => {}}
    >
      <p>Notebook</p>
    </NotebookSheet>,
  );
  fireEvent.pointerMove(sheet, {
    pointerId: 10,
    pointerType: "pen",
    clientX: 150,
    clientY: 180,
  });
  fireEvent.pointerUp(sheet, {
    pointerId: 10,
    pointerType: "pen",
    clientX: 150,
    clientY: 180,
  });
  const saved = changed.mock.calls.at(-1)![0].items;
  expect(saved).toHaveLength(2);
  expect(saved.find((i: CanvasItem) => i.id === "remote")).toEqual(remote);
  expect(saved.some((i: CanvasItem) => i.kind === "pen")).toBe(true);
});
it("retains the beginning and end of a stroke longer than the per-object sample limit", () => {
  const { changed, sheet } = setup();
  fireEvent.pointerDown(sheet, {
    pointerId: 10,
    pointerType: "pen",
    button: 0,
    clientX: 100,
    clientY: 100,
  });
  const move = new PointerEvent("pointermove", {
    pointerId: 10,
    pointerType: "pen",
    clientX: 1800,
    clientY: 200,
    bubbles: true,
  });
  Object.defineProperty(move, "getCoalescedEvents", {
    value: () =>
      Array.from({ length: 17000 }, (_, n) => ({
        clientX: 100 + (n + 1) / 10,
        clientY: 100 + (n + 1) / 170,
        pointerType: "pen",
        pressure: 0.5,
        timeStamp: n,
      })),
  });
  fireEvent(sheet, move);
  fireEvent.pointerUp(sheet, {
    pointerId: 10,
    pointerType: "pen",
    clientX: 1800,
    clientY: 200,
  });
  const saved = changed.mock.calls.at(-1)![0].items;
  expect(saved).toHaveLength(2);
  expect(saved.every((i: CanvasItem) => i.points!.length <= 15000)).toBe(true);
  expect(
    saved.reduce((sum: number, i: CanvasItem) => sum + i.points!.length, 0),
  ).toBe(17002);
  expect(saved[0].x + saved[0].points[0][0]).toBeCloseTo(100);
  expect(saved[1].x + saved[1].points.at(-1)[0]).toBeCloseTo(1800);
});
it("paints active ink without rerendering the page on every pointer frame", () => {
  vi.useFakeTimers();
  const painted = vi.fn();
  render(
    <React.Profiler id="sheet" onRender={painted}>
      <NotebookSheet
        value={{ width: 1100, height: 700, items: [] }}
        onChange={() => {}}
        onImage={() => {}}
      >
        <p>Notebook</p>
      </NotebookSheet>
    </React.Profiler>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Pen tool" }));
  const sheet = screen.getByRole("group", {
    name: "Write and draw on this page",
  });
  fireEvent.pointerDown(sheet, {
    pointerId: 10,
    pointerType: "pen",
    button: 0,
    clientX: 100,
    clientY: 100,
  });
  act(() => vi.advanceTimersByTime(20));
  const count = painted.mock.calls.length;
  for (let n = 1; n <= 8; n++) {
    fireEvent.pointerMove(sheet, {
      pointerId: 10,
      pointerType: "pen",
      clientX: 100 + n * 10,
      clientY: 100 + n * 4,
    });
    act(() => vi.advanceTimersByTime(20));
  }
  expect(painted).toHaveBeenCalledTimes(count);
  expect(
    sheet.querySelector(".sheet-live-ink path")?.getAttribute("d"),
  ).toContain("Q");
  fireEvent.pointerUp(sheet, {
    pointerId: 10,
    pointerType: "pen",
    clientX: 180,
    clientY: 132,
  });
});
it("pinches to zoom around the fingers and keeps touches out of the drawing", () => {
  vi.useFakeTimers();
  const { changed, sheet } = setup();
  fireEvent.pointerDown(sheet, {
    pointerId: 20,
    pointerType: "touch",
    button: 0,
    clientX: 100,
    clientY: 200,
  });
  fireEvent.pointerDown(sheet, {
    pointerId: 21,
    pointerType: "touch",
    button: 0,
    clientX: 200,
    clientY: 200,
  });
  fireEvent.pointerMove(sheet.parentElement!, {
    pointerId: 21,
    pointerType: "touch",
    clientX: 300,
    clientY: 200,
  });
  act(() => vi.advanceTimersByTime(20));
  expect(Number(sheet.style.zoom)).toBe(2);
  fireEvent.pointerUp(sheet.parentElement!, {
    pointerId: 21,
    pointerType: "touch",
  });
  fireEvent.pointerUp(sheet.parentElement!, {
    pointerId: 20,
    pointerType: "touch",
  });
  expect(changed).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Reset zoom" }));
  expect(Number(sheet.style.zoom)).toBe(1);
});
it("keeps all tools available when the wheel and pen hold are disabled", () => {
  vi.useFakeTimers();
  const { changed, sheet } = setup();
  fireEvent.click(screen.getByRole("button", { name: "Brush settings" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Tool wheel" }));
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  expect(localStorage.getItem("synapse-tool-wheel")).toBe("false");
  fireEvent.contextMenu(sheet, { clientX: 100, clientY: 200 });
  expect(screen.queryByRole("menu")).toBeNull();
  fireEvent.pointerDown(sheet, {
    pointerId: 10,
    pointerType: "pen",
    button: 0,
    clientX: 120,
    clientY: 120,
  });
  act(() => vi.advanceTimersByTime(600));
  expect(screen.queryByRole("menu")).toBeNull();
  fireEvent.pointerUp(sheet, {
    pointerId: 10,
    pointerType: "pen",
    clientX: 120,
    clientY: 120,
  });
  expect(changed.mock.calls.at(-1)![0].items).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "All tools" }));
  fireEvent.click(screen.getByRole("button", { name: "Insert" }));
  expect(screen.getByRole("menuitem", { name: "Add table" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Shapes" }));
  expect(screen.getByRole("menuitem", { name: "Triangle" })).toBeTruthy();
  fireEvent.keyDown(window, { key: "Escape" });
  fireEvent.click(screen.getByRole("button", { name: "Canvas focus" }));
  fireEvent.click(screen.getByRole("button", { name: "All tools" }));
  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.queryByRole("menu")).toBeNull();
  expect(
    screen.getByRole("button", { name: "Exit canvas focus" }),
  ).toBeTruthy();
});
it("clears an interrupted pan on blur so drawing and typing can resume", () => {
  const { changed, sheet } = setup();
  fireEvent.click(screen.getByRole("button", { name: "Hand tool" }));
  fireEvent.pointerDown(sheet, {
    pointerId: 5,
    pointerType: "pen",
    button: 0,
    clientX: 100,
    clientY: 100,
  });
  fireEvent.blur(window);
  fireEvent.click(screen.getByRole("button", { name: "Pen tool" }));
  fireEvent.pointerDown(sheet, {
    pointerId: 6,
    pointerType: "pen",
    button: 0,
    clientX: 200,
    clientY: 200,
  });
  fireEvent.pointerUp(sheet, {
    pointerId: 6,
    pointerType: "pen",
    clientX: 200,
    clientY: 200,
  });
  expect(changed.mock.calls.at(-1)![0].items).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Write tool" }));
  fireEvent.pointerDown(sheet, {
    pointerId: 7,
    pointerType: "mouse",
    button: 0,
    clientX: 300,
    clientY: 300,
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Placed text" }), {
    target: { value: "Input recovered" },
  });
  expect(changed.mock.calls.at(-1)![0].items.at(-1).text).toBe(
    "Input recovered",
  );
});
it("ignores legacy empty text boxes during rendering and selection, then drops them on a real edit", () => {
  const { changed, sheet } = setup([
    {
      id: "empty",
      kind: "text",
      text: "",
      x: 60,
      y: 60,
      width: 80,
      height: 40,
    },
  ]);
  expect(sheet.querySelectorAll(".sheet-object")).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Select tool" }));
  fireEvent.pointerDown(sheet, {
    button: 0,
    pointerId: 1,
    pointerType: "pen",
    pressure: 0.9,
    clientX: 0,
    clientY: 0,
  });
  fireEvent.pointerMove(sheet, {
    pointerId: 1,
    pointerType: "pen",
    pressure: 0.9,
    clientX: 200,
    clientY: 200,
  });
  fireEvent.pointerUp(sheet, {
    pointerId: 1,
    pointerType: "pen",
    clientX: 200,
    clientY: 200,
  });
  expect(
    (
      screen.getByRole("button", {
        name: "Delete selected objects",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(changed).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Pen tool" }));
  fireEvent.pointerDown(sheet, {
    button: 0,
    pointerId: 1,
    pointerType: "pen",
    clientX: 300,
    clientY: 300,
  });
  fireEvent.pointerUp(sheet, {
    pointerId: 1,
    pointerType: "pen",
    clientX: 300,
    clientY: 300,
  });
  expect(changed.mock.calls.at(-1)![0].items).toHaveLength(1);
  expect(changed.mock.calls.at(-1)![0].items[0].kind).toBe("pen");
});
function setup(items: CanvasItem[] = []) {
  const changed = vi.fn();
  render(
    <div className="tablet-pencil">
      <NotebookSheet
        value={{ width: 1100, height: 600, items }}
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
