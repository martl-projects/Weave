import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { connectDaemon, daemonInfo, lockHolder, stopDaemon, type ApiClient, type Home } from '@weave/node/client';

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

/**
 * Set up a company account (stage 13): `weave enroll` opens the company's
 * sign-in in the browser and waits for it; no words are shown. Resolves to who
 * it set up.
 */
export function enrollIdentity(home: Home, link: string): Promise<{ name?: string; company?: { name?: string } }> {
  return new Promise((resolve, reject) => {
    execFile(NODE, [CLI, '--home', home.dir, '--json', 'enroll', link], { timeout: 6 * 60_000, env: ENV }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr.split('\n').find((l) => l.startsWith('weave: '))?.slice(7) ?? error.message));
      else resolve(JSON.parse(stdout) as { name?: string; company?: { name?: string } });
    });
  });
}

/** Set this computer up as another device of an identity; the words go in on stdin, never on the command line. */
export function restoreIdentity(home: Home, words: string, backup?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // With a backup file the words and the file are enough (no network); a large file takes a while to open.
    const child = execFile(NODE, [CLI, '--home', home.dir, 'restore', ...(backup ? ['--backup', backup] : [])], { timeout: backup ? 15 * 60_000 : 60_000, env: ENV }, (error, _stdout, stderr) => {
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

/**
 * The daemon for this home: the one running, or a new one. A released app replaces a daemon another released app
 * left running with another version (after an update); everything else is left alone: a daemon started by hand,
 * and anything running from the source, so development is never interrupted.
 */
export async function ensureDaemon(home: Home, version: string): Promise<RunningDaemon> {
  const existing = await connectDaemon(home);
  if (existing) {
    const info = daemonInfo(home);
    const outdated = packaged && info?.build === 'release' && info.startedBy === 'app' && !!info.version && info.version !== version;
    if (!outdated) return { client: existing };
    console.log(`weave: replacing the daemon of Weave ${info!.version} with ${version}`);
    await stopDaemon(home, { force: true });
  }

  const child = spawn(NODE, [CLI, '--home', home.dir, 'daemon'], { stdio: ['ignore', 'inherit', 'pipe'], windowsHide: true, env: { ...ENV, WEAVE_DAEMON_STARTED_BY: 'app' } });
  // Passed on as before, and the last "weave: …" line kept: it says why a daemon that exits didn't start.
  let reason: string | undefined;
  child.stderr!.on('data', (chunk: Buffer) => {
    process.stderr.write(chunk);
    const line = String(chunk).split('\n').findLast((l) => l.startsWith('weave: '));
    if (line) reason = line.slice(7).trim();
  });
  const started = Date.now();
  while (Date.now() - started < 20_000) {
    if (child.exitCode !== null) {
      await new Promise((resolve) => setTimeout(resolve, 100)); // the last of its output
      throw new Error(reason ?? `the Weave daemon exited (code ${child.exitCode})`);
    }
    const client = await connectDaemon(home);
    if (client) return { client, child };
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  child.kill();
  throw new Error('the Weave daemon did not start within 20 seconds');
}

/**
 * Start this home's daemon again, also when the one holding the home doesn't answer: asked to stop if it answers,
 * otherwise ended, but only a process that is Weave's (lockHolder checks its command line). A lock left by another
 * program's pid isn't in the way: the new daemon takes it over.
 */
export async function restartDaemon(home: Home, version: string): Promise<RunningDaemon> {
  await stopDaemon(home, { force: true });
  const pid = lockHolder(home);
  if (pid && pid !== process.pid) {
    try {
      process.kill(pid);
    } catch {}
    const until = Date.now() + 10_000;
    while (lockHolder(home) === pid && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return ensureDaemon(home, version);
}

/**
 * Stop the daemon this app started, properly: it closes the node (unpublished keys, the database) before it exits.
 * On Windows ending a process from outside skips all of that, so it's only the fallback.
 */
export async function stopOwnDaemon(daemon: RunningDaemon): Promise<void> {
  const child = daemon.child;
  if (!child || child.exitCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  try {
    await daemon.client.stop();
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 10_000))]);
  } catch {
    // An older daemon, or not answering: end it.
  }
  if (child.exitCode === null) child.kill();
}
