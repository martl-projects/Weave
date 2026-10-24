// Builds the phone app's web side and its worker:
//   dist/web     the screen: the desktop's renderer with the phone's bridge (Capacitor's webDir)
//   dist/web/worklet.<platform>.bundle   the worker, packed for Bare with its native addons linked
//   plugin/<platform>/addons            those addons, built for the phone (bare-link)
// `--test` packs only dist/worklet/test.cjs, the worker for plain Bare on this computer (tests).
// `--web` builds the screens and that test worker, for the browser preview (dev-web.ts).

import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { build } from 'esbuild';
import { fetchBareKit } from './fetch-bare-kit.ts';

const test = process.argv.includes('--test');
const web = process.argv.includes('--web');
// bare-pack and bare-link are Node scripts: run them with this Node, the same on every system.
const require = createRequire(import.meta.url);
const run = (name: string, args: string[]) => execFileSync(process.execPath, [join(dirname(require.resolve(name)), 'bin.js'), ...args], { stdio: 'inherit' });

// The worker: our code bundled, its Bare modules (hyperdht and its addons) left for bare-pack.
const worker = (entry: string, out: string) =>
  build({
    entryPoints: [entry],
    outfile: out,
    bundle: true,
    platform: 'neutral',
    format: 'cjs',
    target: 'es2022',
    mainFields: ['module', 'main'],
    external: ['hyperdht', 'bare-*'],
  });

if (test) {
  await worker('worklet/test.ts', 'dist/worklet/test.cjs');
  console.log('test worker built');
  process.exit(0);
}

const version = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;
mkdirSync('dist/web', { recursive: true });
await Promise.all([
  worker('worklet/main.ts', 'dist/worklet/main.cjs'),
  build({
    entryPoints: ['src/main.ts'],
    outfile: 'dist/web/app.js',
    bundle: true,
    platform: 'browser',
    format: 'esm',
    target: ['chrome120', 'safari17'],
    jsx: 'automatic',
    minify: true,
    sourcemap: true,
    define: { 'process.env.NODE_ENV': '"production"', WEAVE_VERSION: JSON.stringify(version) },
    loader: { '.svg': 'text', '.png': 'dataurl' },
  }),
  build({
    entryPoints: ['../desktop/src/renderer/styles.css'],
    outfile: 'dist/web/styles.css',
    bundle: true,
    minify: true,
    loader: { '.woff': 'dataurl', '.woff2': 'dataurl' },
  }),
]);
copyFileSync('../desktop/src/renderer/index.html', 'dist/web/index.html');

if (web) {
  await worker('worklet/test.ts', 'dist/worklet/test.cjs');
  console.log('phone screens and test worker built');
  process.exit(0);
}

// bare-kit itself, for the native projects (downloaded once).
await fetchBareKit();

// Pack the worker per platform; its addons are linked into the native projects, not carried in the bundle.
// The bundle's base is the repository root: npm hoists the worker's modules to its node_modules, and
// from apps/mobile they would be packed as /../../node_modules/…, which the phone can't load.
for (const platform of ['android', 'ios']) {
  run('bare-pack', ['--preset', platform, '--linked', '--base', '../..', '--out', `dist/web/worklet.${platform}.bundle`, 'dist/worklet/main.cjs']);
  run('bare-link', ['--preset', platform, '--out', `plugin/${platform}/addons`, 'dist/worklet/main.cjs']);
}
console.log('mobile app built');
