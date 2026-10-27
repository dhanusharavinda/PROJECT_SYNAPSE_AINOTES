import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs/promises";
import crypto from "node:crypto";
export default defineConfig({
  plugins: [
    react(),
    {
      name: "tablet-offline-shell",
      async closeBundle() {
        const manifest = JSON.parse(
            await fs.readFile("dist/.vite/manifest.json", "utf8"),
          ),
          files = new Set<string>([
            "/index.html",
            "/manifest.webmanifest",
            "/tablet-icon.png",
          ]),
          visited = new Set<string>();
        function collect(key: string) {
          if (visited.has(key)) return;
          visited.add(key);
          const item = manifest[key];
          if (!item) return;
          files.add("/" + item.file);
          for (const f of [...(item.css || []), ...(item.assets || [])])
            files.add("/" + f);
          for (const dep of item.imports || []) collect(dep);
        }
        for (const key of Object.keys(manifest))
          if (manifest[key].isEntry || key === "src/TabletApp.tsx")
            collect(key);
        await fs.mkdir("dist/tablet", { recursive: true });
        await fs.copyFile("dist/index.html", "dist/tablet/index.html");
        const list = [...files];
        const worker = await fs.readFile("public/sw.js", "utf8");
        const version = crypto
          .createHash("sha256")
          .update(list.join())
          .update(worker)
          .update(await fs.readFile("dist/index.html"))
          .update(await fs.readFile("dist/manifest.webmanifest"))
          .update(await fs.readFile("dist/tablet-icon.png"))
          .digest("hex")
          .slice(0, 16);
        await fs.writeFile(
          "dist/tablet-precache.json",
          JSON.stringify({
            version,
            files: list,
          }),
        );
        await fs.writeFile(
          "dist/sw.js",
          worker.replace("__SYNAPSE_SHELL_VERSION__", version),
        );
      },
    },
  ],
  build: { chunkSizeWarningLimit: 1600, manifest: true },
  server: { middlewareMode: true },
  optimizeDeps: { include: ["react", "react-dom/client"] },
});
