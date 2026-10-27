import fs from "node:fs/promises";
import path from "node:path";
import { renderDiagramSvg, type Diagram } from "../src/diagramDesign.js";
let fonts: Promise<string> | undefined;
export async function diagramSvg(diagram: Diagram) {
  fonts ||= Promise.all(
    ["geist", "geist-mono"].map(async (family) => {
      const weight = family === "geist" ? 600 : 400;
      const file = path.resolve(
        `node_modules/@fontsource/${family}/files/${family}-latin-${weight}-normal.woff2`,
      );
      const bytes = await fs.readFile(file);
      return `@font-face{font-family:'${family === "geist" ? "Geist" : "Geist Mono"}';font-weight:${weight};src:url(data:font/woff2;base64,${bytes.toString("base64")}) format('woff2');}`;
    }),
  ).then((css) => css.join(""));
  return renderDiagramSvg(diagram, await fonts);
}
