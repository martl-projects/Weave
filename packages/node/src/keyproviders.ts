import { createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { b64u, open, seal, type Sealed } from '@weave/core';
import type { Home } from './home.ts';
import { vaultOf } from './vault.ts';

/**
 * A request to a key service, tried once more if the connection drops before
 * an answer (a kept-alive connection the service just closed): nothing was
 * done then, so asking again is safe.
 */
async function send(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    const code = (error as { cause?: { code?: unknown } }).cause?.code;
    if (code !== 'ECONNRESET' && code !== 'UND_ERR_SOCKET') throw error;
    return fetch(url, init);
  }
}

/*
 * Key providers (docs/v2-stage6.md, part 1): where the company half of a
 * managed space's epoch keys is wrapped. A provider never sees content or the
 * Weave half; every unwrap is bound to its space and epoch.
 */

/** What an unwrap is for: the KMS checks its policy on it and logs it. */
export interface KeyContext {
  space: string;
  epoch: number;
}

export interface KeyProvider {
  wrap(key: Uint8Array, context: KeyContext): Promise<string>;
  /** May be refused: policy, an offboarded person, no connection. */
  unwrap(wrapped: string, context: KeyContext): Promise<Uint8Array>;
  /** Shred: everything it ever wrapped becomes unreadable. */
  destroy(): Promise<void>;
  describe(): { kind: string; keyRef: string };
}

/** A provider as a managed space names it (in its signed setting): no secrets in here. */
export type ProviderSpec =
  | { kind: 'local' }
  | { kind: 'vault'; address: string; key: string; mount?: string; jwt?: { mount?: string; role: string } }
  /** Azure Key Vault (an RSA key) with Entra ID: `tenant` and `clientId` for signing in by the person's token or a client secret. */
  | { kind: 'azure'; vault: string; key: string; tenant?: string; clientId?: string; authority?: string };

const contextOf = (c: KeyContext): string => `weave/kms/v1:${c.space}:${c.epoch}`;

/** The home's own vault (stage 2): for personal use and tests; destroy is a no-op. */
export class LocalProvider implements KeyProvider {
  readonly #home: Home;
  constructor(home: Home) {
    this.#home = home;
  }
  async wrap(key: Uint8Array, context: KeyContext): Promise<string> {
    const sealed = seal(vaultOf(this.#home).key, b64u.encode(key), contextOf(context));
    return `local:${sealed.nonce}.${sealed.ct}`;
  }
  async unwrap(wrapped: string, context: KeyContext): Promise<Uint8Array> {
    const [nonce, ct] = wrapped.replace(/^local:/, '').split('.');
    return b64u.decode(open(vaultOf(this.#home).key, { nonce, ct } as Sealed, contextOf(context)) as string);
  }
  async destroy(): Promise<void> {}
  describe() {
    return { kind: 'local', keyRef: 'this computer' };
  }
}

/** How a node signs in to Vault: a token it was given, or the person's SSO token through Vault's JWT auth. */
export interface VaultCredentials {
  token?: string;
  /** The employee's current OIDC ID token, for Vault's JWT auth. */
  idToken?: () => string | undefined;
  /**
   * An access token for a resource (e.g. `https://vault.azure.net/user_impersonation`), issued to the
   * signed-in person from their sign-in's refresh token (delegated access): how employees reach Azure Key Vault.
   */
  delegated?: (scope: string) => Promise<string | undefined>;
  /** Azure: an access token for Key Vault, given directly. */
  azureToken?: string;
  /** Azure: an app's client secret (for service nodes such as attestors and archives). */
  azureClientSecret?: string;
}

/**
 * HashiCorp Vault's Transit engine. The space and epoch are Transit's
 * derivation context (the key must be created with `derived=true`), so a
 * wrapped part opens only for its own space and epoch, and every decrypt is in
 * Vault's audit log with the token that asked.
 */
export class VaultTransitProvider implements KeyProvider {
  readonly #spec: Extract<ProviderSpec, { kind: 'vault' }>;
  readonly #credentials: VaultCredentials;
  #token?: { value: string; until: number };

  constructor(spec: Extract<ProviderSpec, { kind: 'vault' }>, credentials: VaultCredentials) {
    this.#spec = spec;
    this.#credentials = credentials;
  }

  describe() {
    return { kind: 'vault', keyRef: `${this.#spec.address} ${this.#spec.mount ?? 'transit'}/${this.#spec.key}` };
  }

  async wrap(key: Uint8Array, context: KeyContext): Promise<string> {
    const r = await this.#call('POST', `encrypt/${this.#spec.key}`, { plaintext: Buffer.from(key).toString('base64'), context: Buffer.from(contextOf(context)).toString('base64') });
    return String(r.data.ciphertext);
  }

  async unwrap(wrapped: string, context: KeyContext): Promise<Uint8Array> {
    const r = await this.#call('POST', `decrypt/${this.#spec.key}`, { ciphertext: wrapped, context: Buffer.from(contextOf(context)).toString('base64') });
    return new Uint8Array(Buffer.from(String(r.data.plaintext), 'base64'));
  }

  async destroy(): Promise<void> {
    await this.#call('POST', `keys/${this.#spec.key}/config`, { deletion_allowed: true });
    await this.#call('DELETE', `keys/${this.#spec.key}`);
  }

  async #login(): Promise<string> {
    if (this.#credentials.token) return this.#credentials.token;
    if (this.#token && this.#token.until > Date.now()) return this.#token.value;
    const jwt = this.#credentials.idToken?.();
    if (!this.#spec.jwt || !jwt) throw new Error(`no way to sign in to Vault at ${this.#spec.address}: sign in with your company (weave sso) or set a Vault token`);
    const res = await send(`${this.#spec.address}/v1/auth/${this.#spec.jwt.mount ?? 'jwt'}/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: this.#spec.jwt.role, jwt }) });
    if (!res.ok) throw new Error(`Vault refused the sign-in (${res.status})`);
    const auth = ((await res.json()) as { auth: { client_token: string; lease_duration: number } }).auth;
    this.#token = { value: auth.client_token, until: Date.now() + Math.max(60, auth.lease_duration - 30) * 1000 };
    return auth.client_token;
  }

  async #call(method: string, path: string, body?: unknown): Promise<{ data: Record<string, unknown> }> {
    const token = await this.#login();
    const res = await send(`${this.#spec.address}/v1/${this.#spec.mount ?? 'transit'}/${path}`, {
      method,
      headers: { 'x-vault-token': token, ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (res.status === 204) return { data: {} };
    if (!res.ok) throw new Error(`Vault ${res.status === 403 ? 'refused' : 'failed'}: ${(await res.text()).slice(0, 200)}`);
    return (await res.json()) as { data: Record<string, unknown> };
  }
}

/**
 * Azure Key Vault with an RSA key. Key Vault's wrap takes no context, so what
 * it wraps is a seed, and the key comes out of `HKDF(seed, space ‖ epoch)`
 * with a check value: a wrapped part opens only for its own space and epoch.
 */
export class AzureKeyVaultProvider implements KeyProvider {
  readonly #spec: Extract<ProviderSpec, { kind: 'azure' }>;
  readonly #credentials: VaultCredentials;
  #token?: { value: string; until: number };

  constructor(spec: Extract<ProviderSpec, { kind: 'azure' }>, credentials: VaultCredentials) {
    this.#spec = spec;
    this.#credentials = credentials;
  }

  describe() {
    return { kind: 'azure', keyRef: `${this.#spec.vault} ${this.#spec.key}` };
  }

  #mask(seed: Uint8Array, context: KeyContext): { mask: Buffer; check: Buffer } {
    const okm = Buffer.from(hkdfSync('sha256', seed, Buffer.alloc(0), contextOf(context), 64));
    return { mask: okm.subarray(0, 32), check: createHmac('sha256', okm.subarray(32)).update('check').digest().subarray(0, 16) };
  }

  async wrap(key: Uint8Array, context: KeyContext): Promise<string> {
    if (key.length !== 32) throw new Error('Azure Key Vault wraps 32-byte keys here');
    const seed = new Uint8Array(randomBytes(32));
    const { mask, check } = this.#mask(seed, context);
    const r = (await this.#call('POST', `keys/${this.#spec.key}/wrapkey`, { alg: 'RSA-OAEP-256', value: Buffer.from(seed).toString('base64url') })) as { kid: string; value: string };
    const masked = Buffer.from(key.map((b, i) => b ^ mask[i]));
    return `azure:${r.kid}|${r.value}|${masked.toString('base64url')}|${check.toString('base64url')}`;
  }

  async unwrap(wrapped: string, context: KeyContext): Promise<Uint8Array> {
    const [kid, value, masked, check] = wrapped.replace(/^azure:/, '').split('|');
    if (!kid || !value || !masked || !check) throw new Error('not an Azure Key Vault part');
    const version = kid.split('/').pop();
    const r = (await this.#call('POST', `keys/${this.#spec.key}/${version}/unwrapkey`, { alg: 'RSA-OAEP-256', value })) as { value: string };
    const { mask, check: expected } = this.#mask(new Uint8Array(Buffer.from(r.value, 'base64url')), context);
    if (!timingSafeEqual(expected, Buffer.from(check, 'base64url'))) throw new Error('this part belongs to another space or epoch');
    return new Uint8Array(Buffer.from(masked, 'base64url').map((b, i) => b ^ mask[i]));
  }

  async destroy(): Promise<void> {
    await this.#call('DELETE', `keys/${this.#spec.key}`);
  }

  /**
   * An Entra access token for Key Vault. A service (the company's server) uses its app's secret
   * (client credentials); a person uses a token issued to them from their own sign-in (delegated,
   * `user_impersonation`), so Key Vault's access rules and Entra's sign-in rules apply to them, and
   * blocking them in Entra ends their access with their next token.
   */
  async #login(): Promise<string> {
    if (this.#credentials.azureToken) return this.#credentials.azureToken;
    if (this.#token && this.#token.until > Date.now()) return this.#token.value;
    const { tenant, clientId } = this.#spec;
    if (!this.#credentials.azureClientSecret) {
      const token = await this.#credentials.delegated?.('https://vault.azure.net/user_impersonation');
      if (!token) throw new Error(`no way to sign in to Azure Key Vault ${this.#spec.vault}: sign in with your company in the app (weave sso)`);
      return token;
    }
    if (!tenant || !clientId) throw new Error(`Azure Key Vault ${this.#spec.vault}: the server's app needs a tenant and a client id`);
    const form = new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, scope: 'https://vault.azure.net/.default', client_secret: this.#credentials.azureClientSecret });
    const res = await send(`${this.#spec.authority ?? 'https://login.microsoftonline.com'}/${tenant}/oauth2/v2.0/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form });
    if (!res.ok) throw new Error(`Entra refused the sign-in (${res.status})`);
    const t = (await res.json()) as { access_token: string; expires_in: number };
    this.#token = { value: t.access_token, until: Date.now() + Math.max(60, t.expires_in - 60) * 1000 };
    return t.access_token;
  }

  async #call(method: string, path: string, body?: unknown): Promise<unknown> {
    const token = await this.#login();
    const res = await send(`${this.#spec.vault.replace(/\/$/, '')}/${path}?api-version=7.4`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) throw new Error(`Azure Key Vault ${res.status === 403 || res.status === 401 ? 'refused' : 'failed'}: ${(await res.text()).slice(0, 200)}`);
    return res.status === 204 ? {} : res.json();
  }
}

export function providerFor(spec: ProviderSpec, home: Home, credentials: VaultCredentials): KeyProvider {
  if (spec.kind === 'local') return new LocalProvider(home);
  if (spec.kind === 'vault') return new VaultTransitProvider(spec, credentials);
  if (spec.kind === 'azure') return new AzureKeyVaultProvider(spec, credentials);
  throw new Error(`no key provider ${(spec as { kind: string }).kind}`);
}
