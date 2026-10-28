// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import VideoPasteMenu from "../src/VideoPasteMenu";
afterEach(cleanup);
it("selects an editable video thumbnail without playing, with a separate play action", async () => {
  const { default: VideoCard } = await import("../src/VideoCard");
  const select = vi.fn();
  const { container } = render(
    <VideoCard
      editable
      onSelect={select}
      url="https://youtu.be/M7lc1UVf-VE"
      title="Canvas video"
    />,
  );
  fireEvent.click(screen.getByAltText("Canvas video"));
  expect(select).toHaveBeenCalled();
  expect(container.querySelector("iframe")).toBeNull();
  fireEvent.click(screen.getByLabelText("Play video in canvas"));
  expect(container.querySelector("iframe")).not.toBeNull();
});
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

it("opens a video from the full thumbnail and removes playback when closed", async () => {
  const { default: VideoCard } = await import("../src/VideoCard");
  const { container, rerender } = render(
    <VideoCard url="https://youtu.be/M7lc1UVf-VE" title="Player guide" />,
  );
  expect(container.querySelector("iframe")).toBeNull();
  fireEvent.click(screen.getByAltText("Player guide"));
  expect(container.querySelector("iframe")?.src).toContain(
    "youtube-nocookie.com/embed/M7lc1UVf-VE",
  );
  fireEvent.click(screen.getByRole("button", { name: "Close video" }));
  expect(container.querySelector("iframe")).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Play YouTube: Player guide" }),
  );
  rerender(<VideoCard url="https://youtu.be/abcdefghijk" title="Other" />);
  expect(container.querySelector("iframe")).toBeNull();
});
