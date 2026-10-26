import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, request, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import createTestnet, { type Testnet } from 'hyperdht/testnet.js';
import HyperDHT from 'hyperdht';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { b64u, canonicalJson, checksumAddress, sign, utf8, type Json, type RoomPages } from '@weave/core';
import { loadConfig, resolveHome, saveConfig, WeaveNode, closeOpenStores } from '../src/index.ts';

const dirs: string[] = [];
afterAll(() => {
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

/** A wallet as MetaMask & co. have one: an address, and personal_sign. */
function testWallet() {
  const secret = secp256k1.utils.randomSecretKey();
  const address = checksumAddress('0x' + bytesToHex(keccak_256(secp256k1.getPublicKey(secret, false).subarray(1)).subarray(12)));
  const sign = (message: string) => {
    const body = utf8ToBytes(message);
    const hash = keccak_256(new Uint8Array([...utf8ToBytes('\x19Ethereum Signed Message:\n' + body.length), ...body]));
    const sig = secp256k1.sign(hash, secret, { prehash: false, format: 'recovered' });
    return '0x' + bytesToHex(sig.subarray(1)) + (27 + sig[0]).toString(16);
  };
  return { address, sign };
}

async function until<T>(get: () => Promise<T> | T, timeoutMs = 30_000): Promise<NonNullable<T>> {
  const start = Date.now();
  for (;;) {
    const value = await get();
    if (value) return value as NonNullable<T>;
    if (Date.now() - start > timeoutMs) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** GET a path from a local port, answering with the body. */
const get = (port: number, path: string) =>
  new Promise<string>((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, headers: { host: `saturday-show.weave.localhost:${port}` } }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.end();
  });

describe('rooms of the room service', () => {
  let testnet: Testnet;
  let app: Server;
  let appPort: number;
  const nodes: WeaveNode[] = [];

  beforeAll(async () => {
    testnet = await createTestnet(3);
    // The "app": a tiny web server on the host's machine.
    app = createServer((req, res) => res.end(`hello from the host, you asked for ${req.url} on ${req.headers.host}`));
    await new Promise<void>((resolve) => app.listen(0, '127.0.0.1', () => resolve()));
    appPort = (app.address() as { port: number }).port;
  });

  afterAll(async () => {
    for (const node of nodes) await node.close();
    await new Promise<void>((resolve) => app.close(() => resolve()));
    await testnet.destroy();
  });

  function person(name: string): WeaveNode {
    const dir = mkdtempSync(join(tmpdir(), 'weave-rooms-'));
    dirs.push(dir);
    const node = WeaveNode.init(name, dir);
    const home = resolveHome(dir);
    node.config = { ...loadConfig(home), bootstrap: testnet.bootstrap };
    saveConfig(home, node.config);
    nodes.push(node);
    return node;
  }

  /** A room of the person's room service (added to the project first), answered by the test's web server. */
  async function openRoom(node: WeaveNode, project: string, input: { name: string; groups?: string[]; show?: string; pages?: RoomPages }) {
    const mine = (await node.services()).find((s) => s.builtin === 'room');
    if (!mine) await node.addService({ builtin: 'room', spaces: [project] });
    else await node.setService({ name: mine.name, spaces: [...mine.spaces.map((s) => s.id), project] });
    return node.openRoom({ project, port: appPort, ...input });
  }

  it('lets the members of a tier into a room meant for them', async () => {
    const martin = person('Martin');
    const lena = person('Lena');
    const kofi = person('Kofi');
    await martin.createProject({ name: 'Studio' });
    const tier = await martin.createTier({ name: 'Backstage' });
    await martin.inviteGroup({ project: 'Studio', group: tier.id });
    await lena.joinSpace(await martin.invite('Studio'));
    await kofi.joinSpace(await martin.invite('Studio'));
    const sync = async () => {
      for (let round = 0; round < 3; round++) {
        for (const a of [martin, lena, kofi]) for (const b of [martin, lena, kofi]) if (a !== b) a.replica.events().forEach((e) => b.replica.ingest(e));
        for (const n of [martin, lena, kofi]) await n.reconcile();
      }
    };
    await sync();
    await lena.requestMembership({ tier: tier.id }); // asking lets her node take the tier's keys
    await sync();
    await martin.grantMembership({ tier: tier.id, who: lena.identity.author, months: 1 });
    await sync();
    await martin.goOnline();
    await lena.goOnline();
    await kofi.goOnline();
    const hosted = await openRoom(martin, 'Studio', { name: 'Backstage live', groups: [tier.id], pages: { host: { path: '/host', label: 'Stage' }, joiner: { path: '/watch', label: 'Watch' } } });
    await sync();

    const forKofi = await until(async () => (await kofi.rooms('Studio')).find((r) => r.id === hosted.id));
    expect(forKofi.mayJoin).toBe(false);
    const forLena = await until(async () => (await lena.rooms('Studio')).find((r) => r.id === hosted.id && r.mayJoin));
    await lena.joinRoom(forLena.id);
    await until(async () => {
      const info = (await lena.rooms('Studio')).find((r) => r.id === hosted.id);
      return info?.connected && info.url ? info : undefined;
    });
  });

  it("lets only a show's ticket holders into its room, while the show is on", async () => {
    const martin = person('Martin');
    const lena = person('Lena');
    const kofi = person('Kofi');
    await martin.createProject({ name: 'Bühne' });
    await lena.joinSpace(await martin.invite('Bühne'));
    await kofi.joinSpace(await martin.invite('Bühne'));
    const sync = () => {
      for (let round = 0; round < 2; round++) for (const a of [martin, lena, kofi]) for (const b of [martin, lena, kofi]) if (a !== b) a.replica.events().forEach((e) => b.replica.ingest(e));
    };
    for (const node of [martin, lena, kofi]) {
      const w = testWallet();
      await node.linkWallet({ address: w.address, proof: w.sign(await node.walletMessage(w.address)) });
    }
    sync();
    const now = Date.now();
    const show = await martin.createShow({ name: 'Premiere', project: 'Bühne', starts: new Date(now + 30 * 60_000).toISOString(), ends: new Date(now + 3 * 3600_000).toISOString(), price: 1_000_000 });
    await martin.goOnline();
    await lena.goOnline();
    await kofi.goOnline();
    const hosted = await openRoom(martin, 'Bühne', { name: 'Premiere live', show: show.id, pages: { host: { path: '/host', label: 'Stage' }, joiner: { path: '/watch', label: 'Watch' } } });
    sync();

    // Lena buys a ticket; Kofi doesn't.
    martin.checkPayment = async () => ({ ok: true, from: (await lena.wallet())!.address, value: '1000000', months: 1 });
    await lena.buyTicket({ show: show.id, payment: '0x' + '1'.repeat(64) });
    sync();
    await martin.reconcile();
    sync();

    const forKofi = await until(async () => (await kofi.rooms('Bühne')).find((r) => r.id === hosted.id));
    expect(forKofi.mayJoin).toBe(false);
    await expect(kofi.joinRoom(hosted.id)).rejects.toThrow(/ticket holders/);
    const forLena = await until(async () => (await lena.rooms('Bühne')).find((r) => r.id === hosted.id && r.mayJoin));
    await lena.joinRoom(forLena.id);
    const connected = await until(async () => {
      const info = (await lena.rooms('Bühne')).find((r) => r.id === hosted.id);
      return info?.connected && info.url ? info : undefined;
    });
    expect(connected.url).toMatch(/\/watch$/);
  });

  it('shares the host app through an encrypted tunnel, with a room chat, and keeps outsiders out', async () => {
    const martin = person('Martin');
    const lena = person('Lena');
    await martin.createProject({ name: 'Gameshow' });
    await lena.joinSpace(await martin.invite('Gameshow'));
    await martin.goOnline();
    await lena.goOnline();

    const hosted = await openRoom(martin, 'Gameshow', { name: 'Saturday show', pages: { host: { path: '/host', label: 'Open stage' }, joiner: { path: '/play', label: 'Play' } } });
    expect(hosted).toMatchObject({ mine: true, offeredBy: { name: 'room' }, service: { label: 'Open stage', ready: true }, url: `http://localhost:${appPort}/host` });

    const seen = await until(async () => (await lena.rooms('Gameshow'))[0]);
    expect(seen).toMatchObject({ name: 'Saturday show', mayJoin: true, joined: false, service: { label: 'Play' } });
    await lena.joinRoom(seen.id);
    const connected = await until(async () => {
      const info = (await lena.rooms('Gameshow'))[0];
      return info.connected && info.url ? info : undefined;
    });
    expect(connected.url).toMatch(/^http:\/\/saturday-show\.weave\.localhost:\d+\/play$/);
    const localPort = Number(new URL(connected.url!).port);
    expect(await get(localPort, '/play')).toBe(`hello from the host, you asked for /play on saturday-show.weave.localhost:${localPort}`);
    expect((await martin.rooms('Gameshow'))[0].peers.map((p) => p.name).sort()).toEqual(['Lena', 'Martin']);

    await lena.sayInRoom({ room: seen.id, text: 'ready!' });
    await until(async () => (await martin.roomChat(hosted.id)).length === 1);
    await martin.sayInRoom({ room: hosted.id, text: 'go' });
    await until(async () => (await lena.roomChat(seen.id)).length === 2);
    expect((await lena.roomChat(seen.id)).map((m) => [m.by.name, m.text])).toEqual([
      ['Lena', 'ready!'],
      ['Martin', 'go'],
    ]);
    // Nothing of it is in anyone's logs.
    for (const node of [martin, lena]) expect(JSON.stringify(node.replica.events())).not.toContain('ready!');

    // The host's app stops: players stay connected but wait for it, with no address to open onto nothing.
    app.closeAllConnections();
    await new Promise<void>((resolve) => app.close(() => resolve()));
    const waiting = await until(async () => {
      const info = (await lena.rooms('Gameshow'))[0];
      return info.service?.ready === false ? info : undefined;
    });
    expect(waiting).toMatchObject({ connected: true });
    expect(waiting.url).toBeUndefined();
    await new Promise<void>((resolve) => app.listen(appPort, '127.0.0.1', () => resolve()));
    await until(async () => (await lena.rooms('Gameshow'))[0].url);

    // Someone who learned the room key but isn't in the project gets nothing through.
    const eve = WeaveNode.init('Eve', mkdtempSync(join(tmpdir(), 'weave-rooms-')));
    nodes.push(eve);
    const dht = new HyperDHT({ bootstrap: testnet.bootstrap });
    const socket = dht.connect(Buffer.from(roomKey(martin, hosted.id), 'hex'));
    const proof = { room: hosted.id, person: eve.identity.author, signer: eve.identity.did, key: socket.publicKey.toString('hex'), purpose: 'tunnel', time: new Date().toISOString() };
    socket.write(`${JSON.stringify({ proof, sig: b64u.encode(sign(utf8(canonicalJson(proof as unknown as Json)), eve.identity.keys.secretKey)) })}\nGET /play HTTP/1.0\r\n\r\n`);
    let leaked = '';
    socket.on('data', (c: Buffer) => (leaked += c));
    await new Promise<void>((resolve) => {
      socket.on('close', () => resolve());
      socket.on('error', () => resolve());
    });
    expect(leaked).toBe('');
    await dht.destroy();

    await martin.endRoom(hosted.id);
    expect(await martin.rooms('Gameshow')).toEqual([]);
    await until(async () => (await lena.rooms('Gameshow')).length === 0);
  }, 90_000);
});

/** The room's DHT key, read the way any participant can: from the decrypted announcement. */
function roomKey(node: WeaveNode, roomId: string): string {
  const item = node.replica.events().map((e) => node.itemFor(e)).find((i) => i?.kind === 'weave.room' && (i.body as { room?: string }).room === roomId);
  return (item!.body as { key: string }).key;
}
