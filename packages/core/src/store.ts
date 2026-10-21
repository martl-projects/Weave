import type { Did } from './keys.ts';
import type { WeaveEvent } from './events.ts';
import type { Json } from './bytes.ts';
import type { ControlEventV2, EventV2 } from './eventsV2.ts';

/** A v2 event as stored: under its canonical id (the v1 id it re-signs, else its own). */
export interface StoredV2 {
  id: string;
  event: EventV2;
  /** A content event's body, when the store read it along (all2 does); else look it up with body(). */
  body?: Json;
}

/**
 * Append-only storage of the events a node holds. Validation happens in
 * Replica, not here.
 *
 * - v1: one log per signing key, by seq (the identity foundation, and history
 *   from before v0.4).
 * - v2: events by canonical id, by (signer, n), control chains by (signer,
 *   space, seq), and content bodies by hash, apart from their events.
 */
export interface LogStore {
  head(signer: Did): WeaveEvent | undefined;
  get(signer: Did, seq: number): WeaveEvent | undefined;
  /** Events with `from <= seq <= to` (to defaults to the head). */
  range(signer: Did, from: number, to?: number): WeaveEvent[];
  append(event: WeaveEvent): void;
  signers(): Did[];

  /** Store a checked v2 event under its canonical id. */
  add2(item: StoredV2): void;
  /** The v2 event with this canonical id. */
  get2(id: string): StoredV2 | undefined;
  /** The v2 event a key signed with number n. */
  byNumber(signer: Did, n: number): StoredV2 | undefined;
  /** The highest n of a key's v2 events (0 if none). */
  number2(signer: Did): number;
  /** A key's control event at position `seq` of its chain in a space. */
  chainAt(signer: Did, space: string, seq: number): ControlEventV2 | undefined;
  /** A key's latest control event in a space. */
  chainHead(signer: Did, space: string): ControlEventV2 | undefined;
  /** Every v2 event (in no particular order), content events with their bodies where held. */
  all2(): StoredV2[];
  /** Keys with v2 events. */
  signers2(): Did[];
  /** The v2 events of a space, by claimed time; from `since` on if given (and before `until`). */
  inSpace2(space: string, since?: string, until?: string): StoredV2[];
  /** A key's v2 events, by n. */
  range2(signer: Did): StoredV2[];
  body(hash: string): Json | undefined;
  /** Keep a body; the caller checked it against its event's hash. Forgotten ones aren't kept again. */
  putBody(hash: string, body: Json): void;
  /** Let go of a body this node doesn't hold (stage 4): it may be fetched again later. */
  releaseBody(hash: string): void;
  /** Forget a body: drop it, and remember that it was forgotten so it isn't fetched again. */
  dropBody(hash: string): void;
  forgotten(hash: string): boolean;
}

/** The v2 part of a store, in memory: for MemoryStore, and for FileStore to keep beside its files. */
export class MemoryV2 {
  #byId = new Map<string, StoredV2>();
  #byNumber = new Map<string, StoredV2>();
  #numbers = new Map<Did, number>();
  #chains = new Map<string, ControlEventV2[]>();
  #bodies = new Map<string, Json>();
  #forgotten = new Set<string>();

  add2(item: StoredV2): void {
    const { id, event } = item;
    if (this.#byId.has(id)) throw new Error(`v2 event ${id} already stored`);
    const numberKey = `${event.signer} ${event.n}`;
    if (this.#byNumber.has(numberKey)) throw new Error(`${event.signer} already has an event numbered ${event.n}`);
    if (event.class === 'control') {
      const chain = this.#chains.get(`${event.signer} ${event.space}`) ?? [];
      if (event.seq !== chain.length + 1) throw new Error(`out-of-order control event: seq ${event.seq} after ${chain.length}`);
      chain.push(event);
      this.#chains.set(`${event.signer} ${event.space}`, chain);
    }
    this.#byId.set(id, { id, event });
    this.#byNumber.set(numberKey, { id, event });
    this.#numbers.set(event.signer, Math.max(this.#numbers.get(event.signer) ?? 0, event.n));
  }

  get2(id: string): StoredV2 | undefined {
    return this.#byId.get(id);
  }

  byNumber(signer: Did, n: number): StoredV2 | undefined {
    return this.#byNumber.get(`${signer} ${n}`);
  }

  number2(signer: Did): number {
    return this.#numbers.get(signer) ?? 0;
  }

  chainAt(signer: Did, space: string, seq: number): ControlEventV2 | undefined {
    return this.#chains.get(`${signer} ${space}`)?.[seq - 1];
  }

  chainHead(signer: Did, space: string): ControlEventV2 | undefined {
    return this.#chains.get(`${signer} ${space}`)?.at(-1);
  }

  all2(): StoredV2[] {
    return [...this.#byId.values()].map((item) => {
      const body = item.event.class === 'content' ? this.#bodies.get(item.event.body) : undefined;
      return body === undefined ? item : { ...item, body };
    });
  }

  signers2(): Did[] {
    return [...this.#numbers.keys()];
  }

  inSpace2(space: string, since = '', until = '\uffff'): StoredV2[] {
    return [...this.#byId.values()].filter(({ event }) => event.space === space && event.time >= since && event.time < until).sort((a, b) => a.event.time.localeCompare(b.event.time));
  }

  range2(signer: Did): StoredV2[] {
    return [...this.#byId.values()].filter(({ event }) => event.signer === signer).sort((a, b) => a.event.n - b.event.n);
  }

  body(hash: string): Json | undefined {
    return this.#bodies.get(hash);
  }

  putBody(hash: string, body: Json): void {
    if (!this.#forgotten.has(hash)) this.#bodies.set(hash, body);
  }

  releaseBody(hash: string): void {
    this.#bodies.delete(hash);
  }

  dropBody(hash: string): void {
    this.#bodies.delete(hash);
    this.#forgotten.add(hash);
  }

  forgotten(hash: string): boolean {
    return this.#forgotten.has(hash);
  }
}

export class MemoryStore extends MemoryV2 implements LogStore {
  #logs = new Map<Did, WeaveEvent[]>();

  head(signer: Did): WeaveEvent | undefined {
    return this.#logs.get(signer)?.at(-1);
  }

  get(signer: Did, seq: number): WeaveEvent | undefined {
    return this.#logs.get(signer)?.[seq - 1];
  }

  range(signer: Did, from: number, to?: number): WeaveEvent[] {
    const log = this.#logs.get(signer) ?? [];
    return log.slice(Math.max(0, from - 1), to === undefined ? undefined : to);
  }

  append(event: WeaveEvent): void {
    const log = this.#logs.get(event.signer) ?? [];
    if (event.seq !== log.length + 1) throw new Error(`out-of-order append: seq ${event.seq} after ${log.length}`);
    log.push(event);
    this.#logs.set(event.signer, log);
  }

  signers(): Did[] {
    return [...this.#logs.keys()];
  }
}
