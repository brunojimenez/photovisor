import { describe, expect, it } from "vitest";
import { ADJUST_ZERO, adjustIdle, applyAdjust } from "../editorAdjust";
import {
  autoLevels,
  cleanCurves,
  curveIdle,
  curveLut,
  histogramOf,
  LEVELS_ZERO,
  levelsIdle,
  levelsLut,
  normalizePoints,
  toneLuts,
  type CurvePoint,
} from "../editorCurves";

describe("normalizePoints", () => {
  it("ordena, acota y quita entradas repetidas", () => {
    expect(normalizePoints([[300, 10], [100, -5], [100, 40], [0, 0]])).toEqual([[0, 0], [100, 40], [255, 10]]);
  });
});

describe("curveLut", () => {
  it("sin puntos es la diagonal", () => {
    const l = curveLut();
    expect(l[0]).toBe(0);
    expect(l[128]).toBe(128);
    expect(l[255]).toBe(255);
  });
  it("pasa exactamente por los puntos de control", () => {
    const pts: CurvePoint[] = [[0, 0], [64, 90], [192, 170], [255, 255]];
    const l = curveLut(pts);
    expect(l[64]).toBe(90);
    expect(l[192]).toBe(170);
  });
  it("subir el punto medio aclara los medios", () => {
    const l = curveLut([[0, 0], [128, 160], [255, 255]]);
    expect(l[128]).toBe(160);
    expect(l[64]).toBeGreaterThan(64);
  });
  it("es monótona: no se pasa ni invierte tonos", () => {
    const l = curveLut([[0, 0], [30, 200], [60, 20], [255, 255]].map(([x, y]) => [x, y] as CurvePoint).filter((_, i) => i !== 2));
    for (let i = 1; i < 256; i++) expect(l[i]).toBeGreaterThanOrEqual(l[i - 1]);
    for (let i = 0; i < 256; i++) expect(l[i]).toBeLessThanOrEqual(255);
  });
  it("una curva invertida da el negativo", () => {
    const l = curveLut([[0, 255], [255, 0]]);
    expect(l[0]).toBe(255);
    expect(l[255]).toBe(0);
    expect(l[100]).toBeCloseTo(155, -1);
  });
  it("fuera de los extremos mantiene el valor del extremo", () => {
    const l = curveLut([[50, 20], [200, 220]]);
    expect(l[0]).toBe(20);
    expect(l[255]).toBe(220);
  });
});

describe("curveIdle y cleanCurves", () => {
  it("la diagonal no cuenta como cambio", () => {
    expect(curveIdle()).toBe(true);
    expect(curveIdle([[0, 0], [255, 255]])).toBe(true);
    expect(curveIdle([[0, 0], [100, 100], [255, 255]])).toBe(true);
    expect(curveIdle([[0, 0], [100, 120], [255, 255]])).toBe(false);
  });
  it("cleanCurves deja solo los canales con cambios", () => {
    expect(cleanCurves({ m: [[0, 0], [255, 255]] })).toBeUndefined();
    expect(cleanCurves({ m: [[0, 0], [255, 255]], r: [[0, 10], [255, 255]] })).toEqual({ r: [[0, 10], [255, 255]] });
  });
});

describe("niveles", () => {
  it("sin cambios es la identidad", () => {
    expect(levelsIdle(LEVELS_ZERO)).toBe(true);
    const l = levelsLut(LEVELS_ZERO);
    expect(l[0]).toBe(0);
    expect(l[100]).toBe(100);
    expect(l[255]).toBe(255);
  });
  it("negro y blanco de entrada estiran el contraste", () => {
    const l = levelsLut({ ...LEVELS_ZERO, inBlack: 50, inWhite: 200 });
    expect(l[50]).toBe(0);
    expect(l[200]).toBe(255);
    expect(l[30]).toBe(0);
    expect(l[125]).toBeCloseTo(128, -1);
  });
  it("gamma mayor que 1 aclara los medios sin mover los extremos", () => {
    const l = levelsLut({ ...LEVELS_ZERO, gamma: 2 });
    expect(l[0]).toBe(0);
    expect(l[255]).toBe(255);
    expect(l[128]).toBeGreaterThan(128);
  });
  it("la salida acota el rango", () => {
    const l = levelsLut({ ...LEVELS_ZERO, outBlack: 30, outWhite: 220 });
    expect(l[0]).toBe(30);
    expect(l[255]).toBe(220);
  });
  it("no se rompe con valores locos", () => {
    const l = levelsLut({ inBlack: 300, inWhite: -5, gamma: 0, outBlack: -1, outWhite: 999 });
    for (let i = 0; i < 256; i++) expect(Number.isFinite(l[i])).toBe(true);
  });
});

describe("toneLuts", () => {
  it("devuelve null si nada cambia", () => {
    expect(toneLuts()).toBeNull();
    expect(toneLuts({ m: [[0, 0], [255, 255]] }, LEVELS_ZERO)).toBeNull();
  });
  it("las curvas por canal afectan solo a ese canal", () => {
    const t = toneLuts({ r: [[0, 0], [128, 200], [255, 255]] })!;
    expect(t.r[128]).toBe(200);
    expect(t.g[128]).toBe(128);
    expect(t.b[128]).toBe(128);
  });
  it("aplica niveles y después la curva maestra", () => {
    const t = toneLuts({ m: [[0, 0], [255, 128]] }, { ...LEVELS_ZERO, inWhite: 128 })!;
    expect(t.r[128]).toBe(128);
    expect(t.r[255]).toBe(128);
  });
});

describe("histograma y niveles automáticos", () => {
  it("cuenta los píxeles por valor", () => {
    const d = new Uint8ClampedArray([10, 10, 10, 255, 10, 10, 10, 255, 200, 200, 200, 255]);
    const h = histogramOf(d);
    expect(h.l[10]).toBe(2);
    expect(h.l[200]).toBe(1);
    expect(h.r[10]).toBe(2);
  });
  it("autoLevels recorta las puntas vacías", () => {
    const hist = new Array(256).fill(0);
    for (let i = 40; i <= 210; i++) hist[i] = 100;
    const l = autoLevels(hist);
    expect(l.inBlack).toBeGreaterThanOrEqual(40);
    expect(l.inBlack).toBeLessThan(60);
    expect(l.inWhite).toBeLessThanOrEqual(210);
    expect(l.inWhite).toBeGreaterThan(190);
  });
  it("si la foto ya llena el rango no cambia nada", () => {
    const hist = new Array(256).fill(10);
    expect(levelsIdle(autoLevels(hist, 0.0))).toBe(true);
  });
});

describe("integración con applyAdjust", () => {
  const flat = (v: number) => {
    const d = new Uint8ClampedArray(16 * 16 * 4);
    for (let i = 0; i < 256; i++) d.set([v, v, v, 255], i * 4);
    return d;
  };
  it("una curva o niveles cuentan como ajuste (no está en reposo)", () => {
    expect(adjustIdle({ ...ADJUST_ZERO, curves: { m: [[0, 0], [128, 180], [255, 255]] } })).toBe(false);
    expect(adjustIdle({ ...ADJUST_ZERO, levels: { ...LEVELS_ZERO, gamma: 1.4 } })).toBe(false);
    expect(adjustIdle({ ...ADJUST_ZERO, curves: { m: [[0, 0], [255, 255]] } })).toBe(true);
  });
  it("la curva maestra cambia los píxeles", () => {
    const d = flat(100);
    applyAdjust(d, 16, 16, { ...ADJUST_ZERO, curves: { m: [[0, 0], [100, 160], [255, 255]] } });
    expect(d[0]).toBe(160);
    expect(d[3]).toBe(255);
  });
  it("niveles: gamma aclara", () => {
    const d = flat(100);
    applyAdjust(d, 16, 16, { ...ADJUST_ZERO, levels: { ...LEVELS_ZERO, gamma: 2 } });
    expect(d[0]).toBeGreaterThan(100);
  });
  it("la curva de un canal tiñe la imagen", () => {
    const d = flat(100);
    applyAdjust(d, 16, 16, { ...ADJUST_ZERO, curves: { b: [[0, 0], [100, 200], [255, 255]] } });
    expect(d[2]).toBeGreaterThan(d[0]);
  });
});
