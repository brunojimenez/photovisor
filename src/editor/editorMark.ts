/** Marca de agua en canvas: texto con íconos, repetido en diagonal, o una imagen. */
import { drawLucide, lucideNode } from "./lucideStickers";

export type WmMode = "text" | "image";
export type WmPlace = "tile" | "center" | "tl" | "tr" | "bl" | "br";

export type Watermark = {
  on: boolean;
  mode: WmMode;
  text: string;
  font: string;
  color: string;
  opacity: number;
  angle: number;
  size: number;
  gap: number;
  shade: number;
  place: WmPlace;
};

export const WM_FONTS = [
  "Segoe UI",
  "Arial",
  "Verdana",
  "Tahoma",
  "Georgia",
  "Times New Roman",
  "Palatino Linotype",
  "Courier New",
  "Impact",
  "Segoe Script",
  "Arial Black",
  "Arial Narrow",
  "Bahnschrift",
  "Calibri",
  "Cambria",
  "Candara",
  "Consolas",
  "Constantia",
  "Corbel",
  "Lucida Console",
  "Lucida Sans Unicode",
  "Trebuchet MS",
  "Segoe Print",
  "Ink Free",
  "Comic Sans MS",
  "Brush Script MT",
  "Franklin Gothic Medium",
  "Gabriola",
  "Sitka Text",
  "Rockwell",
  "Century Gothic",
  "Gill Sans MT",
  "Bookman Old Style",
  "Garamond",
  "Book Antiqua",
  "Copperplate Gothic Bold",
  "Lucida Handwriting",
  "Mistral",
  "Papyrus",
  "Jokerman",
  "Stencil",
  "Bauhaus 93",
  "Broadway",
  "Showcard Gothic",
  "Algerian",
  "Berlin Sans FB",
  "Cooper Black",
  "Maiandra GD",
  "MV Boli",
  "Palace Script MT",
  "Vivaldi",
];

let fontCache: string[] | null = null;

/** Las fuentes de WM_FONTS que de verdad tiene este equipo (se prueba midiendo texto en un canvas). */
export function installedFonts(): string[] {
  if (fontCache) return fontCache;
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return (fontCache = WM_FONTS.slice(0, 10));
  const probe = "mmmmmmmmmmlli0Oq@#WwZz";
  const bases = ["monospace", "serif", "sans-serif"];
  const widths = bases.map((base) => {
    ctx.font = `72px ${base}`;
    return ctx.measureText(probe).width;
  });
  fontCache = WM_FONTS.filter(
    (font, i) =>
      i === 0 ||
      bases.some((base, j) => {
        ctx.font = `72px "${font}", ${base}`;
        return ctx.measureText(probe).width !== widths[j];
      }),
  );
  return fontCache;
}

export type Piece = {
  id: number;
  kind: "icon" | "text";
  x: number;
  y: number;
  size: number;
  icon: string;
  text: string;
  font: string;
  color: string;
  /** Solo íconos de trazo: liso, degradado (color → color2) o arcoíris. */
  look?: "solid" | "gradient" | "rainbow";
  color2?: string;
};

export type WmFrame = { x: number; y: number; w: number; h: number };

export const WM_DEFAULT: Watermark = {
  on: false,
  mode: "text",
  text: "",
  font: "Segoe UI",
  color: "#ffffff",
  opacity: 58,
  angle: -34,
  size: 28,
  gap: 52,
  shade: 12,
  place: "tile",
};

export function wmFont(name: string) {
  return WM_FONTS.includes(name) ? name : "Segoe UI";
}

function textFont(px: number, font = "Segoe UI") {
  return `600 ${Math.max(8, px)}px "${wmFont(font)}", sans-serif`;
}

/** Los emojis a color manchan el canvas y el navegador impide exportarlo. */
function plainGlyph(text: string) {
  return text.replace(/\uFE0F/g, "").replace(/\p{Extended_Pictographic}/gu, (ch) => `${ch}\uFE0E`);
}

export const WM_COLOR_ICONS = [
  { ch: "🔥", tip: "Fuego" },
  { ch: "❤️", tip: "Corazón" },
  { ch: "⭐", tip: "Estrella" },
  { ch: "✨", tip: "Brillos" },
  { ch: "💎", tip: "Gema" },
  { ch: "📸", tip: "Cámara" },
  { ch: "☀️", tip: "Sol" },
  { ch: "🌙", tip: "Luna" },
  { ch: "☁️", tip: "Nube" },
  { ch: "⚡", tip: "Rayo" },
  { ch: "🌸", tip: "Flor" },
  { ch: "🌿", tip: "Hoja" },
  { ch: "👑", tip: "Corona" },
  { ch: "✅", tip: "Visto" },
  { ch: "❌", tip: "Cruz" },
  { ch: "❗", tip: "Alerta" },
  { ch: "📍", tip: "Pin" },
  { ch: "🎵", tip: "Nota" },
  { ch: "🎈", tip: "Globo" },
  { ch: "🎁", tip: "Regalo" },
  { ch: "💬", tip: "Mensaje" },
  { ch: "😀", tip: "Sonrisa" },
  { ch: "🌈", tip: "Arcoíris" },
  { ch: "💡", tip: "Idea" },
  { ch: "💙", tip: "Corazón azul" },
  { ch: "💚", tip: "Corazón verde" },
  { ch: "💛", tip: "Corazón amarillo" },
  { ch: "💜", tip: "Corazón morado" },
  { ch: "🖤", tip: "Corazón negro" },
] as const;

const COLOR_KEYS: Record<string, string> = {
  "🔥": "fire", "❤": "heart", "⭐": "star", "✨": "spark", "💎": "gem", "📸": "camera",
  "☀": "sun", "🌙": "moon", "☁": "cloud", "⚡": "bolt", "🌸": "flower", "🌿": "leaf",
  "👑": "crown", "✅": "check", "❌": "cross", "❗": "alert", "📍": "pin", "🎵": "note",
  "🎈": "balloon", "🎁": "gift", "💬": "bubble", "😀": "smile", "🌈": "rainbow", "💡": "bulb",
  "💙": "heartBlue", "💚": "heartGreen", "💛": "heartYellow", "💜": "heartPurple", "🖤": "heartBlack",
};
const GRAPHEME_RE = new RegExp(Object.keys(COLOR_KEYS).map((k) => k + "\uFE0F?").join("|") + "|.", "gu");

function graphemes(text: string) {
  return text.match(GRAPHEME_RE) || [];
}

function colorKey(grapheme: string) {
  return COLOR_KEYS[grapheme.replace(/\uFE0F/g, "")] ?? "";
}

function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.42;
    const px = cx + Math.cos(a) * rad;
    const py = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function spark(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.quadraticCurveTo(cx, cy, cx + r, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy + r);
  ctx.quadraticCurveTo(cx, cy, cx - r, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy - r);
  ctx.fillStyle = color;
  ctx.fill();
}

const HEART_COLORS: Record<string, string> = {
  heartBlue: "#3b82f6",
  heartGreen: "#34c759",
  heartYellow: "#ffd23f",
  heartPurple: "#a855f7",
  heartBlack: "#2a2a2a",
};

function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function block(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, color: string) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = color;
  ctx.fill();
}

function poly(ctx: CanvasRenderingContext2D, pts: number[][], color: string) {
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function line(ctx: CanvasRenderingContext2D, pts: number[][], color: string, width: number) {
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

/** Íconos de color dibujados a mano: no usan la fuente emoji, así el PNG se puede exportar. */
function drawColorIcon(ctx: CanvasRenderingContext2D, key: string, x: number, y: number, size: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  ctx.shadowBlur /= size;
  ctx.shadowOffsetX /= size;
  ctx.shadowOffsetY /= size;
  if (key === "fire") {
    ctx.beginPath();
    ctx.moveTo(0.5, 0.06);
    ctx.bezierCurveTo(0.78, 0.34, 0.96, 0.46, 0.8, 0.76);
    ctx.bezierCurveTo(0.7, 0.98, 0.3, 0.98, 0.2, 0.76);
    ctx.bezierCurveTo(0.04, 0.46, 0.24, 0.32, 0.5, 0.06);
    ctx.fillStyle = "#ff6a1a";
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0.5, 0.4);
    ctx.bezierCurveTo(0.68, 0.56, 0.74, 0.72, 0.58, 0.9);
    ctx.bezierCurveTo(0.5, 0.99, 0.36, 0.9, 0.4, 0.72);
    ctx.bezierCurveTo(0.32, 0.6, 0.38, 0.5, 0.5, 0.4);
    ctx.fillStyle = "#ffd15a";
    ctx.fill();
  } else if (key.startsWith("heart")) {
    ctx.beginPath();
    ctx.moveTo(0.5, 0.86);
    ctx.bezierCurveTo(0.08, 0.58, 0.06, 0.28, 0.28, 0.18);
    ctx.bezierCurveTo(0.42, 0.12, 0.48, 0.28, 0.5, 0.36);
    ctx.bezierCurveTo(0.52, 0.28, 0.58, 0.12, 0.72, 0.18);
    ctx.bezierCurveTo(0.94, 0.28, 0.92, 0.58, 0.5, 0.86);
    ctx.fillStyle = HEART_COLORS[key] ?? "#e23b4a";
    ctx.fill();
  } else if (key === "star") {
    starPath(ctx, 0.5, 0.52, 0.46, "#f5c518");
  } else if (key === "spark") {
    spark(ctx, 0.36, 0.4, 0.26, "#ffe56a");
    spark(ctx, 0.74, 0.26, 0.14, "#fff4b0");
    spark(ctx, 0.7, 0.7, 0.11, "#fff6c8");
  } else if (key === "gem") {
    ctx.beginPath();
    ctx.moveTo(0.5, 0.08);
    ctx.lineTo(0.9, 0.34);
    ctx.lineTo(0.5, 0.94);
    ctx.lineTo(0.1, 0.34);
    ctx.closePath();
    ctx.fillStyle = "#3ec4e0";
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0.5, 0.08);
    ctx.lineTo(0.9, 0.34);
    ctx.lineTo(0.5, 0.4);
    ctx.lineTo(0.1, 0.34);
    ctx.closePath();
    ctx.fillStyle = "#d8fbff";
    ctx.fill();
  } else if (key === "camera") {
    ctx.fillStyle = "#2e2e2e";
    ctx.beginPath();
    ctx.roundRect(0.08, 0.3, 0.84, 0.56, 0.08);
    ctx.fill();
    ctx.fillStyle = "#4a4a4a";
    ctx.beginPath();
    ctx.roundRect(0.3, 0.16, 0.28, 0.16, 0.04);
    ctx.fill();
    ctx.fillStyle = "#7eb6e8";
    ctx.beginPath();
    ctx.arc(0.5, 0.58, 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f4f8ff";
    ctx.beginPath();
    ctx.arc(0.44, 0.52, 0.045, 0, Math.PI * 2);
    ctx.fill();
  } else if (key === "sun") {
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      line(ctx, [[0.5 + Math.cos(a) * 0.32, 0.5 + Math.sin(a) * 0.32], [0.5 + Math.cos(a) * 0.45, 0.5 + Math.sin(a) * 0.45]], "#ffb81c", 0.07);
    }
    disc(ctx, 0.5, 0.5, 0.22, "#ffb81c");
  } else if (key === "moon") {
    ctx.save();
    ctx.beginPath();
    ctx.arc(0.5, 0.5, 0.4, 0, Math.PI * 2);
    ctx.clip();
    ctx.beginPath();
    ctx.rect(0, 0, 1, 1);
    ctx.arc(0.66, 0.38, 0.32, 0, Math.PI * 2);
    ctx.fillStyle = "#f3d46b";
    ctx.fill("evenodd");
    ctx.restore();
  } else if (key === "cloud") {
    disc(ctx, 0.32, 0.58, 0.18, "#e8f1fb");
    disc(ctx, 0.52, 0.45, 0.22, "#e8f1fb");
    disc(ctx, 0.72, 0.58, 0.16, "#e8f1fb");
    block(ctx, 0.16, 0.58, 0.68, 0.2, 0.1, "#e8f1fb");
  } else if (key === "bolt") {
    poly(ctx, [[0.6, 0.04], [0.22, 0.56], [0.46, 0.56], [0.38, 0.96], [0.8, 0.4], [0.55, 0.4], [0.7, 0.04]], "#ffd21f");
  } else if (key === "flower") {
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      disc(ctx, 0.5 + Math.cos(a) * 0.23, 0.5 + Math.sin(a) * 0.23, 0.17, "#ff8fb8");
    }
    disc(ctx, 0.5, 0.5, 0.12, "#ffd24a");
  } else if (key === "leaf") {
    ctx.beginPath();
    ctx.moveTo(0.15, 0.85);
    ctx.bezierCurveTo(0.1, 0.3, 0.5, 0.08, 0.88, 0.12);
    ctx.bezierCurveTo(0.9, 0.55, 0.6, 0.9, 0.15, 0.85);
    ctx.fillStyle = "#3fb950";
    ctx.fill();
    line(ctx, [[0.15, 0.85], [0.7, 0.3]], "#1f7a35", 0.04);
  } else if (key === "crown") {
    poly(ctx, [[0.1, 0.78], [0.1, 0.32], [0.3, 0.52], [0.5, 0.2], [0.7, 0.52], [0.9, 0.32], [0.9, 0.78]], "#f5c518");
    block(ctx, 0.1, 0.8, 0.8, 0.1, 0.03, "#d9a50f");
  } else if (key === "check") {
    block(ctx, 0.1, 0.1, 0.8, 0.8, 0.18, "#2fb344");
    line(ctx, [[0.28, 0.52], [0.44, 0.68], [0.72, 0.34]], "#ffffff", 0.1);
  } else if (key === "cross") {
    block(ctx, 0.1, 0.1, 0.8, 0.8, 0.18, "#e5484d");
    line(ctx, [[0.32, 0.32], [0.68, 0.68]], "#ffffff", 0.1);
    line(ctx, [[0.68, 0.32], [0.32, 0.68]], "#ffffff", 0.1);
  } else if (key === "alert") {
    block(ctx, 0.36, 0.08, 0.28, 0.55, 0.12, "#e5484d");
    disc(ctx, 0.5, 0.82, 0.1, "#e5484d");
  } else if (key === "pin") {
    ctx.beginPath();
    ctx.moveTo(0.5, 0.95);
    ctx.bezierCurveTo(0.22, 0.62, 0.2, 0.5, 0.2, 0.36);
    ctx.bezierCurveTo(0.2, 0.18, 0.34, 0.08, 0.5, 0.08);
    ctx.bezierCurveTo(0.66, 0.08, 0.8, 0.18, 0.8, 0.36);
    ctx.bezierCurveTo(0.8, 0.5, 0.78, 0.62, 0.5, 0.95);
    ctx.fillStyle = "#e5484d";
    ctx.fill();
    disc(ctx, 0.5, 0.36, 0.1, "#ffffff");
  } else if (key === "note") {
    disc(ctx, 0.32, 0.78, 0.13, "#7c6cf0");
    block(ctx, 0.4, 0.2, 0.07, 0.6, 0.02, "#7c6cf0");
    poly(ctx, [[0.46, 0.2], [0.8, 0.3], [0.8, 0.46], [0.46, 0.36]], "#7c6cf0");
  } else if (key === "balloon") {
    ctx.beginPath();
    ctx.ellipse(0.5, 0.4, 0.26, 0.32, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#ff5a6e";
    ctx.fill();
    poly(ctx, [[0.5, 0.73], [0.44, 0.81], [0.56, 0.81]], "#ff5a6e");
    ctx.beginPath();
    ctx.moveTo(0.5, 0.81);
    ctx.quadraticCurveTo(0.6, 0.88, 0.5, 0.96);
    ctx.strokeStyle = "#b8b8b8";
    ctx.lineWidth = 0.02;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0.4, 0.28, 0.05, 0.09, -0.5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fill();
  } else if (key === "gift") {
    block(ctx, 0.14, 0.4, 0.72, 0.5, 0.04, "#e5484d");
    block(ctx, 0.1, 0.3, 0.8, 0.14, 0.03, "#ff6b6f");
    block(ctx, 0.45, 0.3, 0.1, 0.6, 0, "#ffd24a");
    disc(ctx, 0.38, 0.22, 0.1, "#ffd24a");
    disc(ctx, 0.62, 0.22, 0.1, "#ffd24a");
  } else if (key === "bubble") {
    block(ctx, 0.08, 0.14, 0.84, 0.56, 0.14, "#4aa8ff");
    poly(ctx, [[0.28, 0.66], [0.26, 0.9], [0.5, 0.68]], "#4aa8ff");
    disc(ctx, 0.3, 0.42, 0.055, "#ffffff");
    disc(ctx, 0.5, 0.42, 0.055, "#ffffff");
    disc(ctx, 0.7, 0.42, 0.055, "#ffffff");
  } else if (key === "smile") {
    disc(ctx, 0.5, 0.5, 0.44, "#ffd24a");
    disc(ctx, 0.36, 0.42, 0.05, "#5a3a00");
    disc(ctx, 0.64, 0.42, 0.05, "#5a3a00");
    ctx.beginPath();
    ctx.arc(0.5, 0.52, 0.24, Math.PI * 0.2, Math.PI * 0.8);
    ctx.strokeStyle = "#5a3a00";
    ctx.lineWidth = 0.05;
    ctx.lineCap = "round";
    ctx.stroke();
  } else if (key === "rainbow") {
    [[0.38, "#ff5a5a"], [0.29, "#ffd24a"], [0.2, "#4aa8ff"]].forEach(([r, color]) => {
      ctx.beginPath();
      ctx.arc(0.5, 0.78, r as number, Math.PI, Math.PI * 2);
      ctx.strokeStyle = color as string;
      ctx.lineWidth = 0.09;
      ctx.stroke();
    });
  } else if (key === "bulb") {
    disc(ctx, 0.5, 0.38, 0.28, "#ffd24a");
    block(ctx, 0.38, 0.62, 0.24, 0.14, 0.03, "#cfcfcf");
    block(ctx, 0.4, 0.78, 0.2, 0.1, 0.03, "#9a9a9a");
  }
  ctx.restore();
}

function markWidth(ctx: CanvasRenderingContext2D, text: string, px: number, font: string) {
  ctx.font = textFont(px, font);
  let width = 0;
  for (const piece of graphemes(text)) {
    width += colorKey(piece) ? px * 1.05 : ctx.measureText(plainGlyph(piece)).width;
  }
  return Math.max(px * 0.4, width);
}

function fillMark(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, font: string) {
  ctx.font = textFont(px, font);
  ctx.textBaseline = "alphabetic";
  const sample = ctx.measureText("Mg");
  const asc = sample.actualBoundingBoxAscent || px * 0.72;
  const desc = sample.actualBoundingBoxDescent || px * 0.05;
  const baseline = y + (asc - desc) / 2;
  const ink = ctx.fillStyle;
  let cursor = x;
  for (const piece of graphemes(text)) {
    const key = colorKey(piece);
    if (key) {
      drawColorIcon(ctx, key, cursor, baseline - asc, px * 0.92);
      cursor += px * 1.05;
      ctx.fillStyle = ink;
      continue;
    }
    const shown = plainGlyph(piece);
    ctx.fillText(shown, cursor, baseline);
    cursor += ctx.measureText(shown).width;
  }
}

export function watermarkIdle(wm: Watermark, image: HTMLImageElement | null) {
  if (!wm.on) return true;
  if (wm.mode === "image") return !image || !image.complete || image.naturalWidth < 1;
  return !wm.text.trim();
}

function fontPx(imgW: number, imgH: number, size: number) {
  const short = Math.max(1, Math.min(imgW, imgH));
  return Math.max(14, Math.round((short * Math.max(8, size)) / 100 * 0.22));
}

function stampSize(frame: WmFrame, image: HTMLImageElement, size: number) {
  const short = Math.max(1, Math.min(frame.w, frame.h));
  const base = short * (0.1 + (Math.max(8, size) / 100) * 0.42);
  const aspect = image.naturalWidth / Math.max(1, image.naturalHeight);
  const h = base;
  const w = base * aspect;
  return { w, h };
}

function placed(box: WmFrame, w: number, h: number, place: WmPlace) {
  const margin = Math.min(box.w, box.h) * 0.045;
  if (place === "tl") return { x: box.x + margin, y: box.y + margin };
  if (place === "tr") return { x: box.x + box.w - w - margin, y: box.y + margin };
  if (place === "bl") return { x: box.x + margin, y: box.y + box.h - h - margin };
  if (place === "br") return { x: box.x + box.w - w - margin, y: box.y + box.h - h - margin };
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2 };
}

export function drawWatermark(
  ctx: CanvasRenderingContext2D,
  imgW: number,
  imgH: number,
  wm: Watermark,
  image: HTMLImageElement | null,
  frame: WmFrame,
) {
  if (watermarkIdle(wm, image)) return;
  const opacity = Math.max(0.04, Math.min(0.92, wm.opacity / 100));
  const angle = (wm.angle * Math.PI) / 180;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, imgW, imgH);
  ctx.clip();
  ctx.globalAlpha = opacity;
  const place = wm.place === "tile" ? "tile" : wm.place;
  const box = frame.w > 8 && frame.h > 8 ? frame : { x: 0, y: 0, w: imgW, h: imgH };

  if (place !== "tile") {
    if (wm.mode === "text") {
      const px = fontPx(imgW, imgH, wm.size);
      const text = wm.text.trim();
      ctx.fillStyle = /^#[0-9a-fA-F]{6}$/.test(wm.color) ? wm.color : "#ffffff";
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      if (wm.shade > 0) {
        const shade = wm.shade / 100;
        ctx.shadowColor = `rgba(0,0,0,${0.2 + shade * 0.55})`;
        ctx.shadowBlur = px * shade * 0.28;
        ctx.shadowOffsetY = px * shade * 0.06;
      }
      const tw = markWidth(ctx, text, px, wm.font);
      const spot = placed(box, tw, px, place);
      ctx.translate(spot.x + tw / 2, spot.y + px / 2);
      ctx.rotate(angle);
      fillMark(ctx, text, -tw / 2, 0, px, wm.font);
    } else if (image) {
      const { w, h } = stampSize(box, image, wm.size);
      const spot = placed(box, w, h, place);
      ctx.translate(spot.x + w / 2, spot.y + h / 2);
      ctx.rotate(angle);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image, -w / 2, -h / 2, w, h);
    }
    ctx.restore();
    return;
  }

  const diag = Math.hypot(imgW, imgH) + 4;
  ctx.translate(imgW / 2, imgH / 2);
  ctx.rotate(angle);

  if (wm.mode === "text") {
    const px = fontPx(imgW, imgH, wm.size);
    const text = wm.text.trim();
    ctx.fillStyle = /^#[0-9a-fA-F]{6}$/.test(wm.color) ? wm.color : "#ffffff";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    if (wm.shade > 0) {
      const s = wm.shade / 100;
      ctx.shadowColor = `rgba(0,0,0,${0.2 + s * 0.55})`;
      ctx.shadowBlur = px * s * 0.28;
      ctx.shadowOffsetY = px * s * 0.06;
    }
    const tw = markWidth(ctx, text, px, wm.font);
    const extra = px * (0.45 + (wm.gap / 100) * 3.1);
    const gapX = tw + extra;
    const gapY = px + extra * 0.72;
    const span = diag * 2;
    let row = 0;
    let drawn = 0;
    for (let y = -span / 2; y < span / 2 && drawn < 900; y += gapY) {
      const ox = (row % 2) * (gapX * 0.5);
      for (let x = -span / 2 + ox; x < span / 2 && drawn < 900; x += gapX) {
        fillMark(ctx, text, x, y, px, wm.font);
        drawn++;
      }
      row++;
    }
  } else if (image) {
    const tile = stampSize({ x: 0, y: 0, w: Math.min(imgW, imgH), h: Math.min(imgW, imgH) }, image, wm.size * 0.72);
    const extra = Math.min(tile.w, tile.h) * (0.25 + (wm.gap / 100) * 2.4);
    const gapX = tile.w + extra;
    const gapY = tile.h + extra * 0.85;
    const span = diag * 2;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    let row = 0;
    let drawn = 0;
    for (let y = -span / 2; y < span / 2 && drawn < 900; y += gapY) {
      const ox = (row % 2) * (gapX * 0.5);
      for (let x = -span / 2 + ox; x < span / 2 && drawn < 900; x += gapX) {
        ctx.drawImage(image, x, y, tile.w, tile.h);
        drawn++;
      }
      row++;
    }
  }
  ctx.restore();
}

export const RAINBOW_STOPS = ["#ff3b30", "#ff9500", "#ffd60a", "#34c759", "#0a84ff", "#af52de"];

/** Tinta de un ícono: color liso, degradado o arcoíris en diagonal sobre su caja. */
function pieceInk(ctx: CanvasRenderingContext2D, piece: Piece, base: string) {
  return (x0: number, y0: number, x1: number, y1: number): string | CanvasGradient => {
    if (piece.look !== "gradient" && piece.look !== "rainbow") return base;
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    if (piece.look === "rainbow") RAINBOW_STOPS.forEach((c, i) => g.addColorStop(i / (RAINBOW_STOPS.length - 1), c));
    else {
      g.addColorStop(0, base);
      g.addColorStop(1, /^#[0-9a-fA-F]{6}$/.test(piece.color2 ?? "") ? (piece.color2 as string) : base);
    }
    return g;
  };
}

export function drawPieces(ctx: CanvasRenderingContext2D, pieces: Piece[], guideId = 0) {
  for (const piece of pieces) {
    ctx.save();
    const ink = /^#[0-9a-fA-F]{6}$/.test(piece.color) ? piece.color : "#ffffff";
    if (piece.kind === "text") {
      const shown = plainGlyph(piece.text);
      ctx.font = textFont(piece.size, piece.font);
      ctx.fillStyle = ink;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(shown, piece.x, piece.y);
      if (guideId === piece.id) {
        const w = Math.max(piece.size, ctx.measureText(shown).width);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = Math.max(1, piece.size * 0.04);
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(piece.x - w / 2 - 6, piece.y - piece.size * 0.65, w + 12, piece.size * 1.3);
      }
    } else {
      const key = colorKey(piece.icon);
      if (lucideNode(piece.icon)) drawLucide(ctx, piece.icon, piece.x, piece.y, piece.size, pieceInk(ctx, piece, ink));
      else if (key) drawColorIcon(ctx, key, piece.x - piece.size / 2, piece.y - piece.size / 2, piece.size);
      else {
        ctx.font = textFont(piece.size);
        ctx.fillStyle = pieceInk(ctx, piece, ink)(piece.x - piece.size / 2, piece.y - piece.size / 2, piece.x + piece.size / 2, piece.y + piece.size / 2);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(plainGlyph(piece.icon), piece.x, piece.y);
      }
      if (guideId === piece.id) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = Math.max(1, piece.size * 0.04);
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(piece.x - piece.size / 2 - 4, piece.y - piece.size / 2 - 4, piece.size + 8, piece.size + 8);
      }
    }
    ctx.restore();
  }
}
