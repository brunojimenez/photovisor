import { type Watermark, WM_DEFAULT, wmFont } from "./editorMark";

export const WM_ICONS = [
  "★", "☆", "♥", "♡", "◆", "◇", "●", "○", "■", "□", "▲", "✦", "✓", "©", "™", "∞", "♪", "•",
  "△", "▼", "▽", "◀", "▶", "✧", "✔", "✗", "✘", "®", "♫", "♬", "◦", "✿", "❀", "❁",
  "✱", "✲", "✺", "☀", "☾", "☁", "☂", "⚡", "☺", "♠", "♣", "♦", "♔", "♕", "☎", "✈",
  "✂", "✉", "⚑", "➤", "➜", "→", "←", "↑", "↓", "↔", "⌂", "☮", "☯", "☠", "☘", "❖",
  "✪", "✯", "§", "¶", "†", "№", "°", "±", "×", "÷", "≈", "€", "£", "¥",
];
export const WM_TRACE = WM_ICONS.map((ch) => ({ ch, tip: ch }));
export const WM_PLACES = [
  ["tile", "Repetir", "Repetir en diagonal"],
  ["center", "Centro", "Un sello al centro"],
  ["tl", "↖", "Arriba a la izquierda"],
  ["tr", "↗", "Arriba a la derecha"],
  ["bl", "↙", "Abajo a la izquierda"],
  ["br", "↘", "Abajo a la derecha"],
] as const;

export function wmNum(v: unknown, fallback: number, lo: number, hi: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}

export function loadWm(): Watermark {
  try {
    const raw = localStorage.getItem("editor.wm");
    if (!raw) return WM_DEFAULT;
    const parsed = JSON.parse(raw) as Partial<Watermark>;
    return {
      on: false,
      mode: parsed.mode === "image" ? "image" : parsed.mode === "icon" ? "icon" : "text",
      icon: typeof parsed.icon === "string" ? parsed.icon.slice(0, 80) : undefined,
      text: typeof parsed.text === "string" ? parsed.text.slice(0, 80) : "",
      font: wmFont(typeof parsed.font === "string" ? parsed.font : ""),
      color: typeof parsed.color === "string" && /^#[0-9a-fA-F]{6}$/.test(parsed.color) ? parsed.color : WM_DEFAULT.color,
      look: parsed.look === "gradient" || parsed.look === "rainbow" ? parsed.look : "solid",
      color2: typeof parsed.color2 === "string" && /^#[0-9a-fA-F]{6}$/.test(parsed.color2) ? parsed.color2 : "#ff4fa3",
      palette: typeof parsed.palette === "string" ? parsed.palette : "rainbow",
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
