# Capturas de PhotoVisor

Esta carpeta guarda las imágenes que se muestran en el `README.md`.

## Cómo sacarlas

1. Abre PhotoVisor en la carpeta `docs/muestras/` (o una de sus subcarpetas: `Paisajes`, `Abstractos`, `Duplicados`).
   Todas las imágenes de esa carpeta son **creaciones propias**, dibujadas por código con `scripts/generar-muestras.ps1`.
   **En las capturas solo deben verse imágenes nuestras**, nunca fotos de otras personas ni del archivo personal: el repositorio es público.
   Si necesitas más muestras, agrégalas al script (con semilla fija) y regenéralas.
2. Deja la pantalla como quieres mostrarla. Cuida que el árbol de carpetas y la ruta no muestren nombres personales (usuario de Windows, otras carpetas).
3. En PowerShell, desde la raíz del proyecto:

```powershell
powershell -File scripts/capturar.ps1 -Nombre explorador
```

El script espera 5 segundos (cambia con `-Espera`) y guarda solo la ventana de PhotoVisor en `docs/capturas/<nombre>.png`.

## Lista sugerida

| Archivo | Qué mostrar |
|---|---|
| `explorador.png` | Explorador con árbol, iconos y la ruta con migas |
| `visor.png` | Visor a pantalla completa con la barra de Editar y eliminar |
| `editor-ajustes.png` | Editor en Ajustar, con una foto antes/después |
| `editor-curvas.png` | Pestaña Curvas con el histograma |
| `editor-foco.png` | Pincel con Foco: una elipse nítida y el fondo difuminado |
| `editor-iconos.png` | Íconos y emojis de color sobre una foto |
| `marca-de-agua.png` | Marca de agua en lote |
| `duplicados.png` | Asistente de duplicados |

Después de agregar los archivos, quita los comentarios `<!--` y `-->` de la sección «Capturas» del `README.md`.
