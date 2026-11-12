import type { ErrorAnswer } from '@weave/core';
import type { FeedItem } from '@weave/node/client';
import type { AppState, Bridge } from '../../desktop/src/renderer/bridge.ts';
import { sha256 } from '@noble/hashes/sha2.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import { askPasskey, makePasskey } from './passkey.ts';
import { openPlan, parseOnboardLink, planCheck, type OnboardPlan } from '@weave/core';
import { StorageClient } from '@weave/net/browser';

declare const ROOMS_BASE: string;

/**
 * A website's tab or frame asks for its pass, and later for new relay tickets: answered to it alone (by its window and
 * its origin), for this website alone. `failed`: it says it can't run here (a frame without its service worker).
 */
function answerWebsite(room: { id: string }, origin: string, window: () => Window | null, failed?: (why: string) => void): () => void {
  const answer = async ({ origin: from, source, data }: MessageEvent<{ type?: string; key?: string; error?: string }>) => {
    const to = window();
    if (from !== origin || !to || source !== to) return;
    const reply = (message: Record<string, unknown>) => to.postMessage(message, origin);
    if (data?.type === 'weave-website-failed') return failed?.(data.error ?? 'the website could not start here');
    if (data?.type === 'weave-website') {
      const pass = await ask('websitePass', { room: room.id, key: data.key });
      if ('error' in pass) return reply({ type: 'weave-website-pass', error: pass.error });
      const ticket = await own<string>('relayTicket').catch((error: Error) => ({ error: error.message }));
      if (typeof ticket !== 'string') return reply({ type: 'weave-website-pass', error: ticket.error });
      return reply({ type: 'weave-website-pass', ...(pass.result as object), ticket });
    }
    if (data?.type === 'weave-website-ticket') {
      const ticket = await own<string>('relayTicket').catch((error: Error) => ({ error: error.message }));
      return reply(typeof ticket === 'string' ? { type: 'weave-website-ticket', ticket } : { type: 'weave-website-ticket', error: ticket.error });
    }
  };
  const listen = (event: MessageEvent) => void answer(event);
  addEventListener('message', listen);
  return () => removeEventListener('message', listen);
}

/** A website's own origin: {label} in ROOMS_BASE (build.ts) is a name made from its id, lower case, as DNS has them. */
function websiteOrigin(id: string): string {
  const bytes = sha256(new TextEncoder().encode(`weave/website/v1 ${id}`));
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let label = '';
  for (let i = 0, bits = 0, value = 0; i < bytes.length && label.length < 26; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5 && label.length < 26) label += alphabet[(value >>> (bits -= 5)) & 31];
  }
  return ROOMS_BASE.replace('{label}', label);
}

/*
 * Weave in a browser: the desktop's renderer, as it is, with a bridge to the node in the Worker where it would have one to
 * the daemon (docs/web-stage2.md, step 8). The renderer takes whatever stands in `window.weave`, so this sets it first and
 * loads the renderer after.
 */

declare const STORAGE_ORIGIN: string;
/** The storage node: where the build said (build.ts), or the page's own origin (dev.ts, a node that serves its page). */
const STORAGE_AT = STORAGE_ORIGIN || location.origin;
const STORAGE = `${STORAGE_AT.replace(/^http/, 'ws')}/storage`;
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

/*
 * An onboarding link (idea bZFDCQNT): /j/<code>#<secret>. It leaves the address bar at once, like an invitation; its plan
 * is fetched and opened here, so the welcome can say who invites to what. Making the account takes a use of the link,
 * which brings the storage node's invitation with it; then the plan's steps run (followOnboardLink, counted).
 * Someone with an account here gets the renderer's Join? dialog, once the account is open.
 */
const ONBOARD_KEY = 'weave.onboard';
if (/^\/j\/[A-Za-z0-9]{8}$/.test(location.pathname) && location.hash.length > 1) {
  sessionStorage.setItem(ONBOARD_KEY, `${location.origin}${location.pathname}${location.hash}`);
  history.replaceState(null, '', '/');
}
const onboardLink = sessionStorage.getItem(ONBOARD_KEY) ?? undefined;
/*
 * /play/<code>: a quick start kept as an app of its own (the home screen, the start menu). The address stays, since its
 * manifest is the game's (name, picture, start), and the renderer goes to the game (#/play/<code>) once the account is
 * open; nothing secret is in it.
 */
const playing = /^\/play\/([A-Za-z0-9]{8})$/.exec(location.pathname)?.[1];
if (playing && !location.hash.startsWith('#/play/')) history.replaceState(null, '', `${location.pathname}#/play/${playing}`);
/** A storage node over a socket of this page (its origin is the page's). */
async function storageClient(): Promise<StorageClient> {
  const ws = new WebSocket(STORAGE);
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve());
    ws.addEventListener('error', () => reject(new Error("the storage node can't be reached")));
  });
  return StorageClient.connect({
    send: (text) => ws.send(text),
    close: () => ws.close(),
    onMessage: (handle) => ws.addEventListener('message', (e) => handle(String(e.data))),
    onClose: (handle) => ws.addEventListener('close', () => handle()),
  });
}
/** The link's plan, opened here; nothing when it no longer works (the welcome says so). */
const onboardPlan: { plan?: OnboardPlan; problem?: string } = {};
if (onboardLink) {
  const parts = parseOnboardLink(onboardLink);
  await Promise.race([
    (async () => {
      if (!parts) throw new Error('this link is not whole: ask for it again');
      const client = await storageClient();
      try {
        onboardPlan.plan = openPlan((await client.getPlan(parts.code)).sealed, parts.secret);
      } finally {
        client.close();
      }
    })().catch((error: Error) => void (onboardPlan.problem = error.message)),
    new Promise((resolve) => setTimeout(resolve, 8000)),
  ]);
}
/** Take a use of the link with a new account: the storage node's invitation comes back with it. */
async function takeOnboardInvite(): Promise<string> {
  const parts = parseOnboardLink(onboardLink!)!;
  const client = await storageClient();
  try {
    const { invite } = await client.takePlan(parts.code, planCheck(parts.secret), true);
    if (!invite) throw new Error('the storage node gave no invitation with this link');
    return invite;
  } finally {
    client.close();
  }
}
/** Run the link's steps with the account that's open now, and open what it says. */
let linkListener: ((link: string) => void) | undefined;
async function followOnboard(counted: boolean): Promise<void> {
  if (!onboardLink) return;
  sessionStorage.removeItem(ONBOARD_KEY);
  if (!counted) {
    // An account that was here already: the renderer asks first (its Join? dialog).
    linkListener?.(onboardLink);
    return;
  }
  const done = await own<{ open?: { kind: string; id: string } }>('followOnboardLink', onboardLink, STORAGE_AT, { counted: true });
  // Kept as a quick start: its route opens the project and enters the game.
  const code = parseOnboardLink(onboardLink)?.code;
  if (done.open && code) location.hash = `#/play/${code}`;
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
  openWebsite: (room) => {
    const origin = websiteOrigin(room.id);
    const tab = window.open(`${origin}/`, '_blank');
    if (!tab) throw new Error('the browser kept the website from opening a tab: allow pop-ups for Weave');
    answerWebsite(room, origin, () => tab);
  },
  visitWebsite: async (room) => {
    // A key for this visit (sodium's form: the seed, then the public key), its proofs for hours, a relay ticket for as
    // long: all the website needs while Weave isn't there. The way back is where this page is now.
    const seed = ed25519.utils.randomSecretKey();
    const publicKey = ed25519.getPublicKey(seed);
    const hex = Array.from(publicKey, (b) => b.toString(16).padStart(2, '0')).join('');
    const HOURS = 6;
    const pass = await ask('websitePass', { room: room.id, key: hex, hours: HOURS });
    if ('error' in pass) throw new Error(String(pass.error));
    const ticket = await own<string>('relayTicket', HOURS);
    const secret = new Uint8Array(64);
    secret.set(seed);
    secret.set(publicKey, 32);
    const visit = { ...(pass.result as object), ticket, secret: btoa(String.fromCharCode(...secret)), back: location.href };
    const handed = btoa(unescape(encodeURIComponent(JSON.stringify(visit)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    location.href = `${websiteOrigin(room.id)}/#weave=${handed}`;
  },
  websiteFrame: (room) => {
    const origin = websiteOrigin(room.id);
    let frame: Window | null = null;
    let failed: (why: string) => void = () => {};
    const stop = answerWebsite(room, origin, () => frame, (why) => failed(why));
    return {
      url: `${origin}/`,
      attach: (window, onFailed) => void ((frame = window), (failed = onFailed)),
      detach: () => stop(),
    };
  },
  linking: () => !lock?.exists && sessionStorage.getItem(LINK_KEY) !== null,
  link: async () => {
    const invite = given || invitation();
    if (!invite) throw new Error('Weave on the web is by invitation for now: give the invitation you were given');
    // A passkey opens this browser; with no words here, it's the way in.
    const made = await makePasskey('Weave');
    // The handover waits at the storage node (/link/…), which is reached over its socket after.
    await own('link', STORAGE_AT, sessionStorage.getItem(LINK_KEY), made);
    sessionStorage.removeItem(LINK_KEY);
    passkey = true;
    await goOnline(invite);
  },
  needsInvite: () => !invitation() && !onboardPlan.plan,
  onboarding: () => (onboardPlan.plan ? { by: onboardPlan.plan.by.name ?? 'Someone', title: onboardPlan.plan.title, welcome: (onboardPlan.plan.steps.find((s) => s.do === 'welcome') as { text?: string } | undefined)?.text } : onboardPlan.problem ? { problem: onboardPlan.problem } : undefined),
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
    void followOnboard(false);
  },
  arrive: async (words) => {
    await own('arrive', STORAGE, words ? { words } : await askPasskey());
    await goOnline();
    void followOnboard(false);
  },
};

window.weave = {
  web,
  state: async (): Promise<AppState> => (lock ? { home: 'Weave', hasIdentity: lock.exists || open, connected: open, locked: lock.exists && !open } : { home: 'Weave', hasIdentity: true, connected: false, elsewhere: true }),
  /** A new person, with a passkey where the browser has one; where it hasn't, the words alone open the account. */
  init: async (name) => {
    // With an onboarding link, its use brings the invitation; the plan runs once the account is online.
    const viaLink = !given && !!onboardPlan.plan;
    const invite = viaLink ? await takeOnboardInvite() : given || invitation();
    if (!invite) throw new Error('Weave on the web is by invitation for now: open the link you were given');
    const made = await makePasskey(name).catch((error: Error) => (console.warn('no passkey:', error.message), undefined));
    passkey = !!made;
    const { words } = await own<{ words: string }>('create', name, made);
    await goOnline(invite);
    if (viaLink) await followOnboard(true).catch((error: Error) => console.warn('the link\'s steps:', error.message));
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
  onLink: (listener) => void (linkListener = listener),
};

await import('../../desktop/src/renderer/main.tsx');
