/**
 * The texts check (docs/localization.md): no UI text is written into the
 * components, and the language packages agree with the code and each other.
 *
 *   node scripts/check-texts.ts            report; exit 1 on an error
 *   node scripts/check-texts.ts --allow    rewrite the allowlist from what is found now
 *
 * 1. Hard-coded text: JSX text with letters, string literals in title, placeholder,
 *    aria-label, label and alt (attributes and object properties), and string
 *    arguments to toast, ask, attempt, alert, confirm and prompt. Files not moved
 *    yet are in scripts/check-texts.allow.json; that list only shrinks, and a file
 *    that is clean must leave it.
 * 2. Every name used in code (t('x'), <T name="x">, t(`look.${s}`) as a prefix, and the
 *    daemon's new WeaveError('x', …)) is in the English package, and every English name is
 *    used, except the glossary (word.*). The daemon's names (daemon.*) are literals in the
 *    node's sources: errors as WeaveError's first argument, notices as `name:` properties;
 *    a notice's second line is its name + `.text`.
 * 3. Each language parses, and its placeholders and plural categories match English.
 *    A name German lacks is a warning until the release.
 *
 * The sources are read with Babel's parser: TypeScript 7, the native compiler, has
 * no JavaScript API, and a second TypeScript in node_modules would lend tsc its libs.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import * as b from '@babel/types';
import { checkPackage, GLOSSARY_PREFIX, LANGUAGES, missingNames, TEXT_NAME, type TextPackage } from '@weave/core';

const ROOTS = ['apps/desktop/src', 'apps/console/src'];
/** Where the daemon names what it writes for screens (docs/localization.md, "Texts the daemon writes"); its English sentences are no hard-coded text. */
const DAEMON_ROOTS = ['packages/node/src'];
const TEXT_KEYS: ReadonlySet<string> = new Set(['title', 'placeholder', 'aria-label', 'label', 'alt']);
const TEXT_CALLS: ReadonlySet<string> = new Set(['toast', 'ask', 'attempt', 'alert', 'confirm', 'prompt', 'copy']);
/** Two letters in a row make a text; `p/`, `·`, `#`, `x` don't. */
const LETTERS = /\p{L}{2,}/u;
/** Words that are no text: the product's name, and a toast's kind. */
const NOT_TEXT: ReadonlySet<string> = new Set(['Weave', 'ok', 'error', 'https://']);
const ALLOWLIST = 'scripts/check-texts.allow.json';

export interface Finding {
  file: string;
  line: number;
  text: string;
}

export interface CheckResult {
  errors: string[];
  warnings: string[];
  /** Files with hard-coded text, with how many places. */
  found: Record<string, number>;
}

const isName = (s: string) => TEXT_NAME.test(s) && s.includes('.');
/** A link's or address's form, shown as a placeholder (weave:enroll:…, https://, git@github.com:owner/repo.git): not a text. */
const isLinkForm = (s: string) => /^[a-z][a-z0-9-]*:[^\s]*$/.test(s) || /^[a-z]+@[a-z0-9.-]+:[^\s]*$/.test(s);

const parseSource = (file: string, source: string) =>
  parse(source, { sourceType: 'module', sourceFilename: file, plugins: ['typescript', 'jsx'], errorRecovery: true, attachComment: false });

const NOT_CHILDREN: ReadonlySet<string> = new Set(['loc', 'start', 'end', 'range', 'extra', 'leadingComments', 'trailingComments', 'innerComments']);
const isNode = (v: unknown): v is b.Node => !!v && typeof v === 'object' && typeof (v as { type?: unknown }).type === 'string';

/** Every node below one, depth first. */
function walk(node: b.Node, visit: (node: b.Node) => void): void {
  visit(node);
  for (const [key, child] of Object.entries(node)) {
    if (NOT_CHILDREN.has(key)) continue;
    if (Array.isArray(child)) {
      for (const c of child as unknown[]) if (isNode(c)) walk(c, visit);
    } else if (isNode(child)) walk(child, visit);
  }
}

const keyName = (key: b.Node): string | undefined => (b.isIdentifier(key) ? key.name : b.isStringLiteral(key) ? key.value : undefined);
const jsxName = (name: b.JSXIdentifier | b.JSXNamespacedName): string => (b.isJSXIdentifier(name) ? name.name : `${name.namespace.name}:${name.name.name}`);

/** The hard-coded texts of one file. */
const CODE_TAGS = new Set(['code', 'pre', 'kbd']);

export function findHardcoded(file: string, source: string): Finding[] {
  const findings: Finding[] = [];
  const add = (node: b.Node, text: string) => findings.push({ file, line: node.loc?.start.line ?? 0, text: text.trim().slice(0, 60) });
  /** String-ish literals inside an expression (a literal, a template, a conditional, a `||`), each a text when it has letters and isn't a name. */
  const literalsIn = (node: b.Node | null | undefined): void => {
    if (!node) return;
    if (b.isStringLiteral(node)) {
      if (LETTERS.test(node.value) && !isName(node.value) && !NOT_TEXT.has(node.value) && !isLinkForm(node.value)) add(node, node.value);
    } else if (b.isTemplateLiteral(node)) {
      const text = node.quasis.map((q) => q.value.cooked ?? q.value.raw).join(' ');
      if (node.expressions.length === 0) {
        if (LETTERS.test(text) && !isName(text)) add(node, text);
      } else if (LETTERS.test(text)) add(node, text);
      for (const e of node.expressions) literalsIn(e);
    } else if (b.isConditionalExpression(node)) {
      literalsIn(node.consequent);
      literalsIn(node.alternate);
    } else if (b.isLogicalExpression(node) && (node.operator === '||' || node.operator === '??')) {
      literalsIn(node.left);
      literalsIn(node.right);
    } else if (b.isParenthesizedExpression(node) || b.isTSAsExpression(node) || b.isTSSatisfiesExpression(node) || b.isTSNonNullExpression(node)) {
      literalsIn(node.expression);
    } else if (b.isJSXExpressionContainer(node)) {
      literalsIn(node.expression);
    }
  };
  // Code shown as code (<code>, <pre>, <kbd>) is no text: it's the same in every language.
  const code = new WeakSet<b.Node>();
  walk(parseSource(file, source), (node) => {
    if (b.isJSXElement(node) && b.isJSXIdentifier(node.openingElement.name) && CODE_TAGS.has(node.openingElement.name.name)) {
      for (const child of node.children) code.add(child);
    } else if (b.isJSXText(node)) {
      if (code.has(node)) return;
      if (LETTERS.test(node.value) && !NOT_TEXT.has(node.value.trim())) add(node, node.value);
    } else if (b.isJSXAttribute(node) && node.value && TEXT_KEYS.has(jsxName(node.name))) {
      literalsIn(node.value);
    } else if (b.isObjectProperty(node) && !node.computed && TEXT_KEYS.has(keyName(node.key) ?? '')) {
      literalsIn(node.value);
    } else if (b.isCallExpression(node) && b.isIdentifier(node.callee) && TEXT_CALLS.has(node.callee.name)) {
      for (const arg of node.arguments) literalsIn(arg);
    }
  });
  return findings;
}

/**
 * The names a file asks for: the literal names given to t(), <T> and new WeaveError(), chosen in a conditional too; the
 * prefixes of template names like t(`look.${s}`); and candidates: every name-shaped string in the file, for a name picked
 * from a map and passed on as a variable, or a notice's `name:` (a candidate counts as used only when the English package has it).
 */
export function namesUsed(file: string, source: string): { names: Set<string>; prefixes: Set<string>; candidates: Set<string> } {
  const names = new Set<string>();
  const prefixes = new Set<string>();
  const candidates = new Set<string>();
  const take = (arg: b.Node | null | undefined) => {
    if (!arg) return;
    if (b.isStringLiteral(arg)) names.add(arg.value);
    else if (b.isTemplateLiteral(arg)) {
      const head = arg.quasis[0]?.value.cooked ?? '';
      if (arg.expressions.length === 0) names.add(head);
      else if (head) prefixes.add(head);
    } else if (b.isJSXExpressionContainer(arg)) take(arg.expression);
    else if (b.isConditionalExpression(arg)) {
      take(arg.consequent);
      take(arg.alternate);
    } else if (b.isLogicalExpression(arg)) {
      take(arg.left);
      take(arg.right);
    } else if (b.isParenthesizedExpression(arg)) take(arg.expression);
  };
  walk(parseSource(file, source), (node) => {
    if (b.isCallExpression(node)) {
      const callee = node.callee;
      const isT = (b.isIdentifier(callee) && callee.name === 't') || (b.isMemberExpression(callee) && b.isIdentifier(callee.property) && callee.property.name === 't');
      if (isT) take(node.arguments[0]);
    } else if (b.isNewExpression(node) && b.isIdentifier(node.callee) && node.callee.name === 'WeaveError') {
      take(node.arguments[0]);
    } else if (b.isJSXOpeningElement(node) && b.isJSXIdentifier(node.name) && node.name.name === 'T') {
      for (const attr of node.attributes) if (b.isJSXAttribute(attr) && jsxName(attr.name) === 'name') take(attr.value);
    } else if (b.isStringLiteral(node) && isName(node.value)) candidates.add(node.value);
  });
  return { names, prefixes, candidates };
}

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(path);
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) yield path;
  }
}

const slash = (p: string) => p.split('\\').join('/');

export function checkTexts(root: string, options: { writeAllowlist?: boolean } = {}): CheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const found: Record<string, number> = {};
  const names = new Set<string>();
  const prefixes = new Set<string>();
  const candidates = new Set<string>();

  for (const dir of ROOTS) {
    for (const file of sourceFiles(join(root, dir))) {
      const rel = slash(relative(root, file));
      const source = readFileSync(file, 'utf8');
      const findings = findHardcoded(rel, source);
      if (findings.length) found[rel] = findings.length;
      const used = namesUsed(rel, source);
      for (const n of used.names) names.add(n);
      for (const p of used.prefixes) prefixes.add(p);
      for (const c of used.candidates) candidates.add(c);
    }
  }
  for (const dir of DAEMON_ROOTS) {
    for (const file of sourceFiles(join(root, dir))) {
      const used = namesUsed(slash(relative(root, file)), readFileSync(file, 'utf8'));
      for (const n of used.names) names.add(n);
      for (const c of used.candidates) candidates.add(c);
    }
  }

  const allowPath = join(root, ALLOWLIST);
  if (options.writeAllowlist) writeFileSync(allowPath, JSON.stringify(Object.keys(found).sort(), null, 2) + '\n');
  const allowed = new Set<string>(JSON.parse(readFileSync(allowPath, 'utf8')) as string[]);
  for (const [file, n] of Object.entries(found)) {
    if (!allowed.has(file)) {
      const source = readFileSync(join(root, file), 'utf8');
      const list = findHardcoded(file, source)
        .slice(0, 8)
        .map((f) => `  ${file}:${f.line}: ${JSON.stringify(f.text)}`)
        .join('\n');
      errors.push(`${file} has ${n} hard-coded text${n === 1 ? '' : 's'} and isn't on the allowlist (${ALLOWLIST}); give them names:\n${list}${n > 8 ? '\n  …' : ''}`);
    }
  }
  for (const file of allowed) if (!(file in found)) errors.push(`${file} has no hard-coded text left: take it off ${ALLOWLIST}`);

  // The packages: English against the code, every other language against English.
  const packages = new Map<string, TextPackage>();
  for (const lang of LANGUAGES) {
    const file = join(root, 'packages/texts', `weave.texts.${lang}.json`);
    try {
      const source = readFileSync(file, 'utf8');
      packages.set(lang, JSON.parse(source) as TextPackage);
      // JSON keeps the last of a name given twice, silently: the first text is lost (as playlink.play once was).
      const seen = new Set<string>();
      for (const [, name] of source.matchAll(/^\s*"([^"]+)":/gm)) {
        if (seen.has(name)) errors.push(`packages/texts/weave.texts.${lang}.json: ${name} is there twice, and only the last counts`);
        seen.add(name);
      }
    } catch (error) {
      errors.push(`packages/texts/weave.texts.${lang}.json: ${(error as Error).message}`);
    }
  }
  const en = packages.get('en');
  if (en) {
    for (const p of checkPackage(en)) errors.push(`en ${p.name ?? ''}: ${p.problem}`);
    for (const name of names) if (!(name in en.names)) errors.push(`t('${name}') has no English text: add it to packages/texts/weave.texts.en.json`);
    for (const name of Object.keys(en.names)) {
      if (name.startsWith(GLOSSARY_PREFIX)) continue;
      // A notice's second line is its name + .text (notify.tsx noticeLines).
      const noticeText = name.endsWith('.text') && candidates.has(name.slice(0, -'.text'.length));
      if (!names.has(name) && !candidates.has(name) && !noticeText && ![...prefixes].some((p) => name.startsWith(p))) errors.push(`${name} is in the English package and used nowhere: take it out`);
    }
    for (const [lang, pkg] of packages) {
      if (lang === 'en') continue;
      for (const p of checkPackage(pkg, en)) errors.push(`${lang} ${p.name ?? ''}: ${p.problem}`);
      const missing = missingNames(pkg, en);
      if (missing.length) warnings.push(`${lang} lacks ${missing.length} of ${Object.keys(en.names).length} names (they show in English): ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ', …' : ''}`);
    }
  }
  return { errors, warnings, found };
}

const here = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === here) {
  const root = resolve(dirname(here), '..');
  const list = process.argv.indexOf('--list');
  if (list > 0) {
    // node scripts/check-texts.ts --list apps/desktop/src/renderer/home.tsx: every hard-coded text of one file, to name them
    const file = process.argv[list + 1];
    for (const f of findHardcoded(file, readFileSync(join(root, file), 'utf8'))) console.log(`${f.line}: ${f.text}`);
    process.exit(0);
  }
  const result = checkTexts(root, { writeAllowlist: process.argv.includes('--allow') });
  const files = Object.keys(result.found).length;
  const places = Object.values(result.found).reduce((a, b) => a + b, 0);
  console.log(`${places} hard-coded texts in ${files} files still to name`);
  for (const w of result.warnings) console.log(`warning: ${w}`);
  for (const e of result.errors) console.error(`error: ${e}`);
  process.exit(result.errors.length ? 1 : 0);
}
