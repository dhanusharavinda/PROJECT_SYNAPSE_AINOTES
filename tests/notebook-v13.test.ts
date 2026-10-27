import { it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import request from "supertest";
import { createApp } from "../server/app";
import { resizeGroup } from "../src/sheetModel";
import { nextTheme } from "../src/themes";
import { diagramSchema } from "../server/diagramSchema";
import { youtubeLink } from "../src/youtube";
let root: string, app: Awaited<ReturnType<typeof createApp>>;
const owner = (method: "post" | "get", url: string) =>
  request(app.app)[method](url).set("x-test-owner", "true");
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "synapse-v13-"));
  app = await createApp(root, { test: true });
  app.app.use(app.errors);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});
it("cycles through a persisted Dotted choice", () => {
  expect(nextTheme("paper")).toBe("dotted");
  expect(nextTheme("dotted")).toBe("light");
});
it("does not send images to a provider when AI is disabled", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  app.providers.config.provider = "none";
  await expect(
    app.providers.vision([
      { type: "image/png", data: "example", label: "test" },
    ]),
  ).rejects.toThrow("Choose a local");
  expect(fetchSpy).not.toHaveBeenCalled();
});
it("resizes a mixed group uniformly including font size and relative positions", () => {
  const items: any[] = [
    {
      id: "a",
      kind: "text",
      x: 10,
      y: 10,
      width: 100,
      height: 100,
      text: "😊",
    },
    { id: "b", kind: "rectangle", x: 210, y: 10, width: 100, height: 100 },
  ];
  const result = resizeGroup(items, ["a", "b"], 300, 100);
  expect(result[0].textScale).toBe(2);
  expect(result[0].width).toBe(200);
  expect(result[1].x).toBe(410);
  expect(items[0].width).toBe(100);
});
it("recognizes Instagram posts without accepting lookalike hosts", () => {
  expect(youtubeLink("https://www.instagram.com/reel/ABC_123/")?.platform).toBe(
    "Instagram",
  );
  expect(youtubeLink("https://instagram.com.evil.test/p/ABC/")).toBeUndefined();
});
it("rejects disconnected and invalid AI diagrams before insertion", () => {
  const d = {
    nodes: [
      { id: "a", label: "Read" },
      { id: "b", label: "Explain" },
      { id: "c", label: "Review" },
    ],
    edges: [{ from: "a", to: "b", label: "then" }],
  };
  expect(diagramSchema.safeParse(d).success).toBe(false);
  d.edges.push({ from: "b", to: "c", label: "then" });
  expect(diagramSchema.safeParse(d).success).toBe(true);
});
it("requires confirmation and keeps a complete recovery copy on clearing", async () => {
  const note = (
    await owner("post", "/api/notes").send({
      title: "Keep in recovery",
      body: "My original",
    })
  ).body;
  await fs.writeFile(
    app.vault.file(".synapse/settings.json"),
    '{"example":"kept"}',
  );
  await owner("post", "/api/notebook/clear")
    .send({ confirmation: "wrong" })
    .expect(400);
  expect((await app.vault.notes()).length).toBe(1);
  const result = await owner("post", "/api/notebook/clear")
    .send({ confirmation: "CLEAR MY NOTEBOOK" })
    .expect(200);
  expect(await app.vault.notes()).toHaveLength(0);
  expect(
    await fs.readFile(
      app.vault.file(result.body.backup + "/notes/" + note.id + ".md"),
      "utf8",
    ),
  ).toContain("My original");
  expect(
    await fs.readFile(app.vault.file(".synapse/settings.json"), "utf8"),
  ).toContain("kept");
});
it("asks only from selected notes and keeps explanations separate from the question", async () => {
  const n = (
    await owner("post", "/api/notes").send({
      title: "Selected",
      body: "A <span>clear idea</span>",
    })
  ).body;
  await owner("post", "/api/notes").send({
    title: "Not selected",
    body: "Secret unrelated context",
  });
  const call = vi.spyOn(app.providers, "json").mockResolvedValue({
    question: "Explain the idea?",
    hint: "Try an example",
    explanation: "A clear idea",
  });
  const r = await owner("post", "/api/teacher")
    .send({ noteIds: [n.id] })
    .expect(200);
  expect(r.body.question).toBe("Explain the idea?");
  expect(String(call.mock.calls[0][1])).not.toContain("Secret unrelated");
  expect(String(call.mock.calls[0][1])).not.toContain("<span>");
});
