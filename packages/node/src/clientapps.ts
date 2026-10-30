import { join } from 'node:path';
import type { AppManifest } from '@weave/core';
import type { Home } from './home.ts';
import type { ArtifactRef, Releases } from './artifacts.ts';
import { digestOf, type ShippedService } from './shipped.ts';
import { readSecretJson, writeSecretJson } from './vault.ts';

/*
 * Client apps from releases: keyvaults and fetchers anyone released in a project, added by their person in Keys &
 * devices, beside the ones Weave ships. Each is approved once (its release's fingerprint, as a service's is) and its
 * component pinned to its digest then: changed after, it doesn't run. Weave runs them exactly as it runs its own, so
 * nothing those can do is Weave's alone.
 *
 *   clientapps.json (sealed)  [{name, kind, project, release, tag, manifest, approved, digest, file}]
 */

export interface StoredClientApp {
  /** Its name: its manifest's app. */
  name: string;
  kind: 'keyvault' | 'fetcher';
  /** The project that released it, its release's id and tag, and its manifest as released. */
  project: string;
  release: string;
  tag: string;
  manifest: AppManifest;
  /** What its person approved: the release's fingerprint. */
  approved: string;
  /** Its component's digest when it was added: what runs, and nothing else. */
  digest: string;
  file: string;
}

export class ClientApps {
  readonly #homeOf: () => Home;
  readonly #releases: () => Releases;

  constructor(home: () => Home, releases: () => Releases) {
    this.#homeOf = home;
    this.#releases = releases;
  }

  get #file(): string {
    return join(this.#homeOf().dir, 'clientapps.json');
  }

  list(): StoredClientApp[] {
    return readSecretJson<StoredClientApp[]>(this.#homeOf(), this.#file) ?? [];
  }

  #write(all: StoredClientApp[]): void {
    writeSecretJson(this.#homeOf(), this.#file, all);
  }

  /** Those of a kind, as the ones Weave ships are seen: their component, pinned to its digest. */
  asShipped(kind: StoredClientApp['kind']): ShippedService[] {
    return this.list()
      .filter((c) => c.kind === kind)
      .map((c) => ({ name: c.name, digest: c.digest, manifest: c.manifest, about: `${c.manifest.name} ${c.tag}, released in a project of yours: added by you`, file: c.file }));
  }

  /**
   * Add one from a release (approved, by its fingerprint): its component fetched as a service's release is (checked
   * against what was released), and pinned. Its name mustn't be one of Weave's own.
   */
  async add(input: { kind: StoredClientApp['kind']; artifact: ArtifactRef; approved: string; taken: Set<string> }): Promise<StoredClientApp> {
    const { artifact: a } = input;
    const name = a.manifest.app;
    if (input.taken.has(name)) throw new Error(`${name} is the name of one Weave ships: a release can't stand in for it`);
    if (!a.manifest.wasm) throw new Error(`${a.manifest.name} ${a.tag} isn't a WebAssembly component: Weave runs keyvaults and fetchers only as those`);
    const releases = this.#releases();
    const job = `client:${name}`;
    const folderOf = `client-${name}`;
    // Fetched (or there already), or why not: the job says.
    releases.ensure(folderOf, a, job, () => {});
    await releases.done(job);
    const failed = releases.jobs.get(job)?.error;
    if (failed) throw new Error(`${a.manifest.name} ${a.tag} couldn't be fetched: ${failed}`);
    const file = join(releases.folder(folderOf, a), a.manifest.wasm.component);
    const stored: StoredClientApp = { name, kind: input.kind, project: a.project, release: a.id, tag: a.tag, manifest: a.manifest, approved: input.approved, digest: digestOf(file), file };
    this.#write([...this.list().filter((c) => c.name !== name), stored]);
    return stored;
  }

  remove(name: string): void {
    this.#write(this.list().filter((c) => c.name !== name));
  }
}
