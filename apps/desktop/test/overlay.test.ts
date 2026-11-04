import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadOverlay, overlayOpens, saveOverlay } from '../src/overlay.ts';
import { focusNow, pick, pinnedAway, type Following } from '../src/renderer/follow.ts';

describe('which session the panel shows', () => {
  const start: Following = { known: false, pinned: '' };

  it('follows the session open in the Claude app, switch after switch', () => {
    let f = focusNow(start, 'skala');
    expect(f).toEqual({ known: true, focused: 'skala', pinned: '' });
    f = focusNow(f, 'loom');
    expect(f).toMatchObject({ focused: 'loom', pinned: '' });
    expect(pinnedAway(f)).toBe(false);
  });

  it('keeps a session you picked until you switch in the Claude app, and says so meanwhile', () => {
    let f = pick(focusNow(start, 'loom'), 'skala');
    expect(f).toMatchObject({ focused: 'loom', pinned: 'skala' });
    expect(pinnedAway(f)).toBe(true);
    // Weave says the same session again (a reload, an unrelated change): the pick holds.
    expect(focusNow(f, 'loom')).toBe(f);
    // You switch to another session in the Claude app: the panel follows again (it used to stay on the pick).
    f = focusNow(f, 'galoppa');
    expect(f).toMatchObject({ focused: 'galoppa', pinned: '' });
    expect(pinnedAway(f)).toBe(false);
  });

  it('a pick given when the panel opens holds through the first answer; picking the open session follows again', () => {
    let f = focusNow({ known: false, pinned: 'skala' }, 'loom');
    expect(f).toMatchObject({ focused: 'loom', pinned: 'skala' });
    f = pick(f, 'loom');
    expect(f.pinned).toBe('');
  });

  it('Ctrl+click: the item goes to a session, the Claude app comes to it, and the panel just follows', () => {
    let f = pick(focusNow(start, 'loom'), 'skala');
    f = focusNow(f, 'skala');
    expect(f).toMatchObject({ focused: 'skala', pinned: '' });
  });
});

describe('when the overlay comes up', () => {
  it('for someone new it comes up once by itself, to introduce itself; after that only while switched on', () => {
    expect(overlayOpens({ introduced: false, on: false }, false)).toBe(true);
    expect(overlayOpens({ introduced: true, on: false }, false)).toBe(false);
    expect(overlayOpens({ introduced: true, on: true }, false)).toBe(true);
  });

  it('opened by hand it always comes', () => {
    expect(overlayOpens({ introduced: true, on: false }, true)).toBe(true);
  });

  it('is remembered in the home: new there, and back as it was saved', () => {
    const dir = mkdtempSync(join(tmpdir(), 'weave-overlay-'));
    expect(loadOverlay(dir)).toEqual({ introduced: false, on: false });
    saveOverlay(dir, { introduced: true, on: true });
    expect(loadOverlay(dir)).toEqual({ introduced: true, on: true });
    writeFileSync(join(dir, 'overlay.json'), '{"on":"yes"}');
    expect(loadOverlay(dir)).toEqual({ introduced: false, on: false });
  });
});
