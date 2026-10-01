param([switch]$Cpu)
$ErrorActionPreference='Stop'
Set-Location -LiteralPath $PSScriptRoot
$env:UV_CACHE_DIR=Join-Path $PSScriptRoot '.cache/uv'
$env:UV_PYTHON_INSTALL_DIR=Join-Path $PSScriptRoot '.runtime'
$toolsDir=Join-Path $PSScriptRoot '.tools'
New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null
function Run-Checked([string]$Exe,[string[]]$Arguments) {
    & $Exe @Arguments
    if ($LASTEXITCODE -ne 0) { throw "初始化步骤失败：$Exe" }
}
$nodeCmd=Get-Command node.exe -ErrorAction SilentlyContinue
if ($nodeCmd) { $nodeExe=$nodeCmd.Source } else {
    $nodeVersion='v24.19.0';$nodeArchive="node-$nodeVersion-win-x64.zip"
    $nodeZip=Join-Path $toolsDir $nodeArchive
    $hashText=(Invoke-WebRequest "https://nodejs.org/dist/$nodeVersion/SHASUMS256.txt" -UseBasicParsing).Content
    $expected=($hashText -split "`n" | Where-Object { $_ -match " $([regex]::Escape($nodeArchive))$" }).Split(' ')[0]
    if (!$expected) { throw 'Node 校验清单中没有所需文件' }
    if (!(Test-Path -LiteralPath $nodeZip)) { Invoke-WebRequest "https://nodejs.org/dist/$nodeVersion/$nodeArchive" -OutFile $nodeZip }
    if ((Get-FileHash -LiteralPath $nodeZip -Algorithm SHA256).Hash.ToLower() -ne $expected) { throw 'Node 下载校验失败' }
    Expand-Archive -LiteralPath $nodeZip -DestinationPath $toolsDir -Force
    $nodeExe=Join-Path $toolsDir "node-$nodeVersion-win-x64/node.exe"
}
$env:PATH=(Split-Path $nodeExe)+';'+$env:PATH
$uvCmd=Get-Command uv.exe -ErrorAction SilentlyContinue
if ($uvCmd) { $uvExe=$uvCmd.Source } elseif(Test-Path "$env:USERPROFILE/.local/bin/uv.exe") { $uvExe="$env:USERPROFILE/.local/bin/uv.exe" } else {
    $uvZip=Join-Path $toolsDir 'uv.zip'
    Invoke-WebRequest 'https://github.com/astral-sh/uv/releases/download/0.11.11/uv-x86_64-pc-windows-msvc.zip' -OutFile $uvZip
    $sum=(Invoke-WebRequest 'https://github.com/astral-sh/uv/releases/download/0.11.11/uv-x86_64-pc-windows-msvc.zip.sha256' -UseBasicParsing).Content.Trim().Split(' ')[0]
    if ((Get-FileHash -LiteralPath $uvZip -Algorithm SHA256).Hash.ToLower() -ne $sum) { throw 'uv 校验失败' }
    Expand-Archive -LiteralPath $uvZip -DestinationPath $toolsDir -Force
    $uvExe=Join-Path $toolsDir 'uv.exe'
}
$env:UV_EXE=$uvExe
Run-Checked $uvExe @('python','install','3.11.15')
if (!(Test-Path '.venv/Scripts/python.exe')) { Run-Checked $uvExe @('venv','--python','3.11.15','.venv') }
$pythonExe=Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
$torchIndex=if($Cpu){'https://download.pytorch.org/whl/cpu'}else{'https://download.pytorch.org/whl/cu128'}
Run-Checked $uvExe @('pip','install','--python',$pythonExe,'torch==2.7.1','torchaudio==2.7.1','--index-url',$torchIndex)
Run-Checked $uvExe @('pip','install','--python',$pythonExe,'--no-deps','-r','backend/requirements-lock.txt')
Run-Checked $uvExe @('pip','install','--python',$pythonExe,'--no-deps','demucs==4.0.1','basic-pitch==0.4.0')
$npm=Join-Path (Split-Path $nodeExe) 'npm.cmd'
if (!(Test-Path '.tools/node_modules/pnpm/bin/pnpm.cjs')) { Run-Checked $npm @('install','--prefix','.tools','pnpm@11.25.0') }
Run-Checked $nodeExe @('.tools/node_modules/pnpm/bin/pnpm.cjs','install','--frozen-lockfile')
Run-Checked $pythonExe @('-c','import pathlib,shutil,imageio_ffmpeg; pathlib.Path("vendor").mkdir(exist_ok=True); shutil.copy2(imageio_ffmpeg.get_ffmpeg_exe(),"vendor/ffmpeg.exe")')
Run-Checked $pythonExe @('scripts/fetch-vcruntime.py')
Run-Checked $pythonExe @('-c','from backend.resources import manifest,asset_path,download_asset; import shutil,pathlib; [download_asset(a,asset_path(a),lambda **x: print(x,flush=True)) for a in manifest()]; [shutil.copy2(asset_path(a),pathlib.Path("vendor")/a["file"]) for a in manifest()]')
Run-Checked $nodeExe @('scripts/copy-worklet.mjs')
Run-Checked $nodeExe @('node_modules/typescript/bin/tsc','--noEmit')
Run-Checked $nodeExe @('node_modules/vite/bin/vite.js','build')
Run-Checked $nodeExe @('scripts/copy-worklet.mjs')
Write-Host '初始化完成。双击 launch.cmd 打开应用。'
