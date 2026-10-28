// @vitest-environment jsdom
import React from "react";
import { it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  act,
} from "@testing-library/react";
import RadialMenu from "../src/RadialMenu";
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("reveals contextual actions by category and preserves their handlers", () => {
  const copy = vi.fn(),
    link = vi.fn(),
    close = vi.fn();
  render(
    <RadialMenu x={400} y={300} onClose={close}>
      <div className="context-clipboard">
        <button role="menuitem" onClick={copy}>
          Copy <small>Ctrl+C</small>
        </button>
      </div>
      <button role="menuitem" onClick={link}>
        Link a page
      </button>
    </RadialMenu>,
  );
  expect(screen.queryByRole("menuitem", { name: "Link a page" })).toBeNull();
  fireEvent.pointerEnter(screen.getByRole("menuitem", { name: "Connect" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Link a page" }));
  expect(link).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Copy" }));
  expect(copy).toHaveBeenCalledOnce();
  fireEvent.keyDown(window, { key: "Escape" });
  expect(close).toHaveBeenCalledOnce();
});
it("fades after idle outside, but stays open while the pointer is choosing", () => {
  vi.useFakeTimers();
  const close = vi.fn();
  render(
    <RadialMenu x={400} y={300} onClose={close}>
      <button>New page</button>
    </RadialMenu>,
  );
  const menu = screen.getByRole("menu");
  fireEvent.pointerEnter(menu);
  act(() => vi.advanceTimersByTime(6000));
  expect(close).not.toHaveBeenCalled();
  fireEvent.pointerLeave(menu);
  act(() => vi.advanceTimersByTime(4000));
  expect(menu.classList.contains("is-fading")).toBe(true);
  act(() => vi.advanceTimersByTime(180));
  expect(close).toHaveBeenCalledOnce();
});
it("focuses keyboard-opened actions, supports arrows, and returns focus on Escape", () => {
  vi.useFakeTimers();
  const close = vi.fn();
  const { container } = render(
    <>
      <button>Open</button>
      <RadialMenu keyboard x={400} y={300} onClose={close}>
        <button>Copy</button>
        <button>New page</button>
      </RadialMenu>
    </>,
  );
  expect(document.activeElement).toBe(
    screen.getByRole("menuitem", { name: "Edit" }),
  );
  fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
  expect(document.activeElement).toBe(
    screen.getByRole("menuitem", { name: "Connect" }),
  );
  act(() => vi.advanceTimersByTime(7000));
  expect(close).not.toHaveBeenCalled();
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  expect(close).toHaveBeenCalledOnce();
});
