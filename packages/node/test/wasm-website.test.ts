import { createHmac } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Socket } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import createTestnet, { type Testnet } from 'hyperdht/testnet.js';
import { startApi } from '../src/api.ts';
import { closeOpenStores, loadConfig, resolveHome, saveConfig, WeaveNode } from '../src/index.ts';
import { readSecretJson } from '../src/vault.ts';
import { buildComponent } from './helpers/components.ts';

/*
 * WebAssembly websites (W2): a game as a component, with Weave holding its players' connections. Weave serves its
 * files, accepts players' WebSockets, tells the game who each player is (as the website service vouches for them),
 * and passes on what they say; the game only handles that, and sends back. Nothing to install.
 */

const dirs: string[] = [];
const nodes: WeaveNode[] = [];
let testnet: Testnet;
let game: string;
const site = join(import.meta.dirname, 'helpers', 'wasm-site');
beforeAll(async () => {
  testnet = await createTestnet(3);
  game = await buildComponent(join(import.meta.dirname, 'helpers', 'wasm-game.js'), 'website');
}, 180_000);
afterAll(async () => {
  for (const node of nodes) await node.close().catch(() => {});
  await testnet.destroy();
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function person(name: string): WeaveNode {
  const dir = mkdtempSync(join(tmpdir(), 'weave-wasm-site-'));
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

const tokenOf = (node: WeaveNode, name: string) => readSecretJson<Array<{ name: string; token: string }>>(node.home, join(node.home.dir, 'services.json'))!.find((s) => s.name === name)!.token;

/** A player's connection, as a browser makes it: every message it gets, and sending. */
async function player(url: string): Promise<{ got: Array<Record<string, unknown>>; send(text: string): void; close(): void }> {
  const socket = new WebSocket(url);
  const got: Array<Record<string, unknown>> = [];
  socket.addEventListener('message', (e) => got.push(JSON.parse(String(e.data)) as Record<string, unknown>));
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve());
    socket.addEventListener('error', () => reject(new Error(`no connection to ${url}`)));
  });
  return { got, send: (text) => socket.send(text), close: () => socket.close() };
}

/** An upgrade to the game's socket with a given X-Weave-Person: whether it was taken (101) or turned away. */
function upgrade(port: number, person?: string): Promise<{ accepted: boolean; socket?: Socket }> {
  return new Promise((resolve) => {
    const req = request({ host: '127.0.0.1', port, path: '/weave/socket', headers: { connection: 'Upgrade', upgrade: 'websocket', 'sec-websocket-version': '13', 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==', ...(person ? { 'x-weave-person': person } : {}) } });
    req.on('upgrade', (_res, socket) => resolve({ accepted: true, socket }));
    req.on('error', () => resolve({ accepted: false }));
    req.on('close', () => resolve({ accepted: false }));
    req.end();
  });
}

/** X-Weave-Person as the website service makes it: who, and when, signed with the service's token. */
const vouch = (token: string, person: Record<string, unknown>, t = Math.floor(Date.now() / 1000)) => {
  const payload = Buffer.from(JSON.stringify({ ...person, t })).toString('base64url');
  return `${payload}.${createHmac('sha256', token).update(payload).digest('base64url')}`;
};

describe('WebAssembly websites', { timeout: 120_000 }, () => {
  it("serves a game's files and holds its players' connections: who each one is, what they say, and when they go", async () => {
    const martl = person('martl');
    await martl.createProject({ name: 'Club' });
    const api = await startApi(martl, 0, { service: (token) => martl.serviceGate(token) });
    martl.runServices({ port: api.port });
    try {
      await martl.addService({ builtin: 'website', spaces: ['Club'] });
      await expect(martl.addService({ name: 'nope', contract: { reads: 'nothing', writes: [], version: '1.0' }, site })).rejects.toThrow(/goes with a WebAssembly service/);
      const counter = await martl.addService({ name: 'counter', description: 'Counter', contract: { reads: 'nothing', writes: [], website: true, version: '1.0' }, spaces: ['Club'], wasm: game, site });
      expect(counter).toMatchObject({ wasm: game, site });

      // It runs, and serves itself as a website of Club: a port on this computer, like any other.
      const hosted = await vi.waitFor(
        async () => {
          const found = (await martl.websites('Club')).find((r) => r.name === 'Counter' && r.url);
          expect(found).toBeTruthy();
          return found!;
        },
        { timeout: 30_000, interval: 200 },
      );
      const port = Number(new URL(hosted.url!).port);
      expect(await (await fetch(`http://127.0.0.1:${port}/`)).text()).toContain('<h1>Counter</h1>');
      expect((await fetch(`http://127.0.0.1:${port}/../services.json`)).status).toBe(404);

      // martl's own browser (on this computer, through no tunnel): the host.
      const host = await player(`ws://127.0.0.1:${port}/weave/socket`);
      await vi.waitFor(() => expect(host.got[0]).toEqual({ hello: 'martl', host: true, member: true, count: 0 }), { timeout: 10_000 });
      host.send('inc');
      await vi.waitFor(() => expect(host.got).toContainEqual({ count: 1, by: 'martl' }), { timeout: 10_000 });

      // A visitor the website service vouches for: the game learns it's Lena, a member, not the host.
      const token = tokenOf(martl, 'counter');
      const lena = await upgrade(port, vouch(token, { did: 'did:key:z6MkLena', name: 'Lena', host: false, member: true, maintainer: false }));
      expect(lena.accepted).toBe(true);
      await vi.waitFor(() => expect(host.got).toContainEqual({ joined: 'Lena' }), { timeout: 10_000 });
      // Made up, or stale: turned away before the game hears of it.
      expect((await upgrade(port, vouch('not-the-token', { did: 'did:key:z6MkMallory', name: 'Mallory' }))).accepted).toBe(false);
      expect((await upgrade(port, vouch(token, { did: 'did:key:z6MkLena', name: 'Lena' }, Math.floor(Date.now() / 1000) - 3600))).accepted).toBe(false);
      lena.socket!.destroy();
      await vi.waitFor(() => expect(host.got).toContainEqual({ left: 'Lena' }), { timeout: 10_000 });

      // Its timer runs while someone is there; and it can hang up on a player.
      host.send('ticks');
      await vi.waitFor(() => expect(host.got.some((m) => typeof m.ticks === 'number' && m.ticks > 0)).toBe(true), { timeout: 10_000 });
      expect(readFileSync(join(martl.home.dir, 'services', 'counter', 'service.log'), 'utf8')).toMatch(/martl joined/);
      host.close();
    } finally {
      await martl.removeService('counter').catch(() => {});
      await api.close();
    }
  });

  it("is reached through the tunnel: a participant plays from their own node, known by name", async () => {
    const martl = person('martl');
    const lena = person('Lena');
    await martl.createProject({ name: 'Club' });
    await lena.joinSpace(await martl.invite('Club'));
    sync([martl, lena]);
    await martl.goOnline();
    await lena.goOnline();
    const api = await startApi(martl, 0, { service: (token) => martl.serviceGate(token) });
    martl.runServices({ port: api.port });
    try {
      await martl.addService({ builtin: 'website', spaces: ['Club'] });
      await martl.addService({ name: 'counter', description: 'Counter', contract: { reads: 'nothing', writes: [], website: true, version: '1.0' }, spaces: ['Club'], wasm: game, site });
      const hosted = await vi.waitFor(
        async () => {
          const found = (await martl.websites('Club')).find((r) => r.name === 'Counter' && r.url);
          expect(found).toBeTruthy();
          return found!;
        },
        { timeout: 30_000, interval: 200 },
      );
      const host = await player(`ws://127.0.0.1:${new URL(hosted.url!).port}/weave/socket`);
      sync([martl, lena]);
      await lena.visitWebsite(hosted.id);
      const url = await vi.waitFor(
        async () => {
          const room = (await lena.websites('Club')).find((r) => r.id === hosted.id);
          expect(room?.url).toBeTruthy();
          return room!.url!;
        },
        { timeout: 30_000, interval: 300 },
      );
      // Lena's browser, through her node and the tunnel: the page, then the game, which knows it's her.
      // (by its port: this test's fetch can't look up *.weave.localhost names the way browsers do)
      const local = Number(new URL(url).port);
      expect(await (await fetch(`http://127.0.0.1:${local}/`)).text()).toContain('<h1>Counter</h1>');
      const visitor = await player(`ws://127.0.0.1:${local}/weave/socket`);
      await vi.waitFor(() => expect(visitor.got[0]).toMatchObject({ hello: 'Lena', host: false, member: true }), { timeout: 15_000 });
      await vi.waitFor(() => expect(host.got).toContainEqual({ joined: 'Lena' }), { timeout: 15_000 });
      visitor.send('inc');
      await vi.waitFor(() => expect(host.got).toContainEqual({ count: 1, by: 'Lena' }), { timeout: 15_000 });
      visitor.close();
      host.close();
    } finally {
      await martl.removeService('counter').catch(() => {});
      await api.close();
    }
  });
});
