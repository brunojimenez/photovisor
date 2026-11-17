import { invoke } from "@tauri-apps/api/core";

export type Entry = {
  name: string;
  path: string;
  kind: "dir" | "image" | "video";
  modifiedMs: number;
  size: number;
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
export function openInStudio(path: string) {
  return invoke<void>("open_in_studio", { path });
}

export function launchFolder() {
  return invoke<string | null>("launch_folder");
}

export function saveEdit(source: string, dataB64: string, mode: "copy" | "replace", format: "png" | "jpeg") {
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
