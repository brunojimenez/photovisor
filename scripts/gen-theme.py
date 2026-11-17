"""Genera src/theme.generated.css: las mismas reglas de los CSS base, pero con los grises
oscuros teñidos de violeta. Se carga después de los CSS originales, así el estudio
(que comparte el CSS del editor) no cambia de aspecto.

Uso:  python scripts/gen-theme.py
"""
import re
from pathlib import Path

root = Path(__file__).resolve().parent.parent
studio_css = root.parent / "studio" / "frontend" / "src" / "styles.css"
targets = [
    ([studio_css, root / "src" / "styles.css"], root / "src" / "theme.generated.css"),
    ([studio_css], studio_css.parent / "theme.generated.css"),
]

HEX = re.compile(r"#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b")


def tint(m):
    h = m.group(1)
    alpha = ""
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if len(h) == 8:
        alpha, h = h[6:], h[:6]
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    if not (r == g == b and r <= 0x60):
        return m.group(0)
    nr = min(255, round(r * 1.12))
    nb = min(255, round(b * 1.55 + 4)) if r else 0
    return "#%02x%02x%02x%s" % (nr, g, nb, alpha)


def rules(css):
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    depth, buf, start = 0, [], 0
    out = []
    for i, ch in enumerate(css):
        if ch == "{":
            if depth == 0:
                head = css[start:i].strip()
                body_start = i + 1
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                out.append((head, css[body_start:i]))
                start = i + 1
    return out


for sources, out_path in targets:
    chunks = []
    for src in sources:
        for head, body in rules(src.read_text(encoding="utf-8")):
            if head.startswith("@") or "{" in body or head.startswith(":root"):
                continue
            keep = []
            for decl in body.split(";"):
                if ":" not in decl:
                    continue
                prop, value = decl.split(":", 1)
                new = HEX.sub(tint, value)
                if new != value:
                    keep.append(f"  {prop.strip()}: {new.strip()};")
            if keep:
                chunks.append(f"{head} {{\n" + "\n".join(keep) + "\n}")

    out_path.write_text(
        "/* Generado por scripts/gen-theme.py: grises oscuros con tinte violeta. No editar a mano. */\n"
        + "\n".join(chunks)
        + "\n",
        encoding="utf-8",
    )
    print(f"{len(chunks)} reglas -> {out_path}")
