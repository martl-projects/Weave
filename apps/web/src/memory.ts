/*
 * How much memory a Worker uses, said where it can be known: a phone ends a page that takes too much without a word,
 * and nobody could tell what took it. A browser's own count of a Worker's JavaScript objects (Chromium only: Safari and
 * Firefox don't tell), and what a component's WebAssembly memories hold (known everywhere). The lines go to the
 * console, and from there into what a browser writes down for its person (diagnose.ts).
 */

/** This Worker's JavaScript objects in MB, where the browser tells. */
export function heapMB(perf: unknown = performance): number | undefined {
  const used = (perf as { memory?: { usedJSHeapSize?: unknown } } | undefined)?.memory?.usedJSHeapSize;
  return typeof used === 'number' && used > 0 ? Math.round(used / 1e6) : undefined;
}

/**
 * Says how much there is now, and again whenever it is `step` MB more or less than when last said: `look()` is called
 * by whoever watches (a timer, or after each piece of work). Nothing where `measure` knows nothing.
 */
export function memoryTeller(say: (mb: number) => void, measure: () => number | undefined, step: number): { look(): void } {
  let said: number | undefined;
  return {
    look() {
      const now = measure();
      if (now === undefined || (said !== undefined && Math.abs(now - said) < step)) return;
      said = now;
      say(now);
    },
  };
}
