import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { createHash } from 'node:crypto';

/*
 * Starting a project's app on the host's computer, from the command in its
 * manifest (start.command), in the host's own copy of the app. Weave only does
 * this when the host has approved that exact command for that folder; the
 * approval is a fingerprint of both, so a changed manifest asks again.
 */

export interface AppRun {
  started: string;
  /** Set once the app has exited; `stopped` when it was stopped on request (its exit code means nothing then). */
  exit?: { code: number | null; time: string; stopped?: true };
  /** The app's last lines of output. */
  log: string[];
}

const MAX_LINES = 200;

/** What an approval covers: this program with these arguments, in this folder. */
export const launchFingerprint = (command: string[], folder: string): string => createHash('sha256').update(JSON.stringify({ command, folder })).digest('base64url');

/** Quote an argument for cmd.exe, which runs .bat and .cmd files. */
const cmdQuote = (arg: string) => `"${arg.replace(/"/g, '""')}"`;

export class AppProcesses {
  #runs = new Map<string, AppRun & { child?: ChildProcess; stopping?: true; onStop?: () => void }>();
  readonly #changed: () => void;

  constructor(changed: () => void = () => {}) {
    this.#changed = changed;
  }

  status(key: string): AppRun | undefined {
    const run = this.#runs.get(key);
    return run && { started: run.started, ...(run.exit ? { exit: run.exit } : {}), log: [...run.log] };
  }

  running(key: string): boolean {
    const run = this.#runs.get(key);
    return !!run && !run.exit;
  }

  /**
   * `extraEnv`: what the app gets on top of Weave's own environment (the app API, see appapi.ts). `onStop` runs
   * before the process is ended: a container is stopped through Docker, since ending its docker client wouldn't.
   */
  start(key: string, command: string[], folder: string, extraEnv: Record<string, string> = {}, onStop?: () => void): void {
    if (this.running(key)) throw new Error('the app is running already');
    const [named, ...args] = command;
    // A program in the app's own folder ("band-ab.exe" or "./band-ab"): Windows wouldn't look there by itself.
    const program = !isAbsolute(named) && existsSync(join(folder, named)) ? join(folder, named) : named;
    // The daemon may run on Electron's Node; the app shouldn't inherit that.
    const env = { ...process.env, ...extraEnv };
    delete env.ELECTRON_RUN_AS_NODE;
    const batch = process.platform === 'win32' && /\.(bat|cmd)$/i.test(program);
    const child = batch
      ? spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `"${[program, ...args].map(cmdQuote).join(' ')}"`], { cwd: folder, env, windowsHide: true, windowsVerbatimArguments: true })
      : spawn(program, args, { cwd: folder, env, windowsHide: true, detached: process.platform !== 'win32' });
    const run: AppRun & { child?: ChildProcess; stopping?: true; onStop?: () => void } = { started: new Date().toISOString(), log: [], child, ...(onStop ? { onStop } : {}) };
    this.#runs.set(key, run);
    const add = (chunk: Buffer) => {
      for (const line of chunk.toString('utf8').split(/\r?\n/)) if (line.trim()) run.log.push(line.slice(0, 500));
      if (run.log.length > MAX_LINES) run.log.splice(0, run.log.length - MAX_LINES);
    };
    child.stdout?.on('data', add);
    child.stderr?.on('data', add);
    const finish = (code: number | null) => {
      if (run.exit) return;
      run.exit = { code, time: new Date().toISOString(), ...(run.stopping ? { stopped: true as const } : {}) };
      run.child = undefined;
      this.#changed();
    };
    child.on('error', (error) => {
      run.log.push(`couldn't start: ${error.message}`);
      finish(null);
    });
    child.on('exit', (code) => finish(code));
    this.#changed();
  }

  /** Stop the app and everything it started. */
  stop(key: string): void {
    const run = this.#runs.get(key);
    const child = run?.child;
    if (!run || !child?.pid) return;
    run.stopping = true;
    run.onStop?.();
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
    else {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        child.kill('SIGTERM');
      }
    }
  }

  stopAll(): void {
    for (const key of this.#runs.keys()) this.stop(key);
  }
}
