import { it, expect } from "vitest";
import { clipPdfLink, writePdf } from "../src/pdfExport";
import fs from "node:fs";
const pixel =
  "data:image/png;base64," +
  fs.readFileSync("build/icon.png").toString("base64");
it("clips wrapped links at page boundaries with correct PDF coordinates", () => {
  expect(
    clipPdfLink(
      { left: 20, top: 90, right: 80, bottom: 130 },
      { left: 0, top: 100, right: 1000, bottom: 1200 },
      { left: 0, top: 0, width: 1000, height: 1250 },
    ),
  ).toEqual({ x: 16, y: 80, width: 48, height: 24 });
  expect(
    clipPdfLink(
      { left: 20, top: 50, right: 80, bottom: 90 },
      { left: 0, top: 100, right: 1000, bottom: 1200 },
      { left: 0, top: 0, width: 1000, height: 1250 },
    ),
  ).toBeNull();
});
it("writes external and internal annotations and omits missing private targets", async () => {
  const pdf = await writePdf([
    {
      image: pixel,
      noteId: "parent",
      links: [
        {
          x: 10,
          y: 20,
          width: 30,
          height: 10,
          url: "https://example.com/learning",
        },
        { x: 10, y: 40, width: 30, height: 10, noteId: "child" },
        { x: 10, y: 60, width: 30, height: 10, noteId: "private" },
      ],
    },
    { image: pixel, noteId: "child", links: [] },
  ]);
  const bytes = pdf.output();
  expect(pdf.getNumberOfPages()).toBe(2);
  expect(bytes).toContain("/URI (https://example.com/learning)");
  expect(bytes).toContain("/Dest [");
  expect(bytes.match(/\/Subtype \/Link/g)).toHaveLength(2);
});
