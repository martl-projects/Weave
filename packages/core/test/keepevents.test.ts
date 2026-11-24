import { describe, expect, it } from 'vitest';
import { createIdentity, MemoryStore, Replica } from '../src/index.ts';

describe('a replica that keeps what a reading of its log gives', () => {
  it('reads the store once between changes, and again after each', () => {
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
    expect(readings).toBe(2);
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
