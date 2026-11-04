import { join as joinPath } from 'node:path';
import { type Did, type Inner, type Json, KIND_BOARD_RULE, KIND_CARRY, KIND_HOLD, KIND_MANAGED, KIND_MSG, KIND_POST_KEEP, KIND_SHRED, type SpaceState, type WireItemV2, blobRefsIn, currentEpoch, isDue, isFading, isWireItemV2, mayDo, openIn, parseBlobRef, sealFor, sealForBoard, spaceScope } from '@weave/core';
import { type BoardInfo, type PostInfo, type SpaceInfo } from './backend.ts';
import { DAY_MS } from './shared.ts';
import { type StoredSpace } from './spacestore.ts';
import { readSecretJson, writeSecretJson } from './vault.ts';
import type { Board, Entry, EventFields, SpaceKind } from '@weave/core';
import type { Companies } from './companies.ts';
import type { ManagedKeys } from './managed.ts';
import { type Decoded, type WeaveNode } from './node.ts';
import { carriedItem } from './shared.ts';
import type { Payments } from './payments.ts';

/*
 * Retention (stages 6.4 and 11): legal holds, forgetting what boards' rules
 * say is due (and the blobs that go with it), keeping a post past its rule,
 * and shredding a space's old keys. It sees the node's internals only through
 * RetentionCore; the node delegates the Backend methods to it.
 */

/** What Forgetting needs of the node's internals, and nothing more (the node builds it in its constructor). */
export interface RetentionCore {
  aroundPosts(entries: Entry[]): Map<string, { last: string; bytes: number; ids: Array<{ id: string; author: Did }> }>;
  board(space: StoredSpace, boards: Board[], ref: string): Board;
  readonly companies: Companies;
  decodeAll(): Decoded[];
  /** Decoded views go stale: bodies were dropped. */
  invalidateDecoded(): void;
  decodedIn(spaceId: string): Decoded[];
  entries(space: StoredSpace): Entry[];
  epochStarts(space: StoredSpace): Map<number, string>;
  expandCarry(d: Decoded, space?: StoredSpace, unchecked?: boolean): Decoded[];
  readonly managed: ManagedKeys;
  readonly payments: Payments;
  saveSpace(space: StoredSpace): void;
  sealForSelf(inner: Inner): EventFields;
  space(ref: string, kind?: SpaceKind): StoredSpace;
  spaceInfo(space: StoredSpace): SpaceInfo;
  spacePosts(space: StoredSpace): { posts: PostInfo[]; boards: Board[] };
  readonly spaces: Map<string, StoredSpace>;
  state(space: StoredSpace): SpaceState;
}

export class Forgetting {
  private readonly node: WeaveNode;
  private readonly core: RetentionCore;

  constructor(node: WeaveNode, core: RetentionCore) {
    this.node = node;
    this.core = core;
  }

  // ---------------------------------------------------------------- retention (stage 6.4)

  /** Is a legal hold standing on this space? */
  held(state: SpaceState): boolean {
    return !!state.hold && Date.parse(state.hold.until) > this.node.clock();
  }

  async setHold(input: { space: string; until: string; reason?: string }): Promise<SpaceInfo> {
    const space = this.core.space(input.space);
    const state = this.core.state(space);
    if (!mayDo(state, this.node.identity.author, 'own').ok) throw new Error(`only the owner of ${space.name} puts it on hold`);
    if (Number.isNaN(Date.parse(input.until))) throw new Error('until is a date, e.g. 2027-12-31');
    this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(space), { kind: KIND_HOLD, body: { until: new Date(input.until).toISOString(), reason: input.reason ?? '' } }));
    return this.core.spaceInfo(space);
  }

  /**
   * Forget what the rules say is due: drop the bodies of those posts and of
   * what goes with them (edits, chat, upvotes), and remember that, so they
   * aren't fetched again. Never what we wrote, never in spaces we own.
   */
  forget(): number {
    const me = this.node.identity.author;
    let dropped = 0;
    /** Blobs the forgotten bodies pointed at (images in text, files attached): dropped too, unless something kept points at them. */
    const blobs = new Set<string>();
    const bodyOf = new Map<string, Json>();
    for (const space of [...this.core.spaces.values()]) {
      if (space.kind !== 'project' && space.kind !== 'community') continue;
      const state = this.core.state(space);
      if (state.founder === me || this.node.config.archive || this.held(state)) continue;
      const due = this.core.spacePosts(space).posts.filter((p) => p.lifetime && isDue(p.lifetime, this.node.clock()) && p.by.did !== me);
      if (!due.length) continue;
      const around = this.core.aroundPosts(this.core.entries(space));
      for (const post of due) {
        for (const { id, author } of [{ id: post.id, author: post.by.did as Did }, ...(around.get(post.id)?.ids ?? [])]) {
          if (author === me) continue;
          const record = this.node.replica.record2(id);
          if (record && record.class === 'content' && !record.missing && isWireItemV2(record.wire)) {
            if (!bodyOf.size) for (const d of this.core.decodeAll()) bodyOf.set(d.id, d.inner.body ?? null);
            for (const ref of blobRefsIn(JSON.stringify(bodyOf.get(id) ?? ''))) blobs.add(ref.hash);
            this.node.replica.store.dropBody(record.wire.e.body as string);
            dropped++;
          } else if (!this.forgottenCarried().has(id) && this.#carriedIds(space).has(id)) {
            // Restated in a carry (7I92Kk20): a carry is never dropped, so its item is forgotten here, and the next shred leaves it behind.
            this.#forgetCarried(id);
            dropped++;
          }
        }
      }
    }
    if (dropped) this.core.invalidateDecoded();
    if (blobs.size) this.#dropBlobs(blobs);
    return dropped;
  }

  /** Drop these blobs from disk, except those something still readable points at (a kept post, a page, a badge). */
  #dropBlobs(hashes: Set<string>): void {
    const kept = new Set<string>();
    for (const d of this.core.decodeAll()) for (const ref of blobRefsIn(JSON.stringify(d.inner.body ?? ''))) kept.add(ref.hash);
    for (const series of this.core.payments.allBadges().series) {
      const ref = parseBlobRef(series.image);
      if (ref) kept.add(ref.hash);
    }
    for (const hash of hashes) if (!kept.has(hash)) this.node.blobs.drop(hash);
  }

  /** Items of carries this node forgot by rule: kept in the carry (it can't be dropped), never shown. */
  #forgottenCarriedSet?: Set<string>;
  forgottenCarried(): Set<string> {
    this.#forgottenCarriedSet ??= new Set(readSecretJson<string[]>(this.node.home, joinPath(this.node.home.dir, 'forgotten-carried.json')) ?? []);
    return this.#forgottenCarriedSet;
  }

  #forgetCarried(id: string): void {
    this.forgottenCarried().add(id);
    writeSecretJson(this.node.home, joinPath(this.node.home.dir, 'forgotten-carried.json'), [...this.forgottenCarried()]);
  }

  /** The ids carries restate in a space. */
  #carriedIds(space: StoredSpace): Set<string> {
    return new Set(this.core.decodedIn(space.id).filter((d) => d.carried).map((d) => d.id));
  }

  async setBoardRule(input: { space: string; board: string; keepDays?: number | null; maxMB?: number | null }): Promise<BoardInfo[]> {
    const space = this.core.space(input.space);
    if (space.kind !== 'project' && space.kind !== 'community') throw new Error('rules for forgetting are for the boards of projects and communities');
    const state = this.core.state(space);
    if (!mayDo(state, this.node.identity.author, 'curate').ok) throw new Error(`only the ${space.kind === 'project' ? 'maintainers' : 'moderators'} of ${space.name} set how long posts stay`);
    const board = this.core.board(space, this.core.spacePosts(space).boards, input.board);
    const valid = (v: number | null | undefined, max: number, what: string) => {
      if (v === undefined || v === null) return null;
      if (!Number.isFinite(v) || v <= 0 || v > max) throw new Error(`${what} is a number above 0, at most ${max}`);
      return v;
    };
    const keepDays = valid(input.keepDays, 36_500, 'days to keep');
    const maxMB = valid(input.maxMB, 1_000_000, 'the size limit in MB');
    const floor = this.core.companies.companyRetention(space)?.minDays;
    if (floor && keepDays && keepDays < floor) throw new Error(`${space.name} is a company space: it keeps everything at least ${floor} days`);
    this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(space), { kind: KIND_BOARD_RULE, body: { board: board.name, keepDays, maxMB } }));
    return this.node.boards(space.id);
  }

  async shred(input: { space: string; before: string; dropOlder?: boolean }): Promise<{ epochs: number[]; carried: number }> {
    const space = this.core.space(input.space);
    if (space.kind === 'direct') throw new Error('a direct chat has nobody who manages it: there is nothing to shred');
    const state = this.core.state(space);
    if (!mayDo(state, this.node.identity.author, 'manage').ok) throw new Error(`only those who manage ${space.name} shred its old keys`);
    if (this.held(state)) throw new Error(`${space.name} is on legal hold until ${state.hold!.until.slice(0, 10)}: nothing is shredded`);
    const before = Date.parse(input.before);
    if (Number.isNaN(before)) throw new Error('before is a date, e.g. 2026-09-01');
    const floor = this.core.companies.companyRetention(space)?.minDays;
    if (floor && before > this.node.clock() - floor * DAY_MS)
      throw new Error(`${space.name} is a company space: it keeps everything at least ${floor} days (shred before ${new Date(this.node.clock() - floor * DAY_MS).toISOString().slice(0, 10)} at the latest)`);
    // An epoch ends when the next one begins; the current one can't be shredded.
    const starts = this.core.epochStarts(space);
    const epochs = Object.keys(space.keys).map(Number).sort((a, b) => a - b);
    const ended = epochs.slice(0, -1).filter((e, i) => (starts.get(epochs[i + 1]) ?? '') !== '' && Date.parse(starts.get(epochs[i + 1])!) <= before);
    if (!ended.length) throw new Error(`no key of ${space.name} ended before ${input.before.slice(0, 10)}${epochs.length < 2 ? ': it has had one key all along' : ''}`);
    // A company space's setting is read with the keys alone (see #managedRaw): restated under the current key, or it would go with the old ones.
    const managed = this.core.managed.managedRaw(space).setting;
    if (managed) {
      if (space.founder !== this.node.identity.author) throw new Error(`only the owner of ${space.name} shreds it: it's under a company's key service`);
      const { by: _by, time: _time, ...setting } = managed;
      this.node.replica.write(this.node.identity, sealFor(space, { kind: KIND_MANAGED, body: setting as unknown as Json }));
    }
    const { carried, dropped } = this.#carryForward(space, new Set(ended), input.dropOlder ? new Date(before).toISOString() : undefined);
    this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(space), { kind: KIND_SHRED, body: { epochs: ended, dropped } }));
    return { epochs: ended, carried };
  }

  /**
   * Before old keys go: restate under the current key what the space still
   * keeps from those epochs: its control events and latest state, posts its
   * rules keep (and their chat), read-limited boards' with their own key.
   */
  #carryForward(space: StoredSpace, epochs: Set<number>, dropBefore?: string, skip?: Set<string>): { carried: number; dropped: string[] } {
    const posts = this.core.spacePosts(space).posts;
    // A company's maximum (stage 11): chat and posts from before it go too, unless they stay for good (pinned, issues, proposals, releases).
    const forever = new Set(posts.filter((p) => p.lifetime && 'forever' in p.lifetime && p.lifetime.forever !== 'no-rule').map((p) => p.id));
    const gone = new Set(posts.filter((p) => (p.lifetime && isDue(p.lifetime, this.node.clock())) || (dropBefore && p.active < dropBefore && !forever.has(p.id))).map((p) => p.id));
    const around = this.core.aroundPosts(this.core.entries(space));
    const goneWith = new Set([...gone].flatMap((id) => (around.get(id)?.ids ?? []).map((x) => x.id)));
    // What goes on purpose, by our rules and clock: named in the shred, so other nodes don't carry it forward after all.
    const dropped: string[] = [];
    const items = this.core.decodedIn(space.id).filter((d) => {
      const epoch = (d.event.body as { epoch?: unknown } | null)?.epoch;
      const inEpochs = d.carried || (Number.isSafeInteger(epoch) && epochs.has(epoch as number));
      if (!inEpochs || d.inner.kind === KIND_CARRY || skip?.has(d.id)) return false;
      if ((dropBefore && d.inner.kind === KIND_MSG && d.event.time < dropBefore) || gone.has(d.id) || goneWith.has(d.id)) {
        dropped.push(d.id);
        return false;
      }
      return true;
    });
    if (!items.length) return { carried: 0, dropped };
    const byBoard = new Map<string, Decoded[]>();
    for (const d of items) byBoard.set(d.board ?? '', [...(byBoard.get(d.board ?? '') ?? []), d]);
    for (const [board, list] of byBoard) {
      const inner: Inner = { kind: KIND_CARRY, body: { events: list.map(carriedItem) as unknown as Json } };
      const keys = board ? space.boards?.[board] : undefined;
      const latest = keys ? Math.max(...Object.keys(keys).map(Number)) : -1;
      if (board && latest < 0) continue; // a board we can't read: we hold none of it to carry
      this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(space), board ? sealForBoard(space, board, latest, keys![String(latest)], inner) : inner));
    }
    return { carried: items.length, dropped };
  }

  /** Apply the shreds of those who manage our spaces (each once: a shredded key is gone). */
  applyShreds(): number {
    let applied = 0;
    for (const space of [...this.core.spaces.values()]) {
      const state = this.core.state(space);
      for (const d of this.core.decodedIn(space.id)) {
        if (d.inner.kind !== KIND_SHRED || d.carried || !mayDo(state, d.event.author, 'manage').ok) continue;
        const epochs = (d.inner.body as { epochs?: unknown } | null)?.epochs;
        if (!Array.isArray(epochs)) continue;
        // A company's minimum keeps recent keys, whoever asks to shred them.
        const floor = this.core.companies.companyRetention(space)?.minDays;
        const kept = floor ? this.core.companies.endedWithin(space, floor) : undefined;
        const live = epochs.filter((e): e is number => Number.isSafeInteger(e) && !!space.keys[String(e)] && !kept?.has(e));
        const dropped = (d.inner.body as { dropped?: unknown } | null)?.dropped;
        if (live.length) {
          this.#applyShred(space, live, Array.isArray(dropped) ? new Set(dropped.filter((x): x is string => typeof x === 'string')) : undefined);
          applied++;
        }
      }
    }
    return applied;
  }

  /** A shred from someone who manages the space: keep what we wrote, then let those keys go, with the bodies sealed with them. */
  #applyShred(space: StoredSpace, epochs: number[], dropped?: Set<string>): void {
    if (this.held(this.core.state(space))) return; // on legal hold: keys stay
    const doomed = new Set(epochs.filter((e) => space.keys[String(e)] && e !== currentEpoch(space)));
    if (!doomed.size) return;
    // Our own work stays with us: restated in our private space first. Not in a company space: there, the company's retention decides (stage 11).
    const company = !!this.core.managed.managedRaw(space).setting?.company;
    const mine = company ? [] : this.core.decodedIn(space.id).filter((d) => d.event.author === this.node.identity.author && !d.carried && doomed.has(Number((d.event.body as { epoch?: unknown } | null)?.epoch)));
    if (mine.length) this.node.replica.write(this.node.identity, this.core.sealForSelf({ kind: KIND_CARRY, body: { space: space.id, events: mine.map(carriedItem) as unknown as Json } }));
    // The shredder's carry restates only what its node held (zLqeyEBC): what we hold of those epochs that no carry under a
    // key that stays restates, and that the shred didn't drop on purpose, we carry forward ourselves before letting go.
    // Anyone may: each item is checked by its author's signature. (A shred from before it named what it dropped: as it says.)
    if (dropped && this.core.state(space).members.has(this.node.identity.author)) {
      const restated = new Set(
        this.core.decodedIn(space.id)
          .filter((d) => d.inner.kind === KIND_CARRY && !d.carried && !doomed.has(Number((d.event.body as { epoch?: unknown } | null)?.epoch)))
          .flatMap((d) => this.core.expandCarry(d, space).map((x) => x.id)),
      );
      this.#carryForward(space, doomed, undefined, new Set([...restated, ...dropped]));
    }
    const scope = spaceScope(space);
    // Bodies are stored once per hash for every space: drop only this space's own. One counts as ours if it opens with this
    // space's key of that epoch (a copy of another space's body under our scope doesn't), and no event elsewhere points to it.
    const cipher = this.core.managed.cipher(space);
    const elsewhere = new Set(this.node.replica.events((r) => r.scope !== scope && isWireItemV2(r.wire)).map((r) => (r.wire as WireItemV2).e.body as string));
    for (const r of this.node.replica.events((r) => r.scope === scope && r.class === 'content' && !r.missing)) {
      if (!doomed.has(Number((r.body as { epoch?: unknown } | null)?.epoch)) || !isWireItemV2(r.wire)) continue;
      const hash = r.wire.e.body as string;
      if (elsewhere.has(hash) || !openIn(cipher, r)) continue;
      this.node.replica.store.dropBody(hash);
    }
    for (const e of doomed) delete space.keys[String(e)];
    space.shredded = [...new Set([...(space.shredded ?? []), ...doomed])];
    this.core.saveSpace(space);
  }

  async keepPost(target: string): Promise<PostInfo> {
    const post = await this.node.post(target);
    const space = post.space && this.core.spaces.get(post.space.id);
    if (!space) throw new Error('only posts of projects and communities are forgotten');
    if (post.by.did !== this.node.identity.author && !mayDo(this.core.state(space), this.node.identity.author, 'curate').ok) throw new Error('its author keeps a post, or those who manage the space');
    this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(space), { kind: KIND_POST_KEEP, body: { target: post.id } }));
    return this.node.post(post.id);
  }

  async fading(): Promise<PostInfo[]> {
    const me = this.node.identity.author;
    return [...this.core.spaces.values()]
      .filter((s) => s.kind === 'project' || s.kind === 'community')
      .flatMap((s) => this.core.spacePosts(s).posts)
      .filter((p) => p.by.did === me && p.lifetime && isFading(p.lifetime, this.node.clock()))
      .sort((a, b) => ((a.lifetime as { until: string }).until).localeCompare((b.lifetime as { until: string }).until));
  }
}
