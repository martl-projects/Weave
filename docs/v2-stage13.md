# v2 stage 13: ready for a pilot

The gaps a company would hit setting Weave up (see the setup guide sent to Julian):

1. **Signing in in the app.** An employee had to fetch an ID token by hand, and again every hour.
2. **A server package.** The company's node ran from the repository.
3. **Azure Key Vault for the company's node.** The node had no way to get its Azure app's secret.

## 1. Signing in with a company account

- OpenID Connect's authorization code flow with PKCE, as native apps do it (RFC 8252). The company's sign-in opens in the system browser and comes back to a one-time address on this computer (`http://127.0.0.1:<port>/callback`).
- The company's sign-in (issuer, Weave's client id) is part of its settings and of every enrollment link, so a new account knows where to sign in.
- **Renewing:** the refresh token (`offline_access`) renews the ID token before it runs out. Before the company's vouching runs out (6 hours ahead), the account signs in to the company again. Nobody has to.
- **The app:**
  - The welcome screen gets **My company uses Weave…**: paste the enrollment link (or it comes from the managed settings), then **Sign in with your company**.
  - With "company accounts only", that's the only way.
  - Keys & devices shows the company account: who's signed in, until when, whether it renews, and **Sign in again**.
- **CLI:**
  - `weave enroll <link>` signs in through the browser; `--id-token` is still accepted.
  - `weave sso` signs in again.
  - `BROWSER` picks another program, or `none` to only print the address (headless).
- The daemon now reconciles every 5 minutes too, so renewing and the company's duties come due without new events.

## 2. Weave Server

`apps/server`: the company's node for a server or a container (see docs/weave-server.md).

- `weave-server init` asks the questions (or takes flags and settings) and sets the company up: identity, key service, sign-in, admins, admin console, SCIM. It prints the company's recovery words, the console's address, the SCIM token and an enrollment link.
- `weave-server run` runs it.
- `link`, `operator` and `status` talk to the running server.
- Its own home (`~/.weave-server`, `/data` in the container), never a person's `~/.weave`.
- **Built as one folder** (`apps/server/build.ts`): the bundled program, the console's files, a package.json for the two native modules, and a systemd unit.
- **Released:** as `weave-server-<version>.tgz`, and as the image `ghcr.io/<owner>/weave-server:<version>` (`apps/server/Dockerfile`, with a health check on `/healthz`).

## 3. Azure Key Vault for the company's node

`WEAVE_AZURE_CLIENT_SECRET` (or `WEAVE_AZURE_TOKEN`) next to `WEAVE_VAULT_TOKEN`.

## As built

- **Fixed:** enrollment overwrote the saved sign-in and lost its refresh token.
- **Tested:** enrolling through the browser against the OIDC stand-in (code flow with PKCE, nonce, refresh tokens, a clock it can move). The test checks that, an hour on, the account renews its token by itself and signs in to the company again.
- **Not tried here:** the Docker image. Docker Desktop wasn't running; the image is built from the same folder the release attaches, which was tried.
- **Run end to end on one computer** (`scripts/company-demo.ts`, with the stand-ins, a local network, the built Weave Server and the app in a browser):
  - `weave-server init`
  - the admin signs in to the console through the company's sign-in page and creates a group with a mapping
  - an employee enrolls from the link in the app, signing in in the browser
  - the company vouches for them and puts them in the mapped group by itself
- **Found and fixed in that run:**
  - **Closing a node lost a new key's company half** if it hadn't been published yet. After `init`, a restarted server couldn't read its own settings. Closing now waits for unpublished halves; a test closes right after creating the company.
  - **SCIM turned on before the first provisioning shut everyone out**, the first admin included. People the directory doesn't know yet now keep their sign-in's groups; deactivated and deleted people are still refused.
  - **The console's sign-in refusals** are pages now, not JSON.
  - **A company account's Keys & devices** spoke of recovery words it doesn't have. It now says the company holds them; rotating and replacing keys are hidden.
  - **Company spaces asked for friends as keepers.** They're kept by the company's own archive instead.
