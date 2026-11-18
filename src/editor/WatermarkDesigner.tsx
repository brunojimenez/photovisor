import { useRef } from "react";
import { lucideNode } from "./lucideStickers";
import { installedFonts, type Watermark, WM_DEFAULT, wmFont } from "./editorMark";
import { WM_PLACES } from "./editorWm";
import { FLUENT_CHR, IconBrowser, LookPicker } from "./StickerUi";
import { Card, OptRow } from "./EditorUi";

/** Diseñador de la marca de agua (texto, ícono o imagen, con su color, estilo y posición). Lo usan el editor y la marca en lote. */
export function WatermarkDesigner(props: {
  wm: Watermark;
  setWm: (update: (w: Watermark) => Watermark) => void;
  fileName: string;
  onPickImage: (file: File) => void;
}) {
  const { wm, setWm } = props;
  const wmFileRef = useRef<HTMLInputElement | null>(null);

  /** Un ícono de líneas pasa a ser el sello; un emoji o un carácter de trazo se escribe en la frase. */
  function pickWmIcon(ch: string) {
    if (lucideNode(ch)) {
      setWm((w) => ({ ...w, on: true, mode: "icon", icon: ch }));
      return;
    }
    const add = ch.startsWith("fe:") ? (FLUENT_CHR.get(ch) ?? "") : ch;
    setWm((w) => ({ ...w, on: true, mode: "text", text: (w.text + add).slice(0, 80) }));
  }

  return (
    <>
                <Card title="Marca de agua">
<label className="editor-pin">
                  <input
                    type="checkbox"
                    checked={wm.on}
                    onChange={(e) => setWm((w) => ({ ...w, on: e.target.checked }))}
                  />
                  ver en la foto y al guardar
                </label>
                <div className="editor-seg">
                  <button
                    type="button"
                    className={wm.mode === "text" ? "on" : ""}
                    onClick={() => setWm((w) => ({ ...w, mode: "text", on: true }))}
                  >
                    Texto
                  </button>
                  <button
                    type="button"
                    className={wm.mode === "icon" ? "on" : ""}
                    onClick={() => setWm((w) => ({ ...w, mode: "icon", on: true }))}
                  >
                    Ícono
                  </button>
                  <button
                    type="button"
                    className={wm.mode === "image" ? "on" : ""}
                    onClick={() => setWm((w) => ({ ...w, mode: "image", on: true }))}
                  >
                    Imagen
                  </button>
                </div>
                {wm.mode === "text" ? (
                  <>
                    <input
                      className="editor-wm-text"
                      value={wm.text}
                      maxLength={80}
                      placeholder="🔥TuMarca"
                      onChange={(e) => setWm((w) => ({ ...w, on: true, text: e.target.value }))}
                    />
                <select
                  className="editor-font" title="Fuente" aria-label="Fuente"
                  value={wmFont(wm.font)}
                  onChange={(e) => setWm((w) => ({ ...w, font: e.target.value }))}
                >
                  {installedFonts().map((font) => (
                    <option key={font} value={font} style={{ fontFamily: `"${font}"` }}>{font}</option>
                  ))}
                </select>
                                      </>
                ) : wm.mode === "icon" ? (
                  <p className="hint">Elige un emoji o un ícono de líneas abajo: se usa como sello, con el tamaño, giro, opacidad y mosaico de más abajo.</p>
                ) : (
                  <>
                    <button type="button" className="btn-ghost editor-wm-file" onClick={() => wmFileRef.current?.click()}>
                      {props.fileName || "Elegir PNG o imagen"}
                    </button>
                    <input
                      ref={wmFileRef}
                      type="file"
                      accept="image/png,image/webp,image/jpeg,image/gif"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) props.onPickImage(file);
                      }}
                    />
                    <p className="hint">PNG con transparencia. El lugar de abajo vale igual para la imagen.</p>
                  </>
                )}
                </Card>
                {(wm.mode === "text" || wm.mode === "icon") && (
                  <>
                    <IconBrowser
                      isOn={(ch) => wm.mode === "icon" && wm.icon === ch}
                      onPick={pickWmIcon}
                      ink={{ look: wm.look ?? "solid", c1: wm.color, c2: wm.color2 ?? "#ff4fa3", palette: wm.palette ?? "rainbow" }}
                    />
                    <p className="hint">
                      {wm.mode === "icon"
                        ? "Los emojis conservan sus colores; el color y estilo de abajo vale para los íconos de líneas."
                        : "Los emojis y los caracteres de Trazo se escriben en la frase. Un ícono de líneas pasa a modo Ícono y queda como sello."}
                    </p>
                    <Card title="Color y estilo">
                      <LookPicker
                        look={wm.look ?? "solid"}
                        color={wm.color}
                        color2={wm.color2 ?? "#ff4fa3"}
                        palette={wm.palette ?? "rainbow"}
                        onChange={(patch) => setWm((w) => ({ ...w, ...patch }))}
                      />
                    </Card>
                  </>
                )}
                <Card title="Posición">
                <div className="editor-seg">
                  {WM_PLACES.map(([id, label, tip]) => (
                    <button
                      key={id}
                      type="button"
                      className={wm.place === id ? "on" : ""}
                      title={tip}
                      onClick={() => setWm((w) => ({ ...w, place: id, on: true }))}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <OptRow label="Opacidad" value={wm.opacity} min={8} max={92} def={WM_DEFAULT.opacity} onChange={(n) => setWm((w) => ({ ...w, opacity: n }))} />
                <OptRow label="Ángulo" value={wm.angle} min={-75} max={75} def={WM_DEFAULT.angle} onChange={(n) => setWm((w) => ({ ...w, angle: n }))} />
                <OptRow label="Tamaño" value={wm.size} min={10} max={80} def={WM_DEFAULT.size} onChange={(n) => setWm((w) => ({ ...w, size: n }))} />
                {wm.place === "tile" && (
                  <OptRow label="Separación" value={wm.gap} min={0} max={100} def={WM_DEFAULT.gap} onChange={(n) => setWm((w) => ({ ...w, gap: n }))} />
                )}
                {wm.mode === "text" && (
                  <OptRow label="Sombra" value={wm.shade} min={0} max={100} def={WM_DEFAULT.shade} onChange={(n) => setWm((w) => ({ ...w, shade: n }))} />
                )}
                </Card>
    </>
  );
}
