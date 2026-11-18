/** ImageData mínimo para probar sin navegador. */
export function img(w: number, h: number, fill: [number, number, number, number] = [0, 0, 0, 255]): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(fill, i * 4);
  return { data, width: w, height: h, colorSpace: "srgb" } as unknown as ImageData;
}

/** Máscara con un cuadrado opaco (x, y, lado). */
export function maskSquare(w: number, h: number, x: number, y: number, side: number): ImageData {
  const m = img(w, h, [255, 255, 255, 0]);
  for (let yy = y; yy < y + side; yy++) for (let xx = x; xx < x + side; xx++) m.data[(yy * w + xx) * 4 + 3] = 255;
  return m;
}

export const px = (im: ImageData, x: number, y: number) => Array.from(im.data.slice((y * im.width + x) * 4, (y * im.width + x) * 4 + 4));
