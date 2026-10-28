import { useEffect, useRef, useState, lazy, Suspense } from "react";
import {
  ArrowUpRight,
  Link2,
  Plus,
  Share2,
  Brain,
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
import Editor, { type EditorHandle } from "./Editor";
import { nextTheme } from "./themes";
import { youtubeLink } from "./youtube";
import { Collaborators } from "./AccountPanel";
import { fileNameSchema } from "./noteSchema";
import { bodyOf, lineage } from "./content";
import DiagramPreview from "./DiagramPreview";
import NotebookSheet, { type SheetHandle } from "./NotebookSheet";
import SlidesExport from "./SlidesExport";
import PageHistory from "./PageHistory";
import { noteUsesResource } from "./resourceRefs";
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
  onSaveReady,
  onLibrary,
}: {
  note: Note;
  data: Bootstrap;
  refresh: () => Promise<void>;
  onOpen: (n: Note) => void;
  onPractice: (id: string) => void;
  onNew: (parentId?: string, onCreated?: (n: Note) => Promise<void>) => void;
  notify: (s: string) => void;
  onDirty: (d: boolean) => void;
  onSaveReady?: (save: (() => Promise<void>) | null) => void;
  onLibrary?: () => void;
}) {
  const initial = { ...note, body: bodyOf(note) };
  const [draft, setDraft] = useState<Note>(initial);
  const [slidesOpen, setSlidesOpen] = useState(false);
  useEffect(() => {
    const previous = document.documentElement.dataset.theme || "light";
    document.documentElement.dataset.theme = draft.theme || previous;
    window.dispatchEvent(new Event("synapse:theme"));
    const cycle = (e: Event) => {
      e.stopImmediatePropagation();
      edit({
        theme: nextTheme(document.documentElement.dataset.theme || "light"),
      });
    };
    window.addEventListener("synapse:cycle-theme", cycle, true);
    return () => {
      window.removeEventListener("synapse:cycle-theme", cycle, true);
      document.documentElement.dataset.theme = previous;
      window.dispatchEvent(new Event("synapse:theme"));
    };
  }, [draft.id, draft.theme]);
  const latest = useRef<Note>(initial);
  const editorRef = useRef<EditorHandle>(null);
  const sheetRef = useRef<SheetHandle>(null);
  const activeEditor = () => sheetRef.current?.editor() || editorRef.current;
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadTail = useRef<Promise<unknown>>(Promise.resolve());
  const dirty = useRef(false);
  const saving = useRef(false);
  const inFlight = useRef<Promise<Note> | null>(null);
  const [saveStatus, setSaveStatus] = useState("Saved locally");
  const [intro, setIntro] = useState(false);
  useEffect(() => {
    const key = "synapse-new-note:" + note.id;
    if (!sessionStorage.getItem(key)) {
      setIntro(false);
      return;
    }
    setIntro(true);
    const timeout = setTimeout(() => {
      setIntro(false);
      sessionStorage.removeItem(key);
    }, 5000);
    return () => clearTimeout(timeout);
  }, [note.id]);

  const [connections, setConnections] = useState(
    () => localStorage.getItem("synapse-connections-v2") === "shown",
  );
  useEffect(() => {
    localStorage.setItem(
      "synapse-connections-v2",
      connections ? "shown" : "hidden",
    );
  }, [connections]);
  const [modal, setModal] = useState("");
  const [extractionSource, setExtractionSource] = useState<string>(),
    [extracted, setExtracted] = useState("");
  const [target, setTarget] = useState("");
  const [relation, setRelation] = useState<Relation>("related");
  const [reason, setReason] = useState("");
  const [drawing, setDrawing] = useState<string>();
  const [drawingVersion, setDrawingVersion] = useState(0);
  const [pending, setPending] = useState("");
  const [proposal, setProposal] = useState<Proposal>();
  const [diagramSelection, setDiagramSelection] = useState("");
  const [diagramType, setDiagramType] = useState<
    | "auto"
    | "flowchart"
    | "hierarchy"
    | "concept-map"
    | "architecture"
    | "data-flow"
    | "state-machine"
  >("auto");
  const [diagramNotes, setDiagramNotes] = useState<string[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [shareRole, setShareRole] = useState("viewer");
  const [shareLabel, setShareLabel] = useState("");
  const [conflict, setConflict] = useState<Note>();
  useEffect(() => {
    if (
      note.id !== latest.current.id ||
      (!dirty.current &&
        note.revision >= latest.current.revision &&
        (note.revision !== latest.current.revision ||
          note.etag !== latest.current.etag))
    ) {
      latest.current = { ...note, body: bodyOf(note) };
      setDraft(latest.current);
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
  async function save(): Promise<Note> {
    if (inFlight.current) {
      await inFlight.current;
      return dirty.current ? save() : latest.current;
    }
    if (!dirty.current) return latest.current;
    const task = persist();
    inFlight.current = task;
    try {
      await task;
    } finally {
      inFlight.current = null;
    }
    return dirty.current ? save() : latest.current;
  }
  async function persist() {
    saving.current = true;
    const snapshot = latest.current;
    setSaveStatus("Saving...");
    try {
      const saved = await api<Note>("/notes/" + snapshot.id, snapshot, "PUT");
      if (latest.current === snapshot) {
        latest.current = { ...saved, body: bodyOf(saved) };
        setDraft(latest.current);
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
    onSaveReady?.(async () => {
      await uploadTail.current;
      await save();
    });
    const before = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", before);
    return () => {
      onSaveReady?.(null);
      window.removeEventListener("beforeunload", before);
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
  function adopt(n: Note, body?: string) {
    const edited = dirty.current ? latest.current : undefined;
    latest.current = {
      ...n,
      ...(edited
        ? {
            title: edited.title,
            context: edited.context,
            group: edited.group,
            parentId: edited.parentId,
            canvas: edited.canvas,
            noteDate: edited.noteDate,
            fileName: edited.fileName,
            theme: edited.theme,
          }
        : {}),
      body: edited?.body ?? (body === undefined ? bodyOf(n) : body),
    };
    setDraft(latest.current);
    dirty.current = !!edited;
    onDirty(!!edited);
    setSaveStatus(edited ? "Unsaved changes" : "Saved locally");
  }
  async function upload(file: File) {
    uploadTail.current = uploadTail.current
      .catch(() => {})
      .then(async () => {
        setPending("upload");
        try {
          const form = new FormData();
          form.append("file", file);
          const source = await api("/upload", form);
          edit({
            sources: [...new Set([...latest.current.sources, source.id])],
          });
          if (source.kind === "image")
            sheetRef.current?.image(
              "../attachments/" + source.file,
              source.title,
            );
          else
            activeEditor()?.insertFile(
              "/files/attachments/" + source.file,
              source.title,
            );
          await save();
          await refresh();
          notify(
            source.kind === "image"
              ? "Image added directly to your note."
              : "File added. You can open its original from the link.",
          );
        } catch (e) {
          notify((e as Error).message);
        } finally {
          setPending("");
        }
      });
    await uploadTail.current;
  }
  async function command(cmd: string) {
    if (cmd.startsWith("extract:")) {
      const filename = cmd.slice(8).split("/").at(-1)?.split("?")[0];
      const source = data.sources.find(
        (s) => s.kind === "image" && s.file === filename,
      );
      if (!source) {
        notify("Save the image in this note first, then try extraction again.");
        return;
      }
      setExtractionSource(source.id);
      setExtracted("");
      setModal("extract");
      return;
    }
    if (cmd.startsWith("note:")) {
      const n = data.notes.find((n) => n.id === cmd.slice(5));
      if (n) action("navigate", async () => onOpen(n));
      return;
    }
    if (cmd.startsWith("drawing:")) {
      setDrawing(cmd.slice(8));
      return;
    }
    activeEditor()?.capture();
    if (cmd === "link") setModal("link");
    if (cmd === "page" || cmd === "concept")
      await action("page", async () =>
        onNew(draft.id, async (n) => {
          activeEditor()?.linkTo(n.id, n.title);
          await save();
        }),
      );
    if (cmd === "draw") sheetRef.current?.tool("pen");
    if (cmd === "flowchart") {
      setDiagramSelection(activeEditor()?.selectedText() || "");
      setDiagramNotes([]);
      setModal("diagram");
    }
    if (cmd === "image" || cmd === "file") {
      if (fileInput.current) {
        fileInput.current.accept =
          cmd === "image"
            ? ".png,.jpg,.jpeg,.webp"
            : ".pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.mp3,.wav,.m4a,.mp4,.webm,.ogg";
        fileInput.current.click();
      }
    }
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
  const currentSources = data.sources.filter((s) => noteUsesResource(draft, s));
  return (
    <div className={"note-workspace " + (!connections ? "focus-mode" : "")}>
      <article className="note-page">
        <header className="note-top">
          <span className="breadcrumb">
            {onLibrary ? (
              <button
                aria-label="Back to all notes"
                onClick={() => action("navigate", async () => onLibrary())}
              >
                My notebook
              </button>
            ) : (
              "My notebook"
            )}{" "}
            <ChevronRight size={13} />
            {lineage(draft, data.notes).map((ancestor) => (
              <span key={ancestor.id} className="ancestor">
                <button
                  onClick={() =>
                    action("navigate", async () => onOpen(ancestor))
                  }
                >
                  {ancestor.title}
                </button>
                <ChevronRight size={13} />
              </span>
            ))}
            <span>{draft.title}</span>
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
            <button
              onClick={() =>
                save()
                  .then(() => setModal("share"))
                  .catch((e) => notify(e.message))
              }
            >
              <Share2 size={14} />
              Share
            </button>
            <button
              title="Practice this note"
              onClick={() =>
                action("practice", async () => onPractice(draft.id))
              }
            >
              <Brain size={14} />
              Practice
            </button>
            <button
              title="Export slides for LinkedIn"
              onClick={() =>
                void save()
                  .then(() => setSlidesOpen(true))
                  .catch((e) => notify(e.message))
              }
            >
              <Download size={14} />
              Slides
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
          {!data.notes.some((n) => n.id === draft.id) && (
            <div className="coverage" role="alert">
              This note was deleted from the vault. Your unsaved draft is still
              here.
              <button
                onClick={async () => {
                  try {
                    const recovered = await api<Note>("/notes", {
                      ...latest.current,
                      title: latest.current.title + " (recovered)",
                    });
                    dirty.current = false;
                    onDirty(false);
                    await refresh();
                    onOpen(recovered);
                  } catch (e) {
                    notify((e as Error).message);
                  }
                }}
              >
                Save as a new note
              </button>
            </div>
          )}
          <div className="note-meta">
            {draft.noteDate && (
              <time className="note-date" dateTime={draft.noteDate}>
                {new Date(draft.noteDate + "T12:00:00").toLocaleDateString()}
              </time>
            )}
            <span className={"pill status " + draft.status}>
              <i className={"status-dot " + draft.status} />
              {draft.status}
            </span>
          </div>
          <h1 className="note-title-heading" aria-label={draft.title}>
            <input
              className="note-title"
              aria-label="Note title"
              title="Rename this page"
              value={draft.title}
              onChange={(e) => edit({ title: e.target.value })}
            />
          </h1>
          <details className="page-details">
            <summary>
              {draft.group}
              <ChevronRight size={12} /> Page details
            </summary>
            <div className="context-row">
              <label>
                File name
                <input
                  aria-label="File name"
                  key={draft.fileName}
                  defaultValue={draft.fileName || draft.id + ".md"}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                  onBlur={(e) => {
                    const name = e.target.value
                        .trim()
                        .replace(/(?:\.md)?$/i, ".md"),
                      parsed = fileNameSchema.safeParse(name);
                    if (parsed.success) edit({ fileName: parsed.data });
                    else
                      notify(
                        "Choose a Markdown filename without slashes or special characters.",
                      );
                  }}
                />
              </label>
              <label>
                Page theme
                <select
                  aria-label="Page theme"
                  value={
                    draft.theme ||
                    document.documentElement.dataset.theme ||
                    "light"
                  }
                  onChange={(e) =>
                    edit({ theme: e.target.value as Note["theme"] })
                  }
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="paper">Paper</option>
                  <option value="dotted">Dotted</option>
                </select>
              </label>
              <label>
                Date (optional)
                <input
                  aria-label="Note date"
                  type="date"
                  value={draft.noteDate || ""}
                  onChange={(e) => edit({ noteDate: e.target.value || null })}
                />
              </label>
              <label>
                Topic{" "}
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
                <select
                  aria-label="Choose existing group"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) edit({ group: e.target.value });
                  }}
                >
                  <option value="">Choose existing group</option>
                  {[...new Set(data.notes.map((n) => n.group))]
                    .sort()
                    .map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <div className="parent-picker">
              <label>
                Inside{" "}
                <select
                  aria-label="Parent page"
                  value={draft.parentId || ""}
                  onChange={(e) => edit({ parentId: e.target.value || null })}
                >
                  <option value="">My notebook</option>
                  {data.notes
                    .filter(
                      (n) =>
                        n.id !== draft.id &&
                        !lineage(n, data.notes).some((a) => a.id === draft.id),
                    )
                    .map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.title}
                      </option>
                    ))}
                </select>
              </label>
            </div>
          </details>
          <div className="writing-hint">
            {intro && (
              <span className="note-intro" role="status">
                Type /link to connect a word to another page. Your notes save
                automatically.
              </span>
            )}
            <button onClick={() => command("page")}>
              <Plus size={12} />
              Subpage
            </button>
          </div>
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              const files = [...(e.target.files || [])];
              files.forEach((file) => void upload(file));
              e.target.value = "";
            }}
          />
          {pending && (
            <div className="operation-status" role="status">
              <Busy />
              {pending === "ai"
                ? "Generating a draft. It will open here when ready."
                : pending === "upload"
                  ? "Adding your file to the note..."
                  : "Saving your changes..."}
            </div>
          )}
          {suggestions
            .filter((p) => p.kind === "diagram")
            .map((p) => (
              <button
                className="ready-flow"
                key={p.id}
                onClick={() => setProposal(p)}
              >
                <Workflow size={15} />
                Diagram ready for review <ChevronRight size={14} />
              </button>
            ))}
          <NotebookSheet
            ref={sheetRef}
            value={draft.canvas}
            onChange={(canvas) => edit({ canvas })}
            onDrawing={setDrawing}
            onImage={() => command("image")}
            onCommand={command}
            onUpload={upload}
          >
            <Editor
              ref={editorRef}
              value={draft.body || ""}
              onChange={(body) => edit({ body })}
              onCommand={command}
              onUpload={upload}
              onVideo={(url, label) => sheetRef.current?.video(url, label)}
              onPlace={(kind, src, alt) =>
                kind === "image"
                  ? sheetRef.current?.image(src, alt || "Image")
                  : kind === "drawing"
                    ? sheetRef.current?.drawing(src)
                    : sheetRef.current?.block(kind, src)
              }
            />
          </NotebookSheet>
          {drawing && (
            <Suspense fallback={<Busy />}>
              <Drawing
                id={drawing}
                onClose={() => {
                  setDrawing(undefined);
                  setDrawingVersion((v) => v + 1);
                  void refresh();
                }}
                notify={notify}
              />
            </Suspense>
          )}
          <div className="inline-tools">
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => command("link")}
            >
              <Link2 size={14} />
              Link a word
            </button>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => command("draw")}
              disabled={!!pending}
            >
              <PenLine size={14} />
              Draw here
            </button>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => command("flowchart")}
            >
              <Workflow size={14} />
              Create diagram
            </button>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => command("image")}
            >
              <Plus size={14} />
              Add image
            </button>
            <button onClick={() => setModal("resources")}>
              <FileText size={14} />
              Files & links
            </button>
          </div>
          {data.notes.some((n) => n.parentId === draft.id) && (
            <section className="child-pages">
              <span className="section-label">Pages inside this page</span>
              {data.notes
                .filter((n) => n.parentId === draft.id)
                .map((n) => (
                  <button
                    key={n.id}
                    onClick={() => action("navigate", async () => onOpen(n))}
                  >
                    <FileText size={14} />
                    {n.title}
                    <ArrowUpRight size={13} />
                  </button>
                ))}
            </section>
          )}
          <section className="note-sources">
            <details>
              <summary>
                <FileText size={15} />
                Files & links{" "}
                <span className="count">{currentSources.length}</span>
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
                    <>
                      {youtubeLink(s.url) && (
                        <button
                          onClick={() =>
                            sheetRef.current?.video(s.url!, s.title)
                          }
                        >
                          Insert video
                        </button>
                      )}
                      <a href={s.url} target="_blank" rel="noreferrer">
                        Open original
                      </a>
                    </>
                  )}
                </div>
              ))}
              {!currentSources.length && (
                <p className="muted">
                  Original files and web links you used while learning. Adding
                  them is optional. Upload directly from the note or choose an
                  item in Resource dump.
                </p>
              )}
            </details>
          </section>
          <footer className="note-footer">
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
              Delete
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
            <span className="section-label">Links from this note</span>
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
                  onClick={() => {
                    edit({
                      links: draft.links.filter((x) => x.target !== l.target),
                    });
                    editorRef.current?.unlinkTo(l.target);
                  }}
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
            <span className="section-label">Linked from</span>
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
          <div className="connection-help">
            <h4>Find a connection</h4>
            <p>Request links to review with your chosen AI provider.</p>
            <button onClick={() => setModal("links")}>
              Suggest connections
            </button>
          </div>
          {suggestions.length > 0 && (
            <div className="connection-section">
              <span className="section-label">Waiting for your review</span>
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
            <span>
              <ArrowUpRight size={16} />
            </span>
            <p>
              A link is a question worth asking:{" "}
              <em>how do these ideas connect?</em>
            </p>
          </div>
        </aside>
      )}
      {modal === "extract" && extractionSource && (
        <Modal title="Extract image" wide onClose={() => setModal("")}>
          <p>
            AI can read text, describe diagrams, and identify colours. Review
            uncertain handwriting and formulas. The original image stays in your
            note.
          </p>
          <p className="small muted">
            Visual extraction uses your configured provider: a local Ollama
            vision model, or OpenAI if selected. Local OCR reads text only.
          </p>
          <button
            disabled={!!pending}
            onClick={() =>
              void action("extract", async () => {
                const r = await api<any>(
                  "/sources/" + extractionSource + "/extract",
                  { mode: "vision", consent: true },
                );
                setExtracted(r.text);
              })
            }
          >
            Extract using AI
          </button>
          <button
            disabled={!!pending}
            onClick={() =>
              void action("extract", async () => {
                const r = await api<any>(
                  "/sources/" + extractionSource + "/extract",
                  { mode: "ocr" },
                );
                setExtracted(r.text);
              })
            }
          >
            Local text OCR
          </button>
          {extracted && (
            <>
              <textarea
                aria-label="Extracted image draft"
                className="extracted-draft"
                value={extracted}
                onChange={(e) => setExtracted(e.target.value)}
              />
              <button
                onClick={() => {
                  edit({
                    body: (latest.current.body || "") + "\n\n" + extracted,
                  });
                  setModal("");
                }}
              >
                Insert approved text
              </button>
              <button
                disabled={!!pending}
                onClick={() => {
                  setDiagramSelection(extracted);
                  setDiagramNotes([]);
                  setModal("diagram");
                }}
              >
                Rebuild diagram from draft
              </button>
            </>
          )}
        </Modal>
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
              <span className="section-label">Your unsaved draft</span>
              <h3>{draft.title}</h3>
              <MD text={draft.body || bodyOf(draft)} />
            </div>
            <div>
              <span className="section-label">Latest saved note</span>
              <h3>{conflict.title}</h3>
              <MD text={conflict.body || bodyOf(conflict)} />
            </div>
          </div>
          <footer className="dialog-actions">
            <button
              onClick={async () => {
                try {
                  const recovered = await api<Note>("/notes", {
                    ...draft,
                    fileName: undefined,
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
            Choose a note. Add your reasoning if it helps you remember.
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
            These connect because… (optional)
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain the connection in your own words..."
            />
          </label>
          <footer className="dialog-actions">
            <button onClick={() => onNew(draft.id)}>
              Create a new concept
            </button>
            <button
              className="primary"
              disabled={!target}
              onClick={() => {
                const page = data.notes.find((n) => n.id === target);
                if (!page) return;
                edit({ links: [...draft.links, { target, relation, reason }] });
                activeEditor()?.linkTo(target, page.title);
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
                : "Create a diagram"
          }
          onClose={() => setModal("")}
        >
          <p>
            This sends{" "}
            {modal === "links"
              ? "this note and candidate note summaries"
              : modal === "diagram" && diagramSelection
                ? "your selected text and any additional notes"
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
          {modal === "diagram" && (
            <div className="diagram-options">
              <label>
                Diagram type
                <select
                  aria-label="Diagram type"
                  value={diagramType}
                  onChange={(e) =>
                    setDiagramType(e.target.value as typeof diagramType)
                  }
                >
                  <option value="auto">Choose for me</option>
                  <option value="architecture">Architecture</option>
                  <option value="data-flow">Data flow</option>
                  <option value="state-machine">State machine</option>
                  <option value="flowchart">
                    Flowchart: steps and decisions
                  </option>
                  <option value="hierarchy">Hierarchy: parts and types</option>
                  <option value="concept-map">
                    Concept map: relationships
                  </option>
                </select>
              </label>
              {diagramSelection ? (
                <>
                  <p>Using your selection with surrounding note context.</p>
                  <blockquote className="selection-excerpt">
                    {diagramSelection}
                  </blockquote>
                  <button onClick={() => setDiagramSelection("")}>
                    Use the whole note instead
                  </button>
                </>
              ) : (
                <p>
                  Using the current note: <strong>{draft.title}</strong>
                </p>
              )}
              <p className="small muted">
                Images need Extract using AI first. Nothing is added until you
                accept the draft.
              </p>
              <details>
                <summary>Include other notes (optional)</summary>
                {data.notes
                  .filter((n) => n.id !== draft.id)
                  .map((n) => (
                    <label className="check-row" key={n.id}>
                      <input
                        type="checkbox"
                        checked={diagramNotes.includes(n.id)}
                        disabled={
                          !diagramNotes.includes(n.id) &&
                          diagramNotes.length >= 4
                        }
                        onChange={(e) =>
                          setDiagramNotes((ids) =>
                            e.target.checked
                              ? [...ids, n.id]
                              : ids.filter((id) => id !== n.id),
                          )
                        }
                      />
                      {n.title}
                    </label>
                  ))}
              </details>
              <p className="small muted">
                Stock Diagram Design style. Up to 9 ideas per drawing. The draft
                stays separate until you insert it.
              </p>
            </div>
          )}
          <footer className="dialog-actions">
            <button onClick={() => setModal("")}>Cancel</button>
            <button
              className="primary"
              disabled={!!pending}
              onClick={() =>
                action("ai", async () => {
                  const result = await api<Proposal[]>(
                    "/notes/" + draft.id + "/ai",
                    {
                      kind: modal,
                      ...(modal === "diagram"
                        ? {
                            selection: diagramSelection,
                            noteIds: diagramNotes,
                            diagramType,
                          }
                        : {}),
                    },
                  );
                  setModal("");
                  if (result.length) setProposal(result[0]);
                  else notify("No new connections were suggested.");
                })
              }
            >
              {pending ? <Busy /> : <Sparkles size={15} />}Generate draft
            </button>
          </footer>
        </Modal>
      )}
      {modal === "resources" && (
        <Modal
          title="Add an image, file, or web reference"
          onClose={() => setModal("")}
        >
          <p>
            Reference material means the original PDF, image, video, or web link
            behind an explanation. It is optional. You can write notes without
            adding any.
          </p>
          <div className="actions">
            <button className="primary" onClick={() => command("image")}>
              Upload image
            </button>
            <button onClick={() => command("file")}>Upload PDF or file</button>
          </div>
          <p className="muted small">
            Choose a saved resource below. The original stays in Resource dump.
          </p>
          {data.sources.map((s) => (
            <div className="attach-row" key={s.id}>
              <span>
                <strong>{s.title}</strong>
                <small>{s.kind}</small>
              </span>
              <button
                onClick={() => {
                  edit({
                    sources: [...new Set([...latest.current.sources, s.id])],
                  });
                  if (s.url && youtubeLink(s.url))
                    sheetRef.current?.video(s.url, s.title);
                  else if (s.kind === "image" && s.file)
                    sheetRef.current?.image(
                      "../attachments/" + s.file,
                      s.title,
                    );
                  else
                    activeEditor()?.insertFile(
                      s.file ? "/files/attachments/" + s.file : s.url || "#",
                      s.title,
                    );
                  setModal("");
                }}
              >
                {s.url && youtubeLink(s.url)
                  ? "Insert video"
                  : s.kind === "image"
                    ? "Insert image"
                    : "Add link"}
              </button>
            </div>
          ))}
        </Modal>
      )}
      {modal === "share" && (
        <Modal title="Share" onClose={() => setModal("")}>
          <Collaborators
            note={draft}
            notify={notify}
            onChanged={refresh}
            onOpenShared={() => {
              setModal("");
              void refresh();
            }}
          />
        </Modal>
      )}
      {slidesOpen && (
        <SlidesExport notes={[draft]} onClose={() => setSlidesOpen(false)} />
      )}
      {modal === "history" && (
        <Modal title="Local version history" wide onClose={() => setModal("")}>
          <PageHistory entries={history} current={draft} onRestore={edit} />
        </Modal>
      )}
      {modal === "archive" && (
        <Modal title="Delete this note?" onClose={() => setModal("")}>
          <p>This note will move to Trash. You can restore it in Settings.</p>
          <button
            className="primary"
            onClick={() =>
              action("archive", async () => {
                await api("/notes/trash", { ids: [draft.id] });
                setModal("");
              })
            }
          >
            Move to Trash
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
                <h4>Current note</h4>
                <MD text={bodyOf(draft)} />
              </div>
              <div>
                <h4>Proposed addition</h4>
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
            <>
              <DiagramPreview diagram={proposal.diagram} />
              <details>
                <summary>Check the relationships</summary>
                <div className="diagram-draft">
                  {proposal.diagram.nodes.map((n) => (
                    <input
                      key={n.id}
                      aria-label={"Diagram label " + n.id}
                      maxLength={65}
                      value={n.label}
                      onChange={(e) =>
                        setProposal({
                          ...proposal,
                          diagram: {
                            ...proposal.diagram!,
                            nodes: proposal.diagram!.nodes.map((x) =>
                              x.id === n.id
                                ? { ...x, label: e.target.value }
                                : x,
                            ),
                          },
                        })
                      }
                    />
                  ))}
                  {proposal.diagram.edges.map((e, i) => (
                    <p key={i}>
                      {
                        proposal.diagram!.nodes.find((n) => n.id === e.from)
                          ?.label
                      }{" "}
                      →{" "}
                      {
                        proposal.diagram!.nodes.find((n) => n.id === e.to)
                          ?.label
                      }{" "}
                      <select
                        aria-label={"Connection source " + i}
                        value={e.from}
                        onChange={(ev) =>
                          setProposal({
                            ...proposal,
                            diagram: {
                              ...proposal.diagram!,
                              edges: proposal.diagram!.edges.map((x, j) =>
                                j === i ? { ...x, from: ev.target.value } : x,
                              ),
                            },
                          })
                        }
                      >
                        {proposal.diagram!.nodes.map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.label}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label={"Connection target " + i}
                        value={e.to}
                        onChange={(ev) =>
                          setProposal({
                            ...proposal,
                            diagram: {
                              ...proposal.diagram!,
                              edges: proposal.diagram!.edges.map((x, j) =>
                                j === i ? { ...x, to: ev.target.value } : x,
                              ),
                            },
                          })
                        }
                      >
                        {proposal.diagram!.nodes.map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.label}
                          </option>
                        ))}
                      </select>
                      <input
                        aria-label={"Connection label " + i}
                        maxLength={40}
                        value={e.label}
                        onChange={(ev) =>
                          setProposal({
                            ...proposal,
                            diagram: {
                              ...proposal.diagram!,
                              edges: proposal.diagram!.edges.map((x, j) =>
                                j === i ? { ...x, label: ev.target.value } : x,
                              ),
                            },
                          })
                        }
                      />
                    </p>
                  ))}
                </div>
              </details>
              {proposal.baseEtag && proposal.baseEtag !== draft.etag && (
                <p className="coverage">
                  This drawing was drafted from an earlier version. Inserting it
                  preserves your current writing. Check that it still matches.
                </p>
              )}
            </>
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
                  const result = await api("/proposals/" + proposal.id, {
                    action: "accept",
                    allowStaleDiagram: proposal.kind === "diagram",
                    ...(proposal.diagram ? { diagram: proposal.diagram } : {}),
                  });
                  if (result.note)
                    adopt(
                      result.note,
                      proposal.kind === "diagram" || proposal.kind === "link"
                        ? latest.current.body!
                        : undefined,
                    );
                  if (proposal.kind === "diagram" && result.drawingId) {
                    sheetRef.current?.drawing(result.drawingId);
                    await save();
                    notify(
                      "Flowchart inserted into your note. Double-click it to customize.",
                    );
                  }
                  if (proposal.kind === "link" && proposal.target) {
                    const targetPage = data.notes.find(
                      (n) => n.id === proposal.target,
                    );
                    if (targetPage) {
                      activeEditor()?.linkTo(targetPage.id, targetPage.title);
                      await save();
                    }
                  }
                  setProposal(undefined);
                })
              }
            >
              {pending ? <Busy /> : <Check size={15} />}Accept change
            </button>
          </footer>
        </Modal>
      )}
    </div>
  );
}
