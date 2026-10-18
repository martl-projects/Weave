import { Authority, KIND_DELEGATE, KIND_REVOKE } from './authority.ts';
import { eventId, isWellFormedEvent, signEvent, verifyEventSignature, type EventFields, type SigningIdentity, type WeaveEvent } from './events.ts';
import type { Did } from './keys.ts';
import { MemoryStore, type LogStore } from './store.ts';

export type IngestResult =
  | { status: 'accepted' }
  | { status: 'duplicate' }
  | { status: 'pending'; reason: string }
  | { status: 'rejected'; reason: string };

const MAX_PENDING = 10_000;

/**
 * A node's local copy of the logs it knows. Every event — local or from a peer —
 * goes through `ingest`, which checks signature, chain and authorization.
 * Events that can't be judged yet (a gap in the chain, a delegation not yet seen)
 * wait in a pending pool and are retried whenever something new is accepted.
 */
export class Replica {
  readonly store: LogStore;
  readonly authority = new Authority();
  #pending = new Map<string, WeaveEvent>();
  #listeners = new Set<(event: WeaveEvent) => void>();

  constructor(store: LogStore = new MemoryStore()) {
    this.store = store;
  }

  /** Called for every newly accepted event. Returns an unsubscribe function. */
  onAppend(listener: (event: WeaveEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Latest seq per signer. */
  heads(): Record<Did, number> {
    const heads: Record<Did, number> = {};
    for (const signer of this.store.signers()) heads[signer] = this.store.head(signer)!.seq;
    return heads;
  }

  get pendingCount(): number {
    return this.#pending.size;
  }

  /** Create, sign and store the next event from a local identity. */
  append(identity: SigningIdentity, fields: EventFields): WeaveEvent {
    const event = signEvent(identity, this.store.head(identity.did), fields);
    const result = this.ingest(event);
    if (result.status !== 'accepted') throw new Error(`local event not accepted: ${'reason' in result ? result.reason : result.status}`);
    return event;
  }

  ingest(input: unknown): IngestResult {
    const result = this.#ingestOne(input);
    if (result.status === 'accepted') this.#drainPending();
    return result;
  }

  /** All valid events, oldest first by claimed time. Events from revoked keys past their cutoff are left out. */
  events(filter: (event: WeaveEvent) => boolean = () => true): WeaveEvent[] {
    const all: WeaveEvent[] = [];
    for (const signer of this.store.signers()) {
      for (const event of this.store.range(signer, 1)) if (this.authority.check(event).ok && filter(event)) all.push(event);
    }
    return all.sort((a, b) => a.time.localeCompare(b.time) || a.signer.localeCompare(b.signer) || a.seq - b.seq);
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
      return eventId(stored) === eventId(event) ? { status: 'duplicate' } : { status: 'rejected', reason: 'conflicting event (fork)' };
    }
    if (event.seq > expected) return this.#park(event, 'gap in log');
    if (event.prev !== (head ? eventId(head) : null)) return { status: 'rejected', reason: 'broken hash chain' };

    const check = this.authority.check(event);
    if (!check.ok) return check.retry ? this.#park(event, check.reason) : { status: 'rejected', reason: check.reason };

    this.store.append(event);
    this.#pending.delete(pendingKey(event));
    if (event.kind === KIND_DELEGATE || event.kind === KIND_REVOKE) this.authority.apply(event);
    for (const listener of this.#listeners) listener(event);
    return { status: 'accepted' };
  }

  #park(event: WeaveEvent, reason: string): IngestResult {
    if (this.#pending.size >= MAX_PENDING) return { status: 'rejected', reason: 'pending pool full' };
    this.#pending.set(pendingKey(event), event);
    return { status: 'pending', reason };
  }

  #drainPending(): void {
    let progress = true;
    while (progress && this.#pending.size > 0) {
      progress = false;
      for (const [key, event] of this.#pending) {
        const result = this.#ingestOne(event);
        if (result.status === 'accepted') progress = true;
        else if (result.status !== 'pending') this.#pending.delete(key);
      }
    }
  }
}

const pendingKey = (event: WeaveEvent): string => `${event.signer}#${event.seq}`;
