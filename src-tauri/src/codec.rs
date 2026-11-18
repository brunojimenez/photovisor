//! Codificación al guardar y análisis de imagen en Rust.
//!
//! * JPG: el editor entrega un PNG sin pérdida y aquí se codifica con mozjpeg (progresivo, sin submuestreo
//!   de color). A igual calidad pesa menos que el codificador del navegador.
//! * PNG: oxipng recomprime sin pérdida; los píxeles quedan idénticos.
//! * Inclinación: bordes (Canny) y rectas (Hough) de imageproc sobre una copia reducida.

use image::imageops::FilterType;
use image::{DynamicImage, GrayImage};
use imageproc::edges::canny;
use imageproc::filter::gaussian_blur_f32;
use imageproc::hough::{detect_lines, LineDetectionOptions};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::Path;

/// Calidad JPG al guardar (0-100). 95 con color completo es visualmente igual al original.
#[cfg(test)]
pub const JPEG_QUALITY: f32 = 95.0;

pub fn encode_jpeg(png: &[u8], quality: f32) -> Result<Vec<u8>, String> {
    let rgb = image::load_from_memory_with_format(png, image::ImageFormat::Png)
        .map_err(|e| format!("no pude leer la imagen para el JPG: {e}"))?
        .to_rgb8();
    let (w, h) = rgb.dimensions();
    // mozjpeg avisa de los errores con pánico: se contiene aquí para que no tumbe el programa
    catch_unwind(AssertUnwindSafe(|| -> std::io::Result<Vec<u8>> {
        let mut comp = mozjpeg::Compress::new(mozjpeg::ColorSpace::JCS_RGB);
        comp.set_size(w as usize, h as usize);
        comp.set_quality(quality);
        comp.set_progressive_mode();
        comp.set_chroma_sampling_pixel_sizes((1, 1), (1, 1));
        let mut started = comp.start_compress(Vec::new())?;
        started.write_scanlines(rgb.as_raw())?;
        started.finish()
    }))
    .map_err(|_| "mozjpeg falló al codificar".to_string())?
    .map_err(|e| e.to_string())
}

pub fn optimize_png(png: &[u8]) -> Vec<u8> {
    let opts = oxipng::Options::from_preset(0);
    match oxipng::optimize_from_memory(png, &opts) {
        Ok(better) if better.len() < png.len() => better,
        _ => png.to_vec(),
    }
}

/// Ángulo (grados) que hay que darle a la foto para enderezarla, o None si no hay rectas fiables.
/// Positivo = giro en sentido horario, igual que el deslizador «Ángulo» del editor.
pub fn suggest_tilt(path: &Path, mirrored: bool) -> Result<Option<f32>, String> {
    let img = image::open(path).map_err(|e| format!("no pude abrir la foto: {e}"))?;
    let small = if img.width().max(img.height()) > 900 {
        img.resize(900, 900, FilterType::Triangle)
    } else {
        img
    };
    let tilt = tilt_of(&DynamicImage::to_luma8(&small));
    Ok(tilt.map(|t| if mirrored { -t } else { t }))
}

fn tilt_of(gray: &GrayImage) -> Option<f32> {
    let soft = gaussian_blur_f32(gray, 1.4);
    let edges = canny(&soft, 40.0, 100.0);
    let side = gray.width().min(gray.height());
    let lines = detect_lines(
        &edges,
        LineDetectionOptions {
            vote_threshold: (side as f32 * 0.3) as u32,
            suppression_radius: 10,
        },
    );
    // desviación de cada recta respecto al eje más cercano (horizontal o vertical), en grados horarios
    let mut devs: Vec<f32> = lines
        .iter()
        .filter_map(|line| {
            let a = line.angle_in_degrees as f32;
            if a <= 25.0 {
                Some(a)
            } else if a >= 155.0 {
                Some(a - 180.0)
            } else if (65.0..=115.0).contains(&a) {
                Some(a - 90.0)
            } else {
                None
            }
        })
        .collect();
    if devs.len() < 2 {
        return None;
    }
    devs.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let median = devs[devs.len() / 2];
    let close: Vec<f32> = devs.iter().copied().filter(|d| (d - median).abs() <= 2.0).collect();
    if close.len() < 2 {
        return None;
    }
    let mean = close.iter().sum::<f32>() / close.len() as f32;
    Some(((-mean) * 10.0).round() / 10.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgb, RgbImage};
    use imageproc::drawing::draw_line_segment_mut;
    use std::io::Cursor;
    use std::time::Instant;

    /// Foto sintética: degradado con ruido, para que los codificadores tengan trabajo real.
    fn photo(w: u32, h: u32) -> RgbImage {
        let mut seed = 12345u32;
        RgbImage::from_fn(w, h, |x, y| {
            seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
            let n = ((seed >> 24) as f32 / 255.0 - 0.5) * 10.0;
            let r = 40.0 + 170.0 * x as f32 / w as f32 + n;
            let g = 60.0 + 120.0 * y as f32 / h as f32 + n;
            let b = 120.0 + 60.0 * ((x + y) as f32 / (w + h) as f32) + n;
            Rgb([r.clamp(0.0, 255.0) as u8, g.clamp(0.0, 255.0) as u8, b.clamp(0.0, 255.0) as u8])
        })
    }

    fn png_bytes(img: &RgbImage) -> Vec<u8> {
        let mut out = Cursor::new(Vec::new());
        img.write_to(&mut out, image::ImageFormat::Png).unwrap();
        out.into_inner()
    }

    #[test]
    fn jpeg_mozjpeg_conserva_la_imagen() {
        let img = photo(512, 384);
        let jpg = encode_jpeg(&png_bytes(&img), JPEG_QUALITY).unwrap();
        assert!(jpg.starts_with(&[0xFF, 0xD8]), "no es un JPG");
        let back = image::load_from_memory_with_format(&jpg, image::ImageFormat::Jpeg).unwrap().to_rgb8();
        assert_eq!(back.dimensions(), img.dimensions());
        let err: f64 = img
            .as_raw()
            .iter()
            .zip(back.as_raw())
            .map(|(a, b)| (*a as f64 - *b as f64).abs())
            .sum::<f64>()
            / img.as_raw().len() as f64;
        assert!(err < 2.0, "error medio por canal demasiado alto: {err}");
    }

    #[test]
    fn png_oxipng_es_sin_perdida() {
        let img = photo(512, 384);
        let png = png_bytes(&img);
        let better = optimize_png(&png);
        assert!(better.len() <= png.len());
        let back = image::load_from_memory_with_format(&better, image::ImageFormat::Png).unwrap().to_rgb8();
        assert_eq!(back.as_raw(), img.as_raw(), "oxipng cambió píxeles");
    }

    #[test]
    fn detecta_la_inclinacion() {
        // rejilla de rectas giradas 3° en sentido horario (y hacia abajo): la corrección es -3°
        let (w, h) = (640u32, 480u32);
        let mut img = GrayImage::from_pixel(w, h, image::Luma([20]));
        let a = 3.0f32.to_radians();
        let (c, s) = (a.cos(), a.sin());
        let rot = |x: f32, y: f32| {
            let (dx, dy) = (x - w as f32 / 2.0, y - h as f32 / 2.0);
            (w as f32 / 2.0 + dx * c - dy * s, h as f32 / 2.0 + dx * s + dy * c)
        };
        for k in 0..5 {
            let y = 60.0 + k as f32 * 90.0;
            draw_line_segment_mut(&mut img, rot(-100.0, y), rot(w as f32 + 100.0, y), image::Luma([230]));
        }
        for k in 0..6 {
            let x = 60.0 + k as f32 * 100.0;
            draw_line_segment_mut(&mut img, rot(x, -100.0), rot(x, h as f32 + 100.0), image::Luma([230]));
        }
        let t = tilt_of(&img).expect("no encontró rectas");
        assert!((t + 3.0).abs() <= 1.0, "esperaba cerca de -3°, salió {t}");
        // una imagen sin rectas no debe inventar un ángulo
        let flat = GrayImage::from_pixel(w, h, image::Luma([90]));
        assert!(tilt_of(&flat).is_none());
    }

    #[test]
    fn mide_tiempos_con_12_megapixeles() {
        let img = photo(4000, 3000);
        let png = png_bytes(&img);
        let t = Instant::now();
        let jpg = encode_jpeg(&png, JPEG_QUALITY).unwrap();
        let t_jpg = t.elapsed();
        for level in [0u8, 1, 2] {
            let t = Instant::now();
            let o = oxipng::optimize_from_memory(&png, &oxipng::Options::from_preset(level)).unwrap();
            println!("oxipng nivel {level}: {:.1} MB en {:.1}s", o.len() as f64 / 1e6, t.elapsed().as_secs_f32());
        }
        let t = Instant::now();
        let opt = optimize_png(&png);
        let t_png = t.elapsed();
        // referencia: el codificador JPG de la librería `image`, a calidad parecida
        let mut base = Cursor::new(Vec::new());
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut base, 95)
            .encode_image(&img)
            .unwrap();
        println!(
            "12 MP  PNG {:.1} MB -> oxipng {:.1} MB ({:.1}s) | JPG mozjpeg {:.1} MB ({:.1}s) vs image {:.1} MB",
            png.len() as f64 / 1e6,
            opt.len() as f64 / 1e6,
            t_png.as_secs_f32(),
            jpg.len() as f64 / 1e6,
            t_jpg.as_secs_f32(),
            base.into_inner().len() as f64 / 1e6,
        );
    }
}
