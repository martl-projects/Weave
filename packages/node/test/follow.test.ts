import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { writeJson } from '../src/home.ts';
import { followDaemon, startApi, WeaveNode, type FeedItem } from '../src/index.ts';

const dirs: string[] = [];
afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe('following the daemon', () => {
  it('finds the daemon again after it restarts on another port, and waits for one that is not running', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'weave-follow-'));
    dirs.push(dir);
    const node = WeaveNode.init('martl', dir);
    const backend = followDaemon(node.home);

    // Not running yet: a clear message, not a crash.
    await expect(backend.whoami()).rejects.toThrow(/Weave isn't running/);

    // Started, as the daemon does: serve the API and say where in daemon.json.
    const serve = async () => {
      const api = await startApi(node);
      writeJson(node.home.daemon, { pid: process.pid, port: api.port, token: api.token });
      return api;
    };
    let api = await serve();
    expect((await backend.whoami()).name).toBe('martl');

    // Its event stream picks up what's published.
    const seen: FeedItem[] = [];
    const watching = new AbortController();
    void backend.watch((item) => seen.push(item), watching.signal);
    await new Promise((r) => setTimeout(r, 200));

    // Restarted on another port with a new token: the next call finds it.
    const before = api.port;
    await api.close();
    api = await serve();
    expect(api.port).not.toBe(before);
    expect((await backend.whoami()).name).toBe('martl');

    // The event stream came back by itself.
    await new Promise((r) => setTimeout(r, 2500));
    await node.publish({ kind: 'weave.post', body: { text: 'still here' } });
    await new Promise((r) => setTimeout(r, 300));
    expect(seen.map((i) => (i.body as { text?: string }).text)).toContain('still here');

    watching.abort();
    await api.close();
    rmSync(node.home.daemon, { force: true });
    await expect(backend.status()).rejects.toThrow(/Weave isn't running/);
  }, 20_000);
});
