import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import type { Duplex } from 'node:stream';
import { EventEmitter } from 'node:events';
import type HyperDHT from 'hyperdht';
import { LINK_MS } from './browserlink.ts';
import type { StorageNode } from './storagenode.ts';
import { PLAN_CODE } from './storageplans.ts';
import { textSocket } from './websocket.ts';

/*
 * A storage node on the open internet (docs/web-stage2.md): what stands between it and whoever connects. Anyone may open
 * a connection, so how many one address may hold, how long one may stay silent and how much may queue up for a slow
 * reader are limited here. It serves the page too, when it's given its folder: then the page and its node have one origin.
 */

const MAX_PER_ADDRESS = 16;
/** A connection silent this long is gone. The server pings at a third of it, and a browser answers by itself. */
const IDLE_MS = 90_000;
/** What may wait for a reader who doesn't read: a few images. */
const MAX_QUEUED = 32 * 1024 * 1024;

/** The page's large files, which change only with a release (as apps/web/src/sw.ts has them). */
const LARGE = /^\/(services|avatar3d)\/|^\/sqlite3\.wasm$/;

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
};

export interface StorageServerOptions {
  /** Where pages may connect from, like https://martl.io. */
  origins: string[];
  /** The page's folder (apps/web/dist), if this serves it. */
  web?: string;
  maxPerAddress?: number;
  idleMs?: number;
  maxQueued?: number;
  /** Where websites' tabs may use the relay from, as origins or as patterns like https://*.weave-rooms.net. */
  relayOrigins?: string[];
  /** Behind a proxy of our own: the address is the last one it names in X-Forwarded-For. */
  behindProxy?: boolean;
}

function addressOf(req: IncomingMessage, behindProxy: boolean | undefined): string {
  const forwarded = behindProxy ? String(req.headers['x-forwarded-for'] ?? '').split(',').at(-1)?.trim() : undefined;
  return forwarded || req.socket.remoteAddress || '?';
}

/** What happens to an upgrade request: who may connect, and how many at once from one address. */
export function storageUpgrades(node: StorageNode, options: StorageServerOptions): (req: IncomingMessage, socket: Duplex, head: Buffer) => void {
  const origins = new Set(options.origins);
  const open = new Map<string, number>();
  const max = options.maxPerAddress ?? MAX_PER_ADDRESS;
  return (req, socket, head) => {
    const refuse = (status: string) => {
      socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    };
    socket.on('error', () => {});
    const url = new URL(req.url ?? '/', 'http://here');
    if (url.pathname !== '/storage' && url.pathname !== '/dht') return refuse('404 Not Found');
    // A page from elsewhere gets no socket: the browser says truthfully where a page comes from. A program that isn't a
    // page (a creator's Weave putting an onboarding link) sends no origin; it could claim any, so refusing it guards nothing.
    const program = url.pathname === '/storage' && req.headers.origin === undefined;
    const origin = req.headers.origin ?? '';
    const relayOrigin = url.pathname === '/dht' && (options.relayOrigins ?? []).some((pattern) => originMatches(pattern, origin));
    if (!program && !origins.has(origin) && !relayOrigin) return refuse('403 Forbidden');
    const address = addressOf(req, options.behindProxy);
    const count = open.get(address) ?? 0;
    if (count >= max) return refuse('429 Too Many Requests');
    open.set(address, count + 1);
    socket.once('close', () => {
      const left = (open.get(address) ?? 1) - 1;
      if (left > 0) open.set(address, left);
      else open.delete(address);
    });
    if (url.pathname === '/dht') {
      // A browser's connections to websites, for a ticket its storage connection got (StorageNode.relayFor).
      return relayUpgrade(node, url.searchParams.get('ticket') ?? '', req, socket, head) ? undefined : refuse('403 Forbidden');
    }
    const text = textSocket(req, socket, head, { idleMs: options.idleMs ?? IDLE_MS, maxQueued: options.maxQueued ?? MAX_QUEUED });
    if (!text) return refuse('400 Bad Request');
    node.accept(text).catch(() => text.close());
  };
}

/**
 * The relay's parts, loaded when it's first used: a storage node's only, and this module is in a browser's bundle too,
 * where they don't load. Its WebSockets are binary, unlike the storage connection's.
 */
let relayParts: Promise<{ handleUpgrade: (req: IncomingMessage, socket: Duplex, head: Buffer, done: (ws: { once(event: 'close', f: () => void): void }) => void) => void; relayOver: (dht: HyperDHT, ws: unknown) => void }> | undefined;
const loadRelay = () =>
  (relayParts ??= Promise.all([import('ws'), import('@hyperswarm/dht-relay'), import('@hyperswarm/dht-relay/ws')]).then(([ws, dhtRelay, wsStream]) => {
    const server = new ws.WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
    const relay = ((dhtRelay as unknown as { default?: { relay?: typeof dhtRelay.relay } }).default?.relay ?? dhtRelay.relay) as typeof dhtRelay.relay;
    const RelayStream = wsStream.default;
    return {
      handleUpgrade: (req, socket, head, done) => server.handleUpgrade(req, socket, head, done as never),
      relayOver: (dht, socket) => void relay(dht, new RelayStream(false, socket)),
    };
  }));

/** An origin and a pattern: the same, or one name under a *. (https://*.weave-rooms.net takes https://a1.weave-rooms.net). */
export function originMatches(pattern: string, origin: string): boolean {
  if (pattern === origin) return true;
  const star = /^(https?:\/\/)\*\.(.+)$/.exec(pattern);
  if (!star || !origin.startsWith(star[1])) return false;
  const host = origin.slice(star[1].length);
  return host.endsWith(`.${star[2]}`) && /^[a-z0-9-]+$/.test(host.slice(0, -star[2].length - 1));
}

/** A browser's connections to websites, for a ticket its storage connection got (StorageNode.relayFor): false without one. */
export function relayUpgrade(node: StorageNode, ticket: string, req: IncomingMessage, socket: Duplex, head: Buffer): boolean {
  const relayed = node.relayFor(ticket);
  if (!relayed) return false;
  void loadRelay().then(
    ({ handleUpgrade, relayOver }) =>
      handleUpgrade(req, socket, head, (ws) => {
        ws.once('close', relayed.done);
        relayOver(onlyConnecting(relayed.dht), ws);
      }),
    () => (relayed.done(), socket.destroy()),
  );
  return true;
}

/**
 * The DHT as the relay may use it: connections, to a website's host, and nothing else. Lookups and announcements end at
 * once with nothing, and a server never listens: a browser hosts nothing through a storage node, and nobody uses it to
 * look around the DHT.
 */
function onlyConnecting(dht: HyperDHT): HyperDHT {
  const nothing = () => {
    const query = new EventEmitter();
    setImmediate(() => query.emit('close'));
    return query;
  };
  const noServer = () => {
    const server = new EventEmitter() as EventEmitter & { listen(): Promise<void>; close(): Promise<void> };
    server.listen = async () => void setImmediate(() => server.emit('close'));
    server.close = async () => {};
    return server;
  };
  // A browser's handshake, one step at a time (oneStepAtATime).
  const connect = (publicKey: Buffer, options?: { createHandshake?: (...args: unknown[]) => Handshake }) =>
    dht.connect(publicKey, (options?.createHandshake ? { ...options, createHandshake: (...args: unknown[]) => oneStepAtATime(options.createHandshake!(...args)) } : options) as never);
  return { connect, lookup: nothing, announce: nothing, lookupAndUnannounce: nothing, createServer: noServer } as unknown as HyperDHT;
}

/** What HyperDHT asks of a handshake, as the relay's stand-in for a browser's does it. */
interface Handshake {
  send(payload: unknown): Promise<unknown>;
  recv(payload: unknown): Promise<unknown>;
  [other: string]: unknown;
}

/**
 * A browser's Noise handshake, a step at a time. HyperDHT tries several ways to a host at once, and with a handshake that
 * answers later (the relay's, which asks the browser) they all got to the same step together: the relay keeps one
 * answer pending at a time, and the browser's handshake throws at a second go at a step it has done. So the steps go
 * in turn, and once one way got through, the others are told "nothing" (HyperDHT drops a way that gets that).
 */
export function oneStepAtATime(handshake: Handshake): Handshake {
  let queue: Promise<unknown> = Promise.resolve();
  let received = false;
  const inTurn = <T>(step: () => Promise<T>): Promise<T> => {
    const run = queue.then(step);
    queue = run.catch(() => {});
    return run;
  };
  return new Proxy(handshake, {
    get(target, property) {
      if (property === 'send') return (payload: unknown) => inTurn(() => target.send(payload));
      if (property === 'recv')
        return (payload: unknown) =>
          inTurn(async () => {
            if (received) return null;
            const answer = await target.recv(payload);
            if (answer) received = true;
            return answer;
          });
      const value = Reflect.get(target, property) as unknown;
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });
}

/** A browser link's handover (browserlink.ts): this big at most, this many at once, this many an hour from one address. */
const MAX_LINK_BYTES = 8 * 1024 * 1024;
const MAX_LINKS = 100;
const LINKS_PER_HOUR = 10;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Handovers to linked browsers: one of a person's computers leaves one (POST /link/<token>), sealed, and the browser
 * with the link takes it (GET), once, within LINK_MS. Held in memory: a restart loses them, and the link is made again.
 */
export function linkHandovers(behindProxy: boolean | undefined, origins: Iterable<string> = []) {
  const pages = new Set(origins);
  const waiting = new Map<string, { data: Buffer; until: number }>();
  const posted = new Map<string, number[]>();
  return (req: IncomingMessage, res: ServerResponse, token: string): void => {
    const now = Date.now();
    for (const [t, w] of waiting) if (w.until <= now) waiting.delete(t);
    // The page takes its handover from another origin when it comes from elsewhere: those it may come from may read it.
    const origin = req.headers.origin;
    const cors: Record<string, string> = origin && pages.has(origin) ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {};
    const done = (status: number, body = '') => void res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors }).end(body);
    if (!TOKEN.test(token)) return done(404);
    if (req.method === 'GET') {
      const w = waiting.get(token);
      if (!w) return done(404);
      waiting.delete(token);
      return done(200, w.data.toString('utf8'));
    }
    if (req.method !== 'POST') return done(405);
    const address = addressOf(req, behindProxy);
    const recent = (posted.get(address) ?? []).filter((at) => now - at < 3600_000);
    if (recent.length >= LINKS_PER_HOUR) return done(429);
    if (waiting.size >= MAX_LINKS) return done(503);
    if (waiting.has(token)) return done(409);
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_LINK_BYTES) {
        done(413);
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      if (size > MAX_LINK_BYTES || res.headersSent) return;
      posted.set(address, [...recent, now]);
      waiting.set(token, { data: Buffer.concat(chunks), until: now + LINK_MS });
      done(201);
    });
  };
}

/** Text for an HTML attribute. */
const attr = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * The page for an onboarding link, with what its link preview shows (og:title, og:description, og:image): for a
 * node that serves the page itself. web.martl.io does the same in a Pages Function (apps/web/functions/j).
 */
export function previewTags(preview: { live: boolean; preview?: { title: string; text?: string }; image?: true } | undefined, imageUrl: string): string {
  const title = !preview ? 'Weave' : !preview.live ? 'This invite link no longer works' : (preview.preview?.title ?? 'An invitation to Weave');
  const text = !preview?.live ? 'Ask whoever sent it for a new one.' : (preview.preview?.text ?? 'Join on Weave: a place to build things together.');
  return [
    `<meta property="og:title" content="${attr(title)}">`,
    `<meta property="og:description" content="${attr(text)}">`,
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="Weave">',
    ...(preview?.live && preview.image ? [`<meta property="og:image" content="${attr(imageUrl)}">`, '<meta name="twitter:card" content="summary_large_image">'] : ['<meta name="twitter:card" content="summary">']),
  ].join('\n');
}

/** The HTTP side: the page's files, if it has them, handovers to linked browsers, onboarding links' previews, and whether it's up. */
export function storageServer(node: StorageNode, options: StorageServerOptions): Server {
  const handover = linkHandovers(options.behindProxy, options.origins);
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://here');
    if (url.pathname === '/health') return res.writeHead(200, { 'content-type': 'text/plain' }).end('ok\n');
    if (url.pathname.startsWith('/link/')) return handover(req, res, url.pathname.slice('/link/'.length));
    // An onboarding link's preview: open by design, and nothing of the sealed plan. Fetching it counts no use.
    const preview = /^\/preview\/([A-Za-z0-9]+)(\.png)?$/.exec(url.pathname);
    if (preview && PLAN_CODE.test(preview[1]) && (req.method === 'GET' || req.method === 'HEAD')) {
      if (preview[2]) {
        const image = node.plans.image(preview[1]);
        if (!image) return res.writeHead(404).end();
        res.writeHead(200, { 'content-type': 'image/png', 'content-length': image.length, 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff' });
        return res.end(req.method === 'HEAD' ? undefined : image);
      }
      const info = node.plans.preview(preview[1]);
      if (!info) return res.writeHead(404, { 'content-type': 'application/json' }).end('{}');
      return res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'public, max-age=60', 'access-control-allow-origin': '*' }).end(JSON.stringify(info));
    }
    // The page of an onboarding link, from a node that serves the page: index.html with the preview's tags.
    const join_ = /^\/j\/([A-Za-z0-9]+)$/.exec(url.pathname);
    if (join_ && options.web && (req.method === 'GET' || req.method === 'HEAD')) {
      const index = join(options.web, 'index.html');
      if (!existsSync(index)) return res.writeHead(404).end();
      const base = `${req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http'}://${req.headers.host}`;
      const html = readFileSync(index, 'utf8').replace('</head>', `${previewTags(PLAN_CODE.test(join_[1]) ? node.plans.preview(join_[1]) : undefined, `${base}/preview/${join_[1]}.png`)}\n</head>`);
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' });
      return res.end(req.method === 'HEAD' ? undefined : html);
    }
    if (!options.web || (req.method !== 'GET' && req.method !== 'HEAD')) return res.writeHead(404).end();
    const wanted = normalize(decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    const file = join(options.web, wanted);
    // Nothing above the page's folder, and nothing hidden in it.
    if (!file.startsWith(options.web + sep) || wanted.split(sep).some((part) => part.startsWith('.')) || !existsSync(file) || !statSync(file).isFile()) return res.writeHead(404).end();
    // The page's code is asked again each time (unchanged, it's a 304), so an update is there at the next reload; only
    // the large files that change with a release are kept for a while (and the service worker has them first anyway).
    const modified = statSync(file).mtime.toUTCString();
    const headers = { 'x-content-type-options': 'nosniff', 'last-modified': modified, 'cache-control': LARGE.test(url.pathname) ? 'public, max-age=3600' : 'no-cache' };
    if (req.headers['if-modified-since'] === modified) return res.writeHead(304, headers).end();
    res.writeHead(200, { ...headers, 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).pipe(res);
  });
  server.on('upgrade', storageUpgrades(node, options));
  return server;
}
