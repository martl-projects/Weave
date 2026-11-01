// Bundles the desktop app: main and preload for Electron (CommonJS), the
// renderer for the browser, plus its static files.

import { copyFileSync, cpSync, mkdirSync, readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { pinnedRelease, pins } from '../../packages/shipped/pinned.ts';

mkdirSync('dist/renderer', { recursive: true });

/** The version of this release, shown in the app's About box. */
const version = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;

await Promise.all([
  build({
    entryPoints: ['src/main.ts'],
    outfile: 'dist/main.cjs',
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron'],
  }),
  build({
    entryPoints: ['src/preload.ts'],
    outfile: 'dist/preload.cjs',
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron'],
  }),
  build({
    entryPoints: ['src/renderer/main.tsx'],
    outfile: 'dist/renderer/app.js',
    bundle: true,
    platform: 'browser',
    format: 'esm',
    target: 'chrome130',
    jsx: 'automatic',
    minify: true,
    sourcemap: true,
    define: { 'process.env.NODE_ENV': '"production"', WEAVE_VERSION: JSON.stringify(version), AVATAR_RELEASE: JSON.stringify(pins().avatar?.sha256.slice(0, 16) ?? 'dev') },
    loader: { '.svg': 'text', '.png': 'dataurl' },
  }),
  // Styles, with 98.css and its pixel font inlined.
  build({
    entryPoints: ['src/renderer/styles.css'],
    outfile: 'dist/renderer/styles.css',
    bundle: true,
    minify: true,
    loader: { '.woff': 'dataurl', '.woff2': 'dataurl' },
  }),
]);

copyFileSync('src/renderer/index.html', 'dist/renderer/index.html');
// Weave avatar's renderer (its own repository, pinned): one module and its files, loaded when an avatar is drawn.
cpSync(await pinnedRelease('avatar'), 'dist/renderer/avatar3d', { recursive: true });
// The tray icon (see src/main.ts).
copyFileSync('assets/icon.png', 'dist/icon.png');
console.log('desktop app built');
