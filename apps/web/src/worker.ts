import './host/globals.ts';
import type { WeaveNode } from '@weave/node';
import { mkdirSync, useFiles, writeFileSync } from './host/fs.ts';
import { useStorage } from './host/net.ts';
import { useServices } from './host/services.ts';
import { useStore } from './host/sqlitestore.ts';
import { openingFrom, openingFromWords } from './lock.ts';
import { WEB_METHODS } from './methods.ts';
import { openWasmDatabase } from './wasmdb.ts';

/*
 * The node in a Worker (docs/web-stage2.md, steps 5 and 7): the real WeaveNode over the host in ./host. It speaks
 * {id, method, args} to the page and {event} when something happens, as /ws does. It starts locked: `open` says what
 * is there, and only a way in (create, unlock, arrive) brings up a node.
 */

declare const self: { onmessage: ((event: { data: Call }) => void) | null; postMessage(message: unknown): void };

interface Call {
  id: number;
  method: string;
  args: unknown[];
}

/** From the page: what a passkey gave, or the words. */
type GivenWay = { id: string; secret: Uint8Array } | { words: string };

const HOME = '/weave';
const SHIPPED = '/shipped';

let node: WeaveNode | undefined;
/** Loaded once the database is open: the node reads files as it loads. */
let account: typeof import('./account.ts');

/** The services a page runs, where the node looks for what Weave ships (build.ts). */
async function shipped(): Promise<void> {
  const list = await (await fetch('/shipped-web.json')).text();
  const services = JSON.parse(list) as Record<string, { component: string }>;
  mkdirSync(SHIPPED);
  writeFileSync(`${SHIPPED}/shipped.json`, list);
  for (const [name, { component }] of Object.entries(services)) writeFileSync(`${SHIPPED}/${component}`, `web:${name}`);
  useServices(Object.keys(services));
}

const wayIn = (given: GivenWay) => ('words' in given ? { id: account.WORDS, opening: openingFromWords(given.words) } : { id: given.id, opening: openingFrom(given.secret) });

function ready(opened: WeaveNode): void {
  node = opened;
  node.wasmSetup.shippedDir = SHIPPED;
  node.replica.onAppend(() => self.postMessage({ event: 'changed' }));
}

const lifecycle: Record<string, (...args: never[]) => unknown> = {
  /** This tab's turn: the home opens for one tab at a time. Answers when it is this tab's, with what is there. */
  async open() {
    const turn = new Promise<void>((resolve) => void navigator.locks.request('weave-node', () => (resolve(), new Promise(() => {}))));
    const locks = await navigator.locks.query();
    if (locks.pending?.some((lock) => lock.name === 'weave-node')) self.postMessage({ event: 'waiting' });
    await turn;
    const db = await openWasmDatabase('weave.db');
    useFiles(db);
    useStore(db);
    await shipped();
    account = await import('./account.ts');
    return account.lockState(HOME);
  },

  /** A new person: their words, to be shown once. */
  create(name: string, passkey?: { id: string; secret: Uint8Array }) {
    const made = account.createAccount(HOME, name, passkey && wayIn(passkey));
    ready(made.node);
    return { words: made.words };
  },

  unlock(given: GivenWay) {
    ready(account.unlockAccount(HOME, wayIn(given)));
  },

  /** This browser has nothing: bring the account here from the storage node. */
  async arrive(url: string, given: GivenWay) {
    const way = wayIn(given);
    const data = await account.findBox(url, way.opening);
    if (!data) throw new Error("the storage node doesn't know this: no account comes with it");
    ready(await account.arriveAccount(HOME, way, data));
  },

  async connect(url: string, invite?: string) {
    useStorage(account.storageLink(HOME, node!, url, { invite, status: (state, detail) => self.postMessage({ event: 'status', state, detail }) }));
    await node!.goOnline();
  },
};

self.onmessage = async ({ data: { id, method, args } }) => {
  try {
    const own = lifecycle[method] as ((...a: unknown[]) => unknown) | undefined;
    if (own) return self.postMessage({ id, result: await own(...args) });
    if (!(WEB_METHODS as readonly string[]).includes(method)) throw new Error(`${method} isn't on the web`);
    if (!node) throw new Error('this account is locked');
    const call = (node as unknown as Record<string, (...a: unknown[]) => unknown>)[method];
    self.postMessage({ id, result: await call.apply(node, args) });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
