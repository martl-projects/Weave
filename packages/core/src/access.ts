import { b64u, type Json } from './bytes.ts';
import { boxTo, open, openBox, randomBytes, seal, type Box, type Sealed } from './crypto.ts';
import type { Entry } from './collab.ts';
import { isDid, type Did } from './keys.ts';
import { KIND_BOARD_SEALED } from './posts.ts';
import type { EncryptionKeyOf, Inner, Recipient, SpaceKeys, SpaceState } from './spaces.ts';

/*
 * Who may read and write a project's boards. Without rules, everyone in the
 * project reads and writes every board. Maintainers can limit a board to
 * people and groups, separately for reading and writing:
 *
 *   weave.board.access   {board, read, write}   maintainers; each a list of grantees, or null for everyone
 *   weave.project.roster {group, members}       maintainers: who of a group takes part, for those who
 *                                                can't see the group (the latest roster counts)
 *   weave.board.key      {board, epoch, boxes}  a read-limited board's key, boxed to its readers; any
 *                                                project member holding the key may pass it on
 *   weave.board.sealed   {board, epoch, …}      an event of a read-limited board, sealed with its key
 *                                                inside the project's own sealing
 *
 * Invite links can carry rights too (an invite's `access`), which then apply
 * to whoever joined (or was admitted) with that link. Maintainers always read
 * and write everything.
 */
export const KIND_BOARD_ACCESS = 'weave.board.access';
export const KIND_ROSTER = 'weave.project.roster';
export const KIND_BOARD_KEY = 'weave.board.key';

export type Grantee = { person: Did } | { group: string };

/** Rights an invite link carries for one board. */
export interface BoardRight {
  board: string;
  read?: boolean;
  write?: boolean;
}

export interface BoardRules {
  /** undefined: everyone in the project. */
  read?: Grantee[];
  write?: Grantee[];
}

export interface Access {
  rules: Map<string, BoardRules>;
  /** Group id → people a maintainer says take part through it. */
  rosters: Map<string, Set<Did>>;
  /** Person → rights from the invite link they came in with. */
  invited: Map<Did, BoardRight[]>;
}

const field = (body: Json, key: string): unknown => (body && typeof body === 'object' && !Array.isArray(body) ? body[key] : undefined);
const byTime = (a: Entry, b: Entry) => a.event.time.localeCompare(b.event.time) || a.event.seq - b.event.seq;

export function parseGrantees(value: unknown): Grantee[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: Grantee[] = [];
  for (const g of value.slice(0, 500)) {
    if (isDid(field(g as Json, 'person'))) out.push({ person: field(g as Json, 'person') as Did });
    else if (typeof field(g as Json, 'group') === 'string') out.push({ group: field(g as Json, 'group') as string });
  }
  return out;
}

export function parseRights(value: unknown): BoardRight[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 50)
    .filter((r) => typeof field(r as Json, 'board') === 'string')
    .map((r) => ({ board: field(r as Json, 'board') as string, ...(field(r as Json, 'read') === true ? { read: true } : {}), ...(field(r as Json, 'write') === true ? { write: true } : {}) }));
}

/** Board rules, group rosters and invite rights of a project, from its entries. */
export function accessOf(entries: Entry[], state: SpaceState, invites: Map<string, BoardRight[]>): Access {
  const rules = new Map<string, BoardRules>();
  const rosters = new Map<string, Set<Did>>();
  for (const e of [...entries].sort(byTime)) {
    if (!state.maintainers.has(e.event.author)) continue;
    if (e.kind === KIND_BOARD_ACCESS && typeof field(e.body, 'board') === 'string') {
      const read = parseGrantees(field(e.body, 'read'));
      const write = parseGrantees(field(e.body, 'write'));
      rules.set(field(e.body, 'board') as string, { ...(read ? { read } : {}), ...(write ? { write } : {}) });
    } else if (e.kind === KIND_ROSTER && typeof field(e.body, 'group') === 'string' && Array.isArray(field(e.body, 'members'))) {
      rosters.set(field(e.body, 'group') as string, new Set((field(e.body, 'members') as unknown[]).filter(isDid)));
    }
  }
  const invited = new Map<Did, BoardRight[]>();
  for (const member of state.members.values()) {
    const rights = member.invite ? invites.get(member.invite) : undefined;
    if (rights?.length) invited.set(member.did, rights);
  }
  return { rules, rosters, invited };
}

function matches(grantees: Grantee[], did: Did, state: SpaceState, access: Access): boolean {
  const member = state.members.get(did);
  return grantees.some((g) => ('person' in g ? g.person === did : member?.via === g.group || !!access.rosters.get(g.group)?.has(did)));
}

/** May this person read (or write) a board? Only people in the project can, and maintainers always can. */
export function mayUse(how: 'read' | 'write', board: string, did: Did, state: SpaceState, access: Access): boolean {
  if (!state.members.has(did)) return false;
  if (state.maintainers.has(did)) return true;
  const rules = access.rules.get(board);
  const invite = access.invited.get(did)?.find((r) => r.board === board);
  if (how === 'write') {
    if (!mayUse('read', board, did, state, access)) return false;
    return !rules?.write || matches(rules.write, did, state, access) || !!invite?.write;
  }
  return !rules?.read || matches(rules.read, did, state, access) || !!invite?.read || !!invite?.write;
}

export const isReadLimited = (board: string, access: Access): boolean => !!access.rules.get(board)?.read;

/** Everyone in the project who may read a board. */
export const readersOf = (board: string, state: SpaceState, access: Access): Did[] => [...state.members.keys()].filter((did) => mayUse('read', board, did, state, access));

// ---------------------------------------------------------------- which board an event belongs to

/** Item events: they say their board, or (issues, proposals) live in the first board of their type. */
const TARGET_FIELDS: Record<string, string> = {
  'weave.vote': 'proposal',
  'weave.issue.claim': 'issue',
  'weave.issue.status': 'issue',
  'weave.reply': 'target',
  'weave.msg': 'post',
  'weave.upvote': 'target',
  'weave.react': 'target',
};

/**
 * The board of each event that belongs to one: posts, issues and proposals by
 * their own board; votes, replies, post chat, upvotes and reactions by the
 * board of what they point at. `defaults` gives the board for issues and
 * proposals that don't name one.
 */
export function boardOfEvents(entries: Entry[], defaults: { issues?: string; proposals?: string }): Map<string, string> {
  const boards = new Map<string, string>();
  for (const e of entries) {
    const named = field(e.body, 'board');
    if (e.kind === 'weave.post' && typeof named === 'string') boards.set(e.id, named);
    else if (e.kind === 'weave.issue') boards.set(e.id, typeof named === 'string' ? named : (defaults.issues ?? 'issues'));
    else if (e.kind === 'weave.proposal') boards.set(e.id, typeof named === 'string' ? named : (defaults.proposals ?? 'proposals'));
  }
  for (const e of entries) {
    const key = TARGET_FIELDS[e.kind];
    const target = key ? field(e.body, key) : undefined;
    const board = typeof target === 'string' ? boards.get(target) : undefined;
    if (board && !boards.has(e.id)) boards.set(e.id, board);
  }
  return boards;
}

/** The board a new event (not yet written) will belong to. */
export function boardOfInner(inner: Inner, boards: Map<string, string>, defaults: { issues?: string; proposals?: string }): string | undefined {
  const named = field(inner.body, 'board');
  if (inner.kind === 'weave.post') return typeof named === 'string' ? named : undefined;
  if (inner.kind === 'weave.issue') return typeof named === 'string' ? named : (defaults.issues ?? 'issues');
  if (inner.kind === 'weave.proposal') return typeof named === 'string' ? named : (defaults.proposals ?? 'proposals');
  const key = TARGET_FIELDS[inner.kind];
  const target = key ? field(inner.body, key) : undefined;
  return typeof target === 'string' ? boards.get(target) : undefined;
}

// ---------------------------------------------------------------- board keys

const context = (space: Pick<SpaceKeys, 'id'>, board: string, epoch: number) => `weave/board/v1:${space.id}:${board}:${epoch}`;

/** Seal an event for a read-limited board; the result is sealed again for the project. */
export function sealForBoard(space: Pick<SpaceKeys, 'id'>, board: string, epoch: number, key: string, inner: Inner): Inner {
  return { kind: KIND_BOARD_SEALED, body: { board, epoch, ...seal(b64u.decode(key), inner as unknown as Json, context(space, board, epoch)) } };
}

/** Open an event of a read-limited board, if we hold its key. */
export function openBoard(space: Pick<SpaceKeys, 'id'>, inner: Inner, keys: Record<string, Record<string, string>> | undefined): (Inner & { board: string }) | undefined {
  const board = field(inner.body, 'board');
  const epoch = field(inner.body, 'epoch');
  if (inner.kind !== KIND_BOARD_SEALED || typeof board !== 'string' || !Number.isSafeInteger(epoch)) return undefined;
  const key = keys?.[board]?.[String(epoch)];
  if (!key) return undefined;
  try {
    const opened = open(b64u.decode(key), inner.body as unknown as Sealed, context(space, board, epoch as number)) as unknown as Inner;
    return typeof opened?.kind === 'string' && opened.kind !== KIND_BOARD_SEALED ? { ...opened, board } : undefined;
  } catch {
    return undefined;
  }
}

export const newBoardKey = (): string => b64u.encode(randomBytes(32));

/** A board key boxed to people (to put inside the project, sealed). */
export function boardKeyFor(space: Pick<SpaceKeys, 'id'>, board: string, epoch: number, key: string, recipients: Did[], encryptionKeyOf: EncryptionKeyOf): Inner {
  const boxes: Record<string, Box> = {};
  for (const did of recipients) boxes[did] = boxTo(encryptionKeyOf(did), { space: space.id, board, epoch, key });
  return { kind: KIND_BOARD_KEY, body: { board, epoch, boxes: boxes as unknown as Json } };
}

/** The board key in a weave.board.key event for `me`, if any. */
export function openBoardKey(space: Pick<SpaceKeys, 'id'>, inner: Inner, me: Recipient): { board: string; epoch: number; key: string } | undefined {
  const box = (field(inner.body, 'boxes') as Record<string, Box> | undefined)?.[me.author];
  if (inner.kind !== KIND_BOARD_KEY || !box) return undefined;
  try {
    const opened = openBox(me.keys.secretKey, me.keys.publicKey, box) as { space?: string; board?: string; epoch?: number; key?: string };
    if (opened.space !== space.id || opened.board !== field(inner.body, 'board') || opened.epoch !== field(inner.body, 'epoch') || typeof opened.key !== 'string') return undefined;
    return { board: opened.board!, epoch: opened.epoch!, key: opened.key };
  } catch {
    return undefined;
  }
}

/** Who holds a box for each epoch of each board, from the key events. */
export function keyHolders(entries: Entry[]): Map<string, Map<number, Set<Did>>> {
  const out = new Map<string, Map<number, Set<Did>>>();
  for (const e of entries) {
    if (e.kind !== KIND_BOARD_KEY) continue;
    const board = field(e.body, 'board');
    const epoch = field(e.body, 'epoch');
    const boxes = field(e.body, 'boxes');
    if (typeof board !== 'string' || !Number.isSafeInteger(epoch) || !boxes || typeof boxes !== 'object') continue;
    const epochs = out.get(board) ?? new Map<number, Set<Did>>();
    const holders = epochs.get(epoch as number) ?? new Set<Did>();
    for (const did of Object.keys(boxes)) if (isDid(did)) holders.add(did);
    epochs.set(epoch as number, holders);
    out.set(board, epochs);
  }
  return out;
}

/** Board rights carried by each of a project's invite links (only maintainers' links carry any). */
export function inviteRightsOf(entries: Entry[], state: SpaceState): Map<string, BoardRight[]> {
  const out = new Map<string, BoardRight[]>();
  for (const e of entries) {
    const invite = field(e.body, 'invite');
    if (e.kind === 'weave.invite' && typeof invite === 'string' && state.maintainers.has(e.event.author)) {
      const rights = parseRights(field(e.body, 'access'));
      if (rights.length) out.set(invite, rights);
    }
  }
  return out;
}
