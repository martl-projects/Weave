import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadOverlay, overlayOpens, saveOverlay } from '../src/overlay.ts';

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
