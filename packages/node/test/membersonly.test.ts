import { describe, expect, it } from 'vitest';
import { b64u, decodeInvite, Replica, sign, spaceScope } from '@weave/core';
import { duplexPair, PeerSession2, type SpaceAccess } from '@weave/net';
import type { WeaveNode } from '../src/index.ts';
import { people } from './helpers/people.ts';

/*
 * Sync protocol 4 (23.11.2026, martl: "Beitritt gibt Schlüssel, Mitglieder wissen nun wer Daten bekommen darf"): a
 * space's events go only to its members, not to whoever shows its key. A link passed on, a key taken: its holder gets
 * nothing, unless it joins, and a join is there for everyone to see. Someone removed gets nothing more, at once.
 */

const { person } = people('membersonly');
const settle = (ms = 800) => new Promise((resolve) => setTimeout(resolve, ms));

function connect(a: { replica: Replica; access: SpaceAccess }, b: { replica: Replica; access: SpaceAccess }) {
  const [sa, sb] = duplexPair();
  const left = new PeerSession2(a.replica, sa, { access: a.access });
  const right = new PeerSession2(b.replica, sb, { access: b.access });
  return { left, right, close: () => (left.close(), right.close()) };
}
const of = (node: WeaveNode) => ({ replica: node.replica, access: node.sessionAccess() });

/** martl and Lena in a group, synced. */
async function climb(): Promise<[WeaveNode, WeaveNode, string]> {
  const [martl, lena] = [person('martl'), person('Lena')];
  await martl.createGroup('Climb');
  await lena.joinSpace(await martl.invite('Climb'));
  const c = connect(of(martl), of(lena));
  await settle();
  c.close();
  const scope = spaceScope({ kind: 'group', id: (await martl.spaces('group')).find((s) => s.name === 'Climb')!.id });
  return [martl, lena, scope];
}

describe('only members get a space', { timeout: 60_000 }, () => {
  it('gives nothing to someone who has its key from a link but never joined', async () => {
    const [martl, lena, scope] = await climb();
    await martl.say({ space: 'Climb', text: 'the rope is in the van' });
    // Eve has a link Lena was sent (forwarded, or read off a screen): its keys, and she says who she is.
    const link = decodeInvite(await martl.invite('Climb'));
    const eve = person('Eve');
    const thief = {
      replica: new Replica(),
      access: {
        spaces: () => [{ space: scope, keys: Object.keys(link.space.keys).map(Number).sort((a, b) => b - a).map((e) => b64u.decode(link.space.keys[String(e)])) }],
        identity: () => ({ key: eve.identity.did, sign: (m: Uint8Array) => sign(m, eve.identity.keys.secretKey) }),
      } satisfies SpaceAccess,
    };
    for (const member of [martl, lena]) {
      const c = connect(thief, of(member));
      await settle();
      expect(c.right.pending.has(scope)).toBe(true);
      expect(c.right.shared.has(scope)).toBe(false);
      c.close();
    }
    expect(thief.replica.events((r) => r.scope === scope)).toEqual([]);

    // Without saying who she is, the same.
    const anonymous = { replica: new Replica(), access: { spaces: thief.access.spaces } };
    const c = connect(anonymous, of(martl));
    await settle();
    c.close();
    expect(anonymous.replica.events((r) => r.scope === scope)).toEqual([]);
  });

  it('lets a newcomer in once their join is there, and they read each other', async () => {
    const [martl, , scope] = await climb();
    const bea = person('Bea');
    await bea.joinSpace(await martl.invite('Climb'));
    await martl.say({ space: 'Climb', text: 'welcome, Bea' });
    const c = connect(of(martl), of(bea));
    await settle(1500);
    expect(c.left.shared.has(scope)).toBe(true);
    c.close();
    expect((await bea.messages('Climb')).map((m) => m.text)).toContain('welcome, Bea');
    expect((await martl.members('Climb')).map((m) => m.name)).toContain('Bea');
  });

  it('gives someone removed nothing more, at once', async () => {
    const [martl, lena, scope] = await climb();
    const c = connect(of(martl), of(lena));
    await settle();
    expect(c.left.shared.has(scope)).toBe(true);
    await martl.removeMember('Climb', 'Lena');
    await settle();
    expect(c.left.shared.has(scope)).toBe(false);
    const said = await martl.say({ space: 'Climb', text: 'without Lena' });
    await settle();
    c.close();
    expect(lena.replica.events((r) => r.scope === scope).some((r) => r.id === said.id)).toBe(false);
  });

  it("gives one's own space only to one's own keys", async () => {
    const [martl, lena] = await climb();
    expect(martl.sessionAccess().mayReceive!('self', { key: lena.identity.did })).toBe(false);
    expect(martl.sessionAccess().mayReceive!('self', { key: martl.identity.did })).toBe(true);
  });
});

describe('who holds a space for others', { timeout: 60_000 }, () => {
  it('held by its maintainers alone: members meet only them, never one another', async () => {
    const [martl, lena, scope] = await climb();
    const bea = person('Bea');
    await bea.joinSpace(await martl.invite('Climb'));
    let c = connect(of(martl), of(bea));
    await settle(1200);
    c.close();
    // Only those who manage it decide.
    await expect(lena.setServing({ space: 'Climb', who: 'maintainers' })).rejects.toThrow(/only those who manage/);
    expect((await martl.setServing({ space: 'Climb', who: 'maintainers' })).serving).toBe('maintainers');
    for (const n of [lena, bea]) {
      c = connect(of(martl), of(n));
      await settle();
      c.close();
    }
    expect((await lena.spaces('group')).find((s) => s.name === 'Climb')?.serving).toBe('maintainers');

    // Lena and Bea meet: neither gives the other the space.
    const said = await lena.say({ space: 'Climb', text: 'only for martl to pass on' });
    c = connect(of(lena), of(bea));
    await settle();
    expect(c.left.shared.has(scope)).toBe(false);
    expect(c.right.shared.has(scope)).toBe(false);
    c.close();
    expect(bea.replica.events((r) => r.scope === scope).some((r) => r.id === said.id)).toBe(false);

    // Through martl it comes.
    for (const [a, b] of [[lena, martl], [martl, bea]] as const) {
      c = connect(of(a), of(b));
      await settle();
      expect(c.left.shared.has(scope)).toBe(true);
      c.close();
    }
    expect((await bea.messages('Climb')).map((m) => m.text)).toContain('only for martl to pass on');
  });

  it("is a node's own choice too: quiet, it holds nothing for others", async () => {
    const [, lena] = await climb();
    expect((await lena.setQuiet({ space: 'Climb', on: true }))?.quiet).toBe(true);
    expect((await lena.spaces('group')).find((s) => s.name === 'Climb')?.quiet).toBe(true);
    expect((await lena.setQuiet({ space: 'Climb', on: false }))?.quiet).toBeUndefined();
    await lena.setQuiet({ on: true });
    expect(lena.config.quiet).toBe(true);
  });
});
