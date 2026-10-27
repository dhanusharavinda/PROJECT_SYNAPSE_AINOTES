import fs from "node:fs/promises";
import path from "node:path";
import { variantsMarkdown } from "../src/content";
const base = "http://127.0.0.1:4317",
  root = await fetch(base);
const cookie = root.headers
  .getSetCookie()
  .map((c) => c.split(";")[0])
  .join("; ");
async function call(url: string, body?: unknown, method?: string) {
  const r = await fetch(base + "/api" + url, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers: {
      Cookie: cookie,
      ...(body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
    },
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });
  const result = await r.json();
  if (!r.ok) throw new Error(result.error);
  return result;
}
const fixturePath = path.resolve("work/editor-live-fixture.json");
if (process.argv.includes("--cleanup")) {
  const fixture = JSON.parse(await fs.readFile(fixturePath, "utf8"));
  const current = await call("/notes/" + fixture.noteId);
  await call("/notes/" + fixture.noteId, undefined, "DELETE");
  for (const id of current.sources || [])
    await call("/sources/" + id + "/archive", { archived: true });
  console.log("Synthetic note and source archived.");
  process.exit(0);
}
const bootstrap = await call("/bootstrap");
if (bootstrap.config.provider !== "ollama")
  throw new Error("This verification uses local Ollama only.");
const selection =
  "A query is encoded as an embedding. Compare it with document embeddings. Rank documents by similarity. Return the top matching documents.";
let n = await call("/notes", {
  title: "QA: retrieval from question to results",
  context: "Synthetic editor verification",
  group: "QA",
  reviewEnabled: false,
  body:
    "## A search pipeline\n\n" +
    selection +
    "\n\n" +
    variantsMarkdown([
      {
        label: "Simple definition",
        body: "An embedding is a learned vector representation.",
      },
      {
        label: "Example",
        body: "A search system can compare query and document vectors.",
      },
    ]) +
    "\n\n- [ ] Explain similarity without looking\n- [ ] Try a small search example\n\n```python\nresults = index.search(query_vector, top_k=5)\n```",
});
const fixture: any = { noteId: n.id, sourceIds: [] };
await fs.writeFile(fixturePath, JSON.stringify(fixture, null, 2));
const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jc/cAAAAASUVORK5CYII=",
  "base64",
);
const imagePath = path.resolve("work/editor-upload.png");
await fs.writeFile(imagePath, image);
const form = new FormData();
form.append(
  "file",
  new Blob([image], { type: "image/png" }),
  "Image verification.png",
);
const source = await call("/upload", form);
fixture.sourceIds = [source.id];
n = await call(
  "/notes/" + n.id,
  {
    ...n,
    sources: [source.id],
    body: n.body + `\n\n![Uploaded image](../attachments/${source.file})`,
  },
  "PUT",
);
console.log("Image upload and Markdown persistence passed.");
const proposal = await call("/notes/" + n.id + "/ai", {
  kind: "diagram",
  selection,
  diagramType: "flowchart",
});
if ((await call("/notes/" + n.id)).drawings.length)
  throw new Error("Drawing inserted without approval.");
console.log("Local selected-text diagram draft generated.");
const accepted = await call("/proposals/" + proposal[0].id, {
  action: "accept",
});
fixture.drawingId = accepted.drawingId;
const svg = await fetch(
  base + "/files/drawings/" + fixture.drawingId + ".svg",
  { headers: { Cookie: cookie } },
);
if (!svg.ok || !(await svg.text()).includes('role="img"'))
  throw new Error("Inline SVG preview unavailable.");
console.log(
  "Approval, editable scene, transparent SVG and inline insertion passed.",
);
const episode = await call("/episodes", { noteIds: [n.id], ai: true });
if (/\u2014/.test(episode.script))
  throw new Error("Generated script contains a forbidden dash.");
fixture.episodeId = episode.id;
console.log("Conversational podcast script generated locally.");
const audio = await call("/episodes/" + episode.id + "/render", {
  provider: "hermes",
  consent: true,
});
const range = await fetch(base + "/files/audio/" + audio.file, {
  headers: { Cookie: cookie, Range: "bytes=0-127" },
});
if (range.status !== 206) throw new Error("Audio range playback failed.");
fixture.audioFile = audio.file;
console.log(
  "Exact Hermes voice pipeline and audio streaming passed. No Telegram message sent.",
);
await fs.writeFile(fixturePath, JSON.stringify(fixture, null, 2));
console.log(
  JSON.stringify({
    noteId: n.id,
    drawingId: fixture.drawingId,
    episodeId: episode.id,
    cloudTextCalls: 0,
    telegramSends: 0,
  }),
);
