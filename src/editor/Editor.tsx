import { useEffect, useRef, useState } from "react";
import { Aperture, Check, Eraser, Focus, OctagonX, Redo2, Rows3, Undo2, UserRound } from "lucide-react";
import { type Adjust, ADJUST_ZERO, adjustIdle, type Band, HSL_BANDS, type HslKey, type NumKey } from "./editorAdjust";
import { presetAdjust, PRESETS } from "./editorPresets";
import { lucideNode } from "./lucideStickers";
import { drawPieces, drawWatermark, installedFonts, onFluentReady, type Piece, type Watermark, watermarkIdle } from "./editorMark";
import { applyPaint, cloneCanvas, eraseOverlay, type PaintFx } from "./editorPaint";
import { createAdjustRunner, type AdjustRunner } from "./adjustClient";
import { CurveEditor } from "./CurveEditor";
import { autoLevels, histogramOf, LEVELS_ZERO, levelsIdle, toneLuts, type Curves, type Histogram, type Levels } from "./editorCurves";
import { ASYNC_MIN_PIXELS, clampCrop, clampZoom, drawMarco, type CropBox, fitRatio, type Handle, raster, workingSize } from "./editorGeometry";
import { loadWm } from "./editorWm";
import { drawFocusMask, focusEditApply, focusFinishShape, focusHitTest, focusPresetShape, focusScale as focusScaleFor, invertAlpha, type FocusShape } from "./editorFocus";
import { StyleTiles } from "./StyleTiles";
import { FLUENT_CHR } from "./StickerUi";
import { GlyphIcon } from "./EditorGlyphs";
import { IconBrowser, LookPicker } from "./StickerUi";
import { WatermarkDesigner } from "./WatermarkDesigner";
import { AdjRow, Card, OptRow, SliderRow } from "./EditorUi";

type Mark = "pencil" | "brush" | "eraser";
type Tool = "adjust" | "curves" | "crop" | "paint" | "stick" | "text" | "fill" | "wm";

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

const SLIDERS: { key: NumKey; label: string; min?: number; def?: number }[] = [
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

const GROUPS: { title: string; keys: NumKey[] }[] = [
  { title: "Claro", keys: ["brightness", "hdr", "contrast", "highlights", "shadows", "white", "black", "vignette", "marco"] },
  { title: "Color", keys: ["saturate", "warmth", "tint", "skin", "blue"] },
  { title: "Detalle", keys: ["detail", "sharp", "denoise", "chroma", "grain", "grainSize"] },
];

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
  const drag = useRef<{ handle: Handle; x0: number; y0: number; crop0: CropBox } | null>(null);
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
  const [histo, setHisto] = useState<Histogram | null>(null);
  // Ajustes en un Worker (fotos grandes): último resultado visible y pedido en curso
  const adjRunnerRef = useRef<AdjustRunner | null>(null);
  const adjPendingKey = useRef("");
  const lastBakedRef = useRef<HTMLCanvasElement | null>(null);
  // Foco: círculos que quedan nítidos; el efecto (difuminar, pixelar, color) va afuera (o adentro) con borde difuso
  const focusCircles = useRef<FocusShape[]>([]);
  const focusDrag = useRef<(FocusShape & { sx: number; sy: number }) | null>(null);
  const focusEdit = useRef<{ idx: number; mode: "move" | "resize"; axis: "x" | "y" | "both"; dx: number; dy: number } | null>(null);
  const focusElRef = useRef(false);
  const focusKeysRef = useRef<{ clear: () => void; apply: () => void }>({ clear() {}, apply() {} });
  const [focusEl, setFocusEl] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("editor.focus") || "{}").el === true;
    } catch {
      return false;
    }
  });
  const focusOnRef = useRef(false);
  const brushMaxRef = useRef(220);
  const focusSoftRef = useRef(45);
  const focusInsideRef = useRef(false);
  const [focusOn, setFocusOn] = useState(false);
  const savedFocus = (() => {
    try {
      return JSON.parse(localStorage.getItem("editor.focus") || "{}") as { soft?: number; inside?: boolean; el?: boolean };
    } catch {
      return {};
    }
  })();
  const [focusSoft, setFocusSoft] = useState(() => (typeof savedFocus.soft === "number" ? savedFocus.soft : 45));
  const [focusInside, setFocusInside] = useState(() => savedFocus.inside === true);
  const [focusN, setFocusN] = useState(0);
  const focusKRef = useRef(1);
  const [focusK, setFocusK] = useState(1);
  const [ready, setReady] = useState(false);
  const [adj, setAdj] = useState<Adjust>(ADJUST_ZERO);
  const [rot, setRot] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [crop, setCrop] = useState<CropBox>({ x: 0, y: 0, w: 1, h: 1 });
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
  const [stickPalette, setStickPalette] = useState("rainbow");
  const [noteLook, setNoteLook] = useState<"solid" | "gradient" | "rainbow">("solid");
  const [noteColor2, setNoteColor2] = useState("#ff4fa3");
  const [notePalette, setNotePalette] = useState("rainbow");
  const [pieceSize, setPieceSize] = useState(72);
  const [pieceRot, setPieceRot] = useState(0);
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
  focusElRef.current = focusEl;
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
    drawFocusMask(ctx, list, focusKRef.current, focusSoftRef.current / 100);
    stroking.current = list.length > 0;
    setPaintTick((n) => n + 1);
  }

  /** El foco usa radios proporcionales al tamaño de la foto: un difuminado de 30 px no se nota en una foto de 4000 px. */
  function focusScale(w: number, h: number) {
    return focusOnRef.current ? focusScaleFor(w, h) : 1;
  }

  /** Con el foco, el efecto va fuera de los círculos (la máscara se invierte) salvo que se pida adentro. */
  function focusMask(mk: ImageData) {
    if (focusInsideRef.current) return;
    invertAlpha(mk.data);
  }

  function clearFocus() {
    const had = focusCircles.current.length > 0 || focusDrag.current !== null;
    focusCircles.current = [];
    focusDrag.current = null;
    focusEdit.current = null;
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
    focusCircles.current.push(focusFinishShape(d, focusKRef.current, w, h));
    setFocusN(focusCircles.current.length);
    drawFocus();
  }

  /** Viñeta de efecto: el centro queda nítido y hacia los bordes se difumina/pixela. */
  function focusVignette() {
    const { w, h } = work();
    focusDrag.current = null;
    focusKRef.current = 1;
    setFocusK(1);
    const v = focusPresetShape("vignette", w, h);
    focusCircles.current = [v.shape];
    focusSoftRef.current = v.soft;
    setFocusSoft(v.soft);
    setFocusN(1);
    drawFocus();
  }

  /** Zona lista: retrato (elipse vertical al centro) o banda horizontal estilo miniatura (tilt-shift). */
  function focusPreset(kind: "portrait" | "band") {
    const { w, h } = work();
    focusDrag.current = null;
    focusKRef.current = 1;
    setFocusK(1);
    const pr = focusPresetShape(kind, w, h);
    focusCircles.current = [pr.shape];
    focusSoftRef.current = pr.soft;
    setFocusSoft(pr.soft);
    setFocusN(1);
    drawFocus();
  }

  function changeFocusSoft(v: number) {
    focusSoftRef.current = v;
    setFocusSoft(v);
    if (focusCircles.current.length) drawFocus();
  }

  function changeFocusEl(v: boolean) {
    focusElRef.current = v;
    setFocusEl(v);
  }

  /** Busca la forma bajo el puntero: el borde (redimensionar) o el interior (mover). Lo último dibujado gana. */
  function focusHit(p: { x: number; y: number }) {
    return focusHitTest(focusCircles.current, p, focusKRef.current, viewRef.current.scale);
  }

  function focusEditMove(p: { x: number; y: number }) {
    const ed = focusEdit.current;
    if (!ed) return;
    const c = focusCircles.current[ed.idx];
    if (!c) return;
    focusEditApply(c, ed.mode, ed.axis, p, focusKRef.current, { x: ed.dx, y: ed.dy });
    drawFocus();
  }

  function focusRemoveAt(p: { x: number; y: number }) {
    const hit = focusHit(p);
    if (!hit) return false;
    focusCircles.current.splice(hit.idx, 1);
    setFocusN(focusCircles.current.length);
    if (focusCircles.current.length === 0) clearFocus();
    else drawFocus();
    return true;
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

  focusKeysRef.current = { clear: clearFocus, apply: applyFocus };

  useEffect(() => {
    try {
      localStorage.setItem("editor.focus", JSON.stringify({ soft: focusSoft, inside: focusInside, el: focusEl }));
    } catch {
      /* sin almacenamiento */
    }
  }, [focusSoft, focusInside, focusEl]);

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

  function setAdjKey(key: NumKey, n: number) {
    setPresetId("");
    setAdj((a) => ({ ...a, [key]: n }));
  }

  /** Las curvas se guardan tal cual (también la diagonal) para no perder el punto que se está arrastrando. */
  function setCurves(next: Curves) {
    setPresetId("");
    setAdj((a) => ({ ...a, curves: next }));
  }

  function setLevels(patch: Partial<Levels>) {
    setPresetId("");
    setAdj((a) => ({ ...a, levels: { ...LEVELS_ZERO, ...a.levels, ...patch } }));
  }

  function autoLevelsNow() {
    if (!histo) return;
    setPresetId("");
    setAdj((a) => ({ ...a, levels: autoLevels(histo.l) }));
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

  useEffect(() => onFluentReady(() => setPaintTick((n) => n + 1)), []);

  /** Texto: un emoji o un carácter de trazo se escribe en la frase; un ícono de líneas se coloca desde la herramienta de íconos. */
  function pickNoteIcon(ch: string) {
    if (lucideNode(ch)) {
      setStickIcon(ch);
      setTool("stick");
      return;
    }
    const add = ch.startsWith("fe:") ? (FLUENT_CHR.get(ch) ?? "") : ch;
    const text = (noteText + add).slice(0, 80);
    setNoteText(text);
    if (!pieceFresh.current && pieces.some((p) => p.id === pieceId && p.kind === "text")) {
      snapPieces(`text${pieceId}`);
      setPieces((list) => list.map((p) => (p.id === pieceId && p.kind === "text" ? { ...p, text } : p)));
    }
  }

  function pickStickIcon(ch: string) {
    setStickIcon(ch);
    if (!pieceFresh.current && pieces.some((p) => p.id === pieceId && p.kind === "icon")) {
      snapPieces("");
      setPieces((list) => list.map((p) => (p.id === pieceId && p.kind === "icon" ? { ...p, icon: ch } : p)));
    }
  }

  /** Cambia color/estilo de los íconos: lo que se agregue de ahora en adelante y el ícono seleccionado. */
  function patchStick(patch: { color?: string; color2?: string; look?: "solid" | "gradient" | "rainbow"; palette?: string }) {
    if (patch.color !== undefined) setStickColor(patch.color);
    if (patch.color2 !== undefined) setStickColor2(patch.color2);
    if (patch.look !== undefined) setStickLook(patch.look);
    if (patch.palette !== undefined) setStickPalette(patch.palette);
    if (!pieceFresh.current && pieces.some((p) => p.id === pieceId && p.kind === "icon")) {
      snapPieces("");
      setPieces((list) => list.map((p) => (p.id === pieceId && p.kind === "icon" ? { ...p, ...patch } : p)));
    }
  }

  /** Cambia color y estilo del texto: lo que se agregue de ahora en adelante y el texto seleccionado. */
  function patchNote(patch: { color?: string; color2?: string; look?: "solid" | "gradient" | "rainbow"; palette?: string }) {
    if (patch.color !== undefined) setNoteColor(patch.color);
    if (patch.color2 !== undefined) setNoteColor2(patch.color2);
    if (patch.look !== undefined) setNoteLook(patch.look);
    if (patch.palette !== undefined) setNotePalette(patch.palette);
    if (!pieceFresh.current && pieces.some((p) => p.id === pieceId && p.kind === "text")) {
      snapPieces("");
      setPieces((list) => list.map((p) => (p.id === pieceId && p.kind === "text" ? { ...p, ...patch } : p)));
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
      rot: pieceRot,
      icon: stickIcon,
      text: noteText.trim().slice(0, 80),
      font: noteFont,
      color: kind === "icon" ? stickColor : noteColor,
      ...(kind === "icon" ? { look: stickLook, color2: stickColor2, palette: stickPalette } : { look: noteLook, color2: noteColor2, palette: notePalette }),
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
    const wantAdj = compareRef.current ? null : adjRef.current;
    const heavy = !!wantAdj && !adjustIdle(wantAdj) && dw * dh >= ASYNC_MIN_PIXELS;
    if (!bakedRef.current || bakedRef.current.dataset.key !== key) {
      if (heavy && wantAdj) {
        // Foto grande: el ajuste se calcula en un Worker. Mientras llega, se ve lo último calculado.
        if (adjPendingKey.current !== key) {
          adjPendingKey.current = key;
          const base = raster(img, rot, flipH, flipV, dw, dh, null, tilt);
          const bctx = base?.getContext("2d");
          if (base && bctx) {
            const pix = bctx.getImageData(0, 0, dw, dh);
            if (!adjRunnerRef.current) adjRunnerRef.current = createAdjustRunner();
            void adjRunnerRef.current.run(pix, wantAdj).then((out) => {
              if (!out || adjPendingKey.current !== key) return;
              bctx.putImageData(out, 0, 0);
              if (wantAdj.marco) drawMarco(bctx, dw, dh, wantAdj.marco);
              base.dataset.key = key;
              base.dataset.src = src;
              adjPendingKey.current = "";
              bakedRef.current = base;
              lastBakedRef.current = base;
              setPaintTick((n) => n + 1);
            });
          }
        }
        if (!bakedRef.current) {
          const last = lastBakedRef.current;
          const usable = last && last.width === dw && last.height === dh && last.dataset.src === src;
          bakedRef.current = usable ? last : raster(img, rot, flipH, flipV, dw, dh, null, tilt);
        }
      } else {
        adjPendingKey.current = "";
        const baked = raster(img, rot, flipH, flipV, dw, dh, wantAdj, tilt);
        if (!baked) return;
        baked.dataset.key = key;
        baked.dataset.src = src;
        bakedRef.current = baked;
        lastBakedRef.current = baked;
      }
    }
    if (!bakedRef.current) return;
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
        const rx0 = Math.max(2, c.rx * focusKRef.current) * k;
        const ry0 = Math.max(2, c.ry * focusKRef.current) * k;
        const ring = (f: number, color: string, width: number, dash: number[]) => {
          ctx.beginPath();
          ctx.ellipse(c.x * k, c.y * k, Math.max(1, rx0 * f), Math.max(1, ry0 * f), 0, 0, Math.PI * 2);
          ctx.setLineDash(dash);
          ctx.lineWidth = width;
          ctx.strokeStyle = color;
          ctx.stroke();
        };
        ring(1, "rgba(0,0,0,0.6)", 4, []);
        ring(1, "#ffffff", 1.75, [8, 6]);
        if (soft > 0.05) {
          ring(1 - soft, "rgba(0,0,0,0.45)", 3, []);
          ring(1 - soft, "#8ab4f8", 1.25, [3, 4]);
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

  useEffect(() => () => adjRunnerRef.current?.dispose(), []);

  // Histograma de la foto sin ajustes (miniatura de 256 px): fondo de las curvas y base de los niveles automáticos
  useEffect(() => {
    if (!ready || (tool !== "adjust" && tool !== "curves")) return;
    const im = imgRef.current;
    if (!im) return;
    const { w: W, h: H } = workingSize(im.naturalWidth, im.naturalHeight, rot);
    const k = 256 / Math.max(W, H, 1);
    const c = raster(im, rot, flipH, flipV, Math.max(1, Math.round(W * k)), Math.max(1, Math.round(H * k)), null, tilt);
    const d = c?.getContext("2d")?.getImageData(0, 0, c.width, c.height);
    if (d) setHisto(histogramOf(d.data));
  }, [ready, tool, rot, flipH, flipV, tilt]);

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
        if (focusCircles.current.length > 0 && !typing(e)) {
          focusKeysRef.current.clear();
          return;
        }
        if (list?.length) {
          onDismissChoices?.();
          return;
        }
        if (!busy) onCancel();
      }
      if (typing(e)) return;
      if (toolRef.current === "paint" && focusCircles.current.length > 0) {
        if (e.key === "Enter") {
          e.preventDefault();
          focusKeysRef.current.apply();
          return;
        }
        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          focusCircles.current.pop();
          setFocusN(focusCircles.current.length);
          if (focusCircles.current.length === 0) focusKeysRef.current.clear();
          else drawFocus();
          return;
        }
      }
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
        const hit = e.shiftKey ? null : focusHit(p);
        if (hit) {
          const c = focusCircles.current[hit.idx];
          focusEdit.current = { ...hit, dx: p.x - c.x, dy: p.y - c.y };
          return;
        }
        focusDrag.current = { x: p.x, y: p.y, rx: 0, ry: 0, el: focusElRef.current, sx: p.x, sy: p.y };
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
    if (!(e.buttons & 1)) {
      const st = e.currentTarget.style;
      if (toolRef.current === "paint" && focusOnRef.current) {
        const hit = focusHit(toImage(e.clientX, e.clientY, e.currentTarget));
        st.cursor = !hit ? "" : hit.mode === "move" ? "move" : hit.axis === "x" ? "ew-resize" : hit.axis === "y" ? "ns-resize" : "nwse-resize";
      } else if (st.cursor) {
        st.cursor = "";
      }
    }
    if (toolRef.current === "paint" && (e.buttons & 1) && focusEdit.current) {
      focusEditMove(toImage(e.clientX, e.clientY, e.currentTarget));
      return;
    }
    if (toolRef.current === "paint" && (e.buttons & 1) && focusDrag.current) {
      const p = toImage(e.clientX, e.clientY, e.currentTarget);
      const d = focusDrag.current;
      const K = focusKRef.current;
      if (d.el) {
        d.x = (d.sx + p.x) / 2;
        d.y = (d.sy + p.y) / 2;
        d.rx = Math.abs(p.x - d.sx) / 2 / K;
        d.ry = Math.abs(p.y - d.sy) / 2 / K;
      } else {
        d.rx = d.ry = Math.hypot(p.x - d.x, p.y - d.y) / K;
      }
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
    if (focusEdit.current) focusEdit.current = null;
    else if (focusDrag.current) finishCircle();
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

  function blitPieces(ctx: CanvasRenderingContext2D, destW: number, destH: number, view: CropBox, guide = false) {
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

  function blitMark(ctx: CanvasRenderingContext2D, destW: number, destH: number, view: CropBox) {
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
          onContextMenu={(e) => {
            if (tool === "paint" && focusOnRef.current) {
              e.preventDefault();
              focusRemoveAt(toImage(e.clientX, e.clientY, e.currentTarget));
            }
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
                  <OctagonX size={15} aria-hidden />
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
              <button type="button" className={`btn-ghost ${tool === "curves" ? "on" : ""}`} title="Curvas y niveles" aria-label="Curvas" onClick={() => setTool("curves")}>
                <GlyphIcon name="curves" size={20} />
                {toneLuts(adj.curves, adj.levels) !== null && <i className="tab-dot" aria-label="con cambios" />}
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
                <p className="hint">
                  Viñeta y marco: izquierda blanco, centro nada, derecha negro. Rueda: zoom.
                </p>
              </>
            ) : tool === "curves" ? (
              <>
                <Card
                  title="Curvas"
                  action={
                    adj.curves ? (
                      <button type="button" className="editor-eyedrop" title="Volver las curvas a la diagonal" onClick={() => setCurves({})}>
                        Restablecer
                      </button>
                    ) : undefined
                  }
                >
                  <CurveEditor curves={adj.curves} histogram={histo} onChange={setCurves} />
                </Card>
                <Card
                  title="Niveles"
                  action={
                    <>
                      <button type="button" className="editor-eyedrop" disabled={!histo} title="Ajusta negro y blanco a los extremos reales de la foto" onClick={autoLevelsNow}>
                        Auto
                      </button>
                      {!levelsIdle(adj.levels) && (
                        <button type="button" className="editor-eyedrop" title="Volver los niveles a su valor original" onClick={() => setLevels({ ...LEVELS_ZERO })}>
                          Restablecer
                        </button>
                      )}
                    </>
                  }
                >
                  <SliderRow icon="black" label="Negro" value={adj.levels?.inBlack ?? 0} min={0} max={254} def={0} hint="Todo lo que esté bajo este valor queda negro puro" onChange={(n) => setLevels({ inBlack: n, inWhite: Math.max(n + 1, adj.levels?.inWhite ?? 255) })} />
                  <SliderRow icon="brightness" label="Medios" value={Math.round((adj.levels?.gamma ?? 1) * 100)} min={10} max={300} def={100} fmt={(n) => (n / 100).toFixed(2)} hint="Más de 1 aclara los medios tonos; menos de 1 los oscurece" onChange={(n) => setLevels({ gamma: n / 100 })} />
                  <SliderRow icon="white" label="Blanco" value={adj.levels?.inWhite ?? 255} min={1} max={255} def={255} hint="Todo lo que esté sobre este valor queda blanco puro" onChange={(n) => setLevels({ inWhite: n, inBlack: Math.min(n - 1, adj.levels?.inBlack ?? 0) })} />
                  <SliderRow icon="black" label="Salida negro" value={adj.levels?.outBlack ?? 0} min={0} max={255} def={0} hint="Sube el negro: da un look lavado, tipo película" onChange={(n) => setLevels({ outBlack: n })} />
                  <SliderRow icon="white" label="Salida blanco" value={adj.levels?.outWhite ?? 255} min={0} max={255} def={255} hint="Baja el blanco: evita blancos quemados" onChange={(n) => setLevels({ outWhite: n })} />
                </Card>
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
                        <small>{focusOn ? (focusEl ? "Arrastrá de una esquina a la opuesta" : "Arrastrá desde el centro hacia afuera") : "Zonas nítidas, efecto en el resto"}</small>
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
                        <div className="editor-seg" role="group" aria-label="Forma de la zona">
                          <button type="button" className={!focusEl ? "on" : ""} onClick={() => changeFocusEl(false)} title="Se arrastra desde el centro hacia afuera">
                            Círculo
                          </button>
                          <button type="button" className={focusEl ? "on" : ""} onClick={() => changeFocusEl(true)} title="Se arrastra de una esquina a la opuesta">
                            Elipse
                          </button>
                        </div>
                        <OptRow label="Tamaño" value={Math.round(focusK * 100)} min={20} max={300} def={100} onChange={changeFocusK} hint="Agranda o achica todos los círculos marcados, antes de aplicar" />
                        <OptRow label="Borde suave" value={focusSoft} min={0} max={100} def={45} onChange={changeFocusSoft} hint="Qué tan gradual es la transición entre la zona nítida y el efecto" />
                        <p className="hint">Arrastrá una zona para moverla, su borde para cambiarle el tamaño, clic derecho para quitarla. Shift+arrastrar crea una nueva encima. Línea blanca: borde; azul: inicio de la transición.</p>
                        <div className="focus-actions">
                          <button type="button" className="btn-ghost" onClick={focusVignette} title="Centro nítido y bordes con el efecto">
                            <Aperture size={15} aria-hidden />
                            Viñeta
                          </button>
                          <button type="button" className="btn-ghost" onClick={() => focusPreset("portrait")} title="Elipse vertical al centro: la persona nítida y el fondo con el efecto">
                            <UserRound size={15} aria-hidden />
                            Retrato
                          </button>
                          <button type="button" className="btn-ghost" onClick={() => focusPreset("band")} title="Banda horizontal nítida, arriba y abajo con el efecto (efecto miniatura)">
                            <Rows3 size={15} aria-hidden />
                            Miniatura
                          </button>
                          <button type="button" className="btn-ghost" disabled={focusN === 0} onClick={clearFocus} title="Quitar todas las zonas (Esc)">
                            <Eraser size={15} aria-hidden />
                            Limpiar
                          </button>
                          <button type="button" className="btn-send focus-apply" disabled={focusN === 0} onClick={applyFocus} title="Aplicar (Enter)">
                            <Check size={15} aria-hidden />
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
                    <Undo2 size={15} aria-hidden />
                    Deshacer
                  </button>
                  <button type="button" className="btn-ghost" disabled={!canRedo || busy} onClick={redoPaint}>
                    <Redo2 size={15} aria-hidden />
                    Rehacer
                  </button>
                </div>
                <p className="hint">
                  El trazo no se graba solo. Deshacer (Ctrl+Z) saca el último. Espacio = original. Guardar fija los cambios.
                </p>
              </>
            ) : tool === "stick" ? (
              <>
                <IconBrowser isOn={(ch) => stickIcon === ch} onPick={pickStickIcon} ink={{ look: stickLook, c1: stickColor, c2: stickColor2, palette: stickPalette }} />
                <Card title="Color y estilo">
                  <LookPicker look={stickLook} color={stickColor} color2={stickColor2} palette={stickPalette} onChange={patchStick} />
                  {stickIcon.startsWith("fe:") && <p className="hint">Los emojis ya traen sus colores; esto vale para los íconos de trazo y del pack.</p>}
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
                <OptRow
                  label="Giro"
                  value={pieces.find((p) => p.id === pieceId)?.rot ?? pieceRot}
                  min={-180}
                  max={180}
                  def={0}
                  onChange={(n) => {
                    setPieceRot(n);
                    if (pieces.some((p) => p.id === pieceId)) {
                      snapPieces(`rot${pieceId}`);
                      setPieces((list) => list.map((p) => (p.id === pieceId ? { ...p, rot: n } : p)));
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
                    <Undo2 size={15} aria-hidden />
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
<IconBrowser
                  isOn={() => false}
                  onPick={pickNoteIcon}
                  ink={{ look: noteLook, c1: noteColor, c2: noteColor2, palette: notePalette }}
                />
<Card title="Color y estilo">
                  <LookPicker look={noteLook} color={noteColor} color2={noteColor2} palette={notePalette} onChange={patchNote} />
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
                <OptRow
                  label="Giro"
                  value={pieces.find((p) => p.id === pieceId)?.rot ?? pieceRot}
                  min={-180}
                  max={180}
                  def={0}
                  onChange={(n) => {
                    setPieceRot(n);
                    if (pieces.some((p) => p.id === pieceId)) {
                      snapPieces(`rot${pieceId}`);
                      setPieces((list) => list.map((p) => (p.id === pieceId ? { ...p, rot: n } : p)));
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
                    <Undo2 size={15} aria-hidden />
                    Deshacer
                  </button>
                </div>
                <p className="hint">Escribí y hacé clic en la foto. No se repite: es un texto suelto, no la marca.</p>
              </>
            ) : tool === "wm" ? (
              <>
                <WatermarkDesigner wm={wm} setWm={setWm} fileName={wmFileName} onPickImage={pickWmImage} />
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
                        <Eraser size={15} aria-hidden />
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
                        <Eraser size={15} aria-hidden />
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
                      pueden cambiar un poco. 
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




