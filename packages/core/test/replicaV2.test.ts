import { describe, expect, it } from 'vitest';
import {
  bodyHash,
  createIdentity,
  createSubKey,
  delegation,
  eventId,
  inception,
  Replica,
  revocation,
  signContentEventV2,
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
const pass = (from: Replica, to: Replica) => from.records().forEach((r) => to.ingest(r));

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

    const records = replica.records((r) => r.author === root.did && r.signer === laptop.did);
    expect(records.map((r) => [r.v, r.kind, r.body])).toEqual([
      [1, 'weave.post', { title: 'v1 post' }],
      [2, 'weave.space.create', { name: 'Weave' }],
      [2, 'weave.post', { title: 'v2 post' }],
    ]);
    expect(records[2]).toMatchObject({ id: post.id, scope: 'project:abc', class: 'content' });

    // Another replica takes them all, in any order.
    const other = new Replica();
    for (const r of replica.records().reverse()) other.ingest(r);
    pass(replica, other);
    expect(other.records().map((r) => r.id)).toEqual(replica.records().map((r) => r.id));
  });

  it('keeps a content event without its body, and takes the body when it comes', () => {
    const { laptop, replica } = person();
    const other = new Replica();
    pass(replica, other);
    const { event, body } = signContentEventV2(laptop, { n: 1, kind: 'weave.msg', space: 'group:g', body: { text: 'hi' } });
    const seen: WeaveRecord[] = [];
    other.onRecord((r) => seen.push(r));

    // A wrong body is dropped; the event stands without it.
    expect(other.ingest({ e: event, b: { text: 'forged' } }).status).toBe('accepted');
    expect(other.records((r) => r.kind === 'weave.msg')[0]).toMatchObject({ missing: true, body: null });
    expect(other.ingest({ e: event }).status).toBe('duplicate');

    expect(other.ingest({ e: event, b: body }).status).toBe('accepted');
    expect(other.records((r) => r.kind === 'weave.msg')[0]).toMatchObject({ body: { text: 'hi' } });
    expect(other.records((r) => r.kind === 'weave.msg')[0].missing).toBeUndefined();
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
    expect(kinds(other.records((r) => r.scope === 'project:p'))).toEqual(['weave.space.create', 'weave.board']);
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
    const posts = replica.records((r) => r.kind === 'weave.post');
    expect(posts.map((r) => [r.v, r.id])).toEqual([[2, eventId(v1)]]);
    expect(replica.forks.size).toBe(0);
    // And in the other order: the v2 one first, then the v1 event it re-signs.
    const { laptop: l2, replica: r2 } = person();
    const early = r2.append(l2, { kind: 'weave.post', body: { title: 'x' } });
    const fresh = new Replica();
    for (const r of r2.records((r) => r.kind !== 'weave.post')) fresh.ingest(r);
    const again = signContentEventV2(l2, { n: early.seq, kind: 'weave.post', space: 'public', body: { title: 'x' }, was: eventId(early) });
    expect(fresh.ingest({ e: again.event, b: again.body }).status).toBe('accepted');
    expect(fresh.ingest(early).status).toBe('accepted');
    expect(fresh.records((r) => r.kind === 'weave.post').map((r) => r.v)).toEqual([2]);
    // A `was` that names an id another event already holds.
    const thief = signContentEventV2(l2, { n: 9, kind: 'weave.post', space: 'public', body: {}, was: eventId(early) });
    expect(fresh.ingest({ e: thief.event, b: thief.body })).toEqual({ status: 'rejected', reason: 'id already taken' });
  });

  it('voids a revoked key’s v2 events after the cutoff, by number', () => {
    const { root, laptop, replica } = person();
    for (let i = 1; i <= 4; i++) replica.append2(laptop, { kind: 'weave.msg', space: 'group:g', body: { text: `m${i}` } });
    replica.append(root, revocation(laptop.did, 2));
    expect(replica.records((r) => r.kind === 'weave.msg').map((r) => r.body)).toEqual([{ text: 'm1' }, { text: 'm2' }]);
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
    expect(replica.records((r) => r.signer === agent.did)).toHaveLength(1);
    expect(replica.ingest({ e: signContentEventV2(agent, { n: 2, kind: 'weave.msg', space: 'public', body: {} }).event })).toMatchObject({ status: 'rejected' });

    const restarted = new Replica(replica.store);
    expect(restarted.authority.grant(agent.did)?.name).toBe('helper');
    expect(restarted.records((r) => r.signer === agent.did)).toHaveLength(1);
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
