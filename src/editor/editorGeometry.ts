import { type Adjust, adjustIdle, applyAdjust } from "./editorAdjust";

export type CropBox = { x: number; y: number; w: number; h: number };
export type Handle = "body" | "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export const ZOOM_MIN = 0.05;
export const ZOOM_MAX = 4;
/** Desde este tamaño de vista (píxeles) los ajustes se calculan en un Worker. */
export const ASYNC_MIN_PIXELS = 300_000;

export function workingSize(iw: number, ih: number, rot: number) {
  return rot % 180 === 0 ? { w: iw, h: ih } : { w: ih, h: iw };
}

export function drawOriented(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  rot: number,
  flipH: boolean,
  flipV: boolean,
  tilt = 0,
) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const { w: W, h: H } = workingSize(iw, ih, rot);
  ctx.save();
  ctx.filter = "none";
  ctx.translate(W / 2, H / 2);
  if (tilt) {
    const rad = (tilt * Math.PI) / 180;
    const sin = Math.abs(Math.sin(rad));
    const cos = Math.abs(Math.cos(rad));
    const cover = Math.max((W * cos + H * sin) / W, (W * sin + H * cos) / H);
    ctx.rotate(rad);
    ctx.scale(cover, cover);
  }
  ctx.rotate((rot * Math.PI) / 180);
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  ctx.drawImage(img, -iw / 2, -ih / 2);
  ctx.restore();
}

export function clampCrop(c: CropBox, W: number, H: number): CropBox {
  const min = 32;
  let { x, y, w, h } = c;
  w = Math.max(min, Math.min(W, w));
  h = Math.max(min, Math.min(H, h));
  x = Math.max(0, Math.min(W - w, x));
  y = Math.max(0, Math.min(H - h, y));
  return { x, y, w, h };
}

export function fitRatio(W: number, H: number, ratio: number): CropBox {
  let w = W;
  let h = w / ratio;
  if (h > H) {
    h = H;
    w = h * ratio;
  }
  return clampCrop({ x: (W - w) / 2, y: (H - h) / 2, w, h }, W, H);
}

export function clampZoom(n: number) {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, n));
}

export function drawMarco(ctx: CanvasRenderingContext2D, w: number, h: number, amt: number) {
  if (!amt) return;
  const t = Math.max(3, Math.round(Math.min(w, h) * (0.012 + (Math.abs(amt) / 100) * 0.1)));
  const rgb = amt < 0 ? "255,255,255" : "0,0,0";
  const a = Math.min(1, Math.abs(amt) / 70);
  const band = t * 1.6;
  ctx.save();
  const sides: [CanvasGradient, number, number, number, number][] = [
    [ctx.createLinearGradient(0, 0, 0, band), 0, 0, w, band],
    [ctx.createLinearGradient(0, h, 0, h - band), 0, h - band, w, band],
    [ctx.createLinearGradient(0, 0, band, 0), 0, 0, band, h],
    [ctx.createLinearGradient(w, 0, w - band, 0), w - band, 0, band, h],
  ];
  for (const [g, x, y, bw, bh] of sides) {
    g.addColorStop(0, `rgba(${rgb},${a})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, bw, bh);
  }
  ctx.restore();
}

export function raster(
  img: HTMLImageElement,
  rot: number,
  flipH: boolean,
  flipV: boolean,
  width: number,
  height: number,
  adj: Adjust | null,
  tilt = 0,
) {
  const { w: W, h: H } = workingSize(img.naturalWidth, img.naturalHeight, rot);
  const src = document.createElement("canvas");
  src.width = W;
  src.height = H;
  const sctx = src.getContext("2d");
  if (!sctx) return null;
  drawOriented(sctx, img, rot, flipH, flipV, tilt);
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const octx = out.getContext("2d");
  if (!octx) return null;
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(src, 0, 0, width, height);
  if (adj && !adjustIdle(adj)) {
    const pix = octx.getImageData(0, 0, width, height);
    applyAdjust(pix.data, width, height, adj);
    octx.putImageData(pix, 0, 0);
  }
  if (adj?.marco) drawMarco(octx, width, height, adj.marco);
  return out;
}
