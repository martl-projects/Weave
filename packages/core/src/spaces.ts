import { sha256 } from '@noble/hashes/sha2.js';
import { KIND_SEALED } from './authority.ts';
import { b64u, canonicalJson, utf8, type Json } from './bytes.ts';
import { boxTo, open, openBox, randomBytes, seal, type Box, type Sealed } from './crypto.ts';
import type { EventFields, SigningIdentity, WeaveEvent } from './events.ts';
import { isDid, type Did } from './keys.ts';

/*
 * Spaces are the encrypted rooms of Weave. There are two kinds:
 *
 *   group    a collection of people with their own chat; can be invited into projects
 *   project  something being built: chat, discussion, votes, issues and a page
 *
 * Both use the same machinery (v1): a shared symmetric key per epoch; removing
 * someone starts a new epoch whose key is boxed to everyone who stays. MLS
 * replaces this later.
 *
 * Membership events, sealed inside the space:
 *   weave.space.create      {name}             the founder, first event
 *   weave.invite            {invite, expires}  group: any member · project: maintainers
 *   weave.space.join        {invite}           the newcomer, citing an invite link
 *   weave.space.remove      {member}           group: founder · project: maintainers
 * projects only:
 *   weave.project.maintainer {member, on}      maintainers appoint or drop maintainers
 *   weave.project.group      {group, name, on} maintainers invite (or uninvite) a whole group
 *   weave.project.rule       {group, auto}     maintainers: admit that group's newcomers without asking
 *   weave.project.admit      {member, via}     maintainers, or anyone in the project when a rule allows
 *   weave.project.decline    {member, via}     maintainers turn a group newcomer away
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

export type SpaceKind = 'group' | 'project';

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
  return (kind === 'group' || kind === 'project') && id ? { kind, id } : undefined;
}

/** Topic name for the DHT, derived from the space secret. */
export const spaceTopic = (space: SpaceKeys): string => `space/${b64u.encode(sha256(utf8(`weave/space-topic/v1:${space.secret}`)))}`;

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

export const currentEpoch = (space: SpaceKeys): number => Math.max(...Object.keys(space.keys).map(Number));

const context = (space: Pick<SpaceKeys, 'kind' | 'id'>, epoch: number) => `weave/${space.kind}/v1:${space.id}:${epoch}`;

/** Event fields for an encrypted event in a space, sealed with the current epoch key. */
export function sealFor(space: SpaceKeys, inner: Inner): EventFields {
  const epoch = currentEpoch(space);
  const key = b64u.decode(space.keys[String(epoch)]);
  return { kind: KIND_SEALED, scope: spaceScope(space), body: { epoch, ...seal(key, inner as unknown as Json, context(space, epoch)) } };
}

/** Decrypt a sealed event of a space, or undefined if we lack the key or it doesn't decrypt. */
export function openIn(space: SpaceKeys, event: WeaveEvent): Inner | undefined {
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
export function rekey(space: SpaceKeys, members: Did[]): { fields: EventFields; epoch: number; key: string } {
  const epoch = currentEpoch(space) + 1;
  const key = b64u.encode(randomBytes(32));
  const boxes: Record<string, Box> = {};
  for (const member of members) boxes[member] = boxTo(member, { space: space.id, epoch, key });
  return { fields: { kind: KIND_REKEY, scope: spaceScope(space), body: { epoch, boxes } }, epoch, key };
}

/** If a rekey event carries a key for `me`, return it. */
export function openRekey(event: WeaveEvent, me: SigningIdentity): { epoch: number; key: string } | undefined {
  const body = event.body as { epoch?: unknown; boxes?: Record<string, Box> } | null;
  const box = body?.boxes?.[me.did];
  if (event.kind !== KIND_REKEY || !box) return undefined;
  try {
    const opened = openBox(me.keys.secretKey, me.keys.publicKey, box) as { space?: string; epoch?: number; key?: string };
    if (opened.space !== parseScope(event.scope)?.id || opened.epoch !== body!.epoch || typeof opened.key !== 'string') return undefined;
    return { epoch: opened.epoch as number, key: opened.key };
  } catch {
    return undefined;
  }
}

/**
 * Hand a space's keys to newly admitted people. Posted in a scope they already
 * follow (the group they came through), boxed so only they can open it.
 */
export function gift(space: SpaceKeys, recipients: Did[], scope: string, entry: Invite['entry']): EventFields {
  const boxes: Record<string, Box> = {};
  for (const did of recipients) boxes[did] = boxTo(did, { space: space as unknown as Json, entry: entry as unknown as Json });
  return { kind: KIND_GIFT, scope, body: { space: space.id, boxes } };
}

/** If a gift event carries a space for `me`, return it. */
export function openGift(event: WeaveEvent, me: SigningIdentity): { space: SpaceKeys; entry: Invite['entry'] } | undefined {
  const body = event.body as { boxes?: Record<string, Box> } | null;
  const box = body?.boxes?.[me.did];
  if (event.kind !== KIND_GIFT || !box) return undefined;
  try {
    const opened = openBox(me.keys.secretKey, me.keys.publicKey, box) as { space?: SpaceKeys; entry?: Invite['entry'] };
    const space = opened.space;
    if (!space || (space.kind !== 'group' && space.kind !== 'project') || !isDid(space.founder) || !space.keys) return undefined;
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
  if (invite?.v !== 2 || !s || (s.kind !== 'group' && s.kind !== 'project') || typeof s.id !== 'string' || !isDid(s.founder) || !isDid(invite.inviter) || typeof s.secret !== 'string' || !s.keys) {
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
  founder: Did;
  name?: string;
  members: Map<Did, Member>;
  /** Removed member → time of removal. Their earlier events stay visible. */
  removed: Map<Did, string>;
  /** Projects: who may invite, admit, remove and set rules. Groups: just the founder. */
  maintainers: Set<Did>;
  /** Projects: groups invited as a whole. */
  groups: Map<string, InvitedGroup>;
  /** Projects: group newcomers a maintainer turned away (member → group id). */
  declined: Map<Did, string>;
}

const byTime = (a: { event: WeaveEvent }, b: { event: WeaveEvent }) => a.event.time.localeCompare(b.event.time) || a.event.seq - b.event.seq;

/**
 * Membership from a space's decrypted events, applied in time order. The rules
 * differ by kind: in groups any member invites and the founder removes; in
 * projects maintainers do both, invite whole groups, and set rules that let
 * group newcomers in automatically.
 */
export function spaceState(kind: SpaceKind, founder: Did, opened: Array<{ event: WeaveEvent; inner: Inner }>): SpaceState {
  const state: SpaceState = { kind, founder, members: new Map(), removed: new Map(), maintainers: new Set([founder]), groups: new Map(), declined: new Map() };
  const invites = new Map<string, { by: Did; expires: string }>();
  const may = (author: Did) => (kind === 'group' ? state.members.has(author) : state.maintainers.has(author));
  const admit = (did: Did, time: string, invitedBy?: Did, via?: string) => {
    state.members.set(did, { did, since: time, ...(invitedBy ? { invitedBy } : {}), ...(via ? { via } : {}) });
    state.removed.delete(did);
    state.declined.delete(did);
  };

  for (const { event, inner } of [...opened].sort(byTime)) {
    const author = event.author;
    const body = (inner.body ?? {}) as Record<string, unknown>;
    switch (inner.kind) {
      case KIND_SPACE_CREATE:
        if (author === founder && state.members.size === 0) {
          admit(founder, event.time);
          if (typeof body.name === 'string') state.name = body.name;
        }
        break;
      case KIND_INVITE:
        if (may(author) && typeof body.invite === 'string' && typeof body.expires === 'string') invites.set(body.invite, { by: author, expires: body.expires });
        break;
      case KIND_JOIN: {
        const invite = typeof body.invite === 'string' ? invites.get(body.invite) : undefined;
        const live = invite && invite.expires >= event.time && state.members.has(invite.by);
        if (live && !state.members.has(author) && !state.removed.has(author)) admit(author, event.time, invite.by);
        break;
      }
      case KIND_REMOVE: {
        const allowed = kind === 'group' ? author === founder : state.maintainers.has(author);
        if (allowed && isDid(body.member) && body.member !== founder && state.members.has(body.member)) {
          state.members.delete(body.member);
          state.maintainers.delete(body.member);
          state.removed.set(body.member, event.time);
        }
        break;
      }
      case KIND_MAINTAINER:
        if (kind === 'project' && state.maintainers.has(author) && isDid(body.member) && body.member !== founder) {
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
        const via = typeof body.via === 'string' ? body.via : undefined;
        const ruled = via !== undefined && state.groups.get(via)?.auto === true && state.members.has(author);
        if (kind === 'project' && isDid(body.member) && (state.maintainers.has(author) || ruled) && !state.members.has(body.member)) {
          admit(body.member, event.time, author, via);
        }
        break;
      }
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
export function visibleIn(state: SpaceState, event: WeaveEvent, inner: Inner): boolean {
  if (inner.kind === KIND_JOIN || inner.kind === KIND_SPACE_CREATE) return true;
  if (state.members.has(event.author)) return true;
  const removedAt = state.removed.get(event.author);
  return removedAt !== undefined && event.time < removedAt;
}

/** May this person remove members and rotate keys? */
export const canManage = (state: SpaceState, did: Did): boolean => (state.kind === 'group' ? did === state.founder : state.maintainers.has(did));
