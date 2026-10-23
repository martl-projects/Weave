import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, nativeTheme, shell, Tray } from 'electron';
import { machinePolicy, resolveHome, type Backend } from '@weave/node/client';
import { hasCommand, macMenu } from './command.ts';
import { createIdentity, enrollIdentity, ensureDaemon, hasIdentity, restoreIdentity, stopOwnDaemon, type RunningDaemon } from './daemon.ts';
import { RENDERER_METHODS, type RendererMethod } from './methods.ts';

// --home <dir>         Weave home to open (default: $WEAVE_HOME or ~/.weave)
// --route <hash>       start on a view, e.g. "#/groups"
// --screenshot <file>  render, save a PNG of the window and quit (for checks)
// weave:post:…         open at that post (how the OS hands over a clicked link)
// weave:project:…      open that project (also weave:group:…, weave:community:…)
const { values } = parseArgs({
  args: process.argv.slice(app.isPackaged ? 1 : 2),
  strict: false,
  options: { home: { type: 'string' }, route: { type: 'string' }, screenshot: { type: 'string' } },
});
// Relative paths are relative to where `npm run` was called, not to apps/desktop.
const homeArg = values.home as string | undefined;
const home = resolveHome(homeArg && resolve(process.env.INIT_CWD ?? process.cwd(), homeArg));

let daemon: RunningDaemon | undefined;
let window: BrowserWindow | undefined;
let watching = new AbortController();
let quitting = false;

// weave:post:… and weave:project:… (group, community) links: the OS starts the app with one (registered by the installer,
// see `protocols` in package.ts), or hands it to the app that's already open. A company's enrollment link
// (weave:enroll:…, clicked in its invitation) is longer: it carries the company and its sign-in.
const LINK = /^weave:[a-z]+:[A-Za-z0-9_-]{1,6000}$/;
const linkIn = (argv: string[]) => argv.find((arg) => LINK.test(arg));
let pendingLink = linkIn(process.argv);
let loaded = false;

function openLink(link: string): void {
  pendingLink = link;
  if (!window || !loaded) return; // sent once the window has loaded
  pendingLink = undefined;
  showWindow();
  window.webContents.send('weave:link', link);
}

// One window for your own Weave home, so a clicked link reaches it. Windows on
// other homes (--home, for testing with several people) stay separate.
const primary = homeArg || process.env.WEAVE_HOME || values.screenshot ? true : app.requestSingleInstanceLock();
if (!primary) app.quit();
app.on('second-instance', (_event, argv) => {
  const link = linkIn(argv);
  if (link) openLink(link);
  else showWindow();
});
// macOS hands links over as an event, also before the app is ready.
app.on('open-url', (event, url) => {
  event.preventDefault();
  if (LINK.test(url)) openLink(url);
});

async function connect(): Promise<void> {
  watching.abort();
  watching = new AbortController();
  const signal = watching.signal;
  daemon = await ensureDaemon(home, app.getVersion());
  daemon.client
    .watch((item) => window?.webContents.send('weave:event', item), signal)
    .catch((error: Error) => console.error('weave: event stream ended:', error.message))
    .finally(() => {
      // The daemon went away (restarted, crashed): find or start it again, and tell the window to refresh.
      if (signal.aborted || quitting) return;
      setTimeout(() => void connect().then(() => window?.webContents.send('weave:event', null), () => {}), 1000);
    });
}

/** The daemon can't be reached: it was restarted on another port, or stopped. */
const unreachable = (error: unknown) => /ECONNREFUSED|ECONNRESET|socket hang up/.test(String((error as Error)?.message ?? error) + String((error as { code?: string })?.code ?? ''));

ipcMain.handle('weave:state', () => {
  // A company's device management may name its enrollment link, or allow only company accounts here.
  const managed = machinePolicy();
  return { home: home.dir, hasIdentity: hasIdentity(home), connected: daemon !== undefined, ...(managed.enroll ? { enrollLink: managed.enroll } : {}), ...(managed.companyOnly ? { companyOnly: true } : {}) };
});

ipcMain.handle('weave:enroll', async (_event, link: string) => {
  if (hasIdentity(home)) throw new Error('this computer already has an identity');
  const who = await enrollIdentity(home, link);
  if (!daemon) await connect();
  return who;
});

ipcMain.handle('weave:init', async (_event, name: string) => {
  const words = hasIdentity(home) ? undefined : await createIdentity(home, name);
  if (!daemon) await connect();
  return words;
});

ipcMain.handle('weave:restore', async (_event, words: string) => {
  if (hasIdentity(home)) throw new Error('this computer already has an identity');
  await restoreIdentity(home, words);
  if (!daemon) await connect();
});

ipcMain.handle('weave:call', async (_event, method: RendererMethod, args: unknown[]) => {
  if (!RENDERER_METHODS.includes(method)) throw new Error(`not allowed: ${method}`);
  if (!daemon) throw new Error('not connected to a Weave daemon');
  const run = () => (daemon!.client[method] as (...a: unknown[]) => Promise<unknown>).apply(daemon!.client, args) as ReturnType<Backend[RendererMethod]>;
  try {
    return await run();
  } catch (error) {
    if (!unreachable(error)) throw error;
    await connect();
    return run();
  }
});

/** Bring the window back (from the tray, minimized or behind others): a notification was clicked. */
function showWindow(): void {
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

ipcMain.handle('weave:show', () => showWindow());

/** The buttons of the app's own title bar. Close hides to the tray like the system's close would. */
ipcMain.handle('weave:window', (_event, action: string) => {
  if (!window) return;
  if (action === 'minimize') window.minimize();
  else if (action === 'maximize') window.isMaximized() ? window.unmaximize() : window.maximize();
  else if (action === 'close') window.close();
  return { maximized: window.isMaximized(), focused: window.isFocused() };
});

/** Something needs the person: flash the taskbar button until they look, unless they already are. */
ipcMain.handle('weave:attention', () => {
  if (window && !window.isFocused()) window.flashFrame(true);
});

// Notifications on Windows carry the app's name only with an app user model id.
if (process.platform === 'win32') app.setAppUserModelId('org.weave.desktop');

let tray: Tray | undefined;

/** A tray icon, so closing the window keeps Weave running (and notifying) in the background. */
function createTray(): void {
  const icon = nativeImage.createFromPath(join(__dirname, 'icon.png'));
  if (icon.isEmpty()) return; // no icon, no tray: closing the window quits as before
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('Weave');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Weave', click: showWindow },
      { type: 'separator' },
      { label: 'Quit Weave', click: () => app.quit() },
    ]),
  );
  tray.on('click', showWindow);
}

/** A folder on this computer, picked by the person (for a project app's local copy). */
ipcMain.handle('weave:pick-folder', async (_event, title: string) => {
  const options = { title: String(title ?? 'Choose a folder').slice(0, 80), properties: ['openDirectory' as const] };
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
  return result.canceled ? undefined : result.filePaths[0];
});

/** Only the apps rooms share: the host's own port, or a room tunnel on this computer. */
const APP_ADDRESS = /^http:\/\/(localhost|[a-z0-9-]+\.weave\.localhost):\d+\//;

/** A shared app in its own window: no address bar, its own storage, and a question before it uses the microphone or camera. */
ipcMain.handle('weave:open-app', (_event, url: string, title: string) => {
  if (typeof url !== 'string' || !APP_ADDRESS.test(url)) throw new Error('not an app address');
  const name = String(title ?? 'App').slice(0, 80);
  const appWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    title: name,
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, partition: `persist:app-${new URL(url).hostname}` },
  });
  const session = appWindow.webContents.session;
  session.setPermissionRequestHandler((_contents, permission, callback) => {
    if (permission !== 'media') return callback(false);
    void dialog
      .showMessageBox(appWindow, { type: 'question', buttons: ['Allow', 'Deny'], defaultId: 0, cancelId: 1, message: `${name} wants to use your microphone or camera.` })
      .then(({ response }) => callback(response === 0));
  });
  appWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:\/\//.test(target)) void shell.openExternal(target);
    return { action: 'deny' };
  });
  appWindow.on('page-title-updated', (event) => event.preventDefault()); // keep "App · Room" as the title
  // Electron shows a blank page when a load fails (the host's app stopped, the tunnel dropped): say so, and retry.
  appWindow.webContents.on('did-fail-load', (_event, code, description, failedUrl, isMainFrame) => {
    if (!isMainFrame || code === -3 || !APP_ADDRESS.test(failedUrl)) return; // -3: a load that was replaced
    void appWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(appErrorPage(name, failedUrl, description))}`);
  });
  void appWindow.loadURL(url);
});

/** What an app window shows when its app can't be reached; it tries again by itself every few seconds. */
function appErrorPage(name: string, url: string, reason: string): string {
  const html = (text: string) => text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<!doctype html><meta charset="utf-8"><title>${html(name)}</title>
<style>body{font:15px system-ui,sans-serif;background:#0d0e12;color:#e6e6e6;display:grid;place-items:center;height:100vh;margin:0;text-align:center}
p{max-width:28em;line-height:1.5}small{color:#8a8f98}button{font:inherit;padding:.5em 1.4em;margin-top:.5em;cursor:pointer}</style>
<div><h2>Can't reach ${html(name)}</h2>
<p>The app may not be running on the host's computer yet, or the connection to the host dropped. Weave tries again every few seconds.</p>
<button id="retry">Try again</button><p><small>${html(reason)}</small></p></div>
<script>const go=()=>location.replace(${JSON.stringify(url).replace(/</g, '\\u003c')});document.getElementById('retry').onclick=go;setTimeout(go,4000);</script>`;
}

async function createWindow(): Promise<void> {
  window = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 760,
    minHeight: 520,
    // The Clean look's canvas, light or dark like the system, so the window doesn't flash while it loads.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0c111d' : '#f4f5f7',
    title: 'Weave',
    show: !values.screenshot,
    autoHideMenuBar: true,
    // The app draws its own title bar (with working buttons); macOS keeps its traffic lights over it.
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hidden' as const, trafficLightPosition: { x: 10, y: 8 } } : { frame: false }),
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  window.on('focus', () => window?.flashFrame(false));
  // The title bar shows Maximize or Restore, and dims when the window isn't active.
  const state = () => window?.webContents.send('weave:window-state', { maximized: !!window?.isMaximized(), focused: !!window?.isFocused() });
  for (const change of ['maximize', 'unmaximize', 'focus', 'blur', 'enter-full-screen', 'leave-full-screen'] as const) window.on(change as 'maximize', state);
  // With a tray icon, closing only hides the window: Weave keeps running and notifying. Quit from the tray.
  window.on('close', (event) => {
    if (tray && !quitting) {
      event.preventDefault();
      window?.hide();
    }
  });
  if (!values.screenshot) createTray();
  // Links in messages open in the system browser, never inside the app; Weave links open here.
  const external = (url: string) => (LINK.test(url) ? openLink(url) : /^https?:\/\//.test(url) && void shell.openExternal(url));
  window.webContents.setWindowOpenHandler(({ url }) => {
    external(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file:')) {
      event.preventDefault();
      external(url);
    }
  });
  window.webContents.on('did-finish-load', () => {
    loaded = true;
    if (pendingLink) openLink(pendingLink);
  });
  await window.loadFile(join(__dirname, 'renderer', 'index.html'), { hash: ((values.route as string | undefined) ?? '').replace(/^#/, '') });

  if (values.screenshot) {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const image = await window.webContents.capturePage();
    writeFileSync(values.screenshot as string, image.toPNG());
    app.quit();
  }
}

app.whenReady().then(async () => {
  if (!primary) return;
  // macOS: the app menu offers to install the `weave` command (Windows' installer puts it on the PATH).
  if (process.platform === 'darwin' && hasCommand()) Menu.setApplicationMenu(Menu.buildFromTemplate(macMenu()));
  // The installer registers the installed app; a development build leaves the link handler alone.
  if (app.isPackaged && !app.isDefaultProtocolClient('weave')) app.setAsDefaultProtocolClient('weave');
  if (hasIdentity(home)) {
    try {
      await connect();
    } catch (error) {
      console.error('weave:', (error as Error).message);
    }
  }
  await createWindow();
});

app.on('window-all-closed', () => app.quit());

// Quitting (tray, menu, OS shutdown) closes the window for real.
app.on('before-quit', () => {
  quitting = true;
});

// The daemon this app started stops properly first (closing the node), then the app quits for real.
let daemonStopped = false;
app.on('will-quit', (event) => {
  quitting = true;
  watching.abort();
  if (daemonStopped || !daemon?.child || daemon.child.exitCode !== null) return;
  event.preventDefault();
  daemonStopped = true;
  void stopOwnDaemon(daemon).finally(() => app.quit());
});
