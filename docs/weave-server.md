# Weave Server

A company's own Weave node, for a server or a container: it owns the company's projects and groups, vouches for its people, carries out its admins' requests, and serves the admin console and SCIM. People use the normal Weave app.

## Get it

- **Container**: `ghcr.io/martldennl/weave-server:<version>` (or `:latest`). Its home is the `/data` volume.
- **Folder for Node 24**: `weave-server-<version>.tgz` from the release. Unpack, `npm install --omit=dev` inside, run `node weave-server.mjs`.
- **From the repository**: `node apps/server/build.ts` builds the same folder in `apps/server/dist`.

## Before you start

- **A key service** for the company's half of every key:
  - **HashiCorp Vault**: a transit key created with `derived=true`, JWT auth bound to your sign-in's issuer, and a role for employees (encrypt and decrypt on the key). The server signs in with a token: `WEAVE_VAULT_TOKEN`.
  - **Azure Key Vault**: an RSA key, and an Entra app for the server with wrap, unwrap and delete on it. The server signs in with that app's secret: `WEAVE_AZURE_CLIENT_SECRET`.
- **The company's sign-in** (Entra ID, Okta, Google), with an app registration for Weave:
  - Its client id is the audience of your people's sign-ins.
  - Allow the redirect `http://127.0.0.1` (the Weave app signs in through the browser and comes back to this computer, any port).
  - Allow refresh tokens (`offline_access`).
  - Add the admin console's `<address>/callback` as a redirect too (or give the console its own registration).
- **HTTPS** in front (Caddy, nginx, a load balancer) for the console (port 7730) and SCIM (7720). Health check: `GET /healthz` on the console port.

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
- **User management**: point Entra's (or Okta's) provisioning at `https://<scim address>/scim/v2` with the token.
- **People**: they install Weave and choose **My company uses Weave…**, paste the enrollment link (or IT sets it in the managed settings) and sign in in the browser. That's all: no words to keep, and the sign-in renews by itself.
- **IT**: installers and managed settings in `docs/managed-settings.md`.

## Commands

- `weave-server init`: set the company up.
- `weave-server run`: the default.
- `weave-server link`: a new enrollment link.
- `weave-server operator`: a one-time console link.
- `weave-server status`.
