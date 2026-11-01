import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { blobHash, MAX_BLOB } from '@weave/core';
import type { BlobSource } from '@weave/net';

const HASH = /^[A-Za-z0-9_-]{43}$/;

/**
 * Encrypted blobs on disk, one file per hash (see @weave/core blobs). Peers
 * may ask for any blob by hash; blobs we asked for are kept when they arrive.
 */
export class BlobStore implements BlobSource {
  readonly dir: string;
  /** Hash → callbacks of everyone waiting for it. */
  #waiting = new Map<string, Array<(data: Uint8Array) => void>>();

  constructor(dir: string) {
    this.dir = dir;
  }

  #path(hash: string): string {
    if (!HASH.test(hash)) throw new Error('not a blob hash');
    return join(this.dir, hash);
  }

  has(hash: string): boolean {
    return HASH.test(hash) && existsSync(this.#path(hash));
  }

  get(hash: string): Uint8Array | undefined {
    return this.has(hash) ? new Uint8Array(readFileSync(this.#path(hash))) : undefined;
  }

  /** Keep a blob; returns its hash. */
  put(data: Uint8Array): string {
    if (data.length > MAX_BLOB) throw new Error('blob too large');
    const hash = blobHash(data);
    if (!this.has(hash)) {
      mkdirSync(this.dir, { recursive: true });
      const temp = `${this.#path(hash)}.tmp`;
      writeFileSync(temp, data);
      renameSync(temp, this.#path(hash));
    }
    for (const done of this.#waiting.get(hash) ?? []) done(data);
    this.#waiting.delete(hash);
    return hash;
  }

  /** Forget a blob: its file goes (nothing happens if it isn't here). */
  drop(hash: string): void {
    if (this.has(hash)) rmSync(this.#path(hash), { force: true });
  }

  receive(hash: string, data: Uint8Array): void {
    if (this.#waiting.has(hash) && data.length <= MAX_BLOB && blobHash(data) === hash) this.put(data);
  }

  wanted(): string[] {
    return [...this.#waiting.keys()];
  }

  /**
   * The blob, from disk or from peers: `ask` sends the request to whoever is
   * connected (peers connecting later are asked too). Rejects after the timeout.
   */
  fetch(hash: string, ask: (hashes: string[]) => void, timeoutMs = 20_000): Promise<Uint8Array> {
    const local = this.get(hash);
    if (local) return Promise.resolve(local);
    return new Promise((resolve, reject) => {
      const done = (data: Uint8Array) => {
        clearTimeout(timer);
        resolve(data);
      };
      const timer = setTimeout(() => {
        const rest = (this.#waiting.get(hash) ?? []).filter((d) => d !== done);
        if (rest.length) this.#waiting.set(hash, rest);
        else this.#waiting.delete(hash);
        reject(new Error("couldn't get that file from anyone online right now"));
      }, timeoutMs);
      const first = !this.#waiting.has(hash);
      this.#waiting.set(hash, [...(this.#waiting.get(hash) ?? []), done]);
      if (first) ask([hash]);
    });
  }
}
