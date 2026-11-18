import { ArrowLeft, Bandage, Brush, ClipboardCopy, Crop, Download, Eraser, Eye, FlipHorizontal2, FlipVertical2, type LucideIcon, Maximize, MoveHorizontal, MoveVertical, Paintbrush, Palette, Pencil, Pipette, Replace, RotateCcw, RotateCcwSquare, RotateCwSquare, Save, SaveAll, Scaling, SlidersHorizontal, Smile, Spline, Square, Stamp, Type, WandSparkles, Wrench } from "lucide-react";
import { type Adjust } from "./editorAdjust";

export type Glyph =
  | "tools"
  | "reset"
  | "adjust"
  | "curves"
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
export const LUCIDE: Partial<Record<Glyph, LucideIcon>> = {
  tools: Wrench, reset: RotateCcw, adjust: SlidersHorizontal, curves: Spline, crop: Crop, style: Palette, eyedrop: Pipette, heal: Bandage, back: ArrowLeft,
  save: Save, savecopy: SaveAll, clipboard: ClipboardCopy, download: Download, paint: Paintbrush, stick: Smile, text: Type, wm: Stamp,
  ai: WandSparkles, replace: Replace, upscale: Scaling, eraser: Eraser, brush: Brush, pencil: Pencil, rotl: RotateCcwSquare,
  rotr: RotateCwSquare, fliph: FlipHorizontal2, flipv: FlipVertical2, fith: MoveHorizontal, fitv: MoveVertical, fitbox: Maximize,
  eye: Eye, solid: Square,
};

export function GlyphIcon({ name, size = 16 }: { name: Glyph; size?: number }) {
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
