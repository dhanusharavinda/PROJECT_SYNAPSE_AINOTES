import { useEffect, useState } from "react";
import { api } from "./api";
import { copyText } from "./clipboard";
import type { Note } from "./types";
export default function ViewLink({ note }: { note: Note }) {
  const [links, setLinks] = useState<any[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = () =>
    api<any[]>("/notes/" + note.id + "/view-links").then(setLinks);
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [note.id]);
  return (
    <section className="view-link-panel">
      <h3>Read-only link</h3>
      <p>
        A saved copy anyone with the full link can view for 7 days, even when
        your PC is off. Changes need a new link. Attached files are included, up
        to 2 MB. Sign in first.
      </p>
      {error && <p role="alert">{error}</p>}
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await api("/notes/" + note.id + "/view-link", {});
            await load();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Creating..." : "Create view link"}
      </button>
      {links.map((link) => (
        <div className="view-link-row" key={link.id}>
          <input
            aria-label="Read-only share link"
            readOnly
            value={link.url}
            onFocus={(e) => e.target.select()}
          />
          <button
            onClick={() =>
              void copyText(link.url).catch((e) => setError(e.message))
            }
          >
            Copy
          </button>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api("/view-links/revoke", { id: link.id });
                await load();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Remove
          </button>
        </div>
      ))}
    </section>
  );
}
