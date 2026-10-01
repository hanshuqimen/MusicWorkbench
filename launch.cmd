@echo off
cd /d "%~dp0"
if exist "release\win-unpacked\MusicWorkbench.exe" (
  start "" "release\win-unpacked\MusicWorkbench.exe"
  exit /b 0
)
set "WORKBENCH_NODE="
for /d %%D in ("%~dp0.tools\node-*-win-x64") do set "WORKBENCH_NODE=%%D\node.exe"
if not defined WORKBENCH_NODE if exist "C:\Users\ASUS\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "WORKBENCH_NODE=C:\Users\ASUS\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not defined WORKBENCH_NODE set "WORKBENCH_NODE=node"
if not exist ".venv\Scripts\python.exe" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
  if errorlevel 1 pause
  exit /b
)
"%WORKBENCH_NODE%" scripts\start.mjs
