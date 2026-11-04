import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointer,
} from "react";
import { z } from "zod";
import CanvasRead from "./CanvasRead";
import NotebookRead from "./NotebookRead";
import SheetShape from "./SheetShape";
import { MD } from "./ui";
import { bodyOf } from "./content";
import { finishStroke } from "./sheetModel";
import {
  inputDraftSchema,
  submissionSchema,
  prepareInput,
  type InputDraft,
  type InputSubmission,
} from "./studyInput";
import type { Note, CanvasItem } from "./types";
import "./study.css";

const savedSchema = z.object({
  draft: inputDraftSchema,
  pending: submissionSchema.optional(),
});
const empty = (): InputDraft => ({ text: "", strokes: [] });
export default function StudyWorkspace({
  note,
  canSend,
  queued,
  onSend,
}: {
  note: Note;
  canSend: boolean;
  queued: boolean;
  onSend: (input: InputSubmission) => Promise<void>;
}) {
  const storageKey = "synapse-study-draft:" + note.id;
  const [draft, setDraft] = useState<InputDraft>(empty);
  const [pending, setPending] = useState<InputSubmission>();
  const [tool, setTool] = useState<"pen" | "erase">("pen");
  const [active, setActive] = useState<CanvasItem>();
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const stroke = useRef<{ id: number; item: CanvasItem } | undefined>(
    undefined,
  );
  const svg = useRef<SVGSVGElement>(null);
  const inFlight = useRef(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const value = savedSchema.parse(JSON.parse(saved));
        setDraft(value.draft);
        setPending(value.pending);
      }
      setLoaded(true);
    } catch {
      setError(
        "Your saved writing pad could not be opened. Export it before starting a new draft.",
      );
    }
  }, [storageKey]);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ draft, pending }));
      setStorageFailed(false);
    } catch {
      setStorageFailed(true);
      setError(
        "This browser could not save your draft. Export the writing pad before closing this tab.",
      );
    }
  }, [draft, pending, loaded, storageKey]);
  const locked = sending || Boolean(pending) || !loaded;
  const hasInput = Boolean(draft.text.trim() || draft.strokes.length);
  function point(
    e: PointerEvent | ReactPointer<SVGSVGElement>,
  ): [number, number] {
    const rect = svg.current!.getBoundingClientRect();
    return [
      Math.max(8, Math.min(892, ((e.clientX - rect.left) * 900) / rect.width)),
      Math.max(8, Math.min(372, ((e.clientY - rect.top) * 380) / rect.height)),
    ];
  }
  function sample(
    e: PointerEvent | ReactPointer<SVGSVGElement>,
    item: CanvasItem,
  ) {
    if ((item.points?.length || 0) >= 14990) return;
    item.points!.push(point(e));
    item.pressures!.push(
      e.pointerType === "pen" && e.pressure > 0
        ? 0.7 + Math.min(1, e.pressure) * 0.6
        : 1,
    );
  }
  function down(e: ReactPointer<SVGSVGElement>) {
    if (
      locked ||
      stroke.current ||
      !["pen", "mouse"].includes(e.pointerType) ||
      e.button !== 0
    )
      return;
    e.preventDefault();
    if (tool === "erase") {
      const [x, y] = point(e);
      setDraft((old) => ({
        ...old,
        strokes: old.strokes.filter(
          (s) =>
            !(
              x >= s.x - 8 &&
              x <= s.x + s.width + 8 &&
              y >= s.y - 8 &&
              y <= s.y + s.height + 8
            ),
        ),
      }));
      return;
    }
    if (draft.strokes.length >= 300) {
      setError("Send this pad before adding more strokes.");
      return;
    }
    const item: CanvasItem = {
      id: crypto.randomUUID(),
      kind: "pen",
      x: 0,
      y: 0,
      width: 900,
      height: 380,
      color: "#24392f",
      strokeWidth: 2.4,
      points: [],
      pressures: [],
    };
    sample(e, item);
    stroke.current = { id: e.pointerId, item };
    e.currentTarget.setPointerCapture(e.pointerId);
    setActive({ ...item });
  }
  function move(e: ReactPointer<SVGSVGElement>) {
    if (stroke.current?.id !== e.pointerId) return;
    e.preventDefault();
    const events = e.nativeEvent.getCoalescedEvents?.() || [];
    for (const event of events.length ? events : [e])
      sample(event, stroke.current.item);
    setActive({ ...stroke.current.item });
  }
  function finish(e: ReactPointer<SVGSVGElement>, cancelled = false) {
    if (stroke.current?.id !== e.pointerId) return;
    const item = stroke.current.item;
    if (!cancelled) sample(e, item);
    stroke.current = undefined;
    setActive(undefined);
    // Keep the captured part even if iPadOS interrupts the pointer gesture.
    setDraft((old) => ({
      ...old,
      strokes: [...old.strokes, finishStroke(item)],
    }));
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  }
  async function send() {
    if (
      inFlight.current ||
      stroke.current ||
      !canSend ||
      !loaded ||
      storageFailed
    )
      return;
    inFlight.current = true;
    setSending(true);
    setError("");
    try {
      const payload = pending || prepareInput(note, draft);
      // Persist the exact operation before sending, so a lost acknowledgement can
      // be retried after a reload without creating duplicate writing on the PC.
      localStorage.setItem(
        storageKey,
        JSON.stringify({ draft, pending: payload }),
      );
      setPending(payload);
      await onSend(payload);
      localStorage.removeItem(storageKey);
      setDraft(empty());
      setPending(undefined);
      setMessage("Saved on your PC.");
    } catch (e) {
      setError(
        (e instanceof Error ? e.message : "Sending failed.") +
          " Your writing is kept here. Retry when your PC is connected.",
      );
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }
  function exportDraft() {
    const stored = localStorage.getItem(storageKey);
    const blob = new Blob(
      [stored && !loaded ? stored : JSON.stringify({ draft, pending })],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Synapse-writing-pad.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  return (
    <div className="study-workspace">
      <section className="study-reader" aria-label="Read-only PC note">
        <header>
          <h1>{note.title}</h1>
          <span>{queued ? "Waiting for PC sync" : "Read-only note"}</span>
        </header>
        <p className="study-help">
          Read and scroll here. Add your writing from the pad.
        </p>
        <NotebookRead note={note} />
      </section>
      <section className="study-pad" aria-labelledby="study-pad-title">
        <header>
          <h2 id="study-pad-title">Writing pad</h2>
          <span>
            {pending ? "Waiting for confirmation" : "Draft for this page"}
          </span>
        </header>
        <p className="study-help">
          Type, write with Pencil, or use both. Send adds your work to the end
          of this note.
        </p>
        <label htmlFor="study-text">Typed notes</label>
        <textarea
          id="study-text"
          rows={5}
          maxLength={20000}
          value={draft.text}
          disabled={locked}
          placeholder="Explain it in your own words…"
          onChange={(e) => {
            setDraft((old) => ({ ...old, text: e.target.value }));
            setMessage("");
          }}
        />
        <div
          className="study-ink-tools"
          role="group"
          aria-label="Handwriting tools"
        >
          <button
            disabled={locked}
            aria-pressed={tool === "pen"}
            onClick={() => setTool("pen")}
          >
            Pen
          </button>
          <button
            disabled={locked}
            aria-pressed={tool === "erase"}
            onClick={() => setTool("erase")}
          >
            Erase stroke
          </button>
          <button
            disabled={locked || !draft.strokes.length}
            onClick={() =>
              setDraft((old) => ({ ...old, strokes: old.strokes.slice(0, -1) }))
            }
          >
            Undo stroke
          </button>
        </div>
        <svg
          ref={svg}
          viewBox="0 0 900 380"
          className="study-ink"
          role="img"
          aria-label="Pencil writing pad"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={(e) => finish(e)}
          onPointerCancel={(e) => finish(e, true)}
          onLostPointerCapture={(e) => finish(e, true)}
        >
          {draft.strokes.concat(active ? [active] : []).map((item) => (
            <g key={item.id} transform={`translate(${item.x} ${item.y})`}>
              <svg width={item.width} height={item.height} overflow="visible">
                <SheetShape item={item} />
              </svg>
            </g>
          ))}
        </svg>
        <p className="study-help">
          Pencil draws. Fingers scroll. Erase stroke removes a whole stroke.
        </p>
        {error && (
          <p role="alert" className="study-error">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        {!canSend && (
          <p className="study-help">
            Connect your PC to send. Keep this tab open, or export your draft.
          </p>
        )}
        <footer>
          <button
            className="primary"
            disabled={
              !canSend ||
              sending ||
              !loaded ||
              storageFailed ||
              Boolean(active) ||
              (!pending && !hasInput)
            }
            onClick={() => void send()}
          >
            {sending ? "Sending…" : pending ? "Retry send" : "Send to PC"}
          </button>
          <button onClick={exportDraft}>Export writing pad</button>
        </footer>
      </section>
    </div>
  );
}
