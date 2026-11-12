#!/usr/bin/env bash
# Sets up or updates a storage node on Debian or Ubuntu, run as root from the unpacked release:
#
#   WEAVE_DOMAIN=web.martl.io bash setup.sh
#
# With the page from elsewhere (docs/web-stage2.md, step 10), the storage node has a name of its own and says where the
# page is; WEAVE_ALSO is a name it still answers to while DNS moves:
#
#   WEAVE_DOMAIN=storage.martl.io WEAVE_PAGE=https://web.martl.io WEAVE_ALSO=web.martl.io bash setup.sh
#
# Safe to run again: an update replaces the program and the page, and keeps /var/lib/weave-storage.
set -euo pipefail

NODE_MAJOR=24
here="$(cd "$(dirname "$0")" && pwd)"

if [ "$(id -u)" != 0 ]; then echo "run this as root" >&2; exit 1; fi

# The domain is asked once, and kept.
if [ -z "${WEAVE_DOMAIN:-}" ] && [ -f /etc/weave-storage.env ]; then . /etc/weave-storage.env; fi
if [ -z "${WEAVE_DOMAIN:-}" ]; then echo "say which domain: WEAVE_DOMAIN=web.example.org bash setup.sh" >&2; exit 1; fi

apt-get update -q
apt-get install -y -q curl ca-certificates gnupg xz-utils ufw debian-keyring debian-archive-keyring apt-transport-https

# Node: the official build, checked against the list of sums next to it.
if ! /usr/local/bin/node --version 2>/dev/null | grep -q "^v$NODE_MAJOR\."; then
  case "$(uname -m)" in x86_64) arch=x64 ;; aarch64) arch=arm64 ;; *) echo "no Node for $(uname -m)" >&2; exit 1 ;; esac
  tmp="$(mktemp -d)"
  base="https://nodejs.org/dist/latest-v$NODE_MAJOR.x"
  curl -fsSL "$base/SHASUMS256.txt" -o "$tmp/sums"
  file="$(grep "linux-$arch.tar.xz" "$tmp/sums" | awk '{print $2}')"
  curl -fsSL "$base/$file" -o "$tmp/$file"
  (cd "$tmp" && grep " $file\$" sums | sha256sum -c -)
  tar -xJf "$tmp/$file" -C /usr/local --strip-components=1
  rm -rf "$tmp"
fi

# Caddy, from its own repository.
if ! command -v caddy >/dev/null; then
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt -o /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q
  apt-get install -y -q caddy
fi

id weave-storage >/dev/null 2>&1 || useradd --system --home /var/lib/weave-storage --shell /usr/sbin/nologin weave-storage
install -d -o weave-storage -g weave-storage -m 700 /var/lib/weave-storage

# The program, its two native modules, the page.
install -d /opt/weave-storage
cp "$here/weave-storage.mjs" "$here/package.json" /opt/weave-storage/
(cd /opt/weave-storage && /usr/local/bin/npm install --omit=dev --no-audit --no-fund)
rm -rf /opt/weave-storage/web
cp -r "$here/web" /opt/weave-storage/web

# Where the page is: here, unless it comes from elsewhere. Kept like the domain.
WEAVE_PAGE="${WEAVE_PAGE:-https://$WEAVE_DOMAIN}"
WEAVE_ALSO="${WEAVE_ALSO:-}"
# The page from here, or from elsewhere: then nothing here is code a browser runs.
if [ "$WEAVE_PAGE" = "https://$WEAVE_DOMAIN" ]; then WEAVE_SERVE="--web /opt/weave-storage/web"; else WEAVE_SERVE=""; fi
# Websites' tabs (docs/web-stage2.md, step 9), which may use the relay to reach websites: like https://*.weave-rooms.net.
WEAVE_ROOMS="${WEAVE_ROOMS:-}"
if [ -n "$WEAVE_ROOMS" ]; then WEAVE_RELAY="--relay-origin $WEAVE_ROOMS"; else WEAVE_RELAY=""; fi
# Quoted: this file is read back by this script's shell, and systemd takes the quotes off.
printf 'WEAVE_DOMAIN="%s"\nWEAVE_PAGE="%s"\nWEAVE_ALSO="%s"\nWEAVE_SERVE="%s"\nWEAVE_ROOMS="%s"\nWEAVE_RELAY="%s"\nWEAVE_STORAGE_DIR=/var/lib/weave-storage\n' "$WEAVE_DOMAIN" "$WEAVE_PAGE" "$WEAVE_ALSO" "$WEAVE_SERVE" "$WEAVE_ROOMS" "$WEAVE_RELAY" > /etc/weave-storage.env
cp "$here/weave-storage.service" /etc/systemd/system/weave-storage.service
cp "$here/Caddyfile" /etc/caddy/Caddyfile
install -d /etc/systemd/system/caddy.service.d
printf '[Service]\nEnvironment=WEAVE_DOMAIN=%s\nEnvironment=WEAVE_ALSO=%s\n' "$WEAVE_DOMAIN" "$WEAVE_ALSO" > /etc/systemd/system/caddy.service.d/domain.conf

# `weave-storage-invite`: a link for one new account (`--accounts 20`: one link for 20). `weave-storage-invites`: what's left.
cat > /usr/local/bin/weave-storage-invite <<EOF
#!/bin/sh
exec runuser -u weave-storage -- env WEAVE_STORAGE_DIR=/var/lib/weave-storage /usr/local/bin/node /opt/weave-storage/weave-storage.mjs invite --origin $WEAVE_PAGE "\$@"
EOF
cat > /usr/local/bin/weave-storage-invites <<EOF
#!/bin/sh
exec runuser -u weave-storage -- env WEAVE_STORAGE_DIR=/var/lib/weave-storage /usr/local/bin/node /opt/weave-storage/weave-storage.mjs invites
EOF
chmod 755 /usr/local/bin/weave-storage-invite /usr/local/bin/weave-storage-invites

# `weave-storage-planner <did> [--off]`: who may make onboarding links here.
cat > /usr/local/bin/weave-storage-planner <<EOF
#!/bin/sh
exec runuser -u weave-storage -- env WEAVE_STORAGE_DIR=/var/lib/weave-storage /usr/local/bin/node /opt/weave-storage/weave-storage.mjs planner "\$@"
EOF
chmod 755 /usr/local/bin/weave-storage-planner

# A firewall: of TCP only SSH and the web come in. UDP stays open, since the DHT is UDP on ports a node picks as it
# starts: the storage node's own, and a Weave node's next to it (a front door), are found by being reachable.
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow proto udp from any >/dev/null
ufw --force enable >/dev/null

systemctl daemon-reload
systemctl enable --now weave-storage
systemctl restart weave-storage
systemctl restart caddy

# The node opens every account on the network before it answers: that can take half a minute.
for _ in $(seq 60); do curl -fsS http://127.0.0.1:8790/health >/dev/null 2>&1 && break; sleep 1; done
curl -fsS http://127.0.0.1:8790/health >/dev/null && echo "weave-storage is up: https://$WEAVE_DOMAIN/" || { echo "it didn't come up: journalctl -u weave-storage" >&2; exit 1; }
