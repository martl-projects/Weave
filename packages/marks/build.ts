// Builds Weave's own mark services into dist/: each folder here with a weave.app.json and src/service.js is bundled
// (esbuild: what it imports of Weave's core goes in with it) and built into a component of the marks world.
// They don't ship inside the app: each is released in a project of its own, and the app's bundle (weave.bundle.json,
// "marks") takes it into newcomers' own domain once Weave's tier brought them into that project.
//
//   node packages/marks/build.ts
//   weave app release <project> --asset wasm=packages/marks/dist/<component>   (with its weave.app.json)

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { componentize } from '@bytecodealliance/componentize-js';
import { checkManifest } from '@weave/core';
import { build } from 'esbuild';

const here = import.meta.dirname;
const dist = join(here, 'dist');
const wit = readFileSync(join(here, '..', 'sdk', 'wit', 'service.wit'), 'utf8');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

for (const name of readdirSync(here).filter((d) => existsSync(join(here, d, 'weave.app.json')))) {
  const { manifest, problems } = checkManifest(JSON.parse(readFileSync(join(here, name, 'weave.app.json'), 'utf8')));
  if (!manifest?.marks) throw new Error(`${name}/weave.app.json: ${problems.join('; ') || 'a mark service has "marks"'}`);
  const bundled = join(dist, `${name}.js`);
  await bundleService(join(here, name, 'src', 'service.js'), bundled);
  const { component } = await componentize({ sourcePath: bundled, witWorld: wit, worldName: 'marks', disableFeatures: ['all'] } as unknown as Parameters<typeof componentize>[0]);
  writeFileSync(join(dist, manifest.marks.component), component);
  console.log(`${name}: ${manifest.marks.component} sha256:${createHash('sha256').update(component).digest('hex')}`);
}

/** A service's source with what it imports in one file, as componentize-js takes it. */
async function bundleService(source: string, out: string): Promise<void> {
  await build({ entryPoints: [source], outfile: out, bundle: true, format: 'esm', platform: 'neutral', target: 'es2022', mainFields: ['module', 'main'], logLevel: 'warning' });
}
