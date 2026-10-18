import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { resolveHome, type Backend } from '@weave/node/client';
import { createIdentity, ensureDaemon, hasIdentity, type RunningDaemon } from './daemon.ts';
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
  if (!hasIdentity(home)) await createIdentity(home, name);
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
