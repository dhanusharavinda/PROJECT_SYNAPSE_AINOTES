import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import type { AINotes, NoteCanvas, Proposal } from "./types";
import RichEditor from "./RichEditor";
import CanvasRead from "./CanvasRead";
import NotebookSheet from "./NotebookSheet";
import DiagramPreview from "./DiagramPreview";
import { appendDiagram } from "./diagramCanvas";
import { diagramSchema } from "./diagramSchema";
import { Modal } from "./ui";
import HandwritingFontControl from "./HandwritingFontControl";

export default function AINotesPanel({
  value,
  draft,
  progress,
  error,
  stale,
  onChange,
  onDraft,
  onGenerate,
  onAccept,
  onDiscard,
  requestDiagram,
  cell,
}: {
  value?: AINotes;
  draft?: AINotes;
  progress?: string;
  error?: string;
  stale: boolean;
  onChange: (value: AINotes) => void;
  onDraft: (value: AINotes) => void;
  onGenerate: () => void;
  onAccept: () => void;
  onDiscard: () => void;
  requestDiagram: (description: string) => Promise<{
    diagram: NonNullable<Proposal["diagram"]>;
    rationale: string;
  }>;
  cell?: string;
}) {
  const [open, setOpen] = useState(!!value),
    [editing, setEditing] = useState<string>(),
    [review, setReview] = useState<{
      id: string;
      diagram: NonNullable<Proposal["diagram"]>;
    }>(),
    [busy, setBusy] = useState(""),
    [diagramError, setDiagramError] = useState("");
  const shown = draft || value,
    write = draft ? onDraft : onChange;
  useEffect(() => {
    if (draft) setOpen(true);
  }, [draft?.generatedAt]);
  const updateDiagram = (
    id: string,
    patch: Partial<AINotes["diagrams"][number]>,
  ) =>
    shown &&
    write({
      ...shown,
      diagrams: shown.diagrams.map((d) =>
        d.id === id ? { ...d, ...patch } : d,
      ),
    });
  async function recognize(id: string, description: string) {
    setBusy(id);
    setDiagramError("");
    try {
      const result = await requestDiagram(description);
      setReview({ id, diagram: result.diagram });
    } catch (e) {
      setDiagramError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  const edited = shown?.diagrams.find((d) => d.id === editing);
  return (
    <section className="ai-notes-panel" aria-label="AI notes" data-cell={cell}>
      <div className="ai-notes-heading">
        <button
          className="ai-notes-toggle"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
          <Sparkles size={17} />
          AI notes
        </button>
        {stale && shown && (
          <span className="ai-notes-stale">Handwriting changed</span>
        )}
        {draft && !open && <span className="ai-notes-stale">Review ready</span>}
        {error && !open && <span role="status">Conversion failed</span>}
        <button
          disabled={!!progress}
          onClick={() => {
            setOpen(true);
            onGenerate();
          }}
        >
          {progress || (shown ? "Convert again" : "Convert handwriting")}
        </button>
      </div>
      {open && (
        <div className="ai-notes-body">
          {!shown && (
            <p>
              Convert this sheet into editable text or a neat handwriting view.
              Drawn diagrams stay as sketches, with an optional editable copy.
            </p>
          )}
          <p className="ai-notes-disclosure">
            Conversion sends this sheet's ink to the AI provider configured on
            your PC. Review words, formulas and arrows. Your original writing
            stays above.
          </p>
          {error && <p role="alert">{error}</p>}
          {stale && shown && (
            <p role="status">
              The handwriting changed since this conversion. Review missing or
              outdated content, or convert again.
            </p>
          )}
          {shown && (
            <>
              {draft && (
                <div className="ai-draft-actions">
                  <strong>Review conversion</strong>
                  <button onClick={onAccept}>
                    {stale ? "Keep older conversion" : "Keep AI notes"}
                  </button>
                  <button onClick={onDiscard}>Discard preview</button>
                </div>
              )}
              <div
                className="ai-note-views"
                role="group"
                aria-label="AI notes appearance"
              >
                <button
                  aria-pressed={shown.view === "typed"}
                  onClick={() => write({ ...shown, view: "typed" })}
                >
                  Typed
                </button>
                <button
                  aria-pressed={shown.view === "handwritten"}
                  onClick={() => write({ ...shown, view: "handwritten" })}
                >
                  Neat handwriting
                </button>
                <HandwritingFontControl />
              </div>
              <div
                className={
                  shown.view === "handwritten"
                    ? "ai-note-text ai-handwriting"
                    : "ai-note-text"
                }
              >
                <RichEditor
                  value={shown.text}
                  onChange={(text) => write({ ...shown, text })}
                  onCommand={() => {}}
                  supportedCommands={[]}
                />
              </div>
              {shown.diagrams.map((d) => (
                <article className="ai-diagram" key={d.id}>
                  <h4>{d.title || "Diagram"}</h4>
                  <CanvasRead
                    canvas={
                      d.mode === "editable" && d.editable
                        ? d.editable
                        : d.original
                    }
                  />
                  <div className="ai-diagram-actions">
                    {d.editable && (
                      <button
                        onClick={() =>
                          updateDiagram(d.id, {
                            mode:
                              d.mode === "original" ? "editable" : "original",
                          })
                        }
                      >
                        {d.mode === "original"
                          ? "Show editable copy"
                          : "Show original sketch"}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (!d.editable)
                          updateDiagram(d.id, {
                            editable: structuredClone(d.original),
                            mode: "editable",
                          });
                        setEditing(d.id);
                      }}
                    >
                      Edit a copy
                    </button>
                    {d.description && (
                      <button
                        disabled={!!busy}
                        onClick={() => void recognize(d.id, d.description!)}
                      >
                        {busy === d.id
                          ? "Reading diagram…"
                          : "Create tidy diagram"}
                      </button>
                    )}
                  </div>
                </article>
              ))}
              {diagramError && <p role="alert">{diagramError}</p>}
            </>
          )}
        </div>
      )}
      {edited && (
        <Modal
          title="Edit diagram copy"
          wide
          onClose={() => setEditing(undefined)}
        >
          <p>
            The original sketch stays on the page. Use Select to move shapes or
            text, and the pen to add ink.
          </p>
          <NotebookSheet
            embedded
            value={edited.editable || edited.original}
            onChange={(editable: NoteCanvas) =>
              updateDiagram(edited.id, { editable, mode: "editable" })
            }
            onImage={() => {}}
            supportedCommands={[]}
          >
            <span />
          </NotebookSheet>
          <button onClick={() => setEditing(undefined)}>Done</button>
        </Modal>
      )}
      {review && (
        <Modal
          title="Review diagram labels and arrows"
          wide
          onClose={() => setReview(undefined)}
        >
          {diagramError && <p role="alert">{diagramError}</p>}
          <p>
            Check every connection before keeping the tidy version. This creates
            an editable copy beneath the original page.
          </p>
          <DiagramPreview diagram={review.diagram} />
          {review.diagram.nodes.map((n, index) => (
            <label key={n.id}>
              Label {index + 1}
              <input
                value={n.label}
                maxLength={65}
                onChange={(e) =>
                  setReview({
                    ...review,
                    diagram: {
                      ...review.diagram,
                      nodes: review.diagram.nodes.map((p) =>
                        p.id === n.id ? { ...p, label: e.target.value } : p,
                      ),
                    },
                  })
                }
              />
            </label>
          ))}
          {review.diagram.edges.map((edge, index) => (
            <div className="ai-edge-review" key={index}>
              <select
                aria-label={`Arrow ${index + 1} starts at`}
                value={edge.from}
                onChange={(e) =>
                  setReview({
                    ...review,
                    diagram: {
                      ...review.diagram,
                      edges: review.diagram.edges.map((p, j) =>
                        j === index ? { ...p, from: e.target.value } : p,
                      ),
                    },
                  })
                }
              >
                {review.diagram.nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label}
                  </option>
                ))}
              </select>
              <span>→</span>
              <select
                aria-label={`Arrow ${index + 1} ends at`}
                value={edge.to}
                onChange={(e) =>
                  setReview({
                    ...review,
                    diagram: {
                      ...review.diagram,
                      edges: review.diagram.edges.map((p, j) =>
                        j === index ? { ...p, to: e.target.value } : p,
                      ),
                    },
                  })
                }
              >
                {review.diagram.nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label}
                  </option>
                ))}
              </select>
              <input
                aria-label={`Arrow ${index + 1} label`}
                maxLength={14}
                value={edge.label}
                onChange={(e) =>
                  setReview({
                    ...review,
                    diagram: {
                      ...review.diagram,
                      edges: review.diagram.edges.map((p, j) =>
                        j === index ? { ...p, label: e.target.value } : p,
                      ),
                    },
                  })
                }
              />
            </div>
          ))}
          <button
            onClick={() => {
              const parsed = diagramSchema.safeParse(review.diagram);
              if (!parsed.success) {
                setDiagramError(
                  "Check the labels and arrows. Keep every node connected, and label decision branches.",
                );
                return;
              }
              updateDiagram(review.id, {
                recognized: parsed.data,
                editable: appendDiagram(
                  { width: 1100, height: 0, items: [] },
                  parsed.data,
                ),
                mode: "editable",
              });
              setReview(undefined);
            }}
          >
            Keep tidy diagram
          </button>
        </Modal>
      )}
    </section>
  );
}
