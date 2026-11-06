// The node in a browser, for development: `npm run dev -w @weave/web`, then http://localhost:8790/
//
// Starts a storage node and one person (a real WeaveNode) in temporary folders, nothing of any real home, and bundles the
// page and its Worker. The stand-in for the DHT connects the person to whatever the storage node looks for.
// POST /dev/say?text=… has the person say something in their group.

import { copyFileSync, createReadStream, mkdirSync, mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { build } from 'esbuild';
import { duplexPair, PeerSession2 } from '@weave/net';
import { loadSpaces, StorageNode, textSocket, WeaveNode, type StorageOptions } from '@weave/node';

const port = Number(process.env.PORT ?? 8790);
const dist = join(import.meta.dirname, 'dist');
const ORIGINS = new Set([`http://localhost:${port}`, `http://127.0.0.1:${port}`]);
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm' };

mkdirSync(dist, { recursive: true });
await build({ entryPoints: { page: join(import.meta.dirname, 'src/page.ts'), worker: join(import.meta.dirname, 'src/worker.ts') }, outdir: dist, bundle: true, format: 'esm', platform: 'browser', target: 'es2022', sourcemap: 'inline', logLevel: 'info' });
copyFileSync(join(createRequire(import.meta.url).resolve('@sqlite.org/sqlite-wasm/package.json'), '..', 'dist', 'sqlite3.wasm'), join(dist, 'sqlite3.wasm'));

const scratch = mkdtempSync(join(tmpdir(), 'weave-web-dev-'));
const person = WeaveNode.init('Lena', join(scratch, 'lena'));
await person.createGroup('Climb');
await person.say({ space: 'Climb', text: 'the rope is in the van' });

const network: StorageOptions['network'] = (replica, access) => {
  let met = false;
  return {
    join: async () => {
      if (met) return;
      met = true;
      setTimeout(() => {
        const [a, b] = duplexPair();
        new PeerSession2(replica, a, { access });
        new PeerSession2(person.replica, b, { access: person.sessionAccess() });
      }, 50);
    },
    leave: async () => {},
    announce: () => {},
    destroy: async () => {},
  };
};
const storage = await StorageNode.open({ dir: join(scratch, 'storage'), network });

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (url.pathname === '/dev/space') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ invite: storage.invite(), space: loadSpaces(person.home).find((s) => s.name === 'Climb') }));
  }
  if (url.pathname === '/dev/say' && req.method === 'POST') {
    await person.say({ space: 'Climb', text: url.searchParams.get('text') ?? '…' });
    return res.writeHead(204).end();
  }
  if (url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html' });
    return res.end('<!doctype html><meta charset="utf-8"><title>Weave Web</title><pre id="out"></pre><pre id="messages"></pre><script type="module" src="/page.js"></script>');
  }
  const file = url.pathname.slice(1);
  if (!['page.js', 'worker.js', 'sqlite3.wasm'].includes(file)) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': TYPES[extname(file)] });
  createReadStream(join(dist, file)).pipe(res);
});
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (url.pathname !== '/storage' || !ORIGINS.has(req.headers.origin ?? '')) return void socket.destroy();
  const text = textSocket(req, socket, head);
  if (text) void storage.accept(text).catch(() => {});
});
server.listen(port, '127.0.0.1', () => console.log(`http://localhost:${port}/`));
