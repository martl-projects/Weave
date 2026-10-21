import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { WeaveNode, closeOpenStores } from '../src/index.ts';

const dirs: string[] = [];
afterAll(() => {
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function person(name: string): WeaveNode {
  const dir = mkdtempSync(join(tmpdir(), 'weave-home-'));
  dirs.push(dir);
  return WeaveNode.init(name, dir);
}

function syncAll(nodes: WeaveNode[]): void {
  for (let round = 0; round < 2; round++) for (const from of nodes) for (const to of nodes) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
}

describe('Home', () => {
  it('filters by source and leaves out what you hid', async () => {
    const martin = person('Martin');
    const lena = person('Lena');
    const kofi = person('Kofi');
    const all = [martin, lena, kofi];
    await martin.createProject({ name: 'Weave' });
    await lena.createProject({ name: 'Synth case' });
    await kofi.createProject({ name: 'Mesh radio' });
    await martin.createCommunity({ name: 'Synths' });
    await martin.joinSpace(await lena.invite('Synth case'));
    await martin.joinSpace(await kofi.invite('Mesh radio'));
    await martin.submit({ space: 'Synths', title: 'Patch of the week' });
    // Lena and Martin are friends (they follow each other); Martin only follows Kofi.
    syncAll(all);
    await martin.setEdge({ edge: 'follow', who: 'Lena', on: true });
    await lena.setEdge({ edge: 'follow', who: 'Martin', on: true });
    await martin.setEdge({ edge: 'follow', who: 'Kofi', on: true });
    await kofi.publish({ kind: 'weave.post', body: { title: 'Antenna test results', text: '' } });
    syncAll(all);

    const titles = async (from?: 'all' | 'communities' | 'projects' | 'mine' | 'friends' | 'following') => (await martin.posts({ from, sort: 'new' })).map((p) => p.title).sort();
    expect(await titles()).toEqual(['Antenna test results', 'Mesh radio', 'Patch of the week', 'Synth case', 'Weave']);
    expect(await titles('communities')).toEqual(['Patch of the week']);
    expect(await titles('projects')).toEqual(['Mesh radio', 'Synth case', 'Weave']);
    expect(await titles('mine')).toEqual(['Weave']);
    expect(await titles('friends')).toEqual(['Synth case']);
    expect(await titles('following')).toEqual(['Antenna test results']);

    // Hiding is private and only affects Home; the project itself is still there.
    expect(await martin.setHomeVisibility({ space: 'Mesh radio', visible: false })).toMatchObject({ hiddenFromHome: true });
    expect(await titles()).toEqual(['Antenna test results', 'Patch of the week', 'Synth case', 'Weave']);
    expect(await titles('projects')).toEqual(['Synth case', 'Weave']);
    expect((await martin.project('Mesh radio')).name).toBe('Mesh radio');
    await martin.setHomeVisibility({ space: 'Mesh radio', visible: true });
    expect(await titles('projects')).toEqual(['Mesh radio', 'Synth case', 'Weave']);
    await expect(martin.posts({ from: 'everything' as 'all' })).rejects.toThrow(/show posts from/);
  });
});
