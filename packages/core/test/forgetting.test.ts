import { describe, expect, it } from 'vitest';
import { isDue, isFading, lifetimeOf, overBudget, type BoardRule } from '../src/index.ts';

const day = 24 * 3600 * 1000;
const at = (d: number) => new Date(Date.parse('2026-01-01T00:00:00.000Z') + d * day).toISOString();
const rule = (keepDays: number | null, maxMB: number | null = null, set = at(-100)): BoardRule => ({ board: 'ideas', keepDays, maxMB, by: 'did:key:zX' as const, time: set });

describe('lifetimes', () => {
  it('keeps a post keepDays after its last activity, longer with each upvote', () => {
    expect(lifetimeOf({ active: at(0), upvotes: 0, rule: rule(30) })).toEqual({ until: at(30), upvotes: 0, addedDays: 0 });
    // 1 + log2(1 + 3) = 3: three upvotes keep it three times as long.
    expect(lifetimeOf({ active: at(0), upvotes: 3, rule: rule(30) })).toEqual({ until: at(90), upvotes: 3, addedDays: 60 });
  });

  it('keeps for good what is pinned, permanent or under no rule', () => {
    expect(lifetimeOf({ active: at(0), upvotes: 0, rule: rule(30), pinned: true })).toEqual({ forever: 'pinned' });
    expect(lifetimeOf({ active: at(0), upvotes: 0, rule: rule(30), permanent: true })).toEqual({ forever: 'permanent' });
    expect(lifetimeOf({ active: at(0), upvotes: 0 })).toEqual({ forever: 'no-rule' });
    expect(lifetimeOf({ active: at(0), upvotes: 0, rule: rule(null, 10) })).toEqual({ forever: 'no-rule' });
  });

  it('never forgets sooner than 14 days after the rule was set', () => {
    const late = lifetimeOf({ active: at(0), upvotes: 0, rule: rule(1, null, at(100)) });
    expect(late).toEqual({ until: at(114), upvotes: 0, addedDays: 0, grace: true });
    expect(isDue(late, Date.parse(at(113)))).toBe(false);
    expect(isDue(late, Date.parse(at(114)))).toBe(true);
    expect(isFading(late, Date.parse(at(101)))).toBe(true);
    expect(isFading(late, Date.parse(at(99)))).toBe(false);
  });

  it('lets the posts that would go soonest go first when a board is over its size', () => {
    const r = rule(30, 1);
    const mb = 1024 * 1024;
    const posts = [
      { id: 'old-popular', lifetime: lifetimeOf({ active: at(0), upvotes: 7, rule: r }), bytes: 0.6 * mb },
      { id: 'new', lifetime: lifetimeOf({ active: at(20), upvotes: 0, rule: r }), bytes: 0.6 * mb },
      { id: 'pinned', lifetime: lifetimeOf({ active: at(0), upvotes: 0, rule: r, pinned: true }), bytes: 0.2 * mb },
    ];
    // Not the oldest: the one with the least time left.
    expect([...overBudget(posts, r, Date.parse(at(21)))]).toEqual(['new']);
    expect(overBudget(posts, rule(30, 10), Date.parse(at(21))).size).toBe(0);
  });

  it('squeezes the posts of whoever takes more than their share, unless others upvote them', () => {
    // Ten times the fair share: a fifth of the time (up to twice is free).
    expect(lifetimeOf({ active: at(0), upvotes: 0, rule: rule(30), overuse: 10 })).toMatchObject({ until: at(6), overShare: 5 });
    // Within twice the share: as before.
    expect(lifetimeOf({ active: at(0), upvotes: 0, rule: rule(30), overuse: 1.8 })).toEqual({ until: at(30), upvotes: 0, addedDays: 0 });
    // Valued by others: not squeezed.
    expect(lifetimeOf({ active: at(0), upvotes: 1, rule: rule(30), overuse: 10 })).toEqual({ until: at(60), upvotes: 1, addedDays: 30 });
    // Over the size: the biggest over-user goes first, before posts that would go sooner.
    const r = rule(30, 1);
    const mb = 1024 * 1024;
    const posts = [
      { id: 'flood', lifetime: lifetimeOf({ active: at(20), upvotes: 0, rule: r }), bytes: 0.6 * mb, overuse: 5 },
      { id: 'old', lifetime: lifetimeOf({ active: at(0), upvotes: 0, rule: r }), bytes: 0.6 * mb, overuse: 0.5 },
    ];
    expect([...overBudget(posts, r, Date.parse(at(21)))]).toEqual(['flood']);
  });
});
