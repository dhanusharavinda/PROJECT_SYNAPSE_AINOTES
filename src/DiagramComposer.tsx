import { useState } from "react";
import type { Note } from "./types";
import type { Diagram } from "./diagramDesign";
import { api } from "./api";
import { Modal, Busy } from "./ui";
import DiagramPreview from "./DiagramPreview";
export default function DiagramComposer({
  note,
  selection,
  onClose,
  onAccept,
  generate,
}: {
  note: Note;
  selection: string;
  onClose: () => void;
  onAccept: (diagram: Diagram) => void;
  generate?: (body: {
    note: Note;
    selection: string;
  }) => Promise<{ diagram: Diagram }>;
}) {
  const [draft, setDraft] = useState<Diagram>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title="Create diagram" wide onClose={onClose}>
      {draft ? (
        <DiagramPreview diagram={draft} />
      ) : (
        <>
          <p>
            Turn {selection ? "your selection" : "this note"} into a diagram.
          </p>
          <p className="muted small">
            {generate
              ? "Your paired PC uses its configured AI. Keep Synapse open on that PC."
              : "Your configured AI reads the note text and chooses a suitable diagram."}{" "}
            Images need text extraction first.
          </p>
          {selection && <blockquote>{selection.slice(0, 500)}</blockquote>}
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <footer className="dialog-actions">
        <button onClick={onClose}>Cancel</button>
        {draft ? (
          <button
            className="primary"
            onClick={() => {
              try {
                onAccept(draft);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Insert diagram
          </button>
        ) : (
          <button
            className="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const result = await (generate
                  ? generate({ note, selection })
                  : api<{ diagram: Diagram }>("/diagrams/draft", {
                      note,
                      selection,
                    }));
                setDraft(result.diagram);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Busy /> : null}
            {busy ? "Creating…" : "Create diagram"}
          </button>
        )}
      </footer>
      {draft && (
        <p className="small muted">
          Check the connections before inserting. The result stays editable on
          your canvas.
        </p>
      )}
    </Modal>
  );
}
