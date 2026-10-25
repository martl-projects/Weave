import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import Hyperswarm from 'hyperswarm';
import createTestnet, { type Testnet } from 'hyperdht/testnet.js';
import { createIdentity, Replica } from '@weave/core';
import { PeerSession, SwarmNode, topicFor, type HeldSpace } from '../src/index.ts';

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

  it('hands a space only to peers that hold it, over real connections', async () => {
    const key = randomBytes(32);
    const held: HeldSpace[] = [{ space: 'group:g', keys: [key] }];
    const people = [createIdentity(), createIdentity(), createIdentity()];
    const replicas = people.map(() => new Replica());
    const access = [held, held, []];
    for (const [i, replica] of replicas.entries()) {
      const node = new SwarmNode(replica, { bootstrap: testnet.bootstrap }, undefined, { spaces: () => access[i] });
      nodes.push(node);
      await node.join('test-members');
    }
    replicas[0].append2(people[0], { kind: 'weave.msg', space: 'group:g', body: { text: 'members only' } });
    replicas[0].append2(people[0], { kind: 'weave.msg', space: 'public', body: { text: 'for all' } });
    await until(() => replicas[1].events((r) => r.scope === 'group:g').length === 1 && replicas[2].events((r) => r.scope === 'public').length === 1);
    expect(replicas[2].events((r) => r.scope === 'group:g')).toHaveLength(0);
  });

  it('gives a v0.3 peer the v1 logs and takes nothing from it', async () => {
    const me = createIdentity();
    const replica = new Replica();
    replica.append(me, { kind: 'weave.msg', body: { text: 'please update' } });
    replica.append2(me, { kind: 'weave.msg', space: 'public', body: { text: 'v2 only' } });
    const node = new SwarmNode(replica, { bootstrap: testnet.bootstrap });
    nodes.push(node);
    await node.join('test-old');

    // A v0.3 node: Hyperswarm with the v0.3 session.
    const oldPerson = createIdentity();
    const old = new Replica();
    old.append(oldPerson, { kind: 'weave.post', body: 'from v0.3' });
    const swarm = new Hyperswarm({ bootstrap: testnet.bootstrap });
    swarm.on('connection', (socket) => new PeerSession(old, socket));
    try {
      await swarm.join(topicFor('test-old'), { server: true, client: true }).flushed();
      await until(() => old.events((r) => r.author === me.did).length === 1);
      expect(old.events((r) => r.author === me.did).map((r) => r.body)).toEqual([{ text: 'please update' }]);
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(replica.events((r) => r.author === oldPerson.did)).toHaveLength(0);
    } finally {
      await swarm.destroy();
    }
  });
});
