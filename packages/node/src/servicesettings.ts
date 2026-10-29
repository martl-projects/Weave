import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { boxTo, openBox, isSettingName, type AppRegister, KIND_SERVICE_SETTING, SETTING_VALUE_MAX, sealFor, serviceSettingsOf, type Did, type Json, type SpaceServiceSetting, type AppOAuth } from '@weave/core';
import type { ServiceSettingsInfo } from './backend.ts';
import { startDeviceSignIn, tokenRequest } from './devicecode.ts';
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
 * counts); per space, in me().spaces, each space's own. A setting it asks for as yours (a sign-in as its person) is
 * only ever its person's, kept with the service on their computer for every project it's in.
 */

type Fetch = typeof fetch;

/** What a sign-in's box holds: the grant, and how to renew it. */
export interface Grant {
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

/** An app registered with a provider as you (a GitHub App): what the service reads of it, and the key Weave signs with. */
export interface Registered {
  info: Record<string, Json>;
  key: string;
}

/** A field of a provider's answer, maybe one level in (owner.login). */
const fieldOf = (from: unknown, path: string): Json | undefined => path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), from) as Json | undefined;

/** A page with fields in braces filled in, if it's an HTTPS page then. */
const filled = (template: string, info: Record<string, Json>): string | undefined => {
  const url = template.replace(/\{([a-z_.]+)\}/gi, (_, k: string) => String(info[k] ?? ''));
  try {
    return new URL(url).protocol === 'https:' ? url : undefined;
  } catch {
    return undefined;
  }
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

  /** The service by its key, if it runs here: yours. */
  #mine(did: Did): StoredService | undefined {
    return this.services.storedServices().find((s) => this.services.serviceKey(s.name).did === did);
  }

  /** The names of the settings a service asks for as its person's own. */
  #yours(stored: StoredService): Set<string> {
    return new Set((stored.asks ?? stored.artifact?.manifest.env ?? []).filter((a) => a.yours).map((a) => a.name));
  }

  /** Set (or remove) one of your service's own settings, kept with it here: for every project it's in. */
  #setYours(did: Did, name: string, change: { value?: string; grant?: Grant; registered?: Registered }): void {
    const stored = this.#mine(did);
    if (!stored) throw new Error("only whoever runs it keeps that: it's theirs, for every project it's in");
    const settings = { ...stored.settings };
    const grants = { ...(stored.grants ?? {}) };
    const registered = { ...(stored.registered ?? {}) };
    delete settings[name];
    delete grants[name];
    delete registered[name];
    if (change.grant) grants[name] = change.grant;
    else if (change.registered) registered[name] = change.registered;
    else if (change.value !== undefined) settings[name] = change.value;
    const { grants: _grants, registered: _registered, ...rest } = stored;
    const after: StoredService = { ...rest, settings, ...(Object.keys(grants).length ? { grants } : {}), ...(Object.keys(registered).length ? { registered } : {}) };
    this.services.saveServices(this.services.storedServices().map((s) => (s.name === stored.name ? after : s)));
    this.#renewed.delete(`${stored.name} yours ${name}`);
    this.services.restartSoon(stored.name);
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
    // Its person's own: known only where it runs (yours), and never kept in the project.
    const mine = this.#mine(profile.did);
    const kept = set.filter((s) => !asks.some((a) => a.yours && a.name === s.name));
    const isSet = (name: string) => kept.some((s) => s.name === name) || (!!mine && (mine.settings[name] !== undefined || mine.grants?.[name] !== undefined || mine.registered?.[name] !== undefined));
    const yours = asks.filter((a) => a.yours);
    return {
      space: { id: space.id, name: this.h.spaceName(space) },
      service: { did: profile.did, name: profile.name, person: profile.person },
      asks,
      settings: kept.map((s) => ({ name: s.name, secret: s.secret, ...(s.oauth ? { oauth: true as const } : {}), ...(s.value !== undefined ? { value: s.value } : {}), by: this.h.actor(s.by, s.by), time: s.time })),
      ...(yours.length
        ? {
            yours: yours.map((a) => {
              // An app registered: what it is (never its key), and its next page (installing it, say).
              const app = mine?.registered?.[a.name];
              const next = app && a.register?.then ? filled(a.register.then, app.info) : undefined;
              return { name: a.name, ...(mine ? { set: isSet(a.name) } : {}), ...(app ? { app: app.info } : {}), ...(next ? { next } : {}) };
            }),
          }
        : {}),
      // Its person's own count as there where it runs elsewhere: only they know.
      missing: asks.filter((a) => !a.optional && !isSet(a.name) && (!a.yours || mine)).map((a) => a.name),
      mayChange: state.maintainers.has(this.h.identity.author),
      runsHere: !!mine,
    };
  }

  /**
   * Set (or remove, with null) a service's setting in a space: maintainers only. One it asks for as secret, or any you
   * mark secret, is boxed to the service's key: nobody else can read it back, you included.
   */
  async setServiceSetting(input: { space: string; service: string; name: string; value?: string | null; secret?: boolean; grant?: Grant }): Promise<ServiceSettingsInfo> {
    const space = this.h.space(input.space);
    const profile = await this.#inSpace(space, input.service);
    const name = input.name?.trim() ?? '';
    if (!isSettingName(name)) throw new Error(`a setting is named like an environment variable (A-Z, 0-9, _), not starting with WEAVE_: ${name}`);
    const asked = profile.settings?.find((s) => s.name === name);
    if (profile.settings?.length && !asked) throw new Error(`${profile.name} doesn't ask for ${name} (it asks for ${profile.settings.map((s) => s.name).join(', ')})`);
    // Yours (whoever runs it): kept with it on this computer, for every project it's in.
    if (asked?.yours) {
      const empty = input.value === null || input.value === undefined || input.value === '';
      if (!input.grant && !empty && asked.oauth) throw new Error(`${asked.label} is a sign-in: sign in with the provider instead of typing it`);
      if (!input.grant && !empty && String(input.value).length > SETTING_VALUE_MAX) throw new Error(`at most ${SETTING_VALUE_MAX} characters`);
      this.#setYours(profile.did, name, input.grant ? { grant: input.grant } : empty ? {} : { value: String(input.value) });
      return this.serviceSettings({ space: space.id, service: profile.did });
    }
    if (!this.h.state(space).maintainers.has(this.h.identity.author)) throw new Error(`only the maintainers of ${this.h.spaceName(space)} set its services' settings`);
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
    const yours = this.#yours(stored);
    const out: Record<string, Record<string, string>> = {};
    for (const id of stored.spaces) {
      const space = this.h.spaces.get(id);
      if (!space) continue;
      // What it asks for as its person's own isn't a project's to set.
      for (const s of serviceSettingsOf(this.h.entries(space), this.h.state(space).maintainers, key.did).filter((x) => !yours.has(x.name))) {
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
    const grants = Object.fromEntries(Object.entries(stored.grants ?? {}).map(([name, grant]) => [name, this.#renewed.get(`${stored.name} yours ${name}`)?.grant.access ?? grant.access]));
    // An app registered: what's kept of it, as JSON (its key only ever through signWith).
    const apps = Object.fromEntries(Object.entries(stored.registered ?? {}).map(([name, app]) => [name, JSON.stringify(app.info)]));
    return { ...stored.settings, ...fromSpaces, ...grants, ...apps };
  }

  /** What a service signs with, by name: an app's key, or a setting's value. */
  signingKey(stored: StoredService, name: string): string | undefined {
    return stored.registered?.[name]?.key ?? this.effective(stored)[name];
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
      // Its sign-ins as its person first.
      for (const [name, kept] of Object.entries(stored.grants ?? {})) {
        const slot = `${stored.name} yours ${name}`;
        const grant = this.#renewed.get(slot)?.grant ?? kept;
        if (!grant.refresh || !grant.expires || grant.expires - Date.now() > RENEW_BEFORE) continue;
        try {
          const next = await this.#tokenRequest(grant, { grant_type: 'refresh_token', refresh_token: grant.refresh });
          this.#renewed.set(slot, { from: 'yours', grant: { ...grant, ...next, refresh: next.refresh ?? grant.refresh } });
          changed.push(stored.name);
        } catch (error) {
          console.error(`weave: ${stored.name}'s sign-in for ${name} couldn't be renewed: ${(error as Error).message}`);
        }
      }
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

  #tokenRequest(oauth: { token: string; client: string; clientSecret?: string }, params: Record<string, string>): Promise<Pick<Grant, 'access' | 'refresh' | 'expires'>> {
    return tokenRequest(oauth, params, this.#fetch());
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
    const profile = await this.#inSpace(space, input.service);
    const asked = profile.settings?.find((s) => s.name === input.name);
    if (asked?.register) {
      if (!this.#mine(profile.did)) throw new Error(`only whoever runs ${profile.name} creates its app: it's theirs`);
      return this.#startRegister(space, profile.did, asked.name, asked.label, asked.register);
    }
    if (!asked?.oauth) throw new Error(`${profile.name} doesn't ask for a sign-in named ${input.name}`);
    // Yours: whoever runs it signs in, as themselves. A project's: its maintainers.
    if (asked.yours ? !this.#mine(profile.did) : !this.h.state(space).maintainers.has(this.h.identity.author)) throw new Error(asked.yours ? `only whoever runs ${profile.name} signs it in: it acts as them` : `only the maintainers of ${this.h.spaceName(space)} set its services' settings`);
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
    const started = await startDeviceSignIn(oauth, this.#fetch(), label);
    const id = randomBytes(16).toString('base64url');
    const done = (async () => {
      try {
        const got = await started.grant;
        const grant: Grant = { ...got, token: oauth.token, client: oauth.client, ...(oauth.clientSecret ? { clientSecret: oauth.clientSecret } : {}) };
        return await this.setServiceSetting({ space: space.id, service, name, grant });
      } finally {
        setTimeout(() => this.#signIns.delete(id), 60_000).unref();
      }
    })();
    done.catch(() => {});
    this.#signIns.set(id, { done });
    return { id, url: started.url, code: started.code };
  }

  /**
   * Register an app of yours with the provider (GitHub's App manifest flow): a page on this computer posts its manifest
   * to the provider's page, you create the app there, the provider comes back here with a code, and this node
   * exchanges it for the app (its key kept here, for signing). Then the browser goes on to its next page (installing
   * it on your repositories, say). finishSignIn waits for that (10 minutes at most).
   */
  async #startRegister(space: StoredSpace, service: Did, name: string, label: string, register: AppRegister): Promise<{ id: string; url: string }> {
    const state = randomBytes(16).toString('base64url');
    let finish!: (code: string) => void;
    const coming = new Promise<string>((resolve) => (finish = resolve));
    let made: Promise<ServiceSettingsInfo> | undefined;
    const html = (text: string) => `<!doctype html><meta charset="utf-8"><title>Weave</title><body style="font:16px system-ui;margin:3em">${text}</body>`;
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.searchParams.get('state') !== state) return void res.writeHead(404).end();
      if (url.pathname === '/') {
        // Sent on at once: the provider's page, with the app's manifest (and where to come back to).
        const random = randomBytes(3).toString('hex');
        const named = Object.fromEntries(Object.entries(register.manifest).map(([k, v]) => [k, typeof v === 'string' ? v.replace('{random}', random) : v]));
        const manifest = JSON.stringify({ ...named, redirect_url: `${base}back` });
        const action = `${register.page}${register.page.includes('?') ? '&' : '?'}state=${encodeURIComponent(state)}`;
        const esc = (text: string) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
        return void res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html(`<form method="post" action="${esc(action)}"><input type="hidden" name="manifest" value="${esc(manifest)}"><p>Creating your ${esc(label)} on ${esc(new URL(register.page).hostname)}…</p><button>Go on</button></form><script>document.forms[0].submit()</script>`));
      }
      if (url.pathname === '/back' && url.searchParams.get('code')) {
        finish(url.searchParams.get('code')!);
        // Once it's here: on to its next page (installing it), or a word that it's done.
        void made!.then(
          (info) => {
            const next = info.yours?.find((y) => y.name === name)?.next;
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
    const id = state;
    made = (async () => {
      try {
        const code = await Promise.race([coming, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`no ${label} created within 10 minutes`)), 10 * 60_000).unref())]);
        const res = await this.#fetch()(register.exchange.replace('{code}', encodeURIComponent(code)), { method: 'POST', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
        const app = (await res.json().catch(() => undefined)) as unknown;
        const key = fieldOf(app, register.key);
        if (!res.ok || typeof key !== 'string') throw new Error(`the provider answered ${res.status}: no ${label}`);
        // What the service reads of it; nothing else (no secrets of the provider's) is kept.
        const info = Object.fromEntries(register.keep.flatMap((k) => (fieldOf(app, k) !== undefined ? [[k, fieldOf(app, k)!]] : [])));
        this.#setYours(service, name, { registered: { info, key } });
        return await this.serviceSettings({ space: space.id, service });
      } finally {
        setTimeout(() => server.close(), 5000).unref();
        setTimeout(() => this.#signIns.delete(id), 60_000).unref();
      }
    })();
    made.catch(() => {});
    this.#signIns.set(id, { done: made });
    return { id, url: `${base}?state=${encodeURIComponent(state)}` };
  }

  /** Wait for a sign-in startSignIn began: the service's settings once it's signed in, or why not. */
  async finishSignIn(input: { id: string }): Promise<ServiceSettingsInfo> {
    const signIn = this.#signIns.get(input.id);
    if (!signIn) throw new Error('no sign-in under way with that id');
    return signIn.done;
  }
}

