use image::codecs::jpeg::JpegEncoder;
use image::{DynamicImage, ExtendedColorType, ImageEncoder, RgbImage};
use std::cell::Cell;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::os::windows::ffi::OsStrExt;
use std::path::Path;
use windows::core::PCWSTR;
use windows::Win32::Graphics::Gdi::{
    DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
    DIB_RGB_COLORS, HBITMAP, HGDIOBJ,
};
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED};
use windows::Win32::UI::Shell::{
    ISharedBitmap, IShellItem, IThumbnailCache, LocalThumbnailCache, SHCreateItemFromParsingName, WTS_EXTRACT,
    WTS_INCACHEONLY,
};

thread_local! {
    static COM_READY: Cell<bool> = const { Cell::new(false) };
}

fn ensure_com() {
    COM_READY.with(|ready| {
        if ready.get() {
            return;
        }
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
        ready.set(true);
    });
}

fn shell_bitmap(path: &Path, edge: u32, cache_only: bool) -> Option<Vec<u8>> {
    ensure_com();
    let wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    unsafe {
        let item: IShellItem = SHCreateItemFromParsingName(PCWSTR(wide.as_ptr()), None).ok()?;
        let cache: IThumbnailCache = CoCreateInstance(&LocalThumbnailCache, None, CLSCTX_INPROC_SERVER).ok()?;
        let flags = if cache_only { WTS_INCACHEONLY } else { WTS_EXTRACT };
        let mut shared: Option<ISharedBitmap> = None;
        cache
            .GetThumbnail(&item, edge.min(256), flags, Some(&mut shared), None, None)
            .ok()?;
        let shared = shared?;
        let bitmap = shared.Detach().ok()?;
        bitmap_jpeg(bitmap, edge)
    }
}

fn bitmap_jpeg(bitmap: HBITMAP, edge: u32) -> Option<Vec<u8>> {
    unsafe {
        let mut info = BITMAP::default();
        let got = GetObjectW(
            HGDIOBJ(bitmap.0),
            std::mem::size_of::<BITMAP>() as i32,
            Some(&mut info as *mut BITMAP as *mut _),
        );
        if got == 0 {
            let _ = DeleteObject(HGDIOBJ(bitmap.0));
            return None;
        }
        let width = info.bmWidth as u32;
        let height = info.bmHeight.unsigned_abs();
        if width == 0 || height == 0 || width > 4096 || height > 4096 {
            let _ = DeleteObject(HGDIOBJ(bitmap.0));
            return None;
        }
        let mut header = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width as i32,
                biHeight: -(height as i32),
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut pixels = vec![0u8; (width as usize) * (height as usize) * 4];
        let dc = GetDC(None);
        let rows = GetDIBits(
            dc,
            bitmap,
            0,
            height,
            Some(pixels.as_mut_ptr() as *mut _),
            &mut header,
            DIB_RGB_COLORS,
        );
        ReleaseDC(None, dc);
        let _ = DeleteObject(HGDIOBJ(bitmap.0));
        if rows == 0 {
            return None;
        }
        let mut rgb = Vec::with_capacity((width as usize) * (height as usize) * 3);
        for px in pixels.chunks_exact(4) {
            rgb.extend_from_slice(&[px[2], px[1], px[0]]);
        }
        let image = RgbImage::from_raw(width, height, rgb)?;
        Some(encode_jpeg(&DynamicImage::ImageRgb8(image), edge))
    }
}

fn embedded_preview(path: &Path, edge: u32) -> Option<Vec<u8>> {
    let bytes = jpeg_exif_thumb(path)?;
    let image = image::load_from_memory(&bytes).ok()?;
    Some(encode_jpeg(&image, edge))
}

fn jpeg_exif_thumb(path: &Path) -> Option<Vec<u8>> {
    let mut file = File::open(path).ok()?;
    let mut mark = [0u8; 2];
    file.read_exact(&mut mark).ok()?;
    if mark != [0xFF, 0xD8] {
        return None;
    }
    let mut walked = 2u64;
    loop {
        if walked > 8 * 1024 * 1024 {
            return None;
        }
        let mut marker = [0u8; 2];
        file.read_exact(&mut marker).ok()?;
        walked += 2;
        while marker[0] != 0xFF {
            marker[0] = marker[1];
            file.read_exact(&mut marker[1..]).ok()?;
            walked += 1;
        }
        while marker[1] == 0xFF {
            file.read_exact(&mut marker[1..]).ok()?;
            walked += 1;
        }
        if marker[1] == 0xD8 || marker[1] == 0xD9 || marker[1] == 0xDA || marker[1] == 0x01 || (0xD0..=0xD7).contains(&marker[1]) {
            if marker[1] == 0xDA || marker[1] == 0xD9 {
                return None;
            }
            continue;
        }
        let mut len_buf = [0u8; 2];
        file.read_exact(&mut len_buf).ok()?;
        walked += 2;
        let len = u16::from_be_bytes(len_buf) as usize;
        if len < 2 || len > 2 * 1024 * 1024 {
            return None;
        }
        if marker[1] == 0xE1 {
            let mut segment = vec![0u8; len - 2];
            file.read_exact(&mut segment).ok()?;
            if segment.starts_with(b"Exif\0\0") {
                return tiff_jpeg_thumb(&segment[6..]);
            }
        } else {
            file.seek(SeekFrom::Current((len - 2) as i64)).ok()?;
        }
        walked += (len - 2) as u64;
    }
}

fn tiff_jpeg_thumb(tiff: &[u8]) -> Option<Vec<u8>> {
    if tiff.len() < 8 {
        return None;
    }
    let le = match &tiff[0..2] {
        b"II" => true,
        b"MM" => false,
        _ => return None,
    };
    let read_u16 = |at: usize| -> Option<u16> {
        let b = tiff.get(at..at + 2)?;
        Some(if le { u16::from_le_bytes([b[0], b[1]]) } else { u16::from_be_bytes([b[0], b[1]]) })
    };
    let read_u32 = |at: usize| -> Option<u32> {
        let b = tiff.get(at..at + 4)?;
        Some(if le { u32::from_le_bytes([b[0], b[1], b[2], b[3]]) } else { u32::from_be_bytes([b[0], b[1], b[2], b[3]]) })
    };
    if read_u16(2)? != 42 {
        return None;
    }
    let mut ifd = read_u32(4)? as usize;
    for _ in 0..4 {
        if ifd + 2 > tiff.len() {
            return None;
        }
        let count = read_u16(ifd)? as usize;
        let entries = ifd + 2;
        let next_at = entries + count * 12;
        let next = read_u32(next_at)?;
        let mut offset = None;
        let mut length = None;
        for n in 0..count {
            let entry = entries + n * 12;
            let tag = read_u16(entry)?;
            let value = read_u32(entry + 8)?;
            if tag == 0x0201 {
                offset = Some(value as usize);
            } else if tag == 0x0202 {
                length = Some(value as usize);
            }
        }
        if let (Some(offset), Some(length)) = (offset, length) {
            if length >= 4 && offset + length <= tiff.len() && tiff.get(offset..offset + 2) == Some(&[0xFF, 0xD8]) {
                return Some(tiff[offset..offset + length].to_vec());
            }
        }
        if next == 0 {
            return None;
        }
        ifd = next as usize;
    }
    None
}

fn encode_jpeg(image: &DynamicImage, edge: u32) -> Vec<u8> {
    let fitted = if image.width().max(image.height()) > edge {
        image.thumbnail(edge, edge)
    } else {
        image.clone()
    };
    let rgb = fitted.to_rgb8();
    let mut bytes = Vec::new();
    let encoder = JpegEncoder::new_with_quality(&mut bytes, 80);
    let _ = encoder.write_image(rgb.as_raw(), rgb.width(), rgb.height(), ExtendedColorType::Rgb8);
    bytes
}

pub fn cached_jpeg(dir: &Path, path: &Path, mtime: u64, edge: u32) -> Option<Vec<u8>> {
    let bytes = std::fs::read(dir.join(cache_name(path, mtime, edge))).ok()?;
    if bytes.len() < 4 || bytes[0] != 0xFF || bytes[1] != 0xD8 {
        None
    } else {
        Some(bytes)
    }
}

pub fn store_jpeg(dir: &Path, path: &Path, mtime: u64, edge: u32, bytes: &[u8]) {
    if bytes.len() < 4 {
        return;
    }
    let _ = std::fs::create_dir_all(dir);
    let _ = std::fs::write(dir.join(cache_name(path, mtime, edge)), bytes);
}

fn cache_name(path: &Path, mtime: u64, edge: u32) -> String {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in path.to_string_lossy().as_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}_{mtime}_{edge}.jpg")
}

pub fn from_embedded(path: &Path, edge: u32) -> Option<Vec<u8>> {
    let bytes = embedded_preview(path, edge)?;
    if bytes.is_empty() { None } else { Some(bytes) }
}

pub fn from_cache(path: &Path, edge: u32) -> Option<Vec<u8>> {
    let bytes = shell_bitmap(path, edge, true)?;
    if bytes.is_empty() { None } else { Some(bytes) }
}
