import { describe, expect, it } from 'vitest';
import { checkPackage, formatParts, missingNames, parseText, partsToString, pickLanguage, pickLocale, placeholdersOf, texts, type TextPackage } from '../src/texts.ts';

const en: TextPackage = {
  texts: 'weave',
  lang: 'en',
  names: {
    'post.reply': 'Reply',
    'peers.connected': '{n, plural, =0 {no peers right now} one {# peer connected} other {# peers connected}}',
    'member.left': '<b>{name}</b> left group <b>{group}</b>. Remove them from <b>{project}</b>?',
    'space.not.in': "You're not in this {kind, select, project {project} group {group} other {community}}.",
    'post.open.until': 'open until {deadline, date, medium} {deadline, time, short}',
    'session.active': 'active {time, ago}',
    'people.list': '{names, list}',
    'tier.price': '{price, currency} / month',
    'word.project': 'project',
    'quoted': "Type '{' and '}' here, don't worry",
  },
};

const de: TextPackage = {
  texts: 'weave',
  lang: 'de',
  names: {
    'post.reply': 'Antworten',
    'peers.connected': '{n, plural, =0 {gerade keine Peers} one {# Peer verbunden} other {# Peers verbunden}}',
    'member.left': '<b>{name}</b> hat die Gruppe <b>{group}</b> verlassen. Aus <b>{project}</b> entfernen?',
    'space.not.in': 'Du bist nicht in {kind, select, project {diesem Projekt} group {dieser Gruppe} other {dieser Community}}.',
    'word.project': 'Projekt',
  },
};

describe('the grammar', () => {
  it('parses placeholders, plurals with exact matches, selects, formats and markup', () => {
    expect(parseText('Hi {name}')).toEqual([{ kind: 'text', text: 'Hi ' }, { kind: 'arg', name: 'name' }]);
    const plural = parseText(en.names['peers.connected'])[0];
    expect(plural.kind).toBe('plural');
    expect(Object.keys((plural as { options: object }).options)).toEqual(['=0', 'one', 'other']);
    expect(parseText('{when, date, long}')).toEqual([{ kind: 'arg', name: 'when', format: 'date', style: 'long' }]);
    expect(parseText('<b>{x}</b>!')).toEqual([{ kind: 'tag', tag: 'b', children: [{ kind: 'arg', name: 'x' }] }, { kind: 'text', text: '!' }]);
    expect(placeholdersOf(parseText(en.names['member.left']))).toEqual(new Set(['name', 'group', 'project']));
  });

  it('keeps apostrophes in prose and quotes braces the ICU way', () => {
    expect(partsToString(formatParts(parseText(en.names.quoted), {}, { locale: 'en' }))).toBe("Type { and } here, don't worry");
    expect(partsToString(formatParts(parseText("it''s"), {}, { locale: 'en' }))).toBe("it's");
  });

  it('leaves unknown tags and a lone # as text', () => {
    expect(parseText('a <x>b</x> #1')).toEqual([{ kind: 'text', text: 'a <x>b</x> #1' }]);
  });

  it('refuses what it cannot answer for', () => {
    expect(() => parseText('{n, plural, one {x}}')).toThrow(/needs an "other"/);
    expect(() => parseText('{n, plural, viele {x} other {y}}')).toThrow(/not a plural category/);
    expect(() => parseText('{n, money}')).toThrow(/not a format/);
    expect(() => parseText('{n, date, tiny}')).toThrow(/not a date style/);
    expect(() => parseText('{oops')).toThrow(/never closed/);
    expect(() => parseText('<b>open')).toThrow(/never closed/);
    expect(() => parseText('{@weave:post.reply}')).toThrow(/only Weave's word\.\*/);
    expect(() => parseText('x'.repeat(2001))).toThrow(/too long/);
  });
});

describe('formatting in a locale', () => {
  const t = (name: string, values: Record<string, unknown>, lang = 'en', locale = lang) =>
    texts({ lang, locale, packages: lang === 'de' ? [de, en] : [en], now: Date.parse('2026-11-01T12:00:00Z') }).t(name, values);

  it('plurals and counts in each language, exact matches first', () => {
    expect(t('peers.connected', { n: 0 })).toBe('no peers right now');
    expect(t('peers.connected', { n: 1 })).toBe('1 peer connected');
    expect(t('peers.connected', { n: 1234 })).toBe('1,234 peers connected');
    expect(t('peers.connected', { n: 1234 }, 'de')).toBe('1.234 Peers verbunden');
    expect(t('peers.connected', { n: 1 }, 'de')).toBe('1 Peer verbunden');
  });

  it('selects by a word, with the other branch as the fallback', () => {
    expect(t('space.not.in', { kind: 'group' })).toBe("You're not in this group.");
    expect(t('space.not.in', { kind: 'group' }, 'de')).toBe('Du bist nicht in dieser Gruppe.');
    expect(t('space.not.in', { kind: 'club' }, 'de')).toBe('Du bist nicht in dieser Community.');
  });

  it('dates, times, relative times, lists and money from Intl', () => {
    const deadline = new Date('2026-12-24T17:30:00');
    expect(t('post.open.until', { deadline })).toBe(`open until ${new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(deadline)} ${new Intl.DateTimeFormat('en', { timeStyle: 'short' }).format(deadline)}`);
    expect(t('post.open.until', { deadline }, 'de', 'de-DE')).toMatch(/^offen bis|^open until/);
    expect(t('session.active', { time: '2026-11-01T11:57:00Z' })).toBe('active 3 minutes ago');
    expect(t('session.active', { time: '2026-11-01T11:59:50Z' })).toBe('active now');
    expect(t('session.active', { time: '2026-11-01T09:00:00Z' })).toBe('active 3 hours ago');
    expect(t('people.list', { names: ['Ann', 'Bo', 'Cy'] })).toBe('Ann, Bo, and Cy');
    expect(texts({ lang: 'de', locale: 'de-DE', packages: [de, en] }).t('people.list', { names: ['Ann', 'Bo', 'Cy'] })).toBe('Ann, Bo und Cy');
    expect(t('tier.price', { price: { amount: 4.5, currency: 'EUR' } })).toBe('€4.50 / month');
    expect(t('tier.price', { price: { amount: 4.5, currency: 'EUR' } }, 'de', 'de-DE')).toBe('4,50 € / month');
  });

  it('falls back to English for a name German lacks, and to the name for one nobody has', () => {
    const missing: string[] = [];
    const x = texts({ lang: 'de', packages: [de, en], missing: (n) => missing.push(n) });
    expect(x.t('post.open.until', { deadline: new Date('2026-12-24T17:30:00') })).toMatch(/^open until/);
    expect(x.t('nothing.here')).toBe('nothing.here');
    expect(missing).toEqual(['nothing.here']);
    expect(x.has('post.reply')).toBe(true);
    expect(x.has('nothing.here')).toBe(false);
  });

  it('hands markup and node values through as parts, or flattens them without markup', () => {
    const node = { react: true };
    const parts = texts({ lang: 'en', packages: [en] }).parts('member.left', { name: node, group: 'Family', project: 'Weave' });
    expect(parts).toEqual([
      { tag: 'b', children: [{ value: node }] },
      ' left group ',
      { tag: 'b', children: ['Family'] },
      '. Remove them from ',
      { tag: 'b', children: ['Weave'] },
      '?',
    ]);
    expect(texts({ lang: 'en', packages: [en], markup: false }).t('member.left', { name: 'Ann', group: 'Family', project: 'Weave' })).toBe('Ann left group Family. Remove them from Weave?');
  });

  it("a missing value shows as its placeholder, never as 'undefined'", () => {
    expect(t('member.left', { name: 'Ann' })).toBe('Ann left group {group}. Remove them from {project}?');
  });

  it("a service's text takes Weave's glossary word and nothing else of Weave's", () => {
    const weave = texts({ lang: 'de', packages: [de, en] });
    const service: TextPackage = { texts: 'derby', lang: 'de', names: { 'lists.horses.title': 'Pferde im {@weave:word.project}', 'actions.bet.label': '<b>Wetten</b>' } };
    const s = texts({ lang: 'de', packages: [service], glossary: weave, markup: false });
    expect(s.t('lists.horses.title')).toBe('Pferde im Projekt');
    expect(s.t('actions.bet.label')).toBe('Wetten');
    expect(s.t('post.reply')).toBe('post.reply');
  });
});

describe('checking a package', () => {
  it('accepts a good one, with its names and placeholders against the reference', () => {
    expect(checkPackage(en)).toEqual([]);
    expect(checkPackage(de, en)).toEqual([]);
    expect(missingNames(de, en)).toEqual(['post.open.until', 'session.active', 'people.list', 'tier.price', 'quoted']);
  });

  it('names every problem at once', () => {
    const bad = {
      texts: 'Weave!',
      lang: 'deutsch',
      names: { 'Post.Reply': 'x', 'post.reply': 7, 'peers.connected': '{n, plural, one {x}}', 'member.left': '{name} left', 'extra.name': 'y' },
    };
    const problems = checkPackage(bad, en);
    expect(problems.map((p) => p.problem)).toEqual([
      expect.stringMatching(/^texts:/),
      expect.stringMatching(/^lang:/),
      'not a name: lowercase words joined by dots',
      'not a text',
      expect.stringMatching(/needs an "other"/),
      '{group} missing (the en text has it)',
      '{project} missing (the en text has it)',
      'not a name of weave (en)',
    ]);
    expect(checkPackage(null)).toEqual([{ problem: 'not a package: an object with texts, lang and names' }]);
    expect(checkPackage({ texts: 'derby', lang: 'de', names: { a: 'x' } }, en).map((p) => p.problem)).toContain('texts: "derby", not "weave"');
  });

  it("knows each language's plural categories", () => {
    expect(checkPackage({ texts: 'weave', lang: 'de', names: { n: '{n, plural, few {x} other {y}}' } }).map((p) => p.problem)).toEqual([expect.stringMatching(/"few" isn't one of de's/)]);
    expect(checkPackage({ texts: 'weave', lang: 'pl', names: { n: '{n, plural, few {x} many {z} other {y}}' } })).toEqual([]);
  });
});

describe('the language of a device', () => {
  it('picks the first system language Weave has, English otherwise, and keeps the region for Intl', () => {
    expect(pickLanguage('system', ['fr-CH', 'de-AT', 'en'])).toBe('de');
    expect(pickLanguage('system', ['fr-CH', 'it'])).toBe('en');
    expect(pickLanguage(undefined, [])).toBe('en');
    expect(pickLanguage('en', ['de-DE'])).toBe('en');
    expect(pickLocale('de', ['fr-CH', 'de-AT'])).toBe('de-AT');
    expect(pickLocale('de', ['en-US'])).toBe('de');
  });
});
