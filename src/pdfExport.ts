export type PdfLink = {
  x: number;
  y: number;
  width: number;
  height: number;
  url?: string;
  noteId?: string;
};
export type PdfSlide = { image: string; noteId: string; links: PdfLink[] };

export function clipPdfLink(
  rect: { left: number; top: number; right: number; bottom: number },
  clip: { left: number; top: number; right: number; bottom: number },
  origin: { left: number; top: number; width: number; height: number },
) {
  const left = Math.max(rect.left, clip.left),
    top = Math.max(rect.top, clip.top);
  const right = Math.min(rect.right, clip.right),
    bottom = Math.min(rect.bottom, clip.bottom);
  if (right <= left || bottom <= top) return null;
  return {
    x: ((left - origin.left) * 800) / origin.width,
    y: ((top - origin.top) * 1000) / origin.height,
    width: ((right - left) * 800) / origin.width,
    height: ((bottom - top) * 1000) / origin.height,
  };
}

export function collectPdfLinks(root: HTMLElement): PdfLink[] {
  const origin = root.getBoundingClientRect();
  const clip = root.querySelector(".slide-window")!.getBoundingClientRect();
  const links: PdfLink[] = [];
  for (const anchor of root.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const raw = anchor.getAttribute("href") || "";
    const parsed = new URL(raw, location.href);
    const noteId =
      parsed.origin === location.origin && parsed.pathname === "/"
        ? parsed.searchParams.get("note")
        : null;
    // Never put local session URLs, private file URLs or executable schemes in a shared PDF.
    const external =
      /^(https?:|mailto:|tel:)/i.test(raw) &&
      parsed.origin !== location.origin &&
      !/^(localhost|127\.|\[::1\])/.test(parsed.hostname);
    if (!noteId && !external) continue;
    const target = noteId ? { noteId } : { url: raw };
    const range = document.createRange();
    range.selectNodeContents(anchor);
    const rects = [...range.getClientRects()];
    if (!rects.length) rects.push(anchor.getBoundingClientRect());
    for (const rect of rects) {
      const box = clipPdfLink(rect, clip, origin);
      if (box) links.push({ ...box, ...target });
    }
    const preview = anchor
      .closest(".note-video")
      ?.querySelector(".preview-video");
    if (preview) {
      const box = clipPdfLink(preview.getBoundingClientRect(), clip, origin);
      if (box) links.push({ ...box, ...target });
    }
  }
  return links;
}

export async function writePdf(slides: PdfSlide[]) {
  if (!slides.length) throw Error("Prepare the PDF first.");
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: [800, 1000], compress: true });
  const destinations = new Map<string, number>();
  slides.forEach((slide, index) => {
    if (!destinations.has(slide.noteId))
      destinations.set(slide.noteId, index + 1);
  });
  slides.forEach((slide, index) => {
    if (index) pdf.addPage([800, 1000]);
    pdf.addImage(slide.image, "JPEG", 0, 0, 800, 1000);
    for (const link of slide.links) {
      const pageNumber = link.noteId
        ? destinations.get(link.noteId)
        : undefined;
      if (pageNumber || link.url)
        pdf.link(
          link.x,
          link.y,
          link.width,
          link.height,
          pageNumber ? { pageNumber, top: 0 } : { url: link.url },
        );
    }
  });
  return pdf;
}
