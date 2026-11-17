"""Dibuja el icono de PhotoVisor (lente sobre degradado fucsia → violeta) en icon-source.png.
Después:  npx tauri icon icon-source.png
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

S = 2048  # se dibuja al doble y se reduce para suavizar bordes
out = Path(__file__).resolve().parent.parent / "icon-source.png"

# degradado diagonal
grad = Image.new("RGB", (S, S))
px = grad.load()
c1, c2 = (217, 70, 239), (109, 60, 230)
for y in range(S):
    for x in range(S):
        t = (x + y) / (2 * (S - 1))
        px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(c1, c2))

mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, S - 1, S - 1), radius=int(S * 0.225), fill=255)
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
img.paste(grad, (0, 0), mask)

d = ImageDraw.Draw(img)
cx = cy = S // 2
# aro de la lente
R = int(S * 0.30)
d.ellipse((cx - R, cy - R, cx + R, cy + R), fill=(255, 255, 255, 255))
r = int(S * 0.235)
d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(34, 14, 74, 255))
# vidrio: segundo anillo y centro
r2 = int(S * 0.15)
d.ellipse((cx - r2, cy - r2, cx + r2, cy + r2), fill=(88, 40, 170, 255))
r3 = int(S * 0.075)
d.ellipse((cx - r3, cy - r3, cx + r3, cy + r3), fill=(20, 8, 46, 255))
# destellos
h = int(S * 0.05)
hx, hy = cx - int(S * 0.1), cy - int(S * 0.11)
d.ellipse((hx - h, hy - h, hx + h, hy + h), fill=(255, 255, 255, 235))
h2 = int(S * 0.02)
hx2, hy2 = cx + int(S * 0.085), cy + int(S * 0.09)
d.ellipse((hx2 - h2, hy2 - h2, hx2 + h2, hy2 + h2), fill=(255, 255, 255, 170))
# luz del flash
f = int(S * 0.045)
fx, fy = int(S * 0.75), int(S * 0.25)
d.ellipse((fx - f, fy - f, fx + f, fy + f), fill=(255, 240, 255, 255))

img = img.resize((1024, 1024), Image.LANCZOS)
img.save(out)
print("icono ->", out)
