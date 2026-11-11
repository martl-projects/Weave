// Whether the page's address serves what the release built (docs/web-stage2.md, step 10): every file in the hashes
// pages.ts wrote, fetched and compared. Any difference fails, and with it the workflow that runs this, which says so.
//
//   node apps/web/watch.ts apps/web/dist/pages-hashes.json [https://web.martl.io]
//
// It sees a changed page; it doesn't stop one, and a page changed for some people only passes it.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const [list, at = 'https://web.martl.io'] = process.argv.slice(2);
if (!list) throw new Error('say where the hashes are: node apps/web/watch.ts <pages-hashes.json> [address]');
const hashes = JSON.parse(readFileSync(list, 'utf8')) as Record<string, string>;

const wrong: string[] = [];
for (const [path, hash] of Object.entries(hashes)) {
  const res = await fetch(new URL(path, at), { cache: 'no-store', headers: { 'cache-control': 'no-cache' } });
  if (!res.ok) {
    wrong.push(`${path}: ${res.status}`);
    continue;
  }
  const served = createHash('sha256').update(Buffer.from(await res.arrayBuffer())).digest('hex');
  if (served !== hash) wrong.push(`${path}: serves ${served.slice(0, 16)}…, the release built ${hash.slice(0, 16)}…`);
}

if (wrong.length) {
  console.error(`${at} doesn't serve what the release built:\n${wrong.join('\n')}`);
  process.exit(1);
}
console.log(`${at} serves what the release built: ${Object.keys(hashes).length} files`);
