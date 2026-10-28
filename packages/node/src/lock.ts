import { closeSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeSync } from 'node:fs';
import { uptime } from 'node:os';
import type { Home } from './home.ts';

/*
 * One process at a time may write to a home: two writers appending to the same
 * log can produce two different events with the same sequence number. The lock
 * file holds the owner's pid; a lock whose process is gone is taken over, and
 * so is one from before the computer last started (its pid may belong to
 * another program by now).
 * Within one process the lock is shared (tests open the same home twice).
 */

const held = new Map<string, number>();

// A few seconds' slack: the boot time is worked out from the uptime, and a daemon may start right at boot.
const BOOT_SLACK = 30_000;

function fromBeforeBoot(path: string): boolean {
  return statSync(path).mtimeMs < Date.now() - uptime() * 1000 - BOOT_SLACK;
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
      if (pid && pid !== process.pid && alive(pid) && !fromBeforeBoot(path)) {
        throw new Error(`this Weave home is in use by another process (pid ${pid}), probably its daemon starting up; try again in a moment`);
      }
      unlinkSync(path); // stale: its process is gone, or the computer has restarted since
    }
  }
  throw new Error(`could not lock ${home.dir}`);
}
