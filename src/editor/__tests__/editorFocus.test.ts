import { describe, expect, it } from "vitest";
import { drawFocusMask, focusEditApply, focusFinishShape, focusHitTest, focusPresetShape, focusScale, invertAlpha, type FocusShape } from "../editorFocus";

const circle = (x: number, y: number, r: number): FocusShape => ({ x, y, rx: r, ry: r, el: false });

describe("focusScale", () => {
  it("es proporcional al tamaño de la foto, con tope", () => {
    expect(focusScale(1000, 800)).toBe(1);
    expect(focusScale(4000, 3000)).toBe(4);
    expect(focusScale(100000, 1)).toBe(8);
    expect(focusScale(10, 10)).toBe(0.2);
  });
});

describe("focusHitTest", () => {
  const shapes = [circle(100, 100, 50)];
  it("el interior mueve", () => {
    expect(focusHitTest(shapes, { x: 100, y: 100 }, 1, 1)).toEqual({ idx: 0, mode: "move", axis: "both" });
  });
  it("el borde redimensiona (círculo: ambos ejes)", () => {
    expect(focusHitTest(shapes, { x: 150, y: 100 }, 1, 1)).toEqual({ idx: 0, mode: "resize", axis: "both" });
  });
  it("afuera no toca nada", () => {
    expect(focusHitTest(shapes, { x: 300, y: 300 }, 1, 1)).toBeNull();
  });
  it("en una elipse el borde izquierdo cambia el ancho y el de arriba el alto", () => {
    const el: FocusShape[] = [{ x: 100, y: 100, rx: 80, ry: 30, el: true }];
    expect(focusHitTest(el, { x: 180, y: 100 }, 1, 1)?.axis).toBe("x");
    expect(focusHitTest(el, { x: 100, y: 70 }, 1, 1)?.axis).toBe("y");
  });
  it("la última zona dibujada gana si se superponen", () => {
    const two = [circle(100, 100, 50), circle(110, 100, 50)];
    expect(focusHitTest(two, { x: 105, y: 100 }, 1, 1)?.idx).toBe(1);
  });
  it("con zoom alejado el borde es más fácil de atrapar", () => {
    expect(focusHitTest(shapes, { x: 160, y: 100 }, 1, 0.25)?.mode).toBe("resize");
    expect(focusHitTest(shapes, { x: 160, y: 100 }, 1, 2)).toBeNull();
  });
  it("el factor de tamaño escala las zonas", () => {
    expect(focusHitTest(shapes, { x: 170, y: 100 }, 2, 1)).toMatchObject({ mode: "move" });
    expect(focusHitTest(shapes, { x: 170, y: 100 }, 1, 1)).toBeNull();
  });
});

describe("focusEditApply", () => {
  it("mover respeta el desfase del clic", () => {
    const c = circle(100, 100, 50);
    focusEditApply(c, "move", "both", { x: 210, y: 130 }, 1, { x: 10, y: 30 });
    expect(c).toMatchObject({ x: 200, y: 100 });
  });
  it("redimensionar un círculo mantiene la proporción", () => {
    const c = circle(100, 100, 50);
    focusEditApply(c, "resize", "both", { x: 200, y: 100 }, 1, { x: 0, y: 0 });
    expect(c.rx).toBeCloseTo(100);
    expect(c.ry).toBeCloseTo(100);
  });
  it("redimensionar una elipse por un eje deja el otro intacto", () => {
    const c: FocusShape = { x: 100, y: 100, rx: 80, ry: 30, el: true };
    focusEditApply(c, "resize", "x", { x: 300, y: 100 }, 1, { x: 0, y: 0 });
    expect(c.rx).toBe(200);
    expect(c.ry).toBe(30);
  });
  it("nunca baja del mínimo", () => {
    const c = circle(100, 100, 50);
    focusEditApply(c, "resize", "x", { x: 100, y: 100 }, 1, { x: 0, y: 0 });
    expect(c.rx).toBe(4);
  });
});

describe("focusFinishShape", () => {
  it("un clic sin arrastre crea una zona por defecto", () => {
    const s = focusFinishShape({ x: 50, y: 50, rx: 0, ry: 0, el: false }, 1, 1000, 800);
    expect(s.rx).toBe(200);
    expect(s.ry).toBe(200);
  });
  it("una elipse sin arrastre es más baja que ancha", () => {
    const s = focusFinishShape({ x: 50, y: 50, rx: 0, ry: 0, el: true }, 1, 1000, 800);
    expect(s.ry).toBeLessThan(s.rx);
  });
  it("conserva lo arrastrado", () => {
    expect(focusFinishShape({ x: 5, y: 6, rx: 120, ry: 90, el: true }, 1, 1000, 800)).toEqual({ x: 5, y: 6, rx: 120, ry: 90, el: true });
  });
});

describe("focusPresetShape", () => {
  it("la viñeta cubre el encuadre y el retrato queda vertical", () => {
    const v = focusPresetShape("vignette", 1000, 800).shape;
    expect(v.rx).toBeGreaterThan(500);
    const p = focusPresetShape("portrait", 1000, 800).shape;
    expect(p.ry / 800).toBeGreaterThan(p.rx / 1000);
  });
  it("la banda es mucho más ancha que alta", () => {
    const b = focusPresetShape("band", 1000, 800).shape;
    expect(b.rx).toBeGreaterThan(b.ry * 3);
  });
});

describe("invertAlpha", () => {
  it("invierte solo el canal alfa", () => {
    const d = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 0]);
    invertAlpha(d);
    expect(Array.from(d)).toEqual([10, 20, 30, 0, 40, 50, 60, 255]);
  });
});

describe("drawFocusMask", () => {
  it("dibuja una elipse con degradado por zona, con el borde suave pedido", () => {
    const calls: string[] = [];
    const stops: number[][] = [];
    const ctx = {
      save: () => calls.push("save"),
      restore: () => calls.push("restore"),
      translate: (x: number, y: number) => calls.push(`t${x},${y}`),
      scale: (x: number, y: number) => calls.push(`s${x},${y}`),
      createRadialGradient: (...a: number[]) => {
        stops.push(a);
        return { addColorStop: () => {} };
      },
      beginPath: () => {},
      arc: () => {},
      fill: () => calls.push("fill"),
      fillStyle: "",
    } as unknown as CanvasRenderingContext2D;
    drawFocusMask(ctx, [{ x: 10, y: 20, rx: 30, ry: 40, el: true }, circle(0, 0, 5)], 2, 0.5);
    expect(calls.filter((c) => c === "fill")).toHaveLength(2);
    expect(calls).toContain("t10,20");
    expect(calls).toContain("s60,80");
    expect(stops[0][2]).toBeCloseTo(0.5);
  });
});
