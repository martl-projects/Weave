import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { duplexPair, PeerSession2 } from '@weave/net';
import { WeaveNode, closeOpenStores } from '../src/index.ts';

const dirs: string[] = [];
afterAll(() => {
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), 'weave-keepers-'));
  dirs.push(dir);
  return dir;
};

const sync = (from: WeaveNode, to: WeaveNode) => from.replica.events().forEach((e) => to.replica.ingest(e));

/** Two nodes connected as over the network (the v2 session, keepers included). */
function link(a: WeaveNode, b: WeaveNode): () => void {
  const [sa, sb] = duplexPair();
  const left = new PeerSession2(a.replica, sa, { access: a.sessionAccess() });
  const right = new PeerSession2(b.replica, sb, { access: b.sessionAccess() });
  return () => (left.close(), right.close());
}

const settle = (ms = 1500) => new Promise((resolve) => setTimeout(resolve, ms));
const texts = async (node: WeaveNode, space: string) => (await node.feed({ space, kinds: ['weave.msg'] })).map((i) => (i.body as { text: string }).text).sort();

describe('keepers', () => {
  it('bring back a direct chat and a small group after both people lost every device', async () => {
    const martinMade = WeaveNode.create('Martin', temp());
    const lenaMade = WeaveNode.create('Lena', temp());
    let [martin, lena] = [martinMade.node, lenaMade.node];
    const keepers = ['Kofi', 'Ada', 'Noah'].map((name) => WeaveNode.init(name, temp()));
    const everyone = [martin, lena, ...keepers];
    const syncAll = () => {
      for (const from of everyone) for (const to of everyone) if (from !== to) sync(from, to);
    };
    syncAll();
    // Everyone is friends with everyone.
    for (const a of everyone) for (const b of everyone) if (a !== b) await a.setEdge({ edge: 'follow', who: b.identity.author, on: true });
    syncAll();
    // Keepers are a choice between two friends: the two keep copies with each of the three, and each of them with the two.
    for (const person of [martin, lena]) {
      for (const k of keepers) {
        await person.setKeeper({ who: k.identity.author, on: true });
        await k.setKeeper({ who: person.identity.author, on: true });
      }
    }

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
    for (const node of [martin, lena]) await node.reconcile(); // writes the keep index

    // Online for a while: their keepers get wrapped copies.
    const links = [...keepers.flatMap((k) => [link(martin, k), link(lena, k)]), link(martin, lena)];
    await settle();
    for (const unlink of links) unlink();
    const kept = await martin.keepers();
    for (const { keepers: ks } of kept.spaces) expect(ks.length).toBe(3);
    expect(keepers.reduce((sum, k) => sum + k.replica.store.keepBytes(), 0)).toBeGreaterThan(0);
    // Keepers aren't in the chat: they hold wrapped items, never its events.
    for (const k of keepers) expect(k.replica.events((r) => r.scope === `direct:${chat.id}`)).toHaveLength(0);

    // Both lose everything.
    await martin.close();
    await lena.close();
    const lost = new Set([martin, lena]);
    const publicOf = (node: WeaveNode) => node.replica.events((r) => r.scope === 'public' || r.v === 1);
    martin = await WeaveNode.restore(martinMade.words, temp(), { events: publicOf(keepers[0]) });
    lena = await WeaveNode.restore(lenaMade.words, temp(), { events: publicOf(keepers[0]) });
    expect([martin, lena].some((n) => lost.has(n))).toBe(false);
    expect(await texts(martin, chat.id).catch(() => [])).toEqual([]);

    // Back online with their friends: the keepers give their streams back.
    const again = keepers.flatMap((k) => [link(martin, k), link(lena, k)]);
    await settle(2500);
    for (const node of [martin, lena]) await node.reconcile();
    await settle(1500);
    expect(await texts(martin, chat.id)).toEqual(['only between us', 'yes, just us']);
    expect(await texts(lena, chat.id)).toEqual(['only between us', 'yes, just us']);
    expect(await texts(martin, 'Duo')).toEqual(['our little group']);
    expect(await texts(lena, 'Duo')).toEqual(['our little group']);
    for (const unlink of again) unlink();
    for (const node of [martin, lena, ...keepers]) await node.close();
  });
});
