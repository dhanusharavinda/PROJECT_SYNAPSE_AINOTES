import { useState, useEffect } from "react";
import { api, fileUrl } from "./api";
import { MD, Busy } from "./ui";
import type { Note, Layer } from "./types";
export default function Shared({ token }: { token: string }) {
  const [data, setData] = useState<any>();
  const [error, setError] = useState("");
  const [layers, setLayers] = useState<Note["layers"]>();
  const [author, setAuthor] = useState("");
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    try {
      const d = await api("/shared/" + token);
      setData(d);
      setLayers(d.note.layers);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    load();
  }, [token]);
  if (error)
    return (
      <div className="share-shell">
        <h1>Shared note unavailable</h1>
        <p>{error}</p>
      </div>
    );
  if (!data || !layers)
    return (
      <div className="loading-overlay">
        <Busy />
        Opening shared note...
      </div>
    );
  return (
    <div className="share-shell">
      <header>
        <a className="brand" href="/">
          ✳ Synapse
        </a>
        <span className="pill">{data.share.role} access</span>
      </header>
      <p className="eyebrow">SHARED CONCEPT NOTE</p>
      <h1>{data.note.title}</h1>
      <p className="muted">Meaning: {data.note.context}</p>
      {(["intuition", "technical", "implementation"] as Layer[]).map((l) => (
        <section key={l}>
          <h3>{l}</h3>
          {data.share.role === "editor" ? (
            <textarea
              aria-label={"Shared " + l}
              value={layers[l]}
              onChange={(e) => setLayers({ ...layers, [l]: e.target.value })}
            />
          ) : (
            <MD
              text={layers[l]
                .replaceAll("../attachments/", "/files/attachments/")
                .replace(
                  /(\/files\/attachments\/[^\s)]+)/g,
                  "$1?share=" + token,
                )}
            />
          )}
        </section>
      ))}
      {data.share.role === "editor" && (
        <button
          className="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api(
                "/shared/" + token,
                { layers, revision: data.note.revision, etag: data.note.etag },
                "PUT",
              );
              await load();
              setMessage("Changes saved.");
            } catch (e) {
              setMessage((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Save shared explanation
        </button>
      )}
      {data.note.drawings.length > 0 && (
        <section>
          <h3>Sketches and flows</h3>
          {data.note.drawings.map((id: string) => (
            <img
              key={id}
              style={{ maxWidth: "100%" }}
              src={fileUrl("drawings", id + ".svg", token)}
              alt="Shared drawing"
            />
          ))}
        </section>
      )}
      {data.sources.length > 0 && (
        <section>
          <h3>Attached sources</h3>
          {data.sources.map((s: any) => (
            <div className="source-row" key={s.id}>
              <span>{s.title}</span>
              {s.file && (
                <a
                  target="_blank"
                  rel="noreferrer"
                  href={fileUrl("attachments", s.file, token)}
                >
                  Open attachment
                </a>
              )}
            </div>
          ))}
        </section>
      )}
      {data.share.role !== "viewer" && (
        <section className="shared-comments">
          <h3>
            {data.share.role === "suggestion"
              ? "Suggest an addition"
              : "Discussion"}
          </h3>
          <p className="muted">
            {data.share.role === "suggestion"
              ? "Your addition remains pending until the owner accepts it."
              : "Comments do not change the note."}
          </p>
          <label>
            Your name
            <input value={author} onChange={(e) => setAuthor(e.target.value)} />
          </label>
          <label>
            Message
            <textarea value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <button
            disabled={!author.trim() || !text.trim() || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api("/shared/" + token + "/comments", { author, text });
                setText("");
                await load();
                setMessage("Submitted.");
              } catch (e) {
                setMessage((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Submit
          </button>
          {data.comments.map((c: any) => (
            <div className="comment-card" key={c.id}>
              <strong>{c.author}</strong>
              <span className="pill">{c.state}</span>
              <MD text={c.text} />
            </div>
          ))}
        </section>
      )}
      {message && (
        <p role="status" className="coverage">
          {message}
        </p>
      )}
      <footer className="muted small">
        Only this note is shared. Other notes and private connections remain
        outside this link.
      </footer>
    </div>
  );
}
