<#
  Saca una captura de la ventana de PhotoVisor y la guarda en docs/capturas/<nombre>.png

  Uso:
    powershell -File scripts/capturar.ps1 -Nombre explorador
    powershell -File scripts/capturar.ps1 -Nombre editor-curvas -Espera 8

  Abre PhotoVisor, deja la pantalla como quieres mostrarla y lanza el comando:
  espera unos segundos (para que alcances a volver a la ventana) y captura solo esa ventana.
  Ojo: el repositorio es público. En las capturas solo deben verse imágenes nuestras: abre la carpeta
  docs/muestras (se genera con scripts/generar-muestras.ps1) y cuida que no se vean nombres personales.
#>
param(
  [Parameter(Mandatory = $true)][string]$Nombre,
  [int]$Espera = 5
)

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Win {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
"@
[void][Win]::SetProcessDPIAware()

$proc = Get-Process photovisor -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $proc) { Write-Error "No encuentro una ventana abierta de PhotoVisor."; exit 1 }

Write-Host "Capturando '$Nombre' en $Espera s... deja la ventana como quieres mostrarla."
Start-Sleep -Seconds $Espera
[void][Win]::SetForegroundWindow($proc.MainWindowHandle)
Start-Sleep -Milliseconds 400

$r = New-Object Win+RECT
[void][Win]::GetWindowRect($proc.MainWindowHandle, [ref]$r)
$w = $r.Right - $r.Left
$h = $r.Bottom - $r.Top
$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($r.Left, $r.Top, 0, 0, $bmp.Size)
$g.Dispose()

$dir = Join-Path (Split-Path $PSScriptRoot -Parent) "docs\capturas"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$ruta = Join-Path $dir "$Nombre.png"
$bmp.Save($ruta, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Host "Listo: $ruta ($w x $h)"
