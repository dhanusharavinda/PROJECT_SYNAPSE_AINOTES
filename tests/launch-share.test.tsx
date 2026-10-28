// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act, waitFor } from "@testing-library/react";
import Launch, { ShellBoundary } from "../src/Launch";
import { Collaborators } from "../src/AccountPanel";
import { api } from "../src/api";
import { newTabletNote } from "../src/tabletStore";
vi.mock("../src/api", () => ({ api: vi.fn() }));
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("never dismisses before ready, then leaves without imposing another loading delay", () => {
  vi.useFakeTimers();
  const { rerender } = render(<Launch ready={false} />);
  act(() => vi.advanceTimersByTime(10000));
  expect(screen.getByLabelText("Opening Synapse")).toBeTruthy();
  rerender(<Launch ready />);
  act(() => vi.advanceTimersByTime(280));
  expect(screen.queryByLabelText("Opening Synapse")).toBeNull();
});
it("lets a ready notebook skip the optional five-second welcome", () => {
  vi.useFakeTimers(); localStorage.setItem("synapse-long-welcome", "true");
  render(<Launch ready />);
  act(() => vi.advanceTimersByTime(850));
  expect(screen.getByLabelText("Opening Synapse")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Open notebook" }));
  act(() => vi.advanceTimersByTime(280));
  expect(screen.queryByLabelText("Opening Synapse")).toBeNull();
});
it("reduced motion bypasses the optional timed welcome", () => {
  vi.useFakeTimers(); localStorage.setItem("synapse-long-welcome", "true");
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
  render(<Launch ready />);
  act(() => vi.advanceTimersByTime(0));
  act(() => vi.advanceTimersByTime(280));
  expect(screen.queryByLabelText("Opening Synapse")).toBeNull();
});
it("blocks invisible notebook keyboard shortcuts and lets Escape dismiss when ready", () => {
  vi.useFakeTimers();
  const shortcut = vi.fn(), dismissed = vi.fn();
  window.addEventListener("keydown", shortcut);
  render(<Launch ready onDismiss={dismissed} />);
  fireEvent.keyDown(window, { key: "Delete" });
  expect(shortcut).not.toHaveBeenCalled();
  fireEvent.keyDown(window, { key: "Tab" });
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open notebook" }));
  fireEvent.keyDown(window, { key: "Escape" });
  act(() => vi.advanceTimersByTime(280));
  expect(dismissed).toHaveBeenCalledOnce();
  fireEvent.keyDown(window, { key: "Delete" });
  expect(shortcut).toHaveBeenCalledOnce();
  window.removeEventListener("keydown", shortcut);
});
it("shows a visible recovery action when an application chunk or component fails", () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const caught = (event: ErrorEvent) => { if (event.message.includes("Chunk unavailable")) event.preventDefault(); };
  window.addEventListener("error", caught);
  const Broken = () => { throw new Error("Chunk unavailable"); };
  render(<ShellBoundary><Broken /></ShellBoundary>);
  expect(screen.getByRole("alert").textContent).toContain("Synapse could not open");
  expect(screen.getByRole("button", { name: "Reload Synapse" })).toBeTruthy();
  log.mockRestore();
  window.removeEventListener("error", caught);
});
it("switching sharing tabs never publishes a note, only explicit create does", async () => {
  const note = newTabletNote();
  vi.mocked(api).mockImplementation(async (url) => url.endsWith("/members") ? { members: [] } : []);
  render(<Collaborators note={note} notify={vi.fn()} onOpenShared={vi.fn()} />);
  expect(screen.getByRole("tab", { name: "People" }).getAttribute("aria-selected")).toBe("true");
  expect(screen.queryByRole("button", { name: "Create view link" })).toBeNull();
  fireEvent.click(screen.getByRole("tab", { name: "View link" }));
  await waitFor(() => expect(api).toHaveBeenCalledWith(`/notes/${note.id}/view-links`));
  expect(vi.mocked(api).mock.calls.every(call => call[1] === undefined)).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Create view link" }));
  await waitFor(() => expect(api).toHaveBeenCalledWith(`/notes/${note.id}/view-link`, {}));
});
