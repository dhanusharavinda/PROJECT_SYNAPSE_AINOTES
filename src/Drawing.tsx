import { useEffect, useRef, useState } from "react";
import {
  Excalidraw,
  convertToExcalidrawElements,
  exportToSvg,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { api } from "./api";
import { Modal, Busy } from "./ui";
export default function Drawing({
  id,
  onClose,
  notify,
}: {
  id: string;
  onClose: () => void;
  notify: (s: string) => void;
}) {
  const [data, setData] = useState<any>();
  const [busy, setBusy] = useState(false);
  const [discard, setDiscard] = useState(false);
  const ref = useRef<any>(null);
  const dirty = useRef(false);
  useEffect(() => {
    api("/drawings/" + id)
      .then((d: any) => {
        if (d.diagram && !d.elements.length) {
          const nodes: any[] = d.diagram.nodes.map((n: any, i: number) => ({
            id: n.id,
            type: "rectangle",
            x: (i % 3) * 280,
            y: Math.floor(i / 3) * 180,
            width: 220,
            height: 85,
            backgroundColor: "#e1eee8",
            strokeColor: "#22584a",
            label: { text: n.label, fontSize: 18 },
          }));
          for (const e of d.diagram.edges) {
            const a = nodes.find((n) => n.id === e.from),
              b = nodes.find((n) => n.id === e.to);
            nodes.push({
              type: "arrow",
              x: a.x + 220,
              y: a.y + 42,
              width: b.x - a.x - 220 || 80,
              height: b.y - a.y,
              points: [
                [0, 0],
                [b.x - a.x - 220 || 80, b.y - a.y],
              ],
              start: { id: e.from },
              end: { id: e.to },
              label: e.label ? { text: e.label, fontSize: 14 } : undefined,
            });
          }
          d.elements = convertToExcalidrawElements(nodes, {
            regenerateIds: false,
          });
        }
        setData(d);
      })
      .catch((e) => notify(e.message));
  }, [id]);
  async function save() {
    if (!ref.current) return;
    setBusy(true);
    try {
      const elements = ref.current.getSceneElements();
      const files = ref.current.getFiles();
      const appState = ref.current.getAppState();
      const svg = await exportToSvg({
        elements,
        files,
        appState: { ...appState, exportBackground: true },
      });
      await api(
        "/drawings/" + id,
        {
          elements,
          files,
          appState: { viewBackgroundColor: appState.viewBackgroundColor },
          svg: svg.outerHTML,
        },
        "PUT",
      );
      dirty.current = false;
      notify("Drawing saved locally, including an SVG preview.");
      onClose();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Modal
        title="Your drawing canvas"
        wide
        onClose={() => {
          if (!dirty.current) onClose();
          else setDiscard(true);
        }}
      >
        <p className="muted">
          Draw freely. Connect shapes with arrows. Your sketch does not change
          knowledge links.
        </p>
        <div className="drawing-stage">
          {data ? (
            <Excalidraw
              excalidrawAPI={(a) => (ref.current = a)}
              initialData={{
                elements: data.elements,
                files: data.files,
                appState: { ...data.appState, collaborators: new Map() },
                scrollToContent: true,
              }}
              onChange={() => {
                dirty.current = true;
              }}
              UIOptions={{
                canvasActions: {
                  loadScene: false,
                  saveToActiveFile: false,
                  export: false,
                },
              }}
            />
          ) : (
            <Busy />
          )}
        </div>
        <footer className="dialog-actions">
          <span className="muted">
            Select an object and use arrow keys to move it.
          </span>
          <button className="primary" disabled={busy} onClick={save}>
            {busy ? <Busy /> : "Save drawing"}
          </button>
        </footer>
      </Modal>
      {discard && (
        <Modal title="Keep your drawing?" onClose={() => setDiscard(false)}>
          <p>
            The canvas has unsaved changes. Save them or close and discard this
            draft.
          </p>
          <footer className="dialog-actions">
            <button onClick={() => setDiscard(false)}>Keep drawing</button>
            <button onClick={onClose}>Discard draft</button>
            <button className="primary" onClick={save}>
              Save drawing
            </button>
          </footer>
        </Modal>
      )}
    </>
  );
}
