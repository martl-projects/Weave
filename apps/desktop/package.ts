// Packages the desktop app into installers for this platform: an NSIS setup
// .exe and an MSI (per machine, for IT) on Windows, a .dmg and a .pkg on macOS,
// an AppImage on Linux.
//
//   npm run package                 installers in apps/desktop/release/
//   npm run package -- --dir        just the unpacked app, for a quick look
//   npm run package -- --store      only the .appx for the Microsoft Store: unsigned (the Store
//                                   signs it), with the identity from Partner Center in
//                                   WEAVE_STORE_IDENTITY, WEAVE_STORE_PUBLISHER (CN=…) and
//                                   WEAVE_STORE_PUBLISHER_NAME
//
// Signed when the credentials are in the environment (the Installers workflow
// passes them from the repository's secrets), unsigned or ad-hoc otherwise:
//   Windows   Azure Trusted Signing: AZURE_TENANT_ID, AZURE_CLIENT_ID and
//             AZURE_CLIENT_SECRET (an Entra app with the "Trusted Signing
//             Certificate Profile Signer" role), plus AZURE_SIGN_ENDPOINT,
//             AZURE_SIGN_ACCOUNT, AZURE_SIGN_PROFILE and AZURE_SIGN_PUBLISHER
//             (the publisher exactly as in the certificate profile)
//   macOS     Developer ID: CSC_LINK and CSC_KEY_PASSWORD (the "Developer ID
//             Application" certificate as a base64 .p12), CSC_INSTALLER_LINK and
//             CSC_INSTALLER_KEY_PASSWORD ("Developer ID Installer", for the .pkg),
//             and for notarization APPLE_API_KEY (path to the .p8),
//             APPLE_API_KEY_ID and APPLE_API_ISSUER
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
import { Arch, build, type Configuration } from 'electron-builder';

const root = join(import.meta.dirname, '..', '..');
const pkg = (dir: string) => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { version: string };
const version = pkg(import.meta.dirname).version;
const NATIVE = ['sodium-native', 'udx-native'];
// Installed next to the daemon too: what runs WebAssembly services (preview2-shim starts a worker of its own from its files).
const BESIDE = ['@bytecodealliance/jco-transpile', '@bytecodealliance/preview2-shim'];
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

// --- the services Weave ships: built, then next to the daemon, their digests built into it (packages/shipped)
execFileSync(process.execPath, [join(root, 'packages', 'shipped', 'build.ts')], { stdio: 'inherit' });
const shipped = JSON.parse(readFileSync(join(root, 'packages', 'shipped', 'dist', 'shipped.json'), 'utf8')) as Record<string, { digest: string }>;

// --- the daemon: the CLI bundled into one file
mkdirSync('pack/daemon', { recursive: true });
cpSync(join(root, 'packages', 'shipped', 'dist'), 'pack/daemon/shipped', { recursive: true });
await bundle({
  entryPoints: [join(root, 'packages', 'cli', 'src', 'main.ts')],
  outfile: 'pack/daemon/weave.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: [...NATIVE, ...BESIDE],
  define: { WEAVE_VERSION: JSON.stringify(version), WEAVE_SHIPPED: JSON.stringify(Object.fromEntries(Object.entries(shipped).map(([name, s]) => [name, s.digest]))) },
  // Bundled CommonJS dependencies still call require().
  banner: { js: "import { createRequire as __weaveRequire } from 'node:module'; const require = __weaveRequire(import.meta.url);" },
});
// The worker a WebAssembly service runs in (runtime.ts finds it next to the daemon).
await bundle({
  entryPoints: [join(root, 'packages', 'node', 'src', 'wasmworker.ts')],
  outfile: 'pack/daemon/wasmworker.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: BESIDE,
});
const dependencies = Object.fromEntries([...NATIVE, ...BESIDE].map((name) => [name, pkg(join(root, 'node_modules', name)).version]));
writeFileSync('pack/daemon/package.json', JSON.stringify({ name: 'weave-daemon', private: true, type: 'module', dependencies }, null, 2));
// No bin links: cpSync below would turn them into absolute paths out of the app, which codesign refuses.
execFileSync('npm', ['install', '--omit=dev', '--no-package-lock', '--no-audit', '--no-fund', '--workspaces=false', '--no-bin-links'], { cwd: 'pack/daemon', stdio: 'inherit', shell: true });
cpSync(join(root, 'weave.bundle.json'), 'pack/daemon/weave.bundle.json');
// The starters for WebAssembly services, and their WIT (weave service new finds them next to the daemon).
cpSync(join(root, 'packages', 'sdk', 'starters'), 'pack/daemon/starters', { recursive: true });
cpSync(join(root, 'packages', 'sdk', 'wit'), 'pack/daemon/wit', { recursive: true });
// The admin console a company's node serves (packages/node/src/console.ts looks for it next to the daemon).
execFileSync(process.execPath, [join(root, 'apps', 'console', 'build.ts')], { stdio: 'inherit' });
cpSync(join(root, 'apps', 'console', 'dist'), 'pack/daemon/console', { recursive: true });

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

// --- signing
const env = process.env;
// The workflow sets these from secrets that may not exist, as empty strings: electron-builder would
// take an empty CSC_LINK for a certificate path (the current folder) and fail.
for (const name of ['CSC_LINK', 'CSC_KEY_PASSWORD', 'CSC_INSTALLER_LINK', 'CSC_INSTALLER_KEY_PASSWORD', 'APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER'])
  if (!env[name]) delete env[name];
const azure = env.AZURE_SIGN_ACCOUNT
  ? {
      type: 'azure' as const,
      endpoint: env.AZURE_SIGN_ENDPOINT!,
      codeSigningAccountName: env.AZURE_SIGN_ACCOUNT,
      certificateProfileName: env.AZURE_SIGN_PROFILE!,
      publisherName: env.AZURE_SIGN_PUBLISHER!,
    }
  : null;
const developerId = Boolean(env.CSC_LINK);
if (process.platform === 'win32' && !azure) console.log('no AZURE_SIGN_ACCOUNT: the Windows installers stay unsigned');
if (process.platform === 'darwin' && !developerId) console.log('no CSC_LINK: the Mac app is only ad-hoc signed and not notarized');

// --- installers
const store = process.argv.includes('--store');
const config: Configuration = {
  appId: 'org.weave.desktop',
  productName: 'Weave',
  electronVersion: pkg(join(root, 'node_modules', 'electron')).version,
  directories: { app: 'pack/app', output: 'release' },
  // Copied by hand: extraResources would leave out the daemon's node_modules.
  afterPack: async ({ appOutDir, electronPlatformName, packager, arch }) => {
    const mac = electronPlatformName === 'darwin';
    const resources = mac ? join(appOutDir, `${packager.appInfo.productFilename}.app`, 'Contents', 'Resources') : join(appOutDir, 'resources');
    cpSync('pack/daemon', join(resources, 'daemon'), { recursive: true });
    // The Secure Enclave helper (stage 17): keeps the home key's key inside the Mac's Secure Enclave, if the person chooses it.
    if (mac) execFileSync('swiftc', ['-O', '-target', `${arch === Arch.arm64 ? 'arm64' : 'x86_64'}-apple-macos11`, 'native/weave-se.swift', '-o', join(resources, 'weave-se')], { stdio: 'inherit' });
    // The app's executable, seen from resources/bin.
    const exe = mac ? `../../MacOS/${packager.appInfo.productFilename}` : electronPlatformName === 'win32' ? `../../${packager.appInfo.productFilename}.exe` : `../../${(packager as unknown as { executableName: string }).executableName}`;
    writeShims(join(resources, 'bin'), exe, electronPlatformName === 'win32');
    // For the updater (src/update.ts): whether this build is signed, and by whom. A signed build takes only an update
    // by the same publisher; an unsigned Mac app doesn't update itself at all (Squirrel.Mac refuses it).
    const signed = mac ? developerId : electronPlatformName === 'win32' ? !!azure : false;
    writeFileSync(join(resources, 'update.json'), JSON.stringify({ signed, ...(azure && electronPlatformName === 'win32' ? { publisher: azure.publisherName } : {}) }));
  },
  icon: 'assets/icon.png',
  artifactName: 'Weave-${version}-${os}-${arch}.${ext}',
  nativeModules: { npmRebuild: false },
  publish: null,
  // nsis: per person, with the weave command on PATH. msi: per machine, for IT to push silently (msiexec /i … /qn).
  win: { target: store ? [{ target: 'appx', arch: ['x64'] }] : [{ target: 'nsis', arch: ['x64'] }, { target: 'msi', arch: ['x64'] }], sign: store ? null : azure },
  // The Microsoft Store's package. Tiles from build/appx. The Store updates it (src/updatestate.ts); no weave command on the PATH.
  appx: { applicationId: 'Weave', displayName: 'Weave', identityName: env.WEAVE_STORE_IDENTITY, publisher: env.WEAVE_STORE_PUBLISHER, publisherDisplayName: env.WEAVE_STORE_PUBLISHER_NAME, languages: ['en-US', 'de-DE'], backgroundColor: 'transparent' },
  msi: { perMachine: true, oneClick: true, runAfterFinish: false },
  // installer.nsh puts resources/bin (the weave command) on the user's PATH.
  nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true, include: 'installer.nsh' },
  mac: {
    // dmg for people; pkg for device management (installer -pkg …, Jamf, Intune); zip for the updater (Squirrel.Mac
    // takes the app as a zip, once the app is signed). For installers they're built one architecture at a time
    // (below): two pkg builds at once share a temporary org.weave.desktop.pkg in release/, and two hdiutil runs at
    // once fail with "Resource busy".
    target: [
      { target: 'dmg', arch: ['arm64', 'x64'] },
      { target: 'pkg', arch: ['arm64', 'x64'] },
      { target: 'zip', arch: ['arm64', 'x64'] },
    ],
    category: 'public.app-category.social-networking',
    // With a Developer ID: signed with the hardened runtime (electron-builder's entitlements: just the JIT,
    // the native modules and weave-se are signed with the same identity) and notarized. Without one, ad-hoc:
    // Apple silicon refuses to run unsigned apps at all.
    sign: developerId ? { hardenedRuntime: true } : { identity: '-', hardenedRuntime: false },
    notarize: developerId,
  },
  pkg: { installLocation: '/Applications', isRelocatable: false },
  linux: { target: [{ target: 'AppImage', arch: ['x64'] }], category: 'Network' },
  // weave:post:… links open the app at that post (see src/main.ts).
  protocols: [{ name: 'Weave link', schemes: ['weave'] }],
};
// We publish ourselves (the release workflow attaches the installers): electron-builder 27 wants that said
// explicitly, and on a CI tag it crashes without it.
const dir = process.argv.includes('--dir');
if (process.platform === 'darwin' && !dir) {
  for (const arch of ['arm64', 'x64'] as const)
    await build({ config: { ...config, mac: { ...config.mac, target: [{ target: 'dmg', arch: [arch] }, { target: 'pkg', arch: [arch] }, { target: 'zip', arch: [arch] }] } }, publish: 'never' });
} else await build({ config, publish: 'never', dir });
console.log('installers in apps/desktop/release/');
