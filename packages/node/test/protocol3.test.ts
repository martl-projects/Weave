import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalIdV2, decodeInvite, encodeInvite, KIND_INVITE, KIND_INVITE_CLOSE, KIND_JOIN, openIn, sealFor, spaceScope, type Invite } from '@weave/core';
import { WeaveNode } from '../src/index.ts';
import { people, stored, sync } from './helpers/people.ts';

/*
 * The breaking protocol version before the first public release (Julian's
 * issue -ZhUAOGC): a node's first start on protocol 3 leaves a farewell for
 * peers still on protocol 2, its delegated keys go on as before, and its
 * invite links from before (without a key of their own) close.
 */

const { person, nodes } = people('protocol3');
const FAREWELL = /moved to a newer Weave/;
const week = 7 * 86_400_000;

/** A node as it starts for the first time on protocol 3: its home from before has no marker yet. */
async function firstStartOn3(node: WeaveNode): Promise<WeaveNode> {
  await node.close();
  rmSync(join(node.home.dir, 'protocol-3.json'), { force: true });
  const back = WeaveNode.open(node.home.dir);
  nodes.push(back);
  return back;
}

const saysFarewell = async (node: WeaveNode, space: string) => (await node.messages(space)).some((m) => FAREWELL.test(m.text ?? ''));

describe('the first start on protocol 3 (-ZhUAOGC)', () => {
  it('writes a farewell for peers on protocol 2 in each group shared with others, in the shape they read, and hides it here', async () => {
    const [bob, alice] = [person('Bob'), person('Alice')];
    await bob.createGroup('Home');
    await alice.joinSpace(await bob.invite('Home'));
    await bob.createGroup('Alone');
    sync(alice, bob);
    const back = await firstStartOn3(bob);
    // In Home, not in Alone: nobody there to tell.
    const farewells = back.sessionAccess().farewells!();
    expect(farewells).toHaveLength(1);
    const home = stored(back, 'Home');
    expect(farewells[0].e.space).toBe(spaceScope(home));
    // Without the fields a node on protocol 2 rejects as malformed.
    expect(farewells[0].e).not.toHaveProperty('ih');
    expect(farewells[0].e).not.toHaveProperty('cs');
    expect(existsSync(join(back.home.dir, 'protocol-3.json'))).toBe(true);
    // Hidden from everyone on protocol 3, the writer and the readers; taken by them all the same.
    expect(await saysFarewell(back, 'Home')).toBe(false);
    sync(back, alice);
    expect(alice.replica.record2(canonicalIdV2(farewells[0].e))).toBeDefined();
    expect(await saysFarewell(alice, 'Home')).toBe(false);
    // Once: the next start writes none and serves the same.
    const events = back.replica.events().length;
    await back.close();
    const again = WeaveNode.open(back.home.dir);
    nodes.push(again);
    expect(again.sessionAccess().farewells!().map((item) => canonicalIdV2(item.e))).toEqual([canonicalIdV2(farewells[0].e)]);
    expect(again.replica.events().length).toBe(events);
  });

  it('delegated devices and agents keep signing after the move: nothing to re-delegate', async () => {
    const [bob, alice] = [person('Bob'), person('Alice')];
    await bob.createGroup('Home');
    await alice.joinSpace(await bob.invite('Home'));
    sync(alice, bob);
    await bob.addAgent('claude', ['weave.msg']);
    const back = await firstStartOn3(bob);
    await back.say({ space: 'Home', text: 'from the device' });
    await back.say({ space: 'Home', text: 'from the agent', as: 'claude' });
    sync(back, alice);
    const texts = (await alice.messages('Home')).map((m) => m.text);
    expect(texts).toEqual(expect.arrayContaining(['from the device', 'from the agent']));
  });
});

describe('links from before protocol 3, without a key of their own (xQ0as76W)', () => {
  it("the maker's node closes them, whoever came in staying in; a join with one afterwards doesn't count", async () => {
    const [bob, alice, carol] = [person('Bob'), person('Alice'), person('Carol')];
    await bob.createGroup('Home');
    await alice.joinSpace(await bob.invite('Home'));
    sync(alice, bob);
    // As Bob's node wrote invites before protocol 3: the link's id in the space, no key, a week to go.
    const home = stored(bob, 'Home');
    const expires = new Date(Date.now() + week).toISOString();
    bob.replica.write(bob.identity, sealFor(home, { kind: KIND_INVITE, body: { invite: 'old-link', expires } }));
    await bob.reconcile();
    const closes = bob.replica.events().flatMap((r) => {
      const inner = openIn(home, r);
      return inner?.kind === KIND_INVITE_CLOSE ? [inner.body as { invite: string; joined: string[] }] : [];
    });
    expect(closes.map((c) => c.invite)).toEqual(['old-link']);
    expect((await bob.members('Home')).map((m) => m.did).sort()).toEqual([bob.identity.author, alice.identity.author].sort());
    // Carol holds the old link (leaked, say) and joins with it as an older node would: the join is not taken.
    sync(bob, carol);
    carol.replica.write(carol.identity, sealFor(home, { kind: KIND_JOIN, body: { invite: 'old-link' } }));
    sync(carol, bob);
    expect((await bob.members('Home')).some((m) => m.did === carol.identity.author)).toBe(false);
  });

  it('a link without a key is refused where it is pasted, saying why', async () => {
    const [bob, carol] = [person('Bob'), person('Carol')];
    await bob.createGroup('Home');
    const home = stored(bob, 'Home');
    const link = encodeInvite({ v: 2, space: home, invite: 'old-link', inviter: bob.identity.author, expires: new Date(Date.now() + week).toISOString(), entry: { topics: [], bootstrap: [] } } as Invite);
    expect(() => decodeInvite(link)).toThrow(/older Weave/);
    await expect(carol.joinSpace(link)).rejects.toThrow(/older Weave/);
    expect(carol.replica.events((r) => r.scope === spaceScope(home))).toHaveLength(0);
  });
});
