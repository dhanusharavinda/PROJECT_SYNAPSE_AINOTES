import type {
  Note,
  NotebookPage,
  NoteCanvas,
  CanvasItem,
  PaperTexture,
} from "./types";
import { bodyOf } from "./content";

export const paperTextures: PaperTexture[] = [
  "plain",
  "ruled",
  "dotted",
  "grid",
];
export const blankCanvas = (width = 1100): NoteCanvas => ({
  width,
  height: 900,
  items: [],
});
export function notebookPages(note: Note): NotebookPage[] {
  return [
    {
      id: note.id,
      body: bodyOf(note),
      canvas: note.canvas || blankCanvas(),
      paperTexture:
        note.paperTexture ||
        (note.theme === "paper"
          ? "ruled"
          : note.theme === "dotted"
            ? "dotted"
            : "plain"),
      ...(note.aiNotes ? { aiNotes: note.aiNotes } : {}),
    },
    ...(note.pages || []),
  ];
}
export function notebookPage(note: Note, id: string) {
  return notebookPages(note).find((p) => p.id === id);
}
export function changeNotebookPage(
  note: Note,
  id: string,
  patch: Partial<Omit<NotebookPage, "id">>,
): Note {
  if (id === note.id) return { ...note, ...patch } as Note;
  if (!note.pages?.some((p) => p.id === id))
    throw new Error("This sheet no longer exists. Reopen the note.");
  return {
    ...note,
    pages: note.pages.map((p) => (p.id === id ? { ...p, ...patch } : p)),
  };
}
export function addNotebookPage(note: Note): {
  note: Note;
  page: NotebookPage;
} {
  if ((note.pages?.length || 0) >= 100)
    throw new Error(
      "This note has 101 sheets. Create another note to continue.",
    );
  const page: NotebookPage = {
    id: crypto.randomUUID(),
    body: "",
    canvas: blankCanvas(note.canvas?.width),
    paperTexture: notebookPages(note).at(-1)!.paperTexture,
  };
  return { page, note: { ...note, pages: [...(note.pages || []), page] } };
}
export function pageSource(page: NotebookPage) {
  const stable = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(stable)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value)
              .filter(([, v]) => v !== undefined)
              .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
              .map(([key, v]) => [key, stable(v)]),
          )
        : value;
  return JSON.stringify(stable({ body: page.body, canvas: page.canvas }));
}

const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const pagePattern = new RegExp(
  `^page/(${uuid})/(body|canvasSize|paperTexture|aiNotes|item/(${uuid}))$`,
  "i",
);
export function pageCell(cell: string) {
  const m = cell.match(pagePattern);
  return m ? { pageId: m[1], field: m[2], itemId: m[3] } : undefined;
}
export const isNotebookExtraCell = (cell: string) =>
  ["pageOrder", "paperTexture", "aiNotes"].includes(cell) || !!pageCell(cell);
export function notebookExtraValue(note: Note, cell: string): unknown {
  if (cell === "pageOrder") return (note.pages || []).map((p) => p.id);
  if (cell === "paperTexture") return note.paperTexture ?? null;
  if (cell === "aiNotes") return note.aiNotes ?? null;
  const address = pageCell(cell);
  if (!address) throw new Error("Unknown sheet field.");
  const page = note.pages?.find((p) => p.id === address.pageId);
  if (!page) return null;
  if (address.itemId)
    return page.canvas.items.find((i) => i.id === address.itemId) ?? null;
  if (address.field === "canvasSize")
    return {
      width: page.canvas.width || 1100,
      height: page.canvas.height,
      ...(page.canvas.prose ? { prose: page.canvas.prose } : {}),
    };
  return page[address.field as "body" | "paperTexture" | "aiNotes"] ?? null;
}
export function extraNotebookCells(note: Note): string[] {
  return [
    "pageOrder",
    "paperTexture",
    "aiNotes",
    ...(note.pages || []).flatMap((p) =>
      [
        "body",
        "canvasSize",
        "paperTexture",
        "aiNotes",
        ...p.canvas.items.map((i) => "item/" + i.id),
      ].map((field) => `page/${p.id}/${field}`),
    ),
  ];
}
export function applyNotebookExtra(
  note: Note,
  cell: string,
  value: unknown,
): Note {
  if (cell === "pageOrder") {
    if (
      !Array.isArray(value) ||
      value.length > 100 ||
      value.some(
        (id) =>
          typeof id !== "string" ||
          !new RegExp(`^${uuid}$`, "i").test(id) ||
          id === note.id,
      ) ||
      new Set(value).size !== value.length
    )
      throw new Error("Choose unique valid sheet identities.");
    return {
      ...note,
      pages: value.map(
        (id) =>
          note.pages?.find((p) => p.id === id) || {
            id,
            body: "",
            canvas: blankCanvas(note.canvas?.width),
            paperTexture: "plain" as const,
          },
      ),
    };
  }
  if (cell === "paperTexture" || cell === "aiNotes") {
    const next = { ...note };
    if (value === null) delete next[cell];
    else (next as any)[cell] = value;
    return next;
  }
  const address = pageCell(cell);
  if (!address || !note.pages?.some((p) => p.id === address.pageId)) {
    if (address && value === null) return note;
    throw new Error("This sheet no longer exists. Reopen the note.");
  }
  return {
    ...note,
    pages: note.pages.map((page) => {
      if (page.id !== address.pageId) return page;
      if (address.itemId) {
        if (value !== null && (value as CanvasItem)?.id !== address.itemId)
          throw new Error("Object identity cannot change.");
        const items = page.canvas.items.filter((i) => i.id !== address.itemId);
        const index = page.canvas.items.findIndex(
          (i) => i.id === address.itemId,
        );
        if (value !== null)
          items.splice(
            index < 0 ? items.length : index,
            0,
            value as CanvasItem,
          );
        return { ...page, canvas: { ...page.canvas, items } };
      }
      if (address.field === "canvasSize")
        return {
          ...page,
          canvas: { ...(value as object), items: page.canvas.items },
        } as NotebookPage;
      const next = { ...page };
      if (address.field === "aiNotes" && value === null) delete next.aiNotes;
      else (next as any)[address.field] = value;
      return next;
    }),
  };
}
export function noteDrawingItems(note: Note) {
  return [note.canvas, ...(note.pages || []).map((p) => p.canvas)].flatMap(
    (c) => c?.items || [],
  );
}
