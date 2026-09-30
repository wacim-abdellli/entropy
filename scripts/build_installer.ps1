<#
.SYNOPSIS
    Builds Entropy Desktop application, generates standalone .exe and compiles Inno Setup installer wizard.
#>

$ErrorActionPreference = "Stop"

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  Entropy Desktop - Automated Build Pipeline  " -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

# 1. Check for Inno Setup compiler
$isccCandidates = @(
    "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
    "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
    "C:\Program Files\Inno Setup 6\ISCC.exe"
)

$isccPath = $null
foreach ($cand in $isccCandidates) {
    if (Test-Path $cand) {
        $isccPath = $cand
        break
    }
}

if (-not $isccPath) {
    Write-Warning "Inno Setup compiler (ISCC.exe) not found in standard paths."
    Write-Host "Attempting silent user install of Inno Setup..." -ForegroundColor Yellow
    
    $tempSetup = (Get-ChildItem -Path $env:TEMP -Filter "innosetup*.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1).FullName
    if ($tempSetup) {
        Start-Process -FilePath $tempSetup -ArgumentList "/CURRENTUSER /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /DIR=`"$env:LOCALAPPDATA\Programs\Inno Setup 6`"" -Wait
        $isccPath = "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
    }
}

# 2. Terminate any running instances
Write-Host "`n[1/4] Stopping existing Entropy instances..." -ForegroundColor Yellow
Stop-Process -Name "Entropy" -Force -ErrorAction SilentlyContinue

# 3. Build frontend
Write-Host "`n[2/4] Building Vite frontend..." -ForegroundColor Yellow
Push-Location "desktop"
try {
    npm run build
} finally {
    Pop-Location
}

# 4. Compile with PyInstaller
Write-Host "`n[3/4] Compiling Python backend with PyInstaller..." -ForegroundColor Yellow
pyinstaller Entropy.spec --noconfirm

# 5. Compile Inno Setup installer
if ($isccPath -and (Test-Path $isccPath)) {
    Write-Host "`n[4/4] Compiling Windows Installer Wizard via Inno Setup..." -ForegroundColor Yellow
    & $isccPath installer.iss
    Write-Host "`n✔ Installer created successfully at dist\Entropy-Setup-0.1.1.exe" -ForegroundColor Green
} else {
    Write-Warning "Inno Setup compiler not found; skipped installer wizard generation."
}

# 6. Show results
Write-Host "`n=============================================" -ForegroundColor Cyan
Write-Host "  Build Complete! Available Distribution Files:" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Get-ChildItem -Path "dist\*.exe" | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize
