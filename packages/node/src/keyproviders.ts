import { b64u, open, seal, type Sealed } from '@weave/core';
import type { Home } from './home.ts';
import { vaultOf } from './vault.ts';

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
  | { kind: 'vault'; address: string; key: string; mount?: string; jwt?: { mount?: string; role: string } };

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
    const res = await fetch(`${this.#spec.address}/v1/auth/${this.#spec.jwt.mount ?? 'jwt'}/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: this.#spec.jwt.role, jwt }) });
    if (!res.ok) throw new Error(`Vault refused the sign-in (${res.status})`);
    const auth = ((await res.json()) as { auth: { client_token: string; lease_duration: number } }).auth;
    this.#token = { value: auth.client_token, until: Date.now() + Math.max(60, auth.lease_duration - 30) * 1000 };
    return auth.client_token;
  }

  async #call(method: string, path: string, body?: unknown): Promise<{ data: Record<string, unknown> }> {
    const token = await this.#login();
    const res = await fetch(`${this.#spec.address}/v1/${this.#spec.mount ?? 'transit'}/${path}`, {
      method,
      headers: { 'x-vault-token': token, ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (res.status === 204) return { data: {} };
    if (!res.ok) throw new Error(`Vault ${res.status === 403 ? 'refused' : 'failed'}: ${(await res.text()).slice(0, 200)}`);
    return (await res.json()) as { data: Record<string, unknown> };
  }
}

export function providerFor(spec: ProviderSpec, home: Home, credentials: VaultCredentials): KeyProvider {
  if (spec.kind === 'local') return new LocalProvider(home);
  if (spec.kind === 'vault') return new VaultTransitProvider(spec, credentials);
  throw new Error(`no key provider ${(spec as { kind: string }).kind}`);
}
