import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import createTestnet from 'hyperdht/testnet.js';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { closeOpenStores, keepReconciling, StorageNode, swarmNetwork, textSocket, WeaveNode } from '@weave/node';
import { createAccount, storageLink } from '../src/account.ts';
import { useStorage } from '../src/host/net.ts';
import { openingFrom } from '../src/lock.ts';

/*
 * Friends through a contact link, with a browser on one side: on a DHT (a local testnet), a storage node meets a person
 * at their meeting point for the browser, which isn't on the DHT. The browser's node has the storage node for a network;
 * the others are on the DHT as they are.
 */

/** The replicas of nodes that go online through the storage node, as a browser's does. */
const throughStorage = new Set<unknown>();

vi.mock('@weave/net', async (original) => {
  const net = await original<typeof import('@weave/net')>();
  const { SwarmNode: ThroughStorage } = await import('../src/host/net.ts');
  class Either {
    constructor(...args: ConstructorParameters<typeof net.SwarmNode>) {
      return (throughStorage.has(args[0]) ? new ThroughStorage(...(args as ConstructorParameters<typeof ThroughStorage>)) : new net.SwarmNode(...args)) as unknown as Either;
    }
  }
  return { ...net, SwarmNode: Either };
});

const dirs: string[] = [];
const temp = (name: string) => {
  const dir = mkdtempSync(join(tmpdir(), `weave-web-${name}-`));
  dirs.push(dir);
  return dir;
};
afterAll(() => {
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
});

async function until(what: string, ready: () => boolean | Promise<boolean>, timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  while (!(await ready())) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

const knows = (node: WeaveNode, other: WeaveNode) => node.replica.events().some((e) => e.author === other.identity.author);

describe('friends through a contact link, from a browser', { timeout: 180_000 }, () => {
  it('meets a person at their meeting point, and they meet it at its own, and neither learns whom the other knows', async () => {
    const testnet = await createTestnet(3);
    const onDht = (name: string) => {
      const node = WeaveNode.init(name, temp(name));
      node.config = { ...node.config, bootstrap: testnet.bootstrap };
      return node;
    };
    const storage = await StorageNode.open({ dir: temp('storage'), network: swarmNetwork({ bootstrap: testnet.bootstrap }) });
    const server = createServer((_req, res) => res.end());
    server.on('upgrade', (req, socket, head) => void storage.accept(textSocket(req, socket, head)!).catch(() => {}));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/`;
    const [lena, bea] = [onDht('Lena'), onDht('Bea')];
    const dir = temp('web');
    const { node: web } = createAccount(dir, 'Webby', { id: 'passkey', opening: openingFrom(new Uint8Array(32).fill(1)) });
    // Its links name the network the others are on, as a browser's name the public one.
    web.config = { ...web.config, bootstrap: testnet.bootstrap };
    throughStorage.add(web.replica);
    // As their daemons and the browser's Worker do.
    const stops = [lena, bea, web].map((node) => keepReconciling(node, () => {}));
    try {
      await Promise.all([lena.goOnline(), bea.goOnline()]);
      useStorage(storageLink(dir, web, url, { invite: storage.invite() }));
      await web.goOnline();

      // Webby has a group with Bea, whom Lena doesn't know.
      await web.createGroup('Pack');
      await bea.joinSpace(await web.invite('Pack'));
      await until('Bea in the pack', async () => (await web.members('Pack')).length === 2);

      // Webby adds Lena by her link: the storage node looks her up, and Webby gets her name.
      await web.addContact(await lena.contactLink());
      await until('Lena, by name', () => web.nameOf(lena.identity.author) === 'Lena');
      await until('Lena hearing of Webby', () => knows(lena, web));

      // Lena adds Webby back: her node finds the storage node at Webby's own meeting point. They're friends.
      await lena.addContact(await web.contactLink());
      await until('friends', async () => (await web.social()).friends.some((p) => p.name === 'Lena') && (await lena.social()).friends.some((p) => p.name === 'Webby'), 90_000);

      // What came through the links is the person reached: not the others they know.
      expect(knows(lena, bea)).toBe(false);
    } finally {
      stops.forEach((stop) => stop());
      await web.close();
      await lena.close();
      await bea.close();
      server.closeAllConnections();
      server.close();
      await storage.close();
      await testnet.destroy();
    }
  });
});
