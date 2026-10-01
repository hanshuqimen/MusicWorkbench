$ErrorActionPreference = 'Stop'
$taskRoot = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) 'output\uninstall-qa'))
if (-not $taskRoot.StartsWith((Join-Path (Get-Location) 'output\'), [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected test workspace' }
$taskRunRoot = Join-Path $taskRoot ([guid]::NewGuid().ToString())
$taskRoaming = Join-Path $taskRunRoot 'Roaming'
$taskLocal = Join-Path $taskRunRoot 'Local'
$taskInstall = Join-Path $taskRunRoot 'installed'
New-Item -ItemType Directory -Path (Join-Path $taskInstall 'resources\backend'),$taskRoaming,$taskLocal -Force | Out-Null
Set-Content -LiteralPath (Join-Path $taskInstall 'MusicWorkbench.exe') -Value 'test marker'
Set-Content -LiteralPath (Join-Path $taskInstall 'resources\backend\server.py') -Value 'test marker'
$taskSentinel = Join-Path $taskRunRoot 'user-owned-work.mwork'
Set-Content -LiteralPath $taskSentinel -Value 'preserve outside app folders'
$taskRoots=@((Join-Path $taskRoaming 'music-workbench'),(Join-Path $taskRoaming 'MusicWorkbench'),(Join-Path $taskLocal 'music-workbench'),(Join-Path $taskLocal 'MusicWorkbench'),(Join-Path $taskLocal 'music-workbench-updater'),(Join-Path $taskLocal 'MusicWorkbench-updater'))
foreach ($taskDataRoot in $taskRoots) {
    New-Item -ItemType Directory -Path (Join-Path $taskDataRoot 'gpu\site-packages'),(Join-Path $taskDataRoot 'models') -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $taskDataRoot 'models\sample.th') -Value 'cached model'
}
$taskSavedRoaming=$env:APPDATA
$taskSavedLocal=$env:LOCALAPPDATA
try {
    $env:APPDATA=$taskRoaming
    $env:LOCALAPPDATA=$taskLocal
    $taskPowerShell=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $taskScript=Join-Path (Get-Location) 'desktop\uninstall-cleanup.ps1'
    & $taskPowerShell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $taskScript -InstallPath $taskInstall -KeepData
    if ($LASTEXITCODE -ne 0 -or @($taskRoots | Where-Object { -not (Test-Path -LiteralPath $_) }).Count) { throw 'Update deleted data' }
    Write-Output 'PASS updates preserve resources and user data'
    & $taskPowerShell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $taskScript -InstallPath $taskRunRoot
    if ($LASTEXITCODE -eq 0 -or -not (Test-Path -LiteralPath $taskSentinel)) { throw 'Unsafe target was accepted' }
    Write-Output 'PASS unrelated directories rejected before deletion'
    & $taskPowerShell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $taskScript -InstallPath $taskInstall
    if ($LASTEXITCODE -ne 0 -or @($taskRoots | Where-Object { Test-Path -LiteralPath $_ }).Count -or -not (Test-Path -LiteralPath $taskSentinel)) { throw 'App data cleanup failed' }
    Write-Output 'PASS models, GPU dependencies, updater cache and settings removed'
    & $taskPowerShell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $taskScript -InstallPath $taskInstall -Portable
    if ($LASTEXITCODE -ne 0 -or (Test-Path -LiteralPath $taskInstall) -or -not (Test-Path -LiteralPath $taskSentinel)) { throw 'Portable cleanup failed' }
    Write-Output 'PASS portable application directory removed and external projects preserved'
    @{checks=4;date=(Get-Date).ToString('o');testRoot=$taskRunRoot} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskRoot 'report.json') -Encoding utf8
} finally {
    $env:APPDATA=$taskSavedRoaming
    $env:LOCALAPPDATA=$taskSavedLocal
}
