import { Authority, KEY_KINDS, KIND_DELEGATE, KIND_IDENTITY, KIND_ORG_FREEZE, KIND_REVOKE, KIND_ROTATE } from './authority.ts';
import { canonicalJson, type Json } from './bytes.ts';
import { eventId, isWellFormedEvent, signEvent, verifyEventSignature, type EventFields, type SigningIdentity, type WeaveEvent } from './events.ts';
import { bodyHash, bodyMatches, canonicalIdV2, classOf, eventIdV2, isWellFormedV2, isWireItemV2, signEventV2, verifyEventV2, type EventFieldsV2, type EventV2, type WireItemV2 } from './eventsV2.ts';
import type { Did } from './keys.ts';
import { isRecord, recordOfV1, recordOfV2, recordOrder, type WeaveRecord } from './records.ts';
import { MemoryStore, type LogStore, type StoredV2 } from './store.ts';

/**
 * Does a v2 event restate this v1 event, as a key re-signing its own history
 * does: same author, number, time, kind, space (or public, for scopes v2 doesn't
 * know) and body? Only then may it carry the v1 event's id.
 */
function restatesV1(v1: WeaveEvent, e: EventV2): boolean {
  const space = /^(public|self|[a-z]+:[A-Za-z0-9_-]{1,64})$/.test(v1.scope) ? v1.scope : 'public';
  if (v1.author !== e.author || v1.seq !== e.n || v1.time !== e.time || v1.kind !== e.kind || space !== e.space) return false;
  try {
    return e.class === 'content' ? bodyHash(v1.body) === e.body : canonicalJson(v1.body) === canonicalJson((e as { body?: Json }).body ?? null);
  } catch {
    return false;
  }
}

export type IngestResult =
  | { status: 'accepted' }
  | { status: 'duplicate' }
  | { status: 'pending'; reason: string }
  | { status: 'rejected'; reason: string };

const MAX_PENDING = 10_000;

/** v2 key events that change who may sign; identity and rotation stay v1, signed by root keys that aren't on disk. */
const isKeyEventV2 = (event: EventV2): boolean => event.class === 'control' && event.space === 'public' && (event.kind === KIND_DELEGATE || event.kind === KIND_REVOKE || event.kind === KIND_ORG_FREEZE);

/**
 * A node's local copy of the events it knows. Every event — local or from a
 * peer, v1 or v2 — goes through `ingest`, which checks signature, chain and
 * authorization. Events that can't be judged yet (a gap in a chain, a
 * delegation not yet seen) wait in a pending pool and are retried whenever
 * something new is accepted.
 *
 * v1 events chain per signer by seq. v2 control events chain per (signer,
 * space); v2 content events stand alone, their bodies stored apart and allowed
 * to be missing. Every v2 event carries the key's number n, which goes on from
 * its v1 seq: two different events of one key with the same number are a fork,
 * whichever version they are in, unless the v2 one re-signs (`was`) the v1 one.
 */
export class Replica {
  readonly store: LogStore;
  readonly authority = new Authority();
  #pending = new Map<string, WeaveEvent | WireItemV2>();
  /** Keys seen signing two different events with the same number: a sign the key is used where it shouldn't be. */
  readonly forks = new Set<Did>();
  #listeners = new Set<(record: WeaveRecord) => void>();

  /**
   * The node's say on a v2 event it otherwise accepts: a reason to refuse it
   * (stage 8: over its author's budget), or undefined. Refused events aren't
   * stored or passed on; a later sync may bring them again.
   */
  admit?: (event: EventV2, body: Json | undefined) => string | undefined;

  /** 1 writes as v0.3 did: for tests that build an older home. */
  writeVersion: 1 | 2 = 2;

  /** A store that already holds events (e.g. loaded from disk) is trusted as-is; delegations in it are re-applied. */
  constructor(store: LogStore = new MemoryStore()) {
    this.store = store;
    // Replay key events in dependency order: identities, then rotations (each needs the one before),
    // then delegations and revocations of both versions (twice: devices delegate agents).
    const v1 = store.signers().flatMap((signer) => store.range(signer, 1));
    const v2 = store.all2();
    // What each key signed says whose it is (see Authority.vouch): whatever order the delegations come in.
    for (const e of v1) this.authority.vouch(e.signer, e.author, e.seq);
    for (const { event } of v2) this.authority.vouch(event.signer, event.author, event.n);
    const keyEvents = v1.filter((e) => KEY_KINDS.has(e.kind));
    const byKind = (kind: string) => keyEvents.filter((e) => e.kind === kind);
    for (const event of byKind(KIND_IDENTITY)) this.authority.apply(event);
    const rotations = byKind(KIND_ROTATE);
    for (let round = 0; round < rotations.length; round++) for (const event of rotations) this.authority.apply(event);
    const grants = [
      ...keyEvents.filter((e) => e.kind === KIND_DELEGATE || e.kind === KIND_REVOKE),
      ...v2.filter(({ event }) => isKeyEventV2(event)).map(({ id, event }) => recordOfV2(id, event)),
    ];
    for (let round = 0; round < 2; round++) for (const event of grants) this.authority.apply(event);
  }

  /** Called for every newly accepted event of either version, and again for a content event when its missing body arrives. Returns an unsubscribe function. */
  onAppend(listener: (record: WeaveRecord) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** v1 events taken in this run, in order (v2 ones are ordered by the store). */
  #taken1 = new Map<string, number>();

  /** In what order this node got an event (lower first), as far as it knows: v2 by its store, v1 in this run. */
  arrival(id: string): number | undefined {
    return this.store.order2(id) ?? this.#taken1.get(id);
  }

  /** Latest v1 seq per signer. */
  heads(): Record<Did, number> {
    const heads: Record<Did, number> = {};
    for (const signer of this.store.signers()) heads[signer] = this.store.head(signer)!.seq;
    return heads;
  }

  /** Every key with events here, of either version. */
  signers(): Did[] {
    return [...new Set([...this.store.signers(), ...this.store.signers2()])];
  }

  /** A key's valid events of both versions, by number (a re-signed v1 event only once, as v2). */
  eventsBy(signer: Did): WeaveRecord[] {
    const v2 = this.store.range2(signer).map((stored) => this.#recordOf(stored));
    const v1 = this.store.range(signer, 1).filter((e) => !this.store.byNumber(signer, e.seq)).map((e) => recordOfV1(e));
    return [...v1, ...v2].filter((r) => this.authority.check(r).ok).sort((a, b) => a.seq - b.seq);
  }

  /** A key's highest number, v1 seq and v2 n alike: its next event is this plus one. */
  number(signer: Did): number {
    return Math.max(this.store.head(signer)?.seq ?? 0, this.store.number2(signer));
  }

  get pendingCount(): number {
    return this.#pending.size;
  }

  /** Create, sign and store the next v1 event from a local identity. */
  append(identity: SigningIdentity, fields: EventFields): WeaveEvent {
    const event = signEvent(identity, this.store.head(identity.did), fields);
    const result = this.ingest(event);
    if (result.status !== 'accepted') throw new Error(`local event not accepted: ${'reason' in result ? result.reason : result.status}`);
    return event;
  }

  /**
   * Create, sign and store a local identity's next event the way v0.4 writes:
   * v2, except what root keys sign (identity, rotation, delegating devices),
   * which stays v1, the identity foundation. A root key signs rarely, from
   * recovery words, often on a device that may not hold all its history: its
   * v1 chain makes that show as a gap instead of a second event numbered alike.
   */
  write(identity: SigningIdentity, fields: EventFields): WeaveRecord {
    const root = !this.authority.grant(identity.did);
    if (this.writeVersion === 1 || root || fields.kind === KIND_IDENTITY || fields.kind === KIND_ROTATE) return recordOfV1(this.append(identity, fields));
    const { scope, ...rest } = fields;
    return this.append2(identity, { ...rest, space: scope ?? 'public' });
  }

  /** Create, sign and store the next v2 event from a local identity: numbered after the key's last, chained if control. */
  append2(identity: SigningIdentity, fields: Omit<EventFieldsV2, 'n'>): WeaveRecord {
    const space = fields.space ?? 'public';
    // Content is numbered in its space too (cs): what a removal names as seen there.
    const content = (fields.class ?? classOf(fields.kind)) === 'content';
    const { event, body } = signEventV2(identity, this.store.chainHead(identity.did, space), { ...fields, space, n: this.number(identity.did) + 1, ...(content ? { cs: this.store.contentCount(identity.did, space) + 1 } : {}) });
    const result = this.ingest({ e: event, ...(body !== undefined ? { b: body } : {}) });
    if (result.status !== 'accepted') throw new Error(`local event not accepted: ${'reason' in result ? result.reason : result.status}`);
    return recordOfV2(canonicalIdV2(event), event, body);
  }

  /** Take a v1 event, a v2 wire item `{e, b?}`, or a record of either. */
  /** Take an event from a peer (or our own). Never throws on what a peer sends: whatever can't be read is rejected as malformed. */
  ingest(input: unknown): IngestResult {
    let result: IngestResult;
    try {
      const item = isRecord(input) ? input.wire : input;
      result = isWireItemV2(item) ? this.#ingestV2(item.e, item.b) : this.#ingestOne(item);
    } catch {
      return { status: 'rejected', reason: 'malformed' };
    }
    if (result.status === 'accepted') this.#drainPending();
    return result;
  }

  /**
   * All valid events of both versions as records, oldest first by claimed time
   * (then signer, then number). Events from revoked keys past their cutoff are
   * left out, and so is a v1 event that a v2 event re-signs: the v2 one stands
   * for it, under the same id.
   */
  events(filter: (record: WeaveRecord) => boolean = () => true): WeaveRecord[] {
    const all: WeaveRecord[] = [];
    for (const stored of this.store.all2()) {
      const record = this.#recordOf(stored);
      if (this.authority.check(record).ok && filter(record)) all.push(record);
    }
    for (const signer of this.store.signers()) {
      for (const event of this.store.range(signer, 1)) {
        // A v2 event with the same number can only be its re-signing (anything else is refused as a fork).
        if (this.store.byNumber(signer, event.seq) || !this.authority.check(event).ok) continue;
        const record = recordOfV1(event);
        if (filter(record)) all.push(record);
      }
    }
    return all.sort(recordOrder);
  }

  /** The v2 record stored under this id, with its body if at hand. */
  record2(id: string): WeaveRecord | undefined {
    const stored = this.store.get2(id);
    return stored && this.#recordOf(stored);
  }

  #recordOf({ id, event, body }: StoredV2): WeaveRecord {
    return recordOfV2(id, event, event.class === 'content' ? (body ?? this.store.body(event.body)) : undefined);
  }

  #ingestOne(input: unknown): IngestResult {
    if (!isWellFormedEvent(input)) return { status: 'rejected', reason: 'malformed event' };
    const event = input;
    if (!verifyEventSignature(event)) return { status: 'rejected', reason: 'bad signature' };
    this.authority.vouch(event.signer, event.author, event.seq);

    const head = this.store.head(event.signer);
    const expected = (head?.seq ?? 0) + 1;
    if (event.seq < expected) {
      const stored = this.store.get(event.signer, event.seq)!;
      // Two different events with the same seq from one key is equivocation.
      if (eventId(stored) === eventId(event)) return { status: 'duplicate' };
      return this.#fork(event.signer);
    }
    if (event.seq > expected) return this.#park(pendingKey(event), event, 'gap in log');
    if (event.prev !== (head ? eventId(head) : null)) return { status: 'rejected', reason: 'broken hash chain' };
    // The number is taken by a v2 event that isn't this one re-signed.
    const taken = this.store.byNumber(event.signer, event.seq);
    if (taken && taken.event.was !== eventId(event)) return this.#fork(event.signer);

    const check = this.authority.check(event);
    if (!check.ok) return check.retry ? this.#park(pendingKey(event), event, check.reason) : { status: 'rejected', reason: check.reason };

    this.store.append(event);
    this.#taken1.set(eventId(event), this.#taken1.size + 1);
    this.#pending.delete(pendingKey(event));
    if (KEY_KINDS.has(event.kind)) this.authority.apply(event);
    if (this.#listeners.size) this.#notify(recordOfV1(event));
    return { status: 'accepted' };
  }

  #ingestV2(input: unknown, body: Json | undefined): IngestResult {
    if (!isWellFormedV2(input)) return { status: 'rejected', reason: 'malformed event' };
    const event = input;
    if (event.kind === KIND_IDENTITY || event.kind === KIND_ROTATE) return { status: 'rejected', reason: `${event.kind} stays v1` };
    if (!verifyEventV2(event)) return { status: 'rejected', reason: 'bad signature' };
    this.authority.vouch(event.signer, event.author, event.n);
    // A body that doesn't match is dropped; the event stands without it.
    const goodBody = event.class === 'content' && body !== undefined && !this.store.forgotten(event.body) && bodyMatches(event, body) ? body : undefined;
    const ownId = eventIdV2(event);

    // Numbers: one event per (key, n), across both versions.
    const sameNumber = this.store.byNumber(event.signer, event.n);
    if (sameNumber) {
      if (eventIdV2(sameNumber.event) !== ownId) return this.#fork(event.signer);
      if (event.class === 'content' && goodBody !== undefined && this.store.body(event.body) === undefined) {
        // The body of an event held without one.
        this.store.putBody(event.body, goodBody);
        this.#notify(recordOfV2(sameNumber.id, event, goodBody));
        return { status: 'accepted' };
      }
      return { status: 'duplicate' };
    }
    const v1 = this.store.get(event.signer, event.n);
    if (event.was !== undefined) {
      // `was` lets a key re-sign its own v1 event under its old id, and nothing else: it waits for that event, and must restate it.
      if (!v1) return this.#park(`v2 ${ownId}`, wireItem(event, goodBody), 'was: waiting for the v1 event it restates');
      if (event.was !== eventId(v1) || !restatesV1(v1, event)) return { status: 'rejected', reason: "was names an event it doesn't restate" };
    } else if (v1) return this.#fork(event.signer);
    const id = canonicalIdV2(event);
    // Another event already answers to this id (a `was` naming another key's event).
    if (this.store.get2(id)) return { status: 'rejected', reason: 'id already taken' };

    if (event.class === 'control') {
      const head = this.store.chainHead(event.signer, event.space);
      const expected = (head?.seq ?? 0) + 1;
      if (event.seq < expected) return eventIdV2(this.store.chainAt(event.signer, event.space, event.seq)!) === ownId ? { status: 'duplicate' } : this.#fork(event.signer);
      if (event.seq > expected) return this.#park(`v2 ${ownId}`, wireItem(event, goodBody), 'gap in chain');
      if (event.prev !== (head ? eventIdV2(head) : null)) return { status: 'rejected', reason: 'broken hash chain' };
    }
    // Two content events of one key at the same number in a space: a fork, like two at one n.
    if (event.class === 'content' && event.cs !== undefined && this.store.contentAt(event.signer, event.space, event.cs)) return this.#fork(event.signer);

    const record = recordOfV2(id, event, goodBody);
    const check = this.authority.check(record);
    if (!check.ok) return check.retry ? this.#park(`v2 ${ownId}`, wireItem(event, goodBody), check.reason) : { status: 'rejected', reason: check.reason };
    const refused = this.admit?.(event, goodBody);
    if (refused) return { status: 'rejected', reason: refused };

    this.store.add2({ id, event });
    if (goodBody !== undefined) this.store.putBody(event.body as string, goodBody);
    this.#pending.delete(`v2 ${ownId}`);
    if (isKeyEventV2(event)) this.authority.apply(record);
    this.#notify(record);
    return { status: 'accepted' };
  }

  #notify(record: WeaveRecord): void {
    for (const listener of this.#listeners) listener(record);
  }

  #fork(signer: Did): IngestResult {
    this.forks.add(signer);
    return { status: 'rejected', reason: 'conflicting event (fork)' };
  }

  #park(key: string, item: WeaveEvent | WireItemV2, reason: string): IngestResult {
    if (this.#pending.size >= MAX_PENDING) return { status: 'rejected', reason: 'pending pool full' };
    this.#pending.set(key, item);
    return { status: 'pending', reason };
  }

  #drainPending(): void {
    let progress = true;
    while (progress && this.#pending.size > 0) {
      progress = false;
      for (const [key, item] of this.#pending) {
        const result = isWireItemV2(item) ? this.#ingestV2(item.e, item.b) : this.#ingestOne(item);
        if (result.status === 'accepted') progress = true;
        else if (result.status !== 'pending') this.#pending.delete(key);
      }
    }
  }
}

const pendingKey = (event: WeaveEvent): string => `${event.signer}#${event.seq}`;
const wireItem = (event: EventV2, body: Json | undefined): WireItemV2 => ({ e: event, ...(body !== undefined ? { b: body } : {}) });
