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
  const dir = mkdtempSync(join(tmpdir(), 'weave-v2events-'));
  dirs.push(dir);
  return WeaveNode.init(name, dir);
}

const sync = (from: WeaveNode, to: WeaveNode) => from.replica.events().forEach((e) => to.replica.ingest(e));

describe('a node writing v2', () => {
  it('signs v2 events (what the root signs stays v1), sealed with their inner class, numbered on from v1', async () => {
    const martin = person('Martin');
    await martin.createProject({ name: 'Weave' });
    await martin.submit({ space: 'Weave', title: 'Hello' });
    await martin.say({ space: 'Weave', text: 'hi' });

    const mine = martin.replica.events((r) => r.author === martin.identity.author);
    expect(mine.filter((r) => r.v === 1).map((r) => [r.kind, r.signer === martin.identity.author])).toEqual([
      ['weave.identity', true],
      ['weave.delegate', true],
    ]);
    const sealed = mine.filter((r) => r.kind === 'weave.sealed' && r.scope.startsWith('project:'));
    // The create event and its rules are control; the post and the message content.
    expect(new Set(sealed.map((r) => r.class))).toEqual(new Set(['control', 'content']));
    const device = martin.identity.did;
    const numbers = martin.replica.eventsBy(device).map((r) => r.seq);
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
    expect(martin.replica.number(device)).toBe(numbers.length);
  });

  it('shows a post once its body arrives, and not before', async () => {
    const martin = person('Martin');
    const lena = person('Lena');
    await martin.createProject({ name: 'Weave' });
    await lena.joinSpace(await martin.invite('Weave'));
    sync(martin, lena);
    sync(lena, martin);
    const post = await martin.submit({ space: 'Weave', title: 'Late body' });

    // Only the event reaches Lena at first.
    const record = martin.replica.events((r) => r.id === post.id)[0];
    expect(isWireItemV2(record.wire)).toBe(true);
    const { e } = record.wire as { e: unknown };
    expect(lena.replica.ingest({ e }).status).toBe('accepted');
    expect((await lena.posts({ space: 'Weave' })).map((p) => p.title)).not.toContain('Late body');

    sync(martin, lena);
    expect((await lena.posts({ space: 'Weave' })).map((p) => p.title)).toContain('Late body');
    // Links by id keep working: Lena upvotes it, Martin sees the vote.
    await lena.upvote({ target: post.id, value: 1 });
    sync(lena, martin);
    expect((await martin.post(post.id)).score).toBe(1);
    for (const node of [martin, lena]) await node.close();
  });

  it('moves a space’s meeting point with its key, so removed members can’t find the rest', async () => {
    const [martin, lena, kofi] = [person('Martin'), person('Lena'), person('Kofi')];
    await martin.createProject({ name: 'Weave' });
    await lena.joinSpace(await martin.invite('Weave'));
    await kofi.joinSpace(await martin.invite('Weave'));
    const all = [martin, lena, kofi];
    const syncAll = () => {
      for (let round = 0; round < 2; round++) for (const from of all) for (const to of all) if (from !== to) sync(from, to);
    };
    syncAll();
    const before = martin.topics.filter((t) => t.startsWith('space/'));
    expect(kofi.topics).toEqual(expect.arrayContaining(before));

    await martin.removeMember('Weave', 'Kofi');
    syncAll();
    await lena.reconcile();
    const after = martin.topics.filter((t) => t.startsWith('space/'));
    const moved = after.filter((t) => !before.includes(t));
    expect(moved).toHaveLength(1);
    // The previous one stays for a while, for members who haven't got the new key yet.
    expect(after).toEqual(expect.arrayContaining(before));
    expect(lena.topics).toEqual(expect.arrayContaining(moved));
    expect(kofi.topics).not.toEqual(expect.arrayContaining(moved));
    for (const node of all) await node.close();
  });

  it('lets newcomers read only what the space’s history setting allows', async () => {
    const [martin, lena, kofi] = [person('Martin'), person('Lena'), person('Kofi')];
    const all = [martin, lena, kofi];
    const syncAll = () => {
      for (let round = 0; round < 2; round++) for (const from of all) for (const to of all) if (from !== to) sync(from, to);
    };
    await martin.createProject({ name: 'Weave' });
    await lena.joinSpace(await martin.invite('Weave'));
    syncAll();
    await martin.submit({ space: 'Weave', title: 'Before Kofi' });
    expect((await martin.spaces('project'))[0].history).toBe('all');
    await expect(lena.setHistory({ space: 'Weave', history: 'joining' })).rejects.toThrow(/maintainers/);
    expect((await martin.setHistory({ space: 'Weave', history: 'joining' })).history).toBe('joining');

    // The invite comes with a key made for it: Kofi reads from here on, the others everything.
    const epochBefore = (await martin.spaces('project'))[0].epoch;
    const invite = await martin.invite('Weave');
    expect((await martin.spaces('project'))[0].epoch).toBe(epochBefore + 1);
    syncAll();
    await kofi.joinSpace(invite);
    syncAll();
    await martin.submit({ space: 'Weave', title: 'After Kofi' });
    syncAll();
    const titles = async (node: WeaveNode) => (await node.posts({ space: 'Weave' })).map((p) => p.title).sort();
    expect(await titles(kofi)).toEqual(['After Kofi']);
    // The space itself he knows in full: members and roles came restated by Martin, who let him in.
    expect((await kofi.members('Weave')).map((m) => m.name).sort()).toEqual(['Kofi', 'Lena', 'Martin']);
    expect((await kofi.spaces('project'))[0].founder).toBe(martin.identity.author);
    expect(await titles(lena)).toEqual(['After Kofi', 'Before Kofi']);
    expect((await lena.spaces('project'))[0].history).toBe('joining');
    for (const node of all) await node.close();
  });
});
