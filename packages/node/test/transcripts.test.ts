import { appendFileSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { recentSessions, transcriptActive, transcriptOf, transcriptTitle } from '../src/claudecode.ts';

/*
 * The Sessions view asks about dozens of Claude Code transcripts every few
 * seconds (G5N4EzO0): what it asks is answered from one listing and from what
 * was read last time, and still follows a transcript that grows, a title that
 * changes, and a session that just appeared.
 */

const dirs: string[] = [];
afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

const line = (entry: Record<string, unknown>) => `${JSON.stringify(entry)}\n`;
const transcript = (dir: string, folder: string, id: string, cwd: string) => {
  mkdirSync(join(dir, folder), { recursive: true });
  const file = join(dir, folder, `${id}.jsonl`);
  writeFileSync(file, line({ type: 'user', cwd, sessionId: id, message: { role: 'user', content: 'hi' } }));
  return file;
};

describe('Claude Code transcripts, asked about again and again', () => {
  it('finds a transcript by its session, a new one at once, and the folder it works in', () => {
    const dir = mkdtempSync(join(tmpdir(), 'weave-transcripts-'));
    dirs.push(dir);
    const a = transcript(dir, 'C--Users-me-a', 'aaaaaaaa-1111-4222-8333-444444444444', 'C:\\Users\\me\\a');
    expect(transcriptOf('aaaaaaaa-1111-4222-8333-444444444444', dir)).toBe(a);
    expect(transcriptOf('bbbbbbbb-1111-4222-8333-444444444444', dir)).toBeUndefined();
    // Appears right after the listing was taken: found without waiting for it to age.
    const b = transcript(dir, 'C--Users-me-b', 'bbbbbbbb-1111-4222-8333-444444444444', 'C:\\Users\\me\\b');
    expect(transcriptOf('bbbbbbbb-1111-4222-8333-444444444444', dir)).toBe(b);
    expect(transcriptOf('not a session id!', dir)).toBeUndefined();
    const recent = recentSessions(Date.now() - 60_000, dir);
    expect(recent.map((s) => [s.id.slice(0, 8), s.folder])).toEqual(expect.arrayContaining([['aaaaaaaa', 'C:\\Users\\me\\a'], ['bbbbbbbb', 'C:\\Users\\me\\b']]));
    expect(transcriptActive('aaaaaaaa-1111-4222-8333-444444444444', dir)).toMatch(/^\d{4}-/);
    // Gone: not found any more once the listing is taken again.
    rmSync(b);
    expect(transcriptOf('bbbbbbbb-1111-4222-8333-444444444444', dir)).toBeUndefined();
  });

  it('reads a title again only when the transcript changed, and sees the latest', () => {
    const dir = mkdtempSync(join(tmpdir(), 'weave-transcripts-'));
    dirs.push(dir);
    const id = 'cccccccc-1111-4222-8333-444444444444';
    const file = transcript(dir, 'C--Users-me-c', id, 'C:\\Users\\me\\c');
    expect(transcriptTitle(id, dir)).toBeUndefined();
    appendFileSync(file, line({ type: 'custom-title', customTitle: 'First title' }));
    expect(transcriptTitle(id, dir)).toBe('First title');
    // The same size and time: answered from last time (the file isn't read; a renamed line would not be seen).
    expect(transcriptTitle(id, dir)).toBe('First title');
    appendFileSync(file, line({ type: 'custom-title', customTitle: 'Second title' }));
    utimesSync(file, new Date(), new Date(Date.now() + 5000));
    expect(transcriptTitle(id, dir)).toBe('Second title');
  });
});
