// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import VideoPasteMenu from "../src/VideoPasteMenu";
afterEach(cleanup);
it("focuses and selects the video name instead of typing behind the paste menu", () => {
  const onChoose = vi.fn();
  render(<VideoPasteMenu x={10} y={10} onChoose={onChoose} />);
  const name = screen.getByLabelText("Video name") as HTMLInputElement;
  expect(document.activeElement).toBe(name);
  expect(name.selectionEnd! - name.selectionStart!).toBe(name.value.length);
  fireEvent.change(name, { target: { value: "Lecture section" } });
  fireEvent.keyDown(name, { key: "Enter" });
  expect(onChoose).toHaveBeenCalledWith("named", "Lecture section");
});
it("keeps the link with Escape and keeps keyboard navigation in the menu", () => {
  const onChoose = vi.fn();
  render(<VideoPasteMenu x={10} y={10} onChoose={onChoose} />);
  const name = screen.getByLabelText("Video name");
  fireEvent.keyDown(name, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(screen.getByText("Keep original link"));
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  expect(onChoose).toHaveBeenCalledWith("link", "YouTube video");
});
