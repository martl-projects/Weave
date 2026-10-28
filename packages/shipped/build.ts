// Builds the services Weave ships into dist/: each folder here with a weave.app.json and src/service.js becomes its
// component (manifest's wasm.component), and dist/shipped.json lists each one's digest and manifest. The packaged
// daemon has the digests built in (apps/desktop/package.ts), so a component changed next to it doesn't start.
//
//   node packages/shipped/build.ts

import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { componentize } from '@bytecodealliance/componentize-js';
import { checkManifest } from '@weave/core';

const here = import.meta.dirname;
const dist = join(here, 'dist');
const wit = readFileSync(join(here, '..', 'sdk', 'wit', 'service.wit'), 'utf8');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const shipped: Record<string, { component: string; digest: string; manifest: unknown; site?: string }> = {};
for (const name of readdirSync(here).filter((d) => existsSync(join(here, d, 'weave.app.json')))) {
  const raw = JSON.parse(readFileSync(join(here, name, 'weave.app.json'), 'utf8')) as unknown;
  const { manifest, problems } = checkManifest(raw);
  if (!manifest?.wasm) throw new Error(`${name}/weave.app.json: ${problems.join('; ') || 'a shipped service is a WebAssembly component (wasm)'}`);
  // Its website's world when it has a site; it reaches out (wasi:http) only when its contract names hosts.
  const { component } = await componentize({
    sourcePath: join(here, name, 'src', 'service.js'),
    witWorld: wit,
    worldName: manifest.wasm.site ? 'website' : 'service',
    disableFeatures: manifest.service?.net?.length ? ['fetch-event'] : ['http', 'fetch-event'],
  } as Parameters<typeof componentize>[0]);
  writeFileSync(join(dist, manifest.wasm.component), component);
  if (manifest.wasm.site) cpSync(join(here, name, manifest.wasm.site), join(dist, `${name}-site`), { recursive: true });
  shipped[name] = { component: manifest.wasm.component, digest: `sha256:${createHash('sha256').update(component).digest('hex')}`, manifest: raw, ...(manifest.wasm.site ? { site: `${name}-site` } : {}) };
  console.log(`${name}: ${shipped[name].digest}`);
}
writeFileSync(join(dist, 'shipped.json'), `${JSON.stringify(shipped, null, 2)}\n`);
console.log(`${Object.keys(shipped).length} shipped service(s) in packages/shipped/dist`);
