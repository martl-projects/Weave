import { describe, expect, it } from 'vitest';
import { createIdentity, createSubKey, delegation, inception, MemoryStore, Replica, revocation, signContentEventV2, signControlEventV2, signEvent } from '../src/index.ts';

/*
 * Regression tests from the pre-release review, each reproducing an issue (its
 * id in the test's name) and checking it stays fixed. They guard authority.ts:
 * whose a key is, and what a revoked key's events still count for.
 */

/** A person with a root (v1 foundation) and a laptop that signs day to day. */
function person() {
  const root = createIdentity();
  const laptop = createSubKey(root.did);
  const replica = new Replica();
  replica.append(root, inception(createSubKey(root.did).did, createSubKey(root.did).did));
  replica.append(root, delegation(laptop.did, 'device', ['*'], 'laptop'));
  return { root, laptop, replica };
}

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
