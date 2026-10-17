# Saves the picture on the Windows clipboard as a full-size PNG, so a viewer can open it.
#
# Output:
#   OK <width> <height>
#   SAVED <path>
# or NOSAVE <reason> when the picture was read but the file could not be written,
# or the single line NOIMAGE when the clipboard holds no picture this script can read.
#
# The file is <temp>\image-open\<SaveName>.png. Copies older than a day in that folder are deleted (only image-*.png
# files, only there).
param(
    [Parameter(Mandatory = $true)][string]$SaveName,
    [string]$FromFile = ''
)

$ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$img = $null
try {
    if ($FromFile -ne '') {
        $img = [System.Drawing.Image]::FromFile($FromFile)
    } elseif ([System.Windows.Forms.Clipboard]::ContainsImage()) {
        $img = [System.Windows.Forms.Clipboard]::GetImage()
    } elseif ([System.Windows.Forms.Clipboard]::ContainsFileDropList()) {
        # A file copied in Explorer: take the first one System.Drawing can open.
        foreach ($f in [System.Windows.Forms.Clipboard]::GetFileDropList()) {
            if ($f -match '\.(png|jpe?g|bmp|gif|tiff?)$') { $img = [System.Drawing.Image]::FromFile($f); break }
        }
    }
} catch {
    $img = $null
}
if ($null -eq $img) { 'NOIMAGE'; exit 0 }

$w = $img.Width
$h = $img.Height
try {
    $dir = Join-Path ([System.IO.Path]::GetTempPath()) 'image-open'
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    Get-ChildItem -LiteralPath $dir -Filter 'image-*.png' -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-1) } |
        Remove-Item -Force -ErrorAction SilentlyContinue
    $safe = $SaveName -replace '[^A-Za-z0-9._-]', '_'
    $target = Join-Path $dir "$safe.png"
    $img.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
    "OK $w $h"
    "SAVED $target"
} catch {
    "NOSAVE $($_.Exception.Message -replace '\s+', ' ')"
} finally {
    $img.Dispose()
}
