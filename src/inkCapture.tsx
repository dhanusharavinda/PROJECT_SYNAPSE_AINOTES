import { renderToStaticMarkup } from "react-dom/server";
import SheetShape from "./SheetShape";
import type { NotebookPage } from "./types";
import { pageSource } from "./notebookModel";
import { xml } from "./diagramDesign";
import { inkBounds } from "./inkGeometry";

export async function sourceDigest(page: NotebookPage) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(pageSource(page)),
  );
  return Array.from(new Uint8Array(bytes), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
}
export function inkRegions(page: NotebookPage) {
  const items = page.canvas.items.filter(
    (i) => !["image", "drawing", "video"].includes(i.kind),
  );
  const intervals = items
    .map(inkBounds)
    .map((b) => ({ start: Math.max(0, b.y - 20), end: b.y + b.height + 20 }))
    .sort((a, b) => a.start - b.start);
  const groups: typeof intervals = [];
  for (const band of intervals) {
    const previous = groups.at(-1);
    if (
      previous &&
      band.start < previous.end + 60 &&
      Math.max(previous.end, band.end) - previous.start < 2400
    )
      previous.end = Math.max(previous.end, band.end);
    else groups.push({ ...band });
  }
  return groups.map((g) => ({
    x: 0,
    y: g.start,
    width: Math.min(
      100000,
      Math.max(
        page.canvas.width || 1100,
        ...items.map((i) => {
          const b = inkBounds(i);
          return b.x + b.width + 20;
        }),
      ),
    ),
    height: Math.max(32, g.end - g.start),
  }));
}
export function inkSvg(
  page: NotebookPage,
  bounds: { x: number; y: number; width: number; height: number },
) {
  const shapes = page.canvas.items
    .filter((i) => {
      const b = inkBounds(i);
      return b.y < bounds.y + bounds.height && b.y + b.height > bounds.y;
    })
    .map((i) => {
      if (["image", "drawing", "video"].includes(i.kind)) return "";
      const rotate = `rotate(${i.rotation || 0} ${i.x + i.width / 2} ${i.y + i.height / 2})`;
      if (i.kind === "text" || i.kind === "table") {
        const lines = (i.text || "").replace(/<[^>]*>/g, "").split("\n");
        return `<g transform="${rotate}"><g transform="translate(${i.x} ${i.y})" fill="${xml(i.color || "#24392f")}" font-family="Arial" font-size="${16 * (i.textScale || 1)}">${lines.map((s, index) => `<text x="0" y="${20 + index * 22}">${xml(s)}</text>`).join("")}</g></g>`;
      }
      return (
        `<g transform="${rotate}">` +
        renderToStaticMarkup(<SheetShape item={i} />).replace(
          "<svg ",
          `<svg x="${i.x}" y="${i.y}" width="${i.width}" height="${i.height}" `,
        ) +
        "</g>"
      );
    })
    .join("");
  const scale = Math.min(2, 2048 / Math.max(bounds.width, bounds.height));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(bounds.width * scale)}" height="${Math.ceil(bounds.height * scale)}" viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}"><rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" fill="#fffef8"/>${shapes}</svg>`;
}
export async function captureInk(
  page: NotebookPage,
  bounds: { x: number; y: number; width: number; height: number },
) {
  const svg = inkSvg(page, bounds);
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw Error("Image capture is unavailable.");
    ctx.drawImage(image, 0, 0);
    return {
      data: canvas.toDataURL("image/png").split(",")[1],
      type: "image/png" as const,
      bounds,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
