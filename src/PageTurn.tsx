import { useEffect, useRef } from "react";
type Point = [number, number];
// Fold a prepared page from its top corner. The live editor stays still.
export default function PageTurn({
  from,
  to,
  direction,
  onDone,
}: {
  from: string;
  to?: string;
  direction: 1 | -1;
  onDone: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null),
    done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    let frame = 0,
      cancelled = false;
    const a = new Image(),
      b = new Image();
    a.src = from;
    if (to) b.src = to;
    const timeout = setTimeout(() => {
      if (!cancelled) done.current();
    }, 500);
    void Promise.all([a.decode(), to ? b.decode() : Promise.resolve()])
      .then(() => {
        const canvas = ref.current;
        if (!canvas || cancelled) return;
        const width = canvas.clientWidth,
          height = canvas.clientHeight,
          dpr = Math.min(2, devicePixelRatio || 1);
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          done.current();
          return;
        }
        ctx.scale(dpr, dpr);
        const polygon = (points: Point[]) => {
          ctx.beginPath();
          points.forEach(([x, y], i) =>
            i ? ctx.lineTo(x, y) : ctx.moveTo(x, y),
          );
          ctx.closePath();
        };
        const paint = (img: HTMLImageElement) => {
          ctx.save();
          if (direction < 0) {
            ctx.translate(width, 0);
            ctx.scale(-1, 1);
          }
          ctx.drawImage(img, 0, 0, width, height);
          ctx.restore();
        };
        const started = performance.now();
        const draw = (now: number) => {
          if (cancelled) return;
          const p = Math.min(1, (now - started) / 260),
            ease = p * p * (3 - 2 * p),
            fold = width * (1 - 2.2 * ease),
            slope = ((0.72 * width) / height) * (1 - ease);
          const signed = ([x, y]: Point) => x - slope * y - fold;
          const clip = (left: boolean) => {
            const result: Point[] = [],
              page: Point[] = [
                [0, 0],
                [width, 0],
                [width, height],
                [0, height],
              ];
            let previous = page.at(-1)!,
              dp = signed(previous),
              inside = left ? dp <= 0 : dp >= 0;
            for (const point of page) {
              const d = signed(point),
                nextInside = left ? d <= 0 : d >= 0;
              if (inside !== nextInside) {
                const t = dp / (dp - d);
                result.push([
                  previous[0] + t * (point[0] - previous[0]),
                  previous[1] + t * (point[1] - previous[1]),
                ]);
              }
              if (nextInside) result.push(point);
              previous = point;
              dp = d;
              inside = nextInside;
            }
            return result;
          };
          ctx.clearRect(0, 0, width, height);
          ctx.save();
          if (direction < 0) {
            ctx.translate(width, 0);
            ctx.scale(-1, 1);
          }
          if (to) paint(b);
          const front = clip(true);
          if (front.length > 2) {
            ctx.save();
            polygon(front);
            ctx.clip();
            paint(a);
            ctx.restore();
          }
          const norm = Math.hypot(1, slope),
            nx = 1 / norm,
            ny = -slope / norm,
            offset = fold / norm;
          const back = clip(false).map(([x, y]): Point => {
            const distance = nx * x + ny * y - offset;
            return [x - 2 * nx * distance, y - 2 * ny * distance];
          });
          if (back.length > 2) {
            ctx.save();
            polygon(back);
            ctx.shadowColor = "rgba(24,39,29,.22)";
            ctx.shadowBlur = 22 * Math.sin(Math.PI * p);
            ctx.shadowOffsetX = -8 * Math.sin(Math.PI * p);
            ctx.fillStyle = "#f6f5e9";
            ctx.fill();
            ctx.restore();
            ctx.save();
            polygon(back);
            ctx.clip();
            const midY = height / 2,
              midX = fold + slope * midY,
              depth = Math.max(12, width * 0.12 * Math.sin(Math.PI * p));
            const shade = ctx.createLinearGradient(
              midX - nx * depth,
              midY - ny * depth,
              midX + nx * 4,
              midY + ny * 4,
            );
            shade.addColorStop(0, "rgba(255,255,255,0)");
            shade.addColorStop(0.6, "rgba(255,255,255,.45)");
            shade.addColorStop(1, "rgba(74,80,57,.18)");
            ctx.fillStyle = shade;
            ctx.fillRect(0, 0, width, height);
            ctx.restore();
          }
          ctx.restore();
          if (p < 1) frame = requestAnimationFrame(draw);
          else done.current();
        };
        frame = requestAnimationFrame(draw);
      })
      .catch(() => {
        if (!cancelled) done.current();
      });
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      cancelAnimationFrame(frame);
    };
  }, [from, to, direction]);
  return <canvas ref={ref} className="page-turn-canvas" aria-hidden="true" />;
}
