import { describe, expect, it } from "vitest";
import { createAdjustRunner } from "../adjustClient";
import { ADJUST_ZERO, applyAdjust } from "../editorAdjust";
import type { AdjustDone, AdjustJob } from "../adjustWorker";

/** ImageData mínimo (el entorno de pruebas no trae el del navegador). */
class FakeImageData {
  data: Uint8ClampedArray;
  constructor(data: Uint8ClampedArray, public width: number, public height: number) {
    this.data = data;
  }
}
(globalThis as unknown as { ImageData: unknown }).ImageData = FakeImageData;

function pixels(v: number, n = 8) {
  const d = new Uint8ClampedArray(n * n * 4);
  for (let i = 0; i < n * n; i++) d.set([v, v, v, 255], i * 4);
  return new FakeImageData(d, n, n) as unknown as ImageData;
}

/** Worker de mentira que responde de inmediato (o cuando se le pide) con el mismo cálculo real. */
function fakeWorker(manual = false) {
  const queue: AdjustJob[] = [];
  const w = {
    onmessage: null as ((e: MessageEvent<AdjustDone>) => void) | null,
    onerror: null as (() => void) | null,
    terminate() {},
    postMessage(job: AdjustJob) {
      queue.push(job);
      if (!manual) w.flush();
    },
    flush() {
      const job = queue.shift();
      if (!job) return;
      applyAdjust(new Uint8ClampedArray(job.buffer), job.w, job.h, job.adj);
      w.onmessage?.({ data: { id: job.id, buffer: job.buffer } } as MessageEvent<AdjustDone>);
    },
    queue,
  };
  return w;
}

describe("createAdjustRunner", () => {
  it("devuelve la imagen con el ajuste aplicado", async () => {
    const w = fakeWorker();
    const runner = createAdjustRunner(() => w as unknown as Worker);
    const out = await runner.run(pixels(100), { ...ADJUST_ZERO, brightness: 60 });
    expect(out).not.toBeNull();
    expect(out!.data[0]).toBeGreaterThan(100);
  });

  it("si el Worker no se puede crear, calcula en el hilo principal", async () => {
    const runner = createAdjustRunner(() => null);
    const out = await runner.run(pixels(100), { ...ADJUST_ZERO, brightness: -60 });
    expect(out!.data[0]).toBeLessThan(100);
  });

  it("mientras corre un pedido solo se guarda el último; los intermedios se descartan", async () => {
    const w = fakeWorker(true);
    const runner = createAdjustRunner(() => w as unknown as Worker);
    const a = runner.run(pixels(100), { ...ADJUST_ZERO, brightness: 10 });
    const b = runner.run(pixels(100), { ...ADJUST_ZERO, brightness: 20 });
    const c = runner.run(pixels(100), { ...ADJUST_ZERO, brightness: 30 });
    expect(w.queue).toHaveLength(1);
    expect(await b).toBeNull();
    w.flush();
    expect((await a)!.data[0]).toBeGreaterThan(100);
    expect(w.queue).toHaveLength(1);
    w.flush();
    expect((await c)!.data[0]).toBeGreaterThan(100);
  });

  it("dispose libera los pedidos en espera", async () => {
    const w = fakeWorker(true);
    const runner = createAdjustRunner(() => w as unknown as Worker);
    const a = runner.run(pixels(100), { ...ADJUST_ZERO, brightness: 10 });
    const b = runner.run(pixels(100), { ...ADJUST_ZERO, brightness: 20 });
    runner.dispose();
    expect(await a).toBeNull();
    expect(await b).toBeNull();
  });

  it("si el Worker falla a mitad de camino, el pedido se completa en el hilo principal", async () => {
    const w = fakeWorker(true);
    const runner = createAdjustRunner(() => w as unknown as Worker);
    const a = runner.run(pixels(100), { ...ADJUST_ZERO, brightness: 60 });
    w.onerror?.();
    const out = await a;
    expect(out!.data[0]).toBeGreaterThan(100);
  });
});
