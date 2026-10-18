import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Backend } from './backend.ts';

export interface ApiServer {
  port: number;
  token: string;
  close(): Promise<void>;
}

const MAX_BODY = 1024 * 1024;

/**
 * The daemon's local HTTP API, used by the CLI and later the desktop app.
 * Listens on 127.0.0.1 only, and every request needs the bearer token from
 * daemon.json. The Host check stops web pages from reaching it via DNS rebinding.
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
    close: () => new Promise((resolve) => {
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
  switch (route) {
    case 'GET /v1/whoami':
      return send(res, 200, await backend.whoami());
    case 'GET /v1/status':
      return send(res, 200, await backend.status());
    case 'GET /v1/feed': {
      const limit = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : undefined;
      const kinds = url.searchParams.get('kinds')?.split(',').filter(Boolean);
      const group = url.searchParams.get('group') ?? undefined;
      const author = url.searchParams.get('author') ?? undefined;
      const publicOnly = url.searchParams.get('public') === '1';
      return send(res, 200, await backend.feed({ limit, kinds, group, author, publicOnly }));
    }
    case 'GET /v1/groups':
      return send(res, 200, await backend.groups());
    case 'POST /v1/groups': {
      const { name } = await readBody(req);
      return send(res, 200, await backend.createGroup(name));
    }
    case 'POST /v1/groups/invite': {
      const { group, hours } = await readBody(req);
      return send(res, 200, { invite: await backend.invite(group, hours) });
    }
    case 'POST /v1/groups/join': {
      const { invite } = await readBody(req);
      return send(res, 200, await backend.joinGroup(invite));
    }
    case 'GET /v1/groups/members':
      return send(res, 200, await backend.members(url.searchParams.get('group') ?? ''));
    case 'POST /v1/groups/remove': {
      const { group, who } = await readBody(req);
      await backend.removeMember(group, who);
      return send(res, 200, { ok: true });
    }
    case 'POST /v1/edges':
      await backend.setEdge(await readBody(req));
      return send(res, 200, { ok: true });
    case 'GET /v1/profile':
      return send(res, 200, await backend.profile(url.searchParams.get('who') ?? undefined));
    case 'POST /v1/profile':
      return send(res, 200, await backend.setProfile(await readBody(req)));
    case 'GET /v1/directory':
      return send(res, 200, await backend.directory());
    case 'GET /v1/threads':
      return send(res, 200, await backend.threads(url.searchParams.get('group') ?? ''));
    case 'POST /v1/threads':
      return send(res, 200, await backend.startThread(await readBody(req)));
    case 'POST /v1/replies':
      return send(res, 200, await backend.reply(await readBody(req)));
    case 'GET /v1/messages': {
      const limit = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : undefined;
      const channel = url.searchParams.get('channel') ?? undefined;
      return send(res, 200, await backend.messages(url.searchParams.get('group') ?? '', { channel, limit }));
    }
    case 'GET /v1/channels':
      return send(res, 200, await backend.channels(url.searchParams.get('group') ?? ''));
    case 'POST /v1/channels':
      return send(res, 200, await backend.createChannel(await readBody(req)));
    case 'POST /v1/reactions':
      await backend.react(await readBody(req));
      return send(res, 200, { ok: true });
    case 'POST /v1/messages':
      return send(res, 200, await backend.say(await readBody(req)));
    case 'GET /v1/issues':
      return send(res, 200, await backend.issues(url.searchParams.get('group') ?? ''));
    case 'POST /v1/issues':
      return send(res, 200, await backend.openIssue(await readBody(req)));
    case 'POST /v1/issues/claim':
      return send(res, 200, await backend.claimIssue(await readBody(req)));
    case 'POST /v1/issues/status':
      return send(res, 200, await backend.setIssueStatus(await readBody(req)));
    case 'GET /v1/proposals':
      return send(res, 200, await backend.proposals(url.searchParams.get('group') ?? ''));
    case 'POST /v1/proposals':
      return send(res, 200, await backend.propose(await readBody(req)));
    case 'POST /v1/votes':
      return send(res, 200, await backend.vote(await readBody(req)));
    case 'GET /v1/votes/delegate':
      return send(res, 200, await backend.votingDelegate(url.searchParams.get('group') ?? ''));
    case 'POST /v1/votes/delegate':
      await backend.delegateVote(await readBody(req));
      return send(res, 200, { ok: true });
    case 'GET /v1/social':
      return send(res, 200, await backend.social());
    case 'POST /v1/publish':
      return send(res, 200, await backend.publish(await readBody(req)));
    case 'POST /v1/agents': {
      const { name, permissions } = await readBody(req);
      return send(res, 200, await backend.addAgent(name, permissions));
    }
    case 'POST /v1/join': {
      const { topic } = await readBody(req);
      await backend.join(topic);
      return send(res, 200, { ok: true });
    }
    case 'GET /v1/watch': {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      res.write(': connected\n\n');
      const controller = new AbortController();
      req.on('close', () => controller.abort());
      return backend.watch((item) => res.write(`data: ${JSON.stringify(item)}\n\n`), controller.signal);
    }
    default:
      return send(res, 404, { error: `no route ${route}` });
  }
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

async function readBody(req: IncomingMessage): Promise<any> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new Error('request body too large');
    chunks.push(chunk as Buffer);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}
