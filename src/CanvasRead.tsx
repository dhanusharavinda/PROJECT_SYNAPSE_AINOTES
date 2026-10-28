import { useEffect, useRef, useState, type ReactNode } from "react";
import type { NoteCanvas } from "./types";
import { fileUrl } from "./api";
import { MD } from "./ui";
import SheetShape from "./SheetShape";
import VideoCard from "./VideoCard";
export default function CanvasRead({
  canvas,
  share,
  children,
}: {
  canvas: NoteCanvas;
  share?: string;
  children?: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null),
    page = useRef<HTMLDivElement>(null),
    [scale, setScale] = useState(1),
    [height, setHeight] = useState(canvas.height),
    width = canvas.width || 1000;
  useEffect(() => {
    if (!root.current) return;
    const measure = () => {
        setScale((root.current?.clientWidth || width) / width);
        setHeight(Math.max(canvas.height, page.current?.scrollHeight || 0));
      },
      observer = new ResizeObserver(measure);
    observer.observe(root.current);
    const prose = page.current?.querySelector(".reading-prose");
    if (prose) observer.observe(prose);
    measure();
    return () => observer.disconnect();
  }, [width, canvas.height, children]);
  return (
    <div
      ref={root}
      className="reading-sheet"
      style={{ position: "relative", minHeight: height * scale }}
      aria-label="Note drawings and placed text"
    >
      <div
        ref={page}
        className="reading-page"
        style={{
          position: "absolute",
          width,
          height: canvas.height,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {children && <div className="reading-prose">{children}</div>}
        {canvas.items.map((item, index) => {
          const attachment = item.src?.match(
              /^(?:\.\.\/|\/files\/)(attachments|drawings)\/([-a-zA-Z0-9]+\.[a-zA-Z0-9]+)$/,
            ),
            src =
              item.kind === "drawing"
                ? fileUrl("drawings", item.drawingId + ".svg", share)
                : attachment
                  ? fileUrl(attachment[1], attachment[2], share)
                  : "";
          return (
            <div
              key={item.id}
              className={"reading-object kind-" + item.kind}
              style={{
                position: "absolute",
                left: item.x,
                top: item.y,
                width: item.width,
                height: item.height,
                transformOrigin: "top left",
                fontSize:
                  item.kind === "text" ? 16 * (item.textScale || 1) : undefined,
              }}
            >
              {item.kind === "text" || item.kind === "table" ? (
                <MD text={item.text || ""} share={share} />
              ) : item.kind === "video" ? (
                <VideoCard url={item.src || ""} title={item.text} />
              ) : item.kind === "image" || item.kind === "drawing" ? (
                <img
                  src={src}
                  alt={item.text || "Note drawing"}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    display: "block",
                  }}
                />
              ) : (
                <SheetShape item={item} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
