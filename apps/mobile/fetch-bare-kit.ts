// Fetches bare-kit (the Bare runtime for apps) into the WeaveWorker plugin,
// once per version: plugin/android/libs/bare-kit (classes.jar and the .so
// files) and plugin/ios/BareKit.xcframework. The release archive holds every
// platform and is large (about 400 MB); it's kept in plugin/.cache.
//
//   node fetch-bare-kit.ts

import { execFileSync } from 'node:child_process';
import { cpSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const BARE_KIT = 'v2.5.4';
const URL = `https://github.com/holepunchto/bare-kit/releases/download/${BARE_KIT}/prebuilds.zip`;
const plugin = join(import.meta.dirname, 'plugin');
const stamp = join(plugin, '.cache', `bare-kit-${BARE_KIT}.installed`);

export async function fetchBareKit(): Promise<void> {
  if (existsSync(stamp)) return;
  const zip = join(plugin, '.cache', `bare-kit-${BARE_KIT}.zip`);
  mkdirSync(join(plugin, '.cache'), { recursive: true });
  if (!existsSync(zip)) {
    console.log(`downloading bare-kit ${BARE_KIT} (about 400 MB)…`);
    const res = await fetch(URL);
    if (!res.ok) throw new Error(`couldn't download bare-kit: ${res.status} ${URL}`);
    await pipeline(Readable.fromWeb(res.body as import('node:stream/web').ReadableStream), createWriteStream(`${zip}.part`));
    renameSync(`${zip}.part`, zip);
  }
  // Windows and macOS have bsdtar, which reads zip files (on Windows its own, not Git's GNU tar); Linux has unzip.
  const out = mkdtempSync(join(plugin, '.cache', 'unpack-'));
  if (process.platform === 'linux') execFileSync('unzip', ['-q', zip, '-d', out], { stdio: 'inherit' });
  else execFileSync(process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar', ['-xf', zip, '-C', out], { stdio: 'inherit' });

  const android = join(plugin, 'android', 'libs', 'bare-kit');
  const ios = join(plugin, 'ios', 'BareKit.xcframework');
  rmSync(android, { recursive: true, force: true });
  rmSync(ios, { recursive: true, force: true });
  cpSync(join(out, 'android', 'bare-kit'), android, { recursive: true });
  cpSync(join(out, 'ios', 'BareKit.xcframework'), ios, { recursive: true });
  rmSync(out, { recursive: true, force: true });
  // The frameworks come without a module map, which Swift needs to `import BareKit`.
  for (const slice of readdirSync(ios, { withFileTypes: true })) {
    const framework = join(ios, slice.name, 'BareKit.framework');
    if (!slice.isDirectory() || !existsSync(framework)) continue;
    mkdirSync(join(framework, 'Modules'), { recursive: true });
    writeFileSync(join(framework, 'Modules', 'module.modulemap'), 'framework module BareKit {\n  umbrella header "BareKit.h"\n  export *\n}\n');
  }
  writeFileSync(stamp, `${BARE_KIT}\n`);
  console.log(`bare-kit ${BARE_KIT} is in the plugin`);
}

if (import.meta.filename === process.argv[1]) await fetchBareKit();
