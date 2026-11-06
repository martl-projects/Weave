import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { keepStreamId, keepTag, keepWrapKey, recoveryEncryptionKey, wrapForKeeper, type Json } from '@weave/core';
import { duplexPair, PeerSession2 } from '@weave/net';
import { WeaveNode, closeOpenStores } from '../src/index.ts';
import { writeSecretJson } from '../src/vault.ts';

/*
 * Keepers are taken out (decided 6.11.2026): a person saves their own Weave as a backup file, and nothing new is
 * kept with friends. Until then friends kept wrapped copies of each other's small spaces. Those copies are wound
 * down without costing anyone their only copy: the update itself deletes nothing, a node still gives back what it
 * holds, an owner tells friends to let go when they decide to, a keeper can let go, and what nobody asks about for a
 * year goes by itself.
 */

const dirs: string[] = [];
const open: WeaveNode[] = [];
afterAll(async () => {
  for (const node of open) await node.close().catch(() => {});
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), 'weave-copies-'));
  dirs.push(dir);
  return dir;
};
const person = (name: string) => {
  const node = WeaveNode.init(name, temp());
  open.push(node);
  return node;
};
/** Someone whose recovery words we know: what their keepers got was wrapped with a key from them. */
const withWords = (name: string) => {
  const made = WeaveNode.create(name, temp());
  open.push(made.node);
  return made;
};
const closed = async (node: WeaveNode) => {
  await node.close();
  open.splice(open.indexOf(node), 1);
};
const reopened = async (node: WeaveNode) => {
  const dir = node.home.dir;
  await closed(node);
  const again = WeaveNode.open(dir);
  open.push(again);
  return again;
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

/** Two nodes connected as over the network (the v2 session). */
function link(a: WeaveNode, b: WeaveNode): () => void {
  const [sa, sb] = duplexPair();
  const left = new PeerSession2(a.replica, sa, { access: a.sessionAccess() });
  const right = new PeerSession2(b.replica, sb, { access: b.sessionAccess() });
  return () => (left.close(), right.close());
}
const settle = (ms = 1500) => new Promise((resolve) => setTimeout(resolve, ms));
/** Connect for a moment, long enough for the questions and answers to go round. */
async function meet(a: WeaveNode, b: WeaveNode): Promise<void> {
  const unlink = link(a, b);
  await settle();
  unlink();
}
const bytes = (node: WeaveNode) => node.replica.store.keepBytes();
const entry = async (node: WeaveNode, other: WeaveNode) => (await node.keepers()).friends.find((f) => f.who.did === other.identity.author);
const texts = async (node: WeaveNode, space: string) => (await node.feed({ space, kinds: ['weave.msg'] })).map((i) => (i.body as { text: string }).text).sort();

/**
 * What a Weave with keepers did, done by hand (no Weave does it any more): every event of the owner's own space,
 * direct chats and small groups, wrapped with a key from their recovery words, at each keeper; and the owner's file
 * saying whom it chose. The owner is opened again afterwards, as after an update.
 */
async function keptBefore(owner: WeaveNode, words: string, keepers: WeaveNode[]): Promise<WeaveNode> {
  await owner.reconcile(); // writes the keep index: the keys of the small spaces, in the owner's own space
  const secret = recoveryEncryptionKey(words, 0).secretKey;
  const scopes = [...new Set(owner.replica.events((r) => !!r.scope && r.scope !== 'public').map((r) => r.scope))];
  for (const scope of scopes) {
    const key = keepWrapKey(secret, scope);
    for (const keeper of keepers) {
      const id = keepStreamId(secret, scope, keeper.identity.author);
      for (const record of owner.replica.events((r) => r.scope === scope)) keeper.replica.store.keepPut(id, keepTag(key, record.id), wrapForKeeper(key, record.wire as unknown as Json));
    }
  }
  const chosen = keepers.map((k) => k.identity.author);
  writeSecretJson(owner.home, join(owner.home.dir, 'keepers.json'), { spaces: Object.fromEntries(scopes.map((scope) => [scope, chosen])), seen: {}, index: '' });
  return reopened(owner);
}

describe('copies from before keepers were taken out', { timeout: 120_000 }, () => {
  it('nothing new is kept with anyone', async () => {
    const martin = person('Martin');
    const kofi = person('Kofi');
    const eve = person('Eve');
    await befriend([martin, kofi, eve]);
    await martin.reconcile();
    const chat = await martin.openChat('Eve');
    await martin.say({ space: chat.id, text: 'hello Eve' });
    await meet(martin, kofi);
    await martin.say({ space: chat.id, text: 'and again' });
    await meet(martin, kofi);
    expect(bytes(kofi)).toBe(0);
    expect(bytes(martin)).toBe(0);
    // Nobody holds anything for anybody: nothing to show, for either.
    for (const node of [martin, kofi]) expect(await node.keepers()).toMatchObject({ friends: [], forOthers: 0, forUnknown: 0, spaces: [] });
  });

  it('bring back a direct chat and a small group after both people lost every device', async () => {
    const martinMade = withWords('Martin');
    const lenaMade = withWords('Lena');
    let [martin, lena] = [martinMade.node, lenaMade.node];
    const keepers = ['Kofi', 'Ada', 'Noah'].map((name) => person(name));
    await befriend([martin, lena, ...keepers]);

    // From here on only the two of them hand each other events, as members-only sync does.
    const between = () => (sync(martin, lena), sync(lena, martin));
    const chat = await martin.openChat('Lena');
    await martin.say({ space: chat.id, text: 'only between us' });
    await martin.createGroup('Duo');
    await lena.joinSpace(await martin.invite('Duo'));
    between();
    await lena.say({ space: chat.id, text: 'yes, just us' });
    await lena.say({ space: 'Duo', text: 'our little group' });
    between();

    // Their Weave had keepers: three friends hold wrapped copies, never the chat's events.
    martin = await keptBefore(martin, martinMade.words, keepers);
    lena = await keptBefore(lena, lenaMade.words, keepers);
    const held = keepers.map(bytes);
    for (const n of held) expect(n).toBeGreaterThan(0);
    for (const k of keepers) expect(k.replica.events((r) => r.scope === `direct:${chat.id}`)).toHaveLength(0);

    // Both lose everything, and neither saved a backup.
    const publicOf = (node: WeaveNode) => node.replica.events((r) => r.scope === 'public' || r.v === 1);
    await closed(martin);
    await closed(lena);
    martin = await WeaveNode.restore(martinMade.words, temp(), { events: publicOf(keepers[0]) });
    lena = await WeaveNode.restore(lenaMade.words, temp(), { events: publicOf(keepers[0]) });
    open.push(martin, lena);
    expect(await texts(martin, chat.id).catch(() => [])).toEqual([]);

    // Back online with their friends: the copies from before come back, though nobody keeps anything new.
    const again = keepers.flatMap((k) => [link(martin, k), link(lena, k)]);
    await settle(2500);
    for (const node of [martin, lena]) await node.reconcile();
    await settle(2000);
    for (const unlink of again) unlink();
    expect(await texts(martin, chat.id)).toEqual(['only between us', 'yes, just us']);
    expect(await texts(lena, chat.id)).toEqual(['only between us', 'yes, just us']);
    expect(await texts(martin, 'Duo')).toEqual(['our little group']);
    expect(await texts(lena, 'Duo')).toEqual(['our little group']);
    // Giving it back ended nothing, and added nothing: a restored node tells nobody to let go.
    expect(keepers.map(bytes)).toEqual(held);
  });

  it("stay where they are after the update, until their owner lets them go: updating deletes nobody's only copy", async () => {
    const made = withWords('Martin');
    let martin = made.node;
    const lena = person('Lena');
    const [ada, ben] = ['Ada', 'Ben'].map((n) => person(n));
    await befriend([martin, lena, ada, ben]);
    const chat = await martin.openChat('Lena');
    await martin.say({ space: chat.id, text: 'only between us' });
    martin = await keptBefore(martin, made.words, [ada, ben]);
    const before = [bytes(ada), bytes(ben)];

    // His node says who may still hold a copy, before it has asked anyone.
    expect((await martin.keepers()).friends.map((f) => [f.who.name, f.before])).toEqual([['Ada', true], ['Ben', true]]);

    // They meet after the update: nothing is deleted, nothing new is sent, and his node knows what Ada holds.
    await martin.say({ space: chat.id, text: 'written after the update' });
    await meet(martin, ada);
    expect(bytes(ada)).toBe(before[0]);
    expect((await entry(martin, ada))!.holds!.items).toBeGreaterThan(0);
    expect((await entry(martin, ada))!.before).toBeUndefined();
    // Ada sees that she holds something, and whose it is since he asked.
    expect(await entry(ada, martin)).toMatchObject({ kept: { bytes: before[0] } });
    expect((await ada.keepers()).forUnknown).toBe(0);
    // Lena never held anything: once she said so, she isn't listed (or asked again).
    await meet(martin, lena);
    expect(await entry(martin, lena)).toBeUndefined();

    // He loses everything before saving a backup: the copies from before still bring back what they held.
    await closed(martin);
    const publicOf = (node: WeaveNode) => node.replica.events((r) => r.scope === 'public' || r.v === 1);
    martin = await WeaveNode.restore(made.words, temp(), { events: publicOf(ada) });
    open.push(martin);
    await meet(martin, ben);
    await martin.reconcile();
    await meet(martin, ben);
    expect(await texts(martin, chat.id)).toEqual(['only between us']);
    expect([bytes(ada), bytes(ben)]).toEqual(before);

    // He decides that Ben's copy goes (after saving a backup): Ben lets go when they next meet, Ada isn't told.
    await martin.saveBackup({ to: temp() });
    await martin.letCopiesGo({ who: 'Ben' });
    expect(await entry(martin, ben)).toMatchObject({ lettingGo: true });
    await meet(martin, ben);
    await meet(martin, ada);
    expect(bytes(ben)).toBe(0);
    expect(bytes(ada)).toBe(before[0]);
    // Told once, not for good: Ben answered that he holds nothing, and that's the end of it.
    expect(await entry(martin, ben)).toBeUndefined();

    // Then all of them. Ada isn't his friend any more by then, but they still meet (in a group they share): she is
    // told all the same.
    await martin.createGroup('Pair');
    await ada.joinSpace(await martin.invite('Pair'));
    sync(ada, martin);
    await martin.setEdge({ edge: 'follow', who: ada.identity.author, on: false });
    await martin.letCopiesGo();
    expect(await entry(martin, ada)).toMatchObject({ gone: true, lettingGo: true });
    await meet(martin, ada);
    expect(bytes(ada)).toBe(0);
    expect((await martin.keepers()).friends).toEqual([]);
  });

  it('let a keeper let go: of one friend, of everyone, and by itself of what nobody asked about for a year', async () => {
    const kofi = person('Kofi');
    const owners = ['Martin', 'Lena', 'Nia'].map((n) => withWords(n));
    await befriend([kofi, ...owners.map((o) => o.node)]);
    const [martin, lena, nia] = await Promise.all(owners.map((o) => keptBefore(o.node, o.words, [kofi])));
    const start = Date.now();
    let now = start;
    kofi.clock = () => now;
    // Before anyone asked, Kofi can't say whose the copies are.
    expect(await kofi.keepers()).toMatchObject({ friends: [], forOthers: bytes(kofi), forUnknown: bytes(kofi), graceDays: 365 });
    for (const owner of [martin, lena, nia]) await meet(owner, kofi);
    const info = await kofi.keepers();
    const kept = (name: string, from = info) => from.friends.find((f) => f.who.name === name)?.kept?.bytes ?? 0;
    for (const name of ['Martin', 'Lena', 'Nia']) expect(kept(name)).toBeGreaterThan(0);
    expect(kept('Martin') + kept('Lena') + kept('Nia')).toBe(info.forOthers);
    expect(info.forUnknown).toBe(0);

    // Kofi lets go of Martin's: the others' stay, and the next meeting brings nothing back.
    const after = await kofi.dropKept({ who: 'Martin' });
    expect(kept('Martin', after)).toBe(0);
    expect(bytes(kofi)).toBe(kept('Lena') + kept('Nia'));
    await meet(martin, kofi);
    expect(bytes(kofi)).toBe(kept('Lena') + kept('Nia'));

    // Kofi's computer runs on, day after day (a year counts only while it runs).
    const run = async (days: number) => {
      for (let i = 0; i < days; i++) {
        now += day;
        await kofi.reconcile();
      }
    };
    // Eleven months on, Lena was never seen again: still kept. Nia comes by.
    await run(330);
    await meet(nia, kofi);
    expect(kept('Lena', await kofi.keepers())).toBe(kept('Lena'));

    // After a year nobody asked about Lena's copy: its time is over, and a week later it goes. Nia's, asked about a
    // month ago, stays.
    await run(36);
    expect(kept('Lena', await kofi.keepers())).toBe(kept('Lena'));
    await run(8);
    const later = await kofi.keepers();
    expect(kept('Lena', later)).toBe(0);
    expect(kept('Nia', later)).toBe(kept('Nia'));

    // Kofi's computer is off for two years: nobody could ask in that time, so nothing goes when it comes back.
    now += 730 * day;
    await kofi.reconcile();
    await run(30);
    expect(kept('Nia', await kofi.keepers())).toBe(kept('Nia'));

    // And everything at once.
    expect((await kofi.dropKept()).forOthers).toBe(0);
    expect(bytes(kofi)).toBe(0);
  });
});
