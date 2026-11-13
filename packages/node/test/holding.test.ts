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
  const dir = mkdtempSync(join(tmpdir(), 'weave-holding-'));
  dirs.push(dir);
  return WeaveNode.init(name, dir);
}

const sync = (from: WeaveNode, to: WeaveNode) => from.replica.events().forEach((e) => to.replica.ingest(e));
const day = 24 * 3600 * 1000;

/** Does this node hold the body of this event? */
const holds = (node: WeaveNode, id: string) => {
  const record = node.replica.record2(id);
  return !!record && !record.missing && isWireItemV2(record.wire);
};

describe('content held by members', () => {
  it('lets members of a big space hold its content between them: each post by at least 3, and what each keeps', async () => {
    const [owner, lena, kofi, ada, noah] = ['Martin', 'Lena', 'Kofi', 'Ada', 'Noah'].map(person);
    const all = [owner, lena, kofi, ada, noah];
    const syncAll = () => {
      for (let round = 0; round < 2; round++) for (const from of all) for (const to of all) if (from !== to) sync(from, to);
    };
    await owner.createCommunity({ name: 'Synths' });
    for (const node of [lena, kofi, ada, noah]) await node.joinSpace(await owner.invite('Synths'));
    syncAll();
    const posts = [];
    for (const [i, node] of [lena, kofi, ada, noah, lena, kofi, ada, noah].entries()) posts.push(await node.submit({ space: 'Synths', title: `Post ${i}` }));
    syncAll();
    const liked = posts[1]; // Kofi's
    await lena.upvote({ target: liked.id, value: 1 });
    syncAll();
    // Small spaces replicate fully: everyone holds everything.
    for (const p of posts) expect(all.filter((n) => holds(n, p.id))).toHaveLength(5);

    // Now count it as big (more than 2 members here), and three weeks on: past the recent window.
    for (const node of all) {
      node.pulledAbove = 2;
      node.clock = () => Date.now() + 21 * day;
    }
    for (const node of all) await node.reconcile();

    for (const p of posts) {
      const holders = all.filter((n) => holds(n, p.id));
      // The owner, the author, and the share: never fewer than 3.
      expect(holders.length).toBeGreaterThanOrEqual(3);
      expect(holders).toContain(owner);
    }
    // Lena keeps what she wrote and what she upvoted.
    for (const p of posts.filter((p) => p.by.did === lena.identity.author)) expect(holds(lena, p.id)).toBe(true);
    expect(holds(lena, liked.id)).toBe(true);
    // Some is let go somewhere: that's the point.
    expect(posts.some((p) => all.some((n) => !holds(n, p.id)))).toBe(true);

    // Each post says roughly who holds it.
    const shown = (await lena.posts({ space: 'Synths' })).find((p) => p.id === liked.id)!;
    expect(shown.heldBy).toMatchObject({ author: true, recent: false, upvoters: 1 });
    expect(shown.heldBy!.about).toBeGreaterThanOrEqual(3);
    for (const node of all) await node.close();
  });
});

describe("a person's spaces on each of their devices", () => {
  it('a device restored from the words gets every space, the big ones too', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'weave-holding-'));
    dirs.push(dir);
    const { node: martl, words } = WeaveNode.create('Martl', dir);
    const others = ['Lena', 'Kofi', 'Ada', 'Noah'].map(person);
    await martl.createGroup('Small');
    await martl.createGroup('Crowd');
    for (const node of others) await node.joinSpace(await martl.invite('Crowd'));
    for (let round = 0; round < 2; round++) for (const a of [martl, ...others]) for (const b of [martl, ...others]) if (a !== b) sync(a, b);
    await martl.reconcile();

    const second = mkdtempSync(join(tmpdir(), 'weave-holding-'));
    dirs.push(second);
    const restored = await WeaveNode.restore(words, second, { events: martl.replica.events().map((r) => r.wire) });
    // It writes no list of its own before it has taken theirs.
    await restored.reconcile();
    sync(restored, martl);
    sync(martl, restored);
    await restored.reconcile();
    const names = (await restored.spaces()).map((s) => s.name);
    expect(names).toContain('Small');
    expect(names).toContain('Crowd');
    for (const node of [martl, restored, ...others]) await node.close();
  });
});
