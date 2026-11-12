import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import createTestnet, { type Testnet } from 'hyperdht/testnet.js';
import HyperDHT from 'hyperdht';
import { WebSocketServer } from 'ws';
import RelayedDHT, { relay } from '@hyperswarm/dht-relay';
import RelayStream from '@hyperswarm/dht-relay/ws';
import { b64u, canonicalJson, createIdentity, randomBytes, sign, utf8, type Json, type Room } from '@weave/core';
import { roomKeyPair } from '@weave/net';
import { LiveRooms, proofLine } from '../src/live.ts';
import { loadConfig, resolveHome, saveConfig, WeaveNode } from '../src/index.ts';

/*
 * A website through a storage node, end to end (docs/web-stage2.md, step 9): a browser has no DHT, so a relay carries
 * its connections, but the browser keeps its key and makes the Noise handshake itself (not custodial). The host is the
 * room code a computer runs today, and takes the browser's proof as it takes anyone's.
 */

describe("a website through a relay that can't read it", () => {
  let testnet: Testnet;
  let app: Server;
  let appPort: number;
  const closing: Array<() => unknown> = [];
  const dirs: string[] = [];

  beforeAll(async () => {
    testnet = await createTestnet(3);
    app = createServer((_req, res) => res.end('the party app'));
    await new Promise<void>((resolve) => app.listen(0, '127.0.0.1', () => resolve()));
    appPort = (app.address() as { port: number }).port;
  });
  afterAll(async () => {
    for (const close of closing.reverse()) await close();
    await new Promise<void>((resolve) => app.close(() => resolve()));
    await testnet.destroy();
    dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
  });

  it('opens a tunnel to the host, with a proof the host accepts', async () => {
    const host = createIdentity();
    const visitor = createIdentity();
    const seed = randomBytes(32);
    const room: Room = { id: 'saturday', host: host.author, name: 'Saturday', service: 'web', key: Buffer.from(roomKeyPair(seed).publicKey).toString('hex'), invite: 'participants', open: true, time: new Date().toISOString() };

    // The host: a computer's room code, on the DHT.
    const hostDht = new HyperDHT({ bootstrap: testnet.bootstrap });
    closing.push(() => hostDht.destroy());
    const live = new LiveRooms({
      dht: () => hostDht,
      signer: () => host,
      personOf: (signer) => (signer === visitor.did ? visitor.author : signer === host.did ? host.author : undefined),
      mayJoin: (_room, person) => person === visitor.author,
      servicePort: () => appPort,
      seed: () => seed,
      nameOf: () => undefined,
      changed: () => {},
    });
    closing.push(() => live.close());
    await live.host(room);

    // The storage node's relay.
    const relayDht = new HyperDHT({ bootstrap: testnet.bootstrap });
    closing.push(() => relayDht.destroy());
    const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
    closing.push(() => new Promise((resolve) => wss.close(resolve)));
    wss.on('connection', (socket) => relay(relayDht, new RelayStream(false, socket)));
    await new Promise((resolve) => wss.once('listening', resolve));

    // The browser: its DHT is the relay, its key stays here.
    const ws = new WebSocket(`ws://127.0.0.1:${(wss.address() as { port: number }).port}`);
    const dht = new RelayedDHT(new RelayStream(true, ws), { custodial: false });
    closing.push(() => dht.destroy());
    const socket = dht.connect(Buffer.from(room.key, 'hex'));
    const proof = { room: room.id, person: visitor.author, signer: visitor.did, key: Buffer.from(socket.publicKey).toString('hex'), purpose: 'tunnel', time: new Date().toISOString() };
    socket.write(`${JSON.stringify({ proof, sig: b64u.encode(sign(utf8(canonicalJson(proof as unknown as Json)), visitor.keys.secretKey)) })}\n`);
    socket.write('GET / HTTP/1.1\r\nHost: saturday\r\nConnection: close\r\n\r\n');
    const answer = await new Promise<string>((resolve, reject) => {
      let text = '';
      socket.on('data', (chunk: Buffer) => (text += chunk.toString('utf8')));
      socket.on('end', () => resolve(text));
      socket.on('close', () => resolve(text));
      socket.on('error', reject);
    });
    expect(answer).toMatch(/^HTTP\/1\.1 200/);
    expect(answer).toContain('the party app');
  }, 60_000);

  it("gives a browser's tab its pass from Weave, and the tab reaches the website with it", async () => {
    const person = (name: string) => {
      const dir = mkdtempSync(join(tmpdir(), 'weave-roomrelay-'));
      dirs.push(dir);
      const node = WeaveNode.init(name, dir);
      node.config = { ...loadConfig(resolveHome(dir)), bootstrap: testnet.bootstrap };
      saveConfig(resolveHome(dir), node.config);
      closing.push(() => node.close());
      return node;
    };
    const martl = person('martl');
    const lena = person('Lena');
    const mallory = person('Mallory');
    await martl.createProject({ name: 'Party' });
    await lena.joinSpace(await martl.invite('Party'));
    await martl.goOnline();
    await lena.goOnline();
    await martl.addService({ builtin: 'website', spaces: ['Party'] });
    const hosted = await martl.openWebsite({ project: 'Party', name: 'Saturday', port: appPort });
    const seen = await until(async () => (await lena.websites('Party')).find((w) => w.id === hosted.id));

    // The tab's own DHT, through a relay; Weave (Lena's node) signs its first lines for the tab's key.
    const relayDht = new HyperDHT({ bootstrap: testnet.bootstrap });
    closing.push(() => relayDht.destroy());
    const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
    closing.push(() => new Promise((resolve) => wss.close(resolve)));
    wss.on('connection', (socket) => relay(relayDht, new RelayStream(false, socket)));
    await new Promise((resolve) => wss.once('listening', resolve));
    const keyPair = HyperDHT.keyPair();
    const dht = new RelayedDHT(new RelayStream(true, new WebSocket(`ws://127.0.0.1:${(wss.address() as { port: number }).port}`)), { custodial: false, keyPair });
    closing.push(() => dht.destroy());
    await expect(lena.websitePass({ room: seen.id, key: 'not a key' })).rejects.toThrow(/connection's key/);
    await expect(mallory.websitePass({ room: seen.id, key: keyPair.publicKey.toString('hex') })).rejects.toThrow();
    // A pass for a visit Weave isn't there for after: it holds for hours, and says so.
    const pass = await lena.websitePass({ room: seen.id, key: keyPair.publicKey.toString('hex'), hours: 2 });
    expect(JSON.parse(pass.tunnel).proof.until).toBeDefined();

    const fetchWith = (line: string) => {
      const tunnel = dht.connect(Buffer.from(pass.key, 'hex'));
      tunnel.write(line);
      tunnel.write('GET / HTTP/1.1\r\nHost: saturday\r\nConnection: close\r\n\r\n');
      return new Promise<string>((resolve) => {
        let text = '';
        tunnel.on('data', (chunk: Buffer) => (text += chunk.toString('utf8')));
        tunnel.on('close', () => resolve(text));
        tunnel.on('error', () => resolve(text));
      });
    };
    expect(await fetchWith(pass.tunnel)).toContain('the party app');
    // Past its time, the host lets it in no more.
    const expired = proofLine({ id: pass.id } as never, lena.identity, keyPair.publicKey.toString('hex'), 'tunnel', new Date(Date.now() - 60_000).toISOString());
    expect(await fetchWith(expired)).not.toContain('the party app');
  }, 90_000);
});

async function until<T>(get: () => Promise<T | undefined>, timeoutMs = 30_000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await get();
    if (value) return value;
    if (Date.now() - start > timeoutMs) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
