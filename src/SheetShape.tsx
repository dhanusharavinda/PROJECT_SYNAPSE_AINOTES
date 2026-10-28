import type { CanvasItem } from "./types";
import { penOutline } from "./penStroke";
import { memo } from "react";
function SheetShape({ item }: { item: CanvasItem }) {
  const color = item.color || "#24392f",
    sw = item.strokeWidth || 2.4,
    w = item.width,
    h = item.height;
  const pts = item.points || [
      [4, 4],
      [w - 4, h - 4],
    ],
    marker = "tip-" + item.id;
  const common = {
    fill: item.fill || "none",
    stroke: color,
    strokeWidth: sw,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg
      className="sheet-shape"
      viewBox={`0 0 ${item.kind === "paint" ? item.points?.[0]?.[0] || w : w} ${item.kind === "paint" ? item.points?.[0]?.[1] || h : h}`}
      preserveAspectRatio="none"
      aria-label={item.kind === "pen" ? "Hand drawing" : item.kind}
      style={{ opacity: item.opacity || 1 }}
    >
      <defs>
        <marker
          id={marker}
          markerWidth="8"
          markerHeight="8"
          refX="6"
          refY="4"
          orient="auto"
        >
          <path d="M1 1 L6 4 L1 7" {...common} strokeWidth="1.3" />
        </marker>
      </defs>
      {item.kind === "paint" ? (
        <path d={item.text || ""} fill={color} />
      ) : item.kind === "rectangle" ? (
        <rect
          x="4"
          y="4"
          width={Math.max(1, w - 8)}
          height={Math.max(1, h - 8)}
          rx="2"
          {...common}
        />
      ) : item.kind === "ellipse" ? (
        <ellipse
          cx={w / 2}
          cy={h / 2}
          rx={Math.max(1, w / 2 - 4)}
          ry={Math.max(1, h / 2 - 4)}
          {...common}
        />
      ) : item.kind === "diamond" ? (
        <polygon
          points={`${w / 2},4 ${w - 4},${h / 2} ${w / 2},${h - 4} 4,${h / 2}`}
          {...common}
        />
      ) : item.kind === "triangle" ? (
        <polygon
          points={`${w / 2},4 ${w - 4},${h - 4} 4,${h - 4}`}
          {...common}
        />
      ) : pts.length === 1 ||
        (item.kind === "pen" &&
          pts.every(
            (p) => Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]) < 0.1,
          )) ? (
        <circle cx={pts[0][0]} cy={pts[0][1]} r={sw / 2} fill={color} />
      ) : item.kind === "pen" ? (
        <path d={penOutline(item)} fill={color} />
      ) : (
        <polyline
          points={pts.map((p) => p.join(",")).join(" ")}
          {...common}
          markerEnd={item.kind === "arrow" ? `url(#${marker})` : undefined}
        />
      )}
    </svg>
  );
}
export default memo(SheetShape);
