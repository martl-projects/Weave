import tcp from 'bare-tcp';

// For tests: the worker under plain Bare on a computer, with a local TCP
// connection (to the port given as its last argument) in place of bare-kit's IPC.
declare const Bare: { argv: string[] };
const socket = tcp.createConnection(Number(Bare.argv[Bare.argv.length - 1]), '127.0.0.1');
(globalThis as { BareKit?: unknown }).BareKit = {
  IPC: { on: (event: string, listener: (chunk: Buffer) => void) => socket.on(event, listener as (...args: unknown[]) => void), write: (data: string) => socket.write(data) },
};
void import('./main.ts');
