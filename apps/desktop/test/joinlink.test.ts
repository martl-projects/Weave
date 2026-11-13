import { describe, expect, it } from 'vitest';
import { joinLinkFor, joinLinkOf } from '../src/renderer/joinlink.ts';

describe('weave:join links (Open in the Weave app)', () => {
  const link = 'https://web.martl.io/j/Pf3kQ9xz#C6lmA1PPVeyydW9vjYznew';

  it('carry an onboarding link to the app and back, as the OS hands them over', () => {
    const join = joinLinkFor(link);
    // What the desktop's main process lets through (LINK in main.ts).
    expect(join).toMatch(/^weave:[a-z]+:[A-Za-z0-9_-]{1,6000}$/);
    expect(joinLinkOf(join)).toBe(link);
  });

  it('give nothing for anything else', () => {
    expect(joinLinkOf('weave:join:not-base64-of-a-link')).toBeUndefined();
    expect(joinLinkOf('weave:post:abc')).toBeUndefined();
    expect(joinLinkOf(joinLinkFor('https://web.martl.io/j/short#x'))).toBeUndefined();
  });
});
