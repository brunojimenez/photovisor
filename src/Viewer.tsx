import { useEffect, useRef, useState } from "react";
import { mediaUrl, type Entry, type Meta } from "./api";
import { RatingBar } from "./Rating";
import { ChevronGlyph, FitGlyph, RatioGlyph, StudioGlyph } from "./icons";
import { ArrowLeft, Film, Pause, Play, SlidersHorizontal, Trash2 } from "lucide-react";

type Props = {
  file: Entry;
  files: Entry[];
  filmstrip: boolean;
  zoom: number;
  pan: { x: number; y: number };
  edge: number;
  thumbSrc: (entry: Entry) => string | undefined;
  thumbRev: number;
  onClose: () => void;
  onToggleFilmstrip: () => void;
  onEdit: () => void;
  onDelete: () => void;
  busy: boolean;
  /** Solo si el estudio está en el PC. */
  onStudio?: () => void;
  canEdit: boolean;
  meta?: Meta;
  onRate: (rating: number) => void;
  onLabel: (label: string) => void;
  playing: boolean;
  onTogglePlay: () => void;
  onFocus: (path: string) => void;
  onZoom: (zoom: number) => void;
  onPan: (pan: { x: number; y: number }) => void;
  requestThumb: (entry: Entry, edge: number) => void;
};

export function Viewer(props: Props) {
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [fit, setFit] = useState<"fit" | "ratio" | "native">("fit");
  const url = mediaUrl(props.file.path, props.file.modifiedMs);
  const index = props.files.findIndex((entry) => entry.path === props.file.path);
  const previous = index > 0 ? props.files[index - 1] : null;
  const following = index >= 0 && index < props.files.length - 1 ? props.files[index + 1] : null;

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = event.deltaY > 0 ? 0.9 : 1.1;
      props.onZoom(props.zoom * factor);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [props]);

  return (
    <div className="viewer">
      <div className="viewer-bar">
        <button className="icon-btn" title="Volver (Esc)" aria-label="Volver" onClick={props.onClose}>
          <ArrowLeft size={16} strokeWidth={1.75} aria-hidden />
        </button>
        <strong>{props.file.name}</strong>
        <RatingBar meta={props.meta} onRate={props.onRate} onLabel={props.onLabel} />
        <div className="seg" role="group" aria-label="Ajuste">
          <button
            className={fit === "fit" ? "on" : ""}
            title="Ajustar"
            aria-label="Ajustar"
            onClick={() => {
              setFit("fit");
              props.onZoom(1);
              props.onPan({ x: 0, y: 0 });
            }}
          >
            <FitGlyph />
          </button>
          <button className={fit === "ratio" ? "on" : ""} title="Mantener relación" aria-label="Mantener relación" onClick={() => setFit("ratio")}>
            <RatioGlyph />
          </button>
          <button className={fit === "native" ? "on" : ""} title="Tamaño normal" aria-label="Tamaño normal" onClick={() => setFit("native")}>
            <NativeGlyph />
          </button>
        </div>
        <button
          className="icon-btn primary"
          onClick={props.onEdit}
          disabled={!props.canEdit}
          title={props.canEdit ? "Editar" : "El video solo se mira"}
          aria-label="Editar"
        >
          <SlidersHorizontal size={16} strokeWidth={1.75} aria-hidden />
        </button>
        <button className="icon-btn del" title="Eliminar" aria-label="Eliminar" disabled={props.busy} onClick={props.onDelete}>
          <Trash2 size={16} strokeWidth={1.75} aria-hidden />
        </button>
        {props.onStudio && (
          <button className="icon-btn" title="Abrir en el Studio (IA: prompts, motores, quitar fondo, ampliar…)" aria-label="Abrir en el Studio" onClick={props.onStudio}>
            <StudioGlyph />
          </button>
        )}
        <button
          className={props.playing ? "icon-btn on" : "icon-btn"}
          title={props.playing ? "Detener presentación" : "Presentación"}
          aria-label={props.playing ? "Detener presentación" : "Presentación"}
          onClick={props.onTogglePlay}
        >
          {props.playing ? <Pause size={16} strokeWidth={1.75} aria-hidden /> : <Play size={16} strokeWidth={1.75} aria-hidden />}
        </button>
        <button
          className={props.filmstrip ? "icon-btn on" : "icon-btn"}
          title={props.filmstrip ? "Ocultar tira" : "Mostrar tira"}
          aria-label={props.filmstrip ? "Ocultar tira" : "Mostrar tira"}
          onClick={props.onToggleFilmstrip}
        >
          <Film size={16} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
      <div className="stage-wrap">
      <div
        className={`stage ${fit}`}
        ref={stage}
        onPointerDown={(event) => {
          if (fit !== "fit" || props.zoom <= 1 || props.file.kind === "video") return;
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            panX: props.pan.x,
            panY: props.pan.y,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (!start) return;
          props.onPan({
            x: start.panX + event.clientX - start.x,
            y: start.panY + event.clientY - start.y,
          });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onDoubleClick={() => {
          // El doble clic en el video lo usa el propio reproductor (pantalla completa).
          if (props.file.kind === "video") return;
          props.onClose();
        }}
      >
        {props.file.kind === "video" ? (
          <video key={url} src={url} controls autoPlay />
        ) : (
          <img
            key={url}
            src={url}
            alt={props.file.name}
            draggable={false}
            style={fit === "fit" ? { transform: `translate(${props.pan.x}px, ${props.pan.y}px) scale(${props.zoom})` } : undefined}
          />
        )}
      </div>
        <button
          className="nav-arrow left"
          title="Anterior"
          aria-label="Anterior"
          disabled={!previous}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => previous && props.onFocus(previous.path)}
        >
          <ChevronGlyph dir="left" />
        </button>
        <button
          className="nav-arrow right"
          title="Siguiente"
          aria-label="Siguiente"
          disabled={!following}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => following && props.onFocus(following.path)}
        >
          <ChevronGlyph dir="right" />
        </button>
      </div>
      {props.filmstrip && (
        <div className="film">
          {props.files.map((entry) => (
            <FilmItem
              key={entry.path}
              entry={entry}
              selected={entry.path === props.file.path}
              edge={props.edge}
              src={props.thumbSrc(entry)}
              onFocus={props.onFocus}
              requestThumb={props.requestThumb}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NativeGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <text x="8" y="11" textAnchor="middle" fontSize="7.5" fill="currentColor" fontFamily="Segoe UI, sans-serif">1:1</text>
    </svg>
  );
}

function FilmItem(props: {
  entry: Entry;
  edge: number;
  selected: boolean;
  src: string | undefined;
  onFocus: (path: string) => void;
  requestThumb: (entry: Entry, edge: number) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (props.entry.kind !== "image") return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver((items) => {
      if (items.some((item) => item.isIntersecting)) props.requestThumb(props.entry, props.edge);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [props.entry.path, props.entry.modifiedMs, props.edge]);

  return (
    <button
      ref={ref}
      className={props.selected ? "selected" : ""}
      onClick={() => props.onFocus(props.entry.path)}
    >
      {props.src ? <img src={props.src} alt="" /> : <div className="thumb">{props.entry.kind === "video" ? "video" : ""}</div>}
    </button>
  );
}
