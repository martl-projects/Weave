import { describe, expect, it } from 'vitest';
import { KIND_CARRY, sealFor } from '@weave/core';
import { people, stored, sync } from './helpers/people.ts';

/*
 * Julian (1.11.2026): Pferderennen lets newcomers read only from when they come, so what came before reaches them in
 * a carry. Everything in it from before protocol 3 has an envelope without an inner hash: since carries are checked
 * item by item, none of it counted, not even the space's founding, so Julian's node didn't count martl as a member
 * and hid all his messages.
 */

const { person } = people('carrypre3');
const PAGE = 'weave.project.page';
const page = (title: string) => ({ title, subtitle: '', body: '', description: '', status: 'active', public: false });

describe('a carry of events from before protocol 3', () => {
  it("is taken from the space's founder: the newcomer learns what came before", async () => {
    const [martl, julian] = [person('martl'), person('julian')];
    await martl.createProject({ name: 'Race' });
    await martl.setHistory({ space: 'Race', history: 'joining' });
    // A page written before protocol 3: its envelope signs no inner hash.
    martl.replica.write(martl.identity, sealFor(stored(martl, 'Race'), { kind: PAGE, body: page('Before protocol 3') }, { legacy: true }));
    expect((await martl.project('Race')).page.title).toBe('Before protocol 3');

    await julian.joinSpace(await martl.invite('Race'));
    sync(julian, martl);
    sync(martl, julian);
    expect((await julian.project('Race')).page.title).toBe('Before protocol 3');
    expect((await julian.members('Race')).map((m) => m.name)).toEqual(expect.arrayContaining(['martl', 'julian']));
  });

});

describe("the founder's node", () => {
  it('restates it all once more when only carries from before protocol 3 are there, and only once', async () => {
    const [martl, julian] = [person('martl'), person('julian')];
    await martl.createProject({ name: 'Race' });
    await martl.setHistory({ space: 'Race', history: 'joining' });
    // A newer key (without a carry: nobody new came), then a carry under it as a node before protocol 3 wrote it:
    // items without envelopes.
    await julian.joinSpace(await martl.invite('Race'));
    sync(julian, martl);
    await martl.removeMember('Race', julian.identity.author);
    const count = () => martl.replica.events().length;
    martl.replica.write(martl.identity, sealFor(stored(martl, 'Race'), { kind: KIND_CARRY, body: { events: [{ id: 'x', author: martl.identity.author, signer: martl.identity.author, seq: 1, time: new Date().toISOString(), kind: PAGE, body: page('old') }] } as never }));
    const before = count();
    expect(await martl.reconcile()).toBeGreaterThan(0);
    // The new carry (and whatever a first run writes anyway: a farewell to older peers).
    expect(count()).toBeGreaterThan(before);
    const after = count();
    expect(await martl.reconcile()).toBe(0);
    expect(count()).toBe(after);
  });
});
