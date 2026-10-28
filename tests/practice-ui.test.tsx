// @vitest-environment jsdom
import React from "react";
import { it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import Practice from "../src/Practice";
import { newTabletNote } from "../src/tabletStore";
import type { Bootstrap } from "../src/types";
import { api } from "../src/api";
vi.mock("../src/api", () => ({ api: vi.fn(), fileUrl: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const makeData = () =>
  ({
    notes: [{ ...newTabletNote(), title: "Vectors" }],
    reviews: [],
    config: { provider: "none" },
  }) as unknown as Bootstrap;
it("recall hides chosen text without changing the notebook and records practice only after rating", async () => {
  const data = makeData(),
    refresh = vi.fn(async () => {}),
    notify = vi.fn();
  vi.mocked(api).mockResolvedValue({
    units: [
      {
        id: "body-0",
        label: "Passage 1",
        text: "A vector stores coordinates.",
      },
    ],
    cards: [],
    cached: false,
    signature: "one",
  });
  render(
    <Practice
      data={data}
      refresh={refresh}
      notify={notify}
      onOpen={() => {}}
    />,
  );
  await screen.findByText("A vector stores coordinates.");
  fireEvent.click(screen.getByRole("checkbox", { name: /Hide Passage/ }));
  fireEvent.click(
    screen.getByRole("switch", { name: "Hide selected answers" }),
  );
  expect(screen.queryByText("A vector stores coordinates.")).toBeNull();
  expect(screen.queryByRole("checkbox", { name: /coordinates/ })).toBeNull();
  expect(screen.getByRole("checkbox", { name: "Hide Passage 1" })).toBeTruthy();
  expect(api).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Reveal Passage 1" }));
  expect(
    screen
      .getByRole("checkbox", { name: "Hide Passage 1" })
      .getAttribute("checked"),
  ).not.toBe("false");
  fireEvent.click(screen.getByRole("button", { name: "Reveal all" }));
  expect(screen.getByText("A vector stores coordinates.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Recalled" }));
  await waitFor(() => expect(refresh).toHaveBeenCalled());
  expect(api).toHaveBeenLastCalledWith(
    "/reviews",
    expect.objectContaining({
      noteId: data.notes[0].id,
      rating: "good",
      hintUsed: true,
      question: "Recall: Passage 1",
    }),
  );
});
it("shows a cached flashcard hint and source without generating on navigation", async () => {
  vi.mocked(api).mockResolvedValue({
    units: [],
    cards: [
      {
        question: "What is stored?",
        hint: "A location",
        answer: "Coordinates",
        sourceId: "body-0",
        evidence: "A vector stores coordinates.",
      },
    ],
    cached: true,
    signature: "one",
  });
  render(
    <Practice
      data={makeData()}
      refresh={async () => {}}
      notify={() => {}}
      onOpen={() => {}}
    />,
  );
  await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "Flashcards" }));
  await screen.findByText("What is stored?");
  expect(screen.queryByText("Coordinates")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Hint" }));
  expect(screen.getByText("A location")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Reveal answer" }));
  expect(screen.getByText("Coordinates")).toBeTruthy();
  expect(api).toHaveBeenCalledTimes(1);
});
