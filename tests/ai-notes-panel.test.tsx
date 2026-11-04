// @vitest-environment jsdom
import React from "react";
import { it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import AINotesPanel from "../src/AINotesPanel";
import type { AINotes } from "../src/types";
vi.mock("../src/RichEditor", () => ({
  default: (p: any) => (
    <textarea aria-label="AI conversion text" value={p.value} readOnly />
  ),
}));
afterEach(cleanup);
const draft: AINotes = {
  text: "A faithful conversion",
  view: "typed",
  sourceDigest: "a".repeat(64),
  generatedAt: new Date().toISOString(),
  diagrams: [],
};
const base = {
  stale: false,
  onChange: vi.fn(),
  onDraft: vi.fn(),
  onGenerate: vi.fn(),
  onAccept: vi.fn(),
  onDiscard: vi.fn(),
  requestDiagram: vi.fn(),
};
it.each(["draft", "progress", "error"])(
  "honors collapse during %s and keeps disclosure state accurate",
  (state) => {
    render(
      <AINotesPanel
        {...base}
        {...(state === "draft"
          ? { draft }
          : state === "progress"
            ? { progress: "Converting…" }
            : { error: "Provider unavailable" })}
      />,
    );
    const toggle = screen.getByRole("button", { name: /^AI notes$/ });
    if (toggle.getAttribute("aria-expanded") === "false")
      fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText(/Conversion sends this sheet/)).toBeNull();
  },
);
it("warns about a stale first preview before the Keep action", () => {
  render(<AINotesPanel {...base} stale draft={draft} />);
  expect(screen.getByText("Handwriting changed")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Keep older conversion" }),
  ).toBeTruthy();
  expect(screen.getByText(/Review missing or outdated content/)).toBeTruthy();
});
