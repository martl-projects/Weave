import { parseBlobRef } from './blobs.ts';
import type { Json } from './bytes.ts';
import { KIND_ISSUE, KIND_PROPOSAL, KIND_THREAD, type Entry } from './collab.ts';
import { isDid, type Did } from './keys.ts';
import type { SpaceKind } from './spaces.ts';

/*
 * Posts, boards and upvotes: the Reddit side of Weave. A project is itself a
 * post (its weave.space.create event) with boards inside it; a community is
 * one board of posts. Every post has a chat (weave.msg with `post`) instead of
 * a comment tree.
 *
 *   weave.post     {title, text, link, image, board, share, with}
 *                                                      a post in a community or in a project's board; image: a wblob: reference;
 *                                                      with: co-authors it names (people's identifiers or agents' keys)
 *   weave.post.coauthor {target, on}                  someone named in `with` confirms (or declines) being a co-author;
 *                                                      only confirmed ones are shown (see coauthorsOf)
 *   weave.post.edit   {target, title, text, link, image}
 *                                                      the post's author changes it; the latest edit counts
 *   weave.post.delete {target}                        the post's author, or the space's maintainers or moderators,
 *                                                      take it down; it stays in the logs, out of sight
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
export const KIND_POST_EDIT = 'weave.post.edit';
export const KIND_POST_DELETE = 'weave.post.delete';
export const KIND_POST_COAUTHOR = 'weave.post.coauthor';
export const KIND_UPVOTE = 'weave.upvote';
export const KIND_BOARD = 'weave.board';
export const KIND_CURATE = 'weave.curate';
export const KIND_SAVE = 'weave.save';
/** An event of a read-limited board, sealed with the board's key (see access.ts). */
export const KIND_BOARD_SEALED = 'weave.board.sealed';

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
  direct: [],
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
  /** An attached image (wblob: reference): the post's thumbnail. */
  image?: string;
  share?: Share;
  time: string;
  /** When its author last edited it. */
  edited?: string;
  /** Co-authors the post names; each still has to confirm (see coauthorsOf). */
  with?: Did[];
}

/** At most this many co-authors per post. */
export const MAX_COAUTHORS = 10;

function withOf(body: Json, author: Did, signer: Did): Did[] {
  const list = field(body, 'with');
  if (!Array.isArray(list)) return [];
  const out = new Set<Did>();
  for (const did of list) if (isDid(did) && did !== author && did !== signer) out.add(did);
  return [...out].slice(0, MAX_COAUTHORS);
}

export type CoauthorState = 'asked' | 'confirmed' | 'declined';

/** What co-authorship needs to know about keys: whose a key is, and whether it's an agent's. */
export interface KeyFacts {
  personOf(key: Did): Did;
  isAgent(key: Did): boolean;
}

/**
 * Where each co-author a post names stands. A confirmation counts when it is
 * signed by that very key (an agent confirming itself), or by its person
 * from one of their own devices (a person for themselves, or for their agent).
 * Another agent of the same person can't confirm on their behalf. The latest
 * answer counts, so a co-author can change their mind.
 */
export function coauthorsOf(post: Post, entries: Entry[], keys: KeyFacts): Array<{ did: Did; state: CoauthorState }> {
  const named = post.with ?? [];
  if (!named.length) return [];
  const state = new Map<Did, CoauthorState>(named.map((did) => [did, 'asked']));
  for (const e of entries.filter((x) => x.kind === KIND_POST_COAUTHOR && str(x.body, 'target', 200) === post.id).sort(byTime)) {
    const signer = e.event.signer;
    for (const did of named) {
      const counts = signer === did || (!keys.isAgent(signer) && e.event.author === keys.personOf(did));
      if (counts) state.set(did, field(e.body, 'on') === false ? 'declined' : 'confirmed');
    }
  }
  return named.map((did) => ({ did, state: state.get(did)! }));
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
 * Posts show their author's latest edit; deleted ones are left out.
 * `maintainers` (or moderators) may delete others' posts in their space.
 */
export function postsOf(kind: SpaceKind | undefined, entries: Entry[], maintainers: Set<Did> = new Set()): Post[] {
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
      const image = parseBlobRef(field(e.body, 'image')) ? str(e.body, 'image', 200).trim() : '';
      const coauthors = withOf(e.body, e.event.author, e.event.signer);
      posts.push({
        ...base,
        type: 'post',
        board,
        title,
        text,
        ...(/^https?:\/\//.test(link) ? { link } : {}),
        ...(image ? { image } : {}),
        ...(share ? { share } : {}),
        ...(coauthors.length ? { with: coauthors } : {}),
      });
    } else if (kind === 'project' && e.kind === KIND_THREAD && str(e.body, 'title')) {
      posts.push({ ...base, type: 'post', board: 'ideas', title: str(e.body, 'title', 200), text: str(e.body, 'text') });
    } else if (kind === 'project' && (e.kind === KIND_ISSUE || e.kind === KIND_PROPOSAL) && str(e.body, 'title')) {
      const issue = e.kind === KIND_ISSUE;
      posts.push({ ...base, type: issue ? 'issue' : 'proposal', board: issue ? 'issues' : 'proposals', title: str(e.body, 'title', 200), text: str(e.body, 'text') });
    }
  }
  return reviseAll(posts, entries, maintainers);
}

/** Apply edits and deletes to weave.post posts (not threads, issues or proposals). */
function reviseAll(posts: Post[], entries: Entry[], maintainers: Set<Did>): Post[] {
  const editable = new Set(entries.filter((e) => e.kind === KIND_POST).map((e) => e.id));
  const byId = new Map(posts.filter((p) => editable.has(p.id)).map((p) => [p.id, p]));
  const deleted = new Set<string>();
  for (const e of entries.filter((x) => x.kind === KIND_POST_EDIT || x.kind === KIND_POST_DELETE).sort(byTime)) {
    const post = byId.get(str(e.body, 'target', 200));
    if (!post || deleted.has(post.id)) continue;
    const own = e.event.author === post.author;
    if (e.kind === KIND_POST_DELETE) {
      if (own || maintainers.has(e.event.author)) deleted.add(post.id);
      continue;
    }
    if (!own) continue;
    const title = str(e.body, 'title', 200).trim();
    if (title) post.title = title;
    if (typeof field(e.body, 'text') === 'string') post.text = str(e.body, 'text');
    const link = field(e.body, 'link');
    if (link === '') delete post.link;
    else if (typeof link === 'string' && /^https?:\/\//.test(link)) post.link = link.slice(0, 500);
    const image = field(e.body, 'image');
    if (image === '') delete post.image;
    else if (parseBlobRef(image)) post.image = (image as string).trim();
    post.edited = e.event.time;
  }
  return posts.filter((p) => !deleted.has(p.id));
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
