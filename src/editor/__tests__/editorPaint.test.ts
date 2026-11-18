import { describe, expect, it } from "vitest";
import { applyPaint, eraseOverlay, maskBBox, parseHex } from "../editorPaint";
import { img, maskSquare, px } from "./helpers";

describe("parseHex", () => {
  it("lee #rrggbb y #rgb", () => {
    expect(parseHex("#ff8000")).toEqual({ r: 255, g: 128, b: 0 });
    expect(parseHex("#f80")).toEqual({ r: 255, g: 136, b: 0 });
  });
  it("tolera basura", () => {
    expect(parseHex("")).toEqual({ r: 0, g: 0, b: 0 });
  });
});

describe("maskBBox", () => {
  it("devuelve null si no hay trazo", () => {
    expect(maskBBox(img(10, 10, [0, 0, 0, 0]).data, 10, 10, 2)).toBeNull();
  });
  it("encuadra el trazo con margen y sin salirse", () => {
    const m = maskSquare(20, 20, 5, 6, 4);
    expect(maskBBox(m.data, 20, 20, 2)).toEqual({ x: 3, y: 4, w: 8, h: 8 });
    expect(maskBBox(m.data, 20, 20, 100)).toEqual({ x: 0, y: 0, w: 20, h: 20 });
  });
});

describe("applyPaint", () => {
  it("colorear pinta solo dentro de la máscara", () => {
    const source = img(20, 20, [100, 100, 100, 255]);
    const overlay = img(20, 20, [0, 0, 0, 0]);
    const mask = maskSquare(20, 20, 5, 5, 6);
    applyPaint(overlay, source, mask, "color", 100, "#ff0000");
    expect(px(overlay, 7, 7)).toEqual([255, 0, 0, 255]);
    expect(px(overlay, 0, 0)[3]).toBe(0);
  });
  it("la intensidad mezcla con el original", () => {
    const source = img(20, 20, [0, 0, 0, 255]);
    const overlay = img(20, 20, [0, 0, 0, 0]);
    applyPaint(overlay, source, maskSquare(20, 20, 5, 5, 6), "color", 50, "#c8c8c8");
    expect(px(overlay, 7, 7)[0]).toBeGreaterThan(80);
    expect(px(overlay, 7, 7)[0]).toBeLessThan(120);
  });
  it("difuminar una zona de un solo color no la cambia", () => {
    const source = img(20, 20, [40, 90, 200, 255]);
    const overlay = img(20, 20, [0, 0, 0, 0]);
    applyPaint(overlay, source, maskSquare(20, 20, 5, 5, 6), "blur", 80, "#000000");
    expect(px(overlay, 7, 7)).toEqual([40, 90, 200, 255]);
  });
  it("pixelar mezcla en celdas: dos píxeles vecinos quedan con el mismo color", () => {
    const source = img(40, 40, [0, 0, 0, 255]);
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) source.data.set([x * 6, 0, 0, 255], (y * 40 + x) * 4);
    const overlay = img(40, 40, [0, 0, 0, 0]);
    applyPaint(overlay, source, maskSquare(40, 40, 4, 4, 30), "pixel", 100, "#000000");
    expect(px(overlay, 20, 20)[0]).toBe(px(overlay, 21, 20)[0]);
  });
  it("sin trazo no devuelve nada, y clonar no pasa por aquí", () => {
    const s = img(10, 10, [1, 2, 3, 255]);
    expect(applyPaint(img(10, 10, [0, 0, 0, 0]), s, img(10, 10, [0, 0, 0, 0]), "blur", 50, "#000")).toBeNull();
    expect(applyPaint(img(10, 10, [0, 0, 0, 0]), s, maskSquare(10, 10, 2, 2, 4), "clone", 50, "#000")).toBeNull();
  });
  it("el factor de escala agranda la zona afectada", () => {
    const s = img(60, 60, [0, 0, 0, 255]);
    const a = applyPaint(img(60, 60, [0, 0, 0, 0]), s, maskSquare(60, 60, 25, 25, 6), "blur", 50, "#000", 1)!;
    const b = applyPaint(img(60, 60, [0, 0, 0, 0]), s, maskSquare(60, 60, 25, 25, 6), "blur", 50, "#000", 2)!;
    expect(b.w).toBeGreaterThan(a.w);
  });
});

describe("eraseOverlay", () => {
  it("borra lo pintado dentro de la máscara y deja el resto", () => {
    const overlay = img(20, 20, [9, 9, 9, 255]);
    eraseOverlay(overlay, maskSquare(20, 20, 5, 5, 4));
    expect(px(overlay, 6, 6)[3]).toBe(0);
    expect(px(overlay, 0, 0)[3]).toBe(255);
  });
});
