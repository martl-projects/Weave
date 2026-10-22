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
    // Icons (pixelarticons) as SVG text.
    // The app's SerenityOS bitmaps as data URLs.
    loader: { '.svg': 'text', '.png': 'dataurl' },
  }),
  // Styles, with the Inter font inlined.
  build({ entryPoints: [join(here, 'src/styles.css')], outfile: join(dist, 'styles.css'), bundle: true, minify: true, loader: { '.woff': 'dataurl', '.woff2': 'dataurl' } }),
]);
copyFileSync(join(here, 'src/index.html'), join(dist, 'index.html'));
copyFileSync(join(here, 'src/favicon.svg'), join(dist, 'favicon.svg'));
console.log('admin console built');
