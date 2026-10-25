import { describe, expect, it } from 'vitest';
import { createIdentity, keepStreamId, keepTag, keepWrapKey, padded, unwrapFromKeeper, wrapForKeeper } from '../src/index.ts';

const secret = new Uint8Array(32).fill(7);

describe('keeping for friends', () => {
  it('wraps items padded to powers of two, opened only with the same words', () => {
    const key = keepWrapKey(secret, 'direct:abc');
    const short = wrapForKeeper(key, { e: { text: 'hi' } });
    const long = wrapForKeeper(key, { e: { text: 'x'.repeat(300) } });
    expect(unwrapFromKeeper(key, short)).toEqual({ e: { text: 'hi' } });
    expect(unwrapFromKeeper(keepWrapKey(new Uint8Array(32), 'direct:abc'), short)).toBeUndefined();
    expect(unwrapFromKeeper(keepWrapKey(secret, 'direct:other'), short)).toBeUndefined();
    // Sizes say little: everything small looks the same.
    expect(wrapForKeeper(key, { e: 1 }).length).toBe(short.length);
    expect(long.length).toBeGreaterThan(short.length);
    expect(padded('abc').length).toBe(256);
    expect(padded('x'.repeat(300)).length).toBe(512);
  });

  it('gives each keeper its own stream id, and tags that hide the event', () => {
    const [k1, k2] = [createIdentity().did, createIdentity().did];
    expect(keepStreamId(secret, 'self', k1)).not.toBe(keepStreamId(secret, 'self', k2));
    expect(keepStreamId(secret, 'self', k1)).toBe(keepStreamId(new Uint8Array(32).fill(7), 'self', k1));
    const key = keepWrapKey(secret, 'self');
    expect(keepTag(key, 'event-1')).not.toContain('event');
    expect(keepTag(key, 'event-1')).toBe(keepTag(key, 'event-1'));
  });
});
