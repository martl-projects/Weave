import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { blobHash, MAX_BLOB } from '@weave/core';
import type { BlobSource } from '@weave/net';

const HASH = /^[A-Za-z0-9_-]{43}$/;
/** How long a blob is still taken after the wait for it ran out, and of how many at most. */
const LATE_MS = 120_000;
const LATE_MAX = 256;

/**
 * Encrypted blobs on disk, one file per hash (see @weave/core blobs). Peers
 * may ask for any blob by hash; blobs we asked for are kept when they arrive.
 */
export class BlobStore implements BlobSource {
  readonly dir: string;
  /** Hash → callbacks of everyone waiting for it. */
  #waiting = new Map<string, Array<(data: Uint8Array) => void>>();
  /**
   * Hash → until when a blob nobody waits for any more is still taken: one that comes after its wait ran out (the
   * connection dropped and came back, or the node was busy) is kept, so the next one to ask has it at once.
   */
  #late = new Map<string, number>();

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
    if ((this.#waiting.has(hash) || this.#stillLate(hash)) && data.length <= MAX_BLOB && blobHash(data) === hash) {
      this.#late.delete(hash);
      this.put(data);
    }
  }

  #stillLate(hash: string): boolean {
    const until = this.#late.get(hash);
    if (until !== undefined && until <= Date.now()) this.#late.delete(hash);
    return this.#late.has(hash);
  }

  /** What we're after: asked of every peer that connects (those whose wait ran out a moment ago too). */
  wanted(): string[] {
    return [...new Set([...this.#waiting.keys(), ...[...this.#late.keys()].filter((hash) => this.#stillLate(hash))])];
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
        else {
          this.#waiting.delete(hash);
          if (this.#late.size >= LATE_MAX) this.#late.delete(this.#late.keys().next().value!);
          this.#late.set(hash, Date.now() + LATE_MS);
        }
        reject(new Error("couldn't get that file from anyone online right now"));
      }, timeoutMs);
      const first = !this.#waiting.has(hash);
      this.#waiting.set(hash, [...(this.#waiting.get(hash) ?? []), done]);
      if (first) ask([hash]);
    });
  }
}
