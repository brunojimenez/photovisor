import { invoke } from "@tauri-apps/api/core";

export type Entry = {
  name: string;
  path: string;
  kind: "dir" | "image" | "video" | "file";
  modifiedMs: number;
  size: number;
  /** Solo carpetas: subcarpetas, fotos/videos y otros archivos que tiene adentro. */
  dirs?: number;
  media?: number;
  others?: number;
  hidden?: number;
};

export type FolderView = {
  path: string;
  entries: Entry[];
  focus: string | null;
};

export type FileInfo = {
  width: number | null;
  height: number | null;
  size: number;
  modifiedMs: number;
  kind: string;
};

export type BatchReport = {
  done: string[];
  skipped: string[];
  errors: string[];
};

export type Config = {
  lastFolder: string | null;
  shiftDeleteWithoutAsking: boolean;
  filmstrip: boolean;
  discardEditWithoutAsking: boolean;
  /** Qué tan parecidas deben ser dos fotos para contarlas como duplicadas (0-16; más alto = más permisivo). */
  dupMaxDist: number;
  jpegQuality: number;
  webpQuality: number;
  avifQuality: number;
};

export const COMPUTER = "__computer__";

export function loadConfig() {
  return invoke<Config>("load_config");
}

export function saveConfig(config: Config) {
  return invoke<void>("save_config", { config });
}

export function openRoot(path: string) {
  return invoke<FolderView>("open_root", { path });
}

export function listDir(path: string) {
  return invoke<FolderView>("list_dir", { path });
}

export function goUp(path: string) {
  return invoke<{ root: string; folder: FolderView | null; computer: boolean }>("go_up", { path });
}

export function listDrives() {
  return invoke<Entry[]>("list_drives");
}

export function quickAccess() {
  return invoke<Entry[]>("quick_access");
}

export function userFolder() {
  return invoke<string>("user_folder");
}

export function launchArgs() {
  return invoke<{ path: string | null; edit: boolean }>("launch_args");
}

export function studioInfo() {
  return invoke<{ installed: boolean }>("studio_info");
}

/** Abre la foto en el Studio (app hermana, su propia ventana). */
export function openExternal(path: string) {
  return invoke<void>("open_external", { path });
}

export function openRepo() {
  return invoke<void>("open_repo");
}

export function openInStudio(path: string) {
  return invoke<void>("open_in_studio", { path });
}

export function launchFolder() {
  return invoke<string | null>("launch_folder");
}

export function saveEdit(source: string, dataB64: string, mode: "copy" | "replace", format: "png" | "jpeg" | "webp" | "avif") {
  return invoke<string>("save_edit", { source, dataB64, mode, format });
}

export function suggestTilt(path: string) {
  return invoke<number | null>("suggest_tilt", { path });
}

export function renameFile(path: string, name: string) {
  return invoke<string>("rename_file", { path, name });
}

export function pasteFiles(dest: string, sources: string[], cut: boolean) {
  return invoke<BatchReport>("paste", { dest, sources, cut });
}

/** Mueve archivos o carpetas a otra carpeta. */
export function moveTo(dest: string, sources: string[]) {
  return invoke<BatchReport>("move_to", { dest, sources });
}

export function thumbnail(path: string, maxEdge: number, kind: "fast" | "sharp") {
  return invoke<string>("thumbnail", { path, maxEdge, kind });
}

export function fileInfo(path: string) {
  return invoke<FileInfo>("file_info", { path });
}

export function transform(paths: string[], op: "left" | "right" | "flipv" | "fliph") {
  return invoke<BatchReport>("transform", { paths, op });
}

export function recycle(paths: string[]) {
  return invoke<BatchReport>("recycle", { paths });
}

export function deletePermanent(paths: string[]) {
  return invoke<BatchReport>("delete_permanent", { paths });
}

export function mediaUrl(path: string, version: number) {
  return `http://photo.localhost/${encodeURIComponent(path)}?v=${version}`;
}

export type AiStatus = { comfy: boolean; studio: boolean };

export function aiStatus() {
  return invoke<AiStatus>("ai_status");
}

export type Meta = { rating: number; label: string };

export function catalogFolder(folder: string) {
  return invoke<Record<string, Meta>>("catalog_folder", { folder });
}

/** `rating` y `label` en null no se tocan. Valoración 0 y etiqueta "" quitan cada dato. */
export function catalogSet(paths: string[], rating: number | null, label: string | null) {
  return invoke<void>("catalog_set", { paths, rating, label });
}

export function watchFolder(path: string) {
  return invoke<void>("watch_folder", { path });
}

export type ExifSummary = {
  camera: string | null;
  lens: string | null;
  taken: string | null;
  exposure: string | null;
  aperture: string | null;
  iso: string | null;
  focal: string | null;
  lat: number | null;
  lon: number | null;
};

export function fileExif(path: string) {
  return invoke<ExifSummary>("file_exif", { path });
}

export function stripGps(paths: string[]) {
  return invoke<BatchReport>("strip_gps", { paths });
}

/** Grupos de fotos duplicadas o muy parecidas de una carpeta. `maxDist` 0-16: más alto = más permisivo. */
export function findSimilar(folder: string, maxDist?: number) {
  return invoke<string[][]>("find_similar", { folder, maxDist });
}

/** Fotos que se pueden marcar en lote en una carpeta (sin GIF ni video). */
export function batchImages(folder: string, recursive: boolean) {
  return invoke<string[]>("batch_images", { folder, recursive });
}

/** Guarda una foto con marca en la subcarpeta «con-marca» junto al original. */
export function saveMarked(source: string, dataB64: string, format: "png" | "jpeg" | "webp" | "avif") {
  return invoke<string>("save_marked", { source, dataB64, format });
}
