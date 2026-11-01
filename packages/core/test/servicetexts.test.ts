import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PACKAGES } from '@weave/texts';
import { checkServicePackage, isTextRecord, KIND_APP_TEXTS, manifestTextFields, parseManifest, releaseTextsOf, texts, type Did, type TextPackage } from '../src/index.ts';

/*
 * A service's own texts (docs/localization.md): the Pferderennen's manifest with its German next to it, as a fixture.
 * The app itself lives in its own repository; what Weave checks and resolves is here.
 */
const derby = join(import.meta.dirname, 'fixtures', 'derby');
const manifest = parseManifest(JSON.parse(readFileSync(join(derby, 'weave.app.json'), 'utf8')));
const de = JSON.parse(readFileSync(join(derby, 'weave.texts.de.json'), 'utf8')) as TextPackage;

describe("a service's own texts", () => {
  it('names every text field of the manifest by its path, with its limit', () => {
    const fields = manifestTextFields(manifest);
    expect(fields.get('name')).toBe(40);
    expect(fields.get('about')).toBe(300);
    expect(fields.get('start.hint')).toBe(200);
    expect(fields.get('settings.deepseek-api-key.label')).toBe(60);
    expect(fields.get('settings.deepseek-api-key.hint')).toBe(200);
    expect(fields.get('actions.bet.label')).toBe(60);
    expect(fields.get('actions.bet.input.amount.label')).toBe(60);
    expect(fields.get('lists.horses.item')).toBe(40);
    expect(fields.get('lists.horses.use.label')).toBe(40);
    expect(fields.get('services.derby.open.joiner.label')).toBe(30);
    expect(fields.has('actions.gallop.label')).toBe(false);
  });

  it("passes the Pferderennen's German, which translates its fields and names what it answers at run time", () => {
    expect(checkServicePackage(de, manifest)).toEqual([]);
  });

  it('refuses what is not the manifest\'s, too long, not plain, or passing for Weave', () => {
    const bad = (names: Record<string, string>) => checkServicePackage({ texts: 'derby', lang: 'de', names }, manifest).map((p) => `${p.name ?? ''}: ${p.problem}`);
    expect(bad({ 'actions.gallop.label': 'Galopp' })).toEqual(['actions.gallop.label: not a text field of this manifest']);
    expect(bad({ 'lists.horses.item': 'ein sehr sehr sehr sehr sehr sehr sehr langes Wort für ein Pferd' })).toEqual(['lists.horses.item: longer than 40 characters']);
    expect(bad({ 'actions.bet.label': '<b>Wetten</b>' })).toEqual(["actions.bet.label: no markup in a service's text"]);
    expect(bad({ 'actions.bet.label': '✓ Wetten' })).toEqual(['actions.bet.label: a check sign means "from Weave": not in a service\'s text']);
    expect(bad({ 'actions.bet.label': 'Wetten\u0007' })).toEqual(['actions.bet.label: control characters']);
    expect(bad({ 'horse.odds': 'Quote {@weave:nav.home}' })[0]).toMatch(/only Weave's word\.\* may be taken/);
    expect(checkServicePackage({ texts: 'other', lang: 'de', names: {} }, manifest).map((p) => p.problem)).toEqual(['texts: "other", not this manifest\'s app "derby"']);
    expect(checkServicePackage('nope', manifest).length).toBeGreaterThan(0);
  });

  it("resolves a field and a run-time record in German, taking only Weave's glossary from Weave", () => {
    const weave = texts({ lang: 'de', packages: [PACKAGES.de, PACKAGES.en] });
    const own = texts({ lang: 'de', packages: [de], glossary: weave, markup: false });
    expect(own.t('actions.bet.label')).toBe('Wetten');
    expect(own.t('lists.horses.add.label')).toBe('Pferd aufstellen');
    expect(own.t('horse.odds', { odds: '3:1', project: 'Derby' })).toBe('Quote 3:1 · Projekt Derby');
    expect(own.t('race.won', { horse: 'Blitz', lengths: 1 })).toBe('Blitz gewinnt mit 1 Länge Vorsprung');
    expect(own.t('race.won', { horse: 'Blitz', lengths: 3 })).toBe('Blitz gewinnt mit 3 Längen Vorsprung');
    // Weave's own names aren't a service's to use, and a service's package is never asked for Weave's.
    expect(own.has('nav.home')).toBe(false);
    expect(weave.has('actions.bet.label')).toBe(false);
  });

  it('knows a {name, values} record from anything else', () => {
    expect(isTextRecord({ name: 'horse.odds', values: { odds: '3:1' } })).toBe(true);
    expect(isTextRecord({ name: 'horse.odds' })).toBe(true);
    expect(isTextRecord({ name: 'Horse Odds' })).toBe(false);
    expect(isTextRecord({ name: 'horse.odds', values: { odds: { nested: true } } })).toBe(false);
    expect(isTextRecord('Quote 3:1')).toBe(false);
    expect(isTextRecord(null)).toBe(false);
  });

  it("takes a release's packages from maintainers' weave.app.texts events, the latest per language, only those that pass", () => {
    const martl = 'did:key:zMartl' as Did;
    const lena = 'did:key:zLena' as Did;
    const at = (time: string, author: Did, body: unknown) => ({ id: `e-${time}`, kind: KIND_APP_TEXTS, body: body as never, event: { author, time } });
    const older = { ...de, names: { ...de.names, 'actions.bet.label': 'Setzen' } };
    const broken = { ...de, names: { ...de.names, 'actions.gallop.label': 'Galopp' } };
    const entries = [
      at('2026-11-01T10:00:00Z', martl, { release: 'r1', packages: [older] }),
      at('2026-11-01T11:00:00Z', lena, { release: 'r1', packages: [de] }), // not a maintainer
      at('2026-11-01T12:00:00Z', martl, { release: 'r1', packages: [de, { texts: 'derby', lang: 'fr', names: { name: 'Derby' } }] }),
      at('2026-11-01T13:00:00Z', martl, { release: 'r2', packages: [broken] }),
      at('2026-11-01T14:00:00Z', martl, { release: 'r1', packages: [broken] }), // fails the check: the one before stands
    ];
    const got = releaseTextsOf(entries, new Set([martl]), 'r1', manifest);
    expect(got.map((p) => p.lang).sort()).toEqual(['de', 'fr']);
    expect(got.find((p) => p.lang === 'de')?.names['actions.bet.label']).toBe('Wetten');
    expect(releaseTextsOf(entries, new Set([martl]), 'r2', manifest)).toEqual([]);
  });
});
