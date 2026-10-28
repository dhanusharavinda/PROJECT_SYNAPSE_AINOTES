import { useRef, useState } from "react";
import type { Note } from "./types";
import { Modal, MD } from "./ui";
import CanvasRead from "./CanvasRead";
import { bodyOf } from "./content";
export default function SlidesExport({
  notes,
  onClose,
}: {
  notes: Note[];
  onClose: () => void;
}) {
  const [frame, setFrame] = useState<{
      note: Note;
      offset: number;
      number: number;
    }>(),
    [slides, setSlides] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [progress, setProgress] = useState("");
  const capture = useRef<HTMLDivElement>(null);
  const settle = async () => {
    await document.fonts.ready;
    await new Promise((resolve) => setTimeout(resolve, 120));
  };
  async function generate() {
    setBusy(true);
    setError("");
    const result: string[] = [];
    try {
      if (notes.length > 10)
        throw Error("Choose up to 10 notes for one slide document.");
      const { toJpeg } = await import("html-to-image");
      for (const note of notes) {
        setFrame({ note, offset: 0, number: result.length + 1 });
        await settle();
        const height = capture.current!.querySelector<HTMLElement>(
          ".slide-note-content",
        )!.scrollHeight;
        const count = Math.max(1, Math.ceil(height / 1100));
        if (result.length + count > 30)
          throw Error(
            "This selection needs more than 30 slides. Choose fewer notes or split a long page.",
          );
        for (let p = 0; p < count; p++) {
          setProgress(`Preparing slide ${result.length + 1}`);
          setFrame({ note, offset: p * 1100, number: result.length + 1 });
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
            imagePlaceholder:
              "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=",
          });
          result.push(image);
        }
      }
      setSlides(result);
      setFrame(undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setProgress("");
    }
  }
  async function download() {
    setBusy(true);
    try {
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({
        unit: "pt",
        format: [800, 1000],
        compress: true,
      });
      slides.forEach((image, i) => {
        if (i) pdf.addPage([800, 1000]);
        pdf.addImage(image, "JPEG", 0, 0, 800, 1000);
      });
      pdf.save(
        (notes.length === 1 ? notes[0].title : "Synapse notes").replace(
          /[^a-z0-9 -]/gi,
          "",
        ) + " slides.pdf",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Slides for LinkedIn"
      wide
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p>
        Preview your notes as portrait slides, then download a PDF to upload as
        a LinkedIn document post. Video players become previews. Review page
        breaks and remote images before sharing.
      </p>
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
              ? "Regenerate slides"
              : "Prepare slides"}
        </button>
        {slides.length > 0 && (
          <button className="primary" disabled={busy} onClick={download}>
            Download PDF ({slides.length} {slides.length === 1 ? "slide" : "slides"})
          </button>
        )}
      </div>
      <div className="slide-previews">
        {slides.map((src, i) => (
          <figure key={i}>
            <img src={src} alt={"Slide " + (i + 1)} />
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
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
