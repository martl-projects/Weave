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
  }),
]);

for (const file of ['index.html', 'styles.css']) copyFileSync(`src/renderer/${file}`, `dist/renderer/${file}`);
console.log('desktop app built');
