/** Curvas y niveles: tablas de 256 valores por canal. Lógica pura, sin DOM. */

export type CurvePoint = [number, number];
export type CurveChannel = "m" | "r" | "g" | "b";
/** Puntos de control (entrada, salida) de 0 a 255. Un canal sin puntos es la diagonal. */
export type Curves = Partial<Record<CurveChannel, CurvePoint[]>>;
export type Levels = { inBlack: number; inWhite: number; gamma: number; outBlack: number; outWhite: number };
export type Histogram = { l: number[]; r: number[]; g: number[]; b: number[] };

export const LEVELS_ZERO: Levels = { inBlack: 0, inWhite: 255, gamma: 1, outBlack: 0, outWhite: 255 };
export const CURVE_IDENTITY: CurvePoint[] = [
  [0, 0],
  [255, 255],
];

const clamp = (n: number, lo: number, hi: number) => (n < lo ? lo : n > hi ? hi : n);

/** Ordena por entrada, acota a 0-255 y deja un solo punto por entrada. */
export function normalizePoints(points: CurvePoint[]): CurvePoint[] {
  const sorted = points
    .map(([x, y]) => [clamp(Math.round(x), 0, 255), clamp(Math.round(y), 0, 255)] as CurvePoint)
    .sort((a, b) => a[0] - b[0]);
  const out: CurvePoint[] = [];
  for (const p of sorted) {
    if (out.length && out[out.length - 1][0] === p[0]) out[out.length - 1] = p;
    else out.push(p);
  }
  return out;
}

export function curveIdle(points?: CurvePoint[]): boolean {
  if (!points || points.length < 2) return true;
  return normalizePoints(points).every(([x, y]) => x === y);
}

/** Tabla de la curva con interpolación cúbica monótona (suave y sin pasarse de los puntos). */
export function curveLut(points?: CurvePoint[]): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  const pts = points && points.length >= 2 ? normalizePoints(points) : CURVE_IDENTITY;
  const n = pts.length;
  if (n < 2) {
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  }
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const d: number[] = [];
  for (let k = 0; k < n - 1; k++) d.push((ys[k + 1] - ys[k]) / (xs[k + 1] - xs[k]));
  const m: number[] = new Array(n).fill(0);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let k = 1; k < n - 1; k++) m[k] = d[k - 1] * d[k] <= 0 ? 0 : (d[k - 1] + d[k]) / 2;
  // Fritsch-Carlson: ninguna tangente puede ser más de 3 veces la pendiente del tramo
  for (let k = 0; k < n - 1; k++) {
    if (d[k] === 0) {
      m[k] = 0;
      m[k + 1] = 0;
      continue;
    }
    const a = m[k] / d[k];
    const b = m[k + 1] / d[k];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[k] = t * a * d[k];
      m[k + 1] = t * b * d[k];
    }
  }
  let seg = 0;
  for (let i = 0; i < 256; i++) {
    if (i <= xs[0]) {
      lut[i] = ys[0];
      continue;
    }
    if (i >= xs[n - 1]) {
      lut[i] = ys[n - 1];
      continue;
    }
    while (seg < n - 2 && i > xs[seg + 1]) seg++;
    const h = xs[seg + 1] - xs[seg];
    const t = (i - xs[seg]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    const v = (2 * t3 - 3 * t2 + 1) * ys[seg] + (t3 - 2 * t2 + t) * h * m[seg] + (-2 * t3 + 3 * t2) * ys[seg + 1] + (t3 - t2) * h * m[seg + 1];
    lut[i] = Math.round(clamp(v, 0, 255));
  }
  return lut;
}

export function levelsIdle(l?: Levels): boolean {
  return !l || (l.inBlack === 0 && l.inWhite === 255 && l.gamma === 1 && l.outBlack === 0 && l.outWhite === 255);
}

/** Niveles: recorta entrada, curva gamma (>1 aclara los medios) y reparte en la salida. */
export function levelsLut(l: Levels): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  const ib = clamp(l.inBlack, 0, 254);
  const iw = clamp(l.inWhite, ib + 1, 255);
  const g = clamp(l.gamma, 0.1, 5);
  const ob = clamp(l.outBlack, 0, 255);
  const ow = clamp(l.outWhite, 0, 255);
  for (let i = 0; i < 256; i++) {
    const t = clamp((i - ib) / (iw - ib), 0, 1);
    lut[i] = Math.round(clamp(ob + (ow - ob) * Math.pow(t, 1 / g), 0, 255));
  }
  return lut;
}

export type ToneLuts = { r: Uint8ClampedArray; g: Uint8ClampedArray; b: Uint8ClampedArray };

/** Niveles, luego curva maestra, luego curva de cada canal. Devuelve null si nada cambia. */
export function toneLuts(curves?: Curves, levels?: Levels): ToneLuts | null {
  const lev = !levelsIdle(levels);
  const cm = !curveIdle(curves?.m);
  const cr = !curveIdle(curves?.r);
  const cg = !curveIdle(curves?.g);
  const cb = !curveIdle(curves?.b);
  if (!lev && !cm && !cr && !cg && !cb) return null;
  const L = lev ? levelsLut(levels as Levels) : null;
  const M = cm ? curveLut(curves?.m) : null;
  const R = cr ? curveLut(curves?.r) : null;
  const G = cg ? curveLut(curves?.g) : null;
  const B = cb ? curveLut(curves?.b) : null;
  const out: ToneLuts = { r: new Uint8ClampedArray(256), g: new Uint8ClampedArray(256), b: new Uint8ClampedArray(256) };
  for (let i = 0; i < 256; i++) {
    let v = L ? L[i] : i;
    if (M) v = M[v];
    out.r[i] = R ? R[v] : v;
    out.g[i] = G ? G[v] : v;
    out.b[i] = B ? B[v] : v;
  }
  return out;
}

export function histogramOf(data: Uint8ClampedArray): Histogram {
  const h: Histogram = { l: new Array(256).fill(0), r: new Array(256).fill(0), g: new Array(256).fill(0), b: new Array(256).fill(0) };
  for (let p = 0; p < data.length; p += 4) {
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    h.r[r]++;
    h.g[g]++;
    h.b[b]++;
    h.l[Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)]++;
  }
  return h;
}

/** Niveles automáticos: recorta el 0,5 % de cada punta del histograma de luz. */
export function autoLevels(hist: number[], clip = 0.005): Levels {
  const total = hist.reduce((a, b) => a + b, 0);
  if (!total) return { ...LEVELS_ZERO };
  const cut = total * clip;
  let acc = 0;
  let lo = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc > cut) {
      lo = i;
      break;
    }
  }
  acc = 0;
  let hi = 255;
  for (let i = 255; i >= 0; i--) {
    acc += hist[i];
    if (acc > cut) {
      hi = i;
      break;
    }
  }
  if (hi - lo < 8) return { ...LEVELS_ZERO };
  return { ...LEVELS_ZERO, inBlack: lo, inWhite: hi };
}

/** Quita los canales sin cambios; si no queda nada devuelve undefined. */
export function cleanCurves(curves: Curves): Curves | undefined {
  const out: Curves = {};
  for (const ch of ["m", "r", "g", "b"] as const) {
    const pts = curves[ch];
    if (pts && !curveIdle(pts)) out[ch] = normalizePoints(pts);
  }
  return Object.keys(out).length ? out : undefined;
}
