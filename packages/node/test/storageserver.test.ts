import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Duplex } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { StorageNode } from '../src/storagenode.ts';
import { storageServer, type StorageServerOptions } from '../src/storageserver.ts';
import { acceptWebSocket } from '../src/websocket.ts';

/** What stands between a storage node and the open internet, over real sockets, and the frames of a WebSocket as a browser sends them. */

const ORIGIN = 'https://weave.example';
const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const clean of cleanups.splice(0)) await clean();
});

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as AddressInfo).port;
}

async function start(options: Partial<StorageServerOptions> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'weave-storage-server-'));
  const web = join(dir, 'web');
  mkdirSync(join(web, '.hidden'), { recursive: true });
  writeFileSync(join(web, 'index.html'), '<title>page</title>');
  writeFileSync(join(web, '.hidden', 'secret'), 'no');
  writeFileSync(join(dir, 'outside'), 'no');
  const node = await StorageNode.open({ dir: join(dir, 'node'), network: () => ({ join: async () => {}, leave: async () => {}, announce: () => {}, destroy: async () => {} }) });
  const server = storageServer(node, { origins: [ORIGIN], web, ...options });
  const port = await listen(server);
  cleanups.push(async () => {
    server.closeAllConnections();
    server.close();
    await node.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  return { port, node, dir };
}

/** Ask for a WebSocket: the status it gets, and the socket if it got one. */
function upgrade(port: number, headers: Record<string, string> = { origin: ORIGIN }, path = '/storage'): Promise<{ status: number; socket?: Duplex }> {
  return new Promise((resolve, reject) => {
    const req = request({ port, host: '127.0.0.1', path, headers: { connection: 'Upgrade', upgrade: 'websocket', 'sec-websocket-key': randomBytes(16).toString('base64'), 'sec-websocket-version': '13', ...headers } });
    req.on('upgrade', (res, socket) => {
      cleanups.push(() => void socket.destroy());
      resolve({ status: res.statusCode!, socket });
    });
    req.on('response', (res) => {
      res.resume();
      resolve({ status: res.statusCode! });
    });
    req.on('error', reject);
    req.end();
  });
}

const get = async (port: number, path: string) => {
  const res = await fetch(`http://127.0.0.1:${port}${path}`);
  return { status: res.status, text: await res.text() };
};

/** A path as it stands, unlike fetch's, which tidies it up. */
const rawGet = (port: number, path: string): Promise<number> =>
  new Promise((resolve, reject) => {
    const req = request({ port, host: '127.0.0.1', path }, (res) => {
      res.resume();
      resolve(res.statusCode!);
    });
    req.on('error', reject);
    req.end();
  });

describe('a storage node on the internet', { timeout: 20_000 }, () => {
  it('takes a socket from a page of its own origin, and no other', async () => {
    const { port } = await start();
    expect((await upgrade(port)).status).toBe(101);
    expect((await upgrade(port, { origin: 'https://elsewhere.example' })).status).toBe(403);
    expect((await upgrade(port, {})).status).toBe(403);
    expect((await upgrade(port, { origin: ORIGIN }, '/other')).status).toBe(404);
  });

  it('lets one address hold so many connections, and more again when one goes', async () => {
    const { port } = await start({ maxPerAddress: 2 });
    const first = await upgrade(port);
    await upgrade(port);
    expect((await upgrade(port)).status).toBe(429);
    first.socket!.destroy();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect((await upgrade(port)).status).toBe(101);
  });

  it('counts by the address its proxy names, not the proxy', async () => {
    const { port } = await start({ maxPerAddress: 1, behindProxy: true });
    expect((await upgrade(port, { origin: ORIGIN, 'x-forwarded-for': '203.0.113.1' })).status).toBe(101);
    expect((await upgrade(port, { origin: ORIGIN, 'x-forwarded-for': '203.0.113.2' })).status).toBe(101);
    expect((await upgrade(port, { origin: ORIGIN, 'x-forwarded-for': '203.0.113.1' })).status).toBe(429);
    // What the person put in front of the proxy's own entry counts for nothing.
    expect((await upgrade(port, { origin: ORIGIN, 'x-forwarded-for': '198.51.100.9, 203.0.113.1' })).status).toBe(429);
  });

  it('closes a connection that says nothing', async () => {
    const { port } = await start({ idleMs: 150 });
    const { socket } = await upgrade(port);
    const closed = new Promise<void>((resolve) => socket!.on('close', () => resolve()));
    socket!.resume();
    await closed;
  });

  it('serves the page and nothing beside it', async () => {
    const { port } = await start();
    expect(await get(port, '/')).toEqual({ status: 200, text: '<title>page</title>' });
    expect((await get(port, '/health')).text).toBe('ok\n');
    expect((await get(port, '/none.js')).status).toBe(404);
    expect(await rawGet(port, '/../outside')).toBe(404);
    expect(await rawGet(port, '/%2e%2e/outside')).toBe(404);
    expect(await rawGet(port, '/.hidden/secret')).toBe(404);
  });

  it('serves no files when it has none, and a closed door is still up', async () => {
    const { port } = await start({ web: undefined });
    expect((await get(port, '/')).status).toBe(404);
    expect((await get(port, '/health')).status).toBe(200);
  });

  it('takes an invitation made by another process while it runs', async () => {
    const { node, dir } = await start();
    const first = StorageNode.inviteIn(join(dir, 'node'));
    const second = node.invite();
    expect(first).not.toBe(second);
    const inFile = await import('node:fs').then((fs) => JSON.parse(fs.readFileSync(join(dir, 'node', 'invites.json'), 'utf8')) as string[]);
    expect(inFile).toHaveLength(2);
    expect(JSON.stringify(inFile)).not.toContain(first);
  });
});

/** A frame as a browser sends it: masked. */
function frame(opcode: number, payload: Buffer, fin = true): Buffer {
  const mask = randomBytes(4);
  const masked = Buffer.from(payload.map((byte, i) => byte ^ mask[i % 4]));
  const head = payload.length < 126 ? Buffer.from([(fin ? 0x80 : 0) | opcode, 0x80 | payload.length]) : payload.length < 65536 ? Buffer.from([(fin ? 0x80 : 0) | opcode, 0x80 | 126, payload.length >> 8, payload.length & 255]) : Buffer.concat([Buffer.from([(fin ? 0x80 : 0) | opcode, 0x80 | 127]), Buffer.from(new BigUint64Array([BigInt(payload.length)]).buffer).reverse()]);
  return Buffer.concat([head, mask, masked]);
}

async function echo(limits?: Parameters<typeof acceptWebSocket>[4]) {
  const heard: string[] = [];
  const server = createServer();
  server.on('upgrade', (req, socket, head) => void acceptWebSocket(req, socket, head, { message: (text) => heard.push(text), close: () => {} }, limits));
  const port = await listen(server);
  cleanups.push(() => {
    server.closeAllConnections();
    server.close();
  });
  const { socket } = await upgrade(port);
  return { heard, socket: socket! };
}

const until = async (ready: () => boolean) => {
  for (let i = 0; i < 400 && !ready(); i++) await new Promise((resolve) => setTimeout(resolve, 10));
  expect(ready()).toBe(true);
};

describe('the frames of a WebSocket', { timeout: 20_000 }, () => {
  it('puts a large message together from small pieces of the stream', async () => {
    const { heard, socket } = await echo();
    const text = 'ä'.repeat(300_000);
    const bytes = frame(1, Buffer.from(text));
    for (let at = 0; at < bytes.length; at += 40_000) socket.write(bytes.subarray(at, at + 40_000));
    await until(() => heard.length === 1);
    expect(heard[0]).toBe(text);
  });

  it('reads a header that comes byte by byte', async () => {
    const { heard, socket } = await echo();
    for (const byte of frame(1, Buffer.from('x'.repeat(300)))) {
      socket.write(Buffer.from([byte]));
      if (heard.length) break;
      await new Promise((resolve) => setImmediate(resolve));
    }
    await until(() => heard.length === 1);
    expect(heard[0]).toHaveLength(300);
  });

  it('reads several messages from one piece, and a message in several frames', async () => {
    const { heard, socket } = await echo();
    socket.write(Buffer.concat([frame(1, Buffer.from('one')), frame(1, Buffer.from('two ')  , false), frame(0, Buffer.from('halves')), frame(1, Buffer.from('three'))]));
    await until(() => heard.length === 3);
    expect(heard).toEqual(['one', 'two halves', 'three']);
  });

  it('ends a message that grows past the limit, in frames as well as in one', async () => {
    const { socket } = await echo();
    const closed = new Promise<void>((resolve) => socket.on('close', () => resolve()));
    socket.resume();
    const part = Buffer.alloc(600_000, 97);
    socket.write(Buffer.concat([frame(1, part, false), frame(0, part, false)]));
    await closed;
  });

  it('answers a ping, and stays while the other side speaks', async () => {
    const { heard, socket } = await echo({ idleMs: 300 });
    let closed = false;
    socket.on('close', () => (closed = true));
    socket.resume();
    for (let i = 0; i < 6; i++) {
      socket.write(frame(9, Buffer.from('hi')));
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(closed).toBe(false);
    socket.write(frame(1, Buffer.from('still here')));
    await until(() => heard.length === 1);
  });
});
