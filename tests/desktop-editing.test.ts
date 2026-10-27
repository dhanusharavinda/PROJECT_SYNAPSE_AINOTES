import { expect, it, vi } from "vitest";
import { dispatchEdit, nativeEdit } from "../desktop/editing";
const contents = () => ({
  send: vi.fn(),
  undo: vi.fn(),
  redo: vi.fn(),
  copy: vi.fn(),
  cut: vi.fn(),
  paste: vi.fn(),
  selectAll: vi.fn(),
});
it("routes notebook menu actions through the active sheet or text editor", () => {
  const main = { webContents: contents() };
  dispatchEdit("undo", main, main);
  dispatchEdit("redo", main, null);
  expect(main.webContents.send.mock.calls).toEqual([
    ["synapse:edit", "undo"],
    ["synapse:edit", "redo"],
  ]);
  expect(main.webContents.undo).not.toHaveBeenCalled();
});
it("keeps PDF copying in the focused PDF window rather than copying the notebook", () => {
  const main = { webContents: contents() },
    pdf = { webContents: contents() };
  dispatchEdit("copy", main, pdf);
  expect(pdf.webContents.copy).toHaveBeenCalledOnce();
  expect(main.webContents.send).not.toHaveBeenCalled();
});
it("preserves native input editing while ignoring unknown IPC commands", () => {
  const input = contents();
  nativeEdit(input, "paste");
  nativeEdit(input, "undo");
  nativeEdit(input, "constructor");
  expect(input.paste).toHaveBeenCalledOnce();
  expect(input.undo).toHaveBeenCalledOnce();
  expect(input.copy).not.toHaveBeenCalled();
});
