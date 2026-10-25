import { constants, createCipheriv, createDecipheriv, createHash, createHmac, createSign, createVerify, generateKeyPairSync, privateDecrypt, publicEncrypt, randomBytes, type KeyObject } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { signV4 } from '../../src/keyproviders.ts';

/*
 * Stand-ins for a company's services, for tests: a Vault with the Transit
 * engine and JWT auth, and an OIDC identity provider. They follow the real
 * HTTP APIs closely enough to exercise Weave's side, nothing more.
 */

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

/** An OIDC provider: signs ID tokens (RS256) and serves its discovery document and keys. */
export class OidcStub {
  readonly #keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  readonly kid = 'test-key';
  #server?: Server;
  issuer = '';
  /** Who signs in through /authorize (the code flow). */
  loginAs?: { sub: string; email?: string; name?: string; groups?: string[] };
  /** With people, /authorize shows a sign-in page to pick one (demos); without, loginAs signs in at once. */
  people?: Array<{ sub: string; email?: string; name?: string; groups?: string[] }>;
  /** The stand-in's clock, for tokens' times (tests move it). */
  now = () => Date.now();
  /** How many times a refresh token was used. */
  refreshes = 0;
  /** How many tokens for other resources (delegated) it issued. */
  delegations = 0;
  /** People blocked in the sign-in: their refresh tokens stop working. */
  readonly disabled = new Set<string>();
  readonly #refresh = new Map<string, { claims: { sub: string; email?: string; name?: string; groups?: string[] }; clientId: string }>();
  readonly #codes = new Map<string, { claims: { sub: string; email?: string; name?: string; groups?: string[] }; clientId: string; redirect: string; challenge: string; nonce: string }>();

  async start(port = 0): Promise<this> {
    this.#server = createServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      if (req.url === '/.well-known/openid-configuration')
        return res.end(JSON.stringify({ issuer: this.issuer, jwks_uri: `${this.issuer}/jwks`, authorization_endpoint: `${this.issuer}/authorize`, token_endpoint: `${this.issuer}/token` }));
      // Sign-in with authorization code and PKCE: whoever loginAs names signs in at once.
      if (req.url?.startsWith('/authorize')) {
        const q = new URL(req.url, this.issuer).searchParams;
        const chosen = q.get('as');
        if (this.people && chosen === null) {
          res.setHeader('content-type', 'text/html; charset=utf-8');
          return void res.end(signInPage(this.people, q));
        }
        if (this.people && chosen !== null) this.loginAs = this.people[Number(chosen)];
        if (!this.loginAs) return void ((res.statusCode = 401), res.end('{}'));
        const code = randomBytes(12).toString('hex');
        this.#codes.set(code, { claims: this.loginAs, clientId: q.get('client_id') ?? '', redirect: q.get('redirect_uri') ?? '', challenge: q.get('code_challenge') ?? '', nonce: q.get('nonce') ?? '' });
        res.statusCode = 302;
        res.setHeader('location', `${q.get('redirect_uri')}?code=${code}&state=${encodeURIComponent(q.get('state') ?? '')}`);
        return res.end();
      }
      if (req.url === '/token' && req.method === 'POST') {
        let raw = '';
        req.on('data', (c) => (raw += c));
        req.on('end', () => {
          const form = new URLSearchParams(raw);
          if (form.get('grant_type') === 'refresh_token') {
            const held = this.#refresh.get(form.get('refresh_token') ?? '');
            if (!held || held.clientId !== form.get('client_id') || this.disabled.has(held.claims.sub)) return void ((res.statusCode = 400), res.end(JSON.stringify({ error: 'invalid_grant', error_description: 'sign in again' })));
            // A token for another resource, issued to the person (delegated): Key Vault's audience.
            if ((form.get('scope') ?? '').includes('vault.azure.net')) {
              this.delegations++;
              return void res.end(JSON.stringify({ access_token: this.token({ ...held.claims, aud: 'https://vault.azure.net' }), expires_in: 3600, token_type: 'Bearer' }));
            }
            this.refreshes++;
            return void res.end(JSON.stringify({ id_token: this.token({ ...held.claims, aud: held.clientId }), refresh_token: form.get('refresh_token'), token_type: 'Bearer' }));
          }
          const grant = this.#codes.get(form.get('code') ?? '');
          this.#codes.delete(form.get('code') ?? '');
          const verifier = form.get('code_verifier') ?? '';
          const ok = grant && grant.clientId === form.get('client_id') && grant.redirect === form.get('redirect_uri') && createHash('sha256').update(verifier).digest('base64url') === grant.challenge;
          if (!ok) return void ((res.statusCode = 400), res.end(JSON.stringify({ error: 'invalid_grant' })));
          const refresh = randomBytes(16).toString('hex');
          this.#refresh.set(refresh, { claims: grant.claims, clientId: grant.clientId });
          res.end(JSON.stringify({ id_token: this.token({ ...grant.claims, aud: grant.clientId, nonce: grant.nonce }), refresh_token: refresh, token_type: 'Bearer' }));
        });
        return;
      }
      if (req.url === '/jwks') return res.end(JSON.stringify({ keys: [{ ...(this.#keys.publicKey.export({ format: 'jwk' }) as object), kid: this.kid, alg: 'RS256', use: 'sig' }] }));
      res.statusCode = 404;
      res.end('{}');
    });
    await new Promise<void>((resolve) => this.#server!.listen(port, '127.0.0.1', resolve));
    this.issuer = `http://127.0.0.1:${(this.#server.address() as AddressInfo).port}`;
    return this;
  }

  get publicKey(): KeyObject {
    return this.#keys.publicKey;
  }

  /** An ID token for an employee. */
  token(claims: { sub: string; email?: string; name?: string; groups?: string[]; aud?: string; nonce?: string; expiresIn?: number; signWith?: KeyObject }): string {
    const now = Math.floor(this.now() / 1000);
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: this.kid }));
    const body = b64url(JSON.stringify({ iss: this.issuer, aud: claims.aud ?? 'weave', sub: claims.sub, email: claims.email, name: claims.name, groups: claims.groups ?? [], nonce: claims.nonce, iat: now, exp: now + (claims.expiresIn ?? 3600) }));
    const signature = createSign('RSA-SHA256').update(`${header}.${body}`).sign(claims.signWith ?? this.#keys.privateKey);
    return `${header}.${body}.${b64url(signature)}`;
  }

  async stop(): Promise<void> {
    await new Promise((resolve) => this.#server?.close(resolve));
  }
}

/** Vault with Transit (derived keys) and JWT auth bound to an OIDC issuer; it can disable people. */
export class VaultStub {
  readonly #keys = new Map<string, Buffer>();
  readonly #tokens = new Map<string, { sub: string }>();
  readonly #disabled = new Set<string>();
  readonly audit: Array<{ op: string; sub: string; context?: string }> = [];
  #server?: Server;
  address = '';
  /** The token an operator would hand out directly (no SSO). */
  readonly rootToken = 'root-token';

  readonly oidc?: OidcStub;

  constructor(oidc?: OidcStub) {
    this.oidc = oidc;
    this.#tokens.set(this.rootToken, { sub: 'root' });
  }

  createKey(name: string): void {
    this.#keys.set(name, randomBytes(32));
  }

  hasKey(name: string): boolean {
    return this.#keys.has(name);
  }

  /** Offboarding: the person's tokens stop working and they can't sign in again. */
  disable(sub: string): void {
    this.#disabled.add(sub);
    for (const [token, t] of this.#tokens) if (t.sub === sub) this.#tokens.delete(token);
  }

  async start(port = 0): Promise<this> {
    this.#server = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(body));
        };
        const body = raw ? JSON.parse(raw) : {};
        const url = req.url ?? '';
        if (url.startsWith('/v1/auth/jwt/login')) {
          const sub = this.#verify(String(body.jwt ?? ''));
          if (!sub || this.#disabled.has(sub)) return send(403, { errors: ['permission denied'] });
          const token = `t-${randomBytes(8).toString('hex')}`;
          this.#tokens.set(token, { sub });
          return send(200, { auth: { client_token: token, lease_duration: 600 } });
        }
        const who = this.#tokens.get(String(req.headers['x-vault-token'] ?? ''));
        if (!who) return send(403, { errors: ['permission denied'] });
        const match = /^\/v1\/transit\/(encrypt|decrypt|keys)\/([^/]+)(\/config)?$/.exec(url);
        if (!match) return send(404, { errors: ['no handler'] });
        const [, op, name, config] = match;
        if (op === 'keys') {
          if (config) return send(204, {});
          if (req.method === 'DELETE') {
            this.#keys.delete(name);
            return send(204, {});
          }
        }
        const secret = this.#keys.get(name);
        if (!secret) return send(400, { errors: ['encryption key not found'] });
        const context = String(body.context ?? '');
        const key = createHmac('sha256', secret).update(context).digest();
        this.audit.push({ op, sub: who.sub, context: Buffer.from(context, 'base64').toString() });
        if (op === 'encrypt') {
          const iv = randomBytes(12);
          const cipher = createCipheriv('aes-256-gcm', key, iv);
          const ct = Buffer.concat([cipher.update(Buffer.from(String(body.plaintext), 'base64')), cipher.final()]);
          return send(200, { data: { ciphertext: `vault:v1:${Buffer.concat([iv, ct, cipher.getAuthTag()]).toString('base64')}` } });
        }
        try {
          const all = Buffer.from(String(body.ciphertext).replace(/^vault:v1:/, ''), 'base64');
          const decipher = createDecipheriv('aes-256-gcm', key, all.subarray(0, 12));
          decipher.setAuthTag(all.subarray(all.length - 16));
          const plain = Buffer.concat([decipher.update(all.subarray(12, all.length - 16)), decipher.final()]);
          return send(200, { data: { plaintext: plain.toString('base64') } });
        } catch {
          return send(400, { errors: ['cipher: message authentication failed'] });
        }
      });
    });
    await new Promise<void>((resolve) => this.#server!.listen(port, '127.0.0.1', resolve));
    this.address = `http://127.0.0.1:${(this.#server.address() as AddressInfo).port}`;
    return this;
  }

  /** A JWT's subject, if the issuer signed it and it's current. */
  #verify(jwt: string): string | undefined {
    if (!this.oidc) return undefined;
    const [h, b, s] = jwt.split('.');
    if (!h || !b || !s) return undefined;
    const ok = createVerify('RSA-SHA256').update(`${h}.${b}`).verify(this.oidc.publicKey, Buffer.from(s, 'base64url'));
    const claims = JSON.parse(Buffer.from(b, 'base64url').toString()) as { sub: string; exp: number };
    return ok && claims.exp * 1000 > Date.now() ? claims.sub : undefined;
  }

  async stop(): Promise<void> {
    await new Promise((resolve) => this.#server?.close(resolve));
  }
}

/** Azure Key Vault (RSA keys, wrapkey/unwrapkey) with Entra's token endpoint: a client secret, or a federated assertion from the OIDC stand-in. */
export class AzureStub {
  readonly #keys = new Map<string, { privateKey: KeyObject; publicKey: KeyObject }>();
  readonly #tokens = new Map<string, string>();
  readonly #disabled = new Set<string>();
  readonly secret = 'client-secret';
  readonly log: Array<{ op: string; sub: string }> = [];
  #server?: Server;
  url = '';
  readonly oidc?: OidcStub;

  constructor(oidc?: OidcStub) {
    this.oidc = oidc;
  }

  /** A person's Key Vault token (delegated), checked as Key Vault would: signed by the sign-in, for Key Vault, current, not blocked. */
  #person(token: string): string | undefined {
    if (!this.oidc) return undefined;
    const [h, b, sig] = token.split('.');
    if (!h || !b || !sig || !createVerify('RSA-SHA256').update(`${h}.${b}`).verify(this.oidc.publicKey, Buffer.from(sig, 'base64url'))) return undefined;
    const claims = JSON.parse(Buffer.from(b, 'base64url').toString()) as { sub: string; aud: string; exp: number };
    if (claims.aud !== 'https://vault.azure.net' || claims.exp * 1000 < Date.now() || this.#disabled.has(claims.sub)) return undefined;
    return claims.sub;
  }

  createKey(name: string): void {
    this.#keys.set(name, generateKeyPairSync('rsa', { modulusLength: 2048 }));
  }

  hasKey(name: string): boolean {
    return this.#keys.has(name);
  }

  disable(sub: string): void {
    this.#disabled.add(sub);
    for (const [token, who] of this.#tokens) if (who === sub) this.#tokens.delete(token);
  }

  async start(): Promise<this> {
    this.#server = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(body));
        };
        const url = new URL(req.url ?? '/', this.url);
        if (url.pathname.endsWith('/oauth2/v2.0/token')) {
          const form = new URLSearchParams(raw);
          let sub: string | undefined;
          if (form.get('client_secret') === this.secret) sub = `app:${form.get('client_id')}`;
          if (!sub || this.#disabled.has(sub)) return send(401, { error: 'invalid_client' });
          const token = `a-${randomBytes(8).toString('hex')}`;
          this.#tokens.set(token, sub);
          return send(200, { access_token: token, expires_in: 3600, token_type: 'Bearer' });
        }
        // An app's token from this stand-in's own endpoint, or a token Entra issued to a person (delegated, from the OIDC stand-in).
        const bearer = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
        const who = this.#tokens.get(bearer) ?? this.#person(bearer);
        if (!who) return send(401, { error: { code: 'Unauthorized' } });
        const m = /^\/keys\/([^/]+)(?:\/([^/]+))?(?:\/(wrapkey|unwrapkey))?$/.exec(url.pathname);
        if (!m) return send(404, {});
        const [, name, part, op] = m;
        const version = op ? part : undefined;
        const action = op ?? (part === 'wrapkey' || part === 'unwrapkey' ? part : undefined);
        if (req.method === 'DELETE' && !action) {
          this.#keys.delete(name);
          return send(200, {});
        }
        const key = this.#keys.get(name);
        if (!key) return send(404, { error: { code: 'KeyNotFound' } });
        const body = JSON.parse(raw || '{}') as { value: string };
        this.log.push({ op: action ?? '', sub: who });
        const options = { oaepHash: 'sha256', padding: constants.RSA_PKCS1_OAEP_PADDING };
        if (action === 'wrapkey') return send(200, { kid: `${this.url}/keys/${name}/v1`, value: publicEncrypt({ key: key.publicKey, ...options }, Buffer.from(body.value, 'base64url')).toString('base64url') });
        if (action === 'unwrapkey' && version) {
          try {
            return send(200, { kid: `${this.url}/keys/${name}/${version}`, value: privateDecrypt({ key: key.privateKey, ...options }, Buffer.from(body.value, 'base64url')).toString('base64url') });
          } catch {
            return send(400, { error: { code: 'BadParameter' } });
          }
        }
        return send(400, {});
      });
    });
    await new Promise<void>((resolve) => this.#server!.listen(0, '127.0.0.1', resolve));
    this.url = `http://127.0.0.1:${(this.#server.address() as AddressInfo).port}`;
    return this;
  }

  async stop(): Promise<void> {
    await new Promise((resolve) => this.#server?.close(resolve));
  }
}

/** A company sign-in page for demos: pick who signs in. */
function signInPage(people: Array<{ sub: string; email?: string; name?: string; groups?: string[] }>, query: URLSearchParams): string {
  const choice = (i: number) => {
    const q = new URLSearchParams(query);
    q.set('as', String(i));
    return `/authorize?${q.toString()}`;
  };
  return `<!doctype html><meta charset="utf-8"><title>Sign in · Acme</title>
<style>body{font:15px 'Segoe UI',system-ui,sans-serif;background:#f3f2f1;margin:0;display:grid;place-items:center;min-height:100vh}
.box{background:#fff;width:380px;padding:40px 44px;box-shadow:0 2px 6px #0003}h1{font-size:24px;font-weight:600;margin:16px 0 4px}p{color:#605e5c;margin:0 0 20px}
a{display:flex;gap:12px;align-items:center;padding:10px 12px;margin:0 -12px;text-decoration:none;color:#1b1b1b;border-radius:4px}a:hover{background:#f3f2f1}
.av{width:36px;height:36px;border-radius:50%;background:#0067b8;color:#fff;display:grid;place-items:center;font-weight:600}.e{color:#605e5c;font-size:13px}.logo{font-weight:700;color:#0067b8}</style>
<div class="box"><div class="logo">Acme · company sign-in (demo)</div><h1>Pick an account</h1><p>to continue to Weave</p>
${people.map((p, i) => `<a href="${choice(i)}"><span class="av">${(p.name ?? p.sub).split(' ').map((w) => w[0]).join('').slice(0, 2)}</span><span><div>${p.name ?? p.sub}</div><div class="e">${p.email ?? ''}</div></span></a>`).join('')}
</div>`;
}

/** A mail server (SMTP, no TLS): takes every message and keeps it, decoded, for the test to read. */
export class SmtpStub {
  readonly messages: Array<{ from: string; to: string[]; data: string; text: string; user?: string }> = [];
  port = 0;
  #server?: import('node:net').Server;

  async start(): Promise<this> {
    const { createServer: createTcp } = await import('node:net');
    this.#server = createTcp((socket) => {
      let buffer = '';
      let data: string[] | undefined;
      const message: { from: string; to: string[]; user?: string } = { from: '', to: [] };
      const say = (line: string) => socket.write(`${line}\r\n`);
      say('220 mail.acme.example ready');
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        let at: number;
        while ((at = buffer.indexOf('\r\n')) >= 0) {
          const line = buffer.slice(0, at);
          buffer = buffer.slice(at + 2);
          if (data) {
            if (line !== '.') {
              data.push(line);
              continue;
            }
            const raw = data.join('\r\n');
            // The plain-text part, decoded: what a reader sees.
            const part = /Content-Type: text\/plain[^]*?\r\n\r\n([A-Za-z0-9+/=\r\n]+)/.exec(raw)?.[1] ?? '';
            this.messages.push({ ...message, to: [...message.to], data: raw, text: Buffer.from(part.replace(/\r\n/g, ''), 'base64').toString('utf8') });
            data = undefined;
            say('250 queued');
          } else if (/^EHLO/i.test(line)) say('250-mail.acme.example\r\n250 AUTH PLAIN');
          else if (/^AUTH PLAIN /i.test(line)) {
            message.user = Buffer.from(line.slice(11), 'base64').toString('utf8').split('\0')[1];
            say('235 ok');
          } else if (/^MAIL FROM:/i.test(line)) {
            message.from = /<(.*)>/.exec(line)?.[1] ?? '';
            message.to = [];
            say('250 ok');
          } else if (/^RCPT TO:/i.test(line)) {
            message.to.push(/<(.*)>/.exec(line)?.[1] ?? '');
            say('250 ok');
          } else if (/^DATA/i.test(line)) {
            data = [];
            say('354 go on');
          } else if (/^QUIT/i.test(line)) {
            say('221 bye');
            socket.end();
          } else say('502 not here');
        }
      });
      socket.on('error', () => {});
    });
    await new Promise<void>((resolve) => this.#server!.listen(0, '127.0.0.1', resolve));
    this.port = (this.#server.address() as AddressInfo).port;
    return this;
  }

  get url(): string {
    return `smtp://weave%40acme.example:mail-secret@127.0.0.1:${this.port}`;
  }

  stop(): Promise<void> {
    return new Promise((resolve) => (this.#server ? this.#server.close(() => resolve()) : resolve()));
  }
}

/** An ID token from the OIDC stand-in, checked as a cloud's federation would: signed, from it, for `audience`, current. */
function federated(oidc: OidcStub | undefined, token: string, audience: string, disabled: Set<string>): { sub: string; email?: string } | undefined {
  if (!oidc) return undefined;
  const [h, b, sig] = token.split('.');
  if (!h || !b || !sig || !createVerify('RSA-SHA256').update(`${h}.${b}`).verify(oidc.publicKey, Buffer.from(sig, 'base64url'))) return undefined;
  const claims = JSON.parse(Buffer.from(b, 'base64url').toString()) as { iss: string; sub: string; email?: string; aud: string; exp: number };
  if (claims.iss !== oidc.issuer || claims.aud !== audience || claims.exp * 1000 < Date.now() || disabled.has(claims.sub)) return undefined;
  return claims;
}

/** A symmetric key's sealing, bound to `aad`: what a cloud KMS's encrypt and decrypt do. */
function sealWith(key: Buffer, plaintext: Buffer, aad: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv).setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
}
function openWith(key: Buffer, sealed: Buffer, aad: string): Buffer | undefined {
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, sealed.subarray(0, 12)).setAAD(Buffer.from(aad));
    decipher.setAuthTag(sealed.subarray(12, 28));
    return Buffer.concat([decipher.update(sealed.subarray(28)), decipher.final()]);
  } catch {
    return undefined;
  }
}

/**
 * AWS: STS (AssumeRoleWithWebIdentity, trusting the OIDC stand-in for `audience`) and KMS with symmetric keys,
 * on one address. Every KMS request's Signature Version 4 is checked against the caller's secret.
 */
export class AwsStub {
  readonly region = 'eu-central-1';
  readonly #users = new Map<string, { secret: string; principal: string; sessionToken?: string; until?: number }>();
  readonly #roles = new Set<string>();
  readonly #keys = new Map<string, { id: string; arn: string; key: Buffer; state: 'Enabled' | 'PendingDeletion' }>();
  readonly #disabled = new Set<string>();
  readonly log: Array<{ op: string; principal: string; context?: string }> = [];
  audience = 'weave';
  url = '';
  #server?: Server;
  readonly oidc?: OidcStub;

  constructor(oidc?: OidcStub) {
    this.oidc = oidc;
  }

  /** An IAM user's access keys (for the company's server). */
  createUser(name: string): { accessKeyId: string; secretAccessKey: string } {
    const accessKeyId = `AKIA${randomBytes(8).toString('hex').toUpperCase()}`;
    const secretAccessKey = randomBytes(30).toString('base64');
    this.#users.set(accessKeyId, { secret: secretAccessKey, principal: `user/${name}` });
    return { accessKeyId, secretAccessKey };
  }

  /** A role people take on with their company sign-in. */
  createRole(name: string): string {
    const arn = `arn:aws:iam::123456789012:role/${name}`;
    this.#roles.add(arn);
    return arn;
  }

  createKey(alias: string): string {
    const id = randomBytes(16).toString('hex');
    const entry = { id, arn: `arn:aws:kms:${this.region}:123456789012:key/${id}`, key: randomBytes(32), state: 'Enabled' as const };
    this.#keys.set(`alias/${alias}`, entry);
    this.#keys.set(id, entry);
    this.#keys.set(entry.arn, entry);
    return `alias/${alias}`;
  }

  keyState(alias: string): string | undefined {
    return this.#keys.get(alias)?.state;
  }

  /** Blocked in the sign-in: no new sessions. */
  disable(sub: string): void {
    this.#disabled.add(sub);
  }

  /** The caller of a signed request, if its signature holds. */
  #caller(req: IncomingMessage, raw: string): { principal: string } | { error: string } {
    const auth = String(req.headers.authorization ?? '');
    const m = /^AWS4-HMAC-SHA256 Credential=([^/]+)\/(\d{8})\/([^/]+)\/([^/]+)\/aws4_request, SignedHeaders=([^,]+), Signature=([0-9a-f]{64})$/.exec(auth);
    if (!m) return { error: 'MissingAuthenticationTokenException' };
    const [, accessKeyId, , region, service, signed] = m;
    const user = this.#users.get(accessKeyId);
    if (!user) return { error: 'UnrecognizedClientException' };
    if (user.until && user.until < Date.now()) return { error: 'ExpiredTokenException' };
    if (user.sessionToken && req.headers['x-amz-security-token'] !== user.sessionToken) return { error: 'UnrecognizedClientException' };
    const amzDate = String(req.headers['x-amz-date'] ?? '');
    const when = Date.parse(`${amzDate.slice(0, 4)}-${amzDate.slice(4, 6)}-${amzDate.slice(6, 8)}T${amzDate.slice(9, 11)}:${amzDate.slice(11, 13)}:${amzDate.slice(13, 15)}Z`);
    if (!(Math.abs(Date.now() - when) < 5 * 60_000)) return { error: 'InvalidSignatureException' };
    const headers: Record<string, string> = {};
    for (const name of signed.split(';')) if (name !== 'host' && name !== 'x-amz-date' && name !== 'x-amz-security-token') headers[name] = String(req.headers[name] ?? '');
    const expected = signV4({ method: req.method ?? 'POST', url: `${this.url}${req.url ?? '/'}`, headers, body: raw }, { accessKeyId, secretAccessKey: user.secret, ...(user.sessionToken ? { sessionToken: user.sessionToken } : {}) }, region, service, new Date(when));
    if (expected.authorization !== auth || region !== this.region || service !== 'kms') return { error: 'InvalidSignatureException' };
    return { principal: user.principal };
  }

  async start(): Promise<this> {
    this.#server = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        const json = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader('content-type', 'application/x-amz-json-1.1');
          res.end(JSON.stringify(body));
        };
        const target = String(req.headers['x-amz-target'] ?? '');
        if (!target) {
          // STS: a role for a company sign-in.
          const form = new URLSearchParams(raw);
          const xmlError = (status: number, code: string, message: string) => {
            res.statusCode = status;
            res.end(`<ErrorResponse><Error><Code>${code}</Code><Message>${message}</Message></Error></ErrorResponse>`);
          };
          if (form.get('Action') !== 'AssumeRoleWithWebIdentity') return xmlError(400, 'InvalidAction', 'not here');
          const role = form.get('RoleArn') ?? '';
          const claims = federated(this.oidc, form.get('WebIdentityToken') ?? '', this.audience, this.#disabled);
          if (!claims) return xmlError(400, 'InvalidIdentityToken', 'the token is not valid');
          if (!this.#roles.has(role)) return xmlError(403, 'AccessDenied', 'not authorized to perform sts:AssumeRoleWithWebIdentity');
          const session = form.get('RoleSessionName') ?? '';
          const accessKeyId = `ASIA${randomBytes(8).toString('hex').toUpperCase()}`;
          const secret = randomBytes(30).toString('base64');
          const sessionToken = randomBytes(48).toString('base64');
          const until = Date.now() + Number(form.get('DurationSeconds') ?? 3600) * 1000;
          this.#users.set(accessKeyId, { secret, principal: `assumed-role/${role.split('/').pop()}/${session}`, sessionToken, until });
          this.log.push({ op: 'AssumeRoleWithWebIdentity', principal: `${claims.sub} as ${session}` });
          res.setHeader('content-type', 'text/xml');
          return void res.end(
            `<AssumeRoleWithWebIdentityResponse><AssumeRoleWithWebIdentityResult><Credentials><AccessKeyId>${accessKeyId}</AccessKeyId><SecretAccessKey>${secret}</SecretAccessKey><SessionToken>${sessionToken}</SessionToken><Expiration>${new Date(until).toISOString()}</Expiration></Credentials><SubjectFromWebIdentityToken>${claims.sub}</SubjectFromWebIdentityToken></AssumeRoleWithWebIdentityResult></AssumeRoleWithWebIdentityResponse>`,
          );
        }
        const caller = this.#caller(req, raw);
        if ('error' in caller) return json(400, { __type: caller.error, message: 'the request is not signed by a known caller' });
        const op = target.replace(/^TrentService\./, '');
        const body = JSON.parse(raw || '{}') as { KeyId?: string; Plaintext?: string; CiphertextBlob?: string; EncryptionContext?: Record<string, string> };
        const context = body.EncryptionContext ? JSON.stringify(Object.entries(body.EncryptionContext).sort()) : '';
        this.log.push({ op, principal: caller.principal, ...(body.EncryptionContext ? { context: Object.values(body.EncryptionContext).join(',') } : {}) });
        const key = this.#keys.get(body.KeyId ?? '');
        if (!key) return json(400, { __type: 'NotFoundException', message: `key ${body.KeyId} not found` });
        if (op === 'DescribeKey') return json(200, { KeyMetadata: { KeyId: key.id, Arn: key.arn, KeyState: key.state } });
        if (op === 'ScheduleKeyDeletion') {
          if (body.KeyId !== key.arn && body.KeyId !== key.id) return json(400, { __type: 'NotFoundException', message: 'an alias is not a key' });
          key.state = 'PendingDeletion';
          return json(200, { KeyId: key.arn, KeyState: key.state });
        }
        if (key.state !== 'Enabled') return json(400, { __type: 'KMSInvalidStateException', message: `${key.arn} is pending deletion` });
        if (op === 'Encrypt') return json(200, { KeyId: key.arn, CiphertextBlob: Buffer.from(`${key.id}.${sealWith(key.key, Buffer.from(body.Plaintext ?? '', 'base64'), context)}`).toString('base64') });
        if (op === 'Decrypt') {
          const [id, sealed] = Buffer.from(body.CiphertextBlob ?? '', 'base64').toString().split('.');
          const plain = id === key.id && sealed ? openWith(key.key, Buffer.from(sealed, 'base64'), context) : undefined;
          if (!plain) return json(400, { __type: 'InvalidCiphertextException', message: '' });
          return json(200, { KeyId: key.arn, Plaintext: plain.toString('base64') });
        }
        return json(400, { __type: 'UnknownOperationException' });
      });
    });
    await new Promise<void>((resolve) => this.#server!.listen(0, '127.0.0.1', resolve));
    this.url = `http://127.0.0.1:${(this.#server.address() as AddressInfo).port}`;
    return this;
  }

  async stop(): Promise<void> {
    await new Promise((resolve) => this.#server?.close(resolve));
  }
}

/**
 * Google Cloud: STS (token exchange through a workload identity provider that trusts the OIDC stand-in for
 * `audience`), OAuth for service accounts (a signed assertion), and Cloud KMS with symmetric keys and versions.
 */
export class GcpStub {
  readonly workload = 'projects/123456/locations/global/workloadIdentityPools/acme/providers/acme-sign-in';
  readonly #accounts = new Map<string, KeyObject>();
  readonly #tokens = new Map<string, { principal: string; until: number }>();
  readonly #keys = new Map<string, Array<{ name: string; key: Buffer; state: 'ENABLED' | 'DESTROY_SCHEDULED' }>>();
  readonly #disabled = new Set<string>();
  readonly log: Array<{ op: string; principal: string }> = [];
  audience = 'weave';
  url = '';
  #server?: Server;
  readonly oidc?: OidcStub;

  constructor(oidc?: OidcStub) {
    this.oidc = oidc;
  }

  /** A service account and its key, as the JSON file Google hands out. */
  createServiceAccount(name: string): { client_email: string; private_key: string; private_key_id: string; token_uri: string } {
    const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const email = `${name}@acme-weave.iam.gserviceaccount.com`;
    this.#accounts.set(email, pair.publicKey);
    return { client_email: email, private_key: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string, private_key_id: randomBytes(8).toString('hex'), token_uri: `${this.url}/token` };
  }

  createKey(name: string): string {
    const path = `projects/acme-weave/locations/europe-west3/keyRings/weave/cryptoKeys/${name}`;
    this.#keys.set(path, [{ name: `${path}/cryptoKeyVersions/1`, key: randomBytes(32), state: 'ENABLED' }]);
    return path;
  }

  /** A new primary version: what a rotation does. Older versions still decrypt. */
  rotate(path: string): void {
    const versions = this.#keys.get(path)!;
    versions.push({ name: `${path}/cryptoKeyVersions/${versions.length + 1}`, key: randomBytes(32), state: 'ENABLED' });
  }

  keyStates(path: string): string[] {
    return (this.#keys.get(path) ?? []).map((v) => v.state);
  }

  disable(sub: string): void {
    this.#disabled.add(sub);
  }

  #issue(principal: string): { access_token: string; expires_in: number; token_type: string } {
    const token = `ya29.${randomBytes(16).toString('hex')}`;
    this.#tokens.set(token, { principal, until: Date.now() + 3_600_000 });
    return { access_token: token, expires_in: 3600, token_type: 'Bearer' };
  }

  async start(): Promise<this> {
    this.#server = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(body));
        };
        const error = (status: number, code: string, message: string) => send(status, { error: { code: status, status: code, message } });
        const url = new URL(req.url ?? '/', this.url);
        if (url.pathname === '/v1/token') {
          // STS: a company sign-in for a federated token.
          const body = JSON.parse(raw || '{}') as { audience?: string; subjectToken?: string; subjectTokenType?: string; grantType?: string };
          if (body.grantType !== 'urn:ietf:params:oauth:grant-type:token-exchange' || body.subjectTokenType !== 'urn:ietf:params:oauth:token-type:id_token') return send(400, { error: 'invalid_request' });
          if (body.audience !== `//iam.googleapis.com/${this.workload}`) return send(400, { error: 'invalid_target', error_description: 'unknown workload identity provider' });
          const claims = federated(this.oidc, body.subjectToken ?? '', this.audience, this.#disabled);
          if (!claims) return send(400, { error: 'invalid_grant', error_description: 'the ID token is not valid' });
          return send(200, { ...this.#issue(`principal://iam.googleapis.com/${this.workload.replace(/\/providers\/.*$/, '')}/subject/${claims.sub}`), issued_token_type: 'urn:ietf:params:oauth:token-type:access_token' });
        }
        if (url.pathname === '/token') {
          // OAuth for a service account: its signed assertion.
          const assertion = new URLSearchParams(raw).get('assertion') ?? '';
          const [h, b, sig] = assertion.split('.');
          const claims = b ? (JSON.parse(Buffer.from(b, 'base64url').toString()) as { iss: string; aud: string; exp: number; scope: string }) : undefined;
          const key = claims ? this.#accounts.get(claims.iss) : undefined;
          if (!claims || !key || !createVerify('RSA-SHA256').update(`${h}.${b}`).verify(key, Buffer.from(sig ?? '', 'base64url')) || claims.aud !== `${this.url}/token` || claims.exp * 1000 < Date.now())
            return send(400, { error: 'invalid_grant', error_description: 'Invalid JWT Signature.' });
          return send(200, this.#issue(`serviceAccount:${claims.iss}`));
        }
        const bearer = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
        const who = this.#tokens.get(bearer);
        if (!who || who.until < Date.now()) return error(401, 'UNAUTHENTICATED', 'Request had invalid authentication credentials.');
        const m = /^\/v1\/(projects\/[^:]+?)(?::(encrypt|decrypt|destroy))?$/.exec(url.pathname);
        if (!m) return error(404, 'NOT_FOUND', 'no such resource');
        const [, path, verb] = m;
        const body = JSON.parse(raw || '{}') as { plaintext?: string; ciphertext?: string; additionalAuthenticatedData?: string };
        const aad = Buffer.from(body.additionalAuthenticatedData ?? '', 'base64').toString();
        this.log.push({ op: verb ?? req.method ?? '', principal: who.principal });
        if (!verb && path.endsWith('/cryptoKeyVersions') && req.method === 'GET') {
          const versions = this.#keys.get(path.replace(/\/cryptoKeyVersions$/, ''));
          return versions ? send(200, { cryptoKeyVersions: versions.map((v) => ({ name: v.name, state: v.state })) }) : error(404, 'NOT_FOUND', path);
        }
        if (verb === 'destroy') {
          const version = [...this.#keys.values()].flat().find((v) => v.name === path);
          if (!version) return error(404, 'NOT_FOUND', path);
          version.state = 'DESTROY_SCHEDULED';
          return send(200, { name: version.name, state: version.state });
        }
        const versions = this.#keys.get(path);
        if (!versions) return error(404, 'NOT_FOUND', path);
        if (verb === 'encrypt') {
          const primary = versions.at(-1)!;
          if (primary.state !== 'ENABLED') return error(400, 'FAILED_PRECONDITION', `${primary.name} is not enabled`);
          return send(200, { name: primary.name, ciphertext: Buffer.from(`${versions.length - 1}.${sealWith(primary.key, Buffer.from(body.plaintext ?? '', 'base64'), aad)}`).toString('base64') });
        }
        if (verb === 'decrypt') {
          const [index, sealed] = Buffer.from(body.ciphertext ?? '', 'base64').toString().split('.');
          const version = versions[Number(index)];
          if (!version || version.state !== 'ENABLED') return error(400, 'FAILED_PRECONDITION', 'the key version is not enabled');
          const plain = sealed ? openWith(version.key, Buffer.from(sealed, 'base64'), aad) : undefined;
          if (!plain) return error(400, 'INVALID_ARGUMENT', 'Decryption failed: the ciphertext is invalid.');
          return send(200, { plaintext: plain.toString('base64') });
        }
        return error(400, 'INVALID_ARGUMENT', 'not supported');
      });
    });
    await new Promise<void>((resolve) => this.#server!.listen(0, '127.0.0.1', resolve));
    this.url = `http://127.0.0.1:${(this.#server.address() as AddressInfo).port}`;
    return this;
  }

  async stop(): Promise<void> {
    await new Promise((resolve) => this.#server?.close(resolve));
  }
}
