#!/bin/bash
# Turns a fresh Ubuntu WSL distro into the repository's self-hosted Linux runner
# (see docs/self-hosted-runners.md). new-wsl-runner.ps1 runs it as root with the
# registration token:
#
#   bash setup-wsl-runner.sh <registration token>
#
# The runner runs as the user runner, without sudo, and the distro can't see the
# Windows drives or start Windows programs, so jobs stay away from the host's
# files and keys. Node isn't installed: actions/setup-node fetches it.

set -euo pipefail
TOKEN=${1:?registration token}
URL=${URL:-https://github.com/martl-projects/Weave}
RUNNER_NAME=${RUNNER_NAME:-weave-runner-wsl}  # not NAME: WSL sets that to the computer name
LABELS=${LABELS:-linux-wsl}
export DEBIAN_FRONTEND=noninteractive

echo 'Packages'
apt-get update -q
# build-essential and python3 for native modules without a prebuilt binary; gh for the release job.
apt-get install -yq git curl ca-certificates tar gzip unzip xz-utils jq build-essential python3
# Rootless Podman for the server image: builds without Docker, whose group would give jobs root
# (runner's subordinate ids come from useradd).
apt-get install -yq --no-install-recommends podman uidmap slirp4netns passt fuse-overlayfs
install -d -m 755 /etc/apt/keyrings
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /etc/apt/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list
apt-get update -q
apt-get install -yq gh

id runner >/dev/null 2>&1 || useradd -m -s /bin/bash runner

echo 'GitHub runner'
dir=/home/runner/actions-runner
url=$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest | jq -r '.assets[] | select(.name | test("^actions-runner-linux-x64-[0-9.]+\\.tar\\.gz$")) | .browser_download_url')
mkdir -p "$dir"
curl -fsSL "$url" | tar -xz -C "$dir"
"$dir/bin/installdependencies.sh"
chown -R runner:runner "$dir"
su runner -c "cd '$dir' && ./config.sh --unattended --url '$URL' --token '$TOKEN' --name '$RUNNER_NAME' --labels '$LABELS' --replace"

# The runner starts through this (new-wsl-runner.ps1's task). /mnt/wsl is shared by
# every distro, and Docker Desktop's bind mounts from other distros show up there,
# writable by uid 1000 (runner here): detach it in this distro only, made private
# first so the unmount doesn't reach the others.
cat > /usr/local/bin/weave-runner-start <<'EOF'
#!/bin/bash
if mountpoint -q /mnt/wsl; then mount --make-rprivate /mnt/wsl && umount -l /mnt/wsl; fi
exec su - runner -c 'cd ~/actions-runner && exec ./run.sh'
EOF
chmod 755 /usr/local/bin/weave-runner-start

# Applies the next time the distro starts.
cat > /etc/wsl.conf <<'EOF'
[automount]
enabled = false
mountFsTab = false

[interop]
enabled = false
appendWindowsPath = false

[network]
generateResolvConf = false

[user]
default = runner
EOF

# WSL would link /etc/resolv.conf into /mnt/wsl, again with every new session:
# a file of its own, with WSL's DNS (10.255.255.254, DNS tunneling).
echo 'nameserver 10.255.255.254' > /etc/resolv.conf.new
mv -f /etc/resolv.conf.new /etc/resolv.conf

echo "Done: $RUNNER_NAME is registered with the label $LABELS."
