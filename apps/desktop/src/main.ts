import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { app, BrowserWindow, ipcMain } from 'electron';
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
const watching = new AbortController();

async function connect(): Promise<void> {
  daemon = await ensureDaemon(home);
  daemon.client
    .watch((item) => window?.webContents.send('weave:event', item), watching.signal)
    .catch((error: Error) => console.error('weave: event stream ended:', error.message));
}

ipcMain.handle('weave:state', () => ({ home: home.dir, hasIdentity: hasIdentity(home), connected: daemon !== undefined }));

ipcMain.handle('weave:init', async (_event, name: string) => {
  if (!hasIdentity(home)) await createIdentity(home, name);
  if (!daemon) await connect();
});

ipcMain.handle('weave:call', async (_event, method: RendererMethod, args: unknown[]) => {
  if (!RENDERER_METHODS.includes(method)) throw new Error(`not allowed: ${method}`);
  if (!daemon) throw new Error('not connected to a Weave daemon');
  const fn = daemon.client[method] as (...a: unknown[]) => Promise<unknown>;
  return fn.apply(daemon.client, args) as ReturnType<Backend[RendererMethod]>;
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
  // Links open in the system browser, never inside the app.
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
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
  watching.abort();
  daemon?.child?.kill();
});
