import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { Runtime as OnAComputer } from '../../../../packages/node/src/runtime.ts';

export * from '../../../../packages/node/src/runtime.ts';

/*
 * In place of packages/node/src/runtime.ts on a phone: a phone runs no programs, and its WebAssembly components run in
 * the app's screen, not here. The screen is a WebView, which runs WebAssembly wherever the app is allowed; whether the
 * worker's own engine does depends on the phone (an iPhone's allows it no compiled code). So a component goes to the
 * screen as its bytes, which the node read and checked; the screen starts a Worker for it, which transpiles and
 * instantiates it (Weave Web's service.ts, with no network and no host calls), and every call goes there and back over
 * the worker's line to the screen:
 *
 *   worker → screen  {service: {key, component, net}}      start it (component: its bytes, base64)
 *                    {serviceCall: {key, id, fn, args}}    call one of its functions
 *                    {serviceStop: key}                    end its Worker
 *   screen → worker  {op: 'service', key, type: 'ready'}
 *                    {op: 'service', key, type: 'failed', error}
 *                    {op: 'service', key, type: 'done', id, value | error}
 *
 * What goes to a component and comes back is text (JSON, or null), as on a computer.
 *
 * Weave's own services (Unread, Spotlight, the GitHub verifier) are in the app, transpiled when it was built, as in
 * Weave Web (build.ts): for one of those the screen gets where it is (`base`) in place of bytes. The rest of what
 * Weave ships, and a project's service that calls its host, runs on no phone.
 */

/** How long one call may take, starting the component included. */
const CALL_MS = 60_000;

let toScreen: ((message: unknown) => void) | undefined;

/** The line to the screen, from the worker's entry: components run there from now on. */
export function useScreen(send: (message: unknown) => void): void {
  toScreen = send;
}

/** Weave's own services that are in the app, by name. */
let inTheApp = new Set<string>();
export const useShipped = (names: string[]): void => void (inTheApp = new Set(names));

const SHIPPED = 'shipped:';

/** One of Weave's own services that is in the app is ready already; no other full service runs on a phone. */
export async function prepareWasm(component: string): Promise<string> {
  const name = basename(component).replace(/\.wasm$/, '');
  if (!inTheApp.has(name)) throw new Error(`${name} doesn't run on a phone`);
  return `${SHIPPED}${name}`;
}

/** A release's pure component (a lens's, a widget's): its file is its entry, its bytes are read when it starts. */
export async function preparePureWasm(component: string): Promise<string> {
  return component;
}

interface Running {
  ready: Promise<void>;
  started(): void;
  failed(error: Error): void;
  next: number;
  waiting: Map<number, { resolve(value: unknown): void; reject(error: Error): void }>;
}

/** What runs on the screen now, by key: one node in a worker, so one list. */
const running = new Map<string, Running>();

/** From the screen: what a component's Worker said. */
export function serviceSaid(message: { key?: unknown; type?: unknown; id?: unknown; value?: unknown; error?: unknown }): void {
  const entry = running.get(String(message.key));
  if (!entry) return;
  if (message.type === 'ready') return entry.started();
  if (message.type === 'failed') {
    stopRunning(String(message.key));
    return entry.failed(new Error(String(message.error ?? "it didn't start")));
  }
  const call = entry.waiting.get(Number(message.id));
  if (message.error !== undefined) call?.reject(new Error(String(message.error)));
  else call?.resolve(message.value);
}

function stopRunning(key: string): void {
  const entry = running.get(key);
  if (!entry) return;
  running.delete(key);
  for (const call of entry.waiting.values()) call.reject(new Error('it was stopped'));
  toScreen?.({ serviceStop: key });
}

export class Runtime extends OnAComputer {
  override running(key: string): boolean {
    return running.has(key);
  }

  override startWasm(key: string, run: { entry: string; net?: string[] }): void {
    if (this.running(key)) return;
    let started!: () => void;
    let failed!: (error: Error) => void;
    const ready = new Promise<void>((resolve, reject) => {
      started = resolve;
      failed = reject;
    });
    ready.catch(() => {});
    running.set(key, { ready, started, failed, next: 1, waiting: new Map() });
    if (!toScreen) return failed(new Error('no screen to run it on'));
    if (run.entry.startsWith(SHIPPED)) toScreen({ service: { key, base: `services/${run.entry.slice(SHIPPED.length)}`, net: run.net ?? [] } });
    else toScreen({ service: { key, component: Buffer.from(readFileSync(run.entry) as Uint8Array).toString('base64'), net: [] } });
  }

  override callWasm(key: string, fn: string, args: unknown[]): Promise<unknown> {
    const entry = running.get(key);
    if (!entry) return Promise.reject(new Error('not running'));
    return new Promise((resolve, reject) => {
      const id = entry.next++;
      const timer = setTimeout(() => {
        reject(new Error(`${fn} took too long`));
        this.stop(key);
      }, CALL_MS);
      const finished = () => {
        clearTimeout(timer);
        entry.waiting.delete(id);
      };
      entry.waiting.set(id, {
        resolve: (value) => (finished(), resolve(value)),
        reject: (error) => (finished(), reject(error)),
      });
      entry.ready.then(
        () => toScreen?.({ serviceCall: { key, id, fn, args } }),
        (error: Error) => entry.waiting.get(id)?.reject(error),
      );
    });
  }

  override stop(key: string): void {
    stopRunning(key);
  }
}
