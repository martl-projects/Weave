import { mkdtempSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import createTestnet, { type Testnet } from 'hyperdht/testnet.js';
import { startApi } from '../src/api.ts';
import { closeOpenStores, loadConfig, resolveHome, saveConfig, WeaveNode } from '../src/index.ts';

/*
 * Rooms offered by services (block 3): a service whose contract offers a room serves its web page on a local port,
 * and its node offers it as a room in each of its projects, under the service's own key. Participants reach it from
 * their own nodes and the service knows who they are (weave.who); nobody else gets in.
 */

const dirs: string[] = [];
const nodes: WeaveNode[] = [];
let testnet: Testnet;
beforeAll(async () => {
  testnet = await createTestnet(3);
});
afterAll(async () => {
  for (const node of nodes) await node.close().catch(() => {});
  await testnet.destroy();
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function person(name: string): WeaveNode {
  const dir = mkdtempSync(join(tmpdir(), 'weave-service-rooms-'));
  dirs.push(dir);
  const node = WeaveNode.init(name, dir);
  node.config = { ...loadConfig(resolveHome(dir)), bootstrap: testnet.bootstrap };
  saveConfig(resolveHome(dir), node.config);
  nodes.push(node);
  return node;
}

const sync = (all: WeaveNode[]) => {
  for (let round = 0; round < 2; round++) for (const from of all) for (const to of all) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
};

const getJson = (url: string) =>
  new Promise<{ service: string; who: { did: string; name?: string } | null }>((resolve, reject) => {
    const { port, pathname } = new URL(url);
    const req = request({ host: '127.0.0.1', port: Number(port), path: pathname, agent: false }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve(JSON.parse(body)));
    });
    req.on('error', reject);
    req.end();
  });

describe('rooms offered by services', { timeout: 120_000 }, () => {
  it('offers a room under its own key; participants reach it and are known by name, nobody else gets in', async () => {
    const martl = person('martl');
    const lena = person('Lena');
    const kofi = person('Kofi');
    await martl.createProject({ name: 'Party' });
    await lena.joinSpace(await martl.invite('Party'));
    sync([martl, lena]);
    for (const node of [martl, lena, kofi]) await node.goOnline();
    const api = await startApi(martl, 0, { service: (token) => martl.serviceGate(token) });
    martl.runServices({ port: api.port });
    try {
      await martl.addService({
        name: 'board',
        description: 'A shared board',
        contract: { reads: 'addressed', writes: [], room: true, version: '1.0' },
        spaces: ['Party'],
        command: [process.execPath, join(import.meta.dirname, 'helpers', 'room-service.mjs')],
      });

      // The process says where its page is; martl's node offers it in Party, signed by "martl · board".
      const offered = await vi.waitFor(
        async () => {
          const room = (await martl.rooms('Party')).find((r) => r.offeredBy);
          expect(room?.mine).toBe(true);
          return room!;
        },
        { timeout: 20_000, interval: 300 },
      );
      expect(offered).toMatchObject({ name: 'board', host: { name: 'martl' }, offeredBy: { name: 'board' }, open: true });

      // Lena, a participant, joins it and the service knows it's her.
      sync([martl, lena]);
      const seen = (await lena.rooms('Party')).find((r) => r.id === offered.id)!;
      expect(seen).toMatchObject({ offeredBy: { name: 'board' }, mine: false, mayJoin: true });
      await lena.joinRoom(seen.id);
      const url = await vi.waitFor(
        async () => {
          const room = (await lena.rooms('Party')).find((r) => r.id === seen.id)!;
          expect(room.url).toBeTruthy();
          return room.url!;
        },
        { timeout: 30_000, interval: 300 },
      );
      expect(await getJson(url)).toEqual({ service: 'board', who: { did: lena.identity.author, name: 'Lena' } });

      // Kofi isn't in Party: he can't even see its rooms.
      await expect(kofi.joinRoom(seen.id)).rejects.toThrow();

      // Turned off: the room ends, for everyone.
      await martl.setService({ name: 'board', enabled: false });
      sync([martl, lena]);
      expect((await lena.rooms('Party')).find((r) => r.id === seen.id)?.open ?? false).toBe(false);
    } finally {
      await api.close();
    }
  });
});
