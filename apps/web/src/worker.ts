import './host/globals.ts';
import type { WeaveNode } from '@weave/node';
import { existsSync, mkdirSync, readFileSync, useFiles, writeFileSync } from './host/fs.ts';
import { accountOf, accountRecord, useStorage } from './host/net.ts';
import { useServices } from './host/services.ts';
import { useStore } from './host/sqlitestore.ts';
import { WEB_METHODS } from './methods.ts';
import { openWasmDatabase } from './wasmdb.ts';

/*
 * The node in a Worker (docs/web-stage2.md, step 5): the real WeaveNode over the host in ./host. It speaks
 * {id, method, args} to the page and {event} when something happens, as /ws does. The account key at the storage node
 * lies in the home as it is, and so does the home key: both go under the passkey in step 7.
 */

declare const self: { onmessage: ((event: { data: Call }) => void) | null; postMessage(message: unknown): void };

interface Call {
  id: number;
  method: string;
  args: unknown[];
}

const HOME = '/weave';
const ACCOUNT = `${HOME}/storage.json`;
const SHIPPED = '/shipped';

let node: WeaveNode | undefined;

/** The services a page runs, where the node looks for what Weave ships (build.ts). */
async function shipped(): Promise<void> {
  const list = await (await fetch('/shipped-web.json')).text();
  const services = JSON.parse(list) as Record<string, { component: string }>;
  mkdirSync(SHIPPED);
  writeFileSync(`${SHIPPED}/shipped.json`, list);
  for (const [name, { component }] of Object.entries(services)) writeFileSync(`${SHIPPED}/${component}`, `web:${name}`);
  useServices(Object.keys(services));
}

const lifecycle: Record<string, (...args: never[]) => unknown> = {
  /** This tab's turn: the home opens for one tab at a time. Answers when it is this tab's. */
  async open(name: string) {
    const turn = new Promise<void>((resolve) => void navigator.locks.request('weave-node', () => (resolve(), new Promise(() => {}))));
    const locks = await navigator.locks.query();
    if (locks.pending?.some((lock) => lock.name === 'weave-node')) self.postMessage({ event: 'waiting' });
    await turn;
    const started = performance.now();
    const db = await openWasmDatabase('weave.db');
    useFiles(db);
    useStore(db);
    await shipped();
    // Only now: the node reads files as it loads.
    const { resolveHome, WeaveNode } = await import('@weave/node');
    const fresh = !existsSync(resolveHome(HOME).identity);
    node = fresh ? WeaveNode.init(name, HOME) : WeaveNode.open(HOME);
    node.wasmSetup.shippedDir = SHIPPED;
    node.replica.onAppend(() => self.postMessage({ event: 'changed' }));
    return { fresh, ms: Math.round(performance.now() - started) };
  },

  async connect(url: string, invite?: string) {
    useStorage({
      url,
      invite,
      account: () => (existsSync(ACCOUNT) ? accountOf(JSON.parse(readFileSync(ACCOUNT, 'utf8') as string)) : undefined),
      keepAccount: (account) => writeFileSync(ACCOUNT, JSON.stringify(accountRecord(account))),
      status: (state, detail) => self.postMessage({ event: 'status', state, detail }),
    });
    await node!.goOnline();
  },
};

self.onmessage = async ({ data: { id, method, args } }) => {
  try {
    const own = lifecycle[method] as ((...a: unknown[]) => unknown) | undefined;
    if (own) return self.postMessage({ id, result: await own(...args) });
    if (!(WEB_METHODS as readonly string[]).includes(method)) throw new Error(`${method} isn't on the web`);
    const call = (node as unknown as Record<string, (...a: unknown[]) => unknown>)[method];
    self.postMessage({ id, result: await call.apply(node, args) });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? `${error.message}\n${error.stack}` : String(error) });
  }
};
