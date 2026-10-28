export function enclosedRegion(
  alpha: Uint8Array,
  width: number,
  height: number,
  sx: number,
  sy: number,
) {
  if (width * height > 4000000) throw Error("Fill a smaller area.");
  const x = Math.floor(sx),
    y = Math.floor(sy);
  if (x < 0 || y < 0 || x >= width || y >= height || alpha[y * width + x] > 32)
    throw Error("Click inside a closed outline.");
  const visited = new Uint8Array(width * height),
    queue = new Int32Array(width * height);
  let read = 0,
    write = 0,
    minX = x,
    maxX = x,
    minY = y,
    maxY = y;
  queue[write++] = y * width + x;
  visited[y * width + x] = 1;
  while (read < write) {
    const i = queue[read++],
      px = i % width,
      py = Math.floor(i / width);
    if (px === 0 || py === 0 || px === width - 1 || py === height - 1)
      throw Error("The outline is open. Close the gap before filling.");
    minX = Math.min(minX, px);
    maxX = Math.max(maxX, px);
    minY = Math.min(minY, py);
    maxY = Math.max(maxY, py);
    for (const n of [i - 1, i + 1, i - width, i + width])
      if (!visited[n] && alpha[n] <= 32) {
        visited[n] = 1;
        queue[write++] = n;
      }
  }
  let path = "";
  for (let row = minY; row <= maxY; row++) {
    let start = -1;
    for (let col = minX; col <= maxX + 1; col++) {
      const filled = col <= maxX && visited[row * width + col];
      if (filled && start < 0) start = col;
      if (!filled && start >= 0) {
        path += `M${start - minX} ${row - minY}h${col - start}v1h${start - col}z`;
        start = -1;
      }
    }
    if (path.length > 190000)
      throw Error("This region is too detailed. Fill a smaller area.");
  }
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    path,
  };
}
export async function regionOnSheet(root: HTMLElement, x: number, y: number) {
  const width = Math.min(1600, Math.ceil(root.clientWidth)),
    height = Math.min(1600, Math.ceil(root.clientHeight)),
    canvas = document.createElement("canvas");
  const left = Math.max(
      0,
      Math.min(root.clientWidth - width, Math.floor(x - width / 2)),
    ),
    top = Math.max(
      0,
      Math.min(root.clientHeight - height, Math.floor(y - height / 2)),
    );
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  for (const svg of root.querySelectorAll<SVGSVGElement>(".sheet-shape")) {
    const object = svg.closest<HTMLElement>(".sheet-object")!;
    if (object.classList.contains("kind-paint")) continue;
    const r = object.getBoundingClientRect(),
      base = root.getBoundingClientRect(),
      img = new Image(),
      url = URL.createObjectURL(
        new Blob([new XMLSerializer().serializeToString(svg)], {
          type: "image/svg+xml",
        }),
      );
    try {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(Error("Could not read this outline."));
        img.src = url;
      });
      const width = object.offsetWidth,
        height = object.offsetHeight;
      const rotation = (Number(object.dataset.rotation || 0) * Math.PI) / 180;
      context.save();
      context.translate(
        object.offsetLeft - left + width / 2,
        object.offsetTop - top + height / 2,
      );
      context.rotate(rotation);
      context.drawImage(img, -width / 2, -height / 2, width, height);
      context.restore();
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const rgba = context.getImageData(0, 0, width, height).data,
    alpha = new Uint8Array(width * height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
  const region = enclosedRegion(alpha, width, height, x - left, y - top);
  return { ...region, x: region.x + left, y: region.y + top };
}
