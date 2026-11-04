// @vitest-environment jsdom
import React from "react";
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
  act,
} from "@testing-library/react";
import PagedNotebook from "../src/PagedNotebook";
import { newTabletNote } from "../src/tabletStore";
import type { Note } from "../src/types";
const { capture, flush } = vi.hoisted(() => ({
  capture: vi.fn(() => new Promise<string>(() => {})),
  flush: vi.fn(),
}));
vi.mock("html-to-image", () => ({ toPng: capture }));
vi.mock("../src/NotebookSheet", () => ({
  default: React.forwardRef((p: any, ref) => {
    React.useImperativeHandle(ref, () => ({ flush, tool: vi.fn(), currentTool: () => "write" }));
    return (
      <section>
        <div>{p.navigation}</div>
        <div className="sheet-scroll">
          <div className="notebook-sheet-content">{p.children}</div>
          {p.afterPaper}
        </div>
      </section>
    );
  }),
}));
vi.mock("../src/RichEditor", () => ({
  default: (p: any) => (
    <textarea
      aria-label="AI text"
      value={p.value}
      onChange={(e) => p.onChange(e.target.value)}
    />
  ),
}));
beforeEach(() => {
  sessionStorage.clear();
  capture.mockClear();
  flush.mockReset();
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function setup(initial = newTabletNote()) {
  let result: Note;
  function Harness() {
    const [note, setNote] = React.useState(initial);
    result = note;
    return (
      <PagedNotebook
        note={note}
        onChange={(patch) => setNote((n) => ({ ...n, ...patch }))}
        onImage={() => {}}
      >
        {(page, onBody) => (
          <textarea
            aria-label="Sheet body"
            value={page.body}
            onChange={(e) => onBody(e.target.value)}
          />
        )}
      </PagedNotebook>
    );
  }
  render(<Harness />);
  return () => result!;
}
it("keeps text on independent sheets under one note and can return to previous content", async () => {
  const current = setup(),
    id = current().id;
  fireEvent.change(screen.getByLabelText("Sheet body"), {
    target: { value: "First sheet" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add next sheet" }));
  await waitFor(() =>
    expect(
      (screen.getByLabelText("Sheet body") as HTMLTextAreaElement).value,
    ).toBe(""),
  );
  fireEvent.change(screen.getByLabelText("Sheet body"), {
    target: { value: "Second sheet" },
  });
  expect(current().id).toBe(id);
  expect(current().pages).toHaveLength(1);
  expect(current().body).toBe("First sheet");
  expect(current().pages![0].body).toBe("Second sheet");
  fireEvent.click(screen.getByRole("button", { name: "Previous sheet" }));
  await waitFor(() =>
    expect(
      (screen.getByLabelText("Sheet body") as HTMLTextAreaElement).value,
    ).toBe("First sheet"),
  );
});
it("turns immediately even when a background preview has not finished", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  const current = setup();
  const scroll = document.querySelector(".sheet-scroll")!;
  Object.defineProperties(scroll, {
    clientWidth: { value: 800 },
    clientHeight: { value: 600 },
  });
  await act(async () => {
    vi.advanceTimersByTime(1201);
  });
  expect(capture).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Add next sheet" }));
  expect(flush).toHaveBeenCalled();
  expect(
    (screen.getByLabelText("Current sheet") as HTMLSelectElement).value,
  ).toBe(current().pages![0].id);
  fireEvent.click(screen.getByRole("button", { name: "Previous sheet" }));
  expect(
    (screen.getByLabelText("Current sheet") as HTMLSelectElement).value,
  ).toBe(current().id);
});
it("offers a fresh sheet for heavy writing without moving or removing any original object", () => {
  const note = newTabletNote();
  note.canvas!.items = Array.from({ length: 1501 }, (_, i) => ({
    id: crypto.randomUUID(),
    kind: "pen" as const,
    x: i % 100,
    y: 10,
    width: 20,
    height: 20,
    points: [
      [0, 0],
      [10, 10],
    ] as [number, number][],
  }));
  const current = setup(note);
  expect(screen.getByRole("status").textContent).toContain("getting heavy");
  fireEvent.click(screen.getByRole("button", { name: "Add next sheet" }));
  expect(current().canvas!.items).toEqual(note.canvas!.items);
  expect(current().pages![0].canvas.items).toHaveLength(0);
});
it("extends just the active paper and persists texture without creating extra notes", () => {
  const current = setup(),
    before = current().canvas!.height;
  fireEvent.click(screen.getByRole("button", { name: "Extend paper" }));
  expect(current().canvas!.height).toBe(before + 600);
  fireEvent.click(screen.getByRole("button", { name: /^Paper texture$/ }));
  fireEvent.click(screen.getByRole("button", { name: /^Grid$/ }));
  expect(current().paperTexture).toBe("grid");
  expect(current().pages).toBeUndefined();
});
it("does not overwrite a server acknowledgement that arrived before the child rerender", () => {
  let stored = newTabletNote();
  function Harness() {
    const [note, setNote] = React.useState(stored);
    return <PagedNotebook note={note} onImage={() => {}} onChange={(patch) => {
      stored = { ...stored, ...patch };
      setNote(stored);
    }}>{(page, onBody) => <textarea aria-label="Sheet body" value={page.body} onChange={(e) => onBody(e.target.value)} />}</PagedNotebook>;
  }
  render(<Harness />);
  stored = { ...stored, revision: 5, etag: "a".repeat(64), title: "Renamed while saving" };
  fireEvent.change(screen.getByLabelText("Sheet body"), { target: { value: "Fresh writing" } });
  expect(stored).toMatchObject({ revision: 5, etag: "a".repeat(64), title: "Renamed while saving", body: "Fresh writing" });
  stored = { ...stored, revision: 6, etag: "b".repeat(64) };
  fireEvent.click(screen.getByRole("button", { name: "Add next sheet" }));
  expect(stored).toMatchObject({ revision: 6, etag: "b".repeat(64) });
});
