# Weave Web on a server

One server holds the page and the storage node. That carries the time of invitations; docs/web-stage2.md says what comes after.

## What it needs

- A server with Debian 12 or 13, or Ubuntu 24.04, and a public IPv4 address. 4 vCPU and 8 GB are plenty to start, and more disk matters before more CPU: an account may use 512 MB.
- A DNS record: `web.martl.io`, type A, to the server's address. Passkeys hang on this name, so it should stay: moving the page to another name loses every passkey made for it (the recovery words still work).
- Automatic backups of the server switched on. `/var/lib/weave-storage` is what they're for.

## Setting it up

On a computer with this repository:

```bash
node apps/server/deploy/pack.ts
```

```bash
scp apps/server/dist/weave-storage-*.tar.gz root@SERVER:/root/
```

On the server:

```bash
cd /root && tar -xzf weave-storage-*.tar.gz && cd weave-storage-*/ && WEAVE_DOMAIN=web.martl.io bash setup.sh
```

The firewall setup.sh turns on lets in SSH and the web over TCP, and UDP, which the DHT needs on ports chosen at start. So a Weave node on the same server, such as a front door, stays reachable. The storage node itself listens on 127.0.0.1, behind Caddy.

Then `https://web.martl.io/health` says `ok`. The DNS record has to point at the server first, or Caddy gets no certificate.

## Inviting someone

```bash
weave-storage-invite
```

prints a link for one new account, once. Only its hash is kept.

```bash
weave-storage-invite --accounts 20
```

prints one link for 20 new accounts, to share. Whoever has it gets in until 20 have, so it's worth no more than whom it's given to.

```bash
weave-storage-invites
```

shows the invitations not used up: how many for one account, and how many accounts each shared one has left.

## Updating

The same three steps: `setup.sh` replaces the program and the page and keeps the accounts. The domain is remembered.

## Looking at it

```bash
journalctl -u weave-storage -f
```

```bash
du -sh /var/lib/weave-storage/accounts/*
```

## What's on the server

`/var/lib/weave-storage` holds per account a folder with sealed events, sealed blobs and the sealed boxes, and `invites.json`. There's no key to any of it on the server: a stolen disk shows who has which spaces and when they wrote, not what. Deleting an account deletes its folder.

What a browser runs is what this server sends, so whoever controls the server could send other code. Log-ins to it are worth as much as everyone's keys: SSH keys only, and few people.
