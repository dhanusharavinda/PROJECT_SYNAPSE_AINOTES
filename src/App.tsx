import { useEffect, useState, useRef, lazy, Suspense } from "react";
import {
  BookOpen,
  Inbox as InboxIcon,
  Network,
  Brain,
  Headphones,
  Settings as SettingsIcon,
  Search,
  Plus,
  ChevronDown,
  ArrowUpRight,
  Menu,
  PanelLeftClose,
  X,
  RefreshCw,
  Moon,
  Sun,
  FileText,
  Trash2,
  CheckSquare,
} from "lucide-react";
import { lineage } from "./content";
import type { Bootstrap, Note } from "./types";
import { api, hosted, pairingToken } from "./api";
import Connect from "./Connect";
import { Modal, Busy, Empty } from "./ui";
import NoteView from "./NoteView";
import Graph from "./Graph";
import { Inbox, Review, Audio } from "./StudyViews";
import Settings from "./Settings";
import Shared from "./Shared";
import BrandMark from "./BrandMark";
import { nextTheme, type Theme } from "./themes";
import DesktopUpdates from "./DesktopUpdates";
import NotesLibrary from "./NotesLibrary";
import { usePreferences, keyCombination } from "./preferences";
type View =
  "notes" | "library" | "graph" | "inbox" | "review" | "audio" | "settings";
export default function App() {
  const preferences = usePreferences();
  const [data, setData] = useState<Bootstrap>();
  const dataRef = useRef(data);
  dataRef.current = data;
  const [detachedNote, setDetachedNote] = useState<Note>();
  const refreshVersion = useRef(0);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(!hosted || !!pairingToken());
  const [view, setView] = useState<View>(() => {
    const v = new URLSearchParams(location.search).get("view");
    return [
      "notes",
      "library",
      "graph",
      "inbox",
      "review",
      "audio",
      "settings",
    ].includes(v || "")
      ? (v as View)
      : new URLSearchParams(location.search).has("note")
        ? "notes"
        : "library";
  });
  const [leaving, setLeaving] = useState<{ view: View; note?: Note }>();
  const [selected, setSelected] = useState(
    new URLSearchParams(location.search).get("note") || "",
  );
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("");
  const [create, setCreate] = useState(false);
  const [creationParent, setCreationParent] = useState<string | null>(null);
  const createdCallback = useRef<((n: Note) => Promise<void>) | undefined>(
    undefined,
  );
  const [bulk, setBulk] = useState(false);
  const [checked, setChecked] = useState<string[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem("synapse-theme");
      return saved === "dark" || saved === "paper" || saved === "dotted"
        ? saved
        : "light";
    } catch {
      return "light";
    }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("synapse-theme", theme);
    window.dispatchEvent(new Event("synapse:theme"));
  }, [theme]);
  useEffect(() => {
    const cycle = () => setTheme((t) => nextTheme(t));
    window.addEventListener("synapse:cycle-theme", cycle);
    return () => window.removeEventListener("synapse:cycle-theme", cycle);
  }, []);
  function openCreate(
    parentId?: string,
    callback?: (n: Note) => Promise<void>,
  ) {
    setCreationParent(parentId || null);
    createdCallback.current = callback;
    setCreate(true);
  }
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newContext, setNewContext] = useState("");
  const [newGroup, setNewGroup] = useState("Unsorted");
  const [practice, setPractice] = useState<string>();
  const [sidebar, setSidebar] = useState(
    () =>
      window.innerWidth >= 900 &&
      localStorage.getItem("synapse-sidebar") !== "hidden",
  );
  useEffect(() => {
    localStorage.setItem("synapse-sidebar", sidebar ? "shown" : "hidden");
  }, [sidebar]);
  useEffect(() => {
    const resize = () => {
      if (window.innerWidth < 900) setSidebar(false);
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const dirty = useRef(false);
  useEffect(
    () =>
      window.synapseEditing?.subscribe((command) => {
        const event = new CustomEvent("synapse:action", {
          detail: command,
          cancelable: true,
        });
        window.dispatchEvent(event);
        if (!event.defaultPrevented) window.synapseEditing?.native(command);
      }),
    [],
  );
  const saveCurrent = useRef<(() => Promise<void>) | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const shared = window.location.pathname.match(
    /^\/share\/([a-zA-Z0-9-]+)$/,
  )?.[1];
  function notify(s: string) {
    setToast(s);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 7000);
  }
  async function refresh() {
    const requestVersion = ++refreshVersion.current;
    try {
      const d = await api<Bootstrap>("/bootstrap");
      if (requestVersion !== refreshVersion.current) return;
      if (dirty.current && dataRef.current) {
        const missing = dataRef.current.notes.find(
          (n) => n.id === selected && !d.notes.some((x) => x.id === n.id),
        );
        if (missing) setDetachedNote(missing);
      }
      setData(d);
      setSelected((id) =>
        dirty.current || d.notes.some((n) => n.id === id)
          ? id
          : d.notes[0]?.id || "",
      );
      setError("");
    } catch (e) {
      if (requestVersion !== refreshVersion.current) return;
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (!shared && connected) refresh();
  }, [connected]);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    if (shared || !connected) return;
    const sync = () => {
      if (document.visibilityState !== "hidden") void refreshRef.current();
    };
    const interval = setInterval(sync, 2500);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [connected, shared]);
  useEffect(() => {
    if (!data || shared) return;
    const params = new URLSearchParams();
    if (view !== "notes") params.set("view", view);
    else if (selected) params.set("note", selected);
    history.replaceState(
      null,
      "",
      location.pathname + (params.size ? "?" + params.toString() : ""),
    );
  }, [view, selected, data, shared]);
  function navigate(v: View, n?: Note) {
    if (dirty.current) {
      setLeaving({ view: v, note: n });
      return;
    }
    dirty.current = false;
    setView(v);
    if (n) setSelected(n.id);
    if (innerWidth < 900) setSidebar(false);
  }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        (event.target as HTMLElement).closest(".shortcut-list")
      )
        return;
      const editing = (event.target as HTMLElement).closest(
        "input,textarea,[contenteditable=true]",
      );
      if (editing && !event.ctrlKey && !event.altKey && !event.metaKey) return;
      const action = Object.entries(preferences.shortcuts).find(
        ([, shortcut]) => shortcut && shortcut === keyCombination(event),
      )?.[0];
      if (["library", "graph", "settings"].includes(action || "")) {
        event.preventDefault();
        navigate(action as View);
      } else if (action === "new-note") {
        event.preventDefault();
        openCreate();
      } else if (action === "search") {
        event.preventDefault();
        setSidebar(true);
        setTimeout(() => searchRef.current?.focus(), 30);
      } else if (action === "theme") {
        event.preventDefault();
        setTheme((t) => nextTheme(t));
      } else if (action === "save") {
        event.preventDefault();
        void saveCurrent.current?.().catch((error) => notify(error.message));
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  if (!connected) return <Connect onConnected={() => setConnected(true)} />;
  if (shared) return <Shared token={shared} />;
  if (!data)
    return (
      <div className="loading-overlay">
        <BrandMark />
        <h2>
          {error ? "Notebook unavailable" : "Opening your local notebook"}
        </h2>
        {error ? (
          <>
            <p>{error}</p>
            <button onClick={refresh}>
              <RefreshCw size={14} />
              Retry
            </button>
            {hosted && (
              <button
                onClick={() => {
                  sessionStorage.removeItem("synapse-pairing");
                  setConnected(false);
                }}
              >
                Reconnect local notebook
              </button>
            )}
          </>
        ) : (
          <Busy />
        )}
      </div>
    );
  const note =
    data.notes.find((n) => n.id === selected) ||
    (detachedNote?.id === selected ? detachedNote : undefined);
  const filtered = data.notes.filter(
    (n) =>
      !query ||
      [n.title, n.context, n.group, n.body || "", ...Object.values(n.layers)]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const due = data.notes.filter((n) => {
    if (n.reviewEnabled === false) return false;
    const r = data.reviews.find((r) => r.noteId === n.id);
    return !r || new Date(r.due) <= new Date();
  }).length;
  return (
    <div className={"app-shell " + (!sidebar ? "sidebar-hidden" : "")}>
      <aside className="sidebar">
        <div className="brand-row">
          <a
            className="brand"
            href="/"
            onClick={(e) => {
              e.preventDefault();
              navigate("library");
            }}
          >
            <BrandMark />
            synapse
            <span className="brand-period">.</span>
          </a>
          <button
            className="icon collapse-sidebar"
            aria-label="Collapse sidebar"
            onClick={() => setSidebar(false)}
          >
            <PanelLeftClose size={16} />
          </button>
        </div>
        <div className="notebook-picker">
          <div className="notebook-avatar">
            <BookOpen size={16} />
          </div>
          <div>
            <strong>My learning space</strong>
            <small>Local notebook</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <div className="sidebar-search">
          <Search size={15} />
          <input
            ref={searchRef}
            placeholder="Search your notes"
            aria-label="Search notes"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (view !== "notes") navigate("notes");
            }}
          />
          <kbd>⌘ K</kbd>
        </div>
        <nav aria-label="Main navigation">
          {(
            [
              { id: "library", label: "All notes", Icon: BookOpen },
              {
                id: "inbox",
                label: "Inbox",
                Icon: InboxIcon,
                count:
                  data.sources.filter((s) => !s.archived).length || undefined,
              },
              { id: "graph", label: "Knowledge Graph", Icon: Network },
              {
                id: "review",
                label: "Review",
                Icon: Brain,
                count: due || undefined,
              },
              { id: "audio", label: "Audio studio", Icon: Headphones },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              className={
                view === item.id || (item.id === "library" && view === "notes")
                  ? "active"
                  : ""
              }
              onClick={() => navigate(item.id)}
            >
              <item.Icon size={18} />
              <span>{item.label}</span>
              {"count" in item && item.count ? (
                <small>{item.count}</small>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-section-head">
          <span>Notes</span>
          <button
            className="icon"
            title="Select notes"
            aria-label="Select notes"
            onClick={() => {
              setBulk(!bulk);
              setChecked([]);
            }}
          >
            <CheckSquare size={16} />
          </button>
          <button
            className="icon"
            title="New note"
            aria-label="New note"
            onClick={() => openCreate()}
          >
            <Plus size={16} />
          </button>
        </div>
        {bulk && (
          <div className="bulk-note-actions">
            <label>
              <input
                type="checkbox"
                aria-label="Select all visible notes"
                checked={
                  filtered.length > 0 &&
                  filtered.every((n) => checked.includes(n.id))
                }
                onChange={(e) =>
                  setChecked(e.target.checked ? filtered.map((n) => n.id) : [])
                }
              />{" "}
              Select all
            </label>
            <button
              className="danger-text"
              disabled={!checked.length}
              onClick={() => setDeleteConfirm(true)}
            >
              <Trash2 size={13} /> Delete {checked.length || ""}
            </button>
          </div>
        )}
        <div className="note-list">
          {filtered.map((n) => (
            <div key={n.id} className="note-list-row">
              {bulk && (
                <input
                  type="checkbox"
                  aria-label={"Select " + n.title}
                  checked={checked.includes(n.id)}
                  onChange={(e) =>
                    setChecked((ids) =>
                      e.target.checked
                        ? [...ids, n.id]
                        : ids.filter((id) => id !== n.id),
                    )
                  }
                />
              )}
              <button
                key={n.id}
                className={
                  view === "notes" && selected === n.id ? "selected" : ""
                }
                onClick={() => navigate("notes", n)}
              >
                <span className={"status-dot " + n.status} />
                <span>{n.title}</span>
              </button>
            </div>
          ))}
          {!filtered.length && (
            <p className="muted small">No matching concepts.</p>
          )}
        </div>
        <button className="new-note-button" onClick={() => openCreate()}>
          <Plus size={15} />
          New note
        </button>
        <div className="sidebar-bottom">
          <button
            className="theme-cycle"
            aria-label={`Theme: ${theme}. Switch theme`}
            title="Light, Dark, Paper"
            onClick={() => setTheme((t) => nextTheme(t))}
          >
            {theme === "light" ? (
              <Sun size={16} />
            ) : theme === "dark" ? (
              <Moon size={16} />
            ) : (
              <FileText size={16} />
            )}
            {theme.charAt(0).toUpperCase() + theme.slice(1)}
          </button>
          <div className="local-status">
            <span className="live-dot" />
            <span>
              Saved on this computer
              <small>{data.notes.length} notes · Markdown files</small>
            </span>
          </div>
          <button
            className={view === "settings" ? "active" : ""}
            onClick={() => navigate("settings")}
          >
            <SettingsIcon size={17} />
            Settings & storage
          </button>
        </div>
      </aside>
      <main className={"main-area " + (!sidebar ? "with-nav-handle" : "")}>
        <DesktopUpdates
          beforeRestart={async () => {
            await saveCurrent.current?.();
            if (dirty.current)
              throw new Error("Save or recover your draft before restarting.");
          }}
        />
        {!sidebar && (
          <div className="compact-nav">
            <button
              className="show-sidebar"
              aria-label="Show sidebar"
              onClick={() => setSidebar(true)}
            >
              <Menu size={18} />
            </button>
            <span>Synapse</span>
            {view !== "notes" && (
              <button
                className="compact-theme"
                aria-label={`Theme: ${theme}. Switch theme`}
                title="Switch theme"
                onClick={() => setTheme(nextTheme(theme))}
              >
                {theme === "light" ? (
                  <Sun size={17} />
                ) : theme === "dark" ? (
                  <Moon size={17} />
                ) : (
                  <FileText size={17} />
                )}
                <span>{theme.charAt(0).toUpperCase() + theme.slice(1)}</span>
              </button>
            )}
          </div>
        )}
        {error && (
          <div className="error-banner" role="alert">
            {error}
            <button onClick={refresh}>Reconnect</button>
          </div>
        )}
        {view === "library" && (
          <NotesLibrary
            notes={data.notes}
            onOpen={(n) => navigate("notes", n)}
            onNew={() => openCreate()}
            onDelete={(ids) => {
              setChecked(ids);
              setDeleteConfirm(true);
            }}
          />
        )}
        {view === "notes" &&
          (note ? (
            <NoteView
              key={note.id}
              note={note}
              data={data}
              refresh={refresh}
              onOpen={(n) => navigate("notes", n)}
              onLibrary={() => navigate("library")}
              onPractice={(id) => {
                setPractice(id);
                navigate("review");
              }}
              onNew={openCreate}
              notify={notify}
              onDirty={(d) => (dirty.current = d)}
              onSaveReady={(save) => {
                saveCurrent.current = save;
              }}
            />
          ) : (
            <Empty
              title="One idea is a good beginning"
              text="Create a concept note. Explain it simply, add an example, and connect it when the relationship makes sense."
            >
              <button className="primary" onClick={() => openCreate()}>
                <Plus size={15} />
                Create a note
              </button>
            </Empty>
          ))}
        {view === "graph" && (
          <Graph
            data={data}
            onOpen={(n) => navigate("notes", n)}
            refresh={refresh}
            notify={notify}
          />
        )}{" "}
        {view === "inbox" && (
          <Inbox
            data={data}
            refresh={refresh}
            notify={notify}
            onOpen={(n) => navigate("notes", n)}
          />
        )}{" "}
        {view === "review" && (
          <Review
            key={practice || "review"}
            initialId={practice}
            data={data}
            refresh={refresh}
            notify={notify}
            onOpen={(n) => navigate("notes", n)}
          />
        )}{" "}
        {view === "audio" && (
          <Audio
            data={data}
            refresh={refresh}
            notify={notify}
            onOpen={(n) => navigate("notes", n)}
          />
        )}{" "}
        {view === "settings" && (
          <Settings data={data} refresh={refresh} notify={notify} />
        )}
      </main>
      {leaving && (
        <Modal
          title="Your draft has unsaved changes"
          onClose={() => setLeaving(undefined)}
        >
          <p>
            Stay in this note until the saved indicator appears, or leave and
            discard this unsaved draft. Previously saved versions remain in
            history.
          </p>
          <footer className="dialog-actions">
            <button onClick={() => setLeaving(undefined)}>
              Stay in my note
            </button>
            <button
              onClick={() => {
                dirty.current = false;
                setView(leaving.view);
                if (leaving.note) setSelected(leaving.note.id);
                setLeaving(undefined);
              }}
            >
              Leave and discard draft
            </button>
          </footer>
        </Modal>
      )}
      {deleteConfirm && (
        <Modal
          title={"Delete " + checked.length + " notes?"}
          onClose={() => setDeleteConfirm(false)}
        >
          <p>
            These notes will move to Trash. You can restore them in Settings.
          </p>
          <footer className="dialog-actions">
            <button onClick={() => setDeleteConfirm(false)}>Cancel</button>
            <button
              className="danger-text"
              disabled={deleting}
              onClick={async () => {
                if (dirty.current && checked.includes(selected)) {
                  notify("Save your current note before deleting it.");
                  setDeleteConfirm(false);
                  return;
                }
                setDeleting(true);
                try {
                  await api("/notes/trash", { ids: checked });
                  setChecked([]);
                  setDeleteConfirm(false);
                  await refresh();
                  notify("Notes moved to Trash.");
                } catch (e) {
                  notify((e as Error).message);
                } finally {
                  setDeleting(false);
                }
              }}
            >
              {deleting ? "Deleting..." : "Move to Trash"}
            </button>
          </footer>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button
            className="icon"
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {create && (
        <Modal
          title={creationParent ? "Add a page inside this page" : "New note"}
          onClose={() => setCreate(false)}
        >
          <p className="muted">
            A useful concept answers one clear question. You can connect it to
            several topics later.
          </p>
          <label>
            Note title
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="What do you want to understand?"
            />
          </label>
          <label>
            Meaning or context
            <input
              value={newContext}
              onChange={(e) => setNewContext(e.target.value)}
            />
          </label>
          <label>
            Topic group
            <input
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
            />
          </label>
          <label>
            Date (optional)
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
            />
          </label>
          <button
            className="primary"
            disabled={!newTitle.trim()}
            onClick={async () => {
              try {
                const n = await api<Note>("/notes", {
                  title: newTitle,
                  context: newContext,
                  group: newGroup,
                  body: "",
                  noteDate: newDate || undefined,
                  parentId: creationParent,
                });
                sessionStorage.setItem("synapse-new-note:" + n.id, "1");
                if (createdCallback.current) await createdCallback.current(n);
                await refresh();
                setCreate(false);
                setNewTitle("");
                setNewDate("");
                navigate("notes", n);
                notify("Concept created as a local Markdown file.");
              } catch (e) {
                notify((e as Error).message);
              }
            }}
          >
            Create note <ArrowUpRight size={15} />
          </button>
        </Modal>
      )}
    </div>
  );
}
