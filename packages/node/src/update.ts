import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { compareVersions } from '@weave/core';
import type { ArtifactRef, Releases } from './artifacts.ts';
import type { UpdateFile, UpdateReady, UpdateState } from './backend.ts';
import { readJson, writeJson } from './home.ts';

/*
 * Weave's own updates: a new version of the desktop app, fetched the way any project's release file is (a
 * maintainer's signed fingerprint, a provider's grant, Weave's own fetcher) and kept here until the app installs it.
 * The node downloads and checks; it never runs what it fetched. The app installs only what's here (electron-updater,
 * fed from the daemon's local API), so a GitHub account or a swapped file alone can't put a version on anyone's
 * computer: the SHA-256 has to be the one the maintainer signed.
 *
 *   updates/<version>/<file>       the installer for this computer, checked
 *   updates/<version>/ready.json   what the app needs to install it: its size and SHA-512 (electron-updater's), who delivered it
 */
export class Updates {
  #job?: { version: string; state: UpdateState };
  readonly #dir: () => string;
  readonly #releases: () => Releases;
  readonly #changed: () => void;

  /** `dir`: where updates are kept (<home>/updates); `releases`: what fetches release files; `changed`: tell watchers. */
  constructor(dir: () => string, releases: () => Releases, changed: () => void) {
    this.#dir = dir;
    this.#releases = releases;
    this.#changed = changed;
  }

  /** The one going on, or the newest one ready, or nothing. */
  state(): UpdateState {
    if (this.#job) return this.#job.state;
    const ready = this.ready();
    return ready ? { version: ready.version, state: 'ready', ready } : { state: 'idle' };
  }

  /** The newest version here, checked and whole. */
  ready(): UpdateReady | undefined {
    const versions = this.#versions().sort(compareVersions).reverse();
    for (const version of versions) {
      const ready = this.readyFor(version);
      if (ready) return ready;
    }
    return undefined;
  }

  /** This version, if it's here, checked and whole. */
  readyFor(version: string): UpdateReady | undefined {
    const folder = join(this.#dir(), version);
    const kept = readJson<UpdateReady>(join(folder, 'ready.json'));
    if (!kept || kept.version !== version) return undefined;
    const path = join(folder, kept.file);
    if (!existsSync(path) || statSync(path).size !== kept.size) return undefined;
    return { ...kept, path };
  }

  /** Versions no newer than the one running are of no use anymore: gone. */
  prune(current: string): void {
    for (const version of this.#versions()) if (compareVersions(version, current) <= 0 && this.#job?.version !== version) rmSync(join(this.#dir(), version), { recursive: true, force: true });
  }

  /**
   * Get this version's file for this computer: started unless it is already (or is here), older downloads cleared
   * out. Returns at once with how it's going; state() follows it.
   */
  fetch(version: string, a: ArtifactRef, file: UpdateFile): UpdateState {
    if (this.#job?.version === version) return this.#job.state;
    if (this.#job) throw new Error(`still getting Weave ${this.#job.version}`);
    const ready = this.readyFor(version);
    if (ready) return { version, state: 'ready', ready };
    // Afresh: what a broken-off download of this version left is no use.
    const folder = join(this.#dir(), version);
    rmSync(folder, { recursive: true, force: true });
    mkdirSync(folder, { recursive: true });
    const state: UpdateState = { version, state: 'downloading', done: 0, ...(file.size ? { total: file.size } : {}) };
    this.#job = { version, state };
    void this.#releases()
      .fetchFile(folder, a, { file: file.file, sha256: file.sha256, ...(file.size ? { size: file.size } : {}) }, (n) => {
        state.done = (state.done ?? 0) + n;
      })
      .then(async ({ path, by }) => {
        const size = statSync(path).size;
        const kept: UpdateReady = { version, file: file.file, path, size, sha512: await sha512Of(path), by };
        writeJson(join(folder, 'ready.json'), kept);
        // Checked and whole: older downloads are of no use anymore (a failed one leaves them, so the last good one stays).
        for (const other of this.#versions()) if (other !== version) rmSync(join(this.#dir(), other), { recursive: true, force: true });
        this.#job = undefined;
      })
      .catch((error: Error) => {
        rmSync(folder, { recursive: true, force: true });
        // Said the way it is: "the downloaded file isn't the one the project published …: not installed".
        this.#job = { version, state: { version, state: 'failed', error: error.message } };
      })
      .finally(() => this.#changed());
    return state;
  }

  /** Forget why the last one failed (to try again). */
  reset(): void {
    if (this.#job?.state.state === 'failed') this.#job = undefined;
  }

  #versions(): string[] {
    const dir = this.#dir();
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(d.name))
      .map((d) => d.name);
  }
}

/** A file's SHA-512 as electron-updater states it (base64), streamed. */
function sha512Of(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha512');
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('base64')));
  });
}

/**
 * The update feed electron-updater reads (latest.yml, latest-mac.yml, latest-linux.yml) for one checked file: what
 * electron-builder would have written, from the daemon instead. The file's address is its name, next to the feed.
 */
export function updateFeed(ready: UpdateReady): string {
  const quoted = (s: string) => `'${s.replaceAll("'", "''")}'`;
  return [`version: ${ready.version}`, 'files:', `  - url: ${quoted(ready.file)}`, `    sha512: ${ready.sha512}`, `    size: ${ready.size}`, `path: ${quoted(ready.file)}`, `sha512: ${ready.sha512}`, `releaseDate: ${quoted(new Date().toISOString())}`, ''].join('\n');
}
