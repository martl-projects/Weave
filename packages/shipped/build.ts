// Builds the services Weave ships into dist/: each folder here with a weave.app.json and src/service.js becomes its
// component (manifest's wasm.component, or marks.component / hints.component for a mark or hint service, bundled with what it imports of Weave's
// core); each one pinned.json pins comes as its repository's release, as it is (pinned.ts). dist/shipped.json lists
// each one's digest and manifest. The packaged
// daemon has the digests built in (apps/desktop/package.ts), so a component changed next to it doesn't start.
//
//   node packages/shipped/build.ts

import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { componentize } from '@bytecodealliance/componentize-js';
import { checkManifest, parsePack } from '@weave/core';
import { build } from 'esbuild';
import { pinnedRelease, pins } from './pinned.ts';

const here = import.meta.dirname;
const dist = join(here, 'dist');
const wit = readFileSync(join(here, '..', 'sdk', 'wit', 'service.wit'), 'utf8');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const shipped: Record<string, { component: string; digest: string; manifest: unknown; about?: string; site?: string; panel?: string }> = {};
for (const name of readdirSync(here).filter((d) => existsSync(join(here, d, 'weave.app.json')))) {
  const raw = JSON.parse(readFileSync(join(here, name, 'weave.app.json'), 'utf8')) as unknown;
  const { manifest, problems } = checkManifest(raw);
  if (!manifest?.wasm && !manifest?.marks && !manifest?.hints) throw new Error(`${name}/weave.app.json: ${problems.join('; ') || 'a shipped service is a WebAssembly component (wasm, marks or hints)'}`);
  // A mark or hint service: pure (nothing reaches out, no clock), its imports bundled in.
  const pure = manifest.marks ?? manifest.hints;
  if (pure) {
    const bundled = join(dist, `${name}.js`);
    await build({ entryPoints: [join(here, name, 'src', 'service.js')], outfile: bundled, bundle: true, format: 'esm', platform: 'neutral', target: 'es2022', mainFields: ['module', 'main'], logLevel: 'warning' });
    const { component } = await componentize({ sourcePath: bundled, witWorld: wit, worldName: 'marks', disableFeatures: ['all'] } as unknown as Parameters<typeof componentize>[0]);
    rmSync(bundled);
    writeFileSync(join(dist, pure.component), component);
    const about = manifest.about ?? readmeAbout(join(here, name));
    shipped[name] = { component: pure.component, digest: `sha256:${createHash('sha256').update(component).digest('hex')}`, manifest: raw, ...(about ? { about } : {}) };
    console.log(`${name}: ${shipped[name].digest}`);
    continue;
  }
  if (!manifest.wasm) continue;
  // A fetcher's world, or its website's when it has a site; it reaches out (wasi:http) only when its contract names hosts.
  const { component } = await componentize({
    sourcePath: join(here, name, 'src', 'service.js'),
    witWorld: wit,
    worldName: manifest.fetcher ? 'fetcher' : manifest.verifier ? 'verifier' : manifest.keyvault ? 'keyvault' : manifest.wasm.site ? 'website' : 'service',
    disableFeatures: (manifest.service?.net ?? manifest.fetcher?.net ?? manifest.verifier?.net ?? manifest.keyvault?.net)?.length ? ['fetch-event'] : ['http', 'fetch-event'],
  } as Parameters<typeof componentize>[0]);
  writeFileSync(join(dist, manifest.wasm.component), component);
  if (manifest.wasm.site) cpSync(join(here, name, manifest.wasm.site), join(dist, `${name}-site`), { recursive: true });
  if (manifest.wasm.panel) cpSync(join(here, name, manifest.wasm.panel), join(dist, `${name}-panel`), { recursive: true });
  const about = manifest.about ?? readmeAbout(join(here, name));
  shipped[name] = { component: manifest.wasm.component, digest: `sha256:${createHash('sha256').update(component).digest('hex')}`, manifest: raw, ...(about ? { about } : {}), ...(manifest.wasm.site ? { site: `${name}-site` } : {}), ...(manifest.wasm.panel ? { panel: `${name}-panel` } : {}) };
  console.log(`${name}: ${shipped[name].digest}`);
}
// From repositories of their own: the component their release holds, not built here.
for (const [name, pin] of Object.entries(pins())) {
  if (pin.library) continue;
  if (shipped[name]) throw new Error(`${name} is both a folder here and pinned: one source only`);
  const dir = await pinnedRelease(name);
  const raw = JSON.parse(readFileSync(join(dir, 'weave.app.json'), 'utf8')) as unknown;
  const { manifest, problems } = checkManifest(raw);
  // A mark or hint service's component, or a service's, fetcher's, verifier's or keyvault's (wasm: no site or panel yet).
  const file = (manifest?.marks ?? manifest?.hints ?? manifest?.wasm)?.component;
  if (!manifest || !file) throw new Error(`${pin.repo} ${pin.tag}: ${problems.join('; ') || 'a shipped service is a WebAssembly component (wasm, marks or hints)'}`);
  if (manifest.wasm?.site || manifest.wasm?.panel) throw new Error(`${pin.repo} ${pin.tag}: a site or panel doesn't come pinned yet`);
  const component = readFileSync(join(dir, file));
  writeFileSync(join(dist, file), component);
  const about = manifest.about ?? readmeAbout(dir);
  shipped[name] = { component: file, digest: `sha256:${createHash('sha256').update(component).digest('hex')}`, manifest: raw, ...(about ? { about } : {}) };
  console.log(`${name}: ${shipped[name].digest} (${pin.repo} ${pin.tag})`);
}
writeFileSync(join(dist, 'shipped.json'), `${JSON.stringify(shipped, null, 2)}\n`);
// Its setup packs (packs/*.json): checked, and each step naming something this Weave ships.
const packs = existsSync(join(here, 'packs')) ? readdirSync(join(here, 'packs')).filter((f) => f.endsWith('.json')).sort() : [];
const checked = packs.map((f) => {
  const raw = JSON.parse(readFileSync(join(here, 'packs', f), 'utf8')) as unknown;
  const { pack, problem } = parsePack(raw);
  if (!pack) throw new Error(`packs/${f}: ${problem}`);
  for (const step of pack.steps) {
    const named = 'service' in step ? step.service : step.keyvault;
    if (!shipped[named]) throw new Error(`packs/${f}: ${step.kind} ${named} isn't one this Weave ships`);
  }
  // As written (Weave checks it again when it reads it).
  return raw;
});
writeFileSync(join(dist, 'packs.json'), `${JSON.stringify(checked, null, 2)}\n`);
console.log(`${Object.keys(shipped).length} shipped service(s) in packages/shipped/dist`);

/** What it's for, in the app: its README's first paragraph (in its folder). */
function readmeAbout(dir: string): string | undefined {
  const readme = existsSync(join(dir, 'README.md')) ? readFileSync(join(dir, 'README.md'), 'utf8') : '';
  return readme.split(/\r?\n\r?\n/).map((p) => p.trim()).find((p) => p && !p.startsWith('#'))?.replace(/\s+/g, ' ').slice(0, 400);
}
