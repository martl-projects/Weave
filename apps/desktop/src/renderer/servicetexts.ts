/**
 * A service's own texts (docs/localization.md, Services): its packages travel with its release and come with its
 * profile; here they are resolved in the reader's language. Only the service's own names are ever looked up in its
 * packages, and only Weave's glossary (`{@weave:word.x}`) is taken from Weave's: the two tables don't touch. A
 * service's text is plain: its markup is ignored.
 */
import { useMemo } from 'react';
import { isTextRecord, texts as makeTexts, type TextPackage, type TextRecord, type Texts } from '@weave/core';
import { currentTexts, useTexts } from './texts.tsx';

export interface ServiceTexts {
  /** A manifest field (actions.bet.label) in the reader's language, else its literal as the manifest has it. */
  ts(path: string, literal: string): string;
  /** A string as it is; a {name, values} record from the service's package; anything else nothing. */
  tr(value: unknown): string | undefined;
}

export function serviceTextsFor(packages: TextPackage[] | undefined, weave: Texts): ServiceTexts {
  const mine = (packages ?? []).filter((p) => p.lang === weave.lang);
  const english = weave.lang === 'en' ? [] : (packages ?? []).filter((p) => p.lang === 'en');
  const own = makeTexts({ lang: weave.lang, locale: weave.locale, packages: [...mine, ...english], glossary: weave, markup: false });
  return {
    ts: (path, literal) => (own.has(path) ? own.t(path) : literal),
    tr: (value) => {
      if (typeof value === 'string') return value;
      if (!isTextRecord(value)) return undefined;
      return own.has(value.name) ? own.t(value.name, value.values) : value.name;
    },
  };
}

/** The texts of the service whose packages these are, in the language of the moment. */
export function useServiceTexts(packages?: TextPackage[]): ServiceTexts {
  const { lang } = useTexts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => serviceTextsFor(packages, currentTexts()), [packages, lang]);
}

export type { TextRecord };
