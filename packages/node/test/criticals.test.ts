import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { isWireItemV2, KIND_BOARD_RULE, KIND_CARRY, KIND_HANDOVER, KIND_REKEY, KIND_SEALED, sealFor, signContentEventV2, spaceScope } from '@weave/core';
import { loadSpaces, WeaveNode, closeOpenStores } from '../src/index.ts';

/* Regression tests from Julian's pre-release review: each one reproduces an issue and checks it stays fixed. */

const dirs: string[] = [];
const nodes: WeaveNode[] = [];
afterAll(async () => {
  for (const node of nodes) await node.close();
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function person(name: string) {
  const dir = mkdtempSync(join(tmpdir(), 'weave-criticals-'));
  dirs.push(dir);
  const node = WeaveNode.init(name, dir);
  nodes.push(node);
  return node;
}

const sync = (from: WeaveNode, to: WeaveNode) => from.replica.events().forEach((e) => to.replica.ingest(e));
const stored = (node: WeaveNode, name: string) => loadSpaces(node.home).find((s) => s.name === name)!;
const day = 24 * 3600 * 1000;

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

describe("a carry can't forge events (FQ59bhoy)", () => {
  const byId = (node: WeaveNode, id: string) => loadSpaces(node.home).find((x) => x.id === id)!;
  const names = async (node: WeaveNode, space: string) => (await node.members(space)).map((m) => m.name).sort();

  it("a maintainer can't take a project over with a forged handover in a carry", async () => {
    const martin = person('Martin');
    const kofi = person('Kofi');
    const all = [martin, kofi];
    const syncAll = () => {
      for (let round = 0; round < 2; round++) for (const a of all) for (const b of all) if (a !== b) sync(a, b);
    };
    await martin.createProject({ name: 'Weave' });
    await kofi.joinSpace(await martin.invite('Weave'));
    syncAll();
    await martin.setMaintainer({ project: 'Weave', who: 'Kofi', on: true });
    syncAll();
    const space = byId(kofi, (await kofi.spaces('project'))[0].id);
    const forged = { id: 'forged-handover', author: martin.identity.author, signer: martin.identity.author, seq: 7, time: new Date().toISOString(), kind: KIND_HANDOVER, body: { to: kofi.identity.author } };
    kofi.replica.write(kofi.identity, sealFor(space, { kind: KIND_CARRY, body: { events: [forged] } }));
    syncAll();
    expect((await martin.spaces('project'))[0].founder).toBe(martin.identity.author);
    await expect(kofi.removeMember('Weave', 'Martin')).rejects.toThrow();
    syncAll();
    expect(await names(martin, 'Weave')).toEqual(['Kofi', 'Martin']);
  });

  it('a plain member who invited someone hands over keys, never state: no forged rule, no forged handover on their node', async () => {
    const [bob, alice, kofi, carol] = [person('Bob'), person('Alice'), person('Kofi'), person('Carol')];
    const all = [bob, alice, kofi, carol];
    const syncAll = () => {
      for (let round = 0; round < 2; round++) for (const a of all) for (const b of all) if (a !== b) sync(a, b);
    };
    await bob.createCommunity({ name: 'Synths' });
    await alice.joinSpace(await bob.invite('Synths'));
    await kofi.joinSpace(await bob.invite('Synths'));
    const post = await kofi.submit({ space: 'Synths', title: "Kofi's post" });
    syncAll();
    await carol.joinSpace(await alice.invite('Synths')); // Alice is no moderator; she invited Carol
    syncAll();
    const space = byId(alice, (await alice.spaces('community'))[0].id);
    const forge = (events: unknown[]) => alice.replica.write(alice.identity, sealFor(space, { kind: KIND_CARRY, body: { events: events as never } }));
    forge([{ id: 'forged-rule', author: bob.identity.author, signer: bob.identity.author, seq: 998, time: new Date().toISOString(), kind: KIND_BOARD_RULE, body: { board: 'posts', keepDays: 1, maxMB: null } }]);
    syncAll();
    const holds = (node: WeaveNode, id: string) => {
      const r = node.replica.record2(id);
      return !!r && !r.missing && isWireItemV2(r.wire);
    };
    carol.clock = () => Date.now() + 20 * day;
    await carol.reconcile();
    expect(holds(carol, post.id)).toBe(true);
    forge([{ id: 'forged-handover', author: bob.identity.author, signer: bob.identity.author, seq: 999, time: new Date().toISOString(), kind: KIND_HANDOVER, body: { to: alice.identity.author } }]);
    syncAll();
    expect((await carol.spaces('community')).find((x) => x.name === 'Synths')?.founder).toBe(bob.identity.author);
  });
});

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

describe("a member's own rekey doesn't stop rotation after they leave (Gr9S4DLf)", () => {
  const groupEpoch = async (node: WeaveNode) => (await node.spaces('group'))[0].epoch;

  it('a future-dated rekey with no boxes, then a leave: the founder still rotates', async () => {
    const [martin, lena] = [person('Martin'), person('Lena')];
    const all = [martin, lena];
    const syncAll = () => {
      for (let round = 0; round < 2; round++) for (const a of all) for (const b of all) if (a !== b) sync(a, b);
    };
    await martin.createGroup('Synth friends');
    await lena.joinSpace(await martin.invite('Synth friends'));
    syncAll();
    const space = stored(lena, 'Synth friends');
    lena.replica.write(lena.identity, { kind: KIND_REKEY, scope: spaceScope(space), body: { epoch: 0, boxes: {} }, time: '2099-01-01T00:00:00.000Z' });
    syncAll();
    await lena.leave('Synth friends');
    syncAll();
    await martin.reconcile();
    expect(await groupEpoch(martin)).toBe(1);
    // Once: the rotation itself counts as the rekey after the leave.
    await martin.reconcile();
    expect(await groupEpoch(martin)).toBe(1);
  });

  it('a leave dated long before the last rekey still rotates once it arrives after it', async () => {
    const [martin, lena, kofi] = [person('Martin'), person('Lena'), person('Kofi')];
    const all = [martin, lena, kofi];
    const syncAll = () => {
      for (let round = 0; round < 2; round++) for (const a of all) for (const b of all) if (a !== b) sync(a, b);
    };
    await martin.createGroup('Synth friends');
    await lena.joinSpace(await martin.invite('Synth friends'));
    await kofi.joinSpace(await martin.invite('Synth friends'));
    syncAll();
    await martin.removeMember('Synth friends', 'Kofi'); // a rekey, to epoch 1
    syncAll();
    expect(await groupEpoch(martin)).toBe(1);
    lena.clock = () => Date.now() - 30 * 24 * 3600 * 1000;
    const backdated = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    lena.replica.write(lena.identity, { ...sealFor(stored(lena, 'Synth friends'), { kind: 'weave.space.leave', body: {} }), time: backdated });
    syncAll();
    await martin.reconcile();
    expect(await groupEpoch(martin)).toBe(2);
  });
});
