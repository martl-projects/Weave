import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parentPort, receiveMessageOnPort, workerData, type MessagePort } from 'node:worker_threads';
import * as cli from '@bytecodealliance/preview2-shim/cli';
import * as clocks from '@bytecodealliance/preview2-shim/clocks';
import { createFilesystem } from '@bytecodealliance/preview2-shim/filesystem';
import * as http from '@bytecodealliance/preview2-shim/http';
import * as io from '@bytecodealliance/preview2-shim/io';
import * as random from '@bytecodealliance/preview2-shim/random';

/*
 * One Weave service as a WebAssembly component, in a worker thread of its own (see Runtime.startWasm). It gets only
 * what's handed to it here: the WASI pieces every program needs (clocks, randomness, streams), a file system that is
 * its /data folder and nothing else, none of the daemon's environment, HTTPS to the hosts its contract names and no
 * other network, and Weave's host functions. Those
 * are answered by the main thread over a blocking channel: the component calls them like plain functions.
 */

const { dir, entry, data, host, flag, testHosts } = workerData as { dir: string; entry: string; data: string; host: MessagePort; flag: SharedArrayBuffer; testHosts: Record<string, number> };
const waiting = new Int32Array(flag);

/** A host call: ask the main thread, and wait until it has answered. A refusal comes back as the call's error. */
function call(name: string, args: unknown[]): unknown {
  Atomics.store(waiting, 0, 0);
  host.postMessage({ name, args });
  Atomics.wait(waiting, 0, 0);
  const reply = receiveMessageOnPort(host)?.message as { value?: unknown; error?: string } | undefined;
  if (reply?.error !== undefined) throw reply.error;
  return reply?.value;
}

/** The part of wasi:http's outgoing-request the handler looks at (preview2-shim's class). */
interface OutgoingRequest {
  scheme(): { tag: string } | undefined;
  authority(): string | undefined;
  setScheme(scheme: { tag: string }): void;
  setAuthority(authority: string): void;
}

const camel = (text: string) => text.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
const packages: Record<string, Record<string, unknown>> = { cli, clocks, io, random, http, filesystem: createFilesystem({ preopens: { '/data': data } }) };
const overrides: Record<string, unknown> = {
  // Nothing of the daemon's environment (its secrets): settings come through the host, one by name.
  'cli/environment': { getEnvironment: () => [], getArguments: () => [], initialCwd: () => undefined },
  'cli/exit': {
    exit: () => {
      throw new Error('a service runs until Weave stops it');
    },
  },
  // Requests out: HTTPS on its usual port, to a host the main thread lets it reach (its contract names it, and it
  // isn't on this computer's networks). Redirects aren't followed, so they can't lead elsewhere. The rest is refused.
  'http/outgoing-handler': {
    handle: (request: OutgoingRequest, options: unknown) => {
      const authority = (request.authority() ?? '').toLowerCase();
      const [name, port, ...rest] = authority.split(':');
      try {
        if (rest.length || (request.scheme()?.tag ?? 'HTTPS') !== 'HTTPS' || (port && port !== '443')) throw new Error('only HTTPS, on its usual port');
        call('reach', [name]);
      } catch (error) {
        console.error(`weave: refused a request to ${authority || '(no host)'}: ${(error as Error)?.message ?? String(error)}`);
        throw { tag: 'HTTP-request-denied' };
      }
      // Tests: the host stands for a server on this computer.
      if (testHosts[name]) {
        request.setScheme({ tag: 'HTTP' });
        request.setAuthority(`127.0.0.1:${testHosts[name]}`);
      }
      return (http.outgoingHandler as { handle(request: unknown, options: unknown): unknown }).handle(request, options);
    },
  },
};
const weave: Record<string, unknown> = {
  'service/host': {
    me: () => call('me', []),
    setting: (name: string) => call('setting', [name]),
    publish: (space: string, kind: string, body: string) => call('publish', [space, kind, body]),
    answer: (request: string, text?: string, value?: string, error?: string) => call('answer', [request, text, value, error]),
    load: (name: string) => call('load', [name]),
    save: (name: string, value: string) => call('save', [name, value]),
    log: (message: string) => call('log', [message]),
    tickEvery: (ms: number) => call('tickEvery', [ms]),
    sign: (setting: string, algorithm: string, data: Uint8Array) => call('sign', [setting, algorithm, data]),
    release: (space: string, id: string) => call('release', [space, id]),
    websites: (space: string) => call('websites', [space]),
    closeWebsite: (id: string) => call('closeWebsite', [id]),
  },
  // Its website's players: Weave holds their connections; what it says to them goes out without waiting.
  'service/players': {
    send: (player: string, message: string) => parentPort!.postMessage({ type: 'players', op: 'send', player, message }),
    broadcast: (message: string) => parentPort!.postMessage({ type: 'players', op: 'broadcast', message }),
    disconnect: (player: string) => parentPort!.postMessage({ type: 'players', op: 'disconnect', player }),
    tickEvery: (ms: number) => parentPort!.postMessage({ type: 'players', op: 'tick', ms }),
  },
};
// What the component imports, by name (wasi:cli/stderr@0.2.12 …): handed out here, or nothing.
const imports = new Proxy(
  {},
  {
    get(_, key) {
      const m = /^(wasi|weave):([a-z0-9-]+)\/([a-z0-9-]+)(@.*)?$/.exec(String(key));
      if (!m) return undefined;
      const path = `${m[2]}/${m[3]}`;
      if (m[1] === 'weave') return weave[path];
      return overrides[path] ?? packages[m[2]]?.[camel(m[3])];
    },
  },
);

/** What a component exports: on-event always; a website's also on-join, on-message, on-leave and on-tick. */
interface Exports {
  onEvent?(item: string): void;
  onJoin?(player: string): void;
  onMessage?(player: string, message: string): void;
  onLeave?(player: string): void;
  onTick?(): void;
}
const { instantiate } = (await import(pathToFileURL(join(dir, entry)).href)) as { instantiate(getCoreModule: (file: string) => Promise<WebAssembly.Module>, imports: object): Promise<Exports> };
const component = await instantiate(async (file) => WebAssembly.compile(await readFile(join(dir, file))), imports);
// One task at a time, as the main thread hands them: each answered with done (or why it failed).
parentPort!.on('message', (task: { type: string; item?: string; player?: string; message?: string; fn?: string; args?: unknown[] }) => {
  try {
    // A call of one of its functions (a client service's fold or act): its answer goes back.
    if (task.type === 'call') {
      const fn = (component as unknown as Record<string, (...args: unknown[]) => unknown>)[camel(task.fn!)];
      if (typeof fn !== 'function') throw new Error(`it has no ${task.fn}`);
      return void parentPort!.postMessage({ type: 'done', value: fn(...task.args!) });
    }
    if (task.type === 'event') component.onEvent?.(task.item!);
    if (task.type === 'join') component.onJoin?.(task.player!);
    if (task.type === 'message') component.onMessage?.(task.player!, task.message!);
    if (task.type === 'leave') component.onLeave?.(task.player!);
    if (task.type === 'tick') component.onTick?.();
    parentPort!.postMessage({ type: 'done' });
  } catch (error) {
    // A result's err comes as a ComponentError carrying it.
    const why = (error as { payload?: unknown })?.payload ?? (error as Error)?.message ?? error;
    parentPort!.postMessage({ type: 'done', error: String(why) });
  }
});
parentPort!.postMessage({ type: 'ready' });
