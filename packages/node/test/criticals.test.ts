import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { isWireItemV2, KIND_BOARD_RULE, KIND_CARRY, KIND_HANDOVER, KIND_SEALED, sealFor, spaceScope } from '@weave/core';
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
