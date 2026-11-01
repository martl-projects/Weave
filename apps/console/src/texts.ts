/**
 * Texts by name in the admin console (docs/localization.md): the browser's language, from the same packages as the
 * app. Admins have no setting here; their browser's language decides.
 */
import { pickLanguage, pickLocale, texts, type TextValues } from '@weave/core';
import { packagesFor } from '@weave/texts';

const languages: readonly string[] = navigator.languages?.length ? navigator.languages : [navigator.language || 'en'];
const lang = pickLanguage('system', languages);
const current = texts({ lang, locale: pickLocale(lang, languages), packages: packagesFor(lang) });
document.documentElement.lang = lang;

export const t = (name: string, values?: TextValues): string => current.t(name, values);
