import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { boxTo, openBox, isSettingName, KIND_SERVICE_SETTING, SETTING_VALUE_MAX, sealFor, serviceSettingsOf, type Did, type Json, type SpaceServiceSetting, type AppOAuth } from '@weave/core';
import type { ServiceSettingsInfo } from './backend.ts';
import type { ServicesHost, StoredService } from './node.ts';
import type { Services } from './services.ts';
import type { StoredSpace } from './spacestore.ts';

/*
 * A service's settings kept in its spaces by their maintainers (core's servicesettings.ts): any maintainer sets what
 * the space's service needs, a secret blind (boxed to the service's key), a sign-in through the provider's own page.
 * The node that runs the service opens them with its key, keeps sign-ins current (refreshing them before they run
 * out), and hands the service only values: a sign-in as its current access token.
 *
 * What a service gets, by name: its person's own setting, unless one of its spaces' maintainers set it (theirs
 * counts); per space, in me().spaces, each space's own.
 */

type Fetch = typeof fetch;

/** What a sign-in's box holds: the grant, and how to renew it. */
interface Grant {
  access: string;
  refresh?: string;
  /** When the access token runs out (ms since 1970). */
  expires?: number;
  token: string;
  client: string;
  clientSecret?: string;
}

const isGrant = (value: unknown): value is Grant => {
  const g = value as Record<string, unknown> | null;
  return !!g && typeof g.access === 'string' && typeof g.token === 'string' && typeof g.client === 'string';
};

/** A sign-in's access token is renewed this long before it runs out. */
const RENEW_BEFORE = 5 * 60_000;

export class ServiceSettings {
  readonly h: ServicesHost;
  readonly #services: () => Services;
  readonly #fetch: () => Fetch;
  /** Sign-ins renewed here, by service, space and name: the event they came from, and the current grant. */
  #renewed = new Map<string, { from: string; grant: Grant }>();

  constructor(h: ServicesHost, services: () => Services, fetchFn: () => Fetch) {
    this.h = h;
    this.#services = services;
    this.#fetch = fetchFn;
  }

  get services(): Services {
    return this.#services();
  }

  /** The service in this space, by its key or name: its profile, and the settings it asks for. */
  async #inSpace(space: StoredSpace, ref: string) {
    const did = await this.services.serviceDid(ref);
    const profile = (await this.services.servicesIn(space.id)).find((p) => p.did === did);
    if (!profile) throw new Error(`that service isn't in ${this.h.spaceName(space)}`);
    return profile;
  }

  /** A service's settings in a space: what it asks for, what its maintainers set (secrets only as set, by whom), and what's missing. */
  async serviceSettings(input: { space: string; service: string }): Promise<ServiceSettingsInfo> {
    const space = this.h.space(input.space);
    const profile = await this.#inSpace(space, input.service);
    const state = this.h.state(space);
    const set = serviceSettingsOf(this.h.entries(space), state.maintainers, profile.did);
    const asks = profile.settings ?? [];
    return {
      space: { id: space.id, name: this.h.spaceName(space) },
      service: { did: profile.did, name: profile.name, person: profile.person },
      asks,
      settings: set.map((s) => ({ name: s.name, secret: s.secret, ...(s.oauth ? { oauth: true as const } : {}), ...(s.value !== undefined ? { value: s.value } : {}), by: this.h.actor(s.by, s.by), time: s.time })),
      missing: asks.filter((a) => !a.optional && !set.some((s) => s.name === a.name)).map((a) => a.name),
      mayChange: state.maintainers.has(this.h.identity.author),
    };
  }

  /**
   * Set (or remove, with null) a service's setting in a space: maintainers only. One it asks for as secret, or any you
   * mark secret, is boxed to the service's key: nobody else can read it back, you included.
   */
  async setServiceSetting(input: { space: string; service: string; name: string; value?: string | null; secret?: boolean; grant?: Grant }): Promise<ServiceSettingsInfo> {
    const space = this.h.space(input.space);
    if (!this.h.state(space).maintainers.has(this.h.identity.author)) throw new Error(`only the maintainers of ${this.h.spaceName(space)} set its services' settings`);
    const profile = await this.#inSpace(space, input.service);
    const name = input.name?.trim() ?? '';
    if (!isSettingName(name)) throw new Error(`a setting is named like an environment variable (A-Z, 0-9, _), not starting with WEAVE_: ${name}`);
    const asked = profile.settings?.find((s) => s.name === name);
    if (profile.settings?.length && !asked) throw new Error(`${profile.name} doesn't ask for ${name} (it asks for ${profile.settings.map((s) => s.name).join(', ')})`);
    let body: Json;
    if (input.grant) body = { service: profile.did, name, box: boxTo(profile.did, input.grant as unknown as Json) as unknown as Json, oauth: true };
    else if (input.value === null || input.value === undefined || input.value === '') body = { service: profile.did, name };
    else {
      if (asked?.oauth) throw new Error(`${asked.label} is a sign-in: sign in with the provider instead of typing it`);
      const value = String(input.value);
      if (value.length > SETTING_VALUE_MAX) throw new Error(`at most ${SETTING_VALUE_MAX} characters`);
      body = input.secret || asked?.secret ? { service: profile.did, name, box: boxTo(profile.did, value) as unknown as Json } : { service: profile.did, name, value };
    }
    this.h.replica.write(this.h.identity, sealFor(this.h.cipher(space), { kind: KIND_SERVICE_SETTING, body }));
    return this.serviceSettings({ space: space.id, service: profile.did });
  }

  /** Write a setting for a service as its spaces' maintainers keep them (a secret boxed to it): for addService's settingsIn. */
  write(space: StoredSpace, service: Did, name: string, value: string, secret: boolean): void {
    const body: Json = secret ? { service, name, box: boxTo(service, value) as unknown as Json } : { service, name, value };
    this.h.replica.write(this.h.identity, sealFor(this.h.cipher(space), { kind: KIND_SERVICE_SETTING, body }));
  }

  /** What a service's spaces' maintainers set for it, opened with its key: by space id, then name (sign-ins as their access token). */
  valuesOf(stored: StoredService): Record<string, Record<string, string>> {
    const key = this.services.serviceKey(stored.name);
    const out: Record<string, Record<string, string>> = {};
    for (const id of stored.spaces) {
      const space = this.h.spaces.get(id);
      if (!space) continue;
      for (const s of serviceSettingsOf(this.h.entries(space), this.h.state(space).maintainers, key.did)) {
        const value = s.box ? this.#open(stored, id, s, key.keys.secretKey, key.keys.publicKey) : s.value;
        if (value !== undefined) (out[id] ??= {})[s.name] = value;
      }
    }
    return out;
  }

  /** A service's settings by name: its person's, with what its spaces' maintainers set over them (where its spaces agree). */
  effective(stored: StoredService): Record<string, string> {
    const bySpace = Object.values(this.valuesOf(stored));
    const fromSpaces: Record<string, string> = {};
    for (const name of new Set(bySpace.flatMap((v) => Object.keys(v)))) {
      const values = new Set(bySpace.flatMap((v) => (v[name] !== undefined ? [v[name]] : [])));
      if (values.size === 1) fromSpaces[name] = [...values][0];
    }
    return { ...stored.settings, ...fromSpaces };
  }

  #open(stored: StoredService, space: string, s: SpaceServiceSetting, secretKey: Uint8Array, publicKey: Uint8Array): string | undefined {
    let opened: Json;
    try {
      opened = openBox(secretKey, publicKey, s.box!);
    } catch {
      return undefined; // boxed to another key (an older one of the service's)
    }
    if (!s.oauth) return typeof opened === 'string' ? opened : undefined;
    if (!isGrant(opened)) return undefined;
    const renewed = this.#renewed.get(`${stored.name} ${space} ${s.name}`);
    return renewed?.from === s.id ? renewed.grant.access : opened.access;
  }

  /** Renew the sign-ins of the services running here that run out soon. Returns the services whose tokens changed. */
  async renew(running: StoredService[]): Promise<string[]> {
    const changed: string[] = [];
    for (const stored of running) {
      const key = this.services.serviceKey(stored.name);
      for (const id of stored.spaces) {
        const space = this.h.spaces.get(id);
        if (!space) continue;
        for (const s of serviceSettingsOf(this.h.entries(space), this.h.state(space).maintainers, key.did).filter((x) => x.oauth && x.box)) {
          const slot = `${stored.name} ${id} ${s.name}`;
          let grant = this.#renewed.get(slot)?.from === s.id ? this.#renewed.get(slot)!.grant : undefined;
          if (!grant) {
            try {
              const opened = openBox(key.keys.secretKey, key.keys.publicKey, s.box!);
              if (isGrant(opened)) grant = opened;
            } catch {}
          }
          if (!grant?.refresh || (grant.expires && grant.expires - Date.now() > RENEW_BEFORE) || !grant.expires) continue;
          try {
            const next = await this.#tokenRequest(grant, { grant_type: 'refresh_token', refresh_token: grant.refresh });
            this.#renewed.set(slot, { from: s.id, grant: { ...grant, ...next, refresh: next.refresh ?? grant.refresh } });
            changed.push(stored.name);
          } catch (error) {
            console.error(`weave: ${stored.name}'s sign-in for ${s.name} couldn't be renewed: ${(error as Error).message}`);
          }
        }
      }
    }
    return [...new Set(changed)];
  }

  async #tokenRequest(oauth: { token: string; client: string; clientSecret?: string }, params: Record<string, string>): Promise<Pick<Grant, 'access' | 'refresh' | 'expires'>> {
    const body = new URLSearchParams({ ...params, client_id: oauth.client, ...(oauth.clientSecret ? { client_secret: oauth.clientSecret } : {}) });
    const res = await this.#fetch()(oauth.token, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body, signal: AbortSignal.timeout(20_000) });
    const data = (await res.json().catch(() => ({}))) as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown; error?: unknown; error_description?: unknown };
    // Its error's code first (authorization_pending, slow_down…: a sign-in with a code waits on them), then what it says.
    if (!res.ok || typeof data.access_token !== 'string') throw new Error(data.error ? `${String(data.error)}${data.error_description ? `: ${String(data.error_description)}` : ''}` : `the provider answered ${res.status}`);
    return {
      access: data.access_token,
      ...(typeof data.refresh_token === 'string' ? { refresh: data.refresh_token } : {}),
      ...(typeof data.expires_in === 'number' ? { expires: Date.now() + data.expires_in * 1000 } : {}),
    };
  }

  /** Sign-ins under way: what each waits for (the provider coming back) and what it signs in. */
  #signIns = new Map<string, { done: Promise<ServiceSettingsInfo> }>();

  /**
   * Start signing a service in, for a space: returns the provider's page to open in the browser. You allow it there,
   * the provider comes back to this computer (a loopback address, with PKCE), and the grant is boxed to the service;
   * finishSignIn waits for that (5 minutes at most).
   */
  async startSignIn(input: { space: string; service: string; name: string }): Promise<{ id: string; url: string; code?: string }> {
    const space = this.h.space(input.space);
    if (!this.h.state(space).maintainers.has(this.h.identity.author)) throw new Error(`only the maintainers of ${this.h.spaceName(space)} set its services' settings`);
    const profile = await this.#inSpace(space, input.service);
    const asked = profile.settings?.find((s) => s.name === input.name);
    if (!asked?.oauth) throw new Error(`${profile.name} doesn't ask for a sign-in named ${input.name}`);
    const oauth = asked.oauth;
    if (!oauth.authorize) return this.#startDevice(space, profile.did, asked.name, asked.label, oauth as AppOAuth & { device: string });
    const verifier = randomBytes(32).toString('base64url');
    const state = randomBytes(16).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    let finish!: (code: string) => void;
    let fail!: (error: Error) => void;
    const coming = new Promise<string>((resolve, reject) => ((finish = resolve), (fail = reject)));
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname !== '/' || url.searchParams.get('state') !== state) return void res.writeHead(404).end();
      const code = url.searchParams.get('code');
      const page = (text: string) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<!doctype html><title>Weave</title><p style="font:16px system-ui;margin:3em">${text}</p>`);
      if (code) {
        page('Signed in: you can close this page and go back to Weave.');
        finish(code);
      } else {
        page('Not signed in. You can close this page.');
        fail(new Error(`not signed in: ${url.searchParams.get('error_description') ?? url.searchParams.get('error') ?? 'cancelled'}`));
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const redirect = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
    const page = new URL(oauth.authorize!);
    for (const [k, v] of Object.entries({ response_type: 'code', client_id: oauth.client, redirect_uri: redirect, state, code_challenge: challenge, code_challenge_method: 'S256', ...(oauth.scopes?.length ? { scope: oauth.scopes.join(' ') } : {}) })) page.searchParams.set(k, v);
    // Google gives a refresh token only when asked for offline access; other providers ignore these.
    page.searchParams.set('access_type', 'offline');
    page.searchParams.set('prompt', 'consent');
    const id = state;
    const done = (async () => {
      try {
        const code = await Promise.race([coming, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`no sign-in for ${asked.label} within 5 minutes`)), 5 * 60_000).unref())]);
        const got = await this.#tokenRequest(oauth, { grant_type: 'authorization_code', code, redirect_uri: redirect, code_verifier: verifier });
        const grant: Grant = { ...got, token: oauth.token, client: oauth.client, ...(oauth.clientSecret ? { clientSecret: oauth.clientSecret } : {}) };
        return await this.setServiceSetting({ space: space.id, service: profile.did, name: asked.name, grant });
      } finally {
        server.close();
        setTimeout(() => this.#signIns.delete(id), 60_000).unref();
      }
    })();
    done.catch(() => {});
    this.#signIns.set(id, { done });
    return { id, url: page.toString() };
  }

  /**
   * A sign-in with a code (RFC 8628's device flow): the provider gives a code, the person enters it on its page and
   * allows it there, and this node asks for the token until it comes (as often as the provider lets it). Nothing comes
   * back to this computer, and no secret is needed.
   */
  async #startDevice(space: StoredSpace, service: Did, name: string, label: string, oauth: AppOAuth & { device: string }): Promise<{ id: string; url: string; code: string }> {
    const res = await this.#fetch()(oauth.device, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams({ client_id: oauth.client, ...(oauth.scopes?.length ? { scope: oauth.scopes.join(' ') } : {}) }), signal: AbortSignal.timeout(20_000) });
    const asked = (await res.json().catch(() => ({}))) as { device_code?: unknown; user_code?: unknown; verification_uri?: unknown; verification_uri_complete?: unknown; expires_in?: unknown; interval?: unknown; error?: unknown; error_description?: unknown };
    if (!res.ok || typeof asked.device_code !== 'string' || typeof asked.user_code !== 'string' || typeof asked.verification_uri !== 'string') throw new Error(`no code from the provider: ${String(asked.error_description ?? asked.error ?? res.status)}`);
    const deviceCode = asked.device_code;
    const until = Date.now() + (typeof asked.expires_in === 'number' ? asked.expires_in : 900) * 1000;
    let every = (typeof asked.interval === 'number' ? asked.interval : 5) * 1000;
    const id = randomBytes(16).toString('base64url');
    const done = (async () => {
      try {
        for (;;) {
          await new Promise((resolve) => setTimeout(resolve, every).unref());
          if (Date.now() > until) throw new Error(`the code for ${label} ran out: sign in again`);
          try {
            const got = await this.#tokenRequest(oauth, { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: deviceCode });
            const grant: Grant = { ...got, token: oauth.token, client: oauth.client, ...(oauth.clientSecret ? { clientSecret: oauth.clientSecret } : {}) };
            return await this.setServiceSetting({ space: space.id, service, name, grant });
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
      } finally {
        setTimeout(() => this.#signIns.delete(id), 60_000).unref();
      }
    })();
    done.catch(() => {});
    this.#signIns.set(id, { done });
    const url = typeof asked.verification_uri_complete === 'string' && asked.verification_uri_complete.startsWith('https://') ? asked.verification_uri_complete : asked.verification_uri;
    return { id, url, code: asked.user_code };
  }

  /** Wait for a sign-in startSignIn began: the service's settings once it's signed in, or why not. */
  async finishSignIn(input: { id: string }): Promise<ServiceSettingsInfo> {
    const signIn = this.#signIns.get(input.id);
    if (!signIn) throw new Error('no sign-in under way with that id');
    return signIn.done;
  }
}

