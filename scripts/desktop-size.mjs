import fs from "node:fs/promises";
import path from "node:path";
import asar from "@electron/asar";

const folder = process.argv[2] || "release/win-unpacked";
async function bytes(folder) {
  let size = 0;
  for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name);
    size += entry.isDirectory()
      ? await bytes(file)
      : (await fs.stat(file)).size;
  }
  return size;
}
console.log(
  "Installed files:",
  ((await bytes(folder)) / 1048576).toFixed(1),
  "MiB",
);
const archive = path.join(folder, "resources", "app.asar");
const totals = {};
for (const file of asar.listPackage(archive)) {
  let record;
  try {
    record = asar.statFile(archive, file.replace(/^[\\/]/, ""));
  } catch {
    continue;
  }
  if (record.files || record.unpacked) continue;
  const parts = file.replaceAll("\\", "/").split("/").filter(Boolean);
  const name =
    parts[0] === "node_modules"
      ? parts[1].startsWith("@")
        ? parts.slice(1, 3).join("/")
        : parts[1]
      : parts[0];
  totals[name] = (totals[name] || 0) + (record.size || 0);
}
console.log(
  Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([name, size]) => `${name}: ${(size / 1048576).toFixed(1)} MiB`)
    .join("\n"),
);
