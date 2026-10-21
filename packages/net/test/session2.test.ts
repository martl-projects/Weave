import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createIdentity, Replica, signContentEventV2, type SigningIdentity } from '@weave/core';
import { duplexPair, PeerSession, PeerSession2, spaceTag, type HeldSpace } from '../src/index.ts';

/** A node for these tests: a replica, a person, and the spaces it holds with their keys. */
interface Peer {
  replica: Replica;
  me: SigningIdentity;
  spaces: HeldSpace[];
}

const KEYS: Record<string, Uint8Array> = { 'group:a': randomBytes(32), 'group:b': randomBytes(32), 'project:p': randomBytes(32) };

function peer(...spaces: string[]): Peer {
  return { replica: new Replica(), me: createIdentity(), spaces: spaces.map((space) => ({ space, keys: [KEYS[space]] })) };
}

function connect(a: Peer, b: Peer): { left: PeerSession2; right: PeerSession2; close: () => void } {
  const [sa, sb] = duplexPair();
  const left = new PeerSession2(a.replica, sa, { access: { spaces: () => a.spaces } });
  const right = new PeerSession2(b.replica, sb, { access: { spaces: () => b.spaces } });
  return { left, right, close: () => (left.close(), right.close()) };
}

/** Let queued stream callbacks run until replicas stop changing. */
async function settle(...peers: Peer[]): Promise<void> {
  let last = '';
  for (let i = 0; i < 200; i++) {
    await new Promise((resolve) => setImmediate(resolve));
    const now = JSON.stringify(peers.map((p) => p.replica.events().map((r) => [r.id, r.missing ?? false])));
    if (now === last && i > 5) return;
    last = now;
  }
}

const say = (p: Peer, space: string, text: string, time?: string) => p.replica.append2(p.me, { kind: 'weave.msg', space, body: { text }, ...(time ? { time } : {}) });
const texts = (p: Peer, space: string) => p.replica.events((r) => r.scope === space).map((r) => (r.body as { text?: string } | null)?.text ?? null).sort();

describe('PeerSession2: members-only sync', () => {
  it('shares only the spaces both hold, and public with everyone', async () => {
    const a = peer('group:a', 'group:b');
    const b = peer('group:a');
    say(a, 'group:a', 'for a');
    say(a, 'group:b', 'for b only');
    say(a, 'public', 'for all');
    say(b, 'group:a', 'from b');
    const { left } = connect(a, b);
    await settle(a, b);
    expect([...left.shared].sort()).toEqual(['group:a', 'public']);
    expect(texts(b, 'group:a')).toEqual(['for a', 'from b']);
    expect(texts(a, 'group:a')).toEqual(['for a', 'from b']);
    expect(texts(b, 'group:b')).toEqual([]);
    expect(texts(b, 'public')).toEqual(['for all']);
  });

  it('never hands a space to an outsider, even one connected to both members', async () => {
    const a = peer('group:a');
    const x = peer();
    const b = peer('group:a');
    connect(a, x);
    connect(x, b);
    say(a, 'group:a', 'secret');
    say(a, 'public', 'hello');
    await settle(a, x, b);
    expect(texts(x, 'group:a')).toEqual([]);
    expect(texts(b, 'group:a')).toEqual([]); // no member path between them
    expect(texts(b, 'public')).toEqual(['hello']);
    // Live too: what comes later stays inside.
    say(a, 'group:a', 'later');
    await settle(a, x, b);
    expect(texts(x, 'group:a')).toEqual([]);
  });

  it('relays inside a space, live and on connect, and catches up after a break', async () => {
    const [a, b, c] = [peer('project:p'), peer('project:p'), peer('project:p')];
    connect(a, b);
    const bc = connect(b, c);
    say(a, 'project:p', 'one');
    await settle(a, b, c);
    expect(texts(c, 'project:p')).toEqual(['one']);
    bc.close();
    say(a, 'project:p', 'two');
    say(a, 'project:p', 'three');
    await settle(a, b, c);
    expect(texts(c, 'project:p')).toEqual(['one']);
    connect(b, c);
    await settle(a, b, c);
    expect(texts(c, 'project:p')).toEqual(['one', 'three', 'two']);
  });

  it('gives a newcomer the whole history, and a returning member the last week compared again', async () => {
    const a = peer('group:a');
    const b = peer('group:a');
    const old = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();
    say(a, 'group:a', 'long ago', old);
    say(a, 'group:a', 'today');
    connect(a, b);
    await settle(a, b);
    expect(texts(b, 'group:a')).toEqual(['long ago', 'today']);
  });

  it('starts syncing a space joined while connected', async () => {
    const a = peer('group:a');
    const b = peer();
    say(a, 'group:a', 'before b joined');
    const { right } = connect(a, b);
    await settle(a, b);
    expect(texts(b, 'group:a')).toEqual([]);
    b.spaces.push({ space: 'group:a', keys: [KEYS['group:a']] });
    right.announce();
    await settle(a, b);
    expect(texts(b, 'group:a')).toEqual(['before b joined']);
  });

  it('fetches a body it holds the event of but not the body', async () => {
    const a = peer('group:a');
    const b = peer('group:a');
    const { event, body } = signContentEventV2(a.me, { n: 1, kind: 'weave.msg', space: 'group:a', body: { text: 'body later' } });
    a.replica.ingest({ e: event, b: body });
    b.replica.ingest({ e: event });
    expect(texts(b, 'group:a')).toEqual([null]);
    connect(a, b);
    await settle(a, b);
    expect(texts(b, 'group:a')).toEqual(['body later']);
  });

  it('takes no tags made for another connection', async () => {
    const a = peer('group:a');
    say(a, 'group:a', 'secret');
    const [sa, sx] = duplexPair();
    new PeerSession2(a.replica, sa, { access: { spaces: () => a.spaces } });
    const got: string[] = [];
    sx.on('data', (chunk) => got.push(chunk.toString()));
    // A tag for this space, but made with another connection's handshake hash (as a relay replaying someone's hello would).
    const replayed = spaceTag(KEYS['group:a'], randomBytes(32));
    sx.write(JSON.stringify({ t: 'hello', v: 2, tags: [replayed] }) + '\n');
    sx.write(JSON.stringify({ t: 'fetch', space: 'group:a', ids: a.replica.events().map((r) => r.id) }) + '\n');
    await settle(a);
    expect(got.join('')).not.toContain('"group:a","n"');
    expect(got.join('')).not.toContain('secret');
  });

  it('hands a v0.3 peer the v1 logs and takes nothing from it', async () => {
    const a = peer('group:a');
    a.replica.append(a.me, { kind: 'weave.msg', body: { text: 'farewell: please update' } });
    say(a, 'public', 'v2 only');
    const old = peer();
    old.replica.append(old.me, { kind: 'weave.post', body: 'from v0.3' });
    const [sa, so] = duplexPair();
    new PeerSession2(a.replica, sa, { access: { spaces: () => a.spaces } });
    new PeerSession(old.replica, so);
    await settle(a, old);
    expect(old.replica.events().map((r) => r.body)).toContainEqual({ text: 'farewell: please update' });
    expect(old.replica.events().some((r) => r.v === 2)).toBe(false);
    expect(a.replica.events((r) => r.author === old.me.author)).toEqual([]);
  });

  it('gives a peer that holds only the previous key the rekey events and nothing else', async () => {
    const [k0, k1] = [randomBytes(32), randomBytes(32)];
    // A rekeyed after removing someone: it holds the new key first, the old one second.
    const a: Peer = { replica: new Replica(), me: createIdentity(), spaces: [{ space: 'group:r', keys: [k1, k0] }] };
    const removed: Peer = { replica: new Replica(), me: createIdentity(), spaces: [{ space: 'group:r', keys: [k0] }] };
    say(a, 'group:r', 'before');
    a.replica.append2(a.me, { kind: 'weave.space.rekey', space: 'group:r', body: { epoch: 1, boxes: {} } });
    say(a, 'group:r', 'after the rekey');
    const offered: string[] = [];
    const [sa, sr] = duplexPair();
    new PeerSession2(a.replica, sa, { access: { spaces: () => a.spaces } });
    new PeerSession2(removed.replica, sr, { access: { spaces: () => removed.spaces, offerKeys: (items) => offered.push(...items.map((i) => i.e.kind)) } });
    await settle(a, removed);
    expect(offered).toEqual(['weave.space.rekey']);
    expect(removed.replica.events((r) => r.scope === 'group:r')).toHaveLength(0);
  });

  it('lets a member who is behind take the new key, then sync everything', async () => {
    const [k0, k1] = [randomBytes(32), randomBytes(32)];
    const a: Peer = { replica: new Replica(), me: createIdentity(), spaces: [{ space: 'group:r', keys: [k1, k0] }] };
    const behind: Peer = { replica: new Replica(), me: createIdentity(), spaces: [{ space: 'group:r', keys: [k0] }] };
    a.replica.append2(a.me, { kind: 'weave.space.rekey', space: 'group:r', body: { epoch: 1, boxes: {} } });
    say(a, 'group:r', 'after the rekey');
    const [sa, sb] = duplexPair();
    new PeerSession2(a.replica, sa, { access: { spaces: () => a.spaces } });
    const session: PeerSession2 = new PeerSession2(behind.replica, sb, {
      access: {
        spaces: () => behind.spaces,
        // The node opens its box and keeps the new key, then says hello again.
        offerKeys: () => {
          behind.spaces = [{ space: 'group:r', keys: [k1, k0] }];
          setImmediate(() => session.announce());
        },
      },
    });
    await settle(a, behind);
    expect(texts(behind, 'group:r')).toEqual(['after the rekey', null]); // the rekey event has no text
  });

  it('in a pulled space, takes envelopes of everything but bodies only for the recent window and what it keeps, and older on request', async () => {
    const a = peer('group:a');
    const day = 24 * 3600 * 1000;
    const old = (d: number) => new Date(Date.now() - d * day).toISOString();
    const kept = say(a, 'group:a', 'old but kept', old(60));
    say(a, 'group:a', 'old one', old(50));
    say(a, 'group:a', 'old two', old(40));
    say(a, 'group:a', 'recent');
    const b: Peer = { replica: new Replica(), me: createIdentity(), spaces: [{ space: 'group:a', keys: [KEYS['group:a']], pulled: { windowMs: 7 * day } }] };
    const [sa, sb] = duplexPair();
    new PeerSession2(a.replica, sa, { access: { spaces: () => a.spaces } });
    const session = new PeerSession2(b.replica, sb, { access: { spaces: () => b.spaces, wantsBody: (_space, id) => id === kept.id } });
    await settle(a, b);
    expect(b.replica.events((r) => r.scope === 'group:a')).toHaveLength(4);
    expect(texts(b, 'group:a')).toEqual([null, null, 'old but kept', 'recent']);
    // "Load older": a stretch of time, with bodies.
    session.fetchRange('group:a', old(55), old(45));
    await settle(a, b);
    expect(texts(b, 'group:a')).toEqual([null, 'old but kept', 'old one', 'recent']);
  });
});
