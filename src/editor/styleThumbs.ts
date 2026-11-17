import original from "./assets/styles/original.jpg";
import cartoon from "./assets/styles/cartoon.jpg";
import anime from "./assets/styles/anime.jpg";
import pixar from "./assets/styles/pixar.jpg";
import comic from "./assets/styles/comic.jpg";
import watercolor from "./assets/styles/watercolor.jpg";
import oil from "./assets/styles/oil.jpg";
import sketch from "./assets/styles/sketch.jpg";

/**
 * Misma foto de muestra pasada por cada estilo de la IA (Flux Kontext), para comparar a simple vista.
 * `original` es la muestra sin tocar; con ella el editor calcula en vivo las miniaturas del «Estilo rápido».
 */
export const STYLE_THUMBS: Record<string, string> = { original, cartoon, anime, pixar, comic, watercolor, oil, sketch };
