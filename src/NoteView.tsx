import { useEffect, useRef, useState, lazy, Suspense } from "react";
import {
  ArrowUpRight,
  Link2,
  Plus,
  Share2,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
  History,
  Download,
  Trash2,
  PenLine,
  Workflow,
  Check,
  Save,
  ChevronRight,
  FileText,
  Unlink,
} from "lucide-react";
import type { Bootstrap, Note, Layer, Relation, Proposal } from "./types";
import { api, fileUrl } from "./api";
import { Modal, MD, Busy } from "./ui";
import Editor from "./Editor";
const Drawing = lazy(() => import("./Drawing"));
const layers: Layer[] = ["intuition", "technical", "implementation"];
export default function NoteView({
  note,
  data,
  refresh,
  onOpen,
  onPractice,
  onNew,
  notify,
  onDirty,
}: {
  note: Note;
  data: Bootstrap;
  refresh: () => Promise<void>;
  onOpen: (n: Note) => void;
  onPractice: (id: string) => void;
  onNew: () => void;
  notify: (s: string) => void;
  onDirty: (d: boolean) => void;
}) {
  const [draft, setDraft] = useState(note);
  const latest = useRef(note);
  const dirty = useRef(false);
  const saving = useRef(false);
  const [saveStatus, setSaveStatus] = useState("Saved locally");
  const [layer, setLayer] = useState<Layer>("intuition");
  const [connections, setConnections] = useState(true);
  const [modal, setModal] = useState("");
  const [target, setTarget] = useState("");
  const [relation, setRelation] = useState<Relation>("related");
  const [reason, setReason] = useState("");
  const [drawing, setDrawing] = useState<string>();
  const [drawingVersion, setDrawingVersion] = useState(0);
  const [pending, setPending] = useState("");
  const [proposal, setProposal] = useState<Proposal>();
  const [history, setHistory] = useState<any[]>([]);
  const [shareRole, setShareRole] = useState("viewer");
  const [shareLabel, setShareLabel] = useState("");
  const [conflict, setConflict] = useState<Note>();
  useEffect(() => {
    if (
      note.id !== latest.current.id ||
      (!dirty.current && note.revision !== latest.current.revision)
    ) {
      latest.current = note;
      setDraft(note);
      dirty.current = false;
      setSaveStatus("Saved locally");
    }
  }, [note]);
  function edit(patch: Partial<Note>) {
    if (
      Object.entries(patch).every(([key, value]) =>
        key === "layers"
          ? layers.every(
              (l) => (value as Note["layers"])[l] === latest.current.layers[l],
            )
          : value === latest.current[key as keyof Note],
      )
    )
      return;
    const n = { ...latest.current, ...patch };
    latest.current = n;
    setDraft(n);
    dirty.current = true;
    onDirty(true);
    setSaveStatus("Unsaved changes");
  }
  async function save() {
    if (!dirty.current) return latest.current;
    if (saving.current)
      throw new Error("A save is in progress. Try again in a moment.");
    saving.current = true;
    const snapshot = latest.current;
    setSaveStatus("Saving...");
    try {
      const saved = await api<Note>("/notes/" + snapshot.id, snapshot, "PUT");
      if (latest.current === snapshot) {
        latest.current = saved;
        setDraft(saved);
        dirty.current = false;
        onDirty(false);
        setSaveStatus("Saved locally");
      } else {
        latest.current = {
          ...latest.current,
          revision: saved.revision,
          etag: saved.etag,
        };
        setDraft(latest.current);
        setSaveStatus("Unsaved changes");
      }
      void refresh();
      return saved;
    } catch (e) {
      setSaveStatus("Save failed. Draft preserved.");
      if ((e as Error).message.includes("changed elsewhere")) {
        try {
          setConflict(await api<Note>("/notes/" + snapshot.id));
          setModal("conflict");
        } catch {}
      }
      throw e;
    } finally {
      saving.current = false;
    }
  }
  useEffect(() => {
    if (!dirty.current || saveStatus.startsWith("Save failed")) return;
    const timer = setTimeout(() => {
      if (!saving.current) save().catch((e) => notify(e.message));
    }, 1400);
    return () => clearTimeout(timer);
  }, [draft]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        save().catch((e) => notify(e.message));
      }
    };
    window.addEventListener("beforeunload", before);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("beforeunload", before);
      window.removeEventListener("keydown", key);
    };
  }, []);
  async function action(key: string, fn: () => Promise<unknown>) {
    setPending(key);
    try {
      await save();
      await fn();
      await refresh();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setPending("");
    }
  }
  async function command(cmd: string) {
    if (cmd.startsWith("note:")) {
      const n = data.notes.find((n) => n.id === cmd.slice(5));
      if (n) action("navigate", async () => onOpen(n));
      return;
    }
    if (cmd === "link") setModal("link");
    if (cmd === "concept") onNew();
    if (cmd === "draw")
      action("drawing", async () => {
        const result = await api("/notes/" + draft.id + "/drawings", {});
        setDrawing(result.id);
      });
    if (cmd === "flowchart") setModal("diagram");
    if (cmd === "image") setModal("attach");
  }
  const outgoing = draft.links.map((l) => ({
    ...l,
    note: data.notes.find((n) => n.id === l.target),
  }));
  const incoming = data.notes.filter((n) =>
    n.links.some((l) => l.target === draft.id),
  );
  const suggestions = data.proposals.filter(
    (p) => p.noteId === draft.id && p.state === "pending",
  );
  const lastReview = data.reviews.find((r) => r.noteId === draft.id);
  const currentSources = data.sources.filter((s) =>
    draft.sources.includes(s.id),
  );
  return (
    <div className={"note-workspace " + (!connections ? "focus-mode" : "")}>
      <article className="note-page">
        <header className="note-top">
          <span className="breadcrumb">
            My notebook <ChevronRight size={13} />
            {draft.group}
          </span>
          <div className="actions">
            <span
              className={
                "save-state " + (saveStatus.includes("failed") ? "error" : "")
              }
            >
              {saveStatus === "Saving..." ? <Busy /> : <Check size={13} />}{" "}
              {saveStatus}
            </span>
            <button
              className="icon"
              title="Save now"
              aria-label="Save now"
              onClick={() =>
                save()
                  .then(() => notify("Note saved."))
                  .catch((e) => notify(e.message))
              }
            >
              <Save size={17} />
            </button>
            <button onClick={() => setModal("share")}>
              <Share2 size={14} />
              Share
            </button>
            <button
              className="icon"
              aria-label="Toggle connections"
              title="Connections"
              onClick={() => setConnections(!connections)}
            >
              {connections ? (
                <PanelRightClose size={18} />
              ) : (
                <PanelRightOpen size={18} />
              )}
            </button>
          </div>
        </header>
        <div className="note-content">
          <div className="note-meta">
            <span className="eyebrow">CONCEPT NOTE</span>
            <span className={"pill status " + draft.status}>
              <i className={"status-dot " + draft.status} />
              {draft.status}
            </span>
          </div>
          <input
            className="note-title"
            aria-label="Note title"
            value={draft.title}
            onChange={(e) => edit({ title: e.target.value })}
          />
          <div className="context-row">
            <label>
              Meaning{" "}
              <input
                aria-label="Concept meaning"
                value={draft.context}
                onChange={(e) => edit({ context: e.target.value })}
              />
            </label>
            <label>
              Group{" "}
              <input
                aria-label="Topic group"
                value={draft.group}
                list="topic-groups"
                onChange={(e) => edit({ group: e.target.value })}
              />
              <datalist id="topic-groups">
                {[...new Set(data.notes.map((n) => n.group))].map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </datalist>
            </label>
          </div>
          <div className="depth-control">
            <div className="depth-label">
              <span>EXPLANATION DEPTH</span>
              <button onClick={() => setModal("layers")}>
                <Sparkles size={12} /> Draft layers
              </button>
            </div>
            <input
              aria-label="Explanation depth"
              type="range"
              min={0}
              max={2}
              step={1}
              value={layers.indexOf(layer)}
              onChange={(e) => setLayer(layers[Number(e.target.value)])}
            />
            <div className="depth-stops">
              {layers.map((l) => (
                <button
                  key={l}
                  className={layer === l ? "selected" : ""}
                  onClick={() => setLayer(l)}
                >
                  {l === "intuition"
                    ? "Intuition"
                    : l === "technical"
                      ? "Technical"
                      : "Implementation"}
                </button>
              ))}
            </div>
          </div>
          <div className="section-label">
            <span>
              {layer === "intuition"
                ? "IN MY WORDS"
                : layer === "technical"
                  ? "THE DETAILS"
                  : "MAKE IT WORK"}
            </span>
            <small>Editable Markdown · / for tools</small>
          </div>
          <Editor
            value={draft.layers[layer]}
            onChange={(value) =>
              edit({ layers: { ...latest.current.layers, [layer]: value } })
            }
            onCommand={command}
          />
          <div className="inline-tools">
            <button onClick={() => setModal("link")}>
              <Link2 size={14} />
              Connect a concept
            </button>
            <button
              onClick={() => command("draw")}
              disabled={pending === "drawing"}
            >
              <PenLine size={14} />
              Add drawing
            </button>
            <button onClick={() => setModal("attach")}>
              <Plus size={14} />
              Source or image
            </button>
          </div>
          {draft.drawings.length > 0 && (
            <section className="drawings-section">
              <div className="section-label">
                <span>SKETCHES & FLOWS</span>
                <button onClick={() => setModal("diagram")}>
                  <Sparkles size={12} />
                  Suggest diagram
                </button>
              </div>
              {draft.drawings.map((id) => (
                <button
                  className="drawing-preview"
                  key={id}
                  onClick={() => setDrawing(id)}
                >
                  <img
                    key={id + "-" + drawingVersion}
                    src={
                      fileUrl("drawings", id + ".svg") + "?v=" + drawingVersion
                    }
                    alt="Saved drawing preview"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                  <span>
                    <PenLine size={16} />
                    Open editable drawing <ArrowUpRight size={14} />
                  </span>
                </button>
              ))}
            </section>
          )}
          <section className="note-sources">
            <details>
              <summary>
                <FileText size={15} />
                Sources <span className="count">{currentSources.length}</span>
              </summary>
              {currentSources.map((s) => (
                <div className="source-row" key={s.id}>
                  <div>
                    <strong>{s.title}</strong>
                    <p>{s.coverage}</p>
                  </div>
                  {s.file && (
                    <a
                      href={fileUrl("attachments", s.file)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open
                    </a>
                  )}
                  {s.url && (
                    <a href={s.url} target="_blank" rel="noreferrer">
                      Original
                    </a>
                  )}
                </div>
              ))}
              {!currentSources.length && (
                <p className="muted">
                  Attach a source from the Inbox. Your explanation can stand on
                  its own.
                </p>
              )}
            </details>
          </section>
          <div className="practice-strip">
            <div>
              <span className="eyebrow">MAKE IT STICK</span>
              <h3>Could you explain this without looking?</h3>
              <p>
                {lastReview
                  ? `Last attempt: ${lastReview.hintUsed ? "needed a hint, " : ""}${lastReview.rating}. Next review ${new Date(lastReview.due).toLocaleDateString()}.`
                  : "Start with recall, then reveal your explanation."}
              </p>
            </div>
            <button
              className="primary"
              onClick={() =>
                action("practice", async () => onPractice(draft.id))
              }
            >
              Practice this concept <ArrowUpRight size={16} />
            </button>
          </div>
          <footer className="note-footer">
            <label className="review-toggle">
              <input
                type="checkbox"
                checked={draft.reviewEnabled !== false}
                onChange={(e) => edit({ reviewEnabled: e.target.checked })}
              />
              Include in revision
            </label>
            <button onClick={() => edit({ status: "explained" })}>
              <Check size={13} />
              Mark explained in my words
            </button>
            <button
              onClick={() =>
                action("history", async () => {
                  setHistory(await api("/notes/" + draft.id + "/history"));
                  setModal("history");
                })
              }
            >
              <History size={14} />
              History
            </button>
            <a
              className="button"
              href={"/api/notes/" + draft.id + "/export"}
              download
            >
              <Download size={14} />
              Markdown
            </a>
            <button className="danger-text" onClick={() => setModal("archive")}>
              <Trash2 size={14} />
              Archive
            </button>
          </footer>
        </div>
      </article>
      {connections && (
        <aside className="connections-panel">
          <header>
            <h3>Connections</h3>
            <button
              className="icon"
              aria-label="Close connections"
              onClick={() => setConnections(false)}
            >
              <PanelRightClose size={16} />
            </button>
          </header>
          <p className="muted small">One idea, many useful connections.</p>
          <div className="connection-section">
            <span className="eyebrow">LINKS FROM THIS NOTE</span>
            {outgoing.map((l) => (
              <div className="connection-item" key={l.target}>
                <button onClick={() => l.note && onOpen(l.note)}>
                  <FileText size={14} />
                  <span>
                    {l.note?.title || "Archived concept"}
                    <small>
                      {l.relation}
                      {l.reason ? " · " + l.reason : ""}
                    </small>
                  </span>
                </button>
                <button
                  className="icon"
                  title="Remove connection"
                  aria-label={"Remove link to " + l.note?.title}
                  onClick={() =>
                    edit({
                      links: draft.links.filter((x) => x.target !== l.target),
                    })
                  }
                >
                  <Unlink size={12} />
                </button>
              </div>
            ))}
            <button className="text-button" onClick={() => setModal("link")}>
              <Plus size={13} />
              Add a connection
            </button>
          </div>
          <div className="connection-section">
            <span className="eyebrow">LINKED FROM</span>
            {incoming.map((n) => (
              <button className="backlink" key={n.id} onClick={() => onOpen(n)}>
                <Link2 size={14} />
                {n.title}
                <ArrowUpRight size={12} />
              </button>
            ))}
            {!incoming.length && (
              <p className="muted small">
                Backlinks appear when another note links here.
              </p>
            )}
          </div>
          <div className="ai-card">
            <Sparkles size={18} />
            <h4>A second pair of eyes</h4>
            <p>Find a useful connection. You decide whether it belongs.</p>
            <button onClick={() => setModal("links")}>
              Suggest connections
            </button>
            <small>Uses the provider in Settings.</small>
          </div>
          {suggestions.length > 0 && (
            <div className="connection-section">
              <span className="eyebrow">WAITING FOR YOUR REVIEW</span>
              {suggestions.map((p) => (
                <button
                  className="proposal-chip"
                  key={p.id}
                  onClick={() => setProposal(p)}
                >
                  <Sparkles size={13} />
                  {p.title}
                  <ChevronRight size={13} />
                </button>
              ))}
            </div>
          )}
          {data.comments
            .filter((c) => c.noteId === draft.id && c.state === "pending")
            .map((c) => (
              <div className="comment-card" key={c.id}>
                <strong>{c.author}</strong>
                <small>{c.suggestion ? "Suggested addition" : "Comment"}</small>
                <MD text={c.text} />
                <div className="actions">
                  {c.suggestion && (
                    <button
                      onClick={() =>
                        action("comment", () =>
                          api("/comments/" + c.id, { action: "accept" }),
                        )
                      }
                    >
                      Accept addition
                    </button>
                  )}
                  <button
                    onClick={() =>
                      action("comment", () =>
                        api("/comments/" + c.id, { action: "dismiss" }),
                      )
                    }
                  >
                    Resolve
                  </button>
                </div>
              </div>
            ))}
          <div className="quiet-note">
            <span>↗</span>
            <p>
              A link is a question worth asking:{" "}
              <em>how do these ideas connect?</em>
            </p>
          </div>
        </aside>
      )}
      {modal === "conflict" && conflict && (
        <Modal
          title="Two versions need your attention"
          wide
          onClose={() => setModal("")}
        >
          <p>
            Your draft has not overwritten the saved note. Compare the current
            explanation layer before deciding.
          </p>
          <div className="compare-grid">
            <div>
              <span className="eyebrow">YOUR UNSAVED DRAFT</span>
              <h3>{draft.title}</h3>
              <MD text={draft.layers[layer]} />
            </div>
            <div>
              <span className="eyebrow">LATEST SAVED NOTE</span>
              <h3>{conflict.title}</h3>
              <MD text={conflict.layers[layer]} />
            </div>
          </div>
          <footer className="dialog-actions">
            <button
              onClick={async () => {
                try {
                  const recovered = await api<Note>("/notes", {
                    ...draft,
                    title: draft.title + " (recovered draft)",
                  });
                  dirty.current = false;
                  onDirty(false);
                  await refresh();
                  setModal("");
                  onOpen(recovered);
                  notify("Your draft was saved as a separate concept.");
                } catch (e) {
                  notify((e as Error).message);
                }
              }}
            >
              Save my draft as a new concept
            </button>
            <button
              onClick={() => {
                latest.current = conflict;
                setDraft(conflict);
                dirty.current = false;
                onDirty(false);
                setSaveStatus("Saved locally");
                setModal("");
              }}
            >
              Discard draft and load latest
            </button>
            <button
              className="primary"
              onClick={() => {
                latest.current = {
                  ...latest.current,
                  revision: conflict.revision,
                  etag: conflict.etag,
                };
                setDraft(latest.current);
                dirty.current = true;
                setSaveStatus("Unsaved changes");
                setModal("");
                save()
                  .then(() =>
                    notify(
                      "Your reviewed draft is saved. The previous version remains in history.",
                    ),
                  )
                  .catch((e) => notify(e.message));
              }}
            >
              Use my draft after review
            </button>
          </footer>
        </Modal>
      )}
      {modal === "link" && (
        <Modal title="Connect a concept" onClose={() => setModal("")}>
          <p className="muted">
            Choose an existing note and explain the connection. Backlinks appear
            automatically.
          </p>
          <label>
            Concept
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Choose a concept</option>
              {data.notes
                .filter(
                  (n) =>
                    n.id !== draft.id &&
                    !draft.links.some((l) => l.target === n.id),
                )
                .map((n) => (
                  <option value={n.id} key={n.id}>
                    {n.title} · {n.context}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Relationship
            <select
              value={relation}
              onChange={(e) => setRelation(e.target.value as Relation)}
            >
              <option value="related">Related to</option>
              <option value="prerequisite">
                This concept is a prerequisite for
              </option>
              <option value="used-in">This concept is used in</option>
              <option value="contrasts">Contrasts with</option>
            </select>
          </label>
          <label>
            Why do these ideas connect?
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain the connection in your own words..."
            />
          </label>
          <footer className="dialog-actions">
            <button onClick={onNew}>Create a new concept</button>
            <button
              className="primary"
              disabled={!target}
              onClick={() => {
                edit({
                  links: [...draft.links, { target, relation, reason }],
                  layers: {
                    ...draft.layers,
                    [layer]:
                      draft.layers[layer] +
                      `\n\nSee also: [${data.notes.find((n) => n.id === target)?.title}](${target}.md).`,
                  },
                });
                setModal("");
                setTarget("");
                setReason("");
              }}
            >
              Add connection
            </button>
          </footer>
        </Modal>
      )}
      {["layers", "links", "diagram"].includes(modal) && (
        <Modal
          title={
            modal === "layers"
              ? "Draft explanation layers"
              : modal === "links"
                ? "Suggest connections"
                : "Suggest an editable flowchart"
          }
          onClose={() => setModal("")}
        >
          <p>
            This sends{" "}
            {modal === "links"
              ? "this note and candidate note summaries"
              : "this note"}{" "}
            to{" "}
            <strong>
              {data.config.provider === "ollama"
                ? "your local Ollama model"
                : data.config.provider === "openai"
                  ? "OpenAI"
                  : "the provider you configure in Settings"}
            </strong>
            .
          </p>
          <p className="muted">
            Nothing is inserted until you review and accept the draft. Existing
            explanations remain saved in history.
          </p>
          <footer className="dialog-actions">
            <button onClick={() => setModal("")}>Cancel</button>
            <button
              className="primary"
              disabled={!!pending}
              onClick={() =>
                action("ai", async () => {
                  await api("/notes/" + draft.id + "/ai", { kind: modal });
                  setModal("");
                  notify(
                    "Draft ready in Connections. Review it before accepting.",
                  );
                })
              }
            >
              {pending ? <Busy /> : <Sparkles size={15} />}Generate draft
            </button>
          </footer>
        </Modal>
      )}
      {modal === "attach" && (
        <Modal title="Attach a source" onClose={() => setModal("")}>
          <p className="muted">
            Capture files in Inbox first, then attach them to a concept. Images
            can also be inserted into this explanation.
          </p>
          {data.sources.map((s) => (
            <div className="attach-row" key={s.id}>
              <span>
                <strong>{s.title}</strong>
                <small>{s.kind}</small>
              </span>
              <button
                disabled={draft.sources.includes(s.id)}
                onClick={() => {
                  edit({ sources: [...draft.sources, s.id] });
                  notify("Source attached.");
                }}
              >
                Attach
              </button>
              {s.kind === "image" && s.file && (
                <button
                  onClick={() => {
                    edit({
                      layers: {
                        ...draft.layers,
                        [layer]:
                          draft.layers[layer] +
                          `\n\n![${s.title.replace(/[\[\]]/g, "")}](../attachments/${s.file!})`,
                      },
                      sources: [...new Set([...draft.sources, s.id])],
                    });
                    setModal("");
                  }}
                >
                  Insert image
                </button>
              )}
            </div>
          ))}
          {!data.sources.length && (
            <p>No sources yet. Open Inbox to upload a file or paste a link.</p>
          )}
        </Modal>
      )}
      {modal === "share" && (
        <Modal title="Share this note" onClose={() => setModal("")}>
          <p className="muted">
            Only this note and its attached sources are shared. Links are bearer
            credentials, so share them carefully. Localhost links work on this
            computer only.
          </p>
          <label>
            Access
            <select
              value={shareRole}
              onChange={(e) => setShareRole(e.target.value)}
            >
              <option value="viewer">Viewer: read only</option>
              <option value="commenter">Commenter: discuss</option>
              <option value="suggestion">
                Suggest additions: owner approval required
              </option>
              <option value="editor">
                Editor: directly edit explanation layers
              </option>
            </select>
          </label>
          <label>
            Label
            <input
              value={shareLabel}
              onChange={(e) => setShareLabel(e.target.value)}
              placeholder="Study group, classmate..."
            />
          </label>
          <button
            className="primary"
            onClick={() =>
              action("share", async () => {
                await api("/shares", {
                  noteId: draft.id,
                  role: shareRole,
                  label: shareLabel,
                });
              })
            }
          >
            Create access link
          </button>
          {data.shares
            .filter((s) => s.noteId === draft.id && !s.revoked)
            .map((s) => (
              <div className="share-row" key={s.id}>
                <strong>
                  {s.label || "Shared note"} · {s.role}
                </strong>
                <input
                  readOnly
                  aria-label="Share URL"
                  value={window.location.origin + "/share/" + s.id}
                  onFocus={(e) => e.target.select()}
                />
                <button
                  onClick={() =>
                    navigator.clipboard
                      .writeText(window.location.origin + "/share/" + s.id)
                      .then(() => notify("Link copied."))
                      .catch(() =>
                        notify("Select the link and copy it manually."),
                      )
                  }
                >
                  Copy
                </button>
                <button
                  className="danger-text"
                  onClick={() =>
                    action("revoke", () =>
                      api("/shares/" + s.id, undefined, "DELETE"),
                    )
                  }
                >
                  Revoke
                </button>
              </div>
            ))}
        </Modal>
      )}
      {modal === "history" && (
        <Modal title="Local version history" wide onClose={() => setModal("")}>
          <p className="muted">
            Every replaced version is preserved. Copy text from an earlier
            version into the editor to restore selected content.
          </p>
          {history.map((h) => (
            <details key={h.name}>
              <summary>Revision {h.name.split("-")[0]}</summary>
              <pre className="history-text">{h.markdown}</pre>
            </details>
          ))}
          {!history.length && <p>No previous versions yet.</p>}
        </Modal>
      )}
      {modal === "archive" && (
        <Modal title="Archive this note?" onClose={() => setModal("")}>
          <p>
            The Markdown file and its history will be preserved. Restore it from
            Settings.
          </p>
          <button
            className="primary"
            onClick={() =>
              action("archive", async () => {
                await api("/notes/" + draft.id, undefined, "DELETE");
                setModal("");
              })
            }
          >
            Archive note
          </button>
        </Modal>
      )}
      {proposal && (
        <Modal
          title="Review AI suggestion"
          wide
          onClose={() => setProposal(undefined)}
        >
          <span className="pill violet">
            {proposal.kind} · approval required
          </span>
          <h3>{proposal.title}</h3>
          <p>{proposal.reason}</p>
          {proposal.excerpt && <blockquote>{proposal.excerpt}</blockquote>}
          {proposal.kind === "link" && (
            <p>
              <strong>
                {draft.title} →{" "}
                {data.notes.find((n) => n.id === proposal.target)?.title}
              </strong>
            </p>
          )}
          {proposal.content && (
            <div className="compare-grid">
              <div>
                <span className="eyebrow">EXISTING TECHNICAL NOTE</span>
                <MD text={draft.layers.technical} />
              </div>
              <div>
                <span className="eyebrow">PROPOSED ADDITION</span>
                <MD text={proposal.content} />
              </div>
            </div>
          )}
          {proposal.layers &&
            layers.map((l) => (
              <section key={l}>
                <h3>{l}</h3>
                <MD text={proposal.layers![l]} />
              </section>
            ))}
          {proposal.diagram && (
            <div className="diagram-draft">
              {proposal.diagram.nodes.map((n) => (
                <span key={n.id}>{n.label}</span>
              ))}
              {proposal.diagram.edges.map((e, i) => (
                <p key={i}>
                  {proposal.diagram!.nodes.find((n) => n.id === e.from)?.label}{" "}
                  → {proposal.diagram!.nodes.find((n) => n.id === e.to)?.label}{" "}
                  <small>{e.label}</small>
                </p>
              ))}
            </div>
          )}
          <footer className="dialog-actions">
            <button
              onClick={() =>
                action("dismiss", async () => {
                  await api("/proposals/" + proposal.id, { action: "dismiss" });
                  setProposal(undefined);
                })
              }
            >
              Dismiss
            </button>
            <button
              className="primary"
              disabled={!!pending}
              onClick={() =>
                action("accept", async () => {
                  await api("/proposals/" + proposal.id, { action: "accept" });
                  setProposal(undefined);
                })
              }
            >
              {pending ? <Busy /> : <Check size={15} />}Accept change
            </button>
          </footer>
        </Modal>
      )}
      {drawing && (
        <Suspense
          fallback={
            <div className="loading-overlay">
              <Busy />
              Loading drawing tools...
            </div>
          }
        >
          <Drawing
            id={drawing}
            onClose={() => {
              setDrawing(undefined);
              setDrawingVersion((v) => v + 1);
              refresh();
            }}
            notify={notify}
          />
        </Suspense>
      )}
    </div>
  );
}
