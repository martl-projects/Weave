import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { KIND_SEALED, spaceScope } from '@weave/core';
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
