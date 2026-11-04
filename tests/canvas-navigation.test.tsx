// @vitest-environment jsdom
import React from "react";
import { it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  render,
  fireEvent,
  screen,
  cleanup,
  waitFor,
  act,
} from "@testing-library/react";
import NotebookSheet, { type SheetHandle } from "../src/NotebookSheet";
vi.mock("../src/RichEditor", async () => ({
  default: (await import("react")).forwardRef(() => null),
}));
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
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("offers four unique arrow icons and draws four different arrow geometries", () => {
  const icons: string[] = [],
    geometries: string[] = [];
  for (const variant of ["Straight", "Curved", "Elbow", "Double"]) {
    const change = vi.fn();
    const { container } = render(
      <NotebookSheet
        value={{ width: 1000, height: 700, items: [] }}
        onChange={change}
        onImage={() => {}}
      >
        <p>Page</p>
      </NotebookSheet>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open tool wheel" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Arrows" }));
    const button = screen.getByRole("button", { name: variant + " arrow" });
    icons.push(button.querySelector("svg")!.innerHTML);
    fireEvent.click(button);
    const sheet = screen.getByRole("group", {
      name: "Write and draw on this page",
    });
    fireEvent.pointerDown(sheet, {
      pointerId: 1,
      button: 0,
      clientX: 40,
      clientY: 50,
    });
    fireEvent.pointerMove(sheet, { pointerId: 1, clientX: 160, clientY: 140 });
    fireEvent.pointerUp(sheet, { pointerId: 1, clientX: 160, clientY: 140 });
    expect(change.mock.calls.at(-1)![0].items[0].arrowStyle).toBe(
      variant.toLowerCase(),
    );
    const path = container.querySelector("svg.sheet-shape path[marker-end]")!;
    geometries.push(
      JSON.stringify([
        path.getAttribute("d"),
        !!path.getAttribute("marker-start"),
      ]),
    );
    fireEvent.click(screen.getByRole("button", { name: "Open tool wheel" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Draw" }));
    expect(screen.queryByRole("button", { name: "Arrow" })).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "Insert" }));
    expect(screen.queryByRole("menuitem", { name: "Write here" })).toBeNull();
    cleanup();
  }
  expect(new Set(icons).size).toBe(4);
  expect(new Set(geometries).size).toBe(4);
});
it("pastes from a freshly opened wheel even before the canvas has been focused", async () => {
  vi.stubGlobal("synapseEditing", {
    readClipboard: async () => "Clipboard study note",
  });
  const change = vi.fn();
  render(
    <NotebookSheet
      value={{ width: 1000, height: 700, items: [] }}
      onChange={change}
      onImage={() => {}}
    >
      <p>Page</p>
    </NotebookSheet>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Open tool wheel" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Paste objects" }));
  await waitFor(() =>
    expect(change.mock.calls.at(-1)![0].items[0].text).toBe(
      "Clipboard study note",
    ),
  );
});
it("returns from a highlighter to the previous pen instead of leaving the highlighter active", () => {
  const change = vi.fn();
  render(
    <NotebookSheet
      value={{ width: 1000, height: 700, items: [] }}
      onChange={change}
      onImage={() => {}}
    >
      <p>Page</p>
    </NotebookSheet>,
  );
  const sheet = screen.getByRole("group", {
    name: "Write and draw on this page",
  });
  fireEvent.click(screen.getByRole("button", { name: "Open tool wheel" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Draw" }));
  fireEvent.click(screen.getByRole("button", { name: "Pink highlighter" }));
  const draw = () => {
    fireEvent.pointerDown(sheet, {
      pointerId: 1,
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerUp(sheet, { pointerId: 1, clientX: 100, clientY: 100 });
  };
  draw();
  expect(change.mock.calls.at(-1)![0].items.at(-1).opacity).toBe(0.32);
  fireEvent.click(screen.getByRole("button", { name: "Open tool wheel" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Draw" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Pen" }));
  draw();
  expect(change.mock.calls.at(-1)![0].items.at(-1)).toMatchObject({
    color: "#24392f",
    strokeWidth: 2.4,
    opacity: 1,
  });
});
it("disables unsupported commands instead of presenting actions that do nothing", () => {
  const command = vi.fn();
  render(
    <NotebookSheet
      onChange={() => {}}
      onImage={() => {}}
      onCommand={command}
      supportedCommands={["flowchart"]}
    >
      <p>Page</p>
    </NotebookSheet>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Open tool wheel" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Connect" }));
  expect(
    (screen.getByRole("button", { name: "New page" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(
    (screen.getByRole("button", { name: "Link a note" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole("menuitem", { name: "Study" }));
  expect(
    (screen.getByRole("button", { name: "Study lens" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole("menuitem", { name: "Insert" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Make diagram" }));
  expect(command).toHaveBeenCalledExactlyOnceWith("flowchart");
});
it("activates a real resize handle from the wheel and resizes the selected object", async () => {
  const change = vi.fn();
  const { container } = render(
    <NotebookSheet
      value={{
        width: 1000,
        height: 700,
        items: [
          {
            id: "shape",
            kind: "rectangle",
            x: 100,
            y: 100,
            width: 80,
            height: 60,
          },
        ],
      }}
      onChange={change}
      onImage={() => {}}
    >
      <p>Page</p>
    </NotebookSheet>,
  );
  fireEvent.contextMenu(container.querySelector('[data-object-id="shape"]')!, {
    clientX: 200,
    clientY: 200,
  });
  fireEvent.click(screen.getByRole("menuitem", { name: "Object" }));
  fireEvent.click(
    screen.getByRole("menuitem", { name: "Resize", exact: false } as any),
  );
  const handle = screen.getByRole("button", { name: "Resize object" });
  await waitFor(() => expect(document.activeElement).toBe(handle));
  expect(container.querySelector(".tool-select .is-resizing")).toBeTruthy();
  fireEvent.pointerDown(handle, {
    pointerId: 1,
    button: 0,
    clientX: 180,
    clientY: 160,
  });
  const sheet = screen.getByRole("group", {
    name: "Write and draw on this page",
  });
  fireEvent.pointerMove(sheet, { pointerId: 1, clientX: 220, clientY: 180 });
  fireEvent.pointerUp(sheet, { pointerId: 1, clientX: 220, clientY: 180 });
  expect(change.mock.calls.at(-1)![0].items[0]).toMatchObject({
    width: 120,
    height: 80,
  });
});
it("resizes the main writing area horizontally and vertically, then undoes that change", () => {
  const change = vi.fn();
  render(
    <NotebookSheet
      value={{
        width: 1000,
        height: 600,
        prose: { width: 400, height: 200 },
        items: [],
      }}
      onChange={change}
      onDrawing={() => {}}
      onImage={() => {}}
    >
      <p>Long explanation</p>
    </NotebookSheet>,
  );
  const writing = document.querySelector(".sheet-prose")!;
  writing.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 400,
    bottom: 200,
    width: 400,
    height: 200,
    toJSON() {
      return {};
    },
  });
  fireEvent.pointerDown(screen.getByLabelText("Resize writing area"), {
    button: 0,
    pointerId: 1,
    clientX: 400,
    clientY: 200,
  });
  const sheet = screen.getByRole("group", {
    name: "Write and draw on this page",
  });
  fireEvent.pointerMove(sheet, { pointerId: 1, clientX: 600, clientY: 300 });
  fireEvent.pointerUp(sheet, { pointerId: 1, clientX: 600, clientY: 300 });
  expect(change.mock.calls.at(-1)![0].prose).toEqual({
    width: 600,
    height: 300,
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Undo", exact: false } as any),
  );
  expect(change.mock.calls.at(-1)![0].prose).toEqual({
    width: 400,
    height: 200,
  });
});
it("allows a link click with Select without starting a selection gesture", () => {
  const ref = React.createRef<SheetHandle>(),
    change = vi.fn(),
    open = vi.fn();
  render(
    <NotebookSheet
      ref={ref}
      value={{ width: 1000, height: 500, items: [] }}
      onChange={change}
      onDrawing={() => {}}
      onImage={() => {}}
    >
      <a
        href="https://example.com"
        onClick={(e) => {
          e.preventDefault();
          open();
        }}
      >
        Resource
      </a>
    </NotebookSheet>,
  );
  act(() => ref.current!.tool("select"));
  const link = screen.getByRole("link", { name: "Resource" });
  fireEvent.pointerDown(link, { button: 0, pointerId: 1 });
  fireEvent.pointerUp(link, { button: 0, pointerId: 1 });
  fireEvent.click(link);
  expect(open).toHaveBeenCalledOnce();
  expect(change).not.toHaveBeenCalled();
});
it("inserts a generated diagram as one undoable canvas operation", () => {
  const ref = React.createRef<SheetHandle>(),
    change = vi.fn();
  render(
    <NotebookSheet
      ref={ref}
      value={{ width: 1000, height: 500, items: [] }}
      onChange={change}
      onDrawing={() => {}}
      onImage={() => {}}
    >
      <p>Page</p>
    </NotebookSheet>,
  );
  act(() =>
    ref.current!.diagram({
      title: "Steps",
      type: "flowchart",
      nodes: [
        { id: "a", label: "Start", kind: "terminal" },
        { id: "b", label: "Read", kind: "step" },
      ],
      edges: [{ from: "a", to: "b", label: "Next" }],
    }),
  );
  expect(change.mock.calls.at(-1)![0].items.length).toBeGreaterThan(4);
  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  expect(change.mock.calls.at(-1)![0].items).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Redo" }));
  expect(change.mock.calls.at(-1)![0].items.length).toBeGreaterThan(4);
});
it("zooms only with Ctrl/Meta scroll and pans with the middle mouse without creating objects", async () => {
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
  await waitFor(() => expect(Number(sheet.style.zoom)).toBeGreaterThan(1));
  fireEvent.click(screen.getByRole("button", { name: "Open tool wheel" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }));
  expect(
    screen.getByRole("button", { name: "Reset canvas zoom" }).textContent,
  ).not.toContain("(100%)");
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
  fireEvent.click(screen.getByRole("button", { name: "Open tool wheel" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }));
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
it("coalesces a wheel burst into one anchored zoom and normalizes line units", async () => {
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
  const scroll = container.querySelector<HTMLElement>(".sheet-scroll")!;
  const sheet = screen.getByRole("group", {
    name: "Write and draw on this page",
  });
  scroll.scrollLeft = 200;
  scroll.scrollTop = 150;
  sheet.getBoundingClientRect = () => ({
    left: 20 - scroll.scrollLeft,
    top: 50 - scroll.scrollTop,
    width: 1000 * Number(sheet.style.zoom),
    height: 1400 * Number(sheet.style.zoom),
    right: 0,
    bottom: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  fireEvent.wheel(scroll, {
    deltaY: -1,
    deltaMode: 1,
    ctrlKey: true,
    clientX: 320,
    clientY: 250,
  });
  fireEvent.wheel(scroll, {
    deltaY: -1,
    deltaMode: 1,
    ctrlKey: true,
    clientX: 320,
    clientY: 250,
  });
  await waitFor(() =>
    expect(Number(sheet.style.zoom)).toBeCloseTo(Math.exp(32 * 0.0015)),
  );
  const scale = Number(sheet.style.zoom);
  expect(scroll.scrollLeft).toBeCloseTo(500 * scale - 300);
  expect(scroll.scrollTop).toBeCloseTo(350 * scale - 200);
  expect(change).not.toHaveBeenCalled();
});
it("offers arrow variants through the wheel and uses the chosen variant", () => {
  const change = vi.fn();
  render(
    <NotebookSheet onChange={change} onDrawing={() => {}} onImage={() => {}}>
      <p />
    </NotebookSheet>,
  );
  expect(screen.queryByRole("combobox", { name: "Arrow type" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Open tool wheel" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Arrows" }));
  fireEvent.click(screen.getByRole("button", { name: "Curved arrow" }));
  const sheet = screen.getByRole("group", {
    name: "Write and draw on this page",
  });
  fireEvent.pointerDown(sheet, {
    pointerId: 7,
    button: 0,
    clientX: 40,
    clientY: 50,
  });
  fireEvent.pointerMove(sheet, { pointerId: 7, clientX: 100, clientY: 110 });
  fireEvent.pointerUp(sheet, { pointerId: 7, clientX: 100, clientY: 110 });
  expect(change.mock.calls.at(-1)![0].items[0].arrowStyle).toBe("curved");
});
it("pins selected content for Practice and keeps Study lens transient", () => {
  const change = vi.fn();
  const { container } = render(
    <NotebookSheet
      value={{
        width: 1000,
        height: 800,
        items: [
          {
            id: "one",
            kind: "image",
            src: "../attachments/example.png",
            x: 10,
            y: 10,
            width: 100,
            height: 100,
            fitted: true,
          },
          {
            id: "two",
            kind: "rectangle",
            x: 200,
            y: 10,
            width: 100,
            height: 100,
          },
        ],
      }}
      onChange={change}
      onDrawing={() => {}}
      onImage={() => {}}
    >
      <p>Page</p>
    </NotebookSheet>,
  );
  const first = container.querySelector('[data-object-id="one"]')!;
  fireEvent.contextMenu(first, { clientX: 300, clientY: 300 });
  fireEvent.click(screen.getByRole("menuitem", { name: "Study" }));
  fireEvent.click(screen.getByRole("button", { name: "Pin as uncertain" }));
  expect(change.mock.calls.at(-1)![0].items[0].uncertain).toBe(true);
  const count = change.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Open tool wheel" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Study" }));
  fireEvent.click(screen.getByRole("button", { name: "Study lens" }));
  expect(
    container
      .querySelector('[data-object-id="two"]')
      ?.classList.contains("is-lens-dimmed"),
  ).toBe(true);
  expect(change).toHaveBeenCalledTimes(count);
  fireEvent.click(
    screen.getByRole("button", { name: "Remove uncertainty pin" }),
  );
  expect(change.mock.calls.at(-1)![0].items[0].uncertain).toBe(false);
});
