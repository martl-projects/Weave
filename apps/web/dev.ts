// The node in a browser, for development: `npm run dev -w @weave/web`, then http://localhost:8790/
//
// Starts a storage node and one person (a real WeaveNode) in temporary folders, nothing of any real home, and bundles the
// page and its Worker. The stand-in for the DHT connects the person to whatever the storage node looks for.
// POST /dev/say?text=… has the person say something in their group; GET /dev/messages is what the person reads there.
// The folders are new each time, so after a restart the browser's account is unknown: clear the site's data.
// A passkey needs a browser with one (localhost counts as secure); the words work everywhere.

import { createReadStream, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { duplexPair, PeerSession2 } from '@weave/net';
import { StorageNode, textSocket, WeaveNode, type StorageOptions } from '@weave/node';
import { buildServices, buildWeb } from './build.ts';

const port = Number(process.env.PORT ?? 8790);
const dist = join(import.meta.dirname, 'dist');
const ORIGINS = new Set([`http://localhost:${port}`, `http://127.0.0.1:${port}`]);
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.glb': 'model/gltf-binary' };

await buildWeb(dist, { avatars: true });
console.log('services:', await buildServices(dist));

const scratch = mkdtempSync(join(tmpdir(), 'weave-web-dev-'));
const person = WeaveNode.init('Lena', join(scratch, 'lena'));
await person.createGroup('Climb');
await person.say({ space: 'Climb', text: 'the rope is in the van' });

const network: StorageOptions['network'] = (replica, access, blobs) => {
  const sessions: PeerSession2[] = [];
  return {
    // A new topic is a new connection, as on the DHT: a storage node turns away one that shares no space with it yet.
    join: async () => {
      const [a, b] = duplexPair();
      sessions.push(new PeerSession2(replica, a, { access, blobs }), new PeerSession2(person.replica, b, { access: person.sessionAccess(), blobs: person.blobs }));
    },
    leave: async () => {},
    announce: () => sessions.forEach((session) => session.announce()),
    want: (hashes) => sessions.forEach((session) => session.want(hashes)),
    destroy: async () => {},
  };
};
const storage = await StorageNode.open({ dir: join(scratch, 'storage'), network });

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
    // A new person gets in on an invitation, which a real link would bring.
    res.writeHead(200, { 'content-type': 'text/html' });
    return res.end(readFileSync(join(dist, 'index.html'), 'utf8').replace('</head>', `<meta name="weave-invite" content="${storage.invite()}"></head>`));
  }
  const file = url.pathname.slice(1);
  if (!['app.js', 'worker.js', 'service.js', 'sw.js', 'sqlite3.wasm', 'shipped-web.json', 'styles.css', 'manifest.json', 'icon.png'].includes(file) && !/^(services|avatar3d)\/[\w./-]+$/.test(file)) return res.writeHead(404).end();
  if (file.includes('..') || !existsSync(join(dist, file))) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(join(dist, file)).pipe(res);
});
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (url.pathname !== '/storage' || !ORIGINS.has(req.headers.origin ?? '')) return void socket.destroy();
  const text = textSocket(req, socket, head);
  if (text) void storage.accept(text).catch(() => {});
});
server.listen(port, '127.0.0.1', () => console.log(`http://localhost:${port}/`));
