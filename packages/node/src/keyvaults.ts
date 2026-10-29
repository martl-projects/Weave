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
 *   keyvaults.json (sealed)  [{name, shipped, digest, apps: {SETTING: {info, key}}, handed: {project: [resource]}, log}]
 */

export interface StoredKeyvault {
  name: string;
  shipped: string;
  /** sha256:<hex> of its component, as added. */
  digest: string;
  /** Its apps registered as its person (a GitHub App), by setting: what's read of each, and its key. */
  apps: Record<string, Registered>;
  /** What its person handed each project (by id): resources there (repositories). */
  handed: Record<string, string[]>;
  /** What was taken back from each project, and when: still minted for a day, for services to undo what they did with it. */
  withdrawn?: Record<string, Record<string, string>>;
  /** The access it minted, newest last (the last 200). */
  log: KeyvaultUse[];
}

export interface KeyvaultUse {
  time: string;
  service: string;
  project: string;
  resources: string[];
  rights: Record<string, string>;
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
  /** Its app, if made: what's kept of it (never its key), and its next page (installing it). */
  apps: Array<{ setting: string; info: Record<string, Json>; next?: string }>;
  handed: Record<string, string[]>;
  log: KeyvaultUse[];
  problem?: string;
}

/** What's taken back from a project is still minted for this long: for services to undo what they did with it. */
const WITHDRAWN_MS = 24 * 3600_000;

/** Minted access is used again until this long before it runs out. */
const REUSE_UNTIL = 5 * 60_000;

export class Keyvaults {
  readonly #homeOf: () => Home;
  readonly #runtime: Runtime;
  readonly #shippedDir: () => string | undefined;
  /** Access minted, by keyvault and what it's cut to: used again while it lasts. */
  #minted = new Map<string, { token: string; expires?: number }>();
  /** Apps being made: each waits for the provider. */
  #making = new Map<string, Promise<KeyvaultState>>();

  constructor(home: () => Home, runtime: Runtime, shippedDir: () => string | undefined) {
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
    return readSecretJson<StoredKeyvault[]>(this.#home, this.#file) ?? [];
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

  /** The keyvaults this Weave ships. */
  shipped(): ShippedService[] {
    return [...shippedServices(this.#shippedDir() ?? SHIPPED_DIR).values()].filter((s) => s.manifest.keyvault);
  }

  state(k: StoredKeyvault): KeyvaultState {
    const s = this.shipped().find((x) => x.name === k.shipped);
    const problem = !s ? `this Weave ships no keyvault ${k.shipped}` : shippedProblem(s);
    const settings = s?.manifest.env ?? [];
    const apps = Object.entries(k.apps).map(([setting, app]) => {
      const then = settings.find((e) => e.name === setting)?.register?.then;
      const next = then ? filled(then, app.info) : undefined;
      return { setting, info: app.info, ...(next ? { next } : {}) };
    });
    return { name: k.name, title: s?.manifest.name ?? k.name, ...(s?.about ? { about: s.about } : {}), platform: s?.manifest.keyvault?.platform ?? k.name, ...(s?.manifest.keyvault?.resources ? { resources: s.manifest.keyvault.resources } : {}), digest: k.digest, settings, apps, handed: k.handed, log: k.log.slice(-50), ...(problem ? { problem } : {}) };
  }

  list(): KeyvaultState[] {
    return this.#stored().map((k) => this.state(k));
  }

  /** Yours for a platform, if you added one. */
  forPlatform(platform: string): StoredKeyvault | undefined {
    const names = new Set(this.shipped().filter((s) => s.manifest.keyvault!.platform === platform).map((s) => s.name));
    return this.#stored().find((k) => names.has(k.shipped));
  }

  /** Add one Weave ships (one per platform), maybe with an app you made before (moved here from a service). */
  add(input: { shipped: string; apps?: Record<string, Registered> }): KeyvaultState {
    const s = this.shipped().find((x) => x.name === input.shipped);
    if (!s) throw new Error(`this Weave ships no keyvault named ${input.shipped}${this.shipped().length ? ` (it ships ${this.shipped().map((x) => x.name).join(', ')})` : ''}`);
    const all = this.#stored();
    const kept = all.find((k) => k.name === s.name);
    const next: StoredKeyvault = { name: s.name, shipped: s.name, digest: s.digest, apps: { ...(kept?.apps ?? {}), ...(input.apps ?? {}) }, handed: kept?.handed ?? {}, log: kept?.log ?? [] };
    this.#write([...all.filter((k) => k.name !== s.name), next]);
    return this.state(next);
  }

  remove(name: string): void {
    const all = this.#stored();
    if (!all.some((k) => k.name === name)) throw new Error(`no keyvault ${name} here`);
    this.#write(all.filter((k) => k.name !== name));
    for (const key of [...this.#minted.keys()]) if (key.startsWith(`${name} `)) this.#minted.delete(key);
  }

  /** Hand a project (by id) these resources (repositories), instead of what it had: yours alone to say. */
  hand(input: { name: string; project: string; resources: string[] }): KeyvaultState {
    const resources = [...new Set(input.resources.map((r) => String(r).trim()).filter((r) => r && r.length <= 200))].slice(0, 100);
    const k = this.#change(input.name, (k) => {
      // Taken back: services still get it for a day, only to undo what they did with it (take back access they gave).
      const now = new Date().toISOString();
      const gone = (k.handed[input.project] ?? []).filter((r) => !resources.includes(r));
      const kept = Object.fromEntries(Object.entries(k.withdrawn?.[input.project] ?? {}).filter(([r, t]) => !resources.includes(r) && Date.now() - Date.parse(t) < WITHDRAWN_MS));
      for (const r of gone) kept[r] = now;
      k.withdrawn = { ...(k.withdrawn ?? {}), [input.project]: kept };
      if (!Object.keys(kept).length) delete k.withdrawn[input.project];
      if (resources.length) k.handed[input.project] = resources;
      else delete k.handed[input.project];
    });
    // What was minted for what's no longer handed isn't used again.
    for (const key of [...this.#minted.keys()]) if (key.startsWith(`${input.name} `)) this.#minted.delete(key);
    return this.state(k);
  }

  /** Make your app for one of its settings (GitHub's App manifest flow): the page to open, and an id to wait on. */
  async startApp(input: { name: string; setting: string; account: string; fetch: typeof fetch }): Promise<{ id: string; url: string }> {
    const k = this.#stored().find((x) => x.name === input.name);
    if (!k) throw new Error(`no keyvault ${input.name} here: add it first`);
    const asked = this.state(k).settings.find((e) => e.name === input.setting);
    if (!asked?.register) throw new Error(`${input.name} makes no app called ${input.setting}`);
    const started = await startRegistration({ register: asked.register, label: asked.label, account: input.account, fetch: input.fetch, keep: (app) => void this.#change(input.name, (k) => void (k.apps[input.setting] = app)) });
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

  /** What its access reaches, to hand to projects: [{value, note?}]. */
  async reachable(name: string): Promise<Array<{ value: string; note?: string }>> {
    const k = this.#stored().find((x) => x.name === name);
    if (!k) throw new Error(`no keyvault ${name} here`);
    return JSON.parse(String(await this.#call(k, 'reachable', '{}'))) as Array<{ value: string; note?: string }>;
  }

  /**
   * Access for a service, already checked to be its person's and to declare this use: only for resources its person
   * handed that project here, cut to the rights its contract declares. Logged.
   */
  async mint(input: { platform: string; service: string; project: string; resources: string[]; rights: Record<string, string> }): Promise<{ token: string; expires?: number }> {
    const k = this.forPlatform(input.platform);
    if (!k) throw new Error(`no ${input.platform} keyvault here: its person adds one in Keys & devices`);
    const withdrawn = Object.entries(k.withdrawn?.[input.project] ?? {}).filter(([, t]) => Date.now() - Date.parse(t) < WITHDRAWN_MS).map(([r]) => r);
    const handed = new Set([...(k.handed[input.project] ?? []), ...withdrawn]);
    const resources = [...new Set(input.resources)].sort();
    const not = resources.filter((r) => !handed.has(r));
    if (!resources.length || not.length) throw new Error(`${not.join(', ') || 'nothing'} ${not.length === 1 ? "isn't" : "aren't"} handed to that project in the ${input.platform} keyvault: only its person hands anything to a project`);
    const slot = `${k.name} ${canonicalJson({ resources, rights: input.rights } as unknown as Json)}`;
    const kept = this.#minted.get(slot);
    let got = kept && (!kept.expires || kept.expires - Date.now() > REUSE_UNTIL) ? kept : undefined;
    if (!got) {
      got = JSON.parse(String(await this.#call(k, 'mint', JSON.stringify({ resources, rights: input.rights })))) as { token: string; expires?: number };
      if (typeof got.token !== 'string') throw new Error(`${k.name} minted nothing`);
      this.#minted.set(slot, got);
      this.#change(k.name, (k) => void (k.log = [...k.log, { time: new Date().toISOString(), service: input.service, project: input.project, resources, rights: input.rights }].slice(-200)));
    }
    return got;
  }

  /** Call one of a keyvault's functions, in a worker of its own for that call. */
  async #call(k: StoredKeyvault, fn: string, input: string): Promise<unknown> {
    const s = this.shipped().find((x) => x.name === k.shipped);
    if (!s) throw new Error(`this Weave ships no keyvault ${k.shipped}`);
    const problem = shippedProblem(s);
    if (problem) throw new Error(problem);
    const dir = join(this.#home.dir, 'keyvaults', k.name);
    const entry = await prepareWasm(s.file, join(dir, 'wasm'));
    const key = `keyvault:${k.name}:${randomBytes(4).toString('hex')}`;
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
          // What's kept of its app (never its key), and signing with that key.
          if (name === 'setting') return k.apps[String(args[0])] ? JSON.stringify(k.apps[String(args[0])].info) : undefined;
          if (name === 'sign') return signWith(k.apps[String(args[0])]?.key, String(args[0]), String(args[1]), args[2] as Uint8Array);
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
