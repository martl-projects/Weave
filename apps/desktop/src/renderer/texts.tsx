/**
 * Texts by name in the renderer (docs/localization.md): the language of this
 * device, the packages for it, and `t` / `<T>` for components.
 *
 * The desktop's setting lives in the node's config, so the main process and the
 * daemon read the same one; the renderer mirrors it in localStorage to start in
 * the right language before the node answers. The phone keeps only the mirror:
 * its language is its own, not its node's.
 */
import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { isLanguageSetting, pickLanguage, pickLocale, texts as makeTexts, type LanguageSetting, type TextPart, type Texts, type TextValues } from '@weave/core';
import { packagesFor } from '@weave/texts';
import { api, bridge } from './bridge.ts';

const KEY = 'weave.language';

export function loadLanguageSetting(): LanguageSetting {
  try {
    const saved = localStorage.getItem(KEY);
    if (isLanguageSetting(saved)) return saved;
  } catch {}
  return 'system';
}

function storeLanguageSetting(setting: LanguageSetting): void {
  try {
    localStorage.setItem(KEY, setting);
  } catch {}
}

const systemLanguages = (): readonly string[] => (navigator.languages?.length ? navigator.languages : [navigator.language || 'en']);

function textsFor(setting: LanguageSetting): Texts {
  const lang = pickLanguage(setting, systemLanguages());
  return makeTexts({
    lang,
    locale: pickLocale(lang, systemLanguages()),
    packages: packagesFor(lang),
    missing: (name) => console.warn(`no text named ${name}`),
  });
}

/** The texts in use, for code outside components (toasts from helpers, formatting in lib.ts). Components use useTexts. */
let current: Texts = textsFor(loadLanguageSetting());
export const t = (name: string, values?: TextValues): string => current.t(name, values);
export const currentTexts = (): Texts => current;

interface TextsState {
  texts: Texts;
  setting: LanguageSetting;
  setLanguage(setting: LanguageSetting): void;
}

const TextsContext = createContext<TextsState | null>(null);

export function TextsProvider({ children }: { children: ReactNode }) {
  const [setting, setSetting] = useState<LanguageSetting>(loadLanguageSetting);
  useEffect(() => {
    if (bridge.phone) return; // the phone's language is its own
    api<{ language?: string }>('preferences').then(
      (p) => {
        const fromNode: LanguageSetting = isLanguageSetting(p.language) ? p.language : 'system';
        storeLanguageSetting(fromNode);
        setSetting(fromNode);
      },
      () => {}, // not connected yet: the mirror stands
    );
  }, []);
  const state = useMemo<TextsState>(() => {
    const texts = textsFor(setting);
    current = texts;
    return {
      texts,
      setting,
      setLanguage: (next) => {
        storeLanguageSetting(next);
        setSetting(next);
        if (!bridge.phone) api('setPreferences', { language: next }).catch(() => {});
      },
    };
  }, [setting]);
  useEffect(() => {
    document.documentElement.lang = state.texts.lang;
  }, [state]);
  return <TextsContext.Provider value={state}>{children}</TextsContext.Provider>;
}

/** The texts for this component: `t(name, values)` as a string, the language and its setting. */
export function useTexts(): { t: (name: string, values?: TextValues) => string; lang: string; locale: string; setting: LanguageSetting; setLanguage(setting: LanguageSetting): void } {
  const state = useContext(TextsContext);
  if (!state) throw new Error('useTexts outside TextsProvider');
  return { t: state.texts.t, lang: state.texts.lang, locale: state.texts.locale, setting: state.setting, setLanguage: state.setLanguage };
}

/** A text as elements: its markup (<b>, <i>, <code>) and node values rendered, for sentences with bold names in them. */
export function T({ name, values }: { name: string; values?: TextValues }) {
  const state = useContext(TextsContext);
  const parts = (state?.texts ?? current).parts(name, values);
  return <>{renderParts(parts)}</>;
}

function renderParts(parts: TextPart[]): ReactNode[] {
  return parts.map((part, i) => {
    if (typeof part === 'string') return part;
    if ('tag' in part) return createElement(part.tag, { key: i }, ...renderParts(part.children));
    return <span key={i}>{part.value as ReactNode}</span>;
  });
}
