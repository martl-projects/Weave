import type { ErrorAnswer } from '@weave/core';
import type { FeedItem } from '@weave/node/client';
import type { AppState, Bridge } from '../../desktop/src/renderer/bridge.ts';
import { askPasskey, makePasskey } from './passkey.ts';

/*
 * Weave in a browser: the desktop's renderer, as it is, with a bridge to the node in the Worker where it would have one to
 * the daemon (docs/web-stage2.md, step 8). The renderer takes whatever stands in `window.weave`, so this sets it first and
 * loads the renderer after.
 */

const STORAGE = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/storage`;
const INVITE_KEY = 'weave.invite';

/*
 * One tab at a time has the account (the Worker's Web Lock). A tab that finds it taken says so and can take it over: it
 * reloads asking for it, the tab that has it lets go and reloads to say it's elsewhere now, and the lock comes here.
 */
const TAKEN = 'weave.taken';
const TAKE = 'weave.take';
const tabs = new BroadcastChannel('weave-tabs');
const taken = sessionStorage.getItem(TAKEN) !== null;
const taking = sessionStorage.getItem(TAKE) !== null;
sessionStorage.removeItem(TAKEN);
sessionStorage.removeItem(TAKE);

const worker = new Worker('/worker.js', { type: 'module' });
/** Whether this tab has the account. */
let holding = false;
let shown = false;
let showElsewhere: () => void = () => {};
const elsewhere = new Promise<undefined>((resolve) => (showElsewhere = () => ((shown = true), resolve(undefined))));
let next = 1;
const waiting = new Map<number, (answer: { result?: unknown } | ErrorAnswer) => void>();
/** The services' Workers, by the node's key: the page starts them for it. */
const services = new Map<string, Worker>();
const listeners: Array<(item: FeedItem) => void> = [];

interface FromWorker {
  id: number;
  answer: { result?: unknown } | ErrorAnswer;
  event?: FeedItem | string;
  state?: string;
  detail?: string;
  key?: string;
  base?: string;
  net?: string[];
  port?: MessagePort;
}

worker.onmessage = ({ data }: MessageEvent<FromWorker>) => {
  if (data.event === 'service') {
    const service = new Worker('/service.js', { type: 'module' });
    services.set(data.key!, service);
    return service.postMessage({ base: data.base, net: data.net, port: data.port }, [data.port!]);
  }
  if (data.event === 'service-stop') {
    services.get(data.key!)?.terminate();
    return void services.delete(data.key!);
  }
  if (data.event === 'waiting') return taking ? tabs.postMessage('take') : showElsewhere();
  if (data.event === 'status') return console.info('storage node:', data.state, data.detail ?? '');
  if (typeof data.event === 'object') return listeners.forEach((listen) => listen(data.event as FeedItem));
  waiting.get(data.id)?.(data.answer);
  waiting.delete(data.id);
};

const ask = (method: string, ...args: unknown[]): Promise<{ result?: unknown } | ErrorAnswer> =>
  new Promise((resolve) => {
    const id = next++;
    waiting.set(id, resolve);
    worker.postMessage({ id, method, args });
  });

async function own<T>(method: string, ...args: unknown[]): Promise<T> {
  const answer = await ask(method, ...args);
  if ('error' in answer) throw new Error(answer.error);
  return answer.result as T;
}

/** An invitation to the storage node comes with the address the person was given, or from the page itself (dev.ts). */
function invitation(): string | undefined {
  return sessionStorage.getItem(INVITE_KEY) ?? document.querySelector<HTMLMetaElement>('meta[name="weave-invite"]')?.content;
}

// An invitation stays out of the address bar, the history and whatever is shared from it.
const arrived = new URLSearchParams(location.search).get('invite');
if (arrived) {
  sessionStorage.setItem(INVITE_KEY, arrived);
  history.replaceState(null, '', location.pathname + location.hash);
}

// A link from one of the person's computers (linkBrowser): its secret is after the #, which no server sees. It stays in
// this tab only, out of the address bar.
const LINK_KEY = 'weave.link';
const linkSecret = /^#link=([\w-]+)/.exec(location.hash)?.[1];
if (linkSecret) {
  sessionStorage.setItem(LINK_KEY, linkSecret);
  history.replaceState(null, '', location.pathname + location.search);
}

tabs.onmessage = async ({ data }: MessageEvent<string>) => {
  if (data !== 'take' || !holding) return;
  holding = false;
  await Promise.race([own('close'), new Promise((resolve) => setTimeout(resolve, 2000))]);
  worker.terminate();
  sessionStorage.setItem(TAKEN, '');
  location.reload();
};

// A tab that was just let go of opens nothing: it says the account is elsewhere.
if (taken) {
  worker.terminate();
  showElsewhere();
}
const opening = taken ? new Promise<never>(() => {}) : own<{ exists: boolean; ways: string[] }>('open').then((lock) => {
  holding = true;
  // The other tab closed while this one said it was there: this one has it now.
  if (shown) location.reload();
  return lock;
});
const lock = await Promise.race([opening, elsewhere]);
let open = false;
let passkey = !!lock?.ways.some((way) => way !== 'words');
let given: string | undefined;

// The page keeps working without a network. It needs a secure page; everything else stands without it.
void navigator.serviceWorker?.register('/sw.js').catch((error: Error) => console.warn('no offline start:', error.message));

const goOnline = async (invite?: string) => {
  open = true;
  await own('connect', STORAGE, invite);
};

/** Ask for the account again, by a reload: the tab that has it lets go when this one waits for it. */
const takeOver = async (): Promise<void> => {
  sessionStorage.setItem(TAKE, '');
  location.reload();
};

const web: Bridge['web'] = {
  passkey: () => passkey,
  takeOver,
  linking: () => !lock?.exists && sessionStorage.getItem(LINK_KEY) !== null,
  link: async () => {
    const invite = given || invitation();
    if (!invite) throw new Error('Weave on the web is by invitation for now: give the invitation you were given');
    // A passkey opens this browser; with no words here, it's the way in.
    const made = await makePasskey('Weave');
    // The handover waits next to this page (/link/…); the storage node is reached over its socket after.
    await own('link', location.origin, sessionStorage.getItem(LINK_KEY), made);
    sessionStorage.removeItem(LINK_KEY);
    passkey = true;
    await goOnline(invite);
  },
  needsInvite: () => !invitation(),
  invite: (text) => void (given = /[?&]invite=([\w-]+)/.exec(text)?.[1] ?? text.trim()),
  ways: () => own<string[]>('ways'),
  addPasskey: async () => {
    await own('addWay', await makePasskey('Weave'));
    passkey = true;
  },
  removeWay: async (id) => {
    await own('removeWay', id);
    passkey = (await own<string[]>('ways')).some((way) => way !== 'words');
  },
  forget: async () => {
    await own('forget');
    location.reload();
  },
  unlock: async (words) => {
    await own('unlock', words ? { words } : await askPasskey());
    await goOnline();
  },
  arrive: async (words) => {
    await own('arrive', STORAGE, words ? { words } : await askPasskey());
    await goOnline();
  },
};

window.weave = {
  web,
  state: async (): Promise<AppState> => (lock ? { home: 'Weave', hasIdentity: lock.exists || open, connected: open, locked: lock.exists && !open } : { home: 'Weave', hasIdentity: true, connected: false, elsewhere: true }),
  /** A new person, with a passkey where the browser has one; where it hasn't, the words alone open the account. */
  init: async (name) => {
    const invite = given || invitation();
    if (!invite) throw new Error('Weave on the web is by invitation for now: open the link you were given');
    const made = await makePasskey(name).catch((error: Error) => (console.warn('no passkey:', error.message), undefined));
    passkey = !!made;
    const { words } = await own<{ words: string }>('create', name, made);
    await goOnline(invite);
    return words;
  },
  restore: (words) => web.arrive(words),
  enroll: async () => {
    throw new Error("company accounts aren't on the web yet");
  },
  openApp: async (url) => void window.open(url, '_blank', 'noopener'),
  pickFolder: async () => undefined,
  show: async () => window.focus(),
  lensBase: (release) => `/lens/${encodeURIComponent(release)}/`,
  attention: async () => {},
  // As the desktop's preload answers: {result}, or the error as it came, which the renderer throws.
  call: (method, ...args) => ask(method, ...args),
  onEvent: (listener) => void listeners.push(listener),
  onLink: () => {},
};

await import('../../desktop/src/renderer/main.tsx');
