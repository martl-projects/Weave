import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, request, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import createTestnet, { type Testnet } from 'hyperdht/testnet.js';
import { loadConfig, resolveHome, saveConfig, WeaveNode, closeOpenStores } from '../src/index.ts';

/*
 * Always-on nodes (stage 18): a server or NAS paired with one of your computers keeps your spaces and hosts your
 * rooms while your computers are off. Its key may host rooms and nothing else; it can be revoked like an agent.
 */

const dirs: string[] = [];
afterAll(() => {
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'weave-alwayson-'));
  dirs.push(dir);
  return dir;
};
const sync = (from: WeaveNode, to: WeaveNode) => from.replica.events().forEach((e) => to.replica.ingest(e));

async function until<T>(get: () => Promise<T> | T, timeoutMs = 30_000): Promise<NonNullable<T>> {
  const start = Date.now();
  for (;;) {
    const value = await get();
    if (value) return value as NonNullable<T>;
    if (Date.now() - start > timeoutMs) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

const getText = (port: number) =>
  new Promise<string>((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path: '/', agent: false }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.end();
  });

describe('an always-on node', () => {
  let testnet: Testnet;
  let app: Server;
  let appPort: number;
  const nodes: WeaveNode[] = [];

  beforeAll(async () => {
    testnet = await createTestnet(3);
    app = createServer((_req, res) => res.end('the party app'));
    await new Promise<void>((resolve) => app.listen(0, '127.0.0.1', () => resolve()));
    appPort = (app.address() as { port: number }).port;
  });
  afterAll(async () => {
    for (const node of nodes) await node.close().catch(() => {});
    await new Promise<void>((resolve) => app.close(() => resolve()));
    await testnet.destroy();
  });

  function person(name: string): WeaveNode {
    const dir = tempDir();
    const node = WeaveNode.init(name, dir);
    const home = resolveHome(dir);
    node.config = { ...loadConfig(home), bootstrap: testnet.bootstrap };
    saveConfig(home, node.config);
    nodes.push(node);
    return node;
  }

  it('pairs without recovery words, keeps your spaces, hosts your rooms while you are away, and can be revoked', async () => {
    const martl = person('martl');
    const lena = person('Lena');
    await martl.createProject({ name: 'Party' });
    await lena.joinSpace(await martl.invite('Party'));
    sync(lena, martl);
    sync(martl, lena);
    await martl.say({ space: 'Party', text: 'see you saturday' });

    // On the server: a request. On martl's computer: the answer. On the server again: done.
    const boxDir = tempDir();
    const request = WeaveNode.nodeRequest(boxDir, 'party box');
    expect(request).toMatch(/^weave:node-request:/);
    const linked = await martl.linkNode({ request });
    expect(linked.name).toBe('party-box');
    await expect(martl.linkNode({ request })).rejects.toThrow(/linked already/);
    await expect(WeaveNode.completeNodeLink(linked.answer, tempDir())).rejects.toThrow(/no node request/);
    const box = await WeaveNode.completeNodeLink(linked.answer, boxDir);
    nodes.push(box);
    expect(box.identity.author).toBe(martl.identity.author);
    expect(box.config.archive).toBe(true);
    expect(box.config.bootstrap).toEqual(testnet.bootstrap);
    // Its key is among martl's keys, as a node, only for rooms.
    expect((await martl.keys()).find((k) => k.name === 'node:party-box')).toMatchObject({ role: 'agent', did: linked.key });
    expect(martl.replica.authority.grant(linked.key)?.permissions).toEqual(['weave.room', 'weave.room.*']);

    // It has martl's spaces and reads them.
    sync(martl, box);
    sync(lena, box);
    expect((await box.spaces()).map((s) => s.name)).toContain('Party');
    expect((await box.messages('Party')).map((m) => m.text)).toContain('see you saturday');
    // A space martl joins later reaches it through martl's devices.
    await martl.createGroup('Later');
    await martl.reconcile();
    sync(martl, box);
    await box.reconcile();
    expect((await box.spaces()).map((s) => s.name)).toContain('Later');

    // It can't speak for martl: what it writes beyond rooms, everyone else drops.
    await expect(box.say({ space: 'Party', text: 'written by the box' })).rejects.toThrow(/always-on node[^]*doesn't post/);
    sync(box, lena);
    expect((await lena.messages('Party')).map((m) => m.text)).not.toContain('written by the box');

    // martl's room service runs on the box: the room is opened on the computer and handed over, sealed.
    await box.goOnline();
    await lena.goOnline();
    await martl.addService({ builtin: 'website', node: 'party-box', spaces: ['Party'] });
    const hosted = await martl.openWebsite({ project: 'Party', name: 'Saturday', port: appPort });
    expect(hosted).toMatchObject({ open: false, offeredBy: { name: 'website' } });
    expect((await martl.services()).find((s) => s.name === 'website')).toMatchObject({ node: { name: 'party-box' }, websites: [{ name: 'Saturday', port: appPort, handler: { kind: 'address' } }] });
    // martl's computer is off; the box takes the room, announces it under the service's key, and Lena plays.
    sync(martl, box);
    await box.reconcile();
    sync(box, lena);
    const seen = await until(async () => (await lena.websites('Party')).find((r) => r.id === hosted.id));
    expect(seen).toMatchObject({ host: { did: martl.identity.author, name: 'martl' }, offeredBy: { name: 'website' } });
    await lena.visitWebsite(seen.id);
    const url = await until(async () => (await lena.websites('Party')).find((r) => r.id === hosted.id)?.url);
    expect(await getText(Number(new URL(url).port))).toBe('the party app');

    // Revoked from martl's computer: everyone sees its key end.
    await martl.revokeKey({ key: 'node:party-box' });
    sync(martl, lena);
    expect(lena.replica.authority.grant(linked.key)?.revokedAfter).toBeDefined();
  }, 120_000);
});
