import { describe, expect, it } from 'vitest';
import { stack, Surface } from '../src/renderer/well.ts';

/** How many pieces show color (more than a faint tint) right now. */
const lit = (well: Surface) => well.pieces.filter((_, i) => well.light(i) > 0.15).length;

describe('the arcade well', () => {
  it('stacks whole tetrominoes, four cells each, without overlap, in the lower part of the well', () => {
    const pieces = stack(13, 38);
    const cells = pieces.flatMap((p) => p.cells.map(([x, y]) => `${x},${y}`));
    expect(pieces.length).toBeGreaterThan(30);
    expect(pieces.every((p) => p.cells.length === 4)).toBe(true);
    expect(new Set(cells).size).toBe(cells.length);
    expect(Math.min(...pieces.flatMap((p) => p.cells.map(([, y]) => y)))).toBeGreaterThan(38 * 0.3);
  });

  it('is dark at rest; a mouse move ripples outward through a few pieces at a time, then dies out', () => {
    const well = new Surface(13, 38);
    expect(lit(well)).toBe(0);
    // A mouse move across the stack: 6 px a frame over 16 px cells, for 10 frames.
    const counts: number[] = [];
    let frames = 0;
    for (; frames < 600; frames++) {
      if (frames < 10) well.kick(2 + Math.floor((frames * 6) / 16), 30, 0.18);
      counts.push(lit(well));
      if (well.step() === 0) break;
    }
    const peak = Math.max(...counts);
    // It spreads: more pieces light up after the move than during its first frame...
    expect(peak).toBeGreaterThan(counts[1] + 3);
    // ...but only a band of them, never the whole well at once.
    expect(peak).toBeLessThan(well.pieces.length / 2);
    // And it settles back to dark within a few seconds (60 frames a second).
    expect(frames).toBeLessThan(5 * 60);
    expect(lit(well)).toBe(0);
  });

  it('glows as the ripple passes instead of flickering with every crest', () => {
    const well = new Surface(13, 38);
    const n = well.pieces.length;
    const history: number[][] = well.pieces.map(() => []);
    let flickers = 0;
    for (let t = 0; t < 600; t++) {
      if (t < 10) well.kick(2 + Math.floor((t * 6) / 16), 30, 0.24);
      if (well.step() === 0) break;
      for (let i = 0; i < n; i++) {
        // A flicker: within a fifth of a second (12 steps), a piece visibly dims and comes back.
        const h = history[i];
        h.push(well.light(i));
        if (h.length > 12) h.shift();
        const low = Math.min(...h);
        const dip = h.indexOf(low);
        if (Math.max(...h.slice(0, dip + 1)) - low > 0.1 && h.at(-1)! - low > 0.1) (flickers++, (h.length = 0));
      }
    }
    expect(flickers).toBeLessThan(n / 6);
  });

  it('keeps a slow mouse to a glimmer', () => {
    const well = new Surface(13, 38);
    let peak = 0;
    for (let t = 0; t < 120; t++) {
      if (t < 10) well.kick(4, 30, 0.06); // 2 px a frame
      well.step();
      peak = Math.max(peak, lit(well));
    }
    expect(peak).toBeLessThanOrEqual(3);
  });
});
