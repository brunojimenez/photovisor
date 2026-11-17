/** Ajustes tipo Google Fotos. 0 = sin cambio. Rango típico -100…100. Sin librerías. */

/** Ocho tonos para el ajuste por color (HSL). `hue` es el centro de cada banda en grados. */
export const HSL_BANDS = [
  { id: "r", label: "Rojo", hue: 0, color: "#e5484d" },
  { id: "o", label: "Naranja", hue: 30, color: "#f08c3a" },
  { id: "y", label: "Amarillo", hue: 60, color: "#f2d13a" },
  { id: "g", label: "Verde", hue: 120, color: "#4fbf67" },
  { id: "c", label: "Aguamarina", hue: 180, color: "#3ec4d4" },
  { id: "b", label: "Azul", hue: 240, color: "#4a7cf0" },
  { id: "p", label: "Morado", hue: 275, color: "#9b5cf0" },
  { id: "m", label: "Magenta", hue: 320, color: "#e04fc0" },
] as const;
export type Band = (typeof HSL_BANDS)[number]["id"];
export type HslKey = `${"h" | "s" | "l"}_${Band}`;
const HSL_KEYS: HslKey[] = HSL_BANDS.flatMap((band) => (["h", "s", "l"] as const).map((k) => `${k}_${band.id}` as HslKey));

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
  /** Ruido de luminancia y de color. 0 = sin cambio. */
  denoise: number;
  chroma: number;
  /** Blanco y negro: cantidad, filtro de color (azul ← → rojo), virado y su matiz en grados. */
  bw: number;
  bwFilter: number;
  bwTone: number;
  bwHue: number;
  /** Grano de película: cantidad y tamaño (el tamaño es relativo al ancho de la foto). */
  grain: number;
  grainSize: number;
  /** Estilo rápido (1 cómic, 2 óleo, 3 boceto, 4 acuarela; 0 = ninguno) y su intensidad. */
  style: number;
  styleAmt: number;
} & Record<HslKey, number>;

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
  denoise: 0,
  chroma: 0,
  bw: 0,
  bwFilter: 0,
  bwTone: 0,
  bwHue: 35,
  grain: 0,
  grainSize: 40,
  style: 0,
  styleAmt: 70,
  ...(Object.fromEntries(HSL_KEYS.map((k) => [k, 0])) as Record<HslKey, number>),
};

export function adjustIdle(a: Adjust) {
  // el matiz del virado y el tamaño del grano no cuentan: sin virado o sin grano no hacen nada
  return (Object.keys(ADJUST_ZERO) as (keyof Adjust)[]).every((k) => k === "bwHue" || k === "grainSize" || k === "styleAmt" || !a[k]);
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

const HSL_OUT = [0, 0, 0];

/** Escribe [h (0-360), s (0-1), l (0-1)] en HSL_OUT. r, g, b en 0-255. */
function rgbToHsl(r: number, g: number, b: number) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d > 1e-6) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  HSL_OUT[0] = h;
  HSL_OUT[1] = s;
  HSL_OUT[2] = l;
}

/** Escribe [r, g, b] (0-255) en HSL_OUT. h en grados, s y l en 0-1. */
function hslToRgb(h: number, s: number, l: number) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  HSL_OUT[0] = (r + m) * 255;
  HSL_OUT[1] = (g + m) * 255;
  HSL_OUT[2] = (b + m) * 255;
}

const HSL_CENTERS = HSL_BANDS.map((band) => band.hue);

function lattice(ix: number, iy: number) {
  const s = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

/** Ruido de valor suave, entre -1 y 1. Con `soft` falso es ruido de un píxel (grano fino). */
function grainNoise(x: number, y: number, size: number) {
  if (size <= 1.15) return lattice(x, y) * 1.4;
  const gx = x / size;
  const gy = y / size;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = gx - ix;
  const fy = gy - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = lattice(ix, iy);
  const b = lattice(ix + 1, iy);
  const c = lattice(ix, iy + 1);
  const d = lattice(ix + 1, iy + 1);
  return (a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy) * 1.8;
}

/**
 * Reducción de ruido sin librerías. Color: se desenfoca solo la crominancia. Luminancia: un desenfoque
 * pequeño que solo se aplica donde la diferencia es chica (ruido), así los bordes no se borran.
 */
function denoisePass(data: Uint8ClampedArray, w: number, h: number, luma: number, chroma: number) {
  const n = w * h;
  if (chroma > 0) {
    const y = new Float32Array(n);
    const cb = new Float32Array(n);
    const cr = new Float32Array(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const yy = 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2];
      y[i] = yy;
      cb[i] = data[p + 2] - yy;
      cr[i] = data[p] - yy;
    }
    const rad = 1 + Math.round((chroma / 100) * 6);
    const cbB = boxBlur(cb, w, h, rad);
    const crB = boxBlur(cr, w, h, rad);
    const k = Math.min(1, chroma / 50);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const ncr = cr[i] + (crB[i] - cr[i]) * k;
      const ncb = cb[i] + (cbB[i] - cb[i]) * k;
      const r = y[i] + ncr;
      const b = y[i] + ncb;
      const g = (y[i] - 0.2126 * r - 0.0722 * b) / 0.7152;
      data[p] = clamp(r);
      data[p + 1] = clamp(g);
      data[p + 2] = clamp(b);
    }
  }
  if (luma > 0) {
    const sigma = 4 + (luma / 100) * 26;
    const s2 = sigma * sigma;
    const rad = 1 + Math.round((luma / 100) * 2);
    for (let ch = 0; ch < 3; ch++) {
      const plane = new Float32Array(n);
      for (let i = 0, p = ch; i < n; i++, p += 4) plane[i] = data[p];
      const soft = boxBlur(plane, w, h, rad);
      for (let i = 0, p = ch; i < n; i++, p += 4) {
        const d = plane[i] - soft[i];
        data[p] = clamp(soft[i] + d * ((d * d) / (d * d + s2)));
      }
    }
  }
}

export const STYLE_KINDS = [
  { id: 1, label: "Cómic" },
  { id: 2, label: "Óleo" },
  { id: 3, label: "Boceto" },
  { id: 4, label: "Acuarela" },
] as const;

function smoothstep(e: number, a: number, b: number) {
  const t = Math.max(0, Math.min(1, (e - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function lumaOf(data: Uint8ClampedArray) {
  const n = data.length / 4;
  const L = new Float32Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) L[i] = 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2];
  return L;
}

/**
 * Kuwahara: cada píxel toma el color medio del cuadrante vecino más uniforme. Aplana las zonas y conserva los
 * bordes, que es lo que da el aspecto pintado. Medias y varianzas salen de cajas desplazadas (coste lineal).
 */
function kuwahara(data: Uint8ClampedArray, w: number, h: number, k: number) {
  const n = w * h;
  const R = new Float32Array(n);
  const G = new Float32Array(n);
  const B = new Float32Array(n);
  const L = new Float32Array(n);
  const L2 = new Float32Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    R[i] = data[p];
    G[i] = data[p + 1];
    B[i] = data[p + 2];
    const l = 0.2126 * R[i] + 0.7152 * G[i] + 0.0722 * B[i];
    L[i] = l;
    L2[i] = l * l;
  }
  const mR = boxBlur(R, w, h, k);
  const mG = boxBlur(G, w, h, k);
  const mB = boxBlur(B, w, h, k);
  const mL = boxBlur(L, w, h, k);
  const mL2 = boxBlur(L2, w, h, k);
  const out = new Uint8ClampedArray(data.length);
  const dx = [-k, k, -k, k];
  const dy = [-k, -k, k, k];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let best = Infinity;
      let pick = y * w + x;
      for (let q = 0; q < 4; q++) {
        const xx = Math.min(w - 1, Math.max(0, x + dx[q]));
        const yy = Math.min(h - 1, Math.max(0, y + dy[q]));
        const idx = yy * w + xx;
        const v = mL2[idx] - mL[idx] * mL[idx];
        if (v < best) {
          best = v;
          pick = idx;
        }
      }
      const o = (y * w + x) * 4;
      out[o] = mR[pick];
      out[o + 1] = mG[pick];
      out[o + 2] = mB[pick];
      out[o + 3] = 255;
    }
  }
  return out;
}

/** Líneas de tinta: diferencia entre dos desenfoques de la luminancia. 0 = sin línea, 1 = línea. */
function inkLines(src: Uint8ClampedArray, w: number, h: number, scale: number, lo: number, hi: number) {
  const L = lumaOf(src);
  const fine = boxBlur(L, w, h, Math.max(1, Math.round(scale)));
  const wide = boxBlur(L, w, h, Math.max(2, Math.round(3 * scale)));
  const line = new Float32Array(L.length);
  for (let i = 0; i < line.length; i++) line[i] = smoothstep(Math.abs(fine[i] - wide[i]), lo, hi);
  return line;
}

/** El estilo aplicado a una franja de la foto. `scale` es el ancho de la foto entre 1000 px: el aspecto no depende de la resolución. */
function styleBand(src: Uint8ClampedArray, w: number, h: number, kind: number, scale: number, rowOffset: number) {
  const n = w * h;
  if (kind === 3) {
    // boceto a lápiz: «color dodge» de la luminancia contra su negativo desenfocado
    const L = lumaOf(src);
    const inv = new Float32Array(n);
    for (let i = 0; i < n; i++) inv[i] = 255 - L[i];
    const soft = boxBlur(inv, w, h, Math.max(3, Math.round(7 * scale)));
    const out = new Uint8ClampedArray(src.length);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const g = Math.min(255, (L[i] * 255) / Math.max(1, 255 - soft[i]));
      out[p] = g;
      out[p + 1] = g * 0.985;
      out[p + 2] = g * 0.95;
      out[p + 3] = 255;
    }
    return out;
  }
  const k = kind === 1 ? Math.max(1, Math.round(2 * scale)) : kind === 2 ? Math.max(2, Math.round(4 * scale)) : Math.max(2, Math.round(3 * scale));
  const out = kuwahara(src, w, h, k);
  const lines = kind === 1 ? inkLines(src, w, h, scale, 3, 12) : kind === 4 ? inkLines(src, w, h, scale, 4, 16) : null;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    let r = out[p];
    let g = out[p + 1];
    let b = out[p + 2];
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (kind === 1) {
      // cómic: colores intensos en pocos tonos y contorno negro
      r = y + (r - y) * 1.3;
      g = y + (g - y) * 1.3;
      b = y + (b - y) * 1.3;
      r = Math.round(clamp(r) / 51) * 51;
      g = Math.round(clamp(g) / 51) * 51;
      b = Math.round(clamp(b) / 51) * 51;
      const ink = 1 - (lines as Float32Array)[i] * 0.92;
      r *= ink;
      g *= ink;
      b *= ink;
    } else if (kind === 2) {
      // óleo: pinceladas y color algo más vivo
      r = (y + (r - y) * 1.12 - 128) * 1.06 + 128;
      g = (y + (g - y) * 1.12 - 128) * 1.06 + 128;
      b = (y + (b - y) * 1.12 - 128) * 1.06 + 128;
    } else {
      // acuarela: lavado claro, menos saturado, contorno tenue marrón y grano de papel
      r = 255 - (255 - (y + (r - y) * 0.9)) * 0.86;
      g = 255 - (255 - (y + (g - y) * 0.9)) * 0.86;
      b = 255 - (255 - (y + (b - y) * 0.9)) * 0.86;
      const edge = (lines as Float32Array)[i] * 0.35;
      r = r * (1 - edge) + 70 * edge;
      g = g * (1 - edge) + 50 * edge;
      b = b * (1 - edge) + 40 * edge;
      const paper = grainNoise(i % w, rowOffset + ((i / w) | 0), Math.max(1.5, 2 * scale)) * 4;
      r += paper;
      g += paper;
      b += paper;
    }
    out[p] = clamp(r);
    out[p + 1] = clamp(g);
    out[p + 2] = clamp(b);
  }
  return out;
}

/** Aplica el estilo por franjas con margen, para no gastar memoria con fotos grandes. `amount` va de 0 a 1. */
function stylePass(data: Uint8ClampedArray, w: number, h: number, kind: number, amount: number) {
  const scale = Math.max(0.5, w / 1000);
  const halo = Math.ceil(10 * scale) + 2;
  const BAND = 256;
  const src = new Uint8ClampedArray(data);
  for (let y0 = 0; y0 < h; y0 += BAND) {
    const a = Math.max(0, y0 - halo);
    const b = Math.min(h, y0 + BAND + halo);
    const styled = styleBand(src.slice(a * w * 4, b * w * 4), w, b - a, kind, scale, a);
    for (let y = y0; y < Math.min(h, y0 + BAND); y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const j = ((y - a) * w + x) * 4;
        data[i] = src[i] + (styled[j] - src[i]) * amount;
        data[i + 1] = src[i + 1] + (styled[j + 1] - src[i + 1]) * amount;
        data[i + 2] = src[i + 2] + (styled[j + 2] - src[i + 2]) * amount;
      }
    }
  }
}

export function applyAdjust(data: Uint8ClampedArray, w: number, h: number, input: Adjust) {
  const a: Adjust = { ...ADJUST_ZERO, ...input };
  if (adjustIdle(a)) return;
  if (a.denoise || a.chroma) denoisePass(data, w, h, a.denoise, a.chroma);
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
  const hv = HSL_BANDS.map((band) => a[`h_${band.id}` as HslKey] / 100);
  const sv = HSL_BANDS.map((band) => a[`s_${band.id}` as HslKey] / 100);
  const lv = HSL_BANDS.map((band) => a[`l_${band.id}` as HslKey] / 100);
  const hslOn = hv.some(Boolean) || sv.some(Boolean) || lv.some(Boolean);
  const bwMix = a.bw / 100;
  const bwOn = a.bw !== 0 || a.bwTone !== 0;
  const bf = a.bwFilter / 100;
  const wr = bf >= 0 ? 0.3 + 0.4 * bf : 0.3 + 0.3 * bf;
  const wg = bf >= 0 ? 0.59 - 0.2 * bf : 0.59;
  const wb = bf >= 0 ? 0.11 - 0.2 * bf : 0.11 - 0.3 * bf;
  const grainAmt = a.grain / 100;
  // el tamaño se mide respecto al ancho: la vista previa y el archivo final tienen el mismo aspecto
  const grainPx = (0.8 + (a.grainSize / 100) * 2.4) * (w / 1200);
  const toneAmt = a.bwTone / 100;
  let toneR = 0;
  let toneG = 0;
  let toneB = 0;
  if (toneAmt) {
    hslToRgb(a.bwHue, 1, 0.5);
    toneR = HSL_OUT[0] - 128;
    toneG = HSL_OUT[1] - 128;
    toneB = HSL_OUT[2] - 128;
  }

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

    if (hslOn) {
      const rr = clamp(r);
      const gg = clamp(g);
      const bb = clamp(b);
      const chromaPx = (Math.max(rr, gg, bb) - Math.min(rr, gg, bb)) / 255;
      if (chromaPx > 0.02) {
        rgbToHsl(rr, gg, bb);
        let hh = HSL_OUT[0];
        let ss = HSL_OUT[1];
        let ll = HSL_OUT[2];
        let bi = 7;
        for (let k = 0; k < 8; k++) if (hh >= HSL_CENTERS[k]) bi = k;
        const bj = (bi + 1) & 7;
        const span = (HSL_CENTERS[bj] - HSL_CENTERS[bi] + 360) % 360 || 360;
        const tt = (hh - HSL_CENTERS[bi]) / span;
        const ws = Math.min(1, chromaPx * 4);
        const dh = (hv[bi] + (hv[bj] - hv[bi]) * tt) * 30 * ws;
        const ds = (sv[bi] + (sv[bj] - sv[bi]) * tt) * ws;
        const dl = (lv[bi] + (lv[bj] - lv[bi]) * tt) * 0.3 * ws;
        hh = (hh + dh + 360) % 360;
        ss = Math.max(0, Math.min(1, ss * (1 + ds)));
        ll = Math.max(0, Math.min(1, ll + dl));
        hslToRgb(hh, ss, ll);
        r = HSL_OUT[0];
        g = HSL_OUT[1];
        b = HSL_OUT[2];
      }
    }

    if (bwOn) {
      const gray = wr * r + wg * g + wb * b;
      r += (gray - r) * bwMix;
      g += (gray - g) * bwMix;
      b += (gray - b) * bwMix;
      if (toneAmt) {
        const mid = 1 - Math.abs(clamp(gray) / 255 - 0.5) * 2;
        const k = toneAmt * 0.5 * (0.4 + 0.6 * mid);
        r += toneR * k;
        g += toneG * k;
        b += toneB * k;
      }
    }

    if (grainAmt) {
      const gxp = i % w;
      const gyp = (i / w) | 0;
      const lum = clamp(0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const amp = grainAmt * 34 * (0.35 + 0.65 * (1 - Math.abs(lum - 0.5) * 2));
      const n = grainNoise(gxp, gyp, grainPx) * amp;
      const nc = grainNoise(gxp + 57.3, gyp + 19.1, grainPx) * amp * 0.22;
      r += n + nc;
      g += n;
      b += n - nc;
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
  if (a.style > 0 && a.styleAmt > 0) stylePass(data, w, h, a.style, a.styleAmt / 100);
}
