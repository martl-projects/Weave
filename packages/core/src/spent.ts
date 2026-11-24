/*
 * Where a node's time goes while events arrive: counted by step, read (and emptied) by whoever watches for the node
 * being busy (Weave Web's Worker says it in the console when it didn't come round for seconds). No content, no ids.
 * Steps may contain each other (taking keys may decode everything): the sums are not disjoint.
 */

const spent = new Map<string, { ms: number; n: number }>();

/** Run a step and count its time under its name. */
export function timed<T>(step: string, fn: () => T): T {
  const started = performance.now();
  try {
    return fn();
  } finally {
    const s = spent.get(step) ?? { ms: 0, n: 0 };
    s.ms += performance.now() - started;
    s.n++;
    spent.set(step, s);
  }
}

/** What was counted since the last call, and start over. */
export function takeSpent(): Map<string, { ms: number; n: number }> {
  const taken = new Map(spent);
  spent.clear();
  return taken;
}
