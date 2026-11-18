import { ADJUST_ZERO, type Adjust, type NumKey } from "./editorAdjust";

export type Preset = {
  id: string;
  label: string;
  /** Dos colores para la muestra del botón. */
  swatch: [string, string];
  values: Partial<Adjust>;
};

/** Looks mínimos. Cada uno es un conjunto de ajustes; la intensidad los escala de 0 a 100 %. */
export const PRESETS: Preset[] = [
  { id: "vivid", label: "Vívido", swatch: ["#ff5f6d", "#ffc371"], values: { saturate: 35, contrast: 12, hdr: 8, detail: 10 } },
  { id: "warm", label: "Cálido", swatch: ["#f6a04d", "#f2d49b"], values: { warmth: 28, saturate: 8, brightness: 4, highlights: -10, tint: 4 } },
  { id: "cool", label: "Frío", swatch: ["#4a7cf0", "#9fd6e8"], values: { warmth: -26, saturate: 6, contrast: 6, blue: 10 } },
  {
    id: "cine",
    label: "Cine",
    swatch: ["#1f8a8a", "#e08a3c"],
    values: { contrast: 14, saturate: -6, warmth: 6, shadows: 10, vignette: 18, h_b: -60, s_c: 20, l_b: -10, s_o: 18 },
  },
  { id: "film", label: "Película", swatch: ["#c9a46a", "#5b6b73"], values: { black: -30, contrast: -6, saturate: -15, warmth: 10, tint: 4, vignette: 10, grain: 30 } },
  { id: "drama", label: "Dramático", swatch: ["#222222", "#d9534f"], values: { contrast: 30, shadows: -22, highlights: -12, saturate: 10, detail: 28, vignette: 28, black: 12 } },
  { id: "soft", label: "Suave", swatch: ["#f3d9e6", "#cfe3f5"], values: { brightness: 8, contrast: -14, highlights: -10, shadows: 18, detail: -12, saturate: -4 } },
  { id: "portrait", label: "Retrato", swatch: ["#f1b9a0", "#d98c78"], values: { skin: 14, warmth: 10, shadows: 8, detail: -10, saturate: -6, sharp: 8, vignette: 10 } },
  { id: "bw", label: "B/N", swatch: ["#111111", "#eeeeee"], values: { bw: 100, contrast: 12, detail: 12 } },
  { id: "bwhi", label: "B/N contraste", swatch: ["#000000", "#ffffff"], values: { bw: 100, contrast: 38, black: 14, shadows: -12, vignette: 22, bwFilter: 35 } },
  { id: "sepia", label: "Sepia", swatch: ["#6b4423", "#e6c79c"], values: { bw: 100, bwTone: 55, bwHue: 35, contrast: 6, black: -12 } },
];

/** El look escalado a `amount` (0–100). El matiz del virado no se escala: es un ángulo, no una cantidad. */
export function presetAdjust(preset: Preset, amount: number): Adjust {
  const k = Math.max(0, Math.min(100, amount)) / 100;
  const out: Adjust = { ...ADJUST_ZERO };
  for (const key of Object.keys(preset.values) as NumKey[]) {
    const value = preset.values[key] ?? 0;
    out[key] = key === "bwHue" ? value : Math.round(value * k);
  }
  return out;
}
