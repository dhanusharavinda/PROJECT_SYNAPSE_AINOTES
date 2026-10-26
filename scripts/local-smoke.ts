import path from "node:path";
import fs from "node:fs/promises";
import { ocr, extractPdf, videoSamples } from "../server/capture.js";
import { Vault } from "../server/vault.js";
import ffmpeg from "@ffmpeg-installer/ffmpeg";
import { run } from "../server/providers.js";
import { Providers } from "../server/providers.js";
const root = path.resolve("work/smoke-vault");
const v = new Vault(root);
await v.init();
const extracted = await ocr(path.resolve("work/fixtures/ocr.png"));
if (!extracted.text.toLowerCase().includes("embeddings"))
  throw new Error("OCR did not recognize expected text.");
console.log("Local English OCR: passed.");
const parts = ["%PDF-1.4\n"];
const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
];
const stream =
  "BT /F1 18 Tf 72 700 Td (Embeddings represent items as vectors.) Tj ET";
objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
const offsets = [0];
for (let i = 0; i < objects.length; i++) {
  offsets.push(Buffer.byteLength(parts.join("")));
  parts.push(`${i + 1} 0 obj\n${objects[i]}\nendobj\n`);
}
const xref = Buffer.byteLength(parts.join(""));
parts.push(
  `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => String(n).padStart(10, "0") + " 00000 n ")
    .join(
      "\n",
    )}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`,
);
const pdf = Buffer.from(parts.join(""));
await fs.writeFile("work/fixtures/extraction.pdf", pdf);
const result = await extractPdf(pdf);
if (!result.text.includes("Embeddings"))
  throw new Error("PDF text extraction failed.");
console.log("PDF text extraction: passed.");
const p = new Providers(v);
await p.init();
await p.speech(
  "Embeddings represent items as vectors. Pause and explain what similarity means in your own words.",
  v.file("audio/local-check.wav"),
  "local",
);
const wav = await fs.readFile(v.file("audio/local-check.wav"));
if (wav.subarray(0, 4).toString() !== "RIFF")
  throw new Error("Invalid WAV output.");
console.log(`Windows local speech: passed (${wav.length} bytes).`);
const saved = await p.save({
  ...p.config,
  provider: "none",
  openaiKey: "not-a-real-test-secret",
});
const raw = await fs.readFile(v.file(".synapse/settings.json"), "utf8");
if (raw.includes("not-a-real-test-secret"))
  throw new Error("Secret was not encrypted.");
const reopened = new Providers(v);
await reopened.init();
if (reopened.config.openaiKey !== "not-a-real-test-secret")
  throw new Error("DPAPI settings could not be reopened.");
console.log("Encrypted settings round trip: passed. No cloud calls made.");

await run(ffmpeg.path, [
  "-hide_banner",
  "-loglevel",
  "error",
  "-nostdin",
  "-y",
  "-loop",
  "1",
  "-i",
  path.resolve("work/fixtures/ocr.png"),
  "-t",
  "6",
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  path.resolve("work/fixtures/visual-check.mp4"),
]);
const samples = await videoSamples(
  path.resolve("work/fixtures/visual-check.mp4"),
  path.resolve("work/fixtures/video-samples"),
);
if (!samples.length || samples.length > 24)
  throw new Error("Video sampling bounds failed.");
console.log(
  `Local video frame sampling: passed (${samples.length} frames). No frames sent to a provider.`,
);
