import { useEffect, useRef, useState } from "react";
import {
  Excalidraw,
  convertToExcalidrawElements,
  exportToSvg,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { api } from "./api";
import { Modal, Busy } from "./ui";
import { diagramLayout } from "./diagramDesign";
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
          const layout = diagramLayout(d.diagram);
          const nodes: any[] = layout.nodes.map((n: any, i: number) => ({
            id: n.id,
            type:
              n.kind === "decision"
                ? "diamond"
                : n.kind === "terminal"
                  ? "ellipse"
                  : "rectangle",
            x: n.x - n.width / 2,
            y: n.y - n.height / 2,
            width: n.width,
            height: n.height,
            backgroundColor: i === 0 ? "#f4e6df" : "#f5f5f5",
            strokeColor: i === 0 ? "#bf4520" : "#2d3142",
            roughness: 0,
            roundness: null,
            label: {
              text: n.label,
              fontSize: 16,
              fontFamily: 2,
              strokeColor: "#2d3142",
            },
          }));
          for (const e of layout.edges) {
            const start = e.points[0],
              end = e.points.at(-1)!;
            nodes.push({
              type: "arrow",
              x: start[0],
              y: start[1],
              width: end[0] - start[0],
              height: end[1] - start[1],
              points: e.points.map((p) => [p[0] - start[0], p[1] - start[1]]),
              strokeColor: "#4f5d75",
              roughness: 0,
              start: { id: e.from },
              end: { id: e.to },
              label: e.label
                ? {
                    text: e.label,
                    fontSize: 14,
                    fontFamily: 2,
                    strokeColor: "#4f5d75",
                  }
                : undefined,
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
        appState: { ...appState, exportBackground: false },
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
      window.dispatchEvent(
        new CustomEvent("synapse:drawing-saved", { detail: { id } }),
      );
      notify("Drawing saved with a transparent background.");
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
              theme={
                document.documentElement.dataset.theme === "dark"
                  ? "dark"
                  : "light"
              }
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
