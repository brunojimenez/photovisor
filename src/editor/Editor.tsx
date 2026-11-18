import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, Bandage, Focus, Brush, ClipboardCopy, Crop, Download, Eraser, Eye, FlipHorizontal2, FlipVertical2, Maximize, MoveHorizontal,
  MoveVertical, Paintbrush, Palette, Pencil, Pipette, Replace, RotateCcw, RotateCcwSquare, RotateCwSquare, Save, SaveAll, Scaling,
  SlidersHorizontal, Smile, Square, Stamp, Type, WandSparkles, Wrench, type LucideIcon,
} from "lucide-react";
import { ADJUST_ZERO, HSL_BANDS, STYLE_KINDS, applyAdjust, adjustIdle, type Adjust, type Band, type HslKey } from "./editorAdjust";
import { PRESETS, presetAdjust } from "./editorPresets";
import { LUCIDE_STICKERS, lucideNode } from "./lucideStickers";
import { WM_COLOR_ICONS, WM_DEFAULT, drawPieces, drawWatermark, installedFonts, watermarkIdle, wmFont, type Piece, type Watermark } from "./editorMark";
import { applyPaint, cloneCanvas, eraseOverlay, type PaintFx } from "./editorPaint";

type Crop = { x: number; y: number; w: number; h: number };
type Handle = "body" | "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
type Mark = "pencil" | "brush" | "eraser";
type Tool = "adjust" | "crop" | "paint" | "stick" | "text" | "fill" | "wm";
/** Fichas de estilo: con miniatura si hay (las pasa la app), si no, un botón de texto. */
function StyleTiles(props: {
  items: { id: string | number; label: string }[];
  value: string | number;
  thumbs?: Record<string, string>;
  onPick: (id: any) => void;
}) {
  return (
    <div className={props.thumbs ? "style-grid" : "editor-looks"}>
      {props.items.map((s) => {
        const src = props.thumbs?.[String(s.id)];
        const on = props.value === s.id;
        if (!props.thumbs) {
          return (
            <button key={s.id} type="button" className={`editor-look ${on ? "on" : ""}`} onClick={() => props.onPick(s.id)}>
              {s.label}
            </button>
          );
        }
        return (
          <button key={s.id} type="button" className={`style-tile ${on ? "on" : ""}`} onClick={() => props.onPick(s.id)} aria-pressed={on}>
            <span className="style-thumb">{src ? <img src={src} alt="" draggable={false} /> : <b>✎</b>}</span>
            <span className="style-name">{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}

type AiMode = "blur" | "solid" | "replace" | "upscale" | "style";

/** Estilos de la IA (ids que entiende el estudio). "custom" usa el texto que escriba la persona. */
const STYLE_CHOICES = [
  { id: "cartoon", label: "Cartoon" },
  { id: "anime", label: "Anime" },
  { id: "pixar", label: "3D animado" },
  { id: "comic", label: "Cómic" },
  { id: "watercolor", label: "Acuarela" },
  { id: "oil", label: "Óleo" },
  { id: "sketch", label: "Boceto" },
  { id: "custom", label: "Otro…" },
];
type View = { scale: number; left: number; top: number };
export type BgFixOpts = {
  mode: "blur" | "solid";
  blur: number;
  margin: number;
  feather: number;
  detect: number;
  color: string;
  mask?: Blob;
};

const SLIDERS: { key: keyof Adjust; label: string; min?: number; def?: number }[] = [
  { key: "brightness", label: "Brillo" },
  { key: "hdr", label: "Exposición" },
  { key: "contrast", label: "Contraste" },
  { key: "highlights", label: "Luces" },
  { key: "shadows", label: "Sombras" },
  { key: "white", label: "Punto blanco" },
  { key: "black", label: "Punto negro" },
  { key: "vignette", label: "Viñeta" },
  { key: "marco", label: "Marco" },
  { key: "saturate", label: "Saturación" },
  { key: "warmth", label: "Calidez" },
  { key: "tint", label: "Tono" },
  { key: "skin", label: "Tono piel" },
  { key: "blue", label: "Tono azul" },
  { key: "detail", label: "Detalle" },
  { key: "sharp", label: "Nitidez" },
  { key: "denoise", label: "Ruido", min: 0 },
  { key: "chroma", label: "Ruido color", min: 0 },
  { key: "grain", label: "Grano", min: 0 },
  { key: "grainSize", label: "Tamaño grano", min: 0, def: 40 },
];

const GROUPS: { title: string; keys: (keyof Adjust)[] }[] = [
  { title: "Claro", keys: ["brightness", "hdr", "contrast", "highlights", "shadows", "white", "black", "vignette", "marco"] },
  { title: "Color", keys: ["saturate", "warmth", "tint", "skin", "blue"] },
  { title: "Detalle", keys: ["detail", "sharp", "denoise", "chroma", "grain", "grainSize"] },
];

const ZOOM_MIN = 0.05;
const ZOOM_MAX = 4;
const SIDE_MIN = 280;
const SIDE_MAX = 560;
const SIDE_DEF = 380;
const MARKS: { id: Mark; label: string; tip: string }[] = [
  { id: "pencil", label: "Lápiz", tip: "Trazo duro. Para recortar lámpara o muralla." },
  { id: "brush", label: "Pincel", tip: "Borde suave. Para el telón y el degradé." },
  { id: "eraser", label: "Goma", tip: "Saca pintura. Eso no se rellena." },
];
const PAINT_FX: { id: PaintFx; label: string; tip: string }[] = [
  { id: "blur", label: "Difuminar", tip: "Suaviza solo el trazo. No se guarda hasta que pulses Guardar." },
  { id: "color", label: "Colorear", tip: "Pinta color sobre la zona. Deshacer saca el trazo." },
  { id: "pixel", label: "Pixelar", tip: "Agrupa píxeles en la zona pintada." },
  { id: "clone", label: "Clonar", tip: "Copia textura desde un origen. Shift+clic fija ese origen." },
  { id: "heal", label: "Reparar", tip: "Quita manchas, polvo o marcas rellenando con la textura de alrededor." },
];
const PAINT_SWATCHES = [
  { hex: "#1A1A1A", tip: "Negro" },
  { hex: "#F4F4F4", tip: "Blanco" },
  { hex: "#C45C4A", tip: "Rojo" },
  { hex: "#D4A017", tip: "Amarillo" },
  { hex: "#3D7A4A", tip: "Verde" },
  { hex: "#3A6EA5", tip: "Azul" },
];
const BG_SWATCHES = [
  { hex: "#D4D4D4", tip: "Estudio" },
  { hex: "#F4F4F4", tip: "Blanco" },
  { hex: "#1A1A1A", tip: "Negro" },
  { hex: "#E8DFD4", tip: "Cálido" },
  { hex: "#C9D2DC", tip: "Frío" },
];

function workingSize(iw: number, ih: number, rot: number) {
  return rot % 180 === 0 ? { w: iw, h: ih } : { w: ih, h: iw };
}

function drawOriented(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  rot: number,
  flipH: boolean,
  flipV: boolean,
  tilt = 0,
) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const { w: W, h: H } = workingSize(iw, ih, rot);
  ctx.save();
  ctx.filter = "none";
  ctx.translate(W / 2, H / 2);
  if (tilt) {
    const rad = (tilt * Math.PI) / 180;
    const sin = Math.abs(Math.sin(rad));
    const cos = Math.abs(Math.cos(rad));
    const cover = Math.max((W * cos + H * sin) / W, (W * sin + H * cos) / H);
    ctx.rotate(rad);
    ctx.scale(cover, cover);
  }
  ctx.rotate((rot * Math.PI) / 180);
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  ctx.drawImage(img, -iw / 2, -ih / 2);
  ctx.restore();
}

function clampCrop(c: Crop, W: number, H: number): Crop {
  const min = 32;
  let { x, y, w, h } = c;
  w = Math.max(min, Math.min(W, w));
  h = Math.max(min, Math.min(H, h));
  x = Math.max(0, Math.min(W - w, x));
  y = Math.max(0, Math.min(H - h, y));
  return { x, y, w, h };
}

function fitRatio(W: number, H: number, ratio: number): Crop {
  let w = W;
  let h = w / ratio;
  if (h > H) {
    h = H;
    w = h * ratio;
  }
  return clampCrop({ x: (W - w) / 2, y: (H - h) / 2, w, h }, W, H);
}

function clampZoom(n: number) {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, n));
}

function drawMarco(ctx: CanvasRenderingContext2D, w: number, h: number, amt: number) {
  if (!amt) return;
  const t = Math.max(3, Math.round(Math.min(w, h) * (0.012 + (Math.abs(amt) / 100) * 0.1)));
  const rgb = amt < 0 ? "255,255,255" : "0,0,0";
  const a = Math.min(1, Math.abs(amt) / 70);
  const band = t * 1.6;
  ctx.save();
  const sides: [CanvasGradient, number, number, number, number][] = [
    [ctx.createLinearGradient(0, 0, 0, band), 0, 0, w, band],
    [ctx.createLinearGradient(0, h, 0, h - band), 0, h - band, w, band],
    [ctx.createLinearGradient(0, 0, band, 0), 0, 0, band, h],
    [ctx.createLinearGradient(w, 0, w - band, 0), w - band, 0, band, h],
  ];
  for (const [g, x, y, bw, bh] of sides) {
    g.addColorStop(0, `rgba(${rgb},${a})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, bw, bh);
  }
  ctx.restore();
}

function raster(
  img: HTMLImageElement,
  rot: number,
  flipH: boolean,
  flipV: boolean,
  width: number,
  height: number,
  adj: Adjust | null,
  tilt = 0,
) {
  const { w: W, h: H } = workingSize(img.naturalWidth, img.naturalHeight, rot);
  const src = document.createElement("canvas");
  src.width = W;
  src.height = H;
  const sctx = src.getContext("2d");
  if (!sctx) return null;
  drawOriented(sctx, img, rot, flipH, flipV, tilt);
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const octx = out.getContext("2d");
  if (!octx) return null;
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(src, 0, 0, width, height);
  if (adj && !adjustIdle(adj)) {
    const pix = octx.getImageData(0, 0, width, height);
    applyAdjust(pix.data, width, height, adj);
    octx.putImageData(pix, 0, 0);
  }
  if (adj?.marco) drawMarco(octx, width, height, adj.marco);
  return out;
}

const WM_ICONS = [
  "★", "☆", "♥", "♡", "◆", "◇", "●", "○", "■", "□", "▲", "✦", "✓", "©", "™", "∞", "♪", "•",
  "△", "▼", "▽", "◀", "▶", "✧", "✔", "✗", "✘", "®", "♫", "♬", "◦", "✿", "❀", "❁",
  "✱", "✲", "✺", "☀", "☾", "☁", "☂", "⚡", "☺", "♠", "♣", "♦", "♔", "♕", "☎", "✈",
  "✂", "✉", "⚑", "➤", "➜", "→", "←", "↑", "↓", "↔", "⌂", "☮", "☯", "☠", "☘", "❖",
  "✪", "✯", "§", "¶", "†", "№", "°", "±", "×", "÷", "≈", "€", "£", "¥",
];
const WM_TRACE = WM_ICONS.map((ch) => ({ ch, tip: ch }));
const WM_PLACES = [
  ["tile", "Repetir", "Repetir en diagonal"],
  ["center", "Centro", "Un sello al centro"],
  ["tl", "↖", "Arriba a la izquierda"],
  ["tr", "↗", "Arriba a la derecha"],
  ["bl", "↙", "Abajo a la izquierda"],
  ["br", "↘", "Abajo a la derecha"],
] as const;

function wmNum(v: unknown, fallback: number, lo: number, hi: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}

function loadWm(): Watermark {
  try {
    const raw = localStorage.getItem("editor.wm");
    if (!raw) return WM_DEFAULT;
    const parsed = JSON.parse(raw) as Partial<Watermark>;
    return {
      on: false,
      mode: parsed.mode === "image" ? "image" : "text",
      text: typeof parsed.text === "string" ? parsed.text.slice(0, 80) : "",
      font: wmFont(typeof parsed.font === "string" ? parsed.font : ""),
      color: typeof parsed.color === "string" && /^#[0-9a-fA-F]{6}$/.test(parsed.color) ? parsed.color : WM_DEFAULT.color,
      opacity: wmNum(parsed.opacity, WM_DEFAULT.opacity, 8, 92),
      angle: wmNum(parsed.angle, WM_DEFAULT.angle, -75, 75),
      size: wmNum(parsed.size, WM_DEFAULT.size, 10, 80),
      gap: wmNum(parsed.gap, WM_DEFAULT.gap, 0, 100),
      shade: wmNum(parsed.shade, WM_DEFAULT.shade, 0, 100),
      place: (() => {
        const saved = String(parsed.place || "");
        if (saved === "corner" || saved === "br") return "br" as const;
        if (saved === "center" || saved === "tl" || saved === "tr" || saved === "bl" || saved === "tile") return saved;
        return "tile" as const;
      })(),
    };
  } catch {
    return WM_DEFAULT;
  }
}

const FILL_ENGINES: { id: string; label: string; note: string }[] = [
  { id: "local", label: "Clonar", note: "Sin IA: tapa el trazo con el color del telón." },
  { id: "zimage", label: "Z-Image", note: "Recorta lo pintado, corre el prompt en esa mini foto y pega." },
  { id: "epicxl", label: "epiCRealism", note: "Igual: prompt solo sobre el recorte. SDXL." },
  { id: "pony", label: "Pony", note: "Mini foto + prompt · score tags" },
  { id: "juggernaut", label: "Juggernaut", note: "Mini foto + prompt · colores vivos" },
  { id: "realvis", label: "RealVis", note: "Mini foto + prompt · look glamour" },
];

function upscaleMotor(tiled: boolean, faceFix: boolean) {
  if (tiled && faceFix) return "Z-Image Tiled + FaceFix";
  if (tiled) return "Z-Image Tiled";
  if (faceFix) return "UltraSharp + FaceFix";
  return "UltraSharp";
}

export default function Editor({
  src,
  onCancel,
  onSave,
  onSuggestTilt,
  outputType,
  onInpaint,
  onBgFix,
  onUpscale,
  onStylize,
  styleThumbs,
  startTool,
  startAiMode,
  onDetect,
  pending = false,
  pendingLabel = "",
  liveLog = [],
  choices,
  onPickChoice,
  onDismissChoices,
  onCancelJob,
  local = false,
  folderSave = false,
  onDirtyChange,
}: {
  src: string;
  onCancel: () => void;
  /** `format` dice en qué formato debe quedar el archivo; el blob siempre es un PNG sin pérdida. */
  onSave: (blob: Blob, pin: boolean, mode: "copy" | "replace", format?: "png" | "jpeg" | "webp" | "avif") => Promise<void>;
  /** Si se da, el panel de giro muestra «Auto»: devuelve los grados para enderezar la foto, o null. */
  onSuggestTilt?: () => Promise<number | null>;
  /** Formato al guardar. Por defecto PNG. */
  outputType?: "image/png" | "image/jpeg" | "image/webp" | "image/avif";
  onInpaint?: (image: Blob, mask: Blob, prompt: string, pin: boolean, count?: number, engine?: string) => Promise<void>;
  onBgFix?: (image: Blob, opts: BgFixOpts, pin: boolean) => Promise<void>;
  onUpscale?: (
    image: Blob,
    scale: number,
    pin: boolean,
    opts?: { tiled?: boolean; faceFix?: boolean; faceFixDenoise?: number; tiledDenoise?: number },
  ) => Promise<void>;
  /** Pestaña y modo de IA con los que abre (p. ej. «Borrar o cambiar una zona» desde la sección IA). */
  startTool?: "adjust" | "fill";
  /** Miniaturas por estilo (`original` = foto de muestra). Sin esto los estilos se muestran como botones de texto. */
  styleThumbs?: Record<string, string>;
  startAiMode?: "blur" | "solid" | "replace" | "upscale" | "style";
  onStylize?: (image: Blob, style: string, opts: { prompt?: string; guidance?: number; count?: number }, pin: boolean) => Promise<unknown>;
  onDetect?: (image: Blob, opts: { margin: number; detect: number; feather: number }) => Promise<Blob>;
  pending?: boolean;
  pendingLabel?: string;
  liveLog?: string[];
  choices?: { id: string; url: string }[];
  onPickChoice?: (id: string) => void;
  onDismissChoices?: () => void;
  onCancelJob?: () => void;
  /** Sin ComfyUI: abre una foto local, sin IA ni referencia. */
  local?: boolean;
  /** Con local: guardar copia o reemplazo en la carpeta, en vez de descargar. */
  folderSave?: boolean;
  /** Avisa si hay cambios sin guardar. */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const bakedRef = useRef<HTMLCanvasElement | null>(null);
  const drag = useRef<{ handle: Handle; x0: number; y0: number; crop0: Crop } | null>(null);
  const panDrag = useRef<{ x0: number; y0: number; left0: number; top0: number } | null>(null);
  const hold = useRef<number | null>(null);
  const moved = useRef(false);
  const adjRef = useRef<Adjust>(ADJUST_ZERO);
  const compareRef = useRef(false);
  const viewRef = useRef<View>({ scale: 1, left: 0, top: 0 });
  const fittedRef = useRef(true);
  const toolRef = useRef<Tool>("adjust");
  const aiModeRef = useRef<AiMode>("blur");
  const markRef = useRef<Mark>("pencil");
  const brushRef = useRef(36);
  const hardnessRef = useRef(50);
  const paintFxRef = useRef<PaintFx>("blur");
  const paintStrengthRef = useRef(50);
  const paintColorRef = useRef("#1A1A1A");
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const strokeRef = useRef<HTMLCanvasElement | null>(null);
  const undoRef = useRef<HTMLCanvasElement[]>([]);
  const redoRef = useRef<HTMLCanvasElement[]>([]);
  const beforeRef = useRef<HTMLCanvasElement | null>(null);
  const stroking = useRef(false);
  // Foco: círculos que quedan nítidos; el efecto (difuminar, pixelar, color) va afuera (o adentro) con borde difuso
  const focusCircles = useRef<{ x: number; y: number; r: number }[]>([]);
  const focusDrag = useRef<{ x: number; y: number; r: number } | null>(null);
  const focusOnRef = useRef(false);
  const brushMaxRef = useRef(220);
  const focusSoftRef = useRef(45);
  const focusInsideRef = useRef(false);
  const [focusOn, setFocusOn] = useState(false);
  const [focusSoft, setFocusSoft] = useState(45);
  const [focusInside, setFocusInside] = useState(false);
  const [focusN, setFocusN] = useState(0);
  const focusKRef = useRef(1);
  const [focusK, setFocusK] = useState(1);
  const [ready, setReady] = useState(false);
  const [adj, setAdj] = useState<Adjust>(ADJUST_ZERO);
  const [rot, setRot] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [crop, setCrop] = useState<Crop>({ x: 0, y: 0, w: 1, h: 1 });
  const [view, setView] = useState<View>({ scale: 1, left: 0, top: 0 });
  const [pin, setPin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [compare, setCompare] = useState(false);
  const [tool, setTool] = useState<Tool>(startTool ?? "adjust");
  const [paintFx, setPaintFx] = useState<PaintFx>("blur");
  const [paintStrength, setPaintStrength] = useState(50);
  const [paintColor, setPaintColor] = useState("#1A1A1A");
  const [paintTick, setPaintTick] = useState(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [aiMode, setAiMode] = useState<AiMode>(startAiMode ?? "blur");
  const [upScale, setUpScale] = useState(2);
  const [styleId, setStyleId] = useState("cartoon");
  const [quickThumbs, setQuickThumbs] = useState<Record<string, string>>({});
  useEffect(() => {
    const sample = styleThumbs?.original;
    if (!sample) return;
    let alive = true;
    const img = new Image();
    img.onload = () => {
      if (!alive) return;
      const out: Record<string, string> = {};
      const draw = (adjust: Adjust) => {
        const cv = document.createElement("canvas");
        cv.width = 256;
        cv.height = 256;
        const cx = cv.getContext("2d");
        if (!cx) return "";
        cx.drawImage(img, 0, 0, 256, 256);
        const px = cx.getImageData(0, 0, 256, 256);
        applyAdjust(px.data, 256, 256, adjust);
        cx.putImageData(px, 0, 0);
        return cv.toDataURL("image/jpeg", 0.85);
      };
      out["0"] = sample;
      for (const s of STYLE_KINDS) out[String(s.id)] = draw({ ...ADJUST_ZERO, style: s.id, styleAmt: 70 });
      setQuickThumbs(out);
    };
    img.src = sample;
    return () => {
      alive = false;
    };
  }, [styleThumbs?.original]);
  const [stylePrompt, setStylePrompt] = useState("");
  const [styleGuidance, setStyleGuidance] = useState(2.5);
  const [styleCount, setStyleCount] = useState(1);
  const [upTiled, setUpTiled] = useState(() => localStorage.getItem("studio.upTiled") !== "0");
  const [upFaceFix, setUpFaceFix] = useState(() => localStorage.getItem("studio.upFaceFix") !== "0");
  const [upFfDenoise, setUpFfDenoise] = useState(() => {
    const n = Number(localStorage.getItem("studio.upFfDenoise"));
    return Number.isFinite(n) && n > 0 ? n : 0.3;
  });
  const [upTiledDenoise, setUpTiledDenoise] = useState(() => {
    const n = Number(localStorage.getItem("studio.upTiledDenoise"));
    return Number.isFinite(n) ? n : 0.3;
  });
  const [blurAmt, setBlurAmt] = useState(70);
  const [bgMargin, setBgMargin] = useState(8);
  const [bgFeather, setBgFeather] = useState(18);
  const [bgDetect, setBgDetect] = useState(32);
  const [bgColor, setBgColor] = useState("#D4D4D4");
  const [outScale, setOutScale] = useState(1);
  const [mark, setMark] = useState<Mark>("pencil");
  const [brush, setBrush] = useState(36);
  const [hardness, setHardness] = useState(50);
  const [fillPrompt, setFillPrompt] = useState("");
  const [fillEngine, setFillEngine] = useState(() => {
    if (!localStorage.getItem("studio.fillEngine.v4")) {
      localStorage.setItem("studio.fillEngine.v4", "1");
      localStorage.setItem("studio.fillEngine", "zimage");
      return "zimage";
    }
    const s = localStorage.getItem("studio.fillEngine") || "zimage";
    return FILL_ENGINES.some((e) => e.id === s) ? s : "local";
  });
  const [variants, setVariants] = useState(2);
  const [sideW, setSideW] = useState(() => {
    const n = Number(localStorage.getItem("studio.editorSideW"));
    return Number.isFinite(n) && n >= SIDE_MIN ? Math.min(SIDE_MAX, n) : SIDE_DEF;
  });
  const sideDrag = useRef<number | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [savedKey, setSavedKey] = useState("");
  const [keysOpen, setKeysOpen] = useState(false);
  const [autoBusy, setAutoBusy] = useState(false);
  const [hslBand, setHslBand] = useState<Band>("r");
  const [presetId, setPresetId] = useState("");
  const [presetAmt, setPresetAmt] = useState(100);
  const [wbPick, setWbPick] = useState(false);
  const wbPickRef = useRef(false);
  const adjBeforeLook = useRef<Adjust | null>(null);
  const [maskTick, setMaskTick] = useState(0);
  const [cursor, setCursor] = useState<{ x: number; y: number; on: boolean }>({ x: 0, y: 0, on: false });
  const maskRef = useRef<HTMLCanvasElement | null>(null);
  const personMaskRef = useRef<HTMLCanvasElement | null>(null);
  const lastPaint = useRef<{ x: number; y: number } | null>(null);
  const [choicePick, setChoicePick] = useState(0);
  const [wm, setWm] = useState<Watermark>(loadWm);
  const [wmTick, setWmTick] = useState(0);
  const [tilt, setTilt] = useState(0);
  const [cropRatio, setCropRatio] = useState(-1);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [pieceId, setPieceId] = useState(0);
  const [stickIcon, setStickIcon] = useState("❤️");
  const pieceHist = useRef<{ list: Piece[]; id: number }[]>([]);
  const pieceKey = useRef("");
  const pieceFresh = useRef(false);
  const [pieceUndoN, setPieceUndoN] = useState(0);
  const [noteText, setNoteText] = useState("");
  const [noteFont, setNoteFont] = useState("Segoe UI");
  const [noteColor, setNoteColor] = useState("#ffffff");
  const [stickColor, setStickColor] = useState("#ffffff");
  const [stickColor2, setStickColor2] = useState("#ff4fa3");
  const [stickLook, setStickLook] = useState<"solid" | "gradient" | "rainbow">("solid");
  const [pieceSize, setPieceSize] = useState(72);
  const [clonePick, setClonePick] = useState(false);
  const [cloneOn, setCloneOn] = useState(false);
  const [wmFileName, setWmFileName] = useState("");
  const wmRef = useRef(wm);
  const wmImageRef = useRef<HTMLImageElement | null>(null);
  const wmUrlRef = useRef<string | null>(null);
  const tiltRef = useRef(0);
  const cropRatioRef = useRef(-1);
  const piecesRef = useRef<Piece[]>([]);
  const pieceDrag = useRef<{ id: number; x0: number; y0: number; px: number; py: number; moved: boolean } | null>(null);
  const pieceSeq = useRef(1);
  const cloneOriginRef = useRef<{ x: number; y: number } | null>(null);
  const cloneAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const cloneSourceRef = useRef<HTMLCanvasElement | null>(null);
  const clonePickRef = useRef(false);
  tiltRef.current = tilt;
  cropRatioRef.current = cropRatio;
  piecesRef.current = pieces;
  clonePickRef.current = clonePick;
  const wmFileRef = useRef<HTMLInputElement | null>(null);
  wmRef.current = wm;
  const choicesRef = useRef(choices);
  choicesRef.current = choices;
  const logBox = useRef<HTMLPreElement | null>(null);
  adjRef.current = adj;
  compareRef.current = compare;
  wbPickRef.current = wbPick;
  toolRef.current = tool;
  aiModeRef.current = aiMode;
  markRef.current = mark;
  brushRef.current = brush;
  hardnessRef.current = hardness;
  paintFxRef.current = paintFx;
  focusOnRef.current = focusOn && (paintFx === "blur" || paintFx === "pixel" || paintFx === "color");
  focusSoftRef.current = focusSoft;
  focusInsideRef.current = focusInside;
  const brushMax = Math.max(220, Math.min(3000, Math.round(Math.max(work().w, work().h) * 0.5)));
  brushMaxRef.current = brushMax;
  paintStrengthRef.current = paintStrength;
  paintColorRef.current = paintColor;

  function work() {
    const img = imgRef.current;
    if (!img) return { w: 1, h: 1 };
    return workingSize(img.naturalWidth, img.naturalHeight, rot);
  }

  function applyView(next: View) {
    viewRef.current = next;
    setView(next);
  }

  function fitScaleOf(W: number, H: number, axis: "box" | "h" | "v" = "box") {
    const stage = stageRef.current;
    if (!stage) return 1;
    const pad = 48;
    const sw = Math.max(80, stage.clientWidth - pad);
    const sh = Math.max(80, stage.clientHeight - pad);
    if (axis === "h") return sw / W;
    if (axis === "v") return sh / H;
    return Math.min(sw / W, sh / H);
  }

  function fitTo(mode: "box" | "h" | "v" | "100") {
    const stage = stageRef.current;
    const { w: W, h: H } = work();
    if (!stage || W < 2) return;
    const scale = clampZoom(mode === "100" ? 1 : fitScaleOf(W, H, mode === "box" ? "box" : mode));
    fittedRef.current = mode === "box";
    applyView({
      scale,
      left: (stage.clientWidth - W * scale) / 2,
      top: (stage.clientHeight - H * scale) / 2,
    });
  }

  function centerFit() {
    fitTo("box");
  }

  function zoomAt(nextScale: number, cx: number, cy: number) {
    const v = viewRef.current;
    const scale = clampZoom(nextScale);
    const ix = (cx - v.left) / v.scale;
    const iy = (cy - v.top) / v.scale;
    fittedRef.current = false;
    applyView({ scale, left: cx - ix * scale, top: cy - iy * scale });
  }

  function zoomBy(factor: number) {
    const stage = stageRef.current;
    if (!stage) return;
    zoomAt(viewRef.current.scale * factor, stage.clientWidth / 2, stage.clientHeight / 2);
  }

  function setZoomPct(pct: number) {
    const stage = stageRef.current;
    if (!stage) return;
    zoomAt(pct / 100, stage.clientWidth / 2, stage.clientHeight / 2);
  }

  function toImage(clientX: number, clientY: number, el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    const v = viewRef.current;
    return {
      x: (clientX - rect.left - v.left) / v.scale,
      y: (clientY - rect.top - v.top) / v.scale,
    };
  }

  function makeLayer() {
    const { w, h } = work();
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, w, h);
    return c;
  }

  function maskStore() {
    return aiModeRef.current === "replace" ? maskRef : personMaskRef;
  }

  function ensureMask() {
    const { w, h } = work();
    const store = maskStore();
    let c = store.current;
    if (!c || c.width !== w || c.height !== h) {
      c = makeLayer();
      store.current = c;
    }
    return c;
  }

  function ensureOverlay() {
    const { w, h } = work();
    let c = overlayRef.current;
    if (!c || c.width !== w || c.height !== h) {
      c = makeLayer();
      overlayRef.current = c;
      undoRef.current = [];
      redoRef.current = [];
      setCanUndo(false);
      setCanRedo(false);
    }
    return c;
  }

  function ensureStroke() {
    const { w, h } = work();
    let c = strokeRef.current;
    if (!c || c.width !== w || c.height !== h) {
      c = makeLayer();
      strokeRef.current = c;
    }
    return c;
  }

  function syncUndo() {
    setCanUndo(undoRef.current.length > 0);
    setCanRedo(redoRef.current.length > 0);
    setPaintTick((n) => n + 1);
  }

  function clearPaint() {
    overlayRef.current = null;
    strokeRef.current = null;
    undoRef.current = [];
    redoRef.current = [];
    beforeRef.current = null;
    stroking.current = false;
    setCanUndo(false);
    setCanRedo(false);
    setPaintTick((n) => n + 1);
  }

  function beginStroke() {
    const overlay = ensureOverlay();
    beforeRef.current = cloneCanvas(overlay);
    const stroke = ensureStroke();
    const ctx = stroke.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, stroke.width, stroke.height);
    stroking.current = true;
    lastPaint.current = null;
  }

  /** Dibuja en la capa de trazo los círculos del foco (opacos al centro, con caída suave hacia el borde). */
  function drawFocus() {
    const stroke = ensureStroke();
    const ctx = stroke.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, stroke.width, stroke.height);
    const list = focusDrag.current ? [...focusCircles.current, focusDrag.current] : focusCircles.current;
    const soft = focusSoftRef.current / 100;
    for (const c of list) {
      const r = Math.max(2, c.r * focusKRef.current);
      const inner = Math.min(r - 0.5, r * (1 - soft));
      const g = ctx.createRadialGradient(c.x, c.y, Math.max(0, inner), c.x, c.y, r);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    stroking.current = list.length > 0;
    setPaintTick((n) => n + 1);
  }

  /** El foco usa radios proporcionales al tamaño de la foto: un difuminado de 30 px no se nota en una foto de 4000 px. */
  function focusScale(w: number, h: number) {
    return focusOnRef.current ? Math.min(8, Math.max(0.2, Math.max(w, h) / 1000)) : 1;
  }

  /** Con el foco, el efecto va fuera de los círculos (la máscara se invierte) salvo que se pida adentro. */
  function focusMask(mk: ImageData) {
    if (focusInsideRef.current) return;
    const d = mk.data;
    for (let i = 3; i < d.length; i += 4) d[i] = 255 - d[i];
  }

  function clearFocus() {
    const had = focusCircles.current.length > 0 || focusDrag.current !== null;
    focusCircles.current = [];
    focusDrag.current = null;
    focusKRef.current = 1;
    setFocusK(1);
    setFocusN(0);
    if (!had) return;
    const stroke = strokeRef.current;
    stroke?.getContext("2d")?.clearRect(0, 0, stroke.width, stroke.height);
    stroking.current = false;
    setPaintTick((n) => n + 1);
  }

  function finishCircle() {
    const d = focusDrag.current;
    if (!d) return;
    focusDrag.current = null;
    const { w, h } = work();
    const k = focusKRef.current;
    focusCircles.current.push({ x: d.x, y: d.y, r: d.r * k < 8 ? (Math.min(w, h) * 0.25) / k : d.r });
    setFocusN(focusCircles.current.length);
    drawFocus();
  }

  /** Viñeta de efecto: el centro queda nítido y hacia los bordes se difumina/pixela. */
  function focusVignette() {
    const { w, h } = work();
    focusDrag.current = null;
    focusKRef.current = 1;
    setFocusK(1);
    focusCircles.current = [{ x: w / 2, y: h / 2, r: Math.hypot(w, h) * 0.42 }];
    focusSoftRef.current = 70;
    setFocusSoft(70);
    setFocusN(1);
    drawFocus();
  }

  function changeFocusSoft(v: number) {
    focusSoftRef.current = v;
    setFocusSoft(v);
    if (focusCircles.current.length) drawFocus();
  }

  function changeFocusK(v: number) {
    focusKRef.current = v / 100;
    setFocusK(v / 100);
    if (focusCircles.current.length) drawFocus();
  }

  function changeFocusInside(v: boolean) {
    focusInsideRef.current = v;
    setFocusInside(v);
    if (focusCircles.current.length) setPaintTick((n) => n + 1);
  }

  /** Pasa el foco a la capa de pintura, como un paso que se puede deshacer. */
  function applyFocus() {
    const stroke = strokeRef.current;
    const img = imgRef.current;
    if (!stroke || !img || focusCircles.current.length === 0) return;
    const overlay = ensureOverlay();
    const octx = overlay.getContext("2d");
    const { w, h } = work();
    const src = raster(img, rot, flipH, flipV, w, h, adj, tilt);
    const sctx = src?.getContext("2d");
    const mk = stroke.getContext("2d")?.getImageData(0, 0, w, h);
    if (!octx || !src || !sctx || !mk) return;
    const before = cloneCanvas(overlay);
    sctx.drawImage(overlay, 0, 0);
    const source = sctx.getImageData(0, 0, w, h);
    const ov = octx.getImageData(0, 0, w, h);
    focusMask(mk);
    applyPaint(ov, source, mk, paintFxRef.current, paintStrengthRef.current, paintColorRef.current, focusScale(w, h));
    octx.putImageData(ov, 0, 0);
    undoRef.current.push(before);
    if (undoRef.current.length > 16) undoRef.current.shift();
    redoRef.current = [];
    clearFocus();
    syncUndo();
  }

  useEffect(() => {
    if (focusCircles.current.length > 0) setPaintTick((n) => n + 1);
  }, [paintStrength]);

  useEffect(() => {
    if (!(tool === "paint" && focusOn && (paintFx === "blur" || paintFx === "pixel" || paintFx === "color"))) clearFocus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, focusOn, paintFx]);

  function commitStroke() {
    if (!stroking.current) return;
    if (paintFxRef.current === "clone") {
      stroking.current = false;
      if (beforeRef.current) {
        undoRef.current.push(beforeRef.current);
        if (undoRef.current.length > 16) undoRef.current.shift();
        redoRef.current = [];
        beforeRef.current = null;
        syncUndo();
      } else setPaintTick((n) => n + 1);
      return;
    }
    const stroke = strokeRef.current;
    const overlay = ensureOverlay();
    const octx = overlay.getContext("2d");
    if (!stroke || !octx) {
      stroking.current = false;
      return;
    }
    const img = imgRef.current;
    const { w, h } = work();
    if (img) {
      const src = raster(img, rot, flipH, flipV, w, h, adj, tilt);
      if (src) {
        const sctx = src.getContext("2d");
        if (sctx) {
          sctx.drawImage(overlay, 0, 0);
          const source = sctx.getImageData(0, 0, w, h);
          const ov = octx.getImageData(0, 0, w, h);
          const mk = stroke.getContext("2d")?.getImageData(0, 0, w, h);
          if (mk) {
            if (markRef.current === "eraser") eraseOverlay(ov, mk);
            else applyPaint(ov, source, mk, paintFxRef.current, paintStrengthRef.current, paintColorRef.current);
            octx.putImageData(ov, 0, 0);
          }
        }
      }
    }
    const sctx = stroke.getContext("2d");
    if (sctx) sctx.clearRect(0, 0, stroke.width, stroke.height);
    stroking.current = false;
    if (beforeRef.current) {
      undoRef.current.push(beforeRef.current);
      if (undoRef.current.length > 16) undoRef.current.shift();
      redoRef.current = [];
      beforeRef.current = null;
      syncUndo();
    } else {
      setPaintTick((n) => n + 1);
    }
  }

  function undoPaint() {
    const overlay = overlayRef.current;
    if (!overlay || !undoRef.current.length) return;
    redoRef.current.push(cloneCanvas(overlay));
    const prev = undoRef.current.pop();
    if (!prev) return;
    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    ctx.drawImage(prev, 0, 0);
    syncUndo();
  }

  function redoPaint() {
    const overlay = overlayRef.current;
    if (!overlay || !redoRef.current.length) return;
    undoRef.current.push(cloneCanvas(overlay));
    const next = redoRef.current.pop();
    if (!next) return;
    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    ctx.drawImage(next, 0, 0);
    syncUndo();
  }

  function dab(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, kind: Mark, asMask = false) {
    ctx.save();
    ctx.globalCompositeOperation = kind === "eraser" && !asMask ? "destination-out" : "source-over";
    const hard = hardnessRef.current / 100;
    if (asMask && hard < 0.99) {
      const g = ctx.createRadialGradient(x, y, r * hard * 0.9, x, y, r);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.3, "rgba(255,255,255,0.85)");
      g.addColorStop(0.6, "rgba(255,255,255,0.45)");
      g.addColorStop(0.85, "rgba(255,255,255,0.12)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
    } else if (!asMask && kind === "brush") {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(255,255,255,0.95)");
      g.addColorStop(0.45, "rgba(255,255,255,0.45)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = "#fff";
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function stamp(x: number, y: number, target?: HTMLCanvasElement) {
    const c = target || ensureMask();
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const r = Math.max(2, brushRef.current);
    const kind = markRef.current;
    const asMask = Boolean(target);
    const prev = lastPaint.current;
    if (prev) {
      const dist = Math.hypot(x - prev.x, y - prev.y);
      const soft = asMask ? hardnessRef.current < 99 : kind === "brush";
      const step = soft ? Math.max(1.2, r * (asMask ? 0.16 : 0.28)) : Math.max(1, r * 0.45);
      const n = Math.max(1, Math.ceil(dist / step));
      for (let i = 1; i <= n; i++) {
        dab(ctx, prev.x + ((x - prev.x) * i) / n, prev.y + ((y - prev.y) * i) / n, r, kind, asMask);
      }
    } else {
      dab(ctx, x, y, r, kind, asMask);
    }
    lastPaint.current = { x, y };
    setMaskTick((n) => n + 1);
  }

  function beginClone() {
    const overlay = ensureOverlay();
    beforeRef.current = cloneCanvas(overlay);
    const img = imgRef.current;
    const { w, h } = work();
    if (img) {
      const src = raster(img, rot, flipH, flipV, w, h, adj, tilt);
      const sctx = src?.getContext("2d");
      if (src && sctx) {
        sctx.drawImage(overlay, 0, 0);
        cloneSourceRef.current = src;
      }
    }
    cloneAnchorRef.current = null;
    stroking.current = true;
    lastPaint.current = null;
  }

  function stampClone(x: number, y: number) {
    const origin = cloneOriginRef.current;
    const source = cloneSourceRef.current;
    const overlay = ensureOverlay();
    const ctx = overlay.getContext("2d");
    if (!origin || !source || !ctx) return;
    if (!cloneAnchorRef.current) cloneAnchorRef.current = { x, y };
    const anchor = cloneAnchorRef.current;
    const r = Math.max(2, brushRef.current);
    const prev = lastPaint.current;
    const points: { x: number; y: number }[] = [];
    if (prev) {
      const dist = Math.hypot(x - prev.x, y - prev.y);
      const step = Math.max(1, r * 0.35);
      const n = Math.max(1, Math.ceil(dist / step));
      for (let i = 1; i <= n; i++) {
        points.push({ x: prev.x + ((x - prev.x) * i) / n, y: prev.y + ((y - prev.y) * i) / n });
      }
    } else points.push({ x, y });
    for (const point of points) {
      const sx = origin.x + (point.x - anchor.x);
      const sy = origin.y + (point.y - anchor.y);
      ctx.save();
      ctx.beginPath();
      ctx.arc(point.x, point.y, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(source, point.x - sx, point.y - sy);
      ctx.restore();
    }
    lastPaint.current = { x, y };
    setPaintTick((n) => n + 1);
  }

  function hitPiece(x: number, y: number) {
    const list = piecesRef.current;
    for (let i = list.length - 1; i >= 0; i--) {
      const piece = list[i];
      const halfW = piece.kind === "text" ? Math.max(piece.size * 0.6, piece.text.length * piece.size * 0.28) : piece.size / 2;
      const halfH = piece.size * 0.65;
      if (Math.abs(x - piece.x) <= halfW + 8 && Math.abs(y - piece.y) <= halfH + 8) return piece;
    }
    return null;
  }

  function snapPieces(key: string) {
    if (key && key === pieceKey.current) return;
    pieceKey.current = key;
    pieceHist.current.push({ list: piecesRef.current, id: pieceId });
    if (pieceHist.current.length > 40) pieceHist.current.shift();
    setPieceUndoN(pieceHist.current.length);
  }

  function undoPieces() {
    const prev = pieceHist.current.pop();
    if (!prev) return;
    pieceKey.current = "";
    setPieces(prev.list);
    setPieceId(prev.id);
    setPieceUndoN(pieceHist.current.length);
  }

  function clearPieceHist() {
    pieceHist.current = [];
    pieceKey.current = "";
    setPieceUndoN(0);
  }

  async function autoStraighten() {
    if (!onSuggestTilt) return;
    setAutoBusy(true);
    setErr("");
    try {
      const found = await onSuggestTilt();
      if (found === null) setErr("No encontré rectas claras para enderezar. Prueba con el deslizador.");
      else setTilt(Math.max(-45, Math.min(45, flipH !== flipV ? -found : found)));
    } catch (e) {
      setErr(String(e));
    } finally {
      setAutoBusy(false);
    }
  }

  function setAdjKey(key: keyof Adjust, n: number) {
    setPresetId("");
    setAdj((a) => ({ ...a, [key]: n }));
  }

  function chooseLook(id: string) {
    if (!id) {
      setAdj(adjBeforeLook.current ?? ADJUST_ZERO);
      adjBeforeLook.current = null;
      setPresetId("");
      return;
    }
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) return;
    if (!presetId) adjBeforeLook.current = adj;
    setPresetId(id);
    setAdj(presetAdjust(preset, presetAmt));
  }

  function setLookAmount(n: number) {
    setPresetAmt(n);
    const preset = PRESETS.find((p) => p.id === presetId);
    if (preset) setAdj(presetAdjust(preset, n));
  }

  /** Balance de blancos: lo que hay bajo el cursor debe quedar neutro. Se calcula Calidez y Tono por mínimos cuadrados. */
  function pickWhiteBalance(x: number, y: number) {
    const img = imgRef.current;
    if (!img) return;
    const { w: W, h: H } = work();
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= W || py >= H) return;
    const src = raster(img, rot, flipH, flipV, W, H, null, tilt);
    const ctx = src?.getContext("2d");
    if (!src || !ctx) return;
    const x0 = Math.max(0, px - 4);
    const y0 = Math.max(0, py - 4);
    const x1 = Math.min(W - 1, px + 4);
    const y1 = Math.min(H - 1, py + 4);
    const data = ctx.getImageData(x0, y0, x1 - x0 + 1, y1 - y0 + 1).data;
    let r = 0;
    let g = 0;
    let b = 0;
    const count = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
    r /= count;
    g /= count;
    b /= count;
    const m = (r + g + b) / 3;
    const dr = m - r;
    const dg = m - g;
    const db = m - b;
    const warmth = Math.max(-100, Math.min(100, Math.round(((dr - db) / 72) * 100)));
    const tint = Math.max(-100, Math.min(100, Math.round(((-12 * dr + 28 * dg - 12 * db) / 1072) * 100)));
    setPresetId("");
    setAdj((a) => ({ ...a, warmth, tint }));
    setWbPick(false);
  }

  function pickStickIcon(ch: string) {
    setStickIcon(ch);
    if (!pieceFresh.current && pieces.some((p) => p.id === pieceId && p.kind === "icon")) {
      snapPieces("");
      setPieces((list) => list.map((p) => (p.id === pieceId && p.kind === "icon" ? { ...p, icon: ch } : p)));
    }
  }

  /** Cambia color/estilo de los íconos: lo que se agregue de ahora en adelante y el ícono seleccionado. */
  function patchStick(patch: { color?: string; color2?: string; look?: "solid" | "gradient" | "rainbow" }) {
    if (patch.color !== undefined) setStickColor(patch.color);
    if (patch.color2 !== undefined) setStickColor2(patch.color2);
    if (patch.look !== undefined) setStickLook(patch.look);
    if (!pieceFresh.current && pieces.some((p) => p.id === pieceId && p.kind === "icon")) {
      snapPieces("");
      setPieces((list) => list.map((p) => (p.id === pieceId && p.kind === "icon" ? { ...p, ...patch } : p)));
    }
  }

  function addPiece(kind: "icon" | "text", x: number, y: number) {
    snapPieces("");
    pieceFresh.current = true;
    const id = pieceSeq.current++;
    const piece: Piece = {
      id,
      kind,
      x,
      y,
      size: pieceSize,
      icon: stickIcon,
      text: noteText.trim().slice(0, 80),
      font: noteFont,
      color: kind === "icon" ? stickColor : noteColor,
      ...(kind === "icon" ? { look: stickLook, color2: stickColor2 } : {}),
    };
    setPieces((list) => [...list, piece]);
    setPieceId(id);
  }

  function maskHasPaint(which?: "fill" | "person") {
    const c = which === "fill" ? maskRef.current : which === "person" ? personMaskRef.current : maskStore().current;
    if (!c) return false;
    const ctx = c.getContext("2d");
    if (!ctx) return false;
    const pix = ctx.getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < pix.length; i += 16) {
      if (pix[i] > 24) return true;
    }
    return false;
  }

  function exportFillMask(maxFrac = 0.25) {
    const src = maskRef.current;
    if (!src) throw new Error("no hay marca");
    const { width: w, height: h } = src;
    const ctx = src.getContext("2d");
    if (!ctx) throw new Error("no pude leer la marca");
    const pix = ctx.getImageData(0, 0, w, h);
    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    const octx = out.getContext("2d");
    if (!octx) throw new Error("no pude exportar la marca");
    const dst = octx.createImageData(w, h);
    let painted = 0;
    for (let i = 0; i < pix.data.length; i += 4) {
      const on = pix.data[i + 3] > 24;
      if (on) painted++;
      dst.data[i] = dst.data[i + 1] = dst.data[i + 2] = on ? 255 : 0;
      dst.data[i + 3] = 255;
    }
    const frac = painted / (w * h);
    if (painted < 16) throw new Error("La marca es demasiado chica.");
    if (frac > maxFrac) {
      throw new Error(
        `La marca cubre ${Math.round(frac * 100)}% de la foto. Pintá solo el sector a reemplazar (lámpara, borde).`,
      );
    }
    octx.putImageData(dst, 0, 0);
    return new Promise<Blob>((resolve, reject) => {
      out.toBlob((b) => (b ? resolve(b) : reject(new Error("no pude exportar la máscara"))), "image/png");
    });
  }

  function clearMask() {
    const c = maskStore().current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    setMaskTick((n) => n + 1);
  }

  function exportPersonMask() {
    const src = personMaskRef.current;
    if (!src) return Promise.reject(new Error("no hay máscara"));
    const out = document.createElement("canvas");
    out.width = src.width;
    out.height = src.height;
    const ctx = out.getContext("2d");
    if (!ctx) return Promise.reject(new Error("no pude exportar la máscara"));
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(src, 0, 0);
    return new Promise<Blob>((resolve, reject) => {
      out.toBlob((b) => (b ? resolve(b) : reject(new Error("no pude exportar la máscara"))), "image/png");
    });
  }

  function loadPersonMask(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const c = (() => {
        const { w, h } = work();
        const layer = makeLayer();
        layer.width = w;
        layer.height = h;
        personMaskRef.current = layer;
        return layer;
      })();
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const d = ctx.getImageData(0, 0, c.width, c.height);
      for (let i = 0; i < d.data.length; i += 4) {
        const lum = (d.data[i] + d.data[i + 1] + d.data[i + 2]) / 3;
        d.data[i] = 255;
        d.data[i + 1] = 255;
        d.data[i + 2] = 255;
        d.data[i + 3] = lum > 40 ? 220 : 0;
      }
      ctx.putImageData(d, 0, 0);
      URL.revokeObjectURL(url);
      setMaskTick((n) => n + 1);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setErr("No pude leer la máscara de YOLO.");
    };
    img.src = url;
  }

  function displaySize(W: number, H: number) {
    const long = Math.max(W, H);
    const cap = 2048;
    if (long <= cap) return { dw: W, dh: H };
    const s = cap / long;
    return { dw: Math.max(1, Math.round(W * s)), dh: Math.max(1, Math.round(H * s)) };
  }

  function paint() {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!img || !canvas || !stage) return;
    const { w: W, h: H } = workingSize(img.naturalWidth, img.naturalHeight, rot);
    const { dw, dh } = displaySize(W, H);
    const key = `${dw}x${dh}:${rot}:${tilt}:${flipH}:${flipV}:${compareRef.current}:${JSON.stringify(adjRef.current)}`;
    if (!bakedRef.current || bakedRef.current.dataset.key !== key) {
      const baked = raster(img, rot, flipH, flipV, dw, dh, compareRef.current ? null : adjRef.current, tilt);
      if (!baked) return;
      baked.dataset.key = key;
      bakedRef.current = baked;
    }
    canvas.width = dw;
    canvas.height = dh;
    const ctx = canvas.getContext("2d");
    if (!ctx || !bakedRef.current) return;
    ctx.drawImage(bakedRef.current, 0, 0);
    const overlay = overlayRef.current;
    const cloning = paintFxRef.current === "clone";
    if (overlay && !compareRef.current && (!stroking.current || cloning)) {
      ctx.drawImage(overlay, 0, 0, dw, dh);
    }
    if (toolRef.current === "paint" && stroking.current && strokeRef.current && !compareRef.current && !cloning) {
      const tmp = document.createElement("canvas");
      tmp.width = dw;
      tmp.height = dh;
      const tctx = tmp.getContext("2d");
      const mkc = document.createElement("canvas");
      mkc.width = dw;
      mkc.height = dh;
      const mctx = mkc.getContext("2d");
      if (tctx && mctx) {
        tctx.drawImage(bakedRef.current, 0, 0);
        if (overlay) tctx.drawImage(overlay, 0, 0, dw, dh);
        mctx.drawImage(strokeRef.current, 0, 0, dw, dh);
        const source = tctx.getImageData(0, 0, dw, dh);
        const ov = new ImageData(new Uint8ClampedArray(source.data), dw, dh);
        const mk = mctx.getImageData(0, 0, dw, dh);
        if (focusOnRef.current) focusMask(mk);
        if (markRef.current === "eraser") eraseOverlay(ov, mk);
        else applyPaint(ov, source, mk, paintFxRef.current, paintStrengthRef.current, paintColorRef.current, focusScale(dw, dh));
        tctx.putImageData(ov, 0, 0);
        ctx.drawImage(tmp, 0, 0);
      }
    }
    if (toolRef.current === "paint" && focusOnRef.current && !compareRef.current) {
      const k = dw / work().w;
      const soft = focusSoftRef.current / 100;
      const list = focusDrag.current ? [...focusCircles.current, focusDrag.current] : focusCircles.current;
      ctx.save();
      for (const c of list) {
        const r = Math.max(2, c.r * focusKRef.current) * k;
        const ring = (radius: number, color: string, width: number, dash: number[]) => {
          ctx.beginPath();
          ctx.arc(c.x * k, c.y * k, radius, 0, Math.PI * 2);
          ctx.setLineDash(dash);
          ctx.lineWidth = width;
          ctx.strokeStyle = color;
          ctx.stroke();
        };
        ring(r, "rgba(0,0,0,0.6)", 4, []);
        ring(r, "#ffffff", 1.75, [8, 6]);
        if (soft > 0.05) {
          ring(r * (1 - soft), "rgba(0,0,0,0.45)", 3, []);
          ring(r * (1 - soft), "#8ab4f8", 1.25, [3, 4]);
        }
        ctx.setLineDash([]);
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "rgba(0,0,0,0.7)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(c.x * k, c.y * k, 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fill();
      }
      ctx.restore();
    }
    const mask = aiModeRef.current === "replace" ? maskRef.current : personMaskRef.current;
    if (toolRef.current === "fill" && aiModeRef.current !== "upscale" && aiModeRef.current !== "style" && mask && !compareRef.current) {
      const ov = document.createElement("canvas");
      ov.width = dw;
      ov.height = dh;
      const octx = ov.getContext("2d");
      if (octx) {
        octx.drawImage(mask, 0, 0, dw, dh);
        octx.globalCompositeOperation = "source-in";
        octx.fillStyle = aiModeRef.current === "replace" ? "rgba(232,72,72,0.55)" : "rgba(70,210,180,0.42)";
        octx.fillRect(0, 0, dw, dh);
        ctx.drawImage(ov, 0, 0);
      }
    }
    if (!compareRef.current) {
      blitMark(ctx, dw, dh, { x: 0, y: 0, w: W, h: H });
      blitPieces(ctx, dw, dh, { x: 0, y: 0, w: W, h: H }, true);
    }
    if (toolRef.current === "paint" && paintFxRef.current === "clone" && cloneOriginRef.current) {
      const origin = cloneOriginRef.current;
      const x = (origin.x * dw) / W;
      const y = (origin.y * dh) / H;
      ctx.save();
      ctx.strokeStyle = "#8eb4e8";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - 8, y);
      ctx.lineTo(x + 8, y);
      ctx.moveTo(x, y - 8);
      ctx.lineTo(x, y + 8);
      ctx.stroke();
      ctx.restore();
    }
    const v = viewRef.current;
    canvas.style.width = `${W * v.scale}px`;
    canvas.style.height = `${H * v.scale}px`;
    canvas.style.left = `${v.left}px`;
    canvas.style.top = `${v.top}px`;
  }

  useEffect(() => {
    let cancelled = false;
    let localUrl = "";
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      imgRef.current = img;
      bakedRef.current = null;
      maskRef.current = null;
      personMaskRef.current = null;
      clearPaint();
      setBusy(false);
      const { w, h } = workingSize(img.naturalWidth, img.naturalHeight, 0);
      setCrop({ x: 0, y: 0, w, h });
      setRot(0);
      setTilt(0);
      setCropRatio(-1);
      setPieces([]);
      setPieceId(0);
      clearPieceHist();
      pieceSeq.current = 1;
      cloneOriginRef.current = null;
      setCloneOn(false);
      setClonePick(false);
      setFlipH(false);
      setFlipV(false);
      setAdj(ADJUST_ZERO);
      setReady(true);
    };
    img.onerror = () => {
      if (!cancelled) setErr("No pude cargar la foto.");
    };
    (async () => {
      try {
        if (src.startsWith("blob:") || src.startsWith("data:")) {
          img.src = src;
          return;
        }
        const response = await fetch(src);
        if (!response.ok) throw new Error(String(response.status));
        const blob = await response.blob();
        if (cancelled) return;
        localUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(localUrl);
          return;
        }
        img.src = localUrl;
      } catch {
        if (cancelled) return;
        img.crossOrigin = "anonymous";
        img.src = src;
      }
    })();
    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
      if (localUrl) URL.revokeObjectURL(localUrl);
    };
  }, [src]);

  useEffect(() => {
    if (!ready) return;
    bakedRef.current = null;
    const id = requestAnimationFrame(() => {
      if (fittedRef.current) centerFit();
      paint();
    });
    return () => cancelAnimationFrame(id);
  }, [ready, adj, rot, flipH, flipV, compare, tilt]);

  useEffect(() => {
    if (!ready) return;
    const id = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(id);
  }, [ready, tool, aiMode, maskTick, paintTick, view, wm, wmTick, crop, tilt, pieces, pieceId]);

  useEffect(() => {
    if (!ready) return;
    const onResize = () => {
      if (fittedRef.current) centerFit();
      paint();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [ready, rot]);

  useEffect(() => {
    localStorage.setItem("studio.fillEngine", fillEngine);
  }, [fillEngine]);

  useEffect(() => {
    localStorage.setItem("studio.upTiled", upTiled ? "1" : "0");
  }, [upTiled]);

  useEffect(() => {
    localStorage.setItem("studio.upFaceFix", upFaceFix ? "1" : "0");
  }, [upFaceFix]);

  useEffect(() => {
    localStorage.setItem("studio.upFfDenoise", String(upFfDenoise));
  }, [upFfDenoise]);

  useEffect(() => {
    localStorage.setItem("studio.upTiledDenoise", String(upTiledDenoise));
  }, [upTiledDenoise]);

  useEffect(() => {
    localStorage.setItem("editor.wm", JSON.stringify(wm));
  }, [wm]);

  useEffect(() => {
    return () => {
      if (wmUrlRef.current) URL.revokeObjectURL(wmUrlRef.current);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("studio.editorSideW", String(sideW));
    if (!ready) return;
    if (fittedRef.current) requestAnimationFrame(centerFit);
  }, [sideW, ready]);

  useEffect(() => {
    if (pending) setBusy(true);
    else if (!choices?.length) setBusy(false);
  }, [pending, choices]);

  useEffect(() => {
    setChoicePick(0);
  }, [choices]);

  useEffect(() => {
    const el = logBox.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [liveLog, pending]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = stage.getBoundingClientRect();
      const factor = e.deltaY > 0 ? 1 / 1.12 : 1.12;
      zoomAt(viewRef.current.scale * factor, e.clientX - rect.left, e.clientY - rect.top);
    };
    stage.addEventListener("wheel", wheel, { passive: false });
    return () => stage.removeEventListener("wheel", wheel);
  }, [ready]);

  useEffect(() => {
    if (!saveOpen) return;
    const close = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest(".editor-save")) setSaveOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [saveOpen]);

  useEffect(() => {
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return false;
      const tag = t.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
    };
    const onKey = (e: KeyboardEvent) => {
      const list = choicesRef.current;
      if (e.key === "Escape") {
        if (list?.length) {
          onDismissChoices?.();
          return;
        }
        if (!busy) onCancel();
      }
      if (typing(e)) return;
      if (list?.length && (e.key === "1" || e.key === "2" || e.key === "3")) {
        const i = Number(e.key) - 1;
        if (list[i]) {
          e.preventDefault();
          onPickChoice?.(list[i].id);
        }
        return;
      }
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        setCompare(e.type === "keydown");
      }
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoomBy(1.2);
      }
      if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        zoomBy(1 / 1.2);
      }
      if (e.key === "0" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        centerFit();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (toolRef.current === "stick" || toolRef.current === "text") undoPieces();
        else if (e.shiftKey) redoPaint();
        else undoPaint();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        redoPaint();
        return;
      }
      if (e.key === "[") setBrush((n) => Math.max(4, n - 4));
      if (e.key === "]") setBrush((n) => Math.min(brushMaxRef.current, n + (brushMaxRef.current > 600 ? 12 : 4)));
      if (e.key === "e" || e.key === "E") setMark("eraser");
      if (e.key === "b" || e.key === "B") setMark("brush");
      if (e.key === "p" || e.key === "P") setMark("pencil");
    };
    const down = (e: KeyboardEvent) => onKey(e);
    const up = (e: KeyboardEvent) => {
      if (typing(e)) return;
      if (e.code === "Space") {
        e.preventDefault();
        setCompare(false);
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [busy, onCancel, onPickChoice, onDismissChoices]);

  const stateKey = JSON.stringify([adj, rot, tilt, flipH, flipV, crop, pieces, wmTick, paintTick, canUndo]);

  useEffect(() => {
    if (!onDirtyChange || !ready) return;
    const img = imgRef.current;
    let cropped = false;
    if (img) {
      const size = workingSize(img.naturalWidth, img.naturalHeight, rot);
      cropped = crop.x > 0.5 || crop.y > 0.5 || crop.w < size.w - 0.5 || crop.h < size.h - 0.5;
    }
    const edited = !adjustIdle(adj) || rot !== 0 || tilt !== 0 || flipH || flipV || canUndo || cropped || pieces.length > 0 || !watermarkIdle(wm, wmImageRef.current);
    onDirtyChange(edited && stateKey !== savedKey);
  }, [adj, rot, tilt, flipH, flipV, canUndo, crop, pieces, wm, wmTick, paintTick, ready, onDirtyChange, stateKey, savedKey]);

  function resetAll() {
    const img = imgRef.current;
    setAdj(ADJUST_ZERO);
    setPresetId("");
    adjBeforeLook.current = null;
    setWbPick(false);
    setRot(0);
    setTilt(0);
    setCropRatio(-1);
    setPieces([]);
    setPieceId(0);
    clearPieceHist();
    pieceSeq.current = 1;
    cloneOriginRef.current = null;
    setCloneOn(false);
    setClonePick(false);
    setFlipH(false);
    setFlipV(false);
    if (img) setCrop({ x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight });
    maskRef.current = null;
    personMaskRef.current = null;
    bakedRef.current = null;
    clearPaint();
    setMaskTick((n) => n + 1);
    fittedRef.current = true;
    requestAnimationFrame(centerFit);
  }

  function swapCropOrientation() {
    const { w: W, h: H } = work();
    if (cropRatio === 0) {
      const cx = crop.x + crop.w / 2;
      const cy = crop.y + crop.h / 2;
      const k = Math.min(1, W / crop.h, H / crop.w);
      const nw = crop.h * k;
      const nh = crop.w * k;
      setCrop(clampCrop({ x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh }, W, H));
      return;
    }
    const current = cropRatio < 0 ? W / Math.max(1, H) : cropRatio;
    const next = 1 / current;
    setCropRatio(next);
    setCrop(fitRatio(W, H, next));
  }

  function turn(delta: number) {
    const next = (rot + delta + 360) % 360;
    setRot(next);
    const img = imgRef.current;
    if (!img) return;
    const { w, h } = workingSize(img.naturalWidth, img.naturalHeight, next);
    setCrop({ x: 0, y: 0, w, h });
    maskRef.current = null;
    personMaskRef.current = null;
    bakedRef.current = null;
    clearPaint();
    setMaskTick((n) => n + 1);
    fittedRef.current = true;
  }

  function hit(px: number, py: number): Handle | null {
    const { w: W, h: H } = work();
    const c = clampCrop(crop, W, H);
    const v = viewRef.current;
    const x = (px - v.left) / v.scale;
    const y = (py - v.top) / v.scale;
    const pad = 14 / v.scale;
    const inside = x >= c.x - pad && y >= c.y - pad && x <= c.x + c.w + pad && y <= c.y + c.h + pad;
    if (!inside) return null;
    const nearL = Math.abs(x - c.x) <= pad;
    const nearR = Math.abs(x - (c.x + c.w)) <= pad;
    const nearT = Math.abs(y - c.y) <= pad;
    const nearB = Math.abs(y - (c.y + c.h)) <= pad;
    if (nearT && nearL) return "nw";
    if (nearT && nearR) return "ne";
    if (nearB && nearL) return "sw";
    if (nearB && nearR) return "se";
    if (nearT) return "n";
    if (nearB) return "s";
    if (nearL) return "w";
    if (nearR) return "e";
    if (x >= c.x && y >= c.y && x <= c.x + c.w && y <= c.y + c.h) return "body";
    return null;
  }

  function clearHold() {
    if (hold.current != null) {
      window.clearTimeout(hold.current);
      hold.current = null;
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest(".editor-zoom")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pan = e.altKey || e.button === 1 || e.buttons === 4;
    if (pan) {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const v = viewRef.current;
      panDrag.current = { x0: e.clientX, y0: e.clientY, left0: v.left, top0: v.top };
      return;
    }
    if (wbPickRef.current && toolRef.current === "adjust") {
      const p = toImage(e.clientX, e.clientY, e.currentTarget);
      pickWhiteBalance(p.x, p.y);
      return;
    }
    if (toolRef.current === "paint") {
      const p = toImage(e.clientX, e.clientY, e.currentTarget);
      if (paintFxRef.current === "clone" && (e.shiftKey || clonePickRef.current)) {
        cloneOriginRef.current = p;
        clonePickRef.current = false;
        setClonePick(false);
        setCloneOn(true);
        setErr("");
        setPaintTick((n) => n + 1);
        return;
      }
      if (paintFxRef.current === "clone" && !cloneOriginRef.current) {
        setErr("Fijá el origen con Shift+clic o con el botón Origen.");
        return;
      }
      if (focusOnRef.current) {
        e.currentTarget.setPointerCapture(e.pointerId);
        focusDrag.current = { x: p.x, y: p.y, r: 0 };
        drawFocus();
        return;
      }
      e.currentTarget.setPointerCapture(e.pointerId);
      if (paintFxRef.current === "clone") {
        beginClone();
        stampClone(p.x, p.y);
      } else {
        beginStroke();
        stamp(p.x, p.y, ensureStroke());
      }
      setCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top, on: true });
      return;
    }
    if (toolRef.current === "fill" && aiModeRef.current !== "upscale" && aiModeRef.current !== "style") {
      e.currentTarget.setPointerCapture(e.pointerId);
      lastPaint.current = null;
      const p = toImage(e.clientX, e.clientY, e.currentTarget);
      stamp(p.x, p.y);
      setCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top, on: true });
      return;
    }
    if (toolRef.current === "stick" || toolRef.current === "text") {
      const p = toImage(e.clientX, e.clientY, e.currentTarget);
      const found = hitPiece(p.x, p.y);
      if (found) {
        e.currentTarget.setPointerCapture(e.pointerId);
        setPieceId(found.id);
        pieceFresh.current = false;
        pieceDrag.current = { id: found.id, x0: p.x, y0: p.y, px: found.x, py: found.y, moved: false };
        return;
      }
      if (toolRef.current === "stick") addPiece("icon", p.x, p.y);
      else if (noteText.trim()) addPiece("text", p.x, p.y);
      else setErr("Escribí el texto antes de hacer clic en la foto.");
      return;
    }
    if (toolRef.current !== "crop") {
      e.currentTarget.setPointerCapture(e.pointerId);
      const v = viewRef.current;
      panDrag.current = { x0: e.clientX, y0: e.clientY, left0: v.left, top0: v.top };
      return;
    }
    const handle = hit(e.clientX - rect.left, e.clientY - rect.top);
    if (!handle) {
      e.currentTarget.setPointerCapture(e.pointerId);
      const v = viewRef.current;
      panDrag.current = { x0: e.clientX, y0: e.clientY, left0: v.left, top0: v.top };
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    moved.current = false;
    const { w: W, h: H } = work();
    const crop0 = clampCrop(crop, W, H);
    drag.current = { handle, x0: e.clientX, y0: e.clientY, crop0 };
    if (handle === "body") {
      clearHold();
      hold.current = window.setTimeout(() => {
        if (!moved.current) {
          drag.current = null;
          setCompare(true);
        }
      }, 180);
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (toolRef.current === "paint" || (toolRef.current === "fill" && aiModeRef.current !== "upscale" && aiModeRef.current !== "style")) {
      setCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top, on: true });
    }
    const panning = panDrag.current;
    if (panning) {
      fittedRef.current = false;
      applyView({
        scale: viewRef.current.scale,
        left: panning.left0 + (e.clientX - panning.x0),
        top: panning.top0 + (e.clientY - panning.y0),
      });
      return;
    }
    if (toolRef.current === "paint" && (e.buttons & 1) && focusDrag.current) {
      const p = toImage(e.clientX, e.clientY, e.currentTarget);
      focusDrag.current.r = Math.hypot(p.x - focusDrag.current.x, p.y - focusDrag.current.y) / focusKRef.current;
      drawFocus();
      return;
    }
    if (toolRef.current === "paint" && (e.buttons & 1)) {
      const p = toImage(e.clientX, e.clientY, e.currentTarget);
      if (paintFxRef.current === "clone") stampClone(p.x, p.y);
      else stamp(p.x, p.y, ensureStroke());
      return;
    }
    const movingPiece = pieceDrag.current;
    if (movingPiece && (e.buttons & 1)) {
      const p = toImage(e.clientX, e.clientY, e.currentTarget);
      if (!movingPiece.moved) {
        movingPiece.moved = true;
        snapPieces("");
      }
      const nx = movingPiece.px + (p.x - movingPiece.x0);
      const ny = movingPiece.py + (p.y - movingPiece.y0);
      setPieces((list) => list.map((item) => (item.id === movingPiece.id ? { ...item, x: nx, y: ny } : item)));
      return;
    }
    if (toolRef.current === "fill" && aiModeRef.current !== "upscale" && aiModeRef.current !== "style" && (e.buttons & 1)) {
      const p = toImage(e.clientX, e.clientY, e.currentTarget);
      stamp(p.x, p.y);
      return;
    }
    const d = drag.current;
    if (!d) return;
    const dist = Math.hypot(e.clientX - d.x0, e.clientY - d.y0);
    if (dist > 6) {
      moved.current = true;
      clearHold();
      if (compare) setCompare(false);
    }
    if (compareRef.current) return;
    if (d.handle === "body" && !moved.current) return;
    const { w: W, h: H } = work();
    const v = viewRef.current;
    const dx = (e.clientX - d.x0) / v.scale;
    const dy = (e.clientY - d.y0) / v.scale;
    let { x, y, w, h } = d.crop0;
    const min = 32;
    if (d.handle === "body") {
      x += dx;
      y += dy;
    } else {
      if (d.handle.includes("w")) {
        const nx = Math.min(x + w - min, x + dx);
        w += x - nx;
        x = nx;
      }
      if (d.handle.includes("e")) w = Math.max(min, w + dx);
      if (d.handle.includes("n")) {
        const ny = Math.min(y + h - min, y + dy);
        h += y - ny;
        y = ny;
      }
      if (d.handle.includes("s")) h = Math.max(min, h + dy);
      const stored = cropRatioRef.current;
      const ratio = stored < 0 ? W / Math.max(1, H) : stored;
      if (ratio > 0) {
        const anchorRight = d.crop0.x + d.crop0.w;
        const anchorBottom = d.crop0.y + d.crop0.h;
        if (d.handle.includes("e") || d.handle.includes("w")) h = w / ratio;
        else w = h * ratio;
        if (d.handle.includes("n")) y = anchorBottom - h;
        if (d.handle.includes("w")) x = anchorRight - w;
      }
    }
    setCrop(clampCrop({ x, y, w, h }, W, H));
  }

  function onPointerUp() {
    if (focusDrag.current) finishCircle();
    else if (stroking.current && !focusOnRef.current) commitStroke();
    lastPaint.current = null;
    panDrag.current = null;
    pieceDrag.current = null;
    clearHold();
    drag.current = null;
    if (compare) setCompare(false);
  }

  function onPointerLeave() {
    setCursor((c) => ({ ...c, on: false }));
  }

  async function exportFull() {
    const img = imgRef.current;
    if (!img) throw new Error("no hay foto");
    const { w: W, h: H } = work();
    const full = raster(img, rot, flipH, flipV, W, H, adj, tilt);
    if (!full) throw new Error("no pude procesar");
    const octx = full.getContext("2d");
    if (octx && overlayRef.current) octx.drawImage(overlayRef.current, 0, 0, W, H);
    return new Promise<Blob>((resolve, reject) => {
      full.toBlob((b) => (b ? resolve(b) : reject(new Error("no pude exportar"))), "image/png");
    });
  }

  async function applyBg(mode: "blur" | "solid") {
    if (!onBgFix) return;
    setBusy(true);
    setErr("");
    try {
      const mask = maskHasPaint("person") ? await exportPersonMask() : undefined;
      await onBgFix(
        await exportFull(),
        { mode, blur: blurAmt, margin: bgMargin, feather: bgFeather, detect: bgDetect, color: bgColor, mask },
        pin,
      );
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  }

  async function detectPerson() {
    if (!onDetect) return;
    setBusy(true);
    setErr("");
    try {
      const blob = await onDetect(await exportFull(), {
        margin: bgMargin,
        detect: bgDetect,
        feather: bgFeather,
      });
      loadPersonMask(blob);
      setTool("fill");
      setBusy(false);
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  }

  async function fillZone() {
    const img = imgRef.current;
    if (!img || !onInpaint) return;
    if (!maskHasPaint("fill")) {
      setErr("Elegí Lápiz o Pincel y pintá solo la lámpara o el borde del telón. No pintes a la persona.");
      return;
    }
    const { w: W, h: H } = work();
    setBusy(true);
    setErr("");
    try {
      const full = raster(img, rot, flipH, flipV, W, H, adj, tilt);
      if (!full) throw new Error("no pude procesar");
      const octx = full.getContext("2d");
      if (octx && overlayRef.current) octx.drawImage(overlayRef.current, 0, 0, W, H);
      const image = await new Promise<Blob>((resolve, reject) => {
        full.toBlob((b) => (b ? resolve(b) : reject(new Error("no pude exportar"))), "image/png");
      });
      const maskBlob = await exportFillMask(fillEngine === "local" ? 0.12 : 0.25);
      await onInpaint(image, maskBlob, fillPrompt.trim(), pin, variants, fillEngine);
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  }

  function blitPieces(ctx: CanvasRenderingContext2D, destW: number, destH: number, view: Crop, guide = false) {
    const list = piecesRef.current;
    if (!list.length || view.w < 1 || view.h < 1) return;
    const { w: W, h: H } = work();
    if (W < 2 || H < 2) return;
    ctx.save();
    ctx.scale(destW / view.w, destH / view.h);
    ctx.translate(-view.x, -view.y);
    const show = guide && (toolRef.current === "stick" || toolRef.current === "text") ? pieceId : 0;
    drawPieces(ctx, list, show);
    ctx.restore();
  }

  function blitMark(ctx: CanvasRenderingContext2D, destW: number, destH: number, view: Crop) {
    const mark = wmRef.current;
    const image = wmImageRef.current;
    if (watermarkIdle(mark, image)) return;
    const { w: W, h: H } = work();
    if (W < 2 || H < 2 || view.w < 1 || view.h < 1) return;
    const frame = clampCrop(crop, W, H);
    ctx.save();
    ctx.scale(destW / view.w, destH / view.h);
    ctx.translate(-view.x, -view.y);
    drawWatermark(ctx, W, H, mark, image, frame);
    ctx.restore();
  }

  function pickWmImage(file: File) {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => {
      if (wmUrlRef.current) URL.revokeObjectURL(wmUrlRef.current);
      wmUrlRef.current = url;
      wmImageRef.current = im;
      setWmFileName(file.name);
      setWm((w) => ({ ...w, on: true, mode: "image" }));
      setWmTick((n) => n + 1);
    };
    im.onerror = () => {
      URL.revokeObjectURL(url);
      setErr("No pude leer esa imagen de marca.");
    };
    im.src = url;
  }

  async function exportBlob(scale = outScale, type: "image/png" | "image/jpeg" = "image/png") {
    const img = imgRef.current;
    if (!img) throw new Error("no hay foto");
    const { w: W, h: H } = work();
    // recorte a píxeles enteros: a 1× es una copia exacta, sin suavizado por posiciones con decimales
    const raw = clampCrop(crop, W, H);
    const cx = Math.min(W - 1, Math.max(0, Math.round(raw.x)));
    const cy = Math.min(H - 1, Math.max(0, Math.round(raw.y)));
    const c = {
      x: cx,
      y: cy,
      w: Math.min(W - cx, Math.max(1, Math.round(raw.w))),
      h: Math.min(H - cy, Math.max(1, Math.round(raw.h))),
    };
    await new Promise((r) => requestAnimationFrame(r));
    const full = raster(img, rot, flipH, flipV, W, H, adj, tilt);
    if (!full) throw new Error("no pude procesar");
    const octx = full.getContext("2d");
    if (octx && overlayRef.current) octx.drawImage(overlayRef.current, 0, 0, W, H);
    const dw = Math.max(1, Math.round(c.w * scale));
    const dh = Math.max(1, Math.round(c.h * scale));
    const out = document.createElement("canvas");
    out.width = dw;
    out.height = dh;
    const ctx = out.getContext("2d");
    if (!ctx) throw new Error("no pude exportar");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(full, c.x, c.y, c.w, c.h, 0, 0, dw, dh);
    blitMark(ctx, dw, dh, c);
    blitPieces(ctx, dw, dh, c);
    return new Promise<Blob>((resolve, reject) => {
      out.toBlob((b) => (b ? resolve(b) : reject(new Error("no pude exportar"))), type, type === "image/jpeg" ? 0.97 : undefined);
    });
  }

  async function applyStyle() {
    if (!onStylize) return;
    if (styleId === "custom" && !stylePrompt.trim()) {
      setErr("Escribe el estilo que quieres.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await onStylize(await exportBlob(1), styleId, { prompt: stylePrompt, guidance: styleGuidance, count: styleCount }, pin);
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  }

  async function applyUpscale() {
    if (!onUpscale) return;
    const factor = upScale;
    setBusy(true);
    setErr("");
    try {
      await onUpscale(await exportBlob(1), factor, pin, {
        tiled: upTiled,
        faceFix: upFaceFix,
        faceFixDenoise: upFfDenoise,
        tiledDenoise: upTiledDenoise,
      });
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  }

  async function save(mode: "copy" | "replace") {
    setSaveOpen(false);
    setBusy(true);
    setErr("");
    const keyAtSave = stateKey;
    try {
      await onSave(await exportBlob(outScale, "image/png"), pin, mode, outputType === "image/jpeg" ? "jpeg" : outputType === "image/webp" ? "webp" : outputType === "image/avif" ? "avif" : "png");
      setSavedKey(keyAtSave);
      setBusy(false);
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  }

  async function copyClip() {
    setSaveOpen(false);
    setBusy(true);
    setErr("");
    try {
      const blob = await exportBlob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setBusy(false);
    } catch (e) {
      setErr("No pude copiar al portapapeles. " + String(e));
      setBusy(false);
    }
  }

  const { w: W, h: H } = work();
  const c = clampCrop(crop, W, H);
  const box = {
    left: view.left + c.x * view.scale,
    top: view.top + c.y * view.scale,
    width: c.w * view.scale,
    height: c.h * view.scale,
  };
  const zoomPct = Math.max(1, Math.round(view.scale * 100));
  const cursorR = Math.max(3, brush * view.scale);
  const fitPct = Math.max(1, Math.round(fitScaleOf(W, H) * 100));

  return (
    <div className="editor">
      {err && (
        <div className="banner" role="alert">
          <span>{err}</span>
          <button type="button" title="Cerrar" aria-label="Cerrar" onClick={() => setErr("")}>×</button>
        </div>
      )}
      <div className="editor-body">
        <div
          className={`editor-stage ${compare ? "comparing" : ""} ${wbPick && tool === "adjust" ? "eyedrop" : ""} ${tool === "paint" || (tool === "fill" && aiMode !== "upscale" && aiMode !== "style") ? "fill" : ""}`}
          ref={stageRef}
          onPointerDown={(e) => {
            setKeysOpen(false);
            onPointerDown(e);
          }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerLeave}
        >
          <canvas ref={canvasRef} className="editor-canvas" style={{ left: view.left, top: view.top }} />
          {ready && !compare && tool === "crop" && (
            <>
              <div className="editor-shade" style={{ left: 0, top: 0, right: 0, height: Math.max(0, box.top) }} />
              <div className="editor-shade" style={{ left: 0, top: box.top, width: Math.max(0, box.left), height: box.height }} />
              <div className="editor-shade" style={{ left: box.left + box.width, top: box.top, right: 0, height: box.height }} />
              <div className="editor-shade" style={{ left: 0, top: box.top + box.height, right: 0, bottom: 0 }} />
              <div className="editor-crop" style={box}>
                {(["nw", "n", "ne", "e", "se", "s", "sw", "w"] as Handle[]).map((h) => (
                  <i key={h} className={`editor-handle ${h}`} />
                ))}
              </div>
            </>
          )}
          {(tool === "paint" || (tool === "fill" && aiMode !== "upscale" && aiMode !== "style")) && cursor.on && !compare && (
            <i
              className={`editor-cursor ${mark}`}
              style={{
                left: cursor.x - cursorR,
                top: cursor.y - cursorR,
                width: cursorR * 2,
                height: cursorR * 2,
              }}
            />
          )}
          <button
            type="button"
            className="editor-back"
            title="Volver (Esc)"
            aria-label="Volver"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onCancel}
          >
            <GlyphIcon name="back" size={16} />
          </button>
          {compare && <div className="editor-compare-tag">Original</div>}
          {ready && (
            <div className="editor-stage-tools" onPointerDown={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={`editor-compare-btn ${compare ? "on" : ""}`}
              title="Mantén pulsado para ver el original (Espacio)"
              aria-label="Ver original"
              onPointerDown={(e) => {
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
                setCompare(true);
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                setCompare(false);
              }}
              onPointerCancel={() => setCompare(false)}
            >
              <GlyphIcon name="eye" size={16} />
              <span>Original</span>
            </button>
              <button
                type="button"
                className={`editor-compare-btn editor-keys-btn ${keysOpen ? "on" : ""}`}
                title="Atajos de teclado"
                aria-label="Atajos de teclado"
                onClick={() => setKeysOpen((v) => !v)}
              >
                ?
              </button>
              {keysOpen && (
                <dl className="editor-keys">
                  <dt>Espacio (mantener)</dt><dd>ver el original</dd>
                  <dt>Rueda · + · −</dt><dd>zoom</dd>
                  <dt>0</dt><dd>ajustar a la ventana</dd>
                  <dt>Ctrl+Z · Ctrl+Y</dt><dd>deshacer · rehacer</dd>
                  <dt>[ · ]</dt><dd>grosor del pincel</dd>
                  <dt>B · P · E</dt><dd>pincel · lápiz · goma (máscara de IA)</dd>
                  <dt>Esc</dt><dd>volver</dd>
                </dl>
              )}
            </div>
          )}
          {pending && (
            <div className="editor-console" onPointerDown={(e) => e.stopPropagation()}>
              <div className="editor-console-head">
                <b>{pendingLabel || "Generando…"}</b>
                <button
                  type="button"
                  className="editor-console-cancel"
                  onClick={() => onCancelJob?.()}
                >
                  Cancelar
                </button>
              </div>
              <pre ref={logBox} className="editor-console-log">
                {liveLog.filter(Boolean).join("\n") || "Enviando a ComfyUI…"}
              </pre>
            </div>
          )}
          {choices && choices.length > 0 && (
            <div className="editor-variants" onPointerDown={(e) => e.stopPropagation()}>
              <div className="editor-variants-strip">
                {choices.map((v, i) => (
                  <button
                    key={v.id}
                    type="button"
                    className={choicePick === i ? "on" : ""}
                    onClick={() => setChoicePick(i)}
                  >
                    <img src={v.url} alt={`variante ${i + 1}`} />
                    <i>{i + 1}</i>
                  </button>
                ))}
              </div>
              <div className="editor-variants-actions">
                <button
                  type="button"
                  className="btn-send"
                  onClick={() => choices[choicePick] && onPickChoice?.(choices[choicePick].id)}
                >
                  Usar la {choicePick + 1}
                </button>
                <button type="button" className="btn-ghost" onClick={() => onDismissChoices?.()}>
                  Seguir con la original
                </button>
              </div>
              <p className="hint">Clic o tecla 1 / 2 / 3. La elegida queda en el editor.</p>
            </div>
          )}
          <div className="editor-zoom" onPointerDown={(e) => e.stopPropagation()}>
            <div className="editor-zoom-fits">
              <button
                type="button"
                className={`editor-zoom-sq ${zoomPct === 100 ? "on" : ""}`}
                title="Tamaño real 100%"
                onClick={() => fitTo("100")}
              >
                100%
              </button>
              <button
                type="button"
                className="editor-zoom-sq"
                title="Ajuste vertical (alto de la ventana)"
                onClick={() => fitTo("v")}
              >
                <GlyphIcon name="fitv" size={18} />
              </button>
              <button
                type="button"
                className="editor-zoom-sq"
                title="Ajuste horizontal (ancho de la ventana)"
                onClick={() => fitTo("h")}
              >
                <GlyphIcon name="fith" size={18} />
              </button>
              <button type="button" className="editor-zoom-sq" title="Ajustar a la ventana (0)" onClick={centerFit}>
                <GlyphIcon name="fitbox" size={18} />
              </button>
            </div>
            <div className="editor-zoom-row">
              <select
                className="editor-zoom-pct"
                value={zoomPct === fitPct ? "fit" : String(zoomPct)}
                onChange={(e) => {
                  if (e.target.value === "fit") centerFit();
                  else setZoomPct(Number(e.target.value));
                }}
              >
                <option value="fit">{fitPct}%</option>
                {[25, 50, 75, 100, 150, 200].map((n) => (
                  <option key={n} value={String(n)}>
                    {n}%
                  </option>
                ))}
                {![25, 50, 75, 100, 150, 200].includes(zoomPct) && zoomPct !== fitPct && (
                  <option value={String(zoomPct)}>{zoomPct}%</option>
                )}
              </select>
              <input
                type="range"
                className="editor-zoom-range"
                min={Math.max(5, Math.min(fitPct, 25))}
                max={400}
                step={1}
                value={Math.min(400, zoomPct)}
                onChange={(e) => setZoomPct(Number(e.target.value))}
              />
              <button type="button" className="editor-zoom-btn" title="Alejar (−)" onClick={() => zoomBy(1 / 1.2)}>
                −
              </button>
              <button type="button" className="editor-zoom-btn" title="Acercar (+)" onClick={() => zoomBy(1.2)}>
                +
              </button>
            </div>
          </div>
        </div>
        <aside className="editor-side" style={{ width: sideW, flex: `0 0 ${sideW}px` }}>
          <div
            className="split split-x editor-split"
            title="Arrastrar para cambiar el ancho · doble clic restaura"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
              sideDrag.current = e.clientX;
              document.body.classList.add("resizing-x");
            }}
            onPointerMove={(e) => {
              if (sideDrag.current == null) return;
              const dx = e.clientX - sideDrag.current;
              sideDrag.current = e.clientX;
              setSideW((w) => Math.max(SIDE_MIN, Math.min(SIDE_MAX, w - dx)));
            }}
            onPointerUp={() => {
              sideDrag.current = null;
              document.body.classList.remove("resizing-x");
            }}
            onPointerCancel={() => {
              sideDrag.current = null;
              document.body.classList.remove("resizing-x");
            }}
            onDoubleClick={() => setSideW(SIDE_DEF)}
          />
          {!local && !folderSave && (
            <label className="editor-pin">
              <input type="checkbox" checked={pin} onChange={(e) => setPin(e.target.checked)} />
              usar como referencia
            </label>
          )}
          {pending && pendingLabel && <p className="hint editor-job">{pendingLabel}</p>}
          <div className="editor-actions">
              <div className="editor-save">
                {local && !folderSave ? (
                  <button type="button" className="btn-send" title="Descargar PNG" disabled={!ready || busy} onClick={() => void save("copy")}>
                    <GlyphIcon name="download" size={16} />
                    {busy ? "Guardando…" : "Descargar"}
                  </button>
                ) : (
                  <>
                    <button type="button" className="btn-send" title="Guardar (reemplaza el original)" disabled={!ready || busy} onClick={() => void save("replace")}>
                      <GlyphIcon name="save" size={16} />
                      {busy ? "Guardando…" : "Guardar"}
                    </button>
                    <button type="button" className="btn-ghost editor-ico-btn" title="Guardar como copia" aria-label="Guardar como copia" disabled={!ready || busy} onClick={() => void save("copy")}>
                      <GlyphIcon name="savecopy" size={18} />
                    </button>
                  </>
                )}
                <button type="button" className="btn-ghost editor-ico-btn" title="Copiar al portapapeles" aria-label="Copiar al portapapeles" disabled={!ready || busy} onClick={() => void copyClip()}>
                  <GlyphIcon name="clipboard" size={18} />
                </button>
              </div>
              {pending && onCancelJob && (
                <button type="button" className="btn-ghost" title="Cortar el trabajo en ComfyUI" onClick={onCancelJob}>
                  Cortar
                </button>
              )}
              <span className="editor-save-size">
              Al guardar {Math.round(c.w)}×{Math.round(c.h)}
              {outScale !== 1 ? ` → ${Math.round(c.w * outScale)}×${Math.round(c.h * outScale)}` : ""}
            </span>
              <div
                className="editor-seg editor-scale-seg"
                role="group"
                aria-label="Escala al guardar"
                title={`Escala del PNG al guardar. No usa IA.${local ? " La marca entra en el archivo." : " Para agrandar de verdad, IA → Ampliar."}`}
              >
                {[1, 1.5, 2].map((s) => (
                  <button key={s} type="button" className={outScale === s ? "on" : ""} onClick={() => setOutScale(s)}>
                    {s}×
                  </button>
                ))}
              </div>
              <button type="button" className="btn-ghost editor-ico-btn editor-reset" title="Restablecer" aria-label="Restablecer" disabled={busy} onClick={resetAll}>
                <GlyphIcon name="reset" size={18} />
              </button>
            </div>
          <div className="editor-side-main">
            <div className="editor-tools">
              <button type="button" className={`btn-ghost ${tool === "adjust" ? "on" : ""}`} title="Ajustar" aria-label="Ajustar" onClick={() => setTool("adjust")}>
                <GlyphIcon name="tools" size={20} />
              </button>
              <button type="button" className={`btn-ghost ${tool === "crop" ? "on" : ""}`} title="Posición (recortar, girar y voltear)" aria-label="Posición" onClick={() => setTool("crop")}>
                <GlyphIcon name="crop" size={20} />
              </button>
              <button
                type="button"
                className={`btn-ghost ${tool === "paint" ? "on" : ""}`}
                title="Pincel" aria-label="Pincel"
                onClick={() => {
                  setTool("paint");
                  ensureOverlay();
                  setPaintTick((n) => n + 1);
                }}
              >
                <GlyphIcon name="paint" size={20} />
              </button>
              <button type="button" className={`btn-ghost ${tool === "stick" ? "on" : ""}`} title="Íconos sobre la foto" aria-label="Íconos" onClick={() => setTool("stick")}>
                <GlyphIcon name="stick" size={20} />
              </button>
              <button type="button" className={`btn-ghost ${tool === "text" ? "on" : ""}`} title="Texto" aria-label="Texto" onClick={() => setTool("text")}>
                <GlyphIcon name="text" size={20} />
              </button>
              <button
                type="button"
                className={`btn-ghost ${tool === "wm" ? "on" : ""}`}
                title="Marca de agua" aria-label="Marca de agua"
                onClick={() => setTool("wm")}
              >
                <GlyphIcon name="wm" size={20} />
              </button>
              {!local && (
              <button
                type="button"
                className={`btn-ghost ${tool === "fill" ? "on" : ""}`}
                title="Editar con IA" aria-label="IA"
                onClick={() => {
                  setTool("fill");
                  ensureMask();
                  setMaskTick((n) => n + 1);
                }}
              >
                <GlyphIcon name="ai" size={20} />
              </button>
              )}
            </div>
            {tool === "adjust" ? (
              <>
                <Card title="Looks">
                  <div className="editor-looks">
                    <button
                      type="button"
                      className={`editor-look ${presetId === "" ? "on" : ""}`}
                      title="Quitar el look y volver a tus ajustes"
                      onClick={() => chooseLook("")}
                    >
                      Ninguno
                    </button>
                    {PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className={`editor-look ${presetId === p.id ? "on" : ""}`}
                        title={`${p.label}: reemplaza tus ajustes (Ninguno los recupera)`}
                        onClick={() => chooseLook(p.id)}
                      >
                        <i style={{ background: `linear-gradient(135deg, ${p.swatch[0]}, ${p.swatch[1]})` }} />
                        {p.label}
                      </button>
                    ))}
                  </div>
                  {presetId && <SliderRow icon="power" label="Intensidad" value={presetAmt} min={0} max={100} def={100} onChange={setLookAmount} />}
                </Card>
                {GROUPS.map((g) => (
                  <Card key={g.title} title={g.title} action={g.title === "Color" ? (<button
                          type="button"
                          className={`editor-eyedrop ${wbPick ? "on" : ""}`}
                          title="Balance de blancos: pulsa y haz clic en algo que deba ser gris o blanco"
                          onClick={() => setWbPick((v) => !v)}
                        >
                          <GlyphIcon name="eyedrop" size={14} />
                          {wbPick ? "Haz clic en la foto" : "Cuentagotas"}
                        </button>) : undefined}>
                    {g.keys.map((key) => {
                      const s = SLIDERS.find((x) => x.key === key);
                      if (!s) return null;
                      return (
                        <AdjRow
                          key={s.key}
                          icon={s.key}
                          label={s.label}
                          min={s.min}
                          def={s.def}
                          value={adj[s.key]}
                          onChange={(n) => setAdjKey(s.key, n)}
                        />
                      );
                    })}
                  </Card>
                ))}
                <Card title="Color por tono">
                    <div className="editor-hsl-dots" role="group" aria-label="Tono a ajustar">
                      {HSL_BANDS.map((band) => {
                        const touched = (["h", "s", "l"] as const).some((k) => adj[`${k}_${band.id}` as HslKey] !== 0);
                        return (
                          <button
                            key={band.id}
                            type="button"
                            className={`editor-hsl-dot ${hslBand === band.id ? "on" : ""} ${touched ? "touched" : ""}`}
                            style={{ background: band.color }}
                            title={band.label}
                            aria-label={band.label}
                            onClick={() => setHslBand(band.id)}
                          />
                        );
                      })}
                    </div>
                    <SliderRow icon="tint" label="Tono" value={adj[`h_${hslBand}` as HslKey]} min={-100} max={100} def={0} hint="Desplaza el color hacia el vecino" onChange={(n) => setAdjKey(`h_${hslBand}` as HslKey, n)} />
                    <SliderRow icon="saturate" label="Saturación" value={adj[`s_${hslBand}` as HslKey]} min={-100} max={100} def={0} onChange={(n) => setAdjKey(`s_${hslBand}` as HslKey, n)} />
                    <SliderRow icon="brightness" label="Luminosidad" value={adj[`l_${hslBand}` as HslKey]} min={-100} max={100} def={0} onChange={(n) => setAdjKey(`l_${hslBand}` as HslKey, n)} />
                </Card>
                <Card title="Blanco y negro">
                    <SliderRow icon="opacity" label="Cantidad" value={adj.bw} min={0} max={100} def={0} onChange={(n) => setAdjKey("bw", n)} />
                    <SliderRow icon="contrast" label="Filtro" value={adj.bwFilter} min={-100} max={100} def={0} hint="Como un filtro de cámara: a la izquierda oscurece los rojos, a la derecha los aclara" onChange={(n) => setAdjKey("bwFilter", n)} />
                    <SliderRow icon="tint" label="Virado" value={adj.bwTone} min={0} max={100} def={0} hint="Tiñe los grises (sepia, cianotipo…)" onChange={(n) => setAdjKey("bwTone", n)} />
                    <div className="editor-swatches">
                      {[
                        { label: "Sepia", hue: 35, color: "#b9814a" },
                        { label: "Selenio", hue: 285, color: "#8a6fb0" },
                        { label: "Cianotipo", hue: 205, color: "#3f7fb5" },
                        { label: "Bosque", hue: 120, color: "#6a9a5a" },
                      ].map((tone) => (
                        <button
                          key={tone.label}
                          type="button"
                          className={`editor-swatch ${adj.bwTone > 0 && adj.bwHue === tone.hue ? "on" : ""}`}
                          style={{ background: tone.color }}
                          title={`Virado ${tone.label.toLowerCase()}`}
                          onClick={() => {
                            setPresetId("");
                            setAdj((a) => ({ ...a, bwHue: tone.hue, bwTone: a.bwTone || 45 }));
                          }}
                        />
                      ))}
                    </div>
                    <SliderRow icon="tint" label="Matiz" value={adj.bwHue} min={0} max={360} def={35} onChange={(n) => setAdj((a) => ({ ...a, bwHue: n, bwTone: a.bwTone || 45 }))} />
                </Card>
                <Card title="Estilo rápido">
                  <StyleTiles
                    items={[{ id: 0, label: "Ninguno" }, ...STYLE_KINDS.map((s) => ({ id: s.id as number, label: s.label }))]}
                    value={adj.style}
                    thumbs={Object.keys(quickThumbs).length ? quickThumbs : undefined}
                    onPick={(id) => setAdjKey("style", id)}
                  />
                  {adj.style > 0 && (
                    <SliderRow icon="opacity" label="Intensidad" value={adj.styleAmt} min={0} max={100} def={70} onChange={(n) => setAdjKey("styleAmt", n)} />
                  )}
                  <p className="hint">Filtros al instante, sin IA. {local ? "Para un cartoon completo, abre la foto en el Studio." : "Para un cartoon completo usa IA → Estilo."}</p>
                </Card>
                <p className="hint">
                  Viñeta y marco: izquierda blanco, centro nada, derecha negro. Rueda: zoom.
                </p>
              </>
            ) : tool === "crop" ? (
              <>
                <Card title="Recorte">
                <div className="editor-places">
                  {(
                    [
                      [-1, "Original"],
                      [0, "Libre"],
                      [1, "1:1"],
                      [4 / 5, "4:5"],
                      [5 / 4, "5:4"],
                      [3 / 2, "3:2"],
                      [2 / 3, "2:3"],
                      [4 / 3, "4:3"],
                      [3 / 4, "3:4"],
                      [16 / 9, "16:9"],
                      [9 / 16, "9:16"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={label}
                      type="button"
                      className={cropRatio === id ? "on" : ""}
                      onClick={() => {
                        setCropRatio(id);
                        const { w, h } = work();
                        if (id === 0) return;
                        setCrop(fitRatio(w, h, id < 0 ? w / Math.max(1, h) : id));
                      }}
                    >
                      {label}
                    </button>
                  ))}
                  <button type="button" title="Cambiar entre horizontal y vertical" onClick={swapCropOrientation}>
                    ⇄ Girar
                  </button>
                </div>
                <p className="hint">Arrastrá los bordes del recuadro. Con una proporción elegida, se mantiene al tirar; «Libre» la suelta.</p>
                </Card>
                <Card title="Giro">
                <div className="editor-rotate-grid" style={{ marginBottom: 10 }}>
                    <button type="button" className="btn-ghost" title="Girar 90° a la izquierda" onClick={() => turn(-90)}>
                      <GlyphIcon name="rotl" size={22} />
                    </button>
                    <button type="button" className="btn-ghost" title="Girar 90° a la derecha" onClick={() => turn(90)}>
                      <GlyphIcon name="rotr" size={22} />
                    </button>
                    <button type="button" className={`btn-ghost ${flipH ? "on" : ""}`} title="Voltear horizontal" onClick={() => setFlipH((v) => !v)}>
                      <GlyphIcon name="fliph" size={22} />
                    </button>
                    <button type="button" className={`btn-ghost ${flipV ? "on" : ""}`} title="Voltear vertical" onClick={() => setFlipV((v) => !v)}>
                      <GlyphIcon name="flipv" size={22} />
                    </button>
                  </div>
                <OptRow label="Ángulo" value={tilt} min={-45} max={45} def={0} onChange={setTilt} />
                <div className="editor-undo" style={{ marginTop: 10 }}>
                  {onSuggestTilt && (
                    <button type="button" className="btn-ghost" disabled={autoBusy || !ready} title="Detecta el horizonte o las verticales y endereza la foto" onClick={() => void autoStraighten()}>
                      {autoBusy ? "Buscando…" : "Auto"}
                    </button>
                  )}
                  <button type="button" className="btn-ghost" onClick={() => setTilt(0)}>
                    Centrar
                  </button>
                </div>
                <p className="hint">Gira de 90° en 90°, voltea o ajusta el horizonte con el ángulo. Los bordes se recortan un poco para no dejar huecos.</p>
                </Card>
              </>
            ) : tool === "paint" ? (
              <>
                <Card title="Efecto">
                <div className="editor-bgmodes editor-fx">
                  {PAINT_FX.map((fx) => (
                    <button
                      key={fx.id}
                      type="button"
                      className={paintFx === fx.id ? "on" : ""}
                      title={fx.tip}
                      onClick={() => setPaintFx(fx.id)}
                    >
                      <span className="editor-bgico"><GlyphIcon name={fx.id === "color" ? "color" : fx.id === "pixel" ? "pixel" : fx.id === "clone" ? "clone" : fx.id === "heal" ? "heal" : "blur"} size={18} /></span>
                      {fx.label}
                    </button>
                  ))}
                </div>
                {paintFx === "clone" && (
                  <>
                    <button
                      type="button"
                      className={`btn-ghost ${clonePick ? "on" : ""}`}
                      style={{ marginTop: 8 }}
                      onClick={() => setClonePick((v) => !v)}
                    >
                      {cloneOn ? "Cambiar origen" : "Fijar origen"}
                    </button>
                    <p className="hint">
                      {cloneOn
                        ? "Origen listo. Pintá para copiar esa zona. Shift+clic lo mueve."
                        : "Shift+clic en la foto, o este botón y después un clic, marca de dónde se copia."}
                    </p>
                  </>
                )}
                </Card>
                <div className="editor-card">
                  <p className="editor-card-title">Trazo</p>
                  {paintFx !== "clone" && (
                    <div className="editor-seg" role="group" aria-label="Acción del pincel">
                      <button
                        type="button"
                        className={mark !== "eraser" ? "on" : ""}
                        title="Pinta el efecto. El borde se regula con Dureza."
                        onClick={() => setMark(mark === "eraser" ? "pencil" : mark)}
                      >
                        <GlyphIcon name="brush" size={14} />
                        Pintar
                      </button>
                      <button type="button" className={mark === "eraser" ? "on" : ""} title="Saca el trazo. No toca el original." onClick={() => setMark("eraser")}>
                        <GlyphIcon name="eraser" size={14} />
                        Borrar
                      </button>
                    </div>
                  )}
                  <OptRow label="Grosor" value={brush} min={4} max={brushMax} def={36} onChange={setBrush} />
                  {paintFx !== "clone" && paintFx !== "heal" && (
                    <OptRow label="Intensidad" value={paintStrength} min={10} max={100} def={50} onChange={setPaintStrength} />
                  )}
                </div>
                {(paintFx === "blur" || paintFx === "pixel" || paintFx === "color") && (
                  <Card title="Foco">
                    <button
                      type="button"
                      className={`focus-toggle ${focusOn ? "on" : ""}`}
                      aria-pressed={focusOn}
                      onClick={() => setFocusOn((v) => !v)}
                      title="Deja zonas circulares nítidas y aplica el efecto en el resto (o al revés)"
                    >
                      <Focus size={18} strokeWidth={1.75} aria-hidden />
                      <span>
                        <b>{focusOn ? "Foco activado" : "Activar foco"}</b>
                        <small>{focusOn ? "Arrastrá sobre la foto desde el centro hacia afuera" : "Círculos nítidos, efecto en el resto"}</small>
                      </span>
                    </button>
                    {focusOn && (
                      <>
                        <div className="editor-seg" role="group" aria-label="Dónde va el efecto">
                          <button type="button" className={!focusInside ? "on" : ""} onClick={() => changeFocusInside(false)} title="El círculo queda nítido y el resto lleva el efecto">
                            Efecto afuera
                          </button>
                          <button type="button" className={focusInside ? "on" : ""} onClick={() => changeFocusInside(true)} title="El efecto va dentro del círculo">
                            Efecto adentro
                          </button>
                        </div>
                        <OptRow label="Tamaño" value={Math.round(focusK * 100)} min={20} max={300} def={100} onChange={changeFocusK} hint="Agranda o achica todos los círculos marcados, antes de aplicar" />
                        <OptRow label="Borde suave" value={focusSoft} min={0} max={100} def={45} onChange={changeFocusSoft} hint="Qué tan gradual es la transición entre la zona nítida y el efecto" />
                        <p className="hint">Tamaño y borde se pueden ajustar antes de Aplicar. La intensidad es la de arriba. Línea blanca: borde; azul: inicio de la transición.</p>
                        <div className="focus-actions">
                          <button type="button" className="btn-ghost" onClick={focusVignette} title="Centro nítido y bordes con el efecto">
                            Viñeta
                          </button>
                          <button type="button" className="btn-ghost" disabled={focusN === 0} onClick={clearFocus}>
                            Limpiar
                          </button>
                          <button type="button" className="btn-send focus-apply" disabled={focusN === 0} onClick={applyFocus}>
                            Aplicar{focusN > 0 ? ` (${focusN})` : ""}
                          </button>
                        </div>
                      </>
                    )}
                  </Card>
                )}
                {paintFx !== "clone" && (
                  <div className="editor-card">
                    <p className="editor-card-title">Borde del pincel</p>
                    <div className="editor-seg" role="group" aria-label="Tipo de borde">
                      {([["Duro", 100], ["Suave", 50], ["Difuso", 15]] as const).map(([label, v]) => (
                        <button key={label} type="button" className={hardness === v ? "on" : ""} title={`Bordes ${label.toLowerCase()}`} onClick={() => setHardness(v)}>
                          {label}
                        </button>
                      ))}
                    </div>
                    <OptRow label="Dureza" value={hardness} min={0} max={100} def={50} onChange={setHardness} />
                  </div>
                )}
                {paintFx === "color" && mark !== "eraser" && (
                  <Card title="Color" action={<b className="editor-hex">{paintColor}</b>}><div className="editor-swatches">
                      {PAINT_SWATCHES.map((s) => (
                        <button
                          key={s.hex}
                          type="button"
                          className={`editor-swatch ${paintColor.toLowerCase() === s.hex.toLowerCase() ? "on" : ""}`}
                          style={{ background: s.hex }}
                          title={s.tip}
                          onClick={() => setPaintColor(s.hex)}
                        />
                      ))}
                      <input
                        type="color"
                        className="editor-color"
                        value={/^#[0-9a-fA-F]{6}$/.test(paintColor) ? paintColor : "#1A1A1A"}
                        title="Color libre"
                        onChange={(e) => setPaintColor(e.target.value)}
                      />
                    </div></Card>
                )}
                <div className="editor-undo">
                  <button type="button" className="btn-ghost" disabled={!canUndo || busy} onClick={undoPaint}>
                    Deshacer
                  </button>
                  <button type="button" className="btn-ghost" disabled={!canRedo || busy} onClick={redoPaint}>
                    Rehacer
                  </button>
                </div>
                <p className="hint">
                  El trazo no se graba solo. Deshacer (Ctrl+Z) saca el último. Espacio = original. Guardar fija los cambios.
                </p>
              </>
            ) : tool === "stick" ? (
              <>
                <IconPalette label="Íconos color" items={WM_COLOR_ICONS} isOn={(ch) => stickIcon === ch} onPick={pickStickIcon} prefix="Usar" />
                <IconPalette label="Íconos trazo" items={WM_TRACE} isOn={(ch) => stickIcon === ch} onPick={pickStickIcon} prefix="Usar" />
                <IconPalette label="Pack de íconos" items={LUCIDE_STICKERS} isOn={(ch) => stickIcon === ch} onPick={pickStickIcon} prefix="Usar" />
                <Card title="Color y estilo">
                  <div className="editor-seg" role="group" aria-label="Estilo del color">
                    {([["solid", "Liso"], ["gradient", "Degradado"], ["rainbow", "Arcoíris"]] as const).map(([id, name]) => (
                      <button key={id} type="button" className={stickLook === id ? "on" : ""} onClick={() => patchStick({ look: id })}>
                        {name}
                      </button>
                    ))}
                  </div>
                  {stickLook !== "rainbow" && (
                    <StickSwatches label={stickLook === "gradient" ? "Desde" : "Color"} value={stickColor} onPick={(hex) => patchStick({ color: hex })} />
                  )}
                  {stickLook === "gradient" && <StickSwatches label="Hasta" value={stickColor2} onPick={(hex) => patchStick({ color2: hex })} />}
                  {WM_COLOR_ICONS.some((i) => i.ch === stickIcon) && <p className="hint">Los íconos de color ya traen sus colores; esto vale para los de trazo.</p>}
                </Card>
                <Card title="Tamaño">
                <OptRow
                  label="Tamaño"
                  value={pieces.find((p) => p.id === pieceId)?.size ?? pieceSize}
                  min={16}
                  max={280}
                  onChange={(n) => {
                    setPieceSize(n);
                    if (pieces.some((p) => p.id === pieceId)) {
                      snapPieces(`size${pieceId}`);
                      setPieces((list) => list.map((p) => (p.id === pieceId ? { ...p, size: n } : p)));
                    }
                  }}
                />
                </Card>
                <div className="editor-undo">
                  <button
                    type="button"
                    className="btn-ghost del"
                    disabled={!pieces.some((p) => p.id === pieceId)}
                    onClick={() => {
                      snapPieces("");
                      setPieces((list) => list.filter((p) => p.id !== pieceId));
                      setPieceId(0);
                    }}
                  >
                    Quitar
                  </button>
                  <button type="button" className="btn-ghost" disabled={pieceUndoN === 0} title="Deshacer (Ctrl+Z)" onClick={undoPieces}>
                    Deshacer
                  </button>
                </div>
                <p className="hint">Clic en la foto lo deja ahí. Arrastrá para moverlo. Otro clic agrega otro.</p>
              </>
            ) : tool === "text" ? (
              <>
                <Card title="Texto">
<input
                  className="editor-wm-text"
                  value={noteText}
                  maxLength={80}
                  placeholder="Una frase"
                  onChange={(e) => {
                    const text = e.target.value;
                    setNoteText(text);
                    if (!pieceFresh.current && pieces.some((p) => p.id === pieceId && p.kind === "text")) {
                      snapPieces(`text${pieceId}`);
                      setPieces((list) => list.map((p) => (p.id === pieceId && p.kind === "text" ? { ...p, text } : p)));
                    }
                  }}
                />
                <select
                  className="editor-font"
                  title="Fuente"
                  aria-label="Fuente"
                  value={noteFont}
                  onChange={(e) => {
                    const font = e.target.value;
                    setNoteFont(font);
                    if (!pieceFresh.current && pieces.some((p) => p.id === pieceId && p.kind === "text")) {
                      snapPieces("");
                      setPieces((list) => list.map((p) => (p.id === pieceId && p.kind === "text" ? { ...p, font } : p)));
                    }
                  }}
                >
                  {installedFonts().map((font) => (
                    <option key={font} value={font} style={{ fontFamily: `"${font}"` }}>{font}</option>
                  ))}
                </select>
</Card>
<Card title="Color">
<div className="editor-swatches">
                  {["#ffffff", "#111111", "#f2e6c8", "#e6c07b", "#d45b5b", "#8eb4e8"].map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      className={`editor-swatch ${noteColor.toLowerCase() === hex ? "on" : ""}`}
                      style={{ background: hex }}
                      onClick={() => {
                        setNoteColor(hex);
                        if (!pieceFresh.current && pieces.some((p) => p.id === pieceId && p.kind === "text")) {
                          snapPieces("");
                          setPieces((list) => list.map((p) => (p.id === pieceId && p.kind === "text" ? { ...p, color: hex } : p)));
                        }
                      }}
                    />
                  ))}
                </div>
</Card>
                <Card title="Tamaño">
                <OptRow
                  label="Tamaño"
                  value={pieces.find((p) => p.id === pieceId)?.size ?? pieceSize}
                  min={16}
                  max={280}
                  onChange={(n) => {
                    setPieceSize(n);
                    if (pieces.some((p) => p.id === pieceId)) {
                      snapPieces(`size${pieceId}`);
                      setPieces((list) => list.map((p) => (p.id === pieceId ? { ...p, size: n } : p)));
                    }
                  }}
                />
                </Card>
                <div className="editor-undo">
                  <button
                    type="button"
                    className="btn-ghost del"
                    disabled={!pieces.some((p) => p.id === pieceId && p.kind === "text")}
                    onClick={() => {
                      snapPieces("");
                      setPieces((list) => list.filter((p) => p.id !== pieceId));
                      setPieceId(0);
                    }}
                  >
                    Quitar
                  </button>
                  <button type="button" className="btn-ghost" disabled={pieceUndoN === 0} title="Deshacer (Ctrl+Z)" onClick={undoPieces}>
                    Deshacer
                  </button>
                </div>
                <p className="hint">Escribí y hacé clic en la foto. No se repite: es un texto suelto, no la marca.</p>
              </>
            ) : tool === "wm" ? (
              <>
                <Card title="Marca de agua">
<label className="editor-pin">
                  <input
                    type="checkbox"
                    checked={wm.on}
                    onChange={(e) => setWm((w) => ({ ...w, on: e.target.checked }))}
                  />
                  ver en la foto y al guardar
                </label>
                <div className="editor-seg">
                  <button
                    type="button"
                    className={wm.mode === "text" ? "on" : ""}
                    onClick={() => setWm((w) => ({ ...w, mode: "text", on: true }))}
                  >
                    Texto
                  </button>
                  <button
                    type="button"
                    className={wm.mode === "image" ? "on" : ""}
                    onClick={() => setWm((w) => ({ ...w, mode: "image", on: true }))}
                  >
                    Imagen
                  </button>
                </div>
                {wm.mode === "text" ? (
                  <>
                    <input
                      className="editor-wm-text"
                      value={wm.text}
                      maxLength={80}
                      placeholder="🔥TuMarca"
                      onChange={(e) => setWm((w) => ({ ...w, on: true, text: e.target.value }))}
                    />
                <select
                  className="editor-font" title="Fuente" aria-label="Fuente"
                  value={wmFont(wm.font)}
                  onChange={(e) => setWm((w) => ({ ...w, font: e.target.value }))}
                >
                  {installedFonts().map((font) => (
                    <option key={font} value={font} style={{ fontFamily: `"${font}"` }}>{font}</option>
                  ))}
                </select>
                                      </>
                ) : (
                  <>
                    <button type="button" className="btn-ghost editor-wm-file" onClick={() => wmFileRef.current?.click()}>
                      {wmFileName || "Elegir PNG o imagen"}
                    </button>
                    <input
                      ref={wmFileRef}
                      type="file"
                      accept="image/png,image/webp,image/jpeg,image/gif"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) pickWmImage(file);
                      }}
                    />
                    <p className="hint">PNG con transparencia. El lugar de abajo vale igual para la imagen.</p>
                  </>
                )}
                </Card>
                {wm.mode === "text" && (
                  <>
<IconPalette label="Íconos color" items={WM_COLOR_ICONS} onPick={(ch) => setWm((w) => ({ ...w, on: true, mode: "text", text: (w.text + ch).slice(0, 80) }))} prefix="Agregar" />
                    <IconPalette label="Íconos trazo" items={WM_TRACE} onPick={(ch) => setWm((w) => ({ ...w, on: true, mode: "text", text: (w.text + ch).slice(0, 80) }))} prefix="Agregar" />
                    <p className="hint">
                      {wm.place === "tile"
                        ? "Color conserva su tono. Trazo sigue el color de abajo. Se repite en diagonal."
                        : "Color conserva su tono. Trazo sigue el color de abajo. Un solo sello."}
                    </p>
                                        <Card title="Color" action={<b className="editor-hex">{wm.color}</b>}>
                      <div className="editor-swatches">
                      {[
                        { hex: "#ffffff", tip: "Blanco" },
                        { hex: "#111111", tip: "Negro" },
                        { hex: "#f2e6c8", tip: "Cálido" },
                        { hex: "#e6c07b", tip: "Dorado" },
                        { hex: "#d45b5b", tip: "Rojo" },
                        { hex: "#8eb4e8", tip: "Azul" },
                      ].map((s) => (
                        <button
                          key={s.hex}
                          type="button"
                          className={`editor-swatch ${wm.color.toLowerCase() === s.hex ? "on" : ""}`}
                          style={{ background: s.hex }}
                          title={s.tip}
                          onClick={() => setWm((w) => ({ ...w, color: s.hex }))}
                        />
                      ))}
                      <input
                        type="color"
                        className="editor-color"
                        value={/^#[0-9a-fA-F]{6}$/.test(wm.color) ? wm.color : "#ffffff"}
                        title="Color libre"
                        onChange={(e) => setWm((w) => ({ ...w, color: e.target.value }))}
                      />
                    </div>
                    </Card>
                  </>
                )}
                <Card title="Posición">
                <div className="editor-seg">
                  {WM_PLACES.map(([id, label, tip]) => (
                    <button
                      key={id}
                      type="button"
                      className={wm.place === id ? "on" : ""}
                      title={tip}
                      onClick={() => setWm((w) => ({ ...w, place: id, on: true }))}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <OptRow label="Opacidad" value={wm.opacity} min={8} max={92} def={WM_DEFAULT.opacity} onChange={(n) => setWm((w) => ({ ...w, opacity: n }))} />
                <OptRow label="Ángulo" value={wm.angle} min={-75} max={75} def={WM_DEFAULT.angle} onChange={(n) => setWm((w) => ({ ...w, angle: n }))} />
                <OptRow label="Tamaño" value={wm.size} min={10} max={80} def={WM_DEFAULT.size} onChange={(n) => setWm((w) => ({ ...w, size: n }))} />
                {wm.place === "tile" && (
                  <OptRow label="Separación" value={wm.gap} min={0} max={100} def={WM_DEFAULT.gap} onChange={(n) => setWm((w) => ({ ...w, gap: n }))} />
                )}
                {wm.mode === "text" && (
                  <OptRow label="Sombra" value={wm.shade} min={0} max={100} def={WM_DEFAULT.shade} onChange={(n) => setWm((w) => ({ ...w, shade: n }))} />
                )}
                </Card>
                <p className="hint">
                  No entra al trabajo de IA. Solo al PNG que guardás. Espacio muestra la foto sin marca.
                </p>
              </>
            ) : (
              <>
                <Card title="Editar con IA">
                <div className="editor-motor">
                  <b>
                    {aiMode === "replace"
                      ? FILL_ENGINES.find((e) => e.id === fillEngine)?.label || "Z-Image"
                      : aiMode === "blur"
                        ? "Sin sampler · YOLO + desenfoque"
                        : aiMode === "solid"
                          ? "Sin sampler · YOLO + color"
                          : aiMode === "style"
                            ? "Flux Kontext · estilo por instrucción"
                            : upscaleMotor(upTiled, upFaceFix)}
                  </b>
                    {aiMode === "replace"
                      ? FILL_ENGINES.find((e) => e.id === fillEngine)?.note ||
                      "Recorta lo pintado y corre el prompt en esa mini foto."
                    : aiMode === "upscale"
                      ? upTiled
                        ? "Tiled agranda con teselas Z-Image (2–5 min). FaceFix retoca la cara antes."
                        : upFaceFix
                          ? "FaceFix en la cara y UltraSharp para agrandar. Más rápido que Tiled."
                          : "Solo 4×-UltraSharp + lanczos. Rápido, menos detalle."
                      : aiMode === "style"
                        ? "Redibuja la foto completa en otro estilo. Tarda unos minutos y sale a ~1 megapíxel."
                        : "No redibuja a la persona. Detectá, retocá la máscara y aplicá."}
                </div>
                <div className="editor-bgmodes editor-fx">
                  <button type="button" className={aiMode === "blur" ? "on" : ""} onClick={() => setAiMode("blur")}>
                    <span className="editor-bgico"><GlyphIcon name="blur" size={18} /></span>
                    Desenfocar
                  </button>
                  <button type="button" className={aiMode === "solid" ? "on" : ""} onClick={() => setAiMode("solid")}>
                    <span className="editor-bgico"><GlyphIcon name="solid" size={18} /></span>
                    Quitar
                  </button>
                  <button type="button" className={aiMode === "replace" ? "on" : ""} onClick={() => setAiMode("replace")}>
                    <span className="editor-bgico"><GlyphIcon name="replace" size={18} /></span>
                    Reemplazar
                  </button>
                  <button type="button" className={aiMode === "upscale" ? "on" : ""} onClick={() => setAiMode("upscale")}>
                    <span className="editor-bgico"><GlyphIcon name="upscale" size={18} /></span>
                    Ampliar
                  </button>
                  <button type="button" className={aiMode === "style" ? "on" : ""} onClick={() => setAiMode("style")}>
                    <span className="editor-bgico"><GlyphIcon name="style" size={18} /></span>
                    Estilo
                  </button>
                </div>
                </Card>
                {(aiMode === "blur" || aiMode === "solid") && (
                  <>
                    <button
                      type="button"
                      className="btn-ghost editor-fill-go"
                      disabled={!ready || busy || !onDetect}
                      onClick={() => void detectPerson()}
                    >
                      {busy && pending ? "Esperando…" : busy ? "Detectando…" : "Detectar persona"}
                    </button>
                    <Card title="Pincel de máscara (verde = se queda)">
                    <div className="editor-seg">
                      {MARKS.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          className={mark === m.id ? "on" : ""}
                          title={m.id === "eraser" ? "Restar de la persona (pasa a fondo)" : "Sumar a la persona"}
                          onClick={() => setMark(m.id)}
                        >
                          <GlyphIcon name={m.id} size={14} />
                          {m.id === "eraser" ? "Restar" : m.id === "brush" ? "Suave" : "Sumar"}
                        </button>
                      ))}
                    </div>
                    <OptRow label="Grosor" value={brush} min={4} max={brushMax} def={36} onChange={setBrush} />
                    <div className="editor-tools" style={{ marginTop: 12 }}>
                      <button type="button" className="btn-ghost" onClick={clearMask}>
                        Limpiar máscara
                      </button>
                    </div>
</Card>
                    <div className="editor-card">
                      <p className="editor-card-title">Máscara</p>
                      <OptRow label="Margen" value={bgMargin} min={-40} max={60} hint="Izquierda recorta el recorte; derecha guarda más pelo y hombros." onChange={setBgMargin} />
                      <OptRow label="Pluma" value={bgFeather} min={0} max={50} hint="Borde duro o suave entre persona y fondo." onChange={setBgFeather} />
                      <OptRow label="Detección" value={bgDetect} min={15} max={70} hint="Más alto = solo el cuerpo claro. Más bajo = incluye pelo y manos." onChange={setBgDetect} />
                    </div>
                    <p className="hint">
                      Detectar pinta a la persona en verde. Lápiz suma, goma resta. Si no detectás, YOLO corre al aplicar.
                    </p>
                  </>
                )}
                {aiMode === "blur" && (
                  <>
                    <OptRow label="Intensidad" value={blurAmt} min={20} max={100} onChange={setBlurAmt} />
                    <p className="hint">
                      Detecta a la persona y difumina lámparas, telón y muralla. Ella no se redibuja.
                    </p>
                    <button
                      type="button"
                      className="btn-send editor-fill-go"
                      disabled={!ready || busy || !onBgFix || Boolean(choices?.length)}
                      onClick={() => void applyBg("blur")}
                    >
                      {busy ? "Desenfocando…" : "Desenfocar fondo"}
                    </button>
                  </>
                )}
                {aiMode === "solid" && (
                  <>
                    <Card title="Color de fondo" action={<b className="editor-hex">{bgColor}</b>}><div className="editor-swatches">
                      {BG_SWATCHES.map((s) => (
                        <button
                          key={s.hex}
                          type="button"
                          className={`editor-swatch ${bgColor.toLowerCase() === s.hex.toLowerCase() ? "on" : ""}`}
                          style={{ background: s.hex }}
                          title={s.tip}
                          onClick={() => setBgColor(s.hex)}
                        />
                      ))}
                      <input
                        type="color"
                        className="editor-color"
                        value={/^#[0-9a-fA-F]{6}$/.test(bgColor) ? bgColor : "#D4D4D4"}
                        title="Color libre"
                        onChange={(e) => setBgColor(e.target.value)}
                      />
                    </div></Card>
                    <p className="hint">Detecta a la persona y deja un fondo liso. Sin inventar escena.</p>
                    <button
                      type="button"
                      className="btn-send editor-fill-go"
                      disabled={!ready || busy || !onBgFix || Boolean(choices?.length)}
                      onClick={() => void applyBg("solid")}
                    >
                      {busy ? "Quitando…" : "Quitar fondo"}
                    </button>
                  </>
                )}
                {aiMode === "replace" && (
                  <>
                    <Card title="Motor del parche"><div className="editor-engines">
                      {FILL_ENGINES.map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          className={fillEngine === e.id ? "on" : ""}
                          title={e.note}
                          onClick={() => setFillEngine(e.id)}
                        >
                          {e.label}
                        </button>
                      ))}
                    </div></Card>
                    <p className="hint">
                      {fillEngine === "local"
                        ? "Pintá solo la lámpara o el borde. El trazo se tapa con el color del telón."
                        : "Pintá el sector. Eso se recorta como una foto nueva, se genera con el prompt y se pega. El resto no entra al modelo."}
                    </p>
                    <Card title="Pincel (solo lo pintado)">
                    <div className="editor-seg">
                      {MARKS.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          className={mark === m.id ? "on" : ""}
                          title={m.tip}
                          onClick={() => setMark(m.id)}
                        >
                          <GlyphIcon name={m.id} size={14} />
                          {m.label}
                        </button>
                      ))}
                    </div>
                    <OptRow label="Grosor" value={brush} min={4} max={brushMax} def={36} onChange={setBrush} />
                    <div className="editor-tools" style={{ marginTop: 12 }}>
                      <button type="button" className="btn-ghost" onClick={clearMask}>
                        Limpiar marca
                      </button>
                    </div>
</Card>
                    {fillEngine !== "local" && (
                      <>
                        <Card title="Qué poner en la zona"><textarea
                          className="editor-fill-prompt"
                          rows={4}
                          value={fillPrompt}
                          onChange={(e) => setFillPrompt(e.target.value)}
                        /></Card>
                        <Card title="Variantes" action={<b className="editor-hex">×{variants}</b>}><div className="editor-scales">
                          {[1, 2, 3].map((n) => (
                            <button key={n} type="button" className={variants === n ? "on" : ""} onClick={() => setVariants(n)}>
                              {n}
                            </button>
                          ))}
                        </div></Card>
                      </>
                    )}
                    <button
                      type="button"
                      className="btn-send editor-fill-go"
                      disabled={!ready || busy || !onInpaint || Boolean(choices?.length)}
                      onClick={() => void fillZone()}
                    >
                      {busy ? "Generando…" : fillEngine === "local" ? "Clonar zona" : "Generar parche"}
                    </button>
                  </>
                )}
                {aiMode === "style" && (
                  <>
                    <Card title="Estilo">
                      <StyleTiles items={STYLE_CHOICES} value={styleId} thumbs={styleThumbs} onPick={setStyleId} />
                      {styleId === "custom" && (
                        <input
                          className="editor-wm-text"
                          value={stylePrompt}
                          maxLength={120}
                          placeholder="Ej.: grabado japonés ukiyo-e"
                          onChange={(e) => setStylePrompt(e.target.value)}
                        />
                      )}
                    </Card>
                    <Card title="Ajustes">
                      <SliderRow
                        icon="power"
                        label="Fuerza"
                        value={styleGuidance}
                        min={1.5}
                        max={4.5}
                        step={0.1}
                        def={2.5}
                        fmt={(n) => n.toFixed(1)}
                        hint="Más alto sigue más el estilo pedido; más bajo conserva más la foto"
                        onChange={setStyleGuidance}
                      />
                    </Card>
                    <Card title="Variantes" action={<b className="editor-hex">×{styleCount}</b>}>
                      <div className="editor-seg" role="group" aria-label="Variantes">
                        {[1, 2].map((n) => (
                          <button key={n} type="button" className={styleCount === n ? "on" : ""} onClick={() => setStyleCount(n)}>
                            {n}
                          </button>
                        ))}
                      </div>
                    </Card>
                    <p className="hint">
                      Usa Flux Kontext en ComfyUI. La foto sale a ~1 megapíxel (después puedes ampliarla en «Ampliar») y las caras
                      pueden cambiar un poco. Para un resultado inmediato usa «Estilo rápido» en Ajustar.
                    </p>
                    <button
                      type="button"
                      className="btn-send editor-fill-go"
                      disabled={!ready || busy || !onStylize || Boolean(choices?.length)}
                      onClick={() => void applyStyle()}
                    >
                      {busy ? "Generando…" : "Aplicar estilo"}
                    </button>
                  </>
                )}
                {aiMode === "upscale" && (
                  <>
                    <p className="hint">
                      {ready
                        ? `${Math.round(c.w)}×${Math.round(c.h)} → ${Math.round(c.w * upScale)}×${Math.round(c.h * upScale)}`
                        : ""}
                    </p>
                    <Card title="Factor" action={<b className="editor-hex">×{upScale}</b>}><div className="editor-scales">
                      {[1, 1.5, 2, 3, 4].map((s) => (
                        <button
                          key={s}
                          type="button"
                          className={upScale === s ? "on" : ""}
                          onClick={() => setUpScale(s)}
                        >
                          {s}×
                        </button>
                      ))}
                    </div></Card>
                    <p className="hint">
                      {upScale === 1
                        ? "×1 no agranda: solo FaceFix (o no hace nada si FaceFix está apagado)."
                        : upScale >= 3
                          ? "×3/×4: más teselas, más tiempo. En 12 GB Tiled suele entrar; UltraSharp a ×4 puede ir justo."
                          : "×2 es el equilibrio en esta PC (832×1216 → 1664×2432). ×1.5 si querés menos espera."}
                    </p>
                    <Card title="Opciones"><div className="editor-engines">
                      <button
                        type="button"
                        className={upTiled ? "on" : ""}
                        title="Ultimate SD Upscale con Z-Image. Más lento, más textura."
                        onClick={() => setUpTiled((v) => !v)}
                      >
                        Tiled
                      </button>
                      <button
                        type="button"
                        className={upFaceFix ? "on" : ""}
                        title="FaceDetailer sobre la cara a tamaño original, antes de agrandar."
                        onClick={() => setUpFaceFix((v) => !v)}
                      >
                        FaceFix
                      </button>
                    </div></Card>
                    <p className="hint">
                      {upTiled && upFaceFix
                        ? "Los dos: cara retocada y teselas. 2–5 min."
                        : upTiled
                          ? "Solo teselas Z-Image. Sin retoque de cara."
                          : upFaceFix
                            ? "Cara retocada + UltraSharp. Sin teselas."
                            : "Ninguno: UltraSharp solo. Segundos, menos detalle."}
                    </p>
                    <details className="adv">
                      <summary>Avanzado</summary>
                      {upFaceFix && (
                        <>
                          <SliderRow icon="power" label="FaceFix" value={upFfDenoise} min={0.1} max={0.5} step={0.05} fmt={(n) => n.toFixed(2)} onChange={setUpFfDenoise} />
                          <p className="hint">Cuánto redibuja Z-Image la cara. 0.25–0.35 natural. Más alto = granos.</p>
                        </>
                      )}
                      {upTiled && (
                        <>
                          <SliderRow icon="power" label="Tiled" value={upTiledDenoise} min={0} max={0.5} step={0.05} fmt={(n) => n.toFixed(2)} onChange={setUpTiledDenoise} />
                          <p className="hint">0 = solo UltraSharp (sin redibujar teselas). 0.3 = Z-Image pinta cada baldosa.</p>
                        </>
                      )}
                      {!upTiled && !upFaceFix && (
                        <p className="hint">Sin Tiled ni FaceFix no corre Z-Image: solo el modelo UltraSharp agranda.</p>
                      )}
                      <p className="hint">
                        YOLO encuentra la cara (no pinta). Teselas = baldosas de 1024 que junta el mismo nodo. UltraSharp es
                        el modelo 4×. Z-Image es el motor que redibuja cara y teselas (CFG 1, 5–6 steps).
                      </p>
                    </details>
                    <button
                      type="button"
                      className="btn-send editor-fill-go"
                      disabled={!ready || busy || !onUpscale || Boolean(choices?.length)}
                      onClick={() => void applyUpscale()}
                    >
                      {busy ? "Ampliando…" : `Ampliar ×${upScale}`}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

type Glyph =
  | "tools"
  | "reset"
  | "adjust"
  | "crop"
  | "style"
  | "eyedrop"
  | "heal"
  | "back"
  | "angle"
  | "thick"
  | "hard"
  | "power"
  | "size"
  | "opacity"
  | "spacing"
  | "shadow"
  | "margin"
  | "feather"
  | "detect"
  | "eye"
  | "save"
  | "savecopy"
  | "clipboard"
  | "download"
  | "paint"
  | "stick"
  | "text"
  | "wm"
  | "ai"
  | "blur"
  | "solid"
  | "replace"
  | "upscale"
  | "pixel"
  | "color"
  | "clone"
  | "pencil"
  | "brush"
  | "eraser"
  | "rotl"
  | "rotr"
  | "fliph"
  | "flipv"
  | "fith"
  | "fitv"
  | "fitbox"
  | keyof Adjust;

/** Íconos del pack Lucide; los que no están aquí siguen con el dibujo propio de abajo. */
const LUCIDE: Partial<Record<Glyph, LucideIcon>> = {
  tools: Wrench, reset: RotateCcw, adjust: SlidersHorizontal, crop: Crop, style: Palette, eyedrop: Pipette, heal: Bandage, back: ArrowLeft,
  save: Save, savecopy: SaveAll, clipboard: ClipboardCopy, download: Download, paint: Paintbrush, stick: Smile, text: Type, wm: Stamp,
  ai: WandSparkles, replace: Replace, upscale: Scaling, eraser: Eraser, brush: Brush, pencil: Pencil, rotl: RotateCcwSquare,
  rotr: RotateCwSquare, fliph: FlipHorizontal2, flipv: FlipVertical2, fith: MoveHorizontal, fitv: MoveVertical, fitbox: Maximize,
  eye: Eye, solid: Square,
};

function GlyphIcon({ name, size = 16 }: { name: Glyph; size?: number }) {
  const Lucide = LUCIDE[name];
  if (Lucide) return <Lucide size={size} strokeWidth={1.75} aria-hidden />;
  const s = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.35,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden>
      {name === "adjust" && (
        <>
          <path {...s} d="M2 4h12M2 8h12M2 12h12" />
          <circle cx="5" cy="4" r="1.3" fill="currentColor" />
          <circle cx="11" cy="8" r="1.3" fill="currentColor" />
          <circle cx="7" cy="12" r="1.3" fill="currentColor" />
        </>
      )}
      {name === "tools" && (
        <>
          <path
            {...s}
            transform="scale(.6667)"
            strokeWidth={2}
            d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
          />
        </>
      )}
      {name === "save" && (
        <>
          <path {...s} d="M3 2.5h8.2l2.3 2.3V13a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5Z" />
          <path {...s} d="M5 2.5v3.2h5V2.5M5 13.5V9h6v4.5" />
        </>
      )}
      {name === "savecopy" && (
        <>
          <rect {...s} x="5.6" y="5.6" width="8" height="8" rx="1.3" />
          <path {...s} d="M10.4 5.6V3.9a1.3 1.3 0 0 0-1.3-1.3H3.9a1.3 1.3 0 0 0-1.3 1.3v5.2a1.3 1.3 0 0 0 1.3 1.3h1.7" />
        </>
      )}
      {name === "reset" && (
        <>
          <path {...s} d="M2.4 8a5.6 5.6 0 1 0 1.7-4L2.4 5.6" />
          <path {...s} d="M2.4 2.6v3h3" />
        </>
      )}
      {name === "clipboard" && (
        <>
          <path {...s} d="M5.4 3.2H4.2a.9.9 0 0 0-.9.9v8.8a.9.9 0 0 0 .9.9h7.6a.9.9 0 0 0 .9-.9V4.1a.9.9 0 0 0-.9-.9h-1.2" />
          <path {...s} d="M6 2.2h4v2H6z" />
        </>
      )}
      {name === "download" && <path {...s} d="M8 2.5v7M5 6.8 8 9.8l3-3M3 13h10" />}
      {name === "eye" && (
        <>
          <path {...s} d="M1.8 8S4 3.8 8 3.8 14.2 8 14.2 8 12 12.2 8 12.2 1.8 8 1.8 8Z" />
          <circle {...s} cx="8" cy="8" r="1.9" />
        </>
      )}
      {name === "angle" && <path {...s} d="M2.8 12.8h10.4M2.8 12.8 10.2 4.6M6.4 12.8a3.6 3.6 0 0 0-1-2.5" />}
      {name === "thick" && (
        <>
          <path {...s} strokeWidth={1} d="M2.5 4h11" />
          <path {...s} strokeWidth={2} d="M2.5 8h11" />
          <path {...s} strokeWidth={3.4} d="M2.5 12.4h11" />
        </>
      )}
      {name === "hard" && (
        <>
          <circle {...s} cx="8" cy="8" r="5.2" strokeDasharray="1.6 1.9" />
          <circle cx="8" cy="8" r="2.4" fill="currentColor" />
        </>
      )}
      {name === "power" && <path {...s} d="M9.2 1.8 4.4 9h3.4l-1 5.2L11.6 7H8.2z" />}
      {name === "size" && <path {...s} d="M3 13 13 3M9 3h4v4M7 13H3V9" />}
      {name === "opacity" && (
        <>
          <circle {...s} cx="8" cy="8" r="5.2" />
          <path d="M8 2.8a5.2 5.2 0 0 0 0 10.4Z" fill="currentColor" />
        </>
      )}
      {name === "spacing" && <path {...s} d="M3 3v10M13 3v10M5.6 8h4.8M7 6.6 5.6 8 7 9.4M9 6.6 10.4 8 9 9.4" />}
      {name === "shadow" && (
        <>
          <path {...s} d="M3 3h7v7H3z" />
          <path {...s} d="M6 12.6h6.6V6" />
        </>
      )}
      {name === "margin" && (
        <>
          <path {...s} d="M2.6 2.6h10.8v10.8H2.6z" strokeDasharray="2 1.8" />
          <path {...s} d="M6 6h4v4H6z" />
        </>
      )}
      {name === "feather" && <path {...s} d="M13 3C7 3 3.6 6.4 3 13c6.6-.6 10-4 10-10ZM3 13l6-6" />}
      {name === "detect" && (
        <>
          <circle {...s} cx="8" cy="8" r="3" />
          <path {...s} d="M8 2v2.4M8 11.6V14M2 8h2.4M11.6 8H14" />
        </>
      )}
      {name === "back" && <path {...s} d="M7 3.2 2.4 8 7 12.8M3 8h10.5" />}
      {name === "eyedrop" && <path {...s} d="M12.4 3.6l-1.9 1.9M9.5 4.5l2.2 2.2M3 13l.6-2.6 5.7-5.7 2 2-5.7 5.7z" />}
      {name === "heal" && (
        <>
          <path {...s} d="M5.2 11.8 11.8 5.2a2.1 2.1 0 0 0-3-3L2.2 8.8a2.1 2.1 0 0 0 3 3Z" />
          <path {...s} strokeWidth={1.8} d="M7.1 7.1h.01M8.9 5.3h.01M5.3 8.9h.01" />
        </>
      )}
      {name === "grain" && (
        <>
          <circle cx="3.6" cy="4.2" r="0.8" fill="currentColor" />
          <circle cx="7" cy="3" r="0.6" fill="currentColor" />
          <circle cx="11.2" cy="4.6" r="0.8" fill="currentColor" />
          <circle cx="13" cy="8.2" r="0.6" fill="currentColor" />
          <circle cx="9" cy="7.2" r="0.9" fill="currentColor" />
          <circle cx="4.8" cy="8.6" r="0.7" fill="currentColor" />
          <circle cx="7.6" cy="11.6" r="0.8" fill="currentColor" />
          <circle cx="11.6" cy="12.2" r="0.6" fill="currentColor" />
          <circle cx="3.4" cy="12.6" r="0.6" fill="currentColor" />
        </>
      )}
      {name === "grainSize" && (
        <>
          <circle cx="4.6" cy="5" r="1.7" fill="currentColor" />
          <circle cx="11" cy="4.2" r="1.3" fill="currentColor" />
          <circle cx="8" cy="9.4" r="1.9" fill="currentColor" />
          <circle cx="12.6" cy="11.6" r="1.2" fill="currentColor" />
          <circle cx="3.8" cy="12" r="1.2" fill="currentColor" />
        </>
      )}
      {name === "denoise" && (
        <>
          <circle cx="4" cy="5" r="1" fill="currentColor" />
          <circle cx="8.5" cy="3.8" r="1" fill="currentColor" />
          <circle cx="12" cy="6.5" r="1" fill="currentColor" />
          <circle cx="5.5" cy="9.5" r="1" fill="currentColor" />
          <circle cx="10" cy="10.5" r="1" fill="currentColor" />
          <circle cx="7" cy="13" r="1" fill="currentColor" />
          <circle cx="12.5" cy="12.5" r="1" fill="currentColor" />
        </>
      )}
      {name === "chroma" && (
        <>
          <circle {...s} cx="8" cy="8" r="5.5" />
          <path {...s} d="M8 2.5v11M8 8h5.2M8 5.2h3.6" />
        </>
      )}
      {name === "style" && (
        <>
          <path {...s} d="M7.4 12.4c0 1.4-1.2 2-3.2 1.6.8-.9.6-1.7.8-2.6.3-1 1.3-1.5 2.3-1 .7.4.1 1.2.1 2z" />
          <path {...s} d="M7.4 9.8 13 4.2a1.3 1.3 0 0 0-1.8-1.8L5.6 8" />
        </>
      )}
      {name === "crop" && <path {...s} d="M5 2.4v8.2H13.2M2.4 5H11v8.6" />}
      {name === "stick" && (
        <>
          <circle {...s} cx="8" cy="8" r="5.8" />
          <circle cx="5.9" cy="6.6" r=".6" fill="currentColor" />
          <circle cx="10.1" cy="6.6" r=".6" fill="currentColor" />
          <path {...s} d="M5.2 9.4c.7 1.4 1.7 2 2.8 2s2.1-.6 2.8-2" />
        </>
      )}
      {name === "text" && <path {...s} d="M3.2 3.2h9.6M8 3.2v9.6M5.6 12.8h4.8" />}
      {name === "clone" && (
        <>
          <circle {...s} cx="6.2" cy="6.2" r="3.2" />
          <circle {...s} cx="10.2" cy="10.2" r="3.2" />
        </>
      )}
      {name === "paint" && <path {...s} d="M10.6 2.6 13.4 5.4M9.8 3.4 3.4 10.2c-.7.8-.2 1.8.7 2.1 1 .4 2-.2 2.4-1.2l6.2-6.6" />}
      {name === "brush" && <path {...s} d="M11 2.4c1.4 1.2 2.2 2 2.6 2.6-2.2 2.4-4.6 4.6-7.2 6.2-1 .6-2.2.2-2.6-.6-.4-.8 0-1.8.8-2.4C7.2 6.2 9.4 4 11 2.4z" />}
      {name === "wm" && (
        <>
          <path {...s} d="M2.6 2.6h10.8v10.8H2.6z" />
          <path {...s} d="M5.2 10.4 8 5.2l2.8 5.2M6.2 8.5h3.6" />
        </>
      )}
      {name === "ai" && <path {...s} d="M8 1.5v2.4M8 12.1v2.4M1.5 8h2.4M12.1 8h2.4M3.5 3.5l1.7 1.7M10.8 10.8l1.7 1.7M12.5 3.5l-1.7 1.7M5.2 10.8 3.5 12.5M8 6.2v3.6M6.2 8h3.6" />}
      {name === "blur" && (
        <>
          <circle {...s} cx="8" cy="8" r="1.5" />
          <circle {...s} cx="8" cy="8" r="3.3" />
          <circle {...s} cx="8" cy="8" r="5.2" />
        </>
      )}
      {name === "solid" && (
        <>
          <path {...s} d="M2.4 2.4h11.2v11.2H2.4z" />
          <circle {...s} cx="8" cy="6.2" r="1.15" />
          <path {...s} d="M5.6 11.4c.2-1.6 1-2.4 2.4-2.4s2.2.8 2.4 2.4" />
        </>
      )}
      {name === "replace" && (
        <>
          <path {...s} d="M2.4 3.4h7.2v9.2H2.4z" />
          <path {...s} d="M9.4 8h4M11.4 6.1 13.6 8 11.4 9.9" />
        </>
      )}
      {name === "upscale" && <path {...s} d="M8 5V2.4M6.4 3.8 8 2.4 9.6 3.8M8 11v2.6M6.4 12.2 8 13.6 9.6 12.2M5 8H2.4M3.8 6.4 2.4 8 3.8 9.6M11 8h2.6M12.2 6.4 13.6 8 12.2 9.6" />}
      {name === "pixel" && <path {...s} d="M2.6 2.6h4.2v4.2H2.6zM9.2 2.6h4.2v4.2H9.2zM2.6 9.2h4.2v4.2H2.6zM9.2 9.2h4.2v4.2H9.2z" />}
      {name === "color" && (
        <>
          <circle {...s} cx="8" cy="8" r="4.4" />
          <circle cx="8" cy="8" r="1.5" fill="currentColor" />
        </>
      )}
      {name === "pencil" && <path {...s} d="M10.2 2.6 13.4 5.8M9.6 3.2 3.2 11.8 2.6 13.4 4.2 12.8 12.8 3.8" />}
      {name === "eraser" && <path {...s} d="M2.8 13.2h7.2M6.2 11.4 9.6 6.2 12.8 9.2 9.2 13.2H6.4z" />}
      {name === "rotl" && <path {...s} strokeWidth={1.7} d="M12.5 8A4.5 4.5 0 1 0 8 12.5M6 10.5 8 12.5 6 14.5" />}
      {name === "rotr" && <path {...s} strokeWidth={1.7} d="M3.5 8A4.5 4.5 0 1 1 8 12.5M10 10.5 8 12.5 10 14.5" />}
      {name === "fliph" && <path {...s} strokeWidth={1.7} d="M8 2.6v10.8M6.2 5.2 2.6 8l3.6 2.8M9.8 5.2 13.4 8 9.8 10.8" />}
      {name === "flipv" && <path {...s} strokeWidth={1.7} d="M2.6 8h10.8M5.2 6.2 8 2.6l2.8 3.6M5.2 9.8 8 13.4l2.8-3.6" />}
      {name === "fith" && <path {...s} d="M2.2 8h11.6M4.4 5.6 1.8 8l2.6 2.4M11.6 5.6 14.2 8l-2.6 2.4" />}
      {name === "fitv" && <path {...s} d="M8 2.2v11.6M5.6 4.4 8 1.8l2.4 2.6M5.6 11.6 8 14.2l2.4-2.6" />}
      {name === "fitbox" && <path {...s} d="M2.4 6V2.4H6M10 2.4h3.6V6M13.6 10v3.6H10M6 13.6H2.4V10" />}
      {name === "brightness" && (
        <>
          <circle {...s} cx="8" cy="8" r="2.1" />
          <path {...s} d="M8 1.6v1.7M8 12.7v1.7M1.6 8h1.7M12.7 8h1.7M3.4 3.4l1.2 1.2M11.4 11.4l1.2 1.2M12.6 3.4 11.4 4.6M4.6 11.4 3.4 12.6" />
        </>
      )}
      {name === "hdr" && (
        <>
          <circle {...s} cx="8" cy="8" r="4.6" />
          <path {...s} d="M8 5.4v5.2M5.4 8h5.2" />
        </>
      )}
      {name === "contrast" && (
        <>
          <circle {...s} cx="8" cy="8" r="4.6" />
          <path {...s} d="M8 3.4v9.2" />
        </>
      )}
      {name === "highlights" && <path {...s} d="M3 12.4h10M4.2 12.4 8 4.2l3.8 8.2M8 1.8v1.4" />}
      {name === "shadows" && (
        <>
          <circle {...s} cx="8" cy="8" r="4.4" />
          <path {...s} d="M3.8 9.4c1 2 2.4 3.1 4.2 3.1s3.2-1.1 4.2-3.1" />
        </>
      )}
      {name === "white" && <circle {...s} cx="8" cy="8" r="4.2" />}
      {name === "black" && <circle cx="8" cy="8" r="3.4" fill="currentColor" />}
      {name === "vignette" && (
        <>
          <rect {...s} x="2.4" y="3.2" width="11.2" height="9.6" rx="1.4" />
          <circle {...s} cx="8" cy="8" r="2.1" />
        </>
      )}
      {name === "marco" && (
        <>
          <rect {...s} x="2.3" y="2.3" width="11.4" height="11.4" rx="1" />
          <rect {...s} x="5" y="5" width="6" height="6" />
        </>
      )}
      {name === "saturate" && (
        <>
          <circle {...s} cx="8" cy="8" r="4.5" />
          <path {...s} d="M8 5.2v5.6" />
        </>
      )}
      {name === "warmth" && (
        <>
          <path {...s} d="M8 2.2v6.4" />
          <circle {...s} cx="8" cy="11.2" r="2.15" />
        </>
      )}
      {name === "tint" && <path {...s} d="M8 2.4c2.2 2.6 3.5 4.2 3.5 6.1a3.5 3.5 0 0 1-7 0c0-1.9 1.3-3.5 3.5-6.1z" />}
      {name === "skin" && (
        <>
          <circle {...s} cx="8" cy="8" r="5" />
          <circle cx="6.2" cy="7.2" r="0.55" fill="currentColor" />
          <circle cx="9.8" cy="7.2" r="0.55" fill="currentColor" />
          <path {...s} d="M6.3 10c.6.8 1.2 1.1 1.7 1.1s1.1-.3 1.7-1.1" />
        </>
      )}
      {name === "blue" && (
        <>
          <circle {...s} cx="8" cy="8" r="4.6" />
          <path {...s} d="M4.2 8.8c.8-1.1 1.5-1.1 2.3 0s1.5 1.1 2.3 0 1.5-1.1 2.3 0" />
        </>
      )}
      {name === "detail" && <path {...s} d="M3.2 12.2 8 3.6l4.8 8.6M5.8 9.2h4.4" />}
      {name === "sharp" && (
        <>
          <circle {...s} cx="8" cy="8" r="2" />
          <path {...s} d="M8 2.2v2.3M8 11.5v2.3M2.2 8h2.3M11.5 8h2.3" />
        </>
      )}
    </svg>
  );
}

/** Vista previa en la paleta de un ícono del pack (mismos trazos que se dibujan sobre la foto). */
function LucideSticker({ icon }: { icon: string }) {
  const node = lucideNode(icon);
  if (!node) return null;
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {node.map(([tag, attrs], i) => {
        const Tag = tag as "path";
        return <Tag key={i} {...(attrs as object)} />;
      })}
    </svg>
  );
}

const STICK_SWATCHES = ["#ffffff", "#111111", "#ff3b30", "#ff9500", "#ffd60a", "#34c759", "#3ec4e0", "#0a84ff", "#af52de", "#ff4fa3"];

/** Fila de colores + selector libre. */
function StickSwatches(props: { label: string; value: string; onPick: (hex: string) => void }) {
  return (
    <div className="editor-swatches stick-swatches" aria-label={props.label}>
      <span className="stick-swatch-label">{props.label}</span>
      {STICK_SWATCHES.map((hex) => (
        <button
          key={hex}
          type="button"
          className={`editor-swatch ${props.value.toLowerCase() === hex ? "on" : ""}`}
          style={{ background: hex }}
          title={hex}
          aria-label={hex}
          onClick={() => props.onPick(hex)}
        />
      ))}
      <input type="color" className="stick-color-input" value={props.value} title="Otro color" aria-label="Otro color" onChange={(event) => props.onPick(event.target.value)} />
    </div>
  );
}

function IconPalette({
  items,
  label,
  onPick,
  isOn,
  prefix,
}: {
  items: readonly { readonly ch: string; readonly tip: string }[];
  label: string;
  onPick: (ch: string) => void;
  isOn?: (ch: string) => boolean;
  prefix: string;
}) {
  const [more, setMore] = useState(false);
  return (
    <Card
      title={label}
      action={
        <button type="button" className="editor-more" title={more ? "Mostrar una sola fila" : "Mostrar todos"} onClick={() => setMore((v) => !v)}>
          {more ? "menos ▴" : "más ▾"}
        </button>
      }
    >
      <div className={`editor-wm-icons ${more ? "more" : "fold"}`}>
        {items.map((icon) => (
          <button
            key={icon.ch}
            type="button"
            className={isOn?.(icon.ch) ? "on" : ""}
            title={`${prefix} ${icon.tip}`}
            onClick={() => onPick(icon.ch)}
          >
            {lucideNode(icon.ch) ? <LucideSticker icon={icon.ch} /> : icon.ch}
          </button>
        ))}
      </div>
    </Card>
  );
}

const OPT_ICONS: Record<string, Glyph> = {
  "Ángulo": "angle",
  Grosor: "thick",
  Dureza: "hard",
  Intensidad: "power",
  "Tamaño": "size",
  Opacidad: "opacity",
  "Separación": "spacing",
  Sombra: "shadow",
  Margen: "margin",
  Pluma: "feather",
  "Detección": "detect",
};

/** Todo grupo de controles va en una tarjeta con su título; es la única forma de agrupar en el panel. */
function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="editor-card">
      <div className="editor-card-head">
        <p className="editor-card-title">{title}</p>
        {action}
      </div>
      {children}
    </section>
  );
}

function SliderRow({
  icon,
  label,
  value,
  min,
  max,
  step = 1,
  def,
  fmt,
  hint,
  onChange,
}: {
  icon: Glyph;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  def?: number;
  fmt?: (n: number) => string;
  hint?: string;
  onChange: (n: number) => void;
}) {
  const dirty = def !== undefined && value !== def;
  const nudge = (d: number) => onChange(Math.max(min, Math.min(max, Math.round((value + d) * 1000) / 1000)));
  return (
    <div className="adj-row" title={hint}>
      <span className="adj-ico" title={hint ?? label}>
        <GlyphIcon name={icon} size={13} />
      </span>
      <span className="adj-lab" title={hint ?? label}>{label}</span>
      <button type="button" className="adj-nudge" disabled={value <= min} title={`${label} −`} onClick={() => nudge(-step)}>
        −
      </button>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
      <button type="button" className="adj-nudge" disabled={value >= max} title={`${label} +`} onClick={() => nudge(step)}>
        +
      </button>
      <button type="button" className="adj-val" disabled={!dirty} title={def !== undefined ? `${label}: volver a ${fmt ? fmt(def) : def}` : label} onClick={() => def !== undefined && onChange(def)}>
        {fmt ? fmt(value) : value}
      </button>
    </div>
  );
}

function OptRow({
  label,
  value,
  min,
  max,
  def,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  def?: number;
  hint?: string;
  onChange: (n: number) => void;
}) {
  return <SliderRow icon={OPT_ICONS[label] ?? "size"} label={label} value={value} min={min} max={max} def={def} hint={hint} onChange={onChange} />;
}

function AdjRow({
  icon,
  label,
  value,
  min = -100,
  def = 0,
  onChange,
}: {
  icon: keyof Adjust;
  label: string;
  value: number;
  min?: number;
  def?: number;
  onChange: (n: number) => void;
}) {
  return <SliderRow icon={icon} label={label} value={value} min={min} max={100} def={def} onChange={onChange} />;
}
