// How a storage node bears many accounts, on a local DHT testnet: node packages/node/test/storage-load.ts [accounts]
//
// Each account holds two spaces, as a person with a group or two would. It says how long the accounts took to come up,
// and what the process holds then: memory, and how many UDP sockets its DHT nodes have open.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import createTestnet from 'hyperdht/testnet.js';
import { b64u, createIdentity } from '@weave/core';
import { authKey, StorageClient, type TextSocket } from '@weave/net';
import { StorageNode, swarmNetwork } from '../src/index.ts';

const count = Number(process.argv[2] ?? 100);

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

const udpSockets = () => (process as unknown as { _getActiveHandles(): object[] })._getActiveHandles().filter((h) => h.constructor?.name === 'UDX' || h.constructor?.name === 'Socket').length;

const testnet = await createTestnet(3);
const dir = mkdtempSync(join(tmpdir(), 'weave-storage-load-'));
const before = process.memoryUsage().rss;
const offline = process.env.OFFLINE === '1';
const node = await StorageNode.open({ dir, network: offline ? Object.assign(() => ({ join: async () => {}, leave: async () => {}, announce: () => {}, destroy: async () => {} })) : swarmNetwork({ bootstrap: testnet.bootstrap }) });
const started = Date.now();
for (let i = 0; i < count; i++) {
  const [ours, theirs] = socketPair();
  void node.accept(theirs);
  const client = await StorageClient.connect(ours);
  await client.register(createIdentity(), node.invite());
  const spaces = [1, 2].map((n) => {
    const key = new Uint8Array(32).fill((i * 2 + n) % 255);
    return { space: `group:${b64u.encode(key.slice(0, 16))}${i}-${n}`, auths: [authKey(key)], topics: [`load-${i}-${n}`] };
  });
  await client.hold(spaces);
  client.close();
}
const ms = Date.now() - started;
const after = process.memoryUsage().rss;
console.log(JSON.stringify({ accounts: count, upMs: ms, msPerAccount: Math.round(ms / count), rssMB: Math.round(after / 1e6), perAccountKB: Math.round((after - before) / count / 1e3), handles: udpSockets() }));
await node.close();
await testnet.destroy();
rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
process.exit(0);
