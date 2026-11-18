import { useEffect, useRef, useState } from "react";
import { Ellipsis, Monitor } from "lucide-react";
import { COMPUTER } from "./api";

type Crumb = { label: string; path: string };

const BS = String.fromCharCode(92);

/** C:UsersyoFotos → [Este equipo] > C: > Users > yo > Fotos, cada tramo con su ruta completa. */
function crumbsOf(path: string | null): Crumb[] {
  const out: Crumb[] = [{ label: "Este equipo", path: COMPUTER }];
  if (!path || path === COMPUTER) return out;
  const parts = path.split(BS).join("/").split("/").filter(Boolean);
  const unc = path.startsWith(BS + BS);
  let head = "";
  if (unc && parts.length >= 2) {
    head = BS + BS + parts[0] + BS + parts[1];
    parts.splice(0, 2);
    out.push({ label: head, path: head + BS });
  } else if (parts.length > 0 && parts[0].endsWith(":")) {
    head = parts[0];
    parts.shift();
    out.push({ label: head, path: head + BS });
  }
  let acc = head;
  for (const part of parts) {
    acc = head ? acc + BS + part : (acc ? acc + "/" : "/") + part;
    out.push({ label: part, path: acc });
  }
  return out;
}

/** Ancho aproximado de un tramo (texto + relleno y punta), para decidir cuántos caben. */
const crumbWidth = (crumb: Crumb, first: boolean) => crumb.label.length * 7 + (first ? 44 : 38);
const MORE_WIDTH = 46;

/** Ruta como recuadros con punta de flecha: cada uno lleva a esa carpeta. Si no caben, los primeros se juntan en "…". */
export function Breadcrumb(props: { path: string | null; onGo: (path: string) => void }) {
  const crumbs = crumbsOf(props.path);
  const box = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(100000);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const watch = new ResizeObserver(() => setWidth(el.clientWidth));
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  useEffect(() => setMore(false), [props.path]);

  // de atrás hacia adelante: siempre queda el último; lo que no cabe pasa al menú "…"
  let used = 0;
  let from = crumbs.length - 1;
  for (let i = crumbs.length - 1; i >= 0; i--) {
    used += crumbWidth(crumbs[i], i === 0);
    const reserve = i > 0 ? MORE_WIDTH : 0;
    if (used + reserve > width && i < crumbs.length - 1) break;
    from = i;
  }
  const hidden = crumbs.slice(0, from);
  const visible = crumbs.slice(from);

  return (
    <nav className="crumbs" aria-label="Ruta" ref={box}>
      {hidden.length > 0 && (
        <span className="crumb-more">
          <button type="button" className="crumb first" title="Carpetas anteriores" aria-label="Carpetas anteriores" onClick={() => setMore((v) => !v)}>
            <Ellipsis size={14} strokeWidth={1.75} aria-hidden />
          </button>
          {more && (
            <div className="menu crumb-menu" role="menu">
              {hidden.map((crumb) => (
                <button key={crumb.path} onClick={() => { setMore(false); props.onGo(crumb.path); }}>
                  {crumb.label}
                </button>
              ))}
            </div>
          )}
        </span>
      )}
      {visible.map((crumb, index) => {
        const last = from + index === crumbs.length - 1;
        const first = from + index === 0 || (index === 0 && hidden.length === 0);
        return (
          <button
            key={crumb.path}
            type="button"
            className={`crumb${first ? " first" : ""}${last ? " current" : ""}`}
            title={crumb.path === COMPUTER ? "Este equipo" : crumb.path}
            aria-current={last ? "page" : undefined}
            disabled={last}
            onClick={() => props.onGo(crumb.path)}
          >
            {from + index === 0 && <Monitor size={13} strokeWidth={1.75} aria-hidden />}
            {crumb.label}
          </button>
        );
      })}
    </nav>
  );
}
