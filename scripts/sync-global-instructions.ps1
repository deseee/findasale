param(
    [switch]$Setup,
    [switch]$Update,
    [switch]$Status,
    [string]$Master
)

# Find memory\CLAUDE.md under the MS Store MSIX package
$target = Get-ChildItem "$env:LOCALAPPDATA\Packages\Claude_pzs8sxrjxfjjc" `
    -Recurse -Filter "CLAUDE.md" -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.DirectoryName -match "\\memory$" } |
    Select-Object -First 1

if (-not $target) {
    Write-Error "Could not find memory\CLAUDE.md under Claude MSIX package."
    exit 1
}

$path = $target.FullName
$ro = (Get-ItemProperty $path).IsReadOnly

if ($Status -or (-not $Setup -and -not $Update)) {
    Write-Host "File:     $path"
    Write-Host "ReadOnly: $ro"
    Write-Host "Size:     $((Get-Item $path).Length) bytes"
    Write-Host "Modified: $((Get-Item $path).LastWriteTime)"
    if (-not $ro) {
        Write-Host ""
        Write-Warning "File is NOT read-only and can be overwritten. Run -Setup to protect it."
    }
    exit 0
}

if ($Setup) {
    Set-ItemProperty $path -Name IsReadOnly -Value $true
    Write-Host "Protected: $path"
    Write-Host "Stale session writebacks are now blocked."
    exit 0
}

if ($Update) {
    if (-not $Master) {
        Write-Error "-Master is required. Provide path to your authoritative CLAUDE.md file."
        exit 1
    }
    if (-not (Test-Path $Master)) {
        Write-Error "Master file not found: $Master"
        exit 1
    }
    Set-ItemProperty $path -Name IsReadOnly -Value $false
    Copy-Item $Master $path -Force
    Set-ItemProperty $path -Name IsReadOnly -Value $true
    Write-Host "Done. Updated and re-protected: $path"
    Write-Host "Restart open Cowork sessions to pick up the new instructions."
    exit 0
}
