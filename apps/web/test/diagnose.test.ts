import { describe, expect, it } from 'vitest';
import { Diagnose, DIAGNOSE_LINE_MAX, DIAGNOSE_MAX, diagnosePieces, type DiagnoseStore } from '../src/diagnose.ts';

function storage(): DiagnoseStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}

describe('what a browser keeps of what was said in it', () => {
  it('keeps nothing unless turned on, and lets go of everything when turned off', () => {
    const store = storage();
    const diagnose = new Diagnose(store);
    diagnose.line('page', 'warn', 'not kept');
    expect(diagnose.started('a phone')).toBe(false);
    expect(store.map.size).toBe(0);
    diagnose.set(true);
    diagnose.started('a phone');
    diagnose.line('node', 'warn', 'kept');
    expect(diagnose.text()).toContain('node warn kept');
    diagnose.set(false);
    expect(store.map.size).toBe(0);
  });

  it('says so when the page before ended without closing, and not when it closed', () => {
    const store = storage();
    let now = Date.parse('2026-11-24T18:00:00Z');
    const first = new Diagnose(store, () => now);
    first.set(true);
    expect(first.started('a phone')).toBe(false);
    first.line('lens', 'error', 'out of memory');
    now += 5000;
    first.alive('#/p/x/b/album (page heap 300 MB)');
    // No close: the page died. The next one finds its mark, and its lines.
    now += 60_000;
    const second = new Diagnose(store, () => now);
    expect(second.started('a phone')).toBe(true);
    expect(second.text()).toContain('lens error out of memory');
    expect(second.text()).toContain('ended without closing (it crashed, or the system took it): last alive 2026-11-24T18:00:05.000Z at #/p/x/b/album (page heap 300 MB)');
    second.closed();
    expect(new Diagnose(store, () => now).started('a phone')).toBe(false);
  });

  it('keeps the newest lines whole when there are too many, and cuts a line that is too long', () => {
    const diagnose = new Diagnose(storage());
    diagnose.set(true);
    diagnose.line('node', 'warn', 'x'.repeat(DIAGNOSE_LINE_MAX * 3));
    expect(diagnose.text().length).toBeLessThan(DIAGNOSE_LINE_MAX + 100);
    for (let i = 0; i < 400; i++) diagnose.line('page', 'info', `line ${i} ${'y'.repeat(300)}`);
    const text = diagnose.text();
    expect(text.length).toBeLessThanOrEqual(DIAGNOSE_MAX);
    expect(text).toContain('line 399');
    expect(text).not.toContain('line 0 ');
    for (const line of text.trimEnd().split('\n')) expect(line).toMatch(/^\d\d:\d\d:\d\d\.\d{3} page info line \d+ y+$/);
  });

  it('forgets what was sent, and keeps what was said meanwhile', () => {
    const diagnose = new Diagnose(storage());
    diagnose.set(true);
    diagnose.line('page', 'info', 'one');
    const sending = diagnose.text();
    diagnose.line('page', 'info', 'two');
    diagnose.sent(sending);
    expect(diagnose.text()).toMatch(/^\S+ page info two\n$/);
  });

  it('survives a storage that refuses', () => {
    const diagnose = new Diagnose({
      getItem: () => {
        throw new Error('no');
      },
      setItem: () => {
        throw new Error('no');
      },
      removeItem: () => {},
    });
    diagnose.set(true);
    diagnose.line('page', 'info', 'one');
    expect(diagnose.text()).toBe('');
  });

  it('cuts a text into pieces at line ends', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i}`);
    const pieces = diagnosePieces(lines.join('\n') + '\n', 30);
    expect(pieces.every((p) => p.length <= 30)).toBe(true);
    expect(pieces.join('\n')).toBe(lines.join('\n'));
    expect(diagnosePieces('z'.repeat(70), 30).map((p) => p.length)).toEqual([30, 30, 10]);
    expect(diagnosePieces('', 30)).toEqual([]);
  });
});
