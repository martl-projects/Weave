import { describe, expect, it } from 'vitest';
import {
  bodyHash,
  createIdentity,
  createSubKey,
  delegation,
  eventId,
  eventIdV2,
  inception,
  Replica,
  revocation,
  signContentEventV2,
  signEvent,
  MemoryStore,
  signControlEventV2,
  type WeaveRecord,
} from '../src/index.ts';

/** A person with a root (v1 foundation) and a laptop that signs day to day. */
function person() {
  const root = createIdentity();
  const laptop = createSubKey(root.did);
  const replica = new Replica();
  replica.append(root, inception(createSubKey(root.did).did, createSubKey(root.did).did));
  replica.append(root, delegation(laptop.did, 'device', ['*'], 'laptop'));
  return { root, laptop, replica };
}

/** Hand over everything `from` holds, as records (bodies included where held). */
const pass = (from: Replica, to: Replica) => from.events().forEach((r) => to.ingest(r));

const kinds = (records: WeaveRecord[]) => records.map((r) => r.kind);

describe('v2 events in the replica', () => {
  it('stores control and content events numbered on from v1, and reads them back as records in order', () => {
    const { root, laptop, replica } = person();
    replica.append(laptop, { kind: 'weave.post', body: { title: 'v1 post' } });
    expect(replica.number(laptop.did)).toBe(1);
    const create = replica.append2(laptop, { kind: 'weave.space.create', space: 'project:abc', body: { name: 'Weave' } });
    const post = replica.append2(laptop, { kind: 'weave.post', space: 'project:abc', body: { title: 'v2 post' } });
    expect([create.seq, post.seq]).toEqual([2, 3]);
    expect(replica.number(laptop.did)).toBe(3);
    expect(replica.store.chainHead(laptop.did, 'project:abc')?.seq).toBe(1);

    const records = replica.events((r) => r.author === root.did && r.signer === laptop.did);
    expect(records.map((r) => [r.v, r.kind, r.body])).toEqual([
      [1, 'weave.post', { title: 'v1 post' }],
      [2, 'weave.space.create', { name: 'Weave' }],
      [2, 'weave.post', { title: 'v2 post' }],
    ]);
    expect(records[2]).toMatchObject({ id: post.id, scope: 'project:abc', class: 'content' });

    // Another replica takes them all, in any order.
    const other = new Replica();
    for (const r of replica.events().reverse()) other.ingest(r);
    pass(replica, other);
    expect(other.events().map((r) => r.id)).toEqual(replica.events().map((r) => r.id));
  });

  it('keeps a content event without its body, and takes the body when it comes', () => {
    const { laptop, replica } = person();
    const other = new Replica();
    pass(replica, other);
    const { event, body } = signContentEventV2(laptop, { n: 1, kind: 'weave.msg', space: 'group:g', body: { text: 'hi' } });
    const seen: WeaveRecord[] = [];
    other.onAppend((r) => seen.push(r));

    // A wrong body is dropped; the event stands without it.
    expect(other.ingest({ e: event, b: { text: 'forged' } }).status).toBe('accepted');
    expect(other.events((r) => r.kind === 'weave.msg')[0]).toMatchObject({ missing: true, body: null });
    expect(other.ingest({ e: event }).status).toBe('duplicate');

    expect(other.ingest({ e: event, b: body }).status).toBe('accepted');
    expect(other.events((r) => r.kind === 'weave.msg')[0]).toMatchObject({ body: { text: 'hi' } });
    expect(other.events((r) => r.kind === 'weave.msg')[0].missing).toBeUndefined();
    expect(seen.map((r) => r.missing ?? false)).toEqual([true, false]);
    expect(other.ingest({ e: event, b: body }).status).toBe('duplicate');
  });

  it('waits for a gap in a control chain, and refuses a broken one', () => {
    const { laptop, replica } = person();
    const other = new Replica();
    pass(replica, other);
    const first = signControlEventV2(laptop, undefined, { n: 1, kind: 'weave.space.create', space: 'project:p', body: {} });
    const second = signControlEventV2(laptop, first, { n: 2, kind: 'weave.board', space: 'project:p', body: { name: 'work' } });
    expect(other.ingest({ e: second })).toEqual({ status: 'pending', reason: 'gap in chain' });
    expect(other.ingest({ e: first }).status).toBe('accepted');
    expect(kinds(other.events((r) => r.scope === 'project:p'))).toEqual(['weave.space.create', 'weave.board']);
    expect(other.pendingCount).toBe(0);
    // Chained to something else.
    const stray = signControlEventV2(laptop, undefined, { n: 3, kind: 'weave.board', space: 'project:p', body: {} });
    expect(other.ingest({ e: { ...stray, seq: 3, prev: second.prev } }).status).toBe('rejected');
  });

  it('marks a key forked when it numbers two events alike, across versions too', () => {
    const { laptop, replica } = person();
    const a = signContentEventV2(laptop, { n: 5, kind: 'weave.msg', space: 'group:g', body: { text: 'a' } });
    const b = signContentEventV2(laptop, { n: 5, kind: 'weave.msg', space: 'group:g', body: { text: 'b' } });
    expect(replica.ingest({ e: a.event, b: a.body }).status).toBe('accepted');
    expect(replica.ingest({ e: b.event, b: b.body })).toEqual({ status: 'rejected', reason: 'conflicting event (fork)' });
    expect(replica.forks.has(laptop.did)).toBe(true);

    // A v1 event and a v2 event with the same number that isn't its re-signing.
    const { laptop: other, replica: second } = person();
    const v1 = second.append(other, { kind: 'weave.post', body: { title: 'old' } });
    const clash = signContentEventV2(other, { n: v1.seq, kind: 'weave.post', space: 'public', body: { title: 'new' } });
    expect(second.ingest({ e: clash.event, b: clash.body }).status).toBe('rejected');
    expect(second.forks.has(other.did)).toBe(true);
  });

  it('takes a re-signed v1 event under its old id and shows only the v2 one', () => {
    const { laptop, replica } = person();
    const v1 = replica.append(laptop, { kind: 'weave.post', body: { title: 'old' } });
    const resigned = signContentEventV2(laptop, { n: v1.seq, kind: 'weave.post', space: 'public', body: { title: 'old' }, time: v1.time, was: eventId(v1) });
    expect(replica.ingest({ e: resigned.event, b: resigned.body }).status).toBe('accepted');
    const posts = replica.events((r) => r.kind === 'weave.post');
    expect(posts.map((r) => [r.v, r.id])).toEqual([[2, eventId(v1)]]);
    expect(replica.forks.size).toBe(0);
    // And in the other order: the v2 one first waits for the v1 event it re-signs, then takes its place.
    const { laptop: l2, replica: r2 } = person();
    const early = r2.append(l2, { kind: 'weave.post', body: { title: 'x' } });
    const fresh = new Replica();
    for (const r of r2.events((r) => r.kind !== 'weave.post')) fresh.ingest(r);
    const again = signContentEventV2(l2, { n: early.seq, kind: 'weave.post', space: 'public', body: { title: 'x' }, time: early.time, was: eventId(early) });
    expect(fresh.ingest({ e: again.event, b: again.body }).status).toBe('pending');
    expect(fresh.ingest(early).status).toBe('accepted');
    expect(fresh.events((r) => r.kind === 'weave.post').map((r) => r.v)).toEqual([2]);
    // A `was` at another number names no v1 event of this key there: it waits, and takes nothing.
    const thief = signContentEventV2(l2, { n: 9, kind: 'weave.post', space: 'public', body: {}, was: eventId(early) });
    expect(fresh.ingest({ e: thief.event, b: thief.body }).status).toBe('pending');
    expect(fresh.events((r) => r.id === eventId(early)).map((r) => r.body)).toEqual([{ title: 'x' }]);
    // Re-signing its own v1 event with another body, kind or space is refused: a rewrite isn't a restatement.
    const rewrite = signContentEventV2(l2, { n: early.seq, kind: 'weave.msg', space: 'public', body: { text: 'rewritten' }, time: early.time, was: eventId(early) });
    expect(fresh.ingest({ e: rewrite.event, b: rewrite.body }).status).not.toBe('accepted');
  });

  it("doesn't let another key take an event's id with was (94YOOwAC)", () => {
    const victim = person();
    const other = new Replica();
    for (const r of victim.replica.events()) other.ingest(r);
    const real = signContentEventV2(victim.laptop, { n: 3, kind: 'weave.post', space: 'public', body: { text: 'mine' } });
    const attacker = createIdentity();
    const squat = signContentEventV2(attacker, { n: 1, kind: 'weave.post', space: 'public', body: { text: 'squat' }, was: eventIdV2(real.event) });
    expect(other.ingest({ e: squat.event, b: squat.body }).status).not.toBe('accepted');
    expect(other.ingest({ e: real.event, b: real.body }).status).toBe('accepted');
    expect(other.record2(eventIdV2(real.event))?.author).toBe(victim.laptop.author);
  });

  it('voids a revoked key’s v2 events after the cutoff, by number', () => {
    const { root, laptop, replica } = person();
    for (let i = 1; i <= 4; i++) replica.append2(laptop, { kind: 'weave.msg', space: 'group:g', body: { text: `m${i}` } });
    replica.append(root, revocation(laptop.did, 2));
    expect(replica.events((r) => r.kind === 'weave.msg').map((r) => r.body)).toEqual([{ text: 'm1' }, { text: 'm2' }]);
    // A thief can't backdate: a later number is void whatever time it claims.
    const backdated = signContentEventV2(laptop, { n: 5, kind: 'weave.msg', space: 'group:g', body: { text: 'forged' }, time: '2020-01-01T00:00:00.000Z' });
    expect(replica.ingest({ e: backdated.event, b: backdated.body })).toEqual({ status: 'rejected', reason: 'signer revoked' });
  });

  it('lets a device delegate an agent with a v2 event, and keeps it after a restart', () => {
    const { root, laptop, replica } = person();
    const agent = createSubKey(root.did);
    expect(replica.ingest({ e: signContentEventV2(agent, { n: 1, kind: 'weave.post', space: 'public', body: {} }).event }).status).toBe('pending');
    replica.append2(laptop, { kind: 'weave.delegate', body: { subject: agent.did, role: 'agent', permissions: ['weave.post'], name: 'helper' } });
    expect(replica.pendingCount).toBe(0);
    expect(replica.events((r) => r.signer === agent.did)).toHaveLength(1);
    expect(replica.ingest({ e: signContentEventV2(agent, { n: 2, kind: 'weave.msg', space: 'public', body: {} }).event })).toMatchObject({ status: 'rejected' });

    const restarted = new Replica(replica.store);
    expect(restarted.authority.grant(agent.did)?.name).toBe('helper');
    expect(restarted.events((r) => r.signer === agent.did)).toHaveLength(1);
  });

  it('refuses identity and rotation as v2, and malformed items', () => {
    const { root, replica } = person();
    const identity = signControlEventV2(root, undefined, { n: 9, kind: 'weave.identity', body: {} });
    expect(replica.ingest({ e: identity })).toEqual({ status: 'rejected', reason: 'weave.identity stays v1' });
    expect(replica.ingest({ e: { v: 2, class: 'content' } }).status).toBe('rejected');
    expect(replica.ingest({ e: { ...identity, sig: identity.sig.replace(/^./, (c) => (c === 'A' ? 'B' : 'A')) } }).status).toBe('rejected');
    expect(bodyHash(null)).toBeTypeOf('string');
  });
});

describe('peer input that can\'t be read (KixI_JwE)', () => {
  it('rejects a body with a non-finite number instead of throwing', () => {
    const laptop = createIdentity();
    const other = new Replica();
    const { event } = signContentEventV2(laptop, { n: 1, kind: 'weave.post', space: 'public', body: { x: 1 } });
    // On the wire {"x":1e400} parses to Infinity, which canonical JSON can't hash.
    expect(() => other.ingest({ e: event, b: JSON.parse('{"x":1e400}') })).not.toThrow();
    expect(other.ingest({ e: event, b: { x: Number.POSITIVE_INFINITY } }).status).not.toBe('accepted');
  });
});

describe("a revoked key can't fill numbers it left unused (KgmsMa_g)", () => {
  it('neither delegates an agent nor posts at a gap below its cutoff, once the revocation names where it saw the key', () => {
    const { root, laptop, replica } = person();
    const other = new Replica();
    const passOnly = (from: Replica, to: Replica, scope: string) => from.events().filter((r) => r.scope !== scope).forEach((r) => to.ingest(r));
    replica.append2(laptop, { kind: 'weave.post', space: 'public', body: { title: 'one' } });
    replica.append2(laptop, { kind: 'weave.post', space: 'group:chess', body: { title: 'elsewhere' } });
    replica.append2(laptop, { kind: 'weave.post', space: 'group:chess', body: { title: 'elsewhere too' } });
    replica.append2(laptop, { kind: 'weave.post', space: 'public', body: { title: 'two' } });
    passOnly(replica, other, 'group:chess');
    const gaps = replica.events((r) => r.scope === 'group:chess').map((r) => r.seq);
    expect(gaps.every((n) => !other.store.byNumber(laptop.did, n))).toBe(true);
    // The owner revokes the laptop after its last event, naming where it saw it.
    const held = other.events((r) => r.signer === laptop.did && r.scope === 'public' && r.v === 2);
    const heads = { public: { c: other.store.chainHead(laptop.did, 'public')?.seq ?? 0, s: other.store.contentCount(laptop.did, 'public'), f: Math.min(...held.map((r) => r.seq)) } };
    replica.append(root, revocation(laptop.did, other.number(laptop.did), heads));
    passOnly(replica, other, 'group:chess');

    // A thief with the laptop: an agent delegated at a gap number, posts at the other.
    const agent = createSubKey(root.did);
    const del = signControlEventV2(laptop, other.store.chainHead(laptop.did, 'public'), { n: gaps[0], kind: 'weave.delegate', space: 'public', body: { subject: agent.did, role: 'agent', permissions: ['*'] } });
    expect(other.ingest({ e: del })).toMatchObject({ status: 'rejected', reason: 'signer revoked' });
    expect(other.authority.grant(agent.did)).toBeUndefined();
    const numbered = signContentEventV2(laptop, { n: gaps[1], cs: heads.public.s + 1, kind: 'weave.post', space: 'public', body: { title: 'as the victim' } });
    expect(other.ingest({ e: numbered.event, b: numbered.body })).toMatchObject({ status: 'rejected', reason: 'signer revoked' });
    const unnumbered = signContentEventV2(laptop, { n: gaps[1], kind: 'weave.post', space: 'public', body: { title: 'as the victim, unnumbered' } });
    expect(other.ingest({ e: unnumbered.event, b: unnumbered.body })).toMatchObject({ status: 'rejected', reason: 'signer revoked' });
    // What it really wrote before stays.
    expect(other.events((r) => r.signer === laptop.did && r.scope === 'public').length).toBe(2);
    // And its events in the space the revocation didn't see (the owner never held them) count for nothing.
    passOnly(replica, other, 'nothing');
    expect(other.eventsBy(laptop.did).filter((r) => r.scope === 'group:chess')).toEqual([]);
  });
});

describe("nobody takes another's key by claiming it first (FTIDssuB)", () => {
  it("a squatter's delegation of a victim's device: the device's own events say whose it is, live and after a restart", () => {
    const attacker = createIdentity();
    const victim = createIdentity();
    const laptop = createSubKey(victim.did);
    const store = new MemoryStore();
    const other = new Replica(store);
    other.append(attacker, delegation(laptop.did, 'device', [], 'squat'));
    other.ingest(signEvent(victim, undefined, inception(createSubKey(victim.did).did, createSubKey(victim.did).did)));
    expect(other.ingest(signEvent(victim, other.store.head(victim.did), delegation(laptop.did, 'device', ['*'], 'laptop'))).status).toBe('accepted');
    expect(other.ingest(signEvent(laptop, undefined, { kind: 'weave.post', body: { text: 'hi' } })).status).toBe('accepted');
    expect(other.authority.grant(laptop.did)?.author).toBe(victim.did);
    expect(other.authority.personOf(laptop.did)).toBe(victim.did);
    // A revocation by the squatter touches only the squatter's claim.
    other.append(attacker, revocation(laptop.did, 0));
    expect(other.events((r) => r.signer === laptop.did)).toHaveLength(1);
    const again = new Replica(store);
    expect(again.authority.grant(laptop.did)?.author).toBe(victim.did);
    expect(again.events((r) => r.signer === laptop.did)).toHaveLength(1);
  });

  it("a person's identifier can't be delegated as someone's device", () => {
    const attacker = createIdentity();
    const victim = createIdentity();
    const other = new Replica();
    other.append(victim, inception(createSubKey(victim.did).did, createSubKey(victim.did).did));
    other.append(victim, { kind: 'weave.post', body: { text: 'by my root' } });
    other.append(attacker, delegation(victim.did, 'device', ['*'], 'hijack'));
    expect(other.authority.personOf(victim.did)).toBe(victim.did);
    expect(other.authority.grant(victim.did)).toBeUndefined();
  });
});
