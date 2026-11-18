# PhotoVisor

Programa de Windows para mirar, ordenar y editar las fotos y videos de una carpeta. Todo queda en tu PC: sin cuenta y sin subir archivos.

Hecho con Tauri 2 (Rust y WebView2), React 19, TypeScript y Vite. El diseño original está en [`DISENO.md`](DISENO.md).

## Qué hace

- **Explorador:** árbol de carpetas, lista o iconos (con tamaño ajustable), ruta navegable con migas, "Este equipo" con los discos, papelera, y todos los archivos de la carpeta (no solo fotos). Pregunta antes de borrar una carpeta con contenido. Recuerda la distribución de los paneles y el tamaño de la ventana.
- **Visor:** pantalla completa, zoom, giro, video, Editar y eliminar desde ahí. Doble clic en la foto vuelve a la carpeta.
- **Editor:** recorte y enderezado, luz y color (curvas de tono, HSL, balance de blancos), detalle y ruido, pincel (difuminar, pixelar, colorear, clonar, reparar), **Foco** (zonas nítidas con borde suave, círculos o elipses, viñeta, retrato y miniatura), íconos y emojis de color, texto y marca de agua. Guarda copia o reemplaza.
- **Marca de agua en lote** sobre una selección o una carpeta.
- **Duplicados**, **EXIF** legible con opción de quitar el GPS, y guardado en JPEG, PNG, WebP y AVIF.
- Con ComfyUI instalado aparte, el editor suma funciones de IA (fondo, ampliar, estilos). Sin él, todo lo demás funciona igual.

## Desarrollo

Requisitos: Node 22+ y, para compilar el programa, Rust (stable) con las herramientas de Tauri para Windows.

```powershell
npm install
npm run tauri dev      # ventana de desarrollo con recarga en caliente
```

Solo una ventana de PhotoVisor puede estar abierta a la vez (instancia única): cierra la instalada antes de abrir la de desarrollo.

| Comando | Para qué |
|---|---|
| `npm run typecheck` | Revisa los tipos de TypeScript |
| `npm test` | Pruebas de la lógica del editor (Vitest) |
| `cargo test --manifest-path src-tauri/Cargo.toml` | Pruebas del núcleo en Rust |
| `npm run tauri build` | Genera el instalador (lento: compila en modo release) |

Cada cambio a una rama pasa por la integración continua (`.github/workflows/ci.yml`): tipos, pruebas y build de la interfaz, y pruebas de Rust.

## Estructura

```
src/                     Interfaz (React)
  App.tsx                Explorador y visor
  editor/
    Editor.tsx           Componente principal del editor (estado y orquestación)
    EditorUi.tsx         Tarjetas y controles del panel (Card, OptRow, SliderRow…)
    EditorGlyphs.tsx     Íconos de las herramientas
    StickerUi.tsx        Paletas de íconos y emojis, color y estilo
    WatermarkDesigner.tsx Diseñador de marca de agua (editor y lote)
    editorGeometry.ts    Recorte, orientación y rasterizado
    editorAdjust.ts      Ajustes de luz, color y detalle (filtros por píxel)
    editorPaint.ts       Pincel: difuminar, pixelar, colorear, reparar
    editorFocus.ts       Foco: zonas, hit-test y máscara (lógica pura)
    editorMark.ts        Textos, íconos y marca de agua sobre la foto
    __tests__/           Pruebas
src-tauri/src/           Núcleo en Rust: archivos, miniaturas, catálogo, códecs, EXIF, duplicados
```

## Datos y privacidad

Las preferencias de la interfaz se guardan en el almacenamiento local del navegador embebido (distinto entre el programa instalado y el modo desarrollo). La configuración del programa vive en el perfil del usuario, fuera de las fotos.

## Licencias de terceros

Emojis: Fluent Emoji Flat (Microsoft, MIT), ver `src/editor/FLUENT_LICENSE.txt`. Íconos: Lucide (ISC).
