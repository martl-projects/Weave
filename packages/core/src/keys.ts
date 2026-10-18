import { ed25519 } from '@noble/curves/ed25519.js';
import { base58 } from '@scure/base';

export interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export function generateKeyPair(): KeyPair {
  const { publicKey, secretKey } = ed25519.keygen();
  return { publicKey, secretKey };
}

export const sign = (message: Uint8Array, secretKey: Uint8Array): Uint8Array => ed25519.sign(message, secretKey);

export function verify(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean {
  try {
    return ed25519.verify(signature, message, publicKey);
  } catch {
    return false;
  }
}

/** A `did:key` identifier: multicodec ed25519-pub (0xed 0x01) + key, base58btc with a `z` prefix. */
export type Did = `did:key:z${string}`;

const ED25519_PUB = [0xed, 0x01];

export function didFromPublicKey(publicKey: Uint8Array): Did {
  if (publicKey.length !== 32) throw new TypeError('ed25519 public key must be 32 bytes');
  return `did:key:z${base58.encode(Uint8Array.from([...ED25519_PUB, ...publicKey]))}`;
}

export function publicKeyFromDid(did: string): Uint8Array {
  if (!did.startsWith('did:key:z')) throw new TypeError(`not a did:key: ${did}`);
  const bytes = base58.decode(did.slice('did:key:z'.length));
  if (bytes.length !== 34 || bytes[0] !== ED25519_PUB[0] || bytes[1] !== ED25519_PUB[1]) {
    throw new TypeError(`not an ed25519 did:key: ${did}`);
  }
  return bytes.slice(2);
}

export function isDid(value: unknown): value is Did {
  if (typeof value !== 'string') return false;
  try {
    publicKeyFromDid(value);
    return true;
  } catch {
    return false;
  }
}
