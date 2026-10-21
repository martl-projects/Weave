// Packages the desktop app into installers for this platform (unsigned for
// now): an NSIS setup .exe on Windows, a .dmg on macOS, an AppImage on Linux.
//
//   npm run package                 installers in apps/desktop/release/
//   npm run package -- --dir        just the unpacked app, for a quick look
//
// Everything is bundled first, so the app carries no workspace packages:
//   pack/app      main, preload and renderer: what Electron loads
//   pack/daemon   the weave CLI as one file, plus the two native modules it
//                 needs (sodium-native, udx-native, prebuilt for every platform);
//                 the app runs it with Electron's own Node (see src/daemon.ts)

import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build as bundle } from 'esbuild';
import { build, type Configuration } from 'electron-builder';

const root = join(import.meta.dirname, '..', '..');
const pkg = (dir: string) => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { version: string };
const version = pkg(import.meta.dirname).version;
const NATIVE = ['sodium-native', 'udx-native'];
process.chdir(import.meta.dirname);

execFileSync(process.execPath, ['build.ts'], { cwd: import.meta.dirname, stdio: 'inherit' });

rmSync('pack', { recursive: true, force: true });
rmSync('release', { recursive: true, force: true });

// --- the app Electron loads
cpSync('dist', 'pack/app/dist', { recursive: true });
writeFileSync(
  'pack/app/package.json',
  JSON.stringify({ name: 'weave', productName: 'Weave', version, description: 'Build things together, peer to peer', license: 'MIT', author: 'Weave', main: 'dist/main.cjs' }, null, 2),
);

// --- the daemon: the CLI bundled into one file
mkdirSync('pack/daemon', { recursive: true });
await bundle({
  entryPoints: [join(root, 'packages', 'cli', 'src', 'main.ts')],
  outfile: 'pack/daemon/weave.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: NATIVE,
  define: { WEAVE_VERSION: JSON.stringify(version) },
  // Bundled CommonJS dependencies still call require().
  banner: { js: "import { createRequire as __weaveRequire } from 'node:module'; const require = __weaveRequire(import.meta.url);" },
});
const dependencies = Object.fromEntries(NATIVE.map((name) => [name, pkg(join(root, 'node_modules', name)).version]));
writeFileSync('pack/daemon/package.json', JSON.stringify({ name: 'weave-daemon', private: true, type: 'module', dependencies }, null, 2));
execFileSync('npm', ['install', '--omit=dev', '--no-package-lock', '--no-audit', '--no-fund', '--workspaces=false'], { cwd: 'pack/daemon', stdio: 'inherit', shell: true });
cpSync(join(root, 'weave.bundle.json'), 'pack/daemon/weave.bundle.json');

// --- the `weave` command: small scripts in resources/bin that run the bundled
// CLI with the app's own Node. The Windows installer puts that folder on the
// PATH (installer.nsh); on macOS the app's menu links /usr/local/bin/weave to it
// (src/command.ts).
function writeShims(bin: string, exe: string, windows: boolean): void {
  mkdirSync(bin, { recursive: true });
  const sh = [
    '#!/bin/sh',
    "# The weave command, run by the Weave app's own Node.",
    'self=$0',
    'while [ -L "$self" ]; do',
    '  link=$(readlink "$self")',
    '  case $link in /*) self=$link ;; *) self=$(dirname "$self")/$link ;; esac',
    'done',
    'bin=$(cd "$(dirname "$self")" && pwd)',
    `ELECTRON_RUN_AS_NODE=1 exec "$bin/${exe}" "$bin/../daemon/weave.mjs" "$@"`,
    '',
  ];
  writeFileSync(join(bin, 'weave'), sh.join('\n'), { mode: 0o755 });
  if (!windows) return;
  const cmd = [
    '@echo off',
    "rem The weave command, run by the Weave app's own Node.",
    'setlocal',
    'set ELECTRON_RUN_AS_NODE=1',
    `"%~dp0${exe.replaceAll('/', '\\')}" "%~dp0..\\daemon\\weave.mjs" %*`,
    'if %ERRORLEVEL% neq 0 exit /b %ERRORLEVEL%',
    'endlocal',
    '',
  ];
  writeFileSync(join(bin, 'weave.cmd'), cmd.join('\r\n'));
}

// --- installers
const config: Configuration = {
  appId: 'org.weave.desktop',
  productName: 'Weave',
  electronVersion: pkg(join(root, 'node_modules', 'electron')).version,
  directories: { app: 'pack/app', output: 'release' },
  // Copied by hand: extraResources would leave out the daemon's node_modules.
  afterPack: async ({ appOutDir, electronPlatformName, packager }) => {
    const mac = electronPlatformName === 'darwin';
    const resources = mac ? join(appOutDir, `${packager.appInfo.productFilename}.app`, 'Contents', 'Resources') : join(appOutDir, 'resources');
    cpSync('pack/daemon', join(resources, 'daemon'), { recursive: true });
    // The app's executable, seen from resources/bin.
    const exe = mac ? `../../MacOS/${packager.appInfo.productFilename}` : electronPlatformName === 'win32' ? `../../${packager.appInfo.productFilename}.exe` : `../../${(packager as unknown as { executableName: string }).executableName}`;
    writeShims(join(resources, 'bin'), exe, electronPlatformName === 'win32');
  },
  icon: 'assets/icon.png',
  artifactName: 'Weave-${version}-${os}-${arch}.${ext}',
  nativeModules: { npmRebuild: false },
  publish: null,
  win: { target: [{ target: 'nsis', arch: ['x64'] }] },
  // installer.nsh puts resources/bin (the weave command) on the user's PATH.
  nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true, include: 'installer.nsh' },
  mac: {
    target: [{ target: 'dmg', arch: ['arm64', 'x64'] }],
    category: 'public.app-category.social-networking',
    // Ad-hoc signed until there is an Apple Developer ID: Apple silicon refuses to run unsigned apps at all.
    sign: { identity: '-', hardenedRuntime: false },
  },
  linux: { target: [{ target: 'AppImage', arch: ['x64'] }], category: 'Network' },
  // weave:post:… links open the app at that post (see src/main.ts).
  protocols: [{ name: 'Weave link', schemes: ['weave'] }],
};
// We publish ourselves (the release workflow attaches the installers): electron-builder 27 wants that said
// explicitly, and on a CI tag it crashes without it.
await build({ config, publish: 'never', dir: process.argv.includes('--dir') });
console.log('installers in apps/desktop/release/');
