import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { AppAsset, AppManifest } from '@weave/core';
import { platformKey, saveVerified, tagFolder, unpack } from './appinstall.ts';
import type { GitHub } from './github.ts';
import { writeJson } from './home.ts';
import type { Runtime } from './runtime.ts';

/*
 * Releases on this node: fetched from GitHub, refused unless they match the fingerprint their project published,
 * and unpacked, once per release and service (rooms of the same release share it). Whoever needs one asks with a
 * job name; the job says how far it got, or why it failed, until the release is here.
 */

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

  /** `services`: the folder services keep their files in; `github`: a client with this node's sign-in, if any. */
  constructor(services: () => string, github: () => GitHub, runtime: Runtime, changed: () => void) {
    this.#services = services;
    this.#github = github;
    this.#runtime = runtime;
    this.#changed = changed;
  }

  /** Download a release file into dir/<tag>, refuse it unless it matches the fingerprint published, unpack it: its folder. */
  async fetch(dir: string, app: AppManifest, release: { github: string; tag: string; asset: AppAsset }, job: InstallJob): Promise<string> {
    mkdirSync(dir, { recursive: true });
    const client = this.#github();
    const found = (await client.release(release.github, release.tag)).assets.find((a) => a.name === release.asset.file);
    if (!found) throw new Error(`the release ${release.tag} on GitHub has no file ${release.asset.file}`);
    const download = await client.download(release.github, found.id);
    const total = release.asset.size ?? download.size ?? found.size;
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
    if (!asset || !a.manifest.install?.github) {
      this.jobs.set(job, { error: `${a.manifest.name} ${a.tag} has no release file for this computer (${platformKey()})${a.manifest.install?.image ? ", and Docker isn't running here" : ''}` });
      return;
    }
    const progress: InstallJob = { progress: { state: 'downloading', done: 0, ...(asset.size ? { total: asset.size } : {}) } };
    this.jobs.set(job, progress);
    const fetched = (this.#fetching.get(folder) ?? this.fetch(dir, a.manifest, { github: a.manifest.install.github, tag: a.tag, asset }, progress).then(() => undefined)).finally(() => this.#fetching.delete(folder));
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
