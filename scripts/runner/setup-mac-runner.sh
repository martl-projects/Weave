#!/bin/bash
# Turns a Mac into the repository's self-hosted macOS runner (see
# docs/self-hosted-runners.md). Run on the Mac as root, with a registration token:
#
#   sudo bash setup-mac-runner.sh <registration token>
#
# Needs Xcode or its Command Line Tools (swiftc, codesign, notarytool). The runner
# runs as the hidden user runner, which has its own group rather than staff (so it
# can't read other people's home folders) and no password (nobody logs in as it),
# from a LaunchDaemon: it starts at boot, without anyone logged in, which also
# works with FileVault on. Node isn't installed: actions/setup-node fetches it.

set -euo pipefail
trap 'echo "failed at line $LINENO: $BASH_COMMAND"' ERR
# Somewhere every user can enter: the commands run as runner start from here.
cd /
TOKEN=${1:?registration token}
URL=${URL:-https://github.com/martldennl/Weave}
RUNNER_NAME=${RUNNER_NAME:-weave-runner-mac}
LABELS=${LABELS:-macos-mini}
LABEL=com.github.actions.runner.weave
[ "$(id -u)" = 0 ] || { echo 'run with sudo'; exit 1; }
xcrun --find swiftc >/dev/null && xcrun --find notarytool >/dev/null || { echo 'needs Xcode or its Command Line Tools'; exit 1; }

# The first free id at or above $1 among users (UniqueID) or groups (PrimaryGroupID).
free_id() {
  local id=$1
  while dscl . -search "$2" "$3" "$id" | grep -q .; do id=$((id + 1)); done
  echo "$id"
}

if ! dscl . -read /Groups/runner >/dev/null 2>&1; then
  gid=$(free_id 600 /Groups PrimaryGroupID)
  dscl . -create /Groups/runner
  dscl . -create /Groups/runner PrimaryGroupID "$gid"
  dscl . -create /Groups/runner RealName 'GitHub runner'
fi
gid=$(dscl . -read /Groups/runner PrimaryGroupID | awk '{print $2}')
if ! id runner >/dev/null 2>&1; then
  uid=$(free_id 600 /Users UniqueID)
  dscl . -create /Users/runner
  dscl . -create /Users/runner UniqueID "$uid"
  dscl . -create /Users/runner PrimaryGroupID "$gid"
  dscl . -create /Users/runner RealName 'GitHub runner'
  dscl . -create /Users/runner UserShell /bin/zsh
  dscl . -create /Users/runner NFSHomeDirectory /Users/runner
  dscl . -create /Users/runner Password '*'
  dscl . -create /Users/runner IsHidden 1
  createhomedir -c -u runner >/dev/null
fi
chown -R runner:runner /Users/runner
chmod 700 /Users/runner

echo 'GitHub runner'
dir=/Users/runner/actions-runner
url=$(curl -fsSL --show-error https://api.github.com/repos/actions/runner/releases/latest | grep -o '"browser_download_url": *"[^"]*actions-runner-osx-x64-[0-9.]*\.tar\.gz"' | grep -o 'https://[^"]*')
[ "$(uname -m)" = arm64 ] && url=${url/osx-x64/osx-arm64}
sudo -u runner mkdir -p "$dir"
curl -fsSL --show-error "$url" | sudo -u runner tar -xz -C "$dir"
sudo -u runner -H bash -c "cd '$dir' && ./config.sh --unattended --url '$URL' --token '$TOKEN' --name '$RUNNER_NAME' --labels '$LABELS' --replace"

# SessionCreate gives the jobs a security session, so codesign can use the
# keychain electron-builder makes for the certificates.
plist=/Library/LaunchDaemons/$LABEL.plist
cat > "$plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>UserName</key><string>runner</string>
  <key>GroupName</key><string>runner</string>
  <key>WorkingDirectory</key><string>$dir</string>
  <key>ProgramArguments</key><array><string>$dir/run.sh</string></array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key><string>/Users/runner</string>
    <key>PATH</key><string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>SessionCreate</key><true/>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/Users/runner/runner.log</string>
  <key>StandardErrorPath</key><string>/Users/runner/runner.log</string>
</dict>
</plist>
EOF
chown root:wheel "$plist"
chmod 644 "$plist"
launchctl bootout "system/$LABEL" 2>/dev/null || true
launchctl bootstrap system "$plist"

echo "Done: $RUNNER_NAME is registered with the label $LABELS and starts at boot."
