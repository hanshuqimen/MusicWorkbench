!macro customUnInstall
  # Updates terminate the old runtime but preserve models and user projects.
  ${if} ${isUpdated}
    nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\uninstall-cleanup.ps1" -InstallPath "$INSTDIR" -KeepData'
  ${else}
    nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\uninstall-cleanup.ps1" -InstallPath "$INSTDIR"'
  ${endif}
  Pop $0
  Pop $1
  ${if} $0 != "0"
    MessageBox MB_OK|MB_ICONSTOP "MusicWorkbench 清理未完成，请关闭应用后重试。$\r$\n$1" /SD IDOK
    SetErrorLevel 2
    Abort
  ${endif}
!macroend
