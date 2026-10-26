import fs from "node:fs/promises";
await fs.mkdir("public/excalidraw", { recursive: true });
await fs.cp(
  "node_modules/@excalidraw/excalidraw/dist/prod/fonts",
  "public/excalidraw/fonts",
  { recursive: true },
);
console.log("Local drawing fonts prepared.");
