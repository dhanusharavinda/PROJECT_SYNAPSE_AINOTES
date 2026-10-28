import { useEffect, useState } from "react";
import { setViewMedia, mediaUrl } from "./api";
import { storedNoteSchema } from "./noteSchema";
import type { Note } from "./types";
import CanvasRead from "./CanvasRead";
import { MD } from "./ui";
import { bodyOf } from "./content";
const decode = (text: string) =>
  Uint8Array.from(atob(text.replaceAll("-", "+").replaceAll("_", "/")), (c) =>
    c.charCodeAt(0),
  );
export default function PublicView() {
  const [data, setData] = useState<{
      note: Note;
      sources: any[];
      expires: number;
    }>(),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const blobs: string[] = [];
    void (async () => {
      const id = location.pathname.split("/")[2],
        secret = location.hash.slice(1);
      if (!/^[a-f0-9-]{36}$/.test(id) || !/^[A-Za-z0-9_-]{43}$/.test(secret))
        throw Error(
          "This view link is incomplete. Ask the owner for the full link.",
        );
      const response = await fetch(
        "https://synapse-device-relay.synapse-device-relay.workers.dev/accounts/view?id=" +
          id,
      );
      const encrypted = await response.json();
      if (!response.ok)
        throw Error(encrypted.error || "This view link is unavailable.");
      const key = await crypto.subtle.importKey(
        "raw",
        decode(secret),
        "AES-GCM",
        false,
        ["decrypt"],
      );
      const raw = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: decode(encrypted.iv) },
        key,
        decode(encrypted.data),
      );
      const payload = JSON.parse(new TextDecoder().decode(raw)),
        note = storedNoteSchema.parse(payload.note),
        map: Record<string, string> = {};
      for (const [path, file] of Object.entries(payload.files) as [
        string,
        any,
      ][]) {
        if (
          !/^\/files\/(attachments|drawings)\/[-a-zA-Z0-9]+\.[a-zA-Z0-9]+$/.test(
            path,
          ) ||
          ![
            "image/png",
            "image/jpeg",
            "image/webp",
            "image/svg+xml",
            "application/pdf",
            "text/plain",
          ].includes(file.type)
        )
          continue;
        const url = URL.createObjectURL(
          new Blob([decode(file.data)], { type: file.type }),
        );
        blobs.push(url);
        map[path] = url;
      }
      if (live) {
        setViewMedia(map);
        document.documentElement.dataset.theme = note.theme || "light";
        setData({
          note,
          sources: payload.sources || [],
          expires: encrypted.expires,
        });
      }
    })().catch((e) => {
      if (live) setError(e.message || "Could not open this view link.");
    });
    return () => {
      live = false;
      setViewMedia();
      blobs.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);
  if (error)
    return (
      <main className="public-note">
        <h1>View link unavailable</h1>
        <p role="alert">{error}</p>
      </main>
    );
  if (!data) return <p role="status">Opening shared note...</p>;
  return (
    <main className="public-note">
      <header>
        <span>Synapse</span>
        <span>
          Read-only snapshot · Expires{" "}
          {new Date(data.expires).toLocaleDateString()}
        </span>
      </header>
      <h1>{data.note.title}</h1>
      <CanvasRead canvas={data.note.canvas || { items: [], height: 500 }}>
        <MD text={bodyOf(data.note)} />
      </CanvasRead>
      {data.sources.length > 0 && (
        <details>
          <summary>Resources</summary>
          {data.sources.map((s, i) => (
            <p key={i}>
              <a
                href={
                  s.file
                    ? mediaUrl("/files/attachments/" + s.file)
                    : /^https?:\/\//.test(s.url || "")
                      ? s.url
                      : undefined
                }
                target="_blank"
                rel="noopener noreferrer"
              >
                {s.title}
              </a>
            </p>
          ))}
        </details>
      )}
    </main>
  );
}
