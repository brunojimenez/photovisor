//! Catálogo de fotos: valoración (0-5 estrellas) y etiqueta de color, guardadas en SQLite fuera de las
//! fotos (en la carpeta de configuración del programa). Las claves son las rutas tal como las muestra la
//! interfaz; al renombrar, mover o borrar desde PhotoVisor el catálogo se mantiene al día.

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct Meta {
    pub rating: u8,
    pub label: String,
}

pub struct Catalog {
    conn: Mutex<Connection>,
}

/// Carpeta de una ruta, con la barra final solo en la raíz de una unidad ("C:\").
fn dir_of(path: &str) -> String {
    match path.rfind(['\\', '/']) {
        Some(i) => norm_dir(&path[..i + 1]),
        None => String::new(),
    }
}

fn norm_dir(folder: &str) -> String {
    let trimmed = folder.trim_end_matches(['\\', '/']);
    if trimmed.len() == 2 && trimmed.ends_with(':') {
        format!("{trimmed}\\")
    } else {
        trimmed.to_string()
    }
}

impl Catalog {
    pub fn open(file: &Path) -> Result<Self, String> {
        let conn = Connection::open(file).map_err(|e| e.to_string())?;
        Self::init(conn)
    }

    #[cfg(test)]
    pub fn in_memory() -> Result<Self, String> {
        Self::init(Connection::open_in_memory().map_err(|e| e.to_string())?)
    }

    fn init(conn: Connection) -> Result<Self, String> {
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             CREATE TABLE IF NOT EXISTS photos (
                 path   TEXT PRIMARY KEY COLLATE NOCASE,
                 dir    TEXT NOT NULL COLLATE NOCASE,
                 rating INTEGER NOT NULL DEFAULT 0,
                 label  TEXT NOT NULL DEFAULT ''
             );
             CREATE INDEX IF NOT EXISTS photos_dir ON photos(dir);",
        )
        .map_err(|e| e.to_string())?;
        Ok(Self { conn: Mutex::new(conn) })
    }

    /// Valoraciones y etiquetas de las fotos de una carpeta (solo las que tienen algo).
    pub fn folder(&self, folder: &str) -> HashMap<String, Meta> {
        let conn = self.conn.lock().unwrap();
        let Ok(mut stmt) = conn.prepare("SELECT path, rating, label FROM photos WHERE dir = ?1") else {
            return HashMap::new();
        };
        let rows = stmt.query_map(params![norm_dir(folder)], |row| {
            Ok((row.get::<_, String>(0)?, Meta { rating: row.get::<_, i64>(1)? as u8, label: row.get(2)? }))
        });
        match rows {
            Ok(iter) => iter.flatten().collect(),
            Err(_) => HashMap::new(),
        }
    }

    /// Cambia la valoración y/o la etiqueta de varias fotos. `None` deja el valor como está;
    /// valoración 0 y etiqueta vacía borran la fila.
    pub fn set(&self, paths: &[String], rating: Option<u8>, label: Option<&str>) -> Result<(), String> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        for path in paths {
            let current: Option<(i64, String)> = tx
                .query_row("SELECT rating, label FROM photos WHERE path = ?1", params![path], |r| Ok((r.get(0)?, r.get(1)?)))
                .optional()
                .map_err(|e| e.to_string())?;
            let (old_rating, old_label) = current.unwrap_or((0, String::new()));
            let new_rating = rating.map(i64::from).unwrap_or(old_rating).clamp(0, 5);
            let new_label = label.map(str::to_string).unwrap_or(old_label);
            if new_rating == 0 && new_label.is_empty() {
                tx.execute("DELETE FROM photos WHERE path = ?1", params![path]).map_err(|e| e.to_string())?;
            } else {
                tx.execute(
                    "INSERT INTO photos (path, dir, rating, label) VALUES (?1, ?2, ?3, ?4)
                     ON CONFLICT(path) DO UPDATE SET rating = ?3, label = ?4",
                    params![path, dir_of(path), new_rating, new_label],
                )
                .map_err(|e| e.to_string())?;
            }
        }
        tx.commit().map_err(|e| e.to_string())
    }

    /// La foto cambió de ruta: la valoración y la etiqueta la siguen.
    pub fn rename(&self, from: &str, to: &str) {
        let conn = self.conn.lock().unwrap();
        let _ = conn.execute("DELETE FROM photos WHERE path = ?1 AND ?1 != ?2", params![to, from]);
        let _ = conn.execute("UPDATE photos SET path = ?2, dir = ?3 WHERE path = ?1", params![from, to, dir_of(to)]);
    }

    /// Se movió una carpeta entera: todo lo que valía dentro de ella sigue a la nueva ruta.
    pub fn rename_tree(&self, from: &str, to: &str) {
        let conn = self.conn.lock().unwrap();
        let prefix = format!("{from}\\");
        let rows: Vec<String> = match conn.prepare("SELECT path FROM photos WHERE substr(path, 1, ?2) = ?1") {
            Ok(mut stmt) => stmt
                .query_map(params![prefix, prefix.chars().count() as i64], |row| row.get::<_, String>(0))
                .map(|rows| rows.flatten().collect())
                .unwrap_or_default(),
            Err(_) => return,
        };
        for path in rows {
            let Some(rest) = path.strip_prefix(&prefix) else { continue };
            let new_path = format!("{to}\\{rest}");
            let _ = conn.execute("DELETE FROM photos WHERE path = ?1", params![new_path]);
            let _ = conn.execute(
                "UPDATE photos SET path = ?2, dir = ?3 WHERE path = ?1",
                params![path, new_path, dir_of(&new_path)],
            );
        }
    }

    /// Una copia hereda la valoración y la etiqueta del original.
    pub fn copy(&self, from: &str, to: &str) {
        let conn = self.conn.lock().unwrap();
        let _ = conn.execute(
            "INSERT OR REPLACE INTO photos (path, dir, rating, label)
             SELECT ?2, ?3, rating, label FROM photos WHERE path = ?1",
            params![from, to, dir_of(to)],
        );
    }

    pub fn remove(&self, paths: &[String]) {
        let conn = self.conn.lock().unwrap();
        for path in paths {
            let _ = conn.execute("DELETE FROM photos WHERE path = ?1", params![path]);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(v: &str) -> String {
        v.to_string()
    }

    #[test]
    fn guarda_y_lee_por_carpeta() {
        let c = Catalog::in_memory().unwrap();
        c.set(&[s(r"C:\fotos\a.jpg"), s(r"C:\fotos\b.jpg"), s(r"C:\otra\c.jpg")], Some(4), None).unwrap();
        c.set(&[s(r"C:\fotos\a.jpg")], None, Some("rojo")).unwrap();
        let f = c.folder(r"C:\fotos");
        assert_eq!(f.len(), 2, "solo las dos de esa carpeta");
        assert_eq!(f[r"C:\fotos\a.jpg"], Meta { rating: 4, label: s("rojo") });
        assert_eq!(f[r"C:\fotos\b.jpg"], Meta { rating: 4, label: s("") });
        // sin distinguir mayúsculas y con barra final
        assert_eq!(c.folder(r"c:\FOTOS\").len(), 2);
    }

    #[test]
    fn la_raiz_de_una_unidad_funciona() {
        let c = Catalog::in_memory().unwrap();
        c.set(&[s(r"D:\x.png")], Some(2), None).unwrap();
        assert_eq!(c.folder(r"D:\").len(), 1);
        assert_eq!(c.folder(r"D:").len(), 1);
    }

    #[test]
    fn quitar_todo_borra_la_fila() {
        let c = Catalog::in_memory().unwrap();
        c.set(&[s(r"C:\a.jpg")], Some(3), Some("azul")).unwrap();
        c.set(&[s(r"C:\a.jpg")], Some(0), Some("")).unwrap();
        assert!(c.folder(r"C:\").is_empty());
    }

    #[test]
    fn renombrar_copiar_y_borrar_siguen_a_la_foto() {
        let c = Catalog::in_memory().unwrap();
        c.set(&[s(r"C:\a\x.jpg")], Some(5), Some("verde")).unwrap();
        c.rename(r"C:\a\x.jpg", r"C:\b\y.jpg");
        assert!(c.folder(r"C:\a").is_empty());
        assert_eq!(c.folder(r"C:\b")[r"C:\b\y.jpg"].rating, 5);
        c.copy(r"C:\b\y.jpg", r"C:\b\y-edit.jpg");
        assert_eq!(c.folder(r"C:\b").len(), 2);
        c.remove(&[s(r"C:\b\y.jpg")]);
        assert_eq!(c.folder(r"C:\b").len(), 1);
    }

    #[test]
    fn mover_una_carpeta_arrastra_lo_que_valia_dentro() {
        let c = Catalog::in_memory().unwrap();
        c.set(&[s(r"C:\a\Fotos\x.jpg")], Some(4), Some("rojo")).unwrap();
        c.set(&[s(r"C:\a\Fotos\sub\y.jpg")], Some(2), None).unwrap();
        c.set(&[s(r"C:\a\Fotos2\z.jpg")], Some(1), None).unwrap();
        c.rename_tree(r"C:\a\Fotos", r"C:\b\Fotos");
        assert!(c.folder(r"C:\a\Fotos").is_empty());
        assert!(c.folder(r"C:\a\Fotos\sub").is_empty());
        assert_eq!(c.folder(r"C:\b\Fotos")[r"C:\b\Fotos\x.jpg"].rating, 4);
        assert_eq!(c.folder(r"C:\b\Fotos\sub")[r"C:\b\Fotos\sub\y.jpg"].rating, 2);
        // una carpeta de nombre parecido no se toca
        assert_eq!(c.folder(r"C:\a\Fotos2")[r"C:\a\Fotos2\z.jpg"].rating, 1);
    }

    #[test]
    fn la_valoracion_se_limita_a_cinco() {
        let c = Catalog::in_memory().unwrap();
        c.set(&[s(r"C:\a.jpg")], Some(9), None).unwrap();
        assert_eq!(c.folder(r"C:\")[r"C:\a.jpg"].rating, 5);
    }
}
