// Bundles the admin console: a web app the company's node serves (packages/node/src/console.ts).

import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { build } from 'esbuild';

const here = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const dist = join(here, 'dist');
mkdirSync(dist, { recursive: true });

await Promise.all([
  build({
    entryPoints: [join(here, 'src/main.tsx')],
    outfile: join(dist, 'app.js'),
    bundle: true,
    platform: 'browser',
    format: 'esm',
    target: 'chrome120',
    jsx: 'automatic',
    minify: true,
    sourcemap: true,
    define: { 'process.env.NODE_ENV': '"production"' },
  }),
  build({ entryPoints: [join(here, 'src/styles.css')], outfile: join(dist, 'styles.css'), bundle: true, minify: true }),
]);
copyFileSync(join(here, 'src/index.html'), join(dist, 'index.html'));
console.log('admin console built');
