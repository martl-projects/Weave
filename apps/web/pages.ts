// Weave Web as static files for Cloudflare Pages (docs/web-stage2.md, step 10): the page from elsewhere than its storage
// node, so a storage node taken over can't change the code browsers run.
//
//   node apps/web/pages.ts [https://storage.martl.io]
//
// Writes apps/web/dist/pages/ (what's uploaded, with Pages' _headers) and apps/web/dist/pages-hashes.json: the SHA-256
// of every file it serves, which the watcher (watch.ts) compares with what the page's address serves.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { buildServices, buildWeb, connectSrc } from './build.ts';

const storage = new URL(process.argv[2] ?? 'https://storage.martl.io').origin;
const dist = join(import.meta.dirname, 'dist');
const out = join(dist, 'pages');

rmSync(out, { recursive: true, force: true });
await buildWeb(out, { minify: true, avatars: true, storage });
const services = await buildServices(out);
if (services.length < 2) throw new Error(`only ${services.join(', ') || 'no services'} in the page: build packages/shipped first`);

// Headers for every file. The CSP is said here too, not only in the page's <meta>: a Worker takes its CSP from its own
// response. Caching is left to Pages, which has each file asked again (an unchanged one is a 304).
const csp = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src ${connectSrc(storage)}`,
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');
writeFileSync(
  join(out, '_headers'),
  [
    '/*',
    '  Strict-Transport-Security: max-age=31536000; includeSubDomains',
    `  Content-Security-Policy: ${csp}`,
    '  X-Content-Type-Options: nosniff',
    // An invitation or a link's secret is in the address when someone arrives.
    '  Referrer-Policy: no-referrer',
    // By invitation for now: not for search engines.
    '  X-Robots-Tag: noindex, nofollow',
    '',
  ].join('\n'),
);

const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? files(join(dir, name)) : [join(dir, name)]));
const hashes: Record<string, string> = {};
for (const file of files(out)) {
  const path = `/${relative(out, file).split(sep).join('/')}`;
  if (path === '/_headers' || path.endsWith('/.component')) continue;
  hashes[path === '/index.html' ? '/' : path] = createHash('sha256').update(readFileSync(file)).digest('hex');
}
writeFileSync(join(dist, 'pages-hashes.json'), `${JSON.stringify(hashes, null, 2)}\n`);
console.log(`${Object.keys(hashes).length} files for ${storage}, in ${out}`);
