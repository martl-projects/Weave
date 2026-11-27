// The phone app's screens over a node of the phone's own, in a real Chrome: node apps/mobile/screen-check.ts
//
// What the worker's test can't reach: the desktop's screens over the bridge, from no account to a group with a message
// in it, and a widget another person sends, whose component runs on the screen. It builds the screens and the worker
// (build.ts --web --own), runs dev-web.ts --own on a throwaway home, and Chrome headless at a phone's size on a
// throwaway profile. The other person is a computer's node in this process; both are on a DHT of this check's own, so
// neither touches the public one. CHROME says which browser, if it isn't where Chrome usually is. `--shot file.png`
// keeps a picture of the end.

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import createTestnet from 'hyperdht/testnet.js';
import { closeOpenStores, loadConfig, resolveHome, saveConfig, WeaveNode } from '@weave/node';
import { buildComponent } from '../../packages/node/test/helpers/components.ts';
import { folderWith, releaseFolder } from '../../packages/node/test/helpers/release.ts';

const PORT = 8796;
const DEBUG = 9336;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const CHROMES = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'];
const here = import.meta.dirname;
const shot = process.argv.includes('--shot') ? process.argv[process.argv.indexOf('--shot') + 1] : undefined;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function until<T>(what: string, ready: () => Promise<T | undefined | false>, timeoutMs = 30_000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await ready().catch(() => undefined);
    if (value) return value;
    if (Date.now() - start > timeoutMs) throw new Error(`timed out: ${what}`);
    await sleep(150);
  }
}

const passed = (step: string, detail: unknown = true) => console.log(`ok  ${step}`, detail === true ? '' : JSON.stringify(detail));

const chrome = CHROMES.find((path) => path && existsSync(path));
if (!chrome) throw new Error('no Chrome here: say where with CHROME');

execFileSync(process.execPath, ['build.ts', '--web', '--own'], { cwd: here, stdio: 'ignore' });
const data = mkdtempSync(join(tmpdir(), 'weave-phone-own-'));
const profile = mkdtempSync(join(tmpdir(), 'weave-phone-chrome-'));
// Lena, on a computer: a group to join, and later a widget sent into it.
const testnet = await createTestnet(3);
const lenaDir = mkdtempSync(join(tmpdir(), 'weave-phone-lena-'));
const lena = WeaveNode.init('Lena', lenaDir);
lena.config = { ...loadConfig(resolveHome(lenaDir)), bootstrap: testnet.bootstrap };
saveConfig(resolveHome(lenaDir), lena.config);
await lena.createGroup('Climb');
await lena.say({ space: 'Climb', text: 'the rope is in the van' });
await lena.goOnline();
const server = spawn(process.execPath, [join(here, 'dev-web.ts'), '--own', '--data', data, '--port', String(PORT), '--bootstrap', `${testnet.bootstrap[0].host}:${testnet.bootstrap[0].port}`], { stdio: process.env.SERVER_LOG ? 'inherit' : 'ignore' });
const browser = spawn(chrome, ['--headless=new', `--remote-debugging-port=${DEBUG}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--window-size=390,844', 'about:blank'], { stdio: 'ignore' });

let failed: unknown;
try {
  await until('the server', () => fetch(ORIGIN).then((r) => r.ok));
  const target = await until('Chrome', async () => ((await (await fetch(`http://127.0.0.1:${DEBUG}/json`)).json()) as Array<{ type: string; webSocketDebuggerUrl: string }>).find((t) => t.type === 'page'));
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => socket.addEventListener('open', resolve));
  let next = 1;
  const wrong: string[] = [];
  const waiting = new Map<number, { resolve(value: Record<string, unknown>): void; reject(error: Error): void }>();
  socket.addEventListener('message', ({ data: raw }) => {
    const message = JSON.parse(String(raw)) as { id?: number; method?: string; params?: Record<string, unknown>; result?: Record<string, unknown>; error?: { message: string } };
    // What the page says went wrong, for the step that fails after it.
    if (message.method === 'Runtime.exceptionThrown') wrong.push(JSON.stringify((message.params as { exceptionDetails?: { exception?: { description?: string }; text?: string } }).exceptionDetails?.exception?.description ?? message.params).slice(0, 700));
    if (message.method === 'Runtime.consoleAPICalled' && (message.params as { type: string }).type === 'error') wrong.push(JSON.stringify((message.params as { args: Array<{ value?: unknown; description?: string }> }).args.map((a) => a.value ?? a.description)).slice(0, 700));
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
  const text = () => run<string>('document.body.innerText');

  await send('Runtime.enable');
  await send('Page.enable');
  // The lines between the screen and its worker, kept in the page for a step that fails.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__lines = []; const F = window.fetch; window.fetch = (u, o) => { if (String(u) === '/worker') window.__lines.push('> ' + String(o && o.body).slice(0, 140)); return F(u, o); }; const E = window.EventSource; window.EventSource = class extends E { constructor(u) { super(u); this.addEventListener('message', (m) => window.__lines.push('< ' + String(m.data).slice(0, 140))); this.addEventListener('open', () => window.__lines.push('open')); } };` });
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: ORIGIN });
  await until('the bridge', () => run<boolean>('typeof window.weave === "object" && typeof window.weave.state === "function"'));

  // No account yet, and nothing to pair with: the screens are a computer's, asking for an account.
  const first = await run<{ home: string; hasIdentity: boolean; connected: boolean; phone: boolean }>('window.weave.state().then((s) => ({ ...s, phone: !!window.weave.phone }))');
  if (first.hasIdentity || first.phone) throw new Error(`started as ${JSON.stringify(first)}`);
  passed('the app starts without an account, and without pairing', first);
  const welcome = await until('the first screen', async () => (await text()).trim());
  passed('the first screen shows', welcome.split('\n').filter(Boolean).slice(0, 3));

  // A new account, made by the node in the worker: its words come back, once.
  const words = await run<string>('window.weave.init("Phone")');
  if (words.trim().split(/\s+/).length !== 24) throw new Error(`init gave ${JSON.stringify(words).slice(0, 80)}`);
  passed('a new account, with its 24 words');

  // The node answers the screens' calls, and its events come back to them.
  await run('window.__seen = []; window.weave.onEvent((item) => window.__seen.push(item.kind))');
  const me = await run<{ name: string; did: string }>('window.weave.call("whoami").then((a) => a.result)');
  await run('window.weave.call("createGroup", "Friends")');
  await run('window.weave.call("createProject", { name: "Gartenplan" })');
  await run('window.weave.call("say", { space: "Friends", text: "hello from the phone\'s own node" })');
  const chat = await run<string[]>('window.weave.call("messages", "Friends").then((all) => all.result.map((m) => m.text))');
  if (me.name !== 'Phone' || !chat.includes("hello from the phone's own node")) throw new Error(`whoami ${JSON.stringify(me)}, chat ${JSON.stringify(chat)}`);
  passed('the node answers: who am I, a group, a message', { name: me.name, chat });
  const seen = await until('the node\'s events', async () => {
    const kinds = await run<string[]>('window.__seen');
    return kinds.length ? kinds : undefined;
  });
  passed('its events reach the screen', seen);

  // Opened again: the account is there, and the screens show it.
  if (wrong.length) throw new Error(`the page said: ${wrong.join(' | ')}; lines: ${(await run<string[]>('window.__lines.slice(-40)')).join('\n')}`);
  await send('Page.navigate', { url: ORIGIN });
  await until('the bridge again', () => run<boolean>('typeof window.weave === "object"'));
  const again = await run<{ home: string; hasIdentity: boolean; connected: boolean }>('window.weave.state()');
  if (!again.hasIdentity || !again.connected || again.home !== 'Phone') throw new Error(`came back as ${JSON.stringify(again)}`);
  passed('opened again, the account is there', again);
  // A call that isn't a phone's answers with its error, as a computer's bridge does, for the screens to throw.
  const refused = await run<{ error?: string }>('window.weave.call("pairPhone")');
  if (!/isn't on a phone/.test(refused.error ?? '')) throw new Error(`pairPhone answered ${JSON.stringify(refused)}`);
  passed('what a phone can\'t do says so', refused.error);
  const shown = await until('the project on the screen', async () => {
    const all = await text();
    return all.includes('Gartenplan') ? all : undefined;
  }).catch(async (error: Error) => {
    if (shot) writeFileSync(shot, Buffer.from(((await send('Page.captureScreenshot', { format: 'png' })) as { data: string }).data, 'base64'));
    throw new Error(`${error.message}; the screen says: ${JSON.stringify((await text()).slice(0, 600))}; the page said: ${wrong.join(' | ') || 'nothing'}; lines: ${(await run<string[]>('window.__lines.slice(-40)')).join('\n')}`);
  });
  if (wrong.length) throw new Error(`the page said: ${wrong.join(' | ')}`);
  passed('the screens show its places', shown.split('\n').filter(Boolean).slice(0, 4));

  // Lena's group, over the DHT: what she said arrives, and what the phone says reaches her.
  const call = <T>(method: string, ...args: unknown[]) => run<{ result?: T; error?: string }>(`window.weave.call(${[method, ...args].map((a) => JSON.stringify(a)).join(', ')})`);
  const joined = await call('joinSpace', await lena.invite('Climb'));
  if (joined.error) throw new Error(`joining Climb: ${joined.error}`);
  await until("Lena's message", async () => ((await call<Array<{ text: string }>>('messages', 'Climb')).result ?? []).some((m) => m.text === 'the rope is in the van'), 60_000);
  await call('say', { space: 'Climb', text: 'from the phone' });
  await until('Lena reading the phone', async () => (await lena.messages('Climb')).some((m) => m.text === 'from the phone'), 60_000);
  passed("it joins another person's group over the DHT, reads and is read");

  // A widget Lena sends into Climb, released in a project of hers: the phone's node fetches and checks it, and nothing
  // of it runs before it is approved. Then its component runs on the screen, in a Worker of its own, which transpiles
  // it from its bytes; it folds, and a vote from the phone reaches Lena.
  const component = readFileSync(await buildComponent(join(here, '..', '..', 'packages', 'node', 'test', 'helpers', 'wasm-widget-tally.js'), 'board'));
  await lena.createProject({ name: 'Games' });
  const manifest = { app: 'tally', name: 'Tally', widget: { component: 'tally.wasm', site: 'site', writes: ['tally.vote'], size: { height: 160 } } };
  const site = '<!doctype html><meta charset="utf-8"><main id="tally">…</main><script src="app.js"></script>';
  const script = "addEventListener('message', (e) => { if (e.data && e.data.weave === 'view') document.getElementById('tally').textContent = (e.data.state.votes || []).map((v) => v.by + ': ' + v.choice).join(', ') || 'no votes'; });";
  await releaseFolder(lena, { project: 'Games', tag: '1.0', folder: folderWith({ 'weave.app.json': JSON.stringify(manifest), 'tally.wasm': component, 'site/index.html': site, 'site/app.js': script }) });
  const widget = await lena.sendWidget({ space: 'Climb', project: 'Games', title: 'Lunch?' });
  type WidgetView = { approved: boolean; state?: { votes?: Array<{ choice: string }> }; problem?: string };
  const unapproved = await until('the widget', async () => (await call<WidgetView>('widgetView', { message: widget.id })).result, 60_000);
  if (unapproved.approved || unapproved.state !== undefined) throw new Error(`the widget ran before it was approved: ${JSON.stringify(unapproved)}`);
  const approved = await call<WidgetView>('approveWidget', { message: widget.id });
  if (approved.error || approved.result?.problem || !approved.result?.state) throw new Error(`the widget didn't run: ${approved.error ?? approved.result?.problem ?? 'no state'}; the page said: ${wrong.join(' | ') || 'nothing'}; lines: ${(await run<string[]>('window.__lines.slice(-12)')).join('\n')}`);
  passed('a widget runs once approved: its component on the screen, in a Worker of its own', approved.result.state);
  const voted = await call('widgetAction', { message: widget.id, action: 'vote', input: { choice: 'phone' } });
  if (voted.error) throw new Error(`the widget's action failed: ${voted.error}`);
  await until("Lena's node folding the vote", async () => JSON.stringify((await lena.widgetView({ message: widget.id })).state ?? null).includes('"phone"'), 60_000);
  passed('and a vote from the phone reaches the other person');

  if (shot) {
    const picture = (await send('Page.captureScreenshot', { format: 'png' })) as { data: string };
    writeFileSync(shot, Buffer.from(picture.data, 'base64'));
    passed('a picture of it', shot);
  }
  socket.close();
} catch (error) {
  failed = error;
} finally {
  browser.kill();
  server.kill();
  await lena.close().catch(() => {});
  closeOpenStores();
  await testnet.destroy();
  await sleep(500);
  for (const dir of [data, profile, lenaDir]) rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
if (failed) {
  console.error(failed);
  process.exit(1);
}
console.log('\nthe phone\'s own node carries the screens');
// The other person's node and its DHT may hold the process a while longer: nothing here is left to wait for.
process.exit(0);
