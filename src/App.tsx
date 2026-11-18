import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { ask, open } from "@tauri-apps/plugin-dialog";
import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import Editor from "./editor/Editor";
import {
  deletePermanent,
  openExternal,
  fileInfo,
  fileExif,
  stripGps,
  findSimilar,
  type ExifSummary,
  COMPUTER,
  goUp as goUpApi,
  launchArgs,
  studioInfo,
  openInStudio as openInStudioApi,
  listDir,
  listDrives,
  quickAccess,
  loadConfig,
  openRoot,
  pasteFiles,
  recycle,
  renameFile,
  saveConfig,
  saveEdit,
  suggestTilt,
  catalogFolder,
  catalogSet,
  watchFolder,
  type Meta,
  thumbnail,
  transform,
  userFolder,
  mediaUrl,
  type BatchReport,
  type Config,
  type Entry,
  type FileInfo,
  type FolderView,
} from "./api";
import {
  bytesToBase64,
  fileExt,
  formatSize,
  formatWhen,
  sortEntries,
  type IconSize,
  type SortDir,
  type SortKey,
} from "./format";
import { STYLE_THUMBS } from "./editor/styleThumbs";
import { Badge, LABELS, RatingBar } from "./Rating";
import { Breadcrumb } from "./Breadcrumb";
import { Tree } from "./Tree";
import { Viewer } from "./Viewer";
import {
  ChevronGlyph, CloseGlyph, CompareGlyph, CopyGlyph, CutGlyph, EditGlyph, SettingsGlyph, SpinnerGlyph, ToolsGlyph, DownGlyph, FilterGlyph, FitGlyph, FolderGlyph, GridGlyph, LargeGlyph, LinesGlyph,
  FileGlyph, NameGlyph, PanelGlyph, PasteGlyph, RatioGlyph, SelectTypeGlyph, SizeGlyph, StudioGlyph, TrashGlyph, TypeGlyph, UpGlyph,
} from "./icons";

const VIEW = {
  list: { cell: 100000, row: 52, gap: 4 },
  medium: { cell: 132, row: 164, gap: 10 },
  large: { cell: 180, row: 196, gap: 12 },
} as const;

const ICON_EDGE: Record<IconSize, number> = { list: 96, medium: 256, large: 480 };

function previewBucket(height: number) {
  const px = Math.max(160, (height - 36) * 2);
  for (const step of [320, 480, 768, 1024]) {
    if (px <= step) return step;
  }
  return 1024;
}

const EMPTY_CONFIG: Config = {
  lastFolder: null,
  shiftDeleteWithoutAsking: false,
  filmstrip: false,
  discardEditWithoutAsking: false,
  dupMaxDist: 4,
  jpegQuality: 95,
  webpQuality: 90,
  avifQuality: 80,
};

const LAYOUT_KEY = "pv.layout";

type Layout = {
  sideW: number;
  previewH: number;
  foldersOpen: boolean;
  iconSize: IconSize;
  folderView: "list" | "grid";
  previewMode: "fit" | "ratio" | "native";
  sortKey: SortKey;
  sortDir: SortDir;
};

/** Distribución guardada de la última vez (tamaños de paneles, vistas y orden). */
function readLayout(): Partial<Layout> {
  try {
    const raw = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "{}") as Partial<Layout>;
    const out: Partial<Layout> = {};
    if (typeof raw.sideW === "number") out.sideW = Math.min(700, Math.max(200, raw.sideW));
    if (typeof raw.previewH === "number") out.previewH = Math.min(900, Math.max(140, raw.previewH));
    if (typeof raw.foldersOpen === "boolean") out.foldersOpen = raw.foldersOpen;
    if (raw.iconSize === "list" || raw.iconSize === "medium" || raw.iconSize === "large") out.iconSize = raw.iconSize;
    if (raw.folderView === "list" || raw.folderView === "grid") out.folderView = raw.folderView;
    if (raw.previewMode === "fit" || raw.previewMode === "ratio" || raw.previewMode === "native") out.previewMode = raw.previewMode;
    if (raw.sortKey === "name" || raw.sortKey === "type" || raw.sortKey === "size") out.sortKey = raw.sortKey;
    if (raw.sortDir === "asc" || raw.sortDir === "desc") out.sortDir = raw.sortDir;
    return out;
  } catch {
    return {};
  }
}
const SAVED = readLayout();

export default function App() {
  const [config, setConfig] = useState<Config>(EMPTY_CONFIG);
  const [root, setRoot] = useState<string | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [children, setChildren] = useState<Record<string, Entry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [files, setFiles] = useState<Entry[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [focus, setFocus] = useState<string | null>(null);
  const [viewer, setViewer] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBase, setEditBase] = useState("");
  const [iconSize, setIconSize] = useState<IconSize>(SAVED.iconSize ?? "large");
  const [folderView, setFolderView] = useState<"list" | "grid">(SAVED.folderView ?? "list");
  const [drives, setDrives] = useState<Entry[]>([]);
  const [quick, setQuick] = useState<Entry[]>([]);
  const [foldersOpen, setFoldersOpen] = useState(SAVED.foldersOpen ?? true);
  const [editorDirty, setEditorDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [forgetDiscard, setForgetDiscard] = useState(false);
  const [clip, setClip] = useState<{ paths: string[]; cut: boolean } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pair, setPair] = useState<[Entry, Entry] | null>(null);
  const [typeMenu, setTypeMenu] = useState(false);
  const [meta, setMeta] = useState<Record<string, Meta>>({});
  const [filterRating, setFilterRating] = useState(0);
  const [filterLabel, setFilterLabel] = useState("");
  const [toolsOpen, setToolsOpen] = useState(() => {
    try {
      return localStorage.getItem("pv.tools") === "1";
    } catch {
      return false;
    }
  });
  const [dupCount, setDupCount] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const currentRef = useRef<string | null>(null);
  const [editorStart, setEditorStart] = useState<{ tool?: "fill"; mode?: "replace" }>({});
  const trail = useRef<string[]>([]);
  const trailAt = useRef(-1);
  const [trailMark, setTrailMark] = useState({ at: -1, len: 0 });
  const [sideW, setSideW] = useState(SAVED.sideW ?? 292);
  const [previewH, setPreviewH] = useState(SAVED.previewH ?? 300);
  const [previewOpen, setPreviewOpen] = useState(() => {
    try {
      return localStorage.getItem("pv.preview") !== "0";
    } catch {
      return true;
    }
  });
  const togglePreview = () =>
    setPreviewOpen((v) => {
      try {
        localStorage.setItem("pv.preview", v ? "0" : "1");
      } catch {
        /* sin almacenamiento */
      }
      return !v;
    });
  const [previewMode, setPreviewMode] = useState<"fit" | "ratio" | "native">(SAVED.previewMode ?? "fit");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const renamingRef = useRef<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>(SAVED.sortKey ?? "name");
  const [sortDir, setSortDir] = useState<SortDir>(SAVED.sortDir ?? "asc");
  useEffect(() => {
    const layout: Layout = { sideW, previewH, foldersOpen, iconSize, folderView, previewMode, sortKey, sortDir };
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
    } catch {
      /* sin almacenamiento: se pierde solo la distribución */
    }
  }, [sideW, previewH, foldersOpen, iconSize, folderView, previewMode, sortKey, sortDir]);
  const [info, setInfo] = useState<FileInfo | null>(null);
  const [exif, setExif] = useState<ExifSummary | null>(null);
  const [dupes, setDupes] = useState<string[][] | null>(null);
  const [dupBusy, setDupBusy] = useState(false);
  const [dupIdx, setDupIdx] = useState(0);
  const [dupPick, setDupPick] = useState<Record<string, boolean>>({});
  const [columns, setColumns] = useState(4);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [confirmPaths, setConfirmPaths] = useState<string[] | null>(null);
  const [remember, setRemember] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [thumbRev, setThumbRev] = useState(0);
  const anchor = useRef(0);
  const thumbs = useRef<Record<string, string>>({});
  const sharpBest = useRef<Record<string, { edge: number; url: string }>>({});
  const queuedFast = useRef(new Set<string>());
  const queuedSharp = useRef(new Set<string>());
  const fastJobs = useRef<Entry[]>([]);
  const sharpJobs = useRef<{ entry: Entry; edge: number }[]>([]);
  const fastRunning = useRef(0);
  const sharpRunning = useRef(0);
  const gridRef = useRef<HTMLDivElement>(null);
  const openPathRef = useRef<(path: string) => void>(() => {});

  function rememberThumb(key: string, url: string) {
    thumbs.current[key] = url;
    setThumbRev((value) => value + 1);
  }

  function pumpFast() {
    while (fastRunning.current < 4 && fastJobs.current.length > 0) {
      const entry = fastJobs.current.shift();
      if (!entry) return;
      const base = `${entry.path}|${entry.modifiedMs}`;
      fastRunning.current += 1;
      thumbnail(entry.path, 256, "fast")
        .then((data) => rememberThumb(`${base}|fast`, `data:image/jpeg;base64,${data}`))
        .catch(() => undefined)
        .finally(() => {
          fastRunning.current -= 1;
          pumpFast();
        });
    }
  }

  function pumpSharp() {
    while (sharpRunning.current < 2 && sharpJobs.current.length > 0) {
      const job = sharpJobs.current.shift();
      if (!job) return;
      const base = `${job.entry.path}|${job.entry.modifiedMs}`;
      sharpRunning.current += 1;
      thumbnail(job.entry.path, job.edge, "sharp")
        .then((data) => {
          const url = `data:image/jpeg;base64,${data}`;
          const prev = sharpBest.current[base];
          if (!prev || job.edge >= prev.edge) sharpBest.current[base] = { edge: job.edge, url };
          rememberThumb(`${base}|${job.edge}`, url);
        })
        .catch(() => undefined)
        .finally(() => {
          sharpRunning.current -= 1;
          pumpSharp();
        });
    }
  }

  function requestThumb(entry: Entry, edge: number) {
    if (entry.kind !== "image") return;
    const base = `${entry.path}|${entry.modifiedMs}`;
    if (!thumbs.current[`${base}|fast`] && !queuedFast.current.has(base)) {
      queuedFast.current.add(base);
      fastJobs.current.push(entry);
      pumpFast();
    }
    if ((sharpBest.current[base]?.edge ?? 0) >= edge || queuedSharp.current.has(`${base}|${edge}`)) return;
    queuedSharp.current.add(`${base}|${edge}`);
    sharpJobs.current.push({ entry, edge });
    pumpSharp();
  }

  function srcFor(entry: Entry, edge: number) {
    const base = `${entry.path}|${entry.modifiedMs}`;
    const sharp = sharpBest.current[base];
    if (sharp && sharp.edge >= edge) return sharp.url;
    return thumbs.current[`${base}|fast`] || sharp?.url;
  }

  function rememberDirs(view: FolderView) {
    setChildren((prev) => ({
      ...prev,
      [view.path]: view.entries.filter((entry) => entry.kind === "dir"),
    }));
  }

  function showMedia(entries: Entry[], wanted: string | null) {
    setFiles(entries);
    const hit = entries.find((entry) => entry.path === wanted) ?? entries.find(isMedia) ?? entries[0] ?? null;
    setFocus(hit?.path ?? null);
    setSelected(hit ? [hit.path] : []);
    anchor.current = hit ? entries.findIndex((entry) => entry.path === hit.path) : 0;
  }

  function chain(path: string) {
    const norm = path.replace(/\//g, "\\");
    const match = norm.match(/^([A-Za-z]:\\)(.*)$/);
    if (!match) return [norm];
    const drive = match[1];
    const rest = match[2].replace(/\\$/, "");
    const out = [drive];
    let acc = drive;
    for (const part of rest ? rest.split("\\") : []) {
      acc = acc.endsWith("\\") ? `${acc}${part}` : `${acc}\\${part}`;
      out.push(acc);
    }
    return out;
  }

  async function reveal(path: string) {
    const steps = chain(path);
    const found: Record<string, Entry[]> = {};
    for (const step of steps) {
      try {
        const view = await listDir(step);
        found[view.path] = view.entries.filter((entry) => entry.kind === "dir");
      } catch {
        break;
      }
    }
    setChildren((prev) => ({ ...prev, ...found }));
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add(COMPUTER);
      for (const step of steps) next.add(step);
      return next;
    });
  }

  async function openPath(path: string, base = config) {
    const view = await openRoot(path);
    thumbs.current = {};
    sharpBest.current = {};
    queuedFast.current.clear();
    queuedSharp.current.clear();
    fastJobs.current = [];
    sharpJobs.current = [];
    setRoot(view.path);
    setCurrent(view.path);
    rememberDirs(view);
    showMedia(view.entries, view.focus);
    setViewer(false);
    setEditing(false);
    setPlaying(false);
    pushTrail(view.path);
    await reveal(view.path);
    const next = { ...base, lastFolder: view.path };
    setConfig(next);
    await saveConfig(next);
  }
  openPathRef.current = (path) => {
    void openPath(path).catch((error: unknown) => setToast(String(error)));
  };

  useEffect(() => {
    let live = true;
    void (async () => {
      const loaded = await loadConfig().catch(() => EMPTY_CONFIG);
      if (!live) return;
      setConfig(loaded);
      const found = await listDrives().catch(() => [] as Entry[]);
      if (!live) return;
      setDrives(found);
      void quickAccess().then((list) => live && setQuick(list)).catch(() => {});
      const launch = await launchArgs().catch(() => ({ path: null, edit: false }));
      const asked = launch.path;
      const home = await userFolder().catch(() => null);
      const start = asked || home;
      if (!start || !live) return;
      try {
        const view = await openRoot(start);
        if (!live) return;
        setRoot(view.path);
        setCurrent(view.path);
        setChildren({ [view.path]: view.entries.filter((entry) => entry.kind === "dir") });
        const firstPhoto = view.entries.find(isMedia);
        setFiles(view.entries);
        setFocus(view.focus ?? firstPhoto?.path ?? view.entries[0]?.path ?? null);
        setSelected(view.focus ? [view.focus] : firstPhoto ? [firstPhoto.path] : view.entries[0] ? [view.entries[0].path] : []);
        // «Editar en PhotoVisor» desde el estudio: entra directo al editor con esa foto
        if (launch.edit && view.focus && view.entries.some((entry) => entry.path === view.focus && entry.kind === "image")) {
          setEditorStart({});
          setEditing(true);
        }
        const next = { ...loaded, lastFolder: view.path };
        setConfig(next);
        await saveConfig(next);
        const steps = chain(view.path);
        const kids: Record<string, Entry[]> = { [view.path]: view.entries.filter((entry) => entry.kind === "dir") };
        for (const step of steps) {
          if (step === view.path) continue;
          try {
            const listed = await listDir(step);
            kids[listed.path] = listed.entries.filter((entry) => entry.kind === "dir");
          } catch {
            break;
          }
        }
        if (!live) return;
        setChildren((prev) => ({ ...prev, ...kids }));
        setExpanded(new Set([COMPUTER, ...steps]));
        pushTrail(view.path);
      } catch {
        if (live) setToast("No se pudo abrir la carpeta.");
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  // el estudio (aplicación amiga): si está en el PC se ofrece «Abrir en el estudio»
  const [studioHere, setStudioHere] = useState(false);
  useEffect(() => {
    const check = () => void studioInfo().then((info) => setStudioHere(info.installed)).catch(() => setStudioHere(false));
    check();
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, []);

  // otra copia de PhotoVisor se abrió con un archivo (p. ej. desde el estudio): se abre aquí
  const openArgsRef = useRef<(args: { path: string | null; edit: boolean }) => void>(() => {});
  openArgsRef.current = (args) => {
    if (!args.path) return;
    if (editing && editorDirty) {
      setToast("Guarda o descarta la edición actual para abrir la foto que llegó del estudio.");
      return;
    }
    void openPath(args.path)
      .then(() => {
        if (args.edit) {
          setEditorStart({});
          setEditing(true);
        }
      })
      .catch((error: unknown) => setToast(String(error)));
  };
  useEffect(() => {
    let off: (() => void) | undefined;
    void listen<{ path: string | null; edit: boolean }>("open-args", (event) => openArgsRef.current(event.payload)).then((fn) => {
      off = fn;
    });
    return () => off?.();
  }, []);

  async function openInStudio() {
    const entry = shown.find((item) => item.path === focus);
    if (entry?.kind !== "image") {
      setToast("Elige una foto para abrirla en el estudio.");
      return;
    }
    try {
      await openInStudioApi(entry.path);
      setToast("Abriendo el Studio con esta foto…");
    } catch (error) {
      setToast(String(error instanceof Error ? error.message : error));
    }
  }

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "drop" && event.payload.paths[0]) {
          openPathRef.current(event.payload.paths[0]);
        }
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => unlisten?.();
  }, []);

  currentRef.current = current;

  // valoración y etiqueta de la carpeta abierta
  useEffect(() => {
    if (!current || current === COMPUTER) {
      setMeta({});
      return;
    }
    let live = true;
    void catalogFolder(current)
      .then((found) => live && setMeta(found))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [current, files]);

  // si cambian los archivos de la carpeta desde fuera (fotos nuevas, borradas), la lista se actualiza sola
  useEffect(() => {
    if (current && current !== COMPUTER) void watchFolder(current).catch(() => {});
  }, [current]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<string>("folder-changed", (event) => {
      if (event.payload === currentRef.current) void quietRefresh();
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  const filtering = filterRating > 0 || filterLabel !== "";
  const shown = useMemo(() => {
    const dirs = sortEntries(files.filter((entry) => entry.kind === "dir"), sortKey, sortDir);
    const keep = (entry: Entry) => {
      const m = meta[entry.path];
      return (m?.rating ?? 0) >= filterRating && (!filterLabel || m?.label === filterLabel);
    };
    const media = sortEntries(files.filter((entry) => entry.kind !== "dir" && keep(entry)), sortKey, sortDir);
    return [...dirs, ...media];
  }, [files, sortKey, sortDir, meta, filterRating, filterLabel]);
  const photos = useMemo(() => shown.filter(isMedia), [shown]);
  const metrics = VIEW[iconSize];

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const measure = () => {
      const width = el.clientWidth - 28;
      setColumns(Math.max(1, Math.floor((width + metrics.gap) / (metrics.cell + metrics.gap))));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [root, metrics.cell, metrics.gap]);

  useEffect(() => {
    const entry = files.find((item) => item.path === focus);
    if (!focus || !entry || entry.kind === "dir") {
      setInfo(null);
      return;
    }
    let live = true;
    fileInfo(focus)
      .then((next) => {
        if (live) setInfo(next);
      })
      .catch(() => {
        if (live) setInfo(null);
      });
    return () => {
      live = false;
    };
  }, [focus, files]);

  useEffect(() => {
    const entry = files.find((item) => item.path === focus);
    if (!focus || !entry || entry.kind !== "image") {
      setExif(null);
      return;
    }
    let live = true;
    fileExif(focus)
      .then((next) => {
        if (live) setExif(next);
      })
      .catch(() => {
        if (live) setExif(null);
      });
    return () => {
      live = false;
    };
  }, [focus, files]);

  async function removeGps() {
    if (!focus) return;
    try {
      const report = await stripGps([focus]);
      setToast(report.done.length > 0 ? "Ubicación quitada del archivo." : report.errors[0] ?? "Esta foto no tenía ubicación.");
      setExif(await fileExif(focus));
    } catch (error) {
      setToast(String(error));
    }
  }

  function nextDupGroup() {
    if (!dupes) return;
    if (dupIdx + 1 < dupes.length) setDupIdx(dupIdx + 1);
    else setDupes(null);
  }

  async function trashDupGroup() {
    if (!dupes || !dupes[dupIdx]) return;
    const paths = dupes[dupIdx].filter((path) => dupPick[path]);
    if (paths.length > 0) await remove(false, paths);
    nextDupGroup();
  }

  useEffect(() => {
    setDupCount(null);
  }, [current]);

  function toggleTools() {
    setToolsOpen((value) => {
      try {
        localStorage.setItem("pv.tools", value ? "0" : "1");
      } catch {
        /* sin almacenamiento: queda solo en esta sesión */
      }
      return !value;
    });
  }

  function updateConfig(patch: Partial<Config>) {
    const next = { ...config, ...patch };
    setConfig(next);
    void saveConfig(next);
  }

  async function scanDuplicates() {
    if (!current || dupBusy) return;
    setDupBusy(true);
    setDupCount(null);
    try {
      const groups = await findSimilar(current, config.dupMaxDist);
      // Marcadas = las que van a la papelera. Si el grupo mezcla nombres con "(N)" y sin él, se marcan las que
      // chocaron de nombre; si no, se conserva la más pesada y se marcan las demás.
      const sizeOf = (path: string) => files.find((item) => item.path === path)?.size ?? 0;
      const pick: Record<string, boolean> = {};
      for (const group of groups) {
        const copies = group.filter(isCopyName);
        if (copies.length > 0 && copies.length < group.length) {
          for (const path of group) pick[path] = copies.includes(path);
        } else {
          const keep = group.reduce((best, path) => (sizeOf(path) > sizeOf(best) ? path : best), group[0]);
          for (const path of group) pick[path] = path !== keep;
        }
      }
      setDupPick(pick);
      setDupIdx(0);
      setDupCount(groups.length);
      setDupes(groups);
    } catch (error) {
      setToast(String(error));
    } finally {
      setDupBusy(false);
    }
  }

  useEffect(() => {
    if (!focus || viewer) return;
    const node = document.querySelector(`[data-path="${CSS.escape(focus)}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [focus, viewer, files]);

  useEffect(() => {
    const entry = files.find((item) => item.path === focus);
    if (!entry) return;
    requestThumb(entry, ICON_EDGE[iconSize]);
    requestThumb(entry, previewBucket(previewH));
  }, [focus, files, iconSize, previewH]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function targets() {
    if (viewer && focus) return [focus];
    if (selected.length > 0) return selected;
    return focus ? [focus] : [];
  }

  /** Actualiza la lista sin tocar la selección ni la foto abierta (cambios hechos fuera del programa). */
  async function quietRefresh() {
    const folder = currentRef.current;
    if (!folder || folder === COMPUTER) return;
    try {
      const view = await listDir(folder);
      if (currentRef.current !== folder) return;
      rememberDirs(view);
      setFiles(view.entries);
      setSelected((prev) => prev.filter((path) => view.entries.some((entry) => entry.path === path)));
      setFocus((prev) => (prev && view.entries.some((entry) => entry.path === prev) ? prev : null));
    } catch {
      // la carpeta puede haber desaparecido: la próxima acción lo avisa
    }
  }

  /** Valoración y/o etiqueta de las fotos seleccionadas (o de la abierta en el visor). */
  async function applyMeta(patch: { rating?: number; label?: string }) {
    const paths = targets().filter((path) => files.find((entry) => entry.path === path)?.kind !== "dir");
    if (paths.length === 0 || !current || current === COMPUTER) return;
    setMeta((prev) => {
      const next = { ...prev };
      for (const path of paths) {
        const old = next[path] ?? { rating: 0, label: "" };
        const merged = { rating: patch.rating ?? old.rating, label: patch.label ?? old.label };
        if (!merged.rating && !merged.label) delete next[path];
        else next[path] = merged;
      }
      return next;
    });
    try {
      await catalogSet(paths, patch.rating ?? null, patch.label ?? null);
    } catch (error) {
      setToast(String(error));
    }
  }

  async function refresh(folder: string, keep: string[], indexHint: number) {
    const view = await listDir(folder);
    rememberDirs(view);
    const entries = view.entries;
    setFiles(entries);
    const still = keep.filter((path) => entries.some((entry) => entry.path === path));
    const hinted = entries[Math.min(Math.max(indexHint, 0), entries.length - 1)] ?? null;
    const next = still[0] ?? hinted?.path ?? null;
    setFocus(next);
    setSelected(still.length > 0 ? still : next ? [next] : []);
  }

  async function runTransform(op: "left" | "right" | "flipv" | "fliph") {
    const paths = targets().filter((path) => files.find((entry) => entry.path === path)?.kind !== "dir");
    if (paths.length === 0 || busy || !current) return;
    setBusy(true);
    try {
      const report = await transform(paths, op);
      await refresh(current, paths, files.findIndex((entry) => entry.path === paths[0]));
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setToast(summary(report));
    } catch (error) {
      setToast(String(error));
    } finally {
      setBusy(false);
    }
  }

  /** Doble clic / Enter: carpeta → entra; foto o video → visor; otro archivo → programa de Windows. */
  function openEntry(entry: Entry) {
    if (entry.kind === "dir") {
      void openInTree(entry.path);
      return;
    }
    if (entry.kind === "file") {
      openExternal(entry.path).catch((error) => setToast(String(error)));
      return;
    }
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setViewer(true);
  }

  async function remove(permanent: boolean, paths: string[]) {
    if (paths.length === 0 || busy || !current || current === COMPUTER) return;
    // Una carpeta puede tener cosas que no se ven (otros archivos, subcarpetas): avisar antes de mandarla a la papelera.
    const full = files.filter((entry) => paths.includes(entry.path) && entry.kind === "dir" && folderCount(entry) > 0);
    if (full.length > 0) {
      const detail = full.map((entry) => `• ${entry.name}: ${folderSummary(entry)}`).join("\n");
      const yes = await ask(`Estas carpetas tienen contenido:\n\n${detail}\n\n¿Las envío igual a la papelera?`, {
        title: "Eliminar carpeta con contenido",
        kind: "warning",
        okLabel: "Enviar a la papelera",
        cancelLabel: "Cancelar",
      });
      if (!yes) return;
    }
    const index = shown.findIndex((entry) => entry.path === paths[0]);
    setBusy(true);
    try {
      const report = permanent ? await deletePermanent(paths) : await recycle(paths);
      const view = await listDir(current);
      rememberDirs(view);
      const entries = view.entries;
      const next = entries[Math.min(index, Math.max(entries.length - 1, 0))] ?? null;
      setFiles(entries);
      setFocus(next?.path ?? null);
      setSelected(next ? [next.path] : []);
      if (!next) setViewer(false);
      setToast(summary(report));
    } catch (error) {
      setToast(String(error));
    } finally {
      setBusy(false);
    }
  }

  function move(delta: number, extend: boolean) {
    const list = viewer ? photos : shown;
    if (list.length === 0) return;
    const currentIndex = Math.max(0, list.findIndex((entry) => entry.path === focus));
    const next = Math.min(list.length - 1, Math.max(0, currentIndex + delta));
    const path = list[next].path;
    setFocus(path);
    if (extend) {
      const start = Math.min(anchor.current, next);
      const end = Math.max(anchor.current, next);
      setSelected(list.slice(start, end + 1).map((entry) => entry.path));
    } else {
      anchor.current = next;
      setSelected([path]);
    }
    if (viewer) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  }

  function changeZoom(next: number) {
    const clamped = Math.min(6, Math.max(1, next));
    setZoom(clamped);
    if (clamped <= 1.001) setPan({ x: 0, y: 0 });
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (confirmDiscard) {
        if (event.key === "Escape") setConfirmDiscard(false);
        return;
      }
      if (editing || renamingRef.current) return;
      if (pair) {
        if (event.key === "Escape") setPair(null);
        return;
      }
      if (confirmPaths) {
        if (event.key === "Escape") setConfirmPaths(null);
        return;
      }
      const ctrl = event.ctrlKey || event.metaKey;
      if (event.altKey && event.key === "ArrowLeft") {
        event.preventDefault();
        void travel(-1);
        return;
      }
      if (event.altKey && event.key === "ArrowRight") {
        event.preventDefault();
        void travel(1);
        return;
      }
      if (ctrl && event.key.toLowerCase() === "a" && !viewer) {
        event.preventDefault();
        selectAll();
        return;
      }
      if (ctrl && event.key.toLowerCase() === "c") {
        event.preventDefault();
        copySelection(false);
        return;
      }
      if (ctrl && event.key.toLowerCase() === "x") {
        event.preventDefault();
        copySelection(true);
        return;
      }
      if (ctrl && event.key.toLowerCase() === "v") {
        event.preventDefault();
        void doPaste();
        return;
      }
      if (viewer && event.key === " " && !ctrl && !event.altKey) {
        event.preventDefault();
        setPlaying((value) => !value);
        return;
      }
      if (ctrl && event.shiftKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        event.preventDefault();
        void runTransform("fliph");
        return;
      }
      if (ctrl && event.key === "ArrowUp") {
        event.preventDefault();
        void runTransform("flipv");
        return;
      }
      if (ctrl && event.key === "ArrowLeft") {
        event.preventDefault();
        void runTransform("left");
        return;
      }
      if (ctrl && event.key === "ArrowRight") {
        event.preventDefault();
        void runTransform("right");
        return;
      }
      if (event.key === "Delete" && event.shiftKey) {
        event.preventDefault();
        const paths = targets();
        if (paths.length === 0) return;
        if (config.shiftDeleteWithoutAsking) void remove(true, paths);
        else {
          setRemember(false);
          setConfirmPaths(paths);
        }
        return;
      }
      if (event.key === "Delete") {
        event.preventDefault();
        void remove(false, targets());
        return;
      }
        if (viewer) {
        if (event.key === "Escape") {
          if (playing) setPlaying(false);
          else setViewer(false);
        }
        if (event.key === "ArrowLeft" && !ctrl) {
          event.preventDefault();
          move(-1, false);
        }
        if (event.key === "ArrowRight" && !ctrl) {
          event.preventDefault();
          move(1, false);
        }
        if (event.key === "ArrowUp" && !ctrl) {
          event.preventDefault();
          if (zoom <= 1.001) changeZoom(zoom * 1.25);
          else setPan((pos) => ({ ...pos, y: pos.y + 80 }));
        }
        if (event.key === "ArrowDown" && !ctrl) {
          event.preventDefault();
          if (zoom <= 1.001) changeZoom(zoom / 1.25);
          else setPan((pos) => ({ ...pos, y: pos.y - 80 }));
        }
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        move(-1, event.shiftKey);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        move(1, event.shiftKey);
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        move(-columns, event.shiftKey);
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        move(columns, event.shiftKey);
      }
      if (event.key === "F2" && focus && !viewer) {
        event.preventDefault();
        const entry = shown.find((item) => item.path === focus);
        if (entry) startRename(entry);
      }
      if (event.key === "Enter" && focus) {
        const entry = shown.find((item) => item.path === focus);
        if (entry) openEntry(entry);
      }
      if ((event.key === "e" || event.key === "E") && !event.ctrlKey && !event.altKey) {
        const entry = shown.find((item) => item.path === focus);
        if (entry?.kind === "image") {
          event.preventDefault();
          setEditing(true);
        }
      }
      if (event.altKey && event.key === "ArrowUp") {
        event.preventDefault();
        void goUp();
      }
      if (!editing && !ctrl && !event.altKey && !event.shiftKey && /^[0-9]$/.test(event.key)) {
        const n = Number(event.key);
        if (n <= 5) {
          event.preventDefault();
          void applyMeta({ rating: n });
        } else {
          const label = LABELS.find((item) => item.key === event.key);
          if (label) {
            event.preventDefault();
            void applyMeta({ label: meta[focus ?? ""]?.label === label.id ? "" : label.id });
          }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function startRename(entry: Entry) {
    renamingRef.current = entry.path;
    setRenaming(entry.path);
    setDraft(entry.name);
    setFocus(entry.path);
    setSelected([entry.path]);
  }

  async function commitRename() {
    const path = renamingRef.current;
    if (!path) return;
    renamingRef.current = null;
    setRenaming(null);
    const name = draft.trim();
    const currentName = path.split(/[\\/]/).pop() ?? "";
    if (!name || name === currentName || !current) return;
    try {
      const saved = await renameFile(path, name);
      await refresh(current, [saved], 0);
      setFocus(saved);
      setSelected([saved]);
    } catch (error) {
      setToast(String(error));
    }
  }

  function cancelRename() {
    renamingRef.current = null;
    setRenaming(null);
  }

  async function chooseFolder() {
    const selected = await open({ directory: true, multiple: false, title: "Abrir carpeta" });
    if (typeof selected === "string") openPathRef.current(selected);
  }

  function requestCloseEditor() {
    if (confirmDiscard) {
      setConfirmDiscard(false);
      return;
    }
    if (!editorDirty || config.discardEditWithoutAsking) {
      setEditing(false);
      setEditorDirty(false);
      return;
    }
    setForgetDiscard(false);
    setConfirmDiscard(true);
  }

  async function goUp() {
    if (!current || current === COMPUTER) return;
    try {
      const result = await goUpApi(current);
      setViewer(false);
      setEditing(false);
      if (result.computer || !result.folder) {
        setCurrent(COMPUTER);
        setFiles([]);
        setFocus(null);
        setSelected([]);
        setExpanded((prev) => new Set(prev).add(COMPUTER));
        parkTrail();
        return;
      }
      setRoot(result.folder.path);
      setCurrent(result.folder.path);
      pushTrail(result.folder.path);
      setExpanded((prev) => new Set(prev).add(COMPUTER).add(result.folder!.path));
      rememberDirs(result.folder);
      showMedia(result.folder.entries, null);
      const next = { ...config, lastFolder: result.folder.path };
      setConfig(next);
      await saveConfig(next);
    } catch (error) {
      setToast(String(error));
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function openEditor() {
    const entry = shown.find((item) => item.path === focus);
    if (entry?.kind !== "image") {
      setToast("El video solo se mira.");
      return;
    }
    setEditorDirty(false);
    setEditorStart({});
    setEditing(true);
  }

  useEffect(() => {
    setEditBase(editing && focused ? mediaUrl(focused.path, focused.modifiedMs) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  async function onEditorSave(blob: Blob, _pin: boolean, mode: "copy" | "replace", format: "png" | "jpeg" | "webp" | "avif" = "png") {
    if (!focus || !current) return;
    const dataB64 = bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
    await saveEdit(focus, dataB64, mode, format);
    // El editor sigue abierto: solo se actualiza la lista, sin tocar la foto en edición.
    const view = await listDir(current);
    rememberDirs(view);
    setFiles(view.entries);
    setToast(mode === "replace" ? "Imagen guardada. Sigues editando." : "Copia guardada junto al original. Sigues editando.");
  }

  function pushTrail(path: string) {
    if (!path || path === COMPUTER) return;
    const list = trail.current.slice(0, trailAt.current + 1);
    if (list[list.length - 1] !== path) list.push(path);
    trail.current = list.slice(-40);
    trailAt.current = trail.current.length - 1;
    setTrailMark({ at: trailAt.current, len: trail.current.length });
  }

  function parkTrail() {
    trailAt.current = trail.current.length;
    setTrailMark({ at: trailAt.current, len: trail.current.length });
  }

  async function travel(delta: number) {
    const next = trailAt.current + delta;
    if (next < 0 || next >= trail.current.length) return;
    trailAt.current = next;
    setTrailMark({ at: trailAt.current, len: trail.current.length });
    await openInTree(trail.current[next], false);
  }

  function copySelection(cut: boolean) {
    const paths = targets().filter((path) => shown.find((entry) => entry.path === path)?.kind !== "dir");
    if (paths.length === 0) {
      setToast("Elegí fotos o videos.");
      return;
    }
    setClip({ paths, cut });
    setToast(cut ? (paths.length === 1 ? "Listo para mover." : `${paths.length} listos para mover.`) : paths.length === 1 ? "Copiado." : `${paths.length} copiados.`);
  }

  async function doPaste() {
    if (!clip || !current || current === COMPUTER || busy) return;
    setBusy(true);
    try {
      const report = await pasteFiles(current, clip.paths, clip.cut);
      if (clip.cut) setClip(null);
      await refresh(current, report.done, 0);
      if (report.done.length > 0) {
        setSelected(report.done);
        setFocus(report.done[0]);
      }
      setToast(summary(report));
    } catch (error) {
      setToast(String(error));
    } finally {
      setBusy(false);
    }
  }

  function selectAll() {
    if (shown.length === 0) return;
    setSelected(shown.map((entry) => entry.path));
    setFocus((current) => current ?? shown[0].path);
    anchor.current = 0;
    setToast(`${shown.length} seleccionados. Supr los manda a la papelera.`);
  }

  function selectType(ext: string) {
    const paths = shown.filter((entry) => (fileExt(entry.name) || entry.kind) === ext).map((entry) => entry.path);
    setSelected(paths);
    setFocus(paths[0] ?? null);
    setTypeMenu(false);
  }

  function openCompare() {
    const images = shown.filter((entry) => selected.includes(entry.path) && entry.kind === "image");
    if (images.length < 2) {
      setToast("Elegí dos fotos para comparar.");
      return;
    }
    setPlaying(false);
    setViewer(false);
    setPair([images[0], images[1]]);
  }

  async function openInTree(path: string, record = true) {
    if (path === COMPUTER) {
      setCurrent(COMPUTER);
      setFiles(drives);
      setFocus(null);
      setSelected([]);
      setExpanded((prev) => new Set(prev).add(COMPUTER));
      setViewer(false);
      parkTrail();
      return;
    }
    try {
      const view = await listDir(path);
      setRoot(view.path);
      setCurrent(view.path);
      rememberDirs(view);
      showMedia(view.entries, null);
      setExpanded((prev) => new Set(prev).add(COMPUTER).add(view.path));
      setViewer(false);
      const next = { ...config, lastFolder: view.path };
      setConfig(next);
      await saveConfig(next);
      if (record) pushTrail(view.path);
    } catch (error) {
      setToast(String(error));
    }
  }

  async function toggleTree(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
    if (path === COMPUTER || path in children) return;
    try {
      const view = await listDir(path);
      rememberDirs(view);
    } catch (error) {
      setToast(String(error));
    }
  }

  async function setFilmstrip(value: boolean) {
    const next = { ...config, filmstrip: value };
    setConfig(next);
    try {
      await saveConfig(next);
    } catch (error) {
      setToast(String(error));
    }
  }

  useEffect(() => {
    if (!viewer || !playing) return;
    const timer = window.setTimeout(() => {
      const images = shown.filter((entry) => entry.kind === "image");
      if (images.length < 2) {
        setPlaying(false);
        return;
      }
      const index = images.findIndex((entry) => entry.path === focus);
      const next = images[(index + 1 + images.length) % images.length];
      const at = shown.findIndex((entry) => entry.path === next.path);
      anchor.current = at;
      setFocus(next.path);
      setSelected([next.path]);
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [viewer, playing, focus, shown]);

  const focused = shown.find((entry) => entry.path === focus) ?? null;
  const typeNames = [...new Set(photos.map((entry) => fileExt(entry.name) || entry.kind))].sort();
  const rows = Math.ceil(shown.length / columns);

  useEffect(() => {
    if (previewMode !== "ratio" || !info?.width || !info.height) return;
    const imageH = (sideW - 24) * (info.height / info.width);
    const next = Math.min(window.innerHeight - 140, Math.max(180, Math.round(imageH + 92)));
    setPreviewH(next);
  }, [previewMode, info, sideW]);

  function dragSide(event: ReactPointerEvent) {
    event.preventDefault();
    const startX = event.clientX;
    const startW = sideW;
    const move = (e: PointerEvent) => {
      const max = Math.max(240, window.innerWidth - 320);
      setSideW(Math.min(max, Math.max(200, startW + e.clientX - startX)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function dragPreview(event: ReactPointerEvent) {
    event.preventDefault();
    const startY = event.clientY;
    const startH = previewH;
    const move = (e: PointerEvent) => {
      const max = Math.max(180, window.innerHeight - 140);
      setPreviewH(Math.min(max, Math.max(140, startH + startY - e.clientY)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div className="shell">
      {foldersOpen ? (
      <aside className="side" style={{ width: sideW }}>
        <div className="side-tools">
          <button className="icon-btn" title="Ocultar carpetas" aria-label="Ocultar carpetas" onClick={() => setFoldersOpen(false)}>
            <PanelGlyph open />
          </button>
          <button className="icon-btn" title="Subir (Alt+↑)" aria-label="Subir" onClick={() => void goUp()}>
            <UpGlyph />
          </button>
          <button className="icon-btn" title="Atrás (Alt+←)" aria-label="Atrás" disabled={trailMark.at <= 0} onClick={() => void travel(-1)}>
            <ChevronGlyph dir="left" />
          </button>
          <button className="icon-btn" title="Adelante (Alt+→)" aria-label="Adelante" disabled={trailMark.at < 0 || trailMark.at >= trailMark.len - 1} onClick={() => void travel(1)}>
            <ChevronGlyph dir="right" />
          </button>
          <button className="icon-btn gold" title="Abrir carpeta" aria-label="Abrir carpeta" onClick={() => void chooseFolder()}>
            <FolderGlyph />
          </button>
          <div className="seg" role="group" aria-label="Ver carpetas">
            <button className={folderView === "list" ? "on" : ""} title="Carpetas en lista" aria-label="Carpetas en lista" onClick={() => setFolderView("list")}>
              <LinesGlyph />
            </button>
            <button className={folderView === "grid" ? "on" : ""} title="Carpetas en grilla" aria-label="Carpetas en grilla" onClick={() => setFolderView("grid")}>
              <GridGlyph />
            </button>
          </div>
        </div>
        {folderView === "list" ? (
          <Tree
            drives={drives}
            quick={quick}
            current={current ?? COMPUTER}
            children={children}
            expanded={expanded}
            onOpen={(path) => void openInTree(path)}
            onToggle={(path) => void toggleTree(path)}
          />
        ) : (
          <div className="folder-grid">
            {(current && current !== COMPUTER ? (children[current] ?? []).filter((entry) => entry.kind === "dir") : drives).length === 0 && (
              <p className="folder-empty">No hay carpetas adentro.</p>
            )}
            {(current && current !== COMPUTER ? (children[current] ?? []).filter((entry) => entry.kind === "dir") : drives).map((dir) => (
              <button key={dir.path} className="folder-tile" title={dir.name} onClick={() => void openInTree(dir.path)}>
                <FolderGlyph />
                <span>{dir.name}</span>
              </button>
            ))}
          </div>
        )}
        {previewOpen && <div className="split-y" title="Arrastrá para cambiar el preview" onPointerDown={dragPreview} />}
        <div className={previewOpen ? "preview" : "preview closed"} style={previewOpen ? { height: previewH } : undefined}>
          <button type="button" className="tree-section tree-section-btn preview-head" aria-expanded={previewOpen} onClick={togglePreview}>
            <span>{previewOpen ? "▾" : "▸"}</span> Vista previa
          </button>
          <div className="preview-tools" role="group" aria-label="Vista del preview">
            <button className={previewMode === "fit" ? "on" : ""} title="Ajustar" aria-label="Ajustar" onClick={() => setPreviewMode("fit")}>
              <FitGlyph />
            </button>
            <button className={previewMode === "ratio" ? "on" : ""} title="Mantener relación" aria-label="Mantener relación" onClick={() => setPreviewMode("ratio")}>
              <RatioGlyph />
            </button>
            <button className={previewMode === "native" ? "on" : ""} title="Tamaño normal" aria-label="Tamaño normal" onClick={() => setPreviewMode("native")}>
              <NativeGlyph />
            </button>
          </div>
          <div
            className={`preview-frame ${previewMode}`}
            title={focused ? "Doble clic para ver" : undefined}
            onDoubleClick={() => {
              if (!focused) return;
              if (!isMedia(focused)) {
                openEntry(focused);
                return;
              }
              setZoom(1);
              setPan({ x: 0, y: 0 });
              setViewer(true);
            }}
          >
            {focused?.kind === "image" ? (
              previewMode === "native" ? (
                <img
                  src={mediaUrl(focused.path, focused.modifiedMs)}
                  alt=""
                  style={info?.width && info.height ? { width: info.width, height: info.height } : undefined}
                />
              ) : (
                srcFor(focused, previewBucket(previewH)) && (
                  <img src={srcFor(focused, previewBucket(previewH))} alt="" />
                )
              )
            ) : focused?.kind === "video" ? (
              <video src={mediaUrl(focused.path, focused.modifiedMs)} controls muted />
            ) : (
              focused?.kind === "file" ? (
              <span className="preview-file">
                <FileGlyph name={focused.name} size={56} />
              </span>
            ) : (
              <span>{focused?.kind === "dir" ? "Carpeta" : "Sin selección"}</span>
            )
            )}
          </div>
          {focused && <PreviewText entry={focused} info={info} exif={exif} onStripGps={() => void removeGps()} />}
          {focused && isMedia(focused) && (
            <RatingBar meta={meta[focused.path]} onRate={(rating) => void applyMeta({ rating })} onLabel={(label) => void applyMeta({ label })} />
          )}
        </div>
      </aside>
      ) : (
        <button className="rail" title="Mostrar carpetas" aria-label="Mostrar carpetas" onClick={() => setFoldersOpen(true)}>
          <span className="rail-ico">
            <PanelGlyph />
          </span>
        </button>
      )}
      {foldersOpen && <div className="split-x" title="Arrastrá para cambiar el ancho" onPointerDown={dragSide} />}
      <main className="main" ref={gridRef}>
        {!root && (
          <div className="empty">
            <div>
              <p>Elegí una carpeta. Las fotos se quedan en esta PC.</p>
              <button className="icon-btn gold" title="Abrir carpeta" aria-label="Abrir carpeta" onClick={() => void chooseFolder()}>
                <FolderGlyph />
              </button>
            </div>
          </div>
        )}
        {root && (
          <>
            <div className="main-head">
              <Breadcrumb path={current} onGo={(path) => void openInTree(path)} />
              <div className="head-tools">
                <div className="seg" role="group" aria-label="Tamaño de iconos">
                  <button className={iconSize === "list" ? "on" : ""} title="Iconos en lista" aria-label="Iconos en lista" onClick={() => setIconSize("list")}><LinesGlyph /></button>
                  <button className={iconSize === "medium" ? "on" : ""} title="Iconos medianos" aria-label="Iconos medianos" onClick={() => setIconSize("medium")}><GridGlyph /></button>
                  <button className={iconSize === "large" ? "on" : ""} title="Iconos grandes" aria-label="Iconos grandes" onClick={() => setIconSize("large")}><LargeGlyph /></button>
                </div>
                <div className="seg" role="group" aria-label="Portapapeles">
                  <button title="Copiar (Ctrl+C)" aria-label="Copiar" onClick={() => copySelection(false)}><CopyGlyph /></button>
                  <button title="Cortar (Ctrl+X)" aria-label="Cortar" onClick={() => copySelection(true)}><CutGlyph /></button>
                  <button title="Pegar (Ctrl+V)" aria-label="Pegar" disabled={!clip} onClick={() => void doPaste()}><PasteGlyph /></button>
                </div>
                <div className="seg" role="group" aria-label="Editar">
                  <button className="primary" title="Editar la foto (E)" aria-label="Editar" disabled={focused?.kind !== "image"} onClick={openEditor}><EditGlyph /></button>
                </div>
                <div className="seg" role="group" aria-label="Eliminar">
                  <button className="del" title="Enviar a la papelera (Supr)" aria-label="Eliminar" disabled={busy || !current || current === COMPUTER || targets().length === 0} onClick={() => void remove(false, targets())}><TrashGlyph /></button>
                </div>
                <div className="seg" role="group" aria-label="Selección">
                  <div className="menu-anchor">
                    <button className={typeMenu ? "on" : ""} title="Seleccionar por tipo" aria-label="Seleccionar por tipo" onClick={() => setTypeMenu((value) => !value)}><SelectTypeGlyph /></button>
                    {typeMenu && (
                      <div className="menu" role="menu">
                        <button onClick={() => { selectAll(); setTypeMenu(false); }}>Todos</button>
                        {typeNames.map((ext) => (
                          <button key={ext} onClick={() => selectType(ext)}>{ext.toUpperCase()}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {studioHere && (
                  <div className="seg" role="group" aria-label="Studio">
                    <button className="friend-btn" title="Abrir en el Studio (IA: prompts, motores, quitar fondo, ampliar…)" aria-label="Abrir en el Studio" onClick={() => void openInStudio()}>
                      <StudioGlyph />
                    </button>
                  </div>
                )}
                <div className="seg" role="group" aria-label="Orden">
                  <button className={sortKey === "name" ? "on" : ""} title={sortKey === "name" && sortDir === "desc" ? "Nombre, descendente" : "Nombre, ascendente"} aria-label="Ordenar por nombre" onClick={() => toggleSort("name")}><NameGlyph /></button>
                  <button className={sortKey === "type" ? "on" : ""} title={sortKey === "type" && sortDir === "desc" ? "Tipo, descendente" : "Tipo, ascendente"} aria-label="Ordenar por tipo" onClick={() => toggleSort("type")}><TypeGlyph /></button>
                  <button className={sortKey === "size" ? "on" : ""} title={sortKey === "size" && sortDir === "desc" ? "Peso, descendente" : "Peso, ascendente"} aria-label="Ordenar por peso" onClick={() => toggleSort("size")}><SizeGlyph /></button>
                  <button title={sortDir === "asc" ? "Ascendente" : "Descendente"} aria-label={sortDir === "asc" ? "Ascendente" : "Descendente"} onClick={() => setSortDir((dir) => (dir === "asc" ? "desc" : "asc"))}>
                    {sortDir === "asc" ? <UpGlyph /> : <DownGlyph />}
                  </button>
                </div>
                <div className="seg" role="group" aria-label="Configuración">
                  <button className={settingsOpen ? "on" : ""} title="Configuración" aria-label="Configuración" onClick={() => setSettingsOpen(true)}>
                    <SettingsGlyph />
                  </button>
                </div>
              </div>
            </div>
            {shown.length === 0 ? (
              <div className="grid-scroll">
                <div className="empty">
                  <p>{filtering ? "Ninguna foto coincide con el filtro." : "Esta carpeta está vacía."}</p>
                </div>
              </div>
            ) : (
              <Grid
                  files={shown}
                  columns={columns}
                  rows={rows}
                  rowH={metrics.row}
                  gap={metrics.gap}
                  iconSize={iconSize}
                  edge={ICON_EDGE[iconSize]}
                  selected={selected}
                  meta={meta}
                  thumbSrc={(entry) => srcFor(entry, ICON_EDGE[iconSize])}
                  thumbRev={thumbRev}
                  requestThumb={requestThumb}
                  onSelect={(paths, additive) => {
                    setSelected((prev) => (additive ? [...new Set([...prev, ...paths])] : paths));
                    const last = paths[paths.length - 1];
                    if (last) {
                      setFocus(last);
                      anchor.current = shown.findIndex((entry) => entry.path === last);
                    } else if (!additive) {
                      setFocus(null);
                    }
                  }}
                  onClick={(event, index) => {
                    const path = shown[index].path;
                    if (event.shiftKey) {
                      const start = Math.min(anchor.current, index);
                      const end = Math.max(anchor.current, index);
                      setSelected(shown.slice(start, end + 1).map((entry) => entry.path));
                      setFocus(path);
                    } else if (event.ctrlKey || event.metaKey) {
                      setSelected((prev) =>
                        prev.includes(path) ? prev.filter((item) => item !== path) : [...prev, path],
                      );
                      setFocus(path);
                      anchor.current = index;
                    } else {
                      setSelected([path]);
                      setFocus(path);
                      anchor.current = index;
                    }
                  }}
                  renaming={renaming}
                  draft={draft}
                  onDraft={setDraft}
                  onStartRename={startRename}
                  onCommitRename={() => void commitRename()}
                  onCancelRename={cancelRename}
                  onOpen={(index) => {
                    const entry = shown[index];
                    setSelected([entry.path]);
                    setFocus(entry.path);
                    anchor.current = index;
                    openEntry(entry);
                  }}
              />
            )}
            <div className="hint">
              <span>
                {busy
                  ? "Trabajando…"
                  : selected.length > 1
                    ? `${selected.length} seleccionados`
                    : `${shown.filter((entry) => entry.kind === "dir").length} carpetas · ${shown.filter((entry) => entry.kind !== "dir").length} archivos`}
              </span>
              <span>Ctrl+A marca todo · Supr borra lo marcado · Ctrl+clic suma · Mayús+clic un rango</span>
            </div>
          </>
        )}
      </main>
      {root && (
        <aside className={`tools ${toolsOpen ? "open" : ""}`} aria-label="Herramientas">
          <button className="icon-btn tools-toggle" title={toolsOpen ? "Ocultar herramientas" : "Mostrar herramientas"} aria-label={toolsOpen ? "Ocultar herramientas" : "Mostrar herramientas"} onClick={toggleTools}>
            <ToolsGlyph open={toolsOpen} />
          </button>
          <section className="tool">
            <button className={`tool-head ${filtering ? "on" : ""}`} title="Filtrar por estrellas o etiqueta" onClick={() => !toolsOpen && toggleTools()}>
              <FilterGlyph />
              {toolsOpen && <span>Filtrar</span>}
            </button>
            {toolsOpen && (
              <div className="tool-body">
                <p className="menu-title">Valoración mínima</p>
                <div className="tool-list">
                  {[0, 1, 2, 3, 4, 5].map((n) => (
                    <button key={n} className={filterRating === n ? "on" : ""} onClick={() => setFilterRating(n)}>
                      {n === 0 ? "Todas" : `${"★".repeat(n)} o más`}
                    </button>
                  ))}
                </div>
                <p className="menu-title">Etiqueta</p>
                <div className="menu-labels">
                  <button className={filterLabel === "" ? "on" : ""} onClick={() => setFilterLabel("")}>Todas</button>
                  {LABELS.map((item) => (
                    <button
                      key={item.id}
                      className={`dot ${filterLabel === item.id ? "on" : ""}`}
                      style={{ background: item.color }}
                      title={item.name}
                      aria-label={item.name}
                      onClick={() => setFilterLabel(filterLabel === item.id ? "" : item.id)}
                    />
                  ))}
                </div>
                {filtering && (
                  <button className="tool-action" onClick={() => { setFilterRating(0); setFilterLabel(""); }}>Quitar filtros</button>
                )}
              </div>
            )}
          </section>
          <section className="tool">
            <button className="tool-head" title="Comparar dos fotos" onClick={() => (toolsOpen ? openCompare() : toggleTools())}>
              <CompareGlyph />
              {toolsOpen && <span>Comparar</span>}
            </button>
            {toolsOpen && (
              <div className="tool-body">
                <p className="tool-hint">Elige dos fotos de la carpeta y míralas lado a lado.</p>
                <button className="tool-action" onClick={openCompare}>Comparar dos fotos</button>
              </div>
            )}
          </section>
          <section className="tool">
            <button className="tool-head" title="Buscar fotos duplicadas o parecidas en esta carpeta" disabled={dupBusy} onClick={() => (toolsOpen ? void scanDuplicates() : toggleTools())}>
              {dupBusy ? <SpinnerGlyph /> : <CopyGlyph />}
              {toolsOpen && <span>Duplicados</span>}
            </button>
            {toolsOpen && (
              <div className="tool-body">
                <p className="tool-hint">
                  {dupBusy
                    ? "Buscando fotos parecidas…"
                    : dupCount === null
                      ? "Busca copias y fotos casi iguales en esta carpeta."
                      : dupCount === 0
                        ? "No encontré duplicados en esta carpeta."
                        : `${dupCount} grupo${dupCount === 1 ? "" : "s"} encontrado${dupCount === 1 ? "" : "s"}.`}
                </p>
                <button className="tool-action" disabled={dupBusy || !current} onClick={() => void scanDuplicates()}>
                  {dupBusy ? "Buscando…" : dupCount === null ? "Buscar duplicados" : "Buscar de nuevo"}
                </button>
              </div>
            )}
          </section>
        </aside>
      )}
      {viewer && focused && isMedia(focused) && (
        <Viewer
          file={focused}
          files={photos}
          filmstrip={config.filmstrip}
          meta={meta[focused.path]}
          onRate={(rating) => void applyMeta({ rating })}
          onLabel={(label) => void applyMeta({ label })}
          zoom={zoom}
          pan={pan}
          edge={ICON_EDGE[iconSize]}
          thumbSrc={(entry) => srcFor(entry, ICON_EDGE[iconSize])}
          thumbRev={thumbRev}
          onClose={() => {
            setPlaying(false);
            setViewer(false);
          }}
          onToggleFilmstrip={() => void setFilmstrip(!config.filmstrip)}
          onEdit={openEditor}
          onDelete={() => void remove(false, [focused.path])}
          busy={busy}
          onStudio={studioHere ? () => void openInStudio() : undefined}
          canEdit={focused.kind === "image"}
          playing={playing}
          onTogglePlay={() => setPlaying((value) => !value)}
          onFocus={(path) => {
            setFocus(path);
            setSelected([path]);
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
          onZoom={changeZoom}
          onPan={setPan}
          requestThumb={requestThumb}
        />
      )}
      {pair && (
        <div className="compare" role="dialog" aria-modal="true">
          <div className="compare-bar">
            <strong>Comparar</strong>
            <button className="icon-btn" title="Cerrar (Esc)" aria-label="Cerrar" onClick={() => setPair(null)}>
              <CloseGlyph />
            </button>
          </div>
          <div className="compare-panes">
            {pair.map((entry) => (
              <figure key={entry.path}>
                <img src={mediaUrl(entry.path, entry.modifiedMs)} alt={entry.name} />
                <figcaption>{entry.name}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}
      {settingsOpen && (
        <div className="scrim" onPointerDown={(event) => event.target === event.currentTarget && setSettingsOpen(false)}>
          <div className="dialog settings" role="dialog" aria-modal="true" aria-label="Configuración">
            <h2>Configuración</h2>
            <div className="set-body">
              <section className="set-sec">
                <h3>Apariencia</h3>
                <label className="set-row">
                  <span>Tamaño de los íconos</span>
                  <select value={iconSize} onChange={(event) => setIconSize(event.target.value as IconSize)}>
                    <option value="list">Lista</option>
                    <option value="medium">Medianos</option>
                    <option value="large">Grandes</option>
                  </select>
                </label>
                <label className="set-row">
                  <span>Panel de carpetas</span>
                  <input type="checkbox" checked={foldersOpen} onChange={(event) => setFoldersOpen(event.target.checked)} />
                </label>
                <label className="set-row">
                  <span>Panel de herramientas</span>
                  <input type="checkbox" checked={toolsOpen} onChange={(event) => event.target.checked !== toolsOpen && toggleTools()} />
                </label>
              </section>
              <section className="set-sec">
                <h3>Duplicados</h3>
                <label className="set-row">
                  <span>Qué tan parecidas deben ser</span>
                  <select value={config.dupMaxDist} onChange={(event) => updateConfig({ dupMaxDist: Number(event.target.value) })}>
                    <option value={2}>Casi idénticas</option>
                    <option value={4}>Normal</option>
                    <option value={8}>Amplio</option>
                    <option value={12}>Muy amplio</option>
                  </select>
                </label>
                <p className="set-hint">Con «Amplio» aparecen más grupos, pero también fotos solo parecidas. Los nombres con (N) o «copia» se agrupan con un margen extra.</p>
              </section>
              <section className="set-sec">
                <h3>Calidad al guardar ediciones</h3>
                {(
                  [
                    ["JPG", "jpegQuality", 50, 100],
                    ["WebP", "webpQuality", 30, 100],
                    ["AVIF", "avifQuality", 30, 100],
                  ] as const
                ).map(([label, key, min, max]) => (
                  <label className="set-row" key={key}>
                    <span>{label}</span>
                    <span className="set-range">
                      <input type="range" min={min} max={max} value={config[key]} onChange={(event) => updateConfig({ [key]: Number(event.target.value) })} />
                      <output>{config[key]}</output>
                    </span>
                  </label>
                ))}
                <p className="set-hint">Más alto = más fiel y más pesado. Cada formato se usa cuando la foto original es de ese mismo formato.</p>
              </section>
              <section className="set-sec">
                <h3>Confirmaciones</h3>
                <label className="set-row">
                  <span>Preguntar antes de borrar sin papelera</span>
                  <input type="checkbox" checked={!config.shiftDeleteWithoutAsking} onChange={(event) => updateConfig({ shiftDeleteWithoutAsking: !event.target.checked })} />
                </label>
                <label className="set-row">
                  <span>Preguntar al cerrar el editor con cambios</span>
                  <input type="checkbox" checked={!config.discardEditWithoutAsking} onChange={(event) => updateConfig({ discardEditWithoutAsking: !event.target.checked })} />
                </label>
              </section>
            </div>
            <div className="dialog-actions">
              <button className="text-btn" onClick={() => setSettingsOpen(false)}>Listo</button>
            </div>
          </div>
        </div>
      )}
      {dupes && dupes[dupIdx] && (
        <div className="scrim">
          <div className="dialog dupes" role="dialog" aria-modal="true">
            <h2>Fotos duplicadas o parecidas</h2>
            <p>
              Grupo {dupIdx + 1} de {dupes.length}. Las marcadas van a la papelera; puedes cambiar las marcas.
            </p>
            <div className="dupes-list">
              <div className="dupes-group">
                {dupes[dupIdx].map((path) => (
                  <label className="dupes-item" key={path} title={path}>
                    <DupThumb path={path} />
                    <span className="dupes-name">{path.split(/[\\/]/).pop()}</span>
                    {isCopyName(path) && <span className="dupes-tag" title="El nombre termina en (N) o «copia»: chocó con otro archivo">posible copia</span>}
                    <input
                      type="checkbox"
                      checked={!!dupPick[path]}
                      onChange={(event) => setDupPick((prev) => ({ ...prev, [path]: event.target.checked }))}
                    />
                  </label>
                ))}
              </div>
            </div>
            <div className="dialog-actions">
              <button className="text-btn" onClick={() => setDupes(null)}>Descartar todos</button>
              <button className="text-btn" onClick={() => nextDupGroup()}>
                {dupIdx + 1 < dupes.length ? "Saltar" : "Terminar"}
              </button>
              <button
                className="danger"
                disabled={busy || !dupes[dupIdx].some((path) => dupPick[path])}
                onClick={() => void trashDupGroup()}
              >
                A la papelera ({dupes[dupIdx].filter((path) => dupPick[path]).length}) y siguiente
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmPaths && (
        <div className="scrim">
          <div className="dialog" role="dialog" aria-modal="true">
            <h2>Borrar sin papelera</h2>
            <p>
              {confirmPaths.length === 1
                ? "Este archivo se borra de forma permanente."
                : `Se borran ${confirmPaths.length} archivos de forma permanente.`}
            </p>
            <label>
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
              />
              No volver a preguntar
            </label>
            <div className="dialog-actions">
              <button className="text-btn" onClick={() => setConfirmPaths(null)}>Cancelar</button>
              <button
                className="danger"
                onClick={() => {
                  const paths = confirmPaths;
                  setConfirmPaths(null);
                  if (remember) {
                    const next = { ...config, shiftDeleteWithoutAsking: true };
                    setConfig(next);
                    void saveConfig(next);
                  }
                  void remove(true, paths);
                }}
              >
                Borrar
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmDiscard && (
        <div className="scrim">
          <div className="dialog" role="dialog" aria-modal="true">
            <h2>Cerrar la edición</h2>
            <p>Si cerrás ahora, se pierden los cambios de esta foto.</p>
            <label>
              <input type="checkbox" checked={forgetDiscard} onChange={(event) => setForgetDiscard(event.target.checked)} />
              No volver a preguntar
            </label>
            <div className="dialog-actions">
              <button className="text-btn" onClick={() => setConfirmDiscard(false)}>Seguir</button>
              <button
                className="danger"
                onClick={() => {
                  setConfirmDiscard(false);
                  if (forgetDiscard) {
                    const next = { ...config, discardEditWithoutAsking: true };
                    setConfig(next);
                    void saveConfig(next);
                  }
                  setEditing(false);
                  setEditorDirty(false);
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
      {editing && focused?.kind === "image" && (
        <Editor
          src={editBase || mediaUrl(focused.path, focused.modifiedMs)}
          local
          folderSave
          styleThumbs={STYLE_THUMBS}
          onCancel={requestCloseEditor}
          onDirtyChange={setEditorDirty}
          outputType={
            /\.jpe?g$/i.test(focused.path)
              ? "image/jpeg"
              : /\.webp$/i.test(focused.path)
                ? "image/webp"
                : /\.avif$/i.test(focused.path)
                  ? "image/avif"
                  : "image/png"
          }
          onSave={onEditorSave}
          onSuggestTilt={() => suggestTilt(focused.path)}
          startTool={editorStart.tool}
          startAiMode={editorStart.mode}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function PreviewText(props: { entry: Entry; info: FileInfo | null; exif: ExifSummary | null; onStripGps: () => void }) {
  const dims =
    props.info?.width && props.info.height ? `${props.info.width} × ${props.info.height}` : props.entry.kind === "video" ? "Video" : "";
  const e = props.exif;
  const shot = e ? [e.focal, e.aperture, e.exposure, e.iso ? `ISO ${e.iso}` : null].filter(Boolean).join(" · ") : "";
  const hasGps = e?.lat != null && e.lon != null;
  return (
    <>
      <p className="name">{props.entry.name}</p>
      <p className="meta">
        {[dims, formatSize(props.info?.size ?? props.entry.size), formatWhen(props.info?.modifiedMs ?? props.entry.modifiedMs)]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {e && (e.camera || e.lens || e.taken || shot || hasGps) && (
        <div className="exif">
          {e.camera && <p className="meta">{e.camera}</p>}
          {e.lens && <p className="meta">{e.lens}</p>}
          {shot && <p className="meta">{shot}</p>}
          {e.taken && <p className="meta">{e.taken}</p>}
          {hasGps && (
            <p className="meta">
              Ubicación: {e.lat!.toFixed(5)}, {e.lon!.toFixed(5)}{" "}
              <button className="text-btn" title="Borra las coordenadas GPS del archivo; la foto no cambia" onClick={props.onStripGps}>
                Quitar
              </button>
            </p>
          )}
        </div>
      )}
    </>
  );
}

function summary(report: BatchReport) {
  const parts: string[] = [];
  if (report.done.length > 0) parts.push(`${report.done.length} listo${report.done.length === 1 ? "" : "s"}`);
  if (report.skipped.length > 0) parts.push(`${report.skipped.length} omitido${report.skipped.length === 1 ? "" : "s"}`);
  if (report.errors.length > 0) parts.push(report.errors[0]);
  return parts.join(" · ") || "Sin cambios";
}

function Grid(props: {
  files: Entry[];
  columns: number;
  rows: number;
  rowH: number;
  gap: number;
  iconSize: IconSize;
  edge: number;
  selected: string[];
  meta: Record<string, Meta>;
  thumbSrc: (entry: Entry) => string | undefined;
  thumbRev: number;
  requestThumb: (entry: Entry, edge: number) => void;
  onClick: (event: MouseEvent, index: number) => void;
  onOpen: (index: number) => void;
  onSelect: (paths: string[], additive: boolean) => void;
  renaming: string | null;
  draft: string;
  onDraft: (value: string) => void;
  onStartRename: (entry: Entry) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState({ start: 0, end: 8, height: 600 });
  const [band, setBand] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      const start = Math.max(0, Math.floor(el.scrollTop / props.rowH) - 2);
      const end = Math.min(props.rows, Math.ceil((el.scrollTop + el.clientHeight) / props.rowH) + 2);
      setRange({ start, end, height: el.clientHeight });
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [props.rows, props.columns, props.rowH]);

  const indexes: number[] = [];
  for (let row = range.start; row < range.end; row += 1) indexes.push(row);

  function onBackgroundDown(event: ReactPointerEvent) {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest(".cell") || target.closest("input")) return;
    const host = scrollRef.current;
    if (!host) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const additive = event.ctrlKey || event.metaKey || event.shiftKey;
    const move = (e: PointerEvent) => {
      setBand({
        x: Math.min(startX, e.clientX),
        y: Math.min(startY, e.clientY),
        w: Math.abs(e.clientX - startX),
        h: Math.abs(e.clientY - startY),
      });
    };
    const up = (e: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const rect = new DOMRect(
        Math.min(startX, e.clientX),
        Math.min(startY, e.clientY),
        Math.abs(e.clientX - startX),
        Math.abs(e.clientY - startY),
      );
      setBand(null);
      if (rect.width < 4 && rect.height < 4) {
        if (!additive) props.onSelect([], false);
        return;
      }
      const paths: string[] = [];
      host.querySelectorAll<HTMLElement>("[data-path]").forEach((node) => {
        const box = node.getBoundingClientRect();
        const hit = box.left < rect.right && box.right > rect.left && box.top < rect.bottom && box.bottom > rect.top;
        if (hit && node.dataset.path) paths.push(node.dataset.path);
      });
      props.onSelect(paths, additive);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div className="grid-scroll" ref={scrollRef} onPointerDown={onBackgroundDown}>
      {band && <div className="band" style={{ left: band.x, top: band.y, width: band.w, height: band.h }} />}
      <div className="grid-space" style={{ height: props.rows * props.rowH }}>
        {indexes.map((row) => (
          <div
            key={row}
            className="grid-row"
            style={{
              top: row * props.rowH,
              height: props.rowH - props.gap,
              gridTemplateColumns: `repeat(${props.columns}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: props.columns }, (_, col) => {
              const index = row * props.columns + col;
              const entry = props.files[index];
              if (!entry) return <div key={col} />;
              const src = props.thumbSrc(entry);
              const editingName = props.renaming === entry.path;
              return (
                <div
                  key={entry.path}
                  data-path={entry.path}
                  className={`cell ${props.iconSize}${props.selected.includes(entry.path) ? " selected" : ""}`}
                  onClick={(event) => props.onClick(event, index)}
                  onDoubleClick={() => props.onOpen(index)}
                >
                  {entry.kind === "dir" ? (
                    <div className={`thumb folder${folderCount(entry) === 0 ? " no-items" : ""}`} title={folderSummary(entry)}>
                      <FolderGlyph />
                    </div>
                  ) : entry.kind === "file" ? (
                    <div className="thumb file" title={entry.name}>
                      <FileGlyph name={entry.name} size={props.iconSize === "list" ? 22 : 48} />
                    </div>
                  ) : (
                    <Thumb entry={entry} edge={props.edge} src={src} requestThumb={props.requestThumb} tick={props.thumbRev} />
                  )}
                  {editingName ? (
                    <input
                      className="name-edit"
                      value={props.draft}
                      autoFocus
                      aria-label="Nuevo nombre"
                      onClick={(event) => event.stopPropagation()}
                      onDoubleClick={(event) => event.stopPropagation()}
                      onChange={(event) => props.onDraft(event.target.value)}
                      onKeyDown={(event) => {
                        event.stopPropagation();
                        if (event.key === "Enter") props.onCommitRename();
                        if (event.key === "Escape") props.onCancelRename();
                      }}
                      onBlur={props.onCommitRename}
                    />
                  ) : (
                    <b
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        props.onStartRename(entry);
                      }}
                    >
                      {entry.name}
                    </b>
                  )}
                  {entry.kind === "dir" && props.iconSize !== "list" && !editingName && <small className="folder-info">{folderSummary(entry)}</small>}
                  <Badge meta={props.meta[entry.path]} />
                  {props.iconSize === "list" && !editingName && (
                    <>
                      <em title={entry.kind === "dir" ? folderSummary(entry) : undefined}>
                        {entry.kind === "dir" ? folderSummary(entry) : fileExt(entry.name) || entry.kind}
                      </em>
                      <em>{formatSize(entry.size)}</em>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

const isMedia = (entry: Entry) => entry.kind === "image" || entry.kind === "video";

/** Los discos de «Este equipo» no traen conteo: se muestran normales, no como carpetas vacías. */
const isDrive = (entry: Entry) => /^[A-Za-z]:.?$/.test(entry.path);

function folderCount(entry: Entry) {
  if (isDrive(entry)) return 1;
  return (entry.dirs ?? 0) + (entry.media ?? 0) + (entry.others ?? 0) + (entry.hidden ?? 0);
}

/** «3 carpetas · 12 fotos · 2 otros» (lo que no es foto ni video no se ve en la vista, pero cuenta). */
function folderSummary(entry: Entry) {
  if (isDrive(entry)) return "Disco";
  const parts: string[] = [];
  if (entry.dirs) parts.push(`${entry.dirs} ${entry.dirs === 1 ? "carpeta" : "carpetas"}`);
  if (entry.media) parts.push(`${entry.media} ${entry.media === 1 ? "foto o video" : "fotos y videos"}`);
  if (entry.hidden) parts.push(`${entry.hidden} ${entry.hidden === 1 ? "oculto" : "ocultos"}`);
  if (entry.others) parts.push(`${entry.others} ${entry.others === 1 ? "otro archivo" : "otros archivos"}`);
  return parts.length > 0 ? parts.join(" · ") : "Vacía";
}

/** Windows agrega "(2)" o "- copia" al nombre cuando choca con otro archivo. */
function isCopyName(path: string) {
  const name = path.split(/[\\/]/).pop() ?? path;
  return /\s*\(\d+\)\.[^.]+$/.test(name) || /\s-\s(copia|copy)(\s*\(\d+\))?\.[^.]+$/i.test(name);
}

function DupThumb(props: { path: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let live = true;
    thumbnail(props.path, 128, "sharp")
      .then((b64) => live && setSrc(`data:image/jpeg;base64,${b64}`))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [props.path]);
  return src ? <img className="dupes-thumb" src={src} alt="" /> : <span className="dupes-thumb" />;
}

function NativeGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <text x="8" y="11" textAnchor="middle" fontSize="7.5" fill="currentColor" fontFamily="Segoe UI, sans-serif">1:1</text>
    </svg>
  );
}

function Thumb(props: {
  entry: Entry;
  edge: number;
  src: string | undefined;
  requestThumb: (entry: Entry, edge: number) => void;
  tick: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || props.entry.kind !== "image") return;
    const observer = new IntersectionObserver((items) => {
      if (items.some((item) => item.isIntersecting)) props.requestThumb(props.entry, props.edge);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [props.entry.path, props.entry.modifiedMs, props.edge]);
  return (
    <div className="thumb" ref={ref}>
      {props.src ? <img src={props.src} alt="" /> : <span>{props.entry.kind === "video" ? "Video" : ""}</span>}
    </div>
  );
}
