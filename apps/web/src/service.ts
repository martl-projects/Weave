import * as cli from '@bytecodealliance/preview2-shim/cli';
import * as clocks from '@bytecodealliance/preview2-shim/clocks';
import * as filesystem from '@bytecodealliance/preview2-shim/filesystem';
import * as io from '@bytecodealliance/preview2-shim/io';
import * as random from '@bytecodealliance/preview2-shim/random';

/*
 * One service that only folds and answers (Unread, Spotlight), as a WebAssembly component in a Worker of its own: what
 * packages/node/src/wasmworker.ts is on a computer, for what a browser runs (host/runtime.ts). It gets the WASI pieces
 * every program needs and nothing else: no network, no host calls, no files of the person.
 */

declare const self: { onmessage: ((event: { data: { base: string; port: MessagePort } }) => void) | null };

const camel = (text: string) => text.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
const packages: Record<string, Record<string, unknown>> = { cli, clocks, io, random, filesystem };
const refuse = (): never => {
  throw new Error('a service here calls nothing');
};
const overrides: Record<string, unknown> = {
  'cli/environment': { getEnvironment: () => [], getArguments: () => [], initialCwd: () => undefined },
  'cli/exit': { exit: refuse },
  'http/outgoing-handler': { handle: refuse },
  'http/types': {},
};

const imports = new Proxy(
  {},
  {
    get(_, key) {
      const m = /^(wasi|weave):([a-z0-9-]+)\/([a-z0-9-]+)(@.*)?$/.exec(String(key));
      if (!m) return undefined;
      const path = `${m[2]}/${m[3]}`;
      if (m[1] === 'weave') return new Proxy({}, { get: () => refuse });
      return overrides[path] ?? packages[m[2]]?.[camel(m[3])];
    },
  },
);

type Component = Record<string, (...args: unknown[]) => unknown>;
let component: Component | undefined;

async function start(base: string): Promise<void> {
  const { instantiate } = (await import(/* @vite-ignore */ `${base}/component.js`)) as { instantiate(getCoreModule: (file: string) => Promise<WebAssembly.Module>, imports: object): Promise<Component> };
  component = await instantiate((file) => WebAssembly.compileStreaming(fetch(`${base}/${file}`)), imports);
}

/** The page starts this with where the component is and the channel to the node. */
self.onmessage = async ({ data: { base, port } }) => {
  port.onmessage = ({ data }: MessageEvent<{ id: number; fn: string; args: unknown[] }>) => {
    try {
      const fn = component?.[camel(data.fn)];
      if (typeof fn !== 'function') throw new Error(`it has no ${data.fn}`);
      port.postMessage({ type: 'done', id: data.id, value: fn(...data.args) });
    } catch (error) {
      const why = (error as { payload?: unknown })?.payload ?? (error as Error)?.message ?? error;
      port.postMessage({ type: 'done', id: data.id, error: String(why) });
    }
  };
  try {
    await start(base);
    port.postMessage({ type: 'ready' });
  } catch (error) {
    port.postMessage({ type: 'failed', error: String((error as Error)?.message ?? error) });
  }
};
