import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { connectDaemon, type ApiClient, type Home } from '@weave/node/client';

/*
 * The desktop app never loads the node itself: it talks to a daemon over the
 * local API and starts one if none is running for this home. From the
 * repository the daemon runs on the system's Node.js; a packaged app ships the
 * CLI as one bundled file (see package.ts) and runs it with Electron's own Node.
 */

const PACKAGED = join(process.resourcesPath ?? '', 'daemon', 'weave.mjs');
const packaged = existsSync(PACKAGED);
const CLI = packaged ? PACKAGED : join(__dirname, '..', '..', '..', 'packages', 'cli', 'src', 'main.ts');
const NODE = packaged ? process.execPath : (process.env.WEAVE_NODE ?? 'node');
const ENV = packaged ? { ...process.env, ELECTRON_RUN_AS_NODE: '1' } : process.env;

export const hasIdentity = (home: Home): boolean => existsSync(home.identity);

/** Create the identity; returns the 24 recovery words to show once. */
export async function createIdentity(home: Home, name: string): Promise<string> {
  const { stdout } = await promisify(execFile)(NODE, [CLI, '--home', home.dir, '--json', 'init', name], { env: ENV });
  return (JSON.parse(stdout) as { words: string }).words;
}

/** Set this computer up as another device of an identity; the words go in on stdin, never on the command line. */
export function restoreIdentity(home: Home, words: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = execFile(NODE, [CLI, '--home', home.dir, 'restore'], { timeout: 60_000, env: ENV }, (error, _stdout, stderr) => {
      if (error) reject(new Error(stderr.split('\n').find((l) => l.startsWith('weave: '))?.slice(7) ?? error.message));
      else resolve();
    });
    child.stdin?.end(words);
  });
}

export interface RunningDaemon {
  client: ApiClient;
  /** Set when this app started the daemon, so it stops it on quit. */
  child?: ChildProcess;
}

export async function ensureDaemon(home: Home): Promise<RunningDaemon> {
  const existing = await connectDaemon(home);
  if (existing) return { client: existing };

  const child = spawn(NODE, [CLI, '--home', home.dir, 'daemon'], { stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true, env: ENV });
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
