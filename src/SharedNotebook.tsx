import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Users, Save, Download } from "lucide-react";
import { api, setSharedMediaScope } from "./api";
import type { Note, NoteCanvas } from "./types";
import type { EditorHandle } from "./Editor";
import { storedNoteSchema, fileNameSchema } from "./noteSchema";
import NotebookSheet, { type SheetHandle } from "./NotebookSheet";
import RichEditor from "./RichEditor";
import CanvasRead from "./CanvasRead";
import { MD, Modal } from "./ui";
import { bodyOf } from "./content";
import { nextTheme } from "./themes";
import { Collaborators } from "./AccountPanel";
import SlidesExport from "./SlidesExport";
type Peer = {
  session: string;
  cell: string;
  name: string;
  color: string;
  email: string;
};
type Snapshot = {
  note: Note;
  role: string;
  cells: Record<string, { value: unknown; hash: string }>;
  presence: Peer[];
};
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
function value(n: Note, cell: string): unknown {
  if (cell === "canvasSize")
    return { width: n.canvas?.width || 1100, height: n.canvas?.height || 500 };
  if (cell.startsWith("item/"))
    return n.canvas?.items.find((i) => i.id === cell.slice(5)) || null;
  return (n as any)[cell] ?? null;
}
function apply(n: Note, cell: string, v: any): Note {
  if (cell === "canvasSize")
    return { ...n, canvas: { ...v, items: n.canvas?.items || [] } };
  if (cell.startsWith("item/")) {
    const items = [...(n.canvas?.items || [])],
      index = items.findIndex((i) => i.id === cell.slice(5));
    if (index >= 0) {
      if (v === null) items.splice(index, 1);
      else items[index] = v;
    } else if (v) items.push(v);
    return { ...n, canvas: { width: 1100, height: 500, ...n.canvas, items } };
  }
  return { ...n, [cell]: v };
}
export default function SharedNotebook({
  id,
  connection,
  onBack,
  notify,
  onOpenNote,
  onDirty,
  onSaveReady,
  onNew,
  parents = [],
  groups = [],
}: {
  id: string;
  onNew?: () => void;
  parents?: { id: string; title: string }[];
  groups?: string[];
  connection?: string;
  onBack: () => void;
  notify: (s: string) => void;
  onOpenNote?: (id: string) => void;
  onDirty?: (dirty: boolean) => void;
  onSaveReady?: (save: (() => Promise<void>) | null) => void;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot>(),
    [note, setNote] = useState<Note>(),
    [error, setError] = useState(""),
    [status, setStatus] = useState("Opening shared page..."),
    [link, setLink] = useState(false),
    [target, setTarget] = useState("");
  const [slidesOpen, setSlidesOpen] = useState(false);
  const current = useRef<Note | undefined>(undefined),
    baseline = useRef<Snapshot | undefined>(undefined),
    pending = useRef(new Map<string, { base?: string; value: unknown }>()),
    inflight = useRef<Promise<void> | undefined>(undefined),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    cell = useRef(""),
    alive = useRef(true),
    sheet = useRef<SheetHandle>(null),
    lastEditor = useRef<any>(undefined);
  const rootPath = connection
    ? "/collaboration/remote/" + connection
    : "/collaboration/local/" + id;
  const call = (action: string, body: unknown = {}) =>
    api(rootPath + "/" + action, body);
  const actor = connection ? undefined : "owner";
  // The server chooses the actual remote actor session. Identify it from our acquired cell response, never from email alone.
  const [membersOpen, setMembersOpen] = useState(false);
  const [recoveredDraft, setRecoveredDraft] = useState<Note>();
  const draftKey = "synapse-shared-draft:" + id;
  const bodyEditor = useRef<EditorHandle>(null);
  const [linkedPages, setLinkedPages] = useState<any[]>([]);
  const ownSession = useRef(actor);
  const others = (snapshot?.presence || []).filter(
    (p) => p.session !== ownSession.current,
  );
  function adopt(fresh: Snapshot) {
    const first = !baseline.current;
    baseline.current = fresh;
    let n = fresh.note;
    for (const [k, p] of pending.current) n = apply(n, k, p.value);
    current.current = n;
    if (alive.current) {
      setSnapshot(fresh);
      setNote(n);
      if (first) {
        setStatus("Connected");
        try {
          const raw = localStorage.getItem(draftKey);
          if (raw) {
            const parsed = storedNoteSchema.safeParse(JSON.parse(raw));
            if (parsed.success && parsed.data.id === id)
              setRecoveredDraft(parsed.data as Note);
          }
        } catch {}
      }
    }
  }
  async function flush() {
    if (inflight.current) return inflight.current;
    const run = (async () => {
      while (pending.current.size) {
        const batch = [...pending.current.entries()].slice(0, 200);
        for (const [k] of batch) pending.current.delete(k);
        try {
          const changes = [];
          for (const [k, p] of batch) {
            const acquired = await call("acquire", { cell: k });
            if (acquired.session) ownSession.current = acquired.session;
            const expected =
              p.base ||
              (await crypto.subtle
                .digest("SHA-256", new TextEncoder().encode("null"))
                .then((b) =>
                  Array.from(new Uint8Array(b), (x) =>
                    x.toString(16).padStart(2, "0"),
                  ).join(""),
                ));
            if (acquired.hash !== expected && !equal(acquired.value, p.value))
              throw Error(
                "This part changed while you were editing. Your draft is kept below. Reload or copy your draft before continuing.",
              );
            changes.push({ cell: k, base: acquired.hash, value: p.value });
          }
          await call("change", { changes });
          const fresh: Snapshot = await call("snapshot");
          for (const [k] of batch) {
            const p = pending.current.get(k);
            if (p) p.base = fresh.cells[k]?.hash;
          }
          adopt(fresh);
          for (const [k] of batch)
            if (k !== cell.current)
              void call("release", { cell: k }).catch(() => {});
        } catch (e) {
          for (const [k, p] of batch)
            if (!pending.current.has(k)) pending.current.set(k, p);
          if (alive.current) {
            setError((e as Error).message);
            setStatus("Draft kept on this device");
          }
          throw e;
        }
      }
      if (alive.current) {
        setError("");
        setStatus("Saved to owner's notebook");
        onDirty?.(false);
        localStorage.removeItem(draftKey);
      }
    })();
    inflight.current = run;
    try {
      await run;
    } finally {
      inflight.current = undefined;
    }
  }
  function stage(next: Note) {
    const previous = current.current;
    if (!previous) return;
    const keys = [
      "title",
      "fileName",
      "body",
      "context",
      "group",
      "theme",
      "canvasSize",
      ...new Set(
        [...(previous.canvas?.items || []), ...(next.canvas?.items || [])].map(
          (i) => "item/" + i.id,
        ),
      ),
    ];
    let changed = false;
    for (const k of keys)
      if (!equal(value(previous, k), value(next, k))) {
        changed = true;
        const old = pending.current.get(k);
        pending.current.set(k, {
          value: value(next, k),
          base: old ? old.base : baseline.current?.cells[k]?.hash,
        });
      }
    if (!changed) return;
    current.current = next;
    setNote(next);
    onDirty?.(true);
    setStatus("Saving...");
    try {
      localStorage.setItem(draftKey, JSON.stringify(next));
    } catch {
      setError(
        "Local draft space is full. Keep a draft copy if saving cannot finish.",
      );
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush().catch(() => {}), 350);
  }
  async function focusCell(next: string) {
    if (snapshot?.role === "viewer" || !next) return;
    if (cell.current && cell.current !== next)
      void call("release", { cell: cell.current }).catch(() => {});
    cell.current = next;
    try {
      const a = await call("acquire", { cell: next });
      if (a.session) ownSession.current = a.session;
    } catch (e) {
      notify((e as Error).message);
    }
  }
  useEffect(() => {
    alive.current = true;
    setSharedMediaScope(connection || "");
    void call("snapshot")
      .then(adopt)
      .catch((e) => setError(e.message));
    const poll = setInterval(() => {
      if (!inflight.current && !pending.current.size)
        void call("snapshot")
          .then(adopt)
          .catch((e) => {
            if (alive.current) setError(e.message);
          });
    }, 1500);
    const heartbeat = setInterval(() => {
      if (cell.current)
        void call("acquire", { cell: cell.current })
          .then((a) => {
            if (a.session) ownSession.current = a.session;
          })
          .catch(() => {});
    }, 5000);
    onSaveReady?.(flush);
    return () => {
      alive.current = false;
      clearInterval(poll);
      clearInterval(heartbeat);
      clearTimeout(timer.current);
      void call("release", {}).catch(() => {});
      setSharedMediaScope("");
      onSaveReady?.(null);
    };
  }, [id, connection]);
  useEffect(() => {
    if (!note?.theme) return;
    const previous = document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = note.theme;
    window.dispatchEvent(new Event("synapse:theme"));
    return () => {
      document.documentElement.dataset.theme = previous || "light";
      window.dispatchEvent(new Event("synapse:theme"));
    };
  }, [note?.theme]);
  useEffect(() => {
    const cycle = (e: Event) => {
      e.stopImmediatePropagation();
      if (current.current && snapshot?.role !== "viewer")
        stage({
          ...current.current,
          theme: nextTheme(document.documentElement.dataset.theme || "light"),
        });
    };
    window.addEventListener("synapse:cycle-theme", cycle, true);
    return () => window.removeEventListener("synapse:cycle-theme", cycle, true);
  });
  if (!note)
    return (
      <div className="workspace-page">
        <button onClick={onBack}>
          <ArrowLeft size={15} />
          Shared pages
        </button>
        <p role="status">{error || status}</p>
      </div>
    );
  const viewer = snapshot?.role === "viewer",
    locked = (key: string) => others.some((p) => p.cell === key);
  function edit(field: string, v: unknown) {
    stage({ ...current.current!, [field]: v });
  }
  function command(cmd: string) {
    if (cmd.startsWith("note:")) onOpenNote?.(cmd.slice(5));
    else if (cmd === "link") {
      void api<any[]>("/account/pages")
        .then(setLinkedPages)
        .catch((e) => notify(e.message));
      setLink(true);
    } else if (cmd === "draw") sheet.current?.tool("pen");
    else
      notify(
        "Use the canvas tools here. AI actions and page creation are available from your own notebook.",
      );
  }
  async function upload(file: File) {
    try {
      if (file.size > 5 * 1024 * 1024)
        throw Error("Shared uploads are limited to 5 MB.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      let raw = "";
      for (let i = 0; i < bytes.length; i += 8192)
        raw += String.fromCharCode(...bytes.subarray(i, i + 8192));
      const result = await call("upload", { name: file.name, data: btoa(raw) });
      if (result.kind === "image")
        sheet.current?.image("../attachments/" + result.file, result.title);
      else notify("File attached to the shared page.");
    } catch (e) {
      notify((e as Error).message);
    }
  }
  return (
    <section
      className="shared-notebook"
      onClick={(e) => {
        if (e.defaultPrevented) return;
        const href =
            (e.target as HTMLElement).closest("a")?.getAttribute("href") || "",
          target =
            href.match(/^(?:\.\/)?([a-f0-9-]{36})\.md$/)?.[1] ||
            href.match(/^\/\?note=([a-f0-9-]{36})$/)?.[1];
        if (target) {
          e.preventDefault();
          onOpenNote?.(target);
        }
      }}
      onFocusCapture={(e) => {
        const object = (e.target as HTMLElement).closest<HTMLElement>(
            "[data-object-id]",
          ),
          field = (e.target as HTMLElement).closest<HTMLElement>("[data-cell]");
        if (object || field)
          void focusCell(
            object ? "item/" + object.dataset.objectId : field!.dataset.cell!,
          );
      }}
      onPointerDownCapture={(e) => {
        if (
          (e.target as HTMLElement).closest('[aria-label="Notebook tools"]')
        ) {
          if (cell.current)
            void call("release", { cell: cell.current }).catch(() => {});
          cell.current = "";
          return;
        }
        const object = (e.target as HTMLElement).closest<HTMLElement>(
          "[data-object-id]",
        );
        if (object) void focusCell("item/" + object.dataset.objectId);
      }}
    >
      {parents.length > 0 && (
        <nav className="breadcrumbs" aria-label="Page lineage">
          {parents.map((p) => (
            <button key={p.id} onClick={() => onOpenNote?.(p.id)}>
              {p.title}
            </button>
          ))}
          <span>{note.title}</span>
        </nav>
      )}
      <header className="note-topbar">
        <button onClick={onBack}>
          <ArrowLeft size={15} />
          Back
        </button>
        <span role="status">
          {status} / {snapshot?.role}
        </span>
        <button disabled={viewer} onClick={() => void flush().catch(() => {})}>
          <Save size={14} />
          Save
        </button>
        {!connection && (
          <button
            onClick={() =>
              void flush()
                .then(() => setMembersOpen(true))
                .catch(() => {})
            }
          >
            Share
          </button>
        )}
        <button
          onClick={() =>
            void flush()
              .then(() => setSlidesOpen(true))
              .catch(() => {})
          }
        >
          Slides
        </button>
        {onNew && <button onClick={onNew}>Subpage</button>}
      </header>
      {membersOpen && (
        <Modal title="Collaborators" onClose={() => setMembersOpen(false)}>
          <Collaborators
            note={note}
            notify={notify}
            onOpenShared={() => setMembersOpen(false)}
          />
        </Modal>
      )}
      {slidesOpen && (
        <SlidesExport notes={[note]} onClose={() => setSlidesOpen(false)} />
      )}
      <div className="live-people" aria-label="People editing">
        <Users size={14} />
        {others.length ? (
          others.map((p) => (
            <span key={p.session + p.cell} style={{ borderColor: p.color }}>
              {p.name} / {p.cell.startsWith("item/") ? "canvas object" : p.cell}
            </span>
          ))
        ) : (
          <span>You're the only person editing</span>
        )}
      </div>
      {recoveredDraft && (
        <div className="error-banner" role="status">
          <p>A local draft was kept from your previous session.</p>
          <button
            onClick={() => {
              stage(recoveredDraft);
              setRecoveredDraft(undefined);
            }}
          >
            Restore my draft
          </button>
          <button
            onClick={() => {
              setRecoveredDraft(undefined);
              localStorage.removeItem(draftKey);
            }}
          >
            Keep the saved version
          </button>
        </div>
      )}
      {error && (
        <div className="error-banner" role="alert">
          <p>{error}</p>
          <button onClick={() => void flush().catch(() => {})}>
            Retry saving
          </button>
          <button
            onClick={() => {
              const blob = new Blob(
                  [JSON.stringify(current.current, null, 2)],
                  { type: "application/json" },
                ),
                url = URL.createObjectURL(blob),
                a = document.createElement("a");
              a.href = url;
              a.download =
                note.title.replace(/[^a-z0-9 ]/gi, "") + " draft.json";
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            <Download size={13} />
            Keep a draft copy
          </button>
          <button
            onClick={async () => {
              pending.current.clear();
              localStorage.removeItem(draftKey);
              adopt(await call("snapshot"));
              setError("");
              onDirty?.(false);
            }}
          >
            Reload saved version
          </button>
        </div>
      )}
      <input
        className="note-title"
        aria-label="Shared page title"
        data-cell="title"
        readOnly={viewer || locked("title")}
        value={note.title}
        onChange={(e) => edit("title", e.target.value)}
      />
      <details className="page-details">
        <summary>Page details</summary>
        <div className="context-row">
          <label>
            File name
            <input
              data-cell="fileName"
              readOnly={viewer || locked("fileName")}
              key={note.fileName}
              defaultValue={note.fileName || note.id + ".md"}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              onBlur={(e) => {
                const name = e.target.value
                    .trim()
                    .replace(/(?:\.md)?$/i, ".md"),
                  parsed = fileNameSchema.safeParse(name);
                if (parsed.success) edit("fileName", parsed.data);
                else
                  notify(
                    "Choose a Markdown filename without slashes or special characters.",
                  );
              }}
            />
          </label>
          <label>
            Group
            <input
              data-cell="group"
              readOnly={viewer || locked("group")}
              value={note.group}
              onChange={(e) => edit("group", e.target.value)}
            />
            {!viewer && (
              <select
                aria-label="Choose existing group"
                value=""
                onChange={(e) => {
                  if (e.target.value) edit("group", e.target.value);
                }}
              >
                <option value="">Choose existing group</option>
                {groups.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            )}
          </label>
          <label>
            Topic
            <input
              data-cell="context"
              readOnly={viewer || locked("context")}
              value={note.context}
              onChange={(e) => edit("context", e.target.value)}
            />
          </label>
        </div>
      </details>
      {viewer ? (
        <CanvasRead canvas={note.canvas || { items: [], height: 500 }}>
          <MD text={bodyOf(note)} />
        </CanvasRead>
      ) : (
        <NotebookSheet
          ref={sheet}
          value={note.canvas}
          peers={others}
          onChange={(canvas: NoteCanvas) =>
            stage({ ...current.current!, canvas })
          }
          onDrawing={() => {}}
          onImage={() => document.getElementById("shared-upload")?.click()}
          onUpload={upload}
          onCommand={command}
        >
          <div data-cell="body">
            <RichEditor
              value={bodyOf(note)}
              readOnly={locked("body")}
              onReady={(e) => {
                lastEditor.current = e;
              }}
              onChange={(body) => edit("body", body)}
              onCommand={command}
              onUpload={upload}
              onVideo={(src, title) => sheet.current?.video(src, title)}
              onPlace={(kind, src, title) =>
                kind === "image"
                  ? sheet.current?.image(src, title || "Image")
                  : kind === "drawing"
                    ? sheet.current?.drawing(src)
                    : sheet.current?.block(kind, src)
              }
            />
          </div>
        </NotebookSheet>
      )}
      <input
        id="shared-upload"
        type="file"
        accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.md"
        hidden
        onChange={(e) => {
          if (e.target.files?.[0]) void upload(e.target.files[0]);
          e.target.value = "";
        }}
      />
      {link && (
        <Modal title="Link a shared page" onClose={() => setLink(false)}>
          <label>
            Page
            <select
              aria-label="Page to link"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">Choose a shared page</option>
              {linkedPages
                .filter((p) => p.id !== id)
                .map((p) => (
                  <option key={p.room + p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
            </select>
          </label>
          <button
            disabled={!/^[a-f0-9-]{36}$/.test(target)}
            onClick={() => {
              (sheet.current?.editor() || bodyEditor.current)?.linkTo(
                target,
                linkedPages.find((p) => p.id === target)?.title || "Page",
              );
              setLink(false);
            }}
          >
            Link selected words
          </button>
        </Modal>
      )}
    </section>
  );
}
