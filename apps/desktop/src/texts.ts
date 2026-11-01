/**
 * Texts by name in the main process (docs/localization.md): window titles, the tray menu, dialogs. The language is the
 * node's setting (config.json in the home, which the window writes through the daemon), else the system's; the window
 * tells the main process when it changes, so menus follow at once.
 */
import { readFileSync } from 'node:fs';
import { app } from 'electron';
import { isLanguageSetting, pickLanguage, pickLocale, texts, type LanguageSetting, type Texts, type TextValues } from '@weave/core';
import { packagesFor } from '@weave/texts';
import type { Home } from '@weave/node/client';

let setting: LanguageSetting = 'system';
let current: Texts | undefined;

/** The system's languages, best first; before the app is ready, the environment's. */
function systemLanguages(): readonly string[] {
  try {
    if (app.isReady()) return app.getPreferredSystemLanguages();
  } catch {}
  const env = process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG;
  return env ? [env.split('.')[0].replace('_', '-')] : [];
}

function make(): Texts {
  const lang = pickLanguage(setting, systemLanguages());
  return texts({ lang, locale: pickLocale(lang, systemLanguages()), packages: packagesFor(lang) });
}

/** The setting as the node keeps it, read once at start (the window says when it changes). */
export function loadLanguage(home: Home): void {
  try {
    const stored = JSON.parse(readFileSync(home.config, 'utf8')) as { language?: unknown };
    if (isLanguageSetting(stored.language)) setting = stored.language;
  } catch {}
  current = undefined;
}

/** The window changed the setting: the next text is in the new language. */
export function setLanguage(next: unknown): boolean {
  if (!isLanguageSetting(next) || next === setting) return false;
  setting = next;
  current = undefined;
  return true;
}

export const t = (name: string, values?: TextValues): string => (current ??= make()).t(name, values);
