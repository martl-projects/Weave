import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import createTestnet, { type Testnet } from 'hyperdht/testnet.js';
import HyperDHT from 'hyperdht';
import { WebSocketServer } from 'ws';
import RelayedDHT, { relay } from '@hyperswarm/dht-relay';
import RelayStream from '@hyperswarm/dht-relay/ws';
import { b64u, canonicalJson, createIdentity, randomBytes, sign, utf8, type Json, type Room } from '@weave/core';
import { roomKeyPair } from '@weave/net';
import { LiveRooms } from '../src/live.ts';

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
});
