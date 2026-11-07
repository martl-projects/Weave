// A release of a storage node: the program, the page, what sets them up, in one file.
//
//   node apps/server/deploy/pack.ts
//
// Writes apps/server/dist/weave-storage-<version>.tar.gz. See docs/web-deploy.md.

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildServices, buildWeb } from '../../web/build.ts';

const here = import.meta.dirname;
const server = join(here, '..');
const dist = join(server, 'dist');
const root = join(server, '..', '..');
const version = (JSON.parse(readFileSync(join(server, 'package.json'), 'utf8')) as { version: string }).version;
const name = `weave-storage-${version}`;
const out = join(dist, name);

execFileSync(process.execPath, [join(server, 'build.ts')], { stdio: 'inherit' });

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
copyFileSync(join(dist, 'weave-storage.mjs'), join(out, 'weave-storage.mjs'));
for (const file of ['setup.sh', 'weave-storage.service', 'Caddyfile']) copyFileSync(join(here, file), join(out, file));

const nativeVersion = (module: string) => (JSON.parse(readFileSync(join(root, 'node_modules', module, 'package.json'), 'utf8')) as { version: string }).version;
const dependencies = Object.fromEntries(['sodium-native', 'udx-native'].map((module) => [module, nativeVersion(module)]));
writeFileSync(join(out, 'package.json'), JSON.stringify({ name: 'weave-storage', version, private: true, type: 'module', dependencies }, null, 2));

await buildWeb(join(out, 'web'), { minify: true, avatars: true });
const services = await buildServices(join(out, 'web'));
if (services.length < 2) throw new Error(`only ${services.join(', ') || 'no services'} in the release: build packages/shipped first`);

execFileSync('tar', ['-czf', `${name}.tar.gz`, name], { cwd: dist, stdio: 'inherit' });
console.log(`apps/server/dist/${name}.tar.gz`);
