// @vitest-environment jsdom
import "fake-indexeddb/auto";
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import NoteView from "../src/NoteView";
import { newTabletNote } from "../src/tabletStore";
import { NoteDraftWriter, readNoteDraft } from "../src/noteDrafts";
import type { Bootstrap, Note } from "../src/types";

const mock = vi.hoisted(() => ({ api: vi.fn(), flush: vi.fn() }));
vi.mock("../src/api", () => ({
  api: mock.api,
  fileUrl: () => "",
  mediaUrl: (value: string) => value,
}));
vi.mock("../src/AccountPanel", () => ({ Collaborators: () => null }));
vi.mock("../src/PagedNotebook", async () => {
  const React = await import("react");
  return {
    default: React.forwardRef(({ note, onChange }: any, ref) => {
      React.useImperativeHandle(ref, () => ({ flush: mock.flush }));
      return (
        <textarea
          aria-label="Test note body"
          value={note.body || ""}
          onChange={(event) => onChange({ body: event.target.value })}
        />
      );
    }),
  };
});

let note: Note, data: Bootstrap;
const key = () => "owner:test-vault:" + note.id;
const props = () => ({
  note,
  data,
  refresh: async () => {},
  onOpen: vi.fn(),
  onPractice: vi.fn(),
  onNew: vi.fn(),
  notify: vi.fn(),
  onDirty: vi.fn(),
});
beforeEach(() => {
  note = {
    ...newTabletNote(),
    title: "Autosave test",
    body: "Original",
    revision: 1,
    etag: "a".repeat(64),
    reviewEnabled: true,
  };
  data = {
    notes: [note],
    reviews: [],
    proposals: [],
    sources: [],
    config: { vaultPath: "test-vault" },
  } as unknown as Bootstrap;
  mock.api.mockReset();
  mock.flush.mockReset();
  mock.api.mockImplementation(async (_url: string, sent: Note) => ({
    ...sent,
    revision: sent.revision + 1,
    etag: "b".repeat(64),
  }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("keeps edits made during an in-flight save, advances their revision and clears the final acknowledged draft", async () => {
  let resolveFirst!: (value: Note) => void;
  mock.api.mockImplementationOnce(
    () =>
      new Promise<Note>((resolve) => {
        resolveFirst = resolve;
      }),
  );
  render(<NoteView {...props()} />);
  const body = await screen.findByLabelText("Test note body");
  fireEvent.change(body, { target: { value: "First edit" } });
  fireEvent.click(screen.getByRole("button", { name: "Save now" }));
  await waitFor(() => expect(mock.api).toHaveBeenCalledTimes(1));
  expect((await readNoteDraft(key()))?.body).toBe("First edit");
  fireEvent.change(body, { target: { value: "Newer edit during saving" } });
  await act(async () =>
    resolveFirst({
      ...note,
      body: "First edit",
      revision: 2,
      etag: "b".repeat(64),
    }),
  );
  await waitFor(() => expect(mock.api).toHaveBeenCalledTimes(2));
  expect(mock.api.mock.calls[1][1]).toMatchObject({
    body: "Newer edit during saving",
    revision: 2,
    etag: "b".repeat(64),
  });
  await waitFor(async () => expect(await readNoteDraft(key())).toBeUndefined());
  expect((body as HTMLTextAreaElement).value).toBe("Newer edit during saving");
});

it("recovers the complete unsaved draft after a failed save and remount", async () => {
  mock.api.mockRejectedValue(new Error("Offline"));
  const first = render(<NoteView {...props()} />);
  fireEvent.change(await screen.findByLabelText("Test note body"), {
    target: { value: "Writing that must survive" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save now" }));
  await screen.findByText("Offline");
  expect((await readNoteDraft(key()))?.body).toBe("Writing that must survive");
  first.unmount();
  render(<NoteView {...props()} />);
  expect(
    ((await screen.findByLabelText("Test note body")) as HTMLTextAreaElement)
      .value,
  ).toBe("Writing that must survive");
});
it("does not promise a durable draft when both device storage and the server are unavailable", async () => {
  mock.api.mockRejectedValue(new Error("Offline"));
  render(<NoteView {...props()} />);
  const body = await screen.findByLabelText("Test note body");
  vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(() => {
    throw new DOMException("Storage is full", "QuotaExceededError");
  });
  fireEvent.change(body, { target: { value: "Only in memory" } });
  fireEvent.click(screen.getByRole("button", { name: "Save now" }));
  await screen.findByText("Offline");
  expect(screen.getByText("Save pending. Keep this page open.")).toBeTruthy();
  expect(
    screen.queryByText("Save pending. Draft kept on this device."),
  ).toBeNull();
  expect(
    screen.getByRole("button", { name: "Keep a draft copy" }),
  ).toBeTruthy();
});

it("requires review instead of overwriting a newer saved note during draft recovery", async () => {
  const writer = new NoteDraftWriter(key());
  writer.stage({
    ...note,
    body: "Earlier unsaved draft",
    etag: "z".repeat(64),
  });
  await writer.flush();
  render(<NoteView {...props()} />);
  await screen.findByRole("dialog", {
    name: "Two versions need your attention",
  });
  expect(mock.api).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Discard draft and load latest" }),
  );
  await waitFor(async () => expect(await readNoteDraft(key())).toBeUndefined());
  expect(
    (screen.getByLabelText("Test note body") as HTMLTextAreaElement).value,
  ).toBe("Original");
});

it("autosaves while writing continues without finishing the active pen gesture", async () => {
  render(<NoteView {...props()} />);
  const body = await screen.findByLabelText("Test note body");
  for (let index = 0; index < 17; index++) {
    fireEvent.change(body, { target: { value: "Continuing " + index } });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
  }
  expect(mock.api).toHaveBeenCalled();
  expect(mock.flush).not.toHaveBeenCalled();
}, 10000);
