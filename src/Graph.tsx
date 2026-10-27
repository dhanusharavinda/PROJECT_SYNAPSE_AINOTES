import { useMemo, useState, useEffect } from "react";
import {
  ReactFlow,
  Controls,
  Handle,
  Position,
  useNodesState,
  useReactFlow,
  useNodesInitialized,
  useStore,
  ReactFlowProvider,
  type NodeProps,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  RefreshCw,
  Pin,
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  Focus,
  Route,
  BookOpen,
} from "lucide-react";
import type { Bootstrap, Note } from "./types";
import { api } from "./api";
import { noteSummary } from "./content";
import {
  arrangeGraph,
  arrangeNeighborhood,
  graphConnections,
  nearby,
  learningPath,
  relationWords,
} from "./graphModel";

function Card({ data }: NodeProps) {
  const d = data as any;
  return (
    <div
      className={
        "graph-card " +
        (d.selected ? "selected " : "") +
        (d.focal ? "focal" : "")
      }
    >
      <Handle
        type="target"
        position={d.roadmap ? Position.Top : Position.Left}
      />
      <div>
        <span className={"status-dot " + d.note.status} />
        <small>{d.note.group}</small>
        {d.pinned && <Pin size={12} />}
      </div>
      <strong>{d.note.title}</strong>
      <span className="graph-meaning">{d.note.context}</span>
      <span className="graph-card-bottom">
        {d.note.status}
        <button
          aria-label={"Open " + d.note.title}
          onClick={(e) => {
            e.stopPropagation();
            d.open(d.note);
          }}
        >
          <ArrowUpRight size={14} />
        </button>
      </span>
      <Handle
        type="source"
        position={d.roadmap ? Position.Bottom : Position.Right}
      />
    </div>
  );
}
const nodeTypes = { concept: Card };
function Reframe({ version }: { version: string }) {
  const { fitView } = useReactFlow();
  const ready = useNodesInitialized();
  const width = useStore((s) => s.width),
    height = useStore((s) => s.height);
  useEffect(() => {
    if (!ready || !width || !height) return;
    const frame = requestAnimationFrame(
      () => void fitView({ padding: 0.12, maxZoom: 1, duration: 200 }),
    );
    return () => cancelAnimationFrame(frame);
  }, [version, fitView, ready, width, height]);
  return null;
}

function GraphView({
  data,
  onOpen,
  refresh,
  notify,
}: {
  data: Bootstrap;
  onOpen: (n: Note) => void;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const first =
    data.notes.find((n) => n.title === "Embeddings")?.id ||
    data.notes[0]?.id ||
    "";
  const [focus, setFocus] = useState(first),
    [selected, setSelected] = useState(first),
    [mode, setMode] = useState<"focus" | "roadmap">("focus");
  const [group, setGroup] = useState(""),
    [expanded, setExpanded] = useState<string[]>([]),
    [search, setSearch] = useState(""),
    [twoHops, setTwoHops] = useState(false),
    [showLabels, setShowLabels] = useState(false),
    [tour, setTour] = useState<{ ids: string[]; index: number }>();
  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  const groups = useMemo(
    () => [...new Set(data.notes.map((n) => n.group))].sort(),
    [data.notes],
  );
  const connections = useMemo(() => graphConnections(data.notes), [data.notes]);
  const visible = useMemo(() => {
    let notes =
      mode === "focus"
        ? nearby(data.notes, focus, twoHops ? 2 : 1)
        : data.notes;
    return notes.filter(
      (n) =>
        (!group || n.group === group) &&
        (!search ||
          `${n.title} ${n.context}`
            .toLowerCase()
            .includes(search.toLowerCase())),
    );
  }, [data.notes, mode, focus, twoHops, group, search]);
  const present = new Set(visible.map((n) => n.id));
  const activeEdges = connections.filter(
    (e) => present.has(e.source) && present.has(e.target),
  );
  const positionKey = (id: string) =>
    mode === "focus" ? `focus-${focus}-${id}` : `roadmap-${id}`;
  const layout = useMemo(
    () =>
      mode === "focus"
        ? arrangeNeighborhood(visible, activeEdges, focus)
        : arrangeGraph(visible, activeEdges, true),
    [visible, connections, mode],
  );
  useEffect(() => {
    setNodes(
      visible.map((n) => ({
        id: n.id,
        type: "concept",
        position: data.positions[positionKey(n.id)] || layout[n.id],
        data: {
          note: n,
          selected: n.id === selected,
          focal: n.id === focus && mode === "focus",
          pinned: data.positions[positionKey(n.id)]?.pinned,
          open: onOpen,
          roadmap: true,
        },
      })),
    );
  }, [visible, layout, selected, focus, mode, data.positions]);
  const edges = activeEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: "smoothstep",
    label:
      showLabels || e.source === selected || e.target === selected
        ? relationWords[e.relation]
        : undefined,
    markerEnd:
      e.relation === "related" || e.relation === "contrasts"
        ? undefined
        : {
            type: MarkerType.ArrowClosed,
            width: 16,
            height: 16,
            color: "#6b8378",
          },
    style: {
      stroke:
        e.source === selected || e.target === selected ? "#567c69" : "#b6c5bd",
      strokeWidth: e.source === selected || e.target === selected ? 1.7 : 1,
      strokeDasharray: e.relation === "contains" ? "5 4" : undefined,
    },
    labelStyle: { fontSize: 12, fill: "var(--ink)" },
    labelBgStyle: { fill: "var(--surface,#fff)" },
    labelBgPadding: [7, 5] as [number, number],
  }));
  const note = data.notes.find((n) => n.id === selected);
  const related = connections.filter(
    (e) => e.source === selected || e.target === selected,
  );
  function focusOn(id: string) {
    setFocus(id);
    setSelected(id);
    setMode("focus");
    setGroup("");
    setSearch("");
  }
  async function savePosition(id: string, pin?: boolean) {
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    await api("/positions", {
      ...data.positions,
      [positionKey(id)]: { ...node.position, pinned: pin ?? true },
    });
    await refresh();
  }
  const frameVersion = [
    focus,
    mode,
    twoHops,
    group,
    search,
    visible.map((n) => n.id).join(","),
  ].join("|");
  return (
    <div className="graph-page graph-refined">
      <header className="page-heading">
        <div>
          <h1>Knowledge Graph</h1>
          <p>
            {mode === "focus"
              ? "Follow an idea in both directions."
              : "The notebook, arranged from your approved connections."}
          </p>
        </div>
        <div className="actions">
          <button
            onClick={async () => {
              try {
                await refresh();
                notify("Graph refreshed from your local notes.");
              } catch (e) {
                notify((e as Error).message);
              }
            }}
          >
            <RefreshCw size={15} />
            Refresh
          </button>
          <button
            onClick={async () => {
              try {
                await api(
                  "/positions",
                  Object.fromEntries(
                    Object.entries(data.positions).filter(([, p]) => p.pinned),
                  ),
                );
                await refresh();
                notify("Unpinned positions rearranged.");
              } catch (e) {
                notify((e as Error).message);
              }
            }}
          >
            Arrange layout
          </button>
        </div>
      </header>
      <div className="graph-toolbar">
        <div className="segmented" aria-label="Graph layout">
          <button
            aria-pressed={mode === "focus"}
            onClick={() => {
              setMode("focus");
              setGroup("");
            }}
          >
            <Focus size={14} />
            Focus
          </button>
          <button
            aria-pressed={mode === "roadmap"}
            onClick={() => setMode("roadmap")}
          >
            Roadmap
          </button>
        </div>
        <select
          aria-label="Graph focus"
          value={focus}
          onChange={(e) => focusOn(e.target.value)}
        >
          {data.notes.map((n) => (
            <option value={n.id} key={n.id}>
              Around {n.title}
            </option>
          ))}
        </select>
        <input
          aria-label="Find graph concept"
          placeholder="Find a concept"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="graph-count">
          {visible.length} of {data.notes.length} notes
        </span>
      </div>
      {tour && (
        <div className="study-path" role="status">
          <Route size={16} />
          <span>
            Reading path, {tour.index + 1} of {tour.ids.length}:{" "}
            <strong>
              {data.notes.find((n) => n.id === tour.ids[tour.index])?.title}
            </strong>
          </span>
          <button
            aria-label="Previous path note"
            disabled={!tour.index}
            onClick={() => {
              const index = tour.index - 1;
              setTour({ ...tour, index });
              focusOn(tour.ids[index]);
            }}
          >
            <ArrowLeft size={14} />
          </button>
          <button
            aria-label="Next path note"
            disabled={tour.index === tour.ids.length - 1}
            onClick={() => {
              const index = tour.index + 1;
              setTour({ ...tour, index });
              focusOn(tour.ids[index]);
            }}
          >
            <ArrowRight size={14} />
          </button>
          <button onClick={() => setTour(undefined)}>End path</button>
        </div>
      )}
      <div className={"graph-workspace " + (note ? "with-detail" : "")}>
        <aside className="graph-groups">
          <h2>Topics</h2>
          <button
            className={!group ? "active" : ""}
            onClick={() => {
              setGroup("");
              setMode("roadmap");
            }}
          >
            All notes <small>{data.notes.length}</small>
          </button>
          {groups.map((g) => (
            <div className="graph-topic" key={g}>
              <div>
                <button
                  aria-label={
                    (expanded.includes(g) ? "Collapse " : "Expand ") + g
                  }
                  onClick={() =>
                    setExpanded((x) =>
                      x.includes(g) ? x.filter((s) => s !== g) : [...x, g],
                    )
                  }
                >
                  {expanded.includes(g) ? (
                    <ChevronDown size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                </button>
                <button
                  className={group === g ? "active" : ""}
                  onClick={() => {
                    setMode("roadmap");
                    setGroup(g);
                  }}
                >
                  {g}
                  <small>
                    {data.notes.filter((n) => n.group === g).length}
                  </small>
                </button>
              </div>
              {expanded.includes(g) &&
                data.notes
                  .filter((n) => n.group === g)
                  .map((n) => (
                    <button
                      className="topic-note"
                      key={n.id}
                      onClick={() => focusOn(n.id)}
                    >
                      {n.title}
                    </button>
                  ))}
            </div>
          ))}
          <div className="legend">
            <span>
              <i className="status-dot collected" />
              Collected
            </span>
            <span>
              <i className="status-dot explained" />
              Explained
            </span>
            <span>
              <i className="status-dot practiced" />
              Practiced
            </span>
          </div>
        </aside>
        <div className="graph-main">
          <div className="graph-options">
            {mode === "focus" && (
              <label>
                <input
                  type="checkbox"
                  checked={twoHops}
                  onChange={(e) => setTwoHops(e.target.checked)}
                />
                One step further
              </label>
            )}
            <label>
              <input
                type="checkbox"
                checked={showLabels}
                onChange={(e) => setShowLabels(e.target.checked)}
              />
              All relationship labels
            </label>
          </div>
          <div className="flow-stage">
            {visible.length ? (
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onNodeClick={(_e, n) => setSelected(n.id)}
                onNodeDoubleClick={(_e, n) => {
                  const note = data.notes.find((x) => x.id === n.id);
                  if (note) onOpen(note);
                }}
                onNodeDragStop={(_e, n) =>
                  savePosition(n.id, false).catch((e) => notify(e.message))
                }
                fitView
                fitViewOptions={{ maxZoom: 1, padding: 0.2 }}
                minZoom={0.15}
                maxZoom={1.6}
                colorMode={
                  document.documentElement.dataset.theme === "dark"
                    ? "dark"
                    : "light"
                }
              >
                <Reframe version={frameVersion} />
                <Controls showInteractive={false} />
              </ReactFlow>
            ) : (
              <div className="graph-empty">
                <BookOpen size={26} />
                <p>No notes match this view.</p>
                <button
                  onClick={() => {
                    setGroup("");
                    setSearch("");
                  }}
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
          <div className="graph-mobile-list">
            {visible.map((n) => (
              <button
                key={n.id}
                onClick={() => setSelected(n.id)}
                className={selected === n.id ? "selected" : ""}
              >
                <span className={"status-dot " + n.status} />
                <strong>{n.title}</strong>
                <small>{n.context}</small>
                <ChevronRight size={14} />
              </button>
            ))}
          </div>
          <p className="graph-caption">
            Arrows read from source to destination. Dashed lines contain
            subpages. Select a note to read its connections.
          </p>
        </div>
        {note && (
          <aside className="graph-detail">
            <span className={"pill status " + note.status}>{note.status}</span>
            <h2>{note.title}</h2>
            <p className="graph-context">{note.context}</p>
            <p>
              {noteSummary(note) ||
                "Open the note to study its tables, drawings, or code."}
            </p>
            <div className="graph-detail-actions">
              <button className="primary" onClick={() => onOpen(note)}>
                Open note
                <ArrowUpRight size={14} />
              </button>
              <button onClick={() => focusOn(note.id)}>
                <Focus size={14} />
                Focus here
              </button>
            </div>
            <details>
              <summary>Layout and reading path</summary>
              <button
                onClick={() =>
                  savePosition(
                    note.id,
                    !data.positions[positionKey(note.id)]?.pinned,
                  ).catch((e) => notify(e.message))
                }
              >
                <Pin size={13} />
                {data.positions[positionKey(note.id)]?.pinned
                  ? "Unpin"
                  : "Pin"}{" "}
                position
              </button>
              <button
                onClick={() => {
                  const path = learningPath(data.notes, note.id);
                  if (path.cyclic) {
                    notify(
                      "Prerequisite links contain a cycle. Review those links before following an ordered path.",
                    );
                    return;
                  }
                  setTour({ ids: path.notes.map((n) => n.id), index: 0 });
                  focusOn(path.notes[0].id);
                }}
              >
                <Route size={13} />
                Follow prerequisites
              </button>
            </details>
            <h3>Connections in both directions</h3>
            <div className="connection-ledger">
              {related.map((e) => {
                const incoming = e.target === note.id,
                  other = data.notes.find(
                    (n) => n.id === (incoming ? e.source : e.target),
                  )!;
                return (
                  <button key={e.id} onClick={() => focusOn(other.id)}>
                    <span className="connection-sentence">
                      {incoming ? (
                        <>
                          <strong>{other.title}</strong>{" "}
                          {relationWords[e.relation]} this note
                        </>
                      ) : (
                        <>
                          This note {relationWords[e.relation]}{" "}
                          <strong>{other.title}</strong>
                        </>
                      )}
                    </span>
                    {e.reason && <small>{e.reason}</small>}
                    <ArrowRight size={13} />
                  </button>
                );
              })}
              {!related.length && (
                <p className="small muted">
                  No connections yet. In the note, select a word and use /link
                  to explain a connection.
                </p>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
export default function Graph(props: Parameters<typeof GraphView>[0]) {
  return (
    <ReactFlowProvider>
      <GraphView {...props} />
    </ReactFlowProvider>
  );
}
