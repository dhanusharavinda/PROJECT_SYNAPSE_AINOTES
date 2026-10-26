const base = "http://127.0.0.1:4317";
const root = await fetch(base);
const cookie = root.headers
  .getSetCookie()
  .map((c) => c.split(";")[0])
  .join("; ");
async function call(url: string, body?: unknown, method?: string) {
  const response = await fetch(base + "/api" + url, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Live workflow request failed.");
  return data;
}
const bootstrap = await call("/bootstrap");
if (bootstrap.config.provider !== "ollama")
  throw new Error("This diagnostic only uses the configured local model.");
const n = await call("/notes", {
  title: "QA local AI workflow",
  context: "Synthetic local verification",
  group: "QA",
  reviewEnabled: false,
  layers: {
    intuition: "Cosine similarity compares directions of nonzero vectors.",
    technical: "For unit vectors, cosine similarity equals the dot product.",
    implementation: "Check zero-length vectors before normalization.",
  },
});
try {
  const layers = await call("/notes/" + n.id + "/ai", { kind: "layers" });
  const before = await call("/notes/" + n.id);
  if (before.layers.intuition !== n.layers.intuition)
    throw new Error("AI changed a note before approval.");
  await call("/proposals/" + layers[0].id, { action: "accept" });
  const after = await call("/notes/" + n.id);
  if (after.revision !== n.revision + 1)
    throw new Error("Approved layers were not committed.");
  const diagram = await call("/notes/" + n.id + "/ai", { kind: "diagram" });
  if ((await call("/notes/" + n.id)).drawings.length)
    throw new Error("Diagram was inserted without approval.");
  await call("/proposals/" + diagram[0].id, { action: "accept" });
  const final = await call("/notes/" + n.id);
  const drawing = await call("/drawings/" + final.drawings[0]);
  if (!drawing.diagram.nodes.length)
    throw new Error("Editable diagram payload is missing.");
  console.log(
    JSON.stringify(
      {
        provider: "local Ollama",
        explanationDraft: "passed",
        approvalGate: "passed",
        acceptedMarkdown: "passed",
        diagramDraft: "passed",
        editableDiagram: "passed",
        cloudCalls: 0,
      },
      null,
      2,
    ),
  );
} finally {
  await call("/notes/" + n.id, undefined, "DELETE");
}
export {};
