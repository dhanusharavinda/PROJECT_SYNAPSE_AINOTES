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
import PagedNotebook from "./PagedNotebook";
import NotebookRead from "./NotebookRead";
import RichEditor from "./RichEditor";
import CanvasRead from "./CanvasRead";
import { MD, Modal } from "./ui";
import { bodyOf } from "./content";
import {
  isNotebookExtraCell,
  notebookExtraValue,
  applyNotebookExtra,
} from "./notebookModel";
import { nextTheme } from "./themes";
import { Collaborators } from "./AccountPanel";
import SlidesExport from "./SlidesExport";
import { NoteDraftWriter } from "./noteDrafts";
import { assertNoteFits } from "./notebookCapacity";
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
  a === b || JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
function cellValues(note: Note) {
  const values = new Map<string, unknown>();
  for (const key of [
    "title",
    "fileName",
    "body",
    "context",
    "group",
    "theme",
  ] as const)
    values.set(key, note[key] ?? null);
  values.set("canvasSize", value(note, "canvasSize"));
  values.set(
    "pageOrder",
    (note.pages || []).map((page) => page.id),
  );
  values.set("paperTexture", note.paperTexture ?? null);
  values.set("aiNotes", note.aiNotes ?? null);
  for (const item of note.canvas?.items || [])
    values.set("item/" + item.id, item);
  for (const page of note.pages || []) {
    const prefix = `page/${page.id}/`;
    values.set(prefix + "body", page.body);
    values.set(prefix + "paperTexture", page.paperTexture);
    values.set(prefix + "aiNotes", page.aiNotes ?? null);
    values.set(prefix + "canvasSize", {
      width: page.canvas.width || 1100,
      height: page.canvas.height,
      ...(page.canvas.prose ? { prose: page.canvas.prose } : {}),
    });
    for (const item of page.canvas.items)
      values.set(prefix + "item/" + item.id, item);
  }
  return values;
}
function value(n: Note, cell: string): unknown {
  if (isNotebookExtraCell(cell)) return notebookExtraValue(n, cell);
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
  if (isNotebookExtraCell(cell)) return applyNotebookExtra(n, cell, v);
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
    sending = useRef(new Map<string, { base?: string; value: unknown }>()),
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
  const [draftReady, setDraftReady] = useState(false);
  const [backupError, setBackupError] = useState("");
  const lastStaged = useRef<Note | undefined>(undefined);
  const draftWriter = useRef<NoteDraftWriter | null>(null);
  if (!draftWriter.current)
    draftWriter.current = new NoteDraftWriter(draftKey, (error) =>
      setBackupError(error.message),
    );
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
    for (const [k, p] of sending.current) n = apply(n, k, p.value);
    for (const [k, p] of pending.current) n = apply(n, k, p.value);
    current.current = n;
    if (alive.current) {
      setSnapshot(fresh);
      setNote(n);
      if (first) {
        setStatus("Connected");
        void draftWriter
          .current!.read()
          .then((recovered) => {
            if (!alive.current) return;
            if (recovered) setRecoveredDraft(recovered);
            else {
              const raw = localStorage.getItem(draftKey);
              if (raw) {
                const parsed = storedNoteSchema.safeParse(JSON.parse(raw));
                if (parsed.success && parsed.data.id === id)
                  setRecoveredDraft(parsed.data as Note);
              }
            }
          })
          .catch((error) => {
            if (alive.current) setBackupError(error.message);
          })
          .finally(() => {
            if (alive.current) setDraftReady(true);
          });
      }
    }
  }
  async function flush(flushInput = true) {
    if (flushInput) sheet.current?.flush();
    if (inflight.current) return inflight.current;
    const run = (async () => {
      await draftWriter.current!.flush().then(
        () => {
          if (alive.current) setBackupError("");
          try {
            localStorage.removeItem(draftKey);
          } catch {}
        },
        (error) => {
          if (alive.current) setBackupError(error.message);
        },
      );
      try {
        if (current.current) assertNoteFits(current.current);
      } catch (error) {
        if (alive.current) {
          setError((error as Error).message);
          setStatus("Draft kept on this device");
        }
        throw error;
      }
      while (pending.current.size || uncertain.current) {
        const resending = uncertain.current;
        const batch =
          resending?.batch || [...pending.current.entries()].slice(0, 200);
        sending.current = new Map(batch);
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
          sending.current.clear();
          adopt(fresh);
          for (const [k] of batch)
            if (k !== cell.current)
              void call("release", { cell: k }).catch(() => {});
        } catch (e) {
          for (const [k, p] of batch)
            if (!pending.current.has(k)) pending.current.set(k, p);
          sending.current.clear();
          if (alive.current) {
            const status = (e as any).status;
            if (!status || status >= 500 || [408, 423, 429].includes(status)) {
              setError("");
              setStatus(
                status === 423
                  ? draftWriter.current!.hasStored(lastStaged.current)
                    ? "Waiting for the other editor. Your draft is saved here."
                    : "Waiting for the other editor. Keep this page open."
                  : draftWriter.current!.hasStored(lastStaged.current)
                    ? "Reconnecting. Your draft is saved here."
                    : "Reconnecting. Keep this page open.",
              );
              if (!timer.current)
                timer.current = setTimeout(
                  () => {
                    timer.current = undefined;
                    void flush(false).catch(() => {});
                  },
                  Math.min(8000, 1000 * 2 ** retryCount.current++),
                );
            } else {
              setError((e as Error).message);
              setStatus(
                draftWriter.current!.hasStored(lastStaged.current)
                  ? "Draft kept on this device"
                  : "Keep this page open and save a draft copy",
              );
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
        if (lastStaged.current)
          void draftWriter
            .current!.acknowledge(lastStaged.current)
            .catch((error) => setBackupError(error.message));
        try {
          localStorage.removeItem(draftKey);
        } catch {}
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
    const before = cellValues(previous),
      after = cellValues(next);
    const keys = new Set([...before.keys(), ...after.keys()]);
    let changed = false;
    for (const k of keys)
      if (!equal(before.get(k), after.get(k))) {
        changed = true;
        const old = pending.current.get(k);
        pending.current.set(k, {
          value: after.get(k) ?? null,
          base: old ? old.base : baseline.current?.cells[k]?.hash,
        });
      }
    if (!changed) return;
    lastActivity.current = Date.now();
    current.current = next;
    setNote(next);
    onDirty?.(true);
    setStatus("Saving...");
    lastStaged.current = next;
    draftWriter.current!.stage(next);
    if (!timer.current)
      timer.current = setTimeout(() => {
        timer.current = undefined;
        void flush(false).catch(() => {});
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
        // In-flight local cells are overlaid by adopt(), so unrelated remote
        // changes remain live even when a save acknowledgement is delayed.
        adopt(result.snapshot);
        void watch();
      } catch (e) {
        if (stopped) return;
        liveFailed = true;
        if ([401, 403, 404, 426].includes((e as any).status))
          setError((e as Error).message);
        else setStatus("Reconnecting...");
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
    const backup = () => {
      void draftWriter
        .current!.flush()
        .catch((error) => setBackupError(error.message));
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      sheet.current?.flush();
      void draftWriter.current!.flush().catch(() => {});
      if (pending.current.size || uncertain.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("pagehide", backup);
    document.addEventListener("visibilitychange", backup);
    return () => {
      alive.current = false;
      stopped = true;
      clearTimeout(retry);
      clearInterval(heartbeat);
      clearTimeout(timer.current);
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("pagehide", backup);
      document.removeEventListener("visibilitychange", backup);
      void draftWriter.current!.flush().catch(() => {});
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
  if (!note || !draftReady)
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
            field?.dataset.cell?.endsWith("aiNotes")
              ? field.dataset.cell
              : object
                ? (object.closest<HTMLElement>("[data-page-id]")?.dataset
                    .pageId &&
                  object.closest<HTMLElement>("[data-page-id]")?.dataset
                    .pageId !== id
                    ? "page/" +
                      object.closest<HTMLElement>("[data-page-id]")!.dataset
                        .pageId +
                      "/"
                    : "") +
                  "item/" +
                  object.dataset.objectId
                : field!.dataset.cell!,
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
        const aiField = (e.target as HTMLElement).closest<HTMLElement>(
          '[data-cell$="aiNotes"]',
        );
        if (aiField) {
          void focusCell(aiField.dataset.cell!);
          return;
        }
        if (object) {
          const pageId =
            object.closest<HTMLElement>("[data-page-id]")?.dataset.pageId;
          void focusCell(
            (pageId && pageId !== id ? "page/" + pageId + "/" : "") +
              "item/" +
              object.dataset.objectId,
          );
        }
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
              PDF
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
              void draftWriter
                .current!.discard()
                .catch((error) => setBackupError(error.message));
              localStorage.removeItem(draftKey);
            }}
          >
            Keep the saved version
          </button>
        </div>
      )}
      {backupError && (
        <div className="error-banner" role="alert">
          {backupError}
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
              await draftWriter.current!.discard();
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
        <NotebookRead note={note} />
      ) : (
        <PagedNotebook
          ref={sheet}
          navigationStart={
            <>
              <button
                className="icon"
                aria-label="Back to notes"
                title="Back to notes"
                onClick={() =>
                  void flush()
                    .then(onBack)
                    .catch((error) => notify(error.message))
                }
              >
                <ArrowLeft size={16} />
              </button>
              {snapshot?.lineage?.at(-1) && onOpenNote && (
                <button
                  className="icon"
                  aria-label="Open parent page"
                  title={snapshot.lineage.at(-1)!.title}
                  onClick={() =>
                    void flush()
                      .then(() => onOpenNote(snapshot.lineage!.at(-1)!.id))
                      .catch((error) => notify(error.message))
                  }
                >
                  <ArrowLeft size={16} style={{ transform: "rotate(90deg)" }} />
                </button>
              )}
            </>
          }
          saveStatus={status}
          note={note}
          save={flush}
          requestAI={call}
          peers={others}
          onChange={(patch) => stage({ ...current.current!, ...patch })}
          onImage={() => document.getElementById("shared-upload")?.click()}
          onUpload={upload}
          onCommand={command}
          supportedCommands={[
            "page",
            "link",
            "flowchart",
            "image",
            "file",
            "draw",
          ]}
        >
          {(page, onBodyChange, prefix) => (
            <div data-cell={prefix + "body"}>
              <RichEditor
                ref={bodyEditor}
                value={page.body}
                readOnly={locked(prefix + "body")}
                onReady={(e) => {
                  lastEditor.current = e;
                }}
                onChange={onBodyChange}
                onCommand={command}
                supportedCommands={[
                  "page",
                  "link",
                  "flowchart",
                  "image",
                  "file",
                  "draw",
                ]}
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
          )}
        </PagedNotebook>
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
