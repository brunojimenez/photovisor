import { useEffect, useId, useState } from "react";
import { LUCIDE_STICKERS, lucideNode } from "./lucideStickers";
import { FLUENT_CATS } from "./fluentList";
import { fluentSvgUrl, PALETTES, paletteStops } from "./editorMark";
import { WM_TRACE } from "./editorWm";
import { Card } from "./EditorUi";

export type StickInk = { look: "solid" | "gradient" | "rainbow"; c1: string; c2: string; palette?: string };

/** Paradas de color del estilo elegido (liso = una sola, degradado = dos, arcoíris = seis). */
export function inkStops(ink: StickInk): string[] {
  if (ink.look === "rainbow") return [...paletteStops(ink.palette)];
  if (ink.look === "gradient") return [ink.c1, ink.c2];
  return [ink.c1];
}

/** Fondo CSS que representa el estilo (para puntos de muestra y para texto con degradado). */
export function inkCss(ink: StickInk): string {
  const stops = inkStops(ink);
  return stops.length === 1 ? stops[0] : `linear-gradient(135deg, ${stops.join(", ")})`;
}

/** Vista previa en la paleta de un ícono del pack (mismos trazos que se dibujan sobre la foto). */
export function LucideSticker({ icon, ink }: { icon: string; ink?: StickInk }) {
  const node = lucideNode(icon);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (!node) return null;
  const stops = ink ? inkStops(ink) : [];
  const stroke = ink ? (stops.length === 1 ? stops[0] : `url(#lg${uid})`) : "currentColor";
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ink && stops.length > 1 && (
        <defs>
          <linearGradient id={`lg${uid}`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="24" y2="24">
            {stops.map((c, i) => (
              <stop key={i} offset={i / (stops.length - 1)} stopColor={c} />
            ))}
          </linearGradient>
        </defs>
      )}
      {node.map(([tag, attrs], i) => {
        const Tag = tag as "path";
        return <Tag key={i} {...(attrs as object)} />;
      })}
    </svg>
  );
}

export const STICK_SWATCHES = ["#ffffff", "#111111", "#ff3b30", "#ff9500", "#ffd60a", "#34c759", "#3ec4e0", "#0a84ff", "#af52de", "#ff4fa3"];

/** Fila de colores + selector libre. */
export function StickSwatches(props: { label: string; value: string; onPick: (hex: string) => void }) {
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

export type LookId = "solid" | "gradient" | "rainbow";

/** Selector de color y estilo: liso, degradado o multicolor (con sus paletas). Lo usan íconos, texto y marca de agua. */
export function LookPicker(props: {
  look: LookId;
  color: string;
  color2: string;
  palette: string;
  onChange: (patch: { look?: LookId; color?: string; color2?: string; palette?: string }) => void;
}) {
  const { look, color, color2, palette, onChange } = props;
  return (
    <>
      <div className="editor-seg" role="group" aria-label="Estilo del color">
        {([["solid", "Liso"], ["gradient", "Degradado"], ["rainbow", "Arcoíris"]] as const).map(([id, name]) => (
          <button key={id} type="button" className={look === id ? "on" : ""} title={name} onClick={() => onChange({ look: id })}>
            <i className="look-dot" style={{ background: inkCss({ look: id, c1: color, c2: color2, palette }) }} />
            {name}
          </button>
        ))}
      </div>
      {look === "rainbow" && (
        <div className="palette-row" role="group" aria-label="Degradado multicolor">
          {PALETTES.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`palette-chip ${palette === p.id ? "on" : ""}`}
              style={{ background: `linear-gradient(90deg, ${p.stops.join(", ")})` }}
              title={p.name}
              aria-label={p.name}
              onClick={() => onChange({ palette: p.id })}
            />
          ))}
        </div>
      )}
      {look !== "rainbow" && <StickSwatches label={look === "gradient" ? "Desde" : "Color"} value={color} onPick={(hex) => onChange({ color: hex })} />}
      {look === "gradient" && <StickSwatches label="Hasta" value={color2} onPick={(hex) => onChange({ color2: hex })} />}
    </>
  );
}

export const plain = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Emojis a color (Fluent Emoji Flat, Microsoft, MIT): por categoría o con buscador. Los SVG se cargan bajo demanda. */
export function FluentBody(props: { isOn: (id: string) => boolean; onPick: (id: string) => void }) {
  const [bodies, setBodies] = useState<Record<string, string> | null>(null);
  const [cat, setCat] = useState(0);
  const [query, setQuery] = useState("");
  useEffect(() => {
    let live = true;
    void import("./fluentSvgs").then((m) => live && setBodies(m.FLUENT_BODIES));
    return () => {
      live = false;
    };
  }, []);
  const q = plain(query.trim());
  const items = q ? FLUENT_CATS.flatMap((c) => c.items).filter((i) => plain(i.tip).includes(q)) : FLUENT_CATS[cat].items;
  return (
    <>
      <input className="editor-wm-text" value={query} placeholder="Buscar: corazón, gato, fiesta…" onChange={(e) => setQuery(e.target.value)} />
      {!q && (
        <div className="fe-cats" role="group" aria-label="Categorías">
          {FLUENT_CATS.map((c, i) => (
            <button key={c.name} type="button" className={i === cat ? "on" : ""} onClick={() => setCat(i)}>
              {c.name}
            </button>
          ))}
        </div>
      )}
      <div className="editor-wm-icons more fe-grid">
        {items.length === 0 && <p className="hint">Sin resultados.</p>}
        {items.map((i) => (
          <button key={i.id} type="button" className={props.isOn(i.id) ? "on" : ""} title={`Usar ${i.tip}`} onClick={() => props.onPick(i.id)}>
            {bodies && bodies[i.id.slice(3)] ? <img src={fluentSvgUrl(bodies[i.id.slice(3)], 48)} width={24} height={24} alt={i.tip} draggable={false} /> : null}
          </button>
        ))}
      </div>
    </>
  );
}

/** Una celda de las paletas de íconos: ícono del pack, texto de trazo o, con `ink`, la vista previa del color y estilo elegidos. */
export function IconCell(props: { icon: { ch: string; tip: string }; ink?: StickInk; on: boolean; prefix: string; onPick: (ch: string) => void }) {
  const { icon, ink } = props;
  return (
    <button type="button" className={props.on ? "on" : ""} title={`${props.prefix} ${icon.tip}`} onClick={() => props.onPick(icon.ch)}>
      {lucideNode(icon.ch) ? (
        <LucideSticker icon={icon.ch} ink={ink} />
      ) : ink ? (
        <span
          className="ink-glyph"
          style={
            inkStops(ink).length === 1
              ? { color: ink.c1 }
              : { backgroundImage: inkCss(ink), WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }
          }
        >
          {icon.ch}
        </span>
      ) : (
        icon.ch
      )}
    </button>
  );
}

/** Una sola tarjeta de íconos con tres subconjuntos: emojis a color, íconos de trazo y el pack de líneas. */
export function IconBrowser(props: { isOn: (ch: string) => boolean; onPick: (ch: string) => void; ink: StickInk }) {
  const [tab, setTab] = useState<"emoji" | "trazo" | "pack">("emoji");
  return (
    <Card title="Íconos">
      <div className="editor-seg" role="group" aria-label="Tipo de ícono">
        {([["emoji", "Emojis"], ["trazo", "Trazo"], ["pack", "Líneas"]] as const).map(([id, name]) => (
          <button key={id} type="button" className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
            {name}
          </button>
        ))}
      </div>
      {tab === "emoji" ? (
        <FluentBody isOn={props.isOn} onPick={props.onPick} />
      ) : (
        <div className="editor-wm-icons more fe-grid">
          {(tab === "trazo" ? WM_TRACE : LUCIDE_STICKERS).map((icon) => (
            <IconCell key={icon.ch} icon={icon} ink={props.ink} on={props.isOn(icon.ch)} prefix="Usar" onPick={props.onPick} />
          ))}
        </div>
      )}
    </Card>
  );
}

/** Emoji del pack -> el carácter Unicode que se escribe en una frase. */
export const FLUENT_CHR = new Map(FLUENT_CATS.flatMap((c) => c.items.map((i) => [i.id, i.chr] as const)));
