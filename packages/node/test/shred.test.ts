import { describe, expect, it } from 'vitest';
import { isWireItemV2, KIND_SEALED, spaceScope } from '@weave/core';
import { WeaveNode } from '../src/index.ts';
import { people, sync, stored, day } from './helpers/people.ts';

/*
 * Regression tests from the pre-release review, each reproducing an issue (its
 * id in the test's name) and checking it stays fixed.
 * They guard retention.ts (Forgetting): shredding and forgetting.
 */

const { person } = people('shred');

describe("a shred in one space doesn't touch another's bodies (4ymKomEg)", () => {
  it("keeps a member's message in their group when someone shreds a copy of its body in a space they manage", async () => {
    const [bob, alice] = [person('Bob'), person('Alice')];
    const all = [bob, alice];
    const syncAll = () => {
      for (let round = 0; round < 3; round++) for (const from of all) for (const to of all) if (from !== to) sync(from, to);
    };
    await bob.createGroup('Home');
    await alice.joinSpace(await bob.invite('Home'));
    const msg = await bob.say({ space: 'Home', text: 'my private note' });
    syncAll();
    const victim = bob.replica.record2(msg.id)!;
    const hash = (victim.wire as { e: { body: string } }).e.body;

    await alice.createProject({ name: 'Trap' });
    await bob.joinSpace(await alice.invite('Trap'));
    syncAll();
    await alice.setHistory({ space: 'Trap', history: '30d' });
    await alice.reconcile(); // rotates Trap to epoch 1
    syncAll();
    expect(Object.keys(stored(bob, 'Trap').keys).sort()).toEqual(['0', '1']);
    const trap = stored(alice, 'Trap');
    // Alice's event in Trap, carrying Bob's sealed Home body byte for byte (epoch 0 in the clear).
    alice.replica.write(alice.identity, { kind: KIND_SEALED, scope: spaceScope(trap), class: 'content', body: victim.body } as never);
    const done = await alice.shred({ space: 'Trap', before: new Date(Date.now() + 32 * day).toISOString() });
    expect(done.epochs).toEqual([0]);
    syncAll();
    await bob.reconcile();
    expect(bob.replica.store.body(hash)).toBeDefined();
    expect(bob.replica.store.forgotten(hash)).toBe(false);
    expect((await bob.messages('Home')).map((m) => m.text)).toContain('my private note');
  });
});

describe("a shred keeps what the shredder's node didn't hold (zLqeyEBC)", { timeout: 180_000 }, () => {
  it('a moderator who let go of bodies shreds: the owner carries the rest forward and keeps it', async () => {
    const nodes = ['Martin', 'Lena', 'A', 'B', 'C'].map(person);
    const [martin, lena, ...others] = nodes;
    const syncAll = () => {
      for (let round = 0; round < 2; round++) for (const from of nodes) for (const to of nodes) if (from !== to) sync(from, to);
    };
    const holds = (node: WeaveNode, id: string) => {
      const r = node.replica.record2(id);
      return !!r && !r.missing && isWireItemV2(r.wire) && r.wire.b !== undefined;
    };
    await martin.createCommunity({ name: 'Synths' });
    for (const node of nodes.slice(1)) await node.joinSpace(await martin.invite('Synths'));
    syncAll();
    await martin.setModerator({ community: 'Synths', who: 'Lena', on: true });
    const posts = [];
    for (let i = 0; i < 12; i++) posts.push(await others[i % others.length].submit({ space: 'Synths', title: `Post ${i}` }));
    syncAll();
    for (const node of nodes) node.pulledAbove = 2;
    lena.clock = () => Date.now() + 21 * day;
    await lena.reconcile();
    const released = posts.filter((p) => !holds(lena, p.id));
    expect(released.length).toBeGreaterThan(0);
    for (const p of posts) expect(holds(martin, p.id)).toBe(true);
    await martin.setHistory({ space: 'Synths', history: '30d' });
    await martin.reconcile();
    // To Lena without bodies: she keeps only her share (a sync would hand her the released ones again).
    const bare = (from: WeaveNode, to: WeaveNode) => from.replica.events().forEach((e) => to.replica.ingest(isWireItemV2(e.wire) ? { e: e.wire.e } : e));
    for (let round = 0; round < 2; round++) for (const from of nodes) for (const to of nodes) if (from !== to) (to === lena ? bare : sync)(from, to);
    expect(posts.filter((p) => !holds(lena, p.id)).length).toBe(released.length);
    const done = await lena.shred({ space: 'Synths', before: new Date(Date.now() + 32 * day).toISOString() });
    expect(done.epochs).toEqual([0]);
    syncAll();
    for (const node of nodes) await node.reconcile();
    syncAll();
    const titles = (await martin.posts({ space: 'Synths' })).map((p) => p.title);
    for (const p of released) expect(titles).toContain(p.title);
  });
});

describe('a carried post is forgotten when it comes due (7I92Kk20)', () => {
  it('carried by a shred, due later: gone for the others, kept by its author', async () => {
    const [martin, lena, kofi] = [person('Martin'), person('Lena'), person('Kofi')];
    const all = [martin, lena, kofi];
    const syncAll = () => {
      for (let round = 0; round < 3; round++) for (const a of all) for (const b of all) if (a !== b) sync(a, b);
    };
    await martin.createProject({ name: 'Weave' });
    await lena.joinSpace(await martin.invite('Weave'));
    await kofi.joinSpace(await martin.invite('Weave'));
    syncAll();
    await martin.setBoardRule({ space: 'Weave', board: 'ideas', keepDays: 40 });
    await lena.submit({ space: 'Weave', title: 'Lena old' });
    syncAll();
    martin.clock = () => Date.now() + 31 * day;
    await martin.reconcile(); // a new key: the space has a rule
    syncAll();
    expect((await martin.shred({ space: 'Weave', before: new Date(Date.now() + 32 * day).toISOString() })).epochs).toEqual([0]);
    syncAll();
    for (const node of all) await node.reconcile();
    syncAll();
    const titles = async (node: WeaveNode) => (await node.posts({ space: 'Weave' })).map((p) => p.title);
    expect(await titles(kofi)).toContain('Lena old');
    kofi.clock = () => Date.now() + 45 * day;
    await kofi.reconcile();
    expect(await titles(kofi)).not.toContain('Lena old');
    lena.clock = () => Date.now() + 45 * day;
    await lena.reconcile();
    expect(await titles(lena)).toContain('Lena old');
  });
});
