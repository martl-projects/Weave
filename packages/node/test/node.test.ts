import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir, uptime } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import createTestnet, { type Testnet } from 'hyperdht/testnet.js';
import { ApiClient, loadConfig, resolveHome, saveConfig, startApi, startDaemon, WeaveNode, type Daemon, type FeedItem, closeOpenStores } from '../src/index.ts';

const dirs: string[] = [];
function tempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), 'weave-test-'));
  dirs.push(dir);
  return dir;
}
afterAll(() => {
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

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

  it('lets only one process write to a home at a time', async () => {
    const dir = tempHome();
    const node = WeaveNode.init('alice', dir);
    await node.close();
    const lock = join(dir, 'node.lock');

    // Live processes that aren't us: one of Weave's (weave on its command line) keeps the home ...
    const idle = 'setInterval(() => {}, 1000)';
    const weave = spawn(process.execPath, ['-e', idle, 'weave-daemon'], { cwd: tmpdir(), stdio: 'ignore' });
    const other = spawn(process.execPath, ['-e', idle], { cwd: tmpdir(), stdio: 'ignore' });
    try {
      writeFileSync(lock, String(weave.pid));
      expect(() => WeaveNode.open(dir)).toThrow(/in use by another process/);

      // ... another program, which got the pid of a daemon that is gone, doesn't.
      writeFileSync(lock, String(other.pid));
      const takenOver = WeaveNode.open(dir);
      expect(readFileSync(lock, 'utf8')).toBe(String(process.pid));
      await takenOver.close();

      // From before the computer last started: the pid may be anyone's by now.
      writeFileSync(lock, String(weave.pid));
      const beforeBoot = new Date(Date.now() - uptime() * 1000 - 3_600_000);
      utimesSync(lock, beforeBoot, beforeBoot);
      const afterReboot = WeaveNode.open(dir);
      expect(readFileSync(lock, 'utf8')).toBe(String(process.pid));
      await afterReboot.close();
    } finally {
      weave.kill();
      other.kill();
    }

    writeFileSync(lock, '999999'); // a process that is gone
    const reopened = WeaveNode.open(dir);
    expect(readFileSync(lock, 'utf8')).toBe(String(process.pid));
    await reopened.close();
  });

  it('enforces agent permissions', async () => {
    const node = WeaveNode.init('alice', tempHome());
    await node.addAgent('reader', ['weave.reply']);
    await expect(node.publish({ kind: 'weave.post', body: 'nope', as: 'reader' })).rejects.toThrow(/may not sign weave.post/);
  });
});

describe('spaces', () => {
  it('keeps a sanitized theme and filters a person\'s public posts', async () => {
    const node = WeaveNode.init('alice', tempHome());
    const profile = await node.setProfile({ name: 'Alice', theme: { accent: '#FF00AA', font: 'serif', background: 'url(evil)' as never } });
    expect(profile.name).toBe('Alice');
    expect(profile.theme).toMatchObject({ accent: '#ff00aa', font: 'serif', background: '#0d0e12' });

    await node.createGroup('Secret');
    await node.publish({ kind: 'weave.post', body: { text: 'public' } });
    await node.publish({ kind: 'weave.post', body: { text: 'in group' }, space: 'Secret' });
    const mine = await node.feed({ author: 'Alice', publicOnly: true, kinds: ['weave.post'] });
    expect(mine.map((i) => (i.body as { text: string }).text)).toEqual(['public']);
    expect((await node.profile()).posts).toBe(1); // public posts only
    expect(await node.directory()).toEqual([]);
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

      // Omitted arguments keep their defaults over the wire (an invite valid for a week, not zero hours).
      await client.createGroup('Friends');
      const { decodeInvite } = await import('@weave/core');
      const invite = decodeInvite(await client.invite('Friends'));
      expect(Date.parse(invite.expires) - Date.now()).toBeGreaterThan(6 * 86_400_000);
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
    // Strangers who meet on an open topic: no link between them, so without the firewall (it would turn them away).
    saveConfig(home, { ...loadConfig(home), topics: ['friends'], bootstrap: testnet.bootstrap, firewall: false });
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
