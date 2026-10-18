import { describe, expect, it } from 'vitest';
import {
  canonicalJson,
  createIdentity,
  createSubKey,
  delegation,
  didFromPublicKey,
  eventId,
  permits,
  publicKeyFromDid,
  Replica,
  revocation,
  signEvent,
  verifyEventSignature,
  type WeaveEvent,
} from '../src/index.ts';

describe('canonicalJson', () => {
  it('sorts keys at every level and drops undefined', () => {
    expect(canonicalJson({ b: 1, a: { d: [1, 2], c: 'x' } })).toBe('{"a":{"c":"x","d":[1,2]},"b":1}');
  });

  it('rejects non-finite numbers', () => {
    expect(() => canonicalJson(Number.NaN)).toThrow();
  });
});

describe('did:key', () => {
  it('round-trips a public key', () => {
    const { keys, did } = createIdentity();
    expect(did).toMatch(/^did:key:z6Mk/);
    expect(publicKeyFromDid(did)).toEqual(keys.publicKey);
    expect(didFromPublicKey(keys.publicKey)).toBe(did);
  });
});

describe('events', () => {
  it('signs and verifies, and chains by hash', () => {
    const alice = createIdentity();
    const first = signEvent(alice, undefined, { kind: 'weave.post', body: { text: 'hello' } });
    const second = signEvent(alice, first, { kind: 'weave.post', body: { text: 'again' } });
    expect(verifyEventSignature(first)).toBe(true);
    expect(second.seq).toBe(2);
    expect(second.prev).toBe(eventId(first));
  });

  it('detects tampering', () => {
    const alice = createIdentity();
    const event = signEvent(alice, undefined, { kind: 'weave.post', body: { text: 'hello' } });
    expect(verifyEventSignature({ ...event, body: { text: 'goodbye' } })).toBe(false);
  });
});

describe('Replica', () => {
  it('accepts a valid log and reports heads', () => {
    const alice = createIdentity();
    const replica = new Replica();
    replica.append(alice, { kind: 'weave.post', body: { text: '1' } });
    replica.append(alice, { kind: 'weave.post', body: { text: '2' } });
    expect(replica.heads()).toEqual({ [alice.did]: 2 });
  });

  it('treats a re-delivered event as a duplicate and a different one at the same seq as a fork', () => {
    const alice = createIdentity();
    const replica = new Replica();
    const event = replica.append(alice, { kind: 'weave.post', body: 'a' });
    expect(replica.ingest(event).status).toBe('duplicate');
    const fork = signEvent(alice, undefined, { kind: 'weave.post', body: 'b' });
    expect(replica.ingest(fork)).toEqual({ status: 'rejected', reason: 'conflicting event (fork)' });
  });

  it('holds events after a gap until the missing one arrives', () => {
    const alice = createIdentity();
    const e1 = signEvent(alice, undefined, { kind: 'weave.post', body: 1 });
    const e2 = signEvent(alice, e1, { kind: 'weave.post', body: 2 });
    const e3 = signEvent(alice, e2, { kind: 'weave.post', body: 3 });
    const replica = new Replica();
    expect(replica.ingest(e3).status).toBe('pending');
    expect(replica.ingest(e2).status).toBe('pending');
    expect(replica.ingest(e1).status).toBe('accepted');
    expect(replica.heads()[alice.did]).toBe(3);
    expect(replica.pendingCount).toBe(0);
  });

  it('rejects a broken hash chain', () => {
    const alice = createIdentity();
    const e1 = signEvent(alice, undefined, { kind: 'weave.post', body: 1 });
    const other = signEvent(alice, undefined, { kind: 'weave.post', body: 'other' });
    const e2 = signEvent(alice, other, { kind: 'weave.post', body: 2 }); // chained to the wrong parent
    const replica = new Replica();
    replica.ingest(e1);
    expect(replica.ingest(e2)).toEqual({ status: 'rejected', reason: 'broken hash chain' });
  });

  it('restores delegations when opened on an existing store', () => {
    const alice = createIdentity();
    const laptop = createSubKey(alice.did);
    const first = new Replica();
    first.append(alice, delegation(laptop.did, 'device', ['*']));
    first.append(laptop, { kind: 'weave.post', body: 'hi' });

    const reopened = new Replica(first.store);
    expect(reopened.authority.grant(laptop.did)?.role).toBe('device');
    expect(reopened.events()).toHaveLength(2);
  });

  it('rejects malformed input', () => {
    expect(new Replica().ingest({ hello: 'world' }).status).toBe('rejected');
  });
});

describe('permits', () => {
  it('matches exact kinds, families and everything', () => {
    expect(permits(['weave.issue.*'], 'weave.issue')).toBe(true);
    expect(permits(['weave.issue.*'], 'weave.issue.claim')).toBe(true);
    expect(permits(['weave.issue.*'], 'weave.issues')).toBe(false);
    expect(permits(['weave.post'], 'weave.post')).toBe(true);
    expect(permits(['weave.post'], 'weave.vote')).toBe(false);
    expect(permits(['*'], 'anything.at.all')).toBe(true);
  });
});

describe('delegation', () => {
  it('lets a delegated agent sign permitted kinds only', () => {
    const alice = createIdentity();
    const forge = createSubKey(alice.did);
    const replica = new Replica();
    replica.append(alice, delegation(forge.did, 'agent', ['weave.post', 'weave.reply'], 'Forge'));

    replica.append(forge, { kind: 'weave.post', body: { text: 'benchmark done' } });
    expect(replica.authority.grant(forge.did)?.name).toBe('Forge');

    const vote = signEvent(forge, replica.store.head(forge.did), { kind: 'weave.vote', body: { yes: true } });
    expect(replica.ingest(vote)).toEqual({ status: 'rejected', reason: 'signer may not sign weave.vote' });
  });

  it('lets a full device add agents, but not devices; limited keys delegate nothing', () => {
    const alice = createIdentity();
    const laptop = createSubKey(alice.did);
    const bot = createSubKey(alice.did);
    const replica = new Replica();
    replica.append(alice, delegation(laptop.did, 'device', ['*']));
    replica.append(alice, delegation(bot.did, 'agent', ['weave.post']));

    const agent = createSubKey(alice.did);
    replica.append(laptop, delegation(agent.did, 'agent', ['weave.msg']));
    expect(replica.authority.grant(agent.did)?.role).toBe('agent');

    const device = createSubKey(alice.did);
    replica.append(laptop, delegation(device.did, 'device', ['*'])); // accepted into the log, but no effect
    expect(replica.authority.grant(device.did)).toBeUndefined();

    const sneaky = signEvent(bot, undefined, delegation(createSubKey(alice.did).did, 'agent', ['*']));
    expect(replica.ingest(sneaky).status).toBe('rejected');
  });

  it('waits for a delegation that arrives later', () => {
    const alice = createIdentity();
    const phone = createSubKey(alice.did);
    const grant = signEvent(alice, undefined, delegation(phone.did, 'device', ['weave.*']));
    const post = signEvent(phone, undefined, { kind: 'weave.post', body: 'from my phone' });

    const replica = new Replica();
    expect(replica.ingest(post)).toEqual({ status: 'pending', reason: 'signer not delegated by author' });
    expect(replica.ingest(grant).status).toBe('accepted');
    expect(replica.heads()[phone.did]).toBe(1);
  });

  it('rejects a key claiming to act for someone who never delegated to it', () => {
    const alice = createIdentity();
    const mallory = createIdentity();
    const fake = createSubKey(alice.did);
    const replica = new Replica();
    replica.append(mallory, delegation(fake.did, 'agent', ['*'])); // mallory delegates, but the key claims alice
    const post = signEvent(fake, undefined, { kind: 'weave.post', body: 'I am alice' });
    expect(replica.ingest(post).status).toBe('pending');
    expect(replica.events((e) => e.signer === fake.did)).toHaveLength(0);
  });

  it('revocation cuts off a key after a given seq, also for events already stored', () => {
    const alice = createIdentity();
    const laptop = createSubKey(alice.did);
    const replica = new Replica();
    replica.append(alice, delegation(laptop.did, 'device', ['*']));
    replica.append(laptop, { kind: 'weave.post', body: 'ok' });
    replica.append(laptop, { kind: 'weave.post', body: 'stolen laptop' });
    replica.append(alice, revocation(laptop.did, 1));

    const texts = replica.events((e) => e.signer === laptop.did).map((e: WeaveEvent) => e.body);
    expect(texts).toEqual(['ok']);
    const later = signEvent(laptop, replica.store.head(laptop.did), { kind: 'weave.post', body: 'more' });
    expect(replica.ingest(later)).toEqual({ status: 'rejected', reason: 'signer revoked' });
  });
});
