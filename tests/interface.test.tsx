// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import App from "../src/App";
import Editor from "../src/Editor";
import type { Bootstrap } from "../src/types";
const fixture: Bootstrap = {
  notes: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      title: "Embeddings",
      context: "Machine learning",
      group: "Representations",
      layers: {
        intuition: "A learned vector representation.",
        technical: "Useful similarity depends on the model and task.",
        implementation: "Use compatible encoders.",
      },
      links: [],
      sources: [],
      drawings: [],
      status: "collected",
      revision: 1,
      updated: "2026-10-26T10:00:00Z",
      etag: "a".repeat(64),
      reviewEnabled: true,
    },
  ],
  sources: [],
  proposals: [],
  reviews: [],
  episodes: [],
  shares: [],
  comments: [],
  positions: {},
  config: {
    provider: "none",
    model: "gpt-4.1-mini",
    ollamaModel: "qwen3:8b",
    ollamaUrl: "http://127.0.0.1:11434",
    keySet: false,
    telegramSet: false,
    chatSet: false,
    vaultPath: "C:\\test-vault",
    lan: false,
  },
};
beforeEach(() => {
  history.replaceState(null, "", "/");
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input) => {
      if (String(input).endsWith("/api/bootstrap"))
        return new Response(JSON.stringify(fixture), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      throw new Error(
        "Unexpected network request in interface regression test.",
      );
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("student-facing regression checks", () => {
  it("opens a note without a false dirty state, then navigates to the graph", async () => {
    render(<App />);
    await screen.findByRole("textbox", { name: "Note explanation" });
    expect(screen.queryByText("Unsaved changes")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Knowledge Graph" }));
    expect(
      await screen.findByRole("heading", { name: "Knowledge Graph." }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("dialog", { name: "Your draft has unsaved changes" }),
    ).toBeNull();
    expect(location.search).toContain("view=graph");
  });
  it("changing explanation depth reveals saved text without marking it edited", async () => {
    const changed = vi.fn();
    const { rerender } = render(
      <Editor
        value="An intuitive explanation."
        onChange={changed}
        onCommand={() => {}}
      />,
    );
    await screen.findByRole("textbox", { name: "Note explanation" });
    expect(changed).not.toHaveBeenCalled();
    rerender(
      <Editor
        value="A technical explanation."
        onChange={changed}
        onCommand={() => {}}
      />,
    );
    expect(await screen.findByText("A technical explanation.")).toBeTruthy();
    expect(changed).not.toHaveBeenCalled();
  });
});
