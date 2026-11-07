import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import type { Duplex } from 'node:stream';
import type { StorageNode } from './storagenode.ts';
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
    if (new URL(req.url ?? '/', 'http://here').pathname !== '/storage') return refuse('404 Not Found');
    // A page from elsewhere gets no socket: the browser says truthfully where a page comes from.
    if (!origins.has(req.headers.origin ?? '')) return refuse('403 Forbidden');
    const address = addressOf(req, options.behindProxy);
    const count = open.get(address) ?? 0;
    if (count >= max) return refuse('429 Too Many Requests');
    open.set(address, count + 1);
    socket.once('close', () => {
      const left = (open.get(address) ?? 1) - 1;
      if (left > 0) open.set(address, left);
      else open.delete(address);
    });
    const text = textSocket(req, socket, head, { idleMs: options.idleMs ?? IDLE_MS, maxQueued: options.maxQueued ?? MAX_QUEUED });
    if (!text) return refuse('400 Bad Request');
    node.accept(text).catch(() => text.close());
  };
}

/** The HTTP side: the page's files, if it has them, and whether it's up. */
export function storageServer(node: StorageNode, options: StorageServerOptions): Server {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://here');
    if (url.pathname === '/health') return res.writeHead(200, { 'content-type': 'text/plain' }).end('ok\n');
    if (!options.web || (req.method !== 'GET' && req.method !== 'HEAD')) return res.writeHead(404).end();
    const wanted = normalize(decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    const file = join(options.web, wanted);
    // Nothing above the page's folder, and nothing hidden in it.
    if (!file.startsWith(options.web + sep) || wanted.split(sep).some((part) => part.startsWith('.')) || !existsSync(file) || !statSync(file).isFile()) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'x-content-type-options': 'nosniff', 'cache-control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600' });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).pipe(res);
  });
  server.on('upgrade', storageUpgrades(node, options));
  return server;
}
