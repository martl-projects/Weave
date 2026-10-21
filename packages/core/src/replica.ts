import { Authority, KEY_KINDS, KIND_DELEGATE, KIND_IDENTITY, KIND_REVOKE, KIND_ROTATE } from './authority.ts';
import type { Json } from './bytes.ts';
import { eventId, isWellFormedEvent, signEvent, verifyEventSignature, type EventFields, type SigningIdentity, type WeaveEvent } from './events.ts';
import { bodyMatches, canonicalIdV2, eventIdV2, isWellFormedV2, isWireItemV2, signEventV2, verifyEventV2, type EventFieldsV2, type EventV2, type WireItemV2 } from './eventsV2.ts';
import type { Did } from './keys.ts';
import { isRecord, recordOfV1, recordOfV2, recordOrder, type WeaveRecord } from './records.ts';
import { MemoryStore, type LogStore, type StoredV2 } from './store.ts';

export type IngestResult =
  | { status: 'accepted' }
  | { status: 'duplicate' }
  | { status: 'pending'; reason: string }
  | { status: 'rejected'; reason: string };

const MAX_PENDING = 10_000;

/** v2 key events that change who may sign; identity and rotation stay v1, signed by root keys that aren't on disk. */
const isKeyEventV2 = (event: EventV2): boolean => event.class === 'control' && event.space === 'public' && (event.kind === KIND_DELEGATE || event.kind === KIND_REVOKE);

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
  #listeners = new Set<(event: WeaveEvent) => void>();
  #recordListeners = new Set<(record: WeaveRecord) => void>();

  /** A store that already holds events (e.g. loaded from disk) is trusted as-is; delegations in it are re-applied. */
  constructor(store: LogStore = new MemoryStore()) {
    this.store = store;
    // Replay key events in dependency order: identities, then rotations (each needs the one before),
    // then delegations and revocations of both versions (twice: devices delegate agents).
    const keyEvents = store.signers().flatMap((signer) => store.range(signer, 1).filter((e) => KEY_KINDS.has(e.kind)));
    const byKind = (kind: string) => keyEvents.filter((e) => e.kind === kind);
    for (const event of byKind(KIND_IDENTITY)) this.authority.apply(event);
    const rotations = byKind(KIND_ROTATE);
    for (let round = 0; round < rotations.length; round++) for (const event of rotations) this.authority.apply(event);
    const grants = [
      ...keyEvents.filter((e) => e.kind === KIND_DELEGATE || e.kind === KIND_REVOKE),
      ...store.all2().filter(({ event }) => isKeyEventV2(event)).map(({ id, event }) => recordOfV2(id, event)),
    ];
    for (let round = 0; round < 2; round++) for (const event of grants) this.authority.apply(event);
  }

  /** Called for every newly accepted v1 event. Returns an unsubscribe function. */
  onAppend(listener: (event: WeaveEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Called for every newly accepted event of either version, and again for a content event when its missing body arrives. */
  onRecord(listener: (record: WeaveRecord) => void): () => void {
    this.#recordListeners.add(listener);
    return () => this.#recordListeners.delete(listener);
  }

  /** Latest v1 seq per signer. */
  heads(): Record<Did, number> {
    const heads: Record<Did, number> = {};
    for (const signer of this.store.signers()) heads[signer] = this.store.head(signer)!.seq;
    return heads;
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

  /** Create, sign and store the next v2 event from a local identity: numbered after the key's last, chained if control. */
  append2(identity: SigningIdentity, fields: Omit<EventFieldsV2, 'n'>): WeaveRecord {
    const space = fields.space ?? 'public';
    const { event, body } = signEventV2(identity, this.store.chainHead(identity.did, space), { ...fields, space, n: this.number(identity.did) + 1 });
    const result = this.ingest({ e: event, ...(body !== undefined ? { b: body } : {}) });
    if (result.status !== 'accepted') throw new Error(`local event not accepted: ${'reason' in result ? result.reason : result.status}`);
    return recordOfV2(canonicalIdV2(event), event, body);
  }

  /** Take a v1 event, a v2 wire item `{e, b?}`, or a record of either. */
  ingest(input: unknown): IngestResult {
    const item = isRecord(input) ? input.wire : input;
    const result = isWireItemV2(item) ? this.#ingestV2(item.e, item.b) : this.#ingestOne(item);
    if (result.status === 'accepted') this.#drainPending();
    return result;
  }

  /** All valid v1 events, oldest first by claimed time. Events from revoked keys past their cutoff are left out. */
  events(filter: (event: WeaveEvent) => boolean = () => true): WeaveEvent[] {
    const all: WeaveEvent[] = [];
    for (const signer of this.store.signers()) {
      for (const event of this.store.range(signer, 1)) if (this.authority.check(event).ok && filter(event)) all.push(event);
    }
    return all.sort((a, b) => a.time.localeCompare(b.time) || a.signer.localeCompare(b.signer) || a.seq - b.seq);
  }

  /**
   * All valid events of both versions as records, oldest first by claimed time
   * (then signer, then number). A v1 event that a v2 event re-signs is left out:
   * the v2 one stands for it, under the same id.
   */
  records(filter: (record: WeaveRecord) => boolean = () => true): WeaveRecord[] {
    const all: WeaveRecord[] = [];
    const resigned = new Set<string>();
    for (const stored of this.store.all2()) {
      if (stored.event.was) resigned.add(stored.event.was);
      const record = this.#recordOf(stored);
      if (this.authority.check(record).ok && filter(record)) all.push(record);
    }
    for (const signer of this.store.signers()) {
      for (const event of this.store.range(signer, 1)) {
        const id = eventId(event);
        if (resigned.has(id) || !this.authority.check(event).ok) continue;
        const record = recordOfV1(event, id);
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

  #recordOf({ id, event }: StoredV2): WeaveRecord {
    return recordOfV2(id, event, event.class === 'content' ? this.store.body(event.body) : undefined);
  }

  #ingestOne(input: unknown): IngestResult {
    if (!isWellFormedEvent(input)) return { status: 'rejected', reason: 'malformed event' };
    const event = input;
    if (!verifyEventSignature(event)) return { status: 'rejected', reason: 'bad signature' };

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
    this.#pending.delete(pendingKey(event));
    if (KEY_KINDS.has(event.kind)) this.authority.apply(event);
    for (const listener of this.#listeners) listener(event);
    if (this.#recordListeners.size) this.#notify(recordOfV1(event));
    return { status: 'accepted' };
  }

  #ingestV2(input: unknown, body: Json | undefined): IngestResult {
    if (!isWellFormedV2(input)) return { status: 'rejected', reason: 'malformed event' };
    const event = input;
    if (event.kind === KIND_IDENTITY || event.kind === KIND_ROTATE) return { status: 'rejected', reason: `${event.kind} stays v1` };
    if (!verifyEventV2(event)) return { status: 'rejected', reason: 'bad signature' };
    // A body that doesn't match is dropped; the event stands without it.
    const goodBody = event.class === 'content' && body !== undefined && bodyMatches(event, body) ? body : undefined;
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
    if (v1 && event.was !== eventId(v1)) return this.#fork(event.signer);
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

    const record = recordOfV2(id, event, goodBody);
    const check = this.authority.check(record);
    if (!check.ok) return check.retry ? this.#park(`v2 ${ownId}`, wireItem(event, goodBody), check.reason) : { status: 'rejected', reason: check.reason };

    this.store.add2({ id, event });
    if (goodBody !== undefined) this.store.putBody(event.body as string, goodBody);
    this.#pending.delete(`v2 ${ownId}`);
    if (isKeyEventV2(event)) this.authority.apply(record);
    this.#notify(record);
    return { status: 'accepted' };
  }

  #notify(record: WeaveRecord): void {
    for (const listener of this.#recordListeners) listener(record);
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
