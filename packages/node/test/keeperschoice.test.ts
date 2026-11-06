import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { duplexPair, PeerSession2 } from '@weave/net';
import { WeaveNode, closeOpenStores } from '../src/index.ts';
import { readSecretJson, writeSecretJson } from '../src/vault.ts';

/*
 * Keepers are a choice between two friends (decided 6.11.2026): nothing is offered or taken unless both turned it on.
 * Copies from before stay where they are until someone decides: the update itself deletes nothing, so nobody loses
 * their only copy by updating. They go when their owner lets them go, when the keeper does, or when nobody asked
 * about them for a year.
 */

const dirs: string[] = [];
const open: WeaveNode[] = [];
afterAll(async () => {
  for (const node of open) await node.close().catch(() => {});
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), 'weave-keeperschoice-'));
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
/** Everyone follows everyone: friends all round. Nobody keeps copies with anybody yet. */
async function befriend(all: WeaveNode[]): Promise<void> {
  syncAll(all);
  for (const a of all) for (const b of all) if (a !== b) await a.setEdge({ edge: 'follow', who: b.identity.author, on: true });
  syncAll(all);
}
const both = async (a: WeaveNode, b: WeaveNode) => {
  await a.setKeeper({ who: b.identity.author, on: true });
  await b.setKeeper({ who: a.identity.author, on: true });
};

/** Two nodes connected as over the network (the v2 session, keepers included). */
function link(a: WeaveNode, b: WeaveNode): () => void {
  const [sa, sb] = duplexPair();
  const left = new PeerSession2(a.replica, sa, { access: a.sessionAccess() });
  const right = new PeerSession2(b.replica, sb, { access: b.sessionAccess() });
  return () => (left.close(), right.close());
}
const settle = (ms = 1500) => new Promise((resolve) => setTimeout(resolve, ms));
/** Connect for a moment, long enough for keeping?, keep and the second keeping? to go round. */
async function meet(a: WeaveNode, b: WeaveNode): Promise<void> {
  const unlink = link(a, b);
  await settle();
  unlink();
}
const bytes = (node: WeaveNode) => node.replica.store.keepBytes();
const friendOf = async (node: WeaveNode, other: WeaveNode) => (await node.keepers()).friends.find((f) => f.who.did === other.identity.author)!;
const texts = async (node: WeaveNode, space: string) => (await node.feed({ space, kinds: ['weave.msg'] })).map((i) => (i.body as { text: string }).text).sort();

/** As a node that ran before keepers were a choice left it: its keepers file knows nothing of switches. */
function asBefore(node: WeaveNode): void {
  const file = join(node.home.dir, 'keepers.json');
  const state = readSecretJson<Record<string, unknown>>(node.home, file)!;
  writeSecretJson(node.home, file, { spaces: state.spaces, seen: state.seen, index: state.index });
}

describe('keepers as a choice', { timeout: 90_000 }, () => {
  it('are off until both friends turned it on, and either can end it', async () => {
    const martin = person('Martin');
    const kofi = person('Kofi');
    const eve = person('Eve');
    await befriend([martin, kofi, eve]);
    await martin.reconcile(); // writes the keep index: something in his own space to keep
    const chat = await martin.openChat('Eve');
    await martin.say({ space: chat.id, text: 'hello Eve' });

    // Friends, and nothing more: nothing of his lands at Kofi's, and nobody is chosen.
    await meet(martin, kofi);
    expect(bytes(kofi)).toBe(0);
    expect((await martin.keepers()).spaces.every((s) => s.keepers.length === 0)).toBe(true);
    expect(await friendOf(martin, kofi)).toMatchObject({ on: false, holds: { items: 0 } });

    // Only he turned it on: Kofi takes nothing he didn't agree to, and Martin's node sees that.
    await martin.setKeeper({ who: 'Kofi', on: true });
    await meet(martin, kofi);
    expect(bytes(kofi)).toBe(0);
    expect(await friendOf(martin, kofi)).toMatchObject({ on: true, holds: { items: 0 } });

    // Only Kofi turned it on (with Eve, say, it's the other way round): Eve's node offers him nothing.
    await kofi.setKeeper({ who: 'Eve', on: true });
    await meet(eve, kofi);
    expect(bytes(kofi)).toBe(0);

    // Both: Kofi keeps Martin's own space and his chat with Eve, and Martin's node knows he holds them.
    await kofi.setKeeper({ who: 'Martin', on: true });
    await meet(martin, kofi);
    expect(bytes(kofi)).toBeGreaterThan(0);
    const holds = (await friendOf(martin, kofi)).holds!;
    expect(holds.items).toBeGreaterThan(1);
    expect((await martin.keepers()).spaces.map((s) => s.keepers.map((k) => k.name))).toEqual([['Kofi'], ['Kofi']]);
    // Kofi sees whose copy he holds, and that Martin still asks about it.
    expect(await friendOf(kofi, martin)).toMatchObject({ on: true, kept: { bytes: bytes(kofi) } });
    expect((await kofi.keepers()).forUnknown).toBe(0);

    // Kofi ends it: he takes nothing new, but what he holds stays (it may be Martin's only other copy) and is still given back.
    await kofi.setKeeper({ who: 'Martin', on: false });
    const held = bytes(kofi);
    await martin.say({ space: chat.id, text: 'one more' });
    await meet(martin, kofi);
    expect(bytes(kofi)).toBe(held);
    // Martin ends it too: now Kofi is told to let go, and does.
    await martin.setKeeper({ who: 'Kofi', on: false });
    expect(await friendOf(martin, kofi)).toMatchObject({ on: false, lettingGo: true });
    await meet(martin, kofi);
    expect(bytes(kofi)).toBe(0);
    expect(await friendOf(martin, kofi)).toMatchObject({ on: false, holds: { items: 0 } });
    expect((await friendOf(martin, kofi)).lettingGo).toBeUndefined();

    // Only friends can be asked.
    const stranger = person('Zed');
    sync(stranger, martin);
    await expect(martin.setKeeper({ who: stranger.identity.author, on: true })).rejects.toThrow(/keep copies with friends/);
  });

  it("leave copies from before where they are: updating deletes nobody's only copy", async () => {
    const made = WeaveNode.create('Martin', temp());
    let martin = made.node;
    const home = martin.home.dir;
    open.push(martin);
    const lena = person('Lena');
    const keepers = ['Ada', 'Ben'].map((n) => person(n));
    await befriend([martin, lena, ...keepers]);
    for (const k of keepers) await both(martin, k);
    const chat = await martin.openChat('Lena');
    await martin.say({ space: chat.id, text: 'only between us' });
    await martin.reconcile();
    for (const k of keepers) await meet(martin, k);
    const before = keepers.map(bytes);
    for (const n of before) expect(n).toBeGreaterThan(0);

    // The update: on both sides the keepers file is from before the choice. Nobody is switched on.
    await martin.close();
    open.splice(open.indexOf(martin), 1);
    for (const k of keepers) asBefore(k);
    martin = WeaveNode.open(home);
    asBefore(martin);
    await martin.close();
    martin = WeaveNode.open(home);
    open.push(martin);
    const reopened = keepers.map((k) => {
      const dir = k.home.dir;
      open.splice(open.indexOf(k), 1);
      return k.close().then(() => {
        const node = WeaveNode.open(dir);
        open.push(node);
        return node;
      });
    });
    const [ada, ben] = await Promise.all(reopened);

    // Martin's node says who may still hold a copy, before it has asked anyone.
    expect((await martin.keepers()).friends.filter((f) => f.before).map((f) => f.who.name).sort()).toEqual(['Ada', 'Ben']);
    expect((await martin.keepers()).spaces.every((s) => s.keepers.length === 0)).toBe(true);

    // They meet after the update: nothing is deleted, nothing new is sent, and Martin's node knows what Ada holds.
    await martin.say({ space: chat.id, text: 'written after the update' });
    await meet(martin, ada);
    expect(bytes(ada)).toBe(before[0]);
    expect(await friendOf(martin, ada)).toMatchObject({ on: false, holds: { items: expect.any(Number) } });
    expect((await friendOf(martin, ada)).holds!.items).toBeGreaterThan(0);
    expect((await friendOf(martin, ada)).before).toBeUndefined();
    // Ada sees that she holds something from before, and whose it is since he asked.
    expect(await friendOf(ada, martin)).toMatchObject({ on: false, kept: { bytes: before[0] } });

    // He loses everything before saving a backup: the copies from before still bring back what they held.
    await martin.close();
    open.splice(open.indexOf(martin), 1);
    const publicOf = (node: WeaveNode) => node.replica.events((r) => r.scope === 'public' || r.v === 1);
    martin = await WeaveNode.restore(made.words, temp(), { events: publicOf(ada) });
    open.push(martin);
    await meet(martin, ben);
    await martin.reconcile();
    await meet(martin, ben);
    expect(await texts(martin, chat.id)).toEqual(['only between us']);
    // Giving it back didn't end it: a restored node tells nobody to let go.
    expect(bytes(ben)).toBe(before[1]);
    expect(bytes(ada)).toBe(before[0]);

    // He decides that Ben's copy goes (after saving a backup): Ben lets go when they next meet, Ada isn't told.
    await martin.saveBackup({ to: temp() });
    await martin.setKeeper({ who: 'Ben', on: false });
    expect(await friendOf(martin, ben)).toMatchObject({ on: false, lettingGo: true });
    await meet(martin, ben);
    await meet(martin, ada);
    expect(bytes(ben)).toBe(0);
    expect(bytes(ada)).toBe(before[0]);
    // Told once, not for good: Ben answered that he holds nothing, and that's the end of it.
    expect((await friendOf(martin, ben)).lettingGo).toBeUndefined();

    // Then all of them. Ada isn't his friend any more by then, but they still meet (in a group they share): she is
    // told all the same.
    await martin.createGroup('Pair');
    await ada.joinSpace(await martin.invite('Pair'));
    sync(ada, martin);
    await martin.setEdge({ edge: 'follow', who: ada.identity.author, on: false });
    await martin.letCopiesGo();
    expect((await martin.keepers()).friends.find((f) => f.who.name === 'Ada')).toMatchObject({ gone: true, lettingGo: true });
    await meet(martin, ada);
    expect(bytes(ada)).toBe(0);
  });

  it("choose among friends who take: one who hasn't turned it on doesn't block a place, and nothing is sent to them", async () => {
    const martin = person('Martin');
    const friends = ['Ada', 'Ben', 'Cleo', 'Dev', 'Eli'].map((n) => person(n));
    await befriend([martin, ...friends]);
    await martin.reconcile();
    // He keeps copies with all five; only Dev and Eli do with him.
    for (const f of friends) await martin.setKeeper({ who: f.identity.author, on: true });
    const [ada, ben, cleo, dev, eli] = friends;
    for (const f of [dev, eli]) await f.setKeeper({ who: 'Martin', on: true });
    // What his node wraps for a keeper, counted: nothing is wrapped (or sent) for one who takes nothing.
    let wrapped = 0;
    const meetCounting = async (other: WeaveNode) => {
      const [sa, sb] = duplexPair();
      const access = martin.sessionAccess();
      const keep = { ...access.keep!, wrapped: (id: string, tags: string[]) => ((wrapped += tags.length), access.keep!.wrapped(id, tags)) };
      const left = new PeerSession2(martin.replica, sa, { access: { ...access, keep, firewall: access.firewall } });
      const right = new PeerSession2(other.replica, sb, { access: other.sessionAccess() });
      await settle();
      left.close();
      right.close();
    };
    for (const f of [ada, ben, cleo]) await meetCounting(f);
    expect(wrapped).toBe(0);
    for (const f of [ada, ben, cleo]) expect(await friendOf(martin, f)).toMatchObject({ on: true, holds: { items: 0, takes: false } });
    // The two who take get it, whoever came first in his order.
    for (const f of [dev, eli]) await meet(martin, f);
    for (const f of [dev, eli]) await meet(martin, f);
    expect(bytes(dev)).toBeGreaterThan(0);
    expect(bytes(eli)).toBeGreaterThan(0);
    for (const f of [ada, ben, cleo]) expect(bytes(f)).toBe(0);
    expect((await martin.keepers()).spaces[0].keepers.map((k) => k.name).sort()).toEqual(['Dev', 'Eli']);
    expect(await friendOf(martin, dev)).toMatchObject({ on: true, chosen: true, holds: { takes: true } });

    // Ada turns it on later: she gets the third place when they meet.
    await ada.setKeeper({ who: 'Martin', on: true });
    await meet(martin, ada);
    expect(bytes(ada)).toBeGreaterThan(0);
    expect((await martin.keepers()).spaces[0].keepers.map((k) => k.name).sort()).toEqual(['Ada', 'Dev', 'Eli']);

    // Ben does too, but three hold it: he stands by, and nobody is told to let go.
    await ben.setKeeper({ who: 'Martin', on: true });
    await meet(martin, ben);
    expect(bytes(ben)).toBe(0);
    for (const f of [ada, dev, eli]) expect(bytes(f)).toBeGreaterThan(0);
    expect(await friendOf(martin, ben)).toMatchObject({ on: true, holds: { items: 0, takes: true } });
    expect((await friendOf(martin, ben)).chosen).toBeUndefined();
  });

  it('let a keeper let go: of one friend, of everyone, and by itself of what nobody asked about for a year', async () => {
    const kofi = person('Kofi');
    const martin = person('Martin');
    const lena = person('Lena');
    await befriend([kofi, martin, lena]);
    for (const owner of [martin, lena]) {
      await both(owner, kofi);
      await owner.reconcile();
    }
    const start = Date.now();
    kofi.clock = () => start;
    await meet(martin, kofi);
    await meet(lena, kofi);
    const info = await kofi.keepers();
    const kept = (name: string, from = info) => from.friends.find((f) => f.who.name === name)?.kept?.bytes ?? 0;
    expect(kept('Martin')).toBeGreaterThan(0);
    expect(kept('Lena')).toBeGreaterThan(0);
    expect(kept('Martin') + kept('Lena')).toBe(info.forOthers);
    expect(info.graceDays).toBe(365);

    // Kofi lets go of Martin's: Lena's stays. Keeping copies with Martin ends with it, so the next meeting doesn't
    // bring it all back.
    const after = await kofi.dropKept({ who: 'Martin' });
    expect(kept('Martin', after)).toBe(0);
    expect(kept('Lena', after)).toBe(kept('Lena'));
    expect(bytes(kofi)).toBe(kept('Lena'));
    expect(await friendOf(kofi, martin)).toMatchObject({ on: false });
    await meet(martin, kofi);
    expect(bytes(kofi)).toBe(kept('Lena'));

    // Kofi's computer runs on, day after day (a year counts only while it runs).
    let now = start;
    const run = async (days: number) => {
      for (let i = 0; i < days; i++) {
        now += day;
        await kofi.reconcile();
      }
    };
    kofi.clock = () => now;
    // Eleven months on, Lena was never seen again: still kept. Kofi keeps copies with Martin again, who comes by.
    await run(330);
    await kofi.setKeeper({ who: 'Martin', on: true });
    await meet(martin, kofi);
    expect(kept('Lena', await kofi.keepers())).toBe(kept('Lena'));
    expect(kept('Martin', await kofi.keepers())).toBeGreaterThan(0);

    // After a year nobody asked about Lena's stream: its time is over, and a week later it goes. Martin's, asked
    // about a month ago, stays.
    await run(36);
    expect(kept('Lena', await kofi.keepers())).toBe(kept('Lena'));
    await run(8);
    const later = await kofi.keepers();
    expect(kept('Lena', later)).toBe(0);
    expect(kept('Martin', later)).toBeGreaterThan(0);

    // Kofi's computer is off for two years: nobody could ask in that time, so nothing goes when it comes back.
    now += 730 * day;
    await kofi.reconcile();
    await run(30);
    expect(kept('Martin', await kofi.keepers())).toBe(kept('Martin', later));

    // And everything at once.
    expect((await kofi.dropKept()).forOthers).toBe(0);
    expect(bytes(kofi)).toBe(0);
  });
});
