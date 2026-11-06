<#
.SYNOPSIS
  Builds the portable Windows release: dist\windows\mimiuchi-<version>-windows-x64.zip

.DESCRIPTION
  Everything happens in dist\windows\. Nothing in web\ is modified (no
  .next, no node_modules changes), and the build points KIKOERU_DATA_DIR at a
  throwaway folder, so your own database is never opened.

    1. Downloads the latest Node.js <NodeMajor>.x for win-x64 (checksum
       verified, cached in dist\windows\cache).
    2. Copies web\ (tracked + untracked-but-not-ignored files) into a clean
       workspace and installs it with a flat ("hoisted") node_modules, since
       a zip cannot carry pnpm's symlinks.
    3. Runs `next build` there with the bundled node.exe first on PATH, so the
       native better-sqlite3 module matches the node.exe that ships.
    4. Reinstalls production dependencies only, trims what the server never
       reads, replaces any symlinks with real copies, and smoke-tests the
       native modules with the bundled node.
    5. Compiles mimiuchi.exe with the C# compiler that ships with Windows.
    6. Zips it.

.PARAMETER NodeMajor
  Node.js major version to bundle. Matches the Dockerfile.

.PARAMETER NodeVersion
  Exact version (e.g. 22.14.0) instead of the latest of NodeMajor.

.PARAMETER FfmpegExe
  Path to an ffmpeg.exe to bundle in ffmpeg\. Optional; without it the app
  still works, minus the waveform seek bar and WAV transcoding. Check the
  build's license before redistributing it (most Windows builds are GPL).

.PARAMETER NoZip
  Stop after assembling the folder (handy for testing).

.EXAMPLE
  pwsh packaging\windows\build.ps1
  pwsh packaging\windows\build.ps1 -FfmpegExe C:\tools\ffmpeg\bin\ffmpeg.exe
#>
[CmdletBinding()]
param(
  [int]$NodeMajor = 22,
  [string]$NodeVersion = "",
  [string]$FfmpegExe = "",
  [switch]$NoZip
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue" # Invoke-WebRequest is 10x slower with the bar

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

function Exec {
  param([string]$File, [string[]]$Arguments, [string]$Dir = (Get-Location).Path)
  Push-Location $Dir
  try {
    & $File @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$File $($Arguments -join ' ') failed with exit code $LASTEXITCODE" }
  } finally { Pop-Location }
}

$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$web = Join-Path $repo "web"
$out = Join-Path $repo "dist\windows"
$cache = Join-Path $out "cache"
$work = Join-Path $out "work"
$tar = Join-Path $env:SystemRoot "System32\tar.exe" # bsdtar: reads and writes zip
$csc = Join-Path $env:SystemRoot "Microsoft.NET\Framework64\v4.0.30319\csc.exe"

$appVersion = (Get-Content (Join-Path $web "package.json") -Raw | ConvertFrom-Json).version
$name = "mimiuchi-$appVersion-windows-x64"
$stage = Join-Path $out $name

foreach ($tool in @($tar, $csc)) {
  if (-not (Test-Path $tool)) { throw "Required tool not found: $tool" }
}
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) { throw "pnpm is not on PATH" }
New-Item -ItemType Directory -Force $cache | Out-Null

# ---------------------------------------------------------------------------
Step "Node.js runtime"
# ---------------------------------------------------------------------------
if (-not $NodeVersion) {
  $index = Invoke-RestMethod "https://nodejs.org/dist/index.json"
  $NodeVersion = ($index | Where-Object { $_.version -like "v$NodeMajor.*" } |
    Select-Object -First 1).version.TrimStart("v")
  if (-not $NodeVersion) { throw "No Node.js $NodeMajor.x release found" }
}
$nodeName = "node-v$NodeVersion-win-x64"
$nodeZip = Join-Path $cache "$nodeName.zip"
$nodeDir = Join-Path $cache $nodeName
Write-Host "Node.js $NodeVersion"
if (-not (Test-Path (Join-Path $nodeDir "node.exe"))) {
  $base = "https://nodejs.org/dist/v$NodeVersion"
  Invoke-WebRequest "$base/$nodeName.zip" -OutFile $nodeZip
  $sums = (Invoke-WebRequest "$base/SHASUMS256.txt").Content
  $expected = ($sums -split "`n" | Where-Object { $_ -match "\s$nodeName\.zip$" }) -replace "\s.*$", ""
  $actual = (Get-FileHash $nodeZip -Algorithm SHA256).Hash.ToLower()
  if (-not $expected -or $actual -ne $expected.Trim().ToLower()) {
    Remove-Item $nodeZip -Force
    throw "Checksum mismatch for $nodeName.zip"
  }
  Exec $tar @("-xf", $nodeZip, "-C", $cache)
}
$nodeExe = Join-Path $nodeDir "node.exe"

# Everything below runs `node` from PATH (pnpm.exe's scripts, prebuild-install,
# next build), so the bundled runtime goes first.
$env:PATH = "$nodeDir;$env:PATH"
$env:NEXT_TELEMETRY_DISABLED = "1"
# Build workers load lib/config (which writes a session secret) and may open
# the database. Point both at a throwaway folder, never at your real data.
$env:KIKOERU_DATA_DIR = Join-Path $work "build-data"
Remove-Item Env:KIKOERU_DIST_DIR -ErrorAction SilentlyContinue

# ---------------------------------------------------------------------------
Step "Workspace"
# ---------------------------------------------------------------------------
if (Test-Path $work) { Remove-Item $work -Recurse -Force }
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
$app = Join-Path $work "app"
New-Item -ItemType Directory -Force $app | Out-Null

# quotepath=off: otherwise git escapes non-ASCII names into "\343\201..." form.
$files = & git -C $repo -c core.quotepath=off ls-files -co --exclude-standard -- web
if ($LASTEXITCODE -ne 0) { throw "git ls-files failed" }
$copied = 0
foreach ($rel in $files) {
  # System.IO, not Test-Path/Copy-Item -Path: those read the [id] / [workId]
  # of dynamic route folders as wildcards and silently skip the files.
  $src = [System.IO.Path]::Combine($repo, $rel)
  if (-not [System.IO.File]::Exists($src)) { continue } # deleted but still tracked
  $dst = [System.IO.Path]::Combine($app, $rel.Substring(4)) # strip "web/"
  [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($dst)) | Out-Null
  [System.IO.File]::Copy($src, $dst, $true)
  $copied++
}
Write-Host "$copied files copied"
# Guard against the class of bug above: every dynamic route must have made it.
$expected = @($files | Where-Object { $_ -match '\[[^\]]+\]' -and [System.IO.File]::Exists([System.IO.Path]::Combine($repo, $_)) })
$missing = @($expected | Where-Object { -not [System.IO.File]::Exists([System.IO.Path]::Combine($app, $_.Substring(4))) })
if ($missing.Count -gt 0) { throw "Not copied: $($missing -join ', ')" }
Write-Host "$($expected.Count) dynamic-route files present"

$pnpmArgs = @("--config.node-linker=hoisted", "--config.confirmModulesPurge=false")

# ---------------------------------------------------------------------------
Step "Install (all dependencies) and build"
# ---------------------------------------------------------------------------
Exec pnpm (@("install", "--frozen-lockfile") + $pnpmArgs) $app
Exec pnpm @("build") $app

# `next start` only needs the 130 MB SWC compiler to read next.config.ts. Hand
# it plain JavaScript instead (transpiled with the workspace's TypeScript while
# dev dependencies are still installed) and SWC need not ship at all.
$transpile = @'
const [, tsDir, src, dst] = process.argv;
const ts = require(tsDir);
const fs = require("fs");
const out = ts.transpileModule(fs.readFileSync(src, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
// Next does not unwrap `exports.default` from a CommonJS config.
const marker = "exports.default = nextConfig;";
if (!out.includes(marker)) throw new Error("next.config.ts no longer ends in `export default nextConfig`");
fs.writeFileSync(dst, out.replace(marker, "module.exports = nextConfig;"));
'@
Exec $nodeExe @("-e", $transpile, (Join-Path $app "node_modules\typescript"),
  (Join-Path $app "next.config.ts"), (Join-Path $app "next.config.js"))

# ---------------------------------------------------------------------------
Step "Production dependencies"
# ---------------------------------------------------------------------------
Remove-Item (Join-Path $app "node_modules") -Recurse -Force
Exec pnpm (@("install", "--prod", "--frozen-lockfile") + $pnpmArgs) $app

# ---------------------------------------------------------------------------
Step "Assemble $name"
# ---------------------------------------------------------------------------
$stageApp = Join-Path $stage "app"
New-Item -ItemType Directory -Force $stageApp | Out-Null
# What the server reads at runtime; mirrors the Dockerfile's runtime stage.
foreach ($item in @(".next", "node_modules", "public", "drizzle", "package.json", "next.config.js")) {
  Move-Item (Join-Path $app $item) (Join-Path $stageApp $item)
}
# Build cache, and the throwaway data dir's traces if any.
Remove-Item (Join-Path $stageApp ".next\cache") -Recurse -Force -ErrorAction SilentlyContinue

# A zip cannot hold symlinks or junctions. Replace each with a real copy of its
# target (Turbopack links external packages into .next\node_modules).
$links = Get-ChildItem $stageApp -Recurse -Force -Attributes ReparsePoint -ErrorAction SilentlyContinue
foreach ($link in $links) {
  $target = $link.Target | Select-Object -First 1
  if (-not [System.IO.Path]::IsPathRooted($target)) { $target = Join-Path (Split-Path $link.FullName) $target }
  # Turbopack writes absolute junctions into the workspace, whose contents
  # have just moved here.
  if ($target.StartsWith($app, [StringComparison]::OrdinalIgnoreCase)) {
    $target = $stageApp + $target.Substring($app.Length)
  }
  $target = (Resolve-Path $target).Path
  $path = $link.FullName
  $isDir = $link.PSIsContainer
  $link.Delete()
  if ($isDir) { Copy-Item $target $path -Recurse } else { Copy-Item $target $path }
}
Write-Host "$(@($links).Count) links replaced with copies"

# Trim what the server never reads. Each of these was checked against a
# running server: setup, scan, playback, search.
$nm = Join-Path $stageApp "node_modules"
foreach ($dir in @(
    "@next\swc-win32-x64-msvc",            # compiler; see next.config.js above
    "@playwright", "playwright", "playwright-core", # optional peer of next, test mode only
    "kuromoji\test", "kuromoji\demo", "kuromoji\example", # only kuromoji\dict is read
    "better-sqlite3\deps", "better-sqlite3\src" # C sources; the prebuilt .node is in build\
  )) {
  $p = Join-Path $nm $dir
  if (Test-Path $p) { Remove-Item $p -Recurse -Force }
}
$trim = Get-ChildItem (Join-Path $stageApp "node_modules") -Recurse -File -Include *.map, *.d.ts, *.d.mts, *.d.cts, *.md, *.markdown -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -notmatch "^license" }
$trimmed = ($trim | Measure-Object Length -Sum).Sum
$trim | Remove-Item -Force
Write-Host ("Trimmed {0:N0} MB of maps, typings and docs" -f ($trimmed / 1MB))

Copy-Item (Join-Path $PSScriptRoot "launcher.mjs") $stageApp

$runtime = Join-Path $stage "runtime"
New-Item -ItemType Directory -Force $runtime | Out-Null
Copy-Item $nodeExe $runtime
Copy-Item (Join-Path $nodeDir "LICENSE") (Join-Path $runtime "LICENSE.txt")

if ($FfmpegExe) {
  if (-not (Test-Path $FfmpegExe)) { throw "ffmpeg not found: $FfmpegExe" }
  $ff = Join-Path $stage "ffmpeg"
  New-Item -ItemType Directory -Force $ff | Out-Null
  Copy-Item $FfmpegExe $ff
  # Ship its license alongside if the build has one nearby.
  $ffRoot = Split-Path (Split-Path $FfmpegExe)
  foreach ($lic in @("LICENSE", "LICENSE.txt", "COPYING.GPLv3", "COPYING.LGPLv2.1")) {
    $p = Join-Path $ffRoot $lic
    if (Test-Path $p) { Copy-Item $p $ff }
  }
}

Copy-Item (Join-Path $PSScriptRoot "README.txt") $stage
Copy-Item (Join-Path $repo "LICENSE") $stage -ErrorAction SilentlyContinue

# ---------------------------------------------------------------------------
Step "mimiuchi.exe"
# ---------------------------------------------------------------------------
$ico = Join-Path $work "mimiuchi.ico"
Exec $nodeExe @((Join-Path $PSScriptRoot "make-icon.mjs"), (Join-Path $PSScriptRoot "icon.svg"), $ico, $stageApp)
Exec $csc @("/nologo", "/optimize+", "/target:exe", "/platform:anycpu",
  "/out:$(Join-Path $stage 'mimiuchi.exe')", "/win32icon:$ico",
  (Join-Path $PSScriptRoot "Launcher.cs"))

# ---------------------------------------------------------------------------
Step "Smoke test"
# ---------------------------------------------------------------------------
# Native modules must load under the node.exe that ships, from the shipped tree.
$check = @'
const Database = require("better-sqlite3");
const db = new Database(":memory:");
if (db.prepare("select 1 as x").get().x !== 1) throw new Error("sqlite");
require("sharp");
console.log("native modules OK under node " + process.version);
'@
Exec (Join-Path $runtime "node.exe") @("-e", $check) $stageApp

$files = Get-ChildItem $stage -Recurse -File -Force
$size = ($files | Measure-Object Length -Sum).Sum
$longest = ($files | ForEach-Object { $_.FullName.Length - $out.Length - 1 } | Measure-Object -Maximum).Maximum
Write-Host ("{0:N0} files, {1:N0} MB, longest path inside the zip {2} chars" -f $files.Count, ($size / 1MB), $longest)
# Explorer's "Extract All" fails past 260 characters, and people extract into
# paths like C:\Users\<name>\Downloads\<zip name>\.
if ($longest -gt 170) { Write-Warning "Paths this long may fail to extract under a deep folder" }

if ($NoZip) {
  Write-Host "`nFolder ready: $stage"
  return
}

# ---------------------------------------------------------------------------
Step "Zip"
# ---------------------------------------------------------------------------
$zip = Join-Path $out "$name.zip"
Remove-Item $zip -Force -ErrorAction SilentlyContinue
Exec $tar @("-a", "-c", "-f", $zip, "-C", $out, $name)
$hash = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
"$hash  $name.zip" | Set-Content (Join-Path $out "$name.zip.sha256") -Encoding ascii
Write-Host ("`n{0} ({1:N0} MB)`nsha256 {2}" -f $zip, ((Get-Item $zip).Length / 1MB), $hash)
