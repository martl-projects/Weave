import { Buffer } from 'buffer';

/*
 * What the node takes for granted of its surroundings: `process`, `Buffer`, and timers it can `unref`. This is imported
 * first. The keystore is the file one until step 7 puts the home key under the person's passkey.
 */

const scope = globalThis as unknown as Record<string, unknown>;

scope.Buffer = Buffer;
scope.process = {
  env: { WEAVE_KEYSTORE: 'file' },
  platform: 'browser',
  pid: 1,
  argv: [],
  versions: {},
  cwd: () => '/',
  on: () => {},
  once: () => {},
  off: () => {},
  emitWarning: () => {},
  uptime: () => performance.now() / 1000,
  hrtime: { bigint: () => BigInt(Math.round(performance.now() * 1e6)) },
};

/** A browser's timer is a number; the node's has `unref`. `clearTimeout` reads this one as its number. */
const timer = (id: number) => ({ unref: () => timer(id), ref: () => timer(id), hasRef: () => false, [Symbol.toPrimitive]: () => id });
for (const name of ['setTimeout', 'setInterval'] as const) {
  const original = globalThis[name] as (...args: unknown[]) => number;
  scope[name] = (...args: unknown[]) => timer(original(...args));
}

scope.setImmediate = (run: (...args: unknown[]) => void, ...args: unknown[]) => (scope.setTimeout as typeof setTimeout)(run, 0, ...args);
scope.clearImmediate = (id: number) => clearTimeout(id);
