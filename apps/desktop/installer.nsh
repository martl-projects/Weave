; The `weave` command for terminals and agents: resources\bin holds weave.cmd
; (and `weave` for Git Bash), which run the bundled CLI with the app's own Node.
; The installer adds that folder to this user's PATH and the uninstaller takes it
; out again. PowerShell edits the registry value as is (unexpanded, any length),
; which NSIS's own string functions can't do safely.

!include WinMessages.nsh

!macro weavePath ADD
  System::Call 'Kernel32::SetEnvironmentVariable(t "WEAVE_BIN", t "$INSTDIR\resources\bin")i'
  System::Call 'Kernel32::SetEnvironmentVariable(t "WEAVE_ADD", t "${ADD}")i'
  nsExec::Exec `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$$k = Get-Item 'HKCU:\Environment'; $$p = $$k.GetValue('Path', '', 'DoNotExpandEnvironmentNames'); $$parts = @($$p -split ';' | Where-Object { $$_ -and $$_.TrimEnd('\') -ne $$env:WEAVE_BIN }); if ($$env:WEAVE_ADD -eq '1') { $$parts += $$env:WEAVE_BIN }; Set-ItemProperty -Path 'HKCU:\Environment' -Name Path -Value ($$parts -join ';') -Type ExpandString"`
  Pop $0
  ; Tell open programs (Explorer, new terminals) that PATH changed.
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
!macroend

!macro customInstall
  !insertmacro weavePath 1
!macroend

!macro customUnInstall
  ; An update runs the old uninstaller first; the new install adds the folder again anyway.
  ${ifNot} ${isUpdated}
    !insertmacro weavePath 0
  ${endIf}
!macroend
