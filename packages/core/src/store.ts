import type { Did } from './keys.ts';
import type { WeaveEvent } from './events.ts';

/** Append-only storage of one log per signing key. Validation happens in Replica, not here. */
export interface LogStore {
  head(signer: Did): WeaveEvent | undefined;
  get(signer: Did, seq: number): WeaveEvent | undefined;
  /** Events with `from <= seq <= to` (to defaults to the head). */
  range(signer: Did, from: number, to?: number): WeaveEvent[];
  append(event: WeaveEvent): void;
  signers(): Did[];
}

export class MemoryStore implements LogStore {
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
