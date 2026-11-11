// Weave Web in a real Chrome, start to end: node apps/web/browser-check.ts
//
// What tests can't reach: WebAuthn with PRF (a virtual authenticator of Chrome's), OPFS, a service worker, the services in
// their Workers, the start without a network. It runs Chrome headless on a throwaway profile and dev.ts on its own port,
// with nothing of any real home. CHROME says which browser, if it isn't where Chrome usually is.

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodeContact } from '@weave/core';
import bundle from '../../weave.bundle.json' with { type: 'json' };

const PORT = 8795;
const DEBUG = 9335;
const ORIGIN = `http://localhost:${PORT}`;
const CHROMES = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function until<T>(what: string, ready: () => Promise<T | undefined | false>, timeoutMs = 20_000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await ready().catch(() => undefined);
    if (value) return value;
    if (Date.now() - start > timeoutMs) throw new Error(`timed out: ${what}`);
    await sleep(100);
  }
}

function startServer(): ChildProcess {
  return spawn(process.execPath, [join(import.meta.dirname, 'dev.ts')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
}

/** The DevTools protocol, as far as this needs it. */
async function devtools(url: string) {
  const socket = new WebSocket(url);
  await new Promise((resolve) => socket.addEventListener('open', resolve));
  let next = 1;
  const waiting = new Map<number, { resolve(value: Record<string, unknown>): void; reject(error: Error): void }>();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(String(data)) as { id?: number; result?: Record<string, unknown>; error?: { message: string } };
    const call = message.id === undefined ? undefined : waiting.get(message.id);
    if (message.error) call?.reject(new Error(message.error.message));
    else call?.resolve(message.result ?? {});
  });
  const send = (method: string, params: Record<string, unknown> = {}) =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      const id = next++;
      waiting.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const run = async <T>(expression: string): Promise<T> => {
    const answer = (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true })) as { result: { value: T }; exceptionDetails?: { exception?: { description?: string }; text: string } };
    if (answer.exceptionDetails) throw new Error(answer.exceptionDetails.exception?.description ?? answer.exceptionDetails.text);
    return answer.result.value;
  };
  return { send, run, close: () => socket.close() };
}

const steps: Array<[string, unknown]> = [];
const passed = (step: string, detail: unknown = true) => {
  steps.push([step, detail]);
  console.log(`ok  ${step}`, detail === true ? '' : JSON.stringify(detail));
};

const chrome = CHROMES.find((path) => path && existsSync(path));
if (!chrome) throw new Error('no Chrome here: say where with CHROME');

const profile = mkdtempSync(join(tmpdir(), 'weave-web-chrome-'));
let server = startServer();
const browser = spawn(chrome, ['--headless=new', `--remote-debugging-port=${DEBUG}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });

try {
  await until('the page', async () => (await fetch(`${ORIGIN}/sw.js`)).ok, 60_000);
  const target = await until('Chrome', async () => {
    const tabs = (await (await fetch(`http://127.0.0.1:${DEBUG}/json/list`)).json()) as Array<{ type: string; webSocketDebuggerUrl: string }>;
    return tabs.find((tab) => tab.type === 'page');
  });
  const { send, run, close } = await devtools(target.webSocketDebuggerUrl);
  await send('Page.enable');
  await send('Runtime.enable');
  await send('WebAuthn.enable');
  await send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true } });

  const open = async (url: string) => {
    await send('Page.navigate', { url });
    await until('the page to answer', () => run<boolean>(`document.readyState === 'complete' && !!document.querySelector('#root')`));
  };
  const appUp = () => until('the app', () => run<boolean>(`!!document.querySelector('.app-window')`));
  const call = <T>(method: string, ...args: unknown[]) => run<{ result?: T; error?: string }>(`window.weave.call(${JSON.stringify(method)}, ...${JSON.stringify(args)})`);
  const texts = async () => ((await call<Array<{ text: string }>>('messages', 'Climb')).result ?? []).map((m) => m.text);
  const clickDefault = `document.querySelector('.buttons button.default').click()`;

  await open(ORIGIN);
  await until('the first screen', () => run<boolean>(`!!document.querySelector('#welcome-name')`));
  await run(`(() => { const input = document.querySelector('#welcome-name'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Webby'); input.dispatchEvent(new Event('input', { bubbles: true })); ${clickDefault}; })()`);
  await until('the words', () => run<boolean>(`!!document.querySelector('#wrote')`));
  if (await run<boolean>(`!!document.querySelector('.notice.alarm')`)) throw new Error('no passkey was made');
  passed('a passkey with PRF makes an account');
  // Weave's own contacts for newcomers, as `weave init` adds them: martl, through the front door.
  for (const link of bundle.contacts) {
    const { did } = decodeContact(link);
    await until('a contact Weave ships with', async () => (await call<{ following?: boolean }>('profile', did)).result?.following);
  }
  passed('it knows the contacts Weave ships with');
  await run(`document.querySelector('#wrote').click()`);
  await sleep(100);
  await run(clickDefault);
  await appUp();

  const { link } = await run<{ link: string }>(`fetch('/dev/invite').then((r) => r.json())`);
  await call('joinSpace', link);
  await until('the group', async () => (await texts()).includes('the rope is in the van'));
  passed('it joins a group and reads it');
  await call('say', { space: 'Climb', text: 'from Chrome' });
  await until('the other person', async () => ((await (await fetch(`${ORIGIN}/dev/messages`)).json()) as string[]).includes('from Chrome'));
  passed('the other person reads what it says');

  const id = (await call<Array<{ id: string }>>('spaces')).result![0].id;
  const hints = () => call<Array<{ hints: Array<{ tooltip?: string }> }>>('hints', { slot: 'place', subjects: [{ space: id }] });
  await hints();
  await sleep(500);
  await fetch(`${ORIGIN}/dev/say?text=${encodeURIComponent('hey @Webby')}`, { method: 'POST' });
  const counted = await until('a count', async () => (await hints()).result?.[0].hints[0]?.tooltip);
  passed('Unread counts a mention', counted);

  // GitHub's verifier runs here and asks GitHub: octocat's gist is octocat's, and doesn't hold this account's line.
  const platforms = (await call<Array<{ platform: string; prove?: true }>>('platforms')).result!;
  if (!platforms.some((p) => p.platform === 'github' && !p.prove)) throw new Error(`GitHub isn't there, proven by hand: ${JSON.stringify(platforms)}`);
  const linked = await call('linkAccount', { platform: 'github', handle: 'octocat', proof: 'https://gist.github.com/octocat/6cad326836d38bd3a7ae' });
  if (!/doesn't hold/.test(linked.error ?? '')) throw new Error(`GitHub's verifier didn't answer: ${linked.error ?? 'it held'}`);
  passed("GitHub's verifier asks GitHub, from the browser");

  await until('the service worker', () => run<boolean>(`navigator.serviceWorker.ready.then((r) => !!r.active)`));
  passed('the service worker is there');

  // On a phone's width: what the menu bar has on a computer is under Me.
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await until('the Me tab', () => run<boolean>(`(() => { const me = document.querySelector('.toolbar a[href="#/me"]'); return !!me && getComputedStyle(me).display !== 'none'; })()`));
  await run(`location.hash = '#/me'`);
  await until('Me', () => run<boolean>(`!!document.querySelector('.me-hub') && !!document.querySelector('a.me-row[href="#/keys"]') && document.querySelectorAll('.page select').length >= 2`));
  if (process.env.SHOTS) writeFileSync(join(process.env.SHOTS, 'me.png'), Buffer.from(((await send('Page.captureScreenshot')) as { data: string }).data, 'base64'));
  await run(`document.querySelector('.me-hub').click()`);
  await until('the hub', () => run<boolean>(`location.hash === '#/space'`));
  if (process.env.SHOTS) writeFileSync(join(process.env.SHOTS, 'hub.png'), Buffer.from(((await send('Page.captureScreenshot')) as { data: string }).data, 'base64'));
  await run(`location.hash = '#/'`);
  await send('Emulation.clearDeviceMetricsOverride');
  passed('on a phone, Me has the hub, keys and the look');

  // Leaving this browser, and coming back with nothing but the passkey.
  const who = (await call<{ did: string; signer: string }>('whoami')).result!;
  await sleep(600);
  await run(`void window.weave.web.forget()`);
  await until('an empty browser', () => run<boolean>(`!!document.querySelector('#welcome-name')`));
  passed('leaving takes everything from this browser');
  await run(`[...document.querySelectorAll('.buttons button')].find((b) => !b.classList.contains('default')).click()`);
  await until('the way back', () => run<boolean>(`document.querySelectorAll('.buttons button').length === 3`));
  await run(`document.querySelectorAll('.buttons button')[1].click()`);
  await appUp();
  const back = (await call<{ did: string; signer: string }>('whoami')).result!;
  if (back.did !== who.did || back.signer === who.signer) throw new Error(`came back as ${JSON.stringify(back)}, was ${JSON.stringify(who)}`);
  await until('the history', async () => (await texts()).includes('from Chrome'));
  passed('the passkey alone brings the account back, with a device key of its own');

  await open(ORIGIN);
  await until('the lock', () => run<boolean>(`!!document.querySelector('#unlock-words')`));
  passed('a reload locks it');
  await run(clickDefault);
  await appUp();
  passed('the passkey opens it again');
  if (!(await run<boolean>(`!!navigator.serviceWorker.controller`))) throw new Error('no service worker in charge');

  // A second tab: one tab at a time has the account, and the second takes it over.
  const second = (await (await fetch(`http://127.0.0.1:${DEBUG}/json/new?${encodeURIComponent(ORIGIN)}`, { method: 'PUT' })).json()) as { id: string; webSocketDebuggerUrl: string };
  const tab = await devtools(second.webSocketDebuggerUrl);
  await tab.send('Runtime.enable');
  const takeOver = `!!document.querySelector('#take-over')`;
  const locked = `!!document.querySelector('#unlock-words')`;
  await until('the second tab to say so', () => tab.run<boolean>(takeOver));
  passed('a second tab says the account is open in another');
  await tab.run(`document.querySelector('#take-over').click()`);
  await until('the first tab to let go', () => run<boolean>(takeOver));
  await until('the second tab to have it', () => tab.run<boolean>(locked));
  passed('it takes the account over, and the first tab lets go');
  await run(`document.querySelector('#take-over').click()`);
  await until('the first tab to have it again', () => run<boolean>(locked));
  await until('the second tab to let go', () => tab.run<boolean>(takeOver));
  tab.close();
  await fetch(`http://127.0.0.1:${DEBUG}/json/close/${second.id}`);
  await run(clickDefault);
  await appUp();
  passed('and the first takes it back');

  server.kill();
  await until('the server to go', () => fetch(`${ORIGIN}/health`).then(() => false, () => true));
  await open(ORIGIN);
  await until('the lock, offline', () => run<boolean>(`!!document.querySelector('#unlock-words')`));
  passed('without a network the page starts');
  await run(clickDefault);
  await appUp();
  const offline = await texts();
  if (!offline.includes('from Chrome')) throw new Error(`read ${JSON.stringify(offline)} offline`);
  passed('and it opens and reads', offline.length);

  server = startServer();
  await until('the server to come back', async () => (await fetch(`${ORIGIN}/sw.js`)).ok, 60_000);
  close();
  console.log(`\n${steps.length} steps passed`);
} finally {
  server.kill();
  browser.kill();
  await sleep(500);
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
