import { sha256 } from '@noble/hashes/sha2.js';
import { b64u, canonicalJson, utf8, type Json } from './bytes.ts';
import { isDid, publicKeyFromDid, sign, verify, type Did } from './keys.ts';
import type { SigningIdentity } from './events.ts';

/*
 * The v2 event format (spec: "Scaling: the v2 wire format"). Defined and tested
 * here in stage 0; the wire switches to it in stage 1.
 *
 * Two classes of event:
 *
 * - control: who may do what — identity, delegation, members, roles, keys,
 *   rules. Chained per (signer, space) by seq and prev, so a reader knows it has
 *   all of them and in order, and a fork shows. The body is inline: control
 *   events are small and must never go missing.
 * - content: everything else — posts, chat, votes, reactions, edits, and
 *   latest-wins state like a page or a profile. Standalone: no seq, no prev, so
 *   any of them can be fetched, skipped or forgotten without leaving a gap. The
 *   event signs the hash of its body; the body travels and is stored apart and
 *   may be missing (forgotten, not yet fetched) without the event losing its
 *   meaning or its signature.
 *
 * A sealed event shows its class but not its inner kind; a reader checks after
 * decrypting that the inner kind belongs to the class the event claims.
 *
 * Every event of both classes carries `n`: a counter per signing key across all
 * spaces, going on from the key's v1 seq. Content has no chain, so `n` is what
 * revocation ("void this key's events after n") and equivocation (two events of
 * one key with the same n) rest on. See docs/v2-stage1.md.
 */

/** Kinds that decide who may do what: chained, complete, never forgotten. */
export const CONTROL_KINDS: ReadonlySet<string> = new Set([
  // identity and keys
  'weave.identity',
  'weave.rotate',
  'weave.delegate',
  'weave.revoke',
  // spaces and membership
  'weave.space.create',
  'weave.space.join',
  'weave.space.leave',
  'weave.space.remove',
  'weave.space.handover',
  'weave.space.close',
  'weave.space.history',
  'weave.space.carry',
  'weave.space.shred',
  'weave.space.managed',
  'weave.space.kms',
  'weave.org.attest',
  'weave.space.hold',
  'weave.space.agent',
  'weave.org.escrow',
  'weave.org.escrow.opened',
  // the company itself (stage 10)
  'weave.org.freeze',
  'weave.org.settings',
  'weave.org.map',
  'weave.org.start',
  'weave.org.request',
  'weave.org.done',
  'weave.org.policy',
  'weave.org.chat',
  'weave.org.console',
  'weave.link',
  'weave.space.rekey',
  'weave.space.gift',
  'weave.group.create', // older names of the space events above
  'weave.group.join',
  'weave.group.rekey',
  'weave.group.remove',
  'weave.invite',
  'weave.membership',
  'weave.tier',
  // badges: lasting recognition, checkable by anyone
  'weave.badge.series',
  'weave.badge',
  'weave.badge.transfer',
  'weave.badge.note',
  // treasuries: wallets people link, and how a project's income is split
  'weave.wallet',
  'weave.treasury.split',
  'weave.treasury',
  'weave.label',
  'weave.safe.retired',
  // ticketed events (tickets themselves are boxed content, like membership requests)
  'weave.show',
  // a Safe's transactions, signed together
  'weave.safe.proposal',
  'weave.safe.signature',
  // project roles and rules
  'weave.project.admit',
  'weave.project.decline',
  'weave.project.group',
  'weave.project.maintainer',
  'weave.project.roster',
  'weave.project.rule',
  'weave.board',
  'weave.board.access',
  'weave.board.key',
  'weave.board.rule',
  'weave.github.repo',
  'weave.vote.delegate',
]);

export type EventClass = 'control' | 'content';

/** The class a kind belongs to; a sealed event carries the class of what's inside. */
export const classOf = (kind: string): EventClass => (CONTROL_KINDS.has(kind) ? 'control' : 'content');

interface HeaderV2 {
  v: 2;
  author: Did;
  signer: Did;
  /** 'public', 'self', or '<space kind>:<space id>'. */
  space: string;
  /** This signing key's counter, from 1, shared with its v1 seq: one number per event of the key. */
  n: number;
  time: string;
  kind: string;
  /** The v1 event this one re-signs (stage 1 migration), so references to the old id keep working. */
  was?: string;
}

export interface UnsignedControlEventV2 extends HeaderV2 {
  class: 'control';
  /** Position in this signer's chain in this space, from 1. */
  seq: number;
  /** Id of the previous control event of this signer in this space. */
  prev: string | null;
  body: Json;
}

export interface UnsignedContentEventV2 extends HeaderV2 {
  class: 'content';
  /** Hash of the body (see bodyHash); the body itself travels apart. */
  body: string;
}

export type ControlEventV2 = UnsignedControlEventV2 & { sig: string };
export type ContentEventV2 = UnsignedContentEventV2 & { sig: string };
export type EventV2 = ControlEventV2 | ContentEventV2;

export interface EventFieldsV2 {
  kind: string;
  /** The signing key's next number (see `n`). */
  n: number;
  space?: string;
  body?: Json;
  time?: string;
  /** The class to sign as; defaults to the kind's class. Sealed events pass their inner kind's class. */
  class?: EventClass;
  was?: string;
}

const SIGNING_CONTEXT = 'weave/event/v2\n';

const signingBytes = (event: UnsignedControlEventV2 | UnsignedContentEventV2): Uint8Array => utf8(SIGNING_CONTEXT + canonicalJson(event as unknown as Json));

/** The hash a content event signs in place of its body. */
export const bodyHash = (body: Json): string => b64u.encode(sha256(utf8(canonicalJson(body))));

/** Content address of a signed v2 event. A content event's id covers its body's hash, so it doesn't change when the body is missing. */
export const eventIdV2 = (event: EventV2): string => b64u.encode(sha256(utf8(canonicalJson(event as unknown as Json))));

/** Sign a control event, chained to `head`: this signer's latest control event in the same space, if any. */
export function signControlEventV2(identity: SigningIdentity, head: ControlEventV2 | undefined, fields: EventFieldsV2): ControlEventV2 {
  const space = fields.space ?? 'public';
  if (head && (head.signer !== identity.did || head.space !== space)) throw new Error('head is not this signer’s latest event in this space');
  const unsigned: UnsignedControlEventV2 = {
    v: 2,
    class: 'control',
    author: identity.author,
    signer: identity.did,
    space,
    n: fields.n,
    seq: head ? head.seq + 1 : 1,
    prev: head ? eventIdV2(head) : null,
    time: fields.time ?? new Date().toISOString(),
    kind: fields.kind,
    body: fields.body ?? null,
    ...(fields.was ? { was: fields.was } : {}),
  };
  return { ...unsigned, sig: b64u.encode(sign(signingBytes(unsigned), identity.keys.secretKey)) };
}

/** Sign a content event; returns the event and the body that travels apart. */
export function signContentEventV2(identity: SigningIdentity, fields: EventFieldsV2): { event: ContentEventV2; body: Json } {
  const body = fields.body ?? null;
  const unsigned: UnsignedContentEventV2 = {
    v: 2,
    class: 'content',
    author: identity.author,
    signer: identity.did,
    space: fields.space ?? 'public',
    n: fields.n,
    time: fields.time ?? new Date().toISOString(),
    kind: fields.kind,
    body: bodyHash(body),
    ...(fields.was ? { was: fields.was } : {}),
  };
  return { event: { ...unsigned, sig: b64u.encode(sign(signingBytes(unsigned), identity.keys.secretKey)) }, body };
}

/** Sign a v2 event of the right class for its kind (or the class given). Control events need their chain head. */
export function signEventV2(identity: SigningIdentity, head: ControlEventV2 | undefined, fields: EventFieldsV2): { event: EventV2; body?: Json } {
  return (fields.class ?? classOf(fields.kind)) === 'control' ? { event: signControlEventV2(identity, head, fields) } : signContentEventV2(identity, fields);
}

export function verifyEventV2(event: EventV2): boolean {
  const { sig, ...unsigned } = event;
  try {
    return verify(b64u.decode(sig), signingBytes(unsigned), publicKeyFromDid(event.signer));
  } catch {
    return false;
  }
}

/** Does this body belong to this content event? */
export const bodyMatches = (event: ContentEventV2, body: Json): boolean => bodyHash(body) === event.body;

const KIND_PATTERN = /^[a-z0-9]+(\.[a-z0-9_-]+)+$/;
const SPACE_PATTERN = /^(public|self|[a-z]+:[A-Za-z0-9_-]{1,64})$/;
const HASH_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Structural validation of untrusted input; does not check the signature. */
export function isWellFormedV2(value: unknown): value is EventV2 {
  if (!value || typeof value !== 'object') return false;
  const e = value as Record<string, unknown>;
  const header =
    e.v === 2 &&
    isDid(e.author) &&
    isDid(e.signer) &&
    typeof e.space === 'string' && SPACE_PATTERN.test(e.space) &&
    Number.isSafeInteger(e.n) && (e.n as number) >= 1 &&
    (e.was === undefined || (typeof e.was === 'string' && HASH_PATTERN.test(e.was))) &&
    typeof e.time === 'string' && !Number.isNaN(Date.parse(e.time)) &&
    typeof e.kind === 'string' && KIND_PATTERN.test(e.kind) &&
    typeof e.sig === 'string';
  if (!header) return false;
  // A sealed event hides its inner kind, so only an open kind must match its class.
  const sealed = e.kind === 'weave.sealed';
  if (e.class === 'control') {
    const allowed = new Set(['v', 'class', 'author', 'signer', 'space', 'n', 'seq', 'prev', 'time', 'kind', 'body', 'was', 'sig']);
    return (
      Object.keys(e).every((k) => allowed.has(k)) &&
      (sealed || CONTROL_KINDS.has(e.kind as string)) &&
      Number.isSafeInteger(e.seq) && (e.seq as number) >= 1 &&
      (e.seq === 1 ? e.prev === null : typeof e.prev === 'string' && HASH_PATTERN.test(e.prev)) &&
      'body' in e
    );
  }
  if (e.class === 'content') {
    const allowed = new Set(['v', 'class', 'author', 'signer', 'space', 'n', 'time', 'kind', 'body', 'was', 'sig']);
    return (
      Object.keys(e).every((k) => allowed.has(k)) &&
      (sealed || !CONTROL_KINDS.has(e.kind as string)) &&
      typeof e.body === 'string' && HASH_PATTERN.test(e.body)
    );
  }
  return false;
}

/** The id other events use for this one: the v1 id it re-signs, else its own. */
export const canonicalIdV2 = (event: EventV2): string => event.was ?? eventIdV2(event);

/** What travels: the event, and a content event's body when the sender has it. */
export interface WireItemV2 {
  e: EventV2;
  b?: Json;
}

export const isWireItemV2 = (value: unknown): value is WireItemV2 => !!value && typeof value === 'object' && (value as { e?: { v?: unknown } }).e?.v === 2;
