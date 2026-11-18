<#
  Genera el banner del README (docs/banner.png) con el icono de la app.
  Uso:  powershell -File scripts/generar-banner.ps1
  (El archivo es solo ASCII a proposito: PowerShell 5.1 lee mal los acentos sin BOM.)
#>
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = "Stop"
$W = 1600; $H = 440
$root = Split-Path $PSScriptRoot -Parent
$icon = Join-Path $root "src-tauri\icons\icon.png"
$out = Join-Path $root "docs\banner.png"

function C([int]$r, [int]$g, [int]$b, [int]$a = 255) { [System.Drawing.Color]::FromArgb($a, $r, $g, $b) }
function P([single]$x, [single]$y) { New-Object System.Drawing.PointF $x, $y }

$bmp = New-Object System.Drawing.Bitmap $W, $H
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = "AntiAlias"; $g.InterpolationMode = "HighQualityBicubic"; $g.TextRenderingHint = "AntiAlias"

# fondo: degradado oscuro de la app
$rect = New-Object System.Drawing.Rectangle 0, 0, $W, $H
$bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, (C 14 10 28), (C 46 22 86), 20
$g.FillRectangle($bg, $rect)

# ondas translucidas (como las curvas del editor)
foreach ($k in 0..5) {
  $pts = New-Object System.Collections.Generic.List[System.Drawing.PointF]
  $pts.Add((P -10 $H))
  for ($i = 0; $i -le 40; $i++) { $pts.Add((P ($W * $i / 40) (250 + $k * 34 + [math]::Sin($i * 0.30 + $k * 0.9) * (26 + $k * 5)))) }
  $pts.Add((P ($W + 10) $H))
  $a = [int](26 + $k * 6)
  $col = if ($k % 2 -eq 0) { C 214 88 255 $a } else { C 120 90 255 $a }
  $g.FillPolygon((New-Object System.Drawing.SolidBrush $col), $pts.ToArray())
}

# destello detras del icono
$gp = New-Object System.Drawing.Drawing2D.GraphicsPath
$gp.AddEllipse(-20, -90, 600, 600)
$pb = New-Object System.Drawing.Drawing2D.PathGradientBrush $gp
$pb.CenterColor = (C 214 88 255 120)
$pb.SurroundColors = [System.Drawing.Color[]]@((C 214 88 255 0))
$g.FillPath($pb, $gp)

# el icono, grande y sin tocar
$im = [System.Drawing.Image]::FromFile($icon)
$size = 300
$g.DrawImage($im, 80, ($H - $size) / 2, $size, $size)
$im.Dispose()

# titulo con degradado
$fTitle = New-Object System.Drawing.Font "Segoe UI Black", 118, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$tr = New-Object System.Drawing.RectangleF 440, 70, 1100, 150
$tb = New-Object System.Drawing.Drawing2D.LinearGradientBrush $tr, (C 255 255 255), (C 236 150 255), 0
$g.DrawString("PhotoVisor", $fTitle, (New-Object System.Drawing.SolidBrush (C 0 0 0 70)), 446, 78)
$g.DrawString("PhotoVisor", $fTitle, $tb, 440, 70)

# lema
$fTag = New-Object System.Drawing.Font "Segoe UI Semibold", 38, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$g.DrawString("Mira, ordena y edita tus fotos. Todo en tu PC.", $fTag, (New-Object System.Drawing.SolidBrush (C 232 224 255)), 444, 218)

# etiquetas
$fPill = New-Object System.Drawing.Font "Segoe UI Semibold", 24, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$x = 444; $y = 300
foreach ($t in "Explorador", "Visor", "Editor", "Curvas", "Foco", "Duplicados", "Marca de agua") {
  $sz = $g.MeasureString($t, $fPill)
  $w = $sz.Width + 26
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $r = 18; $h = 40
  $path.AddArc($x, $y, 2 * $r, $h, 90, 180); $path.AddArc(($x + $w - 2 * $r), $y, 2 * $r, $h, 270, 180); $path.CloseFigure()
  $g.FillPath((New-Object System.Drawing.SolidBrush (C 214 88 255 46)), $path)
  $g.DrawPath((New-Object System.Drawing.Pen (C 214 120 255 150), 1.5), $path)
  $g.DrawString($t, $fPill, (New-Object System.Drawing.SolidBrush (C 245 232 255)), ($x + 13), ($y + 5))
  $x += $w + 12
}

$g.Dispose()
New-Item -ItemType Directory -Force -Path (Split-Path $out -Parent) | Out-Null
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
Write-Host "Listo: $out"
