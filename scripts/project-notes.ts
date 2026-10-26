import fs from "node:fs/promises";
import path from "node:path";
import { Vault, uid } from "../server/vault.js";
const v = new Vault(path.resolve("vault"));
await v.init();
const notes = await v.notes(true);
const guides = [
  {
    title: "Start here: study with Synapse",
    intuition:
      "Write one explanation. Link it to an idea you already understand. Draw an example. Later, hide the note and explain it from memory. Your notebook is saved as local Markdown files.",
    file: "docs/USER_GUIDE.md",
    implementation:
      "Double-click Start Synapse.cmd, or run npm start after npm run build. Open http://127.0.0.1:4317. Save a replacement API key in Settings only if you want cloud AI. Manual study, PDF extraction, English OCR, and Windows speech work locally.",
  },
  {
    title: "Synapse project specification",
    intuition:
      "A local student notebook with intentional connections, an organized Knowledge Graph, source review, editable drawings, recall practice, audio revision, and scoped sharing. AI suggestions require approval.",
    file: "docs/PROJECT_SPECIFICATION.md",
    implementation:
      "Source code lives in C:\\SecondBrain\\PROJECTS\\PROJECT_SYNAPSE. Notes are in vault/notes. Run npm test and npm run build to verify changes. Read docs/REVIEW.md for the actual verification status and integration limits.",
  },
];
for (const g of guides) {
  const existing = notes.find(
    (n) => n.title === g.title && n.context === "App usage",
  );
  if (existing) {
    if (existing.reviewEnabled !== false)
      await v.write({ ...existing, reviewEnabled: false }, existing.revision);
    continue;
  }
  await v.write({
    id: uid(),
    title: g.title,
    context: "App usage",
    group: "About this notebook",
    layers: {
      intuition: g.intuition,
      technical: await fs.readFile(g.file, "utf8"),
      implementation: g.implementation,
    },
    links: [],
    sources: [],
    drawings: [],
    status: "collected",
    reviewEnabled: false,
    revision: 0,
    updated: "",
  });
}
// Retain the browser QA note as an archived artifact, keeping the student's map clear.
for (const n of notes.filter(
  (n) => n.title === "QA workflow check" && n.group === "QA" && !n.archived,
))
  await v.write({ ...n, archived: true }, n.revision);
console.log(
  "Project guide notes saved. QA note archived with its history preserved.",
);
