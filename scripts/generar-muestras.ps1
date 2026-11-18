<#
  Genera las imágenes de muestra de PhotoVisor en docs/muestras/.
  Son dibujos originales hechos por código (paisajes y abstractos): no vienen de ninguna foto ni de otra persona,
  así que se pueden mostrar en el README sin problemas de derechos.

  Uso:  powershell -File scripts/generar-muestras.ps1
  Siempre da las mismas imágenes (semilla fija).
#>
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = "Stop"

$W = 1600
$H = 1067
$root = Join-Path (Split-Path $PSScriptRoot -Parent) "docs\muestras"
New-Item -ItemType Directory -Force -Path (Join-Path $root "Paisajes"), (Join-Path $root "Abstractos"), (Join-Path $root "Duplicados") | Out-Null

function C([int]$r, [int]$g, [int]$b, [int]$a = 255) { [System.Drawing.Color]::FromArgb($a, $r, $g, $b) }
function New-Canvas {
  $bmp = New-Object System.Drawing.Bitmap $W, $H
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = "AntiAlias"
  $g.InterpolationMode = "HighQualityBicubic"
  return @{ Bmp = $bmp; G = $g }
}
function Fill-Sky($g, $stops) {
  # $stops: lista de pares (posición 0..1, color)
  $rect = New-Object System.Drawing.Rectangle 0, 0, $W, $H
  $br = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, (C 0 0 0), (C 255 255 255), 90
  $blend = New-Object System.Drawing.Drawing2D.ColorBlend $stops.Count
  $blend.Positions = [single[]]($stops | ForEach-Object { $_[0] })
  $blend.Colors = [System.Drawing.Color[]]($stops | ForEach-Object { $_[1] })
  $br.InterpolationColors = $blend
  $g.FillRectangle($br, $rect)
  $br.Dispose()
}
function Glow($g, [single]$cx, [single]$cy, [single]$r, $color) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddEllipse($cx - $r, $cy - $r, 2 * $r, 2 * $r)
  $pb = New-Object System.Drawing.Drawing2D.PathGradientBrush $path
  $pb.CenterColor = $color
  $pb.SurroundColors = [System.Drawing.Color[]]@((C $color.R $color.G $color.B 0))
  $g.FillPath($pb, $path)
  $pb.Dispose(); $path.Dispose()
}
function Ridge($g, $rng, [single]$baseY, [single]$amp, [int]$steps, $color) {
  $pts = New-Object System.Collections.Generic.List[System.Drawing.PointF]
  $pts.Add((New-Object System.Drawing.PointF -1, $H))
  $y = $baseY
  for ($i = 0; $i -le $steps; $i++) {
    $x = $W * $i / $steps
    $y = $baseY + ($rng.NextDouble() - 0.5) * 2 * $amp
    $pts.Add((New-Object System.Drawing.PointF $x, $y))
  }
  $pts.Add((New-Object System.Drawing.PointF ($W + 1), $H))
  $br = New-Object System.Drawing.SolidBrush $color
  $g.FillPolygon($br, $pts.ToArray())
  $br.Dispose()
}
function Stars($g, $rng, [int]$n, [single]$maxY) {
  for ($i = 0; $i -lt $n; $i++) {
    $x = $rng.NextDouble() * $W; $y = $rng.NextDouble() * $maxY
    $s = 1 + $rng.NextDouble() * 2.6
    $a = [int](120 + $rng.NextDouble() * 135)
    $br = New-Object System.Drawing.SolidBrush (C 255 255 245 $a)
    $g.FillEllipse($br, $x, $y, $s, $s)
    $br.Dispose()
  }
}
function Save($canvas, [string]$sub, [string]$name) {
  $canvas.G.Dispose()
  $jpg = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
  $ep = New-Object System.Drawing.Imaging.EncoderParameters 1
  $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 88L
  $path = Join-Path (Join-Path $root $sub) "$name.jpg"
  $canvas.Bmp.Save($path, $jpg, $ep)
  $canvas.Bmp.Dispose()
  Write-Host "  $sub/$name.jpg"
}

# 1. Atardecer en el mar
$c = New-Canvas; $g = $c.G; $rng = New-Object System.Random 11
Fill-Sky $g @(@(0.0, (C 38 30 92)), @(0.35, (C 176 62 128)), @(0.6, (C 255 138 76)), @(0.66, (C 255 196 110)), @(1.0, (C 255 196 110)))
Glow $g 800 690 520 (C 255 226 150 200)
$br = New-Object System.Drawing.SolidBrush (C 255 244 200); $g.FillEllipse($br, 730, 620, 140, 140); $br.Dispose()
$sea = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.Rectangle 0, 690, $W, ($H - 690)), (C 120 60 110), (C 24 22 64), 90
$g.FillRectangle($sea, 0, 690, $W, ($H - 690))
for ($i = 0; $i -lt 46; $i++) {
  $y = 700 + $i * 8; $wd = (180 - $i * 3) + $rng.Next(0, 90)
  $b = New-Object System.Drawing.SolidBrush (C 255 214 140 ([int](190 - $i * 3.5)))
  $g.FillRectangle($b, (800 - $wd / 2 + $rng.Next(-30, 30)), $y, $wd, 3); $b.Dispose()
}
Ridge $g $rng 640 14 40 (C 40 24 70)
Save $c "Paisajes" "atardecer"

# 2. Montañas
$c = New-Canvas; $g = $c.G; $rng = New-Object System.Random 22
Fill-Sky $g @(@(0.0, (C 60 120 200)), @(0.7, (C 180 214 240)), @(1.0, (C 230 240 248)))
Glow $g 1250 220 260 (C 255 250 220 170)
$b = New-Object System.Drawing.SolidBrush (C 255 252 235); $g.FillEllipse($b, 1215, 185, 70, 70); $b.Dispose()
Ridge $g $rng 520 120 18 (C 150 176 208)
Ridge $g $rng 640 110 16 (C 96 128 160)
Ridge $g $rng 780 90 22 (C 52 86 96)
Ridge $g $rng 900 60 28 (C 24 52 48)
Save $c "Paisajes" "montanas-al-mediodia"

# 3. Bosque al anochecer
$c = New-Canvas; $g = $c.G; $rng = New-Object System.Random 33
Fill-Sky $g @(@(0.0, (C 14 28 64)), @(0.55, (C 40 96 120)), @(1.0, (C 120 170 150)))
Stars $g $rng 160 420
$b = New-Object System.Drawing.SolidBrush (C 250 246 220); $g.FillEllipse($b, 300, 150, 110, 110); $b.Dispose()
Glow $g 355 205 200 (C 250 246 220 90)
foreach ($row in 0..4) {
  $baseY = 600 + $row * 90; $shade = 70 - $row * 12; $n = 14 + $row * 3
  for ($i = 0; $i -lt $n; $i++) {
    $x = ($W / $n) * $i + $rng.Next(-30, 30); $hh = 200 + $row * 40 + $rng.Next(0, 90); $ww = $hh * 0.42
    $col = C ([int](18 + $shade * 0.3)) ([int](50 + $shade * 1.4)) ([int](46 + $shade * 0.9))
    $b = New-Object System.Drawing.SolidBrush $col
    for ($t = 0; $t -lt 3; $t++) {
      $top = $baseY - $hh + $t * $hh * 0.28; $bw = $ww * (0.55 + $t * 0.28)
      $g.FillPolygon($b, @((New-Object System.Drawing.PointF $x, $top), (New-Object System.Drawing.PointF ($x - $bw), ($top + $hh * 0.42)), (New-Object System.Drawing.PointF ($x + $bw), ($top + $hh * 0.42))))
    }
    $b.Dispose()
  }
}
$b = New-Object System.Drawing.SolidBrush (C 24 80 65); $g.FillRectangle($b, 0, 930, $W, ($H - 930)); $b.Dispose()
Save $c "Paisajes" "bosque-al-anochecer"

# 4. Ciudad de noche
$c = New-Canvas; $g = $c.G; $rng = New-Object System.Random 44
Fill-Sky $g @(@(0.0, (C 10 12 40)), @(0.6, (C 70 40 110)), @(1.0, (C 230 110 130)))
Stars $g $rng 140 380
$x = 0
while ($x -lt $W) {
  $bw = $rng.Next(70, 170); $bh = $rng.Next(260, 700); $y = $H - $bh
  $b = New-Object System.Drawing.SolidBrush (C ($rng.Next(14, 30)) ($rng.Next(14, 30)) ($rng.Next(34, 60)))
  $g.FillRectangle($b, $x, $y, $bw, $bh); $b.Dispose()
  for ($wy = $y + 18; $wy -lt $H - 20; $wy += 30) {
    for ($wx = $x + 12; $wx -lt $x + $bw - 14; $wx += 24) {
      if ($rng.NextDouble() -gt 0.55) {
        $wb = New-Object System.Drawing.SolidBrush (C 255 214 120 ([int]($rng.Next(150, 255))))
        $g.FillRectangle($wb, $wx, $wy, 10, 14); $wb.Dispose()
      }
    }
  }
  $x += $bw + $rng.Next(0, 14)
}
Save $c "Paisajes" "ciudad-de-noche"

# 5. Aurora
$c = New-Canvas; $g = $c.G; $rng = New-Object System.Random 55
Fill-Sky $g @(@(0.0, (C 4 8 28)), @(0.7, (C 14 36 64)), @(1.0, (C 20 60 80)))
Stars $g $rng 260 700
foreach ($k in 0..4) {
  $col = if ($k % 2 -eq 0) { C 70 255 170 } else { C 150 90 255 }
  $pts = New-Object System.Collections.Generic.List[System.Drawing.PointF]
  for ($i = 0; $i -le 12; $i++) { $pts.Add((New-Object System.Drawing.PointF ($W * $i / 12), (230 + $k * 70 + [math]::Sin($i * 0.9 + $k) * 90 + $rng.Next(-20, 20)))) }
  foreach ($wd in 90, 60, 34, 14) {
    $pen = New-Object System.Drawing.Pen (C $col.R $col.G $col.B ([int](22 + (90 - $wd) * 0.7))), $wd
    $pen.LineJoin = "Round"; $g.DrawCurve($pen, $pts.ToArray(), 0.6); $pen.Dispose()
  }
}
Ridge $g $rng 880 50 30 (C 6 12 22)
Save $c "Paisajes" "aurora"

# 6. Ondas (abstracto)
$c = New-Canvas; $g = $c.G; $rng = New-Object System.Random 66
Fill-Sky $g @(@(0.0, (C 255 120 90)), @(1.0, (C 120 60 200)))
foreach ($k in 0..11) {
  $pts = New-Object System.Collections.Generic.List[System.Drawing.PointF]
  $pts.Add((New-Object System.Drawing.PointF -10, $H))
  for ($i = 0; $i -le 40; $i++) { $pts.Add((New-Object System.Drawing.PointF ($W * $i / 40), (260 + $k * 62 + [math]::Sin($i * 0.32 + $k * 0.7) * (40 + $k * 4)))) }
  $pts.Add((New-Object System.Drawing.PointF ($W + 10), $H))
  $b = New-Object System.Drawing.SolidBrush (C (255 - $k * 14) (90 + $k * 8) (160 + $k * 7) 120)
  $g.FillPolygon($b, $pts.ToArray()); $b.Dispose()
}
Save $c "Abstractos" "ondas"

# 7. Círculos (abstracto)
$c = New-Canvas; $g = $c.G; $rng = New-Object System.Random 77
Fill-Sky $g @(@(0.0, (C 16 14 36)), @(1.0, (C 40 24 80)))
for ($i = 0; $i -lt 150; $i++) {
  $r = $rng.Next(20, 170); $x = $rng.Next(0, $W); $y = $rng.Next(0, $H)
  $hue = $rng.Next(0, 3)
  $col = if ($hue -eq 0) { C 255 90 170 } elseif ($hue -eq 1) { C 90 200 255 } else { C 255 214 90 }
  $b = New-Object System.Drawing.SolidBrush (C $col.R $col.G $col.B ($rng.Next(30, 120)))
  $g.FillEllipse($b, $x - $r, $y - $r, 2 * $r, 2 * $r); $b.Dispose()
  if ($i % 5 -eq 0) { $p = New-Object System.Drawing.Pen (C 255 255 255 90), 2; $g.DrawEllipse($p, $x - $r, $y - $r, 2 * $r, 2 * $r); $p.Dispose() }
}
Save $c "Abstractos" "circulos"

# 8. Geometría (abstracto)
$c = New-Canvas; $g = $c.G; $rng = New-Object System.Random 88
Fill-Sky $g @(@(0.0, (C 24 40 70)), @(1.0, (C 12 20 40)))
$cell = 100
for ($yy = 0; $yy -lt $H; $yy += $cell) {
  for ($xx = 0; $xx -lt $W; $xx += $cell) {
    $t = $rng.Next(0, 4)
    $col = C ($rng.Next(40, 255)) ($rng.Next(90, 220)) ($rng.Next(120, 255)) ($rng.Next(110, 230))
    $b = New-Object System.Drawing.SolidBrush $col
    $a1 = New-Object System.Drawing.PointF $xx, $yy; $a2 = New-Object System.Drawing.PointF ($xx + $cell), $yy
    $a3 = New-Object System.Drawing.PointF ($xx + $cell), ($yy + $cell); $a4 = New-Object System.Drawing.PointF $xx, ($yy + $cell)
    switch ($t) {
      0 { $g.FillPolygon($b, @($a1, $a2, $a3)) }
      1 { $g.FillPolygon($b, @($a2, $a3, $a4)) }
      2 { $g.FillPolygon($b, @($a3, $a4, $a1)) }
      3 { $g.FillPolygon($b, @($a4, $a1, $a2)) }
    }
    $b.Dispose()
  }
}
Save $c "Abstractos" "geometria"

# Duplicados de muestra: una copia exacta y otra reducida de una de las imágenes
$src = Join-Path $root "Paisajes\aurora.jpg"
Copy-Item $src (Join-Path $root "Duplicados\aurora.jpg") -Force
Copy-Item $src (Join-Path $root "Duplicados\aurora (copia).jpg") -Force
$img = [System.Drawing.Image]::FromFile($src)
$small = New-Object System.Drawing.Bitmap 1000, 667
$sg = [System.Drawing.Graphics]::FromImage($small); $sg.InterpolationMode = "HighQualityBicubic"; $sg.DrawImage($img, 0, 0, 1000, 667); $sg.Dispose(); $img.Dispose()
$small.Save((Join-Path $root "Duplicados\aurora-pequena.jpg"), [System.Drawing.Imaging.ImageFormat]::Jpeg); $small.Dispose()
Write-Host "  Duplicados/aurora.jpg, aurora (copia).jpg, aurora-pequena.jpg"
Write-Host "Listo: $root"
