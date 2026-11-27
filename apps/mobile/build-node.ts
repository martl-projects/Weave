// Packs the whole node for Bare (a phone's own node, not the worker that uses a computer's: build.ts).
//   dist/worklet/node-proof.cjs   worklet/node-proof.ts, the node by itself, for plain Bare on this computer
//   dist/worklet/own-main.cjs     the phone app's worker with a node of its own (worklet/own.ts), for bare-kit
//   dist/worklet/own-test.cjs     the same for plain Bare on this computer (tests, the browser preview)
// The node runs as it is. What it asks of Node is answered by Bare's own modules where they are Node's (files, paths,
// the system, streams, SQLite), by Weave Web's host where plain JavaScript does (hashes, URLs, zlib: ../web/src/host), and what a
// phone hasn't (processes, servers) says so when called.

import { createRequire } from 'node:module';
import { join } from 'node:path';
import { build, type Plugin } from 'esbuild';

const require = createRequire(import.meta.url);
const here = import.meta.dirname;
const web = (file: string) => join(here, '..', 'web', 'src', 'host', file);

/** Node's modules that Bare has as its own. */
const BARE: Record<string, string> = { fs: 'bare-fs', path: 'bare-path', os: 'bare-os', stream: 'bare-stream', events: 'bare-events' };
/** Those a host of ours answers. */
const HOST: Record<string, string> = { crypto: web('crypto.ts'), url: web('url.ts'), zlib: web('zlib.ts'), module: join(here, 'worklet', 'host', 'module.ts') };
/** What the node builds as it loads, before anything is called. */
const AT_LOAD: Record<string, string> = { 'net.BlockList': 'class { addSubnet() {} addAddress() {} check() { return false; } }' };
/**
 * The node's own files that a phone has another of: no lock between processes (Weave Web's), and a runtime that runs
 * no programs and has WebAssembly components run on the app's screen (worklet/host/runtime.ts).
 */
const SWAPPED: Record<string, string> = { './lock.ts': web('lock.ts'), './runtime.ts': join(here, 'worklet', 'host', 'runtime.ts') };

const bareHost: Plugin = {
  name: 'weave-bare-host',
  setup(b) {
    b.onResolve({ filter: /^node:|^(fs|path|os|crypto|net|tls|http|https|stream|events|util|url|dgram|dns|child_process|worker_threads|module|zlib|readline|tty|querystring)$/ }, ({ path }) => {
      const name = path.replace(/^node:/, '');
      if (BARE[name]) return { path: BARE[name], external: true };
      return HOST[name] ? { path: HOST[name] } : { path: name, namespace: 'not-here' };
    });
    b.onLoad({ filter: /.*/, namespace: 'not-here' }, ({ path }) => ({
      contents: [
        'const nothing = (name) => () => { throw new Error(name + " is not there on a phone"); };',
        ...Object.keys(require(`node:${path}`))
          .filter((key) => /^[A-Za-z_]\w*$/.test(key) && key !== 'default')
          .map((key) => `export const ${key} = ${AT_LOAD[`${path}.${key}`] ?? `nothing('${path}.${key}')`};`),
        'export default {};',
      ].join('\n'),
      loader: 'js',
    }));
    b.onResolve({ filter: /^(ws|oxc-minify|@bytecodealliance\/.*)$/ }, () => ({ path: web('none.cjs') }));
    b.onResolve({ filter: /^\.\/(lock|runtime)\.ts$/ }, ({ path, importer }) => (/[\\/]packages[\\/]node[\\/]src[\\/]/.test(importer) ? { path: SWAPPED[path] } : undefined));
  },
};

/** Pack worklet/<entry>.ts, the node with it, into dist/worklet/<entry>.cjs. */
async function pack(entry: string): Promise<string> {
  const out = join(here, 'dist', 'worklet', `${entry}.cjs`);
  await build({
    entryPoints: [join(here, 'worklet', `${entry}.ts`)],
    outfile: out,
    bundle: true,
    platform: 'neutral',
    format: 'cjs',
    target: 'es2022',
    mainFields: ['module', 'main'],
    conditions: ['import', 'default'],
    logLevel: 'warning',
    // The node asks where its own files are (its console, a worker's script): nowhere on a phone, they are in the bundle.
    define: { 'import.meta.url': '"file:///weave/node.js"', 'import.meta.dirname': '"/weave"', 'import.meta.filename': '"/weave/node.js"' },
    plugins: [bareHost],
    // The network is the computer's own (@weave/net): Hyperswarm and its DHT run on Bare as they are, with their addons.
    external: ['bare-*', 'hyperdht', 'hyperswarm', 'sodium-native', 'sodium-universal', 'udx-native'],
    loader: { '.wasm': 'empty', '.node': 'empty', '.html': 'text', '.md': 'text' },
  });
  return out;
}

/** The node by itself, for plain Bare on this computer (worklet/node-proof.ts). */
export const buildNodeProof = (): Promise<string> => pack('node-proof');

/**
 * The phone app's worker with a node of its own (worklet/own.ts): for bare-kit inside the app, or (`test`) for plain
 * Bare on this computer, with local TCP in place of bare-kit's IPC (tests, the browser preview).
 */
export const buildOwnWorker = (options: { test?: boolean } = {}): Promise<string> => pack(options.test ? 'own-test' : 'own-main');

if (process.argv[1] === import.meta.filename) console.log('packed', await buildNodeProof(), await buildOwnWorker({ test: true }));
