import { useRef, useState } from "react";
import { CURVE_IDENTITY, curveLut, normalizePoints, type CurveChannel, type CurvePoint, type Curves, type Histogram } from "./editorCurves";

const SIZE = 256;
const HIT = 12;

const CHANNELS: { id: CurveChannel; label: string; tip: string; color: string }[] = [
  { id: "m", label: "Todo", tip: "Curva de la luz de toda la foto", color: "#e8eaed" },
  { id: "r", label: "R", tip: "Solo el canal rojo", color: "#ff5a52" },
  { id: "g", label: "G", tip: "Solo el canal verde", color: "#4cd964" },
  { id: "b", label: "B", tip: "Solo el canal azul", color: "#4da3ff" },
];

/** Editor de curvas: clic para sumar un punto, arrastrar para moverlo, doble clic o clic derecho para quitarlo. */
export function CurveEditor(props: {
  curves: Curves | undefined;
  histogram: Histogram | null;
  onChange: (next: Curves) => void;
}) {
  const [channel, setChannel] = useState<CurveChannel>("m");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const ch = CHANNELS.find((c) => c.id === channel) ?? CHANNELS[0];
  const points: CurvePoint[] = props.curves?.[channel] ?? CURVE_IDENTITY;
  const lut = curveLut(points);

  const toCurve = (clientX: number, clientY: number): CurvePoint => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return [0, 0];
    return [
      Math.max(0, Math.min(255, Math.round(((clientX - r.left) / r.width) * 255))),
      Math.max(0, Math.min(255, Math.round((1 - (clientY - r.top) / r.height) * 255))),
    ];
  };
  const scale = () => {
    const r = svgRef.current?.getBoundingClientRect();
    return r ? r.width / 255 : 1;
  };
  const commit = (pts: CurvePoint[]) => props.onChange({ ...(props.curves ?? {}), [channel]: pts });
  const nearest = (p: CurvePoint) => {
    let best = -1;
    let bestD = HIT / scale();
    points.forEach(([x, y], i) => {
      const d = Math.hypot(x - p[0], y - p[1]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  };

  const down = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const p = toCurve(e.clientX, e.clientY);
    let idx = nearest(p);
    if (idx < 0) {
      const next = normalizePoints([...points, p]);
      idx = next.findIndex((q) => q[0] === p[0]);
      commit(next);
    }
    setDragIdx(idx);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    if (dragIdx === null) return;
    const p = toCurve(e.clientX, e.clientY);
    const next = points.map((q) => [...q] as CurvePoint);
    const last = next.length - 1;
    const cur = next[dragIdx];
    if (!cur) return;
    // Los extremos solo suben o bajan; los del medio no pasan a sus vecinos.
    if (dragIdx === 0 || dragIdx === last) cur[1] = p[1];
    else {
      cur[0] = Math.max(next[dragIdx - 1][0] + 1, Math.min(next[dragIdx + 1][0] - 1, p[0]));
      cur[1] = p[1];
    }
    commit(next);
  };
  const up = () => setDragIdx(null);
  const remove = (p: CurvePoint) => {
    const idx = nearest(p);
    if (idx > 0 && idx < points.length - 1) commit(points.filter((_, i) => i !== idx));
  };

  const hist = props.histogram ? (channel === "m" ? props.histogram.l : props.histogram[channel]) : null;
  const peak = hist ? Math.max(1, ...hist.slice(1, 255)) : 1;
  const path = Array.from(lut, (v, i) => `${i === 0 ? "M" : "L"}${i},${SIZE - 1 - v}`).join(" ");

  return (
    <div className="curve-editor">
      <div className="editor-seg curve-channels" role="group" aria-label="Canal de la curva">
        {CHANNELS.map((c) => {
          const touched = props.curves?.[c.id] && props.curves[c.id]!.some(([x, y]) => x !== y);
          return (
            <button key={c.id} type="button" className={`${channel === c.id ? "on" : ""} ${touched ? "touched" : ""}`} title={c.tip} onClick={() => setChannel(c.id)}>
              <i style={{ background: c.color }} />
              {c.label}
            </button>
          );
        })}
      </div>
      <svg
        ref={svgRef}
        className="curve-box"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onDoubleClick={(e) => remove(toCurve(e.clientX, e.clientY))}
        onContextMenu={(e) => {
          e.preventDefault();
          remove(toCurve(e.clientX, e.clientY));
        }}
        role="img"
        aria-label={`Curva ${ch.label}`}
      >
        {hist && (
          <g opacity="0.35" fill={ch.color}>
            {hist.map((v, i) => {
              const h = (Math.min(v, peak) / peak) * SIZE;
              return h > 0.5 ? <rect key={i} x={i} y={SIZE - h} width="1.2" height={h} /> : null;
            })}
          </g>
        )}
        {[64, 128, 192].map((g) => (
          <g key={g} stroke="currentColor" opacity="0.14">
            <line x1={g} y1="0" x2={g} y2={SIZE} />
            <line x1="0" y1={g} x2={SIZE} y2={g} />
          </g>
        ))}
        <line x1="0" y1={SIZE} x2={SIZE} y2="0" stroke="currentColor" opacity="0.25" strokeDasharray="3 4" />
        <path d={path} fill="none" stroke={ch.color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {points.map(([x, y], i) => (
          <circle key={i} cx={x} cy={SIZE - 1 - y} r={dragIdx === i ? 6 : 4.5} fill={ch.color} stroke="#111" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <p className="hint">Clic suma un punto; arrástralo para mover. Doble clic o clic derecho lo quita.</p>
    </div>
  );
}
