import './sodium-ready.ts';
import RelayedDHT from '@hyperswarm/dht-relay';
import RelayStream from '@hyperswarm/dht-relay/ws';
import b4a from 'b4a';
import sodium from 'sodium-universal';
import { ask, CookieJar, type Asked, type Tunnel } from './http.ts';
import { closeFrame, frame as wsFrame, FrameReader, OP, textOf, upgradeAnswer, upgradeRequest } from './wsframes.ts';

/*
 * A website's tab (docs/web-stage2.md, step 9), at <website>.weave-rooms.net: an origin of its own for each website,
 * never the same site as Weave's page. Weave opens it and gives it a pass (websitePass): the website's key, and the first
 * lines of its connections, signed by the person's key for this tab's own DHT key. The tab connects through the storage
 * node's relay itself, and the Noise handshake is its own: the relay passes bytes it can't read, and the person's key
 * stays with Weave. The website runs in a frame, and this page's service worker (sw.ts) sends everything it asks
 * through the tunnel.
 */

declare const WEB_ORIGIN: string;
declare const STORAGE_ORIGIN: string;

interface Pass {
  id: string;
  name: string;
  key: string;
  tunnel: string;
  control: string;
  ticket: string;
}

const say = (text: string) => void (document.querySelector('#say')!.textContent = text);

/**
 * What the website asked and what went wrong, kept here: Weave's menu shows it (Details), where a browser's own tools
 * aren't at hand (a phone).
 */
const lines: string[] = [];
let panel: HTMLPreElement | undefined;
const log = (line: string) => {
  lines.push(`${new Date().toISOString().slice(11, 19)} ${line}`);
  if (lines.length > 120) lines.shift();
  if (panel) panel.textContent = lines.join('\n');
};
addEventListener('message', ({ origin, data }: MessageEvent<{ type?: string }>) => {
  if (origin !== WEB_ORIGIN || data?.type !== 'weave-website-details') return;
  if (panel) return void ((panel.remove(), (panel = undefined)));
  panel = document.createElement('pre');
  panel.style.cssText = 'position:fixed;inset:auto 0 0 0;max-height:60%;overflow:auto;margin:0;padding:8px 8px calc(8px + env(safe-area-inset-bottom));background:rgba(0,0,0,.85);color:#9fe;font:11px/1.4 ui-monospace,monospace;white-space:pre-wrap;z-index:9';
  panel.textContent = lines.join('\n') || '(nothing yet)';
  document.body.append(panel);
});
addEventListener('error', (event) => log(`tab error: ${event.message}`));
addEventListener('unhandledrejection', (event) => log(`tab rejection: ${String((event.reason as Error)?.message ?? event.reason)}`));

/** Weave, which opened this website: the tab's opener, or the page around it when it's a frame of Weave's (a phone). */
const weave: Window | null = window.opener ?? (window.parent !== window ? window.parent : null);

/** This can't run here (a frame without its service worker): Weave offers a tab instead. */
const cantRunHere = (why: string) => {
  say(why);
  weave?.postMessage({ type: 'weave-website-failed', error: why }, WEB_ORIGIN);
};

const keyPair = { publicKey: b4a.alloc(32), secretKey: b4a.alloc(64) };
sodium.crypto_sign_keypair(keyPair.publicKey, keyPair.secretKey);
const ourKey = b4a.toString(keyPair.publicKey, 'hex');

/** Ask Weave, which opened this tab: only it answers, and only to this tab. */
function fromWeave<T>(type: string, answer: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Weave did not answer: open the website from Weave again')), 30_000);
    const listen = ({ origin, data }: MessageEvent<{ type?: string; error?: string } & T>) => {
      if (origin !== WEB_ORIGIN || data?.type !== answer) return;
      clearTimeout(timer);
      removeEventListener('message', listen);
      if (data.error) reject(new Error(data.error));
      else resolve(data);
    };
    addEventListener('message', listen);
    weave!.postMessage({ type, key: ourKey }, WEB_ORIGIN);
  });
}

let dht: RelayedDHT | undefined;

/** The relay, again with a new ticket when the last connection to it went. */
async function relayed(pass: Pass): Promise<RelayedDHT> {
  if (dht) return dht;
  const ticket = pass.ticket || (await fromWeave<{ ticket: string }>('weave-website-ticket', 'weave-website-ticket')).ticket;
  pass.ticket = '';
  const socket = new WebSocket(`${STORAGE_ORIGIN.replace(/^http/, 'ws')}/dht?ticket=${encodeURIComponent(ticket)}`);
  const made = new RelayedDHT(new RelayStream(true, socket), { custodial: false, keyPair });
  socket.addEventListener('close', () => {
    if (dht === made) dht = undefined;
  });
  dht = made;
  return made;
}

async function start(): Promise<void> {
  if (!weave) return say('Open this website from Weave.');
  say('Asking Weave…');
  const pass = await fromWeave<Pass>('weave-website', 'weave-website-pass');
  document.title = pass.name;
  const jar = new CookieJar();

  // What the website asks, from the service worker: through a tunnel of its own each time.
  // On the website's channel (sw.ts): its service worker asks, this tab answers.
  const channel = new BroadcastChannel('weave-website');
  // Each request once, by its id: it comes on the channel and from the service worker straight, and either may not.
  const taken = new Set<string>();
  const take = async (data: { type?: string; id?: string } & Asked, reply: (answer: Record<string, unknown>) => void) => {
    if (data?.type !== 'weave-ask' || !data.id || taken.has(data.id)) return;
    taken.add(data.id);
    log(`→ ${data.method} ${data.url}`);
    try {
      const tunnel = (await relayed(pass)).connect(b4a.from(pass.key, 'hex')) as unknown as Tunnel;
      tunnel.write(pass.tunnel);
      const cookie = jar.header();
      const asked: Asked = { ...data, headers: [...data.headers.filter(([n]) => n.toLowerCase() !== 'cookie'), ...(cookie ? [['Cookie', cookie] as [string, string]] : [])] };
      const answer = await ask(tunnel, asked, location.host);
      jar.take(answer.headers);
      log(`← ${answer.status} ${data.url} ${answer.body.byteLength}B ${answer.headers.find(([n]) => n.toLowerCase() === 'content-type')?.[1] ?? ''}`);
      reply({ ...answer, headers: answer.headers.filter(([n]) => n.toLowerCase() !== 'set-cookie') });
    } catch (error) {
      log(`✗ ${data.url}: ${(error as Error).message}`);
      reply({ error: (error as Error).message });
    }
  };
  channel.onmessage = ({ data }: MessageEvent<{ type?: string; id?: string } & Asked>) => void take(data, (answer) => channel.postMessage({ type: 'weave-answer', id: data.id, ...answer }));
  navigator.serviceWorker.addEventListener('message', ({ data, ports }: MessageEvent<{ type?: string; id?: string } & Asked>) => void (ports[0] && take(data, (answer) => ports[0].postMessage({ type: 'weave-answer', id: data.id, ...answer }))));
  // Messages from the service worker wait until asked for (Safari, with addEventListener).
  navigator.serviceWorker.startMessages();

  // The website's WebSockets, from its frame (ws.ts): each through a tunnel of its own, opened with an upgrade.
  (window as unknown as { __weaveWebSocket: unknown }).__weaveWebSocket = (
    path: string,
    protocols: string[],
    events: { open(protocol: string): void; message(binary: boolean, data: Uint8Array): void; close(code: number, reason: string, clean: boolean): void; error(): void },
  ) => {
    let tunnel: Tunnel | undefined;
    let open = false;
    let closed = false;
    const waiting: Uint8Array[] = [];
    const finish = (code: number, reason: string, clean: boolean) => {
      if (closed) return;
      closed = true;
      tunnel?.destroy();
      events.close(code, reason, clean);
    };
    log(`ws → ${path}`);
    const failed = () => {
      log(`ws failed ${path}`);
      if (!closed) events.error();
      finish(1006, '', false);
    };
    void (async () => {
      const t = (await relayed(pass)).connect(b4a.from(pass.key, 'hex')) as unknown as Tunnel;
      tunnel = t;
      if (closed) return t.destroy();
      t.write(pass.tunnel);
      const key = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
      t.write(upgradeRequest(path, location.host, protocols, jar.header(), key));
      const reader = new FrameReader();
      let head: Uint8Array | undefined = new Uint8Array(0);
      t.on('data', (chunk) => {
        if (head) {
          const all = new Uint8Array(head.length + chunk.length);
          all.set(head);
          all.set(chunk, head.length);
          const answer = upgradeAnswer(all);
          if (!answer) return void (head = all);
          if (answer.status !== 101) return failed();
          head = undefined;
          jar.take(answer.headers);
          open = true;
          log(`ws open ${path}`);
          events.open(answer.protocol);
          for (const f of waiting.splice(0)) t.write(f);
          chunk = answer.rest;
        }
        for (const got of reader.push(chunk)) {
          if (got.opcode === OP.text || got.opcode === OP.binary) events.message(got.opcode === OP.binary, got.payload);
          else if (got.opcode === OP.ping) t.write(wsFrame(OP.pong, got.payload));
          else if (got.opcode === OP.close) {
            const code = got.payload.length >= 2 ? (got.payload[0] << 8) | got.payload[1] : 1005;
            t.write(closeFrame(code === 1005 ? 1000 : code, ''));
            finish(code, textOf(got.payload.subarray(2)), true);
          }
        }
      });
      t.on('error', failed);
      t.on('close', () => finish(1006, '', false));
    })().catch(failed);
    return {
      send: (binary: boolean, data: Uint8Array) => {
        const f = wsFrame(binary ? OP.binary : OP.text, data);
        if (open && tunnel) tunnel.write(f);
        else waiting.push(f);
      },
      close: (code: number, reason: string) => {
        if (!open || !tunnel) return finish(code, reason, false);
        tunnel.write(closeFrame(code, reason));
        setTimeout(() => finish(code, reason, true), 1000);
      },
    };
  };

  say('Connecting…');
  // The service worker as this build has it: a browser keeps the one it has until asked (Safari, at least), so it's asked,
  // and the website waits for a new one to take over.
  if (!('serviceWorker' in navigator)) return cantRunHere('This browser runs no service worker here.');
  const registration = await navigator.serviceWorker.register('/__weave/sw.js', { scope: '/', updateViaCache: 'none' }).catch((error: Error) => {
    cantRunHere(`The website can't start here: ${error.message}`);
    return undefined;
  });
  if (!registration) return;
  await registration.update().catch(() => {});
  if (registration.installing || registration.waiting) {
    await new Promise<void>((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
      setTimeout(resolve, 8000);
    });
  }
  const ready = await Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise<false>((resolve) => setTimeout(() => resolve(false), 15_000))]);
  if (!ready) return cantRunHere("The website's service worker didn't start here.");
  // The website, in a frame the service worker answers for: where this tab was opened.
  const frame = document.createElement('iframe');
  frame.src = location.pathname + location.search;
  frame.allow = 'fullscreen; autoplay; clipboard-write';
  document.body.append(frame);
  frame.addEventListener('load', () => document.querySelector('#say')?.remove(), { once: true });
  // The website's own errors, in its frame (same origin): its scripts, and what it couldn't load.
  frame.addEventListener('load', () => {
    log(`frame loaded ${frame.contentWindow?.location.pathname ?? ''}`);
    const inside = frame.contentWindow;
    if (!inside) return;
    inside.addEventListener('error', (event) => {
      const target = event.target as { src?: string; href?: string } | null;
      log(event instanceof ErrorEvent ? `site error: ${event.message} ${event.filename ?? ''}:${event.lineno ?? ''}` : `site couldn't load: ${target?.src ?? target?.href ?? '?'}`);
    }, true);
    inside.addEventListener('unhandledrejection', (event) => log(`site rejection: ${String((event.reason as Error)?.message ?? event.reason)}`));
  });
}

start().catch((error: Error) => say(error.message));
