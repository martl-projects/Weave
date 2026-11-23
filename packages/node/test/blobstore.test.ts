import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { blobHash } from '@weave/core';
import { BlobStore } from '../src/blobstore.ts';

const dirs: string[] = [];
const store = (): BlobStore => {
  const dir = mkdtempSync(join(tmpdir(), 'weave-blobs-'));
  dirs.push(dir);
  return new BlobStore(dir);
};
afterEach(() => {
  vi.useRealTimers();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('a blob asked of peers', () => {
  it('is kept when it comes after the wait ran out, and still asked for meanwhile', async () => {
    vi.useFakeTimers();
    const blobs = store();
    const data = new Uint8Array([1, 2, 3]);
    const hash = blobHash(data);
    const asked: string[][] = [];
    const failed = expect(blobs.fetch(hash, (hashes) => asked.push(hashes), 1000)).rejects.toThrow("couldn't get that file");
    await vi.advanceTimersByTimeAsync(1001);
    await failed;
    expect(asked).toEqual([[hash]]);
    // A peer that connects now is still asked, and what it sends is kept.
    expect(blobs.wanted()).toEqual([hash]);
    blobs.receive(hash, data);
    expect(blobs.has(hash)).toBe(true);
    expect(blobs.wanted()).toEqual([]);
    await expect(blobs.fetch(hash, () => asked.push(['again']))).resolves.toEqual(data);
    expect(asked).toHaveLength(1);
  });

  it('is not taken unasked, nor long after the wait ran out', async () => {
    vi.useFakeTimers();
    const blobs = store();
    const data = new Uint8Array([4, 5, 6]);
    const hash = blobHash(data);
    blobs.receive(hash, data);
    expect(blobs.has(hash)).toBe(false);
    const failed = expect(blobs.fetch(hash, () => {}, 1000)).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(1001);
    await failed;
    await vi.advanceTimersByTimeAsync(120_001);
    expect(blobs.wanted()).toEqual([]);
    blobs.receive(hash, data);
    expect(blobs.has(hash)).toBe(false);
  });
});
