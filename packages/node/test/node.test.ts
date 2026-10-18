import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import createTestnet, { type Testnet } from 'hyperdht/testnet.js';
import { ApiClient, loadConfig, resolveHome, saveConfig, startApi, startDaemon, WeaveNode, type Daemon, type FeedItem } from '../src/index.ts';

const dirs: string[] = [];
function tempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), 'weave-test-'));
  dirs.push(dir);
  return dir;
}
afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

async function until(condition: () => Promise<boolean> | boolean, timeoutMs = 20_000): Promise<void> {
  const start = Date.now();
  while (!(await condition())) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe('WeaveNode', () => {
  it('keeps identity, posts and agents across restarts', async () => {
    const dir = tempHome();
    const node = WeaveNode.init('alice', dir);
    await node.publish({ kind: 'weave.post', body: { text: 'first post' } });
    await node.addAgent('forge', ['weave.post']);

    const reopened = WeaveNode.open(dir);
    expect((await reopened.whoami()).name).toBe('alice');
    const agentPost = await reopened.publish({ kind: 'weave.post', body: { text: 'from forge' }, as: 'forge' });
    expect(agentPost).toMatchObject({ authorName: 'alice', signerName: 'forge' });
    expect((await reopened.feed({ kinds: ['weave.post'] })).map((i) => (i.body as { text: string }).text)).toEqual(['first post', 'from forge']);
  });

  it('refuses to create a second identity in the same home', () => {
    const dir = tempHome();
    WeaveNode.init('alice', dir);
    expect(() => WeaveNode.init('again', dir)).toThrow(/already exists/);
  });

  it('enforces agent permissions', async () => {
    const node = WeaveNode.init('alice', tempHome());
    await node.addAgent('reader', ['weave.reply']);
    await expect(node.publish({ kind: 'weave.post', body: 'nope', as: 'reader' })).rejects.toThrow(/may not sign weave.post/);
  });
});

describe('local API', () => {
  it('serves the backend to an authorized client and streams new events', async () => {
    const node = WeaveNode.init('alice', tempHome());
    const api = await startApi(node);
    try {
      const client = new ApiClient(api.port, api.token);
      expect((await client.whoami()).name).toBe('alice');

      const seen: FeedItem[] = [];
      const controller = new AbortController();
      const watching = client.watch((item) => seen.push(item), controller.signal);
      await new Promise((resolve) => setTimeout(resolve, 100));

      await client.publish({ kind: 'weave.post', body: { text: 'over http' } });
      await until(() => seen.length === 1);
      expect(seen[0]).toMatchObject({ kind: 'weave.post', authorName: 'alice' });
      expect(await client.feed({ kinds: ['weave.post'] })).toHaveLength(1);

      controller.abort();
      await watching;
      await expect(new ApiClient(api.port, 'wrong-token').whoami()).rejects.toThrow(/unauthorized/);
    } finally {
      await api.close();
    }
  });
});

describe('daemons', () => {
  let testnet: Testnet;
  const daemons: Daemon[] = [];

  beforeAll(async () => {
    testnet = await createTestnet(3);
  });
  afterEach(async () => {
    while (daemons.length) await daemons.pop()!.stop();
  });
  afterAll(async () => {
    await testnet.destroy();
  });

  function person(name: string): string {
    const dir = tempHome();
    WeaveNode.init(name, dir);
    const home = resolveHome(dir);
    saveConfig(home, { ...loadConfig(home), topics: ['friends'], bootstrap: testnet.bootstrap });
    return dir;
  }

  it('two people on a topic see each other\'s posts, names included', async () => {
    const alice = await startDaemon(person('alice'));
    const bob = await startDaemon(person('bob'));
    daemons.push(alice, bob);

    await alice.node.publish({ kind: 'weave.post', body: { text: 'hi bob' } });
    await until(async () => (await bob.node.feed({ kinds: ['weave.post'] })).length === 1);
    const [item] = await bob.node.feed({ kinds: ['weave.post'] });
    expect(item).toMatchObject({ authorName: 'alice', body: { text: 'hi bob' } });
    expect((await bob.node.status()).peers).toBeGreaterThan(0);
  });

  it('allows only one daemon per home', async () => {
    const dir = person('carol');
    daemons.push(await startDaemon(dir));
    await expect(startDaemon(dir)).rejects.toThrow(/already running/);
  });
});
