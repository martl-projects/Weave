import './sodium-ready.ts';
import RelayedDHT from '@hyperswarm/dht-relay';
import RelayStream from '@hyperswarm/dht-relay/ws';
import b4a from 'b4a';
import sodium from 'sodium-universal';
import { ask, CookieJar, type Asked, type Tunnel } from './http.ts';

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
    window.opener.postMessage({ type, key: ourKey }, WEB_ORIGIN);
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
  if (!window.opener) return say('Open this website from Weave.');
  say('Asking Weave…');
  const pass = await fromWeave<Pass>('weave-website', 'weave-website-pass');
  document.title = pass.name;
  const jar = new CookieJar();

  // What the website asks, from the service worker: through a tunnel of its own each time.
  navigator.serviceWorker.addEventListener('message', async ({ data, ports }: MessageEvent<{ type?: string } & Asked>) => {
    if (data?.type !== 'weave-ask' || !ports[0]) return;
    try {
      const tunnel = (await relayed(pass)).connect(b4a.from(pass.key, 'hex')) as unknown as Tunnel;
      tunnel.write(pass.tunnel);
      const cookie = jar.header();
      const asked: Asked = { ...data, headers: [...data.headers.filter(([n]) => n.toLowerCase() !== 'cookie'), ...(cookie ? [['Cookie', cookie] as [string, string]] : [])] };
      const answer = await ask(tunnel, asked, location.host);
      jar.take(answer.headers);
      ports[0].postMessage({ ...answer, headers: answer.headers.filter(([n]) => n.toLowerCase() !== 'set-cookie') }, [answer.body]);
    } catch (error) {
      ports[0].postMessage({ error: (error as Error).message });
    }
  });

  say('Connecting…');
  await navigator.serviceWorker.register('/__weave/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  // The website, in a frame the service worker answers for: where this tab was opened.
  const frame = document.createElement('iframe');
  frame.src = location.pathname + location.search;
  frame.allow = 'fullscreen; autoplay; clipboard-write';
  document.body.append(frame);
  frame.addEventListener('load', () => document.querySelector('#say')?.remove(), { once: true });
}

start().catch((error: Error) => say(error.message));
