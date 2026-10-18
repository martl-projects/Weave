import { describe, expect, it } from 'vitest';
import {
  boxTo,
  createIdentity,
  createSubKey,
  decodeInvite,
  delegation,
  edgeBody,
  encodeInvite,
  friendsOf,
  gift,
  KIND_ADMIT,
  KIND_DECLINE,
  KIND_FOLLOW,
  KIND_INVITE,
  KIND_JOIN,
  KIND_MAINTAINER,
  KIND_PROJECT_GROUP,
  KIND_REMOVE,
  KIND_RULE,
  KIND_SPACE_CREATE,
  newSpace,
  open,
  openBox,
  openGift,
  openIn,
  openRekey,
  Replica,
  rekey,
  seal,
  sealFor,
  socialGraph,
  spaceScope,
  spaceState,
  visibleIn,
  type Inner,
  type SigningIdentity,
  type SpaceKeys,
  type SpaceKind,
} from '../src/index.ts';

describe('crypto', () => {
  it('seals and opens with the right key and context only', () => {
    const key = new Uint8Array(32).fill(7);
    const sealed = seal(key, { secret: 1 }, 'ctx');
    expect(open(key, sealed, 'ctx')).toEqual({ secret: 1 });
    expect(() => open(key, sealed, 'other ctx')).toThrow();
    expect(() => open(new Uint8Array(32), sealed, 'ctx')).toThrow();
  });

  it('boxes to an identity that only its key can open', () => {
    const bob = createIdentity();
    const box = boxTo(bob.did, 'for bob');
    expect(openBox(bob.keys.secretKey, bob.keys.publicKey, box)).toBe('for bob');
    const eve = createIdentity();
    expect(() => openBox(eve.keys.secretKey, eve.keys.publicKey, box)).toThrow();
  });
});

/** A space with its founder, and helpers to post into it and read its state. */
function setup(kind: SpaceKind, name = 'Synths') {
  const founder = createIdentity();
  const space = newSpace(kind, name, founder.did);
  const replica = new Replica();
  const post = (who: SigningIdentity, inner: Inner, s: SpaceKeys = space) => replica.append(who, sealFor(s, inner));
  post(founder, { kind: KIND_SPACE_CREATE, body: { name } });
  const opened = (s: SpaceKeys = space) =>
    replica.events().flatMap((event) => {
      const inner = openIn(s, event);
      return inner ? [{ event, inner }] : [];
    });
  const state = () => spaceState(kind, founder.did, opened());
  const expires = new Date(Date.now() + 60_000).toISOString();
  return { founder, space, replica, post, opened, state, expires };
}

describe('spaces', () => {
  it('encrypts events so relays only see a sealed envelope', () => {
    const { founder, space, replica, post } = setup('project');
    const event = post(founder, { kind: 'weave.post', body: { text: 'members only' } });
    expect(event.kind).toBe('weave.sealed');
    expect(event.scope).toBe(spaceScope(space));
    expect(JSON.stringify(event)).not.toContain('members only');
    expect(openIn(space, event)).toEqual({ kind: 'weave.post', body: { text: 'members only' } });
    expect(openIn(newSpace('project', 'other', founder.did), event)).toBeUndefined();
    expect(replica.events()).toHaveLength(2);
  });

  it('round-trips invites and rejects expired or damaged ones', () => {
    const { founder, space, expires } = setup('group');
    const invite = { v: 2 as const, space, invite: 'abc', inviter: founder.did, expires, entry: { topics: [founder.did], bootstrap: [] } };
    expect(decodeInvite(encodeInvite(invite))).toEqual(invite);
    expect(() => decodeInvite(encodeInvite({ ...invite, expires: '2000-01-01T00:00:00Z' }))).toThrow(/expired/);
    expect(() => decodeInvite('weave:invite:garbage')).toThrow(/damaged/);
  });

  it('lets any group member invite, and keeps the invite chain', () => {
    const { founder, post, state, expires } = setup('group');
    const [bob, carol] = [createIdentity(), createIdentity()];
    post(founder, { kind: KIND_INVITE, body: { invite: 'i1', expires } });
    post(bob, { kind: KIND_JOIN, body: { invite: 'i1' } });
    post(bob, { kind: KIND_INVITE, body: { invite: 'i2', expires } });
    post(carol, { kind: KIND_JOIN, body: { invite: 'i2' } });
    expect([...state().members.keys()]).toEqual([founder.did, bob.did, carol.did]);
    expect(state().members.get(carol.did)?.invitedBy).toBe(bob.did);
  });

  it('in projects only maintainers invite', () => {
    const { founder, post, state, expires } = setup('project');
    const [bob, carol, dave] = [createIdentity(), createIdentity(), createIdentity()];
    post(founder, { kind: KIND_INVITE, body: { invite: 'i1', expires } });
    post(bob, { kind: KIND_JOIN, body: { invite: 'i1' } });
    post(bob, { kind: KIND_INVITE, body: { invite: 'i2', expires } }); // bob is no maintainer
    post(carol, { kind: KIND_JOIN, body: { invite: 'i2' } });
    expect(state().members.has(carol.did)).toBe(false);

    post(founder, { kind: KIND_MAINTAINER, body: { member: bob.did, on: true } });
    post(bob, { kind: KIND_INVITE, body: { invite: 'i3', expires } });
    post(dave, { kind: KIND_JOIN, body: { invite: 'i3' } });
    expect(state().members.has(dave.did)).toBe(true);
    expect(state().maintainers.has(bob.did)).toBe(true);
  });

  it('ignores joins with invites nobody issued', () => {
    const { post, state } = setup('group');
    const mallory = createIdentity();
    post(mallory, { kind: KIND_JOIN, body: { invite: 'made-up' } });
    const posted = post(mallory, { kind: 'weave.post', body: 'hi' });
    expect(state().members.has(mallory.did)).toBe(false);
    expect(visibleIn(state(), posted, { kind: 'weave.post', body: 'hi' })).toBe(false);
  });

  it('admits group newcomers by a maintainer, or automatically under a rule', () => {
    const { founder, post, state } = setup('project');
    const [noah, ada, eve, mallory] = [createIdentity(), createIdentity(), createIdentity(), createIdentity()];
    post(founder, { kind: KIND_PROJECT_GROUP, body: { group: 'g1', name: 'Friends', on: true } });
    post(founder, { kind: KIND_ADMIT, body: { member: noah.did, via: 'g1' } });
    expect(state().members.get(noah.did)).toMatchObject({ invitedBy: founder.did, via: 'g1' });

    post(noah, { kind: KIND_ADMIT, body: { member: ada.did, via: 'g1' } }); // no rule yet: noah may not
    expect(state().members.has(ada.did)).toBe(false);

    post(founder, { kind: KIND_RULE, body: { group: 'g1', auto: true } });
    post(noah, { kind: KIND_ADMIT, body: { member: ada.did, via: 'g1' } });
    expect(state().members.get(ada.did)).toMatchObject({ invitedBy: noah.did, via: 'g1' });
    expect(state().groups.get('g1')).toEqual({ id: 'g1', name: 'Friends', auto: true });

    post(mallory, { kind: KIND_ADMIT, body: { member: mallory.did, via: 'g1' } }); // not in the project
    expect(state().members.has(mallory.did)).toBe(false);

    post(founder, { kind: KIND_DECLINE, body: { member: eve.did, via: 'g1' } });
    expect(state().declined.get(eve.did)).toBe('g1');
  });

  it('removes a member and rekeys so only the rest can read on', () => {
    const { founder, space, replica, post, opened, state, expires } = setup('project');
    const [bob, carol] = [createIdentity(), createIdentity()];
    post(founder, { kind: KIND_INVITE, body: { invite: 'i', expires } });
    post(bob, { kind: KIND_JOIN, body: { invite: 'i' } });
    post(carol, { kind: KIND_JOIN, body: { invite: 'i' } });
    const bobsKeys: SpaceKeys = structuredClone(space);

    post(founder, { kind: KIND_REMOVE, body: { member: bob.did } });
    const { fields, epoch, key } = rekey(space, [founder.did, carol.did]);
    const rekeyEvent = replica.append(founder, fields);
    space.keys[String(epoch)] = key;

    expect(openRekey(rekeyEvent, carol)).toEqual({ epoch, key });
    expect(openRekey(rekeyEvent, bob)).toBeUndefined();
    const secret = post(founder, { kind: 'weave.post', body: 'after bob left' });
    expect(openIn(bobsKeys, secret)).toBeUndefined();
    expect(openIn(space, secret)?.body).toBe('after bob left');
    expect(state().members.has(bob.did)).toBe(false);
    void opened;
  });

  it('gifts a space to admitted people only', () => {
    const { space } = setup('project');
    const [noah, eve] = [createIdentity(), createIdentity()];
    const replica = new Replica();
    const giver = createIdentity();
    const entry = { topics: [giver.did], bootstrap: [] };
    const event = replica.append(giver, gift(space, [noah.did], 'group:g1', entry));
    expect(JSON.stringify(event)).not.toContain(space.secret);
    expect(openGift(event, noah)).toEqual({ space, entry });
    expect(openGift(event, eve)).toBeUndefined();
  });

  it('drops sealed events whose inner kind a delegated agent may not sign', () => {
    const { founder, space, replica } = setup('project');
    const forge = createSubKey(founder.did);
    replica.append(founder, delegation(forge.did, 'agent', ['weave.post']));
    const vote = replica.append(forge, sealFor(space, { kind: 'weave.vote', body: { yes: true } }));
    expect(replica.authority.grant(forge.did)!.permissions.includes(openIn(space, vote)!.kind)).toBe(false);
  });
});

describe('social graph', () => {
  const edge = (author: SigningIdentity, subject: SigningIdentity, on: boolean, time: string) => ({
    author: author.did,
    kind: KIND_FOLLOW,
    body: edgeBody(subject.did, on),
    time,
    signer: author.did,
    seq: 1,
  });

  it('derives friends from mutual follows, latest edge winning', () => {
    const [a, b, c] = [createIdentity(), createIdentity(), createIdentity()];
    const graph = socialGraph([
      edge(a, b, true, '2026-01-01'),
      edge(b, a, true, '2026-01-02'),
      edge(a, c, true, '2026-01-03'),
      edge(a, c, false, '2026-01-04'),
      edge(c, a, true, '2026-01-05'),
    ]);
    expect(friendsOf(graph, a.did)).toEqual([b.did]);
    expect(graph.get(a.did)?.following.has(c.did)).toBe(false);
  });

  it('ignores self-edges and malformed bodies', () => {
    const a = createIdentity();
    const graph = socialGraph([edge(a, a, true, '2026-01-01'), { ...edge(a, a, true, '2026-01-01'), body: 'nonsense' } as never]);
    expect(graph.size).toBe(0);
  });
});
