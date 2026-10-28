import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { WeaveNode, type FeedItem, closeOpenStores } from '../src/index.ts';

const dirs: string[] = [];
afterAll(() => {
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function person(name: string): WeaveNode {
  const dir = mkdtempSync(join(tmpdir(), 'weave-board-follow-'));
  dirs.push(dir);
  return WeaveNode.init(name, dir);
}

function syncAll(nodes: WeaveNode[]): void {
  for (let round = 0; round < 2; round++) for (const from of nodes) for (const to of nodes) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
}

const home = async (node: WeaveNode) => (await node.posts({ sort: 'new' })).map((p) => (p.type === 'project' ? `project ${p.title}` : `${p.board} ${p.title}`)).sort();

describe('following boards', () => {
  it('brings releases and showcase to Home by default, and any board you follow', async () => {
    const martl = person('martl');
    const lena = person('Lena');
    await martl.createProject({ name: 'Weave' });
    await martl.setBoard({ project: 'Weave', name: 'showcase', title: 'Showcase' });
    await lena.joinSpace(await martl.invite('Weave'));
    syncAll([martl, lena]);
    await martl.submit({ space: 'Weave', board: 'releases', title: 'v0.3' });
    await martl.submit({ space: 'Weave', board: 'showcase', title: 'Cozy look' });
    await martl.submit({ space: 'Weave', board: 'ideas', title: 'Tray icon' });
    await martl.submit({ space: 'Weave', board: 'issues', title: 'Crash on start' });
    syncAll([martl, lena]);

    expect(await home(lena)).toEqual(['project Weave', 'releases v0.3', 'showcase Cozy look']);
    expect((await lena.boards('Weave')).map((b) => `${b.name} ${b.following}`)).toEqual(['releases true', 'ideas false', 'issues false', 'proposals false', 'showcase true']);

    await lena.followBoard({ project: 'Weave', board: 'ideas', on: true });
    await lena.followBoard({ project: 'Weave', board: 'showcase', on: false });
    expect(await home(lena)).toEqual(['ideas Tray icon', 'project Weave', 'releases v0.3']);
    // Only Lena's Home changed.
    expect(await home(martl)).toEqual(['project Weave', 'releases v0.3', 'showcase Cozy look']);
    await expect(lena.followBoard({ project: 'Weave', board: 'nope', on: true })).rejects.toThrow();
  });

  it('switches a whole project or community off and back on, keeping the board choices', async () => {
    const martl = person('martl');
    const lena = person('Lena');
    await martl.createProject({ name: 'Weave' });
    await martl.createCommunity({ name: 'Synths' });
    await lena.joinSpace(await martl.invite('Weave'));
    await lena.joinSpace(await martl.invite('Synths'));
    syncAll([martl, lena]);
    await lena.followBoard({ project: 'Weave', board: 'ideas', on: true });
    await martl.submit({ space: 'Weave', board: 'releases', title: 'v0.3' });
    await martl.submit({ space: 'Weave', board: 'ideas', title: 'Tray icon' });
    await martl.submit({ space: 'Synths', title: 'Patch of the week' });
    syncAll([martl, lena]);
    expect(await home(lena)).toEqual(['ideas Tray icon', 'posts Patch of the week', 'project Weave', 'releases v0.3']);

    await lena.setHomeVisibility({ space: 'Weave', visible: false });
    await lena.setHomeVisibility({ space: 'Synths', visible: false });
    expect(await home(lena)).toEqual([]);

    // Back on: the boards Lena followed come back, ideas included.
    await lena.setHomeVisibility({ space: 'Weave', visible: true });
    await lena.setHomeVisibility({ space: 'Synths', visible: true });
    expect(await home(lena)).toEqual(['ideas Tray icon', 'posts Patch of the week', 'project Weave', 'releases v0.3']);
  });

  it('notifies about new posts in followed communities, and not in unfollowed projects', async () => {
    const martl = person('martl');
    const lena = person('Lena');
    await martl.createProject({ name: 'Weave' });
    await martl.createCommunity({ name: 'Synths' });
    await lena.joinSpace(await martl.invite('Weave'));
    await lena.joinSpace(await martl.invite('Synths'));
    syncAll([martl, lena]);
    await martl.setHomeVisibility({ space: 'Weave', visible: false });

    const items: FeedItem[] = [];
    const stop = new AbortController();
    const watching = martl.watch((item) => items.push(item), stop.signal);
    await lena.submit({ space: 'Synths', title: 'Patch of the week' });
    await lena.submit({ space: 'Weave', board: 'releases', title: 'v0.3' });
    syncAll([martl, lena]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    stop.abort();
    await watching;
    expect(items.filter((i) => i.notice).map((i) => `${i.notice!.title} — ${i.notice!.text}`)).toEqual(['New post in r/Synths — Lena: Patch of the week']);
  });

  it('notifies about new posts only in boards you follow', async () => {
    const martl = person('martl');
    const lena = person('Lena');
    await martl.createProject({ name: 'Weave' });
    await lena.joinSpace(await martl.invite('Weave'));
    syncAll([martl, lena]);
    await martl.followBoard({ project: 'Weave', board: 'issues', on: true });

    const items: FeedItem[] = [];
    const stop = new AbortController();
    const watching = martl.watch((item) => items.push(item), stop.signal);
    await lena.submit({ space: 'Weave', board: 'ideas', title: 'Dark mode' });
    await lena.submit({ space: 'Weave', board: 'issues', title: 'Crash on start' });
    await lena.submit({ space: 'Weave', board: 'releases', title: 'v0.3' });
    syncAll([martl, lena]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    stop.abort();
    await watching;
    expect(items.filter((i) => i.notice).map((i) => i.notice!.text)).toEqual(['Lena: Crash on start', 'Lena: v0.3']);
    // Who and where, for the app's rules on what counts.
    expect(items.filter((i) => i.notice).map((i) => [i.notice!.from, i.notice!.board])).toEqual([
      [lena.identity.author, 'issues'],
      [lena.identity.author, 'releases'],
    ]);
  });
});
