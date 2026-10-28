// @vitest-environment jsdom
import React from "react";
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import SharedNotebook from "../src/SharedNotebook";
import { newTabletNote } from "../src/tabletStore";
const mock = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock("../src/api", () => ({
  api: mock.call,
  setSharedMediaScope: vi.fn(),
  fileUrl: () => "",
}));
vi.mock("../src/NotebookSheet", async () => {
  const React = await import("react");
  return {
    default: React.forwardRef(({ children, onCommand }: any, _ref) => (
      <div>
        {children}
        <button onClick={() => onCommand("flowchart")}>Make a diagram</button>
      </div>
    )),
  };
});
vi.mock("../src/RichEditor", async () => {
  const React = await import("react");
  return {
    default: React.forwardRef(({ value, onChange, readOnly }: any, _ref) => (
      <textarea
        aria-label="Body"
        readOnly={readOnly}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    )),
  };
});
vi.mock("../src/CanvasRead", () => ({
  default: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("../src/AccountPanel", () => ({ Collaborators: () => null }));
let note: any, base: string, changeCalls: any[];
beforeEach(() => {
  localStorage.clear();
  note = newTabletNote();
  note.title = "Shared";
  note.body = "Original";
  note.revision = 1;
  base = "a".repeat(64);
  changeCalls = [];
  mock.call.mockReset();
  mock.call.mockImplementation(async (path: string, body: any) => {
    if (path.endsWith("snapshot"))
      return {
        note: structuredClone(note),
        role: "editor",
        cells: {
          body: { value: note.body, hash: base },
          title: { value: note.title, hash: base },
        },
        presence: [],
      };
    if (path.endsWith("acquire"))
      return {
        session: "me",
        hash: base,
        value: body.cell === "title" ? note.title : note.body,
      };
    if (path.endsWith("change")) {
      changeCalls.push(body);
      for (const c of body.changes) note[c.cell] = c.value;
      return structuredClone(note);
    }
    return { ok: true };
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("opens the diagram composer from a shared page instead of rejecting the canvas command", async () => {
  const notify = vi.fn();
  render(
    <SharedNotebook
      id={note.id}
      connection="test"
      notify={notify}
      onBack={() => {}}
    />,
  );
  await screen.findByLabelText("Body");
  fireEvent.click(screen.getByRole("button", { name: "Make a diagram" }));
  expect(screen.getByRole("button", { name: "Create diagram" })).toBeTruthy();
  expect(notify).not.toHaveBeenCalled();
  expect(
    mock.call.mock.calls.some((call) => call[0] === "/diagrams/draft"),
  ).toBe(false);
});
it("autosaves a shared text edit and clears its recovered-draft record only after acknowledgement", async () => {
  render(
    <SharedNotebook
      id={note.id}
      connection="test"
      notify={() => {}}
      onBack={() => {}}
    />,
  );
  const body = await screen.findByLabelText("Body");
  fireEvent.change(body, { target: { value: "My explanation" } });
  expect(localStorage.getItem("synapse-shared-draft:" + note.id)).toContain(
    "My explanation",
  );
  await waitFor(() => expect(changeCalls).toHaveLength(1), { timeout: 3000 });
  await waitFor(() =>
    expect(localStorage.getItem("synapse-shared-draft:" + note.id)).toBeNull(),
  );
  expect(note.body).toBe("My explanation");
  expect(screen.getByRole("status").textContent).toContain("Saved");
});
it("preserves a local draft when another writer changed the field first", async () => {
  render(
    <SharedNotebook
      id={note.id}
      connection="test"
      notify={() => {}}
      onBack={() => {}}
    />,
  );
  const body = await screen.findByLabelText("Body");
  fireEvent.change(body, { target: { value: "Keep my draft" } });
  base = "b".repeat(64);
  note.body = "Someone else's explanation";
  await screen.findByRole("alert", {}, { timeout: 3000 });
  expect(changeCalls).toHaveLength(0);
  expect(localStorage.getItem("synapse-shared-draft:" + note.id)).toContain(
    "Keep my draft",
  );
  expect((screen.getByLabelText("Body") as HTMLTextAreaElement).value).toBe(
    "Keep my draft",
  );
});
