import { describe, expect, it } from 'vitest';
import { decodeInvite, gift, sealFor, signContentEventV2, spaceScope } from '@weave/core';
import { WeaveNode } from '../src/index.ts';
import { people, sync, stored } from './helpers/people.ts';

/*
 * Regression tests from the pre-release review, each reproducing an issue (its
 * id in the test's name) and checking it stays fixed.
 * They guard who's in a space: spaceState's fold and mayAct (core), the node's
 * admissions, invites and removals.
 */

const { person } = people('membership');

describe('a removed member can\'t plant old-dated content at numbers the remover never saw (H7hk7X9S, causal anchoring)', () => {
  const plant = (alice: WeaveNode, bob: WeaveNode, home: ReturnType<typeof stored>, n: number, text: string, cs?: number) => {
    const f = sealFor(home, { kind: 'weave.msg', body: { text } });
    const { event, body } = signContentEventV2(alice.identity, { kind: f.kind, space: f.scope, class: 'content', body: f.body, ih: f.ih, n, ...(cs ? { cs } : {}), time: new Date(Date.now() - 3_600_000).toISOString() });
    return bob.replica.ingest({ e: event, b: body });
  };

  async function setUp() {
    const [bob, alice, carol] = [person('Bob'), person('Alice'), person('Carol')];
    await bob.createGroup('Home');
    await alice.joinSpace(await bob.invite('Home'));
    await carol.createGroup('Side');
    await alice.joinSpace(await carol.invite('Side'));
    const side = spaceScope(stored(carol, 'Side'));
    // Bob is not in Side: he never sees the numbers Alice's key uses there.
    const syncHome = () => {
      for (const [from, to] of [[alice, bob], [bob, alice]] as const) from.replica.events().filter((e) => e.scope !== side).forEach((e) => to.replica.ingest(e));
    };
    syncHome();
    await alice.say({ space: 'Home', text: 'hi' });
    for (const text of ['a', 'b', 'c']) await alice.say({ space: 'Side', text });
    await alice.say({ space: 'Home', text: 'bye' });
    syncHome();
    const gap = alice.replica.events((e) => e.scope === side && e.signer === alice.identity.did && e.class === 'content')[1].seq;
    expect(bob.replica.store.byNumber(alice.identity.did, gap)).toBeUndefined();
    const home = stored(alice, 'Home');
    return { bob, alice, home, gap, syncHome };
  }

  it('content at a gap number, with or without a number in the space, counts as after the removal', async () => {
    const { bob, alice, home, gap } = await setUp();
    await bob.removeMember('Home', 'Alice');
    const s = bob.replica.store.contentCount(alice.identity.did, spaceScope(home));
    expect(plant(alice, bob, home, gap, 'planted, no number').status).toBe('accepted');
    expect(plant(alice, bob, home, gap + 1, 'planted at a seen number', s)).toMatchObject({ reason: expect.stringMatching(/fork/) });
    expect(plant(alice, bob, home, gap - 1 > 0 ? gap - 1 : gap + 2, 'planted past the head', s + 1).status).toBe('accepted');
    const texts = (await bob.messages('Home')).map((m) => m.text);
    expect(texts).toEqual(expect.arrayContaining(['hi', 'bye']));
    expect(texts.filter((t) => t.startsWith('planted'))).toEqual([]);
  });

  it('a removal from before anchors is anchored by whoever manages the space', async () => {
    const { bob, alice, home, gap } = await setUp();
    // As an older node removed: naming only numbers.
    const space = stored(bob, 'Home');
    bob.replica.write(bob.identity, sealFor(space, { kind: 'weave.space.remove', body: { member: alice.identity.author, upTo: { [alice.identity.did]: bob.replica.number(alice.identity.did) } } }));
    expect(await bob.reconcile()).toBeGreaterThan(0);
    const s = bob.replica.store.contentCount(alice.identity.did, spaceScope(home));
    expect(plant(alice, bob, home, gap, 'planted past the head', s + 1).status).toBe('accepted');
    expect((await bob.messages('Home')).map((m) => m.text).filter((t) => t.startsWith('planted'))).toEqual([]);
  });
});

describe("a removed maintainer can't remove who removed them, however they name what they saw (H7hk7X9S, cpjHYTDQ)", () => {
  const variants: Array<[string, (lena: WeaveNode) => Record<string, unknown>]> = [
    ['no anchors', () => ({})],
    ['empty anchors', () => ({ upTo: {}, at: {} })],
    ['a bogus key', () => ({ upTo: { 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK': 1 }, at: {} })],
    ['anchored low on purpose', (lena) => ({ upTo: { [lena.identity.did]: 1 }, at: { [lena.identity.did]: { c: 0, s: 0, n: 1 } } })],
  ];
  for (const [name, body] of variants) {
    it(`Kofi's backdated removal of Lena: ${name}`, async () => {
      const [martin, lena, kofi] = [person('Martin'), person('Lena'), person('Kofi')];
      const all = [martin, lena, kofi];
      const syncAll = () => {
        for (let round = 0; round < 2; round++) for (const a of all) for (const b of all) if (a !== b) sync(a, b);
      };
      await martin.createProject({ name: 'Weave' });
      await lena.joinSpace(await martin.invite('Weave'));
      await kofi.joinSpace(await martin.invite('Weave'));
      syncAll();
      await martin.setMaintainer({ project: 'Weave', who: 'Lena', on: true });
      await martin.setMaintainer({ project: 'Weave', who: 'Kofi', on: true });
      syncAll();
      const old = stored(kofi, 'Weave');
      await lena.removeMember('Weave', 'Kofi');
      syncAll();
      kofi.replica.write(kofi.identity, { ...sealFor(old, { kind: 'weave.space.remove', body: { member: lena.identity.author, ...body(lena) } }), time: new Date(Date.now() - 60_000).toISOString() });
      syncAll();
      for (const node of all) await node.reconcile();
      syncAll();
      const members = await martin.members('Weave');
      expect(members.map((m) => m.name).sort()).toEqual(['Lena', 'Martin']);
      expect((await lena.members('Weave')).map((m) => m.name).sort()).toEqual(['Lena', 'Martin']);
    });
  }
});

describe('removed means out until someone who could remove asks you back (_Ak3UUmp, odfs7haI)', () => {
  const names = async (node: WeaveNode, space: string) => (await node.members(space)).map((m) => m.name).sort();

  it('a removed member comes back with a new link from the owner, and not with one made before', async () => {
    const [martin, lena] = [person('Martin'), person('Lena')];
    const all = [martin, lena];
    const syncAll = () => {
      for (let round = 0; round < 2; round++) for (const a of all) for (const b of all) if (a !== b) sync(a, b);
    };
    await martin.createGroup('Synth friends');
    const early = await martin.invite('Synth friends');
    await lena.joinSpace(early);
    syncAll();
    await martin.removeMember('Synth friends', 'Lena');
    syncAll();
    await lena.joinSpace(early); // the old link: no way back
    syncAll();
    expect(await names(martin, 'Synth friends')).toEqual(['Martin']);
    await lena.joinSpace(await martin.invite('Synth friends'));
    syncAll();
    expect(await names(martin, 'Synth friends')).toEqual(['Lena', 'Martin']);
    await martin.say({ space: 'Synth friends', text: 'welcome back' });
    syncAll();
    expect((await lena.messages('Synth friends')).map((m) => m.text)).toContain('welcome back');
  });

  it("removing someone who came by an auto-admitted group isn't undone by the next reconcile", async () => {
    const [martin, kofi] = [person('Martin'), person('Kofi')];
    const all = [martin, kofi];
    const syncAll = () => {
      for (let round = 0; round < 2; round++) for (const a of all) for (const b of all) if (a !== b) sync(a, b);
    };
    await martin.createGroup('Core');
    await kofi.joinSpace(await martin.invite('Core'));
    syncAll();
    await martin.createProject({ name: 'Weave' });
    await martin.inviteGroup({ project: 'Weave', group: 'Core' });
    await martin.setRule({ project: 'Weave', group: 'Core', auto: true });
    syncAll();
    for (const node of all) await node.reconcile();
    syncAll();
    expect(await names(martin, 'Weave')).toEqual(['Kofi', 'Martin']);
    await martin.removeMember('Weave', 'Kofi');
    const epoch = (await martin.spaces('project'))[0].epoch;
    for (const node of all) await node.reconcile();
    syncAll();
    expect(await names(martin, 'Weave')).toEqual(['Martin']);
    expect((await martin.spaces('project'))[0].epoch).toBe(epoch);
    await martin.say({ space: 'Weave', text: 'after removing Kofi' });
    syncAll();
    const read = await kofi.messages('Weave').then((m) => m.map((x) => x.text), () => []);
    expect(read).not.toContain('after removing Kofi');
  });
});

describe('board rights come only with a link or a group one really holds (99ZpCdH6, xQ0as76W)', () => {
  it("a plain member can't admit an outsider 'via' an auto-admitted group", async () => {
    const [martin, lena, kofi, eve] = [person('Martin'), person('Lena'), person('Kofi'), person('Eve')];
    const all = [martin, lena, kofi, eve];
    const syncAll = () => {
      for (let round = 0; round < 2; round++) for (const a of all) for (const b of all) if (a !== b) sync(a, b);
    };
    await martin.createGroup('Core');
    await lena.joinSpace(await martin.invite('Core'));
    syncAll();
    await martin.createProject({ name: 'Weave' });
    await martin.inviteGroup({ project: 'Weave', group: 'Core' });
    await martin.setRule({ project: 'Weave', group: 'Core', auto: true });
    await kofi.joinSpace(await martin.invite('Weave'));
    syncAll();
    await martin.setBoard({ project: 'Weave', name: 'core-notes', title: 'Core notes' });
    await martin.setBoardAccess({ project: 'Weave', board: 'core-notes', read: ['group:Core'] });
    await martin.submit({ space: 'Weave', board: 'core-notes', title: 'Budget' });
    await martin.reconcile();
    syncAll();
    await kofi.createGroup('Chess');
    await eve.joinSpace(await kofi.invite('Chess'));
    syncAll();
    const project = stored(kofi, 'Weave');
    const coreId = (await martin.spaces('group')).find((s) => s.name === 'Core')!.id;
    kofi.replica.write(kofi.identity, sealFor(project, { kind: 'weave.project.admit', body: { member: eve.identity.author, via: coreId } }));
    kofi.replica.write(kofi.identity, gift(project, [eve.identity.author], spaceScope(stored(kofi, 'Chess')), { topics: [], bootstrap: [] }, (d) => kofi.replica.authority.encryptionKey(d)));
    syncAll();
    expect((await martin.members('Weave')).find((m) => m.name === 'Eve')).toBeUndefined();
    await martin.reconcile();
    syncAll();
    const read = await eve.posts({ space: 'Weave', board: 'core-notes' }).then((p) => p.map((x) => x.title), () => []);
    expect(read).toEqual([]);
  });

  it("a member can't take another link's board rights by leaving and joining with its id", async () => {
    const [martin, kofi] = [person('Martin'), person('Kofi')];
    const all = [martin, kofi];
    const syncAll = () => {
      for (let round = 0; round < 2; round++) for (const a of all) for (const b of all) if (a !== b) sync(a, b);
    };
    await martin.createProject({ name: 'Weave' });
    await kofi.joinSpace(await martin.invite('Weave'));
    syncAll();
    await martin.setBoard({ project: 'Weave', name: 'core-notes', title: 'Core notes' });
    await martin.setBoardAccess({ project: 'Weave', board: 'core-notes', read: ['Martin'] });
    await martin.submit({ space: 'Weave', board: 'core-notes', title: 'Budget' });
    await martin.reconcile();
    const link = await martin.invite('Weave', 24, { access: [{ board: 'core-notes', read: true }] }); // meant for someone else
    const inviteId = decodeInvite(link).invite;
    syncAll();
    const space = stored(kofi, 'Weave');
    kofi.replica.write(kofi.identity, sealFor(space, { kind: 'weave.space.leave', body: {} }));
    kofi.replica.write(kofi.identity, sealFor(space, { kind: 'weave.space.join', body: { invite: inviteId } }));
    syncAll();
    await martin.reconcile();
    syncAll();
    expect((await martin.members('Weave')).map((m) => m.name)).toEqual(['Martin']);
    const read = await kofi.posts({ space: 'Weave', board: 'core-notes' }).then((p) => p.map((x) => x.title), () => []);
    expect(read).toEqual([]);
  });
});

describe("history 'joining' holds when a plain member would invite (T3a83nLy)", () => {
  it("a plain member's link isn't made; the owner's is, with a fresh key", async () => {
    const [martin, lena, kofi] = [person('Martin'), person('Lena'), person('Kofi')];
    const all = [martin, lena, kofi];
    const syncAll = () => {
      for (let round = 0; round < 2; round++) for (const a of all) for (const b of all) if (a !== b) sync(a, b);
    };
    await martin.createGroup('Synth friends');
    await lena.joinSpace(await martin.invite('Synth friends'));
    syncAll();
    await martin.setHistory({ space: 'Synth friends', history: 'joining' });
    await martin.say({ space: 'Synth friends', text: 'before Kofi' });
    syncAll();
    await expect(lena.invite('Synth friends')).rejects.toThrow(/only those who manage it/);
    await kofi.joinSpace(await martin.invite('Synth friends'));
    syncAll();
    await martin.say({ space: 'Synth friends', text: 'after Kofi' });
    syncAll();
    const texts = (await kofi.messages('Synth friends')).map((m) => m.text);
    expect(texts).toContain('after Kofi');
    expect(texts).not.toContain('before Kofi');
  });
});
