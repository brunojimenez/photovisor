//! Vigila la carpeta abierta y avisa a la interfaz cuando cambian sus archivos (fotos nuevas, borradas,
//! renombradas fuera del programa), para que la lista se actualice sola.

use notify::{recommended_watcher, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::Path;
use std::sync::{mpsc, Mutex};
use std::time::Duration;

#[derive(Default)]
pub struct FolderWatch {
    current: Mutex<Option<RecommendedWatcher>>,
}

impl FolderWatch {
    /// Pasa a vigilar `folder` (sin subcarpetas). El vigilante anterior se suelta, y con él su hilo.
    pub fn watch(&self, folder: &Path, notify_change: impl Fn() + Send + 'static) -> Result<(), String> {
        let (tx, rx) = mpsc::channel::<()>();
        let mut watcher = recommended_watcher(move |event: notify::Result<notify::Event>| {
            if let Ok(event) = event {
                if !matches!(event.kind, EventKind::Access(_)) {
                    let _ = tx.send(());
                }
            }
        })
        .map_err(|e| e.to_string())?;
        watcher.watch(folder, RecursiveMode::NonRecursive).map_err(|e| e.to_string())?;
        std::thread::spawn(move || {
            while rx.recv().is_ok() {
                // una copia grande genera decenas de avisos: se espera a que se calme
                while rx.recv_timeout(Duration::from_millis(400)).is_ok() {}
                notify_change();
            }
        });
        *self.current.lock().unwrap() = Some(watcher);
        Ok(())
    }

    pub fn stop(&self) {
        *self.current.lock().unwrap() = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    #[test]
    fn avisa_una_vez_cuando_cambian_los_archivos() {
        let dir = std::env::temp_dir().join(format!("pv-watch-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let hits = Arc::new(AtomicUsize::new(0));
        let counter = hits.clone();
        let watch = FolderWatch::default();
        watch.watch(&dir, move || { counter.fetch_add(1, Ordering::SeqCst); }).unwrap();
        // una ráfaga de archivos nuevos debe dar un solo aviso, no uno por archivo
        for i in 0..12 {
            std::fs::write(dir.join(format!("f{i}.jpg")), b"x").unwrap();
        }
        std::thread::sleep(Duration::from_millis(1500));
        let n = hits.load(Ordering::SeqCst);
        assert!(n >= 1, "no avisó de los cambios");
        assert!(n <= 2, "avisó {n} veces: el filtro de ráfagas no funciona");
        // soltar el vigilante detiene los avisos
        watch.stop();
        std::thread::sleep(Duration::from_millis(300));
        let before = hits.load(Ordering::SeqCst);
        std::fs::write(dir.join("otra.jpg"), b"y").unwrap();
        std::thread::sleep(Duration::from_millis(1200));
        assert_eq!(hits.load(Ordering::SeqCst), before, "siguió avisando tras stop()");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
