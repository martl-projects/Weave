import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, request, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import createTestnet, { type Testnet } from 'hyperdht/testnet.js';
import HyperDHT from 'hyperdht';
import { b64u, canonicalJson, sign, utf8, type Json } from '@weave/core';
import { loadConfig, resolveHome, saveConfig, WeaveNode } from '../src/index.ts';

const dirs: string[] = [];
afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

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
    const req = request({ host: '127.0.0.1', port, path, headers: { host: `gameshow.weave.localhost:${port}` } }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.end();
  });

describe('rooms and shared apps', () => {
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

  it('shares the host app through an encrypted tunnel, with a room chat, and keeps outsiders out', async () => {
    const martin = person('Martin');
    const lena = person('Lena');
    await martin.createProject({ name: 'Gameshow' });
    await martin.publishApp({
      project: 'Gameshow',
      manifest: { app: 'gameshow', name: 'BAND AB!', services: [{ id: 'show', port: appPort, open: { host: { path: '/host', label: 'Open stage' }, joiner: { path: '/play', label: 'Play' } } }] },
    });
    await lena.joinSpace(await martin.invite('Gameshow'));
    await martin.goOnline();
    await lena.goOnline();

    const hosted = await martin.hostRoom({ project: 'Gameshow', name: 'Saturday show' });
    expect(hosted).toMatchObject({ mine: true, joined: true, service: { label: 'Open stage', ready: true }, url: `http://localhost:${appPort}/host` });

    const seen = await until(async () => (await lena.rooms('Gameshow'))[0]);
    expect(seen).toMatchObject({ name: 'Saturday show', mayJoin: true, joined: false, service: { label: 'Play' } });
    await lena.joinRoom(seen.id);
    const connected = await until(async () => {
      const info = (await lena.rooms('Gameshow'))[0];
      return info.connected && info.url ? info : undefined;
    });
    expect(connected.url).toMatch(/^http:\/\/gameshow\.weave\.localhost:\d+\/play$/);
    const localPort = Number(new URL(connected.url!).port);
    expect(await get(localPort, '/play')).toBe(`hello from the host, you asked for /play on gameshow.weave.localhost:${localPort}`);
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
