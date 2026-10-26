import { execFileSync, spawn } from 'node:child_process';
import { createServer, type AddressInfo, type Socket } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import { chmodSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import createTestnet, { type Testnet } from 'hyperdht/testnet.js';
import { loadConfig, resolveHome, saveConfig, WeaveNode, type PostInfo, type RoomInfo } from '@weave/node';

/*
 * The phone app's worker, packed as on the phone and run on real Bare: it
 * pairs with a desktop node, uses it, comes back after a restart without a
 * new code, and notices when it's unpaired; and it opens a room's app on
 * the phone, through the computer.
 */

const app = join(import.meta.dirname, '..');
/** The Bare binary itself, not its npm wrapper, so stopping it stops the worker. */
const bare = (createRequire(join(app, 'package.json'))('bare-runtime') as () => string)();
// npm unpacks it without the execute bit on Linux and macOS (spawn fails with EACCES there).
if (process.platform !== 'win32') chmodSync(bare, 0o755);
const dirs: string[] = [];
const temp = (prefix: string) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
};

/** The worker, with a way to ask it things and to wait for what it says by itself. */
async function worker(dir: string) {
  // The worker connects back to this test over local TCP (bare-kit's IPC on a phone).
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const child = spawn(bare, [join(app, 'dist/worklet/test.cjs'), String((server.address() as AddressInfo).port)], { stdio: ['ignore', 'inherit', 'inherit'] });
  const socket = await new Promise<Socket>((resolve) => server.once('connection', resolve));
  server.close();
  const said: Array<Record<string, unknown>> = [];
  const waiting = new Map<number, (message: Record<string, unknown>) => void>();
  let next = 1;
  let buffer = '';
  socket.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
    let end: number;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const message = JSON.parse(buffer.slice(0, end)) as Record<string, unknown>;
      buffer = buffer.slice(end + 1);
      if (typeof message.id === 'number') waiting.get(message.id)?.(message);
      else said.push(message);
    }
  });
  const write = (message: unknown) => socket.write(`${JSON.stringify(message)}\n`);
  write({ op: 'start', dir });
  return {
    said,
    ask: <T = unknown>(op: string, fields: Record<string, unknown> = {}) =>
      new Promise<T>((resolve, reject) => {
        const id = next++;
        waiting.set(id, (m) => (typeof m.error === 'string' ? reject(new Error(m.error)) : resolve(m.result as T)));
        write({ id, op, ...fields });
      }),
    stop: () => {
      socket.destroy();
      child.kill();
    },
  };
}

/**
 * Ask again when the connection through the DHT timed out: on a busy machine (CI) the test network can be too
 * slow for one attempt, as on a phone with a weak signal, where the person tries again.
 */
async function patiently<T>(ask: () => Promise<T>, tries = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await ask();
    } catch (error) {
      if (attempt >= tries || !/timed out/i.test((error as Error).message)) throw error;
    }
  }
}

async function until<T>(get: () => T, timeoutMs = 20_000): Promise<NonNullable<T>> {
  const start = Date.now();
  for (;;) {
    const value = get();
    if (value) return value as NonNullable<T>;
    if (Date.now() - start > timeoutMs) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

describe('the phone app worker on Bare', () => {
  let testnet: Testnet;
  let node: WeaveNode;

  beforeAll(async () => {
    execFileSync(process.execPath, ['build.ts', '--test'], { cwd: app });
    testnet = await createTestnet(3);
    const dir = temp('weave-mobile-node-');
    node = WeaveNode.init('Tester', dir);
    node.config = { ...loadConfig(resolveHome(dir)), bootstrap: testnet.bootstrap };
    saveConfig(resolveHome(dir), node.config);
    await node.goOnline();
    await node.createProject({ name: 'Weave' });
  });

  afterAll(async () => {
    await node.close();
    await testnet.destroy();
    dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
  });

  it('pairs from a code, uses the node, reconnects after a restart and notices being unpaired', async () => {
    const phoneDir = temp('weave-mobile-phone-');
    let phone = await worker(phoneDir);
    expect(await phone.ask('state')).toEqual({ paired: false, connected: false });
    await expect(phone.ask('call', { method: 'whoami', args: [] })).rejects.toThrow(/not paired/);
    await expect(phone.ask('pair', { link: 'weave:phone:nonsense', phoneName: 'Pixel' })).rejects.toThrow(/damaged/);

    const { link } = await node.pairPhone();
    expect(await patiently(() => phone.ask('pair', { link, phoneName: 'Pixel' }))).toEqual({ name: 'Tester' });
    expect((await node.phones()).map((p) => p.name)).toEqual(['Pixel']);
    expect(await patiently(() => phone.ask('call', { method: 'whoami', args: [] }))).toMatchObject({ name: 'Tester', did: node.identity.author });

    // Posting from the phone; the node's live events come back to it.
    const post = await phone.ask<PostInfo>('call', { method: 'submit', args: [{ space: 'Weave', board: 'ideas', title: 'From the phone app' }] });
    expect(post.title).toBe('From the phone app');
    await until(() => phone.said.find((m) => 'event' in m));
    await expect(phone.ask('call', { method: 'pairPhone', args: [] })).rejects.toThrow(/a phone can't do pairPhone/);

    // The app is closed and opened again: paired still, no new code.
    phone.stop();
    phone = await worker(phoneDir);
    // Reconnecting takes a moment (longer on a busy machine): wait for it rather than expect it at once.
    await vi.waitFor(async () => expect(await phone.ask('state')).toEqual({ paired: true, name: 'Tester', connected: true }), { timeout: 20_000, interval: 200 });
    expect((await patiently(() => phone.ask<PostInfo[]>('call', { method: 'posts', args: [{ space: 'Weave', board: 'ideas' }] }))).map((p) => p.title)).toEqual(['From the phone app']);

    // Unpaired on the computer: the phone hears the connection go and can't get back in.
    await node.unpairPhone((await node.phones())[0].key);
    await until(() => phone.said.find((m) => m.connected === false));
    await expect(phone.ask('call', { method: 'whoami', args: [] })).rejects.toThrow();

    // Forgetting the computer on the phone starts over.
    await phone.ask('forget');
    expect(await phone.ask('state')).toEqual({ paired: false, connected: false });
    phone.stop();
  }, 90_000);

  it("serves a room its computer joined on a local port, through the computer", async () => {
    // Someone else hosts the room, with the project's app on their computer.
    const app = createHttpServer((req, res) => res.end(`a horse race, at ${req.url}`));
    await new Promise<void>((resolve) => app.listen(0, '127.0.0.1', resolve));
    const hostDir = temp('weave-mobile-host-');
    const host = WeaveNode.init('Lena', hostDir);
    host.config = { ...loadConfig(resolveHome(hostDir)), bootstrap: testnet.bootstrap };
    saveConfig(resolveHome(hostDir), host.config);
    try {
      await host.createProject({ name: 'Pferderennen' });
      await node.joinSpace(await host.invite('Pferderennen'));
      await host.goOnline();
      await host.addService({ builtin: 'room', spaces: ['Pferderennen'] });
      const hosted = await host.openRoom({ project: 'Pferderennen', name: 'Derby', port: (app.address() as AddressInfo).port, pages: { joiner: { path: '/play', label: 'Play' } } });

      const phone = await worker(temp('weave-mobile-phone-'));
      const { link } = await node.pairPhone();
      await patiently(() => phone.ask('pair', { link, phoneName: 'iPhone' }));
      await vi.waitFor(async () => expect((await patiently(() => phone.ask<RoomInfo[]>('call', { method: 'rooms', args: ['Pferderennen'] }))).length).toBeGreaterThan(0), { timeout: 20_000, interval: 200 });
      await expect(phone.ask('openRoom', { room: hosted.id })).rejects.toThrow(/no address/);
      await patiently(() => phone.ask('call', { method: 'joinRoom', args: [hosted.id] }));
      let room: RoomInfo | undefined;
      await vi.waitFor(async () => {
        room = (await phone.ask<RoomInfo[]>('call', { method: 'rooms', args: ['Pferderennen'] }))[0];
        expect(room.url).toBeTruthy();
      }, { timeout: 30_000, interval: 200 });

      // The phone's own address for it: the computer's port where it's free, and the path players open.
      const local = await patiently(() => phone.ask<string>('openRoom', { room: room!.id, url: room!.url }));
      expect(local).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/play$/);
      expect(await phone.ask('openRoom', { room: room!.id, url: room!.url })).toBe(local);
      // The first request may find the computer's way to the room not up yet (a slow test network): like a browser reload, ask again.
      await vi.waitFor(async () => expect(await (await fetch(local)).text()).toBe('a horse race, at /play'), { timeout: 30_000, interval: 500 });

      // Forgetting the computer closes it.
      await phone.ask('forget');
      await expect(fetch(local)).rejects.toThrow();
      phone.stop();
    } finally {
      await host.close();
      app.close();
    }
  }, 90_000);
});
