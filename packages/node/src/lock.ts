import { execFileSync } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeSync } from 'node:fs';
import { uptime } from 'node:os';
import type { Home } from './home.ts';

/*
 * One process at a time may write to a home: two writers appending to the same
 * log can produce two different events with the same sequence number. The lock
 * file holds the owner's pid; a lock whose process is gone is taken over, and
 * so is one from before the computer last started, or one whose pid now
 * belongs to another program (pids are reused, on Windows soon).
 * Within one process the lock is shared (tests open the same home twice).
 */

const held = new Map<string, number>();

// A few seconds' slack: the boot time is worked out from the uptime, and a daemon may start right at boot.
const BOOT_SLACK = 30_000;

function fromBeforeBoot(path: string): boolean {
  return statSync(path).mtimeMs < Date.now() - uptime() * 1000 - BOOT_SLACK;
}

/** The process's command line, or undefined where it can't be read (another user's process, no ps). */
function commandLine(pid: number): string | undefined {
  try {
    const out =
      process.platform === 'win32'
        ? execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`], { encoding: 'utf8', windowsHide: true, timeout: 10_000 })
        : execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8', timeout: 10_000 });
    return out.trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Whether pid may be a Weave process: the daemon, the weave command or Weave Server all run a script with
 * weave in its name or path. Only a command line we could read and that says nothing of Weave counts as foreign.
 */
export function maybeWeave(pid: number): boolean {
  const line = commandLine(pid);
  return line === undefined || /weave/i.test(line);
}

/** The pid holding this home's lock, if a live process that may be Weave holds it (see acquireLock). */
export function lockHolder(home: Home): number | undefined {
  let pid: number;
  try {
    pid = Number(readFileSync(home.lock, 'utf8'));
  } catch {
    return undefined;
  }
  return pid && alive(pid) && !fromBeforeBoot(home.lock) && maybeWeave(pid) ? pid : undefined;
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

process.once('exit', () => {
  for (const path of held.keys()) {
    try {
      unlinkSync(path);
    } catch {}
  }
});

/** Take the home's write lock; returns a function that releases it. Throws if another live process holds it. */
export function acquireLock(home: Home): () => void {
  const path = home.lock;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const count = (held.get(path) ?? 1) - 1;
    if (count > 0) return void held.set(path, count);
    held.delete(path);
    try {
      unlinkSync(path);
    } catch {}
  };

  if (held.has(path)) {
    held.set(path, held.get(path)! + 1);
    return release;
  }
  mkdirSync(home.dir, { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(path, 'wx');
      writeSync(fd, String(process.pid));
      closeSync(fd);
      held.set(path, 1);
      return release;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const pid = Number(readFileSync(path, 'utf8'));
      if (pid && pid !== process.pid && alive(pid) && !fromBeforeBoot(path) && maybeWeave(pid)) {
        throw new Error(`this Weave home is in use by another process (pid ${pid}), probably its daemon starting up; try again in a moment`);
      }
      unlinkSync(path); // stale: its process is gone, the computer has restarted since, or the pid is another program's
    }
  }
  throw new Error(`could not lock ${home.dir}`);
}
