mod config;
mod files;
mod thumbs;

use base64::{engine::general_purpose::STANDARD, Engine};
use files::{BatchReport, FileInfo, FolderView};
use percent_encoding::percent_decode_str;
use serde::Deserialize;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::Manager;

const STUDIO_BACKEND: &str = r"D:\workspace\docs\comfyui\studio\backend";
static STUDIO_STARTING: AtomicBool = AtomicBool::new(false);

fn http_ok(addr: &str, path: &str) -> bool {
    let Ok(socket) = addr.parse::<SocketAddr>() else {
        return false;
    };
    let mut stream = match TcpStream::connect_timeout(&socket, Duration::from_millis(600)) {
        Ok(stream) => stream,
        Err(_) => return false,
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(800)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(800)));
    let req = format!("GET {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n");
    if stream.write_all(req.as_bytes()).is_err() {
        return false;
    }
    let mut buf = [0u8; 160];
    let n = stream.read(&mut buf).unwrap_or(0);
    String::from_utf8_lossy(&buf[..n]).contains(" 200 ")
}

fn start_studio_api() {
    if STUDIO_STARTING.swap(true, Ordering::SeqCst) {
        return;
    }
    if !Path::new(STUDIO_BACKEND).is_dir() {
        STUDIO_STARTING.store(false, Ordering::SeqCst);
        return;
    }
    let mut cmd = Command::new("python");
    cmd.args(["-m", "uvicorn", "app:app", "--host", "127.0.0.1", "--port", "8790"])
        .current_dir(STUDIO_BACKEND)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    if cmd.spawn().is_err() {
        STUDIO_STARTING.store(false, Ordering::SeqCst);
    }
}

#[tauri::command]
fn ai_status() -> serde_json::Value {
    let comfy = http_ok("127.0.0.1:8188", "/system_stats");
    let mut studio = http_ok("127.0.0.1:8790", "/api/health");
    if comfy && !studio {
        start_studio_api();
        studio = http_ok("127.0.0.1:8790", "/api/health");
    }
    serde_json::json!({ "comfy": comfy, "studio": studio })
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
async fn recycle(state: tauri::State<'_, AppState>, paths: Vec<String>) -> Result<BatchReport, String> {
    let root = root_of(&state)?;
    tauri::async_runtime::spawn_blocking(move || files::recycle_many(&root, &paths))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn paste(
    state: tauri::State<'_, AppState>,
    dest: String,
    sources: Vec<String>,
    cut: bool,
) -> Result<BatchReport, String> {
    let root = root_of(&state)?;
    let dest = files::ensure_inside(&root, Path::new(&dest))?;
    tauri::async_runtime::spawn_blocking(move || files::paste_files(&dest, &sources, cut))
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn rename_file(state: tauri::State<AppState>, path: String, name: String) -> Result<String, String> {
    let root = root_of(&state)?;
    let dest = files::rename_entry(&root, Path::new(&path), &name)?;
    Ok(files::nice_path(&dest))
}

#[tauri::command]
async fn save_edit(
    state: tauri::State<'_, AppState>,
    source: String,
    data_b64: String,
    mode: String,
) -> Result<String, String> {
    let root = root_of(&state)?;
    let bytes = STANDARD
        .decode(data_b64.trim())
        .map_err(|_| "la imagen guardada no se pudo leer".to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        let dest = files::save_png(&root, Path::new(&source), &bytes, &mode)?;
        Ok(files::nice_path(&dest))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn delete_permanent(
    state: tauri::State<'_, AppState>,
    paths: Vec<String>,
) -> Result<BatchReport, String> {
    let root = root_of(&state)?;
    tauri::async_runtime::spawn_blocking(move || files::delete_many(&root, &paths))
        .await
        .map_err(|e| e.to_string())
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
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            root: Mutex::new(None),
        })
        .register_uri_scheme_protocol("photo", photo_protocol)
        .invoke_handler(tauri::generate_handler![
            load_config,
            save_config,
            open_root,
            list_dir,
            thumbnail,
            file_info,
            transform,
            recycle,
            delete_permanent,
            go_up,
            list_drives,
            quick_access,
            user_folder,
            launch_folder,
            save_edit,
            rename_file,
            paste,
            ai_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
