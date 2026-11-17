import type { Meta } from "./api";

export const LABELS = [
  { id: "rojo", name: "Rojo", color: "#e5484d", key: "6" },
  { id: "amarillo", name: "Amarillo", color: "#f2d13a", key: "7" },
  { id: "verde", name: "Verde", color: "#4fbf67", key: "8" },
  { id: "azul", name: "Azul", color: "#4a7cf0", key: "9" },
] as const;

export function labelColor(id: string) {
  return LABELS.find((label) => label.id === id)?.color;
}

function StarGlyph(props: { on: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M8 1.8 9.9 5.9l4.4.5-3.3 3 .9 4.4L8 11.6l-3.9 2.2.9-4.4-3.3-3 4.4-.5z"
        fill={props.on ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Estrellas (1-5) y etiqueta de color. Pulsar la estrella actual, o la etiqueta actual, la quita. */
export function RatingBar(props: { meta?: Meta; onRate: (rating: number) => void; onLabel: (label: string) => void }) {
  const rating = props.meta?.rating ?? 0;
  const label = props.meta?.label ?? "";
  return (
    <div className="rating-bar" role="group" aria-label="Valoración y etiqueta">
      <div className="stars">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={n <= rating ? "on" : ""}
            title={`${n} ${n === 1 ? "estrella" : "estrellas"} (tecla ${n}). 0 las quita`}
            aria-label={`${n} ${n === 1 ? "estrella" : "estrellas"}`}
            onClick={() => props.onRate(n === rating ? 0 : n)}
          >
            <StarGlyph on={n <= rating} />
          </button>
        ))}
      </div>
      <div className="labels">
        {LABELS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={label === item.id ? "on" : ""}
            style={{ background: item.color }}
            title={`${item.name} (tecla ${item.key})`}
            aria-label={item.name}
            onClick={() => props.onLabel(label === item.id ? "" : item.id)}
          />
        ))}
      </div>
    </div>
  );
}

/** Marca pequeña sobre la miniatura: etiqueta y estrellas. */
export function Badge(props: { meta?: Meta }) {
  const rating = props.meta?.rating ?? 0;
  const color = labelColor(props.meta?.label ?? "");
  if (!rating && !color) return null;
  return (
    <span className="badge" aria-hidden="true">
      {color && <i style={{ background: color }} />}
      {rating > 0 && <span>{"★".repeat(rating)}</span>}
    </span>
  );
}
