import { applyAdjust, type Adjust } from "./editorAdjust";
import type { AdjustDone, AdjustJob } from "./adjustWorker";

/**
 * Aplica los ajustes en un Worker. Mientras uno corre, solo se guarda la última petición
 * (si el usuario sigue moviendo un control, las intermedias se descartan).
 * Si el navegador no puede crear el Worker, cae al cálculo en el hilo principal.
 */
export type AdjustRunner = {
  run: (pixels: ImageData, adj: Adjust) => Promise<ImageData | null>;
  dispose: () => void;
};

type Pending = { pixels: ImageData; adj: Adjust; resolve: (v: ImageData | null) => void };

/** El pedido corre en `exec`, que recibe el buffer y devuelve el buffer procesado (con el Worker, o en el mismo hilo si falla). */
export function createAdjustRunner(makeWorker: () => Worker | null = defaultWorker): AdjustRunner {
  let worker: Worker | null | undefined;
  let busy = false;
  let pending: Pending | null = null;
  let seq = 0;
  let current: { id: number; job: Pending } | null = null;

  const get = () => {
    if (worker === undefined) {
      try {
        worker = makeWorker();
      } catch {
        worker = null;
      }
      if (worker) {
        worker.onmessage = (e: MessageEvent<AdjustDone>) => finish(e.data);
        worker.onerror = () => {
          // El Worker falló: se pasa al hilo principal para este y los siguientes pedidos.
          worker?.terminate();
          worker = null;
          if (current) {
            const job = current.job;
            current = null;
            runInline(job);
          }
        };
      }
    }
    return worker;
  };

  const next = () => {
    busy = false;
    if (pending) {
      const p = pending;
      pending = null;
      start(p);
    }
  };

  const finish = (done: AdjustDone) => {
    if (!current || current.id !== done.id) return;
    const { job } = current;
    current = null;
    if (done.error) job.resolve(null);
    else job.resolve(new ImageData(new Uint8ClampedArray(done.buffer), job.pixels.width, job.pixels.height));
    next();
  };

  const runInline = (job: Pending) => {
    try {
      applyAdjust(job.pixels.data, job.pixels.width, job.pixels.height, job.adj);
      job.resolve(job.pixels);
    } catch {
      job.resolve(null);
    }
    next();
  };

  const start = (job: Pending) => {
    busy = true;
    const w = get();
    if (!w) {
      runInline(job);
      return;
    }
    const id = ++seq;
    current = { id, job };
    const { width, height, data } = job.pixels;
    const buffer = data.buffer as ArrayBuffer;
    w.postMessage({ id, buffer, w: width, h: height, adj: job.adj } satisfies AdjustJob, [buffer]);
  };

  return {
    run(pixels, adj) {
      return new Promise((resolve) => {
        const job: Pending = { pixels, adj, resolve };
        if (!busy) {
          start(job);
          return;
        }
        // Reemplaza al pedido en espera: ese ya no interesa.
        if (pending) pending.resolve(null);
        pending = job;
      });
    },
    dispose() {
      worker?.terminate();
      worker = null;
      if (pending) pending.resolve(null);
      pending = null;
      if (current) current.job.resolve(null);
      current = null;
      busy = false;
    },
  };
}

function defaultWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  return new Worker(new URL("./adjustWorker.ts", import.meta.url), { type: "module" });
}
