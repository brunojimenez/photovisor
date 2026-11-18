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

const IMAGE_EXT: &[&str] = &[
    "jpg", "jpeg", "png", "gif", "webp", "bmp", "tif", "tiff", "avif", "ico", "exr", "hdr", "qoi", "tga", "pbm", "pgm", "ppm", "pnm", "pam",
];
const VIDEO_EXT: &[&str] = &["mp4", "webm", "mov", "mkv", "avi", "m4v"];

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub name: String,
    pub path: String,
    pub kind: String,
    pub modified_ms: u64,
    pub size: u64,
    /// Solo carpetas: cuántas subcarpetas, fotos/videos y otros archivos tiene adentro (un nivel).
    pub dirs: u32,
    pub media: u32,
    pub others: u32,
    /// Elementos ocultos (los que parten con punto): no se listan, pero cuentan para no borrar una carpeta "vacía" con cosas.
    pub hidden: u32,
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
        "avif" => "image/avif",
        "ico" => "image/x-icon",
        // lo que el navegador no dibuja se sirve convertido a PNG (ver extras::to_png)
        ext if crate::extras::needs_png(ext) => "image/png",
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
            ..Default::default()
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
            out.push(Entry { name, path: shown, kind: "dir".into(), modified_ms: 0, size: 0, ..Default::default() });
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
    path_from_args(std::env::args().skip(1))
}

/// La primera ruta absoluta que exista entre los argumentos (las opciones `--algo` se saltan).
pub fn path_from_args<I: IntoIterator<Item = String>>(args: I) -> Option<String> {
    args.into_iter().find_map(|arg| {
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

/// Cuenta lo que hay dentro de una carpeta (un nivel, con tope para no colgarse en carpetas enormes).
fn folder_counts(folder: &Path) -> (u32, u32, u32, u32) {
    let (mut dirs, mut media, mut others, mut hidden) = (0u32, 0u32, 0u32, 0u32);
    let Ok(read) = fs::read_dir(folder) else { return (0, 0, 0, 0) };
    for item in read.flatten().take(5000) {
        let name = item.file_name().to_string_lossy().to_string();
        if name.eq_ignore_ascii_case("thumbs.db") || name.eq_ignore_ascii_case("desktop.ini") {
            continue;
        }
        if name.starts_with('.') {
            hidden += 1;
            continue;
        }
        let Ok(kind) = item.file_type() else { continue };
        if kind.is_dir() {
            dirs += 1;
        } else if kind_of(&item.path()).is_some() {
            media += 1;
        } else {
            others += 1;
        }
    }
    (dirs, media, others, hidden)
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
            "file"
        };
        let (dirs, media, others, hidden) = if meta.is_dir() { folder_counts(&path) } else { (0, 0, 0, 0) };
        entries.push(Entry {
            name,
            path: nice_path(&path),
            kind: kind.to_string(),
            modified_ms: modified_ms(&meta),
            size: if meta.is_file() { meta.len() } else { 0 },
            dirs,
            media,
            others,
            hidden,
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

pub(crate) fn open_oriented(path: &Path) -> Result<DynamicImage, String> {
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
    let thumb = crate::extras::resize_fast(&img, edge);
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

/// La foto se muestra reflejada (orientaciones EXIF 2, 4, 5 y 7): el sentido de un giro se invierte.
pub fn is_mirrored(path: &Path) -> bool {
    matches!(read_orientation(path), Ok(2 | 4 | 5 | 7))
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

pub fn paste_files(dest_dir: &Path, sources: &[String], cut: bool) -> (BatchReport, Vec<(String, String)>) {
    let mut report = BatchReport {
        done: Vec::new(),
        skipped: Vec::new(),
        errors: Vec::new(),
    };
    let mut moved = Vec::new();
    let dest_dir = match canonical(dest_dir) {
        Ok(path) if path.is_dir() => path,
        _ => {
            report.errors.push("la carpeta de destino no existe".into());
            return (report, moved);
        }
    };
    for source in sources {
        match paste_one(&dest_dir, Path::new(source), cut) {
            Ok(path) => {
                let shown = nice_path(&path);
                if &shown != source {
                    moved.push((source.clone(), shown.clone()));
                }
                report.done.push(shown);
            }
            Err(message) => report.errors.push(message),
        }
    }
    (report, moved)
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

/// Mueve archivos y carpetas a `dest_dir`.
/// Devuelve lo que se movió como (de, a, es_carpeta) para que el catálogo siga a las fotos.
/// Un archivo que ya está en el destino se omite; si el nombre existe, el movido queda como «nombre (2)».
pub fn move_into(root: &Path, dest_dir: &Path, sources: &[String]) -> (BatchReport, Vec<(String, String, bool)>) {
    let mut report = BatchReport {
        done: Vec::new(),
        skipped: Vec::new(),
        errors: Vec::new(),
    };
    let mut moved = Vec::new();
    let dest_dir = match canonical(dest_dir) {
        Ok(path) if path.is_dir() => path,
        _ => {
            report.errors.push("la carpeta de destino no existe".into());
            return (report, moved);
        }
    };
    for raw in sources {
        let label = Path::new(raw)
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| raw.clone());
        let source = match ensure_inside(root, Path::new(raw)) {
            Ok(path) => path,
            Err(_) => {
                report.errors.push(format!("{label}: fuera de la carpeta abierta"));
                continue;
            }
        };
        let is_dir = source.is_dir();
        if is_dir && dest_dir.starts_with(&source) {
            report.errors.push(format!("{label}: no se puede mover una carpeta dentro de sí misma"));
            continue;
        }
        if source.parent() == Some(dest_dir.as_path()) {
            report.skipped.push(nice_path(&source));
            continue;
        }
        let Some(name) = source.file_name() else {
            report.errors.push(format!("{label}: no tiene nombre"));
            continue;
        };
        let target = if is_dir { unique_dir_name(&dest_dir, name) } else { unique_name(&dest_dir, name, false) };
        let result = if is_dir {
            fs::rename(&source, &target).map_err(|error| format!("{label}: no se pudo mover la carpeta ({error})"))
        } else {
            // Entre discos, rename falla: se copia y recién después se borra el original.
            fs::rename(&source, &target)
                .or_else(|_| fs::copy(&source, &target).and_then(|_| fs::remove_file(&source)))
                .map_err(|error| format!("{label}: {error}"))
        };
        match result {
            Ok(()) => {
                moved.push((nice_path(&source), nice_path(&target), is_dir));
                report.done.push(nice_path(&target));
            }
            Err(message) => report.errors.push(message),
        }
    }
    (report, moved)
}

fn unique_dir_name(dir: &Path, name: &std::ffi::OsStr) -> PathBuf {
    let first = dir.join(name);
    if !first.exists() {
        return first;
    }
    let base = name.to_string_lossy();
    for index in 2..1000 {
        let candidate = dir.join(format!("{base} ({index})"));
        if !candidate.exists() {
            return candidate;
        }
    }
    first
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

/// Guarda la imagen editada en el mismo formato del original: JPG sigue siendo JPG y PNG sigue
/// siendo PNG (el resto de formatos pasa a PNG). Conserva el EXIF del original.
pub fn save_image(root: &Path, source: &Path, bytes: &[u8], mode: &str) -> Result<PathBuf, String> {
    let source = ensure_inside(root, source)?;
    let parent = source.parent().ok_or("el archivo no tiene carpeta")?;
    let stem = source
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let jpeg = bytes.starts_with(&[0xFF, 0xD8]);
    let webp = bytes.len() > 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP";
    let avif = bytes.len() > 12 && &bytes[4..8] == b"ftyp" && matches!(&bytes[8..12], b"avif" | b"avis");
    let ext = if jpeg {
        if extension(&source) == "jpeg" { "jpeg" } else { "jpg" }
    } else if webp {
        "webp"
    } else if avif {
        "avif"
    } else {
        "png"
    };
    let same_kind = if jpeg { is_jpeg(&source) } else { extension(&source) == ext };
    let dest = if mode == "replace" && same_kind {
        source.clone()
    } else if mode == "replace" {
        parent.join(format!("{stem}.{ext}"))
    } else {
        let mut path = parent.join(format!("{stem}-edit.{ext}"));
        let mut n = 2u32;
        while path.exists() {
            path = parent.join(format!("{stem}-edit-{n}.{ext}"));
            n += 1;
        }
        path
    };
    // el EXIF se lee antes de escribir: con "reemplazar" el destino es el propio original
    let exif = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| Metadata::new_from_path(&source).ok()))
        .ok()
        .flatten();
    if dest.exists() {
        let tmp = dest.with_extension(format!("{ext}.photovisor-tmp"));
        fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
        replace_file(&tmp, &dest)?;
    } else {
        fs::write(&dest, bytes).map_err(|e| e.to_string())?;
    }
    if let Some(meta) = exif {
        restore_exif(&dest, meta);
    }
    Ok(dest)
}

/// Copia el EXIF al archivo nuevo. Los píxeles ya salen derechos, así que la orientación vuelve a 1.
fn restore_exif(dest: &Path, mut meta: Metadata) {
    let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        meta.set_tag(ExifTag::Orientation(vec![1u16]));
        let _ = meta.write_to_file(dest);
    }));
}

/// Carpeta donde salen las fotos con marca: se crea dentro de la carpeta de cada foto.
pub const MARK_DIR: &str = "con-marca";

/// Fotos de una carpeta que se pueden marcar (sin GIF ni video). Con `recursive` entra a las subcarpetas.
/// Nunca mira dentro de las carpetas de salida «con-marca», para no marcar dos veces lo ya marcado.
pub fn markable_images(folder: &Path, recursive: bool) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let mut pending = vec![folder.to_path_buf()];
    while let Some(dir) = pending.pop() {
        let Ok(read) = fs::read_dir(&dir) else { continue };
        for entry in read.flatten() {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            if skip_name(&name) {
                continue;
            }
            if path.is_dir() {
                if recursive && !name.eq_ignore_ascii_case(MARK_DIR) {
                    pending.push(path);
                }
            } else if kind_of(&path) == Some("image") && extension(&path) != "gif" {
                out.push(path);
            }
        }
    }
    out.sort();
    out
}

/// Guarda una foto con marca en la subcarpeta «con-marca» junto al original, sin pisar nada:
/// si el nombre ya existe agrega -2, -3… Conserva el EXIF del original.
pub fn save_marked(root: &Path, source: &Path, bytes: &[u8]) -> Result<PathBuf, String> {
    let source = ensure_inside(root, source)?;
    let parent = source.parent().ok_or("el archivo no tiene carpeta")?;
    let dir = parent.join(MARK_DIR);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let stem = source.file_stem().unwrap_or_default().to_string_lossy().to_string();
    let jpeg = bytes.starts_with(&[0xFF, 0xD8]);
    let webp = bytes.len() > 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP";
    let avif = bytes.len() > 12 && &bytes[4..8] == b"ftyp" && matches!(&bytes[8..12], b"avif" | b"avis");
    let ext = if jpeg {
        if extension(&source) == "jpeg" { "jpeg" } else { "jpg" }
    } else if webp {
        "webp"
    } else if avif {
        "avif"
    } else {
        "png"
    };
    let mut dest = dir.join(format!("{stem}.{ext}"));
    let mut n = 2u32;
    while dest.exists() {
        dest = dir.join(format!("{stem}-{n}.{ext}"));
        n += 1;
    }
    let exif = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| Metadata::new_from_path(&source).ok()))
        .ok()
        .flatten();
    fs::write(&dest, bytes).map_err(|e| e.to_string())?;
    if let Some(meta) = exif {
        restore_exif(&dest, meta);
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

#[cfg(test)]
mod save_tests {
    use super::*;

    fn tiny_jpeg() -> Vec<u8> {
        let img = image::RgbImage::from_pixel(8, 8, image::Rgb([200, 50, 120]));
        let mut out = Vec::new();
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, 95)
            .encode_image(&img)
            .unwrap();
        out
    }

    #[test]
    fn jpg_sigue_siendo_jpg_y_conserva_exif() {
        let dir = std::env::temp_dir().join(format!("pv-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let src = dir.join("foto.jpg");
        fs::write(&src, tiny_jpeg()).unwrap();
        let mut meta = Metadata::new();
        meta.set_tag(ExifTag::Make("Camara de prueba".to_string()));
        meta.set_tag(ExifTag::Orientation(vec![6u16]));
        meta.write_to_file(&src).unwrap();

        let copy = save_image(&dir, &src, &tiny_jpeg(), "copy").unwrap();
        assert_eq!(copy.file_name().unwrap(), "foto-edit.jpg");
        let m = Metadata::new_from_path(&copy).unwrap();
        assert_eq!(orientation_of(&m), 1, "los pixeles ya salen derechos");
        assert!(m.get_tag_by_hex(0x010F, None).into_iter().count() > 0, "se pierde la marca de la camara");

        let replaced = save_image(&dir, &src, &tiny_jpeg(), "replace").unwrap();
        assert_eq!(replaced.file_name().unwrap(), "foto.jpg");
        let m = Metadata::new_from_path(&src).unwrap();
        assert!(m.get_tag_by_hex(0x010F, None).into_iter().count() > 0, "reemplazar borra el EXIF");

        // un PNG sigue siendo PNG
        let png = dir.join("otra.png");
        fs::write(&png, [0x89, b'P', b'N', b'G']).unwrap();
        let out = save_image(&dir, &png, &[0x89, b'P', b'N', b'G', 1, 2, 3], "copy").unwrap();
        assert_eq!(out.file_name().unwrap(), "otra-edit.png");
        let _ = fs::remove_dir_all(&dir);
    }
}

#[cfg(test)]
mod mark_tests {
    use super::*;

    #[test]
    fn marcar_en_lote_lista_y_guarda_sin_pisar() {
        let base = std::env::temp_dir().join(format!("pv-mark-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(base.join("sub")).unwrap();
        fs::create_dir_all(base.join(MARK_DIR)).unwrap();
        for name in ["a.png", "sub/b.jpg", "anim.gif", "con-marca/ya.png", "nota.txt"] {
            fs::write(base.join(name), b"x").unwrap();
        }
        assert_eq!(markable_images(&base, false).len(), 1, "solo a.png en la carpeta");
        assert_eq!(markable_images(&base, true).len(), 2, "a.png y sub/b.jpg; no el GIF ni lo ya marcado");

        let mut png = Vec::new();
        DynamicImage::ImageRgb8(image::RgbImage::new(2, 2))
            .write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
            .unwrap();
        let src = base.join("a.png");
        let first = save_marked(&base, &src, &png).unwrap();
        let second = save_marked(&base, &src, &png).unwrap();
        assert_eq!(first.file_name().unwrap().to_string_lossy(), "a.png");
        assert_eq!(first.parent().unwrap().file_name().unwrap().to_string_lossy(), MARK_DIR);
        assert!(second.to_string_lossy().ends_with("a-2.png"));
        assert_eq!(fs::read(&src).unwrap(), b"x", "el original no se toca");
        let _ = fs::remove_dir_all(&base);
    }
}

#[cfg(test)]
mod move_tests {
    use super::*;

    /// Carpeta temporal propia de cada prueba (se borra al final).
    struct Temp(PathBuf);
    impl Temp {
        fn new(tag: &str) -> Self {
            let nanos = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let dir = std::env::temp_dir().join(format!("pv-move-{tag}-{}-{nanos}", std::process::id()));
            fs::create_dir_all(&dir).unwrap();
            Temp(canonical(&dir).unwrap())
        }
        fn file(&self, rel: &str, body: &str) -> String {
            let path = self.0.join(rel);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(&path, body).unwrap();
            nice_path(&path)
        }
        fn dir(&self, rel: &str) -> PathBuf {
            let path = self.0.join(rel);
            fs::create_dir_all(&path).unwrap();
            path
        }
    }
    impl Drop for Temp {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn moves_a_file_into_a_subfolder() {
        let t = Temp::new("file");
        let source = t.file("a.jpg", "uno");
        let dest = t.dir("Viajes");
        let (report, moved) = move_into(&t.0, &dest, &[source.clone()]);
        assert_eq!(report.done.len(), 1, "{:?}", report.errors);
        assert!(!Path::new(&source).exists());
        assert_eq!(fs::read_to_string(dest.join("a.jpg")).unwrap(), "uno");
        assert_eq!(moved.len(), 1);
        assert!(!moved[0].2);
    }

    #[test]
    fn a_name_clash_keeps_both_files() {
        let t = Temp::new("clash");
        let source = t.file("a.jpg", "nuevo");
        let dest = t.dir("Viajes");
        fs::write(dest.join("a.jpg"), "viejo").unwrap();
        let (report, _) = move_into(&t.0, &dest, &[source]);
        assert_eq!(report.done.len(), 1);
        assert_eq!(fs::read_to_string(dest.join("a.jpg")).unwrap(), "viejo");
        assert_eq!(fs::read_to_string(dest.join("a (2).jpg")).unwrap(), "nuevo");
    }

    #[test]
    fn a_file_already_there_is_skipped() {
        let t = Temp::new("same");
        let source = t.file("Viajes/a.jpg", "x");
        let dest = t.0.join("Viajes");
        let (report, moved) = move_into(&t.0, &dest, &[source.clone()]);
        assert_eq!(report.skipped.len(), 1);
        assert!(report.done.is_empty() && moved.is_empty());
        assert!(Path::new(&source).exists());
    }

    #[test]
    fn moves_a_whole_folder_with_its_content() {
        let t = Temp::new("dir");
        t.file("Fotos/uno.jpg", "1");
        t.file("Fotos/sub/dos.jpg", "2");
        let dest = t.dir("Archivo");
        let source = nice_path(&t.0.join("Fotos"));
        let (report, moved) = move_into(&t.0, &dest, &[source]);
        assert_eq!(report.done.len(), 1, "{:?}", report.errors);
        assert!(!t.0.join("Fotos").exists());
        assert_eq!(fs::read_to_string(dest.join("Fotos/sub/dos.jpg")).unwrap(), "2");
        assert!(moved[0].2);
    }

    #[test]
    fn a_folder_cannot_go_inside_itself() {
        let t = Temp::new("self");
        t.file("Fotos/sub/x.jpg", "x");
        let source = nice_path(&t.0.join("Fotos"));
        let inside = t.0.join("Fotos/sub");
        let (report, _) = move_into(&t.0, &inside, &[source.clone()]);
        assert_eq!(report.errors.len(), 1);
        assert!(Path::new(&source).exists());
        let (report, _) = move_into(&t.0, &t.0.join("Fotos"), &[source]);
        assert_eq!(report.errors.len(), 1);
    }

    #[test]
    fn a_folder_name_clash_gets_a_number() {
        let t = Temp::new("dirclash");
        t.file("Fotos/a.jpg", "a");
        t.file("Archivo/Fotos/b.jpg", "b");
        let source = nice_path(&t.0.join("Fotos"));
        let (report, _) = move_into(&t.0, &t.0.join("Archivo"), &[source]);
        assert_eq!(report.done.len(), 1, "{:?}", report.errors);
        assert!(t.0.join("Archivo/Fotos/b.jpg").exists());
        assert!(t.0.join("Archivo/Fotos (2)/a.jpg").exists());
    }

    #[test]
    fn refuses_things_outside_the_open_folder() {
        let outer = Temp::new("outer");
        let inner_root = outer.dir("abierta");
        let stray = outer.file("afuera/x.jpg", "x");
        let dest = outer.dir("abierta/Destino");
        let (report, moved) = move_into(&inner_root, &dest, &[stray.clone()]);
        assert_eq!(report.errors.len(), 1);
        assert!(moved.is_empty());
        assert!(Path::new(&stray).exists());
    }

    #[test]
    fn a_missing_destination_is_an_error() {
        let t = Temp::new("nodest");
        let source = t.file("a.jpg", "x");
        let (report, _) = move_into(&t.0, &t.0.join("no-existe"), &[source.clone()]);
        assert_eq!(report.errors.len(), 1);
        assert!(Path::new(&source).exists());
    }

    #[test]
    fn moves_files_of_any_kind_not_only_photos() {
        let t = Temp::new("kind");
        let source = t.file("notas.txt", "hola");
        let dest = t.dir("Docs");
        let (report, _) = move_into(&t.0, &dest, &[source]);
        assert_eq!(report.done.len(), 1, "{:?}", report.errors);
        assert!(dest.join("notas.txt").exists());
    }
}
