import { it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { snapshot } from "../server/viewLinks";
import { Vault } from "../server/vault";
import { newTabletNote } from "../src/tabletStore";
import { indexResources } from "../server/resourceIndex";
it("indexes note URLs and uploaded references once, preserving bookmarks", () => {
  const n = newTabletNote();
  n.body =
    "[Read](https://example.com/learn) ![image](../attachments/test.png)";
  n.canvas = {
    height: 500,
    items: [
      {
        id: crypto.randomUUID(),
        kind: "video",
        x: 0,
        y: 0,
        width: 280,
        height: 210,
        src: "https://youtu.be/abcdefghijk",
      },
    ],
  };
  const first = indexResources([n], []);
  expect(first).toHaveLength(3);
  first[0].bookmarked = true;
  const again = indexResources([n], first);
  expect(again).toHaveLength(3);
  expect(again[0].bookmarked).toBe(true);
});
it("encrypts a page and referenced files with a fragment key that the relay never gets", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "synapse-view-"));
  try {
    const v = new Vault(root);
    await v.init();
    const n = newTabletNote();
    n.body = "![Picture](../attachments/test.png)";
    await fs.writeFile(v.file("attachments/test.png"), "fake image");
    const s = await snapshot(v, n);
    const encrypted = Buffer.from(s.data, "base64url"),
      dec = crypto.createDecipheriv(
        "aes-256-gcm",
        Buffer.from(s.key, "base64url"),
        Buffer.from(s.iv, "base64url"),
      );
    dec.setAuthTag(encrypted.subarray(-16));
    const decoded = JSON.parse(
      Buffer.concat([
        dec.update(encrypted.subarray(0, -16)),
        dec.final(),
      ]).toString(),
    );
    expect(decoded.note.body).toBe(n.body);
    expect(decoded.files["/files/attachments/test.png"].data).toBe(
      Buffer.from("fake image").toString("base64"),
    );
    expect(s.data).not.toContain("fake image");
    await fs.writeFile(v.file("attachments/test.png"), Buffer.alloc(2000001));
    await expect(snapshot(v, n)).rejects.toThrow("2 MB");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
