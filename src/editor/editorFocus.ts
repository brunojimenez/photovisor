/** Lógica pura del Foco (zonas nítidas con borde difuso). Sin React ni DOM propio, para poder probarla. */

export type FocusShape = { x: number; y: number; rx: number; ry: number; el: boolean };
export type FocusPoint = { x: number; y: number };
export type FocusHit = { idx: number; mode: "move" | "resize"; axis: "x" | "y" | "both" };
export type FocusPresetKind = "portrait" | "band";

/** Radios mínimos (px de la foto) para que una zona no desaparezca. */
const MIN_R = 2;
const MIN_EDIT_R = 4;

/** El foco usa radios proporcionales al tamaño de la foto: un difuminado de 30 px no se nota en una foto de 4000 px. */
export function focusScale(w: number, h: number): number {
  return Math.min(8, Math.max(0.2, Math.max(w, h) / 1000));
}

/** Busca la zona bajo el puntero: el borde (redimensionar) o el interior (mover). La última dibujada gana. */
export function focusHitTest(shapes: FocusShape[], p: FocusPoint, k: number, viewScale: number): FocusHit | null {
  const kd = Math.max(0.05, viewScale);
  for (let i = shapes.length - 1; i >= 0; i--) {
    const c = shapes[i];
    const rx = Math.max(MIN_R, c.rx * k);
    const ry = Math.max(MIN_R, c.ry * k);
    const nx = (p.x - c.x) / rx;
    const ny = (p.y - c.y) / ry;
    const d = Math.hypot(nx, ny);
    const edgePx = Math.abs(d - 1) * Math.min(rx, ry);
    if (edgePx < 10 / kd) {
      return { idx: i, mode: "resize", axis: c.el ? (Math.abs(nx) > Math.abs(ny) ? "x" : "y") : "both" };
    }
    if (d < 1) return { idx: i, mode: "move", axis: "both" };
  }
  return null;
}

/** Mueve o redimensiona una zona (modifica `c`). `grab` es el desfase del clic respecto del centro. */
export function focusEditApply(c: FocusShape, mode: "move" | "resize", axis: "x" | "y" | "both", p: FocusPoint, k: number, grab: FocusPoint): void {
  if (mode === "move") {
    c.x = p.x - grab.x;
    c.y = p.y - grab.y;
  } else if (axis === "x") {
    c.rx = Math.max(MIN_EDIT_R, Math.abs(p.x - c.x)) / k;
  } else if (axis === "y") {
    c.ry = Math.max(MIN_EDIT_R, Math.abs(p.y - c.y)) / k;
  } else {
    const nx = (p.x - c.x) / (c.rx * k);
    const ny = (p.y - c.y) / (c.ry * k);
    const f = Math.max(0.05, Math.hypot(nx, ny));
    c.rx = Math.max(MIN_EDIT_R / k, c.rx * f);
    c.ry = Math.max(MIN_EDIT_R / k, c.ry * f);
  }
}

/** Forma que sale de arrastrar: círculo desde el centro, o elipse de una esquina a la opuesta. Si el arrastre es mínimo, usa un tamaño por defecto. */
export function focusFinishShape(d: FocusShape, k: number, w: number, h: number): FocusShape {
  const tiny = d.rx * k < 8 && d.ry * k < 8;
  const base = (Math.min(w, h) * 0.25) / k;
  return {
    x: d.x,
    y: d.y,
    rx: tiny ? base : Math.max(d.rx, 4 / k),
    ry: tiny ? (d.el ? base * 0.7 : base) : Math.max(d.ry, 4 / k),
    el: d.el,
  };
}

/** Zonas listas: viñeta (elipse del tamaño del encuadre), retrato o banda tipo miniatura. */
export function focusPresetShape(kind: FocusPresetKind | "vignette", w: number, h: number): { shape: FocusShape; soft: number } {
  if (kind === "vignette") return { shape: { x: w / 2, y: h / 2, rx: w * 0.55, ry: h * 0.55, el: true }, soft: 70 };
  if (kind === "portrait") return { shape: { x: w / 2, y: h * 0.45, rx: w * 0.3, ry: h * 0.42, el: true }, soft: 55 };
  return { shape: { x: w / 2, y: h / 2, rx: w * 0.75, ry: h * 0.17, el: true }, soft: 70 };
}

/** Dibuja la máscara (opaca al centro, con caída suave hacia el borde) de todas las zonas. */
export function drawFocusMask(ctx: CanvasRenderingContext2D, shapes: FocusShape[], k: number, soft01: number): void {
  const inner = Math.max(0, Math.min(0.98, 1 - soft01));
  for (const c of shapes) {
    const rx = Math.max(MIN_R, c.rx * k);
    const ry = Math.max(MIN_R, c.ry * k);
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.scale(rx, ry);
    const g = ctx.createRadialGradient(0, 0, inner, 0, 0, 1);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** El efecto va fuera de las zonas: se invierte la opacidad de la máscara. */
export function invertAlpha(data: Uint8ClampedArray): void {
  for (let i = 3; i < data.length; i += 4) data[i] = 255 - data[i];
}
