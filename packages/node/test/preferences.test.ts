import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { closeOpenStores, WeaveNode } from '../src/index.ts';

const dirs: string[] = [];
afterAll(() => {
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

describe("the computer's own settings: the UI's language", () => {
  it('is absent (the system language) until chosen, is kept in the config for the daemon and the app alike, and "system" clears it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'weave-prefs-'));
    dirs.push(dir);
    const martl = WeaveNode.init('martl', dir);
    expect(await martl.preferences()).toEqual({});

    expect(await martl.setPreferences({ language: 'de' })).toEqual({ language: 'de' });
    expect(await martl.preferences()).toEqual({ language: 'de' });
    expect(JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8')).language).toBe('de');

    expect(await martl.setPreferences({ language: 'system' })).toEqual({});
    expect(JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8')).language).toBeUndefined();

    await expect(martl.setPreferences({ language: 'fr' as 'de' })).rejects.toThrow('not a language Weave has: fr (en, de, or system)');
  });
});
