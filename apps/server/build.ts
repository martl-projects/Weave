// Builds Weave Server into dist/: one bundled program (weave-server.mjs), the
// admin console's files next to it, and a package.json naming the two native
// modules it needs, so `npm install --omit=dev` in dist/ makes it runnable
// anywhere Node 24 runs. The Dockerfile and the release use this.

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { build } from 'esbuild';

const here = import.meta.dirname;
const root = join(here, '..', '..');
const dist = join(here, 'dist');
const NATIVE = ['sodium-native', 'udx-native'];
const pkg = (dir: string) => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { version: string };
const version = pkg(here).version;

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

await build({
  entryPoints: [join(here, 'src', 'server.ts')],
  outfile: join(dist, 'weave-server.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: NATIVE,
  define: { WEAVE_VERSION: JSON.stringify(version) },
  // Bundled CommonJS dependencies still call require().
  banner: { js: "#!/usr/bin/env node\nimport { createRequire as __weaveRequire } from 'node:module'; const require = __weaveRequire(import.meta.url);" },
});

// The admin console it serves (packages/node/src/console.ts looks for it next to the program).
execFileSync(process.execPath, [join(root, 'apps', 'console', 'build.ts')], { stdio: 'inherit' });
cpSync(join(root, 'apps', 'console', 'dist'), join(dist, 'console'), { recursive: true });

const dependencies = Object.fromEntries(NATIVE.map((name) => [name, pkg(join(root, 'node_modules', name)).version]));
writeFileSync(
  join(dist, 'package.json'),
  JSON.stringify({ name: 'weave-server', version, private: true, type: 'module', bin: { 'weave-server': 'weave-server.mjs' }, engines: { node: '>=24' }, dependencies }, null, 2),
);
cpSync(join(here, 'weave-server.service'), join(dist, 'weave-server.service'));
console.log(`weave-server ${version} built in apps/server/dist (npm install --omit=dev there, then node weave-server.mjs)`);
