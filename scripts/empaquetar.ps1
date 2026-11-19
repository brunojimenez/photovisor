<#
  Prepara los archivos de una Release a partir de lo que dejo "npm run tauri build":
  copia el instalador, arma el zip portable y escribe las huellas SHA-256.
  Uso:  powershell -File scripts/empaquetar.ps1 [-Target C:\pvt] [-Out dist-release]
  (Solo ASCII a proposito: PowerShell 5.1 lee mal los acentos sin BOM.)
#>
param([string]$Target = "src-tauri\target", [string]$Out = "dist-release")
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$ver = (Get-Content (Join-Path $root "package.json") -Raw | ConvertFrom-Json).version
$rel = Join-Path $Target "release"
$setup = Get-ChildItem (Join-Path $rel "bundle\nsis") -Filter "PhotoVisor_${ver}_x64-setup.exe" | Select-Object -First 1
if (-not $setup) { throw "No encuentro el instalador $ver en $rel\bundle\nsis. Ejecuta npm run tauri build." }
$exe = Join-Path $rel "photovisor.exe"
if (-not (Test-Path $exe)) { throw "No encuentro $exe" }
New-Item -ItemType Directory -Force -Path $Out | Out-Null
Copy-Item $setup.FullName $Out -Force
$zip = Join-Path $Out "PhotoVisor_${ver}_x64-portable.zip"
if (Test-Path $zip) { Remove-Item $zip }
$tmp = Join-Path $env:TEMP "pv-portable-$ver"
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
New-Item -ItemType Directory -Path $tmp | Out-Null
Copy-Item $exe (Join-Path $tmp "photovisor.exe")
Copy-Item (Join-Path $root "LICENSE") $tmp
Compress-Archive -Path (Join-Path $tmp "*") -DestinationPath $zip
Remove-Item $tmp -Recurse -Force
$lines = foreach ($f in @((Join-Path $Out $setup.Name), $zip)) {
  $h = (Get-FileHash $f -Algorithm SHA256).Hash.ToLower()
  "$h  $(Split-Path $f -Leaf)"
}
$lines | Set-Content (Join-Path $Out "SHA256SUMS.txt") -Encoding ascii
$lines
