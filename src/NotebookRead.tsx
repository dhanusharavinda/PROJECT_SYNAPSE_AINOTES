import type { Note } from "./types";
import { notebookPages } from "./notebookModel";
import CanvasRead from "./CanvasRead";
import { MD } from "./ui";
import "./paged-notebook.css";
export default function NotebookRead({
  note,
  share,
}: {
  note: Note;
  share?: string;
}) {
  return (
    <div className="notebook-reading">
      {notebookPages(note).map((page, index) => (
        <section
          className="notebook-reading-page"
          data-paper-texture={page.paperTexture}
          key={page.id}
        >
          <p className="reading-page-number">Page {index + 1}</p>
          <CanvasRead canvas={page.canvas} share={share}>
            <MD text={page.body} share={share} />
          </CanvasRead>
          {page.aiNotes && (
            <section className="ai-notes-panel">
              <h3>AI notes</h3>
              <div
                className={
                  page.aiNotes.view === "handwritten" ? "ai-handwriting" : ""
                }
              >
                <MD text={page.aiNotes.text} />
              </div>
              {page.aiNotes.diagrams.map((d) => (
                <div key={d.id}>
                  <h4>{d.title}</h4>
                  <CanvasRead
                    canvas={
                      d.mode === "editable" && d.editable
                        ? d.editable
                        : d.original
                    }
                    share={share}
                  />
                </div>
              ))}
            </section>
          )}
        </section>
      ))}
    </div>
  );
}
