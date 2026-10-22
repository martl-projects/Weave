import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join } from 'node:path';
import type { CompanyAction } from './company.ts';
import type { AuditSinkInput } from './auditsinks.ts';
import type { WeaveNode } from './node.ts';
import { verifyIdToken } from './node.ts';

/*
 * The admin console (stage 12): a web app the company's node serves for the
 * company's admins. They sign in with their company account (OpenID Connect,
 * authorization code with PKCE); only those in the company's admins group get
 * in. What they do is carried out by the company's node and recorded with who
 * did it. A one-time operator link lets the first admin in before sign-in is
 * set up.
 */

export interface ConsoleOptions {
  port: number;
  /** Where admins reach it (the sign-in comes back to `${url}/callback`); default http://localhost:<port>. */
  url?: string;
  issuer: string;
  clientId: string;
  clientSecret?: string;
  /** The built console app (apps/console/dist). */
  assets?: string;
}

interface Session {
  subject: string;
  email?: string;
  name?: string;
  expires: number;
}

const SESSION_MS = 8 * 3_600_000;
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

/** Where the console app's files are: next to the bundled program, or in the repository. */
export function consoleAssets(): string | undefined {
  return [process.env.WEAVE_CONSOLE_DIR, join(import.meta.dirname, 'console'), join(import.meta.dirname, '..', '..', '..', 'apps', 'console', 'dist')].find((d): d is string => !!d && existsSync(join(d, 'index.html')));
}

const b64url = (b: Buffer) => b.toString('base64url');

export async function startConsole(node: WeaveNode, options: ConsoleOptions): Promise<{ port: number; url: string; operatorLink(): string; close(): Promise<void> }> {
  const sessions = new Map<string, Session>();
  const pending = new Map<string, { verifier: string; nonce: string; expires: number }>();
  const operatorTokens = new Set<string>();
  let base = options.url?.replace(/\/$/, '') ?? '';
  let discovery: { authorization_endpoint: string; token_endpoint: string } | undefined;
  const discover = async () =>
    (discovery ??= (await (await fetch(`${options.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`)).json()) as { authorization_endpoint: string; token_endpoint: string });

  /** A refusal a person sees in their browser (sign-in), as a page rather than JSON. */
  const page = (res: ServerResponse, status: number, title: string, text: string) => {
    res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    res.end(`<!doctype html><meta charset="utf-8"><title>Weave Admin</title><link rel="icon" href="/favicon.svg">
<style>body{font:15px system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;margin:0;background:#f4f5f8;color:#101828}
div{background:#fff;border:1px solid #e4e7ec;border-radius:14px;padding:32px 36px;text-align:center;max-width:440px;box-shadow:0 12px 24px -8px #10182826}
h1{font-size:20px;margin:14px 0 6px}p{color:#667085;margin:0 0 18px}a{color:#1f3a93}</style>
<div><img src="/favicon.svg" width="56" height="56" alt=""><h1>${escape(title)}</h1><p>${escape(text)}</p><a href="/logout">Sign in with another account</a></div>`);
  };
  const send = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers });
    res.end(JSON.stringify(body));
  };
  const redirect = (res: ServerResponse, to: string, headers: Record<string, string> = {}) => {
    res.writeHead(302, { location: to, 'cache-control': 'no-store', ...headers });
    res.end();
  };
  const cookie = (sid: string) => `weave_console=${sid}; HttpOnly; SameSite=Lax; Path=/${base.startsWith('https:') ? '; Secure' : ''}; Max-Age=${SESSION_MS / 1000}`;
  const sessionOf = (req: IncomingMessage): Session | undefined => {
    const sid = /(?:^|;\s*)weave_console=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];
    const session = sid ? sessions.get(sid) : undefined;
    if (session && session.expires < Date.now()) sessions.delete(sid!);
    return session && session.expires >= Date.now() ? session : undefined;
  };
  const startSession = (who: Omit<Session, 'expires'>) => {
    const sid = b64url(randomBytes(24));
    sessions.set(sid, { ...who, expires: Date.now() + SESSION_MS });
    return sid;
  };
  const body = async (req: IncomingMessage): Promise<Record<string, unknown>> => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  };

  async function api(req: IncomingMessage, res: ServerResponse, url: URL, who: Session): Promise<void> {
    const route = `${req.method} ${url.pathname.replace(/^\/api/, '')}`;
    const admin = { subject: who.subject, ...(who.email ? { email: who.email } : {}) };
    switch (route) {
      case 'GET /me':
        return send(res, 200, { subject: who.subject, email: who.email, name: who.name });
      case 'GET /company':
        return send(res, 200, (await node.company()) ?? null);
      case 'GET /members': {
        const company = await node.company();
        return send(res, 200, company ? await node.members(company.group.id) : []);
      }
      case 'GET /spaces': {
        const company = await node.company();
        if (!company) return send(res, 200, []);
        const all = await node.spaces();
        return send(
          res,
          200,
          await Promise.all(
            [company.group, ...company.spaces].map(async (s) => {
              const info = all.find((x) => x.id === s.id);
              return { ...info, members: (await node.members(s.id)).map((m) => ({ did: m.did, name: m.name, maintainer: m.maintainer ?? false })) };
            }),
          ),
        );
      }
      case 'GET /audit': {
        const company = await node.company();
        if (!company) return send(res, 200, []);
        const since = url.searchParams.get('since') ?? new Date(Date.now() - 30 * 86_400_000).toISOString();
        const only = url.searchParams.get('space');
        const lines = [];
        for (const s of [company.group, ...company.spaces]) {
          if (only && s.id !== only) continue;
          for (const l of await node.audit({ space: s.id, since })) lines.push({ ...l, space: { id: s.id, name: s.name } });
        }
        // Names for the people and spaces the lines mention, so admins don't read keys.
        const names: Record<string, string> = Object.fromEntries([company.group, ...company.spaces].map((s) => [s.id, s.name]));
        const mentioned = new Set<string>();
        const walk = (v: unknown): void => {
          if (typeof v === 'string' && v.startsWith('did:key:')) mentioned.add(v);
          else if (v && typeof v === 'object') Object.values(v).forEach(walk);
        };
        lines.forEach((l) => walk(l.detail));
        for (const did of mentioned) {
          const name = node.nameOf(did as `did:key:z${string}`);
          if (name) names[did] = name;
        }
        return send(res, 200, { lines: lines.sort((a, b) => b.time.localeCompare(a.time)), names });
      }
      case 'GET /scim':
        return send(res, 200, await node.scim());
      case 'GET /streams':
        return send(res, 200, await node.auditStreams());
      case 'GET /export': {
        const space = url.searchParams.get('space');
        if (!space) return send(res, 400, { error: 'which space?' });
        const lines = await node.exportSpace({ space, ...(url.searchParams.get('since') ? { since: url.searchParams.get('since')! } : {}) });
        await node.consoleRecord({ action: 'export', space }, admin);
        res.writeHead(200, { 'content-type': 'application/x-ndjson', 'content-disposition': `attachment; filename="weave-export-${space}.jsonl"`, 'cache-control': 'no-store' });
        return void res.end(lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
      }
    }
    // Changes: only from the console itself (a custom header no other site can send without asking).
    if (req.headers['x-weave-console'] !== '1') return send(res, 403, { error: 'missing x-weave-console header' });
    const input = await body(req);
    switch (route) {
      case 'POST /action':
        return send(res, 200, await node.consoleAction(input as unknown as CompanyAction, admin));
      case 'POST /enroll-link':
        await node.consoleRecord({ action: 'enroll-link' }, admin);
        return send(res, 200, { link: await node.enrollLink(typeof input.days === 'number' ? { days: input.days } : {}) });
      case 'POST /recovery': {
        const company = await node.company();
        await node.consoleRecord({ action: 'recovery', person: String(input.person) }, admin);
        return send(res, 200, { answer: await node.openEscrow({ space: company!.group.id, person: String(input.person), for: String(input.request) }) });
      }
      case 'POST /scim':
        await node.consoleRecord({ action: input.on ? 'scim-on' : 'scim-off' }, admin);
        return send(res, 200, await node.setScim({ on: input.on === true, ...(typeof input.port === 'number' ? { port: input.port } : {}) }));
      case 'POST /streams':
        await node.consoleRecord({ action: 'stream-add', kind: String(input.kind) }, admin);
        return send(res, 200, await node.addAuditStream(input as unknown as AuditSinkInput));
      case 'DELETE /streams': {
        await node.consoleRecord({ action: 'stream-remove', id: String(input.id) }, admin);
        return send(res, 200, await node.removeAuditStream(String(input.id)));
      }
    }
    return send(res, 404, { error: 'no such call' });
  }

  const server = createServer((req, res) => {
    void (async () => {
      try {
        const url = new URL(req.url ?? '/', base || 'http://localhost');
        // For load balancers and container health checks.
        if (url.pathname === '/healthz') return send(res, 200, { ok: true, company: (await node.company())?.name ?? null });
        if (url.pathname === '/login') {
          const operator = url.searchParams.get('operator');
          if (operator) {
            if (!operatorTokens.delete(operator)) return page(res, 403, 'That link was used already', 'Operator links let one person in, once. Make a new one on the server: weave-server operator.');
            return redirect(res, '/', { 'set-cookie': cookie(startSession({ subject: 'operator', name: "The company's operator" })) });
          }
          const { authorization_endpoint } = await discover();
          const state = b64url(randomBytes(16));
          const verifier = b64url(randomBytes(32));
          const nonce = b64url(randomBytes(16));
          pending.set(state, { verifier, nonce, expires: Date.now() + 10 * 60_000 });
          const to = new URL(authorization_endpoint);
          for (const [k, v] of Object.entries({ response_type: 'code', client_id: options.clientId, redirect_uri: `${base}/callback`, scope: 'openid email profile', state, nonce, code_challenge: b64url(createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256' }))
            to.searchParams.set(k, v);
          return redirect(res, to.toString());
        }
        if (url.pathname === '/callback') {
          const state = url.searchParams.get('state') ?? '';
          const waiting = pending.get(state);
          pending.delete(state);
          if (!waiting || waiting.expires < Date.now()) return page(res, 400, 'That sign-in expired', 'Start again from the console.');
          const { token_endpoint } = await discover();
          const form = new URLSearchParams({ grant_type: 'authorization_code', code: url.searchParams.get('code') ?? '', redirect_uri: `${base}/callback`, client_id: options.clientId, code_verifier: waiting.verifier, ...(options.clientSecret ? { client_secret: options.clientSecret } : {}) });
          const answer = (await (await fetch(token_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form })).json()) as { id_token?: string };
          if (!answer.id_token) return page(res, 401, 'Not signed in', "The company's sign-in gave no ID token.");
          const claims = await verifyIdToken(answer.id_token, options.issuer, options.clientId);
          const payload = JSON.parse(Buffer.from(answer.id_token.split('.')[1], 'base64url').toString()) as { nonce?: string; name?: string };
          if (payload.nonce !== waiting.nonce) return page(res, 401, 'Not signed in', 'That sign-in was for another request. Start again from the console.');
          if (!node.consoleAdmin(claims)) return page(res, 403, 'Only for admins', `${claims.email ?? claims.sub} isn't in the company's admins group. Ask an admin to add you, or sign in with another account.`);
          return redirect(res, '/', { 'set-cookie': cookie(startSession({ subject: claims.sub, ...(claims.email ? { email: claims.email } : {}), ...(payload.name ? { name: payload.name } : {}) })) });
        }
        if (url.pathname === '/logout') {
          const sid = /(?:^|;\s*)weave_console=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];
          if (sid) sessions.delete(sid);
          return redirect(res, '/', { 'set-cookie': 'weave_console=; Max-Age=0; Path=/' });
        }
        if (url.pathname.startsWith('/api/')) {
          const who = sessionOf(req);
          if (!who) return send(res, 401, { error: 'sign in first' });
          return await api(req, res, url, who);
        }
        // The app itself.
        const assets = options.assets ?? consoleAssets();
        if (!assets) return send(res, 500, { error: 'the console app is missing (build apps/console)' });
        const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
        const path = join(assets, file);
        if (file.includes('..') || !existsSync(path)) {
          res.writeHead(200, { 'content-type': TYPES['.html'] });
          return void res.end(readFileSync(join(assets, 'index.html')));
        }
        res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'x-content-type-options': 'nosniff' });
        res.end(readFileSync(path));
      } catch (error) {
        send(res, 500, { error: (error as Error).message });
      }
    })();
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, resolve);
  });
  const port = (server.address() as AddressInfo).port;
  base ||= `http://localhost:${port}`;
  return {
    port,
    url: base,
    operatorLink() {
      const token = b64url(randomBytes(24));
      operatorTokens.add(token);
      return `${base}/login?operator=${token}`;
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
