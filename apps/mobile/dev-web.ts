// Serves the phone app's screens to a normal browser for development, with
// the real worker running on Bare next to this server in place of bare-kit:
// its lines go out on /worker/events and come in on POST /worker. Pair it
// with a computer's node like a phone (paste the code). Binds to 127.0.0.1.
//
//   npm run web -w @weave/mobile -- --data .dev/phone --port 8780

import { spawn } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync } from 'node:fs';
import { createServer as createHttpServer, type ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import { createServer, type AddressInfo, type Socket } from 'node:net';
import { extname, join, normalize, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { data: { type: 'string', default: '.dev/phone' }, port: { type: 'string', default: '8780' } } });
const data = resolve(process.env.INIT_CWD ?? process.cwd(), values.data!);
const port = Number(values.port);
const STATIC = join(import.meta.dirname, 'dist', 'web');
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

// The worker, connected back to us over local TCP (see worklet/test.ts).
const bare = (createRequire(import.meta.url)('bare-runtime') as () => string)();
const listener = createServer();
await new Promise<void>((done) => listener.listen(0, '127.0.0.1', done));
const child = spawn(bare, [join(import.meta.dirname, 'dist/worklet/test.cjs'), String((listener.address() as AddressInfo).port)], { stdio: ['ignore', 'inherit', 'inherit'] });
const worker = await new Promise<Socket>((done) => listener.once('connection', done));
listener.close();
process.on('exit', () => child.kill());
mkdirSync(data, { recursive: true });
worker.write(`${JSON.stringify({ op: 'start', dir: data })}\n`);

const screens = new Set<ServerResponse>();
let buffer = '';
worker.on('data', (chunk: Buffer) => {
  buffer += chunk.toString('utf8');
  let end: number;
  while ((end = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, end);
    buffer = buffer.slice(end + 1);
    for (const res of screens) res.write(`data: ${line}\n\n`);
  }
});

createHttpServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (url.pathname === '/worker' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    worker.write(`${body.replace(/\n/g, ' ')}\n`);
    return res.writeHead(204).end();
  }
  if (url.pathname === '/worker/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    screens.add(res);
    req.on('close', () => screens.delete(res));
    return;
  }
  const file = normalize(join(STATIC, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!file.startsWith(STATIC) || !existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`weave phone preview (worker data in ${data}) on http://127.0.0.1:${port}`));
