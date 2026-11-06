import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import type { Duplex } from 'node:stream';
import { b64u, canonicalIdV2, compact, expand, isWireItemV2, openRanges, reconcileStep, reconKey, utf8, verifyEventV2, type Did, type ReconItem, type ReconRange, type Replica, type WeaveEvent, type WireItemV2 } from '@weave/core';
import type { BlobSource } from './session.ts';

/*
 * Sync protocol v2 (docs/v2-stage1.md): a space's events go only to peers that
 * prove, on this very connection, that they hold its key.
 *
 * Messages, one JSON object per line:
 * - `hello {v, tags}`: `v` is the protocol this node speaks (WIRE_VERSION), and
 *   per space it holds, HMAC(authKey, role ‖ handshake hash) for its current
 *   and previous key. The handshake hash is known only to the two ends of this
 *   connection, so a tag can't be replayed on another one and tells nobody
 *   else anything. The role (initiator or responder) makes each end's tags its
 *   own: a peer echoing ours back proves nothing, it must show the other
 *   role's tag. Sent again when this node's spaces change.
 * - `chains {space, heads}`: per signer, the last seq of its control chain in
 *   the space; the other side sends what comes after.
 * - `sync {space, since, until?, bare?}`: content from `since` on, please
 *   (the newest held minus a week; everything for a space new to this node).
 *   Answered with `have {space, ids, bare?}`, the ids held; the asker
 *   `fetch`es what it lacks. In a pulled space (stage 4) bodies come only for
 *   the recent window and what the node wants (`wantsBody`); for the rest
 *   `bare` asks for the envelopes alone.
 * - `neg {space, since, until?, bare?, ranges}`: between peers that both say
 *   `features: ['neg']` in their hello, range-based set reconciliation
 *   (stage 7) instead of `sync`/`have`: ranges of items compared by
 *   fingerprint until each side knows what it lacks, then `fetch` as before.
 *   Without `bare` the items are the events with their bodies; with it, all
 *   envelopes.
 * - `items {items}`: v2 events `{e, b?}`.
 * - `keys {space, items}`: a space's rekey events, for a peer that proved only
 *   the space's previous key: a member who is behind takes the new key from
 *   them (if a box opens for them) and says hello again; someone removed has no
 *   box and gets nothing else of the space.
 * - `heads` / `events`: v1 logs, whole, as v0.3 sends them; only of keys that
 *   never wrote v2 (frozen history) and root keys (the identity foundation).
 * - `want` / `blob`: blobs by hash, as before.
 * - `keeping? {ids}` → `keeping {streams: {id: tags}}`, `kept? {id}` →
 *   `kept {id, items}`, `drop {id}`: the copies friends hold from before
 *   (keepers, stage 5). Until 6.11.2026 a friend kept wrapped, padded items of
 *   our small spaces under ids only we can make. Nothing new is kept any more
 *   (`keep {id, items}` is neither sent nor taken): a node asks what a friend
 *   still holds, takes back what it lost, and tells them to let a stream go
 *   once its person decided so and it holds all of it.
 *
 * `public` is shared with everyone, unless the node has a firewall
 * (`access.firewall`: trust starts before the first packet): then
 * a peer gets nothing, public included, until its hello shows a space that
 * admits or a proof (the secret behind a contact link's meeting point), and a
 * hello that shows none closes the connection. A peer whose first message is `heads` is
 * v0.3: it gets the v1 logs (ending in a farewell, where this node wrote one)
 * and nothing is taken from it.
 *
 * Protocol versions: a peer whose hello says a lower `v` than ours proves
 * nothing to us and gets nothing of ours, except one thing: the node's
 * farewell (`access.farewells`), a message in each shared group and project
 * asking it to update, served in the shape it reads (a hello of its version,
 * with the role-less tags of protocol 2, then the farewell events). A peer with
 * a higher `v` is the newer one: it does the same for us, so its hello is
 * taken as any, and the node can tell its person to update (`peerStanding`).
 */
export type Message2 =
  | { t: 'hello'; v: number; tags: string[]; features?: string[] }
  | { t: 'neg'; space: string; since: string; until?: string; bare?: true; init?: true; ranges: Array<Partial<ReconRange>> }
  | { t: 'chains'; space: string; heads: Record<string, number> }
  | { t: 'sync'; space: string; since: string; until?: string; bare?: true }
  | { t: 'have'; space: string; ids: string[]; bare?: true }
  | { t: 'fetch'; space: string; ids: string[]; bare?: true }
  | { t: 'items'; items: unknown[] }
  | { t: 'keys'; space: string; items: unknown[] }
  | { t: 'heads'; heads: Record<string, number> }
  | { t: 'events'; events: unknown[] }
  | { t: 'keeping?'; ids: string[]; choice?: true }
  | { t: 'keeping'; streams: Record<string, string[]> }
  | { t: 'kept?'; id: string }
  | { t: 'kept'; id: string; items: Array<{ tag: string; data: string }> }
  | { t: 'drop'; id: string }
  | { t: 'want'; hashes: string[] }
  | { t: 'blob'; hash: string; data: string };

/** A space this node holds, with the keys that prove it: the current epoch's first, then the earlier ones, newest first (a peer proving only an earlier one is behind: it gets the rekeys). */
export interface HeldSpace {
  space: string;
  keys: Uint8Array[];
  /** A pulled space (stage 4): bodies come for this recent window (ms) and what the node wants; envelopes for everything. */
  pulled?: { windowMs: number };
  /** Not a space: a secret that only proves the peer was given a link (a contact link's meeting point). Never synced. */
  proof?: true;
  /**
   * `keys` are auth keys (`authKey`), not the space's keys: this node syncs the space's events as they travel and
   * can't open them. A storage node holds a person's spaces this way (Weave Web, stage 2).
   */
  blind?: true;
  /** Behind the firewall, sharing this lets a peer in. False for what anyone could hold with us (a stranger's direct chat). */
  admits?: boolean;
}

/** What a session needs to know of the node: which spaces it holds, and where rekey events offered by peers go. */
export interface SpaceAccess {
  spaces(): HeldSpace[];
  /** Rekey events of a space from a peer that holds a newer key: the node takes a key from them if it may. */
  offerKeys?(items: WireItemV2[]): void;
  /** In a pulled space: does the node keep this event's body (its share, or something it keeps)? */
  wantsBody?(space: string, id: string): boolean;
  /** The copies friends hold from before (keepers, stage 5), by the spaces this connection shares (a direct chat says which friend it is). */
  keep?: KeepAccess;
  /** For a peer on an older protocol: this node's farewell in each group and project, signed in the shape that protocol reads. The only thing such a peer gets. */
  farewells?(): WireItemV2[];
  /**
   * Strangers are turned away: until its hello shows a space (or a proof) that admits, a peer gets nothing, not even
   * public, and nothing it sends is read; a hello that shows none closes the connection.
   */
  firewall?: boolean;
  /**
   * A control event from a peer that holds only an older key of the space: may it be taken? Only a join with an invite
   * the space knows: whoever's behind may also be someone removed, and control events aren't rate-limited. Without
   * it, nothing from such a peer is taken.
   */
  fromBehind?(item: WireItemV2): boolean;
  /**
   * Whose public events this peer gets, by the spaces this connection shares: the node's own person, and those the
   * peer shares a space or a direct chat with here (everyone, for one of the person's own devices). Undefined: all of
   * them. A peer let in only by a contact link learns the person it reached, not who else that person knows.
   */
  publicFor?(shared: ReadonlySet<string>): ((author: Did) => boolean) | undefined;
}

/** How many control events one connection takes from a peer behind in a space: a join or two, never a flood. */
const MAX_FROM_BEHIND = 16;

export interface KeepAccess {
  /**
   * Our streams this peer may hold, with the tags of the items we have: asked about, so that what we lost can be taken
   * back. `drop`: our person decided that what it holds goes (told once we hold all of it). Otherwise what it holds
   * stays: nothing is let go without a decision.
   */
  streams(shared: ReadonlySet<string>): Array<{ id: string; tags: string[]; drop?: boolean }>;
  /** Items a keeper gave back: unwrap and take them. Returns how many were new to us. */
  take(id: string, items: Array<{ tag: string; data: string }>): number;
  /** As a keeper: this peer asked about these streams we hold. Only their owner can name them: it is still around. */
  asked?(shared: ReadonlySet<string>, ids: string[]): void;
  /** As an owner: how many items of ours this peer said it holds, in all our streams. Told once every part of a question is answered. */
  holds?(shared: ReadonlySet<string>, items: number): void;
  /** As a keeper: may this peer tell us to let this stream go? Not when we know it as someone else's. */
  mayDrop?(shared: ReadonlySet<string>, id: string): boolean;
}

const MAX_FRAME = 4 * 1024 * 1024;
/** How many stream ids a keeper reads of one `keeping?`. */
const MAX_KEEP_IDS = 256;
const BATCH = 256;
const MAX_IDS = 10_000;
/** How far back a space's content is compared on connect. */
export const RECENT_MS = 7 * 24 * 60 * 60 * 1000;

/** The key a space's tags are made with, derived from one of its keys (so the tag never shows the key itself). */
export const authKey = (key: Uint8Array): Uint8Array => sha256(new Uint8Array([...utf8('weave/auth/v2'), ...key]));

/** Which end of the connection made a tag: the one that dialled, or the one that answered. */
export type Role = 'initiator' | 'responder';

/**
 * The protocol this node speaks, said in its hello. 3 since the review before
 * the first public release: tags carry the role, sealed events sign their inner
 * hash (ih), content is numbered in its space (cs), joins prove their link.
 * Nodes before it drop such events as malformed, so the two sides don't sync:
 * the older one gets the farewell and nothing else.
 */
export const WIRE_VERSION = 3;

/** A space's tag on one connection, made by one end: the other end's tag for the same key differs, so a reflected tag never matches. */
export const spaceTag = (key: Uint8Array, handshakeHash: Uint8Array, role: Role): string => authTag(authKey(key), handshakeHash, role);

/** The same tag from the auth key alone: what a blind holder shows, who can prove a space but not open it. */
export const authTag = (auth: Uint8Array, handshakeHash: Uint8Array, role: Role): string =>
  b64u.encode(hmac(sha256, auth, new Uint8Array([...utf8(`weave/tag/v3/${role}`), ...handshakeHash])));

/** A space's tag as protocol 2 made it, the same at both ends: only for the hello that carries the farewell to a peer still on it. */
export const legacyTag = (key: Uint8Array, handshakeHash: Uint8Array): string => b64u.encode(hmac(sha256, authKey(key), new Uint8Array([...utf8('weave/tag/v2'), ...handshakeHash])));

/** How a peer's protocol stands to ours: `older` peers get the farewell and nothing else; `newer` ones speak ours to us, and our person should update. */
export type PeerStanding = 'current' | 'older' | 'newer';

export class PeerSession2 {
  readonly replica: Replica;
  readonly stream: Duplex;
  readonly blobs?: BlobSource;
  readonly #access: SpaceAccess;
  readonly #handshakeHash: Uint8Array;
  /** Our end of the connection, and the peer's: we tag as ours, and expect theirs. */
  readonly #role: Role;
  readonly #peerRole: Role;
  /** Spaces both ends hold (public always), and those whose sync has started on this connection. */
  #shared = new Set<string>(['public']);
  /** The peer may have what we share (always, without a firewall); behind one, once its hello showed something that admits. */
  #admitted: boolean;
  /** Control events taken from the peer in spaces it's behind in (see MAX_FROM_BEHIND). */
  #takenFromBehind = 0;
  /** Whose public events the peer gets (see SpaceAccess.publicFor), decided by what its hello showed. */
  #publicOk: (author: Did) => boolean = () => true;
  /** May this event of this space go to the peer: always in a space both hold; in public, only of whom it may know. */
  #mayShow(space: string, author: string): boolean {
    return space !== 'public' || this.#publicOk(author as Did);
  }
  /** Spaces the peer proved only the previous key of: it gets their rekey events and nothing else. */
  #behind = new Set<string>();
  /** Per space whose sync has started, the tag of the key it started with: a new key starts it again. */
  #started = new Map<string, string>();
  /** The tags of the peer's last hello. */
  #peerTags?: unknown[];
  /** The peer reconciles by ranges (stage 7); else it gets id lists. */
  #peerNeg = false;
  /** Set false to speak only id lists (as v0.4–v0.9 do): for tests of the fallback. */
  readonly neg: boolean;
  /** Asking a keeper again is due (after it was told to let go, or gave something back). */
  #keepSoon?: ReturnType<typeof setTimeout>;
  /** Asked once more after telling a keeper to let go, so the node knows that it did (once per connection). */
  #keepConfirmed = false;
  /** The ids of each `keeping?` we sent and wait for, in order: an id its answer leaves out isn't held there. */
  #keepAsked: string[][] = [];
  /** What the peer said it holds of each of our streams (items), over the answers of this connection. */
  #keepHeld = new Map<string, number>();
  /** As a keeper: we answered a `keeping?` on this connection. */
  #keepAnswered = false;
  /** What the peer is known to hold: v1 heads, and v2 events by canonical id (`<id>+body` with the body). */
  #peerHeads = new Map<string, number>();
  #peerHas = new Set<string>();
  /** null until the peer's first message says which protocol it speaks: 1 for v0.3 (it sends heads first), else what its hello says. */
  #peerVersion: number | null = null;
  /** The peer said a higher version than ours in some hello (it speaks ours to us afterwards, as we do for older peers). */
  #peerNewer = false;
  /** An older peer was given the farewell: once per connection. */
  #toldOlder = false;
  #buffer = '';
  #unsubscribe: () => void;
  #closed = false;

  constructor(replica: Replica, stream: Duplex, options: { access: SpaceAccess; handshakeHash?: Uint8Array; initiator?: boolean; blobs?: BlobSource; neg?: boolean }) {
    this.replica = replica;
    this.neg = options.neg !== false;
    this.stream = stream;
    this.blobs = options.blobs;
    this.#access = options.access;
    this.#admitted = !options.access.firewall;
    if (!this.#admitted) this.#shared = new Set();
    const hash = options.handshakeHash ?? (stream as { handshakeHash?: Uint8Array | null }).handshakeHash;
    if (!hash) throw new Error('a v2 session needs the connection’s handshake hash');
    this.#handshakeHash = hash;
    const initiator = options.initiator ?? (stream as { isInitiator?: unknown }).isInitiator;
    if (typeof initiator !== 'boolean') throw new Error('a v2 session needs to know which end of the connection it is');
    this.#role = initiator ? 'initiator' : 'responder';
    this.#peerRole = initiator ? 'responder' : 'initiator';
    this.#unsubscribe = replica.onAppend((record) => {
      if (!this.#admitted) return;
      if (isWireItemV2(record.wire)) this.#offer([record.wire]);
      else this.#offerV1(record.wire);
    });
    stream.on('data', (chunk: Buffer | string) => this.#receive(chunk.toString()));
    stream.on('close', () => this.close());
    stream.on('error', () => this.close());
    this.announce();
    if (this.#admitted) this.#welcome();
  }

  /** What a peer we let in gets first: our v1 heads (v0.3 peers start from them) and the blobs we're after. */
  #welcome(): void {
    this.#send({ t: 'heads', heads: this.#v1Heads() });
    const wanted = this.blobs?.wanted() ?? [];
    if (wanted.length) this.want(wanted);
  }

  /** Spaces this connection shares, public included (nothing, with a peer on an older protocol). */
  get shared(): ReadonlySet<string> {
    return this.#shared;
  }

  /** The protocol the peer speaks, once its first message said: 1 for v0.3, else its hello's `v`. */
  get peerVersion(): number | null {
    return this.#peerVersion;
  }

  /** How the peer's protocol stands to ours, once known. */
  get peerStanding(): PeerStanding | undefined {
    if (this.#peerVersion === null) return undefined;
    return this.#peerNewer ? 'newer' : this.#peerVersion < WIRE_VERSION ? 'older' : 'current';
  }

  /** The peer speaks our protocol (or a newer one, in which case it speaks ours to us): what it sends counts. */
  #speaks(): boolean {
    return this.#peerVersion !== null && this.#peerVersion >= WIRE_VERSION;
  }

  #tag(held: HeldSpace, key: Uint8Array, role: Role): string {
    return (held.blind ? authTag : spaceTag)(key, this.#handshakeHash, role);
  }

  /** Tell the peer which spaces this node holds (again, after they changed). A peer on an older protocol was told all it gets. */
  announce(): void {
    if (this.#peerVersion !== null && !this.#speaks()) return;
    const tags = this.#access.spaces().flatMap((held) => held.keys.map((key) => this.#tag(held, key, this.#role)));
    this.#send({ t: 'hello', v: WIRE_VERSION, tags, ...(this.neg ? { features: ['neg'] } : {}) });
    // Spaces new here may be ones the peer already said it holds.
    if (this.#peerTags) this.#hello(this.#peerTags);
  }

  want(hashes: string[]): void {
    if (hashes.length && this.#admitted) this.#send({ t: 'want', hashes: hashes.slice(0, 256) });
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
      // One message a peer sends must never take the process down: what can't be handled is dropped.
      try {
        this.#handle(message);
      } catch {
        // ignore this message
      }
    }
  }

  #handle(message: Message2): void {
    // The first message tells the versions apart: v0.4 and later say hello first (with their protocol's number since 3), v0.3 sends its heads.
    if (this.#peerVersion === null) this.#peerVersion = message.t === 'hello' ? (Number.isSafeInteger(message.v) && message.v >= 2 ? message.v : 2) : 1;
    // What a peer on an older protocol sends never counts; v0.3 peers still get v1 logs and blobs, as they did.
    const v2 = this.#speaks();
    const serves = v2 || this.#peerVersion === 1;
    // Behind the firewall, a peer not let in is heard only saying hello; a v0.3 peer (heads first) proves nothing, ever.
    if (!this.#admitted && message.t !== 'hello') return this.#peerVersion === 1 ? this.close() : undefined;
    switch (message.t) {
      case 'hello': {
        if (this.#peerVersion === 1) break;
        const v = Number.isSafeInteger(message.v) && message.v >= 2 ? message.v : 2;
        if (v < WIRE_VERSION) {
          this.#tellOlder(Array.isArray(message.tags) ? message.tags : []);
          break;
        }
        // A newer peer's first hello is in its own protocol (its tags match nothing here); it then says hello in ours, as we do for older peers.
        if (v > WIRE_VERSION) this.#peerNewer = true;
        if (v2 && Array.isArray(message.tags)) {
          this.#peerNeg = this.neg && Array.isArray(message.features) && message.features.includes('neg');
          this.#hello(message.tags, v === WIRE_VERSION);
        }
        break;
      }
      case 'neg':
        if (v2 && this.neg && this.#shared.has(message.space) && typeof message.since === 'string' && Array.isArray(message.ranges)) {
          const until = typeof message.until === 'string' ? message.until : undefined;
          const step = reconcileStep(this.#reconItems(message.space, message.since, until, !!message.bare), expand(message.ranges).slice(0, 4096));
          // The side that started the exchange keeps saying so; replies come from the other side.
          if (step.reply.length) this.#send({ t: 'neg', space: message.space, since: message.since, ...(until ? { until } : {}), ...(message.bare ? { bare: true as const } : {}), ...(message.init ? {} : { init: true as const }), ranges: compact(step.reply) });
          // As with id lists, whoever asked fetches, by its own rules; the other side's turn is its own exchange.
          if (!message.init) this.#fetchLacking(message.space, step.lacking, !!message.bare);
        }
        break;
      case 'heads':
        if (serves && message.heads && typeof message.heads === 'object') {
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
          const ids = this.replica.store.inSpace2(message.space, message.since, until).filter(({ event }) => event.class === 'content' && this.#mayShow(message.space, event.author)).map(({ id }) => id);
          for (let i = 0; i < ids.length; i += MAX_IDS) this.#send({ t: 'have', space: message.space, ids: ids.slice(i, i + MAX_IDS), ...(message.bare ? { bare: true as const } : {}) });
        }
        break;
      case 'have':
        if (v2 && this.#shared.has(message.space) && Array.isArray(message.ids)) this.#fetchLacking(message.space, message.ids.filter((x): x is string => typeof x === 'string'), !!message.bare);
        break;
      case 'fetch':
        if (v2 && this.#shared.has(message.space) && Array.isArray(message.ids)) {
          const items: WireItemV2[] = [];
          for (const id of message.ids.slice(0, MAX_IDS)) {
            const record = typeof id === 'string' ? this.replica.record2(id) : undefined;
            // Only what belongs to the space asked about, which both hold.
            if (record && record.scope === message.space && isWireItemV2(record.wire) && this.#mayShow(message.space, record.wire.e.author)) items.push(message.bare ? { e: record.wire.e } : record.wire);
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
            if (!isWireItemV2(item)) continue;
            if (!this.#shared.has(item.e.space)) {
              // From a peer behind in a space, only a join the node accepts (one that came in before our newer key was
              // made), and only a few: someone behind may be someone removed.
              if (!this.#behind.has(item.e.space) || item.e.class !== 'control' || this.#takenFromBehind >= MAX_FROM_BEHIND || !this.#access.fromBehind?.(item)) continue;
              this.#takenFromBehind++;
            }
            // Marked as held by the peer before taking it, so accepting it doesn't echo it back.
            this.#notePeerHas(item);
            this.replica.ingest(item);
          }
        }
        break;
      case 'keeping?':
        if (v2 && Array.isArray(message.ids) && this.#access.keep) {
          const streams: Record<string, string[]> = {};
          const held: string[] = [];
          // An owner on a Weave with keepers sends what a stream lacks at every ask, and nothing is taken any more:
          // such an owner gets what we hold in our first answer on a connection (to take back what it lost) and not
          // again, so it has nothing to send over and over.
          const again = this.#keepAnswered && message.choice !== true;
          for (const id of message.ids.filter((x): x is string => typeof x === 'string').slice(0, MAX_KEEP_IDS)) {
            const tags = this.replica.store.keepTags(id);
            if (!tags.length) continue;
            held.push(id);
            if (!again) streams[id] = tags;
          }
          if (held.length) this.#access.keep.asked?.(this.#shared, held);
          this.#keepAnswered = true;
          this.#send({ t: 'keeping', streams });
        }
        break;
      case 'keeping':
        if (v2 && message.streams && typeof message.streams === 'object' && this.#access.keep) {
          const mine = new Map(this.#access.keep.streams(this.#shared).map((s) => [s.id, s]));
          // An answer nobody asked for would be matched to the wrong question: not taken.
          const asked = this.#keepAsked.shift();
          if (!asked) break;
          // What this answer was asked about and leaves out isn't held there (any more).
          for (const id of asked) if (!Object.hasOwn(message.streams, id)) this.#keepHeld.delete(id);
          let told = false;
          for (const [id, tags] of Object.entries(message.streams)) {
            const stream = mine.get(id);
            if (!stream || !Array.isArray(tags)) continue;
            const ours = new Set(stream.tags);
            const theirs = new Set(tags.filter((t): t is string => typeof t === 'string'));
            this.#keepHeld.set(id, theirs.size);
            // It holds what we don't: we lost it, it's ours to take back.
            if ([...theirs].some((t) => !ours.has(t))) this.#send({ t: 'kept?', id });
            // Our person decided that this copy goes, and nothing of it is ours to take back: it lets the stream go.
            // Never while we're missing something, and never without that decision.
            else if (stream.drop && theirs.size) {
              this.#send({ t: 'drop', id });
              told = true;
            }
          }
          // Where things stand is told once every part is answered: a part alone would say too little.
          if (!this.#keepAsked.length) {
            let held = 0;
            for (const [id, items] of this.#keepHeld) if (mine.has(id)) held += items;
            this.#access.keep.holds?.(this.#shared, held);
          }
          // Told to let go: asked once more, so the node knows that it did.
          if (told && !this.#keepConfirmed) {
            this.#keepConfirmed = true;
            this.#askKeepingSoon();
          }
        }
        break;
      case 'drop':
        // Only the owner can name a stream's id (it comes from their secret and our key): theirs to let go. Where the
        // node knows whose a stream is, nobody else's word lets it go.
        if (v2 && typeof message.id === 'string' && this.#access.keep && this.#access.keep.mayDrop?.(this.#shared, message.id) !== false) this.replica.store.keepDrop(message.id);
        break;
      case 'kept?':
        if (v2 && typeof message.id === 'string') {
          const items = this.replica.store.keepItems(message.id);
          for (let i = 0; i < items.length; i += BATCH) this.#send({ t: 'kept', id: message.id, items: items.slice(i, i + BATCH) });
        }
        break;
      case 'kept':
        if (v2 && typeof message.id === 'string' && Array.isArray(message.items) && this.#access.keep) {
          // What came back may show more to ask for (our own space lists our small spaces): asked again, but only when
          // something of it was new, so a keeper holding what we can't take isn't asked in a loop.
          if (this.#access.keep.take(message.id, message.items.filter((i) => i && typeof i.tag === 'string' && typeof i.data === 'string')) > 0) this.#askKeepingSoon();
        }
        break;
      case 'want':
        if (serves && Array.isArray(message.hashes) && this.blobs) {
          for (const hash of message.hashes.slice(0, 256)) {
            const data = typeof hash === 'string' ? this.blobs.get(hash) : undefined;
            if (data) this.#send({ t: 'blob', hash, data: Buffer.from(data).toString('base64url') });
          }
        }
        break;
      case 'blob':
        if (serves && typeof message.hash === 'string' && typeof message.data === 'string' && this.blobs) this.blobs.receive(message.hash, new Uint8Array(Buffer.from(message.data, 'base64url')));
        break;
    }
  }

  /**
   * A peer on an older protocol: it shares nothing with us (not even public) and
   * gets one thing, once: the node's farewell in each group and project it showed
   * a key of, so its person hears why nothing else comes. Served as that protocol
   * reads it: a hello of its version with role-less tags (so it takes the spaces
   * as shared), then the farewell events, signed without the fields it rejects.
   */
  #tellOlder(tags: unknown[]): void {
    this.#shared = new Set();
    this.#started.clear();
    if (this.#toldOlder) return;
    this.#toldOlder = true;
    const held = this.#access.spaces().filter((h) => !h.blind); // the older tags need the key itself
    this.#send({ t: 'hello', v: 2, tags: held.flatMap(({ keys }) => keys.map((key) => legacyTag(key, this.#handshakeHash))) });
    const theirs = new Set(tags.filter((t): t is string => typeof t === 'string'));
    const shown = new Set(held.filter(({ keys }) => keys.some((key) => theirs.has(legacyTag(key, this.#handshakeHash)))).map((h) => h.space));
    const items = (this.#access.farewells?.() ?? []).filter((item) => shown.has(item.e.space));
    for (let i = 0; i < items.length; i += BATCH) this.#send({ t: 'items', items: items.slice(i, i + BATCH) });
  }

  /**
   * The peer's spaces: start syncing those newly shared. Behind the firewall, the first hello (in our protocol) that
   * shows something admitting lets the peer in; one that shows nothing closes the connection (`final`: not for a
   * newer peer's first hello, in its own protocol, nor for our own spaces changing).
   */
  #hello(tags: unknown[], final = false): void {
    this.#peerTags = tags;
    const theirs = new Set(tags.filter((t): t is string => typeof t === 'string'));
    const shared = new Set(['public']);
    const behind = new Set<string>();
    const startedWith = new Map<string, string>([['public', '']]);
    let admits = false;
    for (const held of this.#access.spaces()) {
      const { space, keys, proof, admits: lets } = held;
      // The peer's tags are made as the other end: our own tags, echoed back, match nothing here.
      const theirTag = (key: Uint8Array) => this.#tag(held, key, this.#peerRole);
      const [current, ...earlier] = keys;
      const now = !!current && theirs.has(theirTag(current));
      const before = !now && earlier.some((key) => theirs.has(theirTag(key)));
      if ((now || before) && lets !== false) admits = true;
      // A proof is only that: nothing of it is synced.
      if (proof) continue;
      if (keys[0]) startedWith.set(space, theirTag(keys[0]));
      if (now) shared.add(space);
      else if (before) behind.add(space);
    }
    if (!this.#admitted) {
      if (!admits) {
        if (final) this.close();
        return;
      }
      this.#admitted = true;
      this.#publicOk = this.#access.publicFor?.(shared) ?? (() => true);
      this.#welcome();
    }
    // Whose public events it gets follows what it shares: more shared, more to compare again (and v1 logs to send).
    const sharedBefore = [...this.#shared].sort().join(',');
    this.#shared = shared;
    if (this.#access.publicFor && [...shared].sort().join(',') !== sharedBefore) {
      this.#publicOk = this.#access.publicFor(shared) ?? (() => true);
      this.#started.delete('public');
      if (this.#peerHeads.size) this.#sendMissingV1();
    }
    for (const space of behind) {
      if (this.#behind.has(space)) continue;
      this.#sendKeys(space);
      this.#askChains(space);
    }
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

  /** Ask the peer what it still holds of our streams (it answers only for those it holds). */
  #askKeeping(): void {
    const streams = this.#access.keep?.streams(this.#shared) ?? [];
    // A keeper reads so many ids per question: asked in parts, the streams with something in them first.
    const ids = [...streams.filter((s) => s.tags.length), ...streams.filter((s) => !s.tags.length)].map((s) => s.id);
    for (let i = 0; i < ids.length; i += MAX_KEEP_IDS) {
      const part = ids.slice(i, i + MAX_KEEP_IDS);
      this.#keepAsked.push(part);
      this.#send({ t: 'keeping?', ids: part, choice: true });
    }
    // A peer that never answers doesn't make this grow.
    if (this.#keepAsked.length > 64) this.#keepAsked.splice(0, this.#keepAsked.length - 64);
  }

  #askKeepingSoon(): void {
    if (this.#keepSoon || !this.#speaks() || !this.#access.keep) return;
    this.#keepSoon = setTimeout(() => {
      this.#keepSoon = undefined;
      this.#askKeeping();
    }, 500);
    this.#keepSoon.unref?.();
  }

  #startSpace(space: string): void {
    let newest = '';
    for (const { event } of this.replica.store.inSpace2(space)) if (event.class === 'content' && event.time > newest) newest = event.time;
    this.#askChains(space);
    const pulled = this.#access.spaces().find((h) => h.space === space)?.pulled;
    if (pulled) {
      // Bodies for the recent window; envelopes of the rest (with the bodies this node keeps).
      this.#syncRange(space, new Date(Date.now() - pulled.windowMs).toISOString(), undefined, false);
      this.#syncRange(space, '', undefined, true);
      return;
    }
    // By ranges, everything costs only its differences; by id lists, the last week (or all, for a newcomer).
    const since = this.#peerNeg || !newest ? '' : new Date(Date.parse(newest) - RECENT_MS).toISOString();
    this.#syncRange(space, since, undefined, false);
  }

  /**
   * Ask the peer for a space's control events we lack. Also of a peer behind in it: someone who joined just before we
   * made a newer key holds only the older one, and their join must reach us before they can get the newer one.
   */
  #askChains(space: string): void {
    const heads: Record<string, number> = {};
    for (const { event } of this.replica.store.inSpace2(space)) if (event.class === 'control') heads[event.signer] = Math.max(heads[event.signer] ?? 0, event.seq);
    this.#send({ t: 'chains', space, heads });
  }

  /** Ask the peer for a space's content between two times, bodies included ("load older"). */
  fetchRange(space: string, since: string, until: string): void {
    if (this.#shared.has(space)) this.#syncRange(space, since, until, false);
  }

  /** Compare a stretch of a space with the peer: by ranges if it can, else by id lists. */
  #syncRange(space: string, since: string, until: string | undefined, bare: boolean): void {
    const context = { space, since, ...(until ? { until } : {}), ...(bare ? { bare: true as const } : {}) };
    if (this.#peerNeg) this.#send({ t: 'neg', ...context, init: true, ranges: compact(openRanges(this.#reconItems(space, since, until, bare))) });
    else this.#send({ t: 'sync', ...context });
  }

  /** What a stretch of a space holds, for reconciling: events with their bodies, or (bare) every envelope. */
  #reconItems(space: string, since: string, until: string | undefined, bare: boolean): ReconItem[] {
    return this.replica.store
      .inSpace2(space, since, until)
      .filter(({ event }) => event.class === 'content' && this.#mayShow(space, event.author) && (bare || this.replica.store.body(event.body) !== undefined))
      .map(({ id, event }) => ({ key: reconKey(event.time, id), id }))
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  }

  /** Ids the peer holds and we may lack: fetch the events (with bodies where we keep them), not what we forgot on purpose. */
  #fetchLacking(space: string, ids: string[], bare: boolean): void {
    const full: string[] = [];
    const envelopes: string[] = [];
    for (const id of ids) {
      this.#peerHas.add(id);
      const held = this.replica.store.get2(id);
      const bodyLacking = !held || (held.event.class === 'content' && this.replica.store.body(held.event.body) === undefined && !this.replica.store.forgotten(held.event.body));
      const wanted = !bare || this.#access.wantsBody?.(space, id) !== false;
      if (bodyLacking && wanted) full.push(id);
      else if (!held) envelopes.push(id);
    }
    for (let i = 0; i < full.length; i += MAX_IDS) this.#send({ t: 'fetch', space, ids: full.slice(i, i + MAX_IDS) });
    for (let i = 0; i < envelopes.length; i += MAX_IDS) this.#send({ t: 'fetch', space, ids: envelopes.slice(i, i + MAX_IDS), bare: true });
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
    return this.#access.spaces().some((held) => held.space === space && held.keys.some((key) => theirs.has(this.#tag(held, key, this.#peerRole))));
  }

  /** Control events of a space the peer lacks, in chain order per signer. */
  #sendChains(space: string, theirs: Record<string, unknown>): void {
    const items: WireItemV2[] = [];
    const control = this.replica.store.inSpace2(space).filter(({ event }) => event.class === 'control' && this.#mayShow(space, event.author));
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

  /** New v2 events: to the peer if it shares their space and doesn't have them yet (a peer on an older protocol shares none). */
  #offer(items: WireItemV2[]): void {
    if (this.#peerVersion !== null && !this.#speaks()) return;
    this.#sendItems(items.filter((item) => this.#shared.has(item.e.space) && this.#mayShow(item.e.space, item.e.author)));
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

  /**
   * Keys whose v1 logs travel: those that never wrote v2 (frozen history), root keys (the identity foundation), and
   * keys that signed their v1 events again as v2 (`was`): a node takes those only with the v1 original, so one that
   * came after v0.4 needs it too (E and Liane, 2.11.2026: a profile from before v0.4 never showed for them).
   */
  #sendsV1(signer: Did): boolean {
    return this.#peerVersion === 1 || this.replica.store.number2(signer) === 0 || !this.replica.authority.grant(signer) || this.replica.store.range(signer, 1, 1).length > 0;
  }

  #v1Heads(): Record<string, number> {
    const heads: Record<string, number> = {};
    for (const [signer, seq] of Object.entries(this.replica.heads())) if (this.#sendsV1(signer as Did) && this.#publicOk(this.replica.authority.personOf(signer as Did))) heads[signer] = seq;
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
    if (!this.#sendsV1(event.signer) || !this.#publicOk(this.replica.authority.personOf(event.signer)) || (this.#peerHeads.get(event.signer) ?? 0) >= event.seq) return;
    this.#send({ t: 'events', events: [event] });
    this.#peerHeads.set(event.signer, event.seq);
  }
}
