// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
const font = vi.hoisted(() => ({
  state: { ready: true, name: "My font.ttf" },
  initialize: vi.fn(async () => {}),
  importFont: vi.fn(async (_file: File) => {}),
  remove: vi.fn(async () => {}),
}));
vi.mock("../src/handwritingFont", () => ({
  handwritingFont: {
    ...font,
    getSnapshot: () => font.state,
    subscribe: () => () => {},
  },
}));
import HandwritingFontControl from "../src/HandwritingFontControl";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("keeps font import out of the permanent toolbar and lets users recover from a rejected file", async () => {
  const onImported = vi.fn();
  render(<HandwritingFontControl onImported={onImported} />);
  const summary = screen.getByText("My handwriting font");
  expect(summary.closest("details")?.open).toBe(false);
  fireEvent.click(summary);
  font.importFont.mockRejectedValueOnce(Error("This font could not load."));
  fireEvent.change(screen.getByLabelText("Import handwriting font"), {
    target: { files: [new File(["bad"], "bad.ttf")] },
  });
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "This font could not load.",
  );
  expect(onImported).not.toHaveBeenCalled();
  expect(screen.getByText("My font.ttf")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Import handwriting font"), {
    target: { files: [new File(["ok"], "new.ttf")] },
  });
  await waitFor(() => expect(onImported).toHaveBeenCalledOnce());
  expect(screen.queryByRole("alert")).toBeNull();
});

it("keeps a recoverable error visible when removal fails", async () => {
  render(<HandwritingFontControl />);
  fireEvent.click(screen.getByText("My handwriting font"));
  font.remove.mockRejectedValueOnce(
    Error("The saved font could not be removed. Try again."),
  );
  fireEvent.click(screen.getByRole("button", { name: "Use default" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "The saved font could not be removed. Try again.",
  );
  expect(screen.getByText("My font.ttf")).toBeTruthy();
});
