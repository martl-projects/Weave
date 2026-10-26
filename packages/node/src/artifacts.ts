import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { AppAsset, AppManifest } from '@weave/core';
import { platformKey, saveVerified, tagFolder, unpack } from './appinstall.ts';
import type { GitHub } from './github.ts';
import { writeJson } from './home.ts';
import type { Runtime } from './runtime.ts';

/*
 * Releases on this node: fetched, refused unless they match the fingerprint their project published, and
 * unpacked, once per release and service. A release is fetched from a provider in its project (a service that
 * offers artifact.fetch, like the GitHub service), or else straight from GitHub with this node's sign-in. Who
 * delivers doesn't matter: the file has to match. Whoever needs one asks with a job name; the job says how far it
 * got, or why it failed, until the release is here.
 */

/** Where a provider says a release file can be downloaded (artifact.fetch). */
export interface Located {
  url: string;
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
  readonly #locate: (a: ArtifactRef) => Promise<Located | undefined>;
  readonly #fetchFile: () => typeof fetch;

  /**
   * `services`: the folder services keep their files in; `github`: a client with this node's sign-in, if any;
   * `locate`: asks a provider in the release's project; `fetchFile`: downloads what a provider points at.
   */
  constructor(services: () => string, github: () => GitHub, runtime: Runtime, changed: () => void, locate: (a: ArtifactRef) => Promise<Located | undefined>, fetchFile: () => typeof fetch) {
    this.#services = services;
    this.#github = github;
    this.#runtime = runtime;
    this.#changed = changed;
    this.#locate = locate;
    this.#fetchFile = fetchFile;
  }

  /** The release file, from a provider in its project, or straight from GitHub when there's none (or it can't). */
  async #download(a: ArtifactRef, asset: AppAsset): Promise<{ body: ReadableStream<Uint8Array>; size?: number }> {
    let refused: string | undefined;
    try {
      const located = await this.#locate(a);
      if (located) {
        const res = await this.#fetchFile()(located.url);
        if (res.ok && res.body) {
          const size = Number(res.headers.get('content-length'));
          return { body: res.body, ...(size > 0 ? { size } : {}) };
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
      return { ...download, ...(download.size ? {} : { size: found.size }) };
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
    return root;
  }

  /** Fetch a release for a service unless it's here (or runs as a container), then go on. */
  ensure(service: string, a: ArtifactRef, job: string, then: () => void): void {
    const dir = join(this.#services(), service, 'artifacts', a.project);
    const folder = join(dir, tagFolder(a.tag));
    if (this.#runtime.runs(a.manifest) === 'container' || existsSync(folder)) return then();
    if (this.jobs.get(job)?.progress) return;
    const asset = a.manifest.install?.assets?.[platformKey()];
    if (!asset) {
      this.jobs.set(job, { error: this.#runtime.whyNot(a.manifest) });
      return;
    }
    const progress: InstallJob = { progress: { state: 'downloading', done: 0, ...(asset.size ? { total: asset.size } : {}) } };
    this.jobs.set(job, progress);
    const fetched = (this.#fetching.get(folder) ?? this.fetch(dir, a, asset, progress).then(() => undefined)).finally(() => this.#fetching.delete(folder));
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

  /** Resolves when a job's fetch ends (for tests and the CLI). */
  async done(job: string): Promise<void> {
    await this.#waiting.get(job);
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
