// First: Bare has no TextEncoder or TextDecoder of its own, and @weave/core uses them as it loads.
import 'bare-encoding/global';
import DHT from 'hyperdht';
import fs from 'bare-fs';
import tcp from 'bare-tcp';
import { Phone, type Pipe, type PhoneDeps, type Saved } from './phone.ts';

/*
 * The worker's entry on Bare (bare-kit runs it inside the app): one DHT per
 * network, the phone's file in the app's private storage, local TCP for rooms'
 * apps, and the IPC line transport to the native side, which passes the lines
 * on to the screen.
 */

declare const BareKit: { IPC: { on(event: 'data', listener: (chunk: Buffer) => void): void; write(data: string): void } };
declare const Bare: { on(event: 'uncaughtException' | 'unhandledRejection', listener: (error: unknown) => void): void };

const ipc = BareKit.IPC;
const send = (message: unknown) => ipc.write(`${JSON.stringify(message)}\n`);

// An uncaught error would take the whole app down with the worker: report it instead.
const report = (error: unknown) => send({ fatal: error instanceof Error ? (error.stack ?? error.message) : String(error) });
Bare.on('uncaughtException', report);
Bare.on('unhandledRejection', report);

const dhts = new Map<string, DHT>();
const file = (dir: string) => `${dir}/phone.json`;

const deps: PhoneDeps = {
  dht(bootstrap) {
    const key = JSON.stringify(bootstrap ?? null);
    let dht = dhts.get(key);
    if (!dht) dhts.set(key, (dht = new DHT(bootstrap ? { bootstrap } : {})));
    return dht as unknown as ReturnType<PhoneDeps['dht']>;
  },
  newKeyPair: () => DHT.keyPair(),
  load(dir) {
    try {
      return JSON.parse(fs.readFileSync(file(dir), 'utf8')) as Saved;
    } catch {
      return undefined;
    }
  },
  save(dir, saved) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(`${file(dir)}.tmp`, JSON.stringify(saved));
    fs.renameSync(`${file(dir)}.tmp`, file(dir));
  },
  send,
  listen(port, onConnection) {
    const attempt = (at: number) =>
      new Promise<{ port: number; close(): void }>((resolve, reject) => {
        const server = tcp.createServer((socket) => onConnection(socket as unknown as Pipe));
        server.once('error', reject);
        server.listen(at, '127.0.0.1', () => resolve({ port: server.address()!.port, close: () => server.close() }));
      });
    // The computer's port for the room, so the app keeps its origin (and saved data); any port if it's taken.
    return attempt(port).catch(() => attempt(0));
  },
};

const phone = new Phone(deps);
let buffer = '';
ipc.on('data', (chunk) => {
  buffer += chunk.toString('utf8');
  let end: number;
  while ((end = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, end);
    buffer = buffer.slice(end + 1);
    if (!line.trim()) continue;
    try {
      void phone.handle(JSON.parse(line));
    } catch {
      send({ fatal: 'a message the worker could not read' });
    }
  }
});
