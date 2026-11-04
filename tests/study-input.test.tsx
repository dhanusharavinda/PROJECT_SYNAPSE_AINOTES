// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import StudyWorkspace from "../src/StudyWorkspace";
import { prepareInput } from "../src/studyInput";
import { newTabletNote } from "../src/tabletStore";
vi.mock("../src/CanvasRead", () => ({
  default: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("../src/ui", () => ({ MD: ({ text }: any) => <div>{text}</div> }));
beforeEach(() => localStorage.clear());
afterEach(cleanup);
it("ignores finger touches and submits Pencil strokes with pressure", async () => {
  vi.stubGlobal("PointerEvent", class extends MouseEvent {
    pointerId: number; pointerType: string; pressure: number;
    constructor(type: string, init: any = {}) {
      super(type, init);
      this.pointerId = init.pointerId || 1;
      this.pointerType = init.pointerType || "pen";
      this.pressure = init.pressure ?? 0.5;
    }
  });
  SVGElement.prototype.setPointerCapture = vi.fn();
  SVGElement.prototype.hasPointerCapture = () => false;
  SVGElement.prototype.releasePointerCapture = vi.fn();
  const send = vi.fn().mockResolvedValue(undefined);
  render(<StudyWorkspace note={newTabletNote()} queued={false} canSend onSend={send} />);
  const pad = screen.getByRole("img", { name: "Pencil writing pad" });
  vi.spyOn(pad, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 900, height: 380 } as DOMRect);
  fireEvent.pointerDown(pad, { pointerType: "touch", clientX: 50, clientY: 50 });
  fireEvent.pointerUp(pad, { pointerType: "touch", clientX: 60, clientY: 60 });
  expect(screen.getByRole("button", { name: "Send to PC" })).toHaveProperty("disabled", true);
  fireEvent.pointerDown(pad, { pointerType: "pen", clientX: 100, clientY: 100, pressure: 0.25 });
  fireEvent.pointerMove(pad, { pointerType: "pen", clientX: 200, clientY: 150, pressure: 0.75 });
  fireEvent.pointerUp(pad, { pointerType: "pen", clientX: 220, clientY: 160, pressure: 0.5 });
  fireEvent.click(screen.getByRole("button", { name: "Send to PC" }));
  await waitFor(() => expect(send).toHaveBeenCalledOnce());
  const item = send.mock.calls[0][0].note.canvas.items[0];
  expect(item.kind).toBe("pen");
  expect(item.points).toHaveLength(3);
  expect(item.pressures).toEqual([0.85, 1.15, 1]);
  vi.unstubAllGlobals();
});
it("keeps the original page and its editable strokes when appending text and ink", () => {
  const original = newTabletNote();
  original.etag = "current-version";
  original.body = "Existing explanation";
  const ink = {
    id: crypto.randomUUID(),
    kind: "pen" as const,
    x: 5,
    y: 5,
    width: 100,
    height: 30,
    points: [
      [4, 4],
      [90, 20],
    ] as [number, number][],
    pressures: [0.8, 1.2],
  };
  original.canvas!.items.push(ink);
  const before = structuredClone(original);
  const payload = prepareInput(original, {
    text: "My new explanation",
    strokes: [ink],
  });
  expect(original).toEqual(before);
  expect(payload.base).toBe(original.etag);
  expect(payload.note.body).toBe(original.body);
  expect(payload.note.canvas!.items[0]).toEqual(ink);
  expect(payload.note.canvas!.items[1].text).toBe("My new explanation");
  expect(payload.note.canvas!.items[2].points).toEqual(ink.points);
  expect(payload.note.canvas!.items[2].pressures).toEqual(ink.pressures);
  expect(payload.note.canvas!.items[2].y).toBeGreaterThan(
    payload.note.canvas!.items[1].y,
  );
});
it("retains the exact submission across failed sends and reloads, then clears it after acknowledgement", async () => {
  const note = newTabletNote();
  const send = vi
    .fn()
    .mockRejectedValueOnce(Error("PC unavailable"))
    .mockResolvedValue(undefined);
  const props = { note, canSend: true, queued: false, onSend: send };
  const view = render(<StudyWorkspace {...props} />);
  fireEvent.change(screen.getByLabelText("Typed notes"), {
    target: { value: "Recall from class" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send to PC" }));
  await screen.findByRole("alert");
  const sent = send.mock.calls[0][0];
  expect(screen.getByLabelText("Typed notes")).toHaveProperty("disabled", true);
  expect(localStorage.getItem("synapse-study-draft:" + note.id)).toContain(
    sent.operation,
  );
  view.unmount();
  render(<StudyWorkspace {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Retry send" }));
  await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
  expect(send.mock.calls[1][0]).toEqual(sent);
  await waitFor(() =>
    expect(screen.getByLabelText("Typed notes")).toHaveProperty("value", ""),
  );
  expect(
    screen
      .getByRole("region", { name: "Read-only PC note" })
      .querySelector("textarea, [contenteditable=true]"),
  ).toBeNull();
});
it("preserves separate offline drafts when switching between notebook pages", () => {
  const a = newTabletNote(),
    b = newTabletNote();
  const send = vi.fn();
  const view = render(
    <StudyWorkspace
      key={a.id}
      note={a}
      canSend={false}
      queued={false}
      onSend={send}
    />,
  );
  fireEvent.change(screen.getByLabelText("Typed notes"), {
    target: { value: "Unsent offline notes" },
  });
  expect(screen.getByRole("button", { name: "Send to PC" })).toHaveProperty(
    "disabled",
    true,
  );
  view.rerender(
    <StudyWorkspace
      key={b.id}
      note={b}
      canSend={false}
      queued={false}
      onSend={send}
    />,
  );
  expect(screen.getByLabelText("Typed notes")).toHaveProperty("value", "");
  view.rerender(
    <StudyWorkspace
      key={a.id}
      note={a}
      canSend={false}
      queued={false}
      onSend={send}
    />,
  );
  expect(screen.getByLabelText("Typed notes")).toHaveProperty(
    "value",
    "Unsent offline notes",
  );
  expect(send).not.toHaveBeenCalled();
});
