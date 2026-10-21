import { timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/*
 * The app API: what a project's app may ask the host's node while it runs.
 * Separate from the daemon's API, with its own token per project, so an app
 * can only read about its own project (who is connected, who may do what) and
 * never act for anyone. Weave hands the address and token to the app when it
 * starts it (WEAVE_API, WEAVE_TOKEN, WEAVE_PROJECT); `weave app env` prints
 * them for an app started by hand.
 *
 *   GET /v1/me                       the host (this computer)
 *   GET /v1/who?port=N               who is behind the app's connection from 127.0.0.1:N
 *   GET /v1/project                  the project, its open rooms and who's in them, its groups
 *   GET /v1/access?did=D[&group=G]   what D is in the project, and in which of its groups
 *
 * Same rules as the daemon's API: 127.0.0.1 only, and the Host check stops web
 * pages from reaching it via DNS rebinding.
 */

export interface AppApiServer {
  port: number;
  close(): Promise<void>;
}

export class AppApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Answers one request for the project a token belongs to; throws AppApiError for a status other than 400. */
export type AppApiAnswer = (project: string, route: string, params: URLSearchParams) => unknown;

export async function startAppApi(projectOf: (token: string) => string | undefined, answer: AppApiAnswer): Promise<AppApiServer> {
  const server: Server = createServer((req, res) => {
    try {
      handle(projectOf, answer, req, res);
    } catch (error) {
      send(res, error instanceof AppApiError ? error.status : 400, { error: (error as Error).message });
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: (server.address() as AddressInfo).port,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

function handle(projectOf: (token: string) => string | undefined, answer: AppApiAnswer, req: IncomingMessage, res: ServerResponse): void {
  const host = (req.headers.host ?? '').split(':')[0];
  if (host !== '127.0.0.1' && host !== 'localhost') return send(res, 403, { error: 'forbidden host' });
  const given = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
  const project = given ? projectOf(given) : undefined;
  if (!project) return send(res, 401, { error: 'unauthorized' });
  if (req.method !== 'GET') return send(res, 405, { error: 'only GET' });
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  send(res, 200, answer(project, url.pathname, url.searchParams) ?? null);
}

/** Compare tokens in constant time. */
export function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}
