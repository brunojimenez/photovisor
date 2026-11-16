import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import Editor from "./editor/Editor";
import {
  assetUrl,
  bgFix,
  cancelAi,
  createAiSession,
  detectPerson,
  inpaint,
  outputsOfJob,
  upscale,
  watchJob,
} from "./studioAi";
import {
  deletePermanent,
  fileInfo,
  COMPUTER,
  goUp as goUpApi,
  launchFolder,
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
  thumbnail,
  transform,
  userFolder,
  mediaUrl,
  aiStatus,
  type AiStatus,
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
import { Tree } from "./Tree";
import { Viewer } from "./Viewer";

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
};

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
  const [iconSize, setIconSize] = useState<IconSize>("large");
  const [folderView, setFolderView] = useState<"list" | "grid">("list");
  const [drives, setDrives] = useState<Entry[]>([]);
  const [quick, setQuick] = useState<Entry[]>([]);
  const [foldersOpen, setFoldersOpen] = useState(true);
  const [editorDirty, setEditorDirty] = useState(false);
  const [ai, setAi] = useState<AiStatus>({ comfy: false, studio: false });
  const [aiJob, setAiJob] = useState<{ id: string; label: string } | null>(null);
  const [aiLog, setAiLog] = useState<string[]>([]);
  const [aiChoices, setAiChoices] = useState<{ id: string; url: string }[] | null>(null);
  const [aiSrc, setAiSrc] = useState<string | null>(null);
  const aiSid = useRef<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [forgetDiscard, setForgetDiscard] = useState(false);
  const [clip, setClip] = useState<{ paths: string[]; cut: boolean } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pair, setPair] = useState<[Entry, Entry] | null>(null);
  const [typeMenu, setTypeMenu] = useState(false);
  const trail = useRef<string[]>([]);
  const trailAt = useRef(-1);
  const [trailMark, setTrailMark] = useState({ at: -1, len: 0 });
  const [sideW, setSideW] = useState(292);
  const [previewH, setPreviewH] = useState(300);
  const [previewMode, setPreviewMode] = useState<"fit" | "ratio" | "native">("fit");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const renamingRef = useRef<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [info, setInfo] = useState<FileInfo | null>(null);
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
    const hit = entries.find((entry) => entry.path === wanted) ?? entries.find((entry) => entry.kind !== "dir") ?? entries[0] ?? null;
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
      const asked = await launchFolder().catch(() => null);
      const home = await userFolder().catch(() => null);
      const start = asked || home;
      if (!start || !live) return;
      try {
        const view = await openRoot(start);
        if (!live) return;
        setRoot(view.path);
        setCurrent(view.path);
        setChildren({ [view.path]: view.entries.filter((entry) => entry.kind === "dir") });
        const firstPhoto = view.entries.find((entry) => entry.kind !== "dir");
        setFiles(view.entries);
        setFocus(view.focus ?? firstPhoto?.path ?? view.entries[0]?.path ?? null);
        setSelected(view.focus ? [view.focus] : firstPhoto ? [firstPhoto.path] : view.entries[0] ? [view.entries[0].path] : []);
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

  const shown = useMemo(() => {
    const dirs = sortEntries(files.filter((entry) => entry.kind === "dir"), sortKey, sortDir);
    const media = sortEntries(files.filter((entry) => entry.kind !== "dir"), sortKey, sortDir);
    return [...dirs, ...media];
  }, [files, sortKey, sortDir]);
  const photos = useMemo(() => shown.filter((entry) => entry.kind !== "dir"), [shown]);
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

  async function remove(permanent: boolean, paths: string[]) {
    if (paths.length === 0 || busy || !current) return;
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
        if (entry?.kind === "dir") {
          void openInTree(entry.path);
          return;
        }
        setZoom(1);
        setPan({ x: 0, y: 0 });
        setViewer(true);
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

  useEffect(() => {
    let live = true;
    const tick = async () => {
      try {
        const status = await aiStatus();
        if (live) setAi(status);
      } catch {
        if (live) setAi({ comfy: false, studio: false });
      }
    };
    void tick();
    const timer = window.setInterval(() => void tick(), 4000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!aiJob || !aiSid.current) return;
    const sid = aiSid.current;
    const jobId = aiJob.id;
    return watchJob(sid, jobId, setAiLog, (session) => {
      const job = (session.messages || []).find((message) => message.id === jobId);
      setAiJob(null);
      if (job?.job_status === "error") {
        const line = (job.log_text || "").split("\n").filter(Boolean).pop();
        setToast(line || "La IA no pudo terminar.");
        return;
      }
      const images = outputsOfJob(session, jobId);
      if (!images.length) {
        setToast("La IA no devolvió una imagen.");
        return;
      }
      setAiChoices(images.map((image) => ({ id: image.id, url: `${assetUrl(image.id)}?t=${image.id}` })));
    });
  }, [aiJob]);

  async function studioSession() {
    if (aiSid.current) return aiSid.current;
    const session = await createAiSession();
    aiSid.current = session.id;
    return session.id;
  }

  async function beginAi(label: string, run: (sid: string) => Promise<{ job_id: string }>) {
    const sid = await studioSession();
    setAiLog([]);
    setAiChoices(null);
    const started = await run(sid);
    setAiJob({ id: started.job_id, label });
  }

  function openEditor() {
    const entry = shown.find((item) => item.path === focus);
    if (entry?.kind !== "image") {
      setToast("El video solo se mira.");
      return;
    }
    setEditorDirty(false);
    setAiSrc(null);
    setAiChoices(null);
    setAiJob(null);
    setAiLog([]);
    setEditing(true);
  }

  useEffect(() => {
    setEditBase(editing && focused ? mediaUrl(focused.path, focused.modifiedMs) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  async function onEditorSave(blob: Blob, _pin: boolean, mode: "copy" | "replace") {
    if (!focus || !current) return;
    const dataB64 = bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
    await saveEdit(focus, dataB64, mode);
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
      setFiles([]);
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
        <div className="split-y" title="Arrastrá para cambiar el preview" onPointerDown={dragPreview} />
        <div className="preview" style={{ height: previewH }}>
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
              <span>{focused?.kind === "dir" ? "Carpeta" : "Sin selección"}</span>
            )}
          </div>
          {focused && <PreviewText entry={focused} info={info} />}
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
                <div className="seg" role="group" aria-label="Eliminar">
                  <button title="Enviar a la papelera (Supr)" aria-label="Eliminar" disabled={busy || !current || current === COMPUTER || targets().length === 0} onClick={() => void remove(false, targets())}><TrashGlyph /></button>
                </div>
                <div className="seg" role="group" aria-label="Selección">
                  <button title="Comparar dos fotos" aria-label="Comparar" onClick={openCompare}><CompareGlyph /></button>
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
                <div className="seg" role="group" aria-label="Orden">
                  <button className={sortKey === "name" ? "on" : ""} title={sortKey === "name" && sortDir === "desc" ? "Nombre, descendente" : "Nombre, ascendente"} aria-label="Ordenar por nombre" onClick={() => toggleSort("name")}><NameGlyph /></button>
                  <button className={sortKey === "type" ? "on" : ""} title={sortKey === "type" && sortDir === "desc" ? "Tipo, descendente" : "Tipo, ascendente"} aria-label="Ordenar por tipo" onClick={() => toggleSort("type")}><TypeGlyph /></button>
                  <button className={sortKey === "size" ? "on" : ""} title={sortKey === "size" && sortDir === "desc" ? "Peso, descendente" : "Peso, ascendente"} aria-label="Ordenar por peso" onClick={() => toggleSort("size")}><SizeGlyph /></button>
                  <button title={sortDir === "asc" ? "Ascendente" : "Descendente"} aria-label={sortDir === "asc" ? "Ascendente" : "Descendente"} onClick={() => setSortDir((dir) => (dir === "asc" ? "desc" : "asc"))}>
                    {sortDir === "asc" ? <UpGlyph /> : <DownGlyph />}
                  </button>
                </div>
              </div>
            </div>
            {shown.length === 0 ? (
              <div className="grid-scroll">
                <div className="empty">
                  <p>Esta carpeta está vacía.</p>
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
                    if (entry.kind === "dir") {
                      void openInTree(entry.path);
                      return;
                    }
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                    setViewer(true);
                  }}
              />
            )}
            <div className="hint">
              <span>
                {busy
                  ? "Trabajando…"
                  : selected.length > 1
                    ? `${selected.length} seleccionados`
                    : `${shown.filter((entry) => entry.kind === "dir").length} carpetas · ${photos.length} archivos`}
              </span>
              <span>Ctrl+A marca todo · Supr borra lo marcado · Ctrl+clic suma · Mayús+clic un rango</span>
            </div>
          </>
        )}
      </main>
      {viewer && focused && focused.kind !== "dir" && (
        <Viewer
          file={focused}
          files={photos}
          filmstrip={config.filmstrip}
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
          src={aiSrc || editBase || mediaUrl(focused.path, focused.modifiedMs)}
          local={!(ai.comfy && ai.studio)}
          folderSave
          pending={Boolean(aiJob)}
          pendingLabel={aiJob?.label || ""}
          liveLog={aiLog}
          choices={aiChoices || undefined}
          onPickChoice={(id) => {
            const choice = aiChoices?.find((item) => item.id === id);
            if (choice) setAiSrc(choice.url);
            setAiChoices(null);
            setAiLog([]);
          }}
          onDismissChoices={() => setAiChoices(null)}
          onCancelJob={() => {
            void cancelAi().catch((error) => setToast(String(error)));
            setAiJob(null);
          }}
          onDetect={async (image, opts) => detectPerson(await studioSession(), image, opts)}
          onBgFix={(image, opts, pin) => beginAi(opts.mode === "solid" ? "IA · quitar fondo" : "IA · desenfocar fondo", (sid) => bgFix(sid, image, opts, pin))}
          onUpscale={(image, scale, pin, opts) => beginAi("IA · ampliar", (sid) => upscale(sid, image, scale, pin, opts))}
          onInpaint={(image, mask, prompt, pin, count, engine) => beginAi("IA · rellenar zona", (sid) => inpaint(sid, image, mask, prompt, pin, count, engine))}
          onCancel={requestCloseEditor}
          onDirtyChange={setEditorDirty}
          onSave={onEditorSave}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function PreviewText(props: { entry: Entry; info: FileInfo | null }) {
  const dims =
    props.info?.width && props.info.height ? `${props.info.width} × ${props.info.height}` : props.entry.kind === "video" ? "Video" : "";
  return (
    <>
      <p className="name">{props.entry.name}</p>
      <p className="meta">
        {[dims, formatSize(props.info?.size ?? props.entry.size), formatWhen(props.info?.modifiedMs ?? props.entry.modifiedMs)]
          .filter(Boolean)
          .join(" · ")}
      </p>
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
                    <div className="thumb folder"><FolderGlyph /></div>
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
                  {props.iconSize === "list" && !editingName && (
                    <>
                      <em>{entry.kind === "dir" ? "Carpeta" : fileExt(entry.name) || entry.kind}</em>
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

function ChevronGlyph(props: { dir: "left" | "right" }) {
  const d = props.dir === "left" ? "M10 3.2 5.2 8 10 12.8" : "M6 3.2 10.8 8 6 12.8";
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function CopyGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="5" y="5" width="8" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M3.5 10.5V3.5h7" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function CutGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="4" cy="11.5" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="4" cy="4.5" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.4 5.6 13 12M5.4 10.4 13 4" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function PasteGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6 2.5h4v2H6z" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <rect x="3.5" y="4" width="9" height="9.5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function TrashGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.2 4.2h9.6M6.2 4.2V2.8h3.6v1.4M4.4 4.2l.6 9h5.9l.6-9" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

function CompareGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1.5" y="3" width="6" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <rect x="8.5" y="3" width="6" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 4l8 8M12 4 4 12" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function PanelGlyph(props: { open?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d={props.open ? "M6 3v10" : "M5 3v10"} fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function UpGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 3.2 3.4 8.2M8 3.2l4.6 5M8 3.5V13" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function DownGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 12.8 3.4 7.8M8 12.8l4.6-5M8 12.5V3" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function LinesGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 4.5h10M3 8h10M3 11.5h10" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function GridGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2.5" y="2.5" width="4.2" height="4.2" rx="0.6" fill="currentColor" />
      <rect x="9.3" y="2.5" width="4.2" height="4.2" rx="0.6" fill="currentColor" />
      <rect x="2.5" y="9.3" width="4.2" height="4.2" rx="0.6" fill="currentColor" />
      <rect x="9.3" y="9.3" width="4.2" height="4.2" rx="0.6" fill="currentColor" />
    </svg>
  );
}

function LargeGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2.2" y="2.2" width="11.6" height="11.6" rx="1.2" fill="currentColor" />
    </svg>
  );
}

function NameGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <text x="8" y="11.5" textAnchor="middle" fontSize="8" fill="currentColor" fontFamily="Segoe UI, sans-serif">Az</text>
    </svg>
  );
}

function TypeGlyph() {
  return (
    <svg width="18" height="16" viewBox="0 0 18 16" aria-hidden="true">
      <text x="9" y="12" textAnchor="middle" fontSize="10" fontWeight="600" fill="currentColor" fontFamily="Segoe UI, sans-serif">.ext</text>
    </svg>
  );
}

function SelectTypeGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 2.5h5l3 3V13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.8 9l1.7 1.7L10.4 7.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SizeGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 12.5h10M3 8.5h7M3 4.5h4" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function FitGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path fill="none" stroke="currentColor" strokeWidth="1.4" d="M6 2H2v4M10 2h4v4M14 10v4h-4M2 10v4h4" />
    </svg>
  );
}

function RatioGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1.5" y="3.5" width="13" height="9" fill="none" stroke="currentColor" strokeWidth="1.4" rx="1" />
    </svg>
  );
}

function NativeGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <text x="8" y="11" textAnchor="middle" fontSize="7.5" fill="currentColor" fontFamily="Segoe UI, sans-serif">1:1</text>
    </svg>
  );
}

function FolderGlyph() {
  return (
    <svg width="22" height="18" viewBox="0 0 22 18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M2 3.5A1.5 1.5 0 0 1 3.5 2h4.2c.4 0 .8.16 1.06.44L10 4h8.5A1.5 1.5 0 0 1 20 5.5v9A1.5 1.5 0 0 1 18.5 16h-15A1.5 1.5 0 0 1 2 14.5v-11Z"
      />
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
