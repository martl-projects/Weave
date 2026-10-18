import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { RPC_METHODS, type Backend, type RpcMethod } from './backend.ts';

export interface ApiServer {
  port: number;
  token: string;
  close(): Promise<void>;
}

const MAX_BODY = 1024 * 1024;

/**
 * The daemon's local HTTP API, used by the CLI, the desktop app and the MCP
 * server. Listens on 127.0.0.1 only, and every request needs the bearer token
 * from daemon.json. The Host check stops web pages from reaching it via DNS
 * rebinding.
 *
 *   POST /v1/rpc    {method, args}  calls one Backend method (allow-listed)
 *   GET  /v1/watch                  server-sent events: every new readable event
 */
export async function startApi(backend: Backend, port = 0): Promise<ApiServer> {
  const token = randomBytes(24).toString('base64url');
  const server: Server = createServer((req, res) => {
    handle(backend, token, req, res).catch((error: Error) => send(res, 400, { error: error.message }));
  });
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  return {
    port: (server.address() as AddressInfo).port,
    token,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

async function handle(backend: Backend, token: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const host = (req.headers.host ?? '').split(':')[0];
  if (host !== '127.0.0.1' && host !== 'localhost') return send(res, 403, { error: 'forbidden host' });
  if (!authorized(req.headers.authorization, token)) return send(res, 401, { error: 'unauthorized' });

  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const route = `${req.method} ${url.pathname}`;
  if (route === 'POST /v1/rpc') {
    const { method, args } = (await readBody(req)) as { method?: string; args?: unknown[] };
    if (!RPC_METHODS.includes(method as RpcMethod)) return send(res, 404, { error: `no method ${method}` });
    const fn = backend[method as RpcMethod] as (...a: unknown[]) => Promise<unknown>;
    // JSON turns undefined arguments into null; turn them back so defaults apply.
    const params = (Array.isArray(args) ? args : []).map((a) => (a === null ? undefined : a));
    return send(res, 200, { result: (await fn.apply(backend, params)) ?? null });
  }
  if (route === 'GET /v1/watch') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    res.write(': connected\n\n');
    const controller = new AbortController();
    // A comment every 30 s keeps the stream from looking idle to clients' body timeouts.
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 30_000);
    req.on('close', () => {
      clearInterval(heartbeat);
      controller.abort();
    });
    return backend.watch((item) => res.write(`data: ${JSON.stringify(item)}\n\n`), controller.signal);
  }
  return send(res, 404, { error: `no route ${route}` });
}

function authorized(header: string | undefined, token: string): boolean {
  const given = Buffer.from(header?.replace(/^Bearer /, '') ?? '');
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function send(res: ServerResponse, status: number, body: unknown): void {
  if (res.headersSent) return void res.end();
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new Error('request body too large');
    chunks.push(chunk as Buffer);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}
