let sharedMediaScope = "";
let viewMedia: Record<string, string> | undefined;
export function setViewMedia(value?: Record<string, string>) {
  viewMedia = value;
}
export function setSharedMediaScope(value: string) {
  sharedMediaScope = value;
}
export const hosted = !["localhost", "127.0.0.1", "[::1]"].includes(
  location.hostname,
);
export const companion = hosted ? "http://127.0.0.1:4317" : "";
export function pairingToken() {
  try {
    return sessionStorage.getItem("synapse-pairing") || "";
  } catch {
    return "";
  }
}
export function mediaUrl(url: string) {
  if (viewMedia && url.startsWith("/files/"))
    return viewMedia[url.split("?")[0]] || "";
  if (sharedMediaScope && url.startsWith("/files/"))
    return "/api/collaboration/files/" + sharedMediaScope + "/" + url.slice(7);
  if (location.pathname.startsWith("/tablet") && url.startsWith("/files/"))
    return "/tablet" + url.split("?")[0];
  if (!hosted || !url.startsWith("/files/")) return url;
  return (
    companion +
    url +
    (url.includes("?") ? "&" : "?") +
    "access=" +
    encodeURIComponent(pairingToken())
  );
}
export async function api<T = any>(
  url: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  const response = await fetch(companion + "/api" + url, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers: {
      ...(body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...(hosted && pairingToken()
        ? { Authorization: "Bearer " + pairingToken() }
        : {}),
    },
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });
  if (!response.ok) {
    const data = await response
      .json()
      .catch(() => ({ error: "The local server is unavailable." }));
    throw Object.assign(new Error(data.error || "Request failed."), {
      status: response.status,
    });
  }
  return response.json();
}
export function fileUrl(folder: string, file: string, share?: string) {
  return mediaUrl(
    `/files/${folder}/${encodeURIComponent(file)}${share ? "?share=" + encodeURIComponent(share) : ""}`,
  );
}
