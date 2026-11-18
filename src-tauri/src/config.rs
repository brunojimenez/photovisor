use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub last_folder: Option<String>,
    #[serde(default)]
    pub shift_delete_without_asking: bool,
    #[serde(default)]
    pub filmstrip: bool,
    #[serde(default)]
    pub discard_edit_without_asking: bool,
    /// Qué tan parecidas deben ser dos fotos para contarlas como duplicadas (0-16 de 64 bits).
    #[serde(default = "default_dup_dist")]
    pub dup_max_dist: u32,
    /// Calidad al guardar ediciones (JPG, WebP y AVIF).
    #[serde(default = "default_jpeg")]
    pub jpeg_quality: u8,
    #[serde(default = "default_webp")]
    pub webp_quality: u8,
    #[serde(default = "default_avif")]
    pub avif_quality: u8,
}

fn default_dup_dist() -> u32 {
    4
}
fn default_jpeg() -> u8 {
    95
}
fn default_webp() -> u8 {
    90
}
fn default_avif() -> u8 {
    80
}

impl Default for Config {
    fn default() -> Self {
        Self {
            last_folder: None,
            shift_delete_without_asking: false,
            filmstrip: false,
            discard_edit_without_asking: false,
            dup_max_dist: default_dup_dist(),
            jpeg_quality: default_jpeg(),
            webp_quality: default_webp(),
            avif_quality: default_avif(),
        }
    }
}

fn config_file(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("config.json"))
}

pub fn load(app: &AppHandle) -> Config {
    let Ok(path) = config_file(app) else {
        return Config::default();
    };
    let Ok(text) = fs::read_to_string(path) else {
        return Config::default();
    };
    serde_json::from_str(&text).unwrap_or_default()
}

pub fn save(app: &AppHandle, config: &Config) -> Result<(), String> {
    let path = config_file(app)?;
    let text = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(path, text).map_err(|e| e.to_string())
}
