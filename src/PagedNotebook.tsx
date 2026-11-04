import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight, Plus, Layers } from "lucide-react";
import { toPng } from "html-to-image";
import NotebookSheet, { type SheetHandle } from "./NotebookSheet";
import type { AINotes, Note, NotebookPage, PaperTexture } from "./types";
import {
  addNotebookPage,
  changeNotebookPage,
  notebookPages,
  paperTextures,
} from "./notebookModel";
import { captureInk, inkRegions, sourceDigest } from "./inkCapture";
import AINotesPanel from "./AINotesPanel";
import PageTurn from "./PageTurn";
import { getPageCapacity } from "./notebookCapacity";
import { api } from "./api";
import "./paged-notebook.css";

type Props = Omit<
  ComponentProps<typeof NotebookSheet>,
  | "value"
  | "onChange"
  | "children"
  | "navigation"
  | "afterPaper"
  | "paperTexture"
> & {
  note: Note;
  onChange: (patch: Partial<Note>) => void;
  save?: () => Promise<unknown>;
  requestAI?: (action: string, body: unknown) => Promise<any>;
  children: (
    page: NotebookPage,
    onBodyChange: (body: string) => void,
    cellPrefix: string,
  ) => ReactNode;
};
type Job = { progress?: string; error?: string; draft?: AINotes };
const reducedMotion = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;
function savedPage(id: string) {
  try {
    return sessionStorage.getItem("synapse-sheet:" + id) || id;
  } catch {
    return id;
  }
}

export default forwardRef<SheetHandle, Props>(function PagedNotebook(
  { note, onChange, save, requestAI, children, peers, ...props },
  ref,
) {
  const root = useRef<HTMLDivElement>(null),
    inner = useRef<SheetHandle>(null),
    latest = useRef(note),
    change = useRef(onChange),
    alive = useRef(true);
  latest.current = note;
  change.current = onChange;
  const pages = notebookPages(note),
    [active, setActive] = useState(() => savedPage(note.id)),
    page = pages.find((p) => p.id === active) || pages[0],
    index = pages.findIndex((p) => p.id === page.id);
  const [paperOpen, setPaperOpen] = useState(false),
    [error, setError] = useState(""),
    [jobs, setJobs] = useState<Record<string, Job>>({}),
    [digest, setDigest] = useState(""),
    [turn, setTurn] = useState<{
      from: string;
      direction: 1 | -1;
      id: string;
    }>();
  const capacity = useMemo(() => getPageCapacity(page.canvas), [page.canvas]);
  const pointerBusy = useRef(false),
    retainedTool = useRef<Parameters<SheetHandle["tool"]>[0]>("write"),
    preview = useRef<
      | {
          page: NotebookPage;
          image: string;
          left: number;
          top: number;
          width: number;
          height: number;
          transform: string;
        }
      | undefined
    >(undefined),
    jobsRunning = useRef(new Set<string>()),
    scrolls = useRef(new Map<string, { top: number; left: number }>());
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    // Recognition freshness is only useful once there is a conversion. Do not
    // serialize and hash the entire canvas after every handwritten stroke.
    let valid = true;
    setDigest("");
    if (!page.aiNotes && !jobs[page.id]?.draft) return;
    const timer = setTimeout(() => {
      void sourceDigest(page)
        .then((d) => {
          if (valid) setDigest(d);
        })
        .catch(() => {});
    }, 600);
    return () => {
      valid = false;
      clearTimeout(timer);
    };
  }, [page.id, page.body, page.canvas, !!page.aiNotes, !!jobs[page.id]?.draft]);
  useEffect(() => {
    // A prepared preview is optional decoration. Large pages never need DOM
    // screenshots, and navigation never waits for capture or image decoding.
    preview.current = undefined;
    if (capacity.items > 180 || capacity.points > 12000 || reducedMotion())
      return;
    let valid = true;
    const timer = setTimeout(() => {
      if (pointerBusy.current) return;
      const scroller =
          root.current?.querySelector<HTMLElement>(".sheet-scroll"),
        paper = scroller?.querySelector<HTMLElement>(".notebook-sheet-content");
      if (
        !scroller ||
        !paper ||
        !scroller.clientWidth ||
        !scroller.clientHeight
      )
        return;
      const view = {
        left: scroller.scrollLeft,
        top: scroller.scrollTop,
        width: scroller.clientWidth,
        height: scroller.clientHeight,
        transform: paper.style.transform,
      };
      void toPng(paper, {
        pixelRatio: 1,
        skipFonts: true,
        backgroundColor: "#fffef8",
        width: view.width,
        height: view.height,
        style: {
          transform: `translate(${-view.left}px,${-view.top}px) ${view.transform || ""}`,
          transformOrigin: "top left",
        },
        filter: (n) =>
          !(n instanceof HTMLElement) ||
          !n.matches(
            ".object-grip,.object-resize,.object-rotate,.selection-marquee,.prose-resize",
          ),
      })
        .then((image) => {
          if (valid && !pointerBusy.current)
            preview.current = { page, image, ...view };
        })
        .catch(() => {});
    }, 1200);
    return () => {
      valid = false;
      clearTimeout(timer);
    };
  }, [page.id, page.body, page.canvas, page.paperTexture]);
  useEffect(() => {
    try {
      sessionStorage.setItem("synapse-sheet:" + note.id, page.id);
    } catch {}
    inner.current?.tool(retainedTool.current);
    const scroller = root.current?.querySelector<HTMLElement>(".sheet-scroll");
    if (!scroller) return;
    const key = note.id + ":" + page.id;
    let position = scrolls.current.get(key);
    if (!position)
      try {
        position = JSON.parse(
          sessionStorage.getItem("synapse-sheet-scroll:" + key) || "null",
        );
      } catch {}
    scroller.scrollTop = position?.top || 0;
    scroller.scrollLeft = position?.left || 0;
    return () => {
      const p = { top: scroller.scrollTop, left: scroller.scrollLeft };
      scrolls.current.set(key, p);
      try {
        sessionStorage.setItem(
          "synapse-sheet-scroll:" + key,
          JSON.stringify(p),
        );
      } catch {}
    };
  }, [note.id, page.id]);
  useImperativeHandle(
    ref,
    () => ({
      diagram: (d) => inner.current?.diagram(d),
      tool: (t) => inner.current?.tool(t),
      image: (src, alt) => inner.current?.image(src, alt),
      drawing: (id) => inner.current?.drawing(id),
      video: (url, label) => inner.current?.video(url, label),
      editor: () => inner.current?.editor() || null,
      captureLink: () => inner.current?.captureLink?.(),
      block: (kind, md) => inner.current?.block(kind, md),
      flush: () => inner.current?.flush(),
      currentTool: () => inner.current?.currentTool() || retainedTool.current,
    }),
    [],
  );
  const patchPage = (id: string, patch: Partial<Omit<NotebookPage, "id">>) => {
    const next = changeNotebookPage(latest.current, id, patch);
    latest.current = next;
    change.current(id === next.id ? patch : { pages: next.pages });
  };
  const jobPatch = (id: string, patch: Partial<Job>) => {
    if (alive.current)
      setJobs((old) => ({ ...old, [id]: { ...old[id], ...patch } }));
  };
  const ai = (action: string, body: unknown) =>
    requestAI
      ? requestAI(action, body)
      : api("/notes/" + latest.current.id + "/" + action, body);
  async function generate(source: NotebookPage) {
    if (jobsRunning.current.has(source.id)) return;
    jobsRunning.current.add(source.id);
    jobPatch(source.id, { progress: "Preparing ink…", error: undefined });
    try {
      const regions = inkRegions(source);
      if (!regions.length)
        throw Error(
          "Write or draw on this sheet first. Imported drawing files can be converted through Resources.",
        );
      await save?.();
      const hash = await sourceDigest(source),
        parts: AINotes[] = [];
      for (let start = 0; start < regions.length; start += 2) {
        jobPatch(source.id, {
          progress: `Converting ${Math.min(start + 2, regions.length)} of ${regions.length} regions…`,
        });
        const images = [];
        for (const region of regions.slice(start, start + 2))
          images.push(await captureInk(source, region));
        parts.push(
          await ai("handwriting", {
            pageId: source.id,
            sourceDigest: hash,
            images,
            consent: true,
          }),
        );
      }
      const draft = {
        ...parts[0],
        text: parts
          .map((p) => p.text)
          .filter(Boolean)
          .join("\n\n"),
        diagrams: parts.flatMap((p) => p.diagrams),
      };
      if (draft.text.length > 200000 || draft.diagrams.length > 20)
        throw Error(
          "This conversion is too large for one AI section. Use shorter sheets and convert again.",
        );
      jobPatch(source.id, { draft, progress: undefined });
    } catch (e) {
      jobPatch(source.id, { progress: undefined, error: (e as Error).message });
    } finally {
      jobsRunning.current.delete(source.id);
    }
  }
  function go(next: NotebookPage, direction: 1 | -1) {
    if (next.id === page.id) return;
    retainedTool.current = inner.current?.currentTool() || retainedTool.current;
    inner.current?.flush();
    (document.activeElement as HTMLElement)?.blur();
    setError("");
    setPaperOpen(false);
    const scroller = root.current?.querySelector<HTMLElement>(".sheet-scroll"),
      paper = scroller?.querySelector<HTMLElement>(".notebook-sheet-content"),
      cached = preview.current,
      current = notebookPages(latest.current).find((p) => p.id === page.id);
    setTurn(
      cached &&
        current &&
        scroller &&
        paper &&
        cached.page.canvas === current.canvas &&
        cached.page.body === current.body &&
        cached.page.paperTexture === current.paperTexture &&
        cached.left === scroller.scrollLeft &&
        cached.top === scroller.scrollTop &&
        cached.width === scroller.clientWidth &&
        cached.height === scroller.clientHeight &&
        cached.transform === paper.style.transform &&
        !reducedMotion()
        ? { from: cached.image, direction, id: next.id }
        : undefined,
    );
    setActive(next.id);
  }
  function next() {
    inner.current?.flush();
    if (index < pages.length - 1) {
      void go(pages[index + 1], 1);
      return;
    }
    try {
      const added = addNotebookPage(latest.current);
      latest.current = added.note;
      change.current({ pages: added.note.pages });
      void go(added.page, 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const prefix = page.id === note.id ? "" : "page/" + page.id + "/",
    job = jobs[page.id] || {};
  const pagePeers = peers
    ?.filter((p) =>
      prefix ? p.cell.startsWith(prefix) : !p.cell.startsWith("page/"),
    )
    .map((p) => ({
      ...p,
      cell: prefix ? p.cell.slice(prefix.length) : p.cell,
    }));
  const navigation = (
    <div className="paper-navigation" aria-label="Notebook pages">
      <button
        aria-label="Previous sheet"
        disabled={index === 0}
        onClick={() => void go(pages[index - 1], -1)}
      >
        <ChevronLeft size={18} />
      </button>
      <label className="paper-page-picker">
        <select
          aria-label="Current sheet"
          value={page.id}
          onChange={(e) => {
            const i = pages.findIndex((p) => p.id === e.target.value);
            void go(pages[i], i > index ? 1 : -1);
          }}
        >
          {pages.map((p, i) => (
            <option key={p.id} value={p.id}>
              Page {i + 1} of {pages.length}
            </option>
          ))}
        </select>
      </label>
      <button
        aria-label={
          index === pages.length - 1 ? "Add next sheet" : "Next sheet"
        }
        onClick={next}
      >
        <ChevronRight size={18} />
      </button>
      {capacity.warning && (
        <div className="paper-capacity" role="status">
          <span>
            {capacity.full
              ? "This sheet is full."
              : "This sheet is getting heavy."}
          </span>
          <button onClick={next} title="Continue writing on the next sheet">
            Next page <ChevronRight size={14} />
          </button>
        </div>
      )}
      <div className="paper-corner-controls">
        <button
          className="paper-texture-button"
          aria-label="Paper texture"
          aria-expanded={paperOpen}
          onClick={() => setPaperOpen(!paperOpen)}
        >
          <span className={`paper-swatch texture-${page.paperTexture}`} />
          <Layers size={15} />
        </button>
        <button
          className="paper-turn-corner"
          aria-label="Turn page corner"
          title="Turn to the next sheet"
          onClick={(e) => {
            if (e.currentTarget.dataset.dragged === "true") {
              delete e.currentTarget.dataset.dragged;
              return;
            }
            next();
          }}
          onPointerDown={(e) => {
            e.currentTarget.dataset.start = String(e.clientX);
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerUp={(e) => {
            if (Number(e.currentTarget.dataset.start) - e.clientX > 30) {
              e.preventDefault();
              e.currentTarget.dataset.dragged = "true";
              next();
            }
          }}
        />
      </div>
      {paperOpen && (
        <div
          className="paper-texture-menu"
          role="group"
          aria-label="Choose paper texture"
        >
          {paperTextures.map((texture) => (
            <button
              key={texture}
              aria-pressed={page.paperTexture === texture}
              onClick={() => {
                patchPage(page.id, { paperTexture: texture });
                setPaperOpen(false);
              }}
            >
              <span className={`paper-swatch texture-${texture}`} />
              {texture[0].toUpperCase() + texture.slice(1)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
  const afterPaper = (
    <div className="paper-after">
      <div className="paper-end-actions">
        <button
          disabled={page.canvas.height >= 100000}
          onClick={() =>
            patchPage(page.id, {
              canvas: {
                ...page.canvas,
                height: Math.min(
                  100000,
                  Math.max(
                    page.canvas.height,
                    root.current?.querySelector<HTMLElement>(
                      ".notebook-sheet-content",
                    )?.offsetHeight || 0,
                  ) + 600,
                ),
              },
            })
          }
        >
          <Plus size={16} />
          Extend paper
        </button>
        <button onClick={next}>
          Next page
          <ChevronRight size={16} />
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      <AINotesPanel
        cell={prefix + "aiNotes"}
        key={page.id}
        value={page.aiNotes}
        draft={job.draft}
        progress={job.progress}
        error={job.error}
        stale={!!digest && digest !== (job.draft || page.aiNotes)?.sourceDigest}
        onChange={(aiNotes) => patchPage(page.id, { aiNotes })}
        onDraft={(draft) => jobPatch(page.id, { draft })}
        onGenerate={() => void generate(page)}
        onAccept={() => {
          if (job.draft) {
            patchPage(page.id, { aiNotes: job.draft });
            jobPatch(page.id, { draft: undefined });
          }
        }}
        onDiscard={() => jobPatch(page.id, { draft: undefined })}
        requestDiagram={(description) =>
          ai("ink-diagram", { pageId: page.id, description, consent: true })
        }
      />
    </div>
  );
  return (
    <div
      className="paged-notebook"
      data-page-id={page.id}
      ref={root}
      onPointerDownCapture={() => {
        pointerBusy.current = true;
      }}
      onPointerUpCapture={() => {
        pointerBusy.current = false;
      }}
      onPointerCancelCapture={() => {
        pointerBusy.current = false;
      }}
    >
      <NotebookSheet
        {...props}
        key={note.id + ":" + page.id}
        ref={inner}
        peers={pagePeers}
        value={page.canvas}
        onChange={(canvas) => patchPage(page.id, { canvas })}
        paperTexture={page.paperTexture}
        navigation={navigation}
        afterPaper={afterPaper}
        overlay={
          turn && (
            <div className="page-turn-overlay">
              <PageTurn
                key={turn.id}
                {...turn}
                onDone={() => {
                  setTurn(undefined);
                }}
              />
            </div>
          )
        }
      >
        {children(page, (body) => patchPage(page.id, { body }), prefix)}
      </NotebookSheet>
    </div>
  );
});
