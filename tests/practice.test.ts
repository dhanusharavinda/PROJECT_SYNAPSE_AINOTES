import { it, expect, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { Vault } from "../server/vault";
import { PracticeService, validateEvidence } from "../server/practice";
import { recallUnits, practiceText } from "../src/practiceContent";
import { newTabletNote } from "../src/tabletStore";
import { storedNoteSchema } from "../src/noteSchema";
import type { Providers } from "../server/providers";

it("removes task and list markers from recall passages", () => {
  expect(
    practiceText(
      "- [ ] Connect a resource\n- [x] Practice drawing\n1. Explain it\n2. Try it",
    ),
  ).toBe("Connect a resource\nPractice drawing\nExplain it\nTry it");
});

it("keeps pins and connection explanations and removes notebook markup from recall text", () => {
  const note = newTabletNote();
  note.body =
    ':::variants\n\n:::option {"label":"Simple"}\n\nA vector is a list of numbers.\n\n:::endoption\n\n:::endvariants';
  note.canvas = {
    height: 600,
    items: [
      {
        id: crypto.randomUUID(),
        kind: "text",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        text: "A point in space",
        uncertain: true,
      },
    ],
  };
  note.links = [
    {
      target: crypto.randomUUID(),
      relation: "related",
      reason: "Coordinates describe a point",
    },
  ];
  const parsed = storedNoteSchema.parse(note),
    units = recallUnits(parsed);
  expect(units.map((u) => u.text).join(" ")).not.toContain(":::option");
  expect(units.some((u) => u.uncertain)).toBe(true);
  expect(units.find((u) => u.label === "Connection")?.text).toBe(
    "Coordinates describe a point",
  );
});
it("rejects hallucinated source quotations", () => {
  expect(() =>
    validateEvidence(
      [
        {
          question: "Q",
          hint: "H",
          answer: "A",
          sourceId: "body-0",
          evidence: "A made up claim",
        },
      ],
      [{ id: "body-0", label: "Passage", text: "The actual note" }],
    ),
  ).toThrow("traced");
});
it("reads without AI, deduplicates generation, reuses cached cards and invalidates changed notes", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "synapse-practice-"));
  try {
    const vault = new Vault(root);
    await vault.init();
    const note = newTabletNote();
    note.body = "Vectors represent values.";
    const json = vi.fn(async (_instructions: string, input: string) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      const source = JSON.parse(input).sources[0];
      return {
        cards: [
          {
            question: "What is represented?",
            hint: "Think of values",
            answer: source.text,
            sourceId: source.id,
            evidence: source.text,
          },
        ],
      };
    });
    const provider = {
      config: { provider: "ollama", ollamaModel: "local" },
      json,
    } as unknown as Providers;
    const service = new PracticeService(vault, provider);
    expect((await service.deck(note)).cards).toHaveLength(0);
    expect(json).not.toHaveBeenCalled();
    const [first, simultaneous] = await Promise.all([
      service.deck(note, true),
      service.deck(note, true),
    ]);
    expect(first.cards).toHaveLength(1);
    expect(simultaneous.signature).toBe(first.signature);
    expect(json).toHaveBeenCalledTimes(1);
    expect((await service.deck(note, true)).cached).toBe(true);
    expect(json).toHaveBeenCalledTimes(1);
    note.body = "Vectors also represent positions.";
    expect((await service.deck(note)).cards).toHaveLength(0);
    await service.deck(note, true);
    expect(json).toHaveBeenCalledTimes(2);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
it("includes saved diagram labels and bounds generation context", async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "synapse-practice-labels-"),
  );
  try {
    const vault = new Vault(root);
    await vault.init();
    const note = newTabletNote();
    note.body = Array.from(
      { length: 40 },
      (_, i) => `${i}: ` + "Long passage ".repeat(300),
    ).join("\n\n");
    const drawing = crypto.randomUUID();
    note.drawings = [drawing];
    await fs.writeFile(
      vault.file(`drawings/${drawing}.json`),
      JSON.stringify({
        diagram: {
          title: "Example",
          type: "flowchart",
          nodes: [
            { id: "start", label: "Reader" },
            { id: "end", label: "Service" },
          ],
          edges: [{ from: "start", to: "end", label: "request" }],
        },
        elements: [
          { type: "text", text: "Input" },
          { type: "text", text: "Output" },
          { type: "text", text: "Deleted", isDeleted: true },
        ],
      }),
    );
    const json = vi.fn(async (_instructions: string, input: string) => {
      const sources = JSON.parse(input).sources;
      expect(
        sources.reduce((n: number, s: any) => n + s.text.length, 0),
      ).toBeLessThanOrEqual(10000);
      return {
        cards: [
          {
            question: "What starts here?",
            hint: "Beginning",
            answer: sources[0].text.slice(0, 200),
            sourceId: sources[0].id,
            evidence: sources[0].text.slice(0, 200),
          },
        ],
      };
    });
    const service = new PracticeService(vault, {
      config: { provider: "ollama", ollamaModel: "local" },
      json,
    } as unknown as Providers);
    const units = await service.sources(note);
    expect(
      units.some((u) => u.label === "Diagram label" && u.text === "Input"),
    ).toBe(true);
    expect(units.some((u) => u.text === "Deleted")).toBe(false);
    expect(units.some((u) => u.text === "Reader")).toBe(true);
    expect(units.some((u) => u.text === "Reader → Service: request")).toBe(
      true,
    );
    await service.deck(note, true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
