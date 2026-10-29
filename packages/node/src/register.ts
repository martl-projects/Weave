import { createHmac, randomBytes, sign as cryptoSign } from 'node:crypto';
import { createServer } from 'node:http';
import type { AppRegister, Json } from '@weave/core';

/*
 * Registering an app of yours with a provider (GitHub's App manifest flow), for a service's setting or a keyvault: a
 * page on this computer posts the app's manifest to the provider's page, you create the app there, the provider comes
 * back here with a code, and this node exchanges it for the app. What `keep` names is kept (what's read of it), and
 * the key, for signing; nothing else of the provider's (no client secret). Then the browser goes on to the app's next
 * page (installing it on your repositories, say).
 */

type Fetch = typeof fetch;

/** An app registered with a provider as you (a GitHub App): what's read of it, and the key Weave signs with. */
export interface Registered {
  info: Record<string, Json>;
  key: string;
}

/** A field of a provider's answer, maybe one level in (owner.login). */
const fieldOf = (from: unknown, path: string): Json | undefined => path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), from) as Json | undefined;

/** A page with fields in braces filled in, if it's an HTTPS page then. */
export const filled = (template: string, info: Record<string, Json>): string | undefined => {
  const url = template.replace(/\{([a-z_.]+)\}/gi, (_, k: string) => String(info[k] ?? ''));
  try {
    return new URL(url).protocol === 'https:' ? url : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Start registering: the page to open in the browser, and the app once it's made (10 minutes at most). `keep` is
 * called with it before the browser goes on, so what's shown next already knows it.
 */
export async function startRegistration(input: { register: AppRegister; label: string; account: string; fetch: Fetch; keep(app: Registered): void | Promise<void> }): Promise<{ url: string; done: Promise<Registered> }> {
  const { register, label, account } = input;
  const state = randomBytes(16).toString('base64url');
  let finish!: (code: string) => void;
  const coming = new Promise<string>((resolve) => (finish = resolve));
  let done: Promise<Registered> | undefined;
  const html = (text: string) => `<!doctype html><meta charset="utf-8"><title>Weave</title><body style="font:16px system-ui;margin:3em">${text}</body>`;
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.searchParams.get('state') !== state) return void res.writeHead(404).end();
    if (url.pathname === '/') {
      // Sent on at once: the provider's page, with the app's manifest (named for whose it is, and where to come back to).
      const random = randomBytes(3).toString('hex');
      const named = Object.fromEntries(Object.entries(register.manifest).map(([k, v]) => [k, typeof v === 'string' ? v.replace('{random}', random) : v]));
      if (typeof named.name === 'string') {
        // At most 34 characters (GitHub's limit): whose it is shortened to fit.
        const room = Math.max(3, 34 - named.name.replace('{account}', '').length);
        named.name = named.name.replace('{account}', account.length > room ? account.slice(0, room) : account);
      }
      const manifest = JSON.stringify({ ...named, redirect_url: `${base}back` });
      const action = `${register.page}${register.page.includes('?') ? '&' : '?'}state=${encodeURIComponent(state)}`;
      const esc = (text: string) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
      return void res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html(`<form method="post" action="${esc(action)}"><input type="hidden" name="manifest" value="${esc(manifest)}"><p>Creating your ${esc(label)} on ${esc(new URL(register.page).hostname)}…</p><button>Go on</button></form><script>document.forms[0].submit()</script>`));
    }
    if (url.pathname === '/back' && url.searchParams.get('code')) {
      finish(url.searchParams.get('code')!);
      // Once it's here: on to its next page (installing it), or a word that it's done.
      void done!.then(
        (app) => {
          const next = register.then ? filled(register.then, app.info) : undefined;
          if (next) res.writeHead(302, { location: next }).end();
          else res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html(`Your ${label} is there: you can close this page and go back to Weave.`));
        },
        (error: Error) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html(`It didn't work: ${error.message.replace(/[<>&]/g, '')}`)),
      );
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
  done = (async () => {
    try {
      const code = await Promise.race([coming, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`no ${label} created within 10 minutes`)), 10 * 60_000).unref())]);
      const res = await input.fetch(register.exchange.replace('{code}', encodeURIComponent(code)), { method: 'POST', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
      const app = (await res.json().catch(() => undefined)) as unknown;
      const key = fieldOf(app, register.key);
      if (!res.ok || typeof key !== 'string') throw new Error(`the provider answered ${res.status}: no ${label}`);
      // What's read of it; nothing else (no secrets of the provider's) is kept.
      const info = Object.fromEntries(register.keep.flatMap((k) => (fieldOf(app, k) !== undefined ? [[k, fieldOf(app, k)!]] : [])));
      const made = { info, key };
      await input.keep(made);
      return made;
    } finally {
      setTimeout(() => server.close(), 5000).unref();
    }
  })();
  done.catch(() => {});
  return { url: `${base}?state=${encodeURIComponent(state)}`, done };
}

/** A signature with a key held for a service or a keyvault (it never sees the key): RS256, ES256 (r||s) or HS256. */
export function signWith(key: string | undefined, name: string, algorithm: string, data: Uint8Array): Uint8Array {
  if (!key) throw new Error(`no setting ${name} to sign with`);
  const bytes = Buffer.from(data);
  try {
    if (algorithm === 'HS256') return new Uint8Array(createHmac('sha256', key).update(bytes).digest());
    if (algorithm === 'RS256') return new Uint8Array(cryptoSign('sha256', bytes, key));
    if (algorithm === 'ES256') return new Uint8Array(cryptoSign('sha256', bytes, { key, dsaEncoding: 'ieee-p1363' }));
  } catch (error) {
    throw new Error(`${name} isn't a key for ${algorithm}: ${(error as Error).message}`);
  }
  throw new Error(`it signs with RS256, ES256 or HS256, not ${algorithm}`);
}
