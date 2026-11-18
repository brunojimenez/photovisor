/** Fichas de estilo: con miniatura si hay (las pasa la app), si no, un botón de texto. */
export function StyleTiles(props: {
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
