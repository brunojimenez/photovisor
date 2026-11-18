import { describe, expect, it } from "vitest";
import { clampCrop, clampZoom, fitRatio, workingSize, ZOOM_MAX, ZOOM_MIN } from "../editorGeometry";

describe("workingSize", () => {
  it("no cambia el tamaño con 0° y 180°", () => {
    expect(workingSize(400, 300, 0)).toEqual({ w: 400, h: 300 });
    expect(workingSize(400, 300, 180)).toEqual({ w: 400, h: 300 });
  });
  it("intercambia ancho y alto con 90° y 270°", () => {
    expect(workingSize(400, 300, 90)).toEqual({ w: 300, h: 400 });
    expect(workingSize(400, 300, 270)).toEqual({ w: 300, h: 400 });
  });
});

describe("clampCrop", () => {
  it("mantiene un recorte válido", () => {
    expect(clampCrop({ x: 10, y: 10, w: 100, h: 80 }, 400, 300)).toEqual({ x: 10, y: 10, w: 100, h: 80 });
  });
  it("lo mete dentro de la foto", () => {
    const c = clampCrop({ x: 380, y: 290, w: 100, h: 80 }, 400, 300);
    expect(c.x + c.w).toBeLessThanOrEqual(400);
    expect(c.y + c.h).toBeLessThanOrEqual(300);
    expect(c.x).toBeGreaterThanOrEqual(0);
  });
  it("no deja que sea más chico que 32 px ni más grande que la foto", () => {
    expect(clampCrop({ x: 0, y: 0, w: 1, h: 1 }, 400, 300)).toMatchObject({ w: 32, h: 32 });
    expect(clampCrop({ x: 0, y: 0, w: 9999, h: 9999 }, 400, 300)).toMatchObject({ w: 400, h: 300 });
  });
});

describe("fitRatio", () => {
  it("1:1 en una foto apaisada usa el alto completo y queda centrado", () => {
    const c = fitRatio(400, 300, 1);
    expect(c.w).toBeCloseTo(300);
    expect(c.h).toBeCloseTo(300);
    expect(c.x).toBeCloseTo(50);
  });
  it("16:9 en una foto 4:3 usa el ancho completo", () => {
    const c = fitRatio(400, 300, 16 / 9);
    expect(c.w).toBeCloseTo(400);
    expect(c.h).toBeCloseTo(225);
  });
});

describe("clampZoom", () => {
  it("respeta los límites", () => {
    expect(clampZoom(0)).toBe(ZOOM_MIN);
    expect(clampZoom(99)).toBe(ZOOM_MAX);
    expect(clampZoom(1)).toBe(1);
  });
});
