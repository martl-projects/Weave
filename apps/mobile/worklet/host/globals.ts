import 'bare-encoding/global';
import 'bare-process/global';
import 'bare-abort-controller/global';
import { Buffer } from 'bare-buffer';
import { webcrypto } from 'bare-crypto';

/*
 * What the node takes for granted of its surroundings, on Bare: `process` and `Buffer` (Bare leaves both to modules),
 * the system's random numbers as `crypto`, and a clock for how long things took. Bare's timers are Node's: they
 * `unref` as they are. This is imported first.
 */

const scope = globalThis as unknown as { Buffer?: unknown; crypto?: unknown; performance?: { now(): number }; process: Record<string, unknown> };
scope.Buffer ??= Buffer;
scope.crypto ??= webcrypto;
const started = Date.now();
scope.performance ??= { now: () => Date.now() - started };
// What the node calls that Bare's process may not have.
scope.process.emitWarning ??= () => {};
scope.process.uptime ??= () => (Date.now() - started) / 1000;
