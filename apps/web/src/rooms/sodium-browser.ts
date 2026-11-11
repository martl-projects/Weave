import { ed25519 } from '@noble/curves/ed25519.js';

/*
 * What a browser's sodium (sodium-javascript, which sodium-universal is in a bundle) lacks for HyperDHT's Noise
 * handshake (noise-curve-ed): ed25519 scalar multiplication without clamping. Without it a website's tab never finishes
 * the handshake with a host, and says nothing. Done as libsodium does it: the scalar as it is but its top bit, the point
 * on the main subgroup, and neither result nor point the identity. Imported first, before anything reads the sodium.
 */

type Sodium = Record<string, unknown> & { crypto_scalarmult_ed25519_noclamp?: (q: Uint8Array, n: Uint8Array, p: Uint8Array) => void };

export function completeSodium(sodium: Sodium): void {
  sodium.crypto_scalarmult_ed25519_BYTES ??= 32;
  sodium.crypto_scalarmult_ed25519_SCALARBYTES ??= 32;
  sodium.crypto_scalarmult_ed25519_noclamp ??= (q, n, p) => {
    const t = Uint8Array.from(n);
    t[31] &= 127;
    let k = 0n;
    for (let i = 31; i >= 0; i--) k = (k << 8n) | BigInt(t[i]);
    k %= ed25519.Point.Fn.ORDER;
    const point = ed25519.Point.fromBytes(p);
    if (k === 0n || point.is0() || !point.isTorsionFree()) throw new Error('crypto_scalarmult_ed25519_noclamp: invalid point or scalar');
    const result = point.multiply(k);
    if (result.is0()) throw new Error('crypto_scalarmult_ed25519_noclamp: the identity');
    q.set(result.toBytes());
  };
}
