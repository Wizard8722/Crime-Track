# Builds the offline Android APK for Crime Track (one command).
#   powershell -ExecutionPolicy Bypass -File .\build-apk.ps1
# Output:
#   .\Crime-Detector-debug.apk
$ErrorActionPreference = 'Stop'
$apkRoot = $PSScriptRoot
$repoRoot = Split-Path -Parent $apkRoot

# ---------- Toolchain: JDK (Android Studio JBR) + Android SDK ----------
$androidStudioJbr = 'C:\Program Files\Android\Android Studio\jbr'
if ($env:JAVA_HOME -and (Test-Path (Join-Path $env:JAVA_HOME 'bin\java.exe'))) {
  $javaHome = $env:JAVA_HOME
} elseif (Test-Path (Join-Path $androidStudioJbr 'bin\java.exe')) {
  $javaHome = $androidStudioJbr
} else {
  throw 'No JDK found. Install Android Studio (uses its bundled JBR) or set JAVA_HOME to a JDK 17+.'
}
$sdkRoot = $env:ANDROID_HOME
if (-not $sdkRoot) { $sdkRoot = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
if (-not (Test-Path $sdkRoot)) { throw "Android SDK not found at '$sdkRoot'. Install Android Studio or set ANDROID_HOME." }
$env:JAVA_HOME = $javaHome
$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:Path = "$javaHome\bin;$env:Path"
Write-Host "JAVA_HOME   = $javaHome"
Write-Host "ANDROID_HOME= $sdkRoot"

# ---------- 1. NRC reference data -> JSON ----------
Write-Host "`n[1/6] Generating NRC reference data..." -ForegroundColor Cyan
node (Join-Path $repoRoot 'frontend\scripts\generate-nrc-data.mjs')
if ($LASTEXITCODE -ne 0) { throw 'NRC data generation failed.' }

# ---------- 2/3. Offline web bundle ----------
Write-Host "`n[2/6] Installing frontend dependencies..." -ForegroundColor Cyan
Push-Location (Join-Path $repoRoot 'frontend')
npm install
if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'npm install (frontend) failed.' }
Write-Host "`n[3/6] Building offline web bundle (vite build --mode offline)..." -ForegroundColor Cyan
npm run build:offline
if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'vite build failed.' }
Pop-Location

# ---------- 4. Capacitor web assets ----------
Write-Host "`n[4/6] Preparing apk\www ..." -ForegroundColor Cyan
Push-Location $apkRoot
npm install
if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'npm install (apk) failed.' }
node scripts\prepare-www.mjs
if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'prepare-www failed.' }

# ---------- 5. Capacitor Android project + sync ----------
if (-not (Test-Path (Join-Path $apkRoot 'android'))) {
  Write-Host "`n[5/6] Creating Android project (npx cap add android)..." -ForegroundColor Cyan
  npx cap add android
  if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'cap add android failed.' }
} else {
  Write-Host "`n[5/6] Android project already exists." -ForegroundColor Cyan
}
Write-Host 'Syncing web assets into the Android project...' -ForegroundColor Cyan
npx cap sync android
if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'cap sync failed.' }
Pop-Location

# ---------- 6. Gradle ----------
Write-Host "`n[6/6] Gradle assembleDebug (downloads Gradle via the standard wrapper on first build)..." -ForegroundColor Cyan
$built = $false
for ($attempt = 1; $attempt -le 5 -and -not $built; $attempt++) {
  Write-Host "  attempt $attempt/5 ..."
  & (Join-Path $apkRoot 'android\gradlew.bat') -p (Join-Path $apkRoot 'android') assembleDebug
  if ($LASTEXITCODE -eq 0) { $built = $true }
  else { Write-Host "  Gradle failed on attempt $attempt - retrying in 5s..." -ForegroundColor Yellow; Start-Sleep -Seconds 5 }
}
if (-not $built) { throw 'Gradle build failed after 5 attempts.' }

$builtApk = Join-Path $apkRoot 'android\app\build\outputs\apk\debug\app-debug.apk'
if (-not (Test-Path $builtApk)) { throw "APK not found at $builtApk" }
$target = Join-Path $apkRoot 'Crime-Detector-debug.apk'
Copy-Item $builtApk $target -Force
$sizeMb = [Math]::Round((Get-Item $target).Length / 1MB, 2)
Write-Host "`nBUILD SUCCESS" -ForegroundColor Green
Write-Host "APK: $target ($sizeMb MB)"
Write-Host "Install on a connected device:  adb install `"$target`""
