import { createHash, createHmac, createSign, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
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
  | { kind: 'azure'; vault: string; key: string; tenant?: string; clientId?: string; authority?: string }
  /**
   * AWS KMS (stage 16): a symmetric key (its ARN or alias) in `region`. People take on `role` with their company sign-in
   * (AssumeRoleWithWebIdentity); `endpoint` and `sts` for VPC or FIPS endpoints.
   */
  | { kind: 'aws'; region: string; key: string; role?: string; endpoint?: string; sts?: string }
  /**
   * Google Cloud KMS (stage 16): a symmetric key (projects/…/locations/…/keyRings/…/cryptoKeys/…). People reach it through
   * Workload Identity Federation with their company sign-in: `workload` names the provider
   * (projects/<number>/locations/global/workloadIdentityPools/<pool>/providers/<provider>).
   */
  | { kind: 'gcp'; key: string; workload?: string; endpoint?: string; sts?: string };

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
  /** AWS: an IAM user's or role's keys (the company's server). */
  aws?: { accessKeyId: string; secretAccessKey: string; sessionToken?: string };
  /** Google Cloud: an access token, given directly. */
  gcpToken?: string;
  /** Google Cloud: a service account's key (the company's server). */
  gcpServiceAccount?: { client_email: string; private_key: string; private_key_id?: string; token_uri?: string };
}

/**
 * The key service credentials a company's server has in its environment. Weave's own names, so a developer's
 * AWS or Google credentials on their computer never stand in for their company sign-in.
 */
export function envCredentials(env: NodeJS.ProcessEnv = process.env): VaultCredentials {
  const account = env.WEAVE_GCP_SERVICE_ACCOUNT;
  return {
    ...(env.WEAVE_VAULT_TOKEN ? { token: env.WEAVE_VAULT_TOKEN } : {}),
    ...(env.WEAVE_AZURE_CLIENT_SECRET ? { azureClientSecret: env.WEAVE_AZURE_CLIENT_SECRET } : {}),
    ...(env.WEAVE_AZURE_TOKEN ? { azureToken: env.WEAVE_AZURE_TOKEN } : {}),
    ...(env.WEAVE_AWS_ACCESS_KEY_ID && env.WEAVE_AWS_SECRET_ACCESS_KEY
      ? { aws: { accessKeyId: env.WEAVE_AWS_ACCESS_KEY_ID, secretAccessKey: env.WEAVE_AWS_SECRET_ACCESS_KEY, ...(env.WEAVE_AWS_SESSION_TOKEN ? { sessionToken: env.WEAVE_AWS_SESSION_TOKEN } : {}) } }
      : {}),
    ...(env.WEAVE_GCP_TOKEN ? { gcpToken: env.WEAVE_GCP_TOKEN } : {}),
    // The service account's key: the JSON itself, or the file it's in.
    ...(account ? { gcpServiceAccount: JSON.parse(account.trim().startsWith('{') ? account : readFileSync(account, 'utf8')) } : {}),
  };
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

// ---------------------------------------------------------------- AWS KMS (stage 16)

const sha256hex = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const hmac = (key: string | Buffer, data: string) => createHmac('sha256', key).update(data).digest();
const rfc3986 = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/**
 * AWS Signature Version 4: the headers that sign a request (x-amz-date, a session token if any, authorization).
 * `headers` are the request's own headers, signed along with host.
 */
export function signV4(
  request: { method: string; url: string; headers?: Record<string, string>; body?: string },
  credentials: { accessKeyId: string; secretAccessKey: string; sessionToken?: string },
  region: string,
  service: string,
  now = new Date(),
): Record<string, string> {
  const url = new URL(request.url);
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const date = amzDate.slice(0, 8);
  const added: Record<string, string> = { 'x-amz-date': amzDate, ...(credentials.sessionToken ? { 'x-amz-security-token': credentials.sessionToken } : {}) };
  const all: Record<string, string> = { host: url.host };
  for (const [k, v] of Object.entries({ ...request.headers, ...added })) all[k.toLowerCase()] = v.trim().replace(/\s+/g, ' ');
  const names = Object.keys(all).sort();
  const query = [...url.searchParams].map(([k, v]) => `${rfc3986(k)}=${rfc3986(v)}`).sort().join('&');
  const path = url.pathname.split('/').map((segment) => rfc3986(decodeURIComponent(segment))).join('/') || '/';
  const canonical = [request.method, path, query, ...names.map((n) => `${n}:${all[n]}`), '', names.join(';'), sha256hex(request.body ?? '')].join('\n');
  const scope = `${date}/${region}/${service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${credentials.secretAccessKey}`, date), region), service), 'aws4_request');
  const signature = createHmac('sha256', key).update(toSign).digest('hex');
  return { ...added, authorization: `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}` };
}

/** A name for a session in the key service's log: who signed in (their email or subject), as AWS allows it. */
function sessionName(idToken: string): string {
  const claims = JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString() || '{}') as { email?: string; sub?: string };
  return `weave-${claims.email ?? claims.sub ?? 'person'}`.replace(/[^\w+=,.@-]/g, '-').slice(0, 64);
}

/**
 * AWS KMS with a symmetric key. The space and epoch are the encryption context, so a wrapped part opens only
 * for its own space and epoch, and every decrypt is in CloudTrail with the context and who asked. People take
 * on the company's role with their company sign-in (the sign-in is an IAM OIDC provider), so they appear in
 * CloudTrail by their own session name; the company's server signs with its own keys.
 */
export class AwsKmsProvider implements KeyProvider {
  readonly #spec: Extract<ProviderSpec, { kind: 'aws' }>;
  readonly #credentials: VaultCredentials;
  #session?: { accessKeyId: string; secretAccessKey: string; sessionToken: string; until: number; idToken: string };

  constructor(spec: Extract<ProviderSpec, { kind: 'aws' }>, credentials: VaultCredentials) {
    this.#spec = spec;
    this.#credentials = credentials;
  }

  describe() {
    return { kind: 'aws', keyRef: `AWS KMS ${this.#spec.region} ${this.#spec.key}` };
  }

  async wrap(key: Uint8Array, context: KeyContext): Promise<string> {
    const r = await this.#call('Encrypt', { KeyId: this.#spec.key, Plaintext: Buffer.from(key).toString('base64'), EncryptionContext: { weave: contextOf(context) } });
    return `aws:${String(r.CiphertextBlob)}`;
  }

  async unwrap(wrapped: string, context: KeyContext): Promise<Uint8Array> {
    const r = await this.#call('Decrypt', { KeyId: this.#spec.key, CiphertextBlob: wrapped.replace(/^aws:/, ''), EncryptionContext: { weave: contextOf(context) } });
    return new Uint8Array(Buffer.from(String(r.Plaintext), 'base64'));
  }

  /** AWS deletes a key only after a waiting period (7 days at the least); until then it's disabled and can be brought back. */
  async destroy(): Promise<void> {
    const described = await this.#call('DescribeKey', { KeyId: this.#spec.key });
    const id = (described.KeyMetadata as { Arn?: string; KeyId?: string } | undefined)?.Arn ?? this.#spec.key;
    await this.#call('ScheduleKeyDeletion', { KeyId: id, PendingWindowInDays: 7 });
  }

  async #keys(): Promise<{ accessKeyId: string; secretAccessKey: string; sessionToken?: string }> {
    if (this.#credentials.aws) return this.#credentials.aws;
    const idToken = this.#credentials.idToken?.();
    if (this.#session && this.#session.until > Date.now() && this.#session.idToken === idToken) return this.#session;
    if (!idToken || !this.#spec.role) throw new Error(`no way to sign in to AWS KMS (${this.#spec.key}): sign in with your company (weave sso)${this.#spec.role ? '' : ', and the company names the role people take on'}`);
    const form = new URLSearchParams({ Action: 'AssumeRoleWithWebIdentity', Version: '2011-06-15', RoleArn: this.#spec.role, RoleSessionName: sessionName(idToken), WebIdentityToken: idToken, DurationSeconds: '3600' });
    const res = await send(`${(this.#spec.sts ?? `https://sts.${this.#spec.region}.amazonaws.com`).replace(/\/$/, '')}/`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form });
    const xml = await res.text();
    const tag = (name: string) => new RegExp(`<${name}>([^<]*)</${name}>`).exec(xml)?.[1];
    if (!res.ok) throw new Error(`AWS refused the sign-in (${tag('Code') ?? res.status}: ${tag('Message') ?? ''})`);
    const accessKeyId = tag('AccessKeyId');
    const secretAccessKey = tag('SecretAccessKey');
    const sessionToken = tag('SessionToken');
    if (!accessKeyId || !secretAccessKey || !sessionToken) throw new Error('AWS gave no credentials for the sign-in');
    const until = Math.min(Date.parse(tag('Expiration') ?? '') || Date.now() + 3_600_000, Date.now() + 3_600_000) - 120_000;
    this.#session = { accessKeyId, secretAccessKey, sessionToken, until, idToken };
    return this.#session;
  }

  async #call(action: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const url = `${(this.#spec.endpoint ?? `https://kms.${this.#spec.region}.amazonaws.com`).replace(/\/$/, '')}/`;
    const text = JSON.stringify(body);
    const headers = { 'content-type': 'application/x-amz-json-1.1', 'x-amz-target': `TrentService.${action}` };
    const res = await send(url, { method: 'POST', headers: { ...headers, ...signV4({ method: 'POST', url, headers, body: text }, await this.#keys(), this.#spec.region, 'kms') }, body: text });
    const answer = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const type = String(answer.__type ?? res.status).split('#').pop() ?? '';
      throw new Error(`AWS KMS ${/AccessDenied|Unrecognized|InvalidSignature|ExpiredToken|InvalidCiphertext|Disabled/.test(type) ? 'refused' : 'failed'}: ${type}${answer.message ?? answer.Message ? ` (${answer.message ?? answer.Message})` : ''}`);
    }
    return answer;
  }
}

// ---------------------------------------------------------------- Google Cloud KMS (stage 16)

/**
 * Google Cloud KMS with a symmetric key. The space and epoch are the additional authenticated data, so a wrapped
 * part opens only for its own space and epoch; Cloud Audit Logs record each decrypt and who asked. People reach
 * it through Workload Identity Federation with their company sign-in (each is their own principal, so IAM and the
 * logs see them); the company's server uses a service account's key.
 */
export class GcpKmsProvider implements KeyProvider {
  readonly #spec: Extract<ProviderSpec, { kind: 'gcp' }>;
  readonly #credentials: VaultCredentials;
  #token?: { value: string; until: number; from?: string };

  constructor(spec: Extract<ProviderSpec, { kind: 'gcp' }>, credentials: VaultCredentials) {
    this.#spec = spec;
    this.#credentials = credentials;
  }

  describe() {
    return { kind: 'gcp', keyRef: `Google Cloud KMS ${this.#spec.key}` };
  }

  async wrap(key: Uint8Array, context: KeyContext): Promise<string> {
    const r = await this.#call('POST', `${this.#spec.key}:encrypt`, { plaintext: Buffer.from(key).toString('base64'), additionalAuthenticatedData: Buffer.from(contextOf(context)).toString('base64') });
    return `gcp:${String(r.ciphertext)}`;
  }

  async unwrap(wrapped: string, context: KeyContext): Promise<Uint8Array> {
    const r = await this.#call('POST', `${this.#spec.key}:decrypt`, { ciphertext: wrapped.replace(/^gcp:/, ''), additionalAuthenticatedData: Buffer.from(contextOf(context)).toString('base64') });
    return new Uint8Array(Buffer.from(String(r.plaintext), 'base64'));
  }

  /** Every version of the key is destroyed (Google keeps it restorable for its scheduled-destruction period, 30 days by default). */
  async destroy(): Promise<void> {
    const listed = await this.#call('GET', `${this.#spec.key}/cryptoKeyVersions`);
    for (const v of (listed.cryptoKeyVersions as Array<{ name: string; state: string }> | undefined) ?? []) {
      if (v.state === 'ENABLED' || v.state === 'DISABLED') await this.#call('POST', `${v.name}:destroy`, {});
    }
  }

  async #accessToken(): Promise<string> {
    if (this.#credentials.gcpToken) return this.#credentials.gcpToken;
    const account = this.#credentials.gcpServiceAccount;
    const idToken = account ? undefined : this.#credentials.idToken?.();
    if (this.#token && this.#token.until > Date.now() && this.#token.from === idToken) return this.#token.value;
    let answer: { access_token?: string; expires_in?: number; error?: string; error_description?: string };
    if (account) {
      // A service account: a signed assertion for an access token (OAuth 2.0 JWT bearer).
      const tokenUri = account.token_uri ?? 'https://oauth2.googleapis.com/token';
      const now = Math.floor(Date.now() / 1000);
      const part = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
      const unsigned = `${part({ alg: 'RS256', typ: 'JWT', ...(account.private_key_id ? { kid: account.private_key_id } : {}) })}.${part({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/cloudkms', aud: tokenUri, iat: now, exp: now + 3600 })}`;
      const assertion = `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(account.private_key).toString('base64url')}`;
      const res = await send(tokenUri, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
      answer = (await res.json().catch(() => ({}))) as typeof answer;
      if (!res.ok || !answer.access_token) throw new Error(`Google refused the service account (${answer.error ?? res.status}${answer.error_description ? `: ${answer.error_description}` : ''})`);
    } else {
      // A person: their company sign-in, exchanged for a federated token (Workload Identity Federation).
      if (!idToken || !this.#spec.workload) throw new Error(`no way to sign in to Google Cloud KMS (${this.#spec.key}): sign in with your company (weave sso)${this.#spec.workload ? '' : ', and the company names its workload identity provider'}`);
      const res = await send((this.#spec.sts ?? 'https://sts.googleapis.com/v1/token').replace(/\/$/, ''), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          grantType: 'urn:ietf:params:oauth:grant-type:token-exchange',
          audience: `//iam.googleapis.com/${this.#spec.workload}`,
          scope: 'https://www.googleapis.com/auth/cloud-platform',
          requestedTokenType: 'urn:ietf:params:oauth:token-type:access_token',
          subjectToken: idToken,
          subjectTokenType: 'urn:ietf:params:oauth:token-type:id_token',
        }),
      });
      answer = (await res.json().catch(() => ({}))) as typeof answer;
      if (!res.ok || !answer.access_token) throw new Error(`Google refused the sign-in (${answer.error ?? res.status}${answer.error_description ? `: ${answer.error_description}` : ''})`);
    }
    this.#token = { value: answer.access_token, until: Date.now() + Math.max(60, (answer.expires_in ?? 3600) - 120) * 1000, ...(idToken ? { from: idToken } : {}) };
    return answer.access_token;
  }

  async #call(method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
    const token = await this.#accessToken();
    const res = await send(`${(this.#spec.endpoint ?? 'https://cloudkms.googleapis.com').replace(/\/$/, '')}/v1/${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const answer = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { status?: string; message?: string } };
    if (!res.ok) throw new Error(`Google Cloud KMS ${res.status === 401 || res.status === 403 || res.status === 400 ? 'refused' : 'failed'}: ${answer.error?.status ?? res.status}${answer.error?.message ? ` (${answer.error.message})` : ''}`);
    return answer;
  }
}

export function providerFor(spec: ProviderSpec, home: Home, credentials: VaultCredentials): KeyProvider {
  if (spec.kind === 'local') return new LocalProvider(home);
  if (spec.kind === 'vault') return new VaultTransitProvider(spec, credentials);
  if (spec.kind === 'azure') return new AzureKeyVaultProvider(spec, credentials);
  if (spec.kind === 'aws') return new AwsKmsProvider(spec, credentials);
  if (spec.kind === 'gcp') return new GcpKmsProvider(spec, credentials);
  throw new Error(`no key provider ${(spec as { kind: string }).kind}`);
}
