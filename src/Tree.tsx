import { useState } from "react";
import { COMPUTER, type Entry } from "./api";
import { folderName } from "./format";
import { DriveGlyph, FavGlyph, FolderMini, PcGlyph } from "./icons";

type Props = {
  drives: Entry[];
  quick: Entry[];
  current: string;
  children: Record<string, Entry[]>;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onOpen: (path: string) => void;
};

export function Tree(props: Props) {
  const open = props.expanded.has(COMPUTER);
  const [quickOpen, setQuickOpen] = useState(() => {
    try {
      return localStorage.getItem("pv.quick") !== "0";
    } catch {
      return true;
    }
  });
  const toggleQuick = () =>
    setQuickOpen((v) => {
      try {
        localStorage.setItem("pv.quick", v ? "0" : "1");
      } catch {
        /* sin almacenamiento */
      }
      return !v;
    });
  return (
    <div className="tree">
      {props.quick.length > 0 && (
        <>
          <div className="node">
            <button className="twist" aria-label={quickOpen ? "Contraer" : "Expandir"} onClick={toggleQuick}>
              {quickOpen ? "▾" : "▸"}
            </button>
            <button className="node-main" onClick={toggleQuick}>
              <FavGlyph />
              <span>Acceso rápido</span>
            </button>
          </div>
          {quickOpen &&
            props.quick.map((dir) => <Node key={"q:" + dir.path} {...props} path={dir.path} label={dir.name} depth={1} />)}
        </>
      )}
      <div className={props.current === COMPUTER ? "node active" : "node"}>
        <button className="twist" aria-label={open ? "Contraer" : "Expandir"} onClick={() => props.onToggle(COMPUTER)}>
          {open ? "▾" : "▸"}
        </button>
        <button className="node-main" onClick={() => props.onOpen(COMPUTER)}>
          <PcGlyph />
          <span>Este equipo</span>
        </button>
      </div>
      {open &&
        props.drives.map((drive) => (
          <Node key={drive.path} {...props} path={drive.path} label={drive.name} depth={1} drive />
        ))}
    </div>
  );
}

function Node(props: Props & { path: string; depth: number; label?: string; drive?: boolean }) {
  const dirs = (props.children[props.path] ?? []).filter((entry) => entry.kind === "dir");
  const open = props.expanded.has(props.path);
  const known = props.path in props.children;
  return (
    <div>
      <div className={props.current === props.path ? "node active" : "node"} style={{ paddingLeft: 8 + props.depth * 14 }} data-drop={props.path}>
        <button className="twist" aria-label={open ? "Contraer" : "Expandir"} onClick={() => props.onToggle(props.path)}>
          {known && dirs.length === 0 ? "" : open ? "▾" : "▸"}
        </button>
        <button className="node-main" onClick={() => props.onOpen(props.path)}>
          {props.drive ? <DriveGlyph /> : <FolderMini />}
          <span>{props.label ?? folderName(props.path)}</span>
        </button>
      </div>
      {open &&
        dirs.map((dir) => <Node key={dir.path} {...props} path={dir.path} label={dir.name} depth={props.depth + 1} drive={false} />)}
    </div>
  );
}

