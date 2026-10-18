import { describe, expect, it } from 'vitest';
import { createIdentity, createSubKey, delegation, inception, MemoryStore, Replica, revocation, rotation, signEvent, type SigningIdentity } from '../src/index.ts';

/** A person set up the new way: root, committed next root, an encryption key and a device. */
function person() {
  const root = createIdentity();
  const next = createSubKey(root.did); // the pre-rotation key, kept in the recovery kit
  const enc = createSubKey(root.did);
  const laptop = createSubKey(root.did);
  const replica = new Replica();
  replica.append(root, inception(next.did, enc.did));
  replica.append(root, delegation(laptop.did, 'device', ['*'], 'laptop'));
  return { root, next, enc, laptop, replica };
}

const post = (who: SigningIdentity, text: string, head?: Parameters<typeof signEvent>[1]) => signEvent(who, head, { kind: 'weave.post', body: { text } });

describe('identity keys with pre-rotation', () => {
  it('publishes the encryption key and signs day to day with a device', () => {
    const { root, enc, laptop, replica } = person();
    expect(replica.authority.encryptionKey(root.did)).toBe(enc.did);
    replica.append(laptop, { kind: 'weave.post', body: { text: 'from the laptop' } });
    expect(replica.events((e) => e.kind === 'weave.post').map((e) => e.author)).toEqual([root.did]);
  });

  it('lets the committed next key take over, and voids what the old root signs afterwards', () => {
    const { root, next, replica } = person();
    const retireAt = replica.store.head(root.did)!.seq;
    const nextNext = createSubKey(root.did);
    replica.append(next, rotation(nextNext.did, retireAt));
    expect(replica.authority.keys(root.did).root).toBe(next.did);
    expect(replica.authority.personOf(next.did)).toBe(root.did);

    // A thief with the old root key: its new events are refused, delegations included.
    const stolen = signEvent(root, replica.store.head(root.did), { kind: 'weave.post', body: { text: 'I am Martin now' } });
    expect(replica.ingest(stolen)).toEqual({ status: 'rejected', reason: 'root key retired' });

    // The new root does everything a root does.
    const phone = createSubKey(root.did);
    replica.append(next, delegation(phone.did, 'device', ['*'], 'phone'));
    expect(replica.authority.grant(phone.did)?.role).toBe('device');
  });

  it('refuses a rotation by any key other than the committed one, and a second identity record', () => {
    const { root, replica } = person();
    const thief = createSubKey(root.did);
    expect(replica.ingest(signEvent(thief, undefined, rotation(createSubKey(root.did).did, 99))).status).toBe('rejected');
    // A stolen root can't swap the commitment for a key of its own.
    replica.append(root, inception(thief.did, thief.did));
    expect(replica.authority.encryptionKey(root.did)).not.toBe(thief.did);
    expect(replica.ingest(signEvent(thief, undefined, rotation(createSubKey(root.did).did, 99))).status).toBe('rejected');
  });

  it('voids delegations the old root made after its cutoff, even if they arrived before the rotation', () => {
    const { root, next, replica } = person();
    const retireAt = replica.store.head(root.did)!.seq;
    const evil = createSubKey(root.did);
    replica.append(root, delegation(evil.did, 'device', ['*'])); // the thief, before the owner notices
    const evilPost = post(evil, 'gotcha');
    expect(replica.ingest(evilPost).status).toBe('accepted');

    replica.append(next, rotation(createSubKey(root.did).did, retireAt));
    expect(replica.events((e) => e.kind === 'weave.post')).toEqual([]); // dropped from every view
  });

  it('rebuilds the same key state from disk, whatever order the logs come in', () => {
    const { root, next, laptop, replica } = person();
    replica.append(next, rotation(createSubKey(root.did).did, replica.store.head(root.did)!.seq));
    const agent = createSubKey(root.did);
    replica.append(laptop, delegation(agent.did, 'agent', ['weave.msg'], 'forge'));
    replica.append(next, revocation(laptop.did, 10));

    const store = new MemoryStore();
    for (const signer of [...replica.store.signers()].reverse()) for (const e of replica.store.range(signer, 1)) store.append(e);
    const reopened = new Replica(store);
    expect(reopened.authority.keys(root.did).root).toBe(next.did);
    expect(reopened.authority.grant(agent.did)?.name).toBe('forge');
    expect(reopened.authority.grant(laptop.did)?.revokedAfter).toBe(10);
  });

  it('keeps people without identity records working as before', () => {
    const old = createIdentity();
    const replica = new Replica();
    replica.append(old, { kind: 'weave.post', body: { text: 'legacy' } });
    expect(replica.authority.keys(old.did)).toMatchObject({ root: old.did, enc: old.did });
  });
});
