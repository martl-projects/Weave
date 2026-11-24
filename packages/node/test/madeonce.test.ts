import { describe, expect, it } from 'vitest';
import { madeOnce } from '../src/lenses.ts';

describe('what is made ready once', () => {
  it('is one making however often it is asked for meanwhile, and made again only once it no longer runs', async () => {
    const ready = new Map<string, Promise<string>>();
    let makings = 0;
    let running = false;
    let done!: (value: string) => void;
    const make = () => (makings++, new Promise<string>((resolve) => (done = resolve)));
    const asked = [1, 2, 3].map(() => madeOnce(ready, 'lens', () => running, make));
    expect(makings).toBe(1);
    done('made');
    running = true;
    expect(await Promise.all(asked)).toEqual(['made', 'made', 'made']);
    expect(await madeOnce(ready, 'lens', () => running, make)).toBe('made');
    expect(makings).toBe(1);
    // It stopped (crashed, or hung): the next asking makes it again.
    running = false;
    void madeOnce(ready, 'lens', () => running, make);
    expect(makings).toBe(2);
  });

  it('is made again after a making that failed', async () => {
    const ready = new Map<string, Promise<string>>();
    let makings = 0;
    const failing = () => (makings++, Promise.reject(new Error('no network')));
    await expect(madeOnce(ready, 'lens', () => false, failing)).rejects.toThrow('no network');
    expect(ready.has('lens')).toBe(false);
    expect(await madeOnce(ready, 'lens', () => false, () => (makings++, Promise.resolve('made')))).toBe('made');
    expect(makings).toBe(2);
  });
});
