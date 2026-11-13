import { createHash } from 'node:crypto';
import { join as joinPath } from 'node:path';
import { type Did, type EventV2, type Json, type WeaveRecord, isWireItemV2, keepStreamId, keepTag, keepWrapKey, parseScope, rank, rekey, spaceScope, unwrapFromKeeper } from '@weave/core';
import { type KeepAccess } from '@weave/net';
import { type KeeperFriend, type KeepersInfo, type PostInfo } from './backend.ts';
import { CARRIED_STATE, DAY_MS, KIND_NODE_INDEX, RECENT_HOLD_MS, SELF_SCOPE } from './shared.ts';
import { type StoredSpace } from './spacestore.ts';
import { readSecretJson, writeSecretJson } from './vault.ts';
import type { Board, EventFields, Inner, SessionStamp, SpaceKeys, SpaceKind, SpaceState } from '@weave/core';
import type { SwarmNode } from '@weave/net';
import type { Actor } from './backend.ts';
import type { Companies } from './companies.ts';
import type { ManagedKeys } from './managed.ts';
import type { Decoded, WeaveNode } from './node.ts';

/*
 * Who holds what (stages 4, 5 and 8): which spaces this node keeps whole and
 * which it pulls only part of, the copies friends hold of small spaces from
 * before (keepers, taken out on 6.11.2026 and wound down here), fetching older
 * history on request, and the budgets that hold back what peers write too fast. It sees the node's internals only through
 * HoldingCore; the node delegates the Backend methods to it.
 */

/** What you opened (id → when) and the stretches of time you asked members for. */
interface KeptState {
  ids: Record<string, string>;
  ranges: Array<{ space: string; since: string; until: string; at: string }>;
}

const KEEP_READ_MS = 30 * 24 * 3600 * 1000;

const SHARE_HOLDERS = 3;

/** Up to which size a group or project counted as small: friends kept copies of those (stage 5, until 6.11.2026). */
const KEPT_UP_TO = 3;

/** How often at most what a meeting tells us is written to disk (every connection would be too often). */
const SAVE_AT_MOST_MS = 3600 * 1000;

/** A stream kept here that nobody asked about for this long is let go: its owner's node asks at every contact, so only what was abandoned ages out. */
const KEEP_GRACE_DAYS = 365;

/** A stream whose year is over goes at a later look, this many days on: never at the first look after a long time away. */
const KEEP_PURGE_WAIT_DAYS = 7;

/** Our small spaces and their keys, in our own space. */
const KIND_KEEP_INDEX = 'weave.keep.index';

/** Where the copies from before stand: what friends hold of ours, and what we hold of theirs. */
interface KeepState {
  /** Written by a Weave with keepers: the spaces it had kept, and by whom. Read for who may hold a copy, never written to. */
  spaces: Record<string, Did[]>;
  /** Hash of the last keep index written. */
  index: string;
  /**
   * People told to let go of what they hold of ours (when). Not a standing order: done once they answer that they
   * hold nothing.
   */
  off: Record<string, string>;
  /** When this person last said that every copy friends hold goes. */
  letGo?: string;
  /** Friends a Weave with keepers chose, not asked since: they may still hold a copy. */
  before: Did[];
  /** What each one said it holds of our streams (items in all), and when. */
  holds: Record<string, { items: number; at: string }>;
  /** Streams kept here for others: whose it is (once they asked about it), when it was last asked about, and since when its year is over. */
  streams: Record<string, { from?: Did; asked: string; due?: string }>;
  /** When this node last looked for streams to let go: time it didn't run doesn't count towards a stream's year. */
  looked?: string;
}

/** Stage 8: live content per author per space and hour, by how far this node trusts them there. */
const BUDGETS = {
  trusted: { events: 1200, bytes: 10 * 1024 * 1024 },
  member: { events: 300, bytes: 2 * 1024 * 1024 },
  newcomer: { events: 60, bytes: 512 * 1024 },
};

/** What Holding needs of the node's internals, and nothing more (the node builds it in its constructor). */
export interface HoldingCore {
  actor(author: Did, signer: Did, session?: SessionStamp): Actor;
  addSpace(space: StoredSpace): Promise<void>;
  readonly companies: Companies;
  /** Decoded views go stale: keys came or went. */
  invalidateDecoded(): void;
  decodedIn(spaceId: string): Decoded[];
  readonly directs: Map<string, { space: StoredSpace; peer: Did }>;
  ensureDirects(): void;
  follows(space: string, board: string, said?: Map<string, boolean>): boolean;
  friends(): Did[];
  held(state: SpaceState): boolean;
  readonly isLinkedNode: boolean;
  /** An always-on node or a linked browser: it takes its spaces from the node index its person's computers write. */
  readonly readsNodeIndex: boolean;
  keysOnly(space: StoredSpace): SpaceKeys;
  readonly managed: ManagedKeys;
  managers(state: SpaceState): Set<Did>;
  /** A person by name, id or url. */
  resolve(who: string): Did;
  sealForSelf(inner: Inner): EventFields;
  selfBodies(kind: string): Array<Record<string, unknown>>;
  selfSecret(): Uint8Array;
  space(ref: string, kind?: SpaceKind): StoredSpace;
  spaceName(space: StoredSpace): string;
  spacePosts(space: StoredSpace): { posts: PostInfo[]; boards: Board[] };
  readonly spaces: Map<string, StoredSpace>;
  state(space: StoredSpace): SpaceState;
  readonly swarm: SwarmNode | undefined;
}

export class Holding {
  private readonly node: WeaveNode;
  private readonly core: HoldingCore;

  constructor(node: WeaveNode, core: HoldingCore) {
    this.node = node;
    this.core = core;
  }

  // ---------------------------------------------------------------- budgets (stage 8)

  heldBack = 0;
  /** Off for tools that load whole histories as if live (the benchmark). */
  budgets = true;

  /**
   * An author's budget for live content in a space, as this node sees them
   * (docs/v2-stage8.md): no limit for those who manage it (and ourselves); a
   * lot for long-time members and our friends; less for newer members; little
   * for strangers.
   */
  #budgetOf(author: Did, scope: string): { events: number; bytes: number } | undefined {
    if (author === this.node.identity.author) return undefined;
    const now = this.node.clock();
    const friend = this.core.friends().includes(author);
    const id = parseScope(scope)?.id;
    const space = id ? this.core.spaces.get(id) : undefined;
    if (space) {
      const state = this.core.state(space);
      if (this.core.managers(state).has(author)) return undefined;
      const since = Date.parse(state.members.get(author)?.since ?? '') || now;
      if (friend || now - since >= 30 * DAY_MS) return BUDGETS.trusted;
      if (now - since >= DAY_MS) return BUDGETS.member;
      return BUDGETS.newcomer;
    }
    // Direct chats: between two people; public: friends, or strangers.
    if (id && this.core.directs.has(id)) return undefined;
    return friend ? BUDGETS.trusted : BUDGETS.newcomer;
  }

  /** Over budget? Counted from what this node holds of the author's live content in that space (the last hour). */
  admit = (event: EventV2, body: Json | undefined): string | undefined => {
    const refused = this.core.companies.policyRefuses(event, body);
    if (refused) return refused;
    if (!this.budgets || event.class !== 'content') return undefined; // control is never held back: nothing may block a rekey
    const hourAgo = this.node.clock() - 3_600_000;
    if (Date.parse(event.time) < hourAgo) return undefined; // history, not live
    const budget = this.#budgetOf(event.author, event.space);
    if (!budget) return undefined;
    let events = 1;
    let bytes = body === undefined ? 0 : JSON.stringify(body).length;
    for (const { event: e } of this.node.replica.store.inSpace2(event.space, new Date(hourAgo).toISOString())) {
      if (e.author !== event.author || e.class !== 'content') continue;
      events++;
      const held = this.node.replica.store.body(e.body);
      if (held !== undefined) bytes += JSON.stringify(held).length;
    }
    if (events <= budget.events && bytes <= budget.bytes) return undefined;
    this.heldBack++;
    return 'over budget';
  };

  // ---------------------------------------------------------------- copies from before (keepers, stage 5; taken out 6.11.2026)

  /*
   * Until 6.11.2026 friends kept wrapped copies of each other's small spaces (keepers). That is over: a person saves
   * their own Weave as a backup file (backupfile.ts), and nothing new is ever kept for or sent to a friend. What is
   * left here winds the old copies down without costing anyone their only copy: a node still gives back what it
   * holds, an owner can take theirs back and tell friends to let go, a keeper can let go, and what nobody asks about
   * for a year goes by itself.
   */

  #keepState?: KeepState;

  /** Where the copies from before stand (sealed at rest). */
  get #keeping(): KeepState {
    if (!this.#keepState) {
      const stored = readSecretJson<Partial<KeepState>>(this.node.home, joinPath(this.node.home.dir, 'keepers.json'));
      this.#keepState = {
        spaces: stored?.spaces ?? {},
        index: stored?.index ?? '',
        off: stored?.off ?? {},
        ...(stored?.letGo ? { letGo: stored.letGo } : {}),
        // A file a Weave with keepers wrote: those it chose then may still hold copies.
        before: stored?.before ?? [...new Set(Object.values(stored?.spaces ?? {}).flat())],
        holds: stored?.holds ?? {},
        streams: stored?.streams ?? {},
        ...(stored?.looked ? { looked: stored.looked } : {}),
      };
    }
    return this.#keepState;
  }

  #saveKeeping(): void {
    writeSecretJson(this.node.home, joinPath(this.node.home.dir, 'keepers.json'), this.#keeping);
  }

  /**
   * The spaces friends kept copies of: our own space, direct chats, and groups and projects of 3 people or fewer. A
   * direct chat is derived for everyone whose log we hold (kernel.ts ensureDirects), also one with nothing in it: a
   * chat we lost looks the same, and its stream is how it comes back.
   */
  #keptSpaces(): Array<{ scope: string; space?: StoredSpace }> {
    this.core.ensureDirects();
    return [
      { scope: SELF_SCOPE },
      ...[...this.core.directs.values()].map(({ space }) => ({ scope: spaceScope(space), space })),
      // A company's spaces were kept by its own archive, never by friends (stage 13).
      ...[...this.core.spaces.values()].filter((s) => (s.kind === 'group' || s.kind === 'project') && this.core.state(s).members.size <= KEPT_UP_TO && !this.core.managed.managedRaw(s).setting).map((space) => ({ scope: spaceScope(space), space })),
    ];
  }

  /** Who is at the other end of a connection: the one whose direct chat it shares, a friend or not. */
  #peerOn(shared: ReadonlySet<string>): Did | undefined {
    // One of our own computers shares all our direct chats, and our own space: nobody who keeps anything of ours.
    if (shared.has(SELF_SCOPE)) return undefined;
    let other: Did | undefined;
    for (const scope of shared) {
      if (!scope.startsWith('direct:')) continue;
      const peer = this.core.directs.get(scope.slice('direct:'.length))?.peer;
      if (peer && this.core.friends().includes(peer)) return peer;
      other ??= peer;
    }
    return other;
  }

  /** Does this person hold, or may they hold, something of ours? What they said when last asked; before that, whether a Weave with keepers chose them. */
  #mayHold(did: Did): boolean {
    const holds = this.#keeping.holds[did];
    return holds ? holds.items > 0 : this.#keeping.before.includes(did);
  }

  /** A space's events as keepers got them, by tag. */
  #keepItems(scope: string): Map<string, WeaveRecord> {
    const key = keepWrapKey(this.core.selfSecret(), scope);
    return new Map(this.node.replica.events((r) => r.scope === scope).map((r) => [keepTag(key, r.id), r]));
  }

  /**
   * Every space a friend may hold a copy of: those above, and those a Weave with keepers wrote down that aren't kept
   * spaces any more (a group that grew). A space gone from this node altogether is forgotten here: nothing of it to
   * compare, so nothing to ask.
   */
  #keptScopes(): string[] {
    const state = this.#keeping;
    const scopes = new Set(this.#keptSpaces().map((k) => k.scope));
    for (const scope of Object.keys(state.spaces)) {
      const id = parseScope(scope)?.id;
      if (scope === SELF_SCOPE || (id && (this.core.spaces.has(id) || this.core.directs.has(id)))) scopes.add(scope);
      else {
        delete state.spaces[scope];
        this.#saveKeeping();
      }
    }
    return [...scopes];
  }

  keepAccess: KeepAccess = {
    streams: (shared) => {
      const peer = this.#peerOn(shared);
      if (!peer) return [];
      const state = this.#keeping;
      const told = !!state.off[peer];
      // A friend is asked until they said they hold nothing of ours (someone who just restored doesn't know who
      // does); someone no longer a friend only while they may hold something. Whoever was told to let go, until they did.
      const ask = told || (this.core.friends().includes(peer) ? !state.holds[peer] || state.holds[peer].items > 0 : this.#mayHold(peer));
      if (!ask) return [];
      // `drop`: our person decided that what this one holds goes. Otherwise they're only asked, and what they hold
      // stays where it is: nothing is let go without a decision.
      return this.#keptScopes().map((scope) => ({ id: keepStreamId(this.core.selfSecret(), scope, peer), tags: [...this.#keepItems(scope).keys()], drop: told }));
    },
    take: (id, items) => {
      const found = this.#streamScope(id);
      if (!found) return 0;
      const key = keepWrapKey(this.core.selfSecret(), found);
      let taken = 0;
      for (const { data } of items) {
        const wire = unwrapFromKeeper(key, data);
        if (wire !== undefined && this.node.replica.ingest(wire).status === 'accepted') taken++;
      }
      // Nothing new (or nothing that unwraps): nothing to decode again.
      if (!taken) return 0;
      // What came back may be our keep index: take the spaces it lists.
      this.core.invalidateDecoded();
      this.recoverSpaces();
      return taken;
    },
    mayDrop: (shared, id) => {
      const from = this.#keeping.streams[id]?.from;
      return !from || from === this.#peerOn(shared);
    },
    asked: (shared, ids) => {
      const state = this.#keeping;
      const peer = this.#peerOn(shared);
      const now = this.node.clock();
      let save = false;
      for (const id of ids) {
        const known = state.streams[id];
        const from = peer ?? known?.from;
        const before = Date.parse(known?.asked ?? '');
        if (Number.isNaN(before) || now - before >= SAVE_AT_MOST_MS || known?.from !== from) save = true;
        state.streams[id] = { ...(from ? { from } : {}), asked: new Date(now).toISOString() };
      }
      if (save) this.#saveKeeping();
    },
    holds: (shared, items) => {
      const peer = this.#peerOn(shared);
      if (!peer) return;
      const state = this.#keeping;
      const now = this.node.clock();
      const known = state.holds[peer];
      const was = state.before.includes(peer);
      state.holds[peer] = { items, at: new Date(now).toISOString() };
      if (was) state.before = state.before.filter((d) => d !== peer);
      // Told to let go, and it holds nothing of ours: done.
      const done = !!state.off[peer] && items === 0;
      if (done) delete state.off[peer];
      if (was || done || !known || known.items !== items || now - Date.parse(known.at) >= SAVE_AT_MOST_MS) this.#saveKeeping();
    },
  };

  /** The space a stream of ours is of, whoever holds it. */
  #streamScope(id: string): string | undefined {
    const state = this.#keeping;
    const people = new Set<Did>([...this.core.friends(), ...(Object.keys({ ...state.holds, ...state.off }) as Did[]), ...state.before]);
    for (const scope of this.#keptScopes()) for (const person of people) if (keepStreamId(this.core.selfSecret(), scope, person) === id) return scope;
    return undefined;
  }

  /**
   * Our small spaces and their keys, in our own space, written when they change. It was made so that a self stream
   * coming back from a keeper brings the spaces' keys with it; that is still how a copy from before is taken back, and
   * our other computers take spaces from it too.
   */
  writeKeepIndex(): number {
    const spaces = this.#keptSpaces().flatMap(({ space }) => (space && !this.core.directs.has(space.id) ? [space] : []));
    // A device that just came (a restore, a browser from the words) has none yet: its empty list would be the latest, and
    // hide the list it is to take its spaces from. It writes once it has some.
    if (!spaces.length && !this.#keeping.index && this.core.selfBodies(KIND_KEEP_INDEX).length) return 0;
    const body = { spaces: spaces.map((s) => ({ ...this.core.keysOnly(s), ...(s.boards ? { boards: s.boards } : {}), ...(s.shredded ? { shredded: s.shredded } : {}) })) };
    const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    if (hash === this.#keeping.index) return 0;
    this.node.replica.write(this.node.identity, this.core.sealForSelf({ kind: KIND_KEEP_INDEX, body: body as unknown as Json }));
    this.#keeping.index = hash;
    this.#saveKeeping();
    return 1;
  }

  /** Spaces our latest keep index (and, on an always-on node, node index) lists that this node doesn't have. */
  recoverSpaces(): void {
    const lists = [this.core.selfBodies(KIND_KEEP_INDEX).at(-1), ...(this.core.readsNodeIndex ? [this.core.selfBodies(KIND_NODE_INDEX).at(-1)] : [])] as Array<{ spaces?: unknown } | undefined>;
    for (const index of lists) if (Array.isArray(index?.spaces)) this.#adoptSpaces(index.spaces as StoredSpace[]);
  }

  #adoptSpaces(spaces: StoredSpace[]): void {
    for (const space of spaces) {
      if (!space || typeof space.id !== 'string' || this.core.spaces.has(space.id)) continue;
      void this.core.addSpace({ ...space, entry: { topics: [this.node.identity.author], bootstrap: [] } });
    }
  }

  async keepers(): Promise<KeepersInfo> {
    const state = this.#keeping;
    const store = this.node.replica.store;
    // What is kept here, by whose it is (known once its owner asked about it).
    const kept = new Map<Did, { bytes: number; asked: string }>();
    let unknown = 0;
    for (const id of store.keepStreams()) {
      const bytes = store.keepBytes(id);
      const stream = state.streams[id];
      if (!stream?.from) unknown += bytes;
      else {
        const sum = kept.get(stream.from);
        kept.set(stream.from, { bytes: (sum?.bytes ?? 0) + bytes, asked: sum && sum.asked > stream.asked ? sum.asked : stream.asked });
      }
    }
    const friends = this.core.friends();
    // Everyone who still plays a part: who holds (or may hold) a copy of ours, who was told to let go, whose copies are here.
    const people = [...new Set<Did>([...(Object.keys({ ...state.holds, ...state.off }) as Did[]), ...state.before, ...kept.keys()])].filter((did) => kept.has(did) || state.off[did] || this.#mayHold(did));
    return {
      spaces: [],
      friends: people.map((did): KeeperFriend => {
        const holds = state.holds[did];
        return {
          who: this.core.actor(did, did),
          ...(friends.includes(did) ? {} : { gone: true as const }),
          ...(holds ? { holds } : {}),
          ...(state.before.includes(did) ? { before: true as const } : {}),
          ...(state.off[did] ? { lettingGo: true as const } : {}),
          ...(kept.has(did) ? { kept: kept.get(did)! } : {}),
        };
      }),
      ...(state.letGo ? { letGo: state.letGo } : {}),
      forOthers: store.keepBytes(),
      forUnknown: unknown,
      quota: 0,
      graceDays: KEEP_GRACE_DAYS,
    };
  }

  /**
   * The copies of ours that friends hold from before go: every one of them, or one person's. Each is told when next
   * met, once we hold all it has. Told once, not for good: whoever answers that they hold nothing is done with.
   */
  async letCopiesGo(input: { who?: string } = {}): Promise<KeepersInfo> {
    const state = this.#keeping;
    const now = new Date(this.node.clock()).toISOString();
    const one = input.who ? this.core.resolve(input.who) : undefined;
    // Everyone who holds a copy as far as this node knows (those it lists); someone it hasn't asked yet shows up when
    // they meet, and is this person's to decide about then.
    for (const did of one ? [one] : new Set<Did>([...(Object.keys(state.holds) as Did[]), ...state.before])) {
      // Asked before and holding nothing: nothing to tell them.
      if (one ? state.holds[did] && !this.#mayHold(did) : !this.#mayHold(did)) continue;
      state.off[did] = now;
    }
    if (!one) state.letGo = now;
    this.#saveKeeping();
    return this.keepers();
  }

  /** As a keeper: let go of what is kept here, of one person or of everyone. It may be their only copy: theirs to save first. */
  async dropKept(input: { who?: string } = {}): Promise<KeepersInfo> {
    const did = input.who ? this.core.resolve(input.who) : undefined;
    const state = this.#keeping;
    for (const id of this.node.replica.store.keepStreams()) {
      if (did && state.streams[id]?.from !== did) continue;
      this.node.replica.store.keepDrop(id);
      delete state.streams[id];
    }
    this.#saveKeeping();
    return this.keepers();
  }

  /**
   * As a keeper: let go of streams nobody asked about for a year. An owner's node asks whenever it meets us, so these
   * are of accounts that are gone. A stream first seen here (kept before this was counted) starts its year now. Only
   * time this node ran counts: after more than a day away (switched off, or a clock that jumped) every stream's year
   * is moved on by that time, since nobody could have asked. And a stream whose year is over goes a week later, at
   * another look, so its owner still finds it when both are back.
   */
  purgeKept(): number {
    const state = this.#keeping;
    const store = this.node.replica.store;
    const now = this.node.clock();
    const held = new Set(store.keepStreams());
    // Nothing kept here and nothing written down: nothing to look after (most computers, from now on).
    if (!held.size && !Object.keys(state.streams).length) return 0;
    const looked = Date.parse(state.looked ?? '');
    const away = !Number.isNaN(looked) && now - looked > DAY_MS ? now - looked : 0;
    let purged = 0;
    let save = away > 0 || Number.isNaN(looked) || now - looked >= SAVE_AT_MOST_MS || now < looked;
    if (save) state.looked = new Date(now).toISOString();
    const later = (time: string) => new Date(Date.parse(time) + away).toISOString();
    for (const id of held) {
      const stream = state.streams[id];
      if (!stream || Number.isNaN(Date.parse(stream.asked))) {
        state.streams[id] = { ...stream, asked: new Date(now).toISOString() };
        save = true;
        continue;
      }
      if (away) {
        stream.asked = later(stream.asked);
        if (stream.due) stream.due = later(stream.due);
      }
      if (now - Date.parse(stream.asked) <= KEEP_GRACE_DAYS * DAY_MS) continue;
      if (!stream.due) {
        stream.due = new Date(now).toISOString();
        save = true;
      } else if (now - Date.parse(stream.due) >= KEEP_PURGE_WAIT_DAYS * DAY_MS) {
        store.keepDrop(id);
        delete state.streams[id];
        purged++;
      }
    }
    // Streams their owner took back (`drop`) leave no trace here.
    for (const id of Object.keys(state.streams)) {
      if (held.has(id)) continue;
      delete state.streams[id];
      save = true;
    }
    if (purged || save) this.#saveKeeping();
    return purged;
  }

  // ---------------------------------------------------------------- who holds what (stage 4)

  /** Above this many members, a community's or project's content is held by its members between them. */
  pulledAbove = 12;

  /** Is this space held by its members between them (and not ours: owners hold all of theirs)? */
  pulled(space: StoredSpace, state = this.core.state(space)): boolean {
    return (space.kind === 'community' || space.kind === 'project') && state.members.size > this.pulledAbove && state.founder !== this.node.identity.author && !this.node.config.archive && !this.core.held(state);
  }

  /** The 3 members who hold an event by share: the lowest H(id ‖ member). Nobody coordinates, everyone computes the same. */
  #share(id: string, members: Did[]): Did[] {
    const rank = (did: Did) => createHash('sha256').update(`weave/share/v1:${id}:${did}`).digest('hex');
    return [...members].sort((a, b) => rank(a).localeCompare(rank(b))).slice(0, SHARE_HOLDERS);
  }

  #keptState?: KeptState;

  /** What this node keeps because its person opened or asked for it (sealed at rest: it says what they read). */
  get kept() {
    if (!this.#keptState) {
      const stored = readSecretJson<KeptState>(this.node.home, joinPath(this.node.home.dir, 'kept.json'));
      this.#keptState = { ids: stored?.ids ?? {}, ranges: stored?.ranges ?? [] };
    }
    return this.#keptState;
  }

  saveKept(): void {
    const since = new Date(this.node.clock() - KEEP_READ_MS).toISOString();
    const kept = this.kept;
    for (const [id, at] of Object.entries(kept.ids)) if (at < since) delete kept.ids[id];
    kept.ranges = kept.ranges.filter((r) => r.at >= since);
    writeSecretJson(this.node.home, joinPath(this.node.home.dir, 'kept.json'), kept);
  }

  /** Opened or asked for in the last 30 days. */
  #isKept(space: StoredSpace, id: string, time: string): boolean {
    const since = new Date(this.node.clock() - KEEP_READ_MS).toISOString();
    const kept = this.kept;
    if ((kept.ids[id] ?? '') >= since) return true;
    return kept.ranges.some((r) => r.space === space.id && r.at >= since && time >= r.since && time < r.until);
  }

  /** In a pulled space: do we keep this event's body? Our share, or something we keep. */
  wantsBody(scope: string, id: string): boolean {
    const space = this.core.spaces.get(parseScope(scope)?.id ?? '');
    if (!space) return true;
    const state = this.core.state(space);
    if (!this.pulled(space, state)) return true;
    return this.#share(id, [...state.members.keys()]).includes(this.node.identity.author) || (this.kept.ids[id] ?? '') >= new Date(this.node.clock() - KEEP_READ_MS).toISOString();
  }

  async fetchOlder(input: { space: string; before?: string }): Promise<{ since: string; until: string }> {
    const space = this.core.space(input.space);
    const oldest = this.core.decodedIn(space.id).reduce((a, d) => (d.event.time < a ? d.event.time : a), new Date(this.node.clock()).toISOString());
    const until = input.before ?? oldest;
    if (Number.isNaN(Date.parse(until))) throw new Error('before is a date, e.g. 2026-09-01');
    const since = new Date(Date.parse(until) - KEEP_READ_MS).toISOString();
    this.kept.ranges.push({ space: space.id, since, until, at: new Date(this.node.clock()).toISOString() });
    this.saveKept();
    this.core.swarm?.fetchRange(spaceScope(space), since, until);
    return { since, until };
  }

  /**
   * In pulled spaces: let go of the bodies we don't hold (see docs/v2-stage4.md):
   * not recent, not ours, not kept (upvoted, saved, opened, followed board),
   * not core (pinned, issues, proposals, releases, the page), not our share.
   * The envelopes stay, and the bodies can be fetched again.
   */
  release(): number {
    const me = this.node.identity.author;
    const recent = new Date(this.node.clock() - RECENT_HOLD_MS).toISOString();
    let released = 0;
    for (const space of [...this.core.spaces.values()]) {
      const state = this.core.state(space);
      if (!this.pulled(space, state)) continue;
      const members = [...state.members.keys()];
      const posts = new Map(this.core.spacePosts(space).posts.map((p) => [p.id, p]));
      const held = (p: PostInfo) =>
        p.by.did === me ||
        (!!p.lifetime && 'forever' in p.lifetime && p.lifetime.forever !== 'no-rule') ||
        p.pinned ||
        p.active >= recent ||
        p.myVote === 1 ||
        !!p.saved ||
        (space.kind === 'project' && !!p.board && this.core.follows(space.id, p.board)) ||
        this.#isKept(space, p.id, p.time) ||
        this.#share(p.id, members).includes(me);
      for (const d of this.core.decodedIn(space.id)) {
        if (d.carried || d.event.author === me || d.event.class !== 'content' || CARRIED_STATE.has(d.inner.kind)) continue;
        const body = d.inner.body as { post?: unknown; target?: unknown } | null;
        const anchor = posts.get(d.id) ?? posts.get(String(body?.post ?? body?.target ?? ''));
        const keep = anchor ? held(anchor) : d.event.time >= recent || this.#isKept(space, d.id, d.event.time);
        if (keep || this.#share(d.id, members).includes(me)) continue;
        if (!isWireItemV2(d.event.wire) || d.event.missing) continue;
        this.node.replica.store.releaseBody(d.event.wire.e.body as string);
        released++;
      }
    }
    if (released) this.core.invalidateDecoded();
    return released;
  }

  /** Roughly who holds a post of a pulled space: an estimate from what every node knows. */
  heldBy(p: PostInfo, members: Did[], recent: boolean): NonNullable<PostInfo['heldBy']> {
    const share = this.#share(p.id, members).filter((d) => d !== p.by.did).length;
    const upvoters = Math.max(0, p.score);
    return { about: recent ? members.length : 1 + share + upvoters, author: true, share, upvoters, recent, here: true };
  }
}
