import { randomBytes } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { type AppManifest, type AppSetting, type Json } from '@weave/core';
import type { Home } from './home.ts';
import { prepareWasm, type Runtime } from './runtime.ts';
import { shippedProblem, shippedServices, SHIPPED_DIR, type ShippedService } from './shipped.ts';
import { readSecretJson, writeSecretJson } from './vault.ts';

/*
 * Fetchers: client apps that fetch artifacts for their person, on their node. A provider that hands out artifacts
 * (artifact.fetch) names its fetcher in its contract; what it answers is a grant for that fetcher alone, sealed to
 * the asker. Weave runs the fetcher with the grant and the person's own settings for it (their GitHub sign-in), and
 * checks what it writes against the artifact's digest: a fetcher can't slip in another file.
 *
 * A fetcher is the person's, not a project's: they add it for the projects that need it, and it's never chosen in
 * any other, so a company's fetcher never sees what another project grants. Weave's own (github-checkout) may be
 * allowed everywhere; that too is the person's choice.
 *
 *   fetchers.json (sealed)  [{name, shipped, digest, projects: [ids] | "all", settings: {NAME: value}}]
 */

export interface StoredFetcher {
  /** Its name: the shipped fetcher's. */
  name: string;
  shipped: string;
  /** sha256:<hex> of its component, as added. */
  digest: string;
  /** The projects it fetches for (ids), or all of them. */
  projects: string[] | 'all';
  /** Its person's settings for it (their own sign-in): kept sealed here, never in a project. */
  settings: Record<string, string>;
}

export interface FetcherInfo {
  name: string;
  title: string;
  about?: string;
  digest: string;
  projects: string[] | 'all';
  /** What it asks for, and which of those are filled in (never their values). */
  settings: AppSetting[];
  filled: string[];
  net: string[];
  /** Why it can't run here, if it can't. */
  problem?: string;
}

/** A fetch a provider granted: what the fetcher gets. */
export interface FetchInput {
  grant: Json;
  artifact: { project: string; id: string; tag: string; name: string };
  asset: { file: string; sha256: string; size?: number };
}

/** How long a fetcher may take for one file. */
export const FETCH_MS = 30 * 60_000;

export class Fetchers {
  readonly #homeOf: () => Home;
  readonly #runtime: Runtime;
  readonly #shippedDir: () => string | undefined;

  constructor(home: () => Home, runtime: Runtime, shippedDir: () => string | undefined) {
    this.#homeOf = home;
    this.#runtime = runtime;
    this.#shippedDir = shippedDir;
  }

  get #home(): Home {
    return this.#homeOf();
  }

  get #file(): string {
    return join(this.#home.dir, 'fetchers.json');
  }

  #stored(): StoredFetcher[] {
    return readSecretJson<StoredFetcher[]>(this.#home, this.#file) ?? [];
  }

  #write(all: StoredFetcher[]): void {
    writeSecretJson(this.#home, this.#file, all);
  }

  /** The fetchers this Weave ships. */
  shipped(): ShippedService[] {
    return [...shippedServices(this.#shippedDir() ?? SHIPPED_DIR).values()].filter((s) => s.manifest.fetcher);
  }

  #info(f: StoredFetcher): FetcherInfo {
    const s = this.shipped().find((x) => x.name === f.shipped);
    const problem = !s ? `this Weave ships no fetcher ${f.shipped}` : s.digest !== f.digest ? `${f.name} changed since you added it: add it again` : shippedProblem(s);
    return { name: f.name, title: s?.manifest.name ?? f.name, ...(s?.about ? { about: s.about } : {}), digest: f.digest, projects: f.projects, settings: s?.manifest.env ?? [], filled: Object.keys(f.settings), net: s?.manifest.fetcher?.net ?? [], ...(problem ? { problem } : {}) };
  }

  list(): FetcherInfo[] {
    return this.#stored().map((f) => this.#info(f));
  }

  /** Add one Weave ships, for these projects (ids) or all; added again, its projects are added to. */
  add(input: { shipped: string; projects: string[] | 'all' }): FetcherInfo {
    const s = this.shipped().find((x) => x.name === input.shipped);
    if (!s) throw new Error(`this Weave ships no fetcher named ${input.shipped}${this.shipped().length ? ` (it ships ${this.shipped().map((x) => x.name).join(', ')})` : ''}`);
    const all = this.#stored();
    const kept = all.find((f) => f.name === s.name);
    const projects = input.projects === 'all' || kept?.projects === 'all' ? 'all' : [...new Set([...(kept?.projects ?? []), ...input.projects])];
    const next: StoredFetcher = { name: s.name, shipped: s.name, digest: s.digest, projects, settings: kept?.settings ?? {} };
    this.#write([...all.filter((f) => f.name !== s.name), next]);
    return this.#info(next);
  }

  /** Change what it fetches for, or its settings (null: take one out). */
  set(input: { name: string; projects?: string[] | 'all'; settings?: Record<string, string | null> }): FetcherInfo {
    const all = this.#stored();
    const f = all.find((x) => x.name === input.name);
    if (!f) throw new Error(`no fetcher ${input.name} here`);
    const asks = new Set((this.#info(f).settings ?? []).map((s) => s.name));
    if (input.projects !== undefined) f.projects = input.projects === 'all' ? 'all' : [...new Set(input.projects)];
    for (const [name, value] of Object.entries(input.settings ?? {})) {
      if (!asks.has(name)) throw new Error(`${f.name} asks for no setting ${name}`);
      if (value === null || value === '') delete f.settings[name];
      else f.settings[name] = String(value).slice(0, 8000);
    }
    this.#write(all);
    return this.#info(f);
  }

  remove(name: string): void {
    const all = this.#stored();
    if (!all.some((f) => f.name === name)) throw new Error(`no fetcher ${name} here`);
    this.#write(all.filter((f) => f.name !== name));
  }

  /**
   * The fetcher a contract names, for a project: added by this person and allowed there, or why not. A digest
   * names exactly that component; a name, the one this Weave ships.
   */
  forProject(ref: string, project: string): { fetcher: StoredFetcher; shipped: ShippedService } | { missing: string } {
    const s = this.shipped().find((x) => (ref.startsWith('sha256:') ? x.digest === ref : x.name === ref));
    if (!s) return { missing: ref.startsWith('sha256:') ? `a fetcher this Weave doesn't ship (${ref.slice(0, 19)}…)` : `the fetcher ${ref}, which this Weave doesn't ship` };
    const f = this.#stored().find((x) => x.shipped === s.name);
    if (!f) return { missing: `the fetcher ${s.manifest.name} (${s.name}): add it for this project` };
    if (f.projects !== 'all' && !f.projects.includes(project)) return { missing: `the fetcher ${s.manifest.name} (${s.name}) for this project: you added it for others only` };
    if (f.digest !== s.digest) return { missing: `the fetcher ${s.manifest.name} (${s.name}) again: it changed since you added it` };
    return { fetcher: f, shipped: s };
  }

  /**
   * Run a fetcher for one file: its bytes as a stream (Weave checks them against the digest as they're saved), and
   * where they came from once it's done. It runs in a worker of its own and ends with the fetch.
   */
  async run(f: { fetcher: StoredFetcher; shipped: ShippedService }, input: FetchInput): Promise<{ body: ReadableStream<Uint8Array>; from: Promise<string> }> {
    const problem = shippedProblem(f.shipped);
    if (problem) throw new Error(problem);
    const dir = join(this.#home.dir, 'fetchers', f.fetcher.name);
    const entry = await prepareWasm(f.shipped.file, join(dir, 'wasm'));
    const key = `fetcher:${f.fetcher.name}:${randomBytes(4).toString('hex')}`;
    const manifest: AppManifest = f.shipped.manifest;
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) });
    this.#runtime.startWasm(
      key,
      {
        dir: join(dir, 'wasm'),
        entry,
        data: join(dir, 'data'),
        log: join(dir, 'fetcher.log'),
        name: f.fetcher.name,
        net: manifest.fetcher?.net ?? [],
        taskMs: FETCH_MS,
        host: (name, args) => {
          if (name === 'setting') return f.fetcher.settings[String(args[0])];
          if (name === 'log') return void appendFileSync(join(dir, 'fetcher.log'), `${String(args[0]).slice(0, 2000)}
`);
          if (name === 'write') return void controller.enqueue(new Uint8Array(args[0] as Uint8Array));
          throw new Error(`a fetcher has no ${name}`);
        },
      },
      // Ended (it crashed, or took too long): the fetch failed, and it isn't started again.
      () => {},
    );
    const from = this.#runtime
      .callWasm(key, 'fetch', [JSON.stringify(input)])
      .then(
        (said) => {
          controller.close();
          return String(said || f.fetcher.name);
        },
        (error: Error) => {
          controller.error(new Error(`${f.shipped.manifest.name}: ${error.message}`));
          throw error;
        },
      )
      .finally(() => this.#runtime.stop(key));
    from.catch(() => {});
    return { body, from };
  }
}
