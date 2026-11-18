import { describe, expect, it } from "vitest";
import { ADJUST_ZERO, adjustIdle, applyAdjust } from "../editorAdjust";

function flat(r: number, g: number, b: number, n = 16): Uint8ClampedArray {
  const d = new Uint8ClampedArray(n * n * 4);
  for (let i = 0; i < n * n; i++) d.set([r, g, b, 255], i * 4);
  return d;
}

describe("adjustIdle", () => {
  it("los ajustes en cero no hacen nada", () => {
    expect(adjustIdle(ADJUST_ZERO)).toBe(true);
    expect(adjustIdle({ ...ADJUST_ZERO, brightness: 10 })).toBe(false);
  });
});

describe("applyAdjust", () => {
  it("con ajustes en cero deja los píxeles igual", () => {
    const d = flat(120, 80, 200);
    applyAdjust(d, 16, 16, ADJUST_ZERO);
    expect(Array.from(d.slice(0, 4))).toEqual([120, 80, 200, 255]);
  });
  it("brillo positivo aclara y negativo oscurece", () => {
    const up = flat(100, 100, 100);
    const down = flat(100, 100, 100);
    applyAdjust(up, 16, 16, { ...ADJUST_ZERO, brightness: 50 });
    applyAdjust(down, 16, 16, { ...ADJUST_ZERO, brightness: -50 });
    expect(up[0]).toBeGreaterThan(100);
    expect(down[0]).toBeLessThan(100);
  });
  it("saturación -100 deja gris", () => {
    const d = flat(200, 60, 40);
    applyAdjust(d, 16, 16, { ...ADJUST_ZERO, saturate: -100 });
    expect(Math.abs(d[0] - d[1])).toBeLessThanOrEqual(2);
    expect(Math.abs(d[1] - d[2])).toBeLessThanOrEqual(2);
  });
  it("no toca el canal alfa ni se sale de 0-255", () => {
    const d = flat(250, 250, 250);
    applyAdjust(d, 16, 16, { ...ADJUST_ZERO, brightness: 100, hdr: 100 });
    expect(d[3]).toBe(255);
    expect(d[0]).toBeLessThanOrEqual(255);
  });
  it("es determinista", () => {
    const a = flat(90, 140, 30);
    const b = flat(90, 140, 30);
    const adj = { ...ADJUST_ZERO, contrast: 30, warmth: 20, shadows: 25 };
    applyAdjust(a, 16, 16, adj);
    applyAdjust(b, 16, 16, adj);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});
