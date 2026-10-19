// Cuts a release: bumps the version everywhere, adds a CHANGELOG.md section
// from the commit subjects since the last release, commits and tags. It never
// pushes; push the tag yourself and the release workflow publishes it.
//
//   npm run release -- patch | minor | major | 1.2.3   [--dry-run]

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const bump = args.find((a) => !a.startsWith('--'));
if (!bump) throw new Error('usage: npm run release -- patch | minor | major | <x.y.z> [--dry-run]');

const git = (...a: string[]) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
const readJson = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
const writeJson = (file: string, value: Record<string, unknown>) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

// --- checks
if (git('status', '--porcelain')) throw new Error('commit or stash your changes first');
if (git('rev-parse', '--abbrev-ref', 'HEAD') !== 'main') throw new Error('release from main');

// --- the next version
const rootFile = join(root, 'package.json');
const current = String(readJson(rootFile).version ?? '0.0.0');
const [major, minor, patch] = current.split('.').map(Number);
const next =
  bump === 'major' ? `${major + 1}.0.0` : bump === 'minor' ? `${major}.${minor + 1}.0` : bump === 'patch' ? `${major}.${minor}.${patch + 1}` : bump;
if (!/^\d+\.\d+\.\d+$/.test(next)) throw new Error(`"${bump}" is not patch, minor, major or a version like 1.2.3`);
const tag = `v${next}`;
if (git('tag', '--list', tag)) throw new Error(`${tag} already exists`);

// --- what changed: commit subjects since the last release tag
const lastTag = git('tag', '--list', 'v*', '--sort=-v:refname').split('\n').filter(Boolean)[0];
const subjects = git('log', '--no-merges', '--format=%s', ...(lastTag ? [`${lastTag}..HEAD`] : []))
  .split('\n')
  .filter((s) => s && !/^Release v\d/.test(s));
if (!subjects.length) throw new Error(`nothing changed since ${lastTag}`);
const date = new Date().toISOString().slice(0, 10);
const section = `## ${tag} · ${date}\n\n${subjects.map((s) => `- ${s}`).join('\n')}\n`;

console.log(`${current} → ${next}${lastTag ? ` (${subjects.length} commits since ${lastTag})` : ` (${subjects.length} commits, first release)`}\n`);
console.log(section);
if (dryRun) process.exit(0);

// --- tests must pass
execFileSync('npm', ['run', 'typecheck'], { cwd: root, stdio: 'inherit', shell: true });
execFileSync('npm', ['test'], { cwd: root, stdio: 'inherit', shell: true });

// --- bump every package.json (root, packages/*, apps/*)
const manifests = [rootFile, ...['packages', 'apps'].flatMap((dir) => readdirSync(join(root, dir)).map((name) => join(root, dir, name, 'package.json')))].filter(existsSync);
for (const file of manifests) writeJson(file, { ...readJson(file), version: next });
execFileSync('npm', ['install', '--package-lock-only', '--ignore-scripts'], { cwd: root, stdio: 'inherit', shell: true });

// --- changelog, newest first
const changelogFile = join(root, 'CHANGELOG.md');
const header = '# Changelog\n\nEvery release of Weave, newest first. Versions follow semantic versioning; while it is 0.x, any minor release may change the protocol.\n\n';
const before = existsSync(changelogFile) ? readFileSync(changelogFile, 'utf8').replace(header, '') : '';
writeFileSync(changelogFile, `${header}${section}\n${before}`.trimEnd() + '\n');

// --- commit and tag
git('add', 'CHANGELOG.md', 'package-lock.json', ...manifests.map((f) => f.slice(root.length + 1)));
git('commit', '-m', `Release ${tag}`);
git('tag', '-a', tag, '-m', `Weave ${tag}`);
console.log(`\nTagged ${tag}. Publish it with:\n  git push origin main ${tag}`);
