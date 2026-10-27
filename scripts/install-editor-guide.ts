import fs from "node:fs/promises";
const base = "http://127.0.0.1:4317";
const response = await fetch(base);
const cookie = response.headers
  .getSetCookie()
  .map((c) => c.split(";")[0])
  .join("; ");
const call = async (url: string, body?: unknown, method?: string) => {
  const r = await fetch(base + "/api" + url, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await r.json();
  if (!r.ok) throw new Error(result.error);
  return result;
};
const data = await call("/bootstrap");
const title = "Editor and graph: current guide";
const old = data.notes.find((n: any) => n.title === title);
const body = await fs.readFile("docs/EDITOR_V2.md", "utf8");
const result = await call(
  old ? "/notes/" + old.id : "/notes",
  {
    ...old,
    title,
    context: "Using Synapse",
    group: "About this notebook",
    body,
    reviewEnabled: false,
  },
  old ? "PUT" : "POST",
);
console.log("Updated local guide: " + result.id);
