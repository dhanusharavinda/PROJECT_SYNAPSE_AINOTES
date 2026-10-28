import dns from "node:dns/promises";
import net from "node:net";
import https from "node:https";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { AppError } from "./vault.js";
import { run } from "./providers.js";
import ffmpeg from "@ffmpeg-installer/ffmpeg";

export function isPrivate(address: string) {
  if (net.isIP(address) === 4) {
    const p = address.split(".").map(Number);
    return (
      p[0] === 0 ||
      p[0] === 10 ||
      p[0] === 127 ||
      p[0] >= 224 ||
      (p[0] === 169 && p[1] === 254) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && [0, 168].includes(p[1])) ||
      (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
      (p[0] === 198 && [18, 19].includes(p[1]))
    );
  }
  if (net.isIP(address) === 6) {
    const a = address.toLowerCase();
    return (
      a === "::" ||
      a === "::1" ||
      a.startsWith("fc") ||
      a.startsWith("fd") ||
      /^fe[89ab]/.test(a) ||
      a.startsWith("ff") ||
      a.startsWith("::ffff:") ||
      !a.startsWith("2")
    );
  }
  return true;
}
export async function publicPage(
  raw: string,
  redirects = 0,
): Promise<{ title: string; text: string; coverage: string; image?: string }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError(400, "Enter a complete public HTTPS or HTTP URL.");
  }
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    !["", "443", "80"].includes(url.port)
  )
    throw new AppError(
      400,
      "Only public HTTP/HTTPS pages on standard ports are supported.",
    );
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = net.isIP(hostname)
    ? [{ address: hostname, family: net.isIP(hostname) }]
    : await dns.lookup(hostname, { all: true });
  if (!addresses.length || addresses.some((a) => isPrivate(a.address)))
    throw new AppError(
      400,
      "Private and local network URLs cannot be imported.",
    );
  const pinned = addresses[0];
  const res = await new Promise<{
    status: number;
    location?: string;
    body: string;
    type: string;
  }>((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const req = transport.get(
      url,
      {
        lookup: ((_host: unknown, options: any, cb: any) => {
          if (typeof options === "function")
            options(null, pinned.address, pinned.family);
          else if (options?.all) cb(null, [pinned]);
          else cb(null, pinned.address, pinned.family);
        }) as any,
        headers: {
          "User-Agent": "SynapseNotebook/1.0",
          Accept: "text/html,text/plain",
        },
        timeout: 15000,
      },
      (r) => {
        let size = 0;
        const chunks: Buffer[] = [];
        r.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 3 * 1024 * 1024) {
            r.destroy();
            reject(
              new AppError(
                413,
                "Page is too large. Upload a file or paste the relevant passage.",
              ),
            );
          } else chunks.push(chunk);
        });
        r.on("error", reject);
        r.on("end", () =>
          resolve({
            status: r.statusCode ?? 500,
            location: r.headers.location,
            body: Buffer.concat(chunks).toString("utf8"),
            type: r.headers["content-type"] ?? "",
          }),
        );
      },
    );
    req.on("timeout", () =>
      req.destroy(
        new AppError(504, "Website timed out. Paste the text instead."),
      ),
    );
    req.on("error", reject);
  });
  if (res.status >= 300 && res.status < 400 && res.location) {
    if (redirects >= 4) throw new AppError(400, "Too many redirects.");
    return publicPage(new URL(res.location, url).href, redirects + 1);
  }
  if (res.status >= 400)
    throw new AppError(
      422,
      "The website blocked extraction. Paste text or upload the source.",
    );
  if (!/text\/html|text\/plain/.test(res.type))
    throw new AppError(
      415,
      "Upload this file instead of importing it as a page.",
    );
  if (res.type.includes("text/plain"))
    return {
      title: url.hostname,
      text: res.body.slice(0, 100000),
      coverage: "Public text retrieved. Linked pages were not fetched.",
    };
  const dom = new JSDOM(res.body, { url: url.href });
  const image =
    dom.window.document
      .querySelector('meta[property="og:image"]')
      ?.getAttribute("content") ||
    dom.window.document
      .querySelector('meta[name="twitter:image"]')
      ?.getAttribute("content") ||
    undefined;
  const article = new Readability(dom.window.document).parse();
  const text = article?.textContent?.trim() ?? "";
  if (text.length < 80 && !image)
    throw new AppError(
      422,
      "Not enough readable text. This page may require a login or client-side rendering. Paste text or upload a file.",
    );
  return {
    title: article?.title || url.hostname,
    text: text.slice(0, 100000),
    image: image ? new URL(image, url).href : undefined,
    coverage:
      "Public page text only. Embedded video, linked pages, and images were not analyzed.",
  };
}
export async function extractPdf(buffer: Buffer) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  });
  const pdf = await task.promise;
  const chunks: string[] = [];
  try {
    for (let page = 1; page <= Math.min(pdf.numPages, 150); page++) {
      const data = await (await pdf.getPage(page)).getTextContent();
      chunks.push(
        `[Page ${page}]\n` +
          data.items.map((x) => ("str" in x ? x.str : "")).join(" "),
      );
    }
  } finally {
    await task.destroy();
  }
  const text = chunks.join("\n\n").slice(0, 150000);
  return {
    text,
    coverage: `Text extracted from ${Math.min(pdf.numPages, 150)} of ${pdf.numPages} pages. Images and formulas may be missing. ${text.length < 100 ? "This looks like a scan. Upload page images for OCR or paste text." : ""}`,
  };
}
export async function ocr(file: string) {
  const { createWorker } = await import("tesseract.js");
  const base = path
    .dirname(
      fileURLToPath(import.meta.resolve("@tesseract.js-data/eng/package.json")),
    )
    .replace("app.asar", "app.asar.unpacked");
  const workerPath = path
    .join(
      path.dirname(fileURLToPath(import.meta.resolve("tesseract.js"))),
      "worker-script",
      "node",
      "index.js",
    )
    .replace("app.asar", "app.asar.unpacked");
  const worker = await createWorker("eng", 1, {
    workerPath,
    langPath: path.join(base, "4.0.0"),
    gzip: true,
    cacheMethod: "none",
  });
  try {
    const result = await worker.recognize(file);
    return {
      text: result.data.text,
      coverage: `Local English OCR. OCR confidence ${Math.round(result.data.confidence)} is a recognition diagnostic, not factual accuracy. Check formulas and handwriting against the image.`,
    };
  } finally {
    await worker.terminate();
  }
}
export async function videoSamples(file: string, directory: string) {
  await fs.mkdir(directory, { recursive: true });
  const executable = ffmpeg.path.replace("app.asar", "app.asar.unpacked");
  await run(executable, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-y",
    "-t",
    "120",
    "-i",
    file,
    "-vf",
    "fps=1/5,scale=768:-2",
    "-frames:v",
    "24",
    "-q:v",
    "4",
    path.join(directory, "frame-%03d.jpg"),
  ]);
  const names = (await fs.readdir(directory))
    .filter((x) => /^frame-\d+\.jpg$/.test(x))
    .sort();
  if (!names.length)
    throw new AppError(
      422,
      "No video frames could be extracted. Upload MP4/WebM or use a transcript.",
    );
  return Promise.all(
    names.map(async (name, i) => ({
      data: (await fs.readFile(path.join(directory, name))).toString("base64"),
      type: "image/jpeg",
      label: `Approximate sample time ${i * 5} seconds. Frames between samples were not inspected.`,
    })),
  );
}
