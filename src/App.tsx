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
} from "lucide-react";
import type { Bootstrap, Note } from "./types";
import { api } from "./api";
import { Modal, Busy, Empty } from "./ui";
import NoteView from "./NoteView";
import Graph from "./Graph";
import { Inbox, Review, Audio } from "./StudyViews";
import Settings from "./Settings";
import Shared from "./Shared";
type View = "notes" | "graph" | "inbox" | "review" | "audio" | "settings";
export default function App() {
  const [data, setData] = useState<Bootstrap>();
  const [error, setError] = useState("");
  const [view, setView] = useState<View>(() => {
    const v = new URLSearchParams(location.search).get("view");
    return ["notes", "graph", "inbox", "review", "audio", "settings"].includes(
      v || "",
    )
      ? (v as View)
      : "notes";
  });
  const [leaving, setLeaving] = useState<{ view: View; note?: Note }>();
  const [selected, setSelected] = useState(
    new URLSearchParams(location.search).get("note") || "",
  );
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("");
  const [create, setCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContext, setNewContext] = useState("Machine learning");
  const [newGroup, setNewGroup] = useState("Unsorted");
  const [practice, setPractice] = useState<string>();
  const [sidebar, setSidebar] = useState(window.innerWidth >= 900);
  const dirty = useRef(false);
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
    try {
      const d = await api<Bootstrap>("/bootstrap");
      setData(d);
      setSelected((id) =>
        d.notes.some((n) => n.id === id)
          ? id
          : d.notes.find((n) => n.title === "Embeddings")?.id ||
            d.notes[0]?.id ||
            "",
      );
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (!shared) refresh();
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
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
  if (shared) return <Shared token={shared} />;
  if (!data)
    return (
      <div className="loading-overlay">
        <span className="brand-mark">✳</span>
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
          </>
        ) : (
          <Busy />
        )}
      </div>
    );
  const note = data.notes.find((n) => n.id === selected);
  const filtered = data.notes.filter(
    (n) =>
      !query ||
      [n.title, n.context, n.group, ...Object.values(n.layers)]
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
              navigate("notes");
            }}
          >
            <span className="brand-mark">✳</span>synapse
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
          <div className="notebook-avatar">AI</div>
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
              { id: "notes", label: "Notes", Icon: BookOpen },
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
              className={view === item.id ? "active" : ""}
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
          <span>YOUR CONCEPTS</span>
          <button
            className="icon"
            title="New concept"
            aria-label="New concept"
            onClick={() => setCreate(true)}
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="note-list">
          {filtered.map((n) => (
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
          ))}
          {!filtered.length && (
            <p className="muted small">No matching concepts.</p>
          )}
        </div>
        <button className="new-note-button" onClick={() => setCreate(true)}>
          <Plus size={15} />
          New concept
        </button>
        <div className="sidebar-bottom">
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
      <main className="main-area">
        {!sidebar && (
          <button
            className="show-sidebar"
            aria-label="Show sidebar"
            onClick={() => setSidebar(true)}
          >
            <Menu size={18} />
          </button>
        )}
        {error && (
          <div className="error-banner" role="alert">
            {error}
            <button onClick={refresh}>Reconnect</button>
          </div>
        )}
        {view === "notes" &&
          (note ? (
            <NoteView
              key={note.id}
              note={note}
              data={data}
              refresh={refresh}
              onOpen={(n) => navigate("notes", n)}
              onPractice={(id) => {
                setPractice(id);
                navigate("review");
              }}
              onNew={() => setCreate(true)}
              notify={notify}
              onDirty={(d) => (dirty.current = d)}
            />
          ) : (
            <Empty
              title="One idea is a good beginning"
              text="Create a concept note. Explain it simply, add an example, and connect it when the relationship makes sense."
            >
              <button className="primary" onClick={() => setCreate(true)}>
                <Plus size={15} />
                Create a concept
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
          title="Give an idea its own space"
          onClose={() => setCreate(false)}
        >
          <p className="muted">
            A useful concept answers one clear question. You can connect it to
            several topics later.
          </p>
          <label>
            Concept title
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
          <button
            className="primary"
            disabled={!newTitle.trim()}
            onClick={async () => {
              try {
                const n = await api<Note>("/notes", {
                  title: newTitle,
                  context: newContext,
                  group: newGroup,
                });
                await refresh();
                setCreate(false);
                setNewTitle("");
                navigate("notes", n);
                notify("Concept created as a local Markdown file.");
              } catch (e) {
                notify((e as Error).message);
              }
            }}
          >
            Create concept <ArrowUpRight size={15} />
          </button>
        </Modal>
      )}
    </div>
  );
}
