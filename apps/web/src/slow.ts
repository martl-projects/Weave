/*
 * What keeps the node's Worker busy: a page that waits ("getting ready…") can't tell, and a Worker says nothing by
 * itself. Three measures, each a line in the console only when something was slow:
 *  - a call from the page that took long says so, with how long it ran before it first waited;
 *  - the Worker not coming round for seconds (a heartbeat that fell behind) says for how long, which calls were open,
 *    and where the time went, of what is measured here (events taken in, the node's regular duties);
 *  - nothing else: no content, no ids, no names of places.
 */

/** A call that took this long is named. */
const SLOW_CALL_MS = 2_000;
/** The Worker not coming round for this long is named. */
const BUSY_MS = 2_000;
const BEAT_MS = 250;

const now = (): number => performance.now();

/** Time spent in measured sections since the last heartbeat, by section: total and how often. */
const sections = new Map<string, { ms: number; n: number }>();
/** The calls from the page that are open, by a number of their own. */
const open = new Map<number, { method: string; since: number }>();
let nextCall = 1;

/** Run something that doesn't wait, and count its time under a name. */
export function measured<T>(section: string, fn: () => T): T {
  const started = now();
  try {
    return fn();
  } finally {
    const spent = sections.get(section) ?? { ms: 0, n: 0 };
    spent.ms += now() - started;
    spent.n++;
    sections.set(section, spent);
  }
}

/** A method of an object, measured from now on under a name (what it returns is as before). */
export function measure<T extends object>(target: T, method: keyof T & string, section: string): void {
  const original = target[method] as unknown as (...args: unknown[]) => unknown;
  if (typeof original !== 'function') return;
  (target as Record<string, unknown>)[method] = function (this: unknown, ...args: unknown[]) {
    return measured(section, () => original.apply(this, args));
  };
}

/** The same for a method that waits: its whole time counts (so it may name time something else spent meanwhile). */
export function measureWaiting<T extends object>(target: T, method: keyof T & string, section: string): void {
  const original = target[method] as unknown as (...args: unknown[]) => Promise<unknown>;
  if (typeof original !== 'function') return;
  (target as Record<string, unknown>)[method] = async function (this: unknown, ...args: unknown[]) {
    const started = now();
    try {
      return await original.apply(this, args);
    } finally {
      const spent = sections.get(section) ?? { ms: 0, n: 0 };
      spent.ms += now() - started;
      spent.n++;
      sections.set(section, spent);
    }
  };
}

/** A call from the page: named when it took long, and listed while the Worker is busy. */
export async function called<T>(method: string, run: () => Promise<T> | T): Promise<T> {
  const id = nextCall++;
  const started = now();
  open.set(id, { method, since: started });
  let first = 0;
  try {
    const running = run();
    // Up to here it ran without waiting: this much of it held everything else up.
    first = now() - started;
    return await running;
  } finally {
    open.delete(id);
    const took = now() - started;
    if (took >= SLOW_CALL_MS) console.warn(`weave: ${method} took ${Math.round(took)} ms (${Math.round(first)} ms before it first waited)`);
  }
}

const rounded = (spent: Map<string, { ms: number; n: number }>): string =>
  [...spent]
    .filter(([, s]) => s.ms >= 50)
    .sort((a, b) => b[1].ms - a[1].ms)
    .map(([name, s]) => `${name} ${Math.round(s.ms)} ms (${s.n}×)`)
    .join(', ');

let beating = false;

/** Start the heartbeat: once, for as long as the Worker lives. */
export function watchBusy(): void {
  if (beating) return;
  beating = true;
  let last = now();
  setInterval(() => {
    const at = now();
    const late = at - last - BEAT_MS;
    last = at;
    if (late >= BUSY_MS) {
      const calls = [...open.values()].map((c) => `${c.method} (${Math.round((at - c.since) / 1000)} s)`).join(', ');
      const where = rounded(sections);
      console.warn(`weave: the node was busy for ${Math.round(late)} ms${where ? `: ${where}` : ', in nothing measured'}${calls ? `; open: ${calls}` : ''}`);
    }
    sections.clear();
  }, BEAT_MS);
}
