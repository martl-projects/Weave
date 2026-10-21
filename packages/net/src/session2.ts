import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import type { Duplex } from 'node:stream';
import { b64u, canonicalIdV2, isWireItemV2, utf8, verifyEventV2, type Did, type Replica, type WeaveEvent, type WireItemV2 } from '@weave/core';
import type { BlobSource } from './session.ts';

/*
 * Sync protocol v2 (docs/v2-stage1.md): a space's events go only to peers that
 * prove, on this very connection, that they hold its key.
 *
 * Messages, one JSON object per line:
 * - `hello {v: 2, tags}`: per space this node holds, HMAC(authKey, handshake
 *   hash) for its current and previous key. The handshake hash is known only to
 *   the two ends of this connection, so a tag can't be replayed on another one
 *   and tells nobody else anything. Sent again when this node's spaces change.
 * - `chains {space, heads}`: per signer, the last seq of its control chain in
 *   the space; the other side sends what comes after.
 * - `sync {space, since, until?, bare?}`: content from `since` on, please
 *   (the newest held minus a week; everything for a space new to this node).
 *   Answered with `have {space, ids, bare?}`, the ids held; the asker
 *   `fetch`es what it lacks. In a pulled space (stage 4) bodies come only for
 *   the recent window and what the node wants (`wantsBody`); for the rest
 *   `bare` asks for the envelopes alone.
 * - `items {items}`: v2 events `{e, b?}`.
 * - `keys {space, items}`: a space's rekey events, for a peer that proved only
 *   the space's previous key: a member who is behind takes the new key from
 *   them (if a box opens for them) and says hello again; someone removed has no
 *   box and gets nothing else of the space.
 * - `heads` / `events`: v1 logs, whole, as v0.3 sends them; only of keys that
 *   never wrote v2 (frozen history) and root keys (the identity foundation).
 * - `want` / `blob`: blobs by hash, as before.
 * - `keeping? {ids}` → `keeping {streams: {id: tags}}`, `keep {id, items}`,
 *   `kept? {id}` → `kept {id, items}`: keepers (stage 5). A friend keeps
 *   wrapped, padded items of our small spaces under ids only we can make;
 *   the node decides who keeps what (`access.keep`).
 *
 * `public` is shared with everyone. A peer whose first message is `heads` is
 * v0.3: it gets the v1 logs (ending in a farewell, where this node wrote one)
 * and nothing is taken from it.
 */
export type Message2 =
  | { t: 'hello'; v: 2; tags: string[] }
  | { t: 'chains'; space: string; heads: Record<string, number> }
  | { t: 'sync'; space: string; since: string; until?: string; bare?: true }
  | { t: 'have'; space: string; ids: string[]; bare?: true }
  | { t: 'fetch'; space: string; ids: string[]; bare?: true }
  | { t: 'items'; items: unknown[] }
  | { t: 'keys'; space: string; items: unknown[] }
  | { t: 'heads'; heads: Record<string, number> }
  | { t: 'events'; events: unknown[] }
  | { t: 'keeping?'; ids: string[] }
  | { t: 'keeping'; streams: Record<string, string[]> }
  | { t: 'keep'; id: string; items: Array<{ tag: string; data: string }> }
  | { t: 'kept?'; id: string }
  | { t: 'kept'; id: string; items: Array<{ tag: string; data: string }> }
  | { t: 'want'; hashes: string[] }
  | { t: 'blob'; hash: string; data: string };

/** A space this node holds, with the keys that prove it: the current epoch's first, then the one before. */
export interface HeldSpace {
  space: string;
  keys: Uint8Array[];
  /** A pulled space (stage 4): bodies come for this recent window (ms) and what the node wants; envelopes for everything. */
  pulled?: { windowMs: number };
}

/** What a session needs to know of the node: which spaces it holds, and where rekey events offered by peers go. */
export interface SpaceAccess {
  spaces(): HeldSpace[];
  /** Rekey events of a space from a peer that holds a newer key: the node takes a key from them if it may. */
  offerKeys?(items: WireItemV2[]): void;
  /** In a pulled space: does the node keep this event's body (its share, or something it keeps)? */
  wantsBody?(space: string, id: string): boolean;
  /** Keepers (stage 5), decided by the node from the spaces this connection shares (a direct chat says which friend it is). */
  keep?: KeepAccess;
}

export interface KeepAccess {
  /** Our streams this peer may hold (to recover them), with the tags of the items we have; `keeper`: it's one we chose to keep them. */
  streams(shared: ReadonlySet<string>): Array<{ id: string; tags: string[]; keeper: boolean }>;
  /** Our items of a stream with these tags, wrapped for the keeper. */
  wrapped(id: string, tags: string[]): Array<{ tag: string; data: string }>;
  /** Items a keeper gave back: unwrap and take them. */
  take(id: string, items: Array<{ tag: string; data: string }>): void;
  /** As a keeper: will we keep (more of) this stream for this peer? */
  accepts(shared: ReadonlySet<string>, id: string, bytes: number): boolean;
}

const MAX_FRAME = 4 * 1024 * 1024;
const BATCH = 256;
const MAX_IDS = 10_000;
/** How far back a space's content is compared on connect. */
export const RECENT_MS = 7 * 24 * 60 * 60 * 1000;

/** The key a space's tags are made with, derived from one of its keys (so the tag never shows the key itself). */
export const authKey = (key: Uint8Array): Uint8Array => sha256(new Uint8Array([...utf8('weave/auth/v2'), ...key]));

/** A space's tag on one connection. */
export const spaceTag = (key: Uint8Array, handshakeHash: Uint8Array): string => b64u.encode(hmac(sha256, authKey(key), new Uint8Array([...utf8('weave/tag/v2'), ...handshakeHash])));

export class PeerSession2 {
  readonly replica: Replica;
  readonly stream: Duplex;
  readonly blobs?: BlobSource;
  readonly #access: SpaceAccess;
  readonly #handshakeHash: Uint8Array;
  /** Spaces both ends hold (public always), and those whose sync has started on this connection. */
  #shared = new Set<string>(['public']);
  /** Spaces the peer proved only the previous key of: it gets their rekey events and nothing else. */
  #behind = new Set<string>();
  /** Per space whose sync has started, the tag of the key it started with: a new key starts it again. */
  #started = new Map<string, string>();
  /** The tags of the peer's last hello. */
  #peerTags?: unknown[];
  /** Asking a keeper again is due (after new events in a kept space). */
  #keepSoon?: ReturnType<typeof setTimeout>;
  /** What the peer is known to hold: v1 heads, and v2 events by canonical id (`<id>+body` with the body). */
  #peerHeads = new Map<string, number>();
  #peerHas = new Set<string>();
  /** null until the peer's first message says which protocol it speaks. */
  #peerVersion: 1 | 2 | null = null;
  #buffer = '';
  #unsubscribe: () => void;
  #closed = false;

  constructor(replica: Replica, stream: Duplex, options: { access: SpaceAccess; handshakeHash?: Uint8Array; blobs?: BlobSource }) {
    this.replica = replica;
    this.stream = stream;
    this.blobs = options.blobs;
    this.#access = options.access;
    const hash = options.handshakeHash ?? (stream as { handshakeHash?: Uint8Array | null }).handshakeHash;
    if (!hash) throw new Error('a v2 session needs the connection’s handshake hash');
    this.#handshakeHash = hash;
    this.#unsubscribe = replica.onAppend((record) => {
      if (isWireItemV2(record.wire)) this.#offer([record.wire]);
      else this.#offerV1(record.wire);
      if (record.scope !== 'public') this.#askKeepingSoon();
    });
    stream.on('data', (chunk: Buffer | string) => this.#receive(chunk.toString()));
    stream.on('close', () => this.close());
    stream.on('error', () => this.close());
    this.announce();
    this.#send({ t: 'heads', heads: this.#v1Heads() });
    const wanted = options.blobs?.wanted() ?? [];
    if (wanted.length) this.want(wanted);
  }

  /** Spaces this connection shares, public included. */
  get shared(): ReadonlySet<string> {
    return this.#shared;
  }

  /** Tell the peer which spaces this node holds (again, after they changed). */
  announce(): void {
    const tags = this.#access.spaces().flatMap(({ keys }) => keys.map((key) => spaceTag(key, this.#handshakeHash)));
    this.#send({ t: 'hello', v: 2, tags });
    // Spaces new here may be ones the peer already said it holds.
    if (this.#peerTags) this.#hello(this.#peerTags);
  }

  want(hashes: string[]): void {
    if (hashes.length) this.#send({ t: 'want', hashes: hashes.slice(0, 256) });
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    if (this.#keepSoon) clearTimeout(this.#keepSoon);
    this.#unsubscribe();
    this.stream.destroy();
  }

  #send(message: Message2): void {
    if (!this.#closed) this.stream.write(JSON.stringify(message) + '\n');
  }

  #receive(text: string): void {
    this.#buffer += text;
    if (this.#buffer.length > MAX_FRAME) return this.close();
    let newline: number;
    while ((newline = this.#buffer.indexOf('\n')) >= 0) {
      const line = this.#buffer.slice(0, newline);
      this.#buffer = this.#buffer.slice(newline + 1);
      let message: Message2;
      try {
        message = JSON.parse(line);
      } catch {
        return this.close();
      }
      if (!message || typeof message !== 'object') return this.close();
      this.#handle(message);
    }
  }

  #handle(message: Message2): void {
    // The first message tells the versions apart: v0.4 says hello first, v0.3 sends its heads.
    if (this.#peerVersion === null) this.#peerVersion = message.t === 'hello' ? 2 : 1;
    const v2 = this.#peerVersion === 2;
    switch (message.t) {
      case 'hello':
        if (v2 && Array.isArray(message.tags)) this.#hello(message.tags);
        break;
      case 'heads':
        if (message.heads && typeof message.heads === 'object') {
          for (const [signer, seq] of Object.entries(message.heads)) if (Number.isSafeInteger(seq)) this.#notePeerHead(signer, seq);
          this.#sendMissingV1();
        }
        break;
      case 'events':
        // From v0.3 peers nothing is taken: their history is frozen where it was when we moved.
        if (v2 && Array.isArray(message.events)) {
          for (const event of message.events) {
            const e = event as Partial<WeaveEvent>;
            if (typeof e.signer === 'string' && Number.isSafeInteger(e.seq)) this.#notePeerHead(e.signer, e.seq!);
            this.replica.ingest(event);
          }
        }
        break;
      case 'chains':
        if (v2 && this.#shared.has(message.space) && message.heads && typeof message.heads === 'object') this.#sendChains(message.space, message.heads);
        break;
      case 'sync':
        if (v2 && this.#shared.has(message.space) && typeof message.since === 'string') {
          const until = typeof message.until === 'string' ? message.until : undefined;
          const ids = this.replica.store.inSpace2(message.space, message.since, until).filter(({ event }) => event.class === 'content').map(({ id }) => id);
          for (let i = 0; i < ids.length; i += MAX_IDS) this.#send({ t: 'have', space: message.space, ids: ids.slice(i, i + MAX_IDS), ...(message.bare ? { bare: true as const } : {}) });
        }
        break;
      case 'have':
        if (v2 && this.#shared.has(message.space) && Array.isArray(message.ids)) {
          const full: string[] = [];
          const bare: string[] = [];
          for (const id of message.ids.filter((x): x is string => typeof x === 'string')) {
            this.#peerHas.add(id);
            const held = this.replica.store.get2(id);
            // Held without its body: fetch it, unless this node forgot it on purpose (or, for envelopes only, doesn't keep it).
            const bodyLacking = !held || (held.event.class === 'content' && this.replica.store.body(held.event.body) === undefined && !this.replica.store.forgotten(held.event.body));
            const wanted = !message.bare || this.#access.wantsBody?.(message.space, id) !== false;
            if (bodyLacking && wanted) full.push(id);
            else if (!held) bare.push(id);
          }
          for (let i = 0; i < full.length; i += MAX_IDS) this.#send({ t: 'fetch', space: message.space, ids: full.slice(i, i + MAX_IDS) });
          for (let i = 0; i < bare.length; i += MAX_IDS) this.#send({ t: 'fetch', space: message.space, ids: bare.slice(i, i + MAX_IDS), bare: true });
        }
        break;
      case 'fetch':
        if (v2 && this.#shared.has(message.space) && Array.isArray(message.ids)) {
          const items: WireItemV2[] = [];
          for (const id of message.ids.slice(0, MAX_IDS)) {
            const record = typeof id === 'string' ? this.replica.record2(id) : undefined;
            // Only what belongs to the space asked about, which both hold.
            if (record && record.scope === message.space && isWireItemV2(record.wire)) items.push(message.bare ? { e: record.wire.e } : record.wire);
          }
          this.#sendItems(items);
        }
        break;
      case 'keys':
        // Only from a peer that holds a space we hold too; taken by the node, never stored as they come.
        if (v2 && (this.#shared.has(message.space) || this.#behind.has(message.space) || this.#peerHasKeyOf(message.space)) && Array.isArray(message.items)) {
          const items = message.items.filter((item): item is WireItemV2 => isWireItemV2(item) && item.e.space === message.space && item.e.class === 'control' && verifyEventV2(item.e));
          if (items.length) this.#access.offerKeys?.(items);
        }
        break;
      case 'items':
        if (v2 && Array.isArray(message.items)) {
          for (const item of message.items) {
            if (!isWireItemV2(item) || !this.#shared.has(item.e.space)) continue;
            // Marked as held by the peer before taking it, so accepting it doesn't echo it back.
            this.#notePeerHas(item);
            this.replica.ingest(item);
          }
        }
        break;
      case 'keeping?':
        if (v2 && Array.isArray(message.ids) && this.#access.keep) {
          const streams: Record<string, string[]> = {};
          for (const id of message.ids.filter((x): x is string => typeof x === 'string').slice(0, 256)) {
            const tags = this.replica.store.keepTags(id);
            if (tags.length || this.#access.keep.accepts(this.#shared, id, 0)) streams[id] = tags;
          }
          this.#send({ t: 'keeping', streams });
        }
        break;
      case 'keeping':
        if (v2 && message.streams && typeof message.streams === 'object' && this.#access.keep) {
          const mine = new Map(this.#access.keep.streams(this.#shared).map((s) => [s.id, s]));
          for (const [id, tags] of Object.entries(message.streams)) {
            const stream = mine.get(id);
            if (!stream || !Array.isArray(tags)) continue;
            const ours = new Set(stream.tags);
            const theirs = new Set(tags.filter((t): t is string => typeof t === 'string'));
            const missing = stream.keeper ? [...ours].filter((t) => !theirs.has(t)) : [];
            if (missing.length) {
              const items = this.#access.keep.wrapped(id, missing);
              for (let i = 0; i < items.length; i += BATCH) this.#send({ t: 'keep', id, items: items.slice(i, i + BATCH) });
            }
            // It holds what we don't: we lost it, it's ours to take back.
            if ([...theirs].some((t) => !ours.has(t))) this.#send({ t: 'kept?', id });
          }
        }
        break;
      case 'keep':
        if (v2 && typeof message.id === 'string' && Array.isArray(message.items) && this.#access.keep) {
          const items = message.items.filter((i) => i && typeof i.tag === 'string' && typeof i.data === 'string' && i.data.length < MAX_FRAME);
          const bytes = items.reduce((sum, i) => sum + i.data.length, 0);
          if (!this.#access.keep.accepts(this.#shared, message.id, bytes)) break;
          for (const item of items) this.replica.store.keepPut(message.id, item.tag, item.data);
        }
        break;
      case 'kept?':
        if (v2 && typeof message.id === 'string') {
          const items = this.replica.store.keepItems(message.id);
          for (let i = 0; i < items.length; i += BATCH) this.#send({ t: 'kept', id: message.id, items: items.slice(i, i + BATCH) });
        }
        break;
      case 'kept':
        if (v2 && typeof message.id === 'string' && Array.isArray(message.items) && this.#access.keep) {
          this.#access.keep.take(message.id, message.items.filter((i) => i && typeof i.tag === 'string' && typeof i.data === 'string'));
        }
        break;
      case 'want':
        if (Array.isArray(message.hashes) && this.blobs) {
          for (const hash of message.hashes.slice(0, 256)) {
            const data = typeof hash === 'string' ? this.blobs.get(hash) : undefined;
            if (data) this.#send({ t: 'blob', hash, data: Buffer.from(data).toString('base64url') });
          }
        }
        break;
      case 'blob':
        if (typeof message.hash === 'string' && typeof message.data === 'string' && this.blobs) this.blobs.receive(message.hash, new Uint8Array(Buffer.from(message.data, 'base64url')));
        break;
    }
  }

  /** The peer's spaces: start syncing those newly shared. */
  #hello(tags: unknown[]): void {
    this.#peerTags = tags;
    const theirs = new Set(tags.filter((t): t is string => typeof t === 'string'));
    const shared = new Set(['public']);
    const behind = new Set<string>();
    const startedWith = new Map<string, string>([['public', '']]);
    for (const { space, keys } of this.#access.spaces()) {
      if (keys[0]) startedWith.set(space, spaceTag(keys[0], this.#handshakeHash));
      const [current, ...earlier] = keys;
      if (current && theirs.has(spaceTag(current, this.#handshakeHash))) shared.add(space);
      else if (earlier.some((key) => theirs.has(spaceTag(key, this.#handshakeHash)))) behind.add(space);
    }
    this.#shared = shared;
    for (const space of behind) if (!this.#behind.has(space)) this.#sendKeys(space);
    this.#behind = behind;
    for (const space of shared) {
      const key = startedWith.get(space) ?? '';
      if (this.#started.get(space) === key) continue;
      this.#started.set(space, key);
      this.#startSpace(space);
    }
    // A space the peer left starts again if it comes back.
    for (const space of this.#started.keys()) if (!shared.has(space)) this.#started.delete(space);
    this.#askKeeping();
  }

  /** Ask the peer what it keeps of our streams (it answers only for those it keeps, or would). */
  #askKeeping(): void {
    const streams = this.#access.keep?.streams(this.#shared) ?? [];
    if (streams.length) this.#send({ t: 'keeping?', ids: streams.map((s) => s.id) });
  }

  #askKeepingSoon(): void {
    if (this.#keepSoon || this.#peerVersion !== 2 || !this.#access.keep) return;
    this.#keepSoon = setTimeout(() => {
      this.#keepSoon = undefined;
      this.#askKeeping();
    }, 500);
    this.#keepSoon.unref?.();
  }

  #startSpace(space: string): void {
    const heads: Record<string, number> = {};
    let newest = '';
    for (const { event } of this.replica.store.inSpace2(space)) {
      if (event.class === 'control') heads[event.signer] = Math.max(heads[event.signer] ?? 0, event.seq);
      else if (event.time > newest) newest = event.time;
    }
    this.#send({ t: 'chains', space, heads });
    const pulled = this.#access.spaces().find((h) => h.space === space)?.pulled;
    if (pulled) {
      // Bodies for the recent window; envelopes of the rest (with the bodies this node keeps).
      this.#send({ t: 'sync', space, since: new Date(Date.now() - pulled.windowMs).toISOString() });
      this.#send({ t: 'sync', space, since: '', bare: true });
      return;
    }
    const since = newest ? new Date(Date.parse(newest) - RECENT_MS).toISOString() : '';
    this.#send({ t: 'sync', space, since });
  }

  /** Ask the peer for a space's content between two times, bodies included ("load older"). */
  fetchRange(space: string, since: string, until: string): void {
    if (this.#shared.has(space)) this.#send({ t: 'sync', space, since, until });
  }

  /** A space's rekey events, for a peer that holds only its previous key. */
  #sendKeys(space: string): void {
    const items = this.replica.store
      .inSpace2(space)
      .filter(({ event }) => event.class === 'control' && /\.rekey$/.test(event.kind))
      .map(({ event }): WireItemV2 => ({ e: event }));
    if (items.length) this.#send({ t: 'keys', space, items });
  }

  /** Does the peer's last hello show any key we hold of this space? (Keys come from someone ahead of us, whose current key we don't hold yet.) */
  #peerHasKeyOf(space: string): boolean {
    const theirs = new Set((this.#peerTags ?? []).filter((t): t is string => typeof t === 'string'));
    return this.#access.spaces().some((held) => held.space === space && held.keys.some((key) => theirs.has(spaceTag(key, this.#handshakeHash))));
  }

  /** Control events of a space the peer lacks, in chain order per signer. */
  #sendChains(space: string, theirs: Record<string, unknown>): void {
    const items: WireItemV2[] = [];
    const control = this.replica.store.inSpace2(space).filter(({ event }) => event.class === 'control');
    control.sort((a, b) => (a.event.signer === b.event.signer ? (a.event as { seq: number }).seq - (b.event as { seq: number }).seq : a.event.signer.localeCompare(b.event.signer)));
    for (const { event } of control) {
      const peerSeq = Number.isSafeInteger(theirs[event.signer]) ? (theirs[event.signer] as number) : 0;
      if (event.class === 'control' && event.seq > peerSeq) items.push({ e: event });
    }
    this.#sendItems(items);
  }

  #notePeerHas(item: WireItemV2): void {
    const id = canonicalIdV2(item.e);
    this.#peerHas.add('b' in item || item.e.class === 'control' ? `${id}+body` : id);
  }

  /** New v2 events: to the peer if it shares their space and doesn't have them yet. */
  #offer(items: WireItemV2[]): void {
    if (this.#peerVersion === 1) return;
    this.#sendItems(items.filter((item) => this.#shared.has(item.e.space)));
    // A new key of a space the peer is behind in: theirs to take, if a box is for them.
    for (const item of items) if (this.#behind.has(item.e.space) && item.e.class === 'control' && /\.rekey$/.test(item.e.kind)) this.#send({ t: 'keys', space: item.e.space, items: [{ e: item.e }] });
  }

  #sendItems(items: WireItemV2[]): void {
    const out = items.filter((item) => {
      const id = canonicalIdV2(item.e);
      const withBody = 'b' in item || item.e.class === 'control';
      if (this.#peerHas.has(`${id}+body`) || (!withBody && this.#peerHas.has(id))) return false;
      this.#peerHas.add(withBody ? `${id}+body` : id);
      return true;
    });
    for (let i = 0; i < out.length; i += BATCH) this.#send({ t: 'items', items: out.slice(i, i + BATCH) });
  }

  // ---------------------------------------------------------------- v1 logs

  /** Keys whose v1 logs travel: those that never wrote v2 (frozen history), and root keys (the identity foundation). */
  #sendsV1(signer: Did): boolean {
    return this.#peerVersion === 1 || this.replica.store.number2(signer) === 0 || !this.replica.authority.grant(signer);
  }

  #v1Heads(): Record<string, number> {
    const heads: Record<string, number> = {};
    for (const [signer, seq] of Object.entries(this.replica.heads())) if (this.#sendsV1(signer as Did)) heads[signer] = seq;
    return heads;
  }

  #notePeerHead(signer: string, seq: number): void {
    if (seq > (this.#peerHeads.get(signer) ?? 0)) this.#peerHeads.set(signer, seq);
  }

  #sendMissingV1(): void {
    for (const [signer, seq] of Object.entries(this.#v1Heads())) {
      const peerSeq = this.#peerHeads.get(signer) ?? 0;
      if (seq <= peerSeq) continue;
      const missing = this.replica.store.range(signer as Did, peerSeq + 1);
      for (let i = 0; i < missing.length; i += BATCH) this.#send({ t: 'events', events: missing.slice(i, i + BATCH) });
      this.#peerHeads.set(signer, seq);
    }
  }

  #offerV1(event: WeaveEvent): void {
    if (!this.#sendsV1(event.signer) || (this.#peerHeads.get(event.signer) ?? 0) >= event.seq) return;
    this.#send({ t: 'events', events: [event] });
    this.#peerHeads.set(event.signer, event.seq);
  }
}
