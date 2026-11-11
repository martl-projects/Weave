import * as cli from '@bytecodealliance/preview2-shim/cli';
import * as clocks from '@bytecodealliance/preview2-shim/clocks';
import * as filesystem from '@bytecodealliance/preview2-shim/filesystem';
import * as http from '@bytecodealliance/preview2-shim/http';
import * as io from '@bytecodealliance/preview2-shim/io';
import * as random from '@bytecodealliance/preview2-shim/random';

/*
 * One of Weave's own components in a Worker of its own: what packages/node/src/wasmworker.ts is on a computer, for what
 * a browser runs (host/runtime.ts). A service that only folds and answers (Unread, Spotlight) gets the WASI pieces every
 * program needs and nothing else: no network, no host calls, no files of the person. A verifier (GitHub) also reaches
 * the hosts its manifest names, over HTTPS, and has a log; it waits for their answers suspended by JSPI (build.ts).
 */

declare const self: { onmessage: ((event: { data: { base: string; net?: string[]; port: MessagePort } }) => void) | null };

/** The part of wasi:http's outgoing-request looked at here (preview2-shim's class). */
interface OutgoingRequest {
  scheme(): { tag: string } | undefined;
  authority(): string | undefined;
}

const camel = (text: string) => text.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
const packages: Record<string, Record<string, unknown>> = { cli, clocks, io, random, filesystem };
const refuse = (): never => {
  throw new Error('a service here calls nothing');
};

/** The hosts this one may reach: none, unless it's a verifier. */
let net: string[] = [];

const overrides: Record<string, unknown> = {
  'cli/environment': { getEnvironment: () => [], getArguments: () => [], initialCwd: () => undefined },
  'cli/exit': { exit: refuse },
  // Requests out: HTTPS on its usual port, to a host its manifest names. Redirects aren't followed (fetch's own).
  'http/outgoing-handler': {
    handle: (request: OutgoingRequest, options: unknown) => {
      const authority = (request.authority() ?? '').toLowerCase();
      const [name, port, ...rest] = authority.split(':');
      if (rest.length || (request.scheme()?.tag ?? 'HTTPS') !== 'HTTPS' || (port && port !== '443') || !net.includes(name)) {
        console.error(`weave: refused a request to ${authority || '(no host)'}`);
        throw { tag: 'HTTP-request-denied' };
      }
      return (http.outgoingHandler as { handle(request: unknown, options: unknown): unknown }).handle(request, options);
    },
  },
  'http/types': http.types,
};
const weave: Record<string, unknown> = {
  'service/verifying': { log: (message: string) => console.info(String(message).slice(0, 2000)) },
};

const imports = new Proxy(
  {},
  {
    get(_, key) {
      const m = /^(wasi|weave):([a-z0-9-]+)\/([a-z0-9-]+)(@.*)?$/.exec(String(key));
      if (!m) return undefined;
      const path = `${m[2]}/${m[3]}`;
      if (m[1] === 'weave') return weave[path] ?? new Proxy({}, { get: () => refuse });
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

/** The page starts this with where the component is, what it may reach, and the channel to the node. */
self.onmessage = async ({ data: { base, net: hosts, port } }) => {
  net = (hosts ?? []).map((host) => host.toLowerCase());
  port.onmessage = async ({ data }: MessageEvent<{ id: number; fn: string; args: unknown[] }>) => {
    try {
      const fn = component?.[camel(data.fn)];
      if (typeof fn !== 'function') throw new Error(`it has no ${data.fn}`);
      // A verifier's answer comes once its requests have; a service's at once.
      port.postMessage({ type: 'done', id: data.id, value: await fn(...data.args) });
    } catch (error) {
      const why = (error as { payload?: unknown })?.payload ?? (error as Error)?.message ?? error;
      port.postMessage({ type: 'done', id: data.id, error: String(why) });
    }
  };
  try {
    // A verifier waits suspended, and a browser without JSPI can't: it can't check accounts yet.
    if (net.length && !('Suspending' in WebAssembly)) throw new Error("this browser can't check accounts yet (it has no JSPI)");
    await start(base);
    port.postMessage({ type: 'ready' });
  } catch (error) {
    port.postMessage({ type: 'failed', error: String((error as Error)?.message ?? error) });
  }
};
