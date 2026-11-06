import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { randomBytes } from '@noble/ciphers/utils.js';
import { ed25519, x25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { b64u, canonicalJson, utf8, type Json } from './bytes.ts';
import { publicKeyFromDid, type Did } from './keys.ts';

export { randomBytes };

/** A fresh X25519 key pair for one connection (wspeer.ts). */
export const ephemeralKeys = (): { secretKey: Uint8Array; publicKey: Uint8Array } => x25519.keygen();

/** What two such keys agree on. */
export const sharedSecret = (secretKey: Uint8Array, theirPublicKey: Uint8Array): Uint8Array => x25519.getSharedSecret(secretKey, theirPublicKey);

/** Symmetrically encrypted JSON, as stored in an event body. */
export interface Sealed {
  nonce: string;
  ct: string;
  [key: string]: Json;
}

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

/** Encrypt a JSON value with a 32-byte key (XChaCha20-Poly1305). `context` is authenticated, not encrypted. */
export function seal(key: Uint8Array, value: Json, context: string): Sealed {
  const nonce = randomBytes(24);
  const ct = xchacha20poly1305(key, nonce, utf8(context)).encrypt(utf8(canonicalJson(value)));
  return { nonce: b64u.encode(nonce), ct: b64u.encode(ct) };
}

/** Decrypt what `seal` produced; throws if the key or context is wrong or the data was altered. */
export function open(key: Uint8Array, sealed: Sealed, context: string): Json {
  const plain = xchacha20poly1305(key, b64u.decode(sealed.nonce), utf8(context)).decrypt(b64u.decode(sealed.ct));
  return JSON.parse(new TextDecoder().decode(plain)) as Json;
}

export interface Box {
  epk: string;
  nonce: string;
  ct: string;
  [key: string]: Json;
}

/**
 * Encrypt to one identity: an ephemeral X25519 key agreed with the recipient's
 * Ed25519 key converted to X25519. Used to hand out new group keys.
 */
export function boxTo(recipient: Did, value: Json): Box {
  const recipientX = ed25519.utils.toMontgomery(publicKeyFromDid(recipient));
  const ephemeral = x25519.keygen();
  const key = boxKey(x25519.getSharedSecret(ephemeral.secretKey, recipientX), ephemeral.publicKey, recipientX);
  return { epk: b64u.encode(ephemeral.publicKey), ...seal(key, value, 'weave/box/v1') };
}

export function openBox(secretKey: Uint8Array, publicKey: Uint8Array, box: Box): Json {
  const myX = ed25519.utils.toMontgomery(publicKey);
  const epk = b64u.decode(box.epk);
  const key = boxKey(x25519.getSharedSecret(ed25519.utils.toMontgomerySecret(secretKey), epk), epk, myX);
  return open(key, box, 'weave/box/v1');
}

const boxKey = (shared: Uint8Array, epk: Uint8Array, recipientX: Uint8Array): Uint8Array =>
  sha256(concat(utf8('weave/box-key/v1'), shared, epk, recipientX));

/**
 * A key two identities share without ever exchanging it: each side combines its
 * own secret key with the other's public key (X25519), so both arrive at the
 * same value. Used for direct chats between friends.
 */
export function pairKey(secretKey: Uint8Array, publicKey: Uint8Array, peer: Did): Uint8Array {
  const mine = ed25519.utils.toMontgomery(publicKey);
  const theirs = ed25519.utils.toMontgomery(publicKeyFromDid(peer));
  const shared = x25519.getSharedSecret(ed25519.utils.toMontgomerySecret(secretKey), theirs);
  const [a, b] = [mine, theirs].sort((x, y) => b64u.encode(x).localeCompare(b64u.encode(y)));
  return sha256(concat(utf8('weave/pair-key/v1'), shared, a, b));
}

/** Key for encrypting things only your own nodes may read (private follows, blocks, mutes). */
export const selfKey = (secretKey: Uint8Array): Uint8Array => sha256(concat(utf8('weave/self-key/v1'), secretKey));
