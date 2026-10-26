export async function api<T = any>(
  url: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  const response = await fetch("/api" + url, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers:
      body instanceof FormData ? {} : { "Content-Type": "application/json" },
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
    throw new Error(data.error || "Request failed.");
  }
  return response.json();
}
export function fileUrl(folder: string, file: string, share?: string) {
  return `/files/${folder}/${encodeURIComponent(file)}${share ? "?share=" + encodeURIComponent(share) : ""}`;
}
