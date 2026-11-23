import { describe, expect, it } from 'vitest';
import { takeSpent, timed } from '../src/index.ts';

describe('where time goes', () => {
  it('counts a step by name, also when it throws, and starts over once read', () => {
    takeSpent();
    expect(timed('a step', () => 7)).toBe(7);
    expect(() =>
      timed('a step', () => {
        throw new Error('no');
      }),
    ).toThrow('no');
    timed('another', () => undefined);
    const spent = takeSpent();
    expect(spent.get('a step')?.n).toBe(2);
    expect(spent.get('another')?.n).toBe(1);
    expect(takeSpent().size).toBe(0);
  });
});
