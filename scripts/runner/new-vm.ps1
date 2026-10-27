# Creates the Hyper-V VM that hosts the self-hosted Windows runner (see
# docs/self-hosted-runners.md). Run on the host, in PowerShell as Administrator:
#
#   .\scripts\runner\new-vm.ps1 -Iso C:\path\to\Windows11.iso
#
# Generation 2 with Secure Boot and a virtual TPM (Windows 11 wants both), a
# dynamically growing disk, and the Default Switch for internet. The VM starts
# with the host, so the runner is there whenever this computer is on.

param(
  [Parameter(Mandatory)] [string] $Iso,
  [string] $Name = 'weave-runner',
  [string] $Folder = 'C:\Hyper-V',
  [int] $Cpus = 8,
  [long] $Memory = 16GB,
  [long] $Disk = 100GB
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path $Iso)) { throw "no ISO at $Iso" }
if (Get-VM -Name $Name -ErrorAction SilentlyContinue) { throw "a VM named $Name already exists" }

$vhd = Join-Path $Folder "$Name\$Name.vhdx"
New-VM -Name $Name -Generation 2 -MemoryStartupBytes $Memory -NewVHDPath $vhd -NewVHDSizeBytes $Disk -SwitchName 'Default Switch' -Path $Folder | Out-Null
Set-VM -Name $Name -ProcessorCount $Cpus -StaticMemory -AutomaticCheckpointsEnabled $false -AutomaticStartAction Start -AutomaticStopAction ShutDown
Set-VMKeyProtector -VMName $Name -NewLocalKeyProtector
Enable-VMTPM -VMName $Name
Add-VMDvdDrive -VMName $Name -Path $Iso
Set-VMFirmware -VMName $Name -FirstBootDevice (Get-VMDvdDrive -VMName $Name)

Start-VM -Name $Name
vmconnect.exe localhost $Name
Write-Host "Started $Name. Press a key in the window when it says 'Press any key to boot from CD or DVD'."
