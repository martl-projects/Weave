import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import createTestnet, { type Testnet } from 'hyperdht/testnet.js';
import { createIdentity, Replica } from '@weave/core';
import { SwarmNode } from '../src/index.ts';

async function until(condition: () => boolean, timeoutMs = 20_000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe('SwarmNode over a local Hyperswarm testnet', () => {
  let testnet: Testnet;
  const nodes: SwarmNode[] = [];

  beforeAll(async () => {
    testnet = await createTestnet(3);
  });

  afterAll(async () => {
    for (const node of nodes) await node.destroy();
    await testnet.destroy();
  });

  it('finds peers through the DHT and converges three replicas', async () => {
    const people = [createIdentity(), createIdentity(), createIdentity()];
    const replicas = people.map(() => new Replica());
    for (const replica of replicas) {
      const node = new SwarmNode(replica, { bootstrap: testnet.bootstrap });
      nodes.push(node);
      await node.join('test-group');
    }

    people.forEach((person, i) => replicas[i].append(person, { kind: 'weave.post', body: `hello from ${i}` }));
    await until(() => replicas.every((r) => r.events().length === 3));

    expect(replicas[0].heads()).toEqual(replicas[2].heads());
  });
});
