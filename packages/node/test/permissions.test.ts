import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { WeaveNode, type FeedItem } from '../src/index.ts';

const dirs: string[] = [];
afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe("an agent asking for a permission", () => {
  it('reaches its person as a notice (a notification when Weave is in the background), and survives a restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'weave-ask-'));
    dirs.push(dir);
    const node = WeaveNode.init('martl', dir);
    await node.addAgent('claude', ['weave.post']);

    const seen: FeedItem[] = [];
    const watching = new AbortController();
    void node.watch((item) => seen.push(item), watching.signal);
    await new Promise((r) => setTimeout(r, 50));
    const request = await node.requestPermission({ as: 'claude', kinds: ['weave.github.repo'], reason: 'to link the Gameshow repository' });
    await new Promise((r) => setTimeout(r, 50));
    watching.abort();
    expect(seen.find((i) => i.notice?.type === 'permission')?.notice).toEqual({
      type: 'permission',
      category: 'requests',
      title: 'Your agent claude asks for a permission',
      text: 'To sign weave.github.repo: “to link the Gameshow repository”',
      open: { inbox: true },
    });

    await node.close();
    const again = WeaveNode.open(dir);
    expect((await again.permissionRequests()).map((r) => r.id)).toEqual([request.id]);
    await again.close();
  });
});
