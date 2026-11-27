import { spawn } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer, type AddressInfo, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildOwnWorker } from '../build-node.ts';

/*
 * The phone app's worker with a node of its own (worklet/own.ts), packed and run on real Bare, spoken to as the screen
 * speaks to it: from no account to one, the node's calls and events, and the same account after the app starts again.
 * Its DHT is one nobody answers at, so it stays off the public one.
 */

const app = join(import.meta.dirname, '..');
const bare = (createRequire(join(app, 'package.json'))('bare-runtime') as () => string)();
if (process.platform !== 'win32') chmodSync(bare, 0o755);
const dir = mkdtempSync(join(tmpdir(), 'weave-own-worker-'));
let packed: string;

async function worker() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const child = spawn(bare, [packed, String((server.address() as AddressInfo).port)], { stdio: ['ignore', 'inherit', 'inherit'] });
  const socket = await new Promise<Socket>((resolve) => server.once('connection', resolve));
  server.close();
  // Stopping the worker breaks the line off.
  socket.on('error', () => {});
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
  write({ op: 'start', dir, bootstrap: [{ host: '127.0.0.1', port: 9 }] });
  return {
    said,
    ask: <T = unknown>(op: string, fields: Record<string, unknown> = {}) =>
      new Promise<T>((resolve, reject) => {
        const id = next++;
        waiting.set(id, (message) => (typeof message.error === 'string' ? reject(new Error(message.error)) : resolve(message.result as T)));
        write({ id, op, ...fields });
      }),
    stop: () =>
      new Promise<void>((resolve) => {
        child.once('exit', () => resolve());
        child.kill();
      }),
  };
}

describe("the phone app's worker with a node of its own, on Bare", () => {
  beforeAll(async () => {
    packed = await buildOwnWorker({ test: true });
  }, 120_000);
  afterAll(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));

  it('makes an account, answers the screens, and has the account when the app starts again', async () => {
    let phone = await worker();
    expect(await phone.ask('state')).toEqual({ hasIdentity: false, connected: false });
    await expect(phone.ask('call', { method: 'whoami', args: [] })).rejects.toThrow(/no account yet/);
    await expect(phone.ask('call', { method: 'pairPhone', args: [] })).rejects.toThrow(/isn't on a phone/);

    const words = await phone.ask<string>('init', { name: 'Phone' });
    expect(words.trim().split(/\s+/)).toHaveLength(24);
    expect(await phone.ask('state')).toEqual({ hasIdentity: true, name: 'Phone', connected: true });
    await expect(phone.ask('init', { name: 'Again' })).rejects.toThrow(/has an account already/);
    expect(await phone.ask('call', { method: 'whoami', args: [] })).toMatchObject({ name: 'Phone' });
    expect(await phone.ask('call', { method: 'preferences', args: [] })).toEqual({});
    // No agent apps to add Weave to on a phone, whatever is on the computer the test runs on.
    expect(await phone.ask('call', { method: 'harnesses', args: [] })).toEqual({ offered: true, harnesses: [] });

    await phone.ask('call', { method: 'createGroup', args: ['Friends'] });
    await phone.ask('call', { method: 'say', args: [{ space: 'Friends', text: 'hello' }] });
    expect((await phone.ask<Array<{ text: string }>>('call', { method: 'messages', args: ['Friends'] })).map((m) => m.text)).toEqual(['hello']);
    // What happens on the node reaches the screen by itself.
    expect(phone.said.some((m) => (m.event as { kind?: string } | undefined)?.kind === 'weave.msg')).toBe(true);
    await phone.stop();

    phone = await worker();
    expect(await phone.ask('state')).toEqual({ hasIdentity: true, name: 'Phone', connected: true });
    expect((await phone.ask<Array<{ text: string }>>('call', { method: 'messages', args: ['Friends'] })).map((m) => m.text)).toEqual(['hello']);
    await phone.stop();
  }, 120_000);
});
