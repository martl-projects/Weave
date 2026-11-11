import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { build, type Plugin } from 'esbuild';
import { pinnedRelease, pins } from '../../packages/shipped/pinned.ts';

/*
 * The real node, in a Worker. WeaveNode runs as it is: what it asks of its host is answered by src/host/, here, at the
 * edges where it meets a computer: node:fs, node:path, node:os and node:crypto, its store and lock, and @weave/net.
 * Everything else a computer has (processes, sockets, the DHT) isn't there, and says so when called.
 * What a page may ask of the node is WEB_METHODS (src/methods.ts).
 */

const require = createRequire(import.meta.url);
const DESKTOP = join(import.meta.dirname, '..', 'desktop');
const version = (JSON.parse(readFileSync(join(DESKTOP, 'package.json'), 'utf8')) as { version: string }).version;
const host = (file: string) => join(import.meta.dirname, 'src', 'host', file);

const HOST: Record<string, string> = { fs: 'fs.ts', path: 'path.ts', os: 'os.ts', crypto: 'crypto.ts', url: 'url.ts' };
/** What the node builds as it loads, before anything is called. */
const AT_LOAD: Record<string, string> = { 'net.BlockList': 'class { addSubnet() {} addAddress() {} check() { return false; } }' };
const BARE = /^(sodium-native|sodium-universal|hyperswarm|hyperdht|oxc-minify|udx-native|@bytecodealliance\/.*|bare-.*)$/;
const SWAPPED: Record<string, string> = { './sqlitestore.ts': 'sqlitestore.ts', './lock.ts': 'lock.ts', './runtime.ts': 'runtime.ts' };
/** The services a page runs: those that only fold and answer. */
const SERVICES = ['unread', 'spotlight'];
/**
 * The verifiers a page runs. They ask their platform over HTTPS and wait for the answer, which a browser gives only to a
 * component suspended by JSPI: they're transpiled with it, and a browser without it can't check accounts yet.
 */
const VERIFIERS = ['github-verify'];
const SHIPPED = join(import.meta.dirname, '..', '..', 'packages', 'shipped', 'dist');

const webHost: Plugin = {
  name: 'weave-web-host',
  setup(b) {
    b.onResolve({ filter: /^node:|^(fs|path|os|crypto|net|tls|http|https|stream|events|util|url|dgram|dns|child_process|worker_threads|module|zlib|readline|tty)$/ }, ({ path }) => {
      const name = path.replace(/^node:/, '');
      return HOST[name] ? { path: host(HOST[name]) } : { path: name, namespace: 'not-here' };
    });
    // A module a browser hasn't: its names, each saying so when called.
    b.onLoad({ filter: /.*/, namespace: 'not-here' }, ({ path }) => ({
      contents: [
        'const nothing = (name) => () => { throw new Error(name + " is not there in a browser"); };',
        ...Object.keys(require(`node:${path}`))
          .filter((key) => /^[A-Za-z_]\w*$/.test(key) && key !== 'default')
          .map((key) => `export const ${key} = ${AT_LOAD[`${path}.${key}`] ?? `nothing('${path}.${key}')`};`),
        'export default {};',
      ].join('\n'),
      loader: 'js',
    }));
    b.onResolve({ filter: BARE }, () => ({ path: host('none.cjs') }));
    b.onResolve({ filter: /^@weave\/net$/ }, () => ({ path: host('net.ts') }));
    b.onResolve({ filter: /^\.\/(sqlitestore|lock|runtime)\.ts$/ }, ({ path, importer }) => (/[\\/]packages[\\/]node[\\/]src[\\/]/.test(importer) ? { path: host(SWAPPED[path]) } : undefined));
  },
};

/**
 * `storage`: the storage node the page uses, when it isn't the page's own origin (https://storage.martl.io, while the
 * page comes from elsewhere: docs/web-stage2.md, step 10). The page may connect to it and to nothing else.
 */
export async function buildWeb(dist: string, options: { minify?: boolean; avatars?: boolean; storage?: string; rooms?: string } = {}): Promise<void> {
  const storage = options.storage ? new URL(options.storage).origin : '';
  mkdirSync(dist, { recursive: true });
  // A service's Worker has no host of ours: only what preview2-shim brings for a browser.
  // The page's offline side, with a number of its own: a new one replaces the old caches.
  await build({ entryPoints: { sw: join(import.meta.dirname, 'src/sw.ts') }, outdir: dist, bundle: true, format: 'iife', platform: 'browser', target: 'es2022', minify: options.minify, logLevel: 'warning', define: { BUILD: JSON.stringify(Date.now().toString(36)) } });
  await build({ entryPoints: { service: join(import.meta.dirname, 'src/service.ts') }, outdir: dist, bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: options.minify, logLevel: 'warning' });
  await build({
    entryPoints: { worker: join(import.meta.dirname, 'src/worker.ts') },
    outdir: dist,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    sourcemap: options.minify ? false : 'inline',
    minify: options.minify,
    logLevel: 'warning',
    plugins: [webHost],
    loader: { '.wasm': 'empty', '.node': 'empty', '.html': 'text', '.md': 'text' },
  });
  // The page: the desktop's renderer as the desktop bundles it, behind the bridge to the Worker.
  await build({
    entryPoints: { app: join(import.meta.dirname, 'src/app.ts') },
    outdir: dist,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    jsx: 'automatic',
    sourcemap: options.minify ? false : 'inline',
    minify: options.minify,
    logLevel: 'warning',
    define: { 'process.env.NODE_ENV': options.minify ? '"production"' : '"development"', STORAGE_ORIGIN: JSON.stringify(storage), ROOMS_BASE: JSON.stringify(options.rooms ?? 'https://{label}.weave-rooms.net'), WEAVE_VERSION: JSON.stringify(version), AVATAR_RELEASE: JSON.stringify(pins().avatar?.sha256.slice(0, 16) ?? 'dev') },
    loader: { '.svg': 'text', '.png': 'dataurl' },
  });
  await build({ entryPoints: [join(DESKTOP, 'src/renderer/styles.css')], outfile: join(dist, 'styles.css'), bundle: true, minify: true, logLevel: 'warning', loader: { '.woff': 'dataurl', '.woff2': 'dataurl' } });
  copyFileSync(join(import.meta.dirname, 'src', 'manifest.json'), join(dist, 'manifest.json'));
  writeFileSync(join(dist, 'index.html'), readFileSync(join(import.meta.dirname, 'src', 'index.html'), 'utf8').replace("connect-src 'self'", `connect-src ${connectSrc(storage)}; frame-src ${framesFrom(options.rooms)}`));
  copyFileSync(join(DESKTOP, 'assets/icon.png'), join(dist, 'icon.png'));
  // Weave avatar's renderer, pinned as on the desktop.
  if (options.avatars) cpSync(await pinnedRelease('avatar'), join(dist, 'avatar3d'), { recursive: true });
  copyFileSync(join(require.resolve('@sqlite.org/sqlite-wasm/package.json'), '..', 'dist', 'sqlite3.wasm'), join(dist, 'sqlite3.wasm'));
}

/**
 * A website's tab (src/rooms/, docs/web-stage2.md, step 9), for <website>.weave-rooms.net: its page, its service worker
 * and the relay's client, into dist/rooms/__weave/, and the Cloudflare Worker in front of them into dist/rooms-worker.js.
 * `web`: where Weave's page is, the only one that may give it a pass; `storage`: its storage node, whose relay it uses.
 */
export async function buildRooms(dist: string, options: { web: string; storage: string; minify?: boolean }): Promise<void> {
  const out = join(dist, 'rooms', '__weave');
  rmSync(join(dist, 'rooms'), { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const define = { WEB_ORIGIN: JSON.stringify(new URL(options.web).origin), STORAGE_ORIGIN: JSON.stringify(new URL(options.storage).origin), global: 'globalThis' };
  await build({ entryPoints: { shell: join(import.meta.dirname, 'src/rooms/shell.ts') }, outdir: out, bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: options.minify, logLevel: 'warning', define, inject: [require.resolve('buffer/')] });
  await build({ entryPoints: { sw: join(import.meta.dirname, 'src/rooms/sw.ts') }, outdir: out, bundle: true, format: 'iife', platform: 'browser', target: 'es2022', minify: options.minify, logLevel: 'warning', define: { BUILD: JSON.stringify(Date.now().toString(36)) } });
  // The website's own WebSocket, which the service worker puts first in its pages.
  await build({ entryPoints: { ws: join(import.meta.dirname, 'src/rooms/ws.ts') }, outdir: out, bundle: true, format: 'iife', platform: 'browser', target: 'es2022', minify: options.minify, logLevel: 'warning' });
  copyFileSync(join(import.meta.dirname, 'src/rooms/shell.html'), join(out, 'shell.html'));
  await build({ entryPoints: [join(import.meta.dirname, 'rooms-worker.ts')], outfile: join(dist, 'rooms-worker.js'), bundle: true, format: 'esm', platform: 'neutral', target: 'es2022', minify: options.minify, logLevel: 'warning', define: { STORAGE_ORIGIN: define.STORAGE_ORIGIN, WEB_ORIGIN: define.WEB_ORIGIN } });
}

/** Where the page may frame websites from: any of their own origins (ROOMS_BASE with its {label} as *). */
export const framesFrom = (rooms = 'https://{label}.weave-rooms.net'): string => rooms.replace('{label}', '*');

/** Where the page may connect: itself, and its storage node when that's elsewhere (its socket and its handovers). */
export const connectSrc = (storage: string): string => (storage ? `'self' ${storage} ${storage.replace(/^http/, 'ws')}` : "'self'");

/**
 * The services a page runs, transpiled here because a page has no transpiler: each once by its digest, into
 * services/<name>/. shipped-web.json is the list the node finds at home. The node checks a shipped component's digest
 * by reading its file, and these aren't in the home, so the list names the small file that stands in for each (`web:<name>`).
 */
export async function buildServices(dist: string): Promise<string[]> {
  const list = existsSync(join(SHIPPED, 'shipped.json')) ? (JSON.parse(readFileSync(join(SHIPPED, 'shipped.json'), 'utf8')) as Record<string, { component: string; digest: string }>) : {};
  const web: typeof list = {};
  for (const name of [...SERVICES, ...VERIFIERS].filter((n) => list[n])) {
    const dir = join(dist, 'services', name);
    const marker = join(dir, '.component');
    if (!existsSync(marker) || readFileSync(marker, 'utf8') !== list[name].digest) {
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      const { transpile } = await import('@bytecodealliance/jco-transpile');
      // asyncWasiImports, given at all, adds jco's list of WASI's waiting calls (poll, blocking reads and writes).
      const jspi = VERIFIERS.includes(name) ? { asyncMode: 'jspi' as const, asyncWasiImports: [], asyncExports: ['verify', 'prove'] } : {};
      const { files } = await transpile(join(SHIPPED, list[name].component), { name: 'component', instantiation: { tag: 'async' }, emitTypescriptDeclarations: false, ...jspi });
      for (const [file, content] of Object.entries(files)) {
        mkdirSync(dirname(join(dir, file)), { recursive: true });
        writeFileSync(join(dir, file), content);
      }
      writeFileSync(marker, list[name].digest);
    }
    web[name] = { ...list[name], digest: `sha256:${createHash('sha256').update(`web:${name}`).digest('hex')}` };
    // A proof made with a sign-in with a code asks github.com, which doesn't answer pages: here a proof is made by hand.
    const verifier = (web[name] as { manifest?: { verifier?: { prove?: unknown } } }).manifest?.verifier;
    if (verifier) delete verifier.prove;
  }
  writeFileSync(join(dist, 'shipped-web.json'), JSON.stringify(web));
  return Object.keys(web);
}

if (process.argv[1] === import.meta.filename) {
  const dist = join(import.meta.dirname, 'dist');
  await buildWeb(dist, { avatars: true });
  console.log('services:', await buildServices(dist));
}
