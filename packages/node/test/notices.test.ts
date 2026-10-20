import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { WeaveNode, type FeedItem } from '../src/index.ts';

const dirs: string[] = [];
afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function person(name: string): WeaveNode {
  const dir = mkdtempSync(join(tmpdir(), 'weave-notices-'));
  dirs.push(dir);
  return WeaveNode.init(name, dir);
}

function syncAll(nodes: WeaveNode[]): void {
  for (let round = 0; round < 2; round++) for (const from of nodes) for (const to of nodes) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
}

/** Everything `node` streams live while `act` runs, then the notices among it as "type: title — text". */
async function noticesOf(node: WeaveNode, act: () => Promise<void> | void): Promise<string[]> {
  const items: FeedItem[] = [];
  const stop = new AbortController();
  const watching = node.watch((item) => items.push(item), stop.signal);
  await act();
  await new Promise((resolve) => setTimeout(resolve, 20));
  stop.abort();
  await watching;
  return items.filter((i) => i.notice).map((i) => `${i.notice!.type}: ${i.notice!.title} — ${i.notice!.text}`);
}

describe('notices on live events', () => {
  it('notices mentions, replies, chat in your posts, co-author requests and new things in your projects', async () => {
    const martl = person('martl');
    const lena = person('Lena');
    const all = [martl, lena];
    await martl.createProject({ name: 'Weave' });
    await lena.joinSpace(await martl.invite('Weave'));
    syncAll(all);
    const mine = await martl.submit({ space: 'Weave', board: 'ideas', title: 'Tray icon' });
    const hello = await martl.say({ space: 'Weave', text: 'Morning!' });
    syncAll(all);

    const seen = await noticesOf(martl, async () => {
      await lena.say({ space: 'Weave', text: 'hey @martl, look at this' });
      await lena.say({ space: 'Weave', text: 'Morning to you', replyTo: hello.id });
      await lena.say({ space: 'Weave', post: mine.id, text: 'Love it' });
      await lena.say({ space: 'Weave', text: 'just chatting' }); // not about martl: no notice
      await lena.submit({ space: 'Weave', board: 'issues', title: 'Crash on start' });
      await lena.submit({ space: 'Weave', board: 'ideas', title: 'Dark mode', with: [martl.identity.author] });
      syncAll(all);
    });
    expect(seen).toEqual([
      'mention: Lena mentioned you in p/Weave #general — hey @martl, look at this',
      'reply: Lena replied to you in p/Weave #general — Morning to you',
      'reply: Lena in your post “Tray icon” — Love it',
      'issue: New issue in p/Weave — Lena: Crash on start',
      'coauthor: Lena named you as co-author — Dark mode',
    ]);
  });

  it('stays quiet about your own events, even when they mention you', async () => {
    const martl = person('martl');
    const lena = person('Lena');
    await martl.createProject({ name: 'Weave' });
    await lena.joinSpace(await martl.invite('Weave'));
    syncAll([martl, lena]);
    const seen = await noticesOf(martl, async () => {
      await martl.say({ space: 'Weave', text: 'note to self @martl' });
      syncAll([martl, lena]);
    });
    expect(seen).toEqual([]);
  });
});
