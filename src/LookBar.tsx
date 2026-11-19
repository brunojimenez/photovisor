import { useEffect, useRef, useState, type CSSProperties } from "react";
import { applyAdjust } from "./editor/editorAdjust";
import { PRESETS, presetAdjust, type Preset } from "./editor/editorPresets";

const RECENT_KEY = "pv.recentLooks";
const PREVIEW_EDGE = 1600;

/** Los últimos looks usados (los mismos que el editor), completados con los primeros de la lista. */
export function recentLooks(max: number): Preset[] {
  let saved: string[] = [];
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    if (Array.isArray(raw)) saved = raw.filter((id) => typeof id === "string");
  } catch {
    /* sin almacenamiento */
  }
  const ids = [...new Set([...saved.filter((id) => PRESETS.some((p) => p.id === id)), ...PRESETS.map((p) => p.id)])];
  return ids.slice(0, max).map((id) => PRESETS.find((p) => p.id === id)!);
}

export function rememberLook(id: string) {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    const list = (Array.isArray(raw) ? raw : []).filter((x) => x !== id);
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...list].slice(0, 8)));
  } catch {
    /* sin almacenamiento */
  }
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(String(response.status));
  const objectUrl = URL.createObjectURL(await response.blob());
  try {
    const img = new Image();
    img.src = objectUrl;
    await img.decode();
    return img;
  } finally {
    // la imagen ya está decodificada: se puede soltar la URL
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}

function render(img: HTMLImageElement, preset: Preset, amount: number, edge: number): HTMLCanvasElement {
  const k = Math.min(1, edge / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * k));
  const h = Math.max(1, Math.round(img.naturalHeight * k));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  applyAdjust(data.data, w, h, presetAdjust(preset, amount));
  ctx.putImageData(data, 0, 0);
  return canvas;
}

/** La foto con el look puesto, solo para mirar: no toca el archivo. Va encima de la imagen del visor. */
export function LookPreview(props: { url: string; preset: Preset; amount: number; style?: CSSProperties; onReady: (ready: boolean) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const source = useRef<{ url: string; img: HTMLImageElement } | null>(null);
  const { url, preset, amount, onReady } = props;

  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(async () => {
      try {
        if (source.current?.url !== url) source.current = { url, img: await loadImage(url) };
        if (!live || !ref.current || !source.current) return;
        const out = render(source.current.img, preset, amount, PREVIEW_EDGE);
        ref.current.width = out.width;
        ref.current.height = out.height;
        ref.current.getContext("2d")!.drawImage(out, 0, 0);
        onReady(true);
      } catch {
        if (live) onReady(false);
      }
    }, 60);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [url, preset, amount, onReady]);

  return <canvas ref={ref} className="look-canvas" style={props.style} aria-hidden="true" />;
}

/** La foto completa con el look, como PNG sin pérdida. El formato final lo decide quien guarda. */
export async function renderLookBlob(url: string, preset: Preset, amount: number): Promise<Blob> {
  const img = await loadImage(url);
  const canvas = render(img, preset, amount, Number.MAX_SAFE_INTEGER);
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no se pudo crear la imagen"))), "image/png"));
}

/** Tira de looks sobre la foto del visor, y la confirmación para aplicarlos. */
export function LookBar(props: {
  active: Preset | null;
  amount: number;
  ready: boolean;
  busy: boolean;
  onPick: (preset: Preset | null) => void;
  onAmount: (n: number) => void;
  onSave: (mode: "copy" | "replace") => void;
}) {
  const [all, setAll] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const list = all ? PRESETS : recentLooks(6);

  useEffect(() => setConfirmReplace(false), [props.active]);

  return (
    <div className="look-bar" onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
      {props.active && (
        <div className="look-confirm">
          <strong>{props.active.label}</strong>
          <span className="look-hint">Vista previa: la foto aún no cambia.</span>
          <input
            type="range"
            min={0}
            max={100}
            value={props.amount}
            title={`Intensidad ${props.amount}%`}
            aria-label="Intensidad del look"
            onChange={(event) => props.onAmount(Number(event.target.value))}
          />
          <button className="look-ok" disabled={!props.ready || props.busy} onClick={() => props.onSave("copy")} title="Guarda una copia con el look y deja la original intacta">
            Guardar copia
          </button>
          {confirmReplace ? (
            <button className="look-warn" disabled={!props.ready || props.busy} onClick={() => props.onSave("replace")} title="Esto cambia la foto original">
              ¿Reemplazar la original?
            </button>
          ) : (
            <button disabled={!props.ready || props.busy} onClick={() => setConfirmReplace(true)} title="Aplica el look sobre la foto original">
              Reemplazar…
            </button>
          )}
          <button onClick={() => props.onPick(null)}>Cancelar</button>
        </div>
      )}
      <div className="look-chips">
        {list.map((p) => (
          <button
            key={p.id}
            className={props.active?.id === p.id ? "on" : ""}
            title={`Ver el look «${p.label}» (no cambia la foto hasta que lo guardes)`}
            onClick={() => props.onPick(props.active?.id === p.id ? null : p)}
          >
            <i style={{ background: `linear-gradient(135deg, ${p.swatch[0]}, ${p.swatch[1]})` }} />
            {p.label}
          </button>
        ))}
        <button className="look-more" onClick={() => setAll((v) => !v)} title={all ? "Solo los últimos usados" : "Ver todos los looks"}>
          {all ? "Menos" : "Todos"}
        </button>
      </div>
    </div>
  );
}
