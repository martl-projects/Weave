import { describe, expect, it } from 'vitest';
import { b64u, Replica } from '@weave/core';
import { authKey, duplexPair, PeerSession2, type HeldSpace, type SpaceAccess } from '@weave/net';
import type { WeaveNode } from '../src/index.ts';
import { people, stored } from './helpers/people.ts';

/*
 * Weave Web, stage 2: a storage node holds a person's spaces without being able to read them. It gets each space's
 * auth key (a one-way hash of the key), which proves the space to peers, and syncs events as they travel: while a
 * browser's tab is closed it collects what comes in, and it hands everything to the next device.
 */

const { person } = people('blind');
const settle = (ms = 600) => new Promise((resolve) => setTimeout(resolve, ms));

/** What a person hands their storage node: auth keys, newest first, never a key. */
const blindly = (node: WeaveNode, name: string): HeldSpace => {
  const space = stored(node, name);
  const keys = Object.keys(space.keys).map(Number).sort((a, b) => b - a).map((epoch) => authKey(b64u.decode(space.keys[String(epoch)])));
  return { space: `group:${space.id}`, keys, blind: true };
};

function link(a: { replica: Replica; access: SpaceAccess }, b: WeaveNode): { sessions: [PeerSession2, PeerSession2]; close: () => void } {
  const [sa, sb] = duplexPair();
  const left = new PeerSession2(a.replica, sa, { access: a.access });
  const right = new PeerSession2(b.replica, sb, { access: b.sessionAccess() });
  return { sessions: [left, right], close: () => (left.close(), right.close()) };
}

const texts = async (node: WeaveNode) => (await node.messages('Climb')).map((m) => m.text);

describe('a blind holder', { timeout: 60_000 }, () => {
  it('carries a space between two people who are never online together, and reads none of it', async () => {
    const [martl, lena] = [person('martl'), person('Lena')];
    await martl.createGroup('Climb');
    await lena.joinSpace(await martl.invite('Climb'));
    let c = (() => {
      const [sa, sb] = duplexPair();
      const l = new PeerSession2(martl.replica, sa, { access: martl.sessionAccess() });
      const r = new PeerSession2(lena.replica, sb, { access: lena.sessionAccess() });
      return () => (l.close(), r.close());
    })();
    await settle();
    c();

    const holder = { replica: new Replica(), access: { spaces: () => [blindly(lena, 'Climb')] } };
    await martl.say({ space: 'Climb', text: 'the rope is in the van' });
    const fromMartl = link(holder, martl);
    await settle();
    fromMartl.close();
    expect(JSON.stringify(holder.replica.events())).not.toContain('rope');
    expect(holder.replica.events((r) => r.scope === blindly(lena, 'Climb').space).length).toBeGreaterThan(0);

    const toLena = link(holder, lena);
    await settle();
    toLena.close();
    expect(await texts(lena)).toContain('the rope is in the van');
  });

  it('falls behind when a key rotates, until its person hands it the new auth key', async () => {
    const [martl, lena, bea] = [person('martl'), person('Lena'), person('Bea')];
    await martl.createGroup('Climb');
    for (const n of [lena, bea]) {
      await n.joinSpace(await martl.invite('Climb'));
      const [sa, sb] = duplexPair();
      const l = new PeerSession2(martl.replica, sa, { access: martl.sessionAccess() });
      const r = new PeerSession2(n.replica, sb, { access: n.sessionAccess() });
      await settle();
      l.close();
      r.close();
    }
    let held = blindly(lena, 'Climb');
    const holder = { replica: new Replica(), access: { spaces: () => [held] } };
    const scoped = () => holder.replica.events((r) => r.scope === held.space).length;

    // Bea is removed while Lena's tab is closed: the holder only knows the old key.
    await martl.removeMember('Climb', 'Bea');
    await martl.say({ space: 'Climb', text: 'new gear list' });
    const away = link(holder, martl);
    await settle();
    away.close();
    const behind = scoped();

    // Lena's browser opens, takes the new key from martl, and hands on its auth key.
    const [sa, sb] = duplexPair();
    const l = new PeerSession2(martl.replica, sa, { access: martl.sessionAccess() });
    const r = new PeerSession2(lena.replica, sb, { access: lena.sessionAccess() });
    await settle();
    r.announce();
    await settle();
    l.close();
    r.close();
    expect(await texts(lena)).toContain('new gear list');
    held = blindly(lena, 'Climb');
    expect(held.keys.length).toBeGreaterThan(1);
    const back = link(holder, martl);
    await settle();
    back.sessions[0].announce();
    await settle();
    back.close();
    expect(scoped()).toBeGreaterThan(behind);
    expect(JSON.stringify(holder.replica.events())).not.toContain('gear');
  });

  it('gets nothing with the auth key of another space', async () => {
    const [martl, lena] = [person('martl'), person('Lena')];
    await martl.createGroup('Climb');
    await lena.createGroup('Other');
    const holder = { replica: new Replica(), access: { spaces: () => [{ ...blindly(lena, 'Other'), space: `group:${stored(martl, 'Climb').id}` }] } };
    await martl.say({ space: 'Climb', text: 'not for you' });
    const l = link(holder, martl);
    await settle();
    l.close();
    expect(holder.replica.events((r) => r.scope === `group:${stored(martl, 'Climb').id}`)).toEqual([]);
  });
});
