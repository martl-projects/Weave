import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import createTestnet from 'hyperdht/testnet.js';
import { describe, expect, it } from 'vitest';
import { createIdentity, Replica } from '@weave/core';
import { authKey, StorageClient, SwarmNode, type TextSocket } from '@weave/net';
import { StorageNode, swarmNetwork } from '../src/storagenode.ts';

/** A storage node on a real DHT (a local testnet): it finds a space's peers by topic and collects, with hashes of the key only. */

async function until(ready: () => boolean, timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  while (!ready()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** Two ends of a socket in memory, for the account's first requests. */
function socketPair(): [TextSocket, TextSocket] {
  const make = () => ({ handle: undefined as ((text: string) => void) | undefined, early: [] as string[], closed: [] as Array<() => void> });
  const [a, b] = [make(), make()];
  const end = (mine: typeof a, other: typeof a): TextSocket => ({
    send: (text) => void setImmediate(() => (other.handle ? other.handle(text) : other.early.push(text))),
    close: () => [...mine.closed, ...other.closed].forEach((f) => f()),
    onMessage: (h) => {
      mine.handle = h;
      mine.early.splice(0).forEach(h);
    },
    onClose: (h) => void mine.closed.push(h),
  });
  return [end(a, b), end(b, a)];
}

describe('a storage node on the DHT', () => {
  it('finds the peers of a space and collects its events', { timeout: 60_000 }, async () => {
    const testnet = await createTestnet(3);
    const dir = mkdtempSync(join(tmpdir(), 'weave-storage-dht-'));
    const node = await StorageNode.open({ dir, network: swarmNetwork({ bootstrap: testnet.bootstrap }) });
    const key = new Uint8Array(32).fill(3);
    const replica = new Replica();
    const peer = new SwarmNode(replica, { bootstrap: testnet.bootstrap }, undefined, { spaces: () => [{ space: 'group:a', keys: [key] }] });
    try {
      const [ours, theirs] = socketPair();
      void node.accept(theirs);
      const client = await StorageClient.connect(ours);
      await client.register(createIdentity(), node.invite());
      await peer.join('climb-topic');
      replica.append2(createIdentity(), { kind: 'weave.msg', space: 'group:a', body: { text: 'collected' } });
      await client.hold([{ space: 'group:a', auths: [authKey(key)], topics: ['climb-topic'] }]);

      // What it collected on the DHT shows in a sync with a browser, which is on no DHT.
      const browser = new Replica();
      await client.sync(browser, { spaces: () => [{ space: 'group:a', keys: [key] }] });
      await until(() => browser.events((r) => r.scope === 'group:a').length === 1);
      expect((browser.events((r) => r.scope === 'group:a')[0].body as { text: string }).text).toBe('collected');
    } finally {
      await peer.destroy();
      await node.close();
      await testnet.destroy();
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });
});
