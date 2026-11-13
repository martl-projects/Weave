import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import createTestnet, { type Testnet } from 'hyperdht/testnet.js';
import HyperDHT from 'hyperdht';
import RelayedDHT from '@hyperswarm/dht-relay';
import RelayStream from '@hyperswarm/dht-relay/ws';
import { b64u, canonicalJson, createIdentity, randomBytes, sign, utf8, type Json, type Room } from '@weave/core';
import { roomKeyPair, StorageClient } from '@weave/net';
import { LiveRooms } from '../src/live.ts';
import { StorageNode, swarmNetwork } from '../src/storagenode.ts';
import { storageServer } from '../src/storageserver.ts';

/*
 * A storage node's relay (docs/web-stage2.md, step 9): a signed-in account gets a ticket over its storage connection,
 * and with it, once, a relay to its websites' hosts. Nothing else of the DHT: nobody looks around it through here.
 */

const ORIGIN = 'https://web.example';

describe("a storage node's relay", () => {
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

  it('relays a signed-in account to a website, once per ticket, and nothing else', async () => {
    // A website, hosted by a computer.
    const host = createIdentity();
    const visitor = createIdentity();
    const seed = randomBytes(32);
    const room: Room = { id: 'saturday', host: host.author, name: 'Saturday', service: 'web', key: Buffer.from(roomKeyPair(seed).publicKey).toString('hex'), invite: 'participants', open: true, time: new Date().toISOString() };
    const hostDht = new HyperDHT({ bootstrap: testnet.bootstrap });
    closing.push(() => hostDht.destroy());
    const live = new LiveRooms({ dht: () => hostDht, signer: () => host, personOf: (signer) => (signer === visitor.did ? visitor.author : undefined), mayJoin: () => true, servicePort: () => appPort, seed: () => seed, nameOf: () => undefined, changed: () => {} });
    closing.push(() => live.close());
    await live.host(room);

    // The storage node, on the same DHT, with an account.
    const dir = mkdtempSync(join(tmpdir(), 'weave-storage-relay-'));
    dirs.push(dir);
    const network = swarmNetwork({ bootstrap: testnet.bootstrap });
    const node = await StorageNode.open({ dir, network });
    closing.push(async () => (await node.close(), await network.close?.()));
    const server = storageServer(node, { origins: [ORIGIN] });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    closing.push(() => (server.closeAllConnections(), server.close()));
    const at = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const socket = (path: string) => new WebSocket(`${at}${path}`, { headers: { origin: ORIGIN } } as unknown as string[]);
    const ws = socket('/storage');
    await new Promise((resolve) => ws.addEventListener('open', resolve));
    const client = await StorageClient.connect({ send: (text) => ws.send(text), close: () => ws.close(), onMessage: (handle) => ws.addEventListener('message', (e) => handle(String(e.data))), onClose: (handle) => ws.addEventListener('close', () => handle()) });
    closing.push(() => client.close());
    const account = createIdentity();
    await expect(client.relayTicket()).rejects.toThrow(/sign in first/);
    await client.register(account, node.invite());

    // Without a ticket, or with one used already: no relay.
    const refused = (path: string) => new Promise<boolean>((resolve) => {
      const s = socket(path);
      s.addEventListener('open', () => (s.close(), resolve(false)));
      s.addEventListener('error', () => resolve(true));
    });
    expect(await refused('/dht')).toBe(true);
    const ticket = await client.relayTicket();

    // With it: the browser's DHT is the relay, its key and its Noise handshake stay with it.
    const relayed = socket(`/dht?ticket=${ticket}`);
    const dht = new RelayedDHT(new RelayStream(true, relayed), { custodial: false });
    closing.push(() => dht.destroy());
    const tunnel = dht.connect(Buffer.from(room.key, 'hex'));
    const proof = { room: room.id, person: visitor.author, signer: visitor.did, key: Buffer.from(tunnel.publicKey).toString('hex'), purpose: 'tunnel', time: new Date().toISOString() };
    tunnel.write(`${JSON.stringify({ proof, sig: b64u.encode(sign(utf8(canonicalJson(proof as unknown as Json)), visitor.keys.secretKey)) })}\n`);
    tunnel.write('GET / HTTP/1.1\r\nHost: saturday\r\nConnection: close\r\n\r\n');
    const answer = await new Promise<string>((resolve) => {
      let text = '';
      tunnel.on('data', (chunk: Buffer) => (text += chunk.toString('utf8')));
      tunnel.on('close', () => resolve(text));
      tunnel.on('error', () => resolve(text));
    });
    expect(answer).toMatch(/^HTTP\/1\.1 200/);
    expect(answer).toContain('the party app');
    expect(await refused(`/dht?ticket=${ticket}`)).toBe(true);

    // A ticket for hours (a visit Weave hands over): good again for each connection.
    const lasting = await client.relayTicket(2);
    for (let i = 0; i < 2; i++) {
      const again = socket(`/dht?ticket=${lasting}`);
      expect(await new Promise<boolean>((resolve) => (again.addEventListener('open', () => (again.close(), resolve(true))), again.addEventListener('error', () => resolve(false))))).toBe(true);
    }
  }, 60_000);
});
