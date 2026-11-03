import { describe, expect, it } from 'vitest';
import { pastedFile } from '../src/renderer/paste.ts';

/** A clipboard as the browser hands it to a paste event: its files, and its items (text ones too). */
function clipboard(files: File[], text = false) {
  const items = [...(text ? [{ kind: 'string', getAsFile: () => null }] : []), ...files.map((f) => ({ kind: 'file', getAsFile: () => f }))];
  return { files: Object.assign([...files], { item: (i: number) => files[i] ?? null }), items } as unknown as Pick<DataTransfer, 'files' | 'items'>;
}

describe('a file pasted into a chat (Ctrl+V)', () => {
  const now = new Date(2026, 10, 2, 11, 30);

  it('takes the first file as it is, by its own name', () => {
    const report = new File(['pdf'], 'report.pdf', { type: 'application/pdf' });
    expect(pastedFile(clipboard([report, new File(['x'], 'other.txt')]), now)).toBe(report);
  });

  it('names a screenshot for when it was taken: the clipboard calls it image.png, or nothing', () => {
    const shot = pastedFile(clipboard([new File(['png'], 'image.png', { type: 'image/png' })]), now)!;
    expect(shot.name).toBe('screenshot-2026-11-02-1130.png');
    expect(shot.type).toBe('image/png');
    expect(pastedFile(clipboard([new File(['jpg'], '', { type: 'image/jpeg' })]), now)!.name).toBe('screenshot-2026-11-02-1130.jpg');
  });

  it('finds nothing in a clipboard of text alone', () => {
    expect(pastedFile(clipboard([], true), now)).toBeUndefined();
  });
});
