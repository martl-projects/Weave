import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { build, type Plugin } from 'esbuild';

/*
 * The real node, in a Worker. WeaveNode runs as it is: what it asks of its host is answered by src/host/, here, at the
 * edges where it meets a computer: node:fs, node:path, node:os and node:crypto, its store and lock, and @weave/net.
 * Everything else a computer has (processes, sockets, the DHT) isn't there, and says so when called.
 * What a page may ask of the node is WEB_METHODS (src/methods.ts).
 */

const require = createRequire(import.meta.url);
const host = (file: string) => join(import.meta.dirname, 'src', 'host', file);

const HOST: Record<string, string> = { fs: 'fs.ts', path: 'path.ts', os: 'os.ts', crypto: 'crypto.ts', url: 'url.ts' };
/** What the node builds as it loads, before anything is called. */
const AT_LOAD: Record<string, string> = { 'net.BlockList': 'class { addSubnet() {} addAddress() {} check() { return false; } }' };
const BARE = /^(sodium-native|sodium-universal|hyperswarm|hyperdht|oxc-minify|udx-native|@bytecodealliance\/.*|bare-.*)$/;
const SWAPPED: Record<string, string> = { './sqlitestore.ts': 'sqlitestore.ts', './lock.ts': 'lock.ts', './runtime.ts': 'runtime.ts' };
/** The services a page runs: those that only fold and answer. */
const SERVICES = ['unread', 'spotlight'];
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

export async function buildWeb(dist: string, options: { minify?: boolean } = {}): Promise<void> {
  mkdirSync(dist, { recursive: true });
  // A service's Worker has no host of ours: only what preview2-shim brings for a browser.
  await build({ entryPoints: { service: join(import.meta.dirname, 'src/service.ts') }, outdir: dist, bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: options.minify, logLevel: 'warning' });
  await build({
    entryPoints: { page: join(import.meta.dirname, 'src/page.ts'), worker: join(import.meta.dirname, 'src/worker.ts') },
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
  copyFileSync(join(require.resolve('@sqlite.org/sqlite-wasm/package.json'), '..', 'dist', 'sqlite3.wasm'), join(dist, 'sqlite3.wasm'));
}

/**
 * The services a page runs, transpiled here because a page has no transpiler: each once by its digest, into
 * services/<name>/. shipped-web.json is the list the node finds at home. The node checks a shipped component's digest
 * by reading its file, and these aren't in the home, so the list names the small file that stands in for each (`web:<name>`).
 */
export async function buildServices(dist: string): Promise<string[]> {
  const list = existsSync(join(SHIPPED, 'shipped.json')) ? (JSON.parse(readFileSync(join(SHIPPED, 'shipped.json'), 'utf8')) as Record<string, { component: string; digest: string }>) : {};
  const web: typeof list = {};
  for (const name of SERVICES.filter((n) => list[n])) {
    const dir = join(dist, 'services', name);
    const marker = join(dir, '.component');
    if (!existsSync(marker) || readFileSync(marker, 'utf8') !== list[name].digest) {
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      const { transpileBytes } = await import('@bytecodealliance/jco-transpile');
      const { files } = await transpileBytes(readFileSync(join(SHIPPED, list[name].component)), { name: 'component', instantiation: { tag: 'async' }, emitTypescriptDeclarations: false });
      for (const [file, content] of Object.entries(files)) {
        mkdirSync(dirname(join(dir, file)), { recursive: true });
        writeFileSync(join(dir, file), content);
      }
      writeFileSync(marker, list[name].digest);
    }
    web[name] = { ...list[name], digest: `sha256:${createHash('sha256').update(`web:${name}`).digest('hex')}` };
  }
  writeFileSync(join(dist, 'shipped-web.json'), JSON.stringify(web));
  return Object.keys(web);
}

if (process.argv[1] === import.meta.filename) {
  const dist = join(import.meta.dirname, 'dist');
  await buildWeb(dist);
  console.log('services:', await buildServices(dist));
}
