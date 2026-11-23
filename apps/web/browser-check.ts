// Weave Web in a real Chrome, start to end: node apps/web/browser-check.ts
//
// What tests can't reach: WebAuthn with PRF (a virtual authenticator of Chrome's), OPFS, a service worker, the services in
// their Workers, the start without a network. It runs Chrome headless on a throwaway profile and dev.ts on its own port,
// with nothing of any real home. CHROME says which browser, if it isn't where Chrome usually is.

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { b64u, boxTo, decodeContact, didFromPublicKey, generateKeyPair } from '@weave/core';
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
  return spawn(process.execPath, [join(import.meta.dirname, 'dev.ts')], { env: { ...process.env, PORT: String(PORT) }, stdio: process.env.SERVER_LOG ? 'inherit' : 'ignore' });
}

/** The DevTools protocol, as far as this needs it. */
async function devtools(url: string) {
  const socket = new WebSocket(url);
  await new Promise((resolve) => socket.addEventListener('open', resolve));
  let next = 1;
  const waiting = new Map<number, { resolve(value: Record<string, unknown>): void; reject(error: Error): void }>();
  // What Chrome says by itself (with a domain enabled), kept for a step to look at.
  const events: Array<{ method: string; params: Record<string, unknown> }> = [];
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(String(data)) as { id?: number; method?: string; params?: Record<string, unknown>; result?: Record<string, unknown>; error?: { message: string } };
    if (message.method) events.push({ method: message.method, params: message.params ?? {} });
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
  return { send, run, events, close: () => socket.close() };
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
const browser = spawn(chrome, ['--headless=new', `--remote-debugging-port=${DEBUG}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', 'about:blank'], { stdio: 'ignore' });

try {
  await until('the page', async () => (await fetch(`${ORIGIN}/sw.js`)).ok, 60_000);
  const target = await until('Chrome', async () => {
    const tabs = (await (await fetch(`http://127.0.0.1:${DEBUG}/json/list`)).json()) as Array<{ type: string; webSocketDebuggerUrl: string }>;
    return tabs.find((tab) => tab.type === 'page');
  });
  const { send, run, events, close } = await devtools(target.webSocketDebuggerUrl);
  await send('Page.enable');
  await send('Runtime.enable');
  await send('WebAuthn.enable');
  await send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true } });

  const open = async (url: string) => {
    await send('Page.navigate', { url });
    await until('the page to answer', () => run<boolean>(`document.readyState === 'complete' && !!document.querySelector('#root')`));
  };
  const appUp = () => until('the app', () => run<boolean>(`!!document.querySelector('.app-window')`));
  // Locked, Weave asks for the passkey at once; where that waits for a tap, the tap.
  const unlocked = () =>
    until(
      'the account open',
      async () => {
        if (await run<boolean>(`!!document.querySelector('.app-window')`)) return true;
        if (await run<boolean>(`!!document.querySelector('#unlock-passkey') && !document.querySelector('#unlock-passkey').disabled`)) await run(`document.querySelector('#unlock-passkey').click()`);
        return false;
      },
      30_000,
    );
  const lockedOrOpen = `!!document.querySelector('#unlock-words') || !!document.querySelector('.app-window')`;
  const call = <T>(method: string, ...args: unknown[]) => run<{ result?: T; error?: string }>(`window.weave.call(${JSON.stringify(method)}, ...${JSON.stringify(args)})`);
  const texts = async () => ((await call<Array<{ text: string }>>('messages', 'Climb')).result ?? []).map((m) => m.text);
  // The way on: a window's default button, or on Weave Web's first stage its primary one.
  const clickDefault = `(document.querySelector('.buttons button.default') ?? document.querySelector('.first-btn.primary')).click()`;

  await open(ORIGIN);
  await until('the first screen', () => run<boolean>(`!!document.querySelector('#first-create')`));
  await run(`document.querySelector('#first-create').click()`);
  await until('the name', () => run<boolean>(`!!document.querySelector('#welcome-name')`));
  await run(`(() => { const input = document.querySelector('#welcome-name'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Webby'); input.dispatchEvent(new Event('input', { bubbles: true })); ${clickDefault}; })()`);
  // With a passkey a newcomer comes straight in; the words wait under Keys & devices until written down.
  await appUp();
  if (await run<boolean>(`!!document.querySelector('.notice.alarm')`)) throw new Error('no passkey was made');
  passed('a passkey with PRF makes an account and opens it at once');
  await run(`location.hash = '#/keys'`);
  await until('the words waiting', () => run<boolean>(`!!document.querySelector('#later-words button.default')`));
  await run(`document.querySelector('#later-words button.default').click()`);
  await until('the words', () => run<boolean>(`!!document.querySelector('#later-wrote')`));
  // All 24 words to the clipboard at once, numbered: the way a restore takes them back.
  await run(`navigator.clipboard.writeText = async (text) => void (window.__copied = text)`);
  await run(`document.querySelector('#copy-words').click()`);
  const copied = await until('the words copied', () => run<string>(`window.__copied`));
  const listed = await run<string[]>(`[...document.querySelectorAll('.words li')].map((li) => li.textContent.replace(/^\\s*\\d+\\.\\s*/, ''))`);
  if (copied !== listed.map((w, i) => `${i + 1}. ${w}`).join('\n')) throw new Error(`copied ${JSON.stringify(copied)}`);
  if (process.env.SHOTS) writeFileSync(join(process.env.SHOTS, 'words.png'), Buffer.from(((await send('Page.captureScreenshot')) as { data: string }).data, 'base64'));
  passed('the 24 words copy at once');
  // Weave's own contacts for newcomers, as `weave init` adds them: martl, through the front door.
  for (const link of bundle.contacts) {
    const { did } = decodeContact(link);
    await until('a contact Weave ships with', async () => (await call<{ following?: boolean }>('profile', did)).result?.following);
  }
  passed('it knows the contacts Weave ships with');
  await run(`document.querySelector('#later-wrote').click()`);
  await sleep(100);
  await run(`document.querySelector('#later-words .buttons button:not(#copy-words)').click()`);
  await until('the words forgotten', () => run<boolean>(`!document.querySelector('#later-words')`));
  if (await run<string | undefined>(`window.weave.web.laterWords()`)) throw new Error('the browser still keeps the words');
  passed('written down, the browser forgets the words');
  await run(`location.hash = '#/'`);

  const { link } = await run<{ link: string }>(`fetch('/dev/invite').then((r) => r.json())`);
  // What "Open link" shows before joining.
  const look = await call<{ space?: { name?: string } }>('lookAtInvite', link);
  if (look.error || look.result?.space?.name !== 'Climb') throw new Error(`the invitation wasn't looked at: ${look.error ?? JSON.stringify(look.result)}`);
  await call('joinSpace', link);
  await until('the group', async () => (await texts()).includes('the rope is in the van'));
  passed('it joins a group and reads it');
  await call('say', { space: 'Climb', text: 'from Chrome' });
  await until('the other person', async () => ((await (await fetch(`${ORIGIN}/dev/messages`)).json()) as string[]).includes('from Chrome'));
  passed('the other person reads what it says');
  const attached = await call<{ ref?: string }>('putFile', { data: btoa('a small file'), name: 'note.txt', type: 'text/plain' });
  if (attached.error) throw new Error(`no file attached: ${attached.error}`);
  passed('it attaches a file');

  // On a computer's width: the logo in the title bar, and a hint that the desktop app does more, until it's hidden.
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await run(`location.hash = '#/saved'`);
  await run(`location.hash = '#/'`);
  await until('the desktop hint', () => run<boolean>(`!!document.querySelector('.desktop-hint a[href*="releases"]')`));
  if (!(await run<boolean>(`[...document.querySelectorAll('img.weave-mark')].some((img) => img.complete && img.naturalWidth > 0)`))) throw new Error('no Weave logo in the page');
  if (process.env.SHOTS) writeFileSync(join(process.env.SHOTS, 'desktop-hint.png'), Buffer.from(((await send('Page.captureScreenshot')) as { data: string }).data, 'base64'));
  await run(`document.querySelector('.desktop-hint button').click()`);
  await until('the hint hidden', () => run<boolean>(`!document.querySelector('.desktop-hint') && localStorage.getItem('weave.desktopHint.hidden') === '1'`));
  passed('on a computer, the logo shows and a hint to get the desktop app, which hides for good');

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

  // A widget Lena sends into Climb, released in a project the browser isn't in: nothing of it runs before it's approved;
  // then its component, fetched and checked by the node, is transpiled in its Worker, folds, and a vote of the browser's
  // reaches Lena. Its view builds itself from its files in its sandboxed frame (lens-frame.html) in the group's chat.
  const widget = (await (await fetch(`${ORIGIN}/dev/widget`)).json()) as { id: string };
  type WidgetView = { approved: boolean; state?: { votes?: Array<{ choice: string }> }; problem?: string };
  const unapproved = await until('the widget', async () => (await call<WidgetView>('widgetView', { message: widget.id })).result, 30_000);
  if (unapproved.approved || unapproved.state !== undefined) throw new Error(`the widget ran before it was approved: ${JSON.stringify(unapproved)}`);
  const approved = await call<WidgetView>('approveWidget', { message: widget.id });
  if (approved.error || approved.result?.problem || !approved.result?.state) throw new Error(`the widget didn't run: ${approved.error ?? approved.result?.problem ?? 'no state'}`);
  const voted = await call('widgetAction', { message: widget.id, action: 'vote', input: { choice: 'web' } });
  if (voted.error) throw new Error(`the widget's action failed: ${voted.error}`);
  const refused = await call('widgetAction', { message: widget.id, action: 'post' });
  if (!/never proposes weave.post/.test(refused.error ?? '')) throw new Error(`a widget proposed weave.post: ${refused.error ?? 'it went through'}`);
  await until("Lena's node folding the vote", async () => JSON.stringify(await (await fetch(`${ORIGIN}/dev/widget-state?id=${widget.id}`)).json()).includes('"web"'), 40_000);
  passed('a widget runs only once approved, transpiled in the page, and its vote reaches the group');
  const climb = (await call<Array<{ id: string; name: string }>>('spaces')).result!.find((s) => s.name === 'Climb')!;
  await run(`location.hash = ${JSON.stringify(`#/g/${climb.id}`)}`);
  await until("the widget's view, built in its frame", () => run<boolean>(`document.querySelector('iframe.widget-frame')?.dataset.loaded === '1'`), 40_000);
  if ((await run<string>(`document.querySelector('iframe.widget-frame').getAttribute('sandbox')`)) !== 'allow-scripts') throw new Error("the widget's frame isn't sandboxed as it should be");
  passed("the widget's view shows in the chat, sandboxed");

  // Lena's website, in a tab of its own (its own origin) that reaches her computer through the storage node's relay: the
  // page, what its script asks for, and the cookie it set, all through the tunnel.
  const { party, website } = (await (await fetch(`${ORIGIN}/dev/invite`)).json()) as { party: string; website: string };
  await call('joinSpace', party);
  await until("Lena's website", async () => ((await call<Array<{ id: string; mayJoin?: boolean }>>('websites', 'Party')).result ?? []).some((w) => w.id === website && w.mayJoin), 30_000);
  await run(`window.weave.web.openWebsite({ id: ${JSON.stringify(website)}, name: 'Party' })`);
  const websiteTab = await until('the website tab', async () => ((await (await fetch(`http://127.0.0.1:${DEBUG}/json/list`)).json()) as Array<{ id: string; type: string; url: string; webSocketDebuggerUrl: string }>).find((t) => t.type === 'page' && /\.localhost:/.test(t.url)));
  const site = await devtools(websiteTab.webSocketDebuggerUrl);
  await site.send('Runtime.enable');
  const websiteText = await until(
    'the website, through the tunnel',
    async () => {
      const text = await site.run<string | undefined>(`document.querySelector('iframe')?.contentDocument?.body?.innerText`);
      return text?.includes('api:') ? text : undefined;
    },
    45_000,
  ).catch(async (error: Error) => {
    const state = await site.run<string>(`JSON.stringify({ worker: !!navigator.serviceWorker.controller, frame: document.querySelector('iframe')?.contentDocument?.body?.innerText?.slice(0, 200) })`).catch((e: Error) => e.message);
    throw new Error(`${error.message}; the tab says: ${await site.run<string>(`document.body.innerText.slice(0, 300)`)}; ${state}`);
  });
  if (!websiteText.includes("Hello from Lena's website") || !websiteText.includes('visit=1')) throw new Error(`the website showed: ${websiteText}`);
  // An event stream that never ends, piece by piece: a second tick means it's live, not waited out.
  const ticked = await until('its event stream, through the tunnel', async () => { const text = await site.run<string | undefined>(`document.querySelector('iframe')?.contentDocument?.querySelector('#sse')?.textContent`); return /tick [2-9]/.test(text ?? '') ? text : undefined; }, 30_000);
  const echoed = await until('its WebSocket, through the tunnel', async () => { const text = await site.run<string | undefined>(`document.querySelector('iframe')?.contentDocument?.querySelector('#ws')?.textContent`); return text?.startsWith('ws:') ? text : undefined; }, 30_000);
  if (echoed !== 'ws: echo: hello') throw new Error(`the WebSocket said: ${echoed}`);
  site.close();
  await fetch(`http://127.0.0.1:${DEBUG}/json/close/${websiteTab.id}`);
  passed("Lena's website opens in a tab of its own, through the relay, with its WebSocket and its event stream", [websiteText.split('\n').at(-1), echoed, ticked]);

  // Opened again: now its service worker answers for the tab's own page too.
  await run(`window.weave.web.openWebsite({ id: ${JSON.stringify(website)}, name: 'Party' })`);
  const againTab = await until('the website tab again', async () => ((await (await fetch(`http://127.0.0.1:${DEBUG}/json/list`)).json()) as Array<{ id: string; type: string; url: string; webSocketDebuggerUrl: string }>).find((t) => t.type === 'page' && /\.localhost:/.test(t.url)));
  const again = await devtools(againTab.webSocketDebuggerUrl);
  await again.send('Runtime.enable');
  await until('the website again', async () => (await again.run<string | undefined>(`document.querySelector('iframe')?.contentDocument?.body?.innerText`))?.includes('api:'), 45_000).catch(async (error: Error) => {
    throw new Error(`${error.message}; the tab says: ${await again.run<string>(`document.body?.innerText?.slice(0, 300) ?? location.href`).catch((e: Error) => e.message)}`);
  });
  again.close();
  await fetch(`http://127.0.0.1:${DEBUG}/json/close/${againTab.id}`);
  passed('and again, with its service worker in charge of the tab');

  // On a phone: over Weave, in a frame of Weave's own page (no second browser bar), from the project's Live page.
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  const partyId = ((await call<Array<{ id: string; name: string }>>('spaces')).result ?? []).find((s) => s.name === 'Party')!.id;
  await run(`location.hash = '#/p/${partyId}/live'`);
  await until('the website on the Live page', () => run<boolean>(`!!document.querySelector('.room button.play')`), 30_000);
  await run(`document.querySelector('.room button.play').click()`);
  const framedText = await until(
    'the website over Weave',
    async () => {
      const text = await run<string | undefined>(`(() => { const outer = document.querySelector('.website-frame iframe'); if (!outer) return undefined; return 'framed'; })()`);
      return text;
    },
    15_000,
  );
  // The website's frame is another origin: what it shows is read from its own target.
  const framedTarget = await until('its frame', async () => ((await (await fetch(`http://127.0.0.1:${DEBUG}/json/list`)).json()) as Array<{ type: string; url: string; webSocketDebuggerUrl: string }>).find((t) => t.type === 'iframe' && /\.localhost:/.test(t.url)));
  const framed = await devtools(framedTarget.webSocketDebuggerUrl);
  await framed.send('Runtime.enable');
  const framedShows = await until(
    'the website in the frame',
    async () => {
      const text = await framed.run<string | undefined>(`document.querySelector('iframe')?.contentDocument?.body?.innerText`);
      return text?.includes('ws: echo') && text.includes('api:') ? text : undefined;
    },
    45_000,
  ).catch(async (error: Error) => {
    throw new Error(`${error.message}; the frame says: ${await framed.run<string>(`document.body?.innerText?.slice(0, 300)`).catch((e: Error) => e.message)}`);
  });
  framed.close();
  // Weave's controls wait behind the corner button: open them, then close.
  await run(`document.querySelector('.website-frame-handle').click()`);
  await until('the menu', () => run<boolean>(`!!document.querySelector('.website-frame-menu')`));
  if (process.env.SHOTS) writeFileSync(join(process.env.SHOTS, 'framed.png'), Buffer.from(((await send('Page.captureScreenshot')) as { data: string }).data, 'base64'));
  await run(`document.querySelector('.website-frame-close').click()`);
  await until('the frame closed', () => run<boolean>(`!document.querySelector('.website-frame')`));
  await run(`location.hash = '#/'`);
  await send('Emulation.clearDeviceMetricsOverride');
  passed('on a phone it opens over Weave, in a frame', [framedText, framedShows.split('\n').filter((l) => l.startsWith('ws:')).join('')]);

  // On an iPhone it takes Weave's whole window: Weave hands the visit over in the address and goes; the website runs
  // without Weave beside it, and its corner leads back, where Weave is locked again.
  await run(`window.weave.web.visitWebsite({ id: ${JSON.stringify(website)}, name: 'Party' })`).catch(() => undefined);
  await until('the website in the whole window', async () => {
    const text = await run<string | undefined>(`location.hash === '' && /\\.localhost:/.test(location.host) ? document.querySelector('iframe')?.contentDocument?.body?.innerText : undefined`).catch(() => undefined);
    return text?.includes('ws: echo') && /tick [1-9]/.test(text) ? text : undefined;
  }, 45_000).catch(async (error: Error) => {
    throw new Error(`${error.message}; it shows: ${await run<string>(`location.href + ' ' + document.body?.innerText?.slice(0, 300)`).catch((e: Error) => e.message)}`);
  });
  await run(`[...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Weave').click()`);
  await run(`[...document.querySelectorAll('button')].find((b) => /Back to Weave|Zurück zu Weave/.test(b.textContent)).click()`).catch(() => undefined);
  await until('Weave again', () => run<boolean>(`location.origin === ${JSON.stringify(ORIGIN)} && (${lockedOrOpen})`), 30_000);
  await unlocked();
  passed('on an iPhone it takes the whole window, and leads back to Weave');

  // Lena puts another website live on her computer while the project's Live page is open here: it shows, no reload.
  {
    await run(`location.hash = '#/p/${partyId}/live'`);
    await until('the Live page', () => run<boolean>(`document.querySelectorAll('.room').length > 0`), 30_000);
    const before = await run<number>(`document.querySelectorAll('.room').length`);
    const opened = (await (await fetch(`${ORIGIN}/dev/website-open?name=Encore`)).json()) as { id: string; error?: string };
    if (opened.error) throw new Error(`Lena couldn't open another website: ${opened.error}`);
    const encore = opened.id;
    const listed = await until('the new website, in the node', async () => ((await call<Array<{ id: string }>>('websites')).result ?? []).some((w) => w.id === encore) || undefined, 30_000).catch(() => false);
    const shown = await until('the new website, on the page', () => run<boolean>(`document.querySelectorAll('.room').length > ${before}`), 15_000).catch(() => false);
    if (!listed || !shown) throw new Error(`Lena's new website: in the node ${listed}, on the page ${shown}`);
    // A project's notifications, at its head: quiet, and still quiet when the page is shown again.
    await run(`location.hash = '#/p/${partyId}'`);
    await until('the notification switch', () => run<boolean>(`!!document.querySelector('.notice-switch select')`), 20_000);
    await run(`(() => { const s = document.querySelector('.notice-switch select'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, 'off'); s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await sleep(1500);
    await run(`location.hash = '#/'`);
    await sleep(500);
    await run(`location.hash = '#/p/${partyId}'`);
    await until('the project still quiet', () => run<boolean>(`document.querySelector('.notice-switch select')?.value === 'off'`), 20_000);
    await run(`(() => { const s = document.querySelector('.notice-switch select'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, 'on'); s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await sleep(500);
    await run(`location.hash = '#/'`);
    passed('a website put live on a computer shows on the page that is open, without a reload');
    passed('a project goes quiet from its own head, and stays so');
  }

  await until('the service worker', () => run<boolean>(`navigator.serviceWorker.ready.then((r) => !!r.active)`));
  passed('the service worker is there');
  // Installable as an app of its own (Android: its own window, no browser bars), as Chrome itself judges it.
  const { installabilityErrors } = (await send('Page.getInstallabilityErrors')) as { installabilityErrors: Array<{ errorId: string }> };
  if (installabilityErrors.length) throw new Error(`not installable: ${installabilityErrors.map((e) => e.errorId).join(', ')}`);
  passed('Chrome can install it as an app of its own');

  // Push on this device (docs/web-push.md), this browser's side: a push sealed to its push key, delivered to its
  // service worker, opened there. Chrome without a window says no to notifications, so the way through the storage node
  // and the push service is tested on its own (storagepush.test.ts, webpush.test.ts); here Chrome hands the push to the
  // service worker itself. Weave is in front, so the service worker gives it to the page rather than showing it.
  {
    await send('Runtime.enable');
    await send('ServiceWorker.enable');
    type Registration = { registrationId: string; scopeURL: string; isDeleted?: boolean };
    const registrationId = await until('the service worker registration', async () =>
      events
        .filter((e) => e.method === 'ServiceWorker.workerRegistrationUpdated')
        .flatMap((e) => e.params.registrations as Registration[])
        .find((r) => r.scopeURL.startsWith(ORIGIN) && !r.isDeleted)?.registrationId,
    );
    const pair = generateKeyPair();
    const key = { address: 'check', did: didFromPublicKey(pair.publicKey), secretKey: b64u.encode(pair.secretKey), publicKey: b64u.encode(pair.publicKey) };
    const putKey = (value: unknown) =>
      run(`new Promise((done, fail) => { const r = indexedDB.open('weave-push', 1); r.onupgradeneeded = () => r.result.createObjectStore('keys'); r.onerror = () => fail(r.error); r.onsuccess = () => { const tx = r.result.transaction('keys', 'readwrite'); const s = tx.objectStore('keys'); ${value === null ? `s.delete('current')` : `s.put(${JSON.stringify(value)}, 'current')`}; tx.oncomplete = () => (r.result.close(), done(true)); tx.onerror = () => fail(tx.error); }; })`);
    await putKey(key);
    await run(`(window.__pushes = [], addEventListener('weave-push', (e) => window.__pushes.push(e.detail)))`);
    const sealed = boxTo(key.did, { title: 'Probe', text: 'from the check', open: '#/' });
    await send('ServiceWorker.deliverPushMessage', { origin: ORIGIN, registrationId, data: JSON.stringify({ from: 'did:key:check', sealed }) });
    await until('the push, opened by the service worker', () => run<boolean>(`window.__pushes.some((p) => p.title === 'Probe' && p.text === 'from the check')`), 20_000).catch((error: Error) => {
      const said = events.filter((e) => e.method === 'Runtime.consoleAPICalled').map((e) => JSON.stringify((e.params.args as Array<{ value?: unknown }>).map((a) => a.value))).filter((line) => /push/i.test(line));
      throw new Error(`${error.message}; the page said: ${said.join(' | ') || 'nothing about it'}`);
    });
    await putKey(null);
    passed('push: one sealed to this browser is opened by its service worker');
    // The number on Weave's icon: what the app counted, kept for the service worker to count on from.
    const badge = await until('the count for the icon', () => run<number | null>(`new Promise((done) => { const r = indexedDB.open('weave-push', 1); r.onsuccess = () => { const g = r.result.transaction('keys').objectStore('keys').get('badge'); g.onsuccess = () => (r.result.close(), done(typeof g.result === 'number' ? g.result : null)); }; })`).then((n) => (n === null ? undefined : { n })));
    passed("the app keeps its count for Weave's icon", badge.n);

    // Stage 3: pushes on in this browser give each place an address of its own, sealed to whoever runs it. Lena runs
    // Climb: her node opens Webby's address there, seals what she says to its key, and the service worker opens it with
    // that place's key. (A real subscription needs a window Chrome lets ask; the storage node takes this one's word.)
    const dev = async <T>(path: string) => (await (await fetch(`${ORIGIN}${path}`)).json()) as T;
    const said = await call('pushPlaces', { endpoint: `https://fcm.googleapis.com/fcm/send/check-${Date.now()}`, p256dh: 'BCheck', auth: 'check' });
    if (said.error) throw new Error(`pushes on: ${said.error}`);
    const address = await until("Webby's address in Climb, as Lena opens it", async () => (await dev<string[]>('/dev/push-targets'))[0], 30_000);
    const placeKey = await until("that address's key, in this browser", () =>
      run<{ did: string } | null>(`new Promise((done) => { const r = indexedDB.open('weave-push', 1); r.onsuccess = () => { const g = r.result.transaction('keys').objectStore('keys').get(${JSON.stringify(`addr:${address}`)}); g.onsuccess = () => (r.result.close(), done(g.result ?? null)); }; })`).then((k) => k ?? undefined),
    );
    await fetch(`${ORIGIN}/dev/say?text=${encodeURIComponent('push from Lena')}`, { method: 'POST' });
    const message = await until('what Lena pushed to it', async () => (await dev<Array<{ address: string; from: string; sealed: unknown }>>('/dev/pushed')).find((p) => p.address === address));
    await send('ServiceWorker.deliverPushMessage', { origin: ORIGIN, registrationId, data: JSON.stringify({ from: message.from, to: address, sealed: message.sealed }) });
    await until("Lena's push, opened with the place's key", () => run<boolean>(`window.__pushes.some((p) => p.title === 'Lena · Climb' && p.text === 'push from Lena')`));
    passed("push: a place's own address, sealed to the one who runs it, and her message opened with that place's key", placeKey.did.slice(0, 16));
    // Off: every address goes back, and Lena can't open one any more.
    await call('pushPlaces');
    await until('the address taken back', async () => (await dev<string[]>('/dev/push-targets')).length === 0, 30_000);
    // A relay that doesn't forget sends it again: the key is gone, so it isn't shown.
    await send('ServiceWorker.deliverPushMessage', { origin: ORIGIN, registrationId, data: JSON.stringify({ from: message.from, to: address, sealed: message.sealed }) });
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const shownTimes = await run<number>(`window.__pushes.filter((p) => p.text === 'push from Lena').length`);
    if (shownTimes !== 1) throw new Error(`a push to an address taken back was shown (${shownTimes} times in all)`);
    passed("push off takes back every place's address, and what still comes to one isn't shown");
  }

  // On a phone's width: what the menu bar has on a computer is under Settings.
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  const shown = (selector: string) => `(() => { const el = document.querySelector(${JSON.stringify(selector)}); return !!el && getComputedStyle(el).display !== 'none'; })()`;
  await until('the My hub tab', () => run<boolean>(shown('.toolbar a.mobile-only[href="#/space"]')));
  await run(`document.querySelector('.toolbar a.mobile-only[href="#/space"]').click()`);
  await until('the hub, with Settings', () => run<boolean>(shown('.pane-head button.mobile-only')));
  if (process.env.SHOTS) writeFileSync(join(process.env.SHOTS, 'hub.png'), Buffer.from(((await send('Page.captureScreenshot')) as { data: string }).data, 'base64'));
  await run(`document.querySelector('.pane-head button.mobile-only').click()`);
  await until('Settings', () => run<boolean>(`location.hash === '#/me' && !!document.querySelector('a.me-row[href="#/keys"]') && document.querySelectorAll('.page select').length >= 2`));
  if (process.env.SHOTS) writeFileSync(join(process.env.SHOTS, 'me.png'), Buffer.from(((await send('Page.captureScreenshot')) as { data: string }).data, 'base64'));
  await run(`location.hash = '#/'`);
  await send('Emulation.clearDeviceMetricsOverride');
  passed('on a phone, My hub has Settings: keys and the look');

  // Lena links a browser from her computer. A browser of its own (a context with nothing in it) opens the link, makes a
  // passkey, and is Lena there: no words asked.
  const { link: browserLink } = (await (await fetch(`${ORIGIN}/dev/link-browser?name=chrome&origin=${encodeURIComponent(ORIGIN)}`)).json()) as { link: string };
  const chromeItself = await devtools(((await (await fetch(`http://127.0.0.1:${DEBUG}/json/version`)).json()) as { webSocketDebuggerUrl: string }).webSocketDebuggerUrl);
  const { browserContextId } = (await chromeItself.send('Target.createBrowserContext')) as { browserContextId: string };
  const { targetId } = (await chromeItself.send('Target.createTarget', { url: 'about:blank', browserContextId })) as { targetId: string };
  const linkedTab = await devtools(`ws://127.0.0.1:${DEBUG}/devtools/page/${targetId}`);
  await linkedTab.send('Page.enable');
  await linkedTab.send('Runtime.enable');
  await linkedTab.send('WebAuthn.enable');
  await linkedTab.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true } });
  await linkedTab.send('Page.navigate', { url: browserLink });
  await until('the link screen', () => linkedTab.run<boolean>(`!!document.querySelector('#link-browser')`));
  if (await linkedTab.run<boolean>(`location.hash !== ''`)) throw new Error("the link's secret stayed in the address bar");
  await linkedTab.run(`document.querySelector('#link-browser').click()`);
  await until('the linked app', () => linkedTab.run<boolean>(`!!document.querySelector('.app-window')`), 30_000).catch(async (error: Error) => {
    throw new Error(`${error.message}; it shows: ${await linkedTab.run<string>(`document.body.innerText.slice(0, 400)`)}`);
  });
  const linkedCall = <T>(method: string, ...args: unknown[]) => linkedTab.run<{ result?: T; error?: string }>(`window.weave.call(${JSON.stringify(method)}, ...${JSON.stringify(args)})`);
  const linkedAs = (await linkedCall<{ name?: string }>('profile')).result?.name;
  if (linkedAs !== 'Lena') throw new Error(`the linked browser is ${linkedAs}, not Lena`);
  await until("Lena's group, in the linked browser", async () => ((await linkedCall<Array<{ text: string }>>('messages', 'Climb')).result ?? []).some((m) => m.text === 'the rope is in the van'));
  linkedTab.close();
  await chromeItself.send('Target.disposeBrowserContext', { browserContextId });
  chromeItself.close();
  passed("a browser linked from Lena's computer is Lena, without her words");

  // Lena's words alone, in a browser that has nothing, while her computer is online: she comes as a device of her own.
  {
    const { words: lenaWords } = (await (await fetch(`${ORIGIN}/dev/words`)).json()) as { words: string };
    const { invite } = (await (await fetch(`${ORIGIN}/dev/invite`)).json()) as { invite: string };
    const browser = await devtools(((await (await fetch(`http://127.0.0.1:${DEBUG}/json/version`)).json()) as { webSocketDebuggerUrl: string }).webSocketDebuggerUrl);
    const { browserContextId: context } = (await browser.send('Target.createBrowserContext')) as { browserContextId: string };
    const { targetId: target } = (await browser.send('Target.createTarget', { url: 'about:blank', browserContextId: context })) as { targetId: string };
    const tab = await devtools(`ws://127.0.0.1:${DEBUG}/devtools/page/${target}`);
    await tab.send('Page.enable');
    await tab.send('Runtime.enable');
    await tab.send('WebAuthn.enable');
    await tab.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true } });
    await tab.send('Page.navigate', { url: `${ORIGIN}/?invite=${invite}` });
    await until('the first screen', () => tab.run<boolean>(`!!document.querySelector('#first-words')`));
    await tab.run(`document.querySelector('#first-words').click()`);
    await until('the words screen', () => tab.run<boolean>(`!!document.querySelector('#restore-words')`));
    // Numbered, one per line, as the copy button gives them.
    const typed = lenaWords.split(' ').map((w, i) => `${i + 1}. ${w}`).join('\n');
    await tab.run(`(() => { const area = document.querySelector('#restore-words'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(area, ${JSON.stringify(typed)}); area.dispatchEvent(new Event('input', { bubbles: true })); ${clickDefault}; })()`);
    await until('Lena, from her words', () => tab.run<boolean>(`!!document.querySelector('.app-window')`), 70_000).catch(async (error: Error) => {
      throw new Error(`${error.message}; it shows: ${await tab.run<string>(`document.body.innerText.slice(0, 400)`)}`);
    });
    const tabCall = <T>(method: string, ...args: unknown[]) => tab.run<{ result?: T; error?: string }>(`window.weave.call(${JSON.stringify(method)}, ...${JSON.stringify(args)})`);
    const as = (await tabCall<{ name?: string }>('profile')).result?.name;
    if (as !== 'Lena') throw new Error(`the words brought ${as}, not Lena`);
    await until("Lena's group, from her computer", async () => ((await tabCall<Array<{ text: string }>>('messages', 'Climb')).result ?? []).some((m) => m.text === 'the rope is in the van'), 40_000);
    if (!(await tab.run<string[]>(`window.weave.web.ways()`)).some((way) => way !== 'words')) throw new Error('no passkey was made for the next time');
    tab.close();
    await browser.send('Target.disposeBrowserContext', { browserContextId: context });
    browser.close();
    passed("Lena's words from her computer bring her to an empty browser, spaces and a passkey with her");
  }

  // Leaving this browser, and coming back with nothing but the passkey.
  const who = (await call<{ did: string; signer: string }>('whoami')).result!;
  await sleep(600);
  await run(`void window.weave.web.forget()`);
  await until('an empty browser', () => run<boolean>(`!!document.querySelector('#first-passkey.primary')`));
  if (process.env.SHOTS) writeFileSync(join(process.env.SHOTS, 'first.png'), Buffer.from(((await send('Page.captureScreenshot')) as { data: string }).data, 'base64'));
  passed('leaving takes everything from this browser, and asks first for a passkey');
  await run(`document.querySelector('#first-passkey').click()`);
  await appUp();
  const back = (await call<{ did: string; signer: string }>('whoami')).result!;
  if (back.did !== who.did || back.signer === who.signer) throw new Error(`came back as ${JSON.stringify(back)}, was ${JSON.stringify(who)}`);
  await until('the history', async () => (await texts()).includes('from Chrome'));
  passed('the passkey alone brings the account back, with a device key of its own');

  await open(ORIGIN);
  // Locked after a reload, and the passkey asked for at once: open without a click.
  await until('the passkey, asked at once', () => run<boolean>(`!!document.querySelector('.app-window')`), 20_000);
  passed('a reload locks it, and asks for the passkey at once');
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
  // The lock screen in every look (it keeps the one chosen).
  if (process.env.SHOTS)
    for (const skin of ['', 'win95', 'clean', 'cozy', 'arcade']) {
      if (skin) await tab.run(`void (document.documentElement.dataset.skin = ${JSON.stringify(skin)})`);
      await sleep(200);
      writeFileSync(join(process.env.SHOTS, `locked${skin && `-${skin}`}.png`), Buffer.from(((await tab.send('Page.captureScreenshot')) as { data: string }).data, 'base64'));
    }
  passed('it takes the account over, and the first tab lets go');
  await run(`document.querySelector('#take-over').click()`);
  await until('the first tab to have it again', () => run<boolean>(lockedOrOpen));
  await until('the second tab to let go', () => tab.run<boolean>(takeOver));
  tab.close();
  await fetch(`http://127.0.0.1:${DEBUG}/json/close/${second.id}`);
  await unlocked();
  passed('and the first takes it back');

  server.kill();
  await until('the server to go', () => fetch(`${ORIGIN}/health`).then(() => false, () => true));
  await open(ORIGIN);
  await until('the lock, offline', () => run<boolean>(lockedOrOpen));
  passed('without a network the page starts');
  await unlocked();
  const offline = await texts();
  if (!offline.includes('from Chrome')) throw new Error(`read ${JSON.stringify(offline)} offline`);
  passed('and it opens and reads', offline.length);

  server = startServer();
  await until('the server to come back', async () => (await fetch(`${ORIGIN}/sw.js`)).ok, 60_000);

  // A link from Lena's computer, opened in a browser that holds another account: emptied, then linked.
  {
    const { link } = (await (await fetch(`${ORIGIN}/dev/link-browser?name=phone&origin=${encodeURIComponent(ORIGIN)}`)).json()) as { link: string };
    // As from the camera: a new page load, not a change of the # in a page that's open.
    await send('Page.navigate', { url: 'about:blank' });
    await sleep(500);
    await open(link);
    await until('the lock, with the link waiting', () => run<boolean>(`!!document.querySelector('#empty-and-link')`), 20_000).catch(async (error: Error) => {
      throw new Error(`${error.message}; it shows: ${await run<string>(`document.body.innerText.slice(0, 300)`)}`);
    });
    if (await run<boolean>(`!!document.querySelector('.app-window')`)) throw new Error('it opened the account here, with a link waiting');
    await run(`window.confirm = () => true; document.querySelector('#empty-and-link').click()`);
    await sleep(300);
    await run(`document.querySelector('.question-text')?.parentElement?.querySelector('.buttons button.default')?.click()`);
    await until('the link screen', () => run<boolean>(`!!document.querySelector('#link-browser')`), 30_000);
    await run(`document.querySelector('#link-browser').click()`);
    await appUp();
    const as = (await call<{ name?: string }>('profile')).result?.name;
    if (as !== 'Lena') throw new Error(`linked as ${as}, not Lena`);
    passed('a link opened where another account is: the browser is emptied, and linked');
  }

  // The app on an iPhone's home screen is a browser of its own, which a scanned code never reaches: the link, pasted.
  {
    const { link } = (await (await fetch(`${ORIGIN}/dev/link-browser?name=homescreen&origin=${encodeURIComponent(ORIGIN)}`)).json()) as { link: string };
    const { invite } = (await (await fetch(`${ORIGIN}/dev/invite`)).json()) as { invite: string };
    const browser = await devtools(((await (await fetch(`http://127.0.0.1:${DEBUG}/json/version`)).json()) as { webSocketDebuggerUrl: string }).webSocketDebuggerUrl);
    const { browserContextId: context } = (await browser.send('Target.createBrowserContext')) as { browserContextId: string };
    const { targetId: target } = (await browser.send('Target.createTarget', { url: 'about:blank', browserContextId: context })) as { targetId: string };
    const tab = await devtools(`ws://127.0.0.1:${DEBUG}/devtools/page/${target}`);
    await tab.send('Page.enable');
    await tab.send('Runtime.enable');
    await tab.send('WebAuthn.enable');
    await tab.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true } });
    await tab.send('Page.navigate', { url: `${ORIGIN}/?invite=${invite}` });
    await until('the first screen', () => tab.run<boolean>(`!!document.querySelector('#first-link')`));
    await tab.run(`document.querySelector('#first-link').click()`);
    await until('the paste screen', () => tab.run<boolean>(`!!document.querySelector('#paste-link')`));
    // The camera, to scan the code: it opens over the page, and Cancel closes it again.
    await tab.run(`document.querySelector('#scan-link').click()`);
    await until('the camera', () => tab.run<boolean>(`!!document.querySelector('#weave-scan video') && document.querySelector('#weave-scan video').readyState >= 2`), 20_000);
    await tab.run(`[...document.querySelectorAll('button')].find((b) => b.textContent === 'Cancel' || b.textContent === 'Abbrechen').click()`);
    await until('the camera closed', () => tab.run<boolean>(`!document.querySelector('#weave-scan') && !!document.querySelector('#paste-link')`));
    await tab.run(`(() => { const area = document.querySelector('#paste-link'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(area, ${JSON.stringify(`here: ${link}`)}); area.dispatchEvent(new Event('input', { bubbles: true })); ${clickDefault}; })()`);
    await until('the link screen', () => tab.run<boolean>(`!!document.querySelector('#link-browser')`));
    await tab.run(`document.querySelector('#link-browser').click()`);
    await until('Lena, linked by a pasted link', () => tab.run<boolean>(`!!document.querySelector('.app-window')`), 30_000);
    const as = (await tab.run<{ result?: { name?: string } }>(`window.weave.call('profile')`)).result?.name;
    if (as !== 'Lena') throw new Error(`linked as ${as}, not Lena`);
    tab.close();
    await browser.send('Target.disposeBrowserContext', { browserContextId: context });
    browser.close();
    passed('a link pasted, not scanned, links a browser too (the home-screen app on an iPhone)');
  }
  close();
  console.log(`\n${steps.length} steps passed`);
} finally {
  server.kill();
  browser.kill();
  await sleep(500);
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
