import type { Entry } from "./api";

export type SortKey = "name" | "type" | "size";
export type SortDir = "asc" | "desc";
export type IconSize = "list" | "medium" | "large";

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatWhen(ms: number) {
  if (!ms) return "";
  return new Date(ms).toLocaleString("es-CL", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function folderName(path: string) {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export function fileExt(name: string) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function naturalCmp(a: string, b: string) {
  const ac = [...a];
  const bc = [...b];
  let i = 0;
  let j = 0;
  while (i < ac.length && j < bc.length) {
    if (/\d/.test(ac[i]) && /\d/.test(bc[j])) {
      let na = 0;
      let nb = 0;
      while (i < ac.length && /\d/.test(ac[i])) {
        na = na * 10 + Number(ac[i]);
        i += 1;
      }
      while (j < bc.length && /\d/.test(bc[j])) {
        nb = nb * 10 + Number(bc[j]);
        j += 1;
      }
      if (na !== nb) return na - nb;
    } else {
      const cmp = ac[i].toLocaleLowerCase().localeCompare(bc[j].toLocaleLowerCase());
      if (cmp !== 0) return cmp;
      i += 1;
      j += 1;
    }
  }
  return ac.length - bc.length;
}

export function sortEntries(files: Entry[], key: SortKey, dir: SortDir) {
  const sign = dir === "asc" ? 1 : -1;
  return [...files].sort((a, b) => {
    let cmp = 0;
    if (key === "size") cmp = a.size - b.size;
    else if (key === "type") cmp = fileExt(a.name).localeCompare(fileExt(b.name));
    else cmp = naturalCmp(a.name, b.name);
    if (cmp === 0) cmp = naturalCmp(a.name, b.name);
    return cmp * sign;
  });
}

export function bytesToBase64(bytes: Uint8Array) {
  let text = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    text += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(text);
}
