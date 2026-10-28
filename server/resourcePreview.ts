import dns from "node:dns/promises";
import net from "node:net";
import https from "node:https";
import { isPrivate, publicPage } from "./capture.js";
import { AppError } from "./vault.js";
import type { Source } from "../src/types.js";
export async function publicImage(raw: string, redirects = 0): Promise<string> {
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  )
    throw new AppError(400, "Unsupported preview URL.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = net.isIP(host)
    ? [{ address: host, family: net.isIP(host) }]
    : await dns.lookup(host, { all: true });
  if (!addresses.length || addresses.some((a) => isPrivate(a.address)))
    throw new AppError(400, "Private preview URLs are not allowed.");
  const pinned = addresses[0];
  const result = await new Promise<{
    location?: string;
    status: number;
    type: string;
    bytes: Buffer;
  }>((resolve, reject) => {
    const request = https.get(
      url,
      {
        timeout: 10000,
        headers: {
          Accept: "image/png,image/jpeg,image/webp",
          "User-Agent": "SynapseNotebook/1.0",
        },
        lookup: ((_host: unknown, options: any, cb: any) => {
          if (typeof options === "function")
            options(null, pinned.address, pinned.family);
          else if (options?.all) cb(null, [pinned]);
          else cb(null, pinned.address, pinned.family);
        }) as any,
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 2_000_000)
            response.destroy(new Error("Preview too large"));
          else chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () =>
          resolve({
            location: response.headers.location,
            status: response.statusCode || 500,
            type: (response.headers["content-type"] || "").split(";")[0],
            bytes: Buffer.concat(chunks),
          }),
        );
      },
    );
    request.on("error", reject);
    request.on("timeout", () =>
      request.destroy(new Error("Preview timed out")),
    );
  });
  if (
    result.status >= 300 &&
    result.status < 400 &&
    result.location &&
    redirects < 3
  )
    return publicImage(new URL(result.location, url).href, redirects + 1);
  if (
    result.status !== 200 ||
    !["image/png", "image/jpeg", "image/webp"].includes(result.type)
  )
    throw new Error("No supported preview");
  return `data:${result.type};base64,${result.bytes.toString("base64")}`;
}
const cache = new Map<
  string,
  { expires: number; value: Promise<{ image: string | null }> }
>();
export async function resourcePreview(source: Source) {
  if (!source.url) return { image: null };
  const key = source.url,
    prior = cache.get(key);
  if (prior && prior.expires > Date.now()) return prior.value;
  const value = (async () => {
    try {
      const page = await publicPage(source.url!);
      return { image: page.image ? await publicImage(page.image) : null };
    } catch {
      return { image: null };
    }
  })();
  if (cache.size >= 24) cache.delete(cache.keys().next().value!);
  cache.set(key, { expires: Date.now() + 3600000, value });
  return value;
}
