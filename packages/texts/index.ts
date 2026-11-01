/**
 * Weave's own language packages (docs/localization.md): one JSON file per
 * language, data only. English is the fallback: a name a language lacks shows
 * in English. The check (scripts/check-texts.ts) keeps code and packages in step.
 */
import type { Language, TextPackage } from '@weave/core';
import de from './weave.texts.de.json' with { type: 'json' };
import en from './weave.texts.en.json' with { type: 'json' };

export const PACKAGES: Readonly<Record<Language, TextPackage>> = { en, de };

/** The packages to ask for a language, in order: its own, then English. */
export function packagesFor(lang: Language): TextPackage[] {
  return lang === 'en' ? [en] : [PACKAGES[lang], en];
}
