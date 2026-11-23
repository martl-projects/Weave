import type { FeedItem } from './backend.ts';

/*
 * What an agent key may use, space by space (issue 4Vxe, "Maschinen und Agent-Schlüssel"): a project, a group or a
 * person's direct chat, each with what the agent may read and write there, by area. Set in the app (Sessions view, a
 * key's frame, "Add a space"), kept on the node that holds the key (agent-scopes.json), and enforced there for agent
 * tokens (agentapi.ts). A key without a scope uses every space, as before: scoping is opt-in per key.
 */

/** The parts of a space an agent's rights are given for. */
export const AREAS = ['posts', 'issues', 'chat', 'releases', 'votes'] as const;
export type Area = (typeof AREAS)[number];

/** What an agent may do in one space. */
export interface SpaceAccess {
  read: Area[];
  write: Area[];
}

/** An agent key's spaces: by space id (a direct chat's too). */
export interface AgentScope {
  spaces: Record<string, SpaceAccess>;
}

/** Only known areas, each once; writing implies reading. */
export function cleanAccess(access: { read?: unknown; write?: unknown }): SpaceAccess {
  const pick = (list: unknown): Area[] => (Array.isArray(list) ? AREAS.filter((a) => list.includes(a)) : []);
  const write = pick(access.write);
  const read = AREAS.filter((a) => pick(access.read).includes(a) || write.includes(a));
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

/** May the scope read (or write) this area of this space? Undefined scope: everything, as before scopes. */
export function allows(scope: AgentScope | undefined, space: string | undefined, area: Area | 'any', how: 'read' | 'write'): boolean {
  if (!scope) return true;
  if (!space) return false;
  const access = scope.spaces[space];
  if (!access) return false;
  return area === 'any' ? access[how].length > 0 : access[how].includes(area);
}

/** May the scope see this live or feed item? Items outside any space (public, the person's own) are its own business. */
export function itemAllowed(scope: AgentScope | undefined, item: Pick<FeedItem, 'kind' | 'space'>): boolean {
  if (!scope || !item.space) return true;
  return allows(scope, item.space.id, areaOfKind(item.kind), 'read');
}
