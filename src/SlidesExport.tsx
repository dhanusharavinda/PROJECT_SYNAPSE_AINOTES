import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { collectPdfLinks, writePdf, type PdfSlide } from "./pdfExport";
import type { Note } from "./types";
import { Modal, MD } from "./ui";
import CanvasRead from "./CanvasRead";
import { bodyOf } from "./content";
import { notebookPages } from "./notebookModel";
export default function SlidesExport({
  notes,
  onClose,
  availableNotes = [],
}: {
  notes: Note[];
  availableNotes?: Note[];
  onClose: () => void;
}) {
  const [frame, setFrame] = useState<{
      note: Note;
      offset: number;
      number: number;
    }>(),
    [slides, setSlides] = useState<PdfSlide[]>([]),
    [includeChildren, setIncludeChildren] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [progress, setProgress] = useState("");
  const capture = useRef<HTMLDivElement>(null);
  const settle = async () => {
    await document.fonts.ready;
    await new Promise((resolve) => setTimeout(resolve, 120));
    await Promise.all(
      [...capture.current!.querySelectorAll("img")].map(async (img) => {
        await Promise.race([
          img.decode(),
          new Promise((_, reject) =>
            setTimeout(
              () =>
                reject(
                  Error("An image could not load. Reconnect and try again."),
                ),
              15000,
            ),
          ),
        ]);
      }),
    );
  };
  async function generate() {
    setBusy(true);
    setError("");
    const result: PdfSlide[] = [];
    setSlides([]);
    try {
      const selected = [...notes];
      if (includeChildren)
        for (let i = 0; i < selected.length; i++) {
          for (const child of availableNotes)
            if (
              !child.archived &&
              child.parentId === selected[i].id &&
              !selected.some((n) => n.id === child.id)
            )
              selected.push(child);
        }
      if (selected.length > 100)
        throw Error("Choose up to 100 notes for one PDF.");
      const { toJpeg } = await import("html-to-image");
      const sheets = selected.flatMap((n) =>
        notebookPages(n).map((p, index) => ({
          ...n,
          body: p.body,
          canvas: p.canvas,
          aiNotes: p.aiNotes,
          pages: [],
          title: n.title + (index ? ` · Page ${index + 1}` : ""),
        })),
      );
      for (const note of sheets) {
        flushSync(() =>
          setFrame({ note, offset: 0, number: result.length + 1 }),
        );
        await settle();
        const height = capture.current!.querySelector<HTMLElement>(
          ".slide-note-content",
        )!.scrollHeight;
        const count = Math.max(1, Math.ceil(height / 1100));
        if (result.length + count > 150)
          throw Error(
            "This selection needs more than 150 pages. Choose fewer notes or split a long page.",
          );
        for (let p = 0; p < count; p++) {
          setProgress(`Preparing page ${result.length + 1}`);
          flushSync(() =>
            setFrame({ note, offset: p * 1100, number: result.length + 1 }),
          );
          await settle();
          const image = await toJpeg(capture.current!, {
            pixelRatio: 1.5,
            quality: 0.93,
            backgroundColor: "#ffffff",
            cacheBust: false,
            filter: (node) =>
              !(
                node instanceof HTMLElement &&
                (node.tagName === "IFRAME" ||
                  (node.tagName === "BUTTON" &&
                    !node.classList.contains("preview-video")))
              ),
          });
          result.push({
            image,
            noteId: note.id,
            links: collectPdfLinks(capture.current!),
          });
        }
      }
      setSlides(result);
      setFrame(undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFrame(undefined);
      setBusy(false);
      setProgress("");
    }
  }
  async function download() {
    setBusy(true);
    try {
      const pdf = await writePdf(slides);
      await pdf.save(
        (notes.length === 1 ? notes[0].title : "Synapse notes").replace(
          /[^a-z0-9 -]/gi,
          "",
        ) + " notes.pdf",
        { returnPromise: true },
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Export PDF"
      wide
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p>
        All sheets, drawings and images are included. Web links stay clickable.
        Videos open in your browser. Links to included subpages jump within the
        PDF. Private files and pages outside this export still need to be shared
        separately.
      </p>
      {availableNotes.some((n) => n.parentId === notes[0]?.id) && (
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            style={{ width: "auto", margin: 0 }}
            type="checkbox"
            checked={includeChildren}
            disabled={busy}
            onChange={(e) => {
              setIncludeChildren(e.target.checked);
              setSlides([]);
            }}
          />{" "}
          Include subpages
        </label>
      )}
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      <div className="actions">
        <button disabled={busy} onClick={generate}>
          {busy
            ? progress || "Preparing..."
            : slides.length
              ? "Refresh preview"
              : "Prepare PDF"}
        </button>
        {slides.length > 0 && (
          <button className="primary" disabled={busy} onClick={download}>
            Download PDF ({slides.length}{" "}
            {slides.length === 1 ? "page" : "pages"})
          </button>
        )}
      </div>
      <div className="slide-previews">
        {slides.map((src, i) => (
          <figure key={i}>
            <img src={src.image} alt={"Slide " + (i + 1)} />
            <figcaption>{i + 1}</figcaption>
          </figure>
        ))}
      </div>
      {frame && (
        <div className="slide-render-host" aria-hidden="true">
          <div className="slide-capture" ref={capture} data-theme="light">
            <header>
              <strong>{frame.note.title}</strong>
              <span>Synapse · {frame.number}</span>
            </header>
            <div className="slide-window">
              <div
                className="slide-note-content"
                style={{ transform: `translateY(-${frame.offset}px)` }}
              >
                <CanvasRead
                  exporting
                  canvas={
                    frame.note.canvas
                      ? {
                          ...frame.note.canvas,
                          height: Math.max(
                            1,
                            ...frame.note.canvas.items.map(
                              (item) => item.y + item.height + 32,
                            ),
                          ),
                        }
                      : { items: [], height: 1 }
                  }
                >
                  <MD text={bodyOf(frame.note)} />
                </CanvasRead>
                {frame.note.aiNotes && (
                  <section>
                    <h3>AI notes</h3>
                    <MD text={frame.note.aiNotes.text} />
                    {frame.note.aiNotes.diagrams.map((d) => (
                      <CanvasRead
                        exporting
                        key={d.id}
                        canvas={
                          d.mode === "editable" && d.editable
                            ? d.editable
                            : d.original
                        }
                      />
                    ))}
                  </section>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
