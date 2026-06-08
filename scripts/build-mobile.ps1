<#
.SYNOPSIS
    Build the Jharanai Flutter mobile APK inside a Docker container.

.DESCRIPTION
    Lets you produce a working app-debug.apk WITHOUT installing the
    Flutter SDK on the host machine. The container image
    (ghcr.io/cirruslabs/flutter:3.24.5) carries the Flutter toolchain;
    your laptop's PATH and disk outside Docker stay untouched.

    What the script does:
      1. Scaffolds android/ on first run (flutter create).
      2. Patches AndroidManifest.xml with the permissions the app needs
         (CAMERA, INTERNET, ACCESS_NETWORK_STATE) â€” without these the QR
         scanner returns a black screen and the API client can't reach
         the backend.
      3. Runs `flutter pub get` + `dart run build_runner build` to
         generate Drift's database.g.dart.
      4. Builds the APK with API_BASE baked in. Default points at
         http://10.0.2.2:3000 which is how Android emulators see the
         host machine's localhost. Override with -ApiBase for a LAN test.

    The APK lands at:
      apps\mobile\build\app\outputs\flutter-apk\app-debug.apk

.PARAMETER ApiBase
    Backend URL the app calls. Defaults to 10.0.2.2:3000 (emulator).
    Use your laptop's LAN IP for physical-device testing.

.PARAMETER Release
    Build a release APK instead of debug. Slower; only needed if you
    plan to side-load on a real phone for a field test.

.EXAMPLE
    .\scripts\build-mobile.ps1
    # Builds debug APK pointing at http://10.0.2.2:3000

.EXAMPLE
    .\scripts\build-mobile.ps1 -ApiBase "http://192.168.1.20:3000"
    # Builds for a physical phone on the same Wi-Fi as a laptop at .20
#>

[CmdletBinding()]
param(
    [string]$ApiBase = "http://10.0.2.2:3000",
    [switch]$Release
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path "$PSScriptRoot\.."
$mobile   = Join-Path $repoRoot "apps\mobile"
$buildMode = if ($Release) { "release" } else { "debug" }
$image    = "ghcr.io/cirruslabs/flutter:3.24.5"

if (-not (Test-Path $mobile)) {
    Write-Error "apps\mobile directory not found at $mobile"
    exit 1
}

Write-Host ""
Write-Host "=== Jharanai mobile build ($buildMode) ===" -ForegroundColor Cyan
Write-Host "  Repo:     $repoRoot"
Write-Host "  Mode:     $buildMode"
Write-Host "  API_BASE: $ApiBase"
Write-Host "  Image:    $image"
Write-Host ""

# --- Stage 1: container-side scaffolding + first build ---
# A single docker run does flutter create (idempotent) â†’ pub get â†’
# build_runner â†’ build apk. Re-runs are fast because Flutter caches
# pub deps + Gradle dirs inside the mounted volume.
Write-Host "[1/3] Running Flutter toolchain in Docker..." -ForegroundColor Yellow
docker run --rm `
    -v "${mobile}:/app" `
    -w /app `
    $image `
    bash -c "
        set -e
        if [ ! -d android ]; then
            echo '--- scaffolding android/ (first run) ---'
            flutter create --platforms=android --org com.jharanai --project-name jharanai_mobile .
        fi
        echo '--- flutter pub get ---'
        flutter pub get
        echo '--- generating Drift code ---'
        dart run build_runner build --delete-conflicting-outputs || true
        echo '--- flutter build apk --$buildMode ---'
        flutter build apk --$buildMode --dart-define=API_BASE=$ApiBase
    "
if ($LASTEXITCODE -ne 0) {
    Write-Error "Docker build failed; see output above."
    exit $LASTEXITCODE
}

# --- Stage 2: patch AndroidManifest with required permissions ---
# flutter create stamps a minimal manifest. The app needs camera +
# network permissions or the scanner silently dies and the API calls
# get blocked by Android's HTTP cleartext policy on API 28+.
Write-Host ""
Write-Host "[2/3] Patching AndroidManifest..." -ForegroundColor Yellow
$manifest = Join-Path $mobile "android\app\src\main\AndroidManifest.xml"
if (-not (Test-Path $manifest)) {
    Write-Error "AndroidManifest.xml not found at $manifest after flutter create"
    exit 1
}

$content = Get-Content $manifest -Raw
$perms = @(
    '<uses-permission android:name="android.permission.INTERNET" />',
    '<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />',
    '<uses-permission android:name="android.permission.CAMERA" />'
)
$needPatch = $false
foreach ($p in $perms) {
    if ($content -notmatch [regex]::Escape($p)) {
        $needPatch = $true
        break
    }
}

if ($needPatch) {
    $insertion = "    " + ($perms -join "`n    ") + "`n"
    # Insert directly after the opening <manifest ...> tag.
    $content = [regex]::Replace(
        $content,
        '(?s)(<manifest[^>]*>)',
        "`$1`n$insertion",
        [System.Text.RegularExpressions.RegexOptions]::None,
        1
    )
    # usesCleartextTraffic so the app can hit http://10.0.2.2:3000
    # during dev. Production builds should set this to false.
    if ($content -notmatch 'android:usesCleartextTraffic=') {
        $content = $content -replace '<application ', '<application android:usesCleartextTraffic="true" '
    }
    Set-Content $manifest $content -Encoding utf8
    Write-Host "  Manifest patched (perms + cleartext for dev)." -ForegroundColor Green

    # Re-run the build to actually pick up the manifest changes.
    Write-Host ""
    Write-Host "[3/3] Rebuilding APK with patched manifest..." -ForegroundColor Yellow
    docker run --rm `
        -v "${mobile}:/app" `
        -w /app `
        $image `
        bash -c "flutter pub get && flutter build apk --$buildMode --dart-define=API_BASE=$ApiBase"
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Rebuild after manifest patch failed."
        exit $LASTEXITCODE
    }
} else {
    Write-Host "  Manifest already has required permissions; skipping rebuild." -ForegroundColor Green
}

# --- Stage 3: verify + report ---
$apk = Join-Path $mobile "build\app\outputs\flutter-apk\app-$buildMode.apk"
if (-not (Test-Path $apk)) {
    Write-Error "Build said it succeeded but APK not at $apk."
    exit 1
}

$apkSize = (Get-Item $apk).Length / 1MB
Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Cyan
Write-Host ("  APK:  {0}" -f $apk)
Write-Host ("  Size: {0:N1} MB" -f $apkSize)
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Make sure your backend is running (npm run dev -w '@jharanai/backend')"
Write-Host "  2. Start an Android emulator:    emulator -avd <your-avd-name>"
Write-Host "     (list AVDs with:             emulator -list-avds)"
Write-Host "  3. Install the APK:              adb install -r `"$apk`""
Write-Host "  4. Tap 'jharanai_mobile' in the emulator's app drawer."
Write-Host ""
