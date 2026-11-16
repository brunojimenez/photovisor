import { COMPUTER, type Entry } from "./api";
import { folderName } from "./format";

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
  return (
    <div className="tree">
      {props.quick.length > 0 && (
        <>
          <div className="tree-section">Acceso rápido</div>
          {props.quick.map((dir) => (
            <Node key={"q:" + dir.path} {...props} path={dir.path} label={dir.name} depth={0} />
          ))}
          <div className="tree-section">Este equipo</div>
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
      <div className={props.current === props.path ? "node active" : "node"} style={{ paddingLeft: 8 + props.depth * 14 }}>
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

function PcGlyph() {
  return (
    <svg className="node-ico pc" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2" y="2.5" width="12" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M6 13.5h4M8 10.5v3" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function DriveGlyph() {
  return (
    <svg className="node-ico drive" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path fill="currentColor" d="M2 5.2 3.2 3h9.6L14 5.2V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5.2Z" />
      <path d="M3 8.5h10" stroke="#111" strokeWidth="1" />
    </svg>
  );
}

function FolderMini() {
  return (
    <svg className="node-ico folder" width="16" height="14" viewBox="0 0 16 14" aria-hidden="true">
      <path fill="currentColor" d="M1.2 2.4A1.2 1.2 0 0 1 2.4 1.2h3.2c.3 0 .6.12.8.34L7.2 2.6h6.4a1.2 1.2 0 0 1 1.2 1.2v7.6a1.2 1.2 0 0 1-1.2 1.2H2.4a1.2 1.2 0 0 1-1.2-1.2V2.4Z" />
    </svg>
  );
}
