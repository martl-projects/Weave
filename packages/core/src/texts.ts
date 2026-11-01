/**
 * Texts by name (docs/localization.md).
 *
 * A UI text has a name (`post.reply`, `peers.connected`); a language package
 * answers with the text in its language. Texts carry placeholders, plurals and
 * choices in a small subset of ICU MessageFormat; dates, numbers, relative times
 * and lists come from Intl in the reader's locale, never from the package. A
 * package is plain data: this module parses and checks every text before it is
 * used, Weave's own and a service's alike, so nothing in a package can run.
 *
 * The grammar:
 *   {name}                                  a value
 *   {n, plural, one {# peer} other {# peers}}  by count; `#` is the count, `=0 {none}` an exact match, `offset:1` allowed
 *   {kind, select, project {…} other {…}}   by a word
 *   {when, date, medium} {when, time, short} {n, number} {n, number, percent} {n, number, integer}
 *   {time, ago}                             relative time, like "3 min ago"
 *   {names, list} {names, list, or}         "Ann, Bo and Cy"
 *   {price, currency}                       a value { amount, currency }
 *   <b>…</b> <i>…</i> <code>…</code>        markup, turned into elements by the renderer; literal text in a plain package
 *   {@weave:word.project}                   Weave's glossary word, the one thing a service's text may take from Weave
 *   '{' '}' '#' '<'                         quoted literals, as in ICU: an apostrophe quotes only before one of these; '' is one apostrophe
 */

export interface TextPackage {
  /** Whose names these are: `weave`, or an app's id. */
  texts: string;
  /** The language, a BCP 47 tag: `de`, `en`, `pt-BR`. */
  lang: string;
  /** The version of what it translates (a Weave version, a release tag), so an outdated package is visible. */
  of?: string;
  /** Name → text, flat. */
  names: Record<string, string>;
}

export type TextValues = Record<string, unknown>;

export type TextNode =
  | { kind: 'text'; text: string }
  | { kind: 'arg'; name: string; format?: ArgFormat; style?: string }
  | { kind: 'plural'; name: string; offset: number; options: Record<string, TextNode[]> }
  | { kind: 'select'; name: string; options: Record<string, TextNode[]> }
  | { kind: 'count' }
  | { kind: 'tag'; tag: string; children: TextNode[] }
  | { kind: 'glossary'; name: string };

export type ArgFormat = 'number' | 'date' | 'time' | 'ago' | 'list' | 'currency';
const FORMATS: ReadonlySet<string> = new Set<ArgFormat>(['number', 'date', 'time', 'ago', 'list', 'currency']);
const TAGS: ReadonlySet<string> = new Set(['b', 'i', 'code']);
const PLURAL_CATEGORIES: ReadonlySet<string> = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);

/** A text's name: lowercase words joined by dots (`keys.recovery.warning`, a manifest's field path `actions.bet.label`). */
export const TEXT_NAME = /^[a-z0-9]+(\.[a-z0-9-]+)*$/;
/** Whose texts: `weave`, or an app id. */
const TEXTS_OWNER = /^[a-z0-9][a-z0-9-]{0,39}$/;
const LANG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
/** The glossary a service's text may take from Weave: `word.*` and nothing else. */
export const GLOSSARY_PREFIX = 'word.';
export const TEXT_MAX = 2000;
export const PACKAGE_MAX = 500_000;

/** A text that doesn't parse. */
export class TextSyntaxError extends Error {
  /** Where in the text. */
  readonly at: number;
  constructor(message: string, at: number) {
    super(message);
    this.at = at;
  }
}

// ---------------------------------------------------------------- parsing

const ARG_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Parse one text into nodes; throws TextSyntaxError. */
export function parseText(text: string): TextNode[] {
  if (text.length > TEXT_MAX) throw new TextSyntaxError(`too long: ${text.length} characters, at most ${TEXT_MAX}`, TEXT_MAX);
  const p = new Parser(text);
  const nodes = p.parseNodes(false, null);
  if (p.pos < text.length) throw new TextSyntaxError(`unexpected "${text[p.pos]}"`, p.pos);
  return nodes;
}

class Parser {
  pos = 0;
  readonly s: string;
  constructor(s: string) {
    this.s = s;
  }

  /** Nodes up to a closing `}` (inPlural: `#` is the count) or a closing tag `</tag>`. */
  parseNodes(inPlural: boolean, closingTag: string | null): TextNode[] {
    const nodes: TextNode[] = [];
    let text = '';
    const flush = () => {
      if (text) nodes.push({ kind: 'text', text });
      text = '';
    };
    while (this.pos < this.s.length) {
      const c = this.s[this.pos];
      if (c === "'") {
        const next = this.s[this.pos + 1];
        if (next === "'") {
          text += "'";
          this.pos += 2;
        } else if (next === '{' || next === '}' || next === '<' || (inPlural && next === '#')) {
          // Quoted literal up to the next apostrophe (ICU).
          const end = this.s.indexOf("'", this.pos + 1);
          if (end < 0) {
            text += this.s.slice(this.pos + 1);
            this.pos = this.s.length;
          } else {
            text += this.s.slice(this.pos + 1, end);
            this.pos = end + 1;
          }
        } else {
          text += c;
          this.pos++;
        }
      } else if (c === '}') {
        if (closingTag !== null && !inPlural) throw new TextSyntaxError(`"}" inside <${closingTag}>`, this.pos);
        break;
      } else if (c === '{') {
        flush();
        nodes.push(this.parseArgument(inPlural));
      } else if (c === '#' && inPlural) {
        flush();
        nodes.push({ kind: 'count' });
        this.pos++;
      } else if (c === '<' && /^<\/?[a-z]+>/.test(this.s.slice(this.pos, this.pos + 8))) {
        const m = /^<(\/?)([a-z]+)>/.exec(this.s.slice(this.pos))!;
        if (!TAGS.has(m[2])) {
          text += c;
          this.pos++;
          continue;
        }
        if (m[1]) {
          if (m[2] !== closingTag) throw new TextSyntaxError(`</${m[2]}> closes nothing`, this.pos);
          break;
        }
        flush();
        this.pos += m[0].length;
        const children = this.parseNodes(inPlural, m[2]);
        const close = `</${m[2]}>`;
        if (!this.s.startsWith(close, this.pos)) throw new TextSyntaxError(`<${m[2]}> is never closed`, this.pos);
        this.pos += close.length;
        nodes.push({ kind: 'tag', tag: m[2], children });
      } else {
        text += c;
        this.pos++;
      }
    }
    flush();
    return nodes;
  }

  parseArgument(inPlural: boolean): TextNode {
    const start = this.pos;
    this.pos++; // {
    const end = this.s.indexOf('}', this.pos);
    if (end < 0) throw new TextSyntaxError('"{" is never closed', start);
    // The head: a name, maybe a type, then a style or the options.
    const headEnd = this.firstOf(['{', '}'], this.pos);
    const comma1 = this.firstOf([','], this.pos);
    const name = this.s.slice(this.pos, Math.min(comma1, headEnd)).trim();
    if (name.startsWith('@weave:')) {
      const word = name.slice('@weave:'.length);
      if (comma1 < headEnd || !TEXT_NAME.test(word)) throw new TextSyntaxError(`not a glossary word: "${name}"`, start);
      if (!word.startsWith(GLOSSARY_PREFIX)) throw new TextSyntaxError(`only Weave's ${GLOSSARY_PREFIX}* may be taken: "${word}"`, start);
      this.pos = headEnd + 1;
      return { kind: 'glossary', name: word };
    }
    if (!ARG_NAME.test(name)) throw new TextSyntaxError(`not a placeholder name: "${name}"`, start);
    if (comma1 >= headEnd) {
      if (this.s[headEnd] !== '}') throw new TextSyntaxError(`{${name}} takes no options`, start);
      this.pos = headEnd + 1;
      return { kind: 'arg', name };
    }
    const comma2 = this.firstOf([','], comma1 + 1);
    const type = this.s.slice(comma1 + 1, Math.min(comma2, headEnd)).trim();
    if (type === 'plural' || type === 'select') {
      let offset = 0;
      this.pos = comma2 < headEnd ? comma2 + 1 : headEnd;
      this.skipSpace();
      const m = /^offset:\s*(\d+)/.exec(this.s.slice(this.pos));
      if (m) {
        if (type !== 'plural') throw new TextSyntaxError(`{${name}, select} takes no offset`, start);
        offset = Number(m[1]);
        this.pos += m[0].length;
      }
      const options: Record<string, TextNode[]> = {};
      for (;;) {
        this.skipSpace();
        if (this.s[this.pos] === '}' || this.pos >= this.s.length) break;
        const keyEnd = this.firstOf(['{', '}'], this.pos);
        const key = this.s.slice(this.pos, keyEnd).trim();
        if (this.s[keyEnd] !== '{' || !key) throw new TextSyntaxError(`an option of {${name}, ${type}} needs a key and {…}`, this.pos);
        if (type === 'plural' && !PLURAL_CATEGORIES.has(key) && !/^=\d+$/.test(key)) throw new TextSyntaxError(`not a plural category: "${key}"`, this.pos);
        if (type === 'select' && !/^[A-Za-z0-9_-]+$/.test(key)) throw new TextSyntaxError(`not a select key: "${key}"`, this.pos);
        if (key in options) throw new TextSyntaxError(`"${key}" twice in {${name}, ${type}}`, this.pos);
        this.pos = keyEnd + 1;
        options[key] = this.parseNodes(type === 'plural' || inPlural, null);
        if (this.s[this.pos] !== '}') throw new TextSyntaxError(`option "${key}" is never closed`, this.pos);
        this.pos++;
      }
      if (this.s[this.pos] !== '}') throw new TextSyntaxError(`{${name}, ${type}} is never closed`, start);
      this.pos++;
      if (!('other' in options)) throw new TextSyntaxError(`{${name}, ${type}} needs an "other" option`, start);
      return type === 'plural' ? { kind: 'plural', name, offset, options } : { kind: 'select', name, options };
    }
    if (!FORMATS.has(type)) throw new TextSyntaxError(`not a format: "${type}"`, start);
    if (this.s[headEnd] !== '}') throw new TextSyntaxError(`{${name}, ${type}} takes no options`, start);
    this.pos = headEnd + 1;
    const style = comma2 < headEnd ? this.s.slice(comma2 + 1, headEnd).trim() : undefined;
    if (style?.includes(',')) throw new TextSyntaxError(`too much in {${name}, ${type}}`, start);
    if (style !== undefined && !styleFits(type as ArgFormat, style)) throw new TextSyntaxError(`not a ${type} style: "${style}"`, start);
    return { kind: 'arg', name, format: type as ArgFormat, ...(style ? { style } : {}) };
  }

  firstOf(chars: string[], from: number): number {
    for (let i = from; i < this.s.length; i++) if (chars.includes(this.s[i])) return i;
    return this.s.length;
  }

  skipSpace(): void {
    while (this.pos < this.s.length && /\s/.test(this.s[this.pos])) this.pos++;
  }
}

function styleFits(format: ArgFormat, style: string): boolean {
  switch (format) {
    case 'date':
      return ['short', 'medium', 'long', 'full'].includes(style);
    case 'time':
      return ['short', 'medium'].includes(style);
    case 'number':
      return ['percent', 'integer'].includes(style);
    case 'list':
      return ['and', 'or'].includes(style);
    default:
      return false;
  }
}

/** The placeholder names a text takes (plural and select variables included), for checking two languages against each other. */
export function placeholdersOf(nodes: TextNode[]): Set<string> {
  const names = new Set<string>();
  const walk = (list: TextNode[]) => {
    for (const n of list) {
      if (n.kind === 'arg' || n.kind === 'plural' || n.kind === 'select') names.add(n.name);
      if (n.kind === 'plural' || n.kind === 'select') for (const o of Object.values(n.options)) walk(o);
      if (n.kind === 'tag') walk(n.children);
    }
  };
  walk(nodes);
  return names;
}

// ---------------------------------------------------------------- formatting

/** A formatted text: strings, markup with children, and values given as they are (a React node, say). */
export type TextPart = string | { tag: string; children: TextPart[] } | { value: unknown };

export interface FormatOptions {
  /** For Intl: `de-DE`, `en`. */
  locale: string;
  /** Weave's glossary, for `{@weave:word.x}` in a service's text. */
  glossary?: (name: string) => string | undefined;
  /** Without markup, tags are literal text (a service's text, a tooltip, a terminal). */
  markup?: boolean;
  /** For "ago": the moment now, in tests. */
  now?: number;
}

/** Format parsed nodes with values. */
export function formatParts(nodes: TextNode[], values: TextValues, options: FormatOptions, count?: number): TextPart[] {
  const out: TextPart[] = [];
  const push = (part: TextPart) => {
    const last = out[out.length - 1];
    if (typeof part === 'string' && typeof last === 'string') out[out.length - 1] = last + part;
    else out.push(part);
  };
  for (const n of nodes) {
    switch (n.kind) {
      case 'text':
        push(n.text);
        break;
      case 'count':
        push(count === undefined ? '#' : new Intl.NumberFormat(options.locale).format(count));
        break;
      case 'glossary':
        push(options.glossary?.(n.name) ?? n.name);
        break;
      case 'arg': {
        const v = values[n.name];
        if (v === undefined || v === null) {
          push(`{${n.name}}`);
          break;
        }
        if (n.format) push(formatValue(v, n.format, n.style, options));
        else if (typeof v === 'string') push(v);
        else if (typeof v === 'number') push(new Intl.NumberFormat(options.locale).format(v));
        else if (v instanceof Date) push(new Intl.DateTimeFormat(options.locale, { dateStyle: 'medium' }).format(v));
        else if (Array.isArray(v) && v.every((x) => typeof x === 'string')) push(formatValue(v, 'list', undefined, options));
        else push({ value: v });
        break;
      }
      case 'plural': {
        const raw = values[n.name];
        const num = typeof raw === 'number' ? raw : Number(raw);
        if (!Number.isFinite(num)) {
          push(`{${n.name}}`);
          break;
        }
        const exact = n.options[`=${num}`];
        const category = exact ? undefined : new Intl.PluralRules(options.locale).select(num - n.offset);
        const branch = exact ?? n.options[category!] ?? n.options.other;
        for (const part of formatParts(branch, values, options, num - n.offset)) push(part);
        break;
      }
      case 'select': {
        const key = String(values[n.name] ?? '');
        const branch = n.options[key] ?? n.options.other;
        for (const part of formatParts(branch, values, options, count)) push(part);
        break;
      }
      case 'tag': {
        const children = formatParts(n.children, values, options, count);
        if (options.markup === false) {
          for (const part of children) push(part);
        } else push({ tag: n.tag, children });
        break;
      }
    }
  }
  return out;
}

function formatValue(v: unknown, format: ArgFormat, style: string | undefined, options: FormatOptions): string {
  const { locale } = options;
  switch (format) {
    case 'number': {
      const num = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(num)) return String(v);
      return new Intl.NumberFormat(locale, style === 'percent' ? { style: 'percent', maximumFractionDigits: 1 } : style === 'integer' ? { maximumFractionDigits: 0 } : {}).format(num);
    }
    case 'date': {
      const d = toDate(v);
      return d ? new Intl.DateTimeFormat(locale, { dateStyle: (style as 'medium') ?? 'medium' }).format(d) : String(v);
    }
    case 'time': {
      const d = toDate(v);
      return d ? new Intl.DateTimeFormat(locale, { timeStyle: (style as 'short') ?? 'short' }).format(d) : String(v);
    }
    case 'ago': {
      const d = toDate(v);
      if (!d) return String(v);
      const s = Math.max(0, ((options.now ?? Date.now()) - d.getTime()) / 1000);
      const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
      if (s < 60) return rtf.format(0, 'second');
      if (s < 3600) return rtf.format(-Math.floor(s / 60), 'minute');
      if (s < 86400) return rtf.format(-Math.floor(s / 3600), 'hour');
      return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(d);
    }
    case 'list': {
      const items = Array.isArray(v) ? v.map(String) : [String(v)];
      return new Intl.ListFormat(locale, { type: style === 'or' ? 'disjunction' : 'conjunction' }).format(items);
    }
    case 'currency': {
      const money = v as { amount?: unknown; currency?: unknown };
      const amount = typeof money?.amount === 'number' ? money.amount : Number(v);
      const currency = typeof money?.currency === 'string' ? money.currency : undefined;
      if (!Number.isFinite(amount)) return String(v);
      return currency ? new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount) : new Intl.NumberFormat(locale).format(amount);
    }
  }
}

function toDate(v: unknown): Date | undefined {
  const d = v instanceof Date ? v : typeof v === 'string' || typeof v === 'number' ? new Date(v) : undefined;
  return d && !Number.isNaN(d.getTime()) ? d : undefined;
}

/** Parts as one string: markup flattened, values stringified. */
export function partsToString(parts: TextPart[]): string {
  return parts.map((p) => (typeof p === 'string' ? p : 'tag' in p ? partsToString(p.children) : String(p.value))).join('');
}

// ---------------------------------------------------------------- texts: packages in order, a name resolved

export interface Texts {
  /** The language answered first: `de`. */
  readonly lang: string;
  /** For Intl: `de-DE`. */
  readonly locale: string;
  /** The text for a name, as a string; the name itself when no package has it. */
  t(name: string, values?: TextValues): string;
  /** The text as parts, for a renderer that turns markup and node values into elements. */
  parts(name: string, values?: TextValues): TextPart[];
  has(name: string): boolean;
}

export interface TextsOptions {
  /** The language chosen; the packages come in the order to ask: the language's, then English. */
  lang: string;
  /** For Intl; the language when not given. */
  locale?: string;
  packages: TextPackage[];
  /** A name no package has (in development: logged; in the check: an error). */
  missing?: (name: string) => void;
  /** Weave's glossary for `{@weave:word.x}`: a service's texts get Weave's texts here; Weave's own get nothing. */
  glossary?: Texts;
  /** False for texts rendered as plain strings only (a service's). */
  markup?: boolean;
  now?: number;
}

/** Texts from these packages: the first package that has a name answers, English last. */
export function texts(options: TextsOptions): Texts {
  const parsed = new Map<TextPackage, Map<string, TextNode[] | null>>();
  const nodesOf = (pkg: TextPackage, name: string): TextNode[] | undefined => {
    const text = pkg.names[name];
    if (typeof text !== 'string') return undefined;
    let cache = parsed.get(pkg);
    if (!cache) parsed.set(pkg, (cache = new Map()));
    let nodes = cache.get(name);
    if (nodes === undefined) {
      try {
        nodes = parseText(text);
      } catch {
        nodes = null; // a text that doesn't parse shows as itself
      }
      cache.set(name, nodes);
    }
    return nodes ?? [{ kind: 'text', text }];
  };
  const find = (name: string): TextNode[] | undefined => {
    for (const pkg of options.packages) {
      const nodes = nodesOf(pkg, name);
      if (nodes) return nodes;
    }
    return undefined;
  };
  const locale = options.locale ?? options.lang;
  const format: FormatOptions = {
    locale,
    markup: options.markup,
    now: options.now,
    ...(options.glossary ? { glossary: (name: string) => (options.glossary!.has(name) ? options.glossary!.t(name) : undefined) } : {}),
  };
  const parts = (name: string, values: TextValues = {}): TextPart[] => {
    const nodes = find(name);
    if (!nodes) {
      options.missing?.(name);
      return [name];
    }
    return formatParts(nodes, values, format);
  };
  return {
    lang: options.lang,
    locale,
    parts,
    t: (name, values) => partsToString(parts(name, values)),
    has: (name) => find(name) !== undefined,
  };
}

// ---------------------------------------------------------------- checking packages

export interface TextProblem {
  /** The name concerned, when one is. */
  name?: string;
  problem: string;
}

/** Is this a package? Its shape, and every text parses. Against a reference (English), the names and placeholders agree. */
export function checkPackage(input: unknown, reference?: TextPackage): TextProblem[] {
  const problems: TextProblem[] = [];
  const pkg = input as Partial<TextPackage> | null;
  if (!pkg || typeof pkg !== 'object') return [{ problem: 'not a package: an object with texts, lang and names' }];
  if (typeof pkg.texts !== 'string' || !TEXTS_OWNER.test(pkg.texts)) problems.push({ problem: 'texts: whose names these are, lowercase letters, digits and dashes (weave, or an app id)' });
  else if (reference && pkg.texts !== reference.texts) problems.push({ problem: `texts: "${pkg.texts}", not "${reference.texts}"` });
  if (typeof pkg.lang !== 'string' || !LANG.test(pkg.lang)) problems.push({ problem: 'lang: a language tag like de, en or pt-BR' });
  if (pkg.of !== undefined && (typeof pkg.of !== 'string' || pkg.of.length > 60)) problems.push({ problem: 'of: the version it translates, a short string' });
  if (!pkg.names || typeof pkg.names !== 'object' || Array.isArray(pkg.names)) {
    problems.push({ problem: 'names: an object of name → text' });
    return problems;
  }
  const categories = typeof pkg.lang === 'string' && LANG.test(pkg.lang) ? pluralCategories(pkg.lang) : undefined;
  for (const [name, text] of Object.entries(pkg.names)) {
    if (!TEXT_NAME.test(name)) {
      problems.push({ name, problem: 'not a name: lowercase words joined by dots' });
      continue;
    }
    if (typeof text !== 'string') {
      problems.push({ name, problem: 'not a text' });
      continue;
    }
    let nodes: TextNode[];
    try {
      nodes = parseText(text);
    } catch (error) {
      problems.push({ name, problem: (error as Error).message });
      continue;
    }
    if (categories) for (const bad of pluralsOutside(nodes, categories)) problems.push({ name, problem: `plural category "${bad}" isn't one of ${pkg.lang}'s (${[...categories].join(', ')})` });
    if (reference) {
      const ref = reference.names[name];
      if (ref === undefined) {
        problems.push({ name, problem: `not a name of ${reference.texts} (${reference.lang})` });
        continue;
      }
      let refNodes: TextNode[];
      try {
        refNodes = parseText(ref);
      } catch {
        continue; // the reference's own problem
      }
      const mine = placeholdersOf(nodes);
      const theirs = placeholdersOf(refNodes);
      for (const p of theirs) if (!mine.has(p)) problems.push({ name, problem: `{${p}} missing (the ${reference.lang} text has it)` });
      for (const p of mine) if (!theirs.has(p)) problems.push({ name, problem: `{${p}} isn't in the ${reference.lang} text` });
    }
  }
  return problems;
}

/** The names a reference has and this package lacks: they show in the reference's language. */
export function missingNames(pkg: TextPackage, reference: TextPackage): string[] {
  return Object.keys(reference.names).filter((name) => !(name in pkg.names));
}

function pluralCategories(lang: string): Set<string> {
  try {
    return new Set(new Intl.PluralRules(lang).resolvedOptions().pluralCategories);
  } catch {
    return new Set(PLURAL_CATEGORIES);
  }
}

function pluralsOutside(nodes: TextNode[], categories: Set<string>): string[] {
  const bad: string[] = [];
  const walk = (list: TextNode[]) => {
    for (const n of list) {
      if (n.kind === 'plural') for (const key of Object.keys(n.options)) if (!key.startsWith('=') && !categories.has(key)) bad.push(key);
      if (n.kind === 'plural' || n.kind === 'select') for (const o of Object.values(n.options)) walk(o);
      if (n.kind === 'tag') walk(n.children);
    }
  };
  walk(nodes);
  return bad;
}

// ---------------------------------------------------------------- the language of a device

/** The languages Weave ships texts in. */
export const LANGUAGES = ['en', 'de'] as const;
export type Language = (typeof LANGUAGES)[number];
/** The setting: a shipped language, or the system's. */
export type LanguageSetting = Language | 'system';

export const isLanguage = (s: unknown): s is Language => typeof s === 'string' && (LANGUAGES as readonly string[]).includes(s);
export const isLanguageSetting = (s: unknown): s is LanguageSetting => s === 'system' || isLanguage(s);

/** Which shipped language the setting means: the first of the system's languages Weave has, else English. */
export function pickLanguage(setting: LanguageSetting | undefined, systemLanguages: readonly string[]): Language {
  if (setting && setting !== 'system') return setting;
  for (const tag of systemLanguages) {
    const base = tag.toLowerCase().split('-')[0];
    if (isLanguage(base)) return base;
  }
  return 'en';
}

/** The locale for Intl: the system's tag when it is of the chosen language (de-AT stays Austrian), else the language itself. */
export function pickLocale(lang: Language, systemLanguages: readonly string[]): string {
  return systemLanguages.find((tag) => tag.toLowerCase().split('-')[0] === lang) ?? lang;
}
