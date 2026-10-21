import type { Duplex } from 'node:stream';
import { eventIdV2, isWireItemV2, type Did, type Replica, type WeaveEvent } from '@weave/core';

/**
 * Wire messages, one JSON object per line:
 * - `heads`: the latest seq this side holds per signing key
 * - `events`: events the other side is missing, in log order
 * - `want`: blobs (by hash) this side is looking for
 * - `blob`: one blob, base64url, sent to a peer that wants it
 * - `items`: v2 events (`{e, b?}`): all of them on connect, then each new one.
 *   A stand-in until the v2 session (docs/v2-stage1.md, step 4) replaces it.
 * Older peers ignore messages they don't know.
 */
export type Message =
  | { t: 'heads'; heads: Record<string, number> }
  | { t: 'events'; events: unknown[] }
  | { t: 'items'; items: unknown[] }
  | { t: 'want'; hashes: string[] }
  | { t: 'blob'; hash: string; data: string };

/** Where a session finds blobs to send and puts blobs it receives (see @weave/core blobs). */
export interface BlobSource {
  get(hash: string): Uint8Array | undefined;
  /** A blob arrived; the source checks the hash and keeps it only if it wanted it. */
  receive(hash: string, data: Uint8Array): void;
  /** Hashes this node is looking for right now. */
  wanted(): string[];
}

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
  /** v2 events the peer has (by their own id; `<id>+body` when with the body), from us or sent by it. */
  #peerHas2 = new Set<string>();
  #buffer = '';
  #unsubscribe: () => void;
  #closed = false;

  readonly blobs?: BlobSource;

  constructor(replica: Replica, stream: Duplex, blobs?: BlobSource) {
    this.replica = replica;
    this.stream = stream;
    this.blobs = blobs;
    this.#unsubscribe = replica.onAppend((record) => {
      if (isWireItemV2(record.wire)) this.#offer2([record.wire]);
      else this.#offer(record.wire);
    });
    stream.on('data', (chunk: Buffer | string) => this.#receive(chunk.toString()));
    stream.on('close', () => this.close());
    stream.on('error', () => this.close());
    this.#send({ t: 'heads', heads: replica.heads() });
    this.#offer2(replica.events((r) => r.v === 2).map((r) => r.wire));
    const wanted = blobs?.wanted() ?? [];
    if (wanted.length) this.want(wanted);
  }

  /** Ask the peer for blobs; it sends those it has. */
  want(hashes: string[]): void {
    if (hashes.length) this.#send({ t: 'want', hashes: hashes.slice(0, 256) });
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
    } else if (message.t === 'items' && Array.isArray(message.items)) {
      for (const item of message.items) {
        if (isWireItemV2(item)) this.#peerHas2.add('b' in item ? `${eventIdV2(item.e)}+body` : eventIdV2(item.e));
        this.replica.ingest(item);
      }
    } else if (message.t === 'want' && Array.isArray(message.hashes) && this.blobs) {
      for (const hash of message.hashes.slice(0, 256)) {
        const data = typeof hash === 'string' ? this.blobs.get(hash) : undefined;
        if (data) this.#send({ t: 'blob', hash, data: Buffer.from(data).toString('base64url') });
      }
    } else if (message.t === 'blob' && typeof message.hash === 'string' && typeof message.data === 'string' && this.blobs) {
      this.blobs.receive(message.hash, new Uint8Array(Buffer.from(message.data, 'base64url')));
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

  #offer2(wires: unknown[]): void {
    const items = wires.filter(isWireItemV2).filter((item) => {
      const id = eventIdV2(item.e);
      if (this.#peerHas2.has(`${id}+body`) || (this.#peerHas2.has(id) && !('b' in item))) return false;
      this.#peerHas2.add('b' in item ? `${id}+body` : id);
      return true;
    });
    for (let i = 0; i < items.length; i += BATCH) this.#send({ t: 'items', items: items.slice(i, i + BATCH) });
  }

  #offer(event: WeaveEvent): void {
    if ((this.#peerHeads.get(event.signer) ?? 0) >= event.seq) return;
    this.#send({ t: 'events', events: [event] });
    this.#peerHeads.set(event.signer, event.seq);
  }
}
