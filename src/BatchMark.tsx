import { useEffect, useMemo, useRef, useState } from "react";
import { WatermarkDesigner } from "./editor/WatermarkDesigner";
import { loadWm } from "./editor/editorWm";
import { drawWatermark, watermarkIdle, type Watermark } from "./editor/editorMark";
import { batchImages, mediaUrl, saveMarked, type Entry } from "./api";
import { bytesToBase64 } from "./format";

type Props = {
  /** Carpeta que se está viendo. */
  current: string;
  /** Lo que muestra la lista (para saber cuáles de las seleccionadas son fotos). */
  files: Entry[];
  selected: string[];
  onClose: () => void;
  /** Al terminar: resumen para el aviso y para refrescar la lista. */
  onDone: (summary: string) => void;
};

type Scope = "selected" | "folder";
type Progress = { done: number; total: number; failed: number; current: string };

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("no pude leer la foto"));
    im.src = src;
  });
}

/** Formato en que se guarda la copia: el mismo del original cuando el editor lo sabe codificar; si no, PNG. */
function formatOf(path: string): "png" | "jpeg" | "webp" | "avif" {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "jpg" || ext === "jpeg") return "jpeg";
  if (ext === "webp") return "webp";
  if (ext === "avif") return "avif";
  return "png";
}

function nameOf(path: string) {
  return path.split(/[\\/]/).pop() ?? path;
}

/** Dibuja la foto con la marca a su tamaño original y devuelve el PNG en base64. */
async function renderMarked(path: string, version: number, mark: Watermark, stamp: HTMLImageElement | null) {
  const img = await loadImage(mediaUrl(path, version));
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (w < 1 || h < 1) throw new Error("la foto no tiene tamaño");
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no hay lienzo");
  ctx.drawImage(img, 0, 0, w, h);
  drawWatermark(ctx, w, h, { ...mark, on: true }, stamp, { x: 0, y: 0, w, h });
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("no pude generar la imagen");
  return bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
}

export function BatchMark(props: Props) {
  const { current, files, selected } = props;
  const [wm, setWm] = useState<Watermark>(() => ({ ...loadWm(), on: true }));
  const [stamp, setStamp] = useState<HTMLImageElement | null>(null);
  const [stampName, setStampName] = useState("");
  const [scope, setScope] = useState<Scope>(() => (selected.length > 0 ? "selected" : "folder"));
  const [recursive, setRecursive] = useState(false);
  const [folderList, setFolderList] = useState<string[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState("");
  const cancelRef = useRef(false);
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const urlRef = useRef<string | null>(null);

  // la marca se comparte con el editor
  useEffect(() => {
    try {
      localStorage.setItem("editor.wm", JSON.stringify(wm));
    } catch {
      /* sin almacenamiento: vale solo para esta sesión */
    }
  }, [wm]);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  // fotos de la selección (sin GIF ni video)
  const selectedPhotos = useMemo(
    () =>
      selected.filter((path) => {
        const entry = files.find((item) => item.path === path);
        return entry?.kind === "image" && !/\.gif$/i.test(path);
      }),
    [selected, files],
  );

  // fotos de la carpeta, con o sin subcarpetas
  useEffect(() => {
    let live = true;
    batchImages(current, recursive)
      .then((list) => live && setFolderList(list))
      .catch(() => live && setFolderList([]));
    return () => {
      live = false;
    };
  }, [current, recursive]);

  const photos = scope === "selected" ? selectedPhotos : folderList;
  const running = progress !== null && progress.done < progress.total;

  function pickStamp(file: File) {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url;
      setStamp(im);
      setStampName(file.name);
      setWm((w) => ({ ...w, on: true, mode: "image" }));
    };
    im.onerror = () => {
      URL.revokeObjectURL(url);
      setError("No pude leer esa imagen de marca.");
    };
    im.src = url;
  }

  // vista previa sobre la primera foto
  const first = photos[0] ?? null;
  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let live = true;
    if (!first) {
      canvas.width = 360;
      canvas.height = 220;
      ctx.fillStyle = "#14121c";
      ctx.fillRect(0, 0, 360, 220);
      return;
    }
    const version = files.find((item) => item.path === first)?.modifiedMs ?? 0;
    loadImage(mediaUrl(first, version))
      .then((img) => {
        if (!live) return;
        const w = 360;
        const h = Math.max(1, Math.round((w * img.naturalHeight) / Math.max(1, img.naturalWidth)));
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(img, 0, 0, w, h);
        if (!watermarkIdle({ ...wm, on: true }, stamp)) drawWatermark(ctx, w, h, { ...wm, on: true }, stamp, { x: 0, y: 0, w, h });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [first, wm, stamp, files]);

  async function run() {
    if (running || photos.length === 0) return;
    if (watermarkIdle({ ...wm, on: true }, stamp)) {
      setError(wm.mode === "image" ? "Elige la imagen de la marca." : wm.mode === "icon" ? "Elige un ícono para el sello." : "Escribe el texto de la marca.");
      return;
    }
    setError("");
    cancelRef.current = false;
    const list = [...photos];
    let failed = 0;
    let firstError = "";
    let done = 0;
    for (const path of list) {
      if (cancelRef.current) break;
      setProgress({ done, total: list.length, failed, current: nameOf(path) });
      try {
        const version = files.find((item) => item.path === path)?.modifiedMs ?? 0;
        const b64 = await renderMarked(path, version, wm, stamp);
        await saveMarked(path, b64, formatOf(path));
      } catch (err) {
        failed++;
        if (!firstError) firstError = `${nameOf(path)}: ${String(err)}`;
      }
      done++;
    }
    setProgress({ done: list.length, total: list.length, failed, current: "" });
    const ok = done - failed;
    const stopped = cancelRef.current && done < list.length;
    props.onDone(
      `${ok} foto${ok === 1 ? "" : "s"} con marca en «con-marca»` +
        (stopped ? ` · detenido (${list.length - done} sin procesar)` : "") +
        (failed > 0 ? ` · ${failed} con error (${firstError})` : ""),
    );
  }

  return (
    <div className="scrim">
      <div className="dialog batch" role="dialog" aria-modal="true" aria-label="Marca de agua en lote">
        <h2>Marca de agua en lote</h2>
        <p className="batch-note">
          Las copias salen en una subcarpeta <b>con-marca</b> junto a cada foto. Los originales no se tocan. Los GIF y los videos se omiten.
        </p>
        <div className="batch-body">
          <div className="editor-side-main batch-design">
            <WatermarkDesigner wm={wm} setWm={setWm} fileName={stampName} onPickImage={pickStamp} />
          </div>
          <div className="batch-side">
            <canvas ref={previewRef} className="batch-preview" />
            <p className="set-hint">{first ? `Vista previa con «${nameOf(first)}».` : "No hay fotos para mostrar."}</p>
            <fieldset className="batch-scope" disabled={running}>
              <label>
                <input type="radio" name="scope" checked={scope === "selected"} disabled={selectedPhotos.length === 0} onChange={() => setScope("selected")} />
                Fotos seleccionadas ({selectedPhotos.length})
              </label>
              <label>
                <input type="radio" name="scope" checked={scope === "folder"} onChange={() => setScope("folder")} />
                Toda la carpeta ({folderList.length})
              </label>
              {scope === "folder" && (
                <label className="batch-sub">
                  <input type="checkbox" checked={recursive} onChange={(event) => setRecursive(event.target.checked)} />
                  Incluir subcarpetas
                </label>
              )}
            </fieldset>
            {progress && (
              <div className="batch-progress" role="status">
                <progress value={progress.done} max={Math.max(1, progress.total)} />
                <span>
                  {progress.done} de {progress.total}
                  {progress.failed > 0 ? ` · ${progress.failed} con error` : ""}
                  {running && progress.current ? ` · ${progress.current}` : ""}
                </span>
              </div>
            )}
            {error && <p className="batch-error">{error}</p>}
          </div>
        </div>
        <div className="dialog-actions">
          {running ? (
            <button className="text-btn" onClick={() => (cancelRef.current = true)}>Detener</button>
          ) : (
            <button className="text-btn" onClick={props.onClose}>{progress ? "Cerrar" : "Cancelar"}</button>
          )}
          <button className="text-btn primary" disabled={running || photos.length === 0} onClick={() => void run()}>
            {running ? "Aplicando…" : `Aplicar a ${photos.length} foto${photos.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
