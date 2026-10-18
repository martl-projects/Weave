// Bundles the desktop app: main and preload for Electron (CommonJS), the
// renderer for the browser, plus its static files.

import { copyFileSync, mkdirSync } from 'node:fs';
import { build } from 'esbuild';

mkdirSync('dist/renderer', { recursive: true });

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
    define: { 'process.env.NODE_ENV': '"production"' },
    loader: { '.svg': 'text' },
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
console.log('desktop app built');
