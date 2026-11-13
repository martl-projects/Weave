import { type Access, type Board, type BoardRight, type BoardRule, type Did, EDGE_KINDS, type EdgeEvent, type Entry, type EventFields, type Inner, type Invite, type Issue, type Json, KEY_KINDS, KIND_ADMIT, KIND_AGENT_APPROVE, KIND_BOARD_KEY, KIND_BOARD_SEALED, KIND_CARRY, KIND_GIFT, KIND_HISTORY, KIND_INVITE, KIND_JOIN, KIND_KMS, KIND_KNOCK_PENDING, KIND_LEAVE, KIND_MAINTAINER, KIND_MANAGED, KIND_MEMBERSHIP_PENDING, KIND_MSG, KIND_REKEY, KIND_REMOVE, KIND_REPLY, KIND_ROSTER, KIND_SAVE, KIND_SEALED, KIND_SETTLE, KIND_SHRED, KIND_SPACE_CREATE, KIND_VISITORS, type Member, type Message, type Post, type Proposal, type Reaction, type Reply, SERVICE_PREFIX, type SaveMode, type Score, type Sealed, type SessionStamp, type SpaceKeys, type SpaceKind, type SpaceState, type Thread, type VisitorRule, WeaveError, type WeaveRecord, type WireItemV2, accessOf, b64u, boardKeyFor, boardName, boardOfEvents, boardOfInner, boardRulesOf, boardsOf, boxTo, canonicalIdV2, canonicalJson, canonicalKind, classOf, coauthorsOf, currentEpoch, epochsToShare, friendsOf, gift, innerHash, inviteRightsOf, isDid, isWellFormedV2, isWireItemV2, issuesOf, keyHolders, lifetimeOf, managersOf, mayDo, mayDoAt, mayUse, newBoardKey, open, openBoard, openBoardKey, openGift, openIn, openRekey, overBudget, parseBlobRef, parseScope, permits, postUrl, postsOf, proposalsOf, readersOf, recordOfV2, rekey, savesOf, scoresOf, seal, sealFor, sealForBoard, selfKey, shortPrefixes, socialGraph, spaceScope, spaceState, tooLong, verifyEventV2, visibleIn, visitorCounts } from '@weave/core';
import type { HeldSpace, SpaceAccess, SwarmNode } from '@weave/net';
import { type Actor, type Admission, type BoardInfo, type FeedItem, type HomeSource, type IssueInfo, type MessageInfo, PROJECT_STATUSES, type PostInfo, type ProjectPage, type ProjectStatus, type ProposalInfo, type ReactionInfo, type ReplyInfo, type SpaceInfo, type SpaceRef, type ThreadInfo } from './backend.ts';
import type { People } from './people.ts';
import { CARRIED_STATE, RECENT_HOLD_MS, SELF_SCOPE } from './shared.ts';
import type { StoredSpace } from './spacestore.ts';
import type { KeyPair, Recipient } from '@weave/core';
import type { Network, SpaceStorage } from './ports.ts';
import type { Companies } from './companies.ts';
import type { Content } from './content.ts';
import type { Holding } from './holding.ts';
import type { ManagedKeys } from './managed.ts';
import type { Forgetting } from './retention.ts';
import type { Services } from './services.ts';
import type { Decoded, WeaveNode } from './node.ts';
import { replicaOrder, photoOrderOf, photoPosesOf, DEFAULT_PAGE, carriedItem, meetTopic, summary, KIND_PAGE, KIND_SPACE_PHOTO } from './shared.ts';
import { newSpace, directSpace } from '@weave/core';
import { channelsOf } from '@weave/core';
/*
 * The kernel: the spaces this node holds and their keys, epochs, rekeys and
 * carries, decoding what it can read (once, cached), each space's state, the
 * reading layer over posts and chat, board access, removals settled and
 * anchored. It imports no node:* module and nothing that does: the host comes
 * in through the ports in KernelCore. The node builds it first and the other
 * modules reach it through their own cores.
 */

/** What Kernel needs of the node's internals, and nothing more (the node builds it in its constructor). */
export interface KernelCore {
  agentMay(name: string, kind: string): void;
  agentName(signer: Did, author: Did): string | undefined;
  boardFollows(): Map<string, boolean>;
  readonly companies: Companies;
  readonly content: Content;
  doorSecret(): Uint8Array;
  readonly encryptionKeyOf: (person: Did) => Did;
  farewells(): WireItemV2[];
  follows(space: string, board: string, said?: Map<string, boolean>): boolean;
  frontDoor(): boolean;
  readonly holding: Holding;
  homeHidden(): Set<string>;
  looksOnly(topic: string): boolean;
  readonly managed: ManagedKeys;
  meetSecret(): Uint8Array;
  meetingTopics(space: StoredSpace): string[];
  myEncryptionPairs(): KeyPair[];
  readonly people: People;
  prefix(posts?: Map<string, string>): (id: string) => string;
  readonly retention: Forgetting;
  /** When this node first saw an event (kept in the home). */
  readonly seenAt: (entry: { id: string }) => string;
  selfBodies(kind: string): Array<Record<string, unknown>>;
  selfSecret(): Uint8Array;
  readonly services: Services;
  /** The spaces this node holds, by id (the node loads and keeps them). */
  readonly spaces: Map<string, StoredSpace>;
  /** The network, once online. */
  readonly network: Network | undefined;
  /** The ports to the host. */
  readonly spaceStorage: SpaceStorage;
  saveConfig(): void;
  theirMeets(): Uint8Array[];
  tryOpen<T>(open: (me: Recipient) => T | undefined): T | undefined;
}

export class Kernel {
  private readonly node: WeaveNode;
  private readonly core: KernelCore;

  constructor(node: WeaveNode, core: KernelCore) {
    this.node = node;
    this.core = core;
  }

  /** Decoded views go stale: keys came or went, bodies were dropped. */
  invalidateDecoded(): void {
    this.decoded = undefined;
  }

  /** Everything this node can read, decrypted once; dropped whenever an event arrives or keys change. */
  decoded?: Decoded[];
  /** Bumped whenever the decoded events change (an event added, or a rebuild): what caches of them key on. */
  decodedRevision = 0;
  /** Bumped when everything is decoded again; per-space caches from before don't count then. */
  #decodedGeneration = 0;
  /** The decoded events of each space, in replica order, kept with decoded. */
  #bySpace = new Map<string, Decoded[]>();
  /** Bumped when an event of that space is added. */
  #spaceRevision = new Map<string, number>();
  /** Each person's own valid events (see #eventsOf), until they write again or keys change. */
  personEvents = new Map<Did, WeaveRecord[]>();
  /** Results computed from all decoded events, valid until the decoded events change. */
  #memos = new Map<string, { revision: number; value: unknown }>();
  /** Bumped when a control event of that space is added (members, roles, keys, rules): all that its state depends on. */
  #controlRevision = new Map<string, number>();
  /** Each space's state, valid while generation and control revision hold: chat and posts leave it alone. */
  #stateCache = new Map<string, { key: string; state: SpaceState }>();
  /** Entries and access of each space, valid while generation and space revision hold. */
  #spaceCache = new Map<string, { key: string; entries?: Entry[]; access?: Access; accessFor?: SpaceState }>();
  /** Direct chats, derived (never stored) for everyone whose log this node holds: space id → space and the other person. */
  directs = new Map<string, { space: StoredSpace; peer: Did }>();
  directByPeer = new Map<Did, StoredSpace>();
  contactCache?: { from: number; map: Map<Did, string | undefined> };
  /** Board-key events already looked at, so each box is tried once. */
  #boardKeysSeen = new Set<string>();
  /** A space's keys as shared with a newcomer: never the board keys (those go only to their readers). */
  keysOnly(space: StoredSpace): SpaceKeys {
    const { entry: _entry, boards: _boards, via: _via, shredded: _shredded, ...keys } = space;
    return keys;
  }

  /**
   * A space's keys for newcomers, as its history setting allows: every epoch,
   * those of the last 30 days, or (joining) a fresh one made for them. A `30d`
   * space whose key is older than 30 days gets a new one first, so what
   * newcomers read stays near 30 days. Rotating is for those who manage the
   * space (only their new keys count).
   */
  /** Does letting someone in now need a fresh key, so they don't read what came before (history joining, or 30d with an older key)? */
  #needsFreshKey(space: StoredSpace, state: SpaceState = this.state(space)): boolean {
    const history = state.history?.value ?? 'all';
    const start = this.epochStarts(space).get(currentEpoch(space)) ?? '';
    return history === 'joining' || (history === '30d' && start < new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString());
  }

  keysForNewcomers(space: StoredSpace): SpaceKeys {
    const state = this.state(space);
    const history = state.history?.value ?? 'all';
    const starts = this.epochStarts(space);
    // Only a manager's new key counts for the others (T3a83nLy): when one is needed, nobody else lets people in, or they'd read it all.
    const fresh = this.#needsFreshKey(space, state);
    if (fresh && !mayDo(state, this.node.identity.author, 'manage').ok) {
      throw new WeaveError('daemon.invite.needs.key', { space: space.name }, `${space.name} lets newcomers read only from when they come: only those who manage it let people in while that needs a new key`);
    }
    if (fresh) {
      this.rotateKey(space);
      starts.set(currentEpoch(space), new Date().toISOString());
    }
    const keys = this.keysOnly(space);
    const share = new Set(epochsToShare(space, history, starts).map(String));
    if (share.size < Object.keys(keys.keys).length) this.#carry(space, share);
    return { ...keys, keys: Object.fromEntries(Object.entries(keys.keys).filter(([epoch]) => share.has(epoch))) };
  }

  /**
   * Restate under the current key what newcomers need of the epochs they don't
   * get: the space's control events (members, roles, boards, rules, keys of
   * boards) and its latest state (page, app, channels, curation, theme), with
   * their original ids, authors and times.
   */
  #carry(space: StoredSpace, shared: Set<string>): boolean {
    const events = this.decodedIn(space.id)
      .filter((d) => (classOf(canonicalKind(d.inner.kind)) === 'control' || CARRIED_STATE.has(d.inner.kind)) && d.inner.kind !== KIND_CARRY && !d.board)
      .filter((d) => !shared.has(String((d.event.body as { epoch?: unknown } | null)?.epoch ?? '')))
      .map(carriedItem);
    if (!events.length) return false;
    // v: 3, its items carry their envelopes: checkable (or, from before protocol 3, vouched for by the founder).
    this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(space), { kind: KIND_CARRY, body: { events: events as unknown as Json, v: 3 } }));
    return true;
  }

  /**
   * Carries from before protocol 3 restate their events without envelopes, which nobody else takes any more: who came
   * in through one never learns what came before, not even who founded the space, so its founder's messages don't
   * show (Julian, 1.11.2026). The founder restates it all once more, in today's shape, under the current key, so
   * everyone who read an old one reads the new one.
   *
   * Known limit: for an envelope from before protocol 3 the founder vouches for what it sealed, so they could claim
   * any content for another author's old envelope (a control or carried-state kind, from before 30.10.2026). Who wrote
   * it, with which key, as which number and when still holds (its signature); and a founder can do nearly anything in
   * their space anyway.
   */
  recarry(space: StoredSpace, state: SpaceState): number {
    // Once settled for a space, settled for this run: our node writes only carries of today's shape from then on.
    if (this.#recarried.has(space.id)) return 0;
    if (space.kind === 'direct' || space.founder !== this.node.identity.author || (state.history?.value ?? 'all') === 'all') return 0;
    const epochOf = (d: Decoded) => Number((d.event.body as { epoch?: unknown } | null)?.epoch);
    // Our carries as written (the decoded views have them only as the events they restate).
    const scope = spaceScope(space);
    const carries = this.node.replica
      .events((r) => r.scope === scope && r.author === this.node.identity.author && r.kind === KIND_SEALED)
      .flatMap((r) => {
        const d = this.decode(r);
        return d && d.inner.kind === KIND_CARRY ? [d] : [];
      });
    const old = carries.filter((d) => (d.inner.body as { v?: unknown } | null)?.v !== 3).map(epochOf).filter(Number.isSafeInteger);
    const newest = old.length ? Math.max(...old) : -1;
    if (!old.length || carries.some((d) => (d.inner.body as { v?: unknown } | null)?.v === 3 && epochOf(d) >= newest)) {
      this.#recarried.add(space.id);
      return 0;
    }
    const wrote = this.#carry(space, new Set([String(currentEpoch(space))]));
    if (wrote) this.#recarried.add(space.id);
    return wrote ? 1 : 0;
  }

  /** Spaces whose carries are of today's shape (see recarry). */
  #recarried = new Set<string>();

  /**
   * A carry becomes the events it restates, each checked against its original
   * envelope: signed by its author's key, in this space, sealing exactly what
   * the carry says (ih). Who wrote it and when come from that envelope, never
   * from the carry. Items that can't be checked count only in our own private
   * carries (`unchecked`): anyone else could make them up. One exception: an
   * envelope from before protocol 3 (no inner hash), restated by the space's
   * founder, who vouches for what it sealed.
   */
  expandCarry(d: Decoded, space: StoredSpace | undefined = d.space as StoredSpace | undefined, unchecked = false): Decoded[] {
    if (d.inner.kind !== KIND_CARRY || !space) return [];
    const items = (d.inner.body as { events?: unknown } | null)?.events;
    if (!Array.isArray(items)) return [];
    const scope = spaceScope(space);
    const out: Decoded[] = [];
    for (const item of items as Array<Record<string, unknown>>) {
      if (typeof item?.kind !== 'string') continue;
      const inner = { kind: item.kind, body: (item.body ?? null) as Json };
      const e = item.e;
      // What the envelope signed: the inner itself, or for a read-limited board its sealed blob, which must open (board key) to exactly the inner.
      const sealed = item.sealed as { kind?: unknown; body?: unknown } | undefined;
      const signed = sealed && typeof sealed.kind === 'string' ? { kind: sealed.kind, body: (sealed.body ?? null) as Json } : inner;
      const opened = signed === inner ? undefined : space.kind === 'project' ? openBoard(space, signed, space.boards) : undefined;
      const opensTo = signed === inner || (!!opened && opened.kind === inner.kind && canonicalJson(opened.body) === canonicalJson(inner.body));
      const checked = isWellFormedV2(e) && typeof item.salt === 'string' && e.kind === KIND_SEALED && e.space === scope && e.ih === innerHash({ ...signed, salt: item.salt }) && opensTo && verifyEventV2(e);
      // An envelope from before protocol 3 signs no inner hash: what it sealed can't be checked against it. Its author,
      // signer, number and time still can (its signature), and the space's founder vouches for the rest: in a space
      // that lets newcomers read only from when they come, that's how they learn what came before (Julian, 1.11.2026).
      const vouched = !checked && !sealed && isWellFormedV2(e) && e.ih === undefined && e.kind === KIND_SEALED && e.space === scope && d.event.author === space.founder && verifyEventV2(e);
      if (checked || vouched) {
        const id = canonicalIdV2(e);
        if (!this.node.replica.authority.check(recordOfV2(id, e, undefined)).ok) continue;
        const event: WeaveRecord = { ...d.event, id, author: e.author, signer: e.signer, seq: e.n, cseq: e.class === 'control' ? e.seq : undefined, cs: e.class === 'content' ? e.cs : undefined, time: e.time, body: null };
        out.push({ id, event, inner, space, carried: true, ...(d.board ? { board: d.board } : {}) });
        continue;
      }
      if (!unchecked || typeof item.id !== 'string' || !isDid(item.author) || !isDid(item.signer) || typeof item.time !== 'string' || !Number.isSafeInteger(item.seq)) continue;
      const event: WeaveRecord = { ...d.event, id: item.id, author: item.author, signer: item.signer, seq: item.seq as number, cseq: undefined, cs: undefined, time: item.time, body: null };
      out.push({ id: item.id, event, inner, space, carried: true, ...(d.board ? { board: d.board } : {}) });
    }
    return out;
  }

  /**
   * The events restated in carries. Whoever wrote a carry vouches for nothing:
   * every item is checked against its author's own signature (expandCarry), so
   * a carry from anyone holding the space's key restates only what was really
   * written there. Our own private carries (what we wrote, kept before keys were
   * shredded) count as they are.
   */
  #trustedCarries(decoded: Decoded[]): Decoded[] {
    return decoded
      .filter((d) => d.inner.kind === KIND_CARRY)
      .flatMap((d) => {
        if (d.private) {
          // Our own: {space, events} kept in our private space.
          const space = this.core.spaces.get(String((d.inner.body as { space?: unknown } | null)?.space ?? ''));
          return d.event.author === this.node.identity.author && space ? this.expandCarry(d, space, true) : [];
        }
        return this.expandCarry(d, d.space as StoredSpace | undefined).filter((x) => !this.core.retention.forgottenCarried().has(x.id));
      });
  }

  /**
   * What agent and service keys signed counts only as far as the space lets them (visitorCounts): in managed
   * spaces only approved keys (stage 9); elsewhere as the space's rule for agents and services says.
   */
  #approvedOnly(decoded: Decoded[]): Decoded[] {
    const states = new Map<string, SpaceState>();
    const of = (space: StoredSpace) => {
      let state = states.get(space.id);
      if (!state) {
        state = spaceState(space.kind, space.founder, decoded.filter((d) => d.space?.id === space.id));
        states.set(space.id, state);
      }
      return state;
    };
    return decoded.filter((d) => {
      const space = d.space as StoredSpace | undefined;
      const grant = space && d.event.signer !== d.event.author ? this.node.replica.authority.grant(d.event.signer) : undefined;
      if (!space || grant?.role !== 'agent') return true;
      return visitorCounts(of(space), { key: d.event.signer as Did, author: d.event.author, service: !!grant.name?.startsWith(SERVICE_PREFIX) }, canonicalKind(d.inner.kind), !!this.core.managed.managedRaw(space).setting);
    });
  }

  /** One new event: does it count, by the space's state as known (see #approvedOnly)? */
  #agentCounts(d: Decoded): boolean {
    const space = d.space as StoredSpace | undefined;
    const grant = space && d.event.signer !== d.event.author ? this.node.replica.authority.grant(d.event.signer) : undefined;
    if (!space || grant?.role !== 'agent') return true;
    return visitorCounts(this.state(space), { key: d.event.signer as Did, author: d.event.author, service: !!grant.name?.startsWith(SERVICE_PREFIX) }, canonicalKind(d.inner.kind), !!this.core.managed.managedRaw(space).setting);
  }

  /** Before an agent or service of ours signs in a space: refuse what the space wouldn't count, and say why. */
  visitorMay(space: StoredSpace, key: Did, name: string, kind: string): void {
    const state = this.state(space);
    const managed = !!this.core.managed.managedRaw(space).setting;
    const service = name.startsWith(SERVICE_PREFIX) || this.core.services.storedServices().some((s) => s.name === name);
    if (visitorCounts(state, { key, author: this.node.identity.author, service }, canonicalKind(kind), managed)) return;
    const what = service ? `service "${name}"` : `agent "${name}"`;
    const rule = service ? state.visitors?.services : state.visitors?.agents;
    const ref = `${this.node.nameOf(this.node.identity.author) ?? this.node.identity.author}/${name}`;
    const whoActs = service ? 'services' : 'agents';
    if (rule?.who === 'nobody') throw new WeaveError('daemon.rules.nobody', { space: space.name, what: whoActs }, `${space.name} doesn't let ${whoActs} act in it: its maintainers decide that`);
    if (managed || rule?.who === 'approved')
      if (!state.approvedAgents?.has(key)) throw new WeaveError('daemon.rules.not.approved', { what, space: space.name }, `${what} isn't approved in ${space.name}: those who manage it can approve it (weave approve-agent "${space.name}" ${ref})`);
    const kinds = rule?.kinds?.join(', ') ?? '';
    throw new WeaveError('daemon.rules.kinds', { space: space.name, what: whoActs, kind, kinds }, `${space.name} doesn't let ${whoActs} write ${kind} (only ${kinds}): its maintainers decide that`);
  }
  /**
   * The rekeys that count in a space (Gr9S4DLf): by someone who managed it as
   * of the rekey (mayDoAt 'manage'), for an epoch we hold. Rekeys are in the clear:
   * anyone in the space can write one, dated as they like. Its time is its date,
   * but never later than when it got here.
   */
  #countingRekeys(space: StoredSpace, state: SpaceState = this.state(space)): Array<{ epoch: number; time: string; seen: string }> {
    const scope = spaceScope(space);
    return this.node.replica
      .events((r) => canonicalKind(r.kind) === KIND_REKEY && r.scope === scope)
      .flatMap((e) => {
        const epoch = (e.body as { epoch?: unknown } | null)?.epoch;
        if (!Number.isSafeInteger(epoch) || !space.keys[String(epoch)] || !mayDoAt(state, e, 'manage').ok) return [];
        const seen = this.core.seenAt(e);
        return [{ epoch: epoch as number, time: e.time < seen ? e.time : seen, seen }];
      });
  }

  /** When each of a space's epochs began: the earliest rekey to it that counts (the epoch number is in the clear). */
  epochStarts(space: StoredSpace): Map<number, string> {
    const starts = new Map<number, string>();
    for (const r of this.#countingRekeys(space)) if (!(starts.get(r.epoch)! <= r.time)) starts.set(r.epoch, r.time);
    return starts;
  }

  /** A space whose newcomers read the last 30 days gets a new key once its key is older than that, if we may rotate it. */
  rotateMonthly(space: StoredSpace): number {
    const state = this.state(space);
    const forgets = (space.kind !== 'group' && [...boardRulesOf(this.entries(space), this.managers(state), this.core.seenAt).values()].some((r) => r.keepDays)) || !!this.core.companies.companyRetention(space)?.maxDays;
    if (space.kind === 'direct' || (state.history?.value !== '30d' && !forgets) || !mayDo(state, this.node.identity.author, 'manage').ok) return 0;
    const start = this.epochStarts(space).get(currentEpoch(space)) ?? '';
    if (start >= new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()) return 0;
    this.rotateKey(space);
    return 1;
  }

  /**
   * Keys from rekeys that don't count after all (their author had lost the role
   * by then, as a demotion or removal made at the same time shows): kept to read
   * what was sealed with them, never used to seal. Whoever took one before
   * hearing of the loss falls back to the key everyone else seals with.
   */
  settleEpochKeys(space: StoredSpace): number {
    if (space.kind === 'direct') return 0;
    const state = this.state(space);
    if (!state.cutoffs?.some((c) => c.managed)) return 0;
    const scope = spaceScope(space);
    const counts = new Map<string, boolean>();
    for (const e of this.node.replica.events((x) => x.scope === scope && canonicalKind(x.kind) === KIND_REKEY)) {
      const opened = this.core.tryOpen((me) => openRekey(e, me));
      if (!opened) continue;
      const epoch = String(opened.epoch);
      counts.set(epoch, (counts.get(epoch) ?? false) || mayDoAt(state, e, 'manage').ok);
    }
    let moved = 0;
    for (const [epoch, ok] of counts) {
      if (ok || !space.keys[epoch]) continue;
      (space.alternates ??= {})[epoch] = [...new Set([...(space.alternates[epoch] ?? []), space.keys[epoch]])];
      delete space.keys[epoch];
      moved++;
    }
    if (moved) this.saveSpace(space);
    return moved;
  }

  /** A new key for a space, boxed to everyone in it. */
  rotateKey(space: StoredSpace): void {
    const { fields, epoch, key } = rekey(space, [...this.state(space).members.keys()], this.core.encryptionKeyOf);
    space.keys[String(epoch)] = key;
    this.saveSpace(space);
    this.node.replica.write(this.node.identity, fields);
    this.core.managed.afterRekey(space, epoch, key);
  }

  /** Keys of the read-limited boards that these rights open, to hand over with an invite. */
  boardKeysFor(space: StoredSpace, rights: BoardRight[]): Record<string, Record<string, string>> | undefined {
    const out: Record<string, Record<string, string>> = {};
    for (const r of rights) if ((r.read || r.write) && space.boards?.[r.board]) out[r.board] = { ...space.boards[r.board] };
    return Object.keys(out).length ? out : undefined;
  }
  /** After people leave, a node that may rotate the key does: they can't read what comes next. */
  rotateAfterLeaving(space: StoredSpace, state: SpaceState): number {
    if (space.kind === 'direct' || !mayDo(state, this.node.identity.author, 'manage').ok || !state.left.size) return 0;
    // A leave and a rekey after it, by their dates (never later than they got here) and by when they got here: a
    // leaver can date their leave early, but not make it arrive early; and only rekeys that count count (Gr9S4DLf).
    const latest = (times: string[]) => times.reduce((a, b) => (b > a ? b : a), '');
    const leaves = this.decodedIn(space.id)
      .filter((d) => canonicalKind(d.inner.kind) === KIND_LEAVE && state.left.has(d.event.author))
      .map((d) => {
        const seen = this.core.seenAt(d.event);
        return { time: d.event.time < seen ? d.event.time : seen, seen };
      });
    const rekeys = this.#countingRekeys(space, state);
    if (latest(leaves.map((l) => l.time)) <= latest(rekeys.map((r) => r.time)) && latest(leaves.map((l) => l.seen)) <= latest(rekeys.map((r) => r.seen))) return 0;
    const { fields, epoch, key } = rekey(space, [...state.members.keys()], this.core.encryptionKeyOf);
    space.keys[String(epoch)] = key;
    this.saveSpace(space);
    this.node.replica.write(this.node.identity, fields);
    this.core.managed.afterRekey(space, epoch, key);
    return 1;
  }

  /**
   * Keys someone missed because their join came in after them: made after their invite, while their join was still
   * on its way, so boxed only to the members known then (Julian, 1.11.2026). A node that may rotate the key hands each
   * of those keys to them, boxed as a rekey of the same epoch. Never a key from before their invite, unless the
   * space now lets everyone read everything after it once didn't: then every member gets every key they lack.
   */
  handMissedKeys(space: StoredSpace, state: SpaceState): number {
    if (space.kind === 'direct' || !mayDo(state, this.node.identity.author, 'manage').ok) return 0;
    const scope = spaceScope(space);
    // Who each epoch's key was boxed to, by rekeys that count.
    const boxed = new Map<number, Set<Did>>();
    for (const e of this.node.replica.events((r) => canonicalKind(r.kind) === KIND_REKEY && r.scope === scope)) {
      const body = e.body as { epoch?: unknown; boxes?: Record<string, unknown> } | null;
      if (!Number.isSafeInteger(body?.epoch) || !mayDoAt(state, e, 'manage').ok) continue;
      const to = boxed.get(body!.epoch as number) ?? new Set<Did>();
      for (const did of Object.keys(body?.boxes ?? {})) to.add(did as Did);
      boxed.set(body!.epoch as number, to);
    }
    // The epoch each invite was sealed with: what came after it is the newcomer's to read.
    const invitedAt = new Map<string, number>();
    for (const d of this.decodedIn(space.id)) {
      const invite = (d.inner.body as { invite?: unknown } | null)?.invite;
      const epoch = (d.event.body as { epoch?: unknown } | null)?.epoch;
      if (canonicalKind(d.inner.kind) === KIND_INVITE && typeof invite === 'string' && Number.isSafeInteger(epoch)) invitedAt.set(invite, epoch as number);
    }
    // A space that once let newcomers read only part of it and now lets them read everything: those who came in
    // meanwhile get the keys from before too (Julian, 2.11.2026), not only newcomers from now on.
    const opened = (state.history?.value ?? 'all') === 'all' && this.decodedIn(space.id).some((d) => d.inner.kind === KIND_HISTORY && (d.inner.body as { history?: unknown } | null)?.history !== 'all');
    let handed = 0;
    const epochs = opened ? Object.keys(space.keys).map(Number) : [...boxed.keys()];
    for (const epoch of epochs) {
      const key = space.keys[String(epoch)];
      if (!key) continue;
      const to = boxed.get(epoch) ?? new Set<Did>();
      const missing = [...state.members.values()]
        .filter((m) => m.did !== this.node.identity.author && !to.has(m.did))
        .filter((m) => opened || (m.invite !== undefined && invitedAt.has(m.invite) && epoch > invitedAt.get(m.invite)!))
        .map((m) => m.did);
      if (!missing.length) continue;
      const boxes: Record<string, Json> = {};
      for (const did of missing) boxes[did] = boxTo(this.core.encryptionKeyOf(did), { space: space.id, epoch, key }) as unknown as Json;
      this.node.replica.write(this.node.identity, { kind: KIND_REKEY, scope, body: { epoch, boxes } });
      handed++;
    }
    return handed;
  }
  // ---------------------------------------------------------------- internals: spaces

  /** A space by id or name, optionally of one kind. */
  space(ref: string, kind?: SpaceKind): StoredSpace {
    const byId = this.core.spaces.get(ref) ?? (this.decodeAll(), this.directs.get(ref)?.space);
    if (byId && (!kind || byId.kind === kind)) return byId;
    const byName = [...this.core.spaces.values()].filter((s) => (!kind || s.kind === kind) && s.name.toLowerCase() === ref.toLowerCase());
    if (byName.length === 1) return byName[0];
    const what = kind ?? 'group, project or community';
    throw new Error(byName.length ? `several ${what}s are named "${ref}" — use its id` : `you are not in a ${what} "${ref}"`);
  }

  project(ref: string): StoredSpace {
    const space = this.space(ref);
    if (space.kind !== 'project') throw new Error(`${space.name} is a ${space.kind}; discussions, votes and issues live in projects`);
    return space;
  }

  maintainerState(project: StoredSpace): SpaceState {
    const state = this.state(project);
    if (!mayDo(state, this.node.identity.author, 'curate').ok) throw new Error(`only ${project.kind === 'community' ? 'moderators' : 'maintainers'} of ${project.name} can do that`);
    return state;
  }

  /** A group invited to a project, by name or id, even if this node isn't in that group. */
  knownGroup(project: StoredSpace, ref: string): { id: string; name: string } {
    const invited = [...this.state(project).groups.values()];
    const match = invited.find((g) => g.id === ref) ?? invited.find((g) => (this.core.spaces.get(g.id)?.name ?? g.name).toLowerCase() === ref.toLowerCase());
    if (!match) throw new Error(`no group "${ref}" is invited to ${project.name}`);
    return { id: match.id, name: this.core.spaces.get(match.id)?.name ?? match.name };
  }

  groupRef(id: string, state: SpaceState): SpaceRef {
    return { id, kind: 'group', name: this.core.spaces.get(id)?.name ?? state.groups.get(id)?.name ?? 'group' };
  }

  mineFounder = (space: StoredSpace) => space.founder === this.node.identity.author;

  /** Make someone a maintainer (project) or moderator (community), or drop them. */
  appoint(space: StoredSpace, who: string, on: boolean): void {
    const state = this.maintainerState(space);
    const member = this.node.resolve(who);
    const role = space.kind === 'community' ? 'moderator' : 'maintainer';
    if (on && !state.members.has(member)) throw new Error(`${who} isn't in ${space.name}`);
    if (!on && member === state.founder) throw new Error(`the owner always stays a ${role}`);
    this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(space), { kind: KIND_MAINTAINER, body: { member, on, ...(on ? {} : { upTo: this.upTo(member), at: this.anchor(member, space) }) } }));
  }

  /** A board of a space, by name or title. */
  board(space: StoredSpace, boards: Board[], ref: string): Board {
    const name = boardName(ref);
    const board = boards.find((b) => b.name === name) ?? boards.find((b) => b.title.toLowerCase() === ref.trim().toLowerCase());
    if (!board) throw new Error(`${space.name} has no board "${ref}" — it has ${boards.map((b) => b.name).join(', ')}`);
    return board;
  }

  async createSpace(kind: SpaceKind, name: string, extra: Record<string, Json> = {}): Promise<StoredSpace> {
    if (!name?.trim()) throw new Error(`a ${kind} needs a name`);
    const inside = this.core.companies.insideOnly();
    if (inside) throw new Error(inside);
    const space: StoredSpace = { ...newSpace(kind, name.trim(), this.node.identity.author), entry: { topics: [], bootstrap: [] } };
    await this.addSpace(space);
    this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(space), { kind: KIND_SPACE_CREATE, body: { name: space.name, ...extra } }));
    return space;
  }

  async addSpace(space: StoredSpace): Promise<void> {
    this.saveSpace(space);
    if (this.core.network) await Promise.all([...this.core.meetingTopics(space), ...space.entry.topics].map((t) => this.core.network!.join(t, { announce: !this.core.looksOnly(t) })));
  }

  saveSpace(space: StoredSpace): void {
    this.decoded = undefined;
    // New keys may open its setting and halves: read them again.
    this.core.managed.rawCache.delete(space.id);
    this.core.spaces.set(space.id, space);
    this.core.spaceStorage.save(space);
    // At once: what is written next in this space must not reach anyone who lost it.
    this.announceNow();
  }

  /**
   * The spaces this node holds, with the keys that prove it to peers (the
   * current epoch's first, then every one before: a member who hasn't got a
   * new key yet still meets the others and is handed the rekeys, however many
   * rotations they missed; see docs/v2-stage2.md, "Closing the grace key"):
   * its spaces, its direct chats, and its own private space, which only its
   * other devices hold.
   */
  #heldSpaces(): HeldSpace[] {
    // Listing may derive new direct chats, which would announce again: not from inside.
    this.#listingSpaces = true;
    try {
      this.ensureDirects();
    } finally {
      this.#listingSpaces = false;
    }
    const held = (space: SpaceKeys): HeldSpace => ({
      space: spaceScope(space),
      keys: Object.keys(space.keys).map(Number).sort((a, b) => b - a).map((epoch) => b64u.decode(space.keys[String(epoch)])),
      ...(this.core.spaces.has(space.id) && this.core.holding.pulled(space as StoredSpace) ? { pulled: { windowMs: RECENT_HOLD_MS } } : {}),
    });
    // Anyone whose log we hold can make our direct chat's key: only with those we chose to know does it let them in.
    const chosen = new Set<Did>([...this.core.people.contacts().keys(), ...(this.graph().get(this.node.identity.author)?.following ?? [])]);
    return [
      ...[...this.core.spaces.values()].map(held),
      ...[...this.directs.values()].map(({ space, peer }) => ({ ...held(space), admits: chosen.has(peer) })),
      { space: SELF_SCOPE, keys: [selfKey(this.core.selfSecret())] },
      // Meeting points: ours, which whoever we gave a link holds, and theirs, from the links we were given.
      ...[this.core.meetSecret(), ...this.core.theirMeets()].map((secret) => ({ space: meetTopic(secret), keys: [secret], proof: true as const })),
      // The front door: whoever has the public contact link gets in, here only (never on a computer that isn't one).
      ...(this.core.frontDoor() ? [{ space: meetTopic(this.core.doorSecret()), keys: [this.core.doorSecret()], proof: true as const }] : []),
    ];
  }

  /** Rekey events a peer ahead of us offered: take a key from those signed for a manager of the space, if a box opens for us. */
  #offeredKeys(items: WireItemV2[]): void {
    for (const { e } of items) {
      const record = recordOfV2(canonicalIdV2(e), e);
      if (canonicalKind(record.kind) !== KIND_REKEY || !this.node.replica.authority.check(record).ok) continue;
      this.takeKeys(record);
    }
  }

  #announcing = false;
  #listingSpaces = false;

  /** What a sync session asks this node: its spaces, keys offered, bodies it keeps, the copies friends hold from before. For SwarmNode, and tests that link nodes directly. */
  sessionAccess(): SpaceAccess {
    const node = this;
    return {
      spaces: () => this.#heldSpaces(),
      offerKeys: (items) => this.#offeredKeys(items),
      wantsBody: (space, id) => this.core.holding.wantsBody(space, id),
      keep: this.core.holding.keepAccess,
      farewells: () => this.core.farewells(),
      // Strangers are turned away: only peers that share a space, a chosen direct chat or one of our links get in.
      // Read for each new connection, so changing who reaches you (setReach) holds from the next one on.
      get firewall() {
        return node.node.config.firewall !== false;
      },
      fromBehind: (item) => this.#joinFromBehind(item),
      // Behind the firewall, a peer learns the public side of us and of those it shares something with here, never
      // of everyone we know (a newcomer through a contact link would otherwise get our family's names and faces).
      publicFor: (shared: ReadonlySet<string>) => (this.node.config.firewall !== false ? this.#publicFor(shared) : undefined),
    };
  }

  /** Whose public events a peer gets that shares these spaces with us (see SpaceAccess.publicFor). */
  #publicFor(shared: ReadonlySet<string>): ((author: Did) => boolean) | undefined {
    // One of our own devices: all of it.
    if (shared.has(SELF_SCOPE)) return undefined;
    const people = new Set<Did>([this.node.identity.author]);
    for (const scope of shared) {
      const parsed = parseScope(scope);
      if (!parsed) continue;
      const direct = this.directs.get(parsed.id);
      if (direct) {
        people.add(direct.peer);
        continue;
      }
      const space = this.core.spaces.get(parsed.id);
      if (!space) continue;
      const state = this.state(space);
      people.add(space.founder);
      for (const did of state.members.keys()) people.add(did);
    }
    return (author) => people.has(author);
  }

  /**
   * A control event from a peer that holds only an older key of a space: taken only if it's a join with an invite this
   * space made (a join that reached us after our newer key). Whoever's behind may also be someone removed: nothing
   * else of theirs counts here, and control events aren't rate-limited.
   */
  #joinFromBehind(item: WireItemV2): boolean {
    const scope = parseScope(item.e.space);
    const space = scope && this.core.spaces.get(scope.id);
    if (!space) return false;
    const d = this.decode(recordOfV2(canonicalIdV2(item.e), item.e, item.b));
    if (!d || canonicalKind(d.inner.kind) !== KIND_JOIN) return false;
    const invite = (d.inner.body as { invite?: unknown } | null)?.invite;
    return typeof invite === 'string' && this.decodedIn(space.id).some((x) => canonicalKind(x.inner.kind) === KIND_INVITE && (x.inner.body as { invite?: unknown } | null)?.invite === invite);
  }
  // ---------------------------------------------------------------- removals, settled and anchored

  /**
   * Two people who took each other's role at once (each removal or demotion
   * not naming the other as seen): as the owner, say which came first, by the
   * order this node got them, so every node ends up alike (H7hk7X9S).
   */
  settleLosses(): number {
    let settled = 0;
    for (const space of [...this.core.spaces.values()]) {
      if (space.founder !== this.node.identity.author || this.directs.has(space.id)) continue;
      const state = this.state(space);
      if (!mayDo(state, this.node.identity.author, 'own').ok) continue;
      for (const pair of state.unsettled ?? []) {
        this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(space), { kind: KIND_SETTLE, body: pair }));
        settled++;
      }
    }
    return settled;
  }

  /**
   * People removed before removals named what they saw (an anchor, see
   * spaces.ts): whoever manages the space anchors them now, once, by what this
   * node holds of them. What they sign past it counts as after their removal.
   */
  anchorRemovals(): number {
    let anchored = 0;
    for (const space of [...this.core.spaces.values()]) {
      if (this.directs.has(space.id)) continue;
      const state = this.state(space);
      if (!mayDo(state, this.node.identity.author, 'manage').ok || !state.removed.size) continue;
      for (const did of state.removed.keys()) {
        if (state.left.has(did) || state.members.has(did)) continue;
        const signers = this.node.replica.signers().filter((s) => this.node.replica.authority.personOf(s) === did);
        if (!signers.length || signers.every((s) => state.cutoffs?.some((c) => c.signer === s && c.c !== undefined))) continue;
        this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(space), { kind: KIND_REMOVE, body: { member: did, upTo: this.upTo(did), at: this.anchor(did, space) } }));
        anchored++;
      }
    }
    return anchored;
  }



  /** The space's rules for agents and services as they apply (company spaces: approved only), and who is approved. */
  #visitorsInfo(space: StoredSpace): NonNullable<SpaceInfo['visitors']> {
    const state = this.state(space);
    const fallback: VisitorRule = { who: state.managed ? 'approved' : 'everyone' };
    return {
      agents: state.visitors?.agents ?? fallback,
      services: state.visitors?.services ?? fallback,
      approved: [...(state.approvedAgents ?? [])].map((did) => {
        const grant = this.node.replica.authority.grant(did);
        return grant ? `${this.node.nameOf(grant.author) ?? grant.author}/${(grant.name ?? did.slice(8, 16)).replace(SERVICE_PREFIX, '')}` : did;
      }),
    };
  }



  /** Tell peers which spaces this node holds, right away (a key changed), and join the right meeting points soon. */
  announceNow(): void {
    if (!this.core.network || this.#listingSpaces) return;
    this.core.network.announce();
    this.#announceSoon();
  }

  /** Tell peers which spaces this node holds, once the current change is done. */
  #announceSoon(): void {
    if (!this.core.network || this.#announcing) return;
    this.#announcing = true;
    setImmediate(() => {
      this.#announcing = false;
      this.core.network?.announce();
      this.#refreshTopics();
    });
  }

  /** Join the meeting points this node should be at now, and leave those it shouldn't (a space's key moved on, or it left). */
  #refreshTopics(): void {
    const swarm = this.core.network;
    if (!swarm) return;
    const wanted = new Set(this.node.topics);
    for (const topic of wanted) if (!swarm.joined.includes(topic)) swarm.join(topic, { announce: !this.core.looksOnly(topic) }).catch(() => {});
    for (const topic of swarm.joined) if (!wanted.has(topic)) swarm.leave(topic).catch(() => {});
  }

  /** Where our links say we're found: our meeting point, with its secret (holding it lets whoever has the link in). */
  entryPoint(): Invite['entry'] {
    const secret = this.core.meetSecret();
    return { topics: [meetTopic(secret)], bootstrap: this.node.config.bootstrap, meet: b64u.encode(secret) };
  }

  /** Someone on a private network (e.g. a local testnet) brings us onto it. */
  adoptBootstrap(entry: Invite['entry']): void {
    const key = (list: Invite['entry']['bootstrap']) => JSON.stringify(list.map((b) => `${b.host}:${b.port}`).sort());
    if (key(entry.bootstrap) === key(this.node.config.bootstrap)) return;
    const describe = (list: Invite['entry']['bootstrap']) => (list.length ? `the private network at ${list.map((b) => `${b.host}:${b.port}`).join(', ')}` : 'the public network');
    // A brand-new node may follow its first link onto a private network (handy for test networks):
    // it has nothing there yet to lose. An established node never switches silently.
    const fresh = this.node.config.bootstrap.length === 0 && this.core.spaces.size === 0 && this.core.people.contacts().size === 0 && !(this.graph().get(this.node.identity.author)?.following.size);
    if (fresh && entry.bootstrap.length) {
      this.node.config = { ...this.node.config, bootstrap: entry.bootstrap };
      this.core.saveConfig();
      return;
    }
    const fix = entry.bootstrap.length ? `weave bootstrap ${entry.bootstrap.map((b) => `${b.host}:${b.port}`).join(' ')}` : 'weave bootstrap --clear';
    throw new Error(
      `this link comes from ${describe(entry.bootstrap)}, but your node uses ${describe(this.node.config.bootstrap)}, so you couldn't reach each other. ` +
        `To switch on purpose: "${fix}", restart your node, then use the link again.`,
    );
  }

  /** Record admissions into a project and hand the newcomers its keys through the group they came by. */
  admitAll(project: StoredSpace, group: StoredSpace, dids: Did[]): void {
    if (!dids.length) return;
    // Letting them in would need a new key we can't give: someone who manages the project does it.
    if (!mayDo(this.state(project), this.node.identity.author, 'manage').ok && this.#needsFreshKey(project)) return;
    for (const member of dids) this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(project), { kind: KIND_ADMIT, body: { member, via: group.id } }));
    this.node.replica.write(this.node.identity, gift(this.keysForNewcomers(project), dids, spaceScope(group), this.entryPoint(), this.core.encryptionKeyOf));
  }

  /** Joins to and departures from a project's invited groups that this node can see (it must be in the group). */
  changes(project: StoredSpace, state: SpaceState): Admission[] {
    const changes: Admission[] = [];
    const projectRef: SpaceRef = { id: project.id, kind: 'project', name: project.name };
    for (const invited of state.groups.values()) {
      const group = this.core.spaces.get(invited.id);
      if (!group) continue;
      const groupMembers = this.state(group).members;
      const groupRef: SpaceRef = { id: group.id, kind: 'group', name: group.name };
      for (const did of groupMembers.keys()) {
        // Someone removed from the project stays out, whatever groups they're in (unless they left on their own).
        const removed = state.removed.has(did) && !state.left.has(did);
        if (!state.members.has(did) && !removed && state.declined.get(did) !== group.id) changes.push({ project: projectRef, did, name: this.node.nameOf(did), group: groupRef, change: 'join' });
      }
      for (const member of state.members.values()) {
        if (member.via === group.id && !groupMembers.has(member.did) && member.did !== state.founder) {
          changes.push({ project: projectRef, did: member.did, name: this.node.nameOf(member.did), group: groupRef, change: 'leave' });
        }
      }
    }
    return changes;
  }

  /** New epoch keys from a rekey, or a whole space gifted to us when a project admitted us. */
  takeKeys(event: WeaveRecord): void {
    if (canonicalKind(event.kind) === KIND_REKEY) {
      const space = this.core.spaces.get(parseScope(event.scope)?.id ?? '');
      // Judged by whether its author managed the space when they made it, not today (a member back after a handover still takes it).
      if (!space || !mayDoAt(this.state(space), event, 'manage').ok) return;
      const opened = this.core.tryOpen((me) => openRekey(event, me));
      if (!opened || space.shredded?.includes(opened.epoch)) return;
      const epoch = String(opened.epoch);
      if (!space.keys[epoch]) {
        space.keys[epoch] = opened.key;
        (space.rekeyers ??= {})[epoch] = event.author;
        this.saveSpace(space);
        return;
      }
      if (space.keys[epoch] === opened.key || space.alternates?.[epoch]?.includes(opened.key)) return;
      // Two managers rekeyed at once: keep every key of the epoch, and all seal with the one from the rekey with the lowest id.
      const state = this.state(space);
      const all = this.node.replica
        .events((e) => e.scope === event.scope && canonicalKind(e.kind) === KIND_REKEY && mayDoAt(state, e, 'manage').ok)
        .flatMap((e) => {
          const o = this.core.tryOpen((me) => openRekey(e, me));
          return o && String(o.epoch) === epoch ? [{ id: e.id, key: o.key, author: e.author }] : [];
        })
        .sort((a, b) => a.id.localeCompare(b.id));
      const keys = [...new Set([...all.map((k) => k.key), space.keys[epoch], ...(space.alternates?.[epoch] ?? [])])];
      space.keys[epoch] = all[0]?.key ?? space.keys[epoch];
      if (all[0]) (space.rekeyers ??= {})[epoch] = all[0].author;
      (space.alternates ??= {})[epoch] = keys.filter((k) => k !== space.keys[epoch]);
      this.saveSpace(space);
      return;
    }
    const opened = this.core.tryOpen((me) => openGift(event, me));
    if (!opened) return;
    // Only accept gifts posted in a group we're in, by someone in that group,
    // or a tier's keys from the creator we asked to join it.
    const via = this.core.spaces.get(parseScope(event.scope)?.id ?? '');
    const viaGroup = !!via && via.kind === 'group' && this.state(via).members.has(event.author);
    const asked = opened.space.kind === 'group' && opened.space.founder === event.author && this.core.selfBodies(KIND_MEMBERSHIP_PENDING).some((b) => b.tier === opened.space.id && b.creator === event.author);
    // Or the keys of a space we knocked on, from the person whose link we used.
    const knocked = this.core.selfBodies(KIND_KNOCK_PENDING).some((b) => b.space === opened.space.id && b.inviter === event.author);
    if (!viaGroup && !asked && !knocked) return;
    const known = this.core.spaces.get(opened.space.id);
    if (known) {
      let added = false;
      // For a space we hold, a gifted key counts only if it opens something sealed with it there (8R9bN-yO): anyone in a
      // group with us can gift, and a made-up key for an epoch to come would keep the real one out.
      for (const [epoch, key] of Object.entries(opened.space.keys)) {
        if (!known.keys[epoch] && !known.shredded?.includes(Number(epoch)) && this.#opensSomething(known, epoch, key)) (known.keys[epoch] = key), (added = true);
      }
      for (const [board, epochs] of Object.entries((opened.space as StoredSpace).boards ?? {})) {
        for (const [epoch, key] of Object.entries(epochs)) if (!known.boards?.[board]?.[epoch] && this.#opensSomething(known, epoch, key, board)) (((known.boards ??= {})[board] ??= {})[epoch] = key), (added = true);
      }
      if (added) this.saveSpace(known);
      return;
    }
    void this.addSpace({ ...opened.space, entry: opened.entry, via: event.author });
  }

  /** Does a key we're handed open something sealed with it in this space (an epoch's events, or a board's)? */
  #opensSomething(space: StoredSpace, epoch: string, key: string, board?: string): boolean {
    const scope = spaceScope(space);
    const withKey = { ...space, keys: { ...space.keys, [epoch]: key } };
    for (const e of this.node.replica.events((r) => r.kind === KIND_SEALED && r.scope === scope && !r.missing)) {
      if (board === undefined) {
        if ((e.body as { epoch?: unknown } | null)?.epoch === Number(epoch) && openIn(withKey, e)) return true;
        continue;
      }
      const inner = openIn(space, e);
      const b = inner?.body as { board?: unknown; epoch?: unknown } | null | undefined;
      if (inner?.kind === KIND_BOARD_SEALED && b?.board === board && b.epoch === Number(epoch) && openBoard(space, inner, { [board]: { [epoch]: key } })) return true;
    }
    return false;
  }

  anchor(person: Did, space: StoredSpace): Record<string, { c: number; s: number; n: number }> {
    // In the space itself, each key's control head and last content (see Anchor in spaces.ts): numbered there without gaps.
    const scope = spaceScope(space);
    const out: Record<string, { c: number; s: number; n: number }> = {};
    for (const signer of this.node.replica.signers()) {
      if (this.node.replica.authority.personOf(signer) !== person) continue;
      const n = this.node.replica.number(signer);
      if (n > 0) out[signer] = { c: this.node.replica.store.chainHead(signer, scope)?.seq ?? 0, s: this.node.replica.store.contentCount(signer, scope), n };
    }
    return out;
  }

  /**
   * The last number of each of a person's keys (devices, agents) this node
   * holds: what a removal, demotion, leave or handover names as counting before
   * it. Whatever those keys sign numbered past it counts as after, whatever date
   * it claims (Julian's backdating issue).
   */
  upTo(person: Did): Record<string, number> {
    const out: Record<string, number> = {};
    for (const signer of this.node.replica.signers()) {
      if (this.node.replica.authority.personOf(signer) !== person) continue;
      const n = this.node.replica.number(signer);
      if (n > 0) out[signer] = n;
    }
    return out;
  }

  state(space: StoredSpace): SpaceState {
    const direct = this.directs.get(space.id);
    if (direct) {
      // Two people, no membership events: the key itself says who is in.
      const member = (did: Did): [Did, Member] => [did, { did, since: '' }];
      return { kind: 'direct', founder: space.founder, members: new Map([member(this.node.identity.author), member(direct.peer)]), removed: new Map(), maintainers: new Set(), groups: new Map(), declined: new Map(), left: new Set() };
    }
    this.decodeAll();
    const key = `${this.#decodedGeneration}:${this.#controlRevision.get(space.id) ?? 0}`;
    const kept = this.#stateCache.get(space.id);
    if (kept?.key === key) return kept.state;
    const state = spaceState(space.kind, space.founder, this.decodedIn(space.id), { arrival: (e) => this.node.replica.arrival((e as { id?: string }).id ?? '') });
    this.#stateCache.set(space.id, { key, state });
    return state;
  }

  page(project: StoredSpace, state: SpaceState): ProjectPage {
    let page = DEFAULT_PAGE;
    for (const d of this.decodeAll()) {
      if (d.space?.id !== project.id || d.inner.kind !== KIND_PAGE || !mayDo(state, d.event.author, 'curate').ok) continue;
      const body = (d.inner.body ?? {}) as Record<string, unknown>;
      const text = (key: string, max: number) => (typeof body[key] === 'string' ? (body[key] as string).slice(0, max) : undefined);
      // Pages from before titles and bodies had only a description: it becomes the body.
      const legacy = body.body === undefined && body.subtitle === undefined;
      const subtitle = text('subtitle', 300) ?? '';
      const pageBody = text('body', 100_000) ?? (legacy ? (text('description', 5000) ?? '') : '');
      const icon = parseBlobRef(body.icon) ? (body.icon as string) : undefined;
      const banner = parseBlobRef(body.banner) ? (body.banner as string) : undefined;
      page = {
        title: text('title', 100) ?? '',
        subtitle,
        body: pageBody,
        ...(icon ? { icon } : {}),
        ...(banner ? { banner } : {}),
        description: subtitle || summary(pageBody),
        status: PROJECT_STATUSES.includes(body.status as ProjectStatus) ? (body.status as ProjectStatus) : page.status,
        public: body.public === true,
      };
    }
    return page;
  }

  spaceInfo(space: StoredSpace): SpaceInfo {
    const state = this.state(space);
    return {
      id: space.id,
      kind: space.kind,
      name: this.spaceName(space),
      founder: state.founder,
      founderName: this.node.nameOf(state.founder),
      members: state.members.size,
      epoch: currentEpoch(space),
      ...(space.kind !== 'direct' ? { channels: channelsOf(this.entries(space)) } : {}),
      ...(space.kind === 'project' && this.page(space, state).icon ? { icon: this.page(space, state).icon } : {}),
      ...this.#spacePhoto(space, state),
      ...(state.closed ? { closed: true as const } : {}),
      history: state.history?.value ?? 'all',
      ...(state.managed ? { managed: this.core.managed.managedInfo(space, state.managed) } : {}),
      ...(space.kind !== 'direct' ? { visitors: this.#visitorsInfo(space) } : {}),
      ...(this.core.retention.held(state) ? { hold: { until: state.hold!.until, reason: state.hold!.reason } } : {}),
      ...(this.core.homeHidden().has(space.id) ? { hiddenFromHome: true as const } : {}),
      ...(this.#mayInvite(space, state) ? { mayInvite: true as const } : {}),
    };
  }

  /** Whether this node may make invite links to a space: as Membership.invite decides it. */
  #mayInvite(space: StoredSpace, state: SpaceState): boolean {
    if (space.kind === 'direct' || state.closed) return false;
    const me = this.node.identity.author;
    if (state.tier && !mayDo(state, me, 'invite').ok) return false;
    return mayDo(state, me, 'invite').ok || (space.kind !== 'project' && this.mineFounder(space));
  }

  /** A space's photo and banner text, as its founder, maintainers or moderators last set them. */
  #spacePhoto(space: StoredSpace, state: SpaceState): { photo?: string; bannerText?: string; background?: string; membersOnBanner?: true; photoOrder?: Did[]; photoPoses?: Record<Did, string>; photoInList?: boolean } {
    if (space.kind === 'direct') return {};
    const managers = this.managers(state);
    let out: { photo?: string; bannerText?: string; background?: string; membersOnBanner?: true; photoOrder?: Did[]; photoPoses?: Record<Did, string>; photoInList?: boolean } = { photoInList: space.kind !== 'project' };
    for (const e of this.entries(space)) {
      if (e.kind !== KIND_SPACE_PHOTO || !managers.has(e.event.author)) continue;
      const body = (e.body ?? {}) as Record<string, unknown>;
      const banner = typeof body.banner === 'string' ? body.banner.trim().slice(0, 40) : '';
      out = { ...(parseBlobRef(body.photo) ? { photo: body.photo as string } : {}), ...(banner ? { bannerText: banner } : {}), ...(parseBlobRef(body.background) ? { background: body.background as string } : {}), ...(space.kind === 'project' && body.members === true ? { membersOnBanner: true as const } : {}), ...((order) => (order.length ? { photoOrder: order } : {}))(photoOrderOf(body.order)), ...((poses) => (Object.keys(poses).length ? { photoPoses: poses } : {}))(photoPosesOf(body.poses)), photoInList: typeof body.list === 'boolean' ? body.list : space.kind !== 'project' };
    }
    return out;
  }

  /**
   * A space's photo: a picture of its own, or none for everyone's avatars together; the banner's text; and the
   * background behind the group photo. Its founder, maintainers or moderators set it. Empty removes; left out stays.
   */
  async setSpacePhoto(input: { space: string; photo?: string; banner?: string; background?: string; members?: boolean; order?: string[]; poses?: Record<string, string>; list?: boolean; as?: string }): Promise<SpaceInfo> {
    const space = this.space(input.space);
    if (space.kind === 'direct') throw new Error('a direct chat has no photo');
    const state = this.state(space);
    if (!mayDo(state, this.node.identity.author, 'curate').ok) throw new Error(`only those who run ${space.name} set its photo`);
    if (input.as) this.core.agentMay(input.as, KIND_SPACE_PHOTO);
    for (const image of [input.photo, input.background]) if (image && !parseBlobRef(image)) throw new Error('a photo or background is an uploaded image (a wblob: reference)');
    if (input.banner !== undefined && input.banner.trim().length > 40) throw tooLong('The banner', input.banner.trim().length, 40);
    const before = this.#spacePhoto(space, state);
    const photo = input.photo === undefined ? before.photo : input.photo || undefined;
    const banner = input.banner === undefined ? before.bannerText : input.banner.trim() || undefined;
    const background = input.background === undefined ? before.background : input.background || undefined;
    if (input.members && space.kind !== 'project') throw new Error("members stand on a project's banner; only projects have one");
    const members = input.members ?? !!before.membersOnBanner;
    if (input.order && input.order.length !== photoOrderOf(input.order).length) throw new Error("the photo's order lists people by their keys (did:key:…), each once, at most 100");
    const order = input.order ?? before.photoOrder ?? [];
    if (input.poses && Object.keys(input.poses).length !== Object.keys(photoPosesOf(input.poses)).length) throw new Error("the photo's poses go by people's keys (did:key:…), each a pose's id like wave or idea, at most 100");
    const poses = input.poses ? photoPosesOf(input.poses) : (before.photoPoses ?? {});
    const list = input.list ?? before.photoInList ?? space.kind !== 'project';
    await this.node.publish({ kind: KIND_SPACE_PHOTO, body: { photo: photo ?? '', banner: banner ?? '', background: background ?? '', members, order, poses, list }, space: space.id, as: input.as });
    return this.spaceInfo(space);
  }

  /** A space's name; a direct chat is named after the other person. */
  spaceName(space: StoredSpace): string {
    const peer = this.directs.get(space.id)?.peer;
    return peer ? (this.node.nameOf(peer) ?? `${peer.slice(8, 16)}…`) : space.name;
  }

  /** Friends: people I follow who follow me back. */
  friends(): Did[] {
    return friendsOf(this.graph(), this.node.identity.author);
  }

  /** The direct chat with someone, derived once and remembered for this run. */
  direct(peer: Did): StoredSpace {
    let space = this.directByPeer.get(peer);
    if (!space) {
      space = { ...directSpace({ author: this.node.identity.author, keys: this.core.myEncryptionPairs() }, peer, this.node.replica.authority.encryptionKeys(peer)), entry: { topics: [peer], bootstrap: [] } };
      this.directByPeer.set(peer, space);
      this.directs.set(space.id, { space, peer });
      this.#announceSoon();
    }
    return space;
  }

  /** Derive the direct chats with everyone whose log we hold (people, not their agents' keys). */
  ensureDirects(): void {
    for (const signer of this.node.replica.signers()) this.#ensureDirectFor(signer);
  }

  #ensureDirectFor(signer: Did): void {
    const person = this.node.replica.authority.personOf(signer);
    if (person !== this.node.identity.author && !this.directByPeer.has(person) && !this.node.replica.authority.grant(person)) this.direct(person);
  }

  // ---------------------------------------------------------------- internals: posts

  /** Your saves, from your self-sealed events. */
  #saves(): Map<string, SaveMode> {
    return this.memo('saves', () => {
      const mine = this.decodeAll()
        .filter((d) => d.private && d.inner.kind === KIND_SAVE)
        .map((d) => ({ id: d.id, event: d.event, kind: d.inner.kind, body: d.inner.body }));
      return savesOf(mine);
    });
  }

  /** How many messages each post's chat has, and when the latest came. */
  #chats(entries: Entry[]): Map<string, { count: number; last: string }> {
    const chats = new Map<string, { count: number; last: string }>();
    for (const e of entries) {
      const body = e.body as { post?: unknown; target?: unknown } | null;
      const post = e.kind === KIND_MSG ? body?.post : e.kind === KIND_REPLY ? body?.target : undefined;
      if (typeof post !== 'string') continue;
      const chat = chats.get(post) ?? { count: 0, last: '' };
      chat.count++;
      if (e.event.time > chat.last) chat.last = e.event.time;
      chats.set(post, chat);
    }
    return chats;
  }

  /** All posts in a project's boards or a community, and its boards. */
  spacePosts(space: StoredSpace): { posts: PostInfo[]; boards: Board[] } {
    const entries = this.entries(space);
    const state = this.state(space);
    const access = space.kind === 'project' ? this.access(space, state, entries) : undefined;
    const me = this.node.identity.author;
    // Boards we may not read stay out of sight altogether.
    const boards = boardsOf(space.kind, entries, state.maintainers).filter((b) => !access?.rules.get(b.name)?.read || !state.members.has(me) || mayUse('read', b.name, me, state, access));
    const known = new Set(boards.map((b) => b.name));
    const pinned = new Set(boards.flatMap((b) => b.pinned));
    const issues = new Map(space.kind === 'project' ? issuesOf(entries).map((i) => [i.id, i]) : []);
    const proposals = new Map(space.kind === 'project' ? proposalsOf(entries, this.voters(space)).map((p) => [p.id, p]) : []);
    const rules = boardRulesOf(entries, this.managers(state), this.core.seenAt);
    const around = this.aroundPosts(entries);
    const visible = postsOf(space.kind, entries, state.maintainers).filter((p) => known.has(p.board)); // posts of dropped boards stay in the logs, out of sight
    const ctx = { scores: scoresOf(entries), chats: this.#chats(entries), saves: this.#saves(), entries, prefixes: shortPrefixes(visible.map((p) => p.id)) };
    const minDays = this.core.companies.companyRetention(space)?.minDays;
    // Each author's share of each board with a rule: their bytes against an even split (stage 8).
    const overuse = new Map<string, number>();
    for (const board of rules.keys()) {
      const mine = new Map<Did, number>();
      for (const p of visible.filter((x) => x.board === board)) mine.set(p.author, (mine.get(p.author) ?? 0) + p.title.length + p.text.length);
      const total = [...mine.values()].reduce((a, b) => a + b, 0);
      for (const [author, bytes] of mine) if (total && mine.size > 1) overuse.set(`${board} ${author}`, bytes / (total / mine.size));
    }
    const posts = visible
      .map((p) => {
        const info = this.#postInfo(p, space, ctx);
        if (pinned.has(p.id)) info.pinned = true;
        const near = around.get(p.id);
        const active = near && near.last > info.active ? near.last : info.active;
        const permanent = p.type !== 'post' || (space.kind === 'project' && p.board === 'releases');
        info.lifetime = lifetimeOf({ active, upvotes: ctx.scores.get(p.id)?.up ?? 0, rule: rules.get(p.board), pinned: info.pinned, permanent, overuse: overuse.get(`${p.board} ${p.author}`), ...(minDays ? { minDays } : {}) });
        if (p.author === this.node.identity.author || state.founder === this.node.identity.author) info.lifetime.yours = true;
        const issue = issues.get(p.id);
        if (issue) info.issue = { status: issue.status, labels: issue.labels, ...(issue.assignee ? { assignee: this.actor(issue.assignee.author, issue.assignee.signer) } : {}) };
        const proposal = proposals.get(p.id);
        if (proposal) info.proposal = this.proposalInfo(proposal);
        return info;
      });
    if (this.core.holding.pulled(space, state)) {
      const members = [...state.members.keys()];
      const recent = new Date(this.node.clock() - RECENT_HOLD_MS).toISOString();
      for (const p of posts) p.heldBy = this.core.holding.heldBy(p, members, p.active >= recent);
    }
    // A board over its size: the posts that would go soonest go now.
    for (const [board, rule] of rules) {
      const inBoard = posts.filter((p) => p.board === board).map((p) => ({ id: p.id, lifetime: p.lifetime!, bytes: (around.get(p.id)?.bytes ?? 0) + JSON.stringify(p.text).length + p.title.length, overuse: overuse.get(`${board} ${p.by.did}`) }));
      const full = overBudget(inBoard, rule, this.node.clock());
      for (const post of posts) if (full.has(post.id)) post.lifetime = { until: new Date(this.node.clock()).toISOString(), upvotes: 0, addedDays: 0, full: true, ...(post.lifetime?.yours ? { yours: true as const } : {}) };
    }
    return { posts, boards };
  }

  ruleInfo(rule: BoardRule): NonNullable<BoardInfo['rule']> {
    return { keepDays: rule.keepDays, maxMB: rule.maxMB, by: this.actor(rule.by, rule.by), time: rule.time };
  }

  /** Who manages a space's rules: its maintainers or moderators, and its owner. */
  managers(state: SpaceState): Set<Did> {
    return managersOf(state);
  }

  /** Per post, what goes with it: its last activity (edits, chat, upvotes, keep), its size, and the events to forget with it. */
  aroundPosts(entries: Entry[]): Map<string, { last: string; bytes: number; ids: Array<{ id: string; author: Did }> }> {
    const out = new Map<string, { last: string; bytes: number; ids: Array<{ id: string; author: Did }> }>();
    for (const e of entries) {
      const body = e.body as { post?: unknown; target?: unknown } | null;
      const post = typeof body?.post === 'string' ? body.post : typeof body?.target === 'string' ? body.target : undefined;
      if (!post) continue;
      const near = out.get(post) ?? { last: '', bytes: 0, ids: [] };
      if (e.event.time > near.last) near.last = e.event.time;
      near.bytes += JSON.stringify(e.body).length;
      near.ids.push({ id: e.id, author: e.event.author });
      out.set(post, near);
    }
    return out;
  }

  /** A project shown as a post: its id is the event that created it. */
  projectPost(project: StoredSpace): PostInfo | undefined {
    const entries = this.entries(project);
    const created = entries.find((e) => canonicalKind(e.kind) === KIND_SPACE_CREATE && e.event.author === project.founder);
    if (!created) return undefined;
    const state = this.state(project);
    const page = this.page(project, state);
    const score = scoresOf(entries).get(created.id);
    const messages = entries.filter((e) => e.kind === KIND_MSG);
    // Active by its chat: a post there is on Home itself and moves up there, not the project (nor services' events).
    const active = [created.event.time, ...messages.map((e) => e.event.time)].reduce((a, b) => (b > a ? b : a));
    const saved = this.#saves().get(created.id);
    return {
      id: created.id,
      short: created.id.slice(0, 8),
      url: postUrl({ id: created.id, title: project.name, space: project, project: true }, this.core.prefix()),
      type: 'project',
      space: { id: project.id, kind: 'project', name: project.name },
      by: this.actor(project.founder, project.founder),
      title: project.name,
      text: page.description,
      time: created.event.time,
      active,
      score: score?.score ?? 0,
      myVote: score?.votes.get(this.node.identity.author) ?? 0,
      chat: messages.length,
      pinned: false,
      ...(saved ? { saved } : {}),
      project: { id: project.id, name: project.name, description: page.description, status: page.status, ...(page.icon ? { icon: page.icon } : {}), participants: state.members.size, member: true },
    };
  }

  #postInfo(p: Post, space: StoredSpace | undefined, ctx: { scores: Map<string, Score>; chats: Map<string, { count: number; last: string }>; saves: Map<string, SaveMode>; entries?: Entry[]; prefixes?: Map<string, string> }): PostInfo {
    const score = ctx.scores.get(p.id);
    const chat = ctx.chats.get(p.id);
    const saved = ctx.saves.get(p.id);
    const info: PostInfo = {
      id: p.id,
      short: p.id.slice(0, 8),
      url: postUrl({ id: p.id, title: p.title, ...(space ? { space, board: p.board } : { author: this.actor(p.author, p.author).name }) }, this.core.prefix(ctx.prefixes)),
      type: p.type,
      ...(space ? { space: { id: space.id, kind: space.kind, name: space.name }, board: p.board } : {}),
      by: this.actor(p.author, p.signer, p.session),
      title: p.title,
      text: p.text,
      ...(p.link ? { link: p.link } : {}),
      ...(p.image ? { image: p.image } : {}),
      ...(p.scene ? { scene: p.scene } : {}),
      ...(p.prompt ? { prompt: p.prompt } : {}),
      ...(p.routine ? { routine: p.routine } : {}),
      time: p.time,
      ...(p.edited ? { edited: p.edited } : {}),
      active: chat && chat.last > p.time ? chat.last : p.time,
      score: score?.score ?? 0,
      myVote: score?.votes.get(this.node.identity.author) ?? 0,
      chat: chat?.count ?? 0,
      pinned: false,
      ...(saved ? { saved } : {}),
    };
    if (p.with && ctx.entries) {
      // Everyone sees confirmed co-authors; the post's author also sees who was asked and who declined.
      const own = p.author === this.node.identity.author;
      const coauthors = coauthorsOf(p, ctx.entries, this.core.content.keyFacts)
        .filter((c) => own || c.state === 'confirmed')
        .map((c) => ({ ...this.core.content.keyActor(c.did), state: c.state }));
      if (coauthors.length) info.coauthors = coauthors;
    }
    if (p.share) {
      info.share = { ...(p.share.space ? { space: p.share.space } : {}), post: p.share.post, member: !!p.share.space && this.core.spaces.has(p.share.space.id) };
      if (p.share.project) {
        const mine = this.core.spaces.get(p.share.project.id);
        const icon = mine ? this.page(mine, this.state(mine)).icon : p.share.project.icon;
        info.project = { ...p.share.project, ...(icon ? { icon } : {}), member: !!mine, ...(mine ? { participants: this.state(mine).members.size } : {}) };
      }
    }
    return info;
  }

  /** Public posts by you and the people you follow, upvoted in public. */
  #publicPosts(): PostInfo[] {
    const following = this.graph().get(this.node.identity.author)?.following ?? new Set<Did>();
    const hidden = this.hiddenAuthors();
    const entries = this.decodeAll()
      .filter((d) => !d.space && !d.private)
      .map((d) => ({ id: d.id, event: d.event, kind: d.inner.kind, body: d.inner.body }));
    const posts = postsOf(undefined, entries).filter((p) => (p.author === this.node.identity.author || following.has(p.author)) && !hidden.has(p.author));
    const ctx = { scores: scoresOf(entries), chats: new Map(), saves: this.#saves(), entries, prefixes: shortPrefixes(posts.map((p) => p.id)) };
    return posts.map((p) => this.#postInfo(p, undefined, ctx));
  }

  /**
   * Home: your communities' posts, your projects, and public posts from people
   * you follow, from all of them or one kind of source. Spaces you hid from
   * Home stay out (pass `from` undefined to get everything, e.g. to look a post up).
   */
  homePosts(from?: HomeSource): PostInfo[] {
    const me = this.node.identity.author;
    const hidden = this.hiddenAuthors();
    const hiddenSpaces = from ? this.core.homeHidden() : new Set<string>();
    const friends = from === 'friends' ? new Set(friendsOf(this.graph(), me)) : new Set<Did>();
    const wants = (kind: 'community' | 'project' | 'public') =>
      !from || from === 'all' || (kind === 'community' ? from === 'communities' : kind === 'project' ? ['projects', 'mine', 'friends'].includes(from) : ['following', 'friends', 'mine'].includes(from));
    const said = this.core.boardFollows();
    const posts: PostInfo[] = [];
    for (const space of this.core.spaces.values()) {
      if (hiddenSpaces.has(space.id)) continue;
      if (space.kind === 'community' && wants('community')) posts.push(...this.spacePosts(space).posts);
      if (space.kind === 'project' && wants('project')) {
        const state = this.state(space);
        if (from === 'mine' && state.founder !== me && !state.maintainers.has(me)) continue;
        if (from === 'friends' && !friends.has(state.founder)) continue;
        const post = this.projectPost(space);
        if (post) posts.push(post);
        posts.push(...this.spacePosts(space).posts.filter((p) => p.board && this.core.follows(space.id, p.board, said)));
      }
    }
    if (wants('public')) {
      for (const p of this.#publicPosts()) {
        // Shared projects: yours under "mine", your friends' under "friends"; "following" takes every public post.
        if (from === 'mine' && !(p.project && p.by.did === me)) continue;
        if (from === 'friends' && !(p.project && friends.has(p.by.did))) continue;
        // On Home, a share of a project you're in is already there as the project itself.
        if (from && p.project && posts.some((q) => q.type === 'project' && q.space?.id === p.project!.id)) continue;
        posts.push(p);
      }
    }
    return posts.filter((p) => !hidden.has(p.by.did));
  }

  // ---------------------------------------------------------------- internals: reading

  sealForSelf(inner: Inner): EventFields {
    const key = selfKey(this.core.selfSecret());
    return { kind: KIND_SEALED, scope: SELF_SCOPE, class: classOf(inner.kind), body: seal(key, inner as unknown as Json, `weave/self/v1:${this.node.identity.author}`) };
  }

  decode(event: WeaveRecord): Decoded | undefined {
    const decoded = this.decodeInner(event);
    return decoded && { ...decoded, id: event.id };
  }

  decodeInner(event: WeaveRecord): Omit<Decoded, 'id'> | undefined {
    if (canonicalKind(event.kind) === KIND_REKEY || event.kind === KIND_GIFT) return undefined; // key plumbing, not content
    if (event.missing) return undefined; // decoded when its body comes
    if (event.kind !== KIND_SEALED) return { event, inner: { kind: event.kind, body: event.body } };

    let decoded: Omit<Decoded, 'id'> | undefined;
    if (event.scope === SELF_SCOPE) {
      if (event.author !== this.node.identity.author) return undefined;
      try {
        const key = selfKey(this.core.selfSecret());
        const inner = open(key, event.body as Sealed, `weave/self/v1:${event.author}`) as unknown as Inner;
        decoded = { event, inner, private: true };
      } catch {
        return undefined;
      }
    } else {
      const scope = parseScope(event.scope);
      let space = this.core.spaces.get(scope?.id ?? '') ?? this.directs.get(scope?.id ?? '')?.space;
      // A direct message from someone new: their chat with us is the one derived from their key.
      if (!space && scope?.kind === 'direct' && event.author !== this.node.identity.author) {
        const candidate = this.direct(event.author);
        if (candidate.id === scope.id) space = candidate;
      }
      // The setting and the company halves are sealed with the Weave half alone; nothing else counts that way in a managed space.
      const raw = space ? openIn(space, event) : undefined;
      const inner = space && (openIn(this.core.managed.cipher(space), event) ?? (raw && (raw.kind === KIND_KMS || raw.kind === KIND_MANAGED) ? raw : undefined));
      if (!inner) return undefined;
      decoded = { event, inner, space };
      // An event of a read-limited board: readable only with that board's key.
      if (inner.kind === KIND_BOARD_SEALED) {
        const opened = space?.kind === 'project' ? openBoard(space, inner, space.boards) : undefined;
        if (!opened) return undefined;
        decoded = { event, inner: { kind: opened.kind, body: opened.body }, space, board: opened.board, outer: inner };
      }
    }
    // A delegated key may carry sealed events, but only of kinds it was granted.
    if (event.signer !== event.author) {
      const grant = this.node.replica.authority.grant(event.signer);
      if (!grant || !permits(grant.permissions, decoded.inner.kind)) return undefined;
    }
    // The farewell a node leaves for v0.3 peers when it moves to v0.4: not for v0.4 eyes.
    if (decoded.inner.kind === KIND_MSG && (decoded.inner.body as { moved?: unknown } | null)?.moved !== undefined) return undefined;
    return decoded;
  }

  decodeAll(): Decoded[] {
    // A managed key used for these views ran out: decode again without it.
    if (this.decoded && this.node.clock() >= this.core.managed.decodedValidUntil) this.decoded = undefined;
    if (!this.decoded) this.core.managed.decodedValidUntil = Infinity;
    // Board keys arrive inside the project: taking one makes more events readable, so decode again. Keys of what is
    // decoded already were taken when it was (and decodedAdd takes those that arrive): a kept view isn't scanned again.
    for (let round = 0; round < 4 && !this.decoded; round++) {
      {
        this.ensureDirects();
        const plain = this.node.replica.events().flatMap((event) => {
          const d = this.decode(event);
          return d ? [d] : [];
        });
        const decoded = this.#approvedOnly([...plain.filter((d) => d.inner.kind !== KIND_CARRY), ...this.#trustedCarries(plain)]);
        // What a carry restates and we can read ourselves counts once, as read.
        // (and restated by several carries, once).
        const read = new Set(decoded.filter((d) => !d.carried).map((d) => d.id));
        this.decoded = decoded.filter((d) => !d.carried || (!read.has(d.id) && (read.add(d.id), true))).sort((a, b) => replicaOrder(a.event, b.event));
        this.decodedRevision++;
        this.#decodedGeneration++;
        this.#bySpace.clear();
        this.#spaceCache.clear();
        this.#stateCache.clear();
        for (const d of this.decoded) {
          if (!d.space) continue;
          const list = this.#bySpace.get(d.space.id);
          if (list) list.push(d);
          else this.#bySpace.set(d.space.id, [d]);
        }
      }
      if (!this.#takeBoardKeys(this.decoded)) break;
    }
    return this.decoded!;
  }

  /**
   * A new event: decode just it and put it in its place (replica order: time,
   * signer, seq). Events that change keys or rights make everything decode
   * again instead, the next time it's needed (they are rare): key events change
   * which signers count, and new space or board keys (taken before this runs)
   * have already dropped the decoded events.
   */
  decodedAdd(event: WeaveRecord): void {
    const decoded = this.decoded;
    if (!decoded) return;
    // A v2 event standing for a v1 event already decoded (same id, re-signed): decode again, so it replaces it (rare).
    if (isWireItemV2(event.wire) && event.wire.e.was && decoded.some((x) => x.id === event.id)) {
      this.decoded = undefined;
      return;
    }
    if (KEY_KINDS.has(event.kind)) {
      this.decoded = undefined;
      return;
    }
    this.#ensureDirectFor(event.signer);
    const d = this.decode(event);
    if (!d || !this.#agentCounts(d)) return;
    // An approval, or a space's rule for agents and services, decides what they signed counts, earlier events
    // too (nothing is deleted: a looser rule shows them again): decode again (rare).
    if (d.inner.kind === KIND_AGENT_APPROVE || d.inner.kind === KIND_VISITORS) {
      this.decoded = undefined;
      return;
    }
    // A carry restates many events at their own times: decode everything again (they are rare).
    if (d.inner.kind === KIND_CARRY) {
      this.decoded = undefined;
      return;
    }
    if (d.inner.kind === KIND_SHRED)
      setImmediate(() => {
        try {
          this.core.retention.applyShreds();
        } catch {
          // closed in the meantime: the next start applies it
        }
      });
    let lo = 0;
    let hi = decoded.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (replicaOrder(decoded[mid].event, event) <= 0) lo = mid + 1;
      else hi = mid;
    }
    decoded.splice(lo, 0, d);
    this.decodedRevision++;
    if (d.space) {
      const id = d.space.id;
      const list = this.#bySpace.get(id) ?? [];
      let a = 0;
      let b = list.length;
      while (a < b) {
        const mid = (a + b) >>> 1;
        if (replicaOrder(list[mid].event, event) <= 0) a = mid + 1;
        else b = mid;
      }
      list.splice(a, 0, d);
      this.#bySpace.set(id, list);
      this.#spaceRevision.set(id, (this.#spaceRevision.get(id) ?? 0) + 1);
      if (classOf(canonicalKind(d.inner.kind)) === 'control') this.#controlRevision.set(id, (this.#controlRevision.get(id) ?? 0) + 1);
    }
    // A board key for us makes more events readable: that drops the decoded events (see #takeBoardKeys).
    if (d.inner.kind === KIND_BOARD_KEY) this.#takeBoardKeys([d]);
  }

  /** A result computed from all decoded events, kept until they change. Callers must not change what it returns. */
  memo<T>(name: string, compute: () => T): T {
    this.decodeAll();
    const hit = this.#memos.get(name);
    if (hit && hit.revision === this.decodedRevision) return hit.value as T;
    const value = compute();
    this.#memos.set(name, { revision: this.decodedRevision, value });
    return value;
  }

  /** The decoded events of one space, in replica order. */
  decodedIn(spaceId: string): Decoded[] {
    this.decodeAll();
    return this.#bySpace.get(spaceId) ?? [];
  }

  /** The cache slot of a space, emptied when the space's events or everything decoded changed. */
  #cacheFor(spaceId: string): { key: string; entries?: Entry[]; access?: Access; accessFor?: SpaceState } {
    this.decodeAll();
    const key = `${this.#decodedGeneration}:${this.#spaceRevision.get(spaceId) ?? 0}`;
    let slot = this.#spaceCache.get(spaceId);
    if (slot?.key !== key) {
      slot = { key };
      this.#spaceCache.set(spaceId, slot);
    }
    return slot;
  }

  /** For tests: the ids of the decoded events, as kept up to date or (rebuild) decoded from scratch. */
  _decodedIds(rebuild = false): string[] {
    if (rebuild) this.decoded = undefined;
    return this.decodeAll().map((d) => d.id);
  }

  /** Keep board keys boxed to us; true if any was new (then everything is decoded again). */
  #takeBoardKeys(decoded: Decoded[]): boolean {
    const changed = new Set<StoredSpace>();
    for (const d of decoded) {
      if (d.inner.kind !== KIND_BOARD_KEY || d.space?.kind !== 'project') continue;
      const id = d.id;
      if (this.#boardKeysSeen.has(id)) continue;
      this.#boardKeysSeen.add(id);
      const opened = this.core.tryOpen((me) => openBoardKey(d.space!, d.inner, me));
      if (!opened) continue;
      const epochs = ((d.space.boards ??= {})[opened.board] ??= {});
      if (epochs[String(opened.epoch)]) continue;
      epochs[String(opened.epoch)] = opened.key;
      changed.add(d.space);
    }
    for (const space of changed) this.saveSpace(space);
    return changed.size > 0;
  }

  graph() {
    return this.memo('graph', () => {
      const edges: EdgeEvent[] = this.decodeAll()
        .filter((d) => (EDGE_KINDS as readonly string[]).includes(d.inner.kind))
        // In a direct chat, only a follow of the other one of the two counts: it says nothing about anyone else.
        .filter((d) => {
          const direct = d.space && this.directs.get(d.space.id);
          if (!direct) return true;
          const subject = (d.inner.body as { subject?: unknown } | null)?.subject;
          const pair = [this.node.identity.author, direct.peer];
          return pair.includes(d.event.author) && pair.includes(subject as Did);
        })
        .map((d) => ({ author: d.event.author, kind: d.inner.kind, body: d.inner.body, time: d.event.time, signer: d.event.signer, seq: d.event.seq }));
      return socialGraph(edges);
    });
  }

  /** Authors I blocked or muted: their events are left out of feeds. */
  hiddenAuthors(): Set<Did> {
    return this.memo('hidden', () => {
      const mine = this.graph().get(this.node.identity.author);
      return new Set([...(mine?.blocked ?? []), ...(mine?.muted ?? [])]);
    });
  }

  /**
   * Your own events are always shown to you: after joining offline, your node
   * can't confirm your membership until it has synced the founder's events.
   */
  mine = (event: WeaveRecord): boolean => event.author === this.node.identity.author;

  /** A space's readable events from members, as entries for the collaboration functions. */
  entries(space: StoredSpace): Entry[] {
    const slot = this.#cacheFor(space.id);
    if (slot.entries) return slot.entries;
    const state = this.state(space);
    const entries = this.decodedIn(space.id)
      .filter((d) => this.mine(d.event) || visibleIn(state, d.event, d.inner))
      .map((d) => ({ id: d.id, event: d.event, kind: d.inner.kind, body: d.inner.body }));
    return (slot.entries = space.kind === 'project' ? this.#writable(space, state, entries) : entries);
  }

  // ---------------------------------------------------------------- internals: board access

  readersOf(space: StoredSpace, state: SpaceState, entries: Entry[], board?: string): Did[] {
    if (!board || space.kind !== 'project') return [...state.members.keys()];
    return readersOf(board, state, this.access(space, state, entries));
  }

  access(space: StoredSpace, state: SpaceState, entries: Entry[]): Access {
    // Cached only for the space's own state and entries (callers sometimes pass others).
    const slot = this.#cacheFor(space.id);
    if (slot.access && slot.accessFor === state && slot.entries === entries) return slot.access;
    const access = accessOf(entries, state, inviteRightsOf(entries, state));
    if (slot.entries === entries) Object.assign(slot, { access, accessFor: state });
    return access;
  }

  /** Where issues and proposals that don't name a board live: the first board of their type. */
  #boardDefaults(state: SpaceState, entries: Entry[]): { issues?: string; proposals?: string } {
    const boards = boardsOf('project', entries, state.maintainers);
    return { issues: boards.find((b) => b.type === 'issues')?.name, proposals: boards.find((b) => b.type === 'proposals')?.name };
  }

  /** Leave out what people wrote in boards they may not write in (everyone's node does the same). */
  #writable(space: StoredSpace, state: SpaceState, entries: Entry[]): Entry[] {
    const access = this.access(space, state, entries);
    if (![...access.rules.values()].some((r) => r.write)) return entries;
    const boards = boardOfEvents(entries, this.#boardDefaults(state, entries));
    return entries.filter((e) => {
      const board = boards.get(e.id);
      return !board || !access.rules.get(board)?.write || mayUse('write', board, e.event.author, state, access);
    });
  }

  /** Who may vote on each proposal: the people who may write in its board. */
  voters(project: StoredSpace): (proposal: Entry) => Set<Did> {
    const state = this.state(project);
    const entries = this.entries(project);
    const access = this.access(project, state, entries);
    const boards = boardOfEvents(entries, this.#boardDefaults(state, entries));
    const everyone = new Set(state.members.keys());
    return (proposal) => {
      const board = boards.get(proposal.id);
      return board && access.rules.get(board)?.write ? new Set([...everyone].filter((did) => mayUse('write', board, did, state, access))) : everyone;
    };
  }

  /** Check a new event against its board's rules, and seal it with the board's key if the board is read-limited. */
  forBoard(space: StoredSpace, inner: Inner): Inner {
    const state = this.state(space);
    const entries = this.entries(space);
    const access = this.access(space, state, entries);
    if (!access.rules.size) return inner;
    const defaults = this.#boardDefaults(state, entries);
    const board = boardOfInner(inner, boardOfEvents(entries, defaults), defaults);
    const rules = board ? access.rules.get(board) : undefined;
    if (!board || !rules) return inner;
    const me = this.node.identity.author;
    if (rules.write && state.members.has(me) && !mayUse('write', board, me, state, access)) throw new Error(`only some people may write in ${board} of ${space.name}, and you're not one of them`);
    if (!rules.read) return inner;
    const epochs = space.boards?.[board] ?? {};
    const epoch = Math.max(-1, ...Object.keys(epochs).map(Number));
    if (epoch < 0) throw new Error(`you don't have the key for ${board} yet: someone who can read it needs to be online once`);
    return sealForBoard(space, board, epoch, epochs[String(epoch)], inner);
  }

  /**
   * Keep read-limited boards readable by exactly their readers: maintainers
   * publish who of an invited group takes part (others can't see the group),
   * anyone holding a board's key passes it to readers who lack it, and
   * maintainers start a new key when someone may no longer read.
   */
  async reconcileBoards(project: StoredSpace): Promise<number> {
    const me = this.node.identity.author;
    let state = this.state(project);
    if (!state.members.has(me)) return 0;
    let entries = this.entries(project);
    let access = this.access(project, state, entries);
    if (!access.rules.size) return 0;
    let changed = 0;
    if (mayDo(state, me, 'curate').ok) {
      const groups = new Set([...access.rules.values()].flatMap((r) => [...(r.read ?? []), ...(r.write ?? [])]).flatMap((g) => ('group' in g ? [g.group] : [])));
      for (const id of groups) {
        const group = this.core.spaces.get(id);
        if (!group) continue;
        const roster = [...this.state(group).members.keys()].filter((did) => state.members.has(did)).sort();
        const known = [...(access.rosters.get(id) ?? [])].sort();
        if (roster.join() === known.join()) continue;
        this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(project), { kind: KIND_ROSTER, body: { group: id, members: roster } }));
        changed++;
      }
      if (changed) {
        state = this.state(project);
        entries = this.entries(project);
        access = this.access(project, state, entries);
      }
    }
    const holders = keyHolders(entries);
    for (const [board, rules] of access.rules) {
      if (!rules.read) continue;
      const readers = readersOf(board, state, access);
      const epochs = holders.get(board);
      const mine = project.boards?.[board] ?? {};
      const newKey = (epoch: number) => {
        const key = newBoardKey();
        ((project.boards ??= {})[board] ??= {})[String(epoch)] = key;
        this.saveSpace(project);
        this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(project), boardKeyFor(project, board, epoch, key, readers, this.core.encryptionKeyOf)));
        changed++;
      };
      if (!epochs?.size) {
        if (mayDo(state, me, 'curate').ok && !Object.keys(mine).length) newKey(0);
        continue;
      }
      const latest = Math.max(...epochs.keys());
      if (!mine[String(latest)]) continue; // the newest key hasn't reached us yet
      // Someone who may no longer read holds the current key: maintainers start a new one.
      if (mayDo(state, me, 'curate').ok && [...epochs.get(latest)!].some((did) => !readers.includes(did))) newKey(latest + 1);
      // Readers get every key we hold that they lack, older ones too, so they can read the board's history.
      for (const [epoch, holding] of epochs) {
        const key = mine[String(epoch)];
        const missing = key ? readers.filter((did) => !holding.has(did)) : [];
        if (!missing.length) continue;
        this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(project), boardKeyFor(project, board, epoch, key, missing, this.core.encryptionKeyOf)));
        changed++;
      }
    }
    return changed;
  }

  /** An event by full id or a unique prefix (at least 6 characters), limited to some kinds. */
  find(ref: string, kinds: string[]): Decoded & { id: string } {
    if (!ref || ref.length < 6) throw new Error('use at least 6 characters of the id');
    const matches = this.decodeAll().filter((d) => kinds.includes(d.inner.kind) && d.id.startsWith(ref));
    if (matches.length === 0) throw new Error(`nothing found with id ${ref}`);
    if (matches.length > 1) throw new Error(`id ${ref} is ambiguous — use more characters`);
    return matches[0];
  }

  async issueById(issue: Decoded & { id: string }): Promise<IssueInfo> {
    if (issue.space?.kind !== 'project') throw new Error('issues live inside projects');
    return (await this.node.issues(issue.space.id)).find((i) => i.id === issue.id)!;
  }

  actor(author: Did, signer: Did, session?: SessionStamp): Actor {
    const actor: Actor = { did: author };
    const name = this.node.nameOf(author);
    if (name) actor.name = name;
    const agent = this.core.agentName(signer, author);
    if (agent) actor.agent = agent;
    if (agent && session) actor.session = session;
    return actor;
  }

  #reactionInfo = (r: Reaction): ReactionInfo => ({
    emoji: r.emoji,
    count: r.by.length,
    mine: r.by.some((who) => who.author === this.node.identity.author),
    by: r.by.map((who) => {
      const actor = this.actor(who.author, who.signer);
      return `${actor.name ?? actor.did.slice(8, 16)}${actor.agent ? ` · ${actor.agent}` : ''}`;
    }),
  });

  messageInfo(m: Message, byId: Map<string, Message>): MessageInfo {
    const parent = m.replyTo ? byId.get(m.replyTo) : undefined;
    return {
      id: m.id,
      short: m.id.slice(0, 8),
      by: this.actor(m.author, m.signer, m.session),
      text: m.text,
      time: m.time,
      channel: m.channel,
      ...(parent ? { replyTo: { id: parent.id, by: this.actor(parent.author, parent.signer), text: (parent.text || (parent.file ? `📎 ${parent.file.name}` : '')).slice(0, 140) } } : {}),
      reactions: m.reactions.map(this.#reactionInfo),
      ...(m.announce ? { announce: m.announce } : {}),
      ...(m.file ? { file: m.file } : {}),
    };
  }

  /**
   * Announce something live in a project's chat (#general): a website opened, a version offered. A message like any
   * (its text says it), carrying what it's about, so Weave shows it as a card that knows whether it's still on.
   */
  async announce(project: string, announce: { kind: 'website' | 'release'; id: string }, text: string): Promise<void> {
    try {
      await this.node.publish({ kind: KIND_MSG, body: { text, announce }, space: project });
    } catch (error) {
      console.error(`weave: couldn't announce it: ${(error as Error).message}`);
    }
  }

  #replyInfo = (r: Reply): ReplyInfo => ({ id: r.id, by: this.actor(r.author, r.signer), text: r.text, time: r.time });

  threadInfo(t: Thread): ThreadInfo {
    return { id: t.id, short: t.id.slice(0, 8), by: this.actor(t.author, t.signer), title: t.title, text: t.text, time: t.time, active: t.active, replies: t.replies.map(this.#replyInfo) };
  }

  issueInfo(i: Issue): IssueInfo {
    return {
      id: i.id,
      short: i.id.slice(0, 8),
      by: this.actor(i.author, i.signer),
      title: i.title,
      text: i.text,
      labels: i.labels,
      status: i.status,
      ...(i.assignee ? { assignee: this.actor(i.assignee.author, i.assignee.signer) } : {}),
      time: i.time,
      replies: i.replies.map(this.#replyInfo),
    };
  }

  proposalInfo(p: Proposal): ProposalInfo {
    const { votes, ...t } = p.tally;
    const mine = votes.get(this.node.identity.author);
    return {
      id: p.id,
      short: p.id.slice(0, 8),
      by: this.actor(p.author, p.signer),
      title: p.title,
      text: p.text,
      deadline: p.deadline,
      time: p.time,
      ...t,
      ...(mine ? { myVote: { choice: mine.choice, ...(mine.via ? { via: this.actor(mine.via, mine.via) } : {}) } } : {}),
      replies: p.replies.map(this.#replyInfo),
    };
  }

  toItem({ event, inner, space, private: isPrivate }: Decoded): FeedItem {
    const item: FeedItem = {
      id: event.id,
      time: event.time,
      kind: inner.kind,
      scope: event.scope,
      body: inner.body,
      author: event.author,
      signer: event.signer,
      seq: event.seq,
    };
    const authorName = this.node.nameOf(event.author);
    if (authorName) item.authorName = authorName;
    const signerName = this.core.agentName(event.signer, event.author);
    if (signerName) item.signerName = signerName;
    if (space) item.space = { id: space.id, kind: space.kind, name: this.spaceName(space) };
    if (isPrivate) item.private = true;
    return item;
  }

}
