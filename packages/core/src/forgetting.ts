import type { Json } from './bytes.ts';
import type { Entry } from './collab.ts';
import type { Did } from './keys.ts';
import { boardName } from './posts.ts';

/*
 * Forgetting by rule and by value (docs/v2-stage3.md). A board's rule says how
 * long its posts stay after their last activity; upvotes stretch it. Nothing is
 * forgotten without a rule, never sooner than GRACE_DAYS after a rule was set,
 * and permanent posts (pinned, issues, proposals, releases) never.
 */

/** `{board, keepDays, maxMB}`: a board's rule, by its maintainers or moderators. null: no limit. */
export const KIND_BOARD_RULE = 'weave.board.rule';
/** `{target}`: "keep this": counts as activity on the post, so its time starts again. */
export const KIND_POST_KEEP = 'weave.post.keep';

export const GRACE_DAYS = 14;
/** How long before a post is forgotten its author is told. */
export const WARN_DAYS = 14;
const DAY = 24 * 3600 * 1000;

export interface BoardRule {
  board: string;
  keepDays: number | null;
  maxMB: number | null;
  by: Did;
  time: string;
}

const field = (body: Json, key: string): unknown => (body && typeof body === 'object' && !Array.isArray(body) ? body[key] : undefined);
const limit = (value: unknown, max: number): number | null | undefined => (value === null ? null : typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= max ? value : undefined);

/** Each board's latest rule by someone who manages the space; a rule with neither limit is no rule. */
export function boardRulesOf(entries: Entry[], managers: Set<Did>): Map<string, BoardRule> {
  const rules = new Map<string, BoardRule>();
  const sorted = entries.filter((e) => e.kind === KIND_BOARD_RULE && managers.has(e.event.author)).sort((a, b) => a.event.time.localeCompare(b.event.time));
  for (const e of sorted) {
    const board = boardName(field(e.body, 'board'));
    const keepDays = limit(field(e.body, 'keepDays'), 36_500);
    const maxMB = limit(field(e.body, 'maxMB'), 1_000_000);
    if (!board || keepDays === undefined || maxMB === undefined) continue;
    if (keepDays === null && maxMB === null) rules.delete(board);
    else rules.set(board, { board, keepDays, maxMB, by: e.event.author, time: e.event.time });
  }
  return rules;
}

/** How long a post stays: forever (and why), or until a time (and what stretched it). */
export type Lifetime =
  | { forever: 'pinned' | 'permanent' | 'no-rule' }
  | { until: string; upvotes: number; addedDays: number; grace?: true; full?: true; overShare?: number; floor?: string };

export interface LifetimeInput {
  /** Its last activity: the post, its edits and chat, upvotes, "keep". */
  active: string;
  /** How many people upvote it. */
  upvotes: number;
  rule?: BoardRule;
  pinned?: boolean;
  /** Issues, proposals, releases. */
  permanent?: boolean;
  /** How far its author is over their fair share of the board (their bytes / the fair share); 1 or less: within it. */
  overuse?: number;
  /** A company's minimum: kept at least this many days after its last activity, whatever the rule (stage 11). */
  minDays?: number;
}

/**
 * `until = max(active + keepDays × (1 + log2(1 + upvotes)) / squeeze, rule set + grace)`,
 * where `squeeze` is how far the author is over their fair share of the board,
 * for posts nobody upvoted (stage 8).
 */
export function lifetimeOf(input: LifetimeInput): Lifetime {
  if (input.pinned) return { forever: 'pinned' };
  if (input.permanent) return { forever: 'permanent' };
  if (!input.rule?.keepDays) return { forever: 'no-rule' };
  // Up to twice the fair share is fine (small boards are rarely even); beyond, the time shrinks with it.
  const squeeze = input.upvotes > 0 ? 1 : Math.max(1, (input.overuse ?? 1) / 2);
  const days = (input.rule.keepDays * (1 + Math.log2(1 + Math.max(0, input.upvotes)))) / squeeze;
  const byRule = Date.parse(input.active) + days * DAY;
  const grace = Date.parse(input.rule.time) + GRACE_DAYS * DAY;
  const floor = input.minDays ? Date.parse(input.active) + input.minDays * DAY : 0;
  return {
    until: new Date(Math.max(byRule, grace, floor)).toISOString(),
    upvotes: input.upvotes,
    addedDays: Math.round(days - input.rule.keepDays),
    ...(grace > byRule ? { grace: true as const } : {}),
    ...(squeeze > 1 ? { overShare: Math.round(squeeze * 10) / 10 } : {}),
    ...(floor ? { floor: new Date(floor).toISOString() } : {}),
  };
}

/**
 * A board over its maxMB: the posts that would go soonest go now, until the
 * rest fits (never permanent ones, never sooner than the grace allows).
 */
export function overBudget<T extends { id: string; lifetime: Lifetime; bytes: number; overuse?: number }>(posts: T[], rule: BoardRule | undefined, now = Date.now()): Set<string> {
  const out = new Set<string>();
  if (!rule?.maxMB) return out;
  let total = posts.reduce((sum, p) => sum + p.bytes, 0);
  const budget = rule.maxMB * 1024 * 1024;
  if (total <= budget || now < Date.parse(rule.time) + GRACE_DAYS * DAY) return out;
  // The biggest over-users' posts first (stage 8), then those that would go soonest.
  const goingFirst = posts
    // Never what a company's minimum still keeps.
    .filter((p) => ('until' in p.lifetime && !(p.lifetime.floor && Date.parse(p.lifetime.floor) > now)) || ('forever' in p.lifetime && p.lifetime.forever === 'no-rule'))
    .sort((a, b) => Math.max(1, b.overuse ?? 1) - Math.max(1, a.overuse ?? 1) || untilOf(a.lifetime).localeCompare(untilOf(b.lifetime)));
  for (const p of goingFirst) {
    if (total <= budget) break;
    out.add(p.id);
    total -= p.bytes;
  }
  return out;
}

const untilOf = (l: Lifetime): string => ('until' in l ? l.until : '9999');

/** Is it past its time? */
export const isDue = (l: Lifetime, now = Date.now()): boolean => 'until' in l && Date.parse(l.until) <= now;

/** Is it due within the warning time (and not yet)? */
export const isFading = (l: Lifetime, now = Date.now()): boolean => 'until' in l && Date.parse(l.until) > now && Date.parse(l.until) <= now + WARN_DAYS * DAY;
