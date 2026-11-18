mod catalog;
mod codec;
mod config;
mod extras;
mod files;
mod thumbs;
mod watch;

use base64::{engine::general_purpose::STANDARD, Engine};
use catalog::{Catalog, Meta};
use files::{BatchReport, FileInfo, FolderView};
use percent_encoding::percent_decode_str;
use serde::Deserialize;
use tauri::Emitter;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use tauri::Manager;

// ---------- aplicaciones amigas (PhotoVisor <-> Studio) ----------
// Cada una deja una ficha en %LOCALAPPDATA%\amigas\ al arrancar; la otra la lee para saber si existe.
// PhotoVisor no habla con ComfyUI ni con el API del estudio: solo abre el Studio con una foto.

fn friends_dir() -> Option<PathBuf> {
    std::env::var_os("LOCALAPPDATA").map(|dir| PathBuf::from(dir).join("amigas"))
}

fn announce_photovisor(version: &str) {
    let (Some(dir), Ok(exe)) = (friends_dir(), std::env::current_exe()) else {
        return;
    };
    let card = serde_json::json!({
        "name": "PhotoVisor",
        "exe": exe.to_string_lossy(),
        "version": version,
        "dev": cfg!(debug_assertions),
    });
    if std::fs::create_dir_all(&dir).is_ok() {
        let _ = std::fs::write(dir.join("photovisor.json"), serde_json::to_vec_pretty(&card).unwrap_or_default());
    }
}

/// El .exe del Studio de escritorio, si está instalado.
fn studio_exe() -> Option<PathBuf> {
    let text = std::fs::read_to_string(friends_dir()?.join("studio.json")).ok()?;
    let card: serde_json::Value = serde_json::from_str(&text).ok()?;
    let exe = PathBuf::from(card.get("exe")?.as_str()?);
    exe.is_file().then_some(exe)
}

#[derive(serde::Serialize, Clone)]
struct LaunchArgs {
    path: Option<String>,
    edit: bool,
}

fn parse_args(argv: &[String]) -> LaunchArgs {
    LaunchArgs {
        path: files::path_from_args(argv.iter().skip(1).cloned()),
        edit: argv.iter().skip(1).any(|arg| arg == "--edit"),
    }
}

/// Lo que pidió quien abrió PhotoVisor: un archivo o carpeta y, con `--edit`, entrar directo al editor.
#[tauri::command]
fn launch_args() -> LaunchArgs {
    parse_args(&std::env::args().collect::<Vec<_>>())
}

/// ¿Está el Studio en este PC?
#[tauri::command]
fn studio_info() -> serde_json::Value {
    serde_json::json!({ "installed": studio_exe().is_some() })
}

/// Abre la foto en el Studio (su propia ventana): él levanta su API y crea la sesión con la foto.
#[tauri::command]
fn open_in_studio(path: String) -> Result<(), String> {
    let exe = studio_exe().ok_or("El Studio no está instalado en este PC.")?;
    let file = Path::new(&path);
    if !file.is_file() {
        return Err("Esa foto ya no existe.".to_string());
    }
    let mut cmd = Command::new(exe);
    cmd.arg(file).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    cmd.spawn().map(|_| ()).map_err(|e| format!("No pude abrir el Studio: {e}"))
}

/// Abre un archivo (que no es foto ni video) con el programa que Windows tenga para ese tipo.
#[tauri::command]
fn open_external(state: tauri::State<AppState>, path: String) -> Result<(), String> {
    let root = root_of(&state)?;
    let file = files::ensure_inside(&root, Path::new(&path))?;
    if !file.is_file() {
        return Err("Ese archivo ya no existe.".to_string());
    }
    const RISKY: &[&str] = &["exe", "bat", "cmd", "com", "msi", "scr", "ps1", "vbs", "vbe", "js", "jse", "wsf", "jar", "lnk", "reg", "hta", "cpl"];
    if RISKY.contains(&files::extension(&file).as_str()) {
        return Err("Por seguridad no abro programas ni scripts desde aquí. Ábrelo desde el Explorador.".to_string());
    }
    Command::new("explorer")
        .arg(&file)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("No pude abrirlo: {e}"))
}

struct AppState {
    root: Mutex<Option<PathBuf>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveConfig {
    last_folder: Option<String>,
    shift_delete_without_asking: bool,
    filmstrip: bool,
    #[serde(default)]
    discard_edit_without_asking: bool,
}

fn root_of(state: &AppState) -> Result<PathBuf, String> {
    state
        .root
        .lock()
        .map_err(|_| "la carpeta está ocupada".to_string())?
        .clone()
        .ok_or_else(|| "todavía no hay una carpeta abierta".to_string())
}

fn set_root(state: &AppState, path: PathBuf) -> Result<(), String> {
    *state
        .root
        .lock()
        .map_err(|_| "la carpeta está ocupada".to_string())? = Some(path);
    Ok(())
}

#[tauri::command]
fn load_config(app: tauri::AppHandle) -> config::Config {
    config::load(&app)
}

#[tauri::command]
fn save_config(app: tauri::AppHandle, config: SaveConfig) -> Result<(), String> {
    config::save(
        &app,
        &config::Config {
            last_folder: config.last_folder,
            shift_delete_without_asking: config.shift_delete_without_asking,
            filmstrip: config.filmstrip,
            discard_edit_without_asking: config.discard_edit_without_asking,
        },
    )
}

#[tauri::command]
fn open_root(state: tauri::State<AppState>, path: String) -> Result<FolderView, String> {
    let (folder, focus) = files::resolve_open(Path::new(&path))?;
    set_root(&state, files::drive_of(&folder))?;
    files::list_folder(&folder, focus.as_deref())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct UpView {
    root: String,
    folder: Option<FolderView>,
    computer: bool,
}

#[tauri::command]
fn go_up(state: tauri::State<AppState>, path: String) -> Result<UpView, String> {
    let Ok(parent) = files::parent_dir(Path::new(&path)) else {
        let root = root_of(&state).unwrap_or_else(|_| PathBuf::from(r"C:\"));
        return Ok(UpView {
            root: files::nice_path(&root),
            folder: None,
            computer: true,
        });
    };
    let root = root_of(&state)?;
    let root_canon = files::canonical(&root)?;
    let new_root = if parent.starts_with(&root_canon) {
        root_canon
    } else {
        let drive = files::drive_of(&parent);
        set_root(&state, drive.clone())?;
        drive
    };
    let folder = files::list_folder(&parent, None)?;
    Ok(UpView {
        root: files::nice_path(&new_root),
        folder: Some(folder),
        computer: false,
    })
}

#[tauri::command]
fn list_dir(state: tauri::State<AppState>, path: String) -> Result<FolderView, String> {
    let folder = files::canonical(Path::new(&path))?;
    if !folder.is_dir() {
        return Err("no es una carpeta".into());
    }
    let inside = root_of(&state)
        .ok()
        .and_then(|root| files::canonical(&root).ok())
        .is_some_and(|root| folder.starts_with(&root));
    if !inside {
        set_root(&state, files::drive_of(&folder))?;
    }
    files::list_folder(&folder, None)
}

#[tauri::command]
fn list_drives() -> Vec<files::Entry> {
    files::list_drives()
}

#[tauri::command]
async fn quick_access() -> Vec<files::Entry> {
    tauri::async_runtime::spawn_blocking(files::quick_access)
        .await
        .unwrap_or_default()
}

#[tauri::command]
fn user_folder()-> Result<String, String> {
    files::user_folder()
}

#[tauri::command]
fn launch_folder() -> Option<String> {
    files::launch_folder()
}

#[tauri::command]
async fn thumbnail(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    path: String,
    max_edge: u32,
    kind: String,
) -> Result<String, String> {
    let root = root_of(&state)?;
    let cache = app.path().app_config_dir().ok().map(|dir| dir.join("previews"));
    tauri::async_runtime::spawn_blocking(move || {
        let file = files::ensure_inside(&root, Path::new(&path))?;
        files::thumbnail(&file, max_edge, kind == "sharp", cache.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn file_info(state: tauri::State<AppState>, path: String) -> Result<FileInfo, String> {
    let root = root_of(&state)?;
    let file = files::ensure_inside(&root, Path::new(&path))?;
    files::file_info(&file)
}

/// Datos de cámara y ubicación de una foto, ya legibles. Vacío si no tiene EXIF.
#[tauri::command]
async fn file_exif(state: tauri::State<'_, AppState>, path: String) -> Result<extras::ExifSummary, String> {
    let root = root_of(&state)?;
    tauri::async_runtime::spawn_blocking(move || {
        let file = files::ensure_inside(&root, Path::new(&path))?;
        Ok(extras::exif_summary(&file))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Quita la ubicación (GPS) de las fotos indicadas. No toca los píxeles.
#[tauri::command]
async fn strip_gps(state: tauri::State<'_, AppState>, paths: Vec<String>) -> Result<BatchReport, String> {
    let root = root_of(&state)?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut report = BatchReport { done: Vec::new(), skipped: Vec::new(), errors: Vec::new() };
        for raw in &paths {
            let file = match files::ensure_inside(&root, Path::new(raw)) {
                Ok(file) => file,
                Err(_) => {
                    report.errors.push(format!("{raw}: fuera de la carpeta"));
                    continue;
                }
            };
            match extras::strip_gps(&file) {
                Ok(true) => report.done.push(files::nice_path(&file)),
                Ok(false) => report.skipped.push(files::nice_path(&file)),
                Err(err) => report.errors.push(format!("{}: {err}", file.file_name().unwrap_or_default().to_string_lossy())),
            }
        }
        report
    })
    .await
    .map_err(|e| e.to_string())
}

/// Grupos de fotos duplicadas o muy parecidas dentro de una carpeta (no mira subcarpetas).
#[tauri::command]
async fn find_similar(state: tauri::State<'_, AppState>, folder: String, max_dist: Option<u32>) -> Result<Vec<Vec<String>>, String> {
    let root = root_of(&state)?;
    tauri::async_runtime::spawn_blocking(move || {
        let dir = files::ensure_inside(&root, Path::new(&folder))?;
        let mut paths: Vec<PathBuf> = std::fs::read_dir(&dir)
            .map_err(|e| e.to_string())?
            .flatten()
            .map(|entry| entry.path())
            .filter(|path| path.is_file() && files::kind_of(path) == Some("image"))
            .collect();
        paths.sort();
        let hashes = extras::fingerprints(&paths);
        let names: Vec<String> = paths
            .iter()
            .map(|p| p.file_name().unwrap_or_default().to_string_lossy().to_string())
            .collect();
        let groups = extras::group_similar(&hashes, &names, max_dist.unwrap_or(4).min(16));
        Ok(groups
            .into_iter()
            .map(|group| group.into_iter().map(|i| files::nice_path(&paths[i])).collect())
            .collect())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn transform(
    state: tauri::State<'_, AppState>,
    paths: Vec<String>,
    op: String,
) -> Result<BatchReport, String> {
    let root = root_of(&state)?;
    tauri::async_runtime::spawn_blocking(move || files::transform_many(&root, &paths, &op))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn recycle(
    state: tauri::State<'_, AppState>,
    catalog: tauri::State<'_, Catalog>,
    paths: Vec<String>,
) -> Result<BatchReport, String> {
    let root = root_of(&state)?;
    let report = tauri::async_runtime::spawn_blocking(move || files::recycle_many(&root, &paths))
        .await
        .map_err(|e| e.to_string())?;
    catalog.remove(&report.done);
    Ok(report)
}

#[tauri::command]
async fn paste(
    state: tauri::State<'_, AppState>,
    catalog: tauri::State<'_, Catalog>,
    dest: String,
    sources: Vec<String>,
    cut: bool,
) -> Result<BatchReport, String> {
    let root = root_of(&state)?;
    let dest = files::ensure_inside(&root, Path::new(&dest))?;
    let (report, moved) = tauri::async_runtime::spawn_blocking(move || files::paste_files(&dest, &sources, cut))
        .await
        .map_err(|error| error.to_string())?;
    for (from, to) in &moved {
        if cut {
            catalog.rename(from, to);
        } else {
            catalog.copy(from, to);
        }
    }
    Ok(report)
}

#[tauri::command]
fn rename_file(
    state: tauri::State<AppState>,
    catalog: tauri::State<Catalog>,
    path: String,
    name: String,
) -> Result<String, String> {
    let root = root_of(&state)?;
    let dest = files::rename_entry(&root, Path::new(&path), &name)?;
    let shown = files::nice_path(&dest);
    catalog.rename(&path, &shown);
    Ok(shown)
}

#[tauri::command]
async fn save_edit(
    state: tauri::State<'_, AppState>,
    catalog: tauri::State<'_, Catalog>,
    source: String,
    data_b64: String,
    mode: String,
    format: Option<String>,
) -> Result<String, String> {
    let root = root_of(&state)?;
    let bytes = STANDARD
        .decode(data_b64.trim())
        .map_err(|_| "la imagen guardada no se pudo leer".to_string())?;
    let origin = source.clone();
    let saved = tauri::async_runtime::spawn_blocking(move || {
        // el editor entrega un PNG sin pérdida; aquí se codifica en el formato final
        let bytes = match format.as_deref() {
            Some("jpeg") => codec::encode_jpeg(&bytes, codec::JPEG_QUALITY)?,
            Some("png") => codec::optimize_png(&bytes),
            Some("webp") => extras::encode_webp(&bytes, extras::WEBP_QUALITY)?,
            Some("avif") => extras::encode_avif(&bytes, extras::AVIF_QUALITY)?,
            _ => bytes,
        };
        let dest = files::save_image(&root, Path::new(&source), &bytes, &mode)?;
        Ok::<String, String>(files::nice_path(&dest))
    })
    .await
    .map_err(|e| e.to_string())??;
    // la copia editada hereda la valoración y la etiqueta del original
    if saved != origin {
        catalog.copy(&origin, &saved);
    }
    Ok(saved)
}

#[tauri::command]
async fn suggest_tilt(state: tauri::State<'_, AppState>, path: String) -> Result<Option<f32>, String> {
    let root = root_of(&state)?;
    tauri::async_runtime::spawn_blocking(move || {
        let file = files::ensure_inside(&root, Path::new(&path))?;
        codec::suggest_tilt(&file, files::is_mirrored(&file))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn delete_permanent(
    state: tauri::State<'_, AppState>,
    catalog: tauri::State<'_, Catalog>,
    paths: Vec<String>,
) -> Result<BatchReport, String> {
    let root = root_of(&state)?;
    let report = tauri::async_runtime::spawn_blocking(move || files::delete_many(&root, &paths))
        .await
        .map_err(|e| e.to_string())?;
    catalog.remove(&report.done);
    Ok(report)
}

/// Valoración y etiqueta de las fotos de una carpeta.
#[tauri::command]
fn catalog_folder(catalog: tauri::State<Catalog>, folder: String) -> std::collections::HashMap<String, Meta> {
    catalog.folder(&folder)
}

/// Cambia valoración (0-5) y/o etiqueta de varias fotos. `None` no toca ese dato; etiqueta "" la quita.
#[tauri::command]
fn catalog_set(
    catalog: tauri::State<Catalog>,
    paths: Vec<String>,
    rating: Option<u8>,
    label: Option<String>,
) -> Result<(), String> {
    catalog.set(&paths, rating, label.as_deref())
}

/// Avisa a la interfaz (evento `folder-changed`) cuando cambian los archivos de esta carpeta.
#[tauri::command]
fn watch_folder(
    app: tauri::AppHandle,
    watcher: tauri::State<watch::FolderWatch>,
    path: String,
) -> Result<(), String> {
    let folder = PathBuf::from(&path);
    if !folder.is_dir() {
        watcher.stop();
        return Ok(());
    }
    watcher.watch(&folder, move || {
        let _ = app.emit("folder-changed", &path);
    })
}

fn photo_protocol(
    ctx: tauri::UriSchemeContext<'_, tauri::Wry>,
    request: http::Request<Vec<u8>>,
) -> http::Response<Vec<u8>> {
    let state = ctx.app_handle().state::<AppState>();
    let root = state.root.lock().ok().and_then(|guard| guard.clone());
    match serve_media(root.as_deref(), &request) {
        Ok(response) => response,
        Err(status) => http::Response::builder()
            .status(status)
            .header(http::header::CONTENT_TYPE, "text/plain")
            .body(Vec::new())
            .unwrap_or_else(|_| http::Response::new(Vec::new())),
    }
}

fn serve_media(
    root: Option<&Path>,
    request: &http::Request<Vec<u8>>,
) -> Result<http::Response<Vec<u8>>, http::StatusCode> {
    let Some(root) = root else {
        return Err(http::StatusCode::FORBIDDEN);
    };
    let raw = request.uri().path().trim_start_matches('/');
    let decoded = percent_decode_str(raw).decode_utf8_lossy().to_string();
    let file = files::ensure_inside(root, Path::new(&decoded)).map_err(|_| http::StatusCode::FORBIDDEN)?;
    if files::kind_of(&file).is_none() {
        return Err(http::StatusCode::NOT_FOUND);
    }
    // formatos que el navegador no dibuja (EXR, HDR, QOI, TGA, PNM): se entrega el PNG ya convertido
    if extras::needs_png(&files::extension(&file)) {
        let png = extras::to_png(&file).map_err(|_| http::StatusCode::INTERNAL_SERVER_ERROR)?;
        return http::Response::builder()
            .status(http::StatusCode::OK)
            .header(http::header::CONTENT_TYPE, "image/png")
            .header(http::header::CACHE_CONTROL, "no-cache")
            .header(http::header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .body(png)
            .map_err(|_| http::StatusCode::INTERNAL_SERVER_ERROR);
    }
    let meta = std::fs::metadata(&file).map_err(|_| http::StatusCode::NOT_FOUND)?;
    let size = meta.len();
    let video = files::kind_of(&file) == Some("video");
    let range = request
        .headers()
        .get(http::header::RANGE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| parse_range(value, size));

    let (start, len, status) = if let Some((start, end)) = range {
        if start >= size {
            return Err(http::StatusCode::RANGE_NOT_SATISFIABLE);
        }
        let end = end.min(size - 1).min(start + 16 * 1024 * 1024 - 1);
        (start, (end - start + 1) as usize, http::StatusCode::PARTIAL_CONTENT)
    } else if video && size > 16 * 1024 * 1024 {
        (0, 16 * 1024 * 1024, http::StatusCode::PARTIAL_CONTENT)
    } else {
        (0, size as usize, http::StatusCode::OK)
    };

    let (bytes, _) = files::read_media(&file, start, Some(len)).map_err(|_| http::StatusCode::INTERNAL_SERVER_ERROR)?;
    let mut builder = http::Response::builder()
        .status(status)
        .header(http::header::CONTENT_TYPE, files::mime_of(&file))
        .header(http::header::ACCEPT_RANGES, "bytes")
        .header(http::header::CACHE_CONTROL, "no-cache")
        .header(http::header::ACCESS_CONTROL_ALLOW_ORIGIN, "*");
    if status == http::StatusCode::PARTIAL_CONTENT {
        let end = start + bytes.len() as u64 - 1;
        builder = builder.header(
            http::header::CONTENT_RANGE,
            format!("bytes {start}-{end}/{size}"),
        );
    }
    builder
        .body(bytes)
        .map_err(|_| http::StatusCode::INTERNAL_SERVER_ERROR)
}

fn parse_range(header: &str, size: u64) -> Option<(u64, u64)> {
    let rest = header.trim().strip_prefix("bytes=")?;
    let (start, end) = rest.split_once('-')?;
    if size == 0 {
        return None;
    }
    let start: u64 = if start.is_empty() { 0 } else { start.parse().ok()? };
    let end: u64 = if end.is_empty() {
        size - 1
    } else {
        end.parse().ok()?
    };
    Some((start, end))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // otra copia quiso abrirse (p. ej. «Editar en PhotoVisor» desde el estudio): se reusa esta ventana
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            let args = parse_args(&argv);
            let _ = app.emit("open-args", args);
        }))
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            root: Mutex::new(None),
        })
        .manage(watch::FolderWatch::default())
        .setup(|app| {
            let dir = app.path().app_config_dir()?;
            std::fs::create_dir_all(&dir)?;
            app.manage(Catalog::open(&dir.join("catalog.db"))?);
            announce_photovisor(&app.package_info().version.to_string());
            Ok(())
        })
        .register_uri_scheme_protocol("photo", photo_protocol)
        .invoke_handler(tauri::generate_handler![
            load_config,
            save_config,
            open_root,
            list_dir,
            thumbnail,
            file_info,
            file_exif,
            strip_gps,
            find_similar,
            transform,
            recycle,
            delete_permanent,
            go_up,
            list_drives,
            quick_access,
            user_folder,
            launch_folder,
            launch_args,
            studio_info,
            open_in_studio,
            open_external,
            save_edit,
            suggest_tilt,
            catalog_folder,
            catalog_set,
            watch_folder,
            rename_file,
            paste
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
