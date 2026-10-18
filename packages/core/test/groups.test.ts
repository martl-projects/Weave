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
  groupState,
  KIND_FOLLOW,
  KIND_GROUP_CREATE,
  KIND_INVITE,
  KIND_JOIN,
  KIND_REMOVE,
  newGroup,
  open,
  openBox,
  openGroupEvent,
  openRekey,
  Replica,
  rekey,
  seal,
  sealForGroup,
  socialGraph,
  visibleIn,
  type GroupKeys,
  type Inner,
  type SigningIdentity,
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

describe('groups', () => {
  function setup() {
    const alice = createIdentity();
    const group = newGroup('Synth makers', alice.did);
    const replica = new Replica();
    const post = (who: SigningIdentity, g: GroupKeys, inner: Inner) => replica.append(who, sealForGroup(g, inner));
    post(alice, group, { kind: KIND_GROUP_CREATE, body: { name: group.name } });
    const opened = (g: GroupKeys) =>
      replica.events().flatMap((event) => {
        const inner = openGroupEvent(g, event);
        return inner ? [{ event, inner }] : [];
      });
    return { alice, group, replica, post, opened };
  }

  it('encrypts group events so relays only see a sealed envelope', () => {
    const { alice, group, replica, post } = setup();
    const event = post(alice, group, { kind: 'weave.post', body: { text: 'members only' } });
    expect(event.kind).toBe('weave.sealed');
    expect(JSON.stringify(event)).not.toContain('members only');
    expect(openGroupEvent(group, event)).toEqual({ kind: 'weave.post', body: { text: 'members only' } });
    expect(openGroupEvent(newGroup('other', alice.did), event)).toBeUndefined();
    expect(replica.events()).toHaveLength(2);
  });

  it('round-trips invites and rejects expired ones', () => {
    const { alice, group } = setup();
    const invite = { v: 1 as const, group, invite: 'abc', inviter: alice.did, expires: new Date(Date.now() + 60_000).toISOString(), entry: { topics: [alice.did], bootstrap: [] } };
    expect(decodeInvite(encodeInvite(invite))).toEqual(invite);
    expect(() => decodeInvite(encodeInvite({ ...invite, expires: '2000-01-01T00:00:00Z' }))).toThrow(/expired/);
    expect(() => decodeInvite('weave:invite:garbage')).toThrow(/damaged/);
  });

  it('tracks members and the invite chain', () => {
    const { alice, group, post, opened } = setup();
    const bob = createIdentity();
    const carol = createIdentity();
    const expires = new Date(Date.now() + 60_000).toISOString();
    post(alice, group, { kind: KIND_INVITE, body: { invite: 'i1', expires } });
    post(bob, group, { kind: KIND_JOIN, body: { invite: 'i1' } });
    post(bob, group, { kind: KIND_INVITE, body: { invite: 'i2', expires } });
    post(carol, group, { kind: KIND_JOIN, body: { invite: 'i2' } });

    const state = groupState(alice.did, opened(group));
    expect([...state.members.keys()]).toEqual([alice.did, bob.did, carol.did]);
    expect(state.members.get(carol.did)?.invitedBy).toBe(bob.did);
    expect(state.name).toBe('Synth makers');
  });

  it('ignores joins with invites nobody issued', () => {
    const { alice, group, post, opened } = setup();
    const mallory = createIdentity();
    post(mallory, group, { kind: KIND_JOIN, body: { invite: 'made-up' } });
    const posted = post(mallory, group, { kind: 'weave.post', body: 'hi' });
    const state = groupState(alice.did, opened(group));
    expect(state.members.has(mallory.did)).toBe(false);
    expect(visibleIn(state, posted, openGroupEvent(group, posted)!)).toBe(false);
  });

  it('removes a member and rekeys so only the rest can read on', () => {
    const { alice, group, replica, post, opened } = setup();
    const bob = createIdentity();
    const carol = createIdentity();
    const expires = new Date(Date.now() + 60_000).toISOString();
    post(alice, group, { kind: KIND_INVITE, body: { invite: 'i', expires } });
    post(bob, group, { kind: KIND_JOIN, body: { invite: 'i' } });
    post(carol, group, { kind: KIND_JOIN, body: { invite: 'i' } });
    const bobsKeys: GroupKeys = structuredClone(group);

    post(alice, group, { kind: KIND_REMOVE, body: { member: bob.did } });
    const { fields, epoch, key } = rekey(group, [alice.did, carol.did]);
    const rekeyEvent = replica.append(alice, fields);
    group.keys[String(epoch)] = key;

    expect(openRekey(rekeyEvent, carol)).toEqual({ epoch, key });
    expect(openRekey(rekeyEvent, bob)).toBeUndefined();

    const secret = post(alice, group, { kind: 'weave.post', body: 'after bob left' });
    expect(openGroupEvent(bobsKeys, secret)).toBeUndefined();
    expect(openGroupEvent(group, secret)?.body).toBe('after bob left');
    expect(groupState(alice.did, opened(group)).members.has(bob.did)).toBe(false);
  });

  it('drops sealed events whose inner kind a delegated agent may not sign', () => {
    const { alice, group, replica } = setup();
    const forge = createSubKey(alice.did);
    replica.append(alice, delegation(forge.did, 'agent', ['weave.post']));
    const vote = replica.append(forge, sealForGroup(group, { kind: 'weave.vote', body: { yes: true } }));
    // Relays accept it (they can't see inside); readers check the inner kind against the grant.
    expect(replica.authority.grant(forge.did)!.permissions.includes(openGroupEvent(group, vote)!.kind)).toBe(false);
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

