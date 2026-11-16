/** Ajustes tipo Google Fotos. 0 = sin cambio. Rango típico -100…100. Sin librerías. */

export type Adjust = {
  hdr: number;
  brightness: number;
  contrast: number;
  white: number;
  highlights: number;
  shadows: number;
  black: number;
  saturate: number;
  warmth: number;
  tint: number;
  skin: number;
  blue: number;
  detail: number;
  sharp: number;
  vignette: number;
  marco: number;
};

export const ADJUST_ZERO: Adjust = {
  hdr: 0,
  brightness: 0,
  contrast: 0,
  white: 0,
  highlights: 0,
  shadows: 0,
  black: 0,
  saturate: 0,
  warmth: 0,
  tint: 0,
  skin: 0,
  blue: 0,
  detail: 0,
  sharp: 0,
  vignette: 0,
  marco: 0,
};

export function adjustIdle(a: Adjust) {
  return (Object.keys(ADJUST_ZERO) as (keyof Adjust)[]).every((k) => !a[k]);
}

function clamp(n: number, lo = 0, hi = 255) {
  return n < lo ? lo : n > hi ? hi : n;
}

function hueDeg(r: number, g: number, b: number) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d < 1e-6) return 0;
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return h;
}

function boxBlur(src: Float32Array, w: number, h: number, radius: number) {
  const r = Math.max(1, Math.round(radius));
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const iR = 1 / (r * 2 + 1);
  for (let y = 0; y < h; y++) {
    let acc = 0;
    const row = y * w;
    for (let k = -r; k <= r; k++) acc += src[row + Math.min(w - 1, Math.max(0, k))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc * iR;
      acc += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc * iR;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

export function applyAdjust(data: Uint8ClampedArray, w: number, h: number, a: Adjust) {
  if (adjustIdle(a)) return;
  const n = w * h;
  const luma = new Float32Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    luma[i] = 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2];
  }
  const needBlur = a.sharp !== 0 || a.detail !== 0;
  const blur = needBlur ? boxBlur(luma, w, h, a.detail !== 0 ? 3 : 1) : null;
  const br = a.brightness / 100;
  const ct = a.contrast / 100;
  const sat = a.saturate / 100;
  const warm = a.warmth / 100;
  const tint = a.tint / 100;
  const hi = a.highlights / 100;
  const sh = a.shadows / 100;
  const hdr = a.hdr / 100;
  const wp = a.white / 100;
  const bp = a.black / 100;
  const skin = a.skin / 100;
  const blu = a.blue / 100;
  const det = a.detail / 100;
  const shp = a.sharp / 100;
  const vig = a.vignette / 100;
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;

  for (let i = 0, p = 0; i < n; i++, p += 4) {
    let r = data[p];
    let g = data[p + 1];
    let b = data[p + 2];
    let y = luma[i];

    if (blur) {
      const high = y - blur[i];
      if (shp) {
        const k = shp * 1.6;
        r += high * k;
        g += high * k;
        b += high * k;
        y += high * k;
      }
      if (det) {
        const mid = 1 - Math.abs(y / 255 - 0.5) * 2;
        const k = det * 1.25 * mid;
        r += high * k;
        g += high * k;
        b += high * k;
        y += high * k;
      }
    }

    if (hdr) {
      const t = y / 255;
      const lift = hdr * 48 * (1 - t) * (1 - t);
      const crush = hdr * 36 * t * t;
      r += lift - crush;
      g += lift - crush;
      b += lift - crush;
      y += lift - crush;
    }

    if (sh) {
      const wgt = Math.max(0, 1 - y / 128);
      const k = sh * 50 * wgt;
      r += k;
      g += k;
      b += k;
      y += k;
    }
    if (hi) {
      const wgt = Math.max(0, (y - 128) / 127);
      const k = hi * 50 * wgt;
      r += k;
      g += k;
      b += k;
      y += k;
    }

    if (bp) {
      const lift = bp > 0 ? 0 : -bp * 40;
      const crush = bp > 0 ? bp * 36 : 0;
      r = (r - crush) * (255 / (255 - crush || 1)) + lift;
      g = (g - crush) * (255 / (255 - crush || 1)) + lift;
      b = (b - crush) * (255 / (255 - crush || 1)) + lift;
    }
    if (wp) {
      const top = 255 - wp * 40;
      const scale = 255 / (top || 1);
      r = r * scale;
      g = g * scale;
      b = b * scale;
    }

    if (br) {
      const k = br * 48;
      r += k;
      g += k;
      b += k;
    }
    if (ct) {
      const f = 1 + ct * 0.9;
      r = (r - 128) * f + 128;
      g = (g - 128) * f + 128;
      b = (b - 128) * f + 128;
    }

    if (sat) {
      const yy = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const f = 1 + sat;
      r = yy + (r - yy) * f;
      g = yy + (g - yy) * f;
      b = yy + (b - yy) * f;
    }

    if (warm) {
      r += warm * 36;
      b -= warm * 36;
    }
    if (tint) {
      g += tint * 28;
      r -= tint * 12;
      b -= tint * 12;
    }

    if (skin || blu) {
      const hue = hueDeg(r, g, b);
      if (skin && hue > 8 && hue < 58) {
        r += skin * 22;
        g += skin * 8;
        b -= skin * 14;
      }
      if (blu && hue > 185 && hue < 265) {
        b += blu * 24;
        r -= blu * 10;
      }
    }

    if (vig) {
      const x = i % w;
      const yy = (i / w) | 0;
      const nx = (x - cx) / (cx || 1);
      const ny = (yy - cy) / (cy || 1);
      const d = Math.sqrt(nx * nx + ny * ny);
      const t = Math.max(0, Math.min(1, (d - 0.16) / 0.84));
      const edge = t * t * (3 - 2 * t);
      const punch = Math.abs(vig);
      const deep = punch * punch * 0.85 + punch * 0.95;
      const k = Math.min(1, deep * edge * 1.35);
      if (vig > 0) {
        const m = 1 - k;
        r *= m;
        g *= m;
        b *= m;
      } else {
        r += (255 - r) * k;
        g += (255 - g) * k;
        b += (255 - b) * k;
      }
    }

    data[p] = clamp(r);
    data[p + 1] = clamp(g);
    data[p + 2] = clamp(b);
  }
}
