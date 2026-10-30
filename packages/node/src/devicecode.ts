import type { Fetch } from './github.ts';

/*
 * Signing in with a code (RFC 8628's device flow), for whatever needs a provider's sign-in: a service's setting, or a
 * verifier proving an account. The provider gives a code, the person enters it on its page and allows it there, and
 * this node asks for the token until it comes (as often as the provider lets it). Nothing comes back to this
 * computer, and no secret is needed.
 */

export interface DeviceOAuth {
  /** Where the code is asked for. */
  device: string;
  /** Where the code (and later a refresh token) becomes an access token. */
  token: string;
  client: string;
  clientSecret?: string;
  scopes?: string[];
}

export interface DeviceGrant {
  access: string;
  refresh?: string;
  expires?: number;
}

/** Ask a provider's token page: the token, or an error that starts with the provider's code (authorization_pending…). */
export async function tokenRequest(oauth: { token: string; client: string; clientSecret?: string }, params: Record<string, string>, fetchImpl: Fetch): Promise<DeviceGrant> {
  const body = new URLSearchParams({ ...params, client_id: oauth.client, ...(oauth.clientSecret ? { client_secret: oauth.clientSecret } : {}) });
  const res = await fetchImpl(oauth.token, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body, signal: AbortSignal.timeout(20_000) });
  const data = (await res.json().catch(() => ({}))) as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown; error?: unknown; error_description?: unknown };
  // Its error's code first (authorization_pending, slow_down…: a sign-in with a code waits on them), then what it says.
  if (!res.ok || typeof data.access_token !== 'string') throw new Error(data.error ? `${String(data.error)}${data.error_description ? `: ${String(data.error_description)}` : ''}` : `the provider answered ${res.status}`);
  return {
    access: data.access_token,
    ...(typeof data.refresh_token === 'string' ? { refresh: data.refresh_token } : {}),
    ...(typeof data.expires_in === 'number' ? { expires: Date.now() + data.expires_in * 1000 } : {}),
  };
}

/** Start a sign-in with a code: the page and the code to show, and the grant once it's allowed (or why not). */
export async function startDeviceSignIn(oauth: DeviceOAuth, fetchImpl: Fetch, label: string): Promise<{ url: string; code: string; grant: Promise<DeviceGrant> }> {
  const res = await fetchImpl(oauth.device, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams({ client_id: oauth.client, ...(oauth.scopes?.length ? { scope: oauth.scopes.join(' ') } : {}) }), signal: AbortSignal.timeout(20_000) });
  const asked = (await res.json().catch(() => ({}))) as { device_code?: unknown; user_code?: unknown; verification_uri?: unknown; verification_uri_complete?: unknown; expires_in?: unknown; interval?: unknown; error?: unknown; error_description?: unknown };
  if (!res.ok || typeof asked.device_code !== 'string' || typeof asked.user_code !== 'string' || typeof asked.verification_uri !== 'string') throw new Error(`no code from the provider: ${String(asked.error_description ?? asked.error ?? res.status)}`);
  const deviceCode = asked.device_code;
  const until = Date.now() + (typeof asked.expires_in === 'number' ? asked.expires_in : 900) * 1000;
  let every = (typeof asked.interval === 'number' ? asked.interval : 5) * 1000;
  const grant = (async () => {
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, every).unref());
      if (Date.now() > until) throw new Error(`the code for ${label} ran out: sign in again`);
      try {
        return await tokenRequest(oauth, { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: deviceCode }, fetchImpl);
      } catch (error) {
        const why = (error as Error).message;
        // Not yet allowed: asked again; too often: more slowly. Anything else ends it.
        if (/^authorization_pending/.test(why)) continue;
        if (/^slow_down/.test(why)) {
          every += 5000;
          continue;
        }
        throw new Error(/^access_denied/.test(why) ? 'not signed in: it was declined' : /^expired_token/.test(why) ? `the code for ${label} ran out: sign in again` : why);
      }
    }
  })();
  grant.catch(() => {});
  const url = typeof asked.verification_uri_complete === 'string' && asked.verification_uri_complete.startsWith('https://') ? asked.verification_uri_complete : asked.verification_uri;
  return { url, code: asked.user_code, grant };
}
