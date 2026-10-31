import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { app } from 'electron';
import { autoUpdater, type UpdateDownloadedEvent } from 'electron-updater';
import { daemonInfo, machinePolicy, stopDaemon, type ApiClient, type Home, type UpdateInfo, type UpdateReady } from '@weave/node/client';
import { canSelfUpdate, type UpdateAction, type UpdateFacts, type UpdateView } from './updatestate.ts';

/*
 * New versions, like VS Code: downloaded in the background, installed when the person clicks Restart to update.
 *
 * The daemon does the getting and the checking (packages/node/src/update.ts): a maintainer of the Weave project
 * released the version as the project's artifact, with each installer's SHA-256 in the signed entry, and the daemon
 * fetches the one for this computer like any release file and refuses it unless it matches. This process only
 * installs: electron-updater, fed from the daemon's local API (GET /v1/update/<version>/latest.yml and the file), so
 * it never downloads from anywhere else. Signed builds also have electron-updater check the installer's publisher.
 *
 * Who doesn't: development builds, managed Updates=false, the Microsoft Store build, the MSI (installed per machine),
 * and macOS until the app is signed with a Developer ID (see canSelfUpdate). Those get today's prompt with the download.
 */

const FIRST = 5000;
const EVERY = 6 * 3600_000;

/** What package.ts writes next to the app: whether this build is signed, and by whom (for electron-updater's check). */
function buildInfo(): { signed?: boolean; publisher?: string } {
  try {
    return JSON.parse(readFileSync(join(process.resourcesPath ?? '', 'update.json'), 'utf8')) as { signed?: boolean; publisher?: string };
  } catch {
    return {};
  }
}

export function updateFacts(): UpdateFacts {
  const build = buildInfo();
  return {
    packaged: app.isPackaged,
    platform: process.platform,
    windowsStore: !!process.windowsStore,
    // electron-builder's per-user installer leaves "Uninstall <product>.exe" next to the app; the MSI leaves none.
    perUserInstaller: process.platform === 'win32' && existsSync(join(dirname(process.execPath), `Uninstall ${app.getName()}.exe`)),
    appImage: !!process.env.APPIMAGE,
    signed: !!build.signed,
    managedOff: machinePolicy().updates === false,
  };
}

export class Updater {
  view: UpdateView = { state: 'idle', current: app.getVersion() };
  #timer?: NodeJS.Timeout;
  #polling?: NodeJS.Timeout;
  #installing = false;
  readonly #home: Home;
  readonly #client: () => ApiClient | undefined;
  readonly #changed: (view: UpdateView) => void;
  /** Stops the daemon this app started, properly. */
  readonly #stopOwn: () => Promise<void>;

  constructor(home: Home, client: () => ApiClient | undefined, stopOwn: () => Promise<void>, changed: (view: UpdateView) => void) {
    this.#home = home;
    this.#client = client;
    this.#stopOwn = stopOwn;
    this.#changed = changed;
    autoUpdater.autoDownload = true;
    // Only on Restart to update, never behind the person's back on quit.
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowDowngrade = false;
    autoUpdater.logger = { info: (m) => console.log('weave: update:', m), warn: (m) => console.warn('weave: update:', m), error: (m) => console.error('weave: update:', m), debug: () => {} };
    autoUpdater.on('update-downloaded', (event: UpdateDownloadedEvent) => this.#set({ ...this.view, state: 'ready', version: event.version }));
    // The daemon's feed names a version electron-updater doesn't take (not newer than this one): say so instead of waiting.
    autoUpdater.on('update-not-available', () => this.#set({ ...this.view, state: 'failed', error: `electron-updater doesn't take Weave ${this.view.version ?? ''} over ${app.getVersion()}` }));
    autoUpdater.on('error', (error: Error) => this.#set({ ...this.view, state: 'failed', error: error.message }));
  }

  /** Check shortly after the start and every few hours. */
  start(): void {
    this.stop();
    this.#timer = setTimeout(() => {
      void this.check(false);
      this.#timer = setInterval(() => void this.check(false), EVERY);
    }, FIRST);
  }

  stop(): void {
    if (this.#timer) clearTimeout(this.#timer);
    if (this.#polling) clearInterval(this.#polling);
    this.#timer = this.#polling = undefined;
  }

  /** What the window asks for. */
  async act(action: UpdateAction): Promise<void> {
    if (action === 'check') return this.check(true);
    if (action === 'download') return this.check(true, true);
    if (action === 'restart') return this.restart();
  }

  /** The setting: download new versions in the background (kept by the daemon, so a headless node reads it too). */
  async setAuto(on: boolean): Promise<void> {
    const client = this.#client();
    if (!client) throw new Error('not connected to a Weave daemon');
    await client.updateSettings({ auto: on });
    this.#set({ ...this.view, auto: on });
    if (on) void this.check(false);
  }

  /**
   * Ask the daemon whether there's a newer version; if this build may install it itself and the setting says so (or
   * the person asked for it), have the daemon get and check it, then hand it to electron-updater.
   */
  async check(asked: boolean, download = false): Promise<void> {
    if (this.#installing || this.view.state === 'downloading') return;
    const client = this.#client();
    if (!client) {
      if (asked) this.#set({ ...this.view, state: 'failed', error: 'not connected to a Weave daemon', asked });
      return;
    }
    const current = app.getVersion();
    let info: UpdateInfo;
    try {
      this.#set({ state: 'checking', current, auto: this.view.auto, asked });
      info = await client.updateCheck({ current });
    } catch (error) {
      this.#set({ state: 'failed', current, error: `Couldn't check for updates: ${(error as Error).message}`, asked });
      return;
    }
    const auto = info.auto !== false;
    if (!info.newer || !info.latest) return this.#set({ state: 'idle', current, auto, asked });
    const latest = info.latest;
    const may = canSelfUpdate(updateFacts());
    if (!may.ok) return this.#set({ state: 'available', current, latest, version: latest.version, why: may.why, auto, asked });
    if (!latest.install) return this.#set({ state: 'available', current, latest, version: latest.version, why: 'not-installed', auto, asked });
    // Already here, checked: install it (again after a restart of the app without updating, say).
    if (info.ready?.version === latest.version) return this.#install(info.ready, latest, current, auto, asked);
    if (!auto && !download) return this.#set({ state: 'available', current, latest, version: latest.version, self: true, auto, asked });
    try {
      const state = await client.updateFetch({ version: latest.version });
      if (state.state === 'ready' && state.ready) return this.#install(state.ready, latest, current, auto, asked);
      if (state.state === 'failed') return this.#set({ state: 'failed', current, latest, version: latest.version, error: state.error, auto, asked });
    } catch (error) {
      return this.#set({ state: 'failed', current, latest, version: latest.version, error: (error as Error).message, auto, asked });
    }
    this.#set({ state: 'downloading', current, latest, version: latest.version, done: 0, auto, asked });
    // The daemon downloads; this follows it until it's checked (ready) or refused (failed).
    if (this.#polling) clearInterval(this.#polling);
    this.#polling = setInterval(async () => {
      try {
        const state = await client.updateState();
        if (state.version !== latest.version) return;
        if (state.state === 'downloading') return this.#set({ ...this.view, state: 'downloading', done: state.done, total: state.total });
        clearInterval(this.#polling);
        this.#polling = undefined;
        if (state.state === 'ready' && state.ready) await this.#install(state.ready, latest, current, auto, asked);
        else if (state.state === 'failed') this.#set({ ...this.view, state: 'failed', error: state.error });
      } catch (error) {
        clearInterval(this.#polling);
        this.#polling = undefined;
        this.#set({ ...this.view, state: 'failed', error: (error as Error).message });
      }
    }, 1000);
  }

  /** The checked file is in the daemon's keeping: electron-updater takes it from there (its own copy, its own SHA-512 check), then waits for the restart. */
  async #install(ready: UpdateReady, latest: NonNullable<UpdateInfo['latest']>, current: string, auto: boolean, asked: boolean): Promise<void> {
    const daemon = daemonInfo(this.#home);
    if (!daemon) return this.#set({ state: 'failed', current, latest, version: ready.version, error: 'the Weave daemon is gone', auto, asked });
    const publisher = buildInfo().publisher;
    const config = {
      provider: 'generic' as const,
      url: `http://127.0.0.1:${daemon.port}/v1/update/${encodeURIComponent(ready.version)}/`,
      channel: 'latest',
      useMultipleRangeRequest: false,
      updaterCacheDirName: 'weave-updater',
      // A signed build takes only an installer by the same publisher (electron-updater checks the Authenticode signature).
      ...(publisher ? { publisherName: [publisher] } : {}),
    };
    // electron-builder would have written app-update.yml next to the app; electron-updater still reads it (for its cache
    // folder and the publisher) even with setFeedURL, so it's written here, with this daemon's address, as JSON (YAML takes it).
    const configFile = join(app.getPath('userData'), 'app-update.yml');
    writeFileSync(configFile, JSON.stringify(config));
    autoUpdater.updateConfigPath = configFile;
    autoUpdater.setFeedURL(config);
    // The daemon's API wants its bearer token; setFeedURL's own requestHeaders aren't applied, this property is.
    autoUpdater.requestHeaders = { authorization: `Bearer ${daemon.token}` };
    this.#set({ state: 'downloading', current, latest, version: ready.version, done: ready.size, total: ready.size, auto, asked });
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      this.#set({ ...this.view, state: 'failed', error: (error as Error).message });
    }
  }

  /**
   * Restart to update: the daemons of this installation stop properly first (the installer would end every Weave.exe
   * hard, skipping their close), then electron-updater runs the installer and starts the new version.
   */
  async restart(): Promise<void> {
    if (this.view.state !== 'ready' || this.#installing) return;
    this.#installing = true;
    this.stop();
    try {
      await this.#stopOwn();
      await stopReleaseDaemon(this.#home);
    } catch (error) {
      console.error('weave: update: stopping the daemon:', (error as Error).message);
    }
    autoUpdater.quitAndInstall(true, true);
  }

  #set(view: UpdateView): void {
    this.view = view;
    this.#changed(view);
  }
}

/**
 * A release daemon of this installation that this app didn't start (weave daemon, by hand): it runs from the files
 * about to be replaced, so it stops properly too; the new app starts the new version. One from the source (development)
 * is left alone.
 */
export async function stopReleaseDaemon(home: Home): Promise<void> {
  const info = daemonInfo(home);
  if (!info || info.build !== 'release') return;
  await stopDaemon(home, { force: true, timeoutMs: 15_000 });
}
