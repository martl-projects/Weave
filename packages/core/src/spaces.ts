import { classOf } from './eventsV2.ts';
import { sha256 } from '@noble/hashes/sha2.js';
import { KIND_SEALED } from './authority.ts';
import { b64u, canonicalJson, utf8, type Json } from './bytes.ts';
import { boxTo, open, openBox, pairKey, randomBytes, seal, type Box, type Sealed } from './crypto.ts';
import type { EventFields, SigningIdentity } from './events.ts';
import type { EventView } from './records.ts';
import { isDid, type Did, type KeyPair } from './keys.ts';
import { isMembershipBody, KIND_MEMBERSHIP } from './memberships.ts';

/*
 * Spaces are the encrypted rooms of Weave. There are three kinds:
 *
 *   group      a collection of people with their own chat; can be invited into projects
 *   project    something being built: a post with chat and boards (issues, ideas, releases, …)
 *   community  a board of posts that people join, like a subreddit, with its own chat
 *   direct     a chat between two friends; its key is derived from their two identities,
 *              so it needs no invite, and it has no membership events
 *
 * All use the same machinery (v1): a shared symmetric key per epoch; removing
 * someone starts a new epoch whose key is boxed to everyone who stays. MLS
 * replaces this later.
 *
 * Membership events, sealed inside the space:
 *   weave.space.create      {name, tier}       the founder, first event; tier: a membership tier (see memberships.ts)
 *   weave.invite            {invite, expires, access?, accept?}  group, community: any member · project: maintainers;
 *                                              access: board rights it gives (access.ts); accept: the link
 *                                              carries no keys, the inviter lets each person in
 *   weave.space.join        {invite}           the newcomer, citing an invite link
 *   weave.space.remove      {member}           group: founder · project, community: maintainers (moderators)
 *   weave.project.maintainer {member, on}      projects and communities: maintainers (moderators) appoint or drop others
 * projects only:
 *   weave.project.group      {group, name, on} maintainers invite (or uninvite) a whole group
 *   weave.project.rule       {group, auto}     maintainers: admit that group's newcomers without asking
 *   weave.project.admit      {member, via}     maintainers, or anyone in the project when a rule allows
 * any kind:
 *   weave.project.admit      {member, invite}  the inviter lets in someone who knocked with their link
 *   weave.project.decline    {member, via}     maintainers turn a group newcomer away
 * any kind (but direct chats):
 *   weave.space.leave       {}                 a member leaves (not the owner: they hand over first)
 *   weave.space.handover    {to}               the owner makes another member the owner (not for tiers)
 *   weave.space.close       {closed}           owner (groups) or maintainers: closed spaces are kept, read-only
 * in the clear, because the people concerned can't (yet, or any more) read the space:
 *   weave.space.rekey       {epoch, boxes}     new key for those who stay
 *   weave.space.gift        {boxes}            a space's keys boxed to newly admitted people
 */
export const KIND_SPACE_CREATE = 'weave.space.create';
export const KIND_INVITE = 'weave.invite';
export const KIND_JOIN = 'weave.space.join';
export const KIND_REMOVE = 'weave.space.remove';
export const KIND_REKEY = 'weave.space.rekey';
export const KIND_GIFT = 'weave.space.gift';
export const KIND_MAINTAINER = 'weave.project.maintainer';
export const KIND_PROJECT_GROUP = 'weave.project.group';
export const KIND_RULE = 'weave.project.rule';
export const KIND_ADMIT = 'weave.project.admit';
export const KIND_DECLINE = 'weave.project.decline';
export const KIND_LEAVE = 'weave.space.leave';
export const KIND_HANDOVER = 'weave.space.handover';
export const KIND_CLOSE = 'weave.space.close';
/** What newcomers get to read: `all` (the default), `30d` or `joining` (from their invite on). */
export const KIND_HISTORY = 'weave.space.history';

export type HistorySetting = 'all' | '30d' | 'joining';
/**
 * A space's earlier control events (and its latest state: page, app, channels),
 * restated under a new key for newcomers who don't get the keys they were
 * sealed with. Written by whoever hands the keys over; newcomers take it from
 * that person only.
 */
export const KIND_CARRY = 'weave.space.carry';
/** `{epochs}`: members delete these keys of the space, so every copy of what they sealed becomes unreadable. */
export const KIND_SHRED = 'weave.space.shred';
/** `{provider, ttlMinutes, graceHours, attestor?}`: a company's key service holds half of every new epoch key (stage 6). */
export const KIND_MANAGED = 'weave.space.managed';
/** `{epoch, wrapped}`: an epoch's company half, wrapped by the space's key provider. */
export const KIND_KMS = 'weave.space.kms';
/** `{did, subject, email?, groups, until}`: the company's attestor vouches that this Weave person is this employee, until then. */
export const KIND_ATTEST = 'weave.org.attest';
/** `{box}`: an employee's sign-in (an OIDC ID token), boxed to the attestor. */
export const KIND_SIGNIN = 'weave.org.signin';
/** `{until, reason}`: a legal hold by the owner: nothing is shredded or forgotten until then. */
export const KIND_HOLD = 'weave.space.hold';

/** A managed space's setting, as its owner signed it. No secrets: the provider says where, not how to get in. */
export interface ManagedSetting {
  provider: Json;
  ttlMinutes: number;
  graceHours: number;
  /** The company's attestor: only people it vouches for count as members (SSO). */
  attestor?: Did;
  by: Did;
  time: string;
}
export const HISTORIES: readonly HistorySetting[] = ['all', '30d', 'joining'];
const DAY = 24 * 3600 * 1000;

/**
 * The epochs a newcomer gets, by the space's history setting. `starts` is when
 * each epoch began (its rekey); epochs without a known start are the oldest.
 * `30d`: those that began within 30 days, and the one current 30 days ago.
 * `joining`: the current one only (the key rotates first, see the node).
 */
export function epochsToShare(space: Pick<SpaceKeys, 'keys'>, history: HistorySetting, starts: Map<number, string>, now = Date.now()): number[] {
  const epochs = Object.keys(space.keys).map(Number).sort((a, b) => a - b);
  if (history === 'all') return epochs;
  if (history === 'joining') return epochs.slice(-1);
  const since = new Date(now - 30 * DAY).toISOString();
  const recent = epochs.filter((e) => (starts.get(e) ?? '') >= since);
  const before = epochs.filter((e) => (starts.get(e) ?? '') < since).at(-1);
  return before === undefined ? recent : [before, ...recent];
}

export const SPACE_KINDS = ['group', 'project', 'community', 'direct'] as const;
export type SpaceKind = (typeof SPACE_KINDS)[number];
const isSpaceKind = (kind: unknown): kind is SpaceKind => SPACE_KINDS.includes(kind as SpaceKind);

/** Names used before groups and projects were told apart; still read so older spaces keep working. */
const LEGACY_KINDS: Record<string, string> = {
  'weave.group.create': KIND_SPACE_CREATE,
  'weave.group.join': KIND_JOIN,
  'weave.group.remove': KIND_REMOVE,
  'weave.group.rekey': KIND_REKEY,
};

/** An event kind under its current name. */
export const canonicalKind = (kind: string): string => LEGACY_KINDS[kind] ?? kind;

/** Everything a member holds about a space. Secret: whoever has it can read the space. */
export interface SpaceKeys {
  kind: SpaceKind;
  id: string;
  name: string;
  founder: Did;
  /** Seed for the DHT topic, so outsiders can't tell which space a node is in. */
  secret: string;
  /** Epoch number → base64url key. Members keep old epochs to read history. */
  keys: Record<string, string>;
}

export interface Inner {
  kind: string;
  body: Json;
}

export const spaceScope = (space: Pick<SpaceKeys, 'kind' | 'id'>): string => `${space.kind}:${space.id}`;

export function parseScope(scope: string): { kind: SpaceKind; id: string } | undefined {
  const [kind, id] = scope.split(':');
  return isSpaceKind(kind) && id ? { kind, id } : undefined;
}

/** Topic name for the DHT, derived from the space secret. */
/** A space's meeting point in the DHT for one of its keys: it moves with every new key, so removed members can't find the rest. */
const topicOfKey = (key: string): string => `space/${b64u.encode(sha256(new Uint8Array([...utf8('weave/rendezvous/v2'), ...b64u.decode(key)])))}`;

/** A space's meeting points: for its current key and the one before, so a member who hasn't got the new key yet still meets the others. */
export const spaceTopics = (space: SpaceKeys): string[] =>
  Object.keys(space.keys)
    .map(Number)
    .sort((a, b) => b - a)
    .slice(0, 2)
    .map((epoch) => topicOfKey(space.keys[String(epoch)]));

/** A space's meeting point for its current key. */
export const spaceTopic = (space: SpaceKeys): string => spaceTopics(space)[0];

export function newSpace(kind: SpaceKind, name: string, founder: Did): SpaceKeys {
  return {
    kind,
    id: b64u.encode(randomBytes(16)),
    name,
    founder,
    secret: b64u.encode(randomBytes(32)),
    keys: { '0': b64u.encode(randomBytes(32)) },
  };
}

/**
 * The direct chat between `me` and `peer`. Both of them derive the same space
 * (id, topic secret and keys) on their own; nobody else can.
 *
 * Each pair of the two people's encryption keys (oldest first) is an epoch:
 * `1000·i + j`, `i` counting the keys of the one whose identifier sorts first,
 * `j` the other's. The newest pair is the highest epoch, so new messages are
 * sealed with it, and older ones stay readable when either rotates their
 * encryption key. The id and topic come from the first pair: the chat stays
 * the same space.
 */
export function directSpace(me: { author: Did; keys: KeyPair | KeyPair[] }, peer: Did, peerKeys: Did | Did[] = peer): SpaceKeys {
  const mine = Array.isArray(me.keys) ? me.keys : [me.keys];
  const theirs = Array.isArray(peerKeys) ? peerKeys : [peerKeys];
  const meFirst = [me.author, peer].sort()[0] === me.author;
  const keys: Record<string, string> = {};
  mine.forEach((pair, a) =>
    theirs.forEach((peerKey, b) => {
      const [i, j] = meFirst ? [a, b] : [b, a];
      keys[String(1000 * i + j)] = b64u.encode(pairKey(pair.secretKey, pair.publicKey, peerKey));
    }),
  );
  const first = b64u.decode(keys['0']);
  const derive = (label: string) => b64u.encode(sha256(new Uint8Array([...utf8(`weave/direct/${label}/v1`), ...first])));
  return { kind: 'direct', id: derive('id').slice(0, 22), name: '', founder: meFirst ? me.author : peer, secret: derive('topic'), keys };
}

export const currentEpoch = (space: SpaceKeys): number => Math.max(...Object.keys(space.keys).map(Number));

const context = (space: Pick<SpaceKeys, 'kind' | 'id'>, epoch: number) => `weave/${space.kind}/v1:${space.id}:${epoch}`;

/** Event fields for an encrypted event in a space, sealed with the current epoch key. */
export function sealFor(space: SpaceKeys, inner: Inner): EventFields {
  const epoch = currentEpoch(space);
  const key = b64u.decode(space.keys[String(epoch)]);
  return { kind: KIND_SEALED, scope: spaceScope(space), class: classOf(inner.kind), body: { epoch, ...seal(key, inner as unknown as Json, context(space, epoch)) } };
}

/** Decrypt a sealed event of a space, or undefined if we lack the key or it doesn't decrypt. */
export function openIn(space: SpaceKeys, event: EventView): Inner | undefined {
  if (event.kind !== KIND_SEALED || event.scope !== spaceScope(space)) return undefined;
  const body = event.body as (Sealed & { epoch?: unknown }) | null;
  if (!body || !Number.isSafeInteger(body.epoch)) return undefined;
  const key = space.keys[String(body.epoch)];
  if (!key) return undefined;
  try {
    const inner = open(b64u.decode(key), body, context(space, body.epoch as number)) as unknown as Inner;
    return typeof inner?.kind === 'string' ? inner : undefined;
  } catch {
    return undefined;
  }
}

/** Start a new epoch: a fresh key, boxed to each member who stays. */
/**
 * Someone opening what was encrypted to them: the person, and the keys of their
 * encryption key (for people without a separate one, their root key pair).
 */
export interface Recipient {
  author: Did;
  keys: KeyPair;
}

/** Where to encrypt to for a person: their published encryption key (defaults to their identifier). */
export type EncryptionKeyOf = (person: Did) => Did;
const sameKey: EncryptionKeyOf = (person) => person;

export function rekey(space: SpaceKeys, members: Did[], encryptionKeyOf: EncryptionKeyOf = sameKey): { fields: EventFields; epoch: number; key: string } {
  const epoch = currentEpoch(space) + 1;
  const key = b64u.encode(randomBytes(32));
  const boxes: Record<string, Box> = {};
  for (const member of members) boxes[member] = boxTo(encryptionKeyOf(member), { space: space.id, epoch, key });
  return { fields: { kind: KIND_REKEY, scope: spaceScope(space), body: { epoch, boxes } }, epoch, key };
}

/** If a rekey event carries a key for `me`, return it. */
export function openRekey(event: EventView, me: Recipient): { epoch: number; key: string } | undefined {
  const body = event.body as { epoch?: unknown; boxes?: Record<string, Box> } | null;
  const box = body?.boxes?.[me.author];
  if (canonicalKind(event.kind) !== KIND_REKEY || !box) return undefined;
  try {
    const opened = openBox(me.keys.secretKey, me.keys.publicKey, box) as { space?: string; group?: string; epoch?: number; key?: string };
    if ((opened.space ?? opened.group) !== parseScope(event.scope)?.id || opened.epoch !== body!.epoch || typeof opened.key !== 'string') return undefined;
    return { epoch: opened.epoch as number, key: opened.key };
  } catch {
    return undefined;
  }
}

/**
 * Hand a space's keys to newly admitted people. Posted in a space they already
 * share with the giver (the group they came through, or their direct chat),
 * boxed so only they can open it.
 */
export function gift(space: SpaceKeys, recipients: Did[], scope: string, entry: Invite['entry'], encryptionKeyOf: EncryptionKeyOf = sameKey): EventFields {
  const boxes: Record<string, Box> = {};
  for (const did of recipients) boxes[did] = boxTo(encryptionKeyOf(did), { space: space as unknown as Json, entry: entry as unknown as Json });
  return { kind: KIND_GIFT, scope, body: { space: space.id, boxes } };
}

/** If a gift event carries a space for `me`, return it. */
export function openGift(event: EventView, me: Recipient): { space: SpaceKeys; entry: Invite['entry'] } | undefined {
  const body = event.body as { boxes?: Record<string, Box> } | null;
  const box = body?.boxes?.[me.author];
  if (event.kind !== KIND_GIFT || !box) return undefined;
  try {
    const opened = openBox(me.keys.secretKey, me.keys.publicKey, box) as { space?: SpaceKeys; entry?: Invite['entry'] };
    const space = opened.space;
    if (!space || !isSpaceKind(space.kind) || space.kind === 'direct' || !isDid(space.founder) || !space.keys) return undefined;
    return { space, entry: opened.entry ?? { topics: [], bootstrap: [] } };
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------- invite links

/**
 * An invite link carries the space's keys plus entry points: topics where the
 * inviter can be reached, and bootstrap nodes if the inviter doesn't use the
 * public DHT. Anyone holding it can join, so it is shared privately.
 */
export interface Invite {
  v: 2;
  space: SpaceKeys;
  invite: string;
  inviter: Did;
  expires: string;
  entry: { topics: string[]; bootstrap: Array<{ host: string; port: number }> };
  /** Keys of read-limited boards the link gives access to: board → epoch → key. */
  boards?: Record<string, Record<string, string>>;
}

const INVITE_PREFIX = 'weave:invite:';

export const encodeInvite = (invite: Invite): string => INVITE_PREFIX + b64u.encode(utf8(canonicalJson(invite as unknown as Json)));

export function decodeInvite(text: string): Invite {
  const trimmed = text.trim();
  if (!trimmed.startsWith(INVITE_PREFIX)) throw new Error('not a Weave invite');
  let invite: Invite;
  try {
    invite = JSON.parse(new TextDecoder().decode(b64u.decode(trimmed.slice(INVITE_PREFIX.length))));
  } catch {
    throw new Error('invite is damaged');
  }
  const s = invite?.space;
  if (invite?.v !== 2 || !s || !isSpaceKind(s.kind) || s.kind === 'direct' || typeof s.id !== 'string' || !isDid(s.founder) || !isDid(invite.inviter) || typeof s.secret !== 'string' || !s.keys) {
    throw new Error('invite is damaged or from an older Weave version');
  }
  if (Date.parse(invite.expires) < Date.now()) throw new Error('invite has expired');
  return invite;
}

// ---------------------------------------------------------------- membership

export interface Member {
  did: Did;
  /** Who let them in: the inviter of their link, or the maintainer (or rule) that admitted them. */
  invitedBy?: Did;
  /** For project participants who came in through a group. */
  via?: string;
  /** For members of a tier: when their membership runs out. */
  until?: string;
  /** The invite link they came in with (it may carry board rights). */
  invite?: string;
  since: string;
}

export interface InvitedGroup {
  id: string;
  name: string;
  /** Newcomers to this group are admitted without asking. */
  auto: boolean;
}

export interface SpaceState {
  kind: SpaceKind;
  /** The owner: whoever created the space, or the last person it was handed over to. */
  founder: Did;
  name?: string;
  members: Map<Did, Member>;
  /** Removed member → time of removal. Their earlier events stay visible. */
  removed: Map<Did, string>;
  /** Projects: who may invite, admit, remove and set rules. Communities: moderators. Groups: just the founder. */
  maintainers: Set<Did>;
  /** Projects: groups invited as a whole. */
  groups: Map<string, InvitedGroup>;
  /** Projects: group newcomers a maintainer turned away (member → group id). */
  declined: Map<Did, string>;
  /** Groups that are a creator's membership tier: only the founder lets people in. */
  tier?: true;
  /** People who left on their own (they may come back with a new invite). */
  left: Set<Did>;
  /** Closed by its owner or maintainers: kept, but read-only. */
  closed?: { by: Did; time: string };
  /** What newcomers get to read, and who set it when (absent: everything). */
  history?: { value: HistorySetting; by: Did; time: string };
  /** A company's key service holds half of the keys (stage 6). */
  managed?: ManagedSetting;
  /** A legal hold: nothing is shredded or forgotten until `until`. */
  hold?: { until: string; reason: string; by: Did; time: string };
}

const byTime = (a: { event: EventView }, b: { event: EventView }) => a.event.time.localeCompare(b.event.time) || a.event.seq - b.event.seq;

/**
 * Membership from a space's decrypted events, applied in time order. The rules
 * differ by kind: in groups any member invites and the founder removes; in
 * communities any member invites and moderators remove; in projects
 * maintainers do both, invite whole groups, and set rules that let group
 * newcomers in automatically.
 */
export function spaceState(kind: SpaceKind, founder: Did, opened: Array<{ event: EventView; inner: Inner }>): SpaceState {
  const state: SpaceState = { kind, founder, members: new Map(), removed: new Map(), maintainers: new Set([founder]), groups: new Map(), declined: new Map(), left: new Set() };
  const invites = new Map<string, { by: Did; expires: string; accept: boolean }>();
  const may = (author: Did) => (kind === 'project' ? state.maintainers.has(author) : state.tier ? author === state.founder : state.members.has(author));
  const admit = (did: Did, time: string, invitedBy?: Did, via?: string, invite?: string) => {
    state.members.set(did, { did, since: time, ...(invitedBy ? { invitedBy } : {}), ...(via ? { via } : {}), ...(invite ? { invite } : {}) });
    state.removed.delete(did);
    state.declined.delete(did);
    state.left.delete(did);
  };

  for (const { event, inner } of [...opened].sort(byTime)) {
    const author = event.author;
    const body = (inner.body ?? {}) as Record<string, unknown>;
    switch (canonicalKind(inner.kind)) {
      case KIND_SPACE_CREATE:
        if (author === founder && state.members.size === 0) {
          admit(founder, event.time);
          if (typeof body.name === 'string') state.name = body.name;
          if (kind === 'group' && body.tier === true) state.tier = true;
        }
        break;
      case KIND_INVITE:
        if (may(author) && typeof body.invite === 'string' && typeof body.expires === 'string') invites.set(body.invite, { by: author, expires: body.expires, accept: body.accept === true });
        break;
      case KIND_JOIN: {
        const invite = typeof body.invite === 'string' ? invites.get(body.invite) : undefined;
        const live = invite && invite.expires >= event.time && state.members.has(invite.by);
        if (live && !invite.accept && !state.members.has(author) && (!state.removed.has(author) || state.left.has(author))) admit(author, event.time, invite.by, undefined, body.invite as string);
        break;
      }
      case KIND_REMOVE: {
        const allowed = kind === 'group' ? author === state.founder : state.maintainers.has(author);
        if (allowed && isDid(body.member) && body.member !== state.founder && state.members.has(body.member)) {
          state.members.delete(body.member);
          state.maintainers.delete(body.member);
          state.removed.set(body.member, event.time);
        }
        break;
      }
      case KIND_MAINTAINER:
        if (kind !== 'group' && state.maintainers.has(author) && isDid(body.member) && body.member !== state.founder) {
          if (body.on === false) state.maintainers.delete(body.member);
          else if (state.members.has(body.member)) state.maintainers.add(body.member);
        }
        break;
      case KIND_PROJECT_GROUP:
        if (kind === 'project' && state.maintainers.has(author) && typeof body.group === 'string') {
          if (body.on === false) state.groups.delete(body.group);
          else state.groups.set(body.group, { id: body.group, name: typeof body.name === 'string' ? body.name : 'group', auto: state.groups.get(body.group)?.auto ?? false });
        }
        break;
      case KIND_RULE: {
        const group = typeof body.group === 'string' ? state.groups.get(body.group) : undefined;
        if (kind === 'project' && state.maintainers.has(author) && group) group.auto = body.auto === true;
        break;
      }
      case KIND_ADMIT: {
        // Someone who knocked with an invite link, let in by whoever made the link (while it is live).
        if (typeof body.invite === 'string') {
          const invite = invites.get(body.invite);
          const live = invite && invite.by === author && invite.expires >= event.time && state.members.has(author);
          if (live && isDid(body.member) && !state.members.has(body.member)) admit(body.member, event.time, author, undefined, body.invite);
          break;
        }
        const via = typeof body.via === 'string' ? body.via : undefined;
        const ruled = via !== undefined && state.groups.get(via)?.auto === true && state.members.has(author);
        if (kind === 'project' && isDid(body.member) && (state.maintainers.has(author) || ruled) && !state.members.has(body.member)) {
          admit(body.member, event.time, author, via);
        }
        break;
      }
      case KIND_MEMBERSHIP:
        // A tier's founder admits or renews a member until a date (see memberships.ts).
        if (kind === 'group' && author === state.founder && isMembershipBody(body)) {
          if (!state.members.has(body.member)) admit(body.member, event.time, founder);
          state.members.get(body.member)!.until = body.until;
        }
        break;
      case KIND_LEAVE:
        if (state.members.has(author) && author !== state.founder) {
          state.members.delete(author);
          state.maintainers.delete(author);
          state.removed.set(author, event.time);
          state.left.add(author);
        }
        break;
      case KIND_HANDOVER:
        if (author === state.founder && !state.tier && isDid(body.to) && body.to !== author && state.members.has(body.to)) {
          state.founder = body.to;
          state.maintainers.add(body.to);
        }
        break;
      case KIND_CLOSE:
        if (canManage(state, author)) state.closed = body.closed === false ? undefined : { by: author, time: event.time };
        break;
      case KIND_MANAGED: {
        const ttl = Number(body.ttlMinutes);
        const grace = Number(body.graceHours);
        if (kind !== 'direct' && author === state.founder && body.provider && typeof body.provider === 'object' && ttl > 0 && grace >= 0)
          state.managed = { provider: body.provider as Json, ttlMinutes: ttl, graceHours: grace, ...(isDid(body.attestor) ? { attestor: body.attestor } : {}), by: author, time: event.time };
        break;
      }
      case KIND_HOLD:
        if (author === state.founder && typeof body.until === 'string' && !Number.isNaN(Date.parse(body.until)))
          state.hold = { until: body.until, reason: typeof body.reason === 'string' ? body.reason.slice(0, 200) : '', by: author, time: event.time };
        break;
      case KIND_HISTORY:
        if (kind !== 'direct' && canManage(state, author) && HISTORIES.includes(body.history as HistorySetting)) state.history = { value: body.history as HistorySetting, by: author, time: event.time };
        break;
      case KIND_DECLINE:
        if (kind === 'project' && state.maintainers.has(author) && isDid(body.member) && typeof body.via === 'string' && !state.members.has(body.member)) {
          state.declined.set(body.member, body.via);
        }
        break;
    }
  }
  return state;
}

/** Should an event by this author be shown? Members yes; removed members only for what they wrote before removal. */
export function visibleIn(state: SpaceState, event: EventView, inner: Inner): boolean {
  const kind = canonicalKind(inner.kind);
  if (kind === KIND_JOIN || kind === KIND_SPACE_CREATE) return true;
  if (state.members.has(event.author)) return true;
  const removedAt = state.removed.get(event.author);
  return removedAt !== undefined && event.time < removedAt;
}

/** May this person remove members and rotate keys (and, in projects and communities, curate boards)? */
export const canManage = (state: SpaceState, did: Did): boolean => (state.kind === 'group' ? did === state.founder : state.maintainers.has(did));
