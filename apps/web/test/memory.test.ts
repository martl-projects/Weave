import { describe, expect, it } from 'vitest';
import { heapMB, memoryTeller } from '../src/memory.ts';

describe('how much memory a Worker takes', () => {
  it('is known only where the browser tells', () => {
    expect(heapMB({ memory: { usedJSHeapSize: 123_400_000 } })).toBe(123);
    expect(heapMB({})).toBeUndefined();
    expect(heapMB({ memory: { usedJSHeapSize: 0 } })).toBeUndefined();
    expect(heapMB(undefined)).toBeUndefined();
  });

  it('is said at first, and again only when it changed by a step', () => {
    const said: number[] = [];
    let now: number | undefined = 40;
    const memory = memoryTeller((mb) => said.push(mb), () => now, 25);
    memory.look();
    now = 60;
    memory.look();
    now = 66;
    memory.look();
    now = 50;
    memory.look();
    now = 30;
    memory.look();
    expect(said).toEqual([40, 66, 30]);
    // Not known (a browser that doesn't tell, or an account that closed): nothing is said.
    now = undefined;
    memory.look();
    expect(said).toHaveLength(3);
  });
});
