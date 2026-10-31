import type { EventClass } from './eventsV2.ts';
import { sha256 } from '@noble/hashes/sha2.js';
import { b64u, canonicalJson, utf8, type Json } from './bytes.ts';
import { didFromPublicKey, generateKeyPair, isDid, publicKeyFromDid, sign, verify, type Did, type KeyPair } from './keys.ts';

/**
 * Who signs an event. `author` is the person (root identity); `did` is the key
 * actually signing. For a root they are the same; for a device or agent key the
 * author must have delegated to it (see Authority).
 */
export interface SigningIdentity {
  author: Did;
  did: Did;
  keys: KeyPair;
}

export interface UnsignedEvent {
  v: 1;
  author: Did;
  signer: Did;
  seq: number;
  prev: string | null;
  time: string;
  kind: string;
  scope: string;
  body: Json;
}

export interface WeaveEvent extends UnsignedEvent {
  sig: string;
}

export interface EventFields {
  kind: string;
  scope?: string;
  body?: Json;
  time?: string;
  /** Signing as v2: the class to sign as (a sealed event's inner kind's class). v1 ignores it. */
  class?: EventClass;
  /** Signing as v2: a sealed event's inner hash (see eventsV2). v1 ignores it. */
  ih?: string;
  /** Signing as v2 in the shape nodes before protocol 3 read: no inner hash (ih), no content number (cs). For the farewell to peers on an older protocol, nothing else. */
  legacy?: true;
}

/** A fresh root identity: a person. */
export function createIdentity(): SigningIdentity {
  const keys = generateKeyPair();
  const did = didFromPublicKey(keys.publicKey);
  return { author: did, did, keys };
}

/** A fresh key that will act for `author` once the author delegates to it (a device or an agent). */
export function createSubKey(author: Did): SigningIdentity {
  const keys = generateKeyPair();
  return { author, did: didFromPublicKey(keys.publicKey), keys };
}

const SIGNING_CONTEXT = 'weave/event/v1\n';

function signingBytes(event: UnsignedEvent): Uint8Array {
  return utf8(SIGNING_CONTEXT + canonicalJson(event as unknown as Json));
}

/** Content address of a signed event. */
export function eventId(event: WeaveEvent): string {
  return b64u.encode(sha256(utf8(canonicalJson(event as unknown as Json))));
}

/** Sign the next event in `identity`'s log, chained to `head` (the signer's latest event, if any). */
export function signEvent(identity: SigningIdentity, head: WeaveEvent | undefined, fields: EventFields): WeaveEvent {
  const unsigned: UnsignedEvent = {
    v: 1,
    author: identity.author,
    signer: identity.did,
    seq: head ? head.seq + 1 : 1,
    prev: head ? eventId(head) : null,
    time: fields.time ?? new Date().toISOString(),
    kind: fields.kind,
    scope: fields.scope ?? 'public',
    body: fields.body ?? null,
  };
  return { ...unsigned, sig: b64u.encode(sign(signingBytes(unsigned), identity.keys.secretKey)) };
}

export function verifyEventSignature(event: WeaveEvent): boolean {
  const { sig, ...unsigned } = event;
  try {
    return verify(b64u.decode(sig), signingBytes(unsigned), publicKeyFromDid(event.signer));
  } catch {
    return false;
  }
}

const KIND_PATTERN = /^[a-z0-9]+(\.[a-z0-9_-]+)+$/;

/** Structural validation of untrusted input; does not check the signature. */
export function isWellFormedEvent(value: unknown): value is WeaveEvent {
  if (!value || typeof value !== 'object') return false;
  const e = value as Record<string, unknown>;
  const allowed = new Set(['v', 'author', 'signer', 'seq', 'prev', 'time', 'kind', 'scope', 'body', 'sig']);
  return (
    Object.keys(e).every((k) => allowed.has(k)) &&
    e.v === 1 &&
    isDid(e.author) &&
    isDid(e.signer) &&
    Number.isSafeInteger(e.seq) && (e.seq as number) >= 1 &&
    (e.seq === 1 ? e.prev === null : typeof e.prev === 'string') &&
    typeof e.time === 'string' && !Number.isNaN(Date.parse(e.time)) &&
    typeof e.kind === 'string' && KIND_PATTERN.test(e.kind) &&
    typeof e.scope === 'string' && e.scope.length > 0 &&
    'body' in e &&
    typeof e.sig === 'string'
  );
}
