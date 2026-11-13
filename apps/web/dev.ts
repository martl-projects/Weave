// The node in a browser, for development: `npm run dev -w @weave/web`, then http://localhost:8790/
//
// Starts a storage node and one person (a real WeaveNode) in temporary folders, nothing of any real home, and bundles the
// page and its Worker. The stand-in for the DHT connects the person to whatever the storage node looks for.
// /dev/link is an invitation to the person's group, /dev/say?text=… has them say something there, /dev/messages is what
// they read.
// The folders are new each time, so after a restart the browser's account is unknown: clear the site's data.
// A passkey needs a browser with one (localhost counts as secure); the words work everywhere.
//
// DHT=1 puts the storage node and the person on the real DHT instead: then a contact link of anyone's (your own Weave's)
// reaches them, as it would from a hosted page.
//
// The person also hosts a website in their project Party (/dev/invite's party), on the real DHT (an invitation names the
// network it comes from, and a browser takes only the public one): a website's tab opens at http://<name>.localhost:<port>,
// and reaches it through the storage node's relay.

import { createReadStream, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { duplexPair, PeerSession2 } from '@weave/net';
import { playManifest, playTags } from '@weave/core';
import { keepReconciling, linkHandovers, originMatches, relayUpgrade, StorageNode, swarmNetwork, textSocket, WeaveNode, type StorageOptions, PlanStore, previewTags } from '@weave/node';
import HyperDHT from 'hyperdht';
import { WebSocketServer } from 'ws';
import { buildRooms, buildServices, buildWeb } from './build.ts';
import { roomsCsp } from './src/rooms/csp.ts';

const port = Number(process.env.PORT ?? 8790);
const onDht = process.env.DHT === '1';
const dist = join(import.meta.dirname, 'dist');
const ORIGINS = new Set([`http://localhost:${port}`, `http://127.0.0.1:${port}`]);
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.glb': 'model/gltf-binary' };

const ROOMS = `http://*.localhost:${port}`;
await buildWeb(dist, { avatars: true, rooms: `http://{label}.localhost:${port}` });
await buildRooms(dist, { web: `http://localhost:${port}`, storage: `http://localhost:${port}` });
console.log('services:', await buildServices(dist));

const scratch = mkdtempSync(join(tmpdir(), 'weave-web-dev-'));
const { node: person, words: personWords } = WeaveNode.create('Lena', join(scratch, 'lena'));
await person.createGroup('Climb');
await person.say({ space: 'Climb', text: 'the rope is in the van' });

const standIn: StorageOptions['network'] = (replica, access, blobs) => {
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
    refreshPublic: () => sessions.forEach((session) => session.refreshPublic()),
    destroy: async () => {},
  };
};
// Websites: the person hosts on the real DHT, and the storage node relays there.
const relayDht = onDht ? undefined : new HyperDHT();
const app = createServer((req, res) => {
  if (req.url === '/api') return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ cookie: req.headers.cookie ?? null }));
  // An event stream that stays open, as a game's live updates do: a tick every half second.
  if (req.url === '/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    let n = 0;
    const tick = setInterval(() => res.write(`data: tick ${++n}

`), 500);
    return void req.on('close', () => clearInterval(tick));
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'set-cookie': 'visit=1; Path=/' });
  res.end(`<!doctype html><title>Party</title><h1>Hello from Lena's website</h1><p id="ws">…</p><p id="sse">…</p><p id="api">…</p><script>const ws = new WebSocket('ws://' + location.host + '/echo'); ws.onopen = () => ws.send('hello'); ws.onmessage = (e) => (document.getElementById('ws').textContent = 'ws: ' + e.data); new EventSource('/events').onmessage = (e) => (document.getElementById('sse').textContent = 'sse: ' + e.data); fetch('/api').then((r) => r.json()).then((j) => (document.getElementById('api').textContent = 'api: ' + JSON.stringify(j)))</script>`);
});
// And a WebSocket, which says back what it's told.
const echo = new WebSocketServer({ noServer: true });
app.on('upgrade', (req, socket, head) => echo.handleUpgrade(req, socket, head, (ws) => ws.on('message', (data) => ws.send(`echo: ${String(data)}`))));
await new Promise<void>((resolve) => app.listen(0, '127.0.0.1', resolve));
await person.createProject({ name: 'Party' });
const storage = await StorageNode.open({ dir: join(scratch, 'storage'), network: onDht ? swarmNetwork() : Object.assign(standIn, { dht: () => relayDht! }) });
keepReconciling(person);
await person.goOnline();
await person.addService({ builtin: 'website', spaces: ['Party'] });
const website = await person.openWebsite({ project: 'Party', name: 'Party', port: (app.address() as { port: number }).port });
console.log(onDht ? 'on the real DHT' : 'with a stand-in for the DHT (DHT=1 for the real one)');

const handovers = linkHandovers(false);
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const json = (value: unknown) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(value));
  };
  if (url.pathname === '/dev/invite') return json({ invite: storage.invite(), link: await person.invite('Climb'), party: await person.invite('Party'), website: website.id });
  // A website's tab: its own origin under .localhost, as under weave-rooms.net (rooms-worker.ts).
  if (/^[a-z2-7]{26}\.localhost:\d+$/.test(req.headers.host ?? '')) {
    const file = url.pathname.startsWith('/__weave/') ? url.pathname.slice('/__weave/'.length) : 'shell.html';
    if (!/^[\w.-]+$/.test(file) || !existsSync(join(dist, 'rooms', '__weave', file))) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'content-security-policy': roomsCsp(`http://localhost:${port}`, `http://localhost:${port}`), ...(file === 'sw.js' ? { 'service-worker-allowed': '/' } : {}) });
    return createReadStream(join(dist, 'rooms', '__weave', file)).pipe(res);
  }
  // Lena links a browser, as from her computer: the link opens this page, and the handover waits here (/link/…).
  if (url.pathname === '/dev/link-browser') return json(await person.linkBrowser({ url: url.searchParams.get('origin') ?? `http://127.0.0.1:${port}`, name: url.searchParams.get('name') ?? 'test' }));
  if (url.pathname.startsWith('/link/')) return handovers(req, res, url.pathname.slice('/link/'.length));
  // Lena's words, as she'd type them into a browser (dev only: the words never leave a real computer).
  if (url.pathname === '/dev/words') return json({ words: personWords });
  if (url.pathname === '/dev/messages') return json((await person.messages('Climb')).map((m) => m.text));
  // An onboarding link to Party, as Lena makes one in her app (idea bZFDCQNT): this storage node lets her.
  if (url.pathname === '/dev/onboard') {
    PlanStore.allowIn(join(scratch, 'storage'), person.identity.did);
    const page = `http://127.0.0.1:${port}`;
    return json(await person.createOnboardLink({ project: 'Party', page, storage: page, welcome: 'Schön, dass du da bist!', play: true }));
  }
  if (url.pathname === '/dev/members') return json((await person.members('Party')).map((m) => m.name));
  if (url.pathname === '/dev/friends') return json(await Promise.all((await person.members('Party')).map(async (m) => [m.name, (await person.profile(m.did)).following])));
  // An onboarding link's page: the page, with what a link card shows (no invitation of its own: the link brings one).
  const onboard = /^\/j\/([A-Za-z0-9]{8})$/.exec(url.pathname);
  if (onboard) {
    res.writeHead(200, { 'content-type': 'text/html' });
    return res.end(readFileSync(join(dist, 'index.html'), 'utf8').replace('</head>', `${previewTags(storage.plans.preview(onboard[1]), `http://127.0.0.1:${port}/preview/${onboard[1]}.png`)}\n</head>`));
  }
  const preview = /^\/preview\/([A-Za-z0-9]{8})$/.exec(url.pathname);
  if (preview) return json(storage.plans.preview(preview[1]) ?? {});
  // A game's own app (/play/<code>): the page with its manifest, the manifest, and its icon.
  const base = `http://${req.headers.host}`;
  const play = /^\/play\/([A-Za-z0-9]{8})(\/manifest)?$/.exec(url.pathname);
  if (play && play[2]) return res.writeHead(200, { 'content-type': 'application/manifest+json' }).end(JSON.stringify(playManifest(storage.plans.app(play[1]), play[1], base)));
  if (play) return res.writeHead(200, { 'content-type': 'text/html' }).end(playTags(readFileSync(join(dist, 'index.html'), 'utf8'), storage.plans.app(play[1]), play[1], base));
  const appIcon = /^\/preview\/([A-Za-z0-9]{8})\/icon\.png$/.exec(url.pathname);
  if (appIcon) {
    const icon = storage.plans.icon(appIcon[1]);
    return icon ? res.writeHead(200, { 'content-type': 'image/png' }).end(icon) : res.writeHead(404).end();
  }
  // A link to the group, to paste into "Open link"; what's said there, from the address bar too.
  if (url.pathname === '/dev/link') return res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end(await person.invite('Climb'));
  if (url.pathname === '/dev/say') {
    const text = url.searchParams.get('text') ?? '…';
    await person.say({ space: 'Climb', text });
    return req.method === 'POST' ? res.writeHead(204).end() : res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end(`Lena said: ${text}\n`);
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
  // A website's tab, for its relay.
  if (url.pathname === '/dht') {
    if (!originMatches(ROOMS, req.headers.origin ?? '') || !relayUpgrade(storage, url.searchParams.get('ticket') ?? '', req, socket, head)) socket.destroy();
    return;
  }
  if (url.pathname !== '/storage' || !ORIGINS.has(req.headers.origin ?? '')) return void socket.destroy();
  const text = textSocket(req, socket, head);
  if (text) void storage.accept(text).catch(() => {});
});
server.listen(port, '127.0.0.1', () => console.log(`http://localhost:${port}/`));
