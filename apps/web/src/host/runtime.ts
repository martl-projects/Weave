import { Runtime as OnAComputer } from '../../../../packages/node/src/runtime.ts';
import { isServed } from './services.ts';

export * from '../../../../packages/node/src/runtime.ts';

/*
 * In place of packages/node/src/runtime.ts: a browser runs no programs, and of WebAssembly components only those built
 * into the page (build.ts: transpiled ahead of time, since a page has no transpiler). Each runs in a Worker of its own
 * (service.ts), so a long fold doesn't hold up the node. The page starts it, because a Worker started from a Worker didn't
 * load there: the node asks with {event: 'service'} and from then on speaks to it over a channel of their own.
 */

declare const self: { postMessage(message: unknown, transfer: Transferable[]): void };

/** How long one call may take, loading the component included. */
const CALL_MS = 60_000;

const nameOf = (file: string): string => file.split('/').at(-1)!.replace(/\.wasm$/, '');

/** A component here is ready already, or it isn't one a browser can run. The entry says which it is. */
export async function prepareWasm(component: string): Promise<string> {
  const name = nameOf(component);
  if (!isServed(name)) throw new Error(`${name} doesn't run in a browser`);
  return name;
}

interface Running {
  port: MessagePort;
  ready: Promise<void>;
  next: number;
  waiting: Map<number, { resolve(value: unknown): void; reject(error: Error): void }>;
}

export class Runtime extends OnAComputer {
  readonly #running = new Map<string, Running>();

  override running(key: string): boolean {
    return this.#running.has(key);
  }

  override startWasm(key: string, run: { entry: string; net?: string[] }): void {
    if (this.running(key)) return;
    const { port1: port, port2: theirs } = new MessageChannel();
    const entry: Running = { port, next: 1, waiting: new Map(), ready: Promise.resolve() };
    entry.ready = new Promise((resolve, reject) => {
      port.onmessage = ({ data }: MessageEvent<{ type: string; id?: number; value?: unknown; error?: string }>) => {
        if (data.type === 'ready') return resolve();
        if (data.type === 'failed') {
          this.stop(key);
          return reject(new Error(data.error));
        }
        const call = entry.waiting.get(data.id!);
        if (data.error !== undefined) call?.reject(new Error(data.error));
        else call?.resolve(data.value);
      };
    });
    entry.ready.catch(() => {});
    this.#running.set(key, entry);
    self.postMessage({ event: 'service', key, base: `/services/${run.entry}`, net: run.net ?? [], port: theirs }, [theirs]);
  }

  override callWasm(key: string, fn: string, args: unknown[]): Promise<unknown> {
    const entry = this.#running.get(key);
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
        () => entry.port.postMessage({ id, fn, args }),
        (error: Error) => entry.waiting.get(id)?.reject(error),
      );
    });
  }

  override stop(key: string): void {
    const entry = this.#running.get(key);
    if (!entry) return;
    this.#running.delete(key);
    entry.port.close();
    self.postMessage({ event: 'service-stop', key }, []);
  }
}
