# Weave for IT: installers, managed settings, device checks

How a company rolls Weave out to its computers with its device management (Intune, Jamf, Kandji, Group Policy). The company's own node, its policy and its admin console are in `weave company --help`.

## Installers

Each release has, besides the per-person installers:

- **Windows: `Weave-<version>-win-x64.msi`**, per machine. Silent: `msiexec /i Weave-<version>-win-x64.msi /qn`. (The per-person `.exe` also installs silently with `/S`.)
- **macOS: `Weave-<version>-mac-<arch>.pkg`**, into /Applications. Silent: `sudo installer -pkg Weave-<version>-mac-arm64.pkg -target /`.

The installers aren't code-signed yet; until they are, allow them in your device management's app policy.

## Managed settings

Weave reads these before anything the person sets:

| Setting | Meaning |
|---|---|
| `Enroll` | The company's enrollment link (`weave company link`). `weave enroll` then needs only the person's sign-in. |
| `CompanyOnly` | 1/true: only company accounts on this computer; no private identities are created or restored. |
| `Companies` | The ids (`did:key:…`) of the companies whose accounts may be set up here. Empty: any. |
| `DeviceCert`, `DeviceKey` | Paths to this computer's certificate from the company's device authority and its private key (PEM). |
| `Updates` | 0/false: no update prompts and no downloads; IT rolls out new versions. (The MSI never updates itself, whatever this says: see docs/auto-update.md.) |

Where they come from:

- **Windows**: `HKLM\SOFTWARE\Policies\Weave` (strings, `CompanyOnly`/`Updates` as DWORD, `Companies` as multi-string). Import `apps/desktop/policy/weave.admx` (with `en-US/weave.adml`) into Intune's settings catalog or the Group Policy central store. Or a file: `%ProgramData%\Weave\weave.policy.json`.
- **macOS**: a configuration profile for `org.weave.desktop` (example: `apps/desktop/policy/org.weave.desktop.mobileconfig`). Or a file: `/Library/Application Support/Weave/weave.policy.json`.
- **Linux**: `/etc/weave/weave.policy.json`.
- **Anywhere**: `WEAVE_POLICY=<file>`.

The file is JSON with the same names, e.g. `{"enroll": "weave:enroll:…", "companyOnly": true, "companies": ["did:key:…"], "updates": false}`.

The contacts and groups a new account starts with come from the company (`weave company start`); a machine-wide `weave.bundle.json` next to `weave.policy.json` replaces the app's own for accounts that aren't the company's.

## Device checks

Only company computers get in:

1. Issue each company computer a certificate from a device certificate authority (Intune: a SCEP or PKCS certificate profile; Jamf: a certificate payload) and export it with its key as PEM files the Weave app can read.
2. Name the files in the managed settings (`DeviceCert`, `DeviceKey`).
3. On the company's node: `weave company devices <your device CA certificate.pem>`.

From then on, a sign-in is vouched for only when it carries a certificate from that authority, valid now, and a signature by its key over the person and the sign-in. The company's attestation records which computer (certificate subject and serial), so the audit shows it.

## User management (SCIM)

On the company's node: `weave company scim on [port]` prints the endpoint and a bearer token. In Entra ID: Enterprise application → Provisioning → Automatic, tenant URL `https://<node>/scim/v2`, secret token = the bearer token. Okta and Google work the same way. Put the node behind HTTPS (a reverse proxy) when it's reachable from the internet.

- Deactivating or deleting someone there takes them out of every company space at once (and freezes a deleted company account).
- With SCIM on, the directory's groups decide mappings and admins, not the sign-in token's.

## Security tools

`weave company stream add splunk|sentinel|syslog|webhook …` sends the audit as it happens. `weave company export <space>` writes everything a company space holds for a legal search.
