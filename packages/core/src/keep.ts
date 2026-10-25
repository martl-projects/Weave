import { sha256 } from '@noble/hashes/sha2.js';
import { b64u, canonicalJson, utf8, type Json } from './bytes.ts';
import { open, seal, type Sealed } from './crypto.ts';
import type { Did } from './keys.ts';

/*
 * Keepers (docs/v2-stage5.md): friends who keep a wrapped, padded copy of your
 * small spaces. Everything here comes from your self secret (your first
 * encryption key, from your recovery words), so a new device restored from
 * the words finds and opens the same streams.
 */

const join = (...parts: Array<string | Uint8Array>) => new Uint8Array(parts.flatMap((p) => [...(typeof p === 'string' ? utf8(p) : p), 0]));

/** The key a space's items are wrapped with for keepers. */
export const keepWrapKey = (selfSecret: Uint8Array, space: string): Uint8Array => sha256(join('weave/keep/wrap/v1', selfSecret, space));

/** The stream a keeper holds for one of your spaces: different for each keeper, so they can't match notes. */
export const keepStreamId = (selfSecret: Uint8Array, space: string, keeper: Did): string => b64u.encode(sha256(join('weave/keep/id/v1', selfSecret, space, keeper)));

/** What a keeper calls an item: lets it say what it holds without knowing what. */
export const keepTag = (wrapKey: Uint8Array, eventId: string): string => b64u.encode(sha256(join('weave/keep/tag/v1', wrapKey, eventId))).slice(0, 22);

/** Padded to a power of two (at least 256 bytes), so sizes say little. */
export function padded(text: string): string {
  let size = 256;
  while (size < text.length) size *= 2;
  return text + ' '.repeat(size - text.length);
}

const CONTEXT = 'weave/keep/item/v1';

/** One event, padded (as it is sealed: the item and filler) and sealed for a keeper. */
export function wrapForKeeper(wrapKey: Uint8Array, item: Json): string {
  const bare = canonicalJson({ i: item, p: '' }).length;
  const sealed = seal(wrapKey, { i: item, p: ' '.repeat(padded('x'.repeat(bare)).length - bare) }, CONTEXT);
  return `${sealed.nonce}.${sealed.ct}`;
}

/** Back from a keeper: the event as it was, or undefined if it isn't ours. */
export function unwrapFromKeeper(wrapKey: Uint8Array, data: string): Json | undefined {
  const [nonce, ct] = data.split('.');
  if (!nonce || !ct) return undefined;
  try {
    const opened = open(wrapKey, { nonce, ct } as Sealed, CONTEXT) as { i?: Json } | null;
    return opened && typeof opened === 'object' && 'i' in opened ? (opened.i as Json) : undefined;
  } catch {
    return undefined;
  }
}
