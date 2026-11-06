import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { b64u, normalizeWords, open, seal, utf8, type Json, type Sealed } from '@weave/core';

/*
 * What opens an account in a browser (docs/web-stage2.md, step 7). A passkey's PRF value, or the recovery words, gives two
 * things that can't be told from each other: a key, which opens this browser's home key and the box at the storage node,
 * and a token, which finds that box. The storage node gets the token only, and keeps a hash of it.
 */

/** Asked of a passkey, the same everywhere, so a passkey that synced gives the same value on the next device. */
export const PRF_SALT = sha256(utf8('weave/web/prf/v1'));

export interface Opening {
  key: Uint8Array;
  token: Uint8Array;
}

const derive = (secret: Uint8Array, what: string) => hkdf(sha256, secret, undefined, utf8(`weave/web/${what}/v1`), 32);

export function openingFrom(secret: Uint8Array): Opening {
  if (secret.length < 32) throw new Error('that secret is too short');
  return { key: derive(secret, 'key'), token: derive(secret, 'token') };
}

export const openingFromWords = (words: string): Opening => openingFrom(sha256(utf8(`weave/web/words/v1 ${normalizeWords(words)}`)));

const HOME = 'weave/web/home/v1';
const BOX = 'weave/web/box/v1';

/** This browser's home key, as it lies at rest. */
export const sealHomeKey = (opening: Opening, homeKey: Uint8Array): Sealed => seal(opening.key, b64u.encode(homeKey), HOME);
export const openHomeKey = (opening: Opening, sealed: Sealed): Uint8Array => b64u.decode(open(opening.key, sealed, HOME) as string);

export const sealBox = (opening: Opening, box: Json): string => JSON.stringify(seal(opening.key, box, BOX));
export const openBox = <T>(opening: Opening, data: string): T => open(opening.key, JSON.parse(data) as Sealed, BOX) as unknown as T;
