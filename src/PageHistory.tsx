import { useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import type { Note, CanvasItem } from "./types";
import { bodyOf } from "./content";
import { MD } from "./ui";
import CanvasRead from "./CanvasRead";
import "./workspace-polish.css";

export type HistoryEntry = {
  name: string;
  markdown: string;
  note: Note | null;
};
export function recoveredItems(current: Note, items: CanvasItem[]) {
  const canvas = current.canvas || { width: 1000, height: 900, items: [] };
  const copies = items.map((item) => ({
    ...structuredClone(item),
    id: crypto.randomUUID(),
    x: Math.min(100000, item.x + 16),
    y: Math.min(100000, item.y + 16),
  }));
  return {
    ...canvas,
    width: Math.min(
      100000,
      Math.max(canvas.width || 1000, ...copies.map((i) => i.x + i.width + 32)),
    ),
    height: Math.min(
      100000,
      Math.max(canvas.height, ...copies.map((i) => i.y + i.height + 80)),
    ),
    items: [...canvas.items, ...copies],
  };
}
export function recoveredDrawingIds(
  current: Note,
  items: CanvasItem[],
  body = "",
) {
  const ids = items
    .filter((item) => item.kind === "drawing")
    .map((item) => item.drawingId || "");
  const visible = body.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, "");
  for (const match of visible.matchAll(
    /^:::drawing\s+(\{[^\n]*\})\s*:::\s*$/gm,
  )) {
    try {
      ids.push(JSON.parse(match[1]).id);
    } catch {
      /* Preserve malformed blocks as writing. */
    }
  }
  return [
    ...new Set([
      ...current.drawings,
      ...ids.filter(
        (id) =>
          typeof id === "string" &&
          /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id),
      ),
    ]),
  ];
}
export default function PageHistory({
  entries,
  current,
  onRestore,
}: {
  entries: HistoryEntry[];
  current: Note;
  onRestore: (patch: Partial<Note>) => void;
}) {
  const [index, setIndex] = useState(0),
    [selected, setSelected] = useState<string[]>([]),
    [excerpt, setExcerpt] = useState(""),
    [restored, setRestored] = useState(false);
  const preview = useRef<HTMLDivElement>(null);
  const entry = entries[index],
    old = entry?.note;
  if (!entry)
    return (
      <p className="muted">Previous saves will appear here as you edit.</p>
    );
  const restore = (patch: Partial<Note>) => {
    onRestore(patch);
    setRestored(true);
  };
  return (
    <div className="page-history">
      <label>
        Saved version
        <select
          value={index}
          onChange={(e) => {
            setIndex(Number(e.target.value));
            setSelected([]);
            setExcerpt("");
            setRestored(false);
          }}
        >
          {entries.map((h, i) => (
            <option key={h.name} value={i}>
              Revision {h.name.split("-")[0]}
              {h.note?.updated
                ? " · " + new Date(h.note.updated).toLocaleString()
                : ""}
            </option>
          ))}
        </select>
      </label>
      {old ? (
        <>
          <div
            className="history-preview"
            ref={preview}
            onMouseUp={() => {
              const selection = window.getSelection();
              if (
                selection?.anchorNode &&
                selection.focusNode &&
                preview.current?.contains(selection.anchorNode) &&
                preview.current?.contains(selection.focusNode)
              )
                setExcerpt(selection.toString());
            }}
          >
            {old.canvas ? (
              <CanvasRead canvas={old.canvas}>
                <MD text={bodyOf(old)} />
              </CanvasRead>
            ) : (
              <MD text={bodyOf(old)} />
            )}
          </div>
          <div className="history-recover">
            <p className="muted small">
              Select text in the preview, or choose objects below. Recovery adds
              a copy to this page.
            </p>
            {excerpt && (
              <button
                disabled={restored}
                onClick={() =>
                  restore({
                    canvas: recoveredItems(current, [
                      {
                        id: "",
                        kind: "text",
                        x: 32,
                        y: 32,
                        width: 420,
                        height: 140,
                        text: excerpt.replace(/([\\`*_{}[\]<>#])/g, "\\$1"),
                      },
                    ]),
                  })
                }
              >
                Recover selected text
              </button>
            )}
            {(old.canvas?.items || []).map((item, i) => (
              <label className="history-object" key={item.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(item.id)}
                  onChange={(e) => {
                    setRestored(false);
                    setSelected(
                      e.target.checked
                        ? [...selected, item.id]
                        : selected.filter((id) => id !== item.id),
                    );
                  }}
                />
                <span>
                  {item.text?.replace(/\s+/g, " ").slice(0, 65) ||
                    `${item.kind} ${i + 1}`}
                </span>
              </label>
            ))}
            {selected.length > 0 && (
              <button
                className="primary"
                disabled={restored}
                onClick={() => {
                  const items = old.canvas!.items.filter((i) =>
                    selected.includes(i.id),
                  );
                  restore({
                    canvas: recoveredItems(current, items),
                    drawings: recoveredDrawingIds(current, items),
                  });
                }}
              >
                <RotateCcw size={14} />
                Recover {selected.length}{" "}
                {selected.length === 1 ? "object" : "objects"}
              </button>
            )}
            <details>
              <summary>Recover page writing</summary>
              <p className="small muted">
                Replace only the main writing with this version. Drawings and
                placed objects stay as they are.
              </p>
              <button
                disabled={restored}
                onClick={() =>
                  restore({
                    body: bodyOf(old),
                    drawings: recoveredDrawingIds(current, [], bodyOf(old)),
                  })
                }
              >
                Restore writing
              </button>
            </details>
            {restored && (
              <p role="status">Recovered. Your page will autosave.</p>
            )}
          </div>
        </>
      ) : (
        <>
          <p>
            This version cannot be previewed. Its original Markdown is
            preserved.
          </p>
          <pre>{entry.markdown}</pre>
        </>
      )}
    </div>
  );
}
