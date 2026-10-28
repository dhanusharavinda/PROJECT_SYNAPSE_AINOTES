// @vitest-environment jsdom
import React from "react";
import { afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import DiagramComposer from "../src/DiagramComposer";
import { newTabletNote } from "../src/tabletStore";
vi.mock("../src/DiagramPreview", () => ({
  default: () => <div>Diagram preview</div>,
}));
afterEach(cleanup);
it("requests a diagram only on click and inserts only after explicit approval", async () => {
  const diagram = { nodes: [], edges: [], type: "flowchart", rationale: "" };
  const generate = vi.fn().mockResolvedValue({ diagram }),
    accept = vi.fn(),
    note = newTabletNote();
  render(
    <DiagramComposer
      note={note}
      selection="Selected explanation"
      generate={generate}
      onClose={() => {}}
      onAccept={accept}
    />,
  );
  expect(generate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Create diagram" }));
  await screen.findByText("Diagram preview");
  expect(generate).toHaveBeenCalledWith({
    note,
    selection: "Selected explanation",
  });
  expect(accept).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Insert diagram" }));
  expect(accept).toHaveBeenCalledWith(diagram);
});
it("shows provider and insertion failures without discarding the draft", async () => {
  const generate = vi
    .fn()
    .mockRejectedValueOnce(new Error("PC is offline"))
    .mockResolvedValue({
      diagram: { nodes: [], edges: [], type: "flowchart", rationale: "" },
    });
  render(
    <DiagramComposer
      note={newTabletNote()}
      selection=""
      generate={generate}
      onClose={() => {}}
      onAccept={() => {
        throw new Error("This page is full");
      }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Create diagram" }));
  expect((await screen.findByRole("alert")).textContent).toBe("PC is offline");
  fireEvent.click(screen.getByRole("button", { name: "Create diagram" }));
  await screen.findByText("Diagram preview");
  fireEvent.click(screen.getByRole("button", { name: "Insert diagram" }));
  expect(screen.getByRole("alert").textContent).toBe("This page is full");
  expect(screen.getByText("Diagram preview")).toBeTruthy();
});
