import { describe, expect, it } from 'vitest';
import { createIdentity, createSubKey, delegation, MemoryStore, Replica, revocation, type WireItemV2 } from '../src/index.ts';

describe('a replica that keeps what a reading of its log gives', () => {
  it('reads the store once, and puts what is taken in after that in its place', () => {
    const alice = createIdentity();
    const store = new MemoryStore();
    let readings = 0;
    const all2 = store.all2.bind(store);
    store.all2 = () => (readings++, all2());
    const replica = new Replica(store);
    replica.keepEvents();
    replica.append(alice, { kind: 'weave.post', body: { text: '1' } });
    readings = 0;
    expect(replica.events()).toHaveLength(1);
    expect(replica.events((e) => e.kind === 'weave.post')).toHaveLength(1);
    expect(replica.events((e) => e.kind === 'weave.other')).toHaveLength(0);
    expect(readings).toBe(1);
    // What a reading gives is the caller's own list.
    replica.events().length = 0;
    expect(replica.events()).toHaveLength(1);
    replica.append(alice, { kind: 'weave.post', body: { text: '2' } });
    expect(replica.events().map((e) => (e.body as { text: string }).text)).toEqual(['1', '2']);
    expect(readings).toBe(1);
  });

  it('gives what a reading of the store gives, whatever came: bodies late, an agent, its key taken back', () => {
    const alice = createIdentity();
    const forge = createSubKey(alice.did);
    const source = new Replica();
    source.append(alice, delegation(forge.did, 'agent', ['weave.post'], 'Forge'));
    for (let i = 0; i < 6; i++) source.write(i % 2 ? alice : forge, { kind: 'weave.post', body: { text: `post ${i}` } });
    const items = source.events();
    const store = new MemoryStore();
    let readings = 0;
    const all2 = store.all2.bind(store);
    store.all2 = () => (readings++, all2());
    const replica = new Replica(store);
    replica.keepEvents();
    const same = () => expect(replica.events()).toEqual(new Replica(store).events());
    replica.events();
    // Out of order, the agent's posts without their bodies first.
    for (const item of [...items].reverse()) replica.ingest(item.v === 2 ? { e: (item.wire as WireItemV2).e } : item);
    same();
    expect(replica.events((e) => !!e.missing).length).toBe(3);
    readings = 0;
    for (const item of items) if (item.v === 2) replica.ingest(item);
    expect(replica.events((e) => !!e.missing)).toEqual([]);
    replica.append(alice, { kind: 'weave.post', body: { text: 'one more' } });
    expect(replica.events()).toHaveLength(items.length + 1);
    // Nothing of that was a reason to read the store again (the comparison reads it, with a replica of its own).
    expect(readings).toBe(0);
    same();
    // A key event changes which events count: read again.
    readings = 0;
    replica.append(alice, revocation(forge.did, 1));
    replica.events();
    expect(readings).toBe(1);
    same();
  });

  it('hears of an event from inside a listener, and of those taken after it', () => {
    const alice = createIdentity();
    const source = new Replica();
    const first = source.append(alice, { kind: 'weave.post', body: { text: '1' } });
    const second = source.append(alice, { kind: 'weave.post', body: { text: '2' } });
    const replica = new Replica();
    replica.keepEvents();
    const seen: number[] = [];
    replica.onAppend(() => seen.push(replica.events().length));
    // The second waits for the first; taken once it came, after the listener read the log.
    expect(replica.ingest(second).status).toBe('pending');
    expect(replica.ingest(first).status).toBe('accepted');
    expect(seen).toEqual([1, 2]);
    expect(replica.events()).toHaveLength(2);
  });
});
