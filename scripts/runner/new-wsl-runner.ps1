# Sets up the self-hosted Linux runner in its own WSL distro (see
# docs/self-hosted-runners.md). Run on the host, in a normal PowerShell, with gh
# signed in to an account that administers the repository:
#
#   .\scripts\runner\new-wsl-runner.ps1
#
# Installs Ubuntu 24.04 as the distro weave-runner (apart from any other distro),
# runs setup-wsl-runner.sh in it, and adds a task that starts the runner at logon
# and again if it stops.

param(
  [string] $Distro = 'weave-runner',
  [string] $Location = "C:\WSL\weave-runner",
  [string] $Repo = 'martl-projects/Weave'
)

$ErrorActionPreference = 'Stop'

$installed = (wsl.exe -l -q) -replace "`0", '' | Where-Object { $_.Trim() -eq $Distro }
if (-not $installed) {
  wsl.exe --install Ubuntu-24.04 --name $Distro --location $Location --no-launch
  if ($LASTEXITCODE) { throw "wsl --install failed ($LASTEXITCODE)" }
}

$token = gh api -X POST "repos/$Repo/actions/runners/registration-token" --jq .token
if (-not $token) { throw 'no registration token (is gh signed in?)' }

# Handed over as base64 rather than a path: the distro can't see the Windows
# drives once it's set up, and Windows PowerShell's pipe would add a CR.
$script = (Get-Content -Raw (Join-Path $PSScriptRoot 'setup-wsl-runner.sh')) -replace "`r", ''
$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($script))
wsl.exe -d $Distro -u root -- bash -c "echo $b64 | base64 -d | bash -s -- $token"
if ($LASTEXITCODE) { throw "setup-wsl-runner.sh failed ($LASTEXITCODE)" }
wsl.exe --terminate $Distro

# conhost --headless keeps the console window out of sight.
$action = New-ScheduledTaskAction -Execute 'conhost.exe' -Argument "--headless wsl.exe -d $Distro -u root -- /usr/local/bin/weave-runner-start"
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit 0 -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName 'weave-wsl-runner' -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName 'weave-wsl-runner'
Write-Host "Done: the runner in $Distro starts at logon (task weave-wsl-runner)."
