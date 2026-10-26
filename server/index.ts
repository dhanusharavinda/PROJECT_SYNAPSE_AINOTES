import path from "node:path";
import fs from "node:fs/promises";
import net from "node:net";
import crypto from "node:crypto";
import express from "express";
import { createApp } from "./app.js";
import { seed } from "./seed.js";
const root = process.env.SYNAPSE_VAULT || path.resolve("vault");
await fs.mkdir(root, { recursive: true });
const canonical = await fs.realpath(root);
const lock = net.createServer((socket) => socket.end());
if (process.platform === "win32") {
  const pipe =
    "\\\\.\\pipe\\synapse-vault-" +
    crypto
      .createHash("sha256")
      .update(canonical.toLowerCase())
      .digest("hex")
      .slice(0, 24);
  try {
    await new Promise<void>((resolve, reject) => {
      lock.once("error", reject);
      lock.listen(pipe, () => {
        lock.removeListener("error", reject);
        resolve();
      });
    });
  } catch {
    console.error(
      "This notebook is already open in another Synapse server. Reuse its browser window.",
    );
    process.exit(1);
  }
}
const lan = process.argv.includes("--lan");
const { app, vault, errors } = await createApp(root, { lan });
await seed(vault);
if (process.argv.includes("--production")) {
  app.use(express.static(path.resolve("dist")));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(path.resolve("dist/index.html")),
  );
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
app.use(errors);
const port = Number(process.env.PORT || 4317);
const server = app.listen(port, lan ? "0.0.0.0" : "127.0.0.1", () =>
  console.log(
    `Synapse ready: http://127.0.0.1:${port}\nNotebook: ${root}\nMode: ${lan ? "LAN sharing enabled" : "local only"}`,
  ),
);
server.on("error", (e) => {
  console.error(e.message);
  lock.close();
  process.exit(1);
});
