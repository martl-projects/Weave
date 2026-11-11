import { describe, expect, it } from 'vitest';
import { b64u, createIdentity, newPlanSecret, onboardLink, openPlan, parseOnboardLink, parsePlan, planCheck, sealPlan, type OnboardPlan } from '../src/index.ts';

const martl = createIdentity();
const plan: OnboardPlan = {
  v: 1,
  by: { did: martl.did, name: 'martl' },
  title: 'Pferderennen',
  steps: [
    { do: 'account' },
    { do: 'contact', link: 'weave:contact:abc', friends: true },
    { do: 'join', link: 'weave:invite:xyz', space: { id: 'p1', kind: 'project', name: 'Pferderennen' } },
    { do: 'open', space: 'p1', play: true },
    { do: 'welcome', text: 'Schön, dass du da bist!' },
  ],
};

describe('onboarding plans', () => {
  it('seal with a link secret only that secret opens', () => {
    const secret = newPlanSecret();
    const sealed = sealPlan(plan, secret);
    expect(sealed).not.toContain('Pferderennen');
    expect(openPlan(sealed, secret)).toEqual(plan);
    expect(() => openPlan(sealed, newPlanSecret())).toThrow(/is the link whole/);
    // The check proves the secret without being it.
    expect(planCheck(secret)).not.toBe(b64u.encode(secret));
    expect(planCheck(secret)).toBe(planCheck(secret));
  });

  it('keep the steps a Weave knows, in order, and skip the rest', () => {
    const read = parsePlan({ ...plan, steps: [{ do: 'teleport' }, ...plan.steps, { do: 'contact', link: 'https://elsewhere' }, { do: 'join', link: 'weave:invite:x' }] });
    expect(read.steps).toEqual(plan.steps);
    expect(() => parsePlan({ v: 2 })).toThrow(/no plan/);
    expect(() => parsePlan({ ...plan, by: { did: 'nobody' } })).toThrow(/no plan/);
  });

  it('make and read short links, with the secret after the #', () => {
    const secret = newPlanSecret();
    const link = onboardLink('https://web.martl.io/whatever', 'Pf3kQ9xz', secret);
    expect(link).toMatch(/^https:\/\/web\.martl\.io\/j\/Pf3kQ9xz#[A-Za-z0-9_-]{22}$/);
    expect(link.length).toBeLessThan(60);
    const read = parseOnboardLink(`Komm spielen: ${link} !`)!;
    expect(read.page).toBe('https://web.martl.io');
    expect(read.code).toBe('Pf3kQ9xz');
    expect(read.secret).toEqual(secret);
    expect(parseOnboardLink('https://web.martl.io/j/Pf3kQ9xz')).toBeUndefined();
    expect(parseOnboardLink('https://web.martl.io/j/short#abc')).toBeUndefined();
  });
});
