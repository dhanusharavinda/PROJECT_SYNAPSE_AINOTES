import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
  type PointerEvent as Pointer,
} from "react";
import {
  ArrowUpRight,
  Circle,
  Diamond,
  Eraser,
  Grip,
  ImagePlus,
  MousePointer2,
  PenLine,
  PaintBucket,
  Redo2,
  Square,
  Table2,
  Triangle,
  Type,
  Undo2,
  Minus,
  ChevronDown,
  Trash2,
  Copy,
  Sun,
  Moon,
  FileText,
  RotateCw,
  Focus,
  Pin,
  MoreHorizontal,
} from "lucide-react";
import RadialMenu from "./RadialMenu";
import { appendDiagram } from "./diagramCanvas";
import type { Diagram } from "./diagramDesign";
import { regionOnSheet } from "./paintBucket";
import { penWeight } from "./penStroke";
import type { CanvasItem, NoteCanvas } from "./types";
import { fileUrl, mediaUrl } from "./api";
import RichEditor, { type EditorHandle } from "./RichEditor";
import { keyCombination, usePreferences, savePreferences } from "./preferences";
import { storageMarkdown } from "./markdown";
import { copyText, readClipboard } from "./clipboard";
import type { Editor as CoreEditor } from "@tiptap/core";
import SheetShape from "./SheetShape";
import VideoCard from "./VideoCard";
import VideoPasteMenu from "./VideoPasteMenu";
import { youtubeLink } from "./youtube";
import {
  finishStroke,
  rebaseScene,
  migrateScene,
  resizeItem,
  resizeGroup,
  sameScene,
  shapeKinds,
  eraseStrokes,
  translate,
  type Point,
} from "./sheetModel";
type Tool =
  | "write"
  | "select"
  | "pen"
  | "eraser"
  | "arrow"
  | "rectangle"
  | "ellipse"
  | "diamond"
  | "triangle"
  | "line"
  | "text"
  | "table"
  | "bucket";
export interface SheetHandle {
  diagram: (diagram: Diagram) => void;
  tool: (tool: Tool) => void;
  image: (src: string, alt: string) => void;
  drawing: (id: string) => void;
  video: (url: string, label: string) => void;
  editor: () => EditorHandle | null;
  block: (kind: "table" | "text", markdown: string) => void;
}
type Gesture = {
  type: "move" | "resize" | "rotate" | "draw" | "erase" | "select";
  origin: NoteCanvas;
  start: Point;
  last: Point;
  ids: string[];
  rect: { left: number; top: number };
  kind?: Tool;
  lastTime?: number;
  pointerId?: number;
};
const empty: NoteCanvas = { items: [], height: 500 },
  tableText =
    "| Topic | Explanation |\n| --- | --- |\n| Idea | Write here |\n| Example | Write here |";
let copiedItems: CanvasItem[] = [];
let copiedProse = "";
let copiedPlain = "";
function imageSource(src = "") {
  const local = src.replace(/^\.\.\/(attachments|drawings)\//, "/files/$1/");
  return /^\/files\/(attachments|drawings)\/[-a-zA-Z0-9]+\.[a-zA-Z0-9]+(?:\?.*)?$/.test(
    local,
  )
    ? mediaUrl(local)
    : "";
}
export default forwardRef<
  SheetHandle,
  {
    value?: NoteCanvas;
    peers?: { cell: string; name: string; color: string }[];
    onChange: (value: NoteCanvas) => void;
    onDrawing: (id: string) => void;
    onImage: () => void;
    onCommand?: (cmd: string) => void;
    onUpload?: (file: File) => void;
    children: ReactNode;
  }
>(function NotebookSheet(
  {
    value,
    onChange,
    onDrawing,
    onImage,
    onCommand,
    onUpload,
    children,
    peers = [],
  },
  ref,
) {
  const [scene, setScene] = useState<NoteCanvas>(value || empty),
    latest = useRef(scene),
    sent = useRef(value),
    received = useRef(value);
  const change = useRef(onChange);
  change.current = onChange;
  const [tool, setTool] = useState<Tool>("write"),
    [selected, setSelected] = useState<string[]>([]),
    [color, setColor] = useState("#24392f"),
    [size, setSize] = useState(2.4);
  const [menu, setMenu] = useState<{
      x: number;
      y: number;
      keyboard?: boolean;
    }>(),
    [shapes, setShapes] = useState(false),
    [arrows, setArrows] = useState(false),
    [studyLens, setStudyLens] = useState(false),
    [resizing, setResizing] = useState(false),
    [activeGesture, setActiveGesture] = useState(false),
    [marquee, setMarquee] = useState<{
      x: number;
      y: number;
      width: number;
      height: number;
    }>();
  const root = useRef<HTMLDivElement>(null),
    gesture = useRef<Gesture | undefined>(undefined),
    history = useRef<{ before: NoteCanvas; after: NoteCanvas }[]>([]),
    future = useRef<{ before: NoteCanvas; after: NoteCanvas }[]>([]);
  const [fill, setFill] = useState(false),
    [highlighter, setHighlighter] = useState(false);
  const pasteTarget = useRef<HTMLTextAreaElement>(null);
  const [pendingVideo, setPendingVideo] = useState<{
    url: string;
    x: number;
    y: number;
  }>();
  const editors = useRef(new Map<string, EditorHandle>()),
    pref = usePreferences(),
    active = useRef(false),
    [drawingVersion, setDrawingVersion] = useState(0);
  const [viewWidth, setViewWidth] = useState(1000);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const scroller = useRef<HTMLDivElement>(null);
  const pan = useRef<
    { x: number; y: number; left: number; top: number } | undefined
  >(undefined);
  const [arrowStyle, setArrowStyle] =
    useState<NonNullable<CanvasItem["arrowStyle"]>>("straight");
  const zoomFrame = useRef<number | undefined>(undefined);
  const wheelBatch = useRef<
    { delta: number; x: number; y: number } | undefined
  >(undefined);
  const zoomAnchor = useRef<
    { x: number; y: number; logicalX: number; logicalY: number } | undefined
  >(undefined);
  useLayoutEffect(() => {
    zoomRef.current = zoom;
    const anchor = zoomAnchor.current,
      el = scroller.current,
      page = root.current;
    if (anchor && el && page) {
      const rect = page.getBoundingClientRect();
      el.scrollLeft += rect.left + anchor.logicalX * zoom - anchor.x;
      el.scrollTop += rect.top + anchor.logicalY * zoom - anchor.y;
      zoomAnchor.current = undefined;
    }
  }, [zoom]);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      if (gesture.current || pan.current) return;
      const unit =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? Math.max(200, el.clientHeight)
            : 1;
      const delta = Math.max(-120, Math.min(120, event.deltaY * unit));
      wheelBatch.current = {
        delta: (wheelBatch.current?.delta || 0) + delta,
        x: event.clientX,
        y: event.clientY,
      };
      if (zoomFrame.current !== undefined) return;
      zoomFrame.current = requestAnimationFrame(() => {
        zoomFrame.current = undefined;
        const batch = wheelBatch.current,
          page = root.current;
        wheelBatch.current = undefined;
        if (!batch || !page) return;
        const old = zoomRef.current;
        const next = Math.max(
          0.25,
          Math.min(3, old * Math.exp(-batch.delta * 0.0015)),
        );
        if (next === old) return;
        const rect = page.getBoundingClientRect();
        zoomAnchor.current = {
          x: batch.x,
          y: batch.y,
          logicalX: (batch.x - rect.left) / old,
          logicalY: (batch.y - rect.top) / old,
        };
        setZoom(next);
      });
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", wheel);
      if (zoomFrame.current !== undefined)
        cancelAnimationFrame(zoomFrame.current);
    };
  }, []);
  const [theme, setTheme] = useState(
    document.documentElement.dataset.theme || "light",
  );
  useEffect(() => {
    const update = () =>
      setTheme(document.documentElement.dataset.theme || "light");
    window.addEventListener("synapse:theme", update);
    return () => window.removeEventListener("synapse:theme", update);
  }, []);
  useEffect(() => {
    let live = true;
    const measure = () => {
      if (
        !live ||
        !root.current ||
        document.documentElement.dataset.theme !== "paper"
      )
        return;
      const editor = root.current.querySelector<HTMLElement>(".note-editor");
      if (!editor) return;
      const computed = getComputedStyle(editor),
        probe = document.createElement("div"),
        marker = document.createElement("span");
      probe.style.cssText =
        "position:absolute;visibility:hidden;pointer-events:none;white-space:nowrap;padding:0;margin:0;";
      probe.style.font = computed.font;
      probe.style.lineHeight = "32px";
      marker.style.cssText =
        "display:inline-block;width:0;height:0;padding:0;margin:0;vertical-align:baseline";
      probe.append("Ag", marker);
      root.current.append(probe);
      const baseline =
        marker.getBoundingClientRect().top - probe.getBoundingClientRect().top;
      probe.remove();
      root.current.style.setProperty("--rule-position", baseline - 31 + "px");
    };
    void document.fonts?.ready.then(measure);
    measure();
    window.addEventListener("synapse:theme", measure);
    return () => {
      live = false;
      window.removeEventListener("synapse:theme", measure);
    };
  }, [pref.font]);
  const fullSelection = useRef(false),
    proseHistory = useRef(new WeakMap<NoteCanvas, string>());
  function prose() {
    return (
      root.current?.querySelector(".sheet-prose .tiptap") as
        (HTMLElement & { editor?: CoreEditor }) | null
    )?.editor;
  }
  useEffect(() => {
    if (!scroller.current) return;
    const observer = new ResizeObserver(() =>
      setViewWidth(scroller.current?.clientWidth || 1000),
    );
    observer.observe(scroller.current);
    setViewWidth(scroller.current.clientWidth || 1000);
    return () => observer.disconnect();
  }, []);
  const paint = useRef<number | undefined>(undefined),
    queued = useRef<NoteCanvas | undefined>(undefined);
  useEffect(() => {
    const update = () => setDrawingVersion(Date.now());
    window.addEventListener("synapse:drawing-saved", update);
    return () => {
      window.removeEventListener("synapse:drawing-saved", update);
      if (paint.current) cancelAnimationFrame(paint.current);
    };
  }, []);
  useEffect(() => {
    if (!value || sameScene(value, received.current)) return;
    received.current = value;
    if (
      gesture.current ||
      sameScene(value, sent.current) ||
      sameScene(value, latest.current)
    )
      return;
    latest.current = value;
    setScene(value);
  }, [value]);
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (!(e.target as HTMLElement)?.closest?.(".sheet-context"))
        setMenu(undefined);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);
  function preview(next: NoteCanvas) {
    latest.current = next;
    queued.current = next;
    if (!paint.current)
      paint.current = requestAnimationFrame(() => {
        paint.current = undefined;
        if (queued.current) setScene(queued.current);
      });
  }
  function commit(next: NoteCanvas, previous = latest.current, force = false) {
    next = {
      ...next,
      width: Math.max(
        next.width || 0,
        root.current?.clientWidth || 0,
        ...next.items.map((i) => i.x + i.width),
      ),
    };
    if (sameScene(next, previous) && !force) return;
    if (paint.current) cancelAnimationFrame(paint.current);
    paint.current = undefined;
    queued.current = undefined;
    history.current = [
      ...history.current.slice(-99),
      { before: previous, after: next },
    ];
    future.current = [];
    latest.current = next;
    sent.current = next;
    setScene(next);
    change.current(next);
  }
  function emit(next: NoteCanvas) {
    if (proseHistory.current.has(next)) {
      const editor = prose();
      if (editor) {
        proseHistory.current.set(latest.current, editor.getMarkdown());
        editor.commands.setContent(proseHistory.current.get(next) || "", {
          contentType: "markdown",
        });
      }
    }
    if (paint.current) cancelAnimationFrame(paint.current);
    paint.current = undefined;
    queued.current = undefined;
    latest.current = next;
    sent.current = next;
    setScene(next);
    change.current(next);
    setSelected([]);
  }
  function undo() {
    const frame = history.current.pop();
    if (!frame) return;
    const current = latest.current,
      { scene: next, conflicts } = rebaseScene(
        current,
        frame.after,
        frame.before,
      );
    if (proseHistory.current.has(frame.before))
      proseHistory.current.set(next, proseHistory.current.get(frame.before)!);
    future.current.push({ before: next, after: current });
    emit(next);
    if (conflicts)
      window.dispatchEvent(
        new CustomEvent("synapse:notice", {
          detail:
            "An object changed since your action, so undo kept its newer version.",
        }),
      );
  }
  function redo() {
    const frame = future.current.pop();
    if (!frame) return;
    const current = latest.current,
      { scene: next, conflicts } = rebaseScene(
        current,
        frame.before,
        frame.after,
      );
    if (proseHistory.current.has(frame.after))
      proseHistory.current.set(next, proseHistory.current.get(frame.after)!);
    history.current.push({ before: current, after: next });
    emit(next);
    if (conflicts)
      window.dispatchEvent(
        new CustomEvent("synapse:notice", {
          detail:
            "An object changed since undo, so redo kept its newer version.",
        }),
      );
  }
  function focus() {
    active.current = true;
    (document.activeElement as HTMLElement)?.blur?.();
    root.current?.focus({ preventScroll: true });
  }
  function base() {
    return latest.current.width
      ? latest.current
      : migrateScene(
          latest.current,
          Math.max(300, root.current?.clientWidth || 1000),
        );
  }
  function at(e: { clientX: number; clientY: number }): Point {
    const rect = root.current!.getBoundingClientRect();
    return [
      Math.max(0, (e.clientX - rect.left) / zoomRef.current),
      Math.max(0, (e.clientY - rect.top) / zoomRef.current),
    ];
  }
  function update(id: string, patch: Partial<CanvasItem>) {
    if (gesture.current) return;
    const before = latest.current,
      items = before.items.map((i) => (i.id === id ? { ...i, ...patch } : i));
    commit({
      ...before,
      items,
      height: Math.max(before.height, ...items.map((i) => i.y + i.height + 32)),
    });
  }
  function add(item: Omit<CanvasItem, "id">, focusText = false) {
    const before = latest.current,
      next = base(),
      id = crypto.randomUUID(),
      placed = { ...item, id };
    commit(
      {
        ...next,
        items: [...next.items, placed],
        height: Math.max(next.height, placed.y + placed.height + 80),
      },
      before,
    );
    setSelected([id]);
    setTool("write");
    active.current = true;
    if (focusText)
      setTimeout(() => {
        editors.current.get(id)?.getEditor()?.commands.focus("start");
      }, 0);
    return id;
  }
  function place() {
    const next = base(),
      node = root.current?.querySelector(".sheet-prose .tiptap"),
      rect = root.current?.getBoundingClientRect();
    return {
      x: 24,
      y: Math.max(
        20,
        node && rect
          ? (node.getBoundingClientRect().bottom - rect.top) / zoomRef.current +
              20
          : 20,
        ...next.items.map((i) => i.y + i.height + 16),
      ),
    };
  }
  function remove(ids = selected) {
    const all = fullSelection.current;
    if (all) {
      const editor = prose();
      if (editor) {
        proseHistory.current.set(latest.current, editor.getMarkdown());
        editor.commands.clearContent();
      }
      fullSelection.current = false;
    }
    commit(
      {
        ...latest.current,
        items: latest.current.items.filter((i) => !ids.includes(i.id)),
      },
      latest.current,
      all,
    );
    setSelected([]);
    setMenu(undefined);
    focus();
  }
  async function copy() {
    copiedProse = fullSelection.current ? prose()?.getMarkdown() || "" : "";
    copiedItems = latest.current.items
      .filter((i) => selected.includes(i.id))
      .map((i) => structuredClone(i));
    copiedPlain = [
      copiedProse,
      ...copiedItems.map((item) =>
        item.kind === "text" || item.kind === "table"
          ? item.text || ""
          : item.kind === "video"
            ? `[${item.text || "YouTube video"}](${item.src})`
            : item.kind === "image"
              ? `![${item.text || "Image"}](${item.src})`
              : item.kind === "drawing"
                ? `![Drawing](../drawings/${item.drawingId}.svg)`
                : `[${item.kind === "pen" ? "Drawing" : item.kind}]`,
      ),
    ]
      .filter(Boolean)
      .join("\n\n");
    copiedPlain = copiedPlain
      .replace(/^:::option\s+\{"label":"([^"]*)"\}\s*$/gm, (_match, label) =>
        label ? "**" + label + "**" : "",
      )
      .replace(/^:::(?:variants|endvariants|endoption)\s*$/gm, "");
    copiedPlain = copiedPlain.replace(/\r\n/g, "\n");
    await copyText(copiedPlain);
  }
  async function paste(provided?: string) {
    let items = copiedItems;
    let text = copiedProse;
    try {
      const clipboard = (
        provided === undefined ? await readClipboard() : provided
      ).replace(/\r\n/g, "\n");
      if (clipboard !== copiedPlain) {
        if (youtubeLink(clipboard)) {
          const rect = root.current!.getBoundingClientRect();
          setPendingVideo({
            url: clipboard,
            x: Math.max(8, Math.min(rect.left + 24, innerWidth - 310)),
            y: Math.max(8, Math.min(rect.top + 30, innerHeight - 260)),
          });
          return;
        }
        if (clipboard)
          add(
            {
              kind: "text",
              text: clipboard.slice(0, 200000),
              ...place(),
              width: 360,
              height: 60,
            },
            true,
          );
        return;
      }
    } catch {
      return;
    }
    if (!items.length && !text) return;
    const before = latest.current,
      next = base(),
      clones = items.map((i) => ({
        ...i,
        id: crypto.randomUUID(),
        x: i.x + 24,
        y: i.y + 24,
      }));
    if (text) {
      const editor = prose();
      if (editor) {
        proseHistory.current.set(before, editor.getMarkdown());
        editor.commands.setContent(editor.getMarkdown() + "\n\n" + text, {
          contentType: "markdown",
        });
      }
    }
    commit(
      {
        ...next,
        items: [...next.items, ...clones],
        height: Math.max(
          next.height,
          ...clones.map((i) => i.y + i.height + 40),
        ),
      },
      before,
      !!text,
    );
    setSelected(clones.map((i) => i.id));
    focus();
  }
  function duplicate() {
    const before = latest.current,
      clones = before.items
        .filter((i) => selected.includes(i.id))
        .map((i) => ({
          ...structuredClone(i),
          id: crypto.randomUUID(),
          x: i.x + 20,
          y: i.y + 20,
        }));
    commit({ ...before, items: [...before.items, ...clones] });
    setSelected(clones.map((i) => i.id));
    setMenu(undefined);
  }
  function choose(next: Tool) {
    fullSelection.current = false;
    setTool(next);
    setMenu(undefined);
    setShapes(false);
    setArrows(false);
    setSelected([]);
    setResizing(false);
    focus();
  }
  useImperativeHandle(ref, () => ({
    diagram: (diagram) => {
      const before = latest.current;
      const next = appendDiagram(before, diagram);
      const added = next.items.slice(before.items.length);
      commit(next);
      setSelected(added.map((item) => item.id));
      setTool("select");
      requestAnimationFrame(() => {
        focus();
        root.current
          ?.querySelector<HTMLElement>(`[data-object-id="${added[0]?.id}"]`)
          ?.scrollIntoView({ block: "center", inline: "nearest" });
      });
    },
    tool: choose,
    image: (src, text) =>
      add({
        kind: "image",
        src: storageMarkdown(src),
        text,
        ...place(),
        width: 240,
        height: 180,
      }),
    drawing: (drawingId) =>
      add({ kind: "drawing", drawingId, ...place(), width: 280, height: 210 }),
    video: (src, text) =>
      add({ kind: "video", src, text, ...place(), width: 280, height: 210 }),
    editor: () =>
      selected.length === 1 ? editors.current.get(selected[0]) || null : null,
    block: (kind, text) =>
      add(
        {
          kind,
          text,
          ...place(),
          width: kind === "table" ? 420 : 320,
          height: kind === "table" ? 180 : 100,
        },
        true,
      ),
  }));
  function perform(action: string, event: Event) {
    if (document.querySelector('[role="dialog"]')) return;
    const editing = !!(document.activeElement as HTMLElement)?.closest(
      "input,textarea,[contenteditable=true]",
    );
    const toolMap: Record<string, Tool> = {
      draw: "pen",
      eraser: "eraser",
      select: "select",
      write: "write",
      text: "text",
      arrow: "arrow",
      rectangle: "rectangle",
      ellipse: "ellipse",
      diamond: "diamond",
      triangle: "triangle",
      line: "line",
      table: "table",
    };
    if (toolMap[action]) {
      event.preventDefault();
      choose(toolMap[action]);
      return;
    }
    if (editing || !active.current) return;
    if (action === "undo") {
      event.preventDefault();
      undo();
    } else if (action === "redo") {
      event.preventDefault();
      redo();
    } else if (action === "select-all") {
      event.preventDefault();
      fullSelection.current = true;
      setSelected(latest.current.items.map((i) => i.id));
      setTool("select");
    } else if (
      action === "delete" &&
      (selected.length || fullSelection.current)
    ) {
      event.preventDefault();
      remove();
    } else if (
      action === "copy" &&
      (selected.length || fullSelection.current)
    ) {
      event.preventDefault();
      void copy();
    } else if (action === "cut" && (selected.length || fullSelection.current)) {
      event.preventDefault();
      void copy().then(() => remove());
    } else if (action === "paste") {
      pasteTarget.current?.focus({ preventScroll: true });
      if (
        event instanceof KeyboardEvent &&
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "v"
      )
        return;
      event.preventDefault();
      if (window.synapseEditing?.readClipboard)
        void paste().finally(() => focus());
      else if (window.synapseEditing) window.synapseEditing.native("paste");
      else
        void paste().finally(() => {
          if (document.activeElement === pasteTarget.current) focus();
        });
    } else if (action === "duplicate" && selected.length) {
      event.preventDefault();
      duplicate();
    }
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented || document.querySelector('[role="dialog"]'))
        return;
      const editing = !!(e.target as HTMLElement).closest(
        "input,textarea,[contenteditable=true]",
      );
      if (e.key === "Escape") {
        setMenu(undefined);
        setShapes(false);
        choose("write");
        return;
      }
      const custom = Object.entries(pref.shortcuts).find(
        ([, key]) => key && key === keyCombination(e),
      )?.[0];
      if (custom && (!editing || e.ctrlKey || e.altKey || e.metaKey)) {
        perform(custom, e);
        if (e.defaultPrevented) return;
      }
      if (editing) return;
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const map: Record<string, string> = {
          z: e.shiftKey ? "redo" : "undo",
          y: "redo",
          a: "select-all",
          c: "copy",
          x: "cut",
          v: "paste",
          d: "duplicate",
        };
        if (map[e.key.toLowerCase()]) perform(map[e.key.toLowerCase()], e);
      }
      if (["Delete", "Backspace"].includes(e.key)) perform("delete", e);
      if (selected.length && /^Arrow/.test(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1,
          dx =
            e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0,
          dy = e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0;
        commit({
          ...latest.current,
          items: translate(latest.current.items, selected, dx, dy),
        });
      }
    };
    const command = (e: Event) => {
      if (!e.defaultPrevented) perform((e as CustomEvent).detail, e);
    };
    window.addEventListener("keydown", key, true);
    window.addEventListener("synapse:action", command);
    return () => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("synapse:action", command);
    };
  });
  function begin(
    e: Pointer,
    type: Gesture["type"],
    ids: string[] = selected,
    kind?: Tool,
  ) {
    e.preventDefault();
    e.stopPropagation();
    focus();
    setMenu(undefined);
    const rect = root.current!.getBoundingClientRect(),
      point = at(e),
      origin = latest.current,
      next = base();
    gesture.current = {
      type,
      origin,
      start: point,
      last: point,
      ids,
      rect: { left: rect.left, top: rect.top },
      kind,
      lastTime: e.timeStamp,
      pointerId: e.pointerId,
    };
    if (next !== origin) preview(next);
    root.current?.setPointerCapture(e.pointerId);
    setActiveGesture(true);
    if (document.body.classList.contains("tablet-mode"))
      window.dispatchEvent(
        new CustomEvent("synapse:pen-active", { detail: true }),
      );
    return point;
  }
  function start(e: Pointer) {
    if (gesture.current) return;
    if (
      document.body.classList.contains("tablet-mode") &&
      e.pointerType === "touch" &&
      ["pen", "eraser", "write"].includes(tool) &&
      !(e.target as HTMLElement).closest(".tablet-finger")
    )
      return;
    if (
      e.button !== 0 ||
      (e.target as HTMLElement).closest(
        "button,input,.context-menu,.slash-menu,.sheet-context,iframe",
      )
    )
      return;
    if (tool === "bucket") {
      e.preventDefault();
      e.stopPropagation();
      const existing = (e.target as HTMLElement).closest<HTMLElement>(
        ".kind-paint",
      )?.dataset.objectId;
      if (existing) {
        update(existing, { color });
        return;
      }
      const [x, y] = at(e);
      void regionOnSheet(root.current!, x, y)
        .then((region) => {
          const next = {
            ...base(),
            items: [
              {
                id: crypto.randomUUID(),
                kind: "paint" as const,
                x: region.x,
                y: region.y,
                width: region.width,
                height: region.height,
                text: region.path,
                points: [[region.width, region.height] as [number, number]],
                color,
              },
              ...base().items,
            ],
          };
          commit(next);
        })
        .catch((error) => {
          window.dispatchEvent(
            new CustomEvent("synapse:notice", { detail: error.message }),
          );
        });
      return;
    }
    if (tool === "select") {
      if ((e.target as HTMLElement).closest(".sheet-object")) return;
      begin(e, "select", []);
      setSelected([]);
      return;
    }
    if (tool === "write" || tool === "text" || tool === "table") {
      if (
        (e.target as HTMLElement).closest(
          ".sheet-object.kind-text,.sheet-object.kind-table,[contenteditable=true] a",
        )
      )
        return;
      if (
        tool === "write" &&
        (e.target as HTMLElement).closest(
          ".sheet-object:not(.kind-text),.variant-controls,.variant-label-row,.code-toolbar,.inline-drawing,.notebook-image,pre,table,a",
        )
      )
        return;
      if (tool === "write") {
        const target = e.target as HTMLElement,
          editable = target.closest("[contenteditable=true]");
        if (editable) {
          const block = target.closest("p,h1,h2,h3,li,blockquote") || editable;
          const range = document.createRange();
          range.selectNodeContents(block);
          const hit = [...range.getClientRects()].some(
            (rect) =>
              e.clientX >= rect.left - 3 &&
              e.clientX <= rect.right + 3 &&
              e.clientY >= rect.top - 4 &&
              e.clientY <= rect.bottom + 4,
          );
          if (
            hit ||
            (!block.textContent?.trim() &&
              e.clientX - block.getBoundingClientRect().left < 14)
          )
            return;
        }
      }
      const point = at(e);
      e.preventDefault();
      e.stopPropagation();
      add(
        {
          kind: tool === "table" ? "table" : "text",
          x: point[0],
          y:
            document.documentElement.dataset.theme === "paper" &&
            tool !== "table"
              ? Math.floor(point[1] / 32) * 32
              : point[1],
          width:
            tool === "table"
              ? 420
              : Math.max(
                  80,
                  Math.min(
                    360,
                    (root.current?.clientWidth || 1000) - point[0] - 8,
                  ),
                ),
          height: tool === "table" ? 180 : 40,
          text: tool === "table" ? tableText : "",
        },
        true,
      );
      return;
    }
    if (tool === "eraser") {
      const point = begin(e, "erase", []);
      erase(point, point);
      return;
    }
    const point = begin(e, "draw", [], tool),
      id = crypto.randomUUID();
    gesture.current!.ids = [id];
    preview({
      ...latest.current,
      items: [
        ...latest.current.items,
        {
          id,
          kind: tool as CanvasItem["kind"],
          x: point[0],
          y: point[1],
          width: 1,
          height: 1,
          color,
          strokeWidth: size,
          fill: fill ? color : "none",
          opacity: highlighter && tool === "pen" ? 0.32 : 1,
          arrowStyle: tool === "arrow" ? arrowStyle : undefined,
          points: [[0, 0]],
          pressures: [1],
        },
      ],
    });
    setSelected([]);
  }
  function erase(a: Point, b: Point) {
    preview({
      ...latest.current,
      items: eraseStrokes(latest.current.items, a, b, 10),
    });
  }
  function move(e: Pointer) {
    const g = gesture.current;
    if (!g) return;
    if (g.pointerId !== undefined && g.pointerId !== e.pointerId) return;
    const point = at(e),
      dx = point[0] - g.start[0],
      dy = point[1] - g.start[1];
    if (g.type === "select") {
      const box = {
        x: Math.min(point[0], g.start[0]),
        y: Math.min(point[1], g.start[1]),
        width: Math.abs(dx),
        height: Math.abs(dy),
      };
      setMarquee(box);
      setSelected(
        latest.current.items
          .filter(
            (i) =>
              i.x >= box.x &&
              i.y >= box.y &&
              i.x + i.width <= box.x + box.width &&
              i.y + i.height <= box.y + box.height,
          )
          .map((i) => i.id),
      );
      return;
    }
    if (g.type === "erase") {
      erase(g.last, point);
      g.last = point;
      return;
    }
    const origin = migrateScene(g.origin, latest.current.width || 1000);
    let items = latest.current.items;
    if (g.type === "move") items = translate(origin.items, g.ids, dx, dy);
    else if (g.type === "rotate")
      items = origin.items.map((i) => {
        if (!g.ids.includes(i.id)) return i;
        const cx = i.x + i.width / 2,
          cy = i.y + i.height / 2;
        const angle =
          ((Math.atan2(point[1] - cy, point[0] - cx) -
            Math.atan2(g.start[1] - cy, g.start[0] - cx)) *
            180) /
          Math.PI;
        return { ...i, rotation: (i.rotation || 0) + angle };
      });
    else if (g.type === "resize")
      items =
        g.ids.length > 1
          ? resizeGroup(origin.items, g.ids, dx, dy)
          : origin.items.map((i) =>
              g.ids.includes(i.id) ? resizeItem(i, dx, dy) : i,
            );
    else
      items = items.map((i) => {
        if (i.id !== g.ids[0]) return i;
        const strokeRect = root.current!.getBoundingClientRect(),
          coalesced = e.nativeEvent.getCoalescedEvents?.(),
          samples = coalesced?.length ? coalesced : [e.nativeEvent],
          pressures = [...(i.pressures || [1])],
          points =
            g.kind === "pen"
              ? [
                  ...(i.points || []),
                  ...samples.map((sample) => {
                    const p: Point = [
                      (sample.clientX - strokeRect.left) / zoomRef.current -
                        g.start[0],
                      (sample.clientY - strokeRect.top) / zoomRef.current -
                        g.start[1],
                    ];
                    const last = g.last;
                    const absolute: Point = [
                      p[0] + g.start[0],
                      p[1] + g.start[1],
                    ];
                    pressures.push(
                      sample.pointerType === "pen" && sample.pressure > 0
                        ? Math.max(
                            0.7,
                            Math.min(1.3, 0.7 + sample.pressure * 0.6),
                          )
                        : penWeight(
                            Math.hypot(
                              absolute[0] - last[0],
                              absolute[1] - last[1],
                            ),
                            sample.timeStamp - (g.lastTime || sample.timeStamp),
                            pressures.at(-1),
                          ),
                    );
                    g.last = absolute;
                    g.lastTime = sample.timeStamp;
                    return p;
                  }),
                ].slice(-15000)
              : ([
                  [0, 0],
                  [dx, dy],
                ] as Point[]);
        return {
          ...i,
          points,
          pressures: g.kind === "pen" ? pressures.slice(-15000) : undefined,
          width: Math.max(1, Math.abs(dx)),
          height: Math.max(1, Math.abs(dy)),
        };
      });
    preview({
      ...latest.current,
      items,
      height: Math.max(
        latest.current.height,
        point[1] + 60,
        ...items.map((i) => i.y + i.height + 40),
      ),
    });
    g.last = point;
  }
  function end(e: Pointer) {
    const g = gesture.current;
    if (!g) return;
    if (g.pointerId !== undefined && g.pointerId !== e.pointerId) return;
    if (
      g.type === "draw" &&
      Math.hypot(at(e)[0] - g.last[0], at(e)[1] - g.last[1]) > 0.5
    )
      move(e);
    let next = latest.current;
    if (g.type === "draw")
      next = {
        ...next,
        items: next.items.map((i) => (i.id === g.ids[0] ? finishStroke(i) : i)),
      };
    gesture.current = undefined;
    setActiveGesture(false);
    if (document.body.classList.contains("tablet-mode"))
      window.dispatchEvent(
        new CustomEvent("synapse:pen-active", { detail: false }),
      );
    setMarquee(undefined);
    if (g.type !== "select") commit(next, g.origin);
    if (root.current?.hasPointerCapture(e.pointerId))
      root.current.releasePointerCapture(e.pointerId);
  }
  function objectDown(e: Pointer, item: CanvasItem) {
    if (gesture.current) return;
    if (
      document.body.classList.contains("tablet-mode") &&
      e.pointerType === "touch" &&
      tool !== "select" &&
      !(e.target as HTMLElement).closest(".tablet-finger")
    )
      return;
    if (e.button !== 0 || !["write", "select"].includes(tool)) return;
    if (
      tool === "write" &&
      (e.target as HTMLElement).closest("a,button,iframe,video")
    )
      return;
    fullSelection.current = false;
    if (e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      setSelected((ids) =>
        ids.includes(item.id)
          ? ids.filter((id) => id !== item.id)
          : [...ids, item.id],
      );
      return;
    }
    const ids = selected.includes(item.id) ? selected : [item.id];
    setSelected(ids);
    active.current = true;
    if (tool === "select") begin(e, "move", ids);
  }
  const selectedItems = scene.items.filter((i) => selected.includes(i.id)),
    item = selectedItems.length === 1 ? selectedItems[0] : undefined;
  const tools = [
      ["write", "Write", Type],
      ["select", "Select", MousePointer2],
      ["pen", "Pen", PenLine],
      ["arrow", "Arrow", ArrowUpRight],
      ["eraser", "Eraser", Eraser],
      ["bucket", "Paint bucket", PaintBucket],
    ] as const,
    shapeTools = [
      ["rectangle", "Rectangle", Square],
      ["ellipse", "Ellipse", Circle],
      ["diamond", "Diamond", Diamond],
      ["triangle", "Triangle", Triangle],
      ["line", "Line", Minus],
    ] as const;
  return (
    <section
      className={`notebook-sheet clean-sheet font-${pref.font}`}
      aria-label="Notebook sheet"
    >
      {pendingVideo && (
        <VideoPasteMenu
          x={pendingVideo.x}
          y={pendingVideo.y}
          url={pendingVideo.url}
          onChoose={(mode, label) => {
            const url = youtubeLink(pendingVideo.url)!.url;
            const title = label.trim() || "YouTube video";
            if (mode === "thumbnail")
              add({
                kind: "video",
                src: url,
                text: title,
                ...place(),
                width: 280,
                height: 210,
              });
            else
              add(
                {
                  kind: "text",
                  text:
                    mode === "link"
                      ? url
                      : `[${title.replace(/[\[\]\\]/g, "")}](${url})`,
                  ...place(),
                  width: 360,
                  height: 60,
                },
                true,
              );
            setPendingVideo(undefined);
            if (mode === "thumbnail") focus();
          }}
        />
      )}
      <textarea
        ref={pasteTarget}
        tabIndex={-1}
        className="sheet-clipboard"
        aria-label="Paste into note"
        value=""
        onChange={() => {}}
        onPaste={(event) => {
          event.preventDefault();
          void paste(event.clipboardData.getData("text/plain")).finally(() => {
            if (document.activeElement === pasteTarget.current) focus();
          });
        }}
      />
      <div className="sheet-toolbar" role="toolbar" aria-label="Notebook tools">
        <div className="sheet-tool-group">
          <button
            aria-label="Reset canvas zoom"
            title="Ctrl+scroll to zoom. Middle mouse to pan."
            onClick={() => {
              if (zoomFrame.current !== undefined)
                cancelAnimationFrame(zoomFrame.current);
              zoomFrame.current = undefined;
              wheelBatch.current = undefined;
              zoomAnchor.current = undefined;
              setZoom(1);
            }}
          >
            {Math.round(zoom * 100)}%
          </button>
          {tools.map(([id, label, Icon]) =>
            id === "arrow" ? (
              <div className="arrow-picker" key={id}>
                <button
                  aria-label="Arrow tool"
                  title="Arrow variants"
                  aria-pressed={tool === "arrow"}
                  aria-haspopup="menu"
                  aria-expanded={arrows}
                  onClick={() => {
                    if (!selectedItems.some((i) => i.kind === "arrow"))
                      choose("arrow");
                    setArrows(!arrows);
                  }}
                >
                  <ArrowSymbol kind={arrowStyle} />
                  <ChevronDown size={8} />
                </button>
                {arrows && (
                  <div
                    className="arrow-choices"
                    role="menu"
                    aria-label="Arrow variants"
                  >
                    {(["straight", "curved", "elbow", "double"] as const).map(
                      (style) => (
                        <button
                          key={style}
                          role="menuitem"
                          aria-label={
                            style.charAt(0).toUpperCase() +
                            style.slice(1) +
                            " arrow"
                          }
                          title={style + " arrow"}
                          onClick={() => {
                            setArrowStyle(style);
                            setArrows(false);
                            if (
                              latest.current.items.some(
                                (i) =>
                                  selected.includes(i.id) && i.kind === "arrow",
                              )
                            )
                              commit({
                                ...latest.current,
                                items: latest.current.items.map((i) =>
                                  selected.includes(i.id) && i.kind === "arrow"
                                    ? { ...i, arrowStyle: style }
                                    : i,
                                ),
                              });
                            else choose("arrow");
                          }}
                        >
                          <ArrowSymbol kind={style} />
                        </button>
                      ),
                    )}
                  </div>
                )}
              </div>
            ) : (
              <button
                key={id}
                aria-label={label + " tool"}
                title={label}
                aria-pressed={tool === id}
                onClick={() => {
                  if (id === "pen") setHighlighter(false);
                  choose(id);
                }}
              >
                <Icon size={17} />
              </button>
            ),
          )}
          <button
            aria-label="Delete selected objects"
            title="Delete selection"
            disabled={!selected.length && !fullSelection.current}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => remove()}
          >
            <Trash2 size={17} />
          </button>
          <button
            aria-label="Pink highlighter"
            title="Pink highlighter"
            onClick={() => {
              choose("pen");
              setHighlighter(true);
              setColor("#ff1493");
              setSize(18);
            }}
          >
            <PenLine size={17} color="#d4006a" />
          </button>
          <button
            aria-label="Green highlighter"
            title="Green highlighter"
            onClick={() => {
              choose("pen");
              setHighlighter(true);
              setColor("#39ff14");
              setSize(18);
            }}
          >
            <PenLine size={17} color="#167d19" />
          </button>
          <button
            aria-label="Fill shapes"
            title="Fill shapes with pen colour"
            aria-pressed={fill}
            onClick={() => {
              setFill(!fill);
              if (selected.length)
                commit({
                  ...latest.current,
                  items: latest.current.items.map((i) =>
                    selected.includes(i.id)
                      ? { ...i, fill: fill ? "none" : color }
                      : i,
                  ),
                });
            }}
          >
            <Square size={17} fill={fill ? color : "none"} />
          </button>
          <div className="shape-picker">
            <button
              aria-label="Shapes"
              title="Shapes"
              aria-expanded={shapes}
              onClick={() => setShapes(!shapes)}
            >
              <Square size={17} />
              <ChevronDown size={10} />
            </button>
            {shapes && (
              <div role="menu" className="shape-choices">
                {shapeTools.map(([id, label, Icon]) => (
                  <button key={id} role="menuitem" onClick={() => choose(id)}>
                    <Icon size={16} />
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            aria-label="Text tool"
            title="Write anywhere"
            onClick={() => choose("text")}
          >
            <Type size={17} />
          </button>
          <button
            aria-label="Table tool"
            title="Table"
            onClick={() => choose("table")}
          >
            <Table2 size={17} />
          </button>
          <button
            aria-label="Add image to sheet"
            title="Image"
            onClick={onImage}
          >
            <ImagePlus size={17} />
          </button>
        </div>
        <div className="sheet-tool-group">
          <button
            aria-label="More canvas actions"
            title="More actions"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setMenu({
                x: r.left,
                y: r.bottom + 180,
                keyboard: e.detail === 0,
              });
            }}
          >
            <MoreHorizontal size={16} />
          </button>
          <button
            aria-label="Study lens"
            title="Study lens: focus selected objects"
            aria-pressed={studyLens}
            onClick={() => setStudyLens(!studyLens)}
          >
            <Focus size={16} />
          </button>
          <button
            aria-label={`Theme: ${theme}. Switch theme`}
            title="Switch theme: Light, Dark, Paper, Dotted"
            onClick={() =>
              window.dispatchEvent(new Event("synapse:cycle-theme"))
            }
          >
            {theme === "dark" ? (
              <Moon size={16} />
            ) : theme === "paper" ? (
              <FileText size={16} />
            ) : (
              <Sun size={16} />
            )}
            <span>{theme.charAt(0).toUpperCase() + theme.slice(1)}</span>
          </button>
          <button
            className="font-cycle"
            aria-label={`Font: ${pref.font === "handwritten" ? "Handwritten" : "Book"}. Switch font`}
            title="Switch between Book and Handwritten"
            onClick={() =>
              savePreferences({
                ...pref,
                font: pref.font === "default" ? "handwritten" : "default",
              })
            }
          >
            <Type size={16} />
            <span>{pref.font === "handwritten" ? "Handwritten" : "Book"}</span>
          </button>
          {(selected.length > 0 || fullSelection.current) &&
            tool === "select" && (
              <>
                <button
                  aria-label="Copy selection"
                  title="Copy selection"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void copy()}
                >
                  <Copy size={16} />
                </button>
                <button
                  aria-label="Delete selection"
                  title="Delete selection"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => remove()}
                >
                  <Trash2 size={16} />
                </button>
              </>
            )}
          <input
            aria-label="Pen color"
            type="color"
            value={color}
            onChange={(e) => {
              setColor(e.target.value);
              if (selected.length)
                commit({
                  ...latest.current,
                  items: latest.current.items.map((i) =>
                    selected.includes(i.id)
                      ? { ...i, color: e.target.value }
                      : i,
                  ),
                });
            }}
          />
          <input
            aria-label="Pen size"
            title="Pen size"
            type="range"
            min="1"
            max="24"
            step="0.5"
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
          />
          <button
            aria-label="Undo"
            title="Undo (Ctrl+Z)"
            disabled={!history.current.length}
            onClick={() => {
              focus();
              undo();
            }}
          >
            <Undo2 size={16} />
          </button>
          <button
            aria-label="Redo"
            title="Redo (Ctrl+Shift+Z or Ctrl+Y)"
            disabled={!future.current.length}
            onClick={() => {
              focus();
              redo();
            }}
          >
            <Redo2 size={16} />
          </button>
        </div>
      </div>
      <div
        className="sheet-scroll"
        ref={scroller}
        onAuxClick={(e) => {
          if (e.button === 1) e.preventDefault();
        }}
        onPointerDownCapture={(e) => {
          if (e.button !== 1) return;
          e.preventDefault();
          e.stopPropagation();
          pan.current = {
            x: e.clientX,
            y: e.clientY,
            left: e.currentTarget.scrollLeft,
            top: e.currentTarget.scrollTop,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
          e.currentTarget.classList.add("is-panning");
        }}
        onPointerMove={(e) => {
          if (!pan.current) return;
          e.preventDefault();
          e.stopPropagation();
          e.currentTarget.scrollLeft =
            pan.current.left - e.clientX + pan.current.x;
          e.currentTarget.scrollTop =
            pan.current.top - e.clientY + pan.current.y;
        }}
        onPointerUp={(e) => {
          if (!pan.current) return;
          pan.current = undefined;
          e.currentTarget.classList.remove("is-panning");
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => {
          pan.current = undefined;
          scroller.current?.classList.remove("is-panning");
        }}
      >
        <div
          ref={root}
          tabIndex={0}
          role="group"
          aria-label="Write and draw on this page"
          className={`notebook-sheet-content tool-${tool}${activeGesture ? " is-gesturing" : ""}`}
          style={{
            zoom,
            width: Math.max(scene.width || 0, viewWidth),
            minWidth: scene.width || undefined,
            minHeight: Math.max(500, scene.height),
          }}
          onPointerDownCapture={(e) => {
            if (tool !== "select") start(e);
          }}
          onPointerDown={(e) => {
            if (tool === "select") start(e);
          }}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={(e) => {
            const g = gesture.current;
            if (g && g.pointerId === e.pointerId) {
              gesture.current = undefined;
              preview(g.origin);
              setActiveGesture(false);
              if (document.body.classList.contains("tablet-mode"))
                window.dispatchEvent(
                  new CustomEvent("synapse:pen-active", { detail: false }),
                );
              setMarquee(undefined);
            }
            if (root.current?.hasPointerCapture(e.pointerId))
              root.current.releasePointerCapture(e.pointerId);
          }}
          onKeyDown={(e) => {
            if (
              (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) &&
              !(e.target as HTMLElement).closest(".editor-wrap")
            ) {
              e.preventDefault();
              e.stopPropagation();
              const r = e.currentTarget.getBoundingClientRect();
              setMenu({
                x: r.left + Math.min(r.width / 2, 300),
                y: Math.max(200, r.top + 150),
                keyboard: true,
              });
            }
          }}
          onFocus={() => {
            active.current = true;
          }}
          onContextMenuCapture={(e) => {
            if (
              tool !== "select" ||
              (!selected.length && !fullSelection.current)
            )
              return;
            e.preventDefault();
            e.stopPropagation();
            focus();
            setMenu({
              x: e.clientX,
              y: e.clientY,
              keyboard: e.clientX === 0 && e.clientY === 0,
            });
          }}
          onPaste={(event) => {
            if ((event.target as HTMLElement).closest("[contenteditable=true]"))
              return;
            event.preventDefault();
            const files = [...event.clipboardData.files];
            if (files.length && onUpload) {
              files.forEach(onUpload);
              return;
            }
            void paste(event.clipboardData.getData("text/plain"));
          }}
          onContextMenu={(e) => {
            if (
              (e.target as HTMLElement).closest(".editor-wrap") &&
              (e.target as HTMLElement).closest(
                ".sheet-object.kind-text,.sheet-object.kind-table,.sheet-prose",
              )
            )
              return;
            e.preventDefault();
            e.stopPropagation();
            focus();
            const id = (e.target as HTMLElement).closest<HTMLElement>(
              ".sheet-object",
            )?.dataset.objectId;
            if (id && !selected.includes(id)) setSelected([id]);
            setMenu({
              x: e.clientX,
              y: e.clientY,
              keyboard: e.clientX === 0 && e.clientY === 0,
            });
          }}
        >
          <div
            className={`sheet-prose${studyLens && selected.length ? " is-lens-dimmed" : ""}`}
          >
            {children}
          </div>
          {scene.items.map((i, index) => {
            const shape = shapeKinds.includes(i.kind);
            const peer = peers.find((p) => p.cell === "item/" + i.id);
            return (
              <div
                key={i.id}
                data-object-id={i.id}
                data-rotation={i.rotation || 0}
                data-peer-name={peer?.name}
                className={`sheet-object ${studyLens && selected.length ? (selected.includes(i.id) ? "is-lens-focused " : "is-lens-dimmed ") : ""}${peer ? "has-peer " : ""}kind-${i.kind}${selected.includes(i.id) ? " is-selected" : ""}${resizing && selected.includes(i.id) ? " is-resizing" : ""}`}
                style={
                  {
                    "--peer-color": peer?.color,
                    "--object-height":
                      (scene.width ? i.height : (i.height * viewWidth) / 1000) +
                      "px",
                    "--tablet-object-width":
                      (scene.width ? i.width : (i.width * viewWidth) / 1000) +
                      "px",
                    "--tablet-object-height":
                      (scene.width ? i.height : (i.height * viewWidth) / 1000) +
                      "px",
                    "--tablet-object-x":
                      (scene.width ? i.x : (i.x * viewWidth) / 1000) + "px",
                    "--tablet-object-y":
                      (scene.width ? i.y : (i.y * viewWidth) / 1000) + "px",
                    "--text-scale": i.textScale || 1,
                    "--object-ink": i.color,
                    left: scene.width ? i.x : i.x / 10 + "%",
                    top: scene.width ? i.y : (i.y * viewWidth) / 1000,
                    width: scene.width ? i.width : i.width / 10 + "%",
                    height: scene.width
                      ? i.height
                      : (i.height * viewWidth) / 1000,
                    transform: `rotate(${i.rotation || 0}deg)`,
                    zIndex:
                      i.kind === "paint" ||
                      (i.kind === "pen" && (i.opacity || 1) < 1)
                        ? 1
                        : index + 3,
                  } as CSSProperties
                }
                onPointerDown={(e) => objectDown(e, i)}
              >
                {i.uncertain && (
                  <button
                    className="object-uncertainty"
                    aria-label="Remove uncertainty pin"
                    title="Uncertain, review in Practice"
                    onClick={() => update(i.id, { uncertain: false })}
                  >
                    <Pin size={13} />
                  </button>
                )}
                {selected.includes(i.id) && !activeGesture && (
                  <button
                    className="object-grip"
                    aria-label="Drag object"
                    title="Drag"
                    onPointerDown={(e) => begin(e, "move", selected)}
                  >
                    <Grip size={12} />
                  </button>
                )}
                {shape ? (
                  <SheetShape item={i} />
                ) : i.kind === "video" ? (
                  <VideoCard
                    url={i.src || ""}
                    title={i.text}
                    editable
                    onSelect={() => {
                      setSelected([i.id]);
                      active.current = true;
                    }}
                  />
                ) : i.kind === "image" || i.kind === "drawing" ? (
                  <img
                    draggable={false}
                    alt={i.text || "Note drawing"}
                    src={
                      i.kind === "drawing"
                        ? fileUrl("drawings", i.drawingId + ".svg") +
                          (fileUrl("drawings", i.drawingId + ".svg").includes(
                            "?",
                          )
                            ? "&"
                            : "?") +
                          "v=" +
                          drawingVersion
                        : imageSource(i.src)
                    }
                    onLoad={(e) => {
                      if (i.fitted || gesture.current) return;
                      const image = e.currentTarget;
                      if (!image.naturalWidth) return;
                      const ratio = image.naturalHeight / image.naturalWidth,
                        width = Math.min(i.width, 200 / Math.max(0.01, ratio));
                      update(i.id, {
                        width: Math.max(8, width),
                        height: Math.max(8, width * ratio),
                        fitted: true,
                      });
                    }}
                  />
                ) : (
                  <RichEditor
                    ref={(handle) => {
                      if (handle) editors.current.set(i.id, handle);
                      else editors.current.delete(i.id);
                    }}
                    compact
                    readOnly={!!peer}
                    value={i.text || ""}
                    onChange={(text) => update(i.id, { text })}
                    onCommand={onCommand || (() => {})}
                    onUpload={onUpload}
                    onVideo={(src, text) =>
                      add({
                        kind: "video",
                        src,
                        text,
                        ...place(),
                        width: 280,
                        height: 210,
                      })
                    }
                    onObjectAction={(action) => {
                      if (action === "resize") {
                        setSelected([i.id]);
                        setResizing(true);
                      } else if (action === "delete") remove([i.id]);
                      else
                        add({
                          ...structuredClone(i),
                          x: i.x + 20,
                          y: i.y + 20,
                        });
                    }}
                    onReady={(editor) => {
                      editor.on("focus", () => {
                        setSelected([i.id]);
                        active.current = true;
                      });
                      if (i.kind === "text" && !peer) {
                        const fitText = () => {
                          if (editor.isDestroyed || gesture.current) return;
                          const needed = editor.view.dom.scrollHeight,
                            saved = latest.current.items.find(
                              (item) => item.id === i.id,
                            );
                          if (saved && needed > saved.height + 2)
                            update(i.id, { height: needed });
                        };
                        editor.on("update", fitText);
                        requestAnimationFrame(fitText);
                      }
                    }}
                  />
                )}
                {selected.includes(i.id) &&
                  !activeGesture &&
                  selected.length === 1 && (
                    <button
                      className="object-resize"
                      aria-label="Resize object"
                      onPointerDown={(e) => begin(e, "resize", selected)}
                    />
                  )}
                {selected.includes(i.id) &&
                  !activeGesture &&
                  selected.length === 1 && (
                    <button
                      className="object-rotate"
                      aria-label="Rotate object"
                      title="Rotate"
                      onPointerDown={(e) => begin(e, "rotate", selected)}
                    >
                      <RotateCw size={13} />
                    </button>
                  )}
              </div>
            );
          })}
          {selectedItems.length > 1 && !activeGesture && (
            <button
              className="object-resize group-resize"
              aria-label="Resize group"
              style={{
                left: Math.max(...selectedItems.map((i) => i.x + i.width)) - 6,
                top: Math.max(...selectedItems.map((i) => i.y + i.height)) - 6,
                zIndex: 200,
              }}
              onPointerDown={(e) => begin(e, "resize", selected)}
            />
          )}
          {marquee && (
            <div
              className="selection-marquee"
              style={{
                left: marquee.x,
                top: marquee.y,
                width: marquee.width,
                height: marquee.height,
              }}
            />
          )}
        </div>
      </div>
      <button
        className="extend-sheet"
        aria-label="Add more paper"
        onClick={() =>
          commit({ ...base(), height: latest.current.height + 400 })
        }
      >
        More paper
      </button>
      {menu && (
        <RadialMenu
          x={menu.x}
          y={menu.y}
          keyboard={menu.keyboard}
          onClose={() => setMenu(undefined)}
        >
          <button data-menu-group="Select" onClick={() => choose("write")}>
            Write cursor
          </button>
          <button data-menu-group="Select" onClick={() => choose("select")}>
            Select objects
          </button>
          <button
            data-menu-group="Connect"
            disabled={!onCommand}
            onClick={() => {
              onCommand?.("page");
              setMenu(undefined);
            }}
          >
            New page
          </button>
          <button
            data-menu-group="Connect"
            disabled={!onCommand}
            onClick={() => {
              onCommand?.("link");
              setMenu(undefined);
            }}
          >
            Link a note
          </button>
          <button
            data-menu-group="Study"
            aria-pressed={studyLens}
            onClick={() => {
              setStudyLens(!studyLens);
              setMenu(undefined);
            }}
          >
            {studyLens ? "Exit study lens" : "Study lens"}
          </button>
          {!!selected.length && (
            <button
              data-menu-group="Study"
              onClick={() => {
                const uncertain = !selectedItems.every((i) => i.uncertain);
                commit({
                  ...latest.current,
                  items: latest.current.items.map((i) =>
                    selected.includes(i.id) ? { ...i, uncertain } : i,
                  ),
                });
                setMenu(undefined);
              }}
            >
              {selectedItems.every((i) => i.uncertain)
                ? "Remove uncertainty pins"
                : "Pin as uncertain"}
            </button>
          )}

          {item?.kind === "image" && (
            <button
              role="menuitem"
              onClick={() => {
                onCommand?.("extract:" + item.src);
                setMenu(undefined);
              }}
            >
              Extract using AI
            </button>
          )}
          {item?.kind === "video" && youtubeLink(item.src || "") && (
            <button
              role="menuitem"
              onClick={() => {
                window.open(
                  youtubeLink(item.src || "")!.url,
                  "_blank",
                  "noopener,noreferrer",
                );
                setMenu(undefined);
              }}
            >
              Open video
            </button>
          )}
          {item?.kind === "drawing" && (
            <button
              role="menuitem"
              onClick={() => {
                setMenu(undefined);
                onDrawing(item.drawingId!);
              }}
            >
              Edit drawing
            </button>
          )}
          {(selected.length > 0 || fullSelection.current) && (
            <>
              <button
                role="menuitem"
                onClick={() => {
                  void copy();
                  setMenu(undefined);
                }}
              >
                Copy selection <small>Ctrl+C</small>
              </button>
              <button role="menuitem" onClick={duplicate}>
                Duplicate <small>Ctrl+D</small>
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setResizing(true);
                  setMenu(undefined);
                }}
              >
                Resize
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  const next = latest.current;
                  commit({
                    ...next,
                    items: [
                      ...next.items.filter((i) => !selected.includes(i.id)),
                      ...selectedItems,
                    ],
                  });
                  setMenu(undefined);
                }}
              >
                Bring forward
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  const next = latest.current;
                  commit({
                    ...next,
                    items: [
                      ...selectedItems,
                      ...next.items.filter((i) => !selected.includes(i.id)),
                    ],
                  });
                  setMenu(undefined);
                }}
              >
                Send backward
              </button>
              <button role="menuitem" onClick={() => remove()}>
                Delete selection <small>Delete</small>
              </button>
            </>
          )}
          <button
            role="menuitem"
            onClick={() => {
              fullSelection.current = true;
              setSelected(scene.items.map((i) => i.id));
              setTool("select");
              setMenu(undefined);
              focus();
            }}
          >
            Select entire note <small>Ctrl+A</small>
          </button>
          <button
            role="menuitem"
            onClick={() => {
              perform("paste", new Event("command", { cancelable: true }));
              setMenu(undefined);
            }}
          >
            Paste objects <small>Ctrl+V</small>
          </button>
          <button
            data-menu-group="Insert"
            role="menuitem"
            onClick={() => choose("text")}
          >
            Write here
          </button>
          <button
            data-menu-group="Draw"
            role="menuitem"
            onClick={() => choose("pen")}
          >
            Pen
          </button>
          <button data-menu-group="Draw" onClick={() => choose("bucket")}>
            Paint bucket
          </button>
          <button
            data-menu-group="Draw"
            onClick={() => {
              choose("pen");
              setHighlighter(true);
              setColor("#ff1493");
              setSize(18);
            }}
          >
            Pink highlighter
          </button>
          <button
            data-menu-group="Draw"
            onClick={() => {
              choose("pen");
              setHighlighter(true);
              setColor("#39ff14");
              setSize(18);
            }}
          >
            Green highlighter
          </button>
          {shapeTools.map(([id, label, Icon]) => (
            <button key={id} data-menu-group="Draw" onClick={() => choose(id)}>
              <Icon size={17} />
              {label}
            </button>
          ))}
          <button data-menu-group="Draw" onClick={() => choose("arrow")}>
            Arrow
          </button>
          <button
            data-menu-group="Insert"
            onClick={() => {
              setMenu(undefined);
              onImage();
            }}
          >
            Add image
          </button>
          <button data-menu-group="Insert" onClick={() => choose("table")}>
            Add table
          </button>
          <button
            data-menu-group="Draw"
            role="menuitem"
            onClick={() => choose("eraser")}
          >
            Eraser
          </button>
          <button
            role="menuitem"
            onClick={() => {
              onCommand?.("flowchart");
              setMenu(undefined);
            }}
          >
            Make diagram
          </button>
          <button
            role="menuitem"
            disabled={!history.current.length}
            onClick={() => {
              undo();
              setMenu(undefined);
            }}
          >
            Undo <small>Ctrl+Z</small>
          </button>
          <button
            role="menuitem"
            disabled={!future.current.length}
            onClick={() => {
              redo();
              setMenu(undefined);
            }}
          >
            Redo <small>Ctrl+Shift+Z</small>
          </button>
        </RadialMenu>
      )}
    </section>
  );
});

function ArrowSymbol({
  kind,
}: {
  kind: NonNullable<CanvasItem["arrowStyle"]>;
}) {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === "curved" ? (
        <path d="M4 20 Q4 4 20 4" />
      ) : kind === "elbow" ? (
        <path d="M4 20 V4 H20" />
      ) : (
        <path d="M4 20 20 4" />
      )}
      <path d="M13 4h7v7" />
      {kind === "double" && <path d="M4 13v7h7" />}
    </svg>
  );
}
