// @vitest-environment jsdom
import React from "react";
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  act,
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
        <button onClick={() => onCommand("page")}>
          Create nested page command
        </button>
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
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it("creates a page from the shared slash-command handler and opens it in the app", async () => {
  const original = mock.call.getMockImplementation()!,
    id = crypto.randomUUID(),
    open = vi.fn();
  mock.call.mockImplementation((url: string, body: any) =>
    url.endsWith("create-page")
      ? Promise.resolve({ id, title: body.title })
      : original(url, body),
  );
  render(
    <SharedNotebook
      id={note.id}
      connection="test"
      notify={() => {}}
      onOpenNote={open}
      onBack={() => {}}
    />,
  );
  await screen.findByLabelText("Body");
  fireEvent.click(
    screen.getByRole("button", { name: "Create nested page command" }),
  );
  fireEvent.change(screen.getByLabelText("Page name"), {
    target: { value: "Child" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create page" }));
  await waitFor(() => expect(open).toHaveBeenCalledWith(id));
  expect(note.body).toContain(id + ".md");
  expect(
    mock.call.mock.calls.some(
      (call) => call[0].endsWith("create-page") && call[1].title === "Child",
    ),
  ).toBe(true);
});
it("releases a focused field after editing becomes idle", async () => {
  vi.useFakeTimers();
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  mock.call.mockImplementationOnce(async () => ({
    note: structuredClone(note),
    session: "me",
    role: "editor",
    cells: { body: { value: note.body, hash: base } },
    presence: [],
  }));
  await act(async () => {
    render(
      <SharedNotebook
        id={note.id}
        connection="test"
        notify={() => {}}
        onBack={() => {}}
      />,
    );
  });
  const body = screen.getByLabelText("Body");
  await act(async () => fireEvent.focus(body));
  await act(async () => vi.advanceTimersByTime(4000));
  expect(mock.call).toHaveBeenCalledWith("/collaboration/remote/test/release", {
    cell: "body",
  });
});
it("applies an incoming live update while preserving a pending local text draft", async () => {
  const original = mock.call.getMockImplementation()!;
  let deliver: (value: any) => void = () => {};
  mock.call.mockImplementation((path: string, body: any) =>
    path.endsWith("/watch")
      ? new Promise((resolve) => {
          deliver = resolve;
        })
      : original(path, body),
  );
  render(
    <SharedNotebook
      id={note.id}
      connection="test"
      notify={() => {}}
      onBack={() => {}}
    />,
  );
  const body = await screen.findByLabelText("Body");
  fireEvent.change(body, { target: { value: "Local draft" } });
  deliver({
    cursor: 1,
    snapshot: {
      note: { ...note, title: "Remote title" },
      role: "editor",
      cells: {
        body: { value: note.body, hash: base },
        title: { value: "Remote title", hash: base },
      },
      presence: [],
    },
  });
  await waitFor(() =>
    expect(
      (screen.getByLabelText("Shared page title") as HTMLInputElement).value,
    ).toBe("Remote title"),
  );
  expect((body as HTMLTextAreaElement).value).toBe("Local draft");
});
it("waits and automatically retries a busy editor lock without showing a destructive recovery panel", async () => {
  const original = mock.call.getMockImplementation()!;
  let attempts = 0;
  mock.call.mockImplementation((path: string, body: any) => {
    if (path.endsWith("watch")) return new Promise(() => {});
    if (path.endsWith("acquire") && attempts++ === 0)
      throw Object.assign(new Error("Other editor is editing this part."), {
        status: 423,
      });
    return original(path, body);
  });
  render(
    <SharedNotebook
      id={note.id}
      connection="test"
      notify={() => {}}
      onBack={() => {}}
    />,
  );
  fireEvent.change(await screen.findByLabelText("Body"), {
    target: { value: "Queued explanation" },
  });
  await screen.findByText("Waiting to sync");
  expect(
    screen.queryByRole("button", { name: "Reload saved version" }),
  ).toBeNull();
  await waitFor(() => expect(note.body).toBe("Queued explanation"), {
    timeout: 3000,
  });
  expect(localStorage.getItem("synapse-shared-draft:" + note.id)).toBeNull();
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
