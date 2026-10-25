# v2 stage 14: the company server, done properly

What the stock-take of the business features found missing:

1. **Azure Key Vault** acted for employees with the server's identity.
2. **The server's own home key** sat next to its data.
3. **No backups**, and nothing to take over when the server is gone.
4. **Enrollment links** were copied by hand.

## 1. Azure Key Vault: everyone acts as themselves

- **Employees** unwrap their company halves with their own Entra sign-in (delegated access).
  - The app exchanges its refresh token for a Key Vault token (`https://vault.azure.net/user_impersonation`).
  - Key Vault checks the person: give a group the role "Key Vault Crypto User" on the key.
  - Key Vault's own log shows who opened what. Someone disabled in Entra can't renew, and is out within the 8-hour offline grace.
- **The company's server** uses its own Entra app (`WEAVE_AZURE_CLIENT_SECRET`), as before.
- **App registration:** add the API permission Azure Key Vault → `user_impersonation` (delegated) and grant admin consent.
- **Removed:** the client assertion with the ID token, which Key Vault doesn't take.

## 2. The server's home key in the company's key service

- `weave-server init` moves the server's home key into the company's key service: Vault Transit or Azure Key Vault, wrapped with its own context.
- **At every start**, the server unwraps it with its own credentials before opening anything. A copied volume or backup opens nothing without access to the key service.
- **Turning it off:** `--home-key local` (or `WEAVE_HOME_KEY=local`) keeps the key in the home's keystore instead.
- `weave status` and the app name this keystore "the company's key service".

## 3. Backups and a standby server

- **`weave-server backup <folder>`**, while it runs:
  - the home's files
  - a consistent copy of the database (SQLite `VACUUM INTO`)
  - The result says what opens it. With the home key in the key service, only access to it opens the backup. A file keystore travels with the backup. DPAPI and Keychain backups open only on this computer, as this user.
- **`weave-server restore <folder> [--standby]`** sets an empty home up from a backup.
- **A standby** follows the active server and writes nothing. It shares the active server's device key, so two writers would fork the company's log.
  - Writes are refused.
  - It has no duties: no vouching, no admin requests, no SCIM or console.
  - `run` says STANDBY.
- **`weave-server promote`** turns a standby into the active server. Only once the old one is gone for good. Promoting is refused while the server runs. The old server must never run again as it was; set it up anew as a standby.

## 4. Invitations

- **Clickable enrollment links.**
  - The app takes `weave:enroll:…` links from the OS. The link pattern now allows their length; they carry the company and its sign-in.
  - On the first start, a clicked link opens the company screen with the link filled in.
  - In an app that is already set up, a clicked link says this computer has an account already.
- **Invitations by email**, through the company's mail server:
  - **Mail server settings:**
    - `WEAVE_SMTP_URL`: `smtp://user:password@host:587` uses STARTTLS when offered; `smtps://…:465` uses TLS from the start.
    - `WEAVE_SMTP_FROM`: the sender address.
  - **The console:** "Invite by email" on the overview.
  - **CLI:** `weave company invite <email> [--days n]`.
  - **SCIM:** `weave company scim on --send-invites`; `weave-server init` turns it on when there's a mail server. Everyone the user management adds, active and with an email address, gets an invitation.
  - **The email:** a button to the console's public **join page** (`/join`). It says where to get Weave, has **Open Weave** (the `weave:enroll:` link), and the link to paste.
    - The link is in the URL fragment, so it never reaches a server log.
    - The page sends no referrer.
  - Each invitation is in the audit: who invited whom, the console admin or `scim`.
- **HTTPS in one go:** `apps/server/docker-compose.yml` with Caddy.
  - Caddy gets the certificate for `WEAVE_DOMAIN` and serves the console, the join page and SCIM (`/scim/v2`) on one address.
  - Settings go in `.env`; `apps/server/.env.example` lists them.

## Group names (nothing built)

- Entra puts group **IDs** in sign-in tokens, not names.
- Group names come with SCIM, and mappings can use IDs too.
- Beyond 200 groups, Entra leaves the groups out of the token altogether; only SCIM (or Graph) has them then.
- **Recommendation:** SCIM. The console should show names next to IDs.

## As built

- **Tested** against stand-ins:
  - **Azure:** delegated unwraps, logged under the person's own Entra object id. After disabling and the grace period, the person can't read.
  - **The server's home key** in Vault: a copy of the home doesn't open without the key service.
  - **Backup, standby and promote:** a standby follows the active server and refuses writes; it's promoted after the active one stops.
  - **Invitations:**
    - from the console, and through SCIM; an inactive user gets nothing
    - the email's sender, recipient, sign-in and text
    - the join page
    - the link in the email enrolls
  - The mail server is a stand-in SMTP server without TLS.
- **Not tried here:**
  - STARTTLS and smtps against a real mail server
  - the compose file and Caddy (Docker wasn't running)
  - a clicked `weave:enroll:` link in the installed app (the OS hands links only to an installed app)
  - real Entra and Key Vault
