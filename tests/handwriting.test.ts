import { it, expect, vi, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { newTabletNote } from "../src/tabletStore";
import { notebookPages, addNotebookPage } from "../src/notebookModel";
import {
  convertHandwriting,
  handwritingDigest,
  cropInk,
  recognitionSchema,
  recognizeInkDiagram,
} from "../server/handwriting";
import { createApp } from "../server/app";
import type { Providers } from "../server/providers";
import { aiNotesSchema } from "../src/noteSchema";
import { zodTextFormat } from "openai/helpers/zod";
import { inkBounds } from "../src/inkGeometry";
import { inkRegions, inkSvg } from "../src/inkCapture";

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    roots.splice(0).map((p) => fs.rm(p, { recursive: true, force: true })),
  );
});
function fixture() {
  const note = newTabletNote();
  note.canvas = {
    width: 1100,
    height: 900,
    items: [
      {
        id: crypto.randomUUID(),
        kind: "pen",
        x: 100,
        y: 100,
        width: 160,
        height: 120,
        points: [
          [0, 0],
          [160, 120],
        ],
        pressures: [0.8, 1.1],
        strokeWidth: 2,
        color: "#24392f",
      },
    ],
  };
  const png = Buffer.alloc(24);
  Buffer.from("89504e470d0a1a0a", "hex").copy(png);
  png.writeUInt32BE(200, 16);
  png.writeUInt32BE(200, 20);
  const input = {
    pageId: note.id,
    sourceDigest: handwritingDigest(notebookPages(note)[0]),
    consent: true,
    images: [
      {
        data: png.toString("base64"),
        type: "image/png",
        bounds: { x: 0, y: 0, width: 400, height: 400 },
      },
    ],
  };
  return { note, input };
}
it("returns a reviewable transcription and original vector diagram without changing source ink", async () => {
  const { note, input } = fixture(),
    before = JSON.stringify(note);
  const provider = {
    visionJson: vi.fn().mockResolvedValue({
      text: "Energy = mass × c²",
      diagrams: [
        {
          title: "Cycle",
          description: "A visible arrow returns to Start.",
          imageIndex: 0,
          bounds: { x: 0.2, y: 0.2, width: 0.5, height: 0.5 },
        },
      ],
    }),
  } as unknown as Providers;
  const result = await convertHandwriting(provider, note, input);
  expect(result.text).toContain("mass");
  expect(result.diagrams[0].mode).toBe("original");
  expect(result.diagrams[0].original.items[0].points).toEqual(
    note.canvas!.items[0].points,
  );
  expect(result.diagrams[0].description).toContain("Start");
  expect(aiNotesSchema.safeParse(result).success).toBe(true);
  expect(JSON.stringify(note)).toBe(before);
});
it("preserves linked text, image references and colours while asking for faithful multilingual recognition", async () => {
  const { note, input } = fixture();
  const target = crypto.randomUUID();
  note.body = `[Keep this link](${target}.md)\n\n![Original](../attachments/diagram.png)`;
  note.links = [{ target, relation: "related", reason: "User's connection" }];
  note.canvas!.items.push({
    id: crypto.randomUUID(),
    kind: "image",
    src: "/files/attachments/original.png",
    x: 100,
    y: 100,
    width: 160,
    height: 120,
  });
  input.sourceDigest = handwritingDigest(notebookPages(note)[0]);
  const before = structuredClone(note);
  const visionJson = vi
    .fn()
    .mockResolvedValue({ text: "ஆற்றல் = [unclear] × c²", diagrams: [] });
  const result = await convertHandwriting(
    { visionJson } as unknown as Providers,
    note,
    input,
  );
  expect(result.text).toBe("ஆற்றல் = [unclear] × c²");
  expect(note).toEqual(before);
  expect(visionJson.mock.calls[0][1]).toContain(
    "Preserve the original language",
  );
  expect(visionJson.mock.calls[0][1]).toContain("[unclear]");
  expect(visionJson.mock.calls[0][1]).toContain("Do not invent links");
});
it("reconstructs a sketch without importing unrelated notebook connections into the diagram", async () => {
  const { note } = fixture();
  note.links = [
    {
      target: crypto.randomUUID(),
      relation: "related",
      reason: "Unrelated notebook relationship",
    },
  ];
  note.sources = [crypto.randomUUID()];
  const before = structuredClone(note);
  const json = vi.fn().mockResolvedValue({
    type: "flowchart",
    rationale: "Two visible steps",
    nodes: [
      { id: "a", label: "Read", kind: "step" },
      { id: "b", label: "Recall", kind: "step" },
    ],
    edges: [{ from: "a", to: "b", label: "then" }],
  });
  await recognizeInkDiagram(
    {
      config: {
        provider: "ollama",
        ollamaModel: "test",
        ollamaUrl: "http://unused.local",
      },
      json,
    } as unknown as Providers,
    note,
    {
      pageId: note.id,
      consent: true,
      description: "Read points to Recall with an arrow labelled then.",
    },
  );
  expect(json.mock.calls[0][1]).toContain("Read points to Recall");
  expect(json.mock.calls[0][1]).not.toContain(
    "Unrelated notebook relationship",
  );
  expect(note).toEqual(before);
});
it("rejects changed input, missing consent and malformed images before contacting a model", async () => {
  const { note, input } = fixture(),
    visionJson = vi.fn(),
    provider = { visionJson } as unknown as Providers;
  await expect(
    convertHandwriting(provider, note, {
      ...input,
      sourceDigest: "a".repeat(64),
    }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    convertHandwriting(provider, note, { ...input, consent: false }),
  ).rejects.toThrow();
  await expect(
    convertHandwriting(provider, note, {
      ...input,
      images: [{ ...input.images[0], data: "AAAA" }],
    }),
  ).rejects.toMatchObject({ status: 400 });
  expect(visionJson).not.toHaveBeenCalled();
});
it("keeps whole intersecting strokes when cropping a diagram", () => {
  const { note } = fixture(),
    crop = cropInk(note.canvas!.items, {
      x: 180,
      y: 160,
      width: 40,
      height: 40,
    });
  expect(crop.items[0]).toMatchObject({ x: 0, y: 0, width: 160, height: 120 });
  expect(crop.width).toBeGreaterThanOrEqual(160);
  expect(crop.height).toBeGreaterThanOrEqual(120);
});
it("captures rotated arrow directions and includes transformed geometry in regions and crops", () => {
  const { note } = fixture(),
    arrow = {
      ...note.canvas!.items[0],
      kind: "arrow" as const,
      x: 100,
      y: 200,
      width: 300,
      height: 20,
      rotation: 90,
    };
  note.canvas!.items = [arrow];
  const page = notebookPages(note)[0],
    b = inkBounds(arrow),
    regions = inkRegions(page),
    svg = inkSvg(page, regions[0]);
  expect(b.height).toBeCloseTo(300);
  expect(regions[0].y).toBeLessThanOrEqual(b.y);
  expect(regions[0].y + regions[0].height).toBeGreaterThanOrEqual(
    b.y + b.height,
  );
  expect(svg).toContain("rotate(90 250 210)");
  const crop = cropInk([arrow], { x: 245, y: 70, width: 10, height: 20 });
  expect(crop.items).toHaveLength(1);
  expect(crop.items[0].rotation).toBe(90);
  expect(crop.height).toBeGreaterThanOrEqual(300);
});
it("creates a strict Responses schema from the installed OpenAI SDK", () => {
  const format = zodTextFormat(recognitionSchema, "handwriting_conversion");
  expect(format.strict).toBe(true);
  expect(format.schema).toHaveProperty("additionalProperties", false);
});
it("routes owner conversion for a second sheet and never writes the preview into the vault", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "synapse-ink-"));
  roots.push(root);
  const app = await createApp(root, { test: true });
  app.app.use(app.errors);
  const { note, input } = fixture(),
    added = addNotebookPage(note);
  added.page.canvas = structuredClone(note.canvas!);
  const saved = await app.vault.write(added.note);
  const source = {
    ...input,
    pageId: added.page.id,
    sourceDigest: handwritingDigest(notebookPages(saved)[1]),
  };
  vi.spyOn(app.providers, "visionJson").mockResolvedValue({
    text: "Reviewed transcription",
    diagrams: [],
  });
  await request(app.app)
    .post("/api/notes/" + saved.id + "/handwriting")
    .send(source)
    .expect(401);
  const result = await request(app.app)
    .post("/api/collaboration/local/" + saved.id + "/handwriting")
    .set("x-test-owner", "true")
    .send(source)
    .expect(200);
  expect(result.body.text).toBe("Reviewed transcription");
  expect((await app.vault.note(saved.id)).pages![0].aiNotes).toBeUndefined();
  expect((await app.vault.notes()).length).toBe(1);
});
