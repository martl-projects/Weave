import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { isWireItemV2 } from '@weave/core';
import { WeaveNode, closeOpenStores } from '../src/index.ts';

const dirs: string[] = [];
afterAll(() => {
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function person(name: string): WeaveNode {
  const dir = mkdtempSync(join(tmpdir(), 'weave-forget-'));
  dirs.push(dir);
  return WeaveNode.init(name, dir);
}

const sync = (from: WeaveNode, to: WeaveNode) => from.replica.events().forEach((e) => to.replica.ingest(e));
const day = 24 * 3600 * 1000;

describe('forgetting by rule', () => {
  it('forgets due posts with their chat, keeps upvoted ones longer, and never what is yours', async () => {
    const [martin, lena, kofi] = [person('Martin'), person('Lena'), person('Kofi')];
    const all = [martin, lena, kofi];
    const syncAll = () => {
      for (let round = 0; round < 2; round++) for (const from of all) for (const to of all) if (from !== to) sync(from, to);
    };
    await martin.createProject({ name: 'Weave' });
    await lena.joinSpace(await martin.invite('Weave'));
    await kofi.joinSpace(await martin.invite('Weave'));
    syncAll();
    await expect(lena.setBoardRule({ space: 'Weave', board: 'ideas', keepDays: 30 })).rejects.toThrow(/maintainers/);
    const boards = await martin.setBoardRule({ space: 'Weave', board: 'ideas', keepDays: 30 });
    expect(boards.find((b) => b.name === 'ideas')?.rule).toMatchObject({ keepDays: 30, maxMB: null, by: { did: martin.identity.author } });

    const quiet = await lena.submit({ space: 'Weave', title: 'Quiet idea' });
    await lena.say({ space: 'Weave', text: 'about the quiet idea', post: quiet.id });
    const liked = await lena.submit({ space: 'Weave', title: 'Liked idea' });
    const own = await kofi.submit({ space: 'Weave', title: 'Kofi’s idea' });
    const issue = await lena.submit({ space: 'Weave', board: 'issues', title: 'A bug' });
    syncAll();
    await martin.upvote({ target: liked.id, value: 1 });
    await kofi.upvote({ target: liked.id, value: 1 });
    syncAll();

    // What each post says about itself.
    const lifetimes = new Map((await kofi.posts({ space: 'Weave' })).map((p) => [p.title, p.lifetime]));
    expect(lifetimes.get('Quiet idea')).toMatchObject({ upvotes: 0, addedDays: 0 });
    expect(lifetimes.get('Liked idea')).toMatchObject({ upvotes: 2, addedDays: 48 });
    expect(lifetimes.get('Kofi’s idea')).toMatchObject({ yours: true });
    expect((await kofi.posts({ space: 'Weave', board: 'issues' }))[0].lifetime).toEqual({ forever: 'permanent' });

    // Forty days on.
    for (const node of all) node.clock = () => Date.now() + 40 * day;
    await kofi.reconcile();
    const titles = async (node: WeaveNode) => (await node.posts({ space: 'Weave' })).map((p) => p.title).sort();
    expect(await titles(kofi)).toEqual(['A bug', 'Kofi’s idea', 'Liked idea']);
    expect((await kofi.feed({ space: 'Weave', kinds: ['weave.msg'] })).map((i) => (i.body as { text: string }).text)).not.toContain('about the quiet idea');
    expect((await kofi.posts({ space: 'Weave', board: 'issues' })).map((p) => p.title)).toEqual(['A bug']);
    // Lena wrote it: her node keeps it. Martin owns the project: his keeps everything.
    await lena.reconcile();
    await martin.reconcile();
    expect(await titles(lena)).toContain('Quiet idea');
    expect(await titles(martin)).toContain('Quiet idea');

    // Kofi doesn't take it back from someone who still has it.
    syncAll();
    expect(await titles(kofi)).not.toContain('Quiet idea');
    const record = lena.replica.events((r) => r.id === quiet.id)[0];
    if (isWireItemV2(record.wire)) kofi.replica.ingest(record.wire);
    expect(await titles(kofi)).not.toContain('Quiet idea');
    void issue;
    void own;
    for (const node of all) await node.close();
  });

  it('warns the author two weeks ahead, and Keep starts the time again', async () => {
    const martin = person('Martin');
    await martin.createProject({ name: 'Weave' });
    await martin.setBoardRule({ space: 'Weave', board: 'ideas', keepDays: 30 });
    const post = await martin.submit({ space: 'Weave', title: 'Mine' });
    expect(await martin.fading()).toEqual([]);
    martin.clock = () => Date.now() + 20 * day;
    expect((await martin.fading()).map((p) => p.title)).toEqual(['Mine']);
    // Keep is activity: its time starts again from now.
    const before = Date.parse(((await martin.post(post.id)).lifetime as { until: string }).until);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const kept = await martin.keepPost(post.id);
    expect(Date.parse((kept.lifetime as { until: string }).until)).toBeGreaterThan(before);
    // Pinned posts stay for good.
    await martin.curate({ space: 'Weave', board: 'ideas', pinned: [post.id] });
    expect((await martin.post(post.id)).lifetime).toMatchObject({ forever: 'pinned' });
    await martin.close();
  });
});
