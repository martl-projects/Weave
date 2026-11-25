import { describe, expect, it } from 'vitest';
import { deviceAsked, deviceKind, Diagnose, frameMeter, DIAGNOSE_LINE_MAX, DIAGNOSE_MAX, diagnoseAsked, diagnosePieces, type DiagnoseStore } from '../src/diagnose.ts';

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

  it('gives a browser a name of its own that stays, turned off too', () => {
    const store = storage();
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1';
    const diagnose = new Diagnose(store);
    const name = diagnose.device(iphone, () => 'k3f9');
    expect(name).toBe('iPhone k3f9');
    diagnose.set(true);
    diagnose.set(false);
    expect(new Diagnose(store).device(iphone, () => 'zzzz')).toBe('iPhone k3f9');
    expect(new Diagnose(storage()).device(iphone)).toMatch(/^iPhone [a-z0-9]{4}$/);
    expect(deviceKind('Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/140 Mobile')).toBe('Android');
    expect(deviceKind('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140')).toBe('Windows');
    expect(deviceKind('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605')).toBe('Mac');
    expect(deviceKind('Mozilla/5.0 (iPad; CPU OS 18_7 like Mac OS X) Safari/604')).toBe('iPad');
    expect(deviceKind('something else')).toBe('Browser');
  });

  it('knows a message that asks for the lines, and which device it asks', () => {
    expect(diagnoseAsked('diagnose?')).toEqual({ device: '' });
    expect(diagnoseAsked('  Diagnose?  iPhone   k3f9 ')).toEqual({ device: 'iPhone k3f9' });
    // Not what a browser sent itself, nor talk about it.
    expect(diagnoseAsked('**iPhone k3f9**\n```\n10:00:00.000 node warn diagnose? no\n```')).toBeUndefined();
    expect(diagnoseAsked('did the diagnose? arrive')).toBeUndefined();
    expect(diagnoseAsked('diagnose')).toBeUndefined();
    expect(deviceAsked('iPhone k3f9', '')).toBe(true);
    expect(deviceAsked('iPhone k3f9', 'iphone')).toBe(true);
    expect(deviceAsked('iPhone k3f9', 'K3F9')).toBe(true);
    expect(deviceAsked('iPhone k3f9', 'iPhone k3f9.')).toBe(true);
    expect(deviceAsked('iPhone k3f9', 'Android')).toBe(false);
    expect(deviceAsked('iPhone k3f9', 'iPhone a1b2')).toBe(false);
  });

  it('answers a message that asks once', () => {
    const store = storage();
    const diagnose = new Diagnose(store);
    expect(diagnose.answers('one')).toBe(true);
    expect(diagnose.answers('one')).toBe(false);
    expect(new Diagnose(store).answers('one')).toBe(false);
    for (let i = 0; i < 40; i++) diagnose.answers(`more ${i}`);
    expect(diagnose.answers('more 39')).toBe(false);
    // Long ago: forgotten (a message older than a day isn't answered anyway).
    expect(diagnose.answers('one')).toBe(true);
  });

  it('says how smoothly something draws only when it was bad, and not for a page that was put away', () => {
    const said: string[] = [];
    const frame = frameMeter((text) => said.push(text));
    let now = 0;
    const draw = (gap: number, times: number) => {
      for (let i = 0; i < times; i++) frame((now += gap));
    };
    // Sixty a second for ten seconds: nothing to say.
    draw(1000 / 60, 600);
    expect(said).toEqual([]);
    // Ten a second, with one long pause.
    draw(100, 30);
    draw(900, 1);
    draw(100, 30);
    expect(said[0]).toMatch(/^8 frames a second over 5 s, the longest pause \d+ ms, \d+ of 100 ms and more$/);
    expect(said.some((text) => text.includes('the longest pause 900 ms'))).toBe(true);
    // Put away for a minute: not a pause, and counting starts over.
    const before = said.length;
    draw(60_000, 1);
    draw(1000 / 60, 400);
    expect(said).toHaveLength(before);
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
