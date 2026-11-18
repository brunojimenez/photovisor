import { type NumKey } from "./editorAdjust";
import { type Glyph, GlyphIcon } from "./EditorGlyphs";

export const OPT_ICONS: Record<string, Glyph> = {
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
export function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
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

export function SliderRow({
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

export function OptRow({
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

export function AdjRow({
  icon,
  label,
  value,
  min = -100,
  def = 0,
  onChange,
}: {
  icon: NumKey;
  label: string;
  value: number;
  min?: number;
  def?: number;
  onChange: (n: number) => void;
}) {
  return <SliderRow icon={icon} label={label} value={value} min={min} max={100} def={def} onChange={onChange} />;
}
