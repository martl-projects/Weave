import type { Json } from './bytes.ts';
import { KIND_ISSUE, KIND_PROPOSAL, KIND_THREAD, type Entry } from './collab.ts';
import type { Did } from './keys.ts';
import type { SpaceKind } from './spaces.ts';

/*
 * Posts, boards and upvotes: the Reddit side of Weave. A project is itself a
 * post (its weave.space.create event) with boards inside it; a community is
 * one board of posts. Every post has a chat (weave.msg with `post`) instead of
 * a comment tree.
 *
 *   weave.post     {title, text, link, board, share}   a post in a community or in a project's board
 *   weave.upvote   {target, value}                     1, 0 or -1; the latest per person counts
 *   weave.board    {name, title, type, sort, position, on}
 *                                                      project maintainers add, change or drop a board
 *   weave.curate   {board, pinned}                     maintainers or moderators: a board's pinned posts, in order
 *   weave.save     {target, mode}                      sealed to yourself: saved | pinned | null
 *
 * Boards of type `issues` and `proposals` list weave.issue and weave.proposal
 * events, so the existing work and votes live in boards too. Threads from
 * before boards existed show up in "ideas"; project posts without a board are
 * releases.
 */
export const KIND_POST = 'weave.post';
export const KIND_UPVOTE = 'weave.upvote';
export const KIND_BOARD = 'weave.board';
export const KIND_CURATE = 'weave.curate';
export const KIND_SAVE = 'weave.save';

export const BOARD_TYPES = ['posts', 'issues', 'proposals'] as const;
export type BoardType = (typeof BOARD_TYPES)[number];
export const POST_SORTS = ['hot', 'new', 'top'] as const;
export type PostSort = (typeof POST_SORTS)[number];
export const SAVE_MODES = ['saved', 'pinned'] as const;
export type SaveMode = (typeof SAVE_MODES)[number];

/** The one board of a community. */
export const COMMUNITY_BOARD = 'posts';

export interface Board {
  name: string;
  title: string;
  type: BoardType;
  sort: PostSort;
  position: number;
  /** Post ids pinned to the top, in this order. */
  pinned: string[];
}

const DEFAULT_BOARDS: Record<SpaceKind, Array<Omit<Board, 'pinned'>>> = {
  project: [
    { name: 'releases', title: 'Releases', type: 'posts', sort: 'new', position: 0 },
    { name: 'ideas', title: 'Ideas', type: 'posts', sort: 'hot', position: 1 },
    { name: 'issues', title: 'Issues', type: 'issues', sort: 'new', position: 2 },
    { name: 'proposals', title: 'Proposals', type: 'proposals', sort: 'new', position: 3 },
  ],
  community: [{ name: COMMUNITY_BOARD, title: 'Posts', type: 'posts', sort: 'hot', position: 0 }],
  group: [],
};

const field = (body: Json, key: string): unknown => (body && typeof body === 'object' && !Array.isArray(body) ? body[key] : undefined);
const str = (body: Json, key: string, max = 10_000): string => {
  const value = field(body, key);
  return typeof value === 'string' ? value.slice(0, max) : '';
};
const byTime = (a: Entry, b: Entry) => a.event.time.localeCompare(b.event.time) || a.event.signer.localeCompare(b.event.signer) || a.event.seq - b.event.seq;

/** Board names are short, lowercase words with dashes, like channel names. */
export function boardName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const name = value.trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 32);
  return name || undefined;
}

/**
 * A space's boards: the defaults for its kind, changed by its maintainers
 * (or moderators), in their position order. Others' board events are ignored.
 */
export function boardsOf(kind: SpaceKind, entries: Entry[], maintainers: Set<Did>): Board[] {
  const boards = new Map<string, Board>(DEFAULT_BOARDS[kind].map((b) => [b.name, { ...b, pinned: [] }]));
  for (const e of entries.filter((x) => (x.kind === KIND_BOARD || x.kind === KIND_CURATE) && maintainers.has(x.event.author)).sort(byTime)) {
    const name = boardName(field(e.body, e.kind === KIND_BOARD ? 'name' : 'board'));
    if (!name) continue;
    if (e.kind === KIND_CURATE) {
      const board = boards.get(name);
      const pinned = field(e.body, 'pinned');
      if (board && Array.isArray(pinned)) board.pinned = [...new Set(pinned.filter((p): p is string => typeof p === 'string'))].slice(0, 20);
      continue;
    }
    if (kind !== 'project') continue; // a community has its one board
    if (field(e.body, 'on') === false) {
      boards.delete(name);
      continue;
    }
    const before = boards.get(name);
    const type = str(e.body, 'type', 20) as BoardType;
    const sort = str(e.body, 'sort', 10) as PostSort;
    const position = Number(field(e.body, 'position'));
    boards.set(name, {
      name,
      title: str(e.body, 'title', 40) || before?.title || name,
      type: before?.type ?? (BOARD_TYPES.includes(type) ? type : 'posts'), // a board keeps its type
      sort: POST_SORTS.includes(sort) ? sort : (before?.sort ?? 'hot'),
      position: field(e.body, 'position') !== undefined && Number.isFinite(position) ? position : (before?.position ?? boards.size),
      pinned: before?.pinned ?? [],
    });
  }
  return [...boards.values()].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
}

export interface Score {
  score: number;
  up: number;
  down: number;
  /** Each person's current vote: one vote per person, whichever of their keys cast it. */
  votes: Map<Did, number>;
}

/** Upvotes per target, the latest per person counting. */
export function scoresOf(entries: Entry[]): Map<string, Score> {
  const votes = new Map<string, Map<Did, number>>();
  for (const e of entries.filter((x) => x.kind === KIND_UPVOTE).sort(byTime)) {
    const target = str(e.body, 'target', 200);
    const value = Number(field(e.body, 'value'));
    if (!target || ![1, 0, -1].includes(value)) continue;
    const byPerson = votes.get(target) ?? new Map<Did, number>();
    if (value === 0) byPerson.delete(e.event.author);
    else byPerson.set(e.event.author, value);
    votes.set(target, byPerson);
  }
  const out = new Map<string, Score>();
  for (const [target, byPerson] of votes) {
    const values = [...byPerson.values()];
    const up = values.filter((v) => v > 0).length;
    const down = values.length - up;
    out.set(target, { score: up - down, up, down, votes: byPerson });
  }
  return out;
}

/** Where a shared post came from. */
export interface Share {
  space?: { kind: SpaceKind; id: string; name: string };
  post: string;
  /** A snapshot of the project, when a project was shared, so people outside it see what it is. */
  project?: { id: string; name: string; description: string; status: string };
}

export interface Post {
  id: string;
  author: Did;
  signer: Did;
  type: 'post' | 'issue' | 'proposal';
  board: string;
  title: string;
  text: string;
  link?: string;
  share?: Share;
  time: string;
}

function shareOf(body: Json): Share | undefined {
  const share = field(body, 'share') as Json;
  const post = str(share, 'post', 200);
  if (!post) return undefined;
  const space = field(share, 'space') as Json;
  const project = field(share, 'project') as Json;
  const spaceKind = str(space, 'kind', 20) as SpaceKind;
  return {
    post,
    ...(str(space, 'id', 100) && ['group', 'project', 'community'].includes(spaceKind) ? { space: { kind: spaceKind, id: str(space, 'id', 100), name: str(space, 'name', 40) } } : {}),
    ...(str(project, 'id', 100) && str(project, 'name', 100)
      ? { project: { id: str(project, 'id', 100), name: str(project, 'name', 100), description: str(project, 'description', 2000), status: str(project, 'status', 20) } }
      : {}),
  };
}

/** A title for posts that have none (from before posts had titles): their first line. */
const titleOf = (body: Json): string =>
  str(body, 'title', 200) ||
  (typeof body === 'string' ? body : str(body, 'text'))
    .split('\n')[0]
    .replace(/[*_`#>]+/g, '')
    .trim()
    .slice(0, 120);

/**
 * Posts of a space, by board: posts, issues and proposals alike. `kind`
 * decides where posts without a board land. Public posts use kind undefined.
 */
export function postsOf(kind: SpaceKind | undefined, entries: Entry[]): Post[] {
  const posts: Post[] = [];
  for (const e of entries) {
    const base = { id: e.id, author: e.event.author, signer: e.event.signer, time: e.event.time };
    if (e.kind === KIND_POST) {
      const title = titleOf(e.body);
      if (!title) continue;
      const link = str(e.body, 'link', 500);
      const share = shareOf(e.body);
      const board = kind === 'project' ? (boardName(field(e.body, 'board')) ?? 'releases') : COMMUNITY_BOARD;
      const text = typeof e.body === 'string' ? e.body : str(e.body, 'text');
      posts.push({ ...base, type: 'post', board, title, text, ...(/^https?:\/\//.test(link) ? { link } : {}), ...(share ? { share } : {}) });
    } else if (kind === 'project' && e.kind === KIND_THREAD && str(e.body, 'title')) {
      posts.push({ ...base, type: 'post', board: 'ideas', title: str(e.body, 'title', 200), text: str(e.body, 'text') });
    } else if (kind === 'project' && (e.kind === KIND_ISSUE || e.kind === KIND_PROPOSAL) && str(e.body, 'title')) {
      const issue = e.kind === KIND_ISSUE;
      posts.push({ ...base, type: issue ? 'issue' : 'proposal', board: issue ? 'issues' : 'proposals', title: str(e.body, 'title', 200), text: str(e.body, 'text') });
    }
  }
  return posts;
}

/**
 * Reddit's "hot", roughly: score against age, where age counts from the
 * latest activity, so a post whose chat is busy stays up.
 */
export function hotness(score: number, active: string, now = Date.now()): number {
  const hours = Math.max(0, (now - Date.parse(active)) / 3_600_000);
  return (score + 1) / Math.pow(hours + 2, 1.5);
}

export interface Ranked {
  id: string;
  time: string;
  score: number;
  /** Latest activity: the post itself or its chat. */
  active: string;
}

/** Pinned first, in their order; then by the chosen sort. */
export function rank<T extends Ranked>(posts: T[], sort: PostSort, pinned: string[] = [], now = Date.now()): T[] {
  const pin = new Map(pinned.map((id, i) => [id, i]));
  const key = (p: T) => (sort === 'new' ? Date.parse(p.time) : sort === 'top' ? p.score : hotness(p.score, p.active, now));
  return [...posts].sort((a, b) => {
    const pa = pin.get(a.id);
    const pb = pin.get(b.id);
    if (pa !== undefined || pb !== undefined) return (pa ?? Infinity) - (pb ?? Infinity);
    return key(b) - key(a) || b.time.localeCompare(a.time);
  });
}

/** Your saved and pinned posts, from your self-sealed weave.save events; the latest per target counts. */
export function savesOf(entries: Entry[]): Map<string, SaveMode> {
  const saves = new Map<string, SaveMode>();
  for (const e of entries.filter((x) => x.kind === KIND_SAVE).sort(byTime)) {
    const target = str(e.body, 'target', 200);
    const mode = str(e.body, 'mode', 10) as SaveMode;
    if (!target) continue;
    if (SAVE_MODES.includes(mode)) saves.set(target, mode);
    else saves.delete(target);
  }
  return saves;
}
