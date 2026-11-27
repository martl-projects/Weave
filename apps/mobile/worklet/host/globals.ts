import 'bare-encoding/global';
import 'bare-process/global';
import 'bare-abort-controller/global';
import 'bare-fetch/global';
import 'bare-form-data/global';
import { Buffer } from 'bare-buffer';
import { webcrypto } from 'bare-crypto';
import { ReadableStream, TransformStream, WritableStream } from 'bare-stream/web';

/*
 * What the node takes for granted of its surroundings, on Bare, which leaves all of it to modules: `process` and
 * `Buffer`, the system's random numbers as `crypto`, `fetch` with its requests and answers, `Blob`, the web's streams
 * (what a fetched file is read from), `AbortController`, and a clock for how long things took. Bare's timers are
 * Node's: they `unref` as they are. This is imported first.
 */

const scope = globalThis as unknown as Record<string, unknown> & { process: Record<string, unknown> };
scope.Buffer ??= Buffer;
scope.crypto ??= webcrypto;
scope.ReadableStream ??= ReadableStream;
scope.WritableStream ??= WritableStream;
scope.TransformStream ??= TransformStream;
const started = Date.now();
scope.performance ??= { now: () => Date.now() - started };
// What the node calls that Bare's process may not have.
scope.process.emitWarning ??= () => {};
scope.process.uptime ??= () => (Date.now() - started) / 1000;
