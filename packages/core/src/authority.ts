import { sha256 } from '@noble/hashes/sha2.js';
import { b64u, utf8, type Json } from './bytes.ts';
import { isDid, publicKeyFromDid, type Did } from './keys.ts';
import type { EventFields, WeaveEvent } from './events.ts';

/** What authority reads of an event: a v1 event or a record of either version (seq is a v2 event's n). */
export type Signed = Pick<WeaveEvent, 'author' | 'signer' | 'seq' | 'kind' | 'body'> & {
  /** A v2 event's space, and its place there (see records.ts): where a revocation's heads apply. */
  v?: number;
  scope?: string;
  cseq?: number;
  cs?: number;
};

/*
 * Who may sign for whom. A person's identifier is the did:key of their first
 * root key and never changes; the keys behind it do.
 *
 *   weave.identity  {next, enc}            the root, once: commits to the *next* root key (a hash of it,
 *                                          "pre-rotation") and names the key others encrypt to
 *   weave.rotate    {next, enc, retire}    signed by the key whose hash was committed: it becomes the root,
 *                                          the previous root's events after seq `retire` are void,
 *                                          and the next root is committed again
 *   weave.delegate  {subject, role, permissions, name}
 *                                          the root delegates a device or agent key; a device with
 *                                          permission "*" may delegate agents
 *   weave.revoke    {subject, afterSeq, heads?}  the root (or, for its agents, a device) revokes a key
 *
 * Someone who steals the current root key still can't take the identity over:
 * only the holder of the pre-committed next key can rotate, and doing so voids
 * whatever the stolen key signs afterwards. Day to day, people sign with device
 * keys and keep both root keys in a recovery kit, away from the computer.
 */
export const KIND_DELEGATE = 'weave.delegate';
export const KIND_REVOKE = 'weave.revoke';
export const KIND_IDENTITY = 'weave.identity';
export const KIND_ROTATE = 'weave.rotate';
/**
 * `{person, keys: {key: n}}`, public, by the company named in a company-owned
 * identity's first record (stage 10): what that identity's keys sign after
 * these numbers (and anything by keys not named) no longer counts.
 */
export const KIND_ORG_FREEZE = 'weave.org.freeze';
/** An encrypted event; its real kind is inside and is checked by whoever can decrypt it. */
export const KIND_SEALED = 'weave.sealed';

/** Kinds that change who may sign: they're processed by the Authority. */
export const KEY_KINDS = new Set([KIND_DELEGATE, KIND_REVOKE, KIND_IDENTITY, KIND_ROTATE, KIND_ORG_FREEZE]);

export type Role = 'device' | 'agent';

export interface Grant {
  author: Did;
  subject: Did;
  role: Role;
  name?: string;
  /** Kind patterns: exact (`weave.post`), prefix (`weave.*`) or everything (`*`). */
  permissions: string[];
  /** Events from this subject with a higher seq are invalid. */
  revokedAfter?: number;
  /**
   * Where the revocation saw the key, per space (KgmsMa_g): its control chain's
   * head (c), its last content (s, cs), and the lowest n of its numbered content
   * (f). Numbers in a space have no gaps from other spaces, so a key that is
   * revoked can't sign below them without a fork showing; its v2 events in a
   * space not named count for nothing.
   */
  heads?: Record<string, RevokedHead>;
  /** The key and seq that delegated it (and where, for a v2 delegation); the grant falls if that event is voided. */
  by?: { signer: Did; seq: number; v?: number; scope?: string; cseq?: number };
}

export interface RevokedHead {
  c: number;
  s: number;
  f?: number;
}

const parseHeads = (value: unknown): Record<string, RevokedHead> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out: Record<string, RevokedHead> = {};
  const count = (n: unknown) => (Number.isSafeInteger(n) && (n as number) >= 0 ? (n as number) : undefined);
  for (const [scope, h] of Object.entries(value as Record<string, unknown>).slice(0, 1000)) {
    const head = (h ?? {}) as Record<string, unknown>;
    const [c, s, f] = [count(head.c), count(head.s), count(head.f)];
    if (c !== undefined && s !== undefined) out[scope] = { c, s, ...(f !== undefined ? { f } : {}) };
  }
  return out;
};

/** Two revocations of one key: an event must be within both. */
const meetHeads = (a: Record<string, RevokedHead> | undefined, b: Record<string, RevokedHead> | undefined): Record<string, RevokedHead> | undefined => {
  if (!a || !b) return a ?? b;
  const out: Record<string, RevokedHead> = {};
  for (const scope of Object.keys(a)) {
    const [x, y] = [a[scope], b[scope]];
    if (!y) continue;
    const f = x.f === undefined ? y.f : y.f === undefined ? x.f : Math.min(x.f, y.f);
    out[scope] = { c: Math.min(x.c, y.c), s: Math.min(x.s, y.s), ...(f !== undefined ? { f } : {}) };
  }
  return out;
};

/** Is an event of a revoked key within what its revocation left valid? */
export function withinRevocation(grant: Pick<Grant, 'revokedAfter' | 'heads'>, event: { seq: number; v?: number; scope?: string; cseq?: number; cs?: number }): boolean {
  if (grant.revokedAfter === undefined) return true;
  if (event.seq > grant.revokedAfter) return false;
  if (!grant.heads || event.v !== 2) return true;
  const head = event.scope !== undefined ? grant.heads[event.scope] : undefined;
  if (!head) return false;
  if (event.cseq !== undefined) return event.cseq <= head.c;
  if (event.cs !== undefined) return event.cs <= head.s;
  return head.f === undefined || event.seq < head.f;
}

/** A person's keys as their identity events describe them. */
export interface KeyState {
  /** The key that acts as root now: the identifier itself until the first rotation. */
  root: Did;
  /** Earlier roots, and the last seq that stays valid for each. */
  retired: Map<Did, number>;
  /** Hash of the next root key, if committed. */
  next?: string;
  /** The key others encrypt to; the identifier itself if none was named. */
  enc: Did;
  /** Every encryption key named so far, oldest first (enc is the last). */
  encs: Did[];
  /** A company-owned identity: the company that holds its recovery and may freeze it. */
  org?: Did;
}

export type Check = { ok: true } | { ok: false; reason: string; retry: boolean };

/** Event fields for a root delegating to a device or agent key. */
export function delegation(subject: Did, role: Role, permissions: string[], name?: string): EventFields {
  return { kind: KIND_DELEGATE, body: { subject, role, permissions, ...(name ? { name } : {}) } };
}

/** Event fields for revoking a key; events it signed up to `afterSeq` stay valid. */
export function revocation(subject: Did, afterSeq: number, heads?: Record<string, RevokedHead>): EventFields {
  return { kind: KIND_REVOKE, body: { subject, afterSeq, ...(heads ? { heads: heads as unknown as Json } : {}) } };
}

/** The commitment to a future root key: a hash of its public key. */
export const keyCommitment = (key: Did): string => b64u.encode(sha256(new Uint8Array([...utf8('weave/next-key/v1'), ...publicKeyFromDid(key)])));

/** The root's first identity event: commit to the next root key and name the encryption key (and, for a company-owned identity, the company). */
export function inception(next: Did, enc: Did, org?: Did): EventFields {
  return { kind: KIND_IDENTITY, body: { next: keyCommitment(next), enc, ...(org ? { org } : {}) } };
}

/** Signed by the new root (the committed next key): take over, void the old root after `retire`, commit to the one after. */
export function rotation(next: Did, retire: number, enc?: Did): EventFields {
  return { kind: KIND_ROTATE, body: { next: keyCommitment(next), retire, ...(enc ? { enc } : {}) } };
}

/** `weave.issue.*` covers `weave.issue` itself and everything under it, like `weave.issue.claim`. */
export function permits(permissions: string[], kind: string): boolean {
  return permissions.some((p) => p === '*' || p === kind || (p.endsWith('.*') && (kind === p.slice(0, -2) || kind.startsWith(p.slice(0, -1)))));
}

const body = (event: Signed): Record<string, unknown> => (event.body && typeof event.body === 'object' && !Array.isArray(event.body) ? (event.body as Record<string, unknown>) : {});

/**
 * Tracks which keys may sign for which people, built from identity, rotate,
 * delegate and revoke events. Validity is judged again at read time, so
 * events from a key retired or revoked later drop out of every view.
 */
export class Authority {
  #grants = new Map<Did, Grant>();
  #people = new Map<Did, KeyState>();
  /** Root keys after the first, mapped to the person they act for. */
  #rootOf = new Map<Did, Did>();
  /** Freezes, by person and by who signed them: key → last number that counts. Only the person's own company's apply. */
  #freezes = new Map<Did, Map<Did, Record<string, number>>>();

  /** A company-owned identity's cut-offs, if its company froze it. */
  frozen(person: Did): Record<string, number> | undefined {
    const org = this.#people.get(person)?.org;
    return org ? this.#freezes.get(person)?.get(org) : undefined;
  }

  grant(subject: Did): Grant | undefined {
    return this.#grants.get(subject);
  }

  /** All device and agent keys delegated by a person, revoked ones included. */
  grantsOf(author: Did): Grant[] {
    return [...this.#grants.values()].filter((g) => g.author === author);
  }

  /** A person's key state; people who never published identity events have their identifier as root and encryption key. */
  keys(person: Did): KeyState {
    return this.#people.get(person) ?? { root: person, retired: new Map(), enc: person, encs: [person] };
  }

  /** The person a key acts for: itself for a person's identifier, the author for devices, agents and later roots. */
  personOf(key: Did): Did {
    return this.#rootOf.get(key) ?? this.#grants.get(key)?.author ?? key;
  }

  /** Every encryption key a person named, oldest first. */
  encryptionKeys(person: Did): Did[] {
    return this.keys(person).encs;
  }

  /** The key to encrypt to when writing to this person. */
  encryptionKey(person: Did): Did {
    return this.keys(person).enc;
  }

  /** Is `signer` a root key of `author` that was valid when it signed seq `seq`? */
  #isRoot(author: Did, signer: Did, seq: number): boolean {
    const state = this.keys(author);
    if (signer !== author && this.#rootOf.get(signer) !== author) return false;
    const cutoff = state.retired.get(signer);
    return cutoff === undefined || seq <= cutoff;
  }

  /** Is the event that created a grant still valid? */
  #sourceValid(grant: Grant): boolean {
    if (!grant.by) return true;
    const { signer, seq } = grant.by;
    if (this.#isRoot(grant.author, signer, seq)) return true;
    const device = this.#grants.get(signer);
    return !!device && device.author === grant.author && device.role === 'device' && device.permissions.includes('*') && withinRevocation(device, grant.by) && this.#sourceValid(device);
  }

  /** May this device delegate (or revoke) agents? */
  #isDelegatingDevice(event: Signed): boolean {
    const device = this.#grants.get(event.signer);
    return !!device && device.author === event.author && device.role === 'device' && device.permissions.includes('*') && this.check(event).ok;
  }

  /** Feed an accepted event; only identity, rotate, delegate and revoke events have an effect. */
  apply(event: Signed): void {
    const b = body(event);
    if (event.kind === KIND_IDENTITY) {
      // Once per person, by the original root, before any rotation.
      if (event.signer !== event.author || this.#people.has(event.author) || typeof b.next !== 'string' || !isDid(b.enc)) return;
      this.#people.set(event.author, { root: event.author, retired: new Map(), next: b.next, enc: b.enc, encs: [b.enc], ...(isDid(b.org) && b.org !== event.author ? { org: b.org } : {}) });
      return;
    }
    if (event.kind === KIND_ORG_FREEZE) {
      // Kept whoever signed it; it counts only for the company the identity names (see frozen).
      if (!isDid(b.person) || !b.keys || typeof b.keys !== 'object' || Array.isArray(b.keys)) return;
      const keys: Record<string, number> = {};
      for (const [key, n] of Object.entries(b.keys as Record<string, unknown>)) if (Number.isSafeInteger(n)) keys[key] = n as number;
      let by = this.#freezes.get(b.person);
      if (!by) this.#freezes.set(b.person, (by = new Map()));
      const before = by.get(event.author);
      if (before) for (const key of new Set([...Object.keys(before), ...Object.keys(keys)])) keys[key] = Math.min(before[key] ?? 0, keys[key] ?? 0);
      by.set(event.author, keys);
      return;
    }
    if (event.kind === KIND_ROTATE) {
      const state = this.#people.get(event.author);
      if (!state || !state.next || keyCommitment(event.signer) !== state.next || typeof b.next !== 'string' || !Number.isSafeInteger(b.retire)) return;
      state.retired.set(state.root, Math.min(state.retired.get(state.root) ?? Infinity, b.retire as number));
      state.root = event.signer;
      state.next = b.next;
      if (isDid(b.enc) && b.enc !== state.enc) {
        state.enc = b.enc;
        state.encs.push(b.enc);
      }
      this.#rootOf.set(event.signer, event.author);
      return;
    }
    if (event.kind !== KIND_DELEGATE && event.kind !== KIND_REVOKE) return;
    if (!isDid(b.subject) || b.subject === event.author) return;
    const byRoot = this.#isRoot(event.author, event.signer, event.seq);
    const existing = this.#grants.get(b.subject);
    if (existing && existing.author !== event.author) return; // a key acts for one person only

    if (event.kind === KIND_DELEGATE) {
      const role = b.role === 'agent' ? 'agent' : 'device';
      if (!byRoot && !(role === 'agent' && this.#isDelegatingDevice(event))) return;
      const permissions = Array.isArray(b.permissions) ? b.permissions.filter((p): p is string => typeof p === 'string') : [];
      this.#grants.set(b.subject, {
        author: event.author,
        subject: b.subject,
        role,
        permissions,
        ...(typeof b.name === 'string' ? { name: b.name } : {}),
        ...(existing?.revokedAfter !== undefined ? { revokedAfter: existing.revokedAfter } : {}),
        by: { signer: event.signer, seq: event.seq, ...(event.v === 2 ? { v: 2, scope: event.scope, ...(event.cseq !== undefined ? { cseq: event.cseq } : {}) } : {}) },
      });
    } else if (Number.isSafeInteger(b.afterSeq)) {
      if (!byRoot && !(existing?.role === 'agent' && this.#isDelegatingDevice(event))) return;
      const afterSeq = b.afterSeq as number;
      const grant = existing ?? { author: event.author, subject: b.subject, role: 'device' as const, permissions: [] };
      // With heads, it cuts by where it saw the key too (a revocation without them cuts by number alone).
      grant.revokedAfter = Math.min(grant.revokedAfter ?? Infinity, afterSeq);
      const heads = parseHeads(b.heads);
      if (heads) grant.heads = meetHeads(grant.heads, heads);
      this.#grants.set(b.subject, grant);
    }
  }

  /** May this event's signer sign it for its author? `retry` means a missing delegation or identity event may still arrive. */
  check(event: Signed): Check {
    const frozen = this.#freezes.size ? this.frozen(event.author) : undefined;
    if (frozen && event.seq > (frozen[event.signer] ?? 0)) return { ok: false, reason: 'frozen by its company', retry: false };
    if (event.signer === event.author || this.#rootOf.get(event.signer) === event.author) {
      return this.#isRoot(event.author, event.signer, event.seq) ? { ok: true } : { ok: false, reason: 'root key retired', retry: false };
    }
    if (event.kind === KIND_ROTATE) {
      const state = this.#people.get(event.author);
      if (!state?.next) return { ok: false, reason: 'no next root key committed (yet)', retry: true };
      return keyCommitment(event.signer) === state.next ? { ok: true } : { ok: false, reason: 'not the committed next root key', retry: false };
    }
    const grant = this.#grants.get(event.signer);
    if (!grant || grant.author !== event.author) return { ok: false, reason: 'signer not delegated by author', retry: true };
    if (!withinRevocation(grant, event)) return { ok: false, reason: 'signer revoked', retry: false };
    if (!this.#sourceValid(grant)) return { ok: false, reason: 'delegated by a key that was retired or revoked', retry: false };
    if (event.kind === KIND_IDENTITY) return { ok: false, reason: `${event.kind} must be signed by the root`, retry: false };
    if (event.kind === KIND_DELEGATE || event.kind === KIND_REVOKE) {
      // Devices with "*" may manage agents; Authority.apply decides whether it takes effect.
      return grant.role === 'device' && grant.permissions.includes('*') ? { ok: true } : { ok: false, reason: `${event.kind} must be signed by the root or a device`, retry: false };
    }
    // Relays can't see a sealed event's kind; any delegated key may carry one, and
    // readers drop the event after decrypting if its inner kind isn't permitted.
    if (event.kind === KIND_SEALED && grant.permissions.length > 0) return { ok: true };
    if (!permits(grant.permissions, event.kind)) return { ok: false, reason: `signer may not sign ${event.kind}`, retry: false };
    return { ok: true };
  }
}
