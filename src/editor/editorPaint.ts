export type PaintFx = "blur" | "color" | "pixel" | "clone" | "heal";

export type PaintBox = { x: number; y: number; w: number; h: number };

export function parseHex(hex: string): { r: number; g: number; b: number } {
  const raw = (hex || "#000000").replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw.padEnd(6, "0");
  return {
    r: parseInt(full.slice(0, 2), 16) || 0,
    g: parseInt(full.slice(2, 4), 16) || 0,
    b: parseInt(full.slice(4, 6), 16) || 0,
  };
}

export function maskBBox(mask: Uint8ClampedArray, w: number, h: number, pad: number): PaintBox | null {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (mask[(row + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  const x = Math.max(0, x0 - pad);
  const y = Math.max(0, y0 - pad);
  return { x, y, w: Math.min(w, x1 + 1 + pad) - x, h: Math.min(h, y1 + 1 + pad) - y };
}

function blurRadius(strength: number) {
  return Math.max(1, Math.round(2 + (strength / 100) * 28));
}

function pixelCell(strength: number) {
  return Math.max(4, Math.round(4 + (strength / 100) * 36));
}

function boxBlurChannel(
  src: Uint8ClampedArray,
  dest: Uint8ClampedArray,
  w: number,
  _h: number,
  box: PaintBox,
  r: number,
  ch: number,
) {
  const tmp = new Float32Array(box.w * box.h);
  const x0 = box.x;
  const y0 = box.y;
  for (let y = 0; y < box.h; y++) {
    let sum = 0;
    let count = 0;
    for (let x = -r; x <= r; x++) {
      const xx = Math.min(w - 1, Math.max(0, x0 + x));
      sum += src[((y0 + y) * w + xx) * 4 + ch];
      count++;
    }
    tmp[y * box.w] = sum / count;
    for (let x = 1; x < box.w; x++) {
      const add = Math.min(w - 1, Math.max(0, x0 + x + r));
      const rem = Math.min(w - 1, Math.max(0, x0 + x - r - 1));
      sum += src[((y0 + y) * w + add) * 4 + ch] - src[((y0 + y) * w + rem) * 4 + ch];
      tmp[y * box.w + x] = sum / count;
    }
  }
  for (let x = 0; x < box.w; x++) {
    let sum = 0;
    let count = 0;
    for (let y = -r; y <= r; y++) {
      const yy = Math.min(box.h - 1, Math.max(0, y));
      sum += tmp[yy * box.w + x];
      count++;
    }
    dest[((y0) * w + (x0 + x)) * 4 + ch] = sum / count;
    for (let y = 1; y < box.h; y++) {
      const add = Math.min(box.h - 1, Math.max(0, y + r));
      const rem = Math.min(box.h - 1, Math.max(0, y - r - 1));
      sum += tmp[add * box.w + x] - tmp[rem * box.w + x];
      dest[((y0 + y) * w + (x0 + x)) * 4 + ch] = sum / count;
    }
  }
}

function blurred(src: Uint8ClampedArray, w: number, h: number, box: PaintBox, r: number) {
  const out = new Uint8ClampedArray(src);
  boxBlurChannel(src, out, w, h, box, r, 0);
  boxBlurChannel(src, out, w, h, box, r, 1);
  boxBlurChannel(src, out, w, h, box, r, 2);
  return out;
}

function pixelated(src: Uint8ClampedArray, w: number, h: number, box: PaintBox, cell: number) {
  const out = new Uint8ClampedArray(src);
  const x1 = box.x + box.w;
  const y1 = box.y + box.h;
  const gx0 = Math.floor(box.x / cell) * cell;
  const gy0 = Math.floor(box.y / cell) * cell;
  for (let gy = gy0; gy < y1; gy += cell) {
    for (let gx = gx0; gx < x1; gx += cell) {
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      const xEnd = Math.min(w, gx + cell);
      const yEnd = Math.min(h, gy + cell);
      for (let y = Math.max(0, gy); y < yEnd; y++) {
        for (let x = Math.max(0, gx); x < xEnd; x++) {
          const i = (y * w + x) * 4;
          r += src[i];
          g += src[i + 1];
          b += src[i + 2];
          n++;
        }
      }
      if (!n) continue;
      r = Math.round(r / n);
      g = Math.round(g / n);
      b = Math.round(b / n);
      for (let y = Math.max(box.y, gy); y < Math.min(y1, yEnd); y++) {
        for (let x = Math.max(box.x, gx); x < Math.min(x1, xEnd); x++) {
          const i = (y * w + x) * 4;
          out[i] = r;
          out[i + 1] = g;
          out[i + 2] = b;
          out[i + 3] = 255;
        }
      }
    }
  }
  return out;
}

function boxBlurF(src: Float32Array, w: number, h: number, r: number) {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const inv = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[row + Math.min(w - 1, Math.max(0, k))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc * inv;
      acc += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc * inv;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/**
 * Rellena lo pintado con lo que lo rodea: promedio de los píxeles vecinos que no están pintados, probando
 * radios cada vez más grandes hasta cubrir toda la mancha. Después le suma un grano parecido al de la foto
 * para que el parche no se vea liso.
 */
function healed(src: Uint8ClampedArray, w: number, mask: Uint8ClampedArray, box: PaintBox) {
  const bw = box.w;
  const bh = box.h;
  const n = bw * bh;
  const known = new Float32Array(n);
  const chans = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  let unknown = 0;
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const i = (box.y + y) * w + box.x + x;
      const k = y * bw + x;
      if (mask[i * 4 + 3] > 6) {
        unknown++;
        continue;
      }
      known[k] = 1;
      chans[0][k] = src[i * 4];
      chans[1][k] = src[i * 4 + 1];
      chans[2][k] = src[i * 4 + 2];
    }
  }
  const out = new Uint8ClampedArray(src);
  if (!unknown || unknown === n) return out;
  const fill = new Float32Array(n * 3);
  const done = new Uint8Array(n);
  let left = unknown;
  for (let r = 2; left > 0 && r < Math.max(bw, bh); r = Math.round(r * 1.6) + 1) {
    const den = boxBlurF(known, bw, bh, r);
    const num = chans.map((c) => boxBlurF(c, bw, bh, r));
    for (let k = 0; k < n; k++) {
      if (known[k] || done[k] || den[k] < 0.12) continue;
      fill[k * 3] = num[0][k] / den[k];
      fill[k * 3 + 1] = num[1][k] / den[k];
      fill[k * 3 + 2] = num[2][k] / den[k];
      done[k] = 1;
      left--;
    }
  }
  // grano: desviación del detalle fino en la zona sana
  const luma = new Float32Array(n);
  for (let k = 0; k < n; k++) luma[k] = 0.3 * chans[0][k] + 0.59 * chans[1][k] + 0.11 * chans[2][k];
  const soft = boxBlurF(luma, bw, bh, 1);
  let sum = 0;
  let cnt = 0;
  for (let k = 0; k < n; k++) {
    if (!known[k]) continue;
    sum += Math.abs(luma[k] - soft[k]);
    cnt++;
  }
  const grain = Math.min(8, (cnt ? sum / cnt : 0) * 1.6);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const k = y * bw + x;
      if (known[k] || !done[k]) continue;
      const i = ((box.y + y) * w + box.x + x) * 4;
      const hash = Math.sin((x + box.x) * 12.9898 + (y + box.y) * 78.233) * 43758.5453;
      const noise = ((hash - Math.floor(hash)) - 0.5) * 2 * grain;
      out[i] = fill[k * 3] + noise;
      out[i + 1] = fill[k * 3 + 1] + noise;
      out[i + 2] = fill[k * 3 + 2] + noise;
      out[i + 3] = 255;
    }
  }
  return out;
}

export function applyPaint(
  overlay: ImageData,
  source: ImageData,
  mask: ImageData,
  fx: PaintFx,
  strength: number,
  colorHex: string,
): PaintBox | null {
  const w = overlay.width;
  const h = overlay.height;
  const pad = fx === "blur" ? blurRadius(strength) + 1 : fx === "pixel" ? pixelCell(strength) : fx === "heal" ? 40 : 2;
  const box = maskBBox(mask.data, w, h, pad);
  if (!box || fx === "clone") return null;
  const amt = fx === "heal" ? 1 : Math.max(0.05, Math.min(1, strength / 100));
  const tint = parseHex(colorHex);
  let fxPix: Uint8ClampedArray | null = null;
  if (fx === "blur") fxPix = blurred(source.data, w, h, box, blurRadius(strength));
  else if (fx === "pixel") fxPix = pixelated(source.data, w, h, box, pixelCell(strength));
  else if (fx === "heal") fxPix = healed(source.data, w, mask.data, box);
  const od = overlay.data;
  const md = mask.data;
  const sd = source.data;
  for (let y = box.y; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w; x++) {
      const i = (y * w + x) * 4;
      const m = md[i + 3] / 255;
      if (m < 0.01) continue;
      const a = fx === "heal" ? Math.min(1, m * 1.6) : m * amt;
      let r: number;
      let g: number;
      let b: number;
      if (fx === "color") {
        r = tint.r;
        g = tint.g;
        b = tint.b;
      } else if (fxPix) {
        r = fxPix[i];
        g = fxPix[i + 1];
        b = fxPix[i + 2];
      } else {
        r = sd[i];
        g = sd[i + 1];
        b = sd[i + 2];
      }
      const srcR = sd[i];
      const srcG = sd[i + 1];
      const srcB = sd[i + 2];
      od[i] = srcR + (r - srcR) * a;
      od[i + 1] = srcG + (g - srcG) * a;
      od[i + 2] = srcB + (b - srcB) * a;
      od[i + 3] = 255;
    }
  }
  return box;
}

export function eraseOverlay(overlay: ImageData, mask: ImageData): PaintBox | null {
  const w = overlay.width;
  const h = overlay.height;
  const box = maskBBox(mask.data, w, h, 1);
  if (!box) return null;
  const od = overlay.data;
  const md = mask.data;
  for (let y = box.y; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w; x++) {
      const i = (y * w + x) * 4;
      const m = md[i + 3] / 255;
      if (m < 0.01) continue;
      od[i + 3] = od[i + 3] * (1 - m);
    }
  }
  return box;
}

export function cloneCanvas(src: HTMLCanvasElement) {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext("2d");
  if (ctx) ctx.drawImage(src, 0, 0);
  return c;
}
