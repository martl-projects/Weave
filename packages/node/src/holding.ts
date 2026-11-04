import { createHash } from 'node:crypto';
import { join as joinPath } from 'node:path';
import { type Did, type EventV2, type Json, type WeaveRecord, isWireItemV2, keepStreamId, keepTag, keepWrapKey, parseScope, rank, rekey, spaceScope, unwrapFromKeeper, wrapForKeeper } from '@weave/core';
import { type KeepAccess } from '@weave/net';
import { type KeepersInfo, type PostInfo } from './backend.ts';
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
 * which it pulls only part of, keepers that hold a space for its members,
 * fetching older history on request, and the budgets that hold back what
 * peers write too fast. It sees the node's internals only through
 * HoldingCore; the node delegates the Backend methods to it.
 */

/** What you opened (id → when) and the stretches of time you asked members for. */
interface KeptState {
  ids: Record<string, string>;
  ranges: Array<{ space: string; since: string; until: string; at: string }>;
}

const KEEP_READ_MS = 30 * 24 * 3600 * 1000;

const SHARE_HOLDERS = 3;

/** Stage 5: how many keep each small space, up to which size a space is kept, when a keeper counts as gone, and what we keep for others. */
const KEEPERS = 3;

const KEPT_UP_TO = 3;

const KEEPER_GONE_MS = 14 * 24 * 3600 * 1000;

/** How often at most a keeper's "last seen" is written to disk (every connection would be too often). */
const SEEN_SAVE_MS = 3600 * 1000;

const KEEP_QUOTA = 500 * 1024 * 1024;

const KEEP_STREAM_QUOTA = 50 * 1024 * 1024;

/** Our kept spaces and their keys, in our own space, for recovery. */
const KIND_KEEP_INDEX = 'weave.keep.index';

interface KeepState {
  spaces: Record<string, Did[]>;
  seen: Record<string, string>;
  /** Hash of the last keep index written. */
  index: string;
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
  keysOnly(space: StoredSpace): SpaceKeys;
  readonly managed: ManagedKeys;
  managers(state: SpaceState): Set<Did>;
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

  // ---------------------------------------------------------------- keepers (stage 5)

  #keepState?: KeepState;

  /** Who keeps which of our spaces, and when we last saw each keeper (sealed at rest). */
  get #keeping(): KeepState {
    if (!this.#keepState) {
      const stored = readSecretJson<KeepState>(this.node.home, joinPath(this.node.home.dir, 'keepers.json'));
      this.#keepState = { spaces: stored?.spaces ?? {}, seen: stored?.seen ?? {}, index: stored?.index ?? '' };
    }
    return this.#keepState;
  }

  #saveKeeping(): void {
    writeSecretJson(this.node.home, joinPath(this.node.home.dir, 'keepers.json'), this.#keeping);
  }

  /**
   * The spaces keepers keep for us: our own space, direct chats, and groups and projects of 3 people or fewer. A direct
   * chat is derived for everyone whose log we hold (kernel.ts ensureDirects): one with nothing in it (`empty`) gets no
   * keepers and isn't listed, but its stream is still asked for, since a chat we lost looks the same (recovery).
   */
  #keptSpaces(): Array<{ scope: string; space?: StoredSpace; peer?: Did; empty?: true }> {
    this.core.ensureDirects();
    return [
      { scope: SELF_SCOPE },
      ...[...this.core.directs.values()].map(({ space, peer }) => ({ scope: spaceScope(space), space, peer, ...(this.node.replica.events((r) => r.scope === spaceScope(space)).length ? {} : { empty: true as const }) })),
      // A company's spaces are kept by its own archive, never by friends (stage 13).
      ...[...this.core.spaces.values()].filter((s) => (s.kind === 'group' || s.kind === 'project') && this.core.state(s).members.size <= KEPT_UP_TO && !this.core.managed.managedRaw(s).setting).map((space) => ({ scope: spaceScope(space), space })),
    ];
  }

  /** Which friend is at the other end of a connection: the one whose direct chat it shares. */
  #friendOn(shared: ReadonlySet<string>): Did | undefined {
    for (const scope of shared) {
      if (!scope.startsWith('direct:')) continue;
      const peer = this.core.directs.get(scope.slice('direct:'.length))?.peer;
      if (peer && this.core.friends().includes(peer)) return peer;
    }
    return undefined;
  }

  /** The keepers of a kept space: chosen at random among friends (never the other one of a direct chat), replaced when not seen for 14 days. */
  #keepersOf(scope: string, peer?: Did): Did[] {
    const state = this.#keeping;
    const now = this.node.clock();
    const stale = (did: Did) => now - Date.parse(state.seen[did] ?? new Date(now).toISOString()) > KEEPER_GONE_MS;
    const friends = this.core.friends().filter((f) => f !== peer);
    let keepers = (state.spaces[scope] ?? []).filter((k) => friends.includes(k) && !stale(k));
    const candidates = friends.filter((f) => !keepers.includes(f) && !stale(f));
    while (keepers.length < KEEPERS && candidates.length) keepers.push(candidates.splice(Math.floor(Math.random() * candidates.length), 1)[0]);
    if (JSON.stringify(keepers) !== JSON.stringify(state.spaces[scope] ?? [])) {
      for (const k of keepers) state.seen[k] ??= new Date(now).toISOString();
      state.spaces[scope] = keepers;
      this.#saveKeeping();
    }
    return keepers;
  }

  /** A space's events as keepers get them, by tag. */
  #keepItems(scope: string): Map<string, WeaveRecord> {
    const key = keepWrapKey(this.core.selfSecret(), scope);
    return new Map(this.node.replica.events((r) => r.scope === scope).map((r) => [keepTag(key, r.id), r]));
  }

  /** A friend is here: written down, and to disk at most once an hour, so a restart doesn't make keepers look long gone. */
  #sawFriend(friend: Did): void {
    const state = this.#keeping;
    const now = this.node.clock();
    const before = Date.parse(state.seen[friend] ?? '');
    state.seen[friend] = new Date(now).toISOString();
    if (Number.isNaN(before) || now - before >= SEEN_SAVE_MS) this.#saveKeeping();
  }

  /**
   * Streams a keeper once held for us of spaces no longer kept (a group that grew, a space we left) or that another
   * keeper took over: offered with `keeper: false`, so the session tells it to let them go once we hold everything.
   * A space gone from this node altogether is forgotten here: nothing of it to compare, so nothing to say.
   */
  #retiredStreams(friend: Did, kept: Array<{ scope: string }>): Array<{ id: string; tags: string[]; keeper: boolean }> {
    const state = this.#keeping;
    const current = new Set(kept.map((k) => k.scope));
    const retired: Array<{ id: string; tags: string[]; keeper: boolean }> = [];
    for (const scope of Object.keys(state.spaces)) {
      if (current.has(scope)) continue;
      const id = parseScope(scope)?.id;
      if (!(scope === SELF_SCOPE || (id && (this.core.spaces.has(id) || this.core.directs.has(id))))) {
        delete state.spaces[scope];
        this.#saveKeeping();
        continue;
      }
      retired.push({ id: keepStreamId(this.core.selfSecret(), scope, friend), tags: [...this.#keepItems(scope).keys()], keeper: false });
    }
    return retired;
  }

  keepAccess: KeepAccess = {
    streams: (shared) => {
      const friend = this.#friendOn(shared);
      if (!friend) return [];
      this.#sawFriend(friend);
      const kept = this.#keptSpaces();
      return [
        ...kept.map(({ scope, peer, empty }) => ({
          id: keepStreamId(this.core.selfSecret(), scope, friend),
          tags: [...this.#keepItems(scope).keys()],
          // An empty direct chat has no keepers; asked for all the same, in case a keeper holds what we lost.
          keeper: !empty && this.#keepersOf(scope, peer).includes(friend),
        })),
        ...this.#retiredStreams(friend, kept),
      ];
    },
    wrapped: (id, tags) => {
      const found = this.#streamScope(id);
      if (!found) return [];
      const key = keepWrapKey(this.core.selfSecret(), found);
      const items = this.#keepItems(found);
      return tags.flatMap((tag) => {
        const record = items.get(tag);
        return record ? [{ tag, data: wrapForKeeper(key, record.wire as unknown as Json) }] : [];
      });
    },
    take: (id, items) => {
      const found = this.#streamScope(id);
      if (!found) return;
      const key = keepWrapKey(this.core.selfSecret(), found);
      for (const { data } of items) {
        const wire = unwrapFromKeeper(key, data);
        if (wire !== undefined) this.node.replica.ingest(wire);
      }
      // What came back may be our keep index: take the spaces it lists.
      this.core.invalidateDecoded();
      this.recoverSpaces();
    },
    accepts: (shared, id, bytes) => !!this.#friendOn(shared) && this.node.replica.store.keepBytes() + bytes <= KEEP_QUOTA && this.node.replica.store.keepBytes(id) + bytes <= KEEP_STREAM_QUOTA,
  };

  /** The kept space a stream of ours is, whichever friend keeps it (a retired one too: its items are still ours). */
  #streamScope(id: string): string | undefined {
    const friends = this.core.friends();
    const scopes = new Set([...this.#keptSpaces().map((k) => k.scope), ...Object.keys(this.#keeping.spaces)]);
    for (const scope of scopes) for (const friend of friends) if (keepStreamId(this.core.selfSecret(), scope, friend) === id) return scope;
    return undefined;
  }

  /**
   * Our keep index, in our own space: the kept spaces and their keys, so that
   * after losing everything, our self stream brings them back. Written when it
   * changes.
   */
  writeKeepIndex(): number {
    const spaces = this.#keptSpaces().flatMap(({ space }) => (space && !this.core.directs.has(space.id) ? [space] : []));
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
    const lists = [this.core.selfBodies(KIND_KEEP_INDEX).at(-1), ...(this.core.isLinkedNode ? [this.core.selfBodies(KIND_NODE_INDEX).at(-1)] : [])] as Array<{ spaces?: unknown } | undefined>;
    for (const index of lists) if (Array.isArray(index?.spaces)) this.#adoptSpaces(index.spaces as StoredSpace[]);
  }

  #adoptSpaces(spaces: StoredSpace[]): void {
    for (const space of spaces) {
      if (!space || typeof space.id !== 'string' || this.core.spaces.has(space.id)) continue;
      void this.core.addSpace({ ...space, entry: { topics: [this.node.identity.author], bootstrap: [] } });
    }
  }

  async keepers(): Promise<KeepersInfo> {
    return {
      spaces: this.#keptSpaces().filter((k) => !k.empty).map(({ scope, space, peer }) => ({
        space: space ? { id: space.id, kind: space.kind, name: this.core.spaceName(space) } : { id: SELF_SCOPE, kind: 'group' as const, name: 'your own space' },
        keepers: this.#keepersOf(scope, peer).map((k) => this.core.actor(k, k)),
      })),
      forOthers: this.node.replica.store.keepBytes(),
      quota: KEEP_QUOTA,
    };
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
