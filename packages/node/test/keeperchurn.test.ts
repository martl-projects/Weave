import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { duplexPair, PeerSession2 } from '@weave/net';
import { WeaveNode, closeOpenStores } from '../src/index.ts';

/*
 * Keepers over time (the review of 4.11.2026, issue nn5l): a keeper's "last seen" survives a restart, so keepers
 * aren't replaced after every update; an empty direct chat (derived for everyone whose log we hold) isn't kept; and a
 * keeper no longer chosen lets the stream go, instead of holding our wrapped data for good.
 */

const dirs: string[] = [];
const open: WeaveNode[] = [];
afterAll(async () => {
  for (const node of open) await node.close().catch(() => {});
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), 'weave-keeperchurn-'));
  dirs.push(dir);
  return dir;
};
const person = (name: string, dir = temp()) => {
  const node = WeaveNode.init(name, dir);
  open.push(node);
  return node;
};

const day = 24 * 3600 * 1000;
const sync = (from: WeaveNode, to: WeaveNode) => from.replica.events().forEach((e) => to.replica.ingest(e));
const syncAll = (all: WeaveNode[]) => {
  for (const from of all) for (const to of all) if (from !== to) sync(from, to);
};
/** Everyone follows everyone: friends all round. */
async function befriend(all: WeaveNode[]): Promise<void> {
  syncAll(all);
  for (const a of all) for (const b of all) if (a !== b) await a.setEdge({ edge: 'follow', who: b.identity.author, on: true });
  syncAll(all);
}

/** Two nodes connected as over the network (the v2 session, keepers included). */
function link(a: WeaveNode, b: WeaveNode): () => void {
  const [sa, sb] = duplexPair();
  const left = new PeerSession2(a.replica, sa, { access: a.sessionAccess() });
  const right = new PeerSession2(b.replica, sb, { access: b.sessionAccess() });
  return () => (left.close(), right.close());
}
const settle = (ms = 1200) => new Promise((resolve) => setTimeout(resolve, ms));
/** Connect for a moment, long enough for keeping? and keep to go round. */
async function meet(a: WeaveNode, b: WeaveNode): Promise<void> {
  const unlink = link(a, b);
  await settle();
  unlink();
}
const selfKeepers = async (node: WeaveNode) => (await node.keepers()).spaces.find((s) => s.space.id === 'self')!.keepers.map((k) => k.did).sort();
const byDid = (all: WeaveNode[], did: string) => all.find((n) => n.identity.author === did)!;

describe('keepers over time', { timeout: 60_000 }, () => {
  it("remember when a keeper was last seen across a restart: an update doesn't replace them", async () => {
    const home = temp();
    let martin = person('Martin', home);
    const friends = ['Ada', 'Ben', 'Cleo', 'Dev'].map((n) => person(n));
    await befriend([martin, ...friends]);
    const start = Date.now();
    martin.clock = () => start;
    const chosen = await selfKeepers(martin);
    expect(chosen).toHaveLength(3);

    // Ten days on, the keepers are around; nothing else changes (no new space, no new keep index).
    martin.clock = () => start + 10 * day;
    for (const did of chosen) await meet(martin, byDid(friends, did));
    expect(await selfKeepers(martin)).toEqual(chosen);

    // Weave restarts (an update), and another ten days pass: the keepers were seen ten days ago, not twenty.
    await martin.close();
    open.splice(open.indexOf(martin), 1);
    martin = WeaveNode.open(home);
    open.push(martin);
    martin.clock = () => start + 20 * day;
    expect(await selfKeepers(martin)).toEqual(chosen);
  });

  it("don't keep an empty direct chat: one is derived for everyone whose log we hold", async () => {
    const martin = person('Martin');
    const eve = person('Eve');
    const kofi = person('Kofi');
    await befriend([martin, eve, kofi]);
    const kept = async () => (await martin.keepers()).spaces.map((s) => s.space.kind + ':' + s.space.name);
    // Friends, logs held, the direct chats derived: nothing in them, nothing to keep (and no keeper chosen for them).
    expect(await kept()).toEqual(['group:your own space']);
    const chat = await martin.openChat('Eve');
    expect(await kept()).toEqual(['group:your own space']);
    await meet(martin, kofi);
    expect(kofi.replica.store.keepBytes()).toBe(0);
    await martin.say({ space: chat.id, text: 'hello Eve' });
    expect(await kept()).toEqual(['group:your own space', 'direct:Eve']);
    await meet(martin, kofi);
    expect(kofi.replica.store.keepBytes()).toBeGreaterThan(0);
  });

  it('tell a keeper that was replaced to let the stream go, once we hold all of it', async () => {
    const martin = person('Martin');
    const friends = ['Ada', 'Ben', 'Cleo', 'Dev'].map((n) => person(n));
    await befriend([martin, ...friends]);
    await martin.reconcile(); // writes the keep index: something in the self space to keep
    const start = Date.now();
    martin.clock = () => start;
    for (const f of friends) await meet(martin, f);
    const chosen = await selfKeepers(martin);
    const keepers = chosen.map((did) => byDid(friends, did));
    const spare = friends.find((f) => !chosen.includes(f.identity.author))!;
    for (const k of keepers) expect(k.replica.store.keepBytes()).toBeGreaterThan(0);
    expect(spare.replica.store.keepBytes()).toBe(0);

    // Fifteen days without seeing anyone: the spare friend comes by first and is the only fresh one, so it becomes a
    // keeper. Two of the old keepers come back in time and keep their place; the third finds it taken.
    martin.clock = () => start + 15 * day;
    await meet(martin, spare);
    expect(await selfKeepers(martin)).toEqual([spare.identity.author]);
    expect(spare.replica.store.keepBytes()).toBeGreaterThan(0);
    await meet(martin, keepers[0]);
    await meet(martin, keepers[1]);
    expect(await selfKeepers(martin)).toEqual([spare, keepers[0], keepers[1]].map((n) => n.identity.author).sort());
    await meet(martin, keepers[2]);
    expect(await selfKeepers(martin)).toEqual([spare, keepers[0], keepers[1]].map((n) => n.identity.author).sort());
    // The replaced keeper let go; the others still hold theirs.
    expect(keepers[2].replica.store.keepBytes()).toBe(0);
    for (const k of [spare, keepers[0], keepers[1]]) expect(k.replica.store.keepBytes()).toBeGreaterThan(0);
  });
});
