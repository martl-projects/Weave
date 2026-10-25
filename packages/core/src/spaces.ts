import { classOf, innerHash } from './eventsV2.ts';
import { sha256 } from '@noble/hashes/sha2.js';
import { KIND_SEALED } from './authority.ts';
import { b64u, canonicalJson, utf8, type Json } from './bytes.ts';
import { boxTo, open, openBox, pairKey, randomBytes, seal, type Box, type Sealed } from './crypto.ts';
import type { EventFields, SigningIdentity } from './events.ts';
import type { EventView } from './records.ts';
import { generateKeyPair, isDid, sign, verify, type Did, type KeyPair } from './keys.ts';
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
/**
 * {invite, joined}: by an invite's maker once it expired, naming who came in
 * with it. A join's date is the joiner's claim: once closed, nobody else counts
 * as having joined with it, whatever date they sign.
 */
export const KIND_INVITE_CLOSE = 'weave.invite.close';
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
/** The owner's word on which of two concurrent removals (or demotions) of each other came first: { first, second } event ids. */
export const KIND_SETTLE = 'weave.space.settle';
/** `{did, subject, email?, groups, until}`: the company's attestor vouches that this Weave person is this employee, until then. */
export const KIND_ATTEST = 'weave.org.attest';
/** `{box}`: an employee's sign-in (an OIDC ID token), boxed to the attestor. */
export const KIND_SIGNIN = 'weave.org.signin';
/** `{until, reason}`: a legal hold by the owner: nothing is shredded or forgotten until then. */
export const KIND_HOLD = 'weave.space.hold';
/** `{agent, on}`: in a managed space, an agent key those who manage it approved (or no longer do). */
export const KIND_AGENT_APPROVE = 'weave.space.agent';
/** `{person, wrapped, nonce, ct}`: an employee's recovery words, sealed under a key only the company's key service can unwrap. */
export const KIND_ESCROW = 'weave.org.escrow';
/** `{person}`: someone who manages the space opened that person's escrow (for the audit). */
export const KIND_ESCROW_OPENED = 'weave.org.escrow.opened';
/** Stage 10, in the company group, signed by the company: `{admins, links}`: who manages the company (a sign-in group), whether its identities may link. */
export const KIND_ORG_SETTINGS = 'weave.org.settings';
/** `{group, space, role, on}`: everyone the company vouches for in that sign-in group belongs in that company space. */
export const KIND_ORG_MAP = 'weave.org.map';
/** `{contacts}`: what a new company account starts with, instead of the app's bundle. */
export const KIND_ORG_START = 'weave.org.start';
/** `{action, …}`: an admin asks the company to do what only the owner may. */
export const KIND_ORG_REQUEST = 'weave.org.request';
/** `{request, error?}`: the company's answer. */
export const KIND_ORG_DONE = 'weave.org.done';
/** `{links, outside, directs, public, chats}`, public, by the company: what its accounts may do (stage 11), and whether their links count. */
export const KIND_ORG_POLICY = 'weave.org.policy';
/** `{space, people}`: a company chat between colleagues, made by the company (stage 11). */
export const KIND_ORG_CHAT = 'weave.org.chat';
/** `{subject, email?, action, …}`: an admin did this in the admin console (stage 12), recorded by the company's node. */
export const KIND_ORG_CONSOLE = 'weave.org.console';
/** `{to, on}`: this identity is also that one (both have to say so). Public, or sealed into a space. */
export const KIND_LINK = 'weave.link';

/** A managed space's setting, as its owner signed it. No secrets: the provider says where, not how to get in. */
export interface ManagedSetting {
  provider: Json;
  ttlMinutes: number;
  graceHours: number;
  /** The company's attestor: only people it vouches for count as members (SSO). */
  attestor?: Did;
  /** A company space's company group (stage 10): where the attestor vouches for people. */
  company?: string;
  /** The first epoch under the company's key service: from it on, an epoch without its company half is locked, never the Weave half alone. */
  from?: number;
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
  /**
   * Epoch number → further keys of that epoch: two managers rekeyed at once.
   * Everyone seals with `keys` (the rekey with the lowest id) and reads with all.
   */
  alternates?: Record<string, string[]>;
  /** Epoch number → who made the rekey whose key everyone seals with: in a managed space, only their company half counts. */
  rekeyers?: Record<string, Did>;
}

export interface Inner {
  kind: string;
  body: Json;
  /** Sealed with them: the secret that salts the event's inner hash (ih), for checking a restatement of it. */
  salt?: string;
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
  const newest = space.keys[String(epoch)];
  // A newest key that isn't here (a managed epoch still locked): nothing goes out under an older one instead.
  if (!newest) throw new Error(`the newest key of ${space.name} is locked: nothing can be written there until it unlocks`);
  const key = b64u.decode(newest);
  // A secret salt sealed inside, and the salted hash signed outside: a carry can restate it checkably (see innerHash).
  const sealed = { kind: inner.kind, body: inner.body, salt: b64u.encode(randomBytes(16)) };
  return { kind: KIND_SEALED, scope: spaceScope(space), class: classOf(inner.kind), ih: innerHash(sealed), body: { epoch, ...seal(key, sealed as unknown as Json, context(space, epoch)) } };
}

/** Decrypt a sealed event of a space, or undefined if we lack the key or it doesn't decrypt. */
export function openIn(space: SpaceKeys, event: EventView): Inner | undefined {
  if (event.kind !== KIND_SEALED || event.scope !== spaceScope(space)) return undefined;
  const body = event.body as (Sealed & { epoch?: unknown }) | null;
  if (!body || !Number.isSafeInteger(body.epoch)) return undefined;
  const keys = [space.keys[String(body.epoch)], ...(space.alternates?.[String(body.epoch)] ?? [])].filter((k): k is string => !!k);
  for (const key of keys) {
    try {
      const inner = open(b64u.decode(key), body, context(space, body.epoch as number)) as unknown as Inner;
      if (typeof inner?.kind === 'string') return inner;
    } catch {
      // another key of this epoch, maybe
    }
  }
  return undefined;
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
  /** The link's own key (see inviteKeys): `invite` is its public half, which everyone in the space reads. */
  key?: string;
}

/**
 * An invite link's key pair (xQ0as76W). The invite event in the space names only
 * its public half (the invite's id), which every member reads; the link holds
 * the secret half, and a join signs who joins with it. So a join proves it came
 * with the link, and nobody else in the space can cite the link as theirs.
 */
export function inviteKeys(): { invite: string; key: string } {
  const pair = generateKeyPair();
  return { invite: b64u.encode(pair.publicKey), key: b64u.encode(pair.secretKey) };
}

const joinMessage = (scope: string, joiner: Did) => utf8(`weave/join/v1\n${scope}\n${joiner}`);

/** A join's proof that it holds the link: who joins which space, signed with the link's key. */
export const joinProof = (key: string, scope: string, joiner: Did): string => b64u.encode(sign(joinMessage(scope, joiner), b64u.decode(key)));

export function joinProven(invite: string, proof: unknown, scope: string, joiner: Did): boolean {
  if (typeof proof !== 'string') return false;
  try {
    return verify(b64u.decode(proof), joinMessage(scope, joiner), b64u.decode(invite));
  } catch {
    return false;
  }
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
  /** Agent keys approved to act here (counts in managed spaces). */
  approvedAgents?: Set<Did>;
  /** Keys cut off by a removal, demotion, leave or handover: what they sign numbered past `seq` counts from `time` on, whatever date it claims. */
  cutoffs?: Cutoff[];
  /** Two people taking each other's role at once, ordered by this node's view alone: for the owner to settle (see orderLosses). */
  unsettled?: Array<{ first: string; second: string }>;
}

/**
 * An event's time is its author's claim, but the number (seq) a key gives its
 * events can't be turned back: two events of one key with the same number are a
 * fork. So a removal, a demotion, a leave or a handover names, for each key of
 * the person, the last number that still counts before it (`upTo`; for the key
 * signing a leave or handover, that event itself). Whatever such a key signs
 * numbered past it counts as coming after, however early it's dated: a removed
 * member can't backdate their way back in.
 */
export interface Cutoff {
  signer: Did;
  /** The key's last number (n) that counts: for what has no number in the space (v1, content from before cs). */
  seq: number;
  /** Its last control event in the space that counts (chain position), and its last content there (cs): see Anchor. */
  c?: number;
  s?: number;
  /** The lowest n of its content numbered in the space: content without a cs numbered past it is new content dressed as old. */
  f?: number;
  time: string;
  /** The person managed the space until then: what they signed up to `seq` (a rekey, say) was a manager's. */
  managed?: true;
  /**
   * For the keys of `author` the anchor didn't name (`except` are those it did):
   * anchored at 0, everything they sign in the space counts as after. Leaving a
   * key out is never better than naming it (H7hk7X9S).
   */
  author?: Did;
  except?: Did[];
}

/**
 * What a removal, a demotion, a leave or a handover names as seen, per key of
 * the person (causal anchoring, H7hk7X9S): its last number (`upTo`, n), and in
 * the space itself its control chain's head (`at.c`) and its last content
 * (`at.s`, cs). Both are numbered in the space without gaps from other spaces:
 * whatever the key signs past them counts as after, whatever date it claims, and
 * anything at or below them collides with what was seen (a fork).
 */
export interface Anchor {
  signer: Did;
  seq: number;
  c?: number;
  s?: number;
}

const count = (value: unknown): number | undefined => (Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : undefined);

/** An anchor from untrusted input: `upTo` ({key: n}) and `at` ({key: {c, s, n}}), merged per key. */
export function parseAnchors(body: Record<string, unknown> | null | undefined): Anchor[] {
  const out = new Map<Did, Anchor>(parseUpTo(body?.upTo).map((u) => [u.signer, { signer: u.signer, seq: u.seq }]));
  const at = body?.at;
  if (at && typeof at === 'object' && !Array.isArray(at)) {
    for (const [signer, v] of Object.entries(at as Record<string, unknown>).slice(0, 64)) {
      if (!isDid(signer) || !v || typeof v !== 'object') continue;
      const head = v as Record<string, unknown>;
      const [c, s, n] = [count(head.c), count(head.s), count(head.n)];
      const before = out.get(signer);
      out.set(signer, { signer, seq: before?.seq ?? n ?? 0, ...(c !== undefined ? { c } : {}), ...(s !== undefined ? { s } : {}) });
    }
  }
  return [...out.values()];
}

/** Does a cut key's event count as after its cutoff? By its place in the space where it has one, else by its number. */
export function isPast(cut: Cutoff, event: Pick<EventView, 'signer' | 'seq' | 'cseq' | 'cs'> & { author?: Did }): boolean {
  if (cut.author !== undefined) return event.author === cut.author && !cut.except?.includes(event.signer);
  if (cut.signer !== event.signer) return false;
  if (event.cseq !== undefined && cut.c !== undefined) return event.cseq > cut.c;
  if (event.cs !== undefined && cut.s !== undefined) return event.cs > cut.s;
  return event.seq > cut.seq || (event.cseq === undefined && event.cs === undefined && cut.f !== undefined && event.seq > cut.f);
}

/** The last numbers per key that count, for a removal or demotion to name (`upTo`), from untrusted input. */
export function parseUpTo(value: unknown): Array<{ signer: Did; seq: number }> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>)
    .slice(0, 64)
    .flatMap(([signer, seq]) => (isDid(signer) && Number.isSafeInteger(seq) && (seq as number) >= 0 ? [{ signer, seq: seq as number }] : []));
}

type Placed = { event: EventView; inner: Inner; at: string; after: number };
const byPlace = (a: Placed, b: Placed) => a.at.localeCompare(b.at) || a.after - b.after || a.event.seq - b.event.seq;

/** Kinds that name the last numbers they saw of someone (upTo): a removal, a demotion, a leave, a handover. */
const NAMES_SEEN = new Set([KIND_REMOVE, KIND_MAINTAINER, KIND_LEAVE, KIND_HANDOVER]);

/**
 * Where each event counts in time: its claimed time, but never before its key's
 * previous event, never before what it says it saw (an upTo names events, so it
 * comes after them), and after any cutoff of its key it is past.
 */
function place(opened: Array<{ event: EventView; inner: Inner }>, cutoffs: Cutoff[], firstOf: Map<EventView, EventView> = new Map()): Placed[] {
  const bySigner = new Map<Did, Placed[]>();
  const placedOf = new Map<EventView, Placed>();
  for (const o of opened) {
    const p: Placed = { event: o.event, inner: o.inner, at: o.event.time, after: 0 };
    placedOf.set(o.event, p);
    const list = bySigner.get(o.event.signer);
    if (list) list.push(p);
    else bySigner.set(o.event.signer, [p]);
  }
  for (const list of bySigner.values()) list.sort((a, b) => a.event.seq - b.event.seq);
  /** A key's last event numbered at most n, as placed so far. */
  const seen = (signer: Did, n: number): Placed | undefined => {
    const list = bySigner.get(signer);
    let found: Placed | undefined;
    for (const p of list ?? []) if (p.event.seq <= n) found = p;
    return found;
  };
  const later = (a: { at: string; after: number }, b: { at: string; after: number }) => a.at > b.at || (a.at === b.at && a.after > b.after);
  // What one event saw can move another: settle in a few passes (a chain of references is rarely long).
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (const [signer, list] of bySigner) {
      const cuts = cutoffs.filter((c) => c.signer === signer || c.author !== undefined);
      let last = { at: '', after: 0 };
      for (const p of list) {
        let place = { at: p.event.time, after: 0 };
        if (later(last, place)) place = { ...last };
        for (const c of cuts) if (isPast(c, p.event) && !later(place, { at: c.time, after: 0 })) place = { at: c.time, after: 1 };
        if (NAMES_SEEN.has(canonicalKind(p.inner.kind))) {
          for (const u of parseAnchors(p.inner.body as Record<string, unknown> | null)) {
            const before = u.signer === signer ? undefined : seen(u.signer, u.seq);
            if (before && !later(place, before)) place = { at: before.at, after: before.after + 1 };
          }
        }
        // The second of two people taking each other's role comes after the first (see orderLosses).
        const first = firstOf.get(p.event);
        const firstPlaced = first && placedOf.get(first);
        if (firstPlaced && !later(place, firstPlaced)) place = { at: firstPlaced.at, after: firstPlaced.after + 1 };
        if (place.at !== p.at || place.after !== p.after) moved = true;
        p.at = place.at;
        p.after = place.after;
        last = place;
      }
    }
    if (!moved && pass > 0) break;
  }
  return [...bySigner.values()].flat().sort(byPlace);
}

const sameCutoffs = (a: Cutoff[], b: Cutoff[]) => a.length === b.length && a.every((c, i) => c.signer === b[i].signer && c.author === b[i].author && c.seq === b[i].seq && c.c === b[i].c && c.s === b[i].s && c.time === b[i].time);

const idOf = (event: EventView) => (event as { id?: string }).id ?? `${event.signer}#${event.seq}`;

/**
 * Two people taking each other's role (a removal or a demotion each way): which
 * came first (H7hk7X9S). If one names, in its anchor, the other as seen, the
 * other came first. If neither does, they are concurrent, and a removed
 * maintainer can always claim that: then the owner's settle decides, else the
 * order in which this node got them (arrival), else claimed time and id. The
 * second doesn't count, as its author had lost the role by then; the owner's
 * node settles the order it saw, so every node ends up alike.
 */
function orderLosses(opened: Array<{ event: EventView; inner: Inner }>, founder: Did, arrival?: (event: EventView) => number | undefined): { firstOf: Map<EventView, EventView>; unsettled: Array<{ first: string; second: string }> } {
  const losses: Array<{ event: EventView; by: Did; of: Did; anchors: Map<Did, Anchor> }> = [];
  const settled = new Map<string, string>();
  for (const { event, inner } of opened) {
    const kind = canonicalKind(inner.kind);
    const b = (inner.body ?? {}) as Record<string, unknown>;
    if (kind === KIND_SETTLE && event.author === founder && typeof b.first === 'string' && typeof b.second === 'string') settled.set([b.first, b.second].sort().join(' '), b.first);
    if ((kind === KIND_REMOVE || (kind === KIND_MAINTAINER && b.on === false)) && isDid(b.member)) losses.push({ event, by: event.author, of: b.member, anchors: new Map(parseAnchors(b).map((u) => [u.signer, u])) });
  }
  const saw = (x: (typeof losses)[number], y: (typeof losses)[number]) => {
    const a = x.anchors.get(y.event.signer);
    return !!a && (a.c !== undefined && y.event.cseq !== undefined ? a.c >= y.event.cseq : a.seq >= y.event.seq);
  };
  const firstOf = new Map<EventView, EventView>();
  const unsettled: Array<{ first: string; second: string }> = [];
  for (let i = 0; i < losses.length; i++) {
    for (let j = i + 1; j < losses.length; j++) {
      const [x, y] = [losses[i], losses[j]];
      if (x.by !== y.of || y.by !== x.of || x.by === y.by) continue;
      let first: (typeof losses)[number];
      if (saw(x, y) !== saw(y, x)) first = saw(x, y) ? y : x;
      else {
        const settle = settled.get([idOf(x.event), idOf(y.event)].sort().join(' '));
        if (settle) first = settle === idOf(x.event) ? x : y;
        else {
          const [ax, ay] = [arrival?.(x.event), arrival?.(y.event)];
          first = ax !== undefined && ay !== undefined && ax !== ay ? (ax < ay ? x : y) : x.event.time !== y.event.time ? (x.event.time < y.event.time ? x : y) : idOf(x.event) < idOf(y.event) ? x : y;
          unsettled.push({ first: idOf(first.event), second: idOf((first === x ? y : x).event) });
        }
      }
      firstOf.set((first === x ? y : x).event, first.event);
    }
  }
  return { firstOf, unsettled };
}

/**
 * Membership from a space's decrypted events, applied in time order. The rules
 * differ by kind: in groups any member invites and the founder removes; in
 * communities any member invites and moderators remove; in projects
 * maintainers do both, invite whole groups, and set rules that let group
 * newcomers in automatically.
 */
export function spaceState(kind: SpaceKind, founder: Did, opened: Array<{ event: EventView; inner: Inner }>, options: { arrival?: (event: EventView) => number | undefined } = {}): SpaceState {
  const { firstOf, unsettled } = orderLosses(opened, founder, options.arrival);
  // Cutoffs come only from removals (and the like) that count, and they move events, which can change what counts: fold until it settles.
  // Each key's lowest n among its content numbered here (cs): see Cutoff.f.
  const firstCs = new Map<Did, number>();
  for (const { event } of opened) if (event.cs !== undefined && event.seq < (firstCs.get(event.signer) ?? Infinity)) firstCs.set(event.signer, event.seq);
  let cutoffs: Cutoff[] = [];
  for (let round = 0; ; round++) {
    const { state, found } = foldSpace(kind, founder, place(opened, cutoffs, firstOf), firstCs);
    if (sameCutoffs(found, cutoffs) || round === 4) return { ...state, ...(found.length ? { cutoffs: found } : {}), ...(unsettled.length ? { unsettled } : {}) };
    cutoffs = found;
  }
}

function foldSpace(kind: SpaceKind, founder: Did, placed: Placed[], firstCs: Map<Did, number> = new Map()): { state: SpaceState; found: Cutoff[] } {
  const found: Cutoff[] = [];
  const cut = (at: string, anchors: Anchor[], managed = false, person?: Did) => {
    for (const u of anchors) {
      const f = firstCs.get(u.signer);
      found.push({ ...u, ...(f !== undefined ? { f } : {}), time: at, ...(managed ? { managed: true as const } : {}) });
    }
    // An anchor (at) names the person's keys it saw: any other key of theirs is anchored at 0.
    if (person) found.push({ signer: person, seq: 0, c: 0, s: 0, author: person, except: anchors.map((u) => u.signer), time: at, ...(managed ? { managed: true as const } : {}) });
  };
  /** A leave's or handover's own key: cut at that event itself, with what it names of its other keys. */
  const own = (event: EventView, body: Record<string, unknown>): Anchor[] => {
    const named = parseAnchors(body);
    const mine = named.find((u) => u.signer === event.signer);
    return [{ ...mine, signer: event.signer, seq: event.seq, ...(event.cseq !== undefined ? { c: event.cseq } : {}) }, ...named.filter((u) => u.signer !== event.signer)];
  };
  const state: SpaceState = { kind, founder, members: new Map(), removed: new Map(), maintainers: new Set([founder]), groups: new Map(), declined: new Map(), left: new Set() };
  /** Anchored (at): its unnamed keys count as anchored at 0 too. Older removals cut only the keys they name. */
  const anchored = (body: Record<string, unknown>) => !!body.at && typeof body.at === 'object';
  const invites = new Map<string, { by: Did; expires: string; accept: boolean; keyed: boolean }>();
  // Invites their makers closed: only who they name came in with them.
  const closes = new Map<string, { by: Did; joined: Set<Did> }>();
  for (const { event, inner } of placed) {
    const b = (inner.body ?? {}) as Record<string, unknown>;
    if (canonicalKind(inner.kind) === KIND_INVITE_CLOSE && typeof b.invite === 'string' && Array.isArray(b.joined)) closes.set(`${event.author} ${b.invite}`, { by: event.author, joined: new Set(b.joined.filter(isDid)) });
  }
  const closedTo = (invite: string, by: Did, who: Did) => {
    const close = closes.get(`${by} ${invite}`);
    return !!close && !close.joined.has(who);
  };
  const may = (author: Did) => (kind === 'project' ? state.maintainers.has(author) : state.tier ? author === state.founder : state.members.has(author));
  const admit = (did: Did, time: string, invitedBy?: Did, via?: string, invite?: string) => {
    state.members.set(did, { did, since: time, ...(invitedBy ? { invitedBy } : {}), ...(via ? { via } : {}), ...(invite ? { invite } : {}) });
    state.removed.delete(did);
    state.declined.delete(did);
    state.left.delete(did);
  };

  for (const { event, inner, at } of placed) {
    const author = event.author;
    const body = (inner.body ?? {}) as Record<string, unknown>;
    switch (canonicalKind(inner.kind)) {
      case KIND_SPACE_CREATE:
        if (author === founder && state.members.size === 0) {
          admit(founder, at);
          if (typeof body.name === 'string') state.name = body.name;
          if (kind === 'group' && body.tier === true) state.tier = true;
        }
        break;
      case KIND_INVITE:
        if (may(author) && typeof body.invite === 'string' && typeof body.expires === 'string') invites.set(body.invite, { by: author, expires: body.expires, accept: body.accept === true, keyed: body.key === true });
        break;
      case KIND_JOIN: {
        const invite = typeof body.invite === 'string' ? invites.get(body.invite) : undefined;
        const live = invite && invite.expires >= at && state.members.has(invite.by) && !closedTo(body.invite as string, invite.by, author);
        // A link with a key: the join must prove it holds it (xQ0as76W). One without (older links): nobody comes back with it after leaving,
        // since its id is in the space for every member to read and cite.
        const proven = !!invite && (invite.keyed ? joinProven(body.invite as string, body.proof, event.scope, author) : !state.left.has(author));
        if (live && proven && !invite.accept && !state.members.has(author) && (!state.removed.has(author) || state.left.has(author))) admit(author, at, invite.by, undefined, body.invite as string);
        break;
      }
      case KIND_REMOVE: {
        const allowed = kind === 'group' ? author === state.founder : state.maintainers.has(author);
        if (allowed && isDid(body.member) && body.member !== state.founder && state.members.has(body.member)) {
          const anchors = parseAnchors(body);
          const managed = state.maintainers.has(body.member);
          state.members.delete(body.member);
          state.maintainers.delete(body.member);
          state.removed.set(body.member, at);
          cut(at, anchors, managed, anchored(body) ? body.member : undefined);
        } else if (allowed && isDid(body.member) && state.removed.has(body.member) && anchored(body)) {
          // Someone removed before removals named what they saw: anchored now, by what this one saw of them.
          cut(at, parseAnchors(body), false, body.member);
        }
        break;
      }
      case KIND_MAINTAINER:
        if (kind !== 'group' && state.maintainers.has(author) && isDid(body.member) && body.member !== state.founder) {
          if (body.on === false) {
            const anchors = parseAnchors(body);
            if (state.maintainers.delete(body.member)) cut(at, anchors, true, anchored(body) ? body.member : undefined);
          } else if (state.members.has(body.member)) state.maintainers.add(body.member);
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
          const live = invite && invite.by === author && invite.expires >= at && state.members.has(author) && !(isDid(body.member) && closedTo(body.invite, author, body.member));
          if (live && isDid(body.member) && !state.members.has(body.member)) admit(body.member, at, author, undefined, body.invite);
          break;
        }
        const via = typeof body.via === 'string' ? body.via : undefined;
        // By a group's rule: only from someone who came in by that group themselves (99ZpCdH6). Anyone else can't know who's in it.
        const ruled = via !== undefined && state.groups.get(via)?.auto === true && state.members.get(author)?.via === via;
        // In groups (not tiers), their owner admits directly: a company putting its people in (stage 10).
        const admits = kind === 'project' || (kind === 'group' && !state.tier && author === state.founder);
        if (admits && isDid(body.member) && (state.maintainers.has(author) || ruled) && !state.members.has(body.member)) {
          admit(body.member, at, author, via);
        }
        break;
      }
      case KIND_MEMBERSHIP:
        // A tier's founder admits or renews a member until a date (see memberships.ts).
        if (kind === 'group' && author === state.founder && isMembershipBody(body)) {
          if (!state.members.has(body.member)) admit(body.member, at, founder);
          state.members.get(body.member)!.until = body.until;
        }
        break;
      case KIND_LEAVE:
        if (state.members.has(author) && author !== state.founder) {
          const managed = state.maintainers.has(author);
          state.members.delete(author);
          state.maintainers.delete(author);
          state.removed.set(author, at);
          state.left.add(author);
          cut(at, own(event, body), managed);
        }
        break;
      case KIND_HANDOVER:
        if (author === state.founder && !state.tier && isDid(body.to) && body.to !== author && state.members.has(body.to)) {
          state.founder = body.to;
          state.maintainers.add(body.to);
          // In groups only the owner manages: handing it over ends that. In projects and communities they stay a maintainer.
          if (kind === 'group') cut(at, own(event, body), true);
        }
        break;
      case KIND_CLOSE:
        if (canManage(state, author)) state.closed = body.closed === false ? undefined : { by: author, time: at };
        break;
      case KIND_MANAGED: {
        const ttl = Number(body.ttlMinutes);
        const grace = Number(body.graceHours);
        if (kind !== 'direct' && author === state.founder && body.provider && typeof body.provider === 'object' && ttl > 0 && grace >= 0)
          state.managed = { provider: body.provider as Json, ttlMinutes: ttl, graceHours: grace, ...(isDid(body.attestor) ? { attestor: body.attestor } : {}), ...(typeof body.company === 'string' ? { company: body.company } : {}), ...(Number.isSafeInteger(body.from) ? { from: body.from as number } : {}), by: author, time: at };
        break;
      }
      case KIND_AGENT_APPROVE:
        if (canManage(state, author) && isDid(body.agent)) {
          state.approvedAgents ??= new Set();
          if (body.on === false) state.approvedAgents.delete(body.agent);
          else state.approvedAgents.add(body.agent);
        }
        break;
      case KIND_HOLD:
        if (author === state.founder && typeof body.until === 'string' && !Number.isNaN(Date.parse(body.until)))
          state.hold = { until: body.until, reason: typeof body.reason === 'string' ? body.reason.slice(0, 200) : '', by: author, time: at };
        break;
      case KIND_HISTORY:
        if (kind !== 'direct' && canManage(state, author) && HISTORIES.includes(body.history as HistorySetting)) state.history = { value: body.history as HistorySetting, by: author, time: at };
        break;
      case KIND_DECLINE:
        if (kind === 'project' && state.maintainers.has(author) && isDid(body.member) && typeof body.via === 'string' && !state.members.has(body.member)) {
          state.declined.set(body.member, body.via);
        }
        break;
    }
  }
  return { state, found };
}

/** Should an event by this author be shown? Members yes; removed members only for what they wrote before removal. */
export function visibleIn(state: SpaceState, event: EventView, inner: Inner): boolean {
  const kind = canonicalKind(inner.kind);
  if (kind === KIND_JOIN || kind === KIND_SPACE_CREATE) return true;
  if (state.members.has(event.author)) return true;
  const removedAt = state.removed.get(event.author);
  if (removedAt === undefined) return false;
  if (state.cutoffs?.some((c) => isPast(c, event))) return false;
  return event.time < removedAt;
}

/**
 * Does a rekey count? Its author manages the space today, or managed it as of
 * the rekey's own number (they lost the role later, past it): judged by when it
 * was made, not by today. One numbered past their loss doesn't.
 */
export const rekeyCounts = (state: SpaceState, event: Pick<EventView, 'author' | 'signer' | 'seq' | 'cseq' | 'cs'>): boolean =>
  canManage(state, event.author) || !!state.cutoffs?.some((c) => c.managed && c.signer === event.signer && !isPast(c, event));

/** May this person remove members and rotate keys (and, in projects and communities, curate boards)? */
export const canManage = (state: SpaceState, did: Did): boolean => (state.kind === 'group' ? did === state.founder : state.maintainers.has(did));
