import { createDecipheriv, createECDH, createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createIdentity } from '@weave/core';
import { StorageClient } from '@weave/net';
import { PUSH_PER_SENDER, StorageNode, type StorageNetwork } from '../src/storagenode.ts';
import { textSocket } from '../src/websocket.ts';

/*
 * The relay of docs/web-push.md, stage 1: a browser's subscription in, an address out, and what senders push to it
 * reaching the push service encrypted to that browser. The push service here is a stand-in that keeps what it gets.
 */

const dirs: string[] = [];
const servers: Server[] = [];
const nodes: StorageNode[] = [];
afterAll(async () => {
  for (const server of servers) server.close();
  for (const node of nodes) await node.close();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/the-browser';

/** A browser: its push keys, and opening what the push service hands it (RFC 8291). */
function browser() {
  const ecdh = createECDH('prime256v1');
  const uaPublic = ecdh.generateKeys();
  const auth = randomBytes(16);
  const hmac = (key: Uint8Array, data: Uint8Array) => createHmac('sha256', key).update(data).digest();
  return {
    subscription: { endpoint: ENDPOINT, p256dh: uaPublic.toString('base64url'), auth: auth.toString('base64url') },
    open(body: Uint8Array): unknown {
      const b = Buffer.from(body);
      const salt = b.subarray(0, 16);
      const asPublic = b.subarray(21, 21 + b[20]);
      const ct = b.subarray(21 + b[20]);
      const prk = hmac(salt, hmac(hmac(auth, ecdh.computeSecret(asPublic)), Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])])));
      const decipher = createDecipheriv('aes-128-gcm', hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16), hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12));
      decipher.setAuthTag(ct.subarray(-16));
      const plain = Buffer.concat([decipher.update(ct.subarray(0, -16)), decipher.final()]);
      return JSON.parse(plain.subarray(0, -1).toString('utf8'));
    },
  };
}

async function start(status = 201) {
  const dir = mkdtempSync(join(tmpdir(), 'weave-push-'));
  dirs.push(dir);
  const got: Array<{ url: string; body: Uint8Array; auth: string }> = [];
  const fake = (async (url: string, init: RequestInit) => {
    got.push({ url, body: init.body as Uint8Array, auth: (init.headers as Record<string, string>).Authorization });
    return new Response(null, { status });
  }) as unknown as typeof fetch;
  const network = (): StorageNetwork => ({ join: async () => {}, leave: async () => {}, announce: () => {}, destroy: async () => {} });
  const node = await StorageNode.open({ dir, network, push: { subject: 'https://web.example', fetch: fake } });
  nodes.push(node);
  const server = createServer((_req, res) => res.end());
  servers.push(server);
  server.on('upgrade', (req, socket, head) => void node.accept(textSocket(req, socket, head)!).catch(() => {}));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  const connect = async () => {
    const ws = new WebSocket(url);
    await new Promise<void>((resolve) => ws.addEventListener('open', () => resolve()));
    return StorageClient.connect({ send: (t) => ws.send(t), close: () => ws.close(), onMessage: (h) => ws.addEventListener('message', (e) => h(String(e.data))), onClose: (h) => ws.addEventListener('close', () => h()) });
  };
  const account = createIdentity();
  const client = await connect();
  await client.register(account, node.invite());
  return { node, dir, client, got, connect, account };
}

describe('the push relay', { timeout: 30_000 }, () => {
  it('takes a subscription, gives an address, and pushes what a sender sealed to that browser alone', async () => {
    const { node, client, got } = await start();
    const key = await client.pushKey();
    expect(Buffer.from(key, 'base64url')).toHaveLength(65);
    const b = browser();
    const address = await client.pushSubscribe(b.subscription);
    expect(await client.pushSubscribe(b.subscription)).toBe(address);
    expect(await node.push(address, { from: 'did:key:sender', sealed: { epk: 'e', nonce: 'n', ct: 'sealed by the sender' } })).toBe('sent');
    expect(got).toHaveLength(1);
    expect(got[0].url).toBe(ENDPOINT);
    expect(got[0].auth).toContain(`k=${key}`);
    expect(b.open(got[0].body)).toEqual({ from: 'did:key:sender', sealed: { epk: 'e', nonce: 'n', ct: 'sealed by the sender' } });
    // And to itself, over its connection: a test, or its own node.
    await client.pushSelf(address, { hello: 1 });
    expect(b.open(got[1].body)).toEqual({ from: expect.stringMatching(/^did:key:/), sealed: { hello: 1 } });
    expect(await node.push('no-such-address', { from: 'x', sealed: {} })).toBe('unknown');
  });

  it('posts to push services only, never to an address of its own network', async () => {
    const { client } = await start();
    await expect(client.pushSubscribe({ ...browser().subscription, endpoint: 'https://169.254.169.254/latest/meta-data' })).rejects.toThrow("that isn't a browser's push subscription");
    await expect(client.pushSubscribe({ ...browser().subscription, endpoint: 'http://fcm.googleapis.com/x' })).rejects.toThrow("that isn't a browser's push subscription");
  });

  it('holds a sender to its limit, and others still get through', async () => {
    const { node, client, got } = await start();
    const address = await client.pushSubscribe(browser().subscription);
    for (let i = 0; i < PUSH_PER_SENDER; i++) expect(await node.push(address, { from: 'did:key:loud', sealed: {} })).toBe('sent');
    expect(await node.push(address, { from: 'did:key:loud', sealed: {} })).toBe('limit');
    expect(await node.push(address, { from: 'did:key:quiet', sealed: {} })).toBe('sent');
    expect(got).toHaveLength(PUSH_PER_SENDER + 1);
  });

  it('drops an address when asked, and when the push service says the browser is gone; keeps them across a restart', async () => {
    const { node, client, dir } = await start();
    const address = await client.pushSubscribe(browser().subscription);
    await client.pushDrop(address);
    expect(await node.push(address, { from: 'x', sealed: {} })).toBe('unknown');

    const gone = await start(410);
    const lost = await gone.client.pushSubscribe(browser().subscription);
    expect(await gone.node.push(lost, { from: 'x', sealed: {} })).toBe('failed');
    expect(await gone.node.push(lost, { from: 'x', sealed: {} })).toBe('unknown');

    const kept = await client.pushSubscribe(browser().subscription);
    await node.close();
    const again = await StorageNode.open({ dir, network: () => ({ join: async () => {}, leave: async () => {}, announce: () => {}, destroy: async () => {} }), push: { subject: 'https://web.example', fetch: (async () => new Response(null, { status: 201 })) as unknown as typeof fetch } });
    nodes.push(again);
    expect(await again.push(kept, { from: 'x', sealed: {} })).toBe('sent');
  });
});
