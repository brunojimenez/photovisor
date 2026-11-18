import { afterEach, describe, expect, it, vi } from "vitest";
import { loadWm, wmNum } from "../editorWm";
import { WM_DEFAULT } from "../editorMark";

function store(value: string | null) {
  vi.stubGlobal("localStorage", { getItem: () => value, setItem: () => {}, removeItem: () => {} });
}

afterEach(() => vi.unstubAllGlobals());

describe("wmNum", () => {
  it("acota y usa el valor por defecto si no es número", () => {
    expect(wmNum(500, 10, 0, 100)).toBe(100);
    expect(wmNum(-5, 10, 0, 100)).toBe(0);
    expect(wmNum("x", 10, 0, 100)).toBe(10);
  });
});

describe("loadWm", () => {
  it("sin nada guardado devuelve los valores por defecto", () => {
    store(null);
    expect(loadWm()).toEqual(WM_DEFAULT);
  });
  it("con JSON roto devuelve los valores por defecto", () => {
    store("{no es json");
    expect(loadWm()).toEqual(WM_DEFAULT);
  });
  it("sanea lo guardado: colores inválidos, rangos y modo", () => {
    store(JSON.stringify({ mode: "image", color: "rojo", opacity: 999, angle: -999, place: "corner", look: "rainbow", text: "x".repeat(200) }));
    const w = loadWm();
    expect(w.mode).toBe("image");
    expect(w.color).toBe(WM_DEFAULT.color);
    expect(w.opacity).toBe(92);
    expect(w.angle).toBe(-75);
    expect(w.place).toBe("br");
    expect(w.look).toBe("rainbow");
    expect(w.text).toHaveLength(80);
    expect(w.on).toBe(false);
  });
});
