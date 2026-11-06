import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Duplex } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { Replica, type SigningIdentity } from '@weave/core';
import { authKey, type HeldSpace, type SpaceAccess } from '@weave/net/browser';
import { StorageNode, textSocket } from '@weave/node';
import { buildWeb } from '../build.ts';
import { SwarmNode, useStorage } from '../src/host/net.ts';

/** A browser's SwarmNode against a real storage node, over a real WebSocket; and the bundle it all goes into. */

async function until(ready: () => boolean, timeoutMs = 10_000): Promise<void> {
  const start = Date.now();
  while (!ready()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function start() {
  const dir = mkdtempSync(join(tmpdir(), 'weave-web-swarm-'));
  const topics = new Set<string>();
  const announced: unknown[] = [];
  const node = await StorageNode.open({
    dir,
    network: (_replica, access) => ({ join: async (t) => void topics.add(t), leave: async (t) => void topics.delete(t), announce: () => void announced.push(access.spaces()), destroy: async () => {} }),
  });
  const sockets = new Set<Duplex>();
  const server = createServer((_req, res) => res.end());
  server.on('upgrade', (req, socket, head) => {
    sockets.add(socket);
    void node.accept(textSocket(req, socket, head)!).catch(() => {});
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  const stop = async () => {
    server.closeAllConnections();
    server.close();
    sockets.forEach((s) => s.destroy());
    await node.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  };
  return { node, url, topics, announced, sockets, stop };
}

const space = (name: string, fill: number): HeldSpace => ({ space: `group:${name}`, keys: [new Uint8Array(32).fill(fill)] });

describe('a browser on its storage node', { timeout: 30_000 }, () => {
  it('connects although it joins topics right away, and takes an account once', async () => {
    const { node, url, topics, stop } = await start();
    let account: SigningIdentity | undefined;
    const states: string[] = [];
    useStorage({ url, invite: node.invite(), account: () => account, keepAccount: (a) => (account = a), status: (state) => states.push(state) });
    const access: SpaceAccess = { spaces: () => [space('a', 1)] };
    const swarm = new SwarmNode(new Replica(), {}, undefined, access);
    try {
      // What goOnline does: all topics at once, before the first connection is up.
      await Promise.all(['one', 'two'].map((t) => swarm.join(t)));
      await until(() => swarm.sessions.size === 1 && topics.has('one') && topics.has('two'));
      expect(account).toBeDefined();
      expect(states).toContain('connected');
    } finally {
      await swarm.destroy();
      await stop();
    }
  });

  it("doesn't hand on someone else's meeting point, where a node only looks", async () => {
    const { node, url, topics, stop } = await start();
    let account: SigningIdentity | undefined;
    useStorage({ url, invite: node.invite(), account: () => account, keepAccount: (a) => (account = a) });
    const swarm = new SwarmNode(new Replica(), {}, undefined, { spaces: () => [space('a', 1)] });
    try {
      await swarm.join('mine');
      await swarm.join('theirs', { announce: false });
      await until(() => topics.has('mine'));
      expect(topics.has('theirs')).toBe(false);
      expect(swarm.joined.sort()).toEqual(['mine', 'theirs']);
    } finally {
      await swarm.destroy();
      await stop();
    }
  });

  it('hands on a space joined later, while its session stays open', async () => {
    const { node, url, topics, announced, stop } = await start();
    let account: SigningIdentity | undefined;
    useStorage({ url, invite: node.invite(), account: () => account, keepAccount: (a) => (account = a) });
    const held = [space('a', 1)];
    const swarm = new SwarmNode(new Replica(), {}, undefined, { spaces: () => held });
    try {
      await swarm.join('one');
      await until(() => swarm.sessions.size === 1 && topics.has('one'));
      const session = [...swarm.sessions][0];
      held.push(space('b', 2));
      await swarm.join('two');
      await until(() => topics.has('two'));
      expect([...swarm.sessions]).toEqual([session]);
      const last = announced.at(-1) as HeldSpace[];
      expect(last.map((s) => s.space)).toEqual(['group:a', 'group:b']);
      // The node holds hashes of the keys, never a key.
      expect(last[1].keys[0]).toEqual(authKey(new Uint8Array(32).fill(2)));
    } finally {
      await swarm.destroy();
      await stop();
    }
  });

  it('comes back after the connection dropped, signing in and not registering again', async () => {
    const { node, url, sockets, stop } = await start();
    let account: SigningIdentity | undefined;
    let kept = 0;
    useStorage({
      url,
      invite: node.invite(),
      account: () => account,
      keepAccount: (a) => {
        account = a;
        kept++;
      },
    });
    const swarm = new SwarmNode(new Replica(), {}, undefined, { spaces: () => [space('a', 1)] });
    try {
      await until(() => swarm.sessions.size === 1);
      const before = [...swarm.sessions][0];
      sockets.forEach((s) => s.destroy());
      await until(() => swarm.sessions.size === 0);
      await until(() => swarm.sessions.size === 1 && ![...swarm.sessions].includes(before));
      expect(kept).toBe(1);
    } finally {
      await swarm.destroy();
      await stop();
    }
  });

  it('says so when there is neither an account nor an invitation', async () => {
    const { url, stop } = await start();
    const why: Array<string | undefined> = [];
    useStorage({ url, account: () => undefined, keepAccount: () => {}, status: (state, detail) => state === 'offline' && why.push(detail) });
    const swarm = new SwarmNode(new Replica(), {}, undefined, { spaces: () => [] });
    try {
      await until(() => why.length > 0);
      expect(why[0]).toContain('no invitation');
    } finally {
      await swarm.destroy();
      await stop();
    }
  });
});

describe('the bundle', { timeout: 60_000 }, () => {
  it('holds the real node and no module of Node', async () => {
    const dist = mkdtempSync(join(tmpdir(), 'weave-web-build-'));
    try {
      await buildWeb(dist, { minify: true });
      const worker = readFileSync(join(dist, 'worker.js'), 'utf8');
      expect(worker).toContain('weave/storage/signin/v1');
      expect(worker).not.toMatch(/from\s*["']node:/);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });
});
