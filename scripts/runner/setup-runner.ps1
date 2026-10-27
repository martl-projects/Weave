# Turns a fresh Windows VM into the repository's self-hosted runner (see
# docs/self-hosted-runners.md). Run inside the VM, in PowerShell as Administrator:
#
#   .\setup-runner.ps1 -Token <registration token>
#
# Installs Git and PowerShell 7 (the workflows' Windows shell), then registers
# the GitHub runner as a Windows service with the label windows-vm. Node isn't
# installed: actions/setup-node fetches the version each workflow asks for.

param(
  [Parameter(Mandatory)] [string] $Token,
  [string] $Url = 'https://github.com/martldennl/Weave',
  [string] $Name = 'weave-runner-vm',
  [string] $Labels = 'windows-vm',
  [string] $Folder = 'C:\actions-runner'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# The download url of the newest release asset of a GitHub repository whose name matches.
function Get-Asset([string] $repo, [string] $pattern) {
  $release = Invoke-RestMethod "https://api.github.com/repos/$repo/releases/latest" -Headers @{ 'User-Agent' = 'weave-runner-setup' }
  $asset = $release.assets | Where-Object { $_.name -match $pattern } | Select-Object -First 1
  if (-not $asset) { throw "no asset matching $pattern in $repo $($release.tag_name)" }
  $asset.browser_download_url
}

function Save([string] $url) {
  $file = Join-Path $env:TEMP ([IO.Path]::GetFileName($url))
  Invoke-WebRequest $url -OutFile $file -UseBasicParsing
  $file
}

Write-Host 'Git for Windows'
$git = Save (Get-Asset 'git-for-windows/git' '^Git-[\d.]+-64-bit\.exe$')
Start-Process $git -ArgumentList '/VERYSILENT', '/NORESTART', '/NOCANCEL', '/SP-' -Wait
$env:Path = "C:\Program Files\Git\cmd;C:\Program Files\Git\bin;$env:Path"
git config --system core.longpaths true

Write-Host 'PowerShell 7'
$pwsh = Save (Get-Asset 'PowerShell/PowerShell' '^PowerShell-[\d.]+-win-x64\.msi$')
Start-Process msiexec.exe -ArgumentList '/i', $pwsh, '/qn', 'ADD_PATH=1' -Wait

# node_modules goes deeper than 260 characters.
Set-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name LongPathsEnabled -Value 1
# Windows signing (Azure Trusted Signing) installs a PowerShell module from the gallery.
Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force -Scope AllUsers | Out-Null
Set-PSRepository -Name PSGallery -InstallationPolicy Trusted
# A build VM: no sleeping, and no virus scan of every file npm writes.
powercfg /change standby-timeout-ac 0
Add-MpPreference -ExclusionPath $Folder

Write-Host 'GitHub runner'
New-Item -ItemType Directory -Force $Folder | Out-Null
$zip = Save (Get-Asset 'actions/runner' '^actions-runner-win-x64-[\d.]+\.zip$')
Expand-Archive $zip -DestinationPath $Folder -Force
Push-Location $Folder
try {
  # config.cmd registers the runner and installs the service, then fails to start
  # it as Network Service on a fresh Windows 11 (error 1068): run it as LocalSystem,
  # which is fine on a VM that is only there to build.
  .\config.cmd --unattended --url $Url --token $Token --name $Name --labels $Labels --runasservice --replace
} finally { Pop-Location }
$service = Get-Service "actions.runner.*.$Name" -ErrorAction SilentlyContinue
if (-not $service) { throw "config.cmd didn't install the runner service ($LASTEXITCODE)" }
sc.exe config $service.Name obj= LocalSystem | Out-Null
Start-Service $service.Name

Write-Host "Done: $Name is registered with the label $Labels and runs as a service. Restart the VM once so the PATH changes reach the service."
