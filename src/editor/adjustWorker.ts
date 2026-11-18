/** Hilo aparte para los ajustes de la foto: así los controles no se traban con fotos grandes. */
import { applyAdjust, type Adjust } from "./editorAdjust";

export type AdjustJob = { id: number; buffer: ArrayBuffer; w: number; h: number; adj: Adjust };
export type AdjustDone = { id: number; buffer: ArrayBuffer; error?: string };

const scope = self as unknown as Worker;

scope.onmessage = (e: MessageEvent<AdjustJob>) => {
  const { id, buffer, w, h, adj } = e.data;
  try {
    const data = new Uint8ClampedArray(buffer);
    applyAdjust(data, w, h, adj);
    scope.postMessage({ id, buffer } satisfies AdjustDone, [buffer]);
  } catch (err) {
    scope.postMessage({ id, buffer, error: String(err) } satisfies AdjustDone, [buffer]);
  }
};
