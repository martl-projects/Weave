import type { Duplex } from 'node:stream';
import type { Did, Replica, WeaveEvent } from '@weave/core';

/**
 * Wire messages, one JSON object per line:
 * - `heads`: the latest seq this side holds per signing key
 * - `events`: events the other side is missing, in log order
 */
export type Message =
  | { t: 'heads'; heads: Record<string, number> }
  | { t: 'events'; events: unknown[] };

const MAX_FRAME = 4 * 1024 * 1024;
const BATCH = 256;

/**
 * Replicates a Replica with one peer over any byte stream (a Hyperswarm socket
 * in production, an in-memory pair in tests).
 *
 * On connect both sides announce their heads and send what the other lacks.
 * After that, every event accepted locally is offered to the peer unless it
 * already has it, so events hop onward through the mesh.
 */
export class PeerSession {
  readonly replica: Replica;
  readonly stream: Duplex;
  /** What we know the peer holds, so we never send an event twice. */
  #peerHeads = new Map<string, number>();
  #buffer = '';
  #unsubscribe: () => void;
  #closed = false;

  constructor(replica: Replica, stream: Duplex) {
    this.replica = replica;
    this.stream = stream;
    this.#unsubscribe = replica.onAppend((event) => this.#offer(event));
    stream.on('data', (chunk: Buffer | string) => this.#receive(chunk.toString()));
    stream.on('close', () => this.close());
    stream.on('error', () => this.close());
    this.#send({ t: 'heads', heads: replica.heads() });
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#unsubscribe();
    this.stream.destroy();
  }

  #send(message: Message): void {
    if (!this.#closed) this.stream.write(JSON.stringify(message) + '\n');
  }

  #receive(text: string): void {
    this.#buffer += text;
    if (this.#buffer.length > MAX_FRAME) return this.close();
    let newline: number;
    while ((newline = this.#buffer.indexOf('\n')) >= 0) {
      const line = this.#buffer.slice(0, newline);
      this.#buffer = this.#buffer.slice(newline + 1);
      let message: Message;
      try {
        message = JSON.parse(line);
      } catch {
        return this.close();
      }
      this.#handle(message);
    }
  }

  #handle(message: Message): void {
    if (message.t === 'heads' && message.heads && typeof message.heads === 'object') {
      for (const [signer, seq] of Object.entries(message.heads)) {
        if (Number.isSafeInteger(seq)) this.#notePeerHas(signer, seq);
      }
      this.#sendMissing();
    } else if (message.t === 'events' && Array.isArray(message.events)) {
      for (const event of message.events) {
        const e = event as Partial<WeaveEvent>;
        // Mark as held by the peer before ingesting, so accepting it doesn't echo it back.
        if (typeof e.signer === 'string' && Number.isSafeInteger(e.seq)) this.#notePeerHas(e.signer, e.seq!);
        this.replica.ingest(event);
      }
    }
  }

  #notePeerHas(signer: string, seq: number): void {
    if (seq > (this.#peerHeads.get(signer) ?? 0)) this.#peerHeads.set(signer, seq);
  }

  #sendMissing(): void {
    for (const [signer, seq] of Object.entries(this.replica.heads())) {
      const peerSeq = this.#peerHeads.get(signer) ?? 0;
      if (seq <= peerSeq) continue;
      const missing = this.replica.store.range(signer as Did, peerSeq + 1);
      for (let i = 0; i < missing.length; i += BATCH) this.#send({ t: 'events', events: missing.slice(i, i + BATCH) });
      this.#peerHeads.set(signer, seq);
    }
  }

  #offer(event: WeaveEvent): void {
    if ((this.#peerHeads.get(event.signer) ?? 0) >= event.seq) return;
    this.#send({ t: 'events', events: [event] });
    this.#peerHeads.set(event.signer, event.seq);
  }
}
