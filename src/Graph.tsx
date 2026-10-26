import { useMemo, useState, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  RefreshCw,
  Pin,
  ChevronDown,
  ChevronRight,
  Map,
  ArrowUpRight,
} from "lucide-react";
import type { Bootstrap, Note } from "./types";
import { api } from "./api";
function Card({ data }: NodeProps) {
  const d = data as any;
  return (
    <div className={"graph-card " + (d.selected ? "selected" : "")}>
      <Handle type="target" position={Position.Top} />
      <div>
        <span className={"status-dot " + d.status} />
        <small>{d.context}</small>
        {d.pinned && <Pin size={12} />}
      </div>
      <strong>{d.label}</strong>
      <span className="graph-card-bottom">
        {d.links} connections <ArrowUpRight size={13} />
      </span>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
const nodeTypes = { concept: Card };
export default function Graph({
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
  const [focus, setFocus] = useState("all");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>();
  const [search, setSearch] = useState("");
  const groups = useMemo(
    () =>
      [...new Set(data.notes.map((n) => n.group || "Unsorted"))].sort(
        (a, b) => {
          const order = [
            "Start here",
            "Foundations",
            "Representations",
            "Retrieval",
            "Applications",
            "Evaluation",
          ];
          const ai = order.indexOf(a),
            bi = order.indexOf(b);
          return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.localeCompare(b);
        },
      ),
    [data.notes],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);
  const [arrange, setArrange] = useState(0);
  const positions = useMemo(() => data.positions, [data.positions]);
  useEffect(() => {
    let visible = data.notes;
    if (focus !== "all") {
      const root = data.notes.find((n) => n.id === focus);
      const ids = new Set([
        focus,
        ...(root?.links.map((l) => l.target) || []),
        ...data.notes
          .filter((n) => n.links.some((l) => l.target === focus))
          .map((n) => n.id),
      ]);
      visible = visible.filter((n) => ids.has(n.id));
    }
    visible = visible.filter(
      (n) =>
        !collapsed.includes(n.group) &&
        (!search || n.title.toLowerCase().includes(search.toLowerCase())),
    );
    const newNodes: any[] = [];
    const present = new Set(visible.map((n) => n.id));
    let row = 0;
    for (const group of groups) {
      const items = visible.filter((n) => n.group === group);
      if (!items.length) continue;
      newNodes.push({
        id: "group-" + group,
        type: "default",
        position: { x: 70, y: row * 155 - 55 },
        data: { label: group },
        draggable: false,
        selectable: false,
        style: {
          background: "transparent",
          border: 0,
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: 2,
          color: "#7d887f",
          width: 220,
        },
      });
      for (let i = 0; i < items.length; i++) {
        const n = items[i];
        const saved = positions[n.id];
        const position = saved
          ? { x: saved.x, y: saved.y }
          : { x: (i % 2) * 280 + 70, y: row * 155 + Math.floor(i / 2) * 150 };
        newNodes.push({
          id: n.id,
          type: "concept",
          position,
          data: {
            label: n.title,
            context: n.context,
            status: n.status,
            links:
              n.links.length +
              data.notes.filter((o) => o.links.some((l) => l.target === n.id))
                .length,
            pinned: !!saved?.pinned,
            selected: selected === n.id,
          },
        });
      }
      row += Math.ceil(items.length / 2) + 0.6;
    }
    setNodes(newNodes);
    setEdges(
      visible.flatMap((n) =>
        n.links
          .filter((l) => present.has(l.target))
          .map((l) => ({
            id: n.id + "-" + l.target,
            source: n.id,
            target: l.target,
            label: l.relation === "related" ? "related" : l.relation,
            animated: false,
            type: "smoothstep",
            markerEnd:
              l.relation === "prerequisite" || l.relation === "used-in"
                ? { type: "arrowclosed" as any }
                : undefined,
            style: { stroke: "#8ca89a", strokeWidth: 1.4 },
            labelStyle: { fontSize: 10, fill: "#65746b" },
            labelBgStyle: { fill: "#f8faf7" },
          })),
      ),
    );
  }, [data.notes, focus, collapsed, search, arrange, positions, selected]);
  async function savePositions(pinId?: string) {
    const current = { ...data.positions };
    for (const n of nodes.filter((n) => n.type === "concept"))
      current[n.id] = {
        ...n.position,
        pinned:
          pinId === n.id ? !current[n.id]?.pinned : !!current[n.id]?.pinned,
      };
    await api("/positions", current);
    await refresh();
  }
  const note = data.notes.find((n) => n.id === selected);
  return (
    <div className="graph-page">
      <header className="page-heading">
        <div>
          <div className="eyebrow">SEE THE CONNECTIONS</div>
          <h1>
            Knowledge Graph<span className="title-dot">.</span>
          </h1>
          <p>Your notes, arranged into a learning landscape.</p>
        </div>
        <div className="actions">
          <button
            onClick={async () => {
              await refresh();
              notify(
                "Graph rebuilt from local notes. Approved relationships preserved.",
              );
            }}
          >
            <RefreshCw size={15} /> Refresh
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
                notify("Unpinned cards arranged. Pinned positions preserved.");
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
        <select
          aria-label="Graph focus"
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
        >
          <option value="all">Whole notebook</option>
          {data.notes.map((n) => (
            <option value={n.id} key={n.id}>
              Around {n.title}
            </option>
          ))}
        </select>
        <input
          placeholder="Find a concept on the map..."
          aria-label="Find graph concept"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="muted">
          {data.notes.length} notes ·{" "}
          {data.notes.reduce((a, n) => a + n.links.length, 0)} approved links
        </span>
      </div>
      <div className="graph-workspace">
        <aside className="graph-groups">
          <span className="eyebrow">TOPIC GROUPS</span>
          {groups.map((g) => (
            <button
              key={g}
              onClick={() =>
                setCollapsed((c) =>
                  c.includes(g) ? c.filter((x) => x !== g) : [...c, g],
                )
              }
            >
              {collapsed.includes(g) ? (
                <ChevronRight size={14} />
              ) : (
                <ChevronDown size={14} />
              )}
              <span>{g}</span>
              <small>{data.notes.filter((n) => n.group === g).length}</small>
            </button>
          ))}
          <p>
            Groups come from your notes. Drag a card, then pin it to keep its
            place.
          </p>
          <div className="legend">
            <span>
              <i className="status-dot collected" /> Collected
            </span>
            <span>
              <i className="status-dot explained" /> Explained
            </span>
            <span>
              <i className="status-dot practiced" /> Practiced
            </span>
          </div>
        </aside>
        <div className="flow-stage">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={(_e, n) => {
              if (n.type === "concept") setSelected(n.id);
            }}
            onNodeDoubleClick={(_e, n) => {
              const note = data.notes.find((x) => x.id === n.id);
              if (note) onOpen(note);
            }}
            onNodeDragStop={() =>
              savePositions().catch((e) => notify(e.message))
            }
            defaultViewport={{ x: 15, y: 80, zoom: 0.85 }}
            minZoom={0.2}
            maxZoom={1.8}
          >
            <Background color="#d9e0d7" gap={24} />
            <Controls showInteractive={false} />
            <MiniMap nodeColor="#c5d8cb" maskColor="#f7faf4b3" />
          </ReactFlow>
        </div>
        {note && (
          <aside className="graph-detail">
            <span className="eyebrow">CONCEPT PREVIEW</span>
            <h2>{note.title}</h2>
            <span className="pill">{note.context}</span>
            <p>{note.layers.intuition.slice(0, 350)}</p>
            <button className="primary" onClick={() => onOpen(note)}>
              Open note <ArrowUpRight size={15} />
            </button>
            <button
              onClick={() =>
                savePositions(note.id).catch((e) => notify(e.message))
              }
            >
              <Pin size={14} />
              {positions[note.id]?.pinned ? "Unpin position" : "Pin position"}
            </button>
            <h4>Connections</h4>
            {note.links.map((l) => (
              <p className="small" key={l.target}>
                {l.relation} →{" "}
                {data.notes.find((n) => n.id === l.target)?.title ||
                  "Archived note"}
              </p>
            ))}
          </aside>
        )}
      </div>
    </div>
  );
}
