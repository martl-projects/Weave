import { build } from 'esbuild';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import type { Duplex } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { createIdentity, Replica } from '@weave/core';
import { MAX_FRAME_TEXT, PeerSession2, wsPeerStream, type HeldSpace, type TextSocket } from '@weave/net';
import { acceptWebSocket } from '../src/websocket.ts';

/*
 * Sync over a WebSocket (docs/web-stage2.md): a browser's node talks to its storage node as two nodes do on the DHT.
 * A real server and a real client here, on the same sessions the DHT runs.
 */

const servers: Server[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

/** A server's end of a WebSocket as a TextSocket: frames wait until someone listens. */
function serverSocket(req: Parameters<typeof acceptWebSocket>[0], socket: Duplex, head: Buffer): TextSocket {
  let handle: ((text: string) => void) | undefined;
  const early: string[] = [];
  const closed: Array<() => void> = [];
  const ws = acceptWebSocket(req, socket, head, {
    message: (text) => (handle ? handle(text) : early.push(text)),
    close: () => closed.forEach((listen) => listen()),
  })!;
  return {
    send: (text) => ws.send(text),
    close: () => ws.close(),
    onMessage: (h) => {
      handle = h;
      early.splice(0).forEach(h);
    },
    onClose: (h) => closed.push(h),
  };
}

/** The client's end, as a browser's WebSocket is. */
function clientSocket(ws: WebSocket): TextSocket {
  return {
    send: (text) => ws.send(text),
    close: () => ws.close(),
    onMessage: (handle) => ws.addEventListener('message', (e) => handle(String(e.data))),
    onClose: (handle) => ws.addEventListener('close', () => handle()),
  };
}

async function serve(onStream: (stream: Awaited<ReturnType<typeof wsPeerStream>>) => void): Promise<string> {
  const server = createServer((_req, res) => res.end());
  servers.push(server);
  server.on('upgrade', (req, socket, head) => {
    void wsPeerStream(serverSocket(req, socket, head), false).then(onStream, () => {});
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `ws://127.0.0.1:${(server.address() as AddressInfo).port}/`;
}

async function dial(url: string) {
  const ws = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve());
    ws.addEventListener('error', () => reject(new Error('no connection')));
  });
  return wsPeerStream(clientSocket(ws), true);
}

async function until(ready: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!ready()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const KEY = new Uint8Array(32).fill(7);
const SPACES: HeldSpace[] = [{ space: 'group:a', keys: [KEY] }];
const texts = (r: Replica) => r.events((e) => e.scope === 'group:a').map((e) => (e.body as { text?: string } | null)?.text);

describe('a peer connection over a WebSocket', () => {
  it('agrees on a hash both ends hold and no other connection has', async () => {
    const answered: Array<Awaited<ReturnType<typeof wsPeerStream>>> = [];
    const url = await serve((s) => answered.push(s));
    const [one, two] = [await dial(url), await dial(url)];
    await until(() => answered.length === 2);
    expect(one.isInitiator).toBe(true);
    expect(answered[0].isInitiator).toBe(false);
    expect([...answered.map((s) => Buffer.from(s.handshakeHash).toString('hex'))].sort()).toEqual([one, two].map((s) => Buffer.from(s.handshakeHash).toString('hex')).sort());
    expect(Buffer.from(one.handshakeHash).equals(Buffer.from(two.handshakeHash))).toBe(false);
    one.destroy();
    two.destroy();
  });

  it('syncs a space both hold, both ways and live, and not one only the other holds', async () => {
    const [browser, holder] = [new Replica(), new Replica()];
    const [me, you] = [createIdentity(), createIdentity()];
    browser.append2(me, { kind: 'weave.msg', space: 'group:a', body: { text: 'from the browser' } });
    holder.append2(you, { kind: 'weave.msg', space: 'group:a', body: { text: 'kept for you' } });
    browser.append2(me, { kind: 'weave.msg', space: 'group:b', body: { text: 'not shared' } });
    const url = await serve((stream) => new PeerSession2(holder, stream, { access: { spaces: () => SPACES } }));
    const session = new PeerSession2(browser, await dial(url), { access: { spaces: () => [...SPACES, { space: 'group:b', keys: [new Uint8Array(32).fill(9)] }] } });
    await until(() => texts(browser).length === 2 && texts(holder).length === 2);
    browser.append2(me, { kind: 'weave.msg', space: 'group:a', body: { text: 'live' } });
    await until(() => texts(holder).includes('live'));
    expect(holder.events((e) => e.scope === 'group:b')).toEqual([]);
    session.close();
  });

  it('carries a message larger than a frame, with characters split at no seam', async () => {
    const heard: string[] = [];
    const url = await serve((stream) => stream.on('data', (chunk: string) => void heard.push(chunk)));
    const stream = await dial(url);
    const long = `${'a'.repeat(MAX_FRAME_TEXT - 1)}😀${'é'.repeat(MAX_FRAME_TEXT * 2)}😀`;
    stream.write(long);
    await until(() => heard.join('').length === long.length, 15_000);
    expect(heard.join('') === long).toBe(true);
    expect(heard.length).toBeGreaterThan(2);
    stream.destroy();
  }, 30_000);

  it('turns away what speaks no hello', async () => {
    let failed: Error | undefined;
    const server = createServer((_req, res) => res.end());
    servers.push(server);
    server.on('upgrade', (req, socket, head) => {
      void wsPeerStream(serverSocket(req, socket, head), false).catch((e: Error) => (failed = e));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const ws = new WebSocket(`ws://127.0.0.1:${(server.address() as AddressInfo).port}/`);
    await new Promise<void>((resolve) => ws.addEventListener('open', () => resolve()));
    ws.send('hello?');
    await until(() => !!failed);
    expect(failed?.message).toBe('not a Weave connection');
  });

  it('bundles for a browser, without the DHT', async () => {
    const result = await build({ entryPoints: [join(import.meta.dirname, '..', '..', 'net', 'src', 'browser.ts')], bundle: true, platform: 'browser', format: 'esm', write: false, outdir: 'out', logLevel: 'silent', metafile: true });
    expect(result.errors).toEqual([]);
    const inputs = Object.keys(result.metafile.inputs).join('\n');
    expect(inputs).not.toMatch(/hyperswarm|hyperdht/);
  }, 60_000);
});
