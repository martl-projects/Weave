import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeSync } from 'node:fs';
import type { Home } from './home.ts';

/*
 * One process at a time may write to a home: two writers appending to the same
 * log can produce two different events with the same sequence number. The lock
 * file holds the owner's pid; a lock whose process is gone is taken over.
 * Within one process the lock is shared (tests open the same home twice).
 */

const held = new Map<string, number>();

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
      if (pid && pid !== process.pid && alive(pid)) {
        throw new Error(`this Weave home is in use by another process (pid ${pid}), probably its daemon starting up; try again in a moment`);
      }
      unlinkSync(path); // stale: its process is gone
    }
  }
  throw new Error(`could not lock ${home.dir}`);
}
