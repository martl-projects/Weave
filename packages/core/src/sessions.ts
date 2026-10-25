import type { Json } from './bytes.ts';
import type { Entry } from './collab.ts';

/*
 * Agent sessions and the work items on them. A session lives with a provider
 * (Claude Code today; others later) and is known here only by provider and id.
 * Each session keeps a stack of work items: the top one is what it's on now;
 * an item pushed on top of an unfinished one leaves that one waiting below,
 * and it comes back up when the one above is done. Sessions and items are
 * many-to-many: an item can sit on several stacks.
 *
 *   weave.session  {provider, id, host?, folder?, title?, stack,   sealed to yourself; the latest per
 *                   role?, projects?, available?, last?}             provider and id counts
 *     stack: [{post, since}], top first
 *     role: 'driver' (plans and hands out work) or 'worker' (takes work items)
 *     projects: the spaces whose items it takes (none: any); available: it takes new items
 *     last: {post, time}, the item it last finished
 *
 * Kept sealed to the person: a stack is their own scratch board, on all their
 * devices. An item's team only sees what the sessions posted into its chat.
 */
export const KIND_SESSION = 'weave.session';

export interface StackItem {
  post: string;
  /** When it went on this stack (or came back to the top). */
  since: string;
}

export interface SessionRecord {
  provider: string;
  id: string;
  /** The provider's other name for it, e.g. the Claude app's local_… id. */
  host?: string;
  /** The folder it runs in, on the computer that ran it. */
  folder?: string;
  title?: string;
  /** Top first. */
  stack: StackItem[];
  /** Its job: the driver plans and hands out work, workers take work items. */
  role?: SessionRole;
  /** The spaces whose work items it takes; none means any. */
  projects?: string[];
  /** It takes new work items (from the app and from the driver). */
  available?: boolean;
  /** The item it last finished. */
  last?: { post: string; time: string };
  /** When it last changed. */
  time: string;
}

export const SESSION_ROLES = ['driver', 'worker'] as const;
export type SessionRole = (typeof SESSION_ROLES)[number];

/** At most this many items on a stack: it's a scratch board, not an archive. */
export const MAX_STACK = 50;

const str = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max) : '');

export const sessionKey = (provider: string, id: string) => `${provider}:${id}`;

/** The latest record per session, from your sealed events. */
export function sessionsOf(entries: Entry[]): Map<string, SessionRecord> {
  const out = new Map<string, SessionRecord>();
  const sorted = [...entries].filter((e) => e.kind === KIND_SESSION).sort((a, b) => a.event.time.localeCompare(b.event.time) || a.event.seq - b.event.seq);
  for (const e of sorted) {
    const b = e.body as Record<string, Json> | null;
    const provider = str(b?.provider, 40);
    const id = str(b?.id, 200);
    if (!provider || !id) continue;
    const stack = (Array.isArray(b?.stack) ? b.stack : [])
      .map((s) => ({ post: str((s as Record<string, Json>)?.post, 100), since: str((s as Record<string, Json>)?.since, 40) || e.event.time }))
      .filter((s) => s.post)
      .slice(0, MAX_STACK);
    const role = SESSION_ROLES.find((r) => r === b?.role);
    const projects = (Array.isArray(b?.projects) ? b.projects : []).filter((p): p is string => typeof p === 'string' && p.length <= 100).slice(0, 50);
    const last = b?.last as Record<string, Json> | undefined;
    out.set(sessionKey(provider, id), {
      provider,
      id,
      ...(str(b?.host, 200) ? { host: str(b?.host, 200) } : {}),
      ...(str(b?.folder, 1000) ? { folder: str(b?.folder, 1000) } : {}),
      ...(str(b?.title, 200) ? { title: str(b?.title, 200) } : {}),
      stack,
      ...(role ? { role } : {}),
      ...(projects.length ? { projects } : {}),
      ...(b?.available === true ? { available: true } : {}),
      ...(str(last?.post, 100) ? { last: { post: str(last?.post, 100), time: str(last?.time, 40) || e.event.time } } : {}),
      time: e.event.time,
    });
  }
  return out;
}

/** Put a post on top; whatever was on top waits below. A post already on the stack moves up. */
export function pushOnto(stack: StackItem[], post: string, now: string): StackItem[] {
  return [{ post, since: now }, ...stack.filter((s) => s.post !== post)].slice(0, MAX_STACK);
}

/** Take a post off (the top one if none is named); the next one comes back to the top. */
export function takeOff(stack: StackItem[], post: string | undefined, now: string): StackItem[] {
  const gone = post ?? stack[0]?.post;
  const rest = stack.filter((s) => s.post !== gone);
  // The one coming back up is current again from now.
  return rest.map((s, i) => (i === 0 && stack[0]?.post === gone ? { ...s, since: now } : s));
}

/** Put the stack in this order: the named posts first, as given, then the rest as they were. */
export function reorder(stack: StackItem[], order: string[]): StackItem[] {
  const byPost = new Map(stack.map((s) => [s.post, s]));
  const first = order.map((p) => byPost.get(p)).filter((s): s is StackItem => !!s);
  return [...first, ...stack.filter((s) => !order.includes(s.post))];
}
