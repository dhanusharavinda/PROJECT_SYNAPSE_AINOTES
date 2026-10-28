import { it, expect, vi, afterEach } from "vitest";
import dns from "node:dns/promises";
import https from "node:https";
import { publicImage, resourcePreview } from "../server/resourcePreview";
import type { Source } from "../src/types";
afterEach(() => vi.restoreAllMocks());
it("rejects local, credentialed, non-HTTPS and alternate-port thumbnail URLs before downloading", async () => {
  const get = vi.spyOn(https, "get");
  for (const url of [
    "https://127.0.0.1/a.png",
    "https://[::1]/a.png",
    "http://example.com/a.png",
    "https://name:secret@example.com/a.png",
    "https://example.com:8443/a.png",
  ])
    await expect(publicImage(url)).rejects.toThrow();
  expect(get).not.toHaveBeenCalled();
});
it("rejects public-looking hostnames resolving to private addresses", async () => {
  vi.spyOn(dns, "lookup").mockResolvedValue([
    { address: "192.168.1.1", family: 4 },
  ] as any);
  const get = vi.spyOn(https, "get");
  await expect(
    publicImage("https://preview.example/image.png"),
  ).rejects.toThrow("Private");
  expect(get).not.toHaveBeenCalled();
});
it("degrades inaccessible resources to a fallback instead of breaking the library", async () => {
  expect(
    await resourcePreview({ url: "https://127.0.0.1/private" } as Source),
  ).toEqual({ image: null });
  expect(await resourcePreview({ file: "document.pdf" } as Source)).toEqual({
    image: null,
  });
});
