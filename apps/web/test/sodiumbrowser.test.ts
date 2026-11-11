import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import sodium from 'sodium-native';
import { completeSodium } from '../src/rooms/sodium-browser.ts';

/* A browser's sodium, completed for HyperDHT's handshake (src/rooms/sodium-browser.ts): as libsodium computes it. */

describe("a browser's sodium, completed", () => {
  it('multiplies an ed25519 point by a scalar without clamping, as libsodium does', () => {
    const ours: Record<string, unknown> = {};
    completeSodium(ours);
    const noclamp = ours.crypto_scalarmult_ed25519_noclamp as (q: Uint8Array, n: Uint8Array, p: Uint8Array) => void;
    for (let i = 0; i < 20; i++) {
      // A public key, and a scalar as noise-curve-ed makes it from a secret key.
      const publicKey = Buffer.alloc(32);
      sodium.crypto_sign_keypair(publicKey, Buffer.alloc(64));
      const scalar = randomBytes(32);
      if (i % 2) (scalar[0] &= 248), (scalar[31] &= 127), (scalar[31] |= 64);
      const theirs = Buffer.alloc(32);
      sodium.crypto_scalarmult_ed25519_noclamp(theirs, scalar, publicKey);
      const mine = new Uint8Array(32);
      noclamp(mine, scalar, publicKey);
      expect(Buffer.from(mine).toString('hex')).toBe(theirs.toString('hex'));
    }
    expect(ours.crypto_scalarmult_ed25519_BYTES).toBe(32);
    expect(() => noclamp(new Uint8Array(32), new Uint8Array(32), Buffer.alloc(32))).toThrow();
  });
});
