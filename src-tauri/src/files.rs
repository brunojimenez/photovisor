use base64::{engine::general_purpose::STANDARD, Engine};
use image::codecs::jpeg::JpegEncoder;
use image::{DynamicImage, ExtendedColorType, ImageDecoder, ImageEncoder, ImageReader};
use little_exif::exif_tag::ExifTag;
use little_exif::metadata::Metadata;
use serde::Serialize;
use std::cmp::Ordering;
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;

const IMAGE_EXT: &[&str] = &["jpg", "jpeg", "png", "gif", "webp", "bmp", "tif", "tiff"];
const VIDEO_EXT: &[&str] = &["mp4", "webm", "mov", "mkv", "avi", "m4v"];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub name: String,
    pub path: String,
    pub kind: String,
    pub modified_ms: u64,
    pub size: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderView {
    pub path: String,
    pub entries: Vec<Entry>,
    pub focus: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub size: u64,
    pub modified_ms: u64,
    pub kind: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchReport {
    pub done: Vec<String>,
    pub skipped: Vec<String>,
    pub errors: Vec<String>,
}

pub fn extension(path: &Path) -> String {
    path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
}

pub fn kind_of(path: &Path) -> Option<&'static str> {
    let ext = extension(path);
    if IMAGE_EXT.contains(&ext.as_str()) {
        Some("image")
    } else if VIDEO_EXT.contains(&ext.as_str()) {
        Some("video")
    } else {
        None
    }
}

pub fn mime_of(path: &Path) -> &'static str {
    match extension(path).as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "tif" | "tiff" => "image/tiff",
        "mp4" | "m4v" => "video/mp4",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        "mkv" => "video/x-matroska",
        "avi" => "video/x-msvideo",
        _ => "application/octet-stream",
    }
}

pub fn nice_path(path: &Path) -> String {
    let text = path.to_string_lossy().to_string();
    text.strip_prefix(r"\\?\").unwrap_or(&text).to_string()
}

fn skip_name(name: &str) -> bool {
    name.starts_with('.')
        || name.eq_ignore_ascii_case("thumbs.db")
        || name.eq_ignore_ascii_case("desktop.ini")
}

fn modified_ms(meta: &fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn natural_cmp(a: &str, b: &str) -> Ordering {
    let ac: Vec<char> = a.chars().collect();
    let bc: Vec<char> = b.chars().collect();
    let mut i = 0;
    let mut j = 0;
    while i < ac.len() && j < bc.len() {
        if ac[i].is_ascii_digit() && bc[j].is_ascii_digit() {
            let mut na: u64 = 0;
            let mut nb: u64 = 0;
            while i < ac.len() && ac[i].is_ascii_digit() {
                na = na
                    .saturating_mul(10)
                    .saturating_add(ac[i].to_digit(10).unwrap_or(0) as u64);
                i += 1;
            }
            while j < bc.len() && bc[j].is_ascii_digit() {
                nb = nb
                    .saturating_mul(10)
                    .saturating_add(bc[j].to_digit(10).unwrap_or(0) as u64);
                j += 1;
            }
            if na != nb {
                return na.cmp(&nb);
            }
        } else {
            let ca = ac[i].to_lowercase().next().unwrap_or(ac[i]);
            let cb = bc[j].to_lowercase().next().unwrap_or(bc[j]);
            if ca != cb {
                return ca.cmp(&cb);
            }
            i += 1;
            j += 1;
        }
    }
    ac.len().cmp(&bc.len())
}

pub fn canonical(path: &Path) -> Result<PathBuf, String> {
    path.canonicalize()
        .map_err(|_| "no se encuentra el archivo".to_string())
}

pub fn ensure_inside(root: &Path, target: &Path) -> Result<PathBuf, String> {
    let root = canonical(root)?;
    let target = canonical(target)?;
    if target.starts_with(&root) {
        Ok(target)
    } else {
        Err("está fuera de la carpeta abierta".into())
    }
}

pub fn drive_of(path: &Path) -> PathBuf {
    let canon = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    let mut parts = canon.components();
    if let Some(Component::Prefix(prefix)) = parts.next() {
        let mut drive = PathBuf::new();
        drive.push(prefix.as_os_str());
        drive.push(Component::RootDir);
        if drive.is_dir() {
            return drive;
        }
    }
    canon
}

pub fn list_drives() -> Vec<Entry> {
    let mut out = Vec::new();
    for letter in b'A'..=b'Z' {
        let path = PathBuf::from(format!("{}:\\", letter as char));
        if !path.is_dir() {
            continue;
        }
        let label = volume_label(&path);
        let name = if label.is_empty() {
            format!("Disco local ({}:)", letter as char)
        } else {
            format!("{label} ({}:)", letter as char)
        };
        out.push(Entry {
            name,
            path: format!("{}:\\", letter as char),
            kind: "dir".into(),
            modified_ms: 0,
            size: 0,
        });
    }
    out
}

/// Carpetas de "Acceso rápido" del Explorador (ancladas y frecuentes), leídas del shell de Windows.
#[cfg(windows)]
pub fn quick_access() -> Vec<Entry> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let script = "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; \
        $sh=New-Object -ComObject Shell.Application; \
        $ns=$sh.Namespace('shell:::{679f85cb-0220-4080-b29b-5540cc05aab6}'); \
        if($ns){ foreach($i in $ns.Items()){ if($i.IsFolder){ $i.Path } } }";
    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    let mut out: Vec<Entry> = Vec::new();
    if let Ok(output) = output {
        for line in String::from_utf8_lossy(&output.stdout).lines() {
            let path = PathBuf::from(line.trim());
            if !path.is_absolute() || !path.is_dir() {
                continue;
            }
            let shown = nice_path(&path);
            if out.iter().any(|entry| entry.path.eq_ignore_ascii_case(&shown)) {
                continue;
            }
            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_else(|| shown.clone());
            out.push(Entry { name, path: shown, kind: "dir".into(), modified_ms: 0, size: 0 });
        }
    }
    out
}

#[cfg(not(windows))]
pub fn quick_access() -> Vec<Entry> {
    Vec::new()
}

pub fn user_folder() -> Result<String, String> {
    let raw = std::env::var("USERPROFILE").map_err(|_| "no hay carpeta de usuario".to_string())?;
    let path = PathBuf::from(raw);
    if !path.is_dir() {
        return Err("no hay carpeta de usuario".into());
    }
    Ok(nice_path(&canonical(&path)?))
}

pub fn launch_folder() -> Option<String> {
    std::env::args().skip(1).find_map(|arg| {
        if arg.starts_with('-') {
            return None;
        }
        let path = PathBuf::from(&arg);
        if !path.is_absolute() || !path.exists() {
            return None;
        }
        canonical(&path).ok().map(|canon| nice_path(&canon))
    })
}

#[cfg(windows)]
fn volume_label(root: &Path) -> String {
    let wide: Vec<u16> = root
        .to_string_lossy()
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    let mut buf = [0u16; 64];
    let ok = unsafe {
        GetVolumeInformationW(
            wide.as_ptr(),
            buf.as_mut_ptr(),
            buf.len() as u32,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            0,
        )
    };
    if ok == 0 {
        return String::new();
    }
    let len = buf.iter().position(|unit| *unit == 0).unwrap_or(buf.len());
    String::from_utf16_lossy(&buf[..len]).trim().to_string()
}

#[cfg(not(windows))]
fn volume_label(_root: &Path) -> String {
    String::new()
}

#[cfg(windows)]
unsafe extern "system" {
    fn GetVolumeInformationW(
        root: *const u16,
        name: *mut u16,
        name_len: u32,
        serial: *mut u32,
        max_comp: *mut u32,
        flags: *mut u32,
        fs: *mut u16,
        fs_len: u32,
    ) -> i32;
}

pub fn parent_dir(path: &Path) -> Result<PathBuf, String> {
    let canon = canonical(path)?;
    let Some(parent) = canon.parent() else {
        return Err("ya estás en la raíz".into());
    };
    if parent.as_os_str().is_empty() || !parent.is_dir() {
        return Err("ya estás en la raíz".into());
    }
    Ok(parent.to_path_buf())
}

pub fn resolve_open(path: &Path) -> Result<(PathBuf, Option<PathBuf>), String> {
    let canon = canonical(path)?;
    if canon.is_dir() {
        Ok((canon, None))
    } else if canon.is_file() {
        let folder = canon
            .parent()
            .ok_or("el archivo no tiene carpeta")?
            .to_path_buf();
        Ok((folder, Some(canon)))
    } else {
        Err("no es una carpeta".into())
    }
}

pub fn list_folder(folder: &Path, focus: Option<&Path>) -> Result<FolderView, String> {
    let mut entries = Vec::new();
    let read = fs::read_dir(folder).map_err(|e| e.to_string())?;
    for item in read.flatten() {
        let name = item.file_name().to_string_lossy().to_string();
        if skip_name(&name) {
            continue;
        }
        let path = item.path();
        let meta = match item.metadata() {
            Ok(meta) => meta,
            Err(_) => continue,
        };
        let kind = if meta.is_dir() {
            "dir"
        } else if let Some(kind) = kind_of(&path) {
            kind
        } else {
            continue;
        };
        entries.push(Entry {
            name,
            path: nice_path(&path),
            kind: kind.to_string(),
            modified_ms: modified_ms(&meta),
            size: if meta.is_file() { meta.len() } else { 0 },
        });
    }
    entries.sort_by(|a, b| {
        let dir_a = a.kind == "dir";
        let dir_b = b.kind == "dir";
        dir_b
            .cmp(&dir_a)
            .then_with(|| natural_cmp(&a.name, &b.name))
    });
    Ok(FolderView {
        path: nice_path(folder),
        entries,
        focus: focus.map(nice_path),
    })
}

pub fn file_info(path: &Path) -> Result<FileInfo, String> {
    let meta = fs::metadata(path).map_err(|e| e.to_string())?;
    let kind = kind_of(path).unwrap_or("file").to_string();
    let (width, height) = if kind == "image" {
        match image::image_dimensions(path) {
            Ok((mut w, mut h)) => {
                if is_jpeg(path) && matches!(read_orientation(path).unwrap_or(1), 5 | 6 | 7 | 8) {
                    std::mem::swap(&mut w, &mut h);
                }
                (Some(w), Some(h))
            }
            Err(_) => (None, None),
        }
    } else {
        (None, None)
    };
    Ok(FileInfo {
        width,
        height,
        size: meta.len(),
        modified_ms: modified_ms(&meta),
        kind,
    })
}

fn open_oriented(path: &Path) -> Result<DynamicImage, String> {
    let reader = ImageReader::open(path).map_err(|e| e.to_string())?;
    let mut decoder = reader.into_decoder().map_err(|e| e.to_string())?;
    let orientation = decoder
        .orientation()
        .unwrap_or(image::metadata::Orientation::NoTransforms);
    let mut image = DynamicImage::from_decoder(decoder).map_err(|e| e.to_string())?;
    image.apply_orientation(orientation);
    Ok(image)
}

pub fn thumbnail(path: &Path, max_edge: u32, sharp: bool, cache_dir: Option<&Path>) -> Result<String, String> {
    if kind_of(path) != Some("image") {
        return Err("no es una imagen".into());
    }
    let edge = max_edge.clamp(64, 1024);
    let mtime = fs::metadata(path).ok().map(|meta| modified_ms(&meta)).unwrap_or(0);
    if !sharp {
        if let Some(bytes) = crate::thumbs::from_cache(path, edge) {
            return Ok(STANDARD.encode(bytes));
        }
        if let Some(bytes) = crate::thumbs::from_embedded(path, edge) {
            return Ok(STANDARD.encode(bytes));
        }
        return Err("sin miniatura de Windows".into());
    }
    if let Some(dir) = cache_dir {
        if let Some(bytes) = crate::thumbs::cached_jpeg(dir, path, mtime, edge) {
            return Ok(STANDARD.encode(bytes));
        }
    }
    let img = open_oriented(path)?;
    let thumb = img.thumbnail(edge, edge);
    let rgb = thumb.to_rgb8();
    let mut bytes = Vec::new();
    let encoder = JpegEncoder::new_with_quality(&mut bytes, 80);
    encoder
        .write_image(
            rgb.as_raw(),
            rgb.width(),
            rgb.height(),
            ExtendedColorType::Rgb8,
        )
        .map_err(|e| e.to_string())?;
    if let Some(dir) = cache_dir {
        crate::thumbs::store_jpeg(dir, path, mtime, edge, &bytes);
    }
    Ok(STANDARD.encode(bytes))
}

pub fn read_media(path: &Path, start: u64, len: Option<usize>) -> Result<(Vec<u8>, u64), String> {
    let meta = fs::metadata(path).map_err(|e| e.to_string())?;
    let size = meta.len();
    if size > 250 * 1024 * 1024 && len.is_none() {
        return Err("el archivo es demasiado grande".into());
    }
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let start = start.min(size);
    file.seek(SeekFrom::Start(start)).map_err(|e| e.to_string())?;
    let want = len.unwrap_or((size - start) as usize);
    let want = want.min((size - start) as usize);
    let mut buf = vec![0u8; want];
    file.read_exact(&mut buf).map_err(|e| e.to_string())?;
    Ok((buf, size))
}

fn is_jpeg(path: &Path) -> bool {
    matches!(extension(path).as_str(), "jpg" | "jpeg")
}

fn read_orientation(path: &Path) -> Result<u16, String> {
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        Metadata::new_from_path(path).map(|metadata| orientation_of(&metadata))
    }));
    match result {
        Ok(Ok(value)) => Ok(value),
        Ok(Err(err)) => Err(err.to_string()),
        Err(_) => Err("no se pudo leer la orientación".into()),
    }
}

fn orientation_of(metadata: &Metadata) -> u16 {
    for tag in metadata.get_tag_by_hex(0x0112, None) {
        if let ExifTag::Orientation(values) = tag {
            if let Some(value) = values.first().copied() {
                if (1..=8).contains(&value) {
                    return value;
                }
            }
        }
    }
    1
}

fn apply_orientation(op: &str, current: u16) -> Result<u16, String> {
    let current = if (1..=8).contains(&current) { current } else { 1 };
    let table: [u16; 8] = match op {
        "right" => [6, 7, 8, 5, 2, 3, 4, 1],
        "left" => [8, 5, 6, 7, 4, 1, 2, 3],
        "fliph" => [2, 1, 4, 3, 6, 5, 8, 7],
        "flipv" => [4, 3, 2, 1, 8, 7, 6, 5],
        _ => return Err("operación desconocida".into()),
    };
    Ok(table[(current - 1) as usize])
}

fn exif_transform(path: &Path, op: &str) -> Result<(), String> {
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let mut metadata = Metadata::new_from_path(path).map_err(|e| e.to_string())?;
        let next = apply_orientation(op, orientation_of(&metadata))?;
        metadata.set_tag(ExifTag::Orientation(vec![next]));
        metadata.write_to_file(path).map_err(|e| e.to_string())
    }));
    match result {
        Ok(inner) => inner,
        Err(_) => Err("no se pudo guardar la orientación".into()),
    }
}

fn replace_file(tmp: &Path, dest: &Path) -> Result<(), String> {
    let backup = dest.with_extension(format!(
        "{}.photovisor-bak",
        extension(dest)
    ));
    fs::rename(dest, &backup).map_err(|e| e.to_string())?;
    if let Err(err) = fs::rename(tmp, dest) {
        let _ = fs::rename(&backup, dest);
        return Err(err.to_string());
    }
    let _ = fs::remove_file(backup);
    Ok(())
}

fn pixel_transform(path: &Path, op: &str) -> Result<(), String> {
    let img = open_oriented(path)?;
    let turned = match op {
        "left" => img.rotate270(),
        "right" => img.rotate90(),
        "flipv" => img.flipv(),
        "fliph" => img.fliph(),
        _ => return Err("operación desconocida".into()),
    };
    let tmp = path.with_extension(format!("{}.photovisor-tmp", extension(path)));
    let saved = if is_jpeg(path) {
        let rgb = turned.to_rgb8();
        match File::create(&tmp) {
            Ok(mut file) => {
                let encoder = JpegEncoder::new_with_quality(&mut file, 95);
                encoder
                    .write_image(
                        rgb.as_raw(),
                        rgb.width(),
                        rgb.height(),
                        ExtendedColorType::Rgb8,
                    )
                    .map_err(|e| e.to_string())
            }
            Err(err) => Err(err.to_string()),
        }
    } else {
        turned.save(&tmp).map_err(|e| e.to_string())
    };
    if let Err(err) = saved {
        let _ = fs::remove_file(&tmp);
        return Err(err);
    }
    replace_file(&tmp, path)
}

pub fn transform_one(path: &Path, op: &str) -> Result<(), String> {
    match kind_of(path) {
        Some("video") => return Err("un video no se gira".into()),
        Some("image") => {}
        _ => return Err("no es una imagen".into()),
    }
    if extension(path) == "gif" {
        return Err("un GIF se deja como está".into());
    }
    if is_jpeg(path) && exif_transform(path, op).is_ok() {
        return Ok(());
    }
    pixel_transform(path, op)
}

pub fn transform_many(root: &Path, paths: &[String], op: &str) -> BatchReport {
    let mut report = BatchReport {
        done: Vec::new(),
        skipped: Vec::new(),
        errors: Vec::new(),
    };
    for raw in paths {
        let path = PathBuf::from(raw);
        let Ok(path) = ensure_inside(root, &path) else {
            report.errors.push(format!("{raw}: fuera de la carpeta"));
            continue;
        };
        match transform_one(&path, op) {
            Ok(()) => report.done.push(nice_path(&path)),
            Err(err) if err.contains("GIF") || err.contains("video") => {
                report.skipped.push(nice_path(&path));
            }
            Err(err) => report.errors.push(format!("{}: {err}", path.file_name().unwrap_or_default().to_string_lossy())),
        }
    }
    report
}

pub fn paste_files(dest_dir: &Path, sources: &[String], cut: bool) -> BatchReport {
    let mut report = BatchReport {
        done: Vec::new(),
        skipped: Vec::new(),
        errors: Vec::new(),
    };
    let dest_dir = match canonical(dest_dir) {
        Ok(path) if path.is_dir() => path,
        _ => {
            report.errors.push("la carpeta de destino no existe".into());
            return report;
        }
    };
    for source in sources {
        match paste_one(&dest_dir, Path::new(source), cut) {
            Ok(path) => report.done.push(nice_path(&path)),
            Err(message) => report.errors.push(message),
        }
    }
    report
}

fn paste_one(dest_dir: &Path, source: &Path, cut: bool) -> Result<PathBuf, String> {
    let source = canonical(source)?;
    if !source.is_file() {
        return Err("no es un archivo".into());
    }
    if kind_of(&source).is_none() {
        return Err("ese archivo no es una foto ni un video".into());
    }
    let same_dir = source.parent() == Some(dest_dir);
    if cut && same_dir {
        return Ok(source);
    }
    let name = source.file_name().ok_or("el archivo no tiene nombre")?;
    let target = unique_name(dest_dir, name, !cut && same_dir);
    fs::copy(&source, &target).map_err(|error| error.to_string())?;
    if cut {
        fs::remove_file(&source).map_err(|error| error.to_string())?;
    }
    Ok(target)
}

fn unique_name(dir: &Path, file_name: &std::ffi::OsStr, copy_suffix: bool) -> PathBuf {
    let path = Path::new(file_name);
    let stem = path.file_stem().and_then(|value| value.to_str()).unwrap_or("archivo");
    let ext = path.extension().and_then(|value| value.to_str()).unwrap_or("");
    let named = |label: &str| {
        if ext.is_empty() {
            label.to_string()
        } else {
            format!("{label}.{ext}")
        }
    };
    let first = if copy_suffix {
        named(&format!("{stem} - copia"))
    } else {
        file_name.to_string_lossy().to_string()
    };
    let mut candidate = dir.join(&first);
    if !candidate.exists() {
        return candidate;
    }
    for index in 2..1000 {
        let label = if copy_suffix {
            format!("{stem} - copia ({index})")
        } else {
            format!("{stem} ({index})")
        };
        candidate = dir.join(named(&label));
        if !candidate.exists() {
            return candidate;
        }
    }
    candidate
}

pub fn recycle_many(root: &Path, paths: &[String]) -> BatchReport {
    mutate_many(root, paths, |path| {
        trash::delete(path).map_err(|e| e.to_string())
    })
}

pub fn save_png(root: &Path, source: &Path, bytes: &[u8], mode: &str) -> Result<PathBuf, String> {
    let source = ensure_inside(root, source)?;
    let parent = source.parent().ok_or("el archivo no tiene carpeta")?;
    let stem = source
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let dest = if mode == "replace" && extension(&source) == "png" {
        source.clone()
    } else if mode == "replace" {
        parent.join(format!("{stem}.png"))
    } else {
        let mut path = parent.join(format!("{stem}-edit.png"));
        let mut n = 2u32;
        while path.exists() {
            path = parent.join(format!("{stem}-edit-{n}.png"));
            n += 1;
        }
        path
    };
    if dest.exists() {
        let tmp = dest.with_extension("png.photovisor-tmp");
        fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
        replace_file(&tmp, &dest)?;
    } else {
        fs::write(&dest, bytes).map_err(|e| e.to_string())?;
    }
    Ok(dest)
}

pub fn rename_entry(root: &Path, path: &Path, new_name: &str) -> Result<PathBuf, String> {
    let path = ensure_inside(root, path)?;
    let mut name = new_name.trim().to_string();
    if name.is_empty() || name == "." || name == ".." {
        return Err("el nombre está vacío".into());
    }
    if name.contains(['\\', '/', ':', '*', '?', '"', '<', '>', '|']) {
        return Err("el nombre tiene un carácter que Windows no acepta".into());
    }
    let ext = extension(&path);
    if !ext.is_empty() && !name.contains('.') {
        name = format!("{name}.{ext}");
    }
    let parent = path.parent().ok_or("el archivo no tiene carpeta")?;
    let dest = parent.join(&name);
    if dest == path {
        return Ok(path);
    }
    if dest.exists() {
        return Err("ya hay un archivo con ese nombre".into());
    }
    fs::rename(&path, &dest).map_err(|e| e.to_string())?;
    Ok(dest)
}

pub fn delete_many(root: &Path, paths: &[String]) -> BatchReport {
    mutate_many(root, paths, |path| {
        if path.is_dir() {
            fs::remove_dir_all(path).map_err(|e| e.to_string())
        } else {
            fs::remove_file(path).map_err(|e| e.to_string())
        }
    })
}

fn mutate_many(root: &Path, paths: &[String], op: impl Fn(&Path) -> Result<(), String>) -> BatchReport {
    let mut report = BatchReport {
        done: Vec::new(),
        skipped: Vec::new(),
        errors: Vec::new(),
    };
    for raw in paths {
        let path = PathBuf::from(raw);
        let Ok(path) = ensure_inside(root, &path) else {
            report.errors.push(format!("{raw}: fuera de la carpeta"));
            continue;
        };
        if !path.is_file() && !path.is_dir() {
            report.skipped.push(nice_path(&path));
            continue;
        }
        match op(&path) {
            Ok(()) => report.done.push(nice_path(&path)),
            Err(err) => report
                .errors
                .push(format!("{}: {err}", path.file_name().unwrap_or_default().to_string_lossy())),
        }
    }
    report
}

#[cfg(test)]
mod tests {
    use super::apply_orientation;

    #[test]
    fn rotations_return_to_start() {
        for start in 1..=8 {
            let mut value = start;
            for _ in 0..4 {
                value = apply_orientation("right", value).unwrap();
            }
            assert_eq!(value, start, "right x4 from {start}");
            value = start;
            for _ in 0..4 {
                value = apply_orientation("left", value).unwrap();
            }
            assert_eq!(value, start, "left x4 from {start}");
            let turned = apply_orientation("right", start).unwrap();
            assert_eq!(apply_orientation("left", turned).unwrap(), start);
            assert_eq!(
                apply_orientation("fliph", apply_orientation("fliph", start).unwrap()).unwrap(),
                start
            );
            assert_eq!(
                apply_orientation("flipv", apply_orientation("flipv", start).unwrap()).unwrap(),
                start
            );
        }
    }
}
