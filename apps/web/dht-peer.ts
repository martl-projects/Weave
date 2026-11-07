// A person on the real DHT, to try a storage node against: a temporary home and a group, nothing of any real one.
//
//   node apps/web/dht-peer.ts [port]
//
// GET /link is an invitation to the group, /messages what it reads; POST /say?text=… says something.

import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WeaveNode } from '@weave/node';

const port = Number(process.argv[2] ?? 8793);
const person = WeaveNode.init('Lena', join(mkdtempSync(join(tmpdir(), 'weave-dht-peer-')), 'home'));
await person.createGroup('Climb');
await person.say({ space: 'Climb', text: 'said on the real DHT' });
await person.goOnline();

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://here');
  res.setHeader('access-control-allow-origin', '*');
  if (url.pathname === '/link') return res.end(await person.invite('Climb'));
  if (url.pathname === '/messages') return res.end(JSON.stringify((await person.messages('Climb')).map((m) => m.text)));
  if (url.pathname === '/say') {
    await person.say({ space: 'Climb', text: url.searchParams.get('text') ?? '…' });
    return res.end('said');
  }
  res.writeHead(404).end();
}).listen(port, '127.0.0.1', () => console.log(`peer on ${port}, ${(person as unknown as { identity: { did: string } }).identity.did}`));
