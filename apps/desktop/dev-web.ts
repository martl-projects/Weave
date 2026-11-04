// Serves the desktop UI to a normal browser for development: the same
// renderer, with /rpc and /events forwarded to the daemon of a Weave home.
// Binds to 127.0.0.1 only.
//
//   npm run dev:web -- --home .dev/alice --port 8770
//
// Weave Web's spike (OVb4TP5x, milestone 1): /ws speaks the remote protocol
// ({id, method, args} in, {id, result|error} and {event} out) over a WebSocket,
// as a hosted node will. Open the printed http://localhost:<port>/?ws=<token>;
// a page from another origin, or without the token, gets no socket.
// --methods phone allows only PHONE_METHODS and logs every call refused (the
// list a WEB_METHODS allowlist starts from); without it, the renderer's.
// /prf.html tries a passkey with PRF (the key that would wrap a home key).

import { execFile, spawn } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { errorToWire } from '@weave/core';
import { connectDaemon, LENS_CSP, machinePolicy, resolveHome } from '@weave/node/client';
import { PHONE_METHODS, serveRemoteOverWebSocket } from '@weave/node';
import type { RpcMethod } from '@weave/node/client';
import { RENDERER_METHODS, type RendererMethod } from './src/methods.ts';

const { values } = parseArgs({ options: { home: { type: 'string' }, port: { type: 'string', default: '8770' }, methods: { type: 'string', default: 'renderer' } } });
const home = resolveHome(values.home && resolve(process.env.INIT_CWD ?? process.cwd(), values.home));
const port = Number(values.port);
const STATIC = join(import.meta.dirname, 'dist', 'renderer');
const PRF_PAGE = join(import.meta.dirname, 'web', 'prf.html');
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
/** The WebSocket's dev token: in the printed address only, so another page on this computer can't open the socket. */
const TOKEN = randomBytes(18).toString('base64url');
const ORIGINS = new Set([`http://localhost:${port}`, `http://127.0.0.1:${port}`]);
const WS_METHODS: readonly string[] = values.methods === 'phone' ? PHONE_METHODS : RENDERER_METHODS;
const refusedSeen = new Set<string>();

const tokenOk = (given: string | null) => {
  const a = Buffer.from(given ?? '');
  const b = Buffer.from(TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
};

const json = (res: import('node:http').ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  try {
    if (url.pathname === '/state') {
      const client = await connectDaemon(home);
      const managed = machinePolicy();
      return json(res, 200, { home: home.dir, hasIdentity: existsSync(home.identity), connected: !!client, ...(managed.enroll ? { enrollLink: managed.enroll } : {}), ...(managed.companyOnly ? { companyOnly: true } : {}) });
    }
    // Setting up a company account, as the app does it: `weave enroll` signs in through the browser.
    if (url.pathname === '/enroll' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const { link } = JSON.parse(body) as { link: string };
      const cli = join(import.meta.dirname, '..', '..', 'packages', 'cli', 'src', 'main.ts');
      return execFile(process.execPath, [cli, '--home', home.dir, '--json', 'enroll', link], { timeout: 6 * 60_000 }, (error, stdout, stderr) => {
        if (error) return json(res, 400, { error: stderr.split('\n').find((l) => l.startsWith('weave: '))?.slice(7) ?? error.message });
        // Then, as the app does, the person's daemon starts.
        spawn(process.execPath, [cli, '--home', home.dir, 'daemon'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
        json(res, 200, JSON.parse(stdout));
      });
    }
    if (url.pathname === '/rpc' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const { method, args } = JSON.parse(body) as { method: RendererMethod; args: unknown[] };
      if (!RENDERER_METHODS.includes(method)) return json(res, 403, { error: `not allowed: ${method}` });
      const client = await connectDaemon(home);
      if (!client) return json(res, 503, { error: 'no daemon running for this home' });
      const fn = client[method] as (...a: unknown[]) => Promise<unknown>;
      return json(res, 200, (await fn.apply(client, args)) ?? null);
    }
    if (url.pathname === '/events') {
      const client = await connectDaemon(home);
      if (!client) return json(res, 503, { error: 'no daemon running for this home' });
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      const controller = new AbortController();
      const heartbeat = setInterval(() => res.write(': ping\n\n'), 30_000);
      req.on('close', () => {
        clearInterval(heartbeat);
        controller.abort();
      });
      return client.watch((item) => res.write(`data: ${JSON.stringify(item)}\n\n`), controller.signal).catch(() => res.end());
    }
    // Boards' client services' views (/lens/<release>/<file>), sandboxed, each file from the daemon (lensFile).
    if (url.pathname.startsWith('/lens/')) {
      const [release, ...path] = url.pathname.slice('/lens/'.length).split('/').map(decodeURIComponent);
      const client = await connectDaemon(home);
      if (!client) return json(res, 503, { error: 'no daemon running for this home' });
      const file = await client.lensFile({ release, path: path.join('/') }).catch(() => undefined);
      if (!file) return json(res, 404, { error: 'not found' });
      res.writeHead(200, { 'content-type': file.type, 'content-security-policy': LENS_CSP, 'x-content-type-options': 'nosniff', 'cache-control': 'no-cache' });
      return void res.end(Buffer.from(file.data, 'base64'));
    }
    if (url.pathname === '/prf.html') {
      res.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'" });
      return void createReadStream(PRF_PAGE).pipe(res);
    }
    const file = normalize(join(STATIC, url.pathname === '/' ? 'index.html' : url.pathname));
    if (!file.startsWith(STATIC) || !existsSync(file)) return json(res, 404, { error: 'not found' });
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  } catch (error) {
    json(res, 500, errorToWire(error)); // a WeaveError's name and values go with it (docs/localization.md)
  }
})
  .on('upgrade', async (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const refuse = (status: string) => {
      socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
    };
    // A browser always says where a page is from; a WebSocket has no CORS, so this check is the one that counts.
    if (url.pathname !== '/ws') return refuse('404 Not Found');
    if (!ORIGINS.has(String(req.headers.origin))) return refuse('403 Forbidden');
    if (!tokenOk(url.searchParams.get('token'))) return refuse('401 Unauthorized');
    socket.pause(); // the first frames wait while the daemon is reached
    const client = await connectDaemon(home).catch(() => undefined);
    if (!client) return refuse('503 Service Unavailable');
    const host = {
      call: (method: RpcMethod, args: unknown[]) => (client[method as keyof typeof client] as (...a: unknown[]) => Promise<unknown>).apply(client, args),
      watch: (onItem: Parameters<typeof client.watch>[0], signal: AbortSignal) => client.watch(onItem, signal),
    };
    const link = serveRemoteOverWebSocket(host, req, socket, head, {
      methods: WS_METHODS,
      who: 'Weave Web',
      refused: (method) => {
        if (refusedSeen.has(method)) return;
        refusedSeen.add(method);
        console.log(`refused over /ws: ${method} (${refusedSeen.size} so far: ${[...refusedSeen].sort().join(' ')})`);
      },
    });
    if (!link) return refuse('400 Bad Request');
    socket.resume();
  })
  .listen(port, '127.0.0.1', () => {
    console.log(`weave web preview for ${home.dir} on http://127.0.0.1:${port}`);
    console.log(`over a WebSocket (${values.methods === 'phone' ? "a phone's methods" : "the renderer's methods"}): http://localhost:${port}/?ws=${TOKEN}`);
    console.log(`passkey with PRF: http://localhost:${port}/prf.html`);
  });
