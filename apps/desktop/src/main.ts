import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { resolveHome, type Backend } from '@weave/node/client';
import { createIdentity, ensureDaemon, hasIdentity, restoreIdentity, type RunningDaemon } from './daemon.ts';
import { RENDERER_METHODS, type RendererMethod } from './methods.ts';

// --home <dir>         Weave home to open (default: $WEAVE_HOME or ~/.weave)
// --route <hash>       start on a view, e.g. "#/groups"
// --screenshot <file>  render, save a PNG of the window and quit (for checks)
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

async function connect(): Promise<void> {
  watching.abort();
  watching = new AbortController();
  const signal = watching.signal;
  daemon = await ensureDaemon(home);
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

ipcMain.handle('weave:state', () => ({ home: home.dir, hasIdentity: hasIdentity(home), connected: daemon !== undefined }));

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
  void appWindow.loadURL(url);
});

async function createWindow(): Promise<void> {
  window = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 760,
    minHeight: 520,
    backgroundColor: '#0d0e12',
    title: 'Weave',
    show: !values.screenshot,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  // Links in messages open in the system browser, never inside the app.
  const external = (url: string) => /^https?:\/\//.test(url) && void shell.openExternal(url);
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
  await window.loadFile(join(__dirname, 'renderer', 'index.html'), { hash: ((values.route as string | undefined) ?? '').replace(/^#/, '') });

  if (values.screenshot) {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const image = await window.webContents.capturePage();
    writeFileSync(values.screenshot as string, image.toPNG());
    app.quit();
  }
}

app.whenReady().then(async () => {
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

app.on('will-quit', () => {
  quitting = true;
  watching.abort();
  daemon?.child?.kill();
});
