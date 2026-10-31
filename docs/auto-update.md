# Auto-update: new versions install over the current one

The Weave desktop app updates itself like VS Code: a new version is downloaded in the background, and **Restart to update** installs it. Nobody runs an installer by hand. This page says how that works, what it checks, who releases what, and which builds don't update themselves.

## How it works

Weave updates itself the way it installs any project's app. The Weave project describes the desktop app as one of its artifacts (`weave.app.json` at the top of this repository: `weave-desktop`, a file per computer), and each release of it is a signed entry by a maintainer with the installers' SHA-256.

1. **Check.** The app asks its daemon shortly after starting and every six hours (`updateCheck`). The daemon looks at the release posts in the Weave project (signed by its maintainers: the notes) and at the project's artifact releases (signed by its maintainers: the files). A version counts as installable only with an artifact release that has a file for this computer (`win32-x64`, `linux-x64`, `darwin-arm64`, `darwin-x64`). A release post or a GitHub tag alone gives the notification with the download, as before.
2. **Download and check.** The daemon fetches the file like any release file (`updateFetch`, `packages/node/src/update.ts`): the project's GitHub releases service grants it a download address for that one file (the repository is private; the address works for a few minutes and is sealed to the asker), Weave's own fetcher gets it, and the daemon refuses the file unless its SHA-256 is the one in the maintainer's signed entry. A refused file is deleted and the app says so: *"the downloaded file isn't the one the project published (SHA-256 …, expected …): not installed"*. A checked file waits in `<home>/updates/<version>/`.
3. **Install.** The app's main process (`apps/desktop/src/update.ts`) hands the checked file to electron-updater, fed from the daemon's local API (`GET /v1/update/<version>/latest.yml` and the file, with the API's bearer token), so electron-updater never downloads from anywhere else. electron-updater checks the SHA-512 it is told and, in a signed build, the installer's publisher. Then the window shows *"Weave X is ready to install"* with **Restart to update**, **Later** (a day) and **Skip this version**. Nothing is installed on quit or behind the person's back: only the click installs.
4. **Restart.** The daemons of this installation stop properly first: the one the app started, and a release daemon someone started by hand with the installed `weave` command (it runs from the files about to be replaced; the installer would otherwise end every `Weave.exe` hard, skipping its close). A daemon running from the source is left alone. Then the installer runs and the new version starts; its `ensureDaemon` starts the new daemon, and replaces an old release daemon it still finds. Agents' `weave` commands and MCP servers from the installed app end with the install and start again on their next use.

So a GitHub account, a CDN or a swapped asset can't put a version on anyone's computer: the file has to match what a maintainer signed in Weave.

Tried on Windows (31.10.2026): a 0.23.0 build installed per user found a released 0.24.0, electron-updater took the checked file from the daemon's feed, Restart to update ran the setup silently, and the new version started with its own 0.24.0 daemon, the old one gone. Two things electron-updater needed that its documentation doesn't say: `requestHeaders` passed to `setFeedURL` aren't sent (the `autoUpdater.requestHeaders` property is), and it still reads `app-update.yml` for its cache folder and the publisher even with `setFeedURL`, so the app writes that file into its user data. The installer starts the new version without the old one's arguments or environment (`--home`, `WEAVE_HOME`), so a test on another home ends in the default home; people's installations run on the default home anyway.

## Per platform

| Build | Updates itself | Notes |
|---|---|---|
| Windows per-user installer (`.exe`, NSIS) | yes | The setup runs silently (`/S --updated`), per user, no UAC. Unsigned: no SmartScreen (a file our process wrote has no Mark-of-the-Web), and Weave's SHA-256 check is the only origin check, the same as for every project app. Signed (Azure Trusted Signing): electron-updater also verifies the publisher, and a signed app refuses an unsigned update. |
| Windows MSI (per machine) | no | IT rolls out versions (`msiexec /i … /qn`). Recognized at runtime: the MSI leaves no `Uninstall Weave.exe` next to `Weave.exe`. |
| Microsoft Store | no | The Store updates it (`process.windowsStore`). There is no Store build yet; the gate is there for it. |
| Linux AppImage | yes | electron-updater replaces the file at `$APPIMAGE` and relaunches. |
| macOS (`.dmg`, `.zip`) | once signed | Each release has the app as a `.zip` for Squirrel.Mac, but Squirrel refuses an app that isn't signed with a Developer ID, so self-update stays off until the Mac build is signed (`resources/update.json`, written by `package.ts`). Until then the prompt offers the download. |
| macOS `.pkg` | once signed | The same app bundle as the dmg: same rule. IT may also roll it out. |
| Development (from the source) | never | |

Managed settings: `Updates = 0/false` turns everything off, prompts and downloads (docs/managed-settings.md).

## The setting

Settings → **Updates…**: *Download new versions in the background, then offer a restart* (on by default; kept by the daemon in its config as `updates.auto`). Off: the app says when a new version is out, and **Download and install** gets it when asked. **Help → Check for updates…** asks now and says so even when nothing is newer.

## Releasing (maintainers)

1. `npm run release -- minor` and push the tag: the release workflow builds and attaches the installers (`.exe`, `.msi`, `.dmg`, `.pkg`, `.zip`, `.AppImage`).
2. Release it in the Weave project as its artifact, naming the one update file per computer:

   ```
   weave app release v0.24.0 -p Weave --asset win32-x64=Weave-0.24.0-win-x64.exe --asset linux-x64=Weave-0.24.0-linux-x64.AppImage --asset darwin-arm64=Weave-0.24.0-mac-arm64.zip --asset darwin-x64=Weave-0.24.0-mac-x64.zip
   ```

   (or `weave_app_release` with `assets`). The project's GitHub releases service downloads each file once, fingerprints it and publishes the signed entry.
3. Write the release post (title `Weave vX.Y.Z: …`, the notes, the GitHub link) as before. The app shows its notes next to the update.

Once, by a maintainer: add the **GitHub releases** service to the Weave project and hand it the repository from your GitHub keyvault (Keys & devices). Members need nothing: Weave's own fetcher gets Weave's updates without being added.

## Where things are

- `packages/node/src/update.ts`: fetching and keeping new versions, the feed electron-updater reads.
- `packages/node/src/node.ts`: `updateCheck`, `updateFetch`, `updateState`, `updateReady`, `updateSettings`.
- `packages/node/src/api.ts`: `GET /v1/update/<version>/…`.
- `apps/desktop/src/update.ts`, `updatestate.ts`: the main process's updater and `canSelfUpdate`; `renderer/update.tsx`: what the window shows.
- `apps/desktop/package.ts`: the Mac zip target and `resources/update.json`.
- `weave update` on the command line says what the app would do.

## Not yet

- **Headless nodes** (`weave update` that installs): a node nobody sits at needs to replace its own files and restart its service. The download and check are the daemon's already; the replacing isn't built.
- **The phone app**: an APK outside Play can't update itself silently; it can say a new version is there and open the download.
- **Channels** (stable and beta), **differential downloads**, and a **release key for CI** that publishes the artifact entry itself.
