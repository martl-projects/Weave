/** A feed or live item, as much as a scope needs of it. */
interface FeedItem {
  kind: string;
  space?: { id: string };
  body: unknown;
}

/*
 * What an agent key may use, space by space (issue 4Vxe, "Maschinen und Agent-Schlüssel"): a project, a group or a
 * person's direct chat, each with what the agent may read and write there, by area or board by board. Set in the app
 * (Sessions view, a key's frame, "Add a space"), kept on the node that holds the key (agent-scopes.json), and enforced
 * there for agent tokens (agentapi.ts). A key without a scope uses every space, as before: scoping is opt-in per key.
 */

/** The parts of a space an agent's rights are given for. */
export const AREAS = ['posts', 'issues', 'chat', 'releases', 'votes'] as const;
export type Area = (typeof AREAS)[number];

/** A right on one board, by its name: `board:ideas`. */
export type BoardRight = `board:${string}`;

/**
 * What an agent may do in one space: areas, and boards one by one (set in the rights dialog). Once a list names a
 * board, posts count by their board only: a board not named is out, whatever its area. Chat is always its own entry.
 */
export interface SpaceAccess {
  read: Array<Area | BoardRight>;
  write: Array<Area | BoardRight>;
}

/** An agent key's spaces: by space id (a direct chat's too). */
export interface AgentScope {
  spaces: Record<string, SpaceAccess>;
}

const isBoardRight = (x: unknown): x is BoardRight => typeof x === 'string' && /^board:\S{1,60}$/.test(x);

/** Only known areas and well-formed boards, each once; writing implies reading. */
export function cleanAccess(access: { read?: unknown; write?: unknown }): SpaceAccess {
  const pick = (list: unknown): Array<Area | BoardRight> => (Array.isArray(list) ? [...AREAS.filter((a) => list.includes(a)), ...[...new Set(list.filter(isBoardRight))].sort()] : []);
  const write = pick(access.write);
  const both = new Set<string>([...pick(access.read), ...write]);
  const read: Array<Area | BoardRight> = [...AREAS.filter((a) => both.has(a)), ...[...both].filter(isBoardRight).sort()];
  return { read, write };
}

/** The area an event of this kind belongs to. */
export function areaOfKind(kind: string): Area {
  if (/(^|\.)(msg|message|chat|channel|thread)(\.|$)/.test(kind)) return 'chat';
  if (/(^|\.)issue(\.|$)/.test(kind)) return 'issues';
  if (/(^|\.)(vote|proposal|delegate)(\.|$)/.test(kind)) return 'votes';
  if (/(^|\.)(app|release|artifact)(\.|$)/.test(kind)) return 'releases';
  return 'posts';
}

/** The area of a post by its type and board: an issue, a proposal, a release or a post. */
export function areaOfPost(post: { type?: string; board?: string }): Area {
  if (post.type === 'issue' || post.board === 'issues') return 'issues';
  if (post.type === 'proposal' || post.board === 'proposals') return 'votes';
  if (post.board === 'releases') return 'releases';
  return 'posts';
}

/** The board an area lives on when nothing else says which. */
const AREA_BOARDS: Partial<Record<Area, string>> = { issues: 'issues', votes: 'proposals', releases: 'releases' };

/**
 * May the scope read (or write) this area of this space, on this board when one is known? Undefined scope:
 * everything, as before scopes. A list that names boards decides by board for everything but chat.
 */
export function allows(scope: AgentScope | undefined, space: string | undefined, area: Area | 'any', how: 'read' | 'write', board?: string): boolean {
  if (!scope) return true;
  if (!space) return false;
  const access = scope.spaces[space];
  if (!access) return false;
  const list = access[how];
  if (area === 'any') return list.length > 0;
  if (area === 'chat') return list.includes('chat');
  const boards = list.filter(isBoardRight);
  if (!boards.length) return list.includes(area);
  const on = board ?? AREA_BOARDS[area];
  return on !== undefined && boards.includes(`board:${on}`);
}

/** May the scope see this live or feed item? Items outside any space (public, the person's own) are its own business. */
export function itemAllowed(scope: AgentScope | undefined, item: FeedItem): boolean {
  if (!scope || !item.space) return true;
  const body = item.body as { board?: unknown } | null;
  return allows(scope, item.space.id, areaOfKind(item.kind), 'read', typeof body?.board === 'string' ? body.board : undefined);
}
