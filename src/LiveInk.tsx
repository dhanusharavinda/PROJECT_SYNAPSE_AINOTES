import { forwardRef, useImperativeHandle, useRef, useEffect } from "react";
import { penOutline } from "./penStroke";
import type { CanvasItem } from "./types";

export interface LiveInkHandle {
  draw: (strokes: CanvasItem[]) => void;
  clear: () => void;
}

// The active stroke has its own paint layer. Pointer samples never rerender the
// page's editors or thousands of already completed objects.
export default forwardRef<LiveInkHandle, { behind?: boolean }>(function LiveInk(
  { behind },
  ref,
) {
  const root = useRef<SVGSVGElement>(null);
  const pending = useRef<CanvasItem[]>([]);
  const frame = useRef<number | undefined>(undefined);
  const rendered = useRef(
    new Map<string, { node: SVGPathElement; count: number }>(),
  );
  function clear() {
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    frame.current = undefined;
    pending.current = [];
    rendered.current.clear();
    root.current?.replaceChildren();
  }
  useEffect(() => clear, []);
  useImperativeHandle(ref, () => ({
    clear,
    draw(strokes) {
      pending.current = strokes;
      if (frame.current !== undefined) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = undefined;
        const svg = root.current;
        if (!svg) return;
        for (const stroke of pending.current) {
          const points = stroke.points || [];
          let entry = rendered.current.get(stroke.id);
          if (entry?.count === points.length) continue;
          if (!entry) {
            const node = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "path",
            );
            node.setAttribute("fill", stroke.color || "#24392f");
            node.setAttribute("opacity", String(stroke.opacity ?? 1));
            node.setAttribute(
              "transform",
              `translate(${stroke.x} ${stroke.y})`,
            );
            svg.append(node);
            entry = { node, count: 0 };
            rendered.current.set(stroke.id, entry);
          }
          const radius = (stroke.strokeWidth || 2.4) / 2;
          const [x, y] = points[0] || [0, 0];
          entry.node.setAttribute(
            "d",
            points.length < 2
              ? `M${x - radius},${y}a${radius},${radius} 0 1,0 ${radius * 2},0a${radius},${radius} 0 1,0 ${-radius * 2},0`
              : penOutline(stroke),
          );
          entry.count = points.length;
        }
      });
    },
  }));
  return (
    <svg
      ref={root}
      className="sheet-live-ink"
      style={{ zIndex: behind ? 1 : 100000 }}
      aria-hidden="true"
    />
  );
});
