# PhotoVisor

Programa de escritorio para mirar y ordenar las fotos y videos de una carpeta. Explorador de archivos afinado, visor de pantalla completa y, cuando hace falta, el editor que ya existe. Todo queda en esta PC: sin cuenta, sin suscripción y sin subir archivos.

## Forma del programa

PhotoVisor es un programa de Windows, con su ventana y su icono. Se abre como cualquier otro programa. Una aplicación web progresiva sigue siendo el navegador: puede guardar una copia, pero no manda un archivo a la papelera ni recorre una carpeta como un explorador.

La ventana tiene dos trabajos. Uno habla con Windows: abrir la carpeta, armar los iconos en memoria, girar o voltear el archivo, mandar a la papelera y guardar la configuración fuera de las fotos. El otro es lo que se ve. Esa parte usa la misma familia de interfaz que el editor del studio (React, TypeScript y CSS), dibujada dentro de la ventana con el WebView2 que Windows ya trae.

Rust se instala solo en la máquina que compila. El resultado es un ejecutable de Windows. En las otras máquinas se abre ese programa: no hace falta Rust, ni Node, ni el código.

## Qué se siente al usarlo

Se abre en la última carpeta. A la izquierda, el árbol. Subir (Alt+↑) abre la carpeta de arriba y, si hace falta, amplía la raíz. Al centro, las fotos en lista, iconos medianos o grandes, ordenadas por nombre, tipo o peso. Debajo del árbol, la preview de lo que está seleccionado.

Un clic selecciona. Doble clic entra al visor de pantalla completa: la foto ocupa la ventana, ← y → pasan al archivo anterior y al siguiente, Suprimir manda a la papelera. Desde ahí se puede girar, voltear, volver a la carpeta, o pulsar Editar (E) para abrir el editor del studio sobre esa foto. Guardar escribe un PNG en la misma carpeta: una copia, o el reemplazo si el original ya es PNG.

Mayús+Suprimir borra directo, sin papelera. La primera vez pregunta, y el cuadro incluye «No volver a preguntar». Esa elección queda en el archivo de configuración del programa. Si se marcó, las siguientes van directo. Si no, vuelve a preguntar.

Si el archivo es un video, el visor lo reproduce. No se edita.

## Tres pantallas

**Explorador.** Árbol, iconos y preview. La selección puede ser una foto o varias, y la acción les cae a todas.

**Visor.** Pantalla completa, al estilo del visor de fotos de Windows. Zoom, ajustar a la ventana, flechas, papelera, giro. Una tira con las fotos de la carpeta se puede mostrar o esconder; empieza escondida.

**Editor.** El que ya está en el studio: recorte, luz, color, pincel y marca de agua. Se abre desde el visor y, al cerrar, se vuelve a la misma foto en la misma carpeta. Trabaja de a una imagen. Entra después de esta primera versión, sin hacer una copia nueva del editor.

## En masa

La selección es el sujeto.

Desde el principio, sobre los archivos mismos:

- Girar y voltear las seleccionadas.
- Suprimir a la papelera.
- Mayús+Suprimir para borrar directo, con la pregunta descrita arriba.

Son la misma orden para cada archivo. Girar se deshace girando al revés. Voltear se deshace volteando otra vez. Lo enviado a la papelera se recupera desde ahí. El borrado directo no pasa por la papelera.

En JPEG el giro y el volteo cambian la orientación guardada en el archivo, sin reescribir la foto. En PNG, WebP, BMP y TIFF se reescribe la imagen. Un GIF se deja como está. Un video no se gira.

Más adelante, sobre el contenido de la foto: la misma marca de agua, el mismo tamaño o el mismo ajuste de luz. El lote escribe una copia en otra carpeta. Las originales no se tocan.

Luz, color, pincel y marca finos siguen siendo de a una, dentro del editor.

Mover, copiar y renombrar siguen para después de este corte.

## Atajos

Valen en el explorador, sobre la selección, y en el visor. En el visor el sujeto es la foto que se está viendo.

- ← y → avanzan al archivo anterior y al siguiente.
- ↑ y ↓, en el explorador, suben o bajan una fila de iconos.
- ↑ y ↓, en el visor, acercan y alejan. Si la foto ya es más grande que la ventana, la desplazan. La rueda también hace zoom. Doble clic vuelve a ajustar.
- Ctrl+← gira 90° hacia la izquierda.
- Ctrl+→ gira 90° hacia la derecha.
- Ctrl+↑ voltea en vertical.
- Ctrl+Mayús+← y Ctrl+Mayús+→ voltean en horizontal.
- Suprimir manda a la papelera.
- Mayús+Suprimir borra directo, con la pregunta de la primera vez.
- Enter abre el visor. Esc vuelve a la carpeta.

## Configuración

Las preferencias viven en un archivo del programa, fuera de las carpetas de fotos (`config.json` en la carpeta de configuración de PhotoVisor). Ahí entra si Mayús+Suprimir vuelve a preguntar, la última carpeta abierta y si la tira del visor está visible.

## Previews

Los iconos grandes se arman solo de lo que se está viendo, en memoria. No se crea una base de previews dentro de la carpeta de las fotos. El árbol no recorre el disco entero: parte de la carpeta elegida.

## IA local

Si ComfyUI responde en este equipo, el visor ofrecerá editar con IA: fondo, reemplazar una zona y ampliar, que es lo que el editor del studio ya sabe hacer. Si ComfyUI está cerrado, esa opción no aparece. La IA es de a una foto. Queda para cuando entre el editor.

## Qué queda para después

- El editor del studio, dentro de esta misma ventana.
- Mover, copiar y renombrar.
- Presentación de la carpeta.
- Comparar dos fotos juntas.
- Lote que reescribe la imagen (marca, tamaño, luz), siempre sobre una copia.
- Abrir el programa al hacer doble clic en una foto desde el Explorador de Windows.

## Qué no entra

Catálogo, etiquetas, RAW, impresión, hojas de contacto y editor de video. Tampoco una página web como producto.

`photo-editor/` fue un boceto en el navegador. No se sigue por ahí.

## Decisiones ya tomadas

- El programa se llama PhotoVisor.
- Es un programa de Windows hecho con Tauri 2. La interfaz es React, TypeScript y CSS, dentro del WebView2.
- Primera pantalla: la carpeta, no el editor.
- Una carpeta de partida, con su árbol.
- Sin archivos de caché al lado de las fotos.
- Papelera de Windows para Suprimir.
- Mayús+Suprimir pregunta la primera vez, con opción de no volver a preguntar, guardada en el archivo de configuración.
- ← y → avanzan entre archivos. ↑ y ↓ cambian de fila en el explorador, y hacen zoom o desplazan en el visor.
- Ctrl+← y Ctrl+→ giran. Ctrl+↑ voltea en vertical. Ctrl+Mayús+← y Ctrl+Mayús+→ voltean en horizontal.
- El editor del studio se reutiliza cuando entre. No se hace una tercera copia.
- Video solo se mira.
- IA solo si ComfyUI está encendido, y solo de a una.

## Por afinar

- Ctrl+↓ queda libre.
- Atajos `E` para el editor e `I` para mostrar tamaño, fecha y dimensiones. Esos datos ya se ven en la preview.
- Si mover y copiar entran justo después del giro y la papelera, o junto con el editor.
