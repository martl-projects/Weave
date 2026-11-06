import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { b64u, createIdentity, Replica, spaceTopics } from '@weave/core';
import { authKey, duplexPair, PeerSession2, StorageClient, type HeldByNode, type SpaceAccess } from '@weave/net';
import type { WeaveNode } from '../src/index.ts';
import { StorageNode, type StorageNetwork } from '../src/storagenode.ts';
import { textSocket } from '../src/websocket.ts';
import { people, stored } from './helpers/people.ts';

/*
 * A storage node (docs/web-stage2.md): an account by invitation, a sealed box a new device finds with nothing but a
 * token, a space collected while the browser is away, a quota, and deleting everything. A real WebSocket, and a
 * stand-in for the DHT: `peers` are connected by hand.
 */

const { person } = people('storage');
const dirs: string[] = [];
const servers: Server[] = [];
const nodes: StorageNode[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    server.close();
  }
  for (const node of nodes.splice(0)) await node.close();
});
afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })));

const settle = (ms = 600) => new Promise((resolve) => setTimeout(resolve, ms));

interface Place {
  replica: Replica;
  access: SpaceAccess;
  joined: Set<string>;
}

async function start(dir = mkdtempSync(join(tmpdir(), 'weave-storage-')), quota?: number) {
  dirs.push(dir);
  const places: Place[] = [];
  const network = (replica: Replica, access: SpaceAccess): StorageNetwork => {
    const place: Place = { replica, access, joined: new Set() };
    places.push(place);
    return { join: async (t) => void place.joined.add(t), leave: async (t) => void place.joined.delete(t), announce: () => {}, destroy: async () => {} };
  };
  const node = await StorageNode.open({ dir, network, quota });
  nodes.push(node);
  const server = createServer((_req, res) => res.end());
  servers.push(server);
  server.on('upgrade', (req, socket, head) => void node.accept(textSocket(req, socket, head)!).catch(() => {}));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  const connect = async () => {
    const ws = new WebSocket(url);
    await new Promise<void>((resolve) => ws.addEventListener('open', () => resolve()));
    return StorageClient.connect({
      send: (text) => ws.send(text),
      close: () => ws.close(),
      onMessage: (handle) => ws.addEventListener('message', (e) => handle(String(e.data))),
      onClose: (handle) => ws.addEventListener('close', () => handle()),
    });
  };
  return { node, dir, places, connect };
}

/** What a person hands their storage node of one group: hashes of its keys, never the keys. */
function heldOf(node: WeaveNode, name: string): HeldByNode {
  const space = stored(node, name);
  const epochs = Object.keys(space.keys).map(Number).sort((a, b) => b - a);
  return { space: `group:${space.id}`, auths: epochs.map((e) => authKey(b64u.decode(space.keys[String(e)]))), topics: spaceTopics(space) };
}

/** A peer on the network meets the account's place. */
function meet(place: Place, peer: WeaveNode): () => void {
  const [sa, sb] = duplexPair();
  const left = new PeerSession2(place.replica, sa, { access: place.access });
  const right = new PeerSession2(peer.replica, sb, { access: peer.sessionAccess() });
  return () => (left.close(), right.close());
}

async function group(): Promise<[WeaveNode, WeaveNode]> {
  const [martl, lena] = [person('martl'), person('Lena')];
  await martl.createGroup('Climb');
  await lena.joinSpace(await martl.invite('Climb'));
  const [sa, sb] = duplexPair();
  const l = new PeerSession2(martl.replica, sa, { access: martl.sessionAccess() });
  const r = new PeerSession2(lena.replica, sb, { access: lena.sessionAccess() });
  await settle();
  l.close();
  r.close();
  return [martl, lena];
}

const TOKEN = new Uint8Array(32).fill(5);

describe('a storage node', { timeout: 60_000 }, () => {
  it('takes an account only with an invitation, once', async () => {
    const { node, connect } = await start();
    const client = await connect();
    await expect(client.register(createIdentity(), 'made-up')).rejects.toThrow('that invitation is not valid');
    const invite = node.invite();
    await client.register(createIdentity(), invite);
    const other = await connect();
    await expect(other.register(createIdentity(), invite)).rejects.toThrow('that invitation is not valid');
  });

  it('signs in only with the account key, on this very connection', async () => {
    const { node, connect } = await start();
    const account = createIdentity();
    await (await connect()).register(account, node.invite());
    await expect((await connect()).signIn(createIdentity())).rejects.toThrow('no such account');
    await (await connect()).signIn(account);
    await expect((await connect()).hold([])).rejects.toThrow('sign in first');
  });

  it('gives a new device its sealed box for a token, and nothing for another', async () => {
    const { node, connect } = await start();
    const account = createIdentity();
    const first = await connect();
    await first.register(account, node.invite());
    await first.putBox(TOKEN, 'sealed keys');
    const device = await connect();
    expect(await device.open(TOKEN)).toBe('sealed keys');
    expect(await device.open(new Uint8Array(32).fill(6))).toBeUndefined();
    await first.removeBox(TOKEN);
    expect(await device.open(TOKEN)).toBeUndefined();
  });

  it('closes a connection that keeps guessing', async () => {
    const { connect } = await start();
    const client = await connect();
    const guess = (n: number) => client.open(new Uint8Array(32).fill(n));
    for (let i = 0; i < 4; i++) await guess(i);
    await guess(4).catch(() => {});
    await expect(guess(5)).rejects.toThrow();
  });

  it('collects a space while the browser is away, unread, and hands it over', async () => {
    const [martl, lena] = await group();
    const { node, connect, places } = await start();
    const account = createIdentity();
    const client = await connect();
    await client.register(account, node.invite());
    await client.hold([heldOf(lena, 'Climb')]);
    expect(places[0].joined.size).toBeGreaterThan(0);
    client.close();

    await martl.say({ space: 'Climb', text: 'the rope is in the van' });
    const leave = meet(places[0], martl);
    await settle();
    leave();
    expect(JSON.stringify(places[0].replica.events())).not.toContain('rope');

    const back = await connect();
    await back.signIn(account);
    const session = await back.sync(lena.replica, lena.sessionAccess());
    await settle();
    session.close();
    expect((await lena.messages('Climb')).map((m) => m.text)).toContain('the rope is in the van');
  });

  it('comes back after a restart with its accounts, their boxes and their places', async () => {
    const [, lena] = await group();
    const first = await start();
    const account = createIdentity();
    const client = await first.connect();
    await client.register(account, first.node.invite());
    await client.hold([heldOf(lena, 'Climb')]);
    await client.putBox(TOKEN, 'sealed keys');
    client.close();
    await first.node.close();

    const again = await start(first.dir);
    expect(again.places[0].joined.size).toBeGreaterThan(0);
    expect(await (await again.connect()).open(TOKEN)).toBe('sealed keys');
    await (await again.connect()).signIn(account);
  });

  it('stops collecting over the quota, and shows nothing to peers', async () => {
    const [, lena] = await group();
    const { node, connect, places } = await start(undefined, 1);
    const client = await connect();
    await client.register(createIdentity(), node.invite());
    await client.hold([heldOf(lena, 'Climb')]);
    expect(await client.usage()).toMatchObject({ quota: 1, over: true });
    expect(places[0].access.spaces()).toEqual([]);
    expect(places[0].joined.size).toBe(0);
  });

  it('deletes an account and everything in it', async () => {
    const { node, dir, connect } = await start();
    const account = createIdentity();
    const client = await connect();
    await client.register(account, node.invite());
    await client.putBox(TOKEN, 'sealed keys');
    expect(readdirSync(join(dir, 'accounts'))).toHaveLength(1);
    await client.deleteAccount();
    expect(readdirSync(join(dir, 'accounts'))).toEqual([]);
    expect(existsSync(join(dir, 'invites.json'))).toBe(true);
    expect(await (await connect()).open(TOKEN)).toBeUndefined();
    await expect((await connect()).signIn(account)).rejects.toThrow('no such account');
  });
});
