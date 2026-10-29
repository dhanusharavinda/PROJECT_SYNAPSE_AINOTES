// @vitest-environment jsdom
import React from "react";
import { it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import NotesLibrary from "../src/NotesLibrary";
import { newTabletNote } from "../src/tabletStore";
import { noteTree } from "../src/noteTree";
afterEach(cleanup);
it("folds children by default and opens each nested level without losing search results", () => {
  const parent = { ...newTabletNote(), title: "Parent" },
    child = { ...newTabletNote(), title: "Child", parentId: parent.id },
    grandchild = {
      ...newTabletNote(),
      title: "Grandchild",
      parentId: child.id,
    };
  render(
    <NotesLibrary
      notes={[child, grandchild, parent]}
      onOpen={() => {}}
      onNew={() => {}}
      onDelete={() => {}}
    />,
  );
  expect(screen.queryByText("Child", { selector: "strong" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Expand Parent" }));
  expect(screen.getByText("Child", { selector: "strong" })).toBeTruthy();
  expect(screen.queryByText("Grandchild", { selector: "strong" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Expand Child" }));
  expect(screen.getByText("Grandchild", { selector: "strong" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Collapse Parent" }));
  fireEvent.change(screen.getByLabelText("Find a note"), {
    target: { value: "Grandchild" },
  });
  expect(screen.getByText("Grandchild", { selector: "strong" })).toBeTruthy();
  expect(screen.getByText("Parent", { selector: "strong" })).toBeTruthy();
});
it("keeps an orphaned note visible without duplicating a folded descendant", () => {
  const parent = newTabletNote(),
    child = { ...newTabletNote(), parentId: parent.id },
    orphan = { ...newTabletNote(), parentId: crypto.randomUUID() };
  expect(
    noteTree([child, parent, orphan], new Set()).map((r) => r.note.id),
  ).toEqual([parent.id, orphan.id]);
});
