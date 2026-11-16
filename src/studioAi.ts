import type { Asset, Session } from "./editor/types";

const API = "http://127.0.0.1:8790";

async function fail(response: Response): Promise<never> {
  let detail = response.statusText;
  try {
    const body = await response.json();
    detail = body.detail || JSON.stringify(body);
  } catch {
    detail = await response.text();
  }
  throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
}

export function assetUrl(id: string) {
  return `${API}/api/assets/${id}/file`;
}

export async function createAiSession() {
  const response = await fetch(`${API}/api/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ module: "i2i", title: "PhotoVisor" }),
  });
  if (!response.ok) await fail(response);
  return response.json() as Promise<Session>;
}

export async function cancelAi() {
  const response = await fetch(`${API}/api/jobs/cancel`, { method: "POST" });
  if (!response.ok) await fail(response);
}

export async function detectPerson(sid: string, image: Blob, opts: { margin: number; detect: number; feather: number }) {
  const body = new FormData();
  body.append("image", image, "foto.png");
  body.append("margin", String(opts.margin));
  body.append("detect", String(opts.detect));
  body.append("feather", String(opts.feather));
  const response = await fetch(`${API}/api/sessions/${sid}/detect`, { method: "POST", body });
  if (!response.ok) await fail(response);
  return response.blob();
}

export async function bgFix(
  sid: string,
  image: Blob,
  opts: { mode: "blur" | "solid"; blur: number; margin: number; feather: number; detect: number; color: string; mask?: Blob },
  pin: boolean,
) {
  const body = new FormData();
  body.append("image", image, "foto.png");
  body.append("mode", opts.mode);
  body.append("blur", String(opts.blur));
  body.append("margin", String(opts.margin));
  body.append("feather", String(opts.feather));
  body.append("detect", String(opts.detect));
  body.append("color", opts.color || "#D4D4D4");
  body.append("pin", pin ? "true" : "false");
  if (opts.mask) body.append("mask", opts.mask, "persona.png");
  const response = await fetch(`${API}/api/sessions/${sid}/bgfix`, { method: "POST", body });
  if (!response.ok) await fail(response);
  return response.json() as Promise<{ job_id: string; session: Session }>;
}

export async function upscale(
  sid: string,
  image: Blob,
  scale: number,
  pin: boolean,
  opts: { tiled?: boolean; faceFix?: boolean; faceFixDenoise?: number; tiledDenoise?: number } = {},
) {
  const chosen = opts || {};
  const body = new FormData();
  body.append("image", image, "foto.png");
  body.append("scale", String(scale));
  body.append("pin", pin ? "true" : "false");
  body.append("tiled", chosen.tiled ? "true" : "false");
  body.append("face_fix", chosen.faceFix ? "true" : "false");
  body.append("face_fix_denoise", String(chosen.faceFixDenoise ?? 0.3));
  body.append("tiled_denoise", String(chosen.tiledDenoise ?? 0.3));
  const response = await fetch(`${API}/api/sessions/${sid}/upscale`, { method: "POST", body });
  if (!response.ok) await fail(response);
  return response.json() as Promise<{ job_id: string; session: Session }>;
}

export async function inpaint(
  sid: string,
  image: Blob,
  mask: Blob,
  prompt: string,
  pin: boolean,
  count = 1,
  engine = "zimage",
) {
  const body = new FormData();
  body.append("image", image, "foto.png");
  body.append("mask", mask, "mask.png");
  body.append("prompt", prompt);
  body.append("pin", pin ? "true" : "false");
  body.append("count", String(Math.max(1, Math.min(4, count || 1))));
  body.append("engine", engine || "zimage");
  const response = await fetch(`${API}/api/sessions/${sid}/inpaint`, { method: "POST", body });
  if (!response.ok) await fail(response);
  return response.json() as Promise<{ job_id: string; session: Session }>;
}

export function outputsOfJob(session: Session, jobId: string): Asset[] {
  const messages = session.messages || [];
  const index = messages.findIndex((message) => message.id === jobId);
  const after = index >= 0 ? messages.slice(index + 1) : messages;
  const images: Asset[] = [];
  for (const message of after) {
    if (message.type !== "result") continue;
    for (const asset of message.assets || []) {
      if (asset.kind === "image" && asset.role !== "upload" && asset.role !== "edit" && asset.role !== "mask" && asset.role !== "draft") {
        images.push(asset);
      }
    }
  }
  return images;
}

export function watchJob(sid: string, jobId: string, onLog: (lines: string[]) => void, onDone: (session: Session) => void) {
  let stop = false;
  const stream = new EventSource(`${API}/api/sessions/${sid}/jobs/${jobId}/stream`);
  stream.onmessage = (event) => {
    if (!stop) onLog((event.data || "").split("\n"));
  };
  const tick = window.setInterval(async () => {
    if (stop) return;
    try {
      const response = await fetch(`${API}/api/sessions/${sid}`);
      if (!response.ok) return;
      const session = (await response.json()) as Session;
      const job = (session.messages || []).find((message) => message.id === jobId);
      if (job?.log_text) onLog(job.log_text.split("\n"));
      if (!job || job.job_status === "done" || job.job_status === "error") {
        stop = true;
        stream.close();
        window.clearInterval(tick);
        onDone(session);
      }
    } catch {
      /* sigue el próximo intento */
    }
  }, 1500);
  return () => {
    stop = true;
    stream.close();
    window.clearInterval(tick);
  };
}
