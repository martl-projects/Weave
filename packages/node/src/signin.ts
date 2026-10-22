import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

/*
 * Signing in with a company account from this computer (stage 13): OpenID
 * Connect's authorization code flow with PKCE, the way native apps do it
 * (RFC 8252): the company's sign-in page opens in the system browser and
 * comes back to a one-time address on this computer (127.0.0.1). The ID
 * token says who you are; the refresh token renews it without asking again.
 */

export interface SignInConfig {
  issuer: string;
  clientId: string;
}

export interface SignInTokens {
  idToken: string;
  refreshToken?: string;
  /** When the ID token runs out (ms). */
  expires: number;
}

const b64url = (b: Buffer) => b.toString('base64url');

async function discover(issuer: string): Promise<{ authorization_endpoint: string; token_endpoint: string }> {
  const res = await fetch(`${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`);
  if (!res.ok) throw new Error(`the company's sign-in at ${issuer} can't be reached (${res.status})`);
  return (await res.json()) as { authorization_endpoint: string; token_endpoint: string };
}

/** The claims of a token, unchecked (the company's node checks them; this is for its expiry and nonce). */
export function claimsOf(idToken: string): { exp?: number; nonce?: string; email?: string; name?: string; sub?: string } {
  try {
    return JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString()) as { exp?: number; nonce?: string };
  } catch {
    return {};
  }
}

const tokensFrom = (answer: { id_token?: string; refresh_token?: string }, previousRefresh?: string): SignInTokens => {
  if (!answer.id_token) throw new Error('the company sign-in gave no ID token');
  return { idToken: answer.id_token, ...((answer.refresh_token ?? previousRefresh) ? { refreshToken: answer.refresh_token ?? previousRefresh } : {}), expires: (claimsOf(answer.id_token).exp ?? 0) * 1000 };
};

const DONE_PAGE = (ok: boolean, text: string) => `<!doctype html><meta charset="utf-8"><title>Weave</title>
<style>body{font:15px system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;margin:0;background:#f4f5f8;color:#101828}
div{background:#fff;border:1px solid #e4e7ec;border-radius:14px;padding:32px 36px;text-align:center;max-width:420px;box-shadow:0 12px 24px -8px #10182826}
h1{font-size:20px;margin:14px 0 6px}p{color:#667085;margin:0}</style>
<div><svg viewBox="0 0 512 512" width="56" height="56"><rect x="128" y="32" width="64" height="448" fill="#000080"/><rect x="320" y="32" width="64" height="448" fill="#008080"/><rect x="32" y="128" width="448" height="64" fill="#c00000"/><rect x="32" y="320" width="448" height="64" fill="#d4a000"/><rect x="128" y="128" width="64" height="64" fill="#000080"/><rect x="320" y="320" width="64" height="64" fill="#008080"/></svg>
<h1>${ok ? 'Signed in' : 'Not signed in'}</h1><p>${text}</p></div>`;

/**
 * Sign in through the browser: `open` shows the company's sign-in page (the
 * system browser, or a test's own fetch), and this waits until it comes back.
 */
export async function browserSignIn(config: SignInConfig, open: (url: string) => void | Promise<void>, options: { loginHint?: string; timeoutMs?: number } = {}): Promise<SignInTokens> {
  const { authorization_endpoint, token_endpoint } = await discover(config.issuer);
  const verifier = b64url(randomBytes(32));
  const state = b64url(randomBytes(16));
  const nonce = b64url(randomBytes(16));
  let finish!: (code: string) => void;
  let fail!: (error: Error) => void;
  const answered = new Promise<string>((resolve, reject) => ((finish = resolve), (fail = reject)));
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname !== '/callback') return void ((res.statusCode = 404), res.end());
    res.setHeader('content-type', 'text/html; charset=utf-8');
    const error = url.searchParams.get('error');
    if (error || url.searchParams.get('state') !== state) {
      res.end(DONE_PAGE(false, error ? `The company's sign-in said: ${url.searchParams.get('error_description') ?? error}` : 'That sign-in was for another request. Try again from Weave.'));
      return fail(new Error(error ? `the company's sign-in refused: ${url.searchParams.get('error_description') ?? error}` : 'the sign-in came back for another request'));
    }
    res.end(DONE_PAGE(true, 'You can close this tab and go back to Weave.'));
    finish(url.searchParams.get('code') ?? '');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const redirect = `http://127.0.0.1:${(server.address() as AddressInfo).port}/callback`;
  try {
    const authorize = new URL(authorization_endpoint);
    const params: Record<string, string> = {
      response_type: 'code',
      client_id: config.clientId,
      redirect_uri: redirect,
      scope: 'openid email profile offline_access',
      state,
      nonce,
      code_challenge: b64url(createHash('sha256').update(verifier).digest()),
      code_challenge_method: 'S256',
      ...(options.loginHint ? { login_hint: options.loginHint } : {}),
    };
    for (const [k, v] of Object.entries(params)) authorize.searchParams.set(k, v);
    await open(authorize.toString());
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('the sign-in took too long: start it again')), options.timeoutMs ?? 5 * 60_000).unref());
    const code = await Promise.race([answered, timeout]);
    const res = await fetch(token_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirect, client_id: config.clientId, code_verifier: verifier }),
    });
    const answer = (await res.json().catch(() => ({}))) as { id_token?: string; refresh_token?: string; error_description?: string };
    if (!res.ok) throw new Error(`the company's sign-in refused: ${answer.error_description ?? res.status}`);
    const tokens = tokensFrom(answer);
    if (claimsOf(tokens.idToken).nonce !== nonce) throw new Error('the sign-in came back for another request');
    return tokens;
  } finally {
    server.close();
  }
}

/** A fresh ID token from the refresh token, without asking the person again. */
export async function refreshSignIn(config: SignInConfig, refreshToken: string): Promise<SignInTokens> {
  const { token_endpoint } = await discover(config.issuer);
  const res = await fetch(token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: config.clientId, scope: 'openid email profile offline_access' }),
  });
  const answer = (await res.json().catch(() => ({}))) as { id_token?: string; refresh_token?: string; error_description?: string };
  if (!res.ok) throw new Error(`the company's sign-in wants you to sign in again (${answer.error_description ?? res.status})`);
  return tokensFrom(answer, refreshToken);
}

/** Open a page in the system browser; BROWSER (as many tools read it) picks another program, or `none` to only print it. */
export function openInBrowser(url: string): void {
  const chosen = process.env.BROWSER;
  if (chosen === 'none') return;
  if (chosen) return void spawn(chosen, [url], { detached: true, stdio: 'ignore', shell: true, windowsHide: true }).on('error', () => {}).unref();
  const [command, args] =
    process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true }).on('error', () => {}).unref();
}
