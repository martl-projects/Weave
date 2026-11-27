// First: what the node takes for granted of its surroundings (process, Buffer, crypto).
import './host/globals.ts';
import tcp from 'bare-tcp';
import { useScreen } from './host/runtime.ts';
import { Own } from './own.ts';
import type { Pipe } from './phone.ts';

/*
 * The entry on Bare of the worker with a node of its own (own.ts; bare-kit runs it inside the app): local TCP for the
 * views of boards' client services, and the IPC line transport to the native side, which passes the lines on to the
 * screen. The node's home is in the app's private storage, and its network is its own.
 */

declare const BareKit: { IPC: { on(event: 'data', listener: (chunk: Buffer) => void): void; write(data: string): void } };
declare const Bare: { on(event: 'uncaughtException' | 'unhandledRejection', listener: (error: unknown) => void): void };

const ipc = BareKit.IPC;
const send = (message: unknown) => ipc.write(`${JSON.stringify(message)}\n`);

// An uncaught error would take the whole app down with the worker: report it instead.
const report = (error: unknown) => send({ fatal: error instanceof Error ? (error.stack ?? error.message) : String(error) });
Bare.on('uncaughtException', report);
Bare.on('unhandledRejection', report);

// The node's WebAssembly components run on the screen: its line is this one.
useScreen(send);

const own = new Own({
  send,
  listen(port, onConnection) {
    const attempt = (at: number) =>
      new Promise<{ port: number; close(): void }>((resolve, reject) => {
        const server = tcp.createServer((socket) => onConnection(socket as unknown as Pipe));
        server.once('error', reject);
        server.listen(at, '127.0.0.1', () => resolve({ port: server.address()!.port, close: () => server.close() }));
      });
    return attempt(port).catch(() => attempt(0));
  },
});

// Setting up goes one step at a time, in the order the messages came; the node's own calls run side by side after
// what was asked before them, as on a computer.
let last: Promise<void> = Promise.resolve();
let buffer = '';
ipc.on('data', (chunk) => {
  buffer += chunk.toString('utf8');
  let end: number;
  while ((end = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, end);
    buffer = buffer.slice(end + 1);
    if (!line.trim()) continue;
    try {
      const message = JSON.parse(line) as { op?: string };
      if (message.op === 'call' || message.op === 'service') void last.then(() => own.handle(message));
      else last = last.then(() => own.handle(message));
    } catch {
      send({ fatal: 'a message the worker could not read' });
    }
  }
});
