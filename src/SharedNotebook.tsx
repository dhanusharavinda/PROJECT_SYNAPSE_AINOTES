import DiagramComposer from "./DiagramComposer";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Users,
  Save,
  Download,
  Plus,
  MoreHorizontal,
} from "lucide-react";
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
  session?: string;
  lineage?: { id: string; title: string }[];
  note: Note;
  role: string;
  cells: Record<string, { value: unknown; hash: string }>;
  presence: Peer[];
};
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
function value(n: Note, cell: string): unknown {
  if (cell === "canvasSize")
    return {
      width: n.canvas?.width || 1100,
      height: n.canvas?.height || 500,
      ...(n.canvas?.prose ? { prose: n.canvas.prose } : {}),
    };
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
  const [diagramSelection, setDiagramSelection] = useState<string | null>(null);
  const [creatingPage, setCreatingPage] = useState(false),
    [pageTitle, setPageTitle] = useState(""),
    [pageBusy, setPageBusy] = useState(false),
    [pageError, setPageError] = useState("");
  const pageOperation = useRef("");
  function newPage() {
    if (snapshot?.role === "viewer") return;
    pageOperation.current = crypto.randomUUID();
    setPageTitle("");
    setPageError("");
    setCreatingPage(true);
  }
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
  const call = (action: string, body: unknown = {}, signal?: AbortSignal) =>
    signal
      ? api(rootPath + "/" + action, body, undefined, signal)
      : api(rootPath + "/" + action, body);
  const retryCount = useRef(0);
  const uncertain = useRef<
    | {
        batch: [string, { base?: string; value: unknown }][];
        changes: { cell: string; base: string; value: unknown }[];
        operation: string;
      }
    | undefined
  >(undefined);
  const hashValue = async (v: unknown) =>
    Array.from(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(JSON.stringify(v ?? null)),
        ),
      ),
      (x) => x.toString(16).padStart(2, "0"),
    ).join("");
  const actor = connection ? undefined : "owner";
  // The server chooses the actual remote actor session. Identify it from our acquired cell response, never from email alone.
  const [membersOpen, setMembersOpen] = useState(false);
  const [reviewError, setReviewError] = useState(false);
  const [recoveredDraft, setRecoveredDraft] = useState<Note>();
  const draftKey = "synapse-shared-draft:" + id;
  const bodyEditor = useRef<EditorHandle>(null);
  const [linkedPages, setLinkedPages] = useState<any[]>([]);
  const ownSession = useRef(actor);
  const lastActivity = useRef(0);
  function releaseActive() {
    const previous = cell.current;
    cell.current = "";
    if (previous && !pending.current.has(previous) && !inflight.current)
      void call("release", { cell: previous }).catch(() => {});
  }
  const others = (snapshot?.presence || []).filter(
    (p) => p.session !== ownSession.current,
  );
  function adopt(fresh: Snapshot) {
    if (
      baseline.current &&
      fresh.note.revision < baseline.current.note.revision
    )
      fresh = {
        ...fresh,
        note: baseline.current.note,
        cells: baseline.current.cells,
      };
    if (fresh.session) ownSession.current = fresh.session;
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
      while (pending.current.size || uncertain.current) {
        const resending = uncertain.current;
        const batch =
          resending?.batch || [...pending.current.entries()].slice(0, 200);
        if (!resending) for (const [k] of batch) pending.current.delete(k);
        try {
          const changes = resending?.changes || [];
          if (!resending)
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
                throw Object.assign(
                  new Error(
                    "This part changed while you were editing. Your draft is kept below. Reload or copy your draft before continuing.",
                  ),
                  { status: 409 },
                );
              changes.push({ cell: k, base: acquired.hash, value: p.value });
            }
          const operation = resending?.operation || crypto.randomUUID();
          uncertain.current = { batch, changes, operation };
          let saved: Note;
          try {
            saved = await call("change", { changes, operation });
          } catch (e) {
            if (!resending || (e as any).status !== 423) throw e;
            for (const [k] of batch) await call("acquire", { cell: k });
            saved = await call("change", { changes, operation });
          }
          const fresh: Snapshot = await call("snapshot");
          for (const [k] of batch) {
            const p = pending.current.get(k);
            if (
              p &&
              resending &&
              equal(p.value, batch.find(([key]) => key === k)![1].value)
            )
              pending.current.delete(k);
            else if (p) p.base = await hashValue(value(saved, k));
          }
          uncertain.current = undefined;
          adopt(fresh);
          for (const [k] of batch)
            if (k !== cell.current)
              void call("release", { cell: k }).catch(() => {});
        } catch (e) {
          for (const [k, p] of batch)
            if (!pending.current.has(k)) pending.current.set(k, p);
          if (alive.current) {
            const status = (e as any).status;
            if (!status || status >= 500 || [408, 423, 429].includes(status)) {
              setError("");
              setStatus(
                status === 423
                  ? "Waiting for the other editor. Your draft is saved here."
                  : "Reconnecting. Your draft is saved here.",
              );
              if (!timer.current)
                timer.current = setTimeout(
                  () => {
                    timer.current = undefined;
                    void flush().catch(() => {});
                  },
                  Math.min(8000, 1000 * 2 ** retryCount.current++),
                );
            } else {
              setError((e as Error).message);
              setStatus("Draft kept on this device");
            }
          }
          throw e;
        }
      }
      if (alive.current) {
        retryCount.current = 0;
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
    lastActivity.current = Date.now();
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
    if (!timer.current)
      timer.current = setTimeout(() => {
        timer.current = undefined;
        void flush().catch(() => {});
      }, 180);
  }
  async function focusCell(next: string) {
    if (snapshot?.role === "viewer" || !next) return;
    lastActivity.current = Date.now();
    if (cell.current && cell.current !== next)
      void call("release", { cell: cell.current }).catch(() => {});
    cell.current = next;
    try {
      const a = await call("acquire", { cell: next });
      if (a.session) ownSession.current = a.session;
    } catch (e) {
      if (cell.current === next) cell.current = "";
      if ((e as any).status !== 423) notify((e as Error).message);
    }
  }
  useEffect(() => {
    alive.current = true;
    setSharedMediaScope(connection || "");
    void call("snapshot")
      .then(adopt)
      .catch((e) => setError(e.message));
    let stopped = false,
      cursor: number | undefined,
      retry: ReturnType<typeof setTimeout>;
    let liveFailed = false;
    const watch = async () => {
      try {
        const result = await call(
          "watch",
          { cursor, revision: baseline.current?.note.revision },
          AbortSignal.timeout(30000),
        );
        if (stopped) return;
        if (result?.presence && !result.snapshot && baseline.current) {
          if (liveFailed) {
            setStatus(pending.current.size ? "Saving…" : "Live");
            liveFailed = false;
          }
          cursor = result.cursor;
          if (result.session) ownSession.current = result.session;
          baseline.current = {
            ...baseline.current,
            presence: result.presence,
            role: result.role,
            lineage: result.lineage,
          };
          setSnapshot(baseline.current);
          void watch();
          return;
        }
        if (!result?.snapshot)
          throw Object.assign(
            new Error(
              "Update Synapse on both computers to enable live editing.",
            ),
            { status: 426 },
          );
        cursor = result.cursor;
        if (liveFailed) {
          setStatus(pending.current.size ? "Saving…" : "Live");
          liveFailed = false;
        }
        if (inflight.current) {
          await inflight.current.catch(() => {});
          if (stopped) return;
          adopt(await call("snapshot"));
        } else adopt(result.snapshot);
        void watch();
      } catch (e) {
        if (stopped) return;
        liveFailed = true;
        if ([401, 403, 404, 426].includes((e as any).status))
          setError((e as Error).message);
        else setStatus("Reconnecting. Your draft is saved here.");
        retry = setTimeout(() => void watch(), 1500);
      }
    };
    void watch();
    const heartbeat = setInterval(() => {
      if (
        cell.current &&
        (document.visibilityState === "hidden" ||
          !document.hasFocus() ||
          Date.now() - lastActivity.current > 3000)
      ) {
        releaseActive();
        return;
      }
      if (cell.current)
        void call("acquire", { cell: cell.current })
          .then((a) => {
            if (a.session) ownSession.current = a.session;
          })
          .catch(() => {});
    }, 1000);
    onSaveReady?.(flush);
    return () => {
      alive.current = false;
      stopped = true;
      clearTimeout(retry);
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
    else if (cmd === "page" || cmd === "concept") newPage();
    else if (cmd === "link") {
      void api<any[]>("/account/pages")
        .then(setLinkedPages)
        .catch((e) => notify(e.message));
      setLink(true);
    } else if (cmd === "flowchart" || cmd === "diagram") {
      if (viewer) return;
      setDiagramSelection(
        sheet.current?.editor()?.selectedText() ||
          lastEditor.current?.state.doc.textBetween(
            lastEditor.current.state.selection.from,
            lastEditor.current.state.selection.to,
            " ",
          ) ||
          "",
      );
    } else if (cmd === "image" || cmd === "file")
      document.getElementById("shared-upload")?.click();
    else if (cmd === "draw") sheet.current?.tool("pen");
    else notify("This action is not available on the shared page yet.");
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
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) releaseActive();
      }}
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
        if (!(e.target as HTMLElement).closest("[data-object-id],[data-cell]"))
          releaseActive();
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
      {(snapshot?.lineage || parents).length > 0 && (
        <nav className="breadcrumbs" aria-label="Page lineage">
          {(snapshot?.lineage || parents).map((p) => (
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
          <span className="sync-dot" aria-hidden="true" />
          {status.startsWith("Saved")
            ? "Saved"
            : status === "Connected"
              ? "Live"
              : status.startsWith("Waiting")
                ? "Waiting to sync"
                : status === "Saving..."
                  ? "Saving…"
                  : status}
        </span>
        {!viewer && (
          <button className="shared-new-page" onClick={newPage}>
            <Plus size={14} />
            New page
          </button>
        )}
        <details className="shared-more">
          <summary aria-label="More page actions">
            <MoreHorizontal size={18} />
          </summary>
          <div>
            <button
              disabled={viewer}
              onClick={() => void flush().catch(() => {})}
            >
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
          </div>
        </details>
      </header>
      {creatingPage && (
        <Modal
          title="New subpage"
          onClose={() => {
            if (!pageBusy) setCreatingPage(false);
          }}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setPageBusy(true);
              setPageError("");
              try {
                await flush();
                const child = await call("create-page", {
                  title: pageTitle,
                  operation: pageOperation.current,
                });
                const editor = sheet.current?.editor() || bodyEditor.current;
                if (editor) editor.linkTo(child.id, child.title);
                else
                  stage({
                    ...current.current!,
                    body:
                      (current.current!.body || "") +
                      `\n\n[${child.title.replace(/[\[\]\\]/g, "")}](${child.id}.md)`,
                  });
                await flush();
                setCreatingPage(false);
                onOpenNote?.(child.id);
              } catch (e) {
                setPageError((e as Error).message);
              } finally {
                setPageBusy(false);
              }
            }}
          >
            <label>
              Page name
              <input
                autoFocus
                required
                maxLength={160}
                value={pageTitle}
                onChange={(e) => setPageTitle(e.target.value)}
              />
            </label>
            {pageError && <p role="alert">{pageError}</p>}
            <footer className="dialog-actions">
              <button
                type="button"
                disabled={pageBusy}
                onClick={() => setCreatingPage(false)}
              >
                Cancel
              </button>
              <button
                className="primary"
                disabled={pageBusy || !pageTitle.trim()}
              >
                {pageBusy ? "Creating…" : "Create page"}
              </button>
            </footer>
          </form>
        </Modal>
      )}
      {diagramSelection !== null && !viewer && (
        <DiagramComposer
          note={note}
          selection={diagramSelection}
          onClose={() => setDiagramSelection(null)}
          onAccept={(diagram) => {
            if (!sheet.current)
              throw new Error("The page is still opening. Try again.");
            sheet.current.diagram(diagram);
            setDiagramSelection(null);
          }}
        />
      )}
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
      {others.length > 0 && (
        <div className="live-people" aria-label="People editing">
          <Users size={14} />
          {others.length ? (
            others.map((p) => (
              <span key={p.session + p.cell} style={{ borderColor: p.color }}>
                {p.name} /{" "}
                {p.cell.startsWith("item/") ? "canvas object" : p.cell}
              </span>
            ))
          ) : (
            <span>You're the only person editing</span>
          )}
        </div>
      )}
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
          <button onClick={() => setReviewError(true)}>Review draft</button>
        </div>
      )}
      {error && reviewError && (
        <Modal title="Your saved draft" onClose={() => setReviewError(false)}>
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
              uncertain.current = undefined;
              localStorage.removeItem(draftKey);
              adopt(await call("snapshot"));
              setError("");
              onDirty?.(false);
            }}
          >
            Reload saved version
          </button>
        </Modal>
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
              ref={bodyEditor}
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
