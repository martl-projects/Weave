// The node in a browser, for development: `npm run dev -w @weave/web`, then http://localhost:8790/
//
// Starts a storage node and one person (a real WeaveNode) in temporary folders, nothing of any real home, and bundles the
// page and its Worker. The stand-in for the DHT connects the person to whatever the storage node looks for.
// POST /dev/say?text=… has the person say something in their group; GET /dev/messages is what the person reads there.
// The folders are new each time, so after a restart the browser's account is unknown: clear the site's data.
// A passkey needs a browser with one (localhost counts as secure); the words work everywhere.

import { createReadStream, mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { duplexPair, PeerSession2 } from '@weave/net';
import { StorageNode, textSocket, WeaveNode, type StorageOptions } from '@weave/node';
import { buildServices, buildWeb } from './build.ts';

const port = Number(process.env.PORT ?? 8790);
const dist = join(import.meta.dirname, 'dist');
const ORIGINS = new Set([`http://localhost:${port}`, `http://127.0.0.1:${port}`]);
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json' };

await buildWeb(dist);
console.log('services:', await buildServices(dist));

const scratch = mkdtempSync(join(tmpdir(), 'weave-web-dev-'));
const person = WeaveNode.init('Lena', join(scratch, 'lena'));
await person.createGroup('Climb');
await person.say({ space: 'Climb', text: 'the rope is in the van' });

const network: StorageOptions['network'] = (replica, access) => {
  let session: PeerSession2 | undefined;
  let theirs: PeerSession2 | undefined;
  return {
    join: async () => {
      if (session) return;
      const [a, b] = duplexPair();
      session = new PeerSession2(replica, a, { access });
      theirs = new PeerSession2(person.replica, b, { access: person.sessionAccess() });
    },
    leave: async () => {},
    announce: () => {
      session?.announce();
      theirs?.announce();
    },
    destroy: async () => {},
  };
};
const storage = await StorageNode.open({ dir: join(scratch, 'storage'), network });

const PAGE = `<!doctype html><meta charset="utf-8"><title>Weave Web</title>
<div id="doors" hidden>
  <p><input id="words" placeholder="recovery words" size="60"></p>
  <p data-when="none"><input id="name" placeholder="name"> <button id="create-passkey">New, with a passkey</button> <button id="create-words">New, words only</button></p>
  <p data-when="none"><button id="arrive-passkey">I have an account: passkey</button> <button id="arrive-words">I have an account: words</button></p>
  <p data-when="exists"><button id="unlock-passkey">Open with a passkey</button> <button id="unlock-words">Open with the words</button></p>
</div>
<pre id="out"></pre><pre id="messages"></pre><script type="module" src="/page.js"></script>`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const json = (value: unknown) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(value));
  };
  if (url.pathname === '/dev/invite') return json({ invite: storage.invite(), link: await person.invite('Climb') });
  if (url.pathname === '/dev/messages') return json((await person.messages('Climb')).map((m) => m.text));
  if (url.pathname === '/dev/say' && req.method === 'POST') {
    await person.say({ space: 'Climb', text: url.searchParams.get('text') ?? '…' });
    return res.writeHead(204).end();
  }
  if (url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html' });
    return res.end(PAGE);
  }
  const file = url.pathname.slice(1);
  if (!['page.js', 'worker.js', 'service.js', 'sqlite3.wasm', 'shipped-web.json'].includes(file) && !/^services\/[a-z-]+\/[\w-]+(\.[\w-]+)+$/.test(file)) return res.writeHead(404).end();
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
