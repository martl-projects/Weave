import { sha256 } from '@noble/hashes/sha2.js';
import { KIND_SEALED } from './authority.ts';
import { b64u, canonicalJson, utf8, type Json } from './bytes.ts';
import { boxTo, open, openBox, randomBytes, seal, type Box, type Sealed } from './crypto.ts';
import type { EventFields, SigningIdentity, WeaveEvent } from './events.ts';
import { isDid, type Did } from './keys.ts';

/*
 * Groups (v1): a shared symmetric key per epoch, handed out in invites.
 * Removing a member starts a new epoch whose key is boxed to each remaining
 * member. MLS replaces this later.
 *
 * Inside the group, these are the (encrypted) kinds that shape membership:
 *   weave.group.create  {name}            founder only, first event
 *   weave.invite        {invite, expires}  any member
 *   weave.group.join    {invite}           the newcomer, citing an invite
 *   weave.group.remove  {member}           founder only
 * and in the clear, because removed members must not be able to read it:
 *   weave.group.rekey   {epoch, boxes}     founder only
 */
export const KIND_GROUP_CREATE = 'weave.group.create';
export const KIND_INVITE = 'weave.invite';
export const KIND_JOIN = 'weave.group.join';
export const KIND_REMOVE = 'weave.group.remove';
export const KIND_REKEY = 'weave.group.rekey';

/** Everything a member holds about a group. Secret: whoever has it can read the group. */
export interface GroupKeys {
  id: string;
  name: string;
  founder: Did;
  /** Seed for the DHT topic, so outsiders can't tell which group a node is in. */
  secret: string;
  /** Epoch number → base64url key. Members keep old epochs to read history. */
  keys: Record<string, string>;
}

export interface Inner {
  kind: string;
  body: Json;
}

export const groupScope = (id: string): string => `group:${id}`;

export const groupIdOf = (scope: string): string | undefined => (scope.startsWith('group:') ? scope.slice(6) : undefined);

/** Topic name for the DHT, derived from the group secret. */
export const groupTopic = (group: GroupKeys): string =>
  `group/${b64u.encode(sha256(utf8(`weave/group-topic/v1:${group.secret}`)))}`;

export function newGroup(name: string, founder: Did): GroupKeys {
  return {
    id: b64u.encode(randomBytes(16)),
    name,
    founder,
    secret: b64u.encode(randomBytes(32)),
    keys: { '0': b64u.encode(randomBytes(32)) },
  };
}

export const currentEpoch = (group: GroupKeys): number => Math.max(...Object.keys(group.keys).map(Number));

const groupContext = (id: string, epoch: number) => `weave/group/v1:${id}:${epoch}`;

/** Event fields for an encrypted group event, sealed with the current epoch key. */
export function sealForGroup(group: GroupKeys, inner: Inner): EventFields {
  const epoch = currentEpoch(group);
  const key = b64u.decode(group.keys[String(epoch)]);
  return {
    kind: KIND_SEALED,
    scope: groupScope(group.id),
    body: { epoch, ...seal(key, inner as unknown as Json, groupContext(group.id, epoch)) },
  };
}

/** Decrypt a sealed group event, or undefined if we lack the key or it doesn't decrypt. */
export function openGroupEvent(group: GroupKeys, event: WeaveEvent): Inner | undefined {
  if (event.kind !== KIND_SEALED || event.scope !== groupScope(group.id)) return undefined;
  const body = event.body as (Sealed & { epoch?: unknown }) | null;
  if (!body || !Number.isSafeInteger(body.epoch)) return undefined;
  const key = group.keys[String(body.epoch)];
  if (!key) return undefined;
  try {
    const inner = open(b64u.decode(key), body, groupContext(group.id, body.epoch as number)) as unknown as Inner;
    return typeof inner?.kind === 'string' ? inner : undefined;
  } catch {
    return undefined;
  }
}

/** Start a new epoch: a fresh key, boxed to each member. Returns the event fields and the new key. */
export function rekey(group: GroupKeys, members: Did[]): { fields: EventFields; epoch: number; key: string } {
  const epoch = currentEpoch(group) + 1;
  const key = b64u.encode(randomBytes(32));
  const boxes: Record<string, Box> = {};
  for (const member of members) boxes[member] = boxTo(member, { group: group.id, epoch, key });
  return { fields: { kind: KIND_REKEY, scope: groupScope(group.id), body: { epoch, boxes } }, epoch, key };
}

/** If a rekey event carries a key for `me`, return it. */
export function openRekey(event: WeaveEvent, me: SigningIdentity): { epoch: number; key: string } | undefined {
  const body = event.body as { epoch?: unknown; boxes?: Record<string, Box> } | null;
  const box = body?.boxes?.[me.did];
  if (event.kind !== KIND_REKEY || !box) return undefined;
  try {
    const opened = openBox(me.keys.secretKey, me.keys.publicKey, box) as { group?: string; epoch?: number; key?: string };
    if (opened.group !== groupIdOf(event.scope) || opened.epoch !== body!.epoch || typeof opened.key !== 'string') return undefined;
    return { epoch: opened.epoch as number, key: opened.key };
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------- invites

/**
 * An invite link carries the group's keys plus entry points: topics where the
 * inviter can be reached, and bootstrap nodes if the inviter doesn't use the
 * public DHT. Anyone holding it can join, so it is shared privately.
 */
export interface Invite {
  v: 1;
  group: GroupKeys;
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
  const g = invite?.group;
  if (invite?.v !== 1 || !g || typeof g.id !== 'string' || !isDid(g.founder) || !isDid(invite.inviter) || typeof g.secret !== 'string' || !g.keys) {
    throw new Error('invite is damaged');
  }
  if (Date.parse(invite.expires) < Date.now()) throw new Error('invite has expired');
  return invite;
}

// ---------------------------------------------------------------- membership

export interface Member {
  did: Did;
  invitedBy?: Did;
  since: string;
}

export interface GroupState {
  founder: Did;
  name?: string;
  members: Map<Did, Member>;
  /** Removed member → time of removal. Their earlier events stay visible. */
  removed: Map<Did, string>;
}

/**
 * Membership from a group's decrypted events, applied in time order. Rules:
 * the founder creates and removes; members invite; a join counts only if it
 * cites a live invite from someone who was a member at the time.
 */
export function groupState(founder: Did, opened: Array<{ event: WeaveEvent; inner: Inner }>): GroupState {
  const state: GroupState = { founder, members: new Map(), removed: new Map() };
  const invites = new Map<string, { by: Did; expires: string }>();
  const sorted = [...opened].sort((a, b) => a.event.time.localeCompare(b.event.time) || a.event.seq - b.event.seq);

  for (const { event, inner } of sorted) {
    const author = event.author;
    const body = (inner.body ?? {}) as Record<string, unknown>;
    const isMember = state.members.has(author);
    switch (inner.kind) {
      case KIND_GROUP_CREATE:
        if (author === founder && state.members.size === 0) {
          state.members.set(founder, { did: founder, since: event.time });
          if (typeof body.name === 'string') state.name = body.name;
        }
        break;
      case KIND_INVITE:
        if (isMember && typeof body.invite === 'string' && typeof body.expires === 'string') {
          invites.set(body.invite, { by: author, expires: body.expires });
        }
        break;
      case KIND_JOIN: {
        const invite = typeof body.invite === 'string' ? invites.get(body.invite) : undefined;
        const live = invite && invite.expires >= event.time && state.members.has(invite.by);
        if (live && !isMember && !state.removed.has(author)) {
          state.members.set(author, { did: author, invitedBy: invite.by, since: event.time });
        }
        break;
      }
      case KIND_REMOVE:
        if (author === founder && isDid(body.member) && body.member !== founder && state.members.has(body.member)) {
          state.members.delete(body.member);
          state.removed.set(body.member, event.time);
        }
        break;
    }
  }
  return state;
}

/** Should an event by this author be shown? Members yes; removed members only for what they wrote before removal. */
export function visibleIn(state: GroupState, event: WeaveEvent, inner: Inner): boolean {
  if (inner.kind === KIND_JOIN || inner.kind === KIND_GROUP_CREATE) return true;
  if (state.members.has(event.author)) return true;
  const removedAt = state.removed.get(event.author);
  return removedAt !== undefined && event.time < removedAt;
}
