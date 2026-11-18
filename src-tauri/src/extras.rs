//! Funciones que salen de dependencias ya listas: EXIF legible, quitar GPS, redimensionado SIMD,
//! WebP/AVIF, formatos que el navegador no dibuja (se pasan a PNG) y fotos duplicadas o parecidas.

use image::imageops::FilterType as ImgFilter;
use image::{DynamicImage, GenericImageView, ImageFormat};
use serde::Serialize;
use std::io::{BufReader, Cursor};
use std::path::Path;

// ---------- formatos que el visor no puede mostrar directo ----------

/// Formatos que `image` lee pero el navegador no dibuja: se sirven convertidos a PNG.
pub const CONVERT_EXT: &[&str] = &["exr", "hdr", "qoi", "tga", "pbm", "pgm", "ppm", "pnm", "pam"];

pub fn needs_png(ext: &str) -> bool {
    CONVERT_EXT.contains(&ext)
}

/// Decodifica y entrega un PNG. EXR y HDR son lineales en coma flotante: se les aplica gamma 2.2.
pub fn to_png(path: &Path) -> Result<Vec<u8>, String> {
    let img = image::open(path).map_err(|e| format!("no pude abrir la imagen: {e}"))?;
    let img = match img {
        DynamicImage::ImageRgb32F(_) | DynamicImage::ImageRgba32F(_) => {
            let rgba = img.to_rgba32f();
            let (w, h) = rgba.dimensions();
            let mut out = image::RgbaImage::new(w, h);
            for (x, y, p) in rgba.enumerate_pixels() {
                let ch = |v: f32| (v.clamp(0.0, 1.0).powf(1.0 / 2.2) * 255.0 + 0.5) as u8;
                out.put_pixel(x, y, image::Rgba([ch(p[0]), ch(p[1]), ch(p[2]), (p[3].clamp(0.0, 1.0) * 255.0 + 0.5) as u8]));
            }
            DynamicImage::ImageRgba8(out)
        }
        other => other,
    };
    let mut bytes = Vec::new();
    img.write_to(&mut Cursor::new(&mut bytes), ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    Ok(bytes)
}

// ---------- redimensionado rápido ----------

/// Reduce `img` para que su lado mayor sea `edge`, con SIMD. Si algo falla vuelve al `thumbnail` de `image`.
pub fn resize_fast(img: &DynamicImage, edge: u32) -> DynamicImage {
    use fast_image_resize::{FilterType, ResizeAlg, ResizeOptions, Resizer};
    let (w, h) = img.dimensions();
    if w <= edge && h <= edge {
        return img.clone();
    }
    let scale = edge as f64 / w.max(h) as f64;
    let nw = ((w as f64 * scale).round() as u32).max(1);
    let nh = ((h as f64 * scale).round() as u32).max(1);
    let src = if img.color().has_alpha() {
        DynamicImage::ImageRgba8(img.to_rgba8())
    } else {
        DynamicImage::ImageRgb8(img.to_rgb8())
    };
    let mut dst = DynamicImage::new(nw, nh, src.color());
    let options = ResizeOptions::new().resize_alg(ResizeAlg::Convolution(FilterType::Lanczos3));
    match Resizer::new().resize(&src, &mut dst, &options) {
        Ok(()) => dst,
        Err(_) => img.thumbnail(edge, edge),
    }
}

// ---------- WebP y AVIF con pérdida ----------


pub fn encode_webp(png: &[u8], quality: f32) -> Result<Vec<u8>, String> {
    let img = image::load_from_memory_with_format(png, ImageFormat::Png)
        .map_err(|e| format!("no pude leer la imagen para el WebP: {e}"))?;
    let rgba = img.to_rgba8();
    let encoder = webp::Encoder::from_rgba(rgba.as_raw(), rgba.width(), rgba.height());
    Ok(encoder.encode(quality).to_vec())
}

pub fn encode_avif(png: &[u8], quality: u8) -> Result<Vec<u8>, String> {
    use image::codecs::avif::AvifEncoder;
    use image::ImageEncoder;
    let img = image::load_from_memory_with_format(png, ImageFormat::Png)
        .map_err(|e| format!("no pude leer la imagen para el AVIF: {e}"))?;
    let rgba = img.to_rgba8();
    let mut bytes = Vec::new();
    // velocidad 6 de 10: buen equilibrio entre tamaño y tiempo para fotos de varios megapíxeles
    AvifEncoder::new_with_speed_quality(&mut bytes, 6, quality)
        .write_image(rgba.as_raw(), rgba.width(), rgba.height(), image::ExtendedColorType::Rgba8)
        .map_err(|e| e.to_string())?;
    Ok(bytes)
}

// ---------- EXIF legible ----------

#[derive(Debug, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExifSummary {
    pub camera: Option<String>,
    pub lens: Option<String>,
    pub taken: Option<String>,
    pub exposure: Option<String>,
    pub aperture: Option<String>,
    pub iso: Option<String>,
    pub focal: Option<String>,
    pub lat: Option<f64>,
    pub lon: Option<f64>,
}

fn text(exif: &exif::Exif, tag: exif::Tag) -> Option<String> {
    let field = exif.get_field(tag, exif::In::PRIMARY)?;
    let value = field.display_value().with_unit(exif).to_string();
    let value = value.trim().trim_matches('"').trim().to_string();
    if value.is_empty() || value == "0" { None } else { Some(value) }
}

fn degrees(exif: &exif::Exif, tag: exif::Tag, reference: exif::Tag) -> Option<f64> {
    let field = exif.get_field(tag, exif::In::PRIMARY)?;
    let exif::Value::Rational(parts) = &field.value else { return None };
    if parts.len() < 3 || parts.iter().any(|r| r.denom == 0) {
        return None;
    }
    let value = parts[0].to_f64() + parts[1].to_f64() / 60.0 + parts[2].to_f64() / 3600.0;
    let south_or_west = text(exif, reference).is_some_and(|r| r.starts_with('S') || r.starts_with('W'));
    Some(if south_or_west { -value } else { value })
}

pub fn exif_summary(path: &Path) -> ExifSummary {
    let Ok(file) = std::fs::File::open(path) else { return ExifSummary::default() };
    let Ok(exif) = exif::Reader::new().read_from_container(&mut BufReader::new(file)) else {
        return ExifSummary::default();
    };
    let make = text(&exif, exif::Tag::Make);
    let model = text(&exif, exif::Tag::Model);
    let camera = match (make, model) {
        // varios fabricantes repiten la marca dentro del modelo ("Canon Canon EOS…")
        (Some(a), Some(b)) if b.to_lowercase().starts_with(&a.to_lowercase()) => Some(b),
        (Some(a), Some(b)) => Some(format!("{a} {b}")),
        (a, b) => a.or(b),
    };
    let (lat, lon) = match (
        degrees(&exif, exif::Tag::GPSLatitude, exif::Tag::GPSLatitudeRef),
        degrees(&exif, exif::Tag::GPSLongitude, exif::Tag::GPSLongitudeRef),
    ) {
        (Some(a), Some(b)) if a.abs() <= 90.0 && b.abs() <= 180.0 => (Some(a), Some(b)),
        _ => (None, None),
    };
    ExifSummary {
        camera,
        lens: text(&exif, exif::Tag::LensModel),
        taken: text(&exif, exif::Tag::DateTimeOriginal),
        exposure: text(&exif, exif::Tag::ExposureTime),
        aperture: text(&exif, exif::Tag::FNumber),
        iso: text(&exif, exif::Tag::PhotographicSensitivity),
        focal: text(&exif, exif::Tag::FocalLength),
        lat,
        lon,
    }
}

/// Quita del archivo toda la información de ubicación (bloque GPS del EXIF). Deja el resto intacto.
pub fn strip_gps(path: &Path) -> Result<bool, String> {
    use little_exif::exif_tag::ExifTag;
    use little_exif::ifd::ExifTagGroup;
    use little_exif::metadata::Metadata;
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| -> Result<bool, String> {
        let mut metadata = Metadata::new_from_path(path).map_err(|e| e.to_string())?;
        let mut removed = 0;
        for hex in 0x0000u16..=0x001F {
            removed += metadata.remove_tag_by_hex_group(hex, ExifTagGroup::GPS);
        }
        removed += metadata.remove_tag(ExifTag::GPSInfo(Vec::new()));
        metadata.write_to_file(path).map_err(|e| e.to_string())?;
        Ok(removed > 0)
    }));
    result.unwrap_or_else(|_| Err("no se pudo quitar la ubicación".into()))
}

// ---------- duplicados y parecidas ----------

/// Huella perceptual (dHash 8×8 = 8 bytes) de una foto, calculada sobre una versión reducida.
pub fn fingerprint(path: &Path) -> Option<Vec<u8>> {
    use image_hasher::{HashAlg, HasherConfig};
    let img = crate::files::open_oriented(path).ok()?;
    let small = resize_fast(&img, 96);
    let hasher = HasherConfig::new()
        .hash_alg(HashAlg::Gradient)
        .hash_size(8, 8)
        .resize_filter(ImgFilter::Triangle)
        .to_hasher();
    Some(hasher.hash_image(&small).as_bytes().to_vec())
}

fn hamming(a: &[u8], b: &[u8]) -> u32 {
    a.iter().zip(b).map(|(x, y)| (x ^ y).count_ones()).sum()
}

/// Nombre sin extensión y sin el sufijo que Windows agrega al chocar: "foto (2)", "foto - copia".
pub fn base_stem(name: &str) -> String {
    let stem = match name.rfind('.') {
        Some(i) if i > 0 => &name[..i],
        _ => name,
    };
    let mut s = stem.trim().to_lowercase();
    loop {
        let before = s.len();
        if s.ends_with(')') {
            if let Some(open) = s.rfind('(') {
                let inside = &s[open + 1..s.len() - 1];
                if !inside.is_empty() && inside.chars().all(|c| c.is_ascii_digit()) {
                    s.truncate(open);
                    s = s.trim_end().to_string();
                }
            }
        }
        for suffix in [" - copia", " - copy", " copia", " copy"] {
            if let Some(rest) = s.strip_suffix(suffix) {
                s = rest.trim_end().to_string();
            }
        }
        if s.len() == before {
            break;
        }
    }
    s
}

#[allow(dead_code)]
/// El nombre trae el sufijo "(N)" o "- copia": señal de que chocó con otro archivo y puede ser una copia.
pub fn looks_like_copy(name: &str) -> bool {
    let stem = match name.rfind('.') {
        Some(i) if i > 0 => &name[..i],
        _ => name,
    };
    base_stem(name) != stem.trim().to_lowercase()
}

/// Con el mismo nombre base (salvo el sufijo) basta una distancia más floja: ya hay otra pista de copia.
pub const NAME_DIST: u32 = 12;

/// Agrupa las huellas parecidas (distancia ≤ `max_dist` de 64 bits). Cada grupo trae 2 o más índices.
pub fn group_similar(hashes: &[Option<Vec<u8>>], names: &[String], max_dist: u32) -> Vec<Vec<usize>> {
    let stems: Vec<String> = names.iter().map(|n| base_stem(n)).collect();
    let n = hashes.len();
    let mut parent: Vec<usize> = (0..n).collect();
    fn find(parent: &mut [usize], mut i: usize) -> usize {
        while parent[i] != i {
            parent[i] = parent[parent[i]];
            i = parent[i];
        }
        i
    }
    for i in 0..n {
        let Some(a) = &hashes[i] else { continue };
        for j in (i + 1)..n {
            let Some(b) = &hashes[j] else { continue };
            let limit = if !stems[i].is_empty() && stems[i] == stems[j] { max_dist.max(NAME_DIST) } else { max_dist };
            if hamming(a, b) <= limit {
                let (ri, rj) = (find(&mut parent, i), find(&mut parent, j));
                if ri != rj {
                    parent[rj] = ri;
                }
            }
        }
    }
    let mut groups: std::collections::BTreeMap<usize, Vec<usize>> = std::collections::BTreeMap::new();
    for i in 0..n {
        if hashes[i].is_some() {
            let root = find(&mut parent, i);
            groups.entry(root).or_default().push(i);
        }
    }
    groups.into_values().filter(|g| g.len() > 1).collect()
}

/// Calcula las huellas de varias fotos repartiendo el trabajo entre los núcleos disponibles.
pub fn fingerprints(paths: &[std::path::PathBuf]) -> Vec<Option<Vec<u8>>> {
    let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(2).clamp(1, 8);
    let chunk = paths.len().div_ceil(threads).max(1);
    let mut out: Vec<Option<Vec<u8>>> = Vec::with_capacity(paths.len());
    std::thread::scope(|scope| {
        let handles: Vec<_> = paths
            .chunks(chunk)
            .map(|part| {
                scope.spawn(move || {
                    part.iter()
                        .map(|p| std::panic::catch_unwind(|| fingerprint(p)).ok().flatten())
                        .collect::<Vec<_>>()
                })
            })
            .collect();
        for handle in handles {
            out.extend(handle.join().unwrap_or_default());
        }
    });
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn agrupa_solo_lo_parecido() {
        let a = vec![0u8; 8];
        let mut b = vec![0u8; 8];
        b[0] = 0b0000_0011; // 2 bits de diferencia
        let c = vec![0xFFu8; 8];
        let names: Vec<String> = ["a.jpg", "b.jpg", "c.jpg", "d.jpg"].iter().map(|s| s.to_string()).collect();
        let groups = group_similar(&[Some(a), Some(b), Some(c), None], &names, 5);
        assert_eq!(groups, vec![vec![0, 1]]);
    }

    #[test]
    fn el_nombre_con_sufijo_junta_fotos_algo_distintas() {
        let a = vec![0u8; 8];
        let mut b = vec![0u8; 8];
        b[0] = 0xFF; // 8 bits: más que el umbral normal, menos que NAME_DIST
        let names: Vec<String> = ["IMG_1.jpg", "IMG_1 (2).jpg"].iter().map(|s| s.to_string()).collect();
        assert_eq!(group_similar(&[Some(a.clone()), Some(b.clone())], &names, 4).len(), 1);
        let otros: Vec<String> = ["IMG_1.jpg", "IMG_2.jpg"].iter().map(|s| s.to_string()).collect();
        assert!(group_similar(&[Some(a), Some(b)], &otros, 4).is_empty());
    }

    #[test]
    fn reconoce_sufijos_de_copia() {
        assert_eq!(base_stem("IMG_1 (2).JPG"), "img_1");
        assert_eq!(base_stem("foto - copia (3).png"), "foto");
        assert_eq!(base_stem("viaje (2024).jpg"), "viaje");
        assert!(looks_like_copy("IMG_1 (2).jpg"));
        assert!(!looks_like_copy("IMG_1.jpg"));
    }

    #[test]
    fn webp_y_avif_producen_archivos_validos() {
        let img = DynamicImage::ImageRgb8(image::RgbImage::from_fn(64, 48, |x, y| image::Rgb([(x * 4) as u8, (y * 5) as u8, 90])));
        let mut png = Vec::new();
        img.write_to(&mut Cursor::new(&mut png), ImageFormat::Png).unwrap();
        let w = encode_webp(&png, 90.0).unwrap();
        assert_eq!(&w[0..4], b"RIFF");
        assert_eq!(&w[8..12], b"WEBP");
        let a = encode_avif(&png, 80).unwrap();
        assert_eq!(&a[4..8], b"ftyp");
    }

    #[test]
    fn resize_respeta_proporcion() {
        let img = DynamicImage::ImageRgb8(image::RgbImage::new(400, 200));
        let out = resize_fast(&img, 100);
        assert_eq!(out.dimensions(), (100, 50));
    }

    #[test]
    fn exif_de_archivo_sin_exif_es_vacio() {
        let dir = std::env::temp_dir().join("photovisor-extras-test.png");
        image::RgbImage::new(4, 4).save(&dir).unwrap();
        assert_eq!(exif_summary(&dir), ExifSummary::default());
        let _ = std::fs::remove_file(dir);
    }
}
