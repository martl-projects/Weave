import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { connectDaemon, type ApiClient, type Home } from '@weave/node/client';

/*
 * The desktop app never loads the node itself: it talks to a daemon over the
 * local API and starts one if none is running for this home. For now the
 * daemon runs on the system's Node.js from this repository; a packaged app
 * will run it with Electron's own Node instead.
 */

const CLI = join(__dirname, '..', '..', '..', 'packages', 'cli', 'src', 'main.ts');
const NODE = process.env.WEAVE_NODE ?? 'node';

export const hasIdentity = (home: Home): boolean => existsSync(home.identity);

export async function createIdentity(home: Home, name: string): Promise<void> {
  await promisify(execFile)(NODE, [CLI, '--home', home.dir, 'init', name]);
}

export interface RunningDaemon {
  client: ApiClient;
  /** Set when this app started the daemon, so it stops it on quit. */
  child?: ChildProcess;
}

export async function ensureDaemon(home: Home): Promise<RunningDaemon> {
  const existing = await connectDaemon(home);
  if (existing) return { client: existing };

  const child = spawn(NODE, [CLI, '--home', home.dir, 'daemon'], { stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true });
  const started = Date.now();
  while (Date.now() - started < 20_000) {
    if (child.exitCode !== null) throw new Error(`the Weave daemon exited (code ${child.exitCode})`);
    const client = await connectDaemon(home);
    if (client) return { client, child };
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  child.kill();
  throw new Error('the Weave daemon did not start within 20 seconds');
}
