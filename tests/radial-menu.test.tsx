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
it("keeps authored icons, captions, active states and handlers", () => {
  const action = vi.fn();
  render(
    <RadialMenu x={300} y={300} onClose={() => {}}>
      <button
        data-menu-group="Arrows"
        data-menu-caption="Elbow"
        aria-label="Elbow arrow"
        aria-pressed
        onClick={action}
      >
        <svg viewBox="0 0 24 24">
          <path d="M4 20 V4 H20" />
        </svg>
        Elbow arrow
      </button>
    </RadialMenu>,
  );
  fireEvent.click(screen.getByRole("menuitem", { name: "Arrows" }));
  const button = screen.getByRole("button", { name: "Elbow arrow" });
  expect(button.querySelector("path")?.getAttribute("d")).toBe("M4 20 V4 H20");
  expect(button.textContent).toBe("Elbow");
  expect(button.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(button);
  expect(action).toHaveBeenCalledOnce();
});
it("uses distinct icons for clipboard and settings actions and removes repeated actions", () => {
  const labels = [
    "Copy selection",
    "Duplicate",
    "Paste objects",
    "Cut",
    "Brush settings",
    "Stylus mode",
    "Reset canvas zoom",
    "Switch theme",
    "Switch font",
  ];
  render(
    <RadialMenu x={300} y={300} onClose={() => {}}>
      {[...labels, "Copy selection"].map((label, i) => (
        <button key={i} data-menu-group="Settings">
          {label}
        </button>
      ))}
    </RadialMenu>,
  );
  fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }));
  const icons = labels.map(
    (label) =>
      screen.getByRole("button", { name: label }).querySelector("svg")!
        .innerHTML,
  );
  expect(new Set(icons).size).toBe(labels.length);
  expect(
    screen.getAllByRole("button", { name: "Copy selection" }),
  ).toHaveLength(1);
});
it("dismisses on an outside pointer click even when the canvas stops bubbling", () => {
  const close = vi.fn();
  render(
    <>
      <button onPointerDown={(e) => e.stopPropagation()}>Canvas</button>
      <RadialMenu x={400} y={300} onClose={close}>
        <button>New page</button>
      </RadialMenu>
    </>,
  );
  fireEvent.pointerDown(screen.getByRole("button", { name: "Canvas" }));
  expect(close).toHaveBeenCalledOnce();
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
it("never fades or times out when the pointer leaves", () => {
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
  act(() => vi.advanceTimersByTime(60000));
  expect(menu.classList.contains("is-fading")).toBe(false);
  expect(close).not.toHaveBeenCalled();
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
