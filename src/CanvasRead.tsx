import { useEffect, useRef, useState } from "react";
import type { NoteCanvas } from "./types";
import { fileUrl } from "./api";
import { MD } from "./ui";

export default function CanvasRead({
  canvas,
  share,
}: {
  canvas: NoteCanvas;
  share?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    if (!root.current) return;
    const observer = new ResizeObserver(() =>
      setScale((root.current?.clientWidth || 1000) / 1000),
    );
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={root}
      className="reading-sheet"
      style={{ position: "relative", minHeight: canvas.height * scale }}
      aria-label="Note drawings and placed text"
    >
      {canvas.items.map((item) => (
        <div
          key={item.id}
          style={{
            position: "absolute",
            left: item.x / 10 + "%",
            top: item.y * scale,
            width: item.width / 10 + "%",
            minHeight: item.height * scale,
          }}
        >
          {item.kind === "text" || item.kind === "table" ? (
            <MD text={item.text || ""} share={share} />
          ) : item.kind === "image" || item.kind === "drawing" ? (
            (() => {
              const attachment = item.src?.match(
                /^(?:\.\.\/|\/files\/)(attachments|drawings)\/([-a-zA-Z0-9]+\.[a-zA-Z0-9]+)$/,
              );
              const src =
                item.kind === "drawing"
                  ? fileUrl("drawings", item.drawingId + ".svg", share)
                  : attachment
                    ? fileUrl(attachment[1], attachment[2], share)
                    : "";
              return (
                <img
                  src={src}
                  alt={item.text || "Note drawing"}
                  style={{ width: "100%", display: "block" }}
                />
              );
            })()
          ) : (
            <svg
              viewBox={`0 0 ${item.width} ${item.height}`}
              style={{
                width: "100%",
                height: item.height * scale,
                display: "block",
                overflow: "visible",
              }}
            >
              <defs>
                <marker
                  id={"read-arrow-" + item.id}
                  markerWidth="8"
                  markerHeight="8"
                  refX="7"
                  refY="4"
                  orient="auto"
                >
                  <path
                    d="M1 1 L7 4 L1 7"
                    fill="none"
                    stroke={item.color || "#24392f"}
                  />
                </marker>
              </defs>
              {item.kind === "rectangle" ? (
                <rect
                  x="4"
                  y="4"
                  width={Math.max(1, item.width - 8)}
                  height={Math.max(1, item.height - 8)}
                  rx="4"
                  fill="none"
                  stroke={item.color || "#24392f"}
                  strokeWidth="2"
                />
              ) : (
                <polyline
                  points={item.points
                    ?.map((point) => point.join(","))
                    .join(" ")}
                  fill="none"
                  stroke={item.color || "#24392f"}
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  markerEnd={
                    item.kind === "arrow"
                      ? `url(#read-arrow-${item.id})`
                      : undefined
                  }
                />
              )}
            </svg>
          )}
        </div>
      ))}
    </div>
  );
}
