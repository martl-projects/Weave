# v2 stage 12: fitting into what companies run

Built on stages 10 and 11 (company accounts, policy, retention). From the stock-take on Julian's "Business Version": immediate offboarding through the company's user management (SCIM), device management (installers IT can push, managed settings, device checks), and the audit in the company's security tools.

## 1. SCIM: the company's user management talks to its node

- `weave company scim on [port]` on the company's node: a SCIM 2.0 endpoint (`/scim/v2`, Users and Groups) for Entra ID, Okta or Google to provision into, with a bearer token shown once. The directory is kept sealed on the company's node.
- **Matching**: a SCIM user is the person the company vouches for whose sign-in subject is its `externalId` or `userName`, or whose email is among its emails.
- **Immediately**, when the directory changes:
  - **deactivated** (`active: false`): the company stops vouching for them at once and removes them from every company space with a new key, instead of when their 24 hours run out;
  - **deleted**: the same, and a company-owned identity is frozen;
  - **groups**: with SCIM on, the directory's groups are the person's groups (no longer the sign-in token's, which leaves them out above 200 for Entra); a change is vouched for again right away, so mappings follow at once.
- New sign-ins of deactivated or unknown-to-SCIM users aren't vouched for.

## 2. Device checks: only the company's computers

- The company names its device certificate authority: `weave company devices <ca.pem>` (part of its settings).
- Device management puts a certificate from that authority on each company computer (Intune, Jamf: SCEP or PKCS), and names it in the managed settings (below).
- Signing in then carries the certificate and a signature by its key over the person and the sign-in token. The company vouches only when the certificate comes from its authority, is valid now, and signed. The attestation records the device (subject, serial), so the audit shows which computer.

## 3. Managed settings

Read from the machine, before anything the person sets:

- Windows: `HKLM\SOFTWARE\Policies\Weave` (an ADMX template comes with Weave for Intune and Group Policy), or `%ProgramData%\Weave\weave.policy.json`.
- macOS: the managed preferences of `org.weave.desktop` (a configuration profile), or `/Library/Application Support/Weave/weave.policy.json`.
- Linux: `/etc/weave/weave.policy.json`. Anywhere: `WEAVE_POLICY` names a file.

Settings:

- `enroll`: the company's enrollment link, so `weave enroll` needs only the sign-in.
- `companyOnly`: no private identities on this computer, only company accounts.
- `companies`: the companies whose accounts may be set up here.
- `deviceCert`, `deviceKey`: the device certificate and its key (PEM files).
- `updates: false`: no update prompts (IT rolls out versions).

## 4. Installers IT can push

Besides the per-user installer, an MSI for Windows (per machine, silent with `msiexec /i Weave.msi /qn`) and a PKG for macOS (`installer -pkg`), built by the release workflow.

## 5. The audit in the company's security tools

- `weave company stream add webhook|splunk|syslog|sentinel …`: the company's node sends every audit line of the company's spaces as it happens, with the space named, to:
  - a webhook (JSON),
  - Splunk's HTTP Event Collector,
  - syslog (RFC 5424, TCP),
  - Microsoft Sentinel through Azure Monitor's Logs Ingestion API (with an Entra app).
- Each line goes once per destination; what couldn't be sent is sent later. Secrets stay sealed on the company's node.
- **For legal searches**: `weave company export <space> [since] [until]` writes everything a company space holds as JSON lines, deleted and edited posts included (marked), for those who manage it.

## Also

- The company node's attestor and archive settings are read back from `config.json` (they were written but not read, so a restarted company node stopped vouching).

## Order of work

1. Config fix; SCIM directory, endpoint and effects; tests.
2. Device certificates in sign-in and attestation; tests with openssl-made certificates.
3. Managed settings; enforcement in creating, restoring and enrolling; ADMX and profile examples; installer targets.
4. Audit sinks with cursors; export; tests against local stand-ins.
5. CLI.

## 6. The admin console (added on the way)

A separate product, `apps/console`: a web app the company's node serves (`weave company console on [port] --client-id <app registration> [--url <public address>]`).

- Admins sign in with their company account (OpenID Connect, authorization code with PKCE, against the company's issuer). Only those in the admins group get in (by the directory's groups when SCIM is on).
- A one-time operator link lets the first admin in before sign-in is set up.
- Pages:
  - **Overview**: counts, the policy in effect, enrollment links, requests from admins in Weave.
  - **People**: who's vouched for, their groups and computer; recovery for a new computer; freezing.
  - **Spaces**: members, holds, new company spaces, sign-in group mappings.
  - **Policy**: company accounts, retention, admins, the device authority.
  - **Directory**: SCIM on and off, its users.
  - **Audit**: by space, names instead of keys; export for legal searches.
  - **Security tools**: the audit streams.
- Everything an admin does is carried out by the company's node and recorded as `weave.org.console {subject, email, action, …}`, so the audit shows who did it in the console.
- Changes need a header only the console sends; sessions are HttpOnly cookies for 8 hours.
- `node apps/console/dev.ts` runs a sample company with stand-ins for Vault and sign-in, for working on it.

## As built

- **Config fix:** a company node's `attestor`, `archive`, `scim` and `console` settings are now read back from `config.json`. Before, a restarted company node stopped vouching (since v0.9).
- **SCIM** covers what Entra, Okta and Google send:
  - Users and Groups
  - filters by equality
  - PATCH with paths, without paths and with `members[value eq "…"]`
  - `active` as a string ("False")

  Matching is by sign-in subject (externalId or userName) or email. People the directory doesn't know yet are left as they are, so turning SCIM on doesn't drop everyone before the first sync. Their new sign-ins aren't vouched for, though.
- **Offboarding:** someone the company stopped vouching for is removed at once, even within a newcomer's first hour.
- **Device checks:** RSA, EC and Ed25519 device keys. Checked by the company's node only (the attestor); a computer's certificate never leaves the sign-in box sealed to it.
- **Managed settings:** enforced when creating, restoring and enrolling identities, and for update prompts. The Windows registry is read with `reg query`, macOS managed preferences with `plutil`.
- **Installers:** the MSI builds here (WiX, downloaded by electron-builder). The PKG builds on the macOS runner.
- **Audit streams:** each sink remembers the lines it was sent (31 days), so lines arriving late are sent too and nothing goes twice. A sink that's down shows its problem and catches up.
- **CI:** the company tests got two minutes, since the shared runners timed out on stage 11's policy test.
- Tested against stand-ins:
  - Entra/OIDC with the code flow
  - Vault
  - SCIM calls shaped like Entra's
  - a webhook, Splunk HEC, Azure Monitor with an Entra token, and syslog
  - certificates made with openssl
