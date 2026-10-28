import type { Json } from './bytes.ts';
import type { Entry } from './collab.ts';
import { isDid, type Did } from './keys.ts';

/*
 * What people may ask a service to do: the actions its contract declares, each with who may use it (members,
 * maintainers, the owner, or whoever reads a board). A request names its action; the node that runs the service
 * checks the asker's role before the service sees it, and answers a refusal itself, so a service never has to (and
 * can't be fooled into) deciding who may. A request without an action is a plain question, as before.
 *
 * A project's maintainers can tighten who may use an action there, never widen it:
 *
 *   weave.service.policy  {service, action, who}   maintainers; the latest per service and action counts
 */
export const KIND_SERVICE_POLICY = 'weave.service.policy';

/** Who may use an action: everyone in the space, its maintainers, its owner, whoever reads a board, or the members of a group (a tier, say) invited to the project. */
export type ActionWho = 'members' | 'maintainers' | 'owner' | { board: string } | { group: string };

export interface ServiceActionField {
  name: string;
  label: string;
  /** Hidden while typed (a password, say). */
  secret?: true;
  optional?: true;
}

export interface ServiceAction {
  /** What requests name, like publish. */
  name: string;
  /** What people see, like "Publish a new version". */
  label: string;
  who: ActionWho;
  /** What it asks for when used: the request's data, by these names. */
  input?: ServiceActionField[];
}

const ACTION_NAME = /^[a-z][a-z0-9-]{0,39}$/;

export const parseWho = (value: unknown): ActionWho | undefined => {
  if (value === 'members' || value === 'maintainers' || value === 'owner') return value;
  const board = (value as { board?: unknown } | null)?.board;
  if (typeof board === 'string' && /^[a-z0-9-]{1,40}$/.test(board)) return { board };
  const group = (value as { group?: unknown } | null)?.group;
  return typeof group === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(group) ? { group } : undefined;
};

/** A contract's actions from untrusted input: the valid ones, by distinct names. */
export function parseActions(value: unknown): ServiceAction[] {
  if (!Array.isArray(value)) return [];
  const out: ServiceAction[] = [];
  for (const raw of value.slice(0, 20)) {
    const a = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const who = parseWho(a.who);
    if (typeof a.name !== 'string' || !ACTION_NAME.test(a.name) || !who || out.some((x) => x.name === a.name)) continue;
    const label = typeof a.label === 'string' && a.label.trim() ? a.label.trim().slice(0, 60) : a.name;
    const input = Array.isArray(a.input)
      ? a.input.slice(0, 10).flatMap((f) => {
          const o = (f && typeof f === 'object' ? f : {}) as Record<string, unknown>;
          if (typeof o.name !== 'string' || !/^[a-z][a-zA-Z0-9_]{0,39}$/.test(o.name)) return [];
          return [{ name: o.name, label: typeof o.label === 'string' && o.label.trim() ? o.label.trim().slice(0, 60) : o.name, ...(o.secret === true ? { secret: true as const } : {}), ...(o.optional === true ? { optional: true as const } : {}) }];
        })
      : [];
    out.push({ name: a.name, label, who, ...(input.length ? { input } : {}) });
  }
  return out;
}

/** Who may, in plain words. */
export const whoWords = (who: ActionWho, groupName?: string): string => (who === 'members' ? 'members' : who === 'maintainers' ? 'maintainers' : who === 'owner' ? 'the owner' : 'board' in who ? `readers of ${who.board}` : `members of ${groupName ?? 'a group'}`);

/** How narrow a who is: members, then a board's readers, then maintainers, then the owner. */
const narrowness = (who: ActionWho): number => (who === 'members' ? 0 : who === 'maintainers' ? 2 : who === 'owner' ? 3 : 1);

/** Whether `next` is at least as narrow as `declared` (a project may tighten an action, never widen it). */
export function tightens(declared: ActionWho, next: ActionWho): boolean {
  if (typeof declared === 'object' && typeof next === 'object') return JSON.stringify(declared) === JSON.stringify(next);
  if (typeof next === 'object') return declared === 'members';
  return narrowness(next) >= narrowness(declared);
}

/** A space's tightenings of a service's actions: the latest from its maintainers per action, where it does tighten. */
export function policiesOf(entries: Entry[], maintainers: Set<Did>, service: Did, actions: ServiceAction[]): Map<string, ActionWho> {
  const out = new Map<string, ActionWho>();
  const field = (body: Json, key: string): unknown => (body && typeof body === 'object' && !Array.isArray(body) ? body[key] : undefined);
  const sorted = entries.filter((e) => e.kind === KIND_SERVICE_POLICY && maintainers.has(e.event.author)).sort((a, b) => a.event.time.localeCompare(b.event.time) || a.event.seq - b.event.seq);
  for (const e of sorted) {
    if (!isDid(field(e.body, 'service')) || field(e.body, 'service') !== service) continue;
    const action = actions.find((a) => a.name === field(e.body, 'action'));
    if (!action) continue;
    const who = parseWho(field(e.body, 'who'));
    if (!who || who === action.who || !tightens(action.who, who)) out.delete(action.name);
    else out.set(action.name, who);
  }
  return out;
}

/**
 * Whether someone may use an action, by their role in the space (`readers`: who reads a board; `inGroup`: whether
 * they're in a group, when it names one; unknown there: no).
 */
export function mayAct(who: ActionWho, person: Did, roles: { owner: Did; maintainers: Set<Did>; members: Map<Did, unknown> | Set<Did> }, readers?: (board: string) => Did[], inGroup?: (group: string, person: Did) => boolean): boolean {
  if (!roles.members.has(person)) return false;
  if (who === 'members') return true;
  if (who === 'owner') return person === roles.owner;
  if (who === 'maintainers') return roles.maintainers.has(person) || person === roles.owner;
  if ('board' in who) return !!readers?.(who.board).includes(person);
  return !!inGroup?.(who.group, person);
}

/*
 * Who may get an artifact of a project (a release's files, a file): everyone there unless its maintainers say
 * otherwise. The node a provider runs on refuses a fetch from anyone else before the provider sees it.
 *
 *   weave.artifact.access  {artifact, who}   maintainers; the latest per artifact counts (who: members is everyone)
 */
export const KIND_ARTIFACT_ACCESS = 'weave.artifact.access';

/** A project's rules for who may get its artifacts, by artifact: only those narrower than everyone. */
export function artifactAccessOf(entries: Entry[], maintainers: Set<Did>): Map<string, ActionWho> {
  const out = new Map<string, ActionWho>();
  const field = (body: Json, key: string): unknown => (body && typeof body === 'object' && !Array.isArray(body) ? body[key] : undefined);
  const sorted = entries.filter((e) => e.kind === KIND_ARTIFACT_ACCESS && maintainers.has(e.event.author)).sort((a, b) => a.event.time.localeCompare(b.event.time) || a.event.seq - b.event.seq);
  for (const e of sorted) {
    const artifact = field(e.body, 'artifact');
    if (typeof artifact !== 'string' || !artifact) continue;
    const who = parseWho(field(e.body, 'who'));
    if (!who || who === 'members') out.delete(artifact);
    else out.set(artifact, who);
  }
  return out;
}
