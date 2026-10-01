param(
    [Parameter(Mandatory=$true)][string]$InstallPath,
    [switch]$KeepData,
    [switch]$Portable,
    [int]$WaitPid = 0
)
$ErrorActionPreference = 'Stop'

function Assert-OwnedDirectory([string]$Directory, [string[]]$AllowedPaths) {
    $resolved = [System.IO.Path]::GetFullPath($Directory).TrimEnd('\')
    $matches = @($AllowedPaths | Where-Object { $resolved.Equals([System.IO.Path]::GetFullPath($_).TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase) })
    if ($matches.Count -ne 1 -or $resolved.Length -lt 8) { throw '拒绝清理非应用目录。' }
    if (Test-Path -LiteralPath $resolved) {
        $item = Get-Item -LiteralPath $resolved -Force
        if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) { throw '应用目录包含目录链接，请先移除链接再卸载。' }
        $links = @(Get-ChildItem -LiteralPath $resolved -Recurse -Force -Attributes ReparsePoint -ErrorAction Stop)
        if ($links.Count) { throw '应用目录内存在目录链接，已停止清理以保护链接目标。' }
    }
    return $resolved
}

try {
    $taskInstallRoot = [System.IO.Path]::GetFullPath($InstallPath).TrimEnd('\')
    if ($taskInstallRoot.Length -lt 8 -or -not (Test-Path -LiteralPath (Join-Path $taskInstallRoot 'MusicWorkbench.exe')) -or -not (Test-Path -LiteralPath (Join-Path $taskInstallRoot 'resources\backend\server.py'))) { throw '无法确认 MusicWorkbench 安装目录。' }
    $taskInstallRoot = Assert-OwnedDirectory $taskInstallRoot @($taskInstallRoot)
    if ($WaitPid -gt 0) {
        for ($taskAttempt=0; $taskAttempt -lt 100; $taskAttempt++) {
            $taskAppProcess = Get-Process -Id $WaitPid -ErrorAction SilentlyContinue
            if (-not $taskAppProcess) { break }
            if ($taskAppProcess.Path -ne (Join-Path $taskInstallRoot 'MusicWorkbench.exe')) { throw '待退出进程不属于此应用。' }
            Start-Sleep -Milliseconds 100
        }
    }
    # Scope process termination to executable paths inside this exact installation.
    $taskOwnedProcesses = @(Get-CimInstance Win32_Process | Where-Object {
        $_.ExecutablePath -and $_.ExecutablePath.StartsWith($taskInstallRoot+'\', [System.StringComparison]::OrdinalIgnoreCase) -and
        $_.Name -in @('MusicWorkbench.exe','python.exe','pythonw.exe','ffmpeg.exe')
    })
    foreach ($taskOwnedProcess in $taskOwnedProcesses) {
        Stop-Process -Id $taskOwnedProcess.ProcessId -Force -ErrorAction SilentlyContinue
    }
    for ($taskAttempt=0; $taskAttempt -lt 50; $taskAttempt++) {
        $taskStillRunning = @($taskOwnedProcesses | Where-Object { Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue })
        if (-not $taskStillRunning.Count) { break }
        Start-Sleep -Milliseconds 100
    }
    if ($taskStillRunning.Count) { throw '应用后台仍在运行，请关闭后重试卸载。' }
    if (-not $KeepData) {
        $taskDataRoots = @(
            (Join-Path $env:APPDATA 'music-workbench'), (Join-Path $env:APPDATA 'MusicWorkbench'),
            (Join-Path $env:LOCALAPPDATA 'music-workbench'), (Join-Path $env:LOCALAPPDATA 'MusicWorkbench'),
            (Join-Path $env:LOCALAPPDATA 'music-workbench-updater'), (Join-Path $env:LOCALAPPDATA 'MusicWorkbench-updater')
        )
        # Validate every final target before any recursive deletion.
        $taskValidatedRoots = @($taskDataRoots | ForEach-Object { Assert-OwnedDirectory $_ $taskDataRoots })
        foreach ($taskDataRoot in $taskValidatedRoots) {
            if (Test-Path -LiteralPath $taskDataRoot) { Remove-Item -LiteralPath $taskDataRoot -Recurse -Force }
        }
    }
    if ($Portable) {
        $taskInstallRoot = Assert-OwnedDirectory $taskInstallRoot @($taskInstallRoot)
        Remove-Item -LiteralPath $taskInstallRoot -Recurse -Force
    }
    exit 0
} catch {
    if ($Portable) {
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.MessageBox]::Show(('清理未完成：'+$_.Exception.Message),'MusicWorkbench 卸载') | Out-Null
    } else { Write-Error $_ -ErrorAction Continue }
    exit 1
} finally {
    if ($Portable -and $PSCommandPath) {
        $taskScriptPath = [System.IO.Path]::GetFullPath($PSCommandPath)
        if ($taskScriptPath.StartsWith([System.IO.Path]::GetFullPath($env:TEMP).TrimEnd('\')+'\', [System.StringComparison]::OrdinalIgnoreCase) -and [System.IO.Path]::GetFileName($taskScriptPath) -match '^MusicWorkbench-Uninstall-[a-f0-9-]+\.ps1$') {
            Remove-Item -LiteralPath $taskScriptPath -Force -ErrorAction SilentlyContinue
        }
    }
}
