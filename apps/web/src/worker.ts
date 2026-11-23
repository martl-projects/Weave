import './host/globals.ts';
import { b64u, errorToWire } from '@weave/core';
import type { BrowserHandover, WeaveNode } from '@weave/node';
import { mkdirSync, useFiles, writeFileSync } from './host/fs.ts';
import { handOnAgain, relayTicket, storageUrl, useStorage, withStorage } from './host/net.ts';
import { useServices } from './host/services.ts';
import { useStore } from './host/sqlitestore.ts';
import { openingFrom, openingFromWords } from './lock.ts';
import { webMethods } from './methods.ts';
import { called, measure, measureWaiting, watchBusy } from './slow.ts';
/** What Weave ships with for newcomers (martl's contact, through martl's front door), as `weave init` applies it. */
import bundle from '../../../weave.bundle.json' with { type: 'json' };
import { openWasmDatabase, wipeDatabases } from './wasmdb.ts';

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
let stopReconciling: (() => void) | undefined;
/** What a page may call. */
let allowed: ReadonlySet<string> = new Set();
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

/** A node that's open does what the daemon has it do on a computer. */
async function ready(opened: WeaveNode): Promise<void> {
  node = opened;
  // What keeps this Worker busy, said in the console when it was (slow.ts): events taken in, and the node's duties.
  measure(opened.replica, 'ingest', 'events taken in');
  measureWaiting(opened, 'reconcile', 'duties');
  watchBusy();
  stopReconciling = (await import('@weave/node')).keepReconciling(opened);
  node.wasmSetup.shippedDir = SHIPPED;
  // As the daemon's /events: everything new, with what it means for this person.
  void node.watch((item) => self.postMessage({ event: item }), new AbortController().signal);
  void startPushes(opened).catch((error: Error) => console.warn('weave: pushes:', error.message));
}

/** The relay this browser's addresses are at: its storage node, as an https address. */
const relayOf = (url: string): string => url.replace(/^ws/, 'http').replace(/\/storage$/, '');

/**
 * Pushes to this browser while Weave is closed (docs/web-push.md, stage 3): with a subscription, the node keeps an
 * address and a key for each place, sealed to those who manage it. Notices this node sends go out through its own
 * storage node, the one place the page's CSP lets it reach (so only to addresses there, for now).
 */
async function startPushes(opened: WeaveNode, off = false): Promise<void> {
  const keys = await import('./pushkey.ts');
  opened.pushTargets.setSender(async (target, message) => {
    const here = storageUrl();
    if (!here || relayOf(here) !== target.relay) return;
    await withStorage((client) => client.pushForward(target.address, message.sealed));
  });
  const subscription = off ? undefined : await keys.loadSubscription().catch(() => undefined);
  if (!subscription) return opened.pushTargets.setHost(undefined);
  const device = await keys.deviceName();
  await opened.pushTargets.setHost({
    device,
    targetFor: async (space, to) => {
      const address = (await keys.loadPlace(space))[to];
      const key = address ? await keys.loadKeyFor(address) : undefined;
      const here = storageUrl();
      return key && here ? { relay: relayOf(here), address: key.address, key: key.did } : undefined;
    },
    givenIn: async (space) => Object.keys(await keys.loadPlace(space)) as Array<`did:key:z${string}`>,
    make: async (space, to) => {
      const here = storageUrl();
      const sub = await keys.loadSubscription();
      if (!here || !sub) throw new Error('pushes are off in this browser');
      const address = await withStorage((client) => client.pushSubscribe(sub, true));
      const key = keys.makePushKey(address);
      await keys.saveKeyFor(key);
      await keys.savePlace(space, { ...(await keys.loadPlace(space)), [to]: address });
      return { relay: relayOf(here), address, key: key.did };
    },
    drop: async (space, to) => {
      const given = await keys.loadPlace(space);
      const address = given[to];
      if (!address) return;
      // The key first: whatever still comes to that address, from wherever, isn't shown.
      await keys.dropKeyFor(address);
      await withStorage((client) => client.pushDrop(address)).catch(() => undefined);
      delete given[to];
      await keys.savePlace(space, given);
    },
  });
}

const lifecycle: Record<string, (...args: never[]) => unknown> = {
  /** This tab's turn: the home opens for one tab at a time. Answers when it is this tab's, with what is there. */
  async open() {
    const turn = new Promise<void>((resolve) => void navigator.locks.request('weave-node', () => (resolve(), new Promise(() => {}))));
    const locks = await navigator.locks.query();
    if (locks.pending?.some((lock) => lock.name === 'weave-node')) self.postMessage({ event: 'waiting' });
    // Said to the page as it goes: a start that hangs says where (app.ts).
    const stage = (detail: string) => self.postMessage({ event: 'status', state: 'start', detail });
    stage('waiting for its turn (another tab or window of Weave may have the account)');
    await turn;
    stage('the database in this browser opens');
    const db = await openWasmDatabase('weave.db');
    try {
      useFiles(db);
      useStore(db);
    } catch (error) {
      // A database that can't be read (damaged): let go of it, so the page can offer to drop this copy (forget).
      try {
        db.close();
      } catch {
        // it was never quite open
      }
      throw error;
    }
    stage("Weave's own services load");
    await shipped();
    stage("the account's files are read");
    account = await import('./account.ts');
    allowed = webMethods((await import('@weave/node')).PHONE_METHODS);
    return account.lockState(HOME);
  },

  /** A new person: their words, to be shown once; with a passkey, later (laterWords), so they come straight in. */
  async create(name: string, passkey?: { id: string; secret: Uint8Array }) {
    const made = account.createAccount(HOME, name, passkey && wayIn(passkey));
    await ready(made.node);
    return passkey ? {} : { words: made.words };
  },

  async unlock(given: GivenWay) {
    await ready(account.unlockAccount(HOME, wayIn(given)));
  },

  /** This browser has nothing: bring the account here from the storage node. */
  async arrive(url: string, given: GivenWay) {
    const way = wayIn(given);
    const data = await account.findBox(url, way.opening);
    // Words with nothing here: an account made on a computer, which the page brings with recover().
    if (!data && 'words' in given) return { fromComputer: true };
    if (!data) throw new Error("no Weave account goes with this passkey: it belongs to a browser linked from a computer, or one whose account was never stored here. Each browser is linked on its own, the app on an iPhone's home screen too: paste a new link from your computer here (I have Weave on a computer), or come in with your 24 words");
    try {
      await ready(await account.arriveAccount(HOME, way, data));
    } catch (error) {
      // The box's root was rotated since (on a computer): with the words, the keys come fresh from the person's devices.
      if ('words' in given && /out of date/.test((error as Error).message)) return { fromComputer: true };
      throw error;
    }
    return {};
  },

  /** The words of an account made on a computer: the same person here, from their devices through the storage node. */
  async recover(url: string, words: string, invite: string, passkey?: { id: string; secret: Uint8Array }) {
    const status = (state: string, detail?: string) => self.postMessage({ event: 'status', state, detail });
    await ready(await account.recoverAccount(HOME, words, { url, invite, status, use: useStorage }, passkey && wayIn(passkey)));
  },

  /** Link this browser with a link from one of the person's computers: what it left at the storage node, opened here. */
  async link(url: string, secret: string, passkey: { id: string; secret: Uint8Array }) {
    const { linkToken, openLink } = await import('@weave/node');
    const key = b64u.decode(secret);
    const res = await fetch(`${url}/link/${linkToken(key)}`);
    if (res.status === 404) throw new Error('this link was opened already, or is older than 15 minutes: make a new one on your computer');
    if (!res.ok) throw new Error(`the storage node didn't answer (${res.status})`);
    let handover: BrowserHandover;
    try {
      handover = openLink<BrowserHandover>(key, await res.text());
    } catch {
      throw new Error("that link doesn't open what's there: make a new one on your computer");
    }
    await ready(await account.linkAccount(HOME, wayIn(passkey), handover));
  },

  /** A ticket for the relay, for a website's tab this page opened. */
  relayTicket(hours?: number) {
    return relayTicket(hours);
  },

  /** Web Push (docs/web-push.md): the storage node's key, this browser's subscription in and out, a push to itself. */
  pushKey() {
    return withStorage((client) => client.pushKey());
  },
  pushSubscribe(subscription: { endpoint: string; p256dh: string; auth: string }) {
    return withStorage((client) => client.pushSubscribe(subscription));
  },
  pushDrop(address: string) {
    return withStorage((client) => client.pushDrop(address));
  },
  pushSelf(address: string, sealed: unknown, after?: number) {
    return withStorage((client) => client.pushSelf(address, sealed, after));
  },

  /** Pushes on in this browser (its subscription) or off: each place gets its address, or every one goes back. */
  async pushPlaces(subscription?: { endpoint: string; p256dh: string; auth: string }) {
    const keys = await import('./pushkey.ts');
    if (subscription) await keys.saveSubscription(subscription);
    if (node) await startPushes(node, !subscription);
    // Off: the node took every place's address back while it still had the subscription to say so.
    if (!subscription) await keys.clearSubscription();
  },

  laterWords() {
    return node ? account.laterWords(HOME, node) : undefined;
  },

  wordsWritten() {
    account.wordsWritten(HOME);
  },

  ways() {
    return account.lockState(HOME).ways;
  },

  addWay(passkey: { id: string; secret: Uint8Array }) {
    account.addWay(HOME, node!, wayIn(passkey));
    handOnAgain();
  },

  removeWay(id: string) {
    account.removeWay(HOME, node!, id);
    handOnAgain();
  },

  /** Leave this browser: the page reloads after this. */
  async forget() {
    stopReconciling?.();
    await node?.close();
    node = undefined;
    await wipeDatabases();
  },

  /** Another tab takes over: let go of everything. The page ends this Worker after, and the lock goes with it. */
  async close() {
    stopReconciling?.();
    await node?.close();
    node = undefined;
  },

  async connect(url: string, invite?: string) {
    useStorage(account.storageLink(HOME, node!, url, { invite, status: (state, detail) => self.postMessage({ event: 'status', state, detail }) }));
    await node!.goOnline();
    // Online now: the places' push addresses can be made at the storage node.
    node!.pushTargets.changed(0);
    // A new account (it came with its invitation): the contacts Weave ships with, once it can reach them.
    if (invite) void node!.applyBundle(bundle).catch((error: Error) => console.warn('the contacts Weave ships with:', error.message));
  },
};

self.onmessage = async ({ data: { id, method, args } }) => {
  try {
    const own = lifecycle[method] as ((...a: unknown[]) => unknown) | undefined;
    if (own) return self.postMessage({ id, answer: { result: await own(...args) } });
    if (!allowed.has(method)) {
      console.warn(`${method} isn't on the web`);
      throw new Error(`${method} isn't on the web`);
    }
    if (!node) throw new Error('this account is locked');
    const call = (node as unknown as Record<string, (...a: unknown[]) => unknown>)[method];
    self.postMessage({ id, answer: { result: await called(method, () => call.apply(node, args) as Promise<unknown>) } });
  } catch (error) {
    self.postMessage({ id, answer: errorToWire(error) });
  }
};
