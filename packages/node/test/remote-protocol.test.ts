import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { RemoteLink, serveRemote, serveRemoteOverWebSocket } from '../src/remote.ts';
import type { FeedItem, RpcMethod } from '../src/backend.ts';

async function until(ready: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!ready()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/*
 * The remote protocol apart from its transport (docs/node-split.md, step 10):
 * what a phone or a browser says and hears, carried here by nothing but a
 * pair of arrays. The DHT carrier is covered by remote.test.ts.
 */

function pair() {
  const sent: Array<Record<string, unknown>> = [];
  const calls: Array<{ method: RpcMethod; args: unknown[] }> = [];
  let push: ((item: FeedItem) => void) | undefined;
  let watching: AbortSignal | undefined;
  const host = {
    call: async (method: RpcMethod, args: unknown[]) => {
      calls.push({ method, args });
      if (method === 'whoami') return { name: 'martl', args };
      if (method === 'say') throw new Error('nothing to say');
      return undefined;
    },
    watch: (onItem: (item: FeedItem) => void, signal: AbortSignal) => {
      push = onItem;
      watching = signal;
      return new Promise<void>(() => {});
    },
  };
  let ended = false;
  const link = new RemoteLink((text) => sent.push(JSON.parse(text) as Record<string, unknown>), () => (ended = true));
  const stop = serveRemote(host, link);
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  return { sent, calls, link, stop, host, tick, push: (item: FeedItem) => push?.(item), watching: () => watching, ended: () => ended };
}

describe('the remote protocol on any carrier', () => {
  it('answers calls by id, with undefined arguments restored and results that are never undefined', async () => {
    const p = pair();
    p.link.receive(JSON.stringify({ id: 1, method: 'whoami', args: [null, 'x'] }));
    await p.tick();
    expect(p.calls).toEqual([{ method: 'whoami', args: [undefined, 'x'] }]);
    expect(p.sent).toEqual([{ id: 1, result: { name: 'martl', args: [null, 'x'] } }]);
    p.link.receive(JSON.stringify({ id: 2, method: 'feed' }));
    await p.tick();
    expect(p.sent[1]).toEqual({ id: 2, result: null });
  });

  it('refuses what a phone may not do, translates old names, and passes errors on with their names', async () => {
    const p = pair();
    p.link.receive(JSON.stringify({ id: 1, method: 'keys' }));
    p.link.receive(JSON.stringify({ id: 2, method: 'exportSpace', args: ['x'] }));
    p.link.receive(JSON.stringify({ id: 3, method: 'rooms' }));
    p.link.receive(JSON.stringify({ id: 4, method: 'say', args: [{ text: '' }] }));
    await p.tick();
    expect(p.sent.find((m) => m.id === 2)).toEqual({ id: 2, error: "a phone can't do exportSpace" });
    expect(p.calls.map((c) => c.method)).toEqual(['keys', 'websites', 'say']);
    expect(p.sent.find((m) => m.id === 4)).toMatchObject({ id: 4, error: 'nothing to say' });
  });

  it('sends live events as they happen, until the connection closes', async () => {
    const p = pair();
    await p.tick();
    p.push({ kind: 'post' } as FeedItem);
    expect(p.sent).toEqual([{ event: { kind: 'post' } }]);
    expect(p.watching()?.aborted).toBe(false);
    p.link.closed();
    expect(p.watching()?.aborted).toBe(true);
    expect(p.stop.signal.aborted).toBe(true);
    p.push({ kind: 'post' } as FeedItem);
    expect(p.sent).toHaveLength(1);
  });

  it('runs over a WebSocket: a browser calls and hears events through an HTTP upgrade', async () => {
    const calls: string[] = [];
    let push: ((item: FeedItem) => void) | undefined;
    const host = {
      call: async (method: RpcMethod) => {
        calls.push(method);
        return { hello: method };
      },
      watch: (onItem: (item: FeedItem) => void) => {
        push = onItem;
        return new Promise<void>(() => {});
      },
    };
    const server = createServer((_req, res) => res.end());
    server.on('upgrade', (req, socket, head) => {
      if (!serveRemoteOverWebSocket(host, req, socket, head)) socket.destroy();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/remote`);
    const heard: Array<Record<string, unknown>> = [];
    ws.addEventListener('message', (e) => heard.push(JSON.parse(String(e.data)) as Record<string, unknown>));
    await new Promise<void>((resolve) => ws.addEventListener('open', () => resolve()));
    ws.send(JSON.stringify({ id: 7, method: 'whoami' }));
    await until(() => heard.length >= 1);
    expect(heard[0]).toEqual({ id: 7, result: { hello: 'whoami' } });
    push?.({ kind: 'post' } as FeedItem);
    await until(() => heard.length >= 2);
    expect(heard[1]).toEqual({ event: { kind: 'post' } });
    ws.send(JSON.stringify({ id: 8, method: 'backup' }));
    await until(() => heard.length >= 3);
    expect(heard[2]).toEqual({ id: 8, error: "a phone can't do backup" });
    expect(calls).toEqual(['whoami']);
    ws.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('takes its own allowlist (a browser is not a phone) and says what it refused', async () => {
    const refused: string[] = [];
    const calls: string[] = [];
    const host = { call: async (method: RpcMethod) => void calls.push(method), watch: () => new Promise<void>(() => {}) };
    const sent: Array<Record<string, unknown>> = [];
    const link = new RemoteLink((text) => sent.push(JSON.parse(text) as Record<string, unknown>), () => {});
    serveRemote(host, link, { methods: ['backup'], who: 'Weave Web', refused: (m) => refused.push(m) });
    link.receive(JSON.stringify({ id: 1, method: 'backup' }));
    link.receive(JSON.stringify({ id: 2, method: 'whoami' }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toEqual(['backup']);
    expect(refused).toEqual(['whoami']);
    expect(sent.find((m) => m.id === 2)).toEqual({ id: 2, error: "Weave Web can't do whoami" });
  });

  it('keeps what arrives before anyone listens (frames that came with the upgrade), in order', async () => {
    const sent: Array<Record<string, unknown>> = [];
    const calls: string[] = [];
    const link = new RemoteLink((text) => sent.push(JSON.parse(text) as Record<string, unknown>), () => {});
    link.receive(JSON.stringify({ id: 1, method: 'whoami' }));
    link.receive(JSON.stringify({ id: 2, method: 'feed' }));
    serveRemote({ call: async (method: RpcMethod) => void calls.push(method), watch: () => new Promise<void>(() => {}) }, link);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toEqual(['whoami', 'feed']);
    expect(sent.map((m) => m.id)).toEqual([1, 2]);
  });

  it('closes on a message that is no JSON object, as the DHT carrier does on a bad line', () => {
    const p = pair();
    p.link.receive('not json');
    expect(p.ended()).toBe(true);
    expect(p.link.open).toBe(false);
    const q = pair();
    q.link.receive('[1, 2]');
    expect(q.ended()).toBe(true);
  });
});
