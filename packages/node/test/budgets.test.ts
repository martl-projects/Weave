import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { WeaveNode, closeOpenStores } from '../src/index.ts';

const dirs: string[] = [];
afterAll(() => {
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});
function person(name: string): WeaveNode {
  const dir = mkdtempSync(join(tmpdir(), 'weave-budgets-'));
  dirs.push(dir);
  return WeaveNode.init(name, dir);
}
const sync = (from: WeaveNode, to: WeaveNode) => from.replica.events().forEach((e) => to.replica.ingest(e));
const texts = async (node: WeaveNode, who: WeaveNode) => (await node.feed({ space: 'Synths', kinds: ['weave.msg'], limit: 1000 })).filter((i) => i.author === who.identity.author);

describe('budgets', () => {
  it('holds back a newcomer’s flood at the budget, passes history, lets the rest in later, and gives friends and owners room', async () => {
    const [owner, kofi, flooder, friend] = ['Martin', 'Kofi', 'Mallory', 'Lena'].map(person);
    const all = [owner, kofi, flooder, friend];
    await owner.createCommunity({ name: 'Synths' });
    for (const node of [kofi, flooder, friend]) await node.joinSpace(await owner.invite('Synths'));
    for (const from of all) for (const to of all) if (from !== to) sync(from, to);
    // Kofi and Lena are friends.
    await kofi.setEdge({ edge: 'follow', who: 'Lena', on: true });
    await friend.setEdge({ edge: 'follow', who: 'Kofi', on: true });
    sync(kofi, friend);
    sync(friend, kofi);

    for (let i = 0; i < 80; i++) await flooder.say({ space: 'Synths', text: `spam ${i}` });
    for (let i = 0; i < 50; i++) await friend.say({ space: 'Synths', text: `friend ${i}` });
    for (let i = 0; i < 50; i++) await owner.say({ space: 'Synths', text: `owner ${i}` });
    for (const from of [flooder, friend, owner]) sync(from, kofi);

    // A newcomer (a member for less than a day): 60 an hour. A friend and the owner: all of it.
    expect(await texts(kofi, flooder)).toHaveLength(60);
    expect(await texts(kofi, friend)).toHaveLength(50);
    expect(await texts(kofi, owner)).toHaveLength(50);
    expect((await kofi.status()).heldBack).toBe(20);
    // Kofi doesn't pass on what he held back.
    const other = person('Ada');
    await other.joinSpace(await owner.invite('Synths'));
    sync(owner, other);
    sync(kofi, other);
    expect((await texts(other, flooder)).length).toBeLessThanOrEqual(60);

    // Two hours on, the same events are history: they come in at the next sync.
    kofi.clock = () => Date.now() + 2 * 3_600_000;
    sync(flooder, kofi);
    expect(await texts(kofi, flooder)).toHaveLength(80);
    for (const node of [...all, other]) await node.close();
  });
});
