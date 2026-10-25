import { describe, expect, it } from 'vitest';
import { compact, expand, fingerprint, openRanges, reconcileStep, reconKey, type ReconItem, type ReconRange } from '../src/index.ts';

/** A deterministic random source, so failures can be replayed. */
const rng = (seed: number) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);

const item = (n: number): ReconItem => {
  const time = new Date(Date.UTC(2026, 0, 1) + n * 60_000).toISOString();
  const id = `id-${n.toString(36).padStart(6, '0')}`;
  return { key: reconKey(time, id), id };
};
const sorted = (items: ReconItem[]) => [...items].sort((a, b) => a.key.localeCompare(b.key));

/** Run both sides until nothing is left to say; what each learned it lacks, rounds and bytes. */
function run(a: ReconItem[], b: ReconItem[]) {
  const lacking = { a: new Set<string>(), b: new Set<string>() };
  let message: ReconRange[] = openRanges(a);
  let bytes = JSON.stringify(compact(message)).length;
  let rounds = 0;
  let turn: 'b' | 'a' = 'b';
  while (message.length && rounds < 50) {
    const step = reconcileStep(turn === 'b' ? b : a, expand(JSON.parse(JSON.stringify(compact(message)))));
    step.lacking.forEach((id) => lacking[turn].add(id));
    message = step.reply;
    bytes += JSON.stringify(compact(message)).length;
    rounds++;
    turn = turn === 'b' ? 'a' : 'b';
  }
  return { lacking, rounds, bytes };
}

describe('range-based reconciliation', () => {
  it('finds exactly what each side lacks, for small and big sets with few or many differences', () => {
    const random = rng(1);
    for (const [size, missing] of [[0, 0], [1, 0], [5, 2], [40, 3], [1000, 1], [1000, 50], [10_000, 5]] as const) {
      const all = Array.from({ length: size }, (_, i) => item(i));
      const onlyA = new Set<string>();
      const onlyB = new Set<string>();
      const a: ReconItem[] = [];
      const b: ReconItem[] = [];
      for (const x of all) {
        const r = random();
        if (r < missing / Math.max(1, size)) (a.push(x), onlyA.add(x.id));
        else if (r < (2 * missing) / Math.max(1, size)) (b.push(x), onlyB.add(x.id));
        else (a.push(x), b.push(x));
      }
      const result = run(sorted(a), sorted(b));
      expect(result.lacking.a).toEqual(onlyB);
      expect(result.lacking.b).toEqual(onlyA);
    }
  });

  it('costs bytes by the differences, not by the size: far less than sending every id', () => {
    const all = Array.from({ length: 10_000 }, (_, i) => item(i));
    const a = sorted(all);
    const b = sorted(all.filter((_, i) => i % 2000 !== 7)); // b lacks 5
    const { lacking, rounds, bytes } = run(a, b);
    expect(lacking.b.size).toBe(5);
    const idLists = JSON.stringify(all.map((x) => x.id)).length;
    expect(bytes).toBeLessThan(idLists / 10);
    expect(rounds).toBeLessThanOrEqual(8);
    // Equal sets: one round, a few dozen bytes.
    const same = run(a, a);
    expect(same.rounds).toBe(1);
    expect(same.bytes).toBeLessThan(200);
  });

  it('fingerprints don’t depend on order', () => {
    expect(fingerprint(['a', 'b', 'c'])).toBe(fingerprint(['c', 'a', 'b']));
    expect(fingerprint(['a', 'b'])).not.toBe(fingerprint(['a', 'b', 'c']));
    expect(fingerprint([])).toBe(fingerprint([]));
  });
});
