import { randomBytes } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJson, type AppSetting, type Json } from '@weave/core';
import type { Home } from './home.ts';
import { filled, signWith, startRegistration, type Registered } from './register.ts';
import { prepareWasm, type Runtime } from './runtime.ts';
import { shippedProblem, shippedServices, SHIPPED_DIR, type ShippedService } from './shipped.ts';
import { readSecretJson, writeSecretJson } from './vault.ts';

/*
 * Keyvaults: client apps of their person's that hold their access to a platform (their GitHub App) and hand their
 * services only what's derived from it. A service never asks one itself, and never with an event: it calls its own
 * node (token() in the WIT), which checks that the service is its person's, that its contract declares this use (uses)
 * and that it asks for one of its projects and for what its person handed that project here. Only then is the keyvault
 * called, to mint access cut to those resources and the rights the contract declares. Every token is logged.
 *
 * What reaches which project is its person's alone to say (handed): a project's maintainers never choose what
 * someone's access reaches.
 *
 *   keyvaults.json (sealed)  [{name, shipped, digest, apps: {<app>: {setting, info, key, handed: {project: [resource]}, withdrawn}}, log}]
 *
 * A keyvault holds any number of apps (one GitHub App for your own repositories, another for an organization's): each
 * hands projects what it reaches, in its own settings, and a service's access comes from the app that handed that
 * project what it asks for.
 */

/** One of its apps: what's read of it, its key, and what it handed which project. */
export interface StoredApp extends Registered {
  /** The setting it was made for (its kind of app). */
  setting: string;
  /** What it handed each project (by id): resources there (repositories). */
  handed: Record<string, string[]>;
  /** What was taken back from each project, and when: still minted for a day, for services to undo what they did with it. */
  withdrawn?: Record<string, Record<string, string>>;
}

export interface StoredKeyvault {
  name: string;
  shipped: string;
  /** sha256:<hex> of its component, as added. */
  digest: string;
  /** Its apps registered as its person, by key (the provider's id for it). */
  apps: Record<string, StoredApp>;
  /** The access it minted, newest last (the last 200). */
  log: KeyvaultUse[];
}

export interface KeyvaultUse {
  time: string;
  service: string;
  project: string;
  resources: string[];
  rights: Record<string, string>;
  /** Which of its apps. */
  app?: string;
}

export interface KeyvaultState {
  name: string;
  title: string;
  about?: string;
  platform: string;
  /** What it hands to projects, in words: "repositories". */
  resources?: string;
  digest: string;
  settings: AppSetting[];
  /** Its apps: what's kept of each (never its key), its next page (installing it), and what it handed which project. */
  apps: Array<{ key: string; setting: string; info: Record<string, Json>; next?: string; handed: Record<string, string[]> }>;
  log: KeyvaultUse[];
  problem?: string;
}

/** What's taken back from a project is still minted for this long: for services to undo what they did with it. */
const WITHDRAWN_MS = 24 * 3600_000;

/** Minted access is used again until this long before it runs out. */
const REUSE_UNTIL = 5 * 60_000;

/** What an app has for a project: what it handed there, and what it took back less than a day ago. */
const reachIn = (app: StoredApp, project: string): Set<string> => new Set([...(app.handed[project] ?? []), ...Object.entries(app.withdrawn?.[project] ?? {}).filter(([, t]) => Date.now() - Date.parse(t) < WITHDRAWN_MS).map(([r]) => r)]);

export class Keyvaults {
  readonly #homeOf: () => Home;
  readonly #runtime: Runtime;
  readonly #shippedDir: () => string | undefined;
  /** Those its person added from releases (clientapps.ts): run exactly as the ones Weave ships. */
  readonly #fromReleases: () => ShippedService[];
  /** Access minted, by keyvault, app and what it's cut to: used again while it lasts. */
  #minted = new Map<string, { token: string; expires?: number }>();
  /** Apps being made: each waits for the provider. */
  #making = new Map<string, Promise<KeyvaultState>>();

  constructor(home: () => Home, runtime: Runtime, shippedDir: () => string | undefined, fromReleases: () => ShippedService[] = () => []) {
    this.#fromReleases = fromReleases;
    this.#homeOf = home;
    this.#runtime = runtime;
    this.#shippedDir = shippedDir;
  }

  get #home(): Home {
    return this.#homeOf();
  }

  get #file(): string {
    return join(this.#home.dir, 'keyvaults.json');
  }

  #stored(): StoredKeyvault[] {
    const all = readSecretJson<Array<StoredKeyvault & { handed?: Record<string, string[]>; withdrawn?: StoredApp['withdrawn'] }>>(this.#home, this.#file) ?? [];
    // From before: one app by its setting's name, and what it handed kept on the keyvault.
    for (const k of all) {
      if (!k.handed && !Object.values(k.apps).some((a) => !(a as Partial<StoredApp>).setting)) continue;
      k.apps = Object.fromEntries(Object.entries(k.apps).map(([key, a]) => ((a as Partial<StoredApp>).setting ? [key, a] : [String(a.info.id ?? key), { ...a, setting: key, handed: k.handed ?? {}, ...(k.withdrawn ? { withdrawn: k.withdrawn } : {}) }])));
      delete k.handed;
      delete k.withdrawn;
    }
    return all;
  }

  #write(all: StoredKeyvault[]): void {
    writeSecretJson(this.#home, this.#file, all);
  }

  #change(name: string, edit: (k: StoredKeyvault) => void): StoredKeyvault {
    const all = this.#stored();
    const k = all.find((x) => x.name === name);
    if (!k) throw new Error(`no keyvault ${name} here: add it first (Keys & devices)`);
    edit(k);
    this.#write(all);
    return k;
  }

  /** One of a keyvault's apps: the one named, or its only one. */
  #app(k: StoredKeyvault, key?: string): [string, StoredApp] {
    const all = Object.entries(k.apps);
    const found = key ? all.find(([x]) => x === key) : all.length === 1 ? all[0] : undefined;
    if (!found) throw new Error(key ? `${k.name} has no app ${key}` : all.length ? `which of ${k.name}'s apps? (${all.map(([x, a]) => String(a.info.slug ?? x)).join(', ')})` : `${k.name} has no app yet: make one first`);
    return found;
  }

  #forget(name: string, app?: string): void {
    for (const key of [...this.#minted.keys()]) if (key.startsWith(app ? `${name} ${app} ` : `${name} `)) this.#minted.delete(key);
  }

  /** The keyvaults this Weave ships. */
  shipped(): ShippedService[] {
    return [...[...shippedServices(this.#shippedDir() ?? SHIPPED_DIR).values()].filter((s) => s.manifest.keyvault), ...this.#fromReleases()];
  }

  state(k: StoredKeyvault): KeyvaultState {
    const s = this.shipped().find((x) => x.name === k.shipped);
    const problem = !s ? `this Weave ships no keyvault ${k.shipped}` : shippedProblem(s);
    const settings = s?.manifest.env ?? [];
    const apps = Object.entries(k.apps).map(([key, app]) => {
      const then = settings.find((e) => e.name === app.setting)?.register?.then;
      const next = then ? filled(then, app.info) : undefined;
      return { key, setting: app.setting, info: app.info, ...(next ? { next } : {}), handed: app.handed };
    });
    return { name: k.name, title: s?.manifest.name ?? k.name, ...(s?.about ? { about: s.about } : {}), platform: s?.manifest.keyvault?.platform ?? k.name, ...(s?.manifest.keyvault?.resources ? { resources: s.manifest.keyvault.resources } : {}), digest: k.digest, settings, apps, log: k.log.slice(-50), ...(problem ? { problem } : {}) };
  }

  list(): KeyvaultState[] {
    return this.#stored().map((k) => this.state(k));
  }

  /** Yours for a platform, if you added one. */
  forPlatform(platform: string): StoredKeyvault | undefined {
    const names = new Set(this.shipped().filter((s) => s.manifest.keyvault!.platform === platform).map((s) => s.name));
    return this.#stored().find((k) => names.has(k.shipped));
  }

  /** What a project has from a platform's keyvault, all its apps together: for its services (handed in the WIT). */
  handedTo(platform: string, project: string): string[] {
    const k = this.forPlatform(platform);
    return [...new Set(Object.values(k?.apps ?? {}).flatMap((a) => a.handed[project] ?? []))];
  }

  /** Add one Weave ships (one per platform), maybe with an app you made before (moved here from a service, by setting). */
  add(input: { shipped: string; apps?: Record<string, Registered> }): KeyvaultState {
    const s = this.shipped().find((x) => x.name === input.shipped);
    if (!s) throw new Error(`this Weave ships no keyvault named ${input.shipped}${this.shipped().length ? ` (it ships ${this.shipped().map((x) => x.name).join(', ')})` : ''}`);
    const all = this.#stored();
    // One per platform: services' access comes from it, so a second (anyone's) never stands in quietly. Swapped only on purpose.
    const platform = s.manifest.keyvault!.platform;
    const other = all.find((k) => k.name !== s.name && this.shipped().find((x) => x.name === k.shipped)?.manifest.keyvault?.platform === platform);
    if (other) throw new Error(`you have a keyvault for ${platform} already (${other.name}): remove it first to use ${s.name} instead (your services then get their access through that one)`);
    const kept = all.find((k) => k.name === s.name);
    const moved = Object.fromEntries(Object.entries(input.apps ?? {}).map(([setting, a]): [string, StoredApp] => [String(a.info.id ?? setting), { ...a, setting, handed: {} }]));
    const next: StoredKeyvault = { name: s.name, shipped: s.name, digest: s.digest, apps: { ...moved, ...(kept?.apps ?? {}) }, log: kept?.log ?? [] };
    this.#write([...all.filter((k) => k.name !== s.name), next]);
    return this.state(next);
  }

  remove(name: string): void {
    const all = this.#stored();
    if (!all.some((k) => k.name === name)) throw new Error(`no keyvault ${name} here`);
    this.#write(all.filter((k) => k.name !== name));
    this.#forget(name);
  }

  /** Forget one of its apps (and what it handed out): your services lose what they got through it. It stays on the provider until you delete it there. */
  removeApp(input: { name: string; app: string }): KeyvaultState {
    const k = this.#change(input.name, (k) => {
      this.#app(k, input.app);
      delete k.apps[input.app];
    });
    this.#forget(input.name, input.app);
    return this.state(k);
  }

  /** Hand a project (by id) these resources (repositories) of one of its apps, instead of what it had: yours alone to say. */
  hand(input: { name: string; app?: string; project: string; resources: string[] }): KeyvaultState {
    const resources = [...new Set(input.resources.map((r) => String(r).trim()).filter((r) => r && r.length <= 200))].slice(0, 100);
    let key = '';
    const k = this.#change(input.name, (k) => {
      const [found, app] = this.#app(k, input.app);
      key = found;
      // Taken back: services still get it for a day, only to undo what they did with it (take back access they gave).
      const now = new Date().toISOString();
      const gone = (app.handed[input.project] ?? []).filter((r) => !resources.includes(r));
      const kept = Object.fromEntries(Object.entries(app.withdrawn?.[input.project] ?? {}).filter(([r, t]) => !resources.includes(r) && Date.now() - Date.parse(t) < WITHDRAWN_MS));
      for (const r of gone) kept[r] = now;
      app.withdrawn = { ...(app.withdrawn ?? {}), [input.project]: kept };
      if (!Object.keys(kept).length) delete app.withdrawn[input.project];
      if (resources.length) app.handed[input.project] = resources;
      else delete app.handed[input.project];
    });
    // What was minted for what's no longer handed isn't used again.
    this.#forget(input.name, key);
    return this.state(k);
  }

  /** Make an app for one of its settings (GitHub's App manifest flow): another, if it has some. The page to open, and an id to wait on. */
  async startApp(input: { name: string; setting: string; account: string; fetch: typeof fetch }): Promise<{ id: string; url: string }> {
    const k = this.#stored().find((x) => x.name === input.name);
    if (!k) throw new Error(`no keyvault ${input.name} here: add it first`);
    const asked = this.state(k).settings.find((e) => e.name === input.setting);
    if (!asked?.register) throw new Error(`${input.name} makes no app called ${input.setting}`);
    const started = await startRegistration({ register: asked.register, label: asked.label, account: input.account, fetch: input.fetch, keep: (app) => void this.#change(input.name, (k) => void (k.apps[String(app.info.id ?? randomBytes(4).toString('hex'))] = { ...app, setting: input.setting, handed: {} })) });
    const id = randomBytes(16).toString('base64url');
    const done = started.done.then(() => this.state(this.#stored().find((x) => x.name === input.name)!)).finally(() => setTimeout(() => this.#making.delete(id), 60_000).unref());
    done.catch(() => {});
    this.#making.set(id, done);
    return { id, url: started.url };
  }

  async finishApp(id: string): Promise<KeyvaultState> {
    const making = this.#making.get(id);
    if (!making) throw new Error('no app being made with that id');
    return making;
  }

  /** What one of its apps reaches, to hand to projects: [{value, note?}]. */
  async reachable(name: string, app?: string): Promise<Array<{ value: string; note?: string }>> {
    const k = this.#stored().find((x) => x.name === name);
    if (!k) throw new Error(`no keyvault ${name} here`);
    const [key, a] = this.#app(k, app);
    return JSON.parse(String(await this.#call(k, a, key, 'reachable', '{}'))) as Array<{ value: string; note?: string }>;
  }

  /**
   * Access for a service, already checked to be its person's and to declare this use: only for resources one of its
   * apps handed that project, from that app, cut to the rights its contract declares. Logged.
   */
  async mint(input: { platform: string; service: string; project: string; resources: string[]; rights: Record<string, string> }): Promise<{ token: string; expires?: number }> {
    const k = this.forPlatform(input.platform);
    if (!k) throw new Error(`no ${input.platform} keyvault here: its person adds one in Keys & devices`);
    const resources = [...new Set(input.resources)].sort();
    const found = Object.entries(k.apps).find(([, a]) => resources.length && resources.every((r) => reachIn(a, input.project).has(r)));
    if (!found) throw new Error(`${resources.join(', ') || 'nothing'} ${resources.length === 1 ? "isn't" : "aren't"} handed to that project by one app of the ${input.platform} keyvault: only its person hands anything to a project`);
    const [key, app] = found;
    const slot = `${k.name} ${key} ${canonicalJson({ resources, rights: input.rights } as unknown as Json)}`;
    const kept = this.#minted.get(slot);
    let got = kept && (!kept.expires || kept.expires - Date.now() > REUSE_UNTIL) ? kept : undefined;
    if (!got) {
      got = JSON.parse(String(await this.#call(k, app, key, 'mint', JSON.stringify({ resources, rights: input.rights })))) as { token: string; expires?: number };
      if (typeof got.token !== 'string') throw new Error(`${k.name} minted nothing`);
      this.#minted.set(slot, got);
      this.#change(k.name, (k) => void (k.log = [...k.log, { time: new Date().toISOString(), service: input.service, project: input.project, resources, rights: input.rights, app: key }].slice(-200)));
    }
    return got;
  }

  /** Call one of a keyvault's functions, in a worker of its own for that call. */
  async #call(k: StoredKeyvault, app: StoredApp, appKey: string, fn: string, input: string): Promise<unknown> {
    const s = this.shipped().find((x) => x.name === k.shipped);
    if (!s) throw new Error(`this Weave ships no keyvault ${k.shipped}`);
    const problem = shippedProblem(s);
    if (problem) throw new Error(problem);
    const dir = join(this.#home.dir, 'keyvaults', k.name);
    const entry = await prepareWasm(s.file, join(dir, 'wasm'));
    const key = `keyvault:${k.name}:${appKey}:${randomBytes(4).toString('hex')}`;
    this.#runtime.startWasm(
      key,
      {
        dir: join(dir, 'wasm'),
        entry,
        data: join(dir, 'data'),
        log: join(dir, 'keyvault.log'),
        name: k.name,
        net: s.manifest.keyvault?.net ?? [],
        host: (name, args) => {
          // The app it's called for: what's kept of it (never its key), as the setting it was made for, and signing with its key.
          if (name === 'setting') return String(args[0]) === app.setting ? JSON.stringify(app.info) : undefined;
          if (name === 'sign') return signWith(String(args[0]) === app.setting ? app.key : undefined, String(args[0]), String(args[1]), args[2] as Uint8Array);
          if (name === 'log') return void appendFileSync(join(dir, 'keyvault.log'), `${String(args[0]).slice(0, 2000)}\n`);
          throw new Error(`a keyvault has no ${name}`);
        },
      },
      () => {},
    );
    try {
      return await this.#runtime.callWasm(key, fn, [input]);
    } finally {
      this.#runtime.stop(key);
    }
  }
}
