import { execFileSync, spawn } from 'node:child_process';
import { createServer, type AddressInfo, type Socket } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import createTestnet, { type Testnet } from 'hyperdht/testnet.js';
import { loadConfig, resolveHome, saveConfig, WeaveNode, type PostInfo } from '@weave/node';

/*
 * The phone app's worker, packed as on the phone and run on real Bare: it
 * pairs with a desktop node, uses it, comes back after a restart without a
 * new code, and notices when it's unpaired.
 */

const app = join(import.meta.dirname, '..');
/** The Bare binary itself, not its npm wrapper, so stopping it stops the worker. */
const bare = (createRequire(join(app, 'package.json'))('bare-runtime') as () => string)();
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
    expect(await phone.ask('pair', { link, phoneName: 'Pixel' })).toEqual({ name: 'Tester' });
    expect((await node.phones()).map((p) => p.name)).toEqual(['Pixel']);
    expect(await phone.ask('call', { method: 'whoami', args: [] })).toMatchObject({ name: 'Tester', did: node.identity.author });

    // Posting from the phone; the node's live events come back to it.
    const post = await phone.ask<PostInfo>('call', { method: 'submit', args: [{ space: 'Weave', board: 'ideas', title: 'From the phone app' }] });
    expect(post.title).toBe('From the phone app');
    await until(() => phone.said.find((m) => 'event' in m));
    await expect(phone.ask('call', { method: 'pairPhone', args: [] })).rejects.toThrow(/a phone can't do pairPhone/);

    // The app is closed and opened again: paired still, no new code.
    phone.stop();
    phone = await worker(phoneDir);
    expect(await phone.ask('state')).toEqual({ paired: true, name: 'Tester', connected: true });
    expect((await phone.ask<PostInfo[]>('call', { method: 'posts', args: [{ space: 'Weave', board: 'ideas' }] })).map((p) => p.title)).toEqual(['From the phone app']);

    // Unpaired on the computer: the phone hears the connection go and can't get back in.
    await node.unpairPhone((await node.phones())[0].key);
    await until(() => phone.said.find((m) => m.connected === false));
    await expect(phone.ask('call', { method: 'whoami', args: [] })).rejects.toThrow();

    // Forgetting the computer on the phone starts over.
    await phone.ask('forget');
    expect(await phone.ask('state')).toEqual({ paired: false, connected: false });
    phone.stop();
  }, 90_000);
});
