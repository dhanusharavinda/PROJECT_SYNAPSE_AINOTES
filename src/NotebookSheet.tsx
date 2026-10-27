import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ArrowUpRight,
  Copy,
  Grip,
  ImagePlus,
  Layers2,
  MousePointer2,
  PenLine,
  Plus,
  Redo2,
  Square,
  Table2,
  Trash2,
  Type,
  Undo2,
  X,
} from "lucide-react";
import type { CanvasItem, NoteCanvas } from "./types";
import { fileUrl, mediaUrl } from "./api";
import RichEditor, { type EditorHandle } from "./RichEditor";
import { keyCombination, usePreferences } from "./preferences";
import { storageMarkdown } from "./markdown";

type Tool =
  "write" | "select" | "pen" | "arrow" | "rectangle" | "text" | "table";
const empty: NoteCanvas = { items: [], height: 400 };
const tableText =
  "| Topic | Explanation |\n| --- | --- |\n| Idea | Write here |\n| Example | Write here |";
export interface SheetHandle {
  tool: (tool: Tool) => void;
  image: (src: string, alt: string) => void;
  drawing: (id: string) => void;
  editor: () => EditorHandle | null;
  block: (kind: "table" | "text", markdown: string) => void;
}
function safeMedia(src: string) {
  const value = src.replace(/^\.\.\/(attachments|drawings)\//, "/files/$1/");
  return value.startsWith("/files/attachments/") ||
    value.startsWith("/files/drawings/")
    ? mediaUrl(value)
    : "";
}
export default forwardRef<
  SheetHandle,
  {
    value?: NoteCanvas;
    onChange: (value: NoteCanvas) => void;
    onDrawing: (id: string) => void;
    onImage: () => void;
    onCommand?: (cmd: string) => void;
    onUpload?: (file: File) => void;
    children: ReactNode;
  }
>(function NotebookSheet(
  { value, onChange, onDrawing, onImage, onCommand, onUpload, children },
  ref,
) {
  const [scene, setScene] = useState<NoteCanvas>(value || empty);
  const latest = useRef(scene);
  const sent = useRef(value);
  const change = useRef(onChange);
  change.current = onChange;
  const [tool, setTool] = useState<Tool>("write");
  const [selected, setSelected] = useState<string>();
  const [color, setColor] = useState("#24392f");
  const [scale, setScale] = useState(1);
  const sheet = useRef<HTMLDivElement>(null);
  const history = useRef<NoteCanvas[]>([]),
    future = useRef<NoteCanvas[]>([]);
  const gesture = useRef<
    | {
        start: [number, number];
        origin: NoteCanvas;
        id: string;
        operation: "move" | "resize" | "create";
      }
    | undefined
  >(undefined);
  const [drawingVersion, setDrawingVersion] = useState(0);
  const preferences = usePreferences();
  const textEditors = useRef(new Map<string, EditorHandle>());
  useEffect(() => {
    const saved = () => setDrawingVersion(Date.now());
    window.addEventListener("synapse:drawing-saved", saved);
    return () => window.removeEventListener("synapse:drawing-saved", saved);
  }, []);
  useEffect(() => {
    if (
      value &&
      value !== sent.current &&
      JSON.stringify(value) !== JSON.stringify(latest.current)
    ) {
      latest.current = value;
      setScene(value);
      history.current = [];
      future.current = [];
    }
    sent.current = value;
  }, [value]);
  useEffect(() => {
    if (!sheet.current) return;
    const observer = new ResizeObserver(() => {
      if (sheet.current) setScale(sheet.current.clientWidth / 1000 || 1);
    });
    observer.observe(sheet.current);
    setScale(sheet.current.clientWidth / 1000 || 1);
    return () => observer.disconnect();
  }, []);
  function commit(next: NoteCanvas, previous = latest.current) {
    if (JSON.stringify(next) === JSON.stringify(previous)) return;
    history.current = [...history.current.slice(-79), previous];
    future.current = [];
    latest.current = next;
    sent.current = next;
    setScene(next);
    change.current(next);
  }
  function preview(next: NoteCanvas) {
    latest.current = next;
    setScene(next);
  }
  function undo() {
    const previous = history.current.pop();
    if (!previous) return;
    future.current.push(latest.current);
    preview(previous);
    sent.current = previous;
    change.current(previous);
  }
  function redo() {
    const next = future.current.pop();
    if (!next) return;
    history.current.push(latest.current);
    preview(next);
    sent.current = next;
    change.current(next);
  }
  function position(
    event: ReactPointerEvent | React.MouseEvent,
  ): [number, number] {
    const rect = sheet.current!.getBoundingClientRect();
    return [
      Math.max(0, (event.clientX - rect.left) / scale),
      Math.max(0, (event.clientY - rect.top) / scale),
    ];
  }
  function placement() {
    const editor = sheet.current?.querySelector<HTMLElement>(
      ".editor-wrap > .tiptap, .editor-wrap .note-editor",
    );
    const bounds = sheet.current?.getBoundingClientRect();
    const y =
      editor && bounds
        ? Math.max(
            50,
            (editor.getBoundingClientRect().bottom - bounds.top) / scale + 16,
          )
        : 70;
    return {
      x: Math.min(650, 24 + (latest.current.items.length % 4) * 30),
      y: Math.max(
        y,
        ...latest.current.items.map((item) => item.y + item.height + 18),
      ),
    };
  }
  function add(item: Omit<CanvasItem, "id">) {
    const next = { ...item, id: crypto.randomUUID() };
    commit({
      items: [...latest.current.items, next],
      height: Math.max(latest.current.height, next.y + next.height + 40),
    });
    setSelected(next.id);
    setTool("write");
    return next.id;
  }
  function update(id: string, patch: Partial<CanvasItem>) {
    const items = latest.current.items.map((item) =>
      item.id === id ? { ...item, ...patch } : item,
    );
    commit({
      items,
      height: Math.max(
        latest.current.height,
        ...items.map((item) => item.y + item.height + 40),
      ),
    });
  }
  function remove() {
    if (!selected) return;
    const items = latest.current.items.filter((item) => item.id !== selected);
    commit({
      items,
      height: Math.max(400, ...items.map((item) => item.y + item.height + 36)),
    });
    setSelected(undefined);
  }
  useImperativeHandle(ref, () => ({
    tool: setTool,
    image: (src, alt) =>
      add({
        kind: "image",
        src: storageMarkdown(src),
        text: alt,
        ...placement(),
        width: 260,
        height: 190,
      }),
    drawing: (id) =>
      add({
        kind: "drawing",
        drawingId: id,
        ...placement(),
        width: 300,
        height: 220,
      }),
    editor: () => (selected ? textEditors.current.get(selected) || null : null),
    block: (kind, text) =>
      add({
        kind,
        text,
        ...placement(),
        width: kind === "table" ? 420 : 340,
        height: 180,
      }),
  }));
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || document.querySelector('[role="dialog"]'))
        return;
      const active = event.target as HTMLElement;
      const editing = active?.closest("input,textarea,[contenteditable=true]");
      if (event.key === "Escape") {
        setTool("write");
        setSelected(undefined);
        return;
      }
      const action = Object.entries(preferences.shortcuts).find(
        ([, shortcut]) => shortcut === keyCombination(event),
      )?.[0];
      if (
        action &&
        (!editing || event.altKey || event.ctrlKey || event.metaKey)
      ) {
        if (["draw", "select", "text", "arrow", "table"].includes(action)) {
          event.preventDefault();
          setTool(action === "draw" ? "pen" : (action as Tool));
          return;
        }
      }
      if (editing) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
      } else if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "y"
      ) {
        event.preventDefault();
        redo();
      } else if (selected && ["Delete", "Backspace"].includes(event.key)) {
        event.preventDefault();
        remove();
      } else if (selected && /^Arrow/.test(event.key)) {
        const item = latest.current.items.find((item) => item.id === selected);
        if (!item) return;
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        update(selected, {
          x: Math.max(
            0,
            Math.min(
              1000 - item.width,
              item.x +
                (event.key === "ArrowRight"
                  ? step
                  : event.key === "ArrowLeft"
                    ? -step
                    : 0),
            ),
          ),
          y: Math.max(
            0,
            item.y +
              (event.key === "ArrowDown"
                ? step
                : event.key === "ArrowUp"
                  ? -step
                  : 0),
          ),
        });
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  function start(event: ReactPointerEvent) {
    if (
      event.button !== 0 ||
      (event.target as HTMLElement).closest(
        "button,input,.editor-toolbar,.table-actions,.context-menu,.slash-menu",
      )
    )
      return;
    if (tool === "write") return;
    const point = position(event);
    if (tool === "select") {
      if (!(event.target as HTMLElement).closest(".sheet-object"))
        setSelected(undefined);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (tool === "text" || tool === "table") {
      const id = add({
        kind: tool,
        x: Math.min(point[0], 660),
        y: point[1],
        width: tool === "table" ? 420 : 300,
        height: tool === "table" ? 190 : 100,
        text: tool === "table" ? tableText : "",
      });
      setTimeout(
        () =>
          sheet.current
            ?.querySelector<HTMLElement>(
              `[data-object-id="${id}"] [contenteditable=true]`,
            )
            ?.focus(),
        20,
      );
      return;
    }
    const item: CanvasItem = {
      id: crypto.randomUUID(),
      kind: tool,
      x: point[0],
      y: point[1],
      width: 1,
      height: 1,
      color,
      points: [[0, 0]],
    };
    gesture.current = {
      start: point,
      origin: latest.current,
      id: item.id,
      operation: "create",
    };
    preview({ ...latest.current, items: [...latest.current.items, item] });
    setSelected(item.id);
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: ReactPointerEvent) {
    const current = gesture.current;
    if (!current) return;
    const point = position(event),
      dx = point[0] - current.start[0],
      dy = point[1] - current.start[1];
    const before = current.origin.items.find((item) => item.id === current.id);
    const items = latest.current.items.map((item) => {
      if (item.id !== current.id) return item;
      if (current.operation === "move" && before)
        return {
          ...item,
          x: Math.max(0, Math.min(1000 - item.width, before.x + dx)),
          y: Math.max(0, before.y + dy),
        };
      if (current.operation === "resize" && before) {
        const media = item.kind === "drawing" || item.kind === "image";
        const width = Math.max(60, Math.min(1000 - item.x, before.width + dx)),
          height = media
            ? (width * before.height) / before.width
            : Math.max(30, before.height + dy);
        return {
          ...item,
          width,
          height,
          points: before.points?.map(
            ([x, y]) =>
              [(x * width) / before.width, (y * height) / before.height] as [
                number,
                number,
              ],
          ),
        };
      }
      return {
        ...item,
        points:
          tool === "pen"
            ? [...(item.points || []), [dx, dy] as [number, number]].slice(
                0,
                15000,
              )
            : ([
                [0, 0],
                [dx, dy],
              ] as [number, number][]),
        width: Math.max(1, Math.abs(dx)),
        height: Math.max(1, Math.abs(dy)),
      };
    });
    preview({ items, height: Math.max(latest.current.height, point[1] + 70) });
  }
  function end(event: ReactPointerEvent) {
    const current = gesture.current;
    if (!current) return;
    let next = latest.current;
    if (current.operation === "create") {
      next = {
        ...next,
        items: next.items.map((item) => {
          if (item.id !== current.id) return item;
          const points = item.points || [[0, 0]];
          const minX = Math.min(...points.map((p) => p[0])),
            minY = Math.min(...points.map((p) => p[1]));
          const width = Math.max(
              2,
              Math.max(...points.map((p) => p[0])) - minX,
            ),
            height = Math.max(2, Math.max(...points.map((p) => p[1])) - minY);
          return {
            ...item,
            x: Math.max(0, item.x + minX - 4),
            y: Math.max(0, item.y + minY - 4),
            width: width + 8,
            height: height + 8,
            points: points.map(
              ([x, y]) => [x - minX + 4, y - minY + 4] as [number, number],
            ),
          };
        }),
      };
    }
    gesture.current = undefined;
    commit(next, current.origin);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function drag(
    event: ReactPointerEvent,
    item: CanvasItem,
    operation: "move" | "resize",
  ) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setSelected(item.id);
    gesture.current = {
      start: position(event),
      origin: latest.current,
      id: item.id,
      operation,
    };
    sheet.current?.setPointerCapture(event.pointerId);
  }
  const selectedItem = scene.items.find((item) => item.id === selected);
  const buttons = [
    ["write", "Write", Type],
    ["select", "Move", MousePointer2],
    ["pen", "Pen", PenLine],
    ["arrow", "Arrow", ArrowUpRight],
    ["rectangle", "Shape", Square],
    ["text", "Text box", Type],
    ["table", "Table", Table2],
  ] as const;
  return (
    <section
      className={"notebook-sheet font-" + preferences.font}
      aria-label="Notebook sheet"
    >
      <div className="sheet-toolbar" role="toolbar" aria-label="Notebook tools">
        <div className="sheet-tool-group">
          {buttons.map(([id, label, Icon]) => (
            <button
              key={id}
              aria-label={label + " tool"}
              title={label}
              aria-pressed={tool === id}
              onClick={() => {
                setTool(id);
                if (id === "write") setSelected(undefined);
              }}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
          <button
            title="Add image"
            aria-label="Add image to sheet"
            onClick={onImage}
          >
            <ImagePlus size={16} />
          </button>
        </div>
        <div className="sheet-tool-group">
          <input
            type="color"
            aria-label="Pen color"
            value={color}
            onChange={(e) => {
              setColor(e.target.value);
              if (
                selectedItem &&
                ["pen", "arrow", "rectangle"].includes(selectedItem.kind)
              )
                update(selectedItem.id, { color: e.target.value });
            }}
          />
          <button
            aria-label="Undo sheet change"
            disabled={!history.current.length}
            onClick={undo}
          >
            <Undo2 size={16} />
          </button>
          <button
            aria-label="Redo sheet change"
            disabled={!future.current.length}
            onClick={redo}
          >
            <Redo2 size={16} />
          </button>
        </div>
      </div>
      {tool !== "write" && (
        <div className="sheet-tool-hint" role="status">
          {tool === "pen"
            ? "Draw directly on the page."
            : tool === "select"
              ? "Drag an object or use arrow keys. Delete removes it."
              : tool === "text"
                ? "Click anywhere to write."
                : tool === "table"
                  ? "Click to place a table."
                  : "Drag on the page to draw."}
          <button aria-label="Finish drawing" onClick={() => setTool("write")}>
            <X size={13} /> Done
          </button>
        </div>
      )}
      {selectedItem && (
        <div
          className="object-toolbar"
          role="toolbar"
          aria-label="Selected object"
        >
          <span>
            {selectedItem.kind === "drawing"
              ? "Flowchart / drawing"
              : selectedItem.kind === "pen"
                ? "Drawing"
                : selectedItem.kind.charAt(0).toUpperCase() +
                  selectedItem.kind.slice(1)}
          </span>
          {selectedItem.kind === "drawing" && (
            <button onClick={() => onDrawing(selectedItem.drawingId!)}>
              <PenLine size={13} />
              Edit
            </button>
          )}
          <button
            onClick={() =>
              add({
                kind: "text",
                x:
                  selectedItem.x + selectedItem.width + 24 < 720
                    ? selectedItem.x + selectedItem.width + 24
                    : Math.max(0, selectedItem.x - 324),
                y: selectedItem.y,
                width: 300,
                height: 100,
                text: "",
              })
            }
          >
            <Type size={13} />
            Write beside
          </button>
          <button
            title="Duplicate"
            aria-label="Duplicate object"
            onClick={() =>
              add({
                ...selectedItem,
                x: Math.min(1000 - selectedItem.width, selectedItem.x + 24),
                y: selectedItem.y + 24,
              })
            }
          >
            <Copy size={14} />
          </button>
          <button
            title="Bring to front"
            aria-label="Bring object to front"
            onClick={() =>
              commit({
                ...scene,
                items: [
                  ...scene.items.filter((item) => item.id !== selected),
                  selectedItem,
                ],
              })
            }
          >
            <Layers2 size={14} />
          </button>
          <button
            title="Send to back"
            aria-label="Send object to back"
            onClick={() =>
              commit({
                ...scene,
                items: [
                  selectedItem,
                  ...scene.items.filter((item) => item.id !== selected),
                ],
              })
            }
          >
            <Layers2 size={14} style={{ transform: "rotate(180deg)" }} />
          </button>
          <button
            aria-label="Delete selected object"
            title="Delete"
            onClick={remove}
          >
            <Trash2 size={14} />
          </button>
          <button
            aria-label="Deselect object"
            onClick={() => setSelected(undefined)}
          >
            <X size={14} />
          </button>
        </div>
      )}
      <div
        ref={sheet}
        className={"notebook-sheet-content tool-" + tool}
        style={{
          minHeight:
            scene.items.length || tool !== "write"
              ? Math.max(400, scene.height * scale)
              : undefined,
        }}
        onPointerDownCapture={(event) => {
          if (!["write", "select"].includes(tool)) start(event);
        }}
        onPointerDown={(event) => {
          if (tool === "select") start(event);
          else if (
            tool === "write" &&
            !(event.target as HTMLElement).closest(".sheet-object")
          )
            setSelected(undefined);
        }}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onDoubleClick={(event) => {
          const target = event.target as HTMLElement;
          if (target === event.currentTarget) {
            const point = position(event);
            add({
              kind: "text",
              x: Math.min(point[0], 680),
              y: point[1],
              width: 300,
              height: 100,
              text: "",
            });
          }
        }}
        tabIndex={-1}
      >
        <div className="sheet-prose">{children}</div>
        {scene.items.map((item, index) => {
          const drawing = ["pen", "arrow", "rectangle"].includes(item.kind);
          const pts = item.points || [
            [0, 0],
            [item.width, item.height],
          ];
          const first = pts[0],
            last = pts.at(-1)!;
          return (
            <div
              key={item.id}
              data-object-id={item.id}
              className={
                "sheet-object kind-" +
                item.kind +
                (selected === item.id ? " is-selected" : "")
              }
              style={{
                left: item.x / 10 + "%",
                top: item.y * scale,
                width: item.width / 10 + "%",
                height: item.height * scale,
                zIndex: index + 2,
              }}
              onPointerDown={(event) => {
                if (tool !== "write" && tool !== "select") return;
                setSelected(item.id);
                if (
                  (tool === "select" ||
                    ["image", "drawing", "pen", "arrow", "rectangle"].includes(
                      item.kind,
                    )) &&
                  !(event.target as HTMLElement).closest(
                    "button,input,[contenteditable=true]",
                  )
                )
                  drag(event, item, "move");
              }}
            >
              {selected === item.id && (
                <button
                  className="object-grip"
                  aria-label="Drag object"
                  onPointerDown={(event) => drag(event, item, "move")}
                >
                  <Grip size={14} />
                </button>
              )}
              {drawing ? (
                <svg
                  className="sheet-shape"
                  viewBox={`0 0 ${item.width} ${item.height}`}
                  preserveAspectRatio="none"
                  aria-label={item.kind === "pen" ? "Hand drawing" : item.kind}
                >
                  <defs>
                    <marker
                      id={"arrow-" + item.id}
                      markerWidth="9"
                      markerHeight="9"
                      refX="7"
                      refY="4"
                      orient="auto"
                      markerUnits="strokeWidth"
                    >
                      <path
                        d="M1 1 L7 4 L1 7"
                        fill="none"
                        stroke={item.color || color}
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </marker>
                  </defs>
                  {item.kind === "rectangle" ? (
                    <rect
                      x="4"
                      y="4"
                      width={Math.max(1, item.width - 8)}
                      height={Math.max(1, item.height - 8)}
                      rx="4"
                      fill="none"
                      stroke={item.color || color}
                      strokeWidth="2"
                    />
                  ) : (
                    <polyline
                      points={pts.map((p) => p.join(",")).join(" ")}
                      fill="none"
                      stroke={item.color || color}
                      strokeWidth={item.kind === "pen" ? 2.4 : 2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      markerEnd={
                        item.kind === "arrow"
                          ? `url(#arrow-${item.id})`
                          : undefined
                      }
                    />
                  )}
                </svg>
              ) : item.kind === "image" || item.kind === "drawing" ? (
                <img
                  draggable={false}
                  src={
                    item.kind === "drawing"
                      ? fileUrl("drawings", item.drawingId + ".svg") +
                        (fileUrl("drawings", item.drawingId + ".svg").includes(
                          "?",
                        )
                          ? "&"
                          : "?") +
                        "v=" +
                        drawingVersion
                      : safeMedia(item.src || "")
                  }
                  alt={
                    item.text ||
                    (item.kind === "drawing"
                      ? "Drawing or flowchart"
                      : "Note image")
                  }
                  onLoad={(event) => {
                    const image = event.currentTarget;
                    if (
                      !item.fitted &&
                      !gesture.current &&
                      image.naturalWidth
                    ) {
                      const ratio = image.naturalHeight / image.naturalWidth;
                      const width = Math.min(
                        item.width,
                        (item.kind === "drawing" ? 220 : 200) /
                          Math.max(0.01, ratio),
                      );
                      const height = Math.max(12, width * ratio);
                      update(item.id, {
                        width: Math.max(12, width),
                        height,
                        fitted: true,
                      });
                    }
                  }}
                  onDoubleClick={() =>
                    item.kind === "drawing" && onDrawing(item.drawingId!)
                  }
                />
              ) : (
                <RichEditor
                  ref={(handle) => {
                    if (handle) textEditors.current.set(item.id, handle);
                    else textEditors.current.delete(item.id);
                  }}
                  compact
                  value={item.text || ""}
                  onChange={(text) => update(item.id, { text })}
                  onCommand={onCommand || (() => {})}
                  onUpload={onUpload}
                  onReady={(editor) => {
                    const measure = () => {
                      const needed = Math.ceil(
                        editor.view.dom.scrollHeight / Math.max(0.2, scale) +
                          36,
                      );
                      const saved = latest.current.items.find(
                        (entry) => entry.id === item.id,
                      );
                      if (saved && needed > saved.height + 3)
                        update(item.id, { height: needed });
                    };
                    editor.on("update", measure);
                  }}
                />
              )}
              {selected === item.id && (
                <button
                  className="object-resize"
                  aria-label="Resize object"
                  onPointerDown={(event) => drag(event, item, "resize")}
                />
              )}
            </div>
          );
        })}
      </div>
      {(scene.items.length > 0 || tool !== "write") && (
        <button
          className="extend-sheet"
          onClick={() => commit({ ...scene, height: scene.height + 300 })}
        >
          <Plus size={14} /> More paper
        </button>
      )}
    </section>
  );
});
