import type { CanvasItem } from "./types";
export function inkBounds(item: CanvasItem) {
  const angle = ((item.rotation || 0) * Math.PI) / 180,
    c = Math.abs(Math.cos(angle)),
    s = Math.abs(Math.sin(angle));
  const width = item.width * c + item.height * s,
    height = item.width * s + item.height * c;
  return {
    x: item.x + (item.width - width) / 2,
    y: item.y + (item.height - height) / 2,
    width,
    height,
  };
}
