import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { entropyToMnemonic, mnemonicToEntropy, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import { utf8 } from './bytes.ts';
import { randomBytes } from './crypto.ts';
import { didFromPublicKey, type Did } from './keys.ts';
import type { SigningIdentity } from './events.ts';

/*
 * The recovery kit: 24 words (BIP39), written down once and never stored by
 * Weave. Every root key and every encryption key a person will ever use is
 * derived from them, one after the other:
 *
 *   root 0      the identity (its did:key is the person's identifier)
 *   root 1, 2…  the pre-committed next roots, used one per rotation
 *   enc 0, 1…   encryption keys, one per encryption-key rotation
 *
 * Because each key is derived on its own (HKDF), a leaked root key reveals
 * nothing about the next one, but the words reveal everything: they are the
 * one thing to keep safe, away from the computer and from agents.
 */

export type RecoveryWords = string;

/** 24 fresh words. */
export function newRecoveryWords(): RecoveryWords {
  return entropyToMnemonic(randomBytes(32), wordlist);
}

/** The words cleaned up, or an error saying what's wrong with them. */
export function normalizeWords(words: string): RecoveryWords {
  const clean = words.trim().toLowerCase().split(/\s+/).join(' ');
  if (clean.split(' ').length !== 24) throw new Error('the recovery kit is 24 words');
  if (!validateMnemonic(clean, wordlist)) throw new Error("these words aren't a valid recovery kit — check for typos");
  return clean;
}

function derive(words: RecoveryWords, label: string): SigningIdentity['keys'] {
  const entropy = mnemonicToEntropy(normalizeWords(words), wordlist);
  const secretKey = hkdf(sha256, entropy, utf8('weave/recovery/v1'), utf8(label), 32);
  return { secretKey, publicKey: ed25519.getPublicKey(secretKey) };
}

/** Root key number `index` (0 = the identity itself). */
export function recoveryRoot(words: RecoveryWords, index: number): SigningIdentity['keys'] & { did: Did } {
  const keys = derive(words, `root/${index}`);
  return { ...keys, did: didFromPublicKey(keys.publicKey) };
}

/** Encryption key number `index`. */
export function recoveryEncryptionKey(words: RecoveryWords, index: number): SigningIdentity['keys'] & { did: Did } {
  const keys = derive(words, `enc/${index}`);
  return { ...keys, did: didFromPublicKey(keys.publicKey) };
}

/** The identifier these words belong to. */
export const recoveryIdentity = (words: RecoveryWords): Did => recoveryRoot(words, 0).did;

/** Which root (or encryption key) number has this did, searching the first `max`. */
export function findIndex(words: RecoveryWords, did: Did, kind: 'root' | 'enc', max = 64): number | undefined {
  for (let i = 0; i < max; i++) if ((kind === 'root' ? recoveryRoot(words, i) : recoveryEncryptionKey(words, i)).did === did) return i;
  return undefined;
}
