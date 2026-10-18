import { describe, expect, it } from 'vitest';
import { createIdentity, createSubKey, delegation, Replica } from '@weave/core';
import { duplexPair, PeerSession } from '../src/index.ts';

function connect(a: Replica, b: Replica): () => void {
  const [sa, sb] = duplexPair();
  const left = new PeerSession(a, sa);
  const right = new PeerSession(b, sb);
  return () => {
    left.close();
    right.close();
  };
}

/** Let queued stream callbacks run until replicas stop changing. */
async function settle(...replicas: Replica[]): Promise<void> {
  let last = '';
  for (let i = 0; i < 100; i++) {
    await new Promise((resolve) => setImmediate(resolve));
    const now = JSON.stringify(replicas.map((r) => r.heads()));
    if (now === last) return;
    last = now;
  }
}

describe('PeerSession', () => {
  it('exchanges what each side is missing on connect', async () => {
    const alice = createIdentity();
    const bob = createIdentity();
    const a = new Replica();
    const b = new Replica();
    for (let i = 0; i < 3; i++) a.append(alice, { kind: 'weave.post', body: `alice ${i}` });
    for (let i = 0; i < 2; i++) b.append(bob, { kind: 'weave.post', body: `bob ${i}` });

    connect(a, b);
    await settle(a, b);

    expect(a.heads()).toEqual(b.heads());
    expect(a.events()).toHaveLength(5);
  });

  it('pushes new events live after connecting', async () => {
    const alice = createIdentity();
    const a = new Replica();
    const b = new Replica();
    connect(a, b);
    await settle(a, b);

    a.append(alice, { kind: 'weave.post', body: 'live' });
    await settle(a, b);
    expect(b.events().map((e) => e.body)).toEqual(['live']);
  });

  it('relays through intermediate peers (a - b - c)', async () => {
    const alice = createIdentity();
    const carol = createIdentity();
    const [a, b, c] = [new Replica(), new Replica(), new Replica()];
    connect(a, b);
    connect(b, c);
    a.append(alice, { kind: 'weave.post', body: 'from a' });
    c.append(carol, { kind: 'weave.post', body: 'from c' });
    await settle(a, b, c);

    expect(a.heads()).toEqual(c.heads());
    expect(c.events().map((e) => e.body).sort()).toEqual(['from a', 'from c']);
  });

  it('catches up after a disconnect', async () => {
    const alice = createIdentity();
    const a = new Replica();
    const b = new Replica();
    const disconnect = connect(a, b);
    a.append(alice, { kind: 'weave.post', body: 1 });
    await settle(a, b);
    disconnect();

    a.append(alice, { kind: 'weave.post', body: 2 });
    a.append(alice, { kind: 'weave.post', body: 3 });
    expect(b.heads()[alice.did]).toBe(1);

    connect(a, b);
    await settle(a, b);
    expect(b.heads()[alice.did]).toBe(3);
  });

  it('carries agent events together with the delegation that authorizes them', async () => {
    const alice = createIdentity();
    const forge = createSubKey(alice.did);
    const a = new Replica();
    const b = new Replica();
    a.append(alice, delegation(forge.did, 'agent', ['weave.post']));
    a.append(forge, { kind: 'weave.post', body: 'agent update' });

    connect(a, b);
    await settle(a, b);
    expect(b.events((e) => e.signer === forge.did)).toHaveLength(1);
    expect(b.pendingCount).toBe(0);
  });

  it('drops a peer that sends garbage, and ignores forged events', async () => {
    const alice = createIdentity();
    const b = new Replica();
    const [sa, sb] = duplexPair();
    new PeerSession(b, sb);
    const forged = { ...new Replica().append(alice, { kind: 'weave.post', body: 'real' }), body: 'forged' };
    sa.write(JSON.stringify({ t: 'events', events: [forged] }) + '\n');
    await settle(b);
    expect(b.events()).toHaveLength(0);

    let closed = false;
    sb.on('close', () => (closed = true));
    sa.write('not json\n');
    await settle(b);
    expect(closed).toBe(true);
  });
});
