import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { AppAsset, AppManifest, Json } from '@weave/core';
import type { Fetchers } from './fetchers.ts';
import { platformKey, saveVerified, tagFolder, unpack } from './appinstall.ts';
import type { GitHub } from './github.ts';
import { writeJson } from './home.ts';
import type { Runtime } from './runtime.ts';
import { imageLocation, pullImage } from './registry.ts';

/*
 * Releases on this node: fetched, refused unless they match the fingerprint their project published, and
 * unpacked, once per release and service. A release is fetched from a provider in its project (a service that
 * offers artifact.fetch, like the GitHub service), or else straight from GitHub with this node's sign-in. Who
 * delivers doesn't matter: the file has to match. Whoever needs one asks with a job name; the job says how far it
 * got, or why it failed, until the release is here.
 */

/** Where a provider says a release file can be downloaded (artifact.fetch), or what it grants its fetcher. */
export interface Located {
  url?: string;
  /** A grant for the fetcher its contract names, which this node runs. */
  grant?: Json;
  fetcher?: string;
  /** The provider, for messages. */
  by: string;
}

/** A release as a service keeps it: pinned, with its manifest as released. */
export interface ArtifactRef {
  /** The project that released it. */
  project: string;
  /** The weave.app event of the release. */
  id: string;
  tag: string;
  manifest: AppManifest;
}

/** How fetching one goes: its progress, or why it failed. */
export interface InstallJob {
  progress?: { state: 'downloading' | 'unpacking'; done: number; total?: number };
  error?: string;
}

export class Releases {
  /** Jobs by name ("service:echo-bot", a room's id): how far each got, or why it failed (and nothing once done). */
  readonly jobs = new Map<string, InstallJob>();
  #waiting = new Map<string, Promise<void>>();
  /** Fetches going on, by folder: two jobs for the same release wait for the same download. */
  #fetching = new Map<string, Promise<void>>();
  readonly #services: () => string;
  readonly #github: () => GitHub;
  readonly #runtime: Runtime;
  readonly #changed: () => void;
  readonly #locate: (a: ArtifactRef, platform: string) => Promise<Located | undefined>;
  readonly #fetchFile: () => typeof fetch;
  readonly #registryFetch: () => typeof fetch;
  /** The fetchers its person added: they fetch what a provider grants. */
  fetchers?: Fetchers;

  /**
   * `services`: the folder services keep their files in; `github`: a client with this node's sign-in, if any;
   * `locate`: asks a provider in the release's project; `fetchFile`: downloads what a provider points at.
   */
  constructor(services: () => string, github: () => GitHub, runtime: Runtime, changed: () => void, locate: (a: ArtifactRef, platform: string) => Promise<Located | undefined>, fetchFile: () => typeof fetch, registryFetch: () => typeof fetch) {
    this.#registryFetch = registryFetch;
    this.#services = services;
    this.#github = github;
    this.#runtime = runtime;
    this.#changed = changed;
    this.#locate = locate;
    this.#fetchFile = fetchFile;
  }

  /** The release file, from a provider in its project, or straight from GitHub when there's none (or it can't). */
  async #download(a: ArtifactRef, asset: AppAsset): Promise<{ body: ReadableStream<Uint8Array>; size?: number; from: string }> {
    let refused: string | undefined;
    try {
      // Asked for the file it is: this computer's build, the wasm one, or the file itself.
      const platform = Object.entries(a.manifest.install?.assets ?? {}).find(([, x]) => x.file === asset.file)?.[0] ?? platformKey();
      const located = await this.#locate(a, platform);
      if (located?.fetcher) {
        // Its provider's fetcher, with what the provider granted: theirs to fetch, mine to check (the digest).
        if (!this.fetchers) throw new Error(`${located.by} hands it out through a fetcher, and this node runs none`);
        const found = this.fetchers.forProject(located.fetcher, a.project);
        if ('missing' in found) throw new Error(`${located.by} hands it out through a fetcher: this needs ${found.missing}`);
        const run = await this.fetchers.run(found, { grant: located.grant ?? null, artifact: { project: a.project, id: a.id, tag: a.tag, name: a.manifest.name }, asset: { file: asset.file, sha256: asset.sha256, ...(asset.size ? { size: asset.size } : {}) } });
        return { body: run.body, ...(asset.size ? { size: asset.size } : {}), from: `${found.shipped.manifest.name}, with what ${located.by} granted` };
      }
      if (located?.url) {
        const res = await this.#fetchFile()(located.url);
        if (res.ok && res.body) {
          const size = Number(res.headers.get('content-length'));
          return { body: res.body, ...(size > 0 ? { size } : {}), from: located.by };
        }
        refused = `${located.by} pointed at a download that answered ${res.status}`;
      }
    } catch (error) {
      refused = (error as Error).message;
    }
    const github = a.manifest.install?.github;
    if (!github) throw new Error(refused ?? `${a.manifest.name} ${a.tag} says nowhere to fetch it from`);
    try {
      const client = this.#github();
      const found = (await client.release(github, a.tag)).assets.find((x) => x.name === asset.file);
      if (!found) throw new Error(`the release ${a.tag} on GitHub has no file ${asset.file}`);
      const download = await client.download(github, found.id);
      return { ...download, ...(download.size ? {} : { size: found.size }), from: "GitHub, with this node's sign-in" };
    } catch (error) {
      throw new Error(refused ? `${refused}; and straight from GitHub: ${(error as Error).message}` : (error as Error).message);
    }
  }

  /** Download a release file into dir/<tag>, refuse it unless it matches the fingerprint published, unpack it: its folder. */
  async fetch(dir: string, a: ArtifactRef, asset: AppAsset, job: InstallJob): Promise<string> {
    mkdirSync(dir, { recursive: true });
    const release = { tag: a.tag, asset };
    const app = a.manifest;
    const download = await this.#download(a, asset);
    const total = release.asset.size ?? download.size;
    job.progress = { state: 'downloading', done: 0, ...(total ? { total } : {}) };
    const file = join(dir, `.download-${release.asset.file}`);
    await saveVerified(download.body, file, release.asset.sha256, (n) => {
      job.progress!.done += n;
    });
    job.progress = { state: 'unpacking', done: job.progress.done, ...(total ? { total } : {}) };
    const target = join(dir, tagFolder(release.tag));
    rmSync(target, { recursive: true, force: true });
    const root = unpack(file, target);
    rmSync(file, { force: true });
    // The folder holds the release: say so the way a checkout would, with its manifest.
    if (!existsSync(join(root, 'weave.app.json'))) writeJson(join(root, 'weave.app.json'), app);
    // Who delivered it, for the record: it matched the release either way.
    writeJson(join(dir, `${tagFolder(a.tag)}.from.json`), { from: download.from });
    return root;
  }

  /**
   * A file artifact, into dir: fetched unless it's there already and still matches its fingerprint. Its path, and who
   * delivered it.
   */
  async getFile(dir: string, a: ArtifactRef): Promise<{ path: string; by: string }> {
    const asset = a.manifest.install?.assets?.file;
    if (!asset) throw new Error(`${a.manifest.name} ${a.tag} is no file`);
    const path = join(dir, asset.file);
    if (existsSync(path) && createHash('sha256').update(readFileSync(path)).digest('hex') === asset.sha256) return { path, by: this.from(dir, a) ?? 'this computer, before' };
    mkdirSync(dir, { recursive: true });
    const download = await this.#download(a, asset);
    const partial = join(dir, `.download-${asset.file}`);
    await saveVerified(download.body, partial, asset.sha256);
    rmSync(path, { force: true });
    renameSync(partial, path);
    writeJson(join(dir, `.${asset.file}.from.json`), { from: download.from });
    return { path, by: download.from };
  }

  /** Fetch a release for a service unless it's here (or runs as a container), then go on. */
  ensure(service: string, a: ArtifactRef, job: string, then: () => void): void {
    const dir = join(this.#services(), service, 'artifacts', a.project);
    const folder = join(dir, tagFolder(a.tag));
    if (this.#runtime.runs(a.manifest) === 'container' || existsSync(folder)) return then();
    if (this.jobs.get(job)?.progress) return;
    // A WebAssembly service: its release file for wasm, or its image, pulled by Weave itself (no Docker).
    const wasm = this.#runtime.runs(a.manifest) === 'wasm';
    const asset = a.manifest.install?.assets?.[wasm ? 'wasm' : platformKey()];
    const image = wasm && !asset ? a.manifest.install?.image : undefined;
    if (!asset && !image) {
      this.jobs.set(job, { error: this.#runtime.whyNot(a.manifest) });
      return;
    }
    const progress: InstallJob = { progress: { state: 'downloading', done: 0, ...(asset?.size ? { total: asset.size } : {}) } };
    this.jobs.set(job, progress);
    const work = image ? this.#pull(dir, a, image) : this.fetch(dir, a, asset!, progress);
    const fetched = (this.#fetching.get(folder) ?? work.then(() => undefined)).finally(() => this.#fetching.delete(folder));
    this.#fetching.set(folder, fetched);
    const done = fetched.then(
      () => {
        this.jobs.delete(job);
        then();
      },
      (error: Error) => void this.jobs.set(job, { error: error.message }),
    );
    this.#waiting.set(job, done.finally(() => this.#changed()));
  }

  /** A WebAssembly service's image, unpacked into dir/<tag>: each layer checked against its digest (see pullImage). */
  async #pull(dir: string, a: ArtifactRef, image: { ref: string; digest: string }): Promise<void> {
    const target = join(dir, tagFolder(a.tag));
    const staging = `${target}.unpacking`;
    rmSync(staging, { recursive: true, force: true });
    try {
      await pullImage(image.ref, image.digest, staging, { fetch: this.#registryFetch() });
      if (!existsSync(join(staging, a.manifest.wasm!.component))) throw new Error(`${image.ref}@${image.digest.slice(0, 19)}… has no ${a.manifest.wasm!.component}`);
      rmSync(target, { recursive: true, force: true });
      renameSync(staging, target);
    } catch (error) {
      rmSync(staging, { recursive: true, force: true });
      throw error;
    }
    writeJson(join(dir, `${tagFolder(a.tag)}.from.json`), { from: `its image, ${imageLocation(image.ref).host}` });
  }

  /** Resolves when a job's fetch ends (for tests and the CLI). */
  async done(job: string): Promise<void> {
    await this.#waiting.get(job);
  }

  /** Who delivered a service's release here (or a file into its folder): a provider, or GitHub itself. */
  from(service: string, a: ArtifactRef): string | undefined {
    const asset = a.manifest.install?.assets?.file;
    const file = a.manifest.file && asset ? join(service, `.${asset.file}.from.json`) : join(this.#services(), service, 'artifacts', a.project, `${tagFolder(a.tag)}.from.json`);
    try {
      return (JSON.parse(readFileSync(file, 'utf8')) as { from?: string }).from;
    } catch {
      return undefined;
    }
  }

  /** Whether a service has this release here. */
  has(service: string, a: ArtifactRef): boolean {
    return existsSync(join(this.#services(), service, 'artifacts', a.project, tagFolder(a.tag)));
  }

  /** The folder a service's release was unpacked into: the one folder in it, usually. */
  folder(service: string, a: ArtifactRef): string {
    const dir = join(this.#services(), service, 'artifacts', a.project, tagFolder(a.tag));
    const entries = existsSync(dir) ? readdirSync(dir).filter((e) => !e.startsWith('.')) : [];
    return entries.length === 1 && statSync(join(dir, entries[0])).isDirectory() ? join(dir, entries[0]) : dir;
  }
}
