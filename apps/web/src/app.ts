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

const worker = new Worker('/worker.js', { type: 'module' });
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
  port?: MessagePort;
}

worker.onmessage = ({ data }: MessageEvent<FromWorker>) => {
  if (data.event === 'service') {
    const service = new Worker('/service.js', { type: 'module' });
    services.set(data.key!, service);
    return service.postMessage({ base: data.base, port: data.port }, [data.port!]);
  }
  if (data.event === 'service-stop') {
    services.get(data.key!)?.terminate();
    return void services.delete(data.key!);
  }
  if (data.event === 'waiting') return void (document.title = 'Weave (open in another tab)');
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
  const given = new URLSearchParams(location.search).get('invite');
  if (given) sessionStorage.setItem(INVITE_KEY, given);
  return given ?? sessionStorage.getItem(INVITE_KEY) ?? document.querySelector<HTMLMetaElement>('meta[name="weave-invite"]')?.content;
}

const lock = await own<{ exists: boolean; ways: string[] }>('open');
let open = false;

const goOnline = async (invite?: string) => {
  open = true;
  await own('connect', STORAGE, invite);
};

const web: Bridge['web'] = {
  passkey: () => lock.ways.some((way) => way !== 'words'),
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
  state: async (): Promise<AppState> => ({ home: 'Weave', hasIdentity: lock.exists || open, connected: open, locked: lock.exists && !open }),
  /** A new person, with a passkey where the browser has one; where it hasn't, the words alone open the account. */
  init: async (name) => {
    const invite = invitation();
    if (!invite) throw new Error('Weave on the web is by invitation for now: open the link you were given');
    const passkey = await makePasskey(name).catch((error: Error) => (console.warn('no passkey:', error.message), undefined));
    const { words } = await own<{ words: string }>('create', name, passkey);
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
