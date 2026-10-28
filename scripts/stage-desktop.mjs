import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const project = process.cwd();
const stage = path.join(project, "desktop-stage");
const source = JSON.parse(
  await fs.readFile(path.join(project, "package.json"), "utf8"),
);
const lock = JSON.parse(
  await fs.readFile(path.join(project, "package-lock.json"), "utf8"),
);
// React, Tiptap, Excalidraw and graph UI are already compiled into dist.
const runtime = [
  "@dagrejs/dagre",
  "@ffmpeg-installer/ffmpeg",
  "@fontsource/geist",
  "@fontsource/geist-mono",
  "@mozilla/readability",
  "@tesseract.js-data/eng",
  "electron-updater",
  "express",
  "gray-matter",
  "jsdom",
  "multer",
  "openai",
  "pdfjs-dist",
  "tesseract.js",
  "zod",
  "qrcode",
  "ws",
];
await fs.mkdir(stage, { recursive: true });
const manifest = {
  name: source.name,
  productName: source.productName,
  version: source.version,
  description: source.description,
  author: source.author,
  type: "module",
  main: source.main,
  dependencies: Object.fromEntries(
    runtime.map((name) => [
      name,
      lock.packages["node_modules/" + name]?.version ||
        source.dependencies[name],
    ]),
  ),
  overrides: source.overrides,
};
await fs.writeFile(
  path.join(stage, "package.json"),
  JSON.stringify(manifest, null, 2),
);
for (const directory of ["dist", "desktop-dist", "build"]) {
  const target = path.resolve(stage, directory);
  if (!target.startsWith(stage + path.sep))
    throw new Error("Invalid staging path.");
  await fs.rm(target, { recursive: true, force: true });
  if (directory === "build") {
    await fs.mkdir(target, { recursive: true });
    await fs.copyFile(
      path.join(project, "build", "icon.png"),
      path.join(target, "icon.png"),
    );
  } else
    await fs.cp(path.join(project, directory), target, { recursive: true });
}
const environment = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) => !/^npm_config_allow[-_]scripts$/i.test(key),
  ),
);
const npmCli =
  process.env.npm_execpath ||
  path.join(
    path.dirname(process.execPath),
    "node_modules",
    "npm",
    "bin",
    "npm-cli.js",
  );
const result = spawnSync(
  process.execPath,
  [
    npmCli,
    "install",
    "--omit=dev",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
  ],
  { cwd: stage, stdio: "inherit", env: environment },
);
if (result.status !== 0) process.exit(result.status || 1);
console.log("Desktop staged with server dependencies only.");
