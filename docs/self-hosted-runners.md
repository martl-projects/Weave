# The self-hosted runners

The jobs of CI, Installers and Release run on self-hosted GitHub runners
instead of GitHub's machines, so they cost no Actions minutes. Each keeps the
builds away from its host's files and keys:

| Runner             | Label        | Where                                              |
| ------------------ | ------------ | -------------------------------------------------- |
| `weave-runner-vm`  | `windows-vm` | a Hyper-V VM on the development PC, started with it |
| `weave-runner-wsl` | `linux-wsl`  | its own WSL distro on the PC, started at logon     |
| `weave-runner-mac` | `macos-mini` | a hidden user on the Mac mini, started at boot     |

The server image is built there too, with rootless Podman: Docker would give
jobs root in the distro, Podman runs as runner in its own user namespace.

To send jobs back to GitHub's runners (a machine is off, say), set the repository
variable `WINDOWS_RUNNER` to `"windows-latest"`, `MACOS_RUNNER` to
`"macos-latest"` or `LINUX_RUNNER` to `"ubuntu-latest"`, quotes included (they're
read as JSON); delete the variable to use the self-hosted runner again:

```bash
gh variable set LINUX_RUNNER --body '"ubuntu-latest"'
```

## Windows: the VM

1. **A Windows 11 ISO.** The Windows 11 Enterprise evaluation from Microsoft's
   Evaluation Center is free for 90 days (then rebuild the VM, or use a licensed
   ISO from microsoft.com/software-download/windows11).

2. **The VM.** On the host, in PowerShell as Administrator:

   ```powershell
   .\scripts\runner\new-vm.ps1 -Iso C:\path\to\Windows11.iso
   ```

   8 cores, 16 GB, a 100 GB disk that grows as it fills (about 50 GB in use).
   The DVD prompt lasts a few seconds; if it's missed, the host can press the key:

   ```powershell
   Stop-VM weave-runner -TurnOff -Force; Start-VM weave-runner
   $kb = Get-CimInstance -Namespace root\virtualization\v2 -ClassName Msvm_ComputerSystem -Filter "ElementName='weave-runner'" | Get-CimAssociatedInstance -ResultClassName Msvm_Keyboard
   1..20 | % { Invoke-CimMethod -InputObject $kb -MethodName TypeKey -Arguments @{ keyCode = [uint32]0x20 } | Out-Null; Start-Sleep -Milliseconds 500 }
   ```

   Install Windows with a local account: Sign-in options, then "Domain join
   instead" (or Shift+F10 and `start ms-cxh:localonly`).

3. **A registration token.** On the host (valid for an hour):

   ```bash
   gh api -X POST repos/martl-projects/Weave/actions/runners/registration-token --jq .token
   ```

4. **The runner.** In the VM, in PowerShell as Administrator, run
   `scripts/runner/setup-runner.ps1 -Token <the token>` (paste it in through an
   enhanced session's clipboard). It runs the service as LocalSystem: as Network
   Service it doesn't start on a fresh Windows 11 (error 1068). Restart the VM once.

5. **A checkpoint** of the clean VM, a quick way back if a build leaves it in a bad
   state: `Checkpoint-VM -Name weave-runner -SnapshotName clean`.

## Linux: the WSL distro

On the host, in a normal PowerShell, with gh signed in:

```powershell
.\scripts\runner\new-wsl-runner.ps1
```

It installs Ubuntu 24.04 as the distro `weave-runner` (apart from any other
distro), runs `setup-wsl-runner.sh` in it, and adds the task `weave-wsl-runner`
that starts the runner at logon and again if it stops. Inside, the runner runs as
`runner` without sudo; the distro doesn't mount the Windows drives or start
Windows programs, and the start script detaches `/mnt/wsl` (shared by all
distros, where Docker Desktop's bind mounts from other distros appear, writable
by uid 1000). WSL would link `/etc/resolv.conf` into `/mnt/wsl` again with every
new session, so the distro keeps a file of its own (`generateResolvConf = false`,
nameserver 10.255.255.254).

`wsl --shutdown` stops it too; the task retries every minute when the runner
exits with an error, and otherwise starts it at the next logon (or run
`Start-ScheduledTask weave-wsl-runner`).

## macOS: the Mac mini

The Mac needs Xcode or its Command Line Tools (`swiftc`, `codesign`,
`notarytool`). Copy `scripts/runner/setup-mac-runner.sh` to it and run it with a
registration token (see above), as an administrator:

```bash
sudo bash setup-mac-runner.sh <the token>
```

It creates the hidden user `runner`, with a group of its own rather than `staff`
(home folders are readable by `staff`) and no password, and runs the runner from
the LaunchDaemon `com.github.actions.runner.weave`: at boot, without anyone
logged in, so it works with FileVault on. After a restart FileVault still waits
for someone to unlock it (`sudo fdesetup authrestart` skips that once). Its log is
`/Users/runner/runner.log`.

## Upkeep

The runners update themselves. Check on them under the repository's Settings,
Actions, Runners, or:

```bash
gh api repos/martl-projects/Weave/actions/runners --jq '.runners[] | .name + " " + .status'
```
