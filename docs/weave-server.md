# Weave Server

A company's own Weave node, for a server or a container: it owns the company's projects and groups, vouches for its people, carries out its admins' requests, and serves the admin console and SCIM. People use the normal Weave app.

## Get it

- **Container**: `ghcr.io/martldennl/weave-server:<version>` (or `:latest`). Its home is the `/data` volume.
- **Folder for Node 24**: `weave-server-<version>.tgz` from the release. Unpack, `npm install --omit=dev` inside, run `node weave-server.mjs`.
- **From the repository**: `node apps/server/build.ts` builds the same folder in `apps/server/dist`.

## Before you start

- **A key service** for the company's half of every key:
  - **HashiCorp Vault**: a transit key created with `derived=true`, JWT auth bound to your sign-in's issuer, and a role for employees (encrypt and decrypt on the key). The server signs in with a token: `WEAVE_VAULT_TOKEN`.
  - **Azure Key Vault**: an RSA key, and an Entra app for the server with wrap, unwrap and delete on it. The server signs in with that app's secret: `WEAVE_AZURE_CLIENT_SECRET`. Employees act as themselves: give their group "Key Vault Crypto User" on the key, and Weave's app registration the delegated permission Azure Key Vault → `user_impersonation` (with admin consent).
  - The server's own home key goes into the key service too, so a copied volume or backup opens nothing without it (`--home-key local` keeps it in the home instead).
- **The company's sign-in** (Entra ID, Okta, Google), with an app registration for Weave:
  - Its client id is the audience of your people's sign-ins.
  - Allow the redirect `http://127.0.0.1` (the Weave app signs in through the browser and comes back to this computer, any port).
  - Allow refresh tokens (`offline_access`).
  - Add the admin console's `<address>/callback` as a redirect too (or give the console its own registration).
- **HTTPS** in front (Caddy, nginx, a load balancer) for the console (port 7730) and SCIM (7720). Health check: `GET /healthz` on the console port. `apps/server/docker-compose.yml` does it with Caddy on one address (settings in `.env`, see `.env.example`).
- **A mail server**, for invitations by email (optional): `WEAVE_SMTP_URL` (`smtp://user:password@host:587`, or `smtps://…:465`) and `WEAVE_SMTP_FROM`.

## Set up once

```
docker run -it --rm -v weave:/data -e WEAVE_VAULT_TOKEN=… ghcr.io/martldennl/weave-server init
```

It asks for:
- the company's name
- the key service
- the sign-in's issuer and Weave's client id
- the admins' sign-in group
- the console's port and public address
- the SCIM port

It prints:
- **the company's own recovery words**: print them and lock them away, they are the company
- the console's address
- the SCIM token (shown once)
- an enrollment link

Without a terminal, give everything as flags or settings (`--name`, `--vault`, `--vault-key`, `--issuer`, `--client-id`, `--admins`, `--console-url`, … or `WEAVE_COMPANY`, `WEAVE_VAULT_ADDR`, `WEAVE_ISSUER`, `WEAVE_CLIENT_ID`, …) with `--no-input`.

## Run

```
docker run -d --name weave --restart unless-stopped -v weave:/data -e WEAVE_VAULT_TOKEN=… -p 7730:7730 -p 7720:7720 ghcr.io/martldennl/weave-server
docker exec weave node /app/weave-server.mjs operator    # a one-time link into the console, for the first admin
```

Without containers: `apps/server/weave-server.service` is a systemd unit. On Windows, run `node weave-server.mjs run` as a service (for example with NSSM). Keep it running: when it's off, nobody new is vouched for and admins' requests wait.

## Then

- In the console, an admin creates projects and groups, maps sign-in groups to them, and sets policy and retention.
- **More people in the console**: in Policy, name a sign-in group for auditors (they read everything, change nothing) and one for the helpdesk (they invite people and set up new computers).
- **Agents**: the company's people's agents act in its projects and groups only once approved (console → Agents).
- **User management**: point Entra's (or Okta's) provisioning at `https://<scim address>/scim/v2` with the token.
- **People**: an admin invites them by email from the console (or SCIM does, for everyone the user management adds). The email opens a page with **Open Weave**: Weave starts with the company's link filled in, and they sign in in the browser. Or they choose **My company uses Weave…** and paste an enrollment link (or IT sets it in the managed settings). That's all: no words to keep, and the sign-in renews by itself.
- **IT**: installers and managed settings in `docs/managed-settings.md`.

## Commands

- `weave-server init`: set the company up.
- `weave-server run`: the default.
- `weave-server link`: a new enrollment link.
- `weave-server operator`: a one-time console link.
- `weave-server status`.
- `weave-server backup <folder>`: a consistent copy, while it runs.
- `weave-server restore <folder> [--standby]`: set an empty home up from a backup.
- `weave-server promote`: a standby takes over.

## Backups and a standby

- **Back up** regularly: `weave-server backup /backups/weave-$(date +%F)` (in the container: `docker exec weave node /app/weave-server.mjs backup /data/backups/…`).
  - With the home key in the key service, a backup opens only with access to it.
  - Otherwise the result says what opens it. Keep it as safe as the server.
- **A standby** on a second machine: `weave-server restore <backup> --standby`, then `run`.
  - It follows the active server and writes nothing: it shares the server's device key, and two writers would fork the company's log.
- **If the active server is gone for good**: stop the standby, `weave-server promote`, start it again.
  - The old server must never run again as it was. Set it up anew as a standby from a backup of the new one.
