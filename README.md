# PhotoVisor

Programa de Windows para mirar, ordenar y retocar las fotos y los videos de una carpeta. Todo queda en tu PC: sin cuenta, sin suscripción y sin subir archivos.

- **Explorador:** árbol de carpetas con el Acceso rápido de Windows, iconos en lista o grilla, preview y orden por nombre, tipo o peso.
- **Visor:** pantalla completa, giro, volteo, papelera, comparar dos fotos y presentación.
- **Editor** (tecla `E`): ajustes de color y luz, recorte con proporciones y giro libre, pincel con bordes ajustables (difuminar, colorear, pixelar, clonar), íconos y texto sobre la foto, marca de agua y deshacer. Guarda un PNG junto al original, o reemplaza el original, sin salir del editor.

El diseño está en [`DISENO.md`](DISENO.md).

## Instalar

Descarga el instalador `PhotoVisor_*_x64-setup.exe` de la sección **Releases** y ábrelo. No hace falta tener Node ni Rust.

Solo Windows 10/11 (usa WebView2, que ya viene con Windows).

## Compilar desde el código

Hace falta [Node.js](https://nodejs.org), [Rust](https://rustup.rs) y las herramientas de compilación de Visual Studio (C++).

```powershell
npm install
npm run tauri dev        # modo desarrollo
npm run tauri build      # genera el instalador en src-tauri\target\release\bundle
```

## Estructura

- `src/` interfaz (React + TypeScript).
- `src/editor/` el editor de fotos.
- `src-tauri/` la parte de Windows (Rust): leer carpetas, miniaturas, papelera, guardar.

Las funciones de IA del editor (quitar fondo, ampliar, rellenar) necesitan un servidor local aparte y quedan desactivadas si no está: el resto funciona sin él.
