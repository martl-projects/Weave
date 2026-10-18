import type { Duplex } from 'node:stream';
import HyperDHT from 'hyperdht';

export type { DhtSocket, DhtServer } from 'hyperswarm';

/** A room's DHT key pair, from a 32-byte seed (so the host can reopen its rooms after a restart). */
export function roomKeyPair(seed: Uint8Array): { publicKey: Buffer; secretKey: Buffer } {
  return HyperDHT.keyPair(Buffer.from(seed));
}

/**
 * Read the first line of a stream (a JSON hello), then hand back whatever came
 * after it, so the stream can carry raw bytes from there on.
 */
export function readLine(socket: Duplex, maxBytes = 16_384): Promise<{ line: string; rest: Buffer }> {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    const onData = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      const end = buffer.indexOf(10);
      if (end >= 0) {
        cleanup();
        socket.pause();
        resolve({ line: buffer.subarray(0, end).toString('utf8'), rest: buffer.subarray(end + 1) });
      } else if (buffer.length > maxBytes) {
        cleanup();
        reject(new Error('first line too long'));
      }
    };
    const onEnd = () => {
      cleanup();
      reject(new Error('closed before the first line'));
    };
    const cleanup = () => {
      socket.off('data', onData);
      socket.off('end', onEnd);
      socket.off('error', onEnd);
      socket.off('close', onEnd);
    };
    socket.on('data', onData);
    socket.on('end', onEnd);
    socket.on('error', onEnd);
    socket.on('close', onEnd);
  });
}

/** Pipe two streams into each other, with `rest` (already read from `a`) written to `b` first. */
export function splice(a: Duplex, b: Duplex, rest: Buffer = Buffer.alloc(0)): void {
  if (rest.length) b.write(rest);
  a.pipe(b).on('error', () => a.destroy());
  b.pipe(a).on('error', () => b.destroy());
  const end = () => {
    a.destroy();
    b.destroy();
  };
  a.on('close', end);
  b.on('close', end);
  a.on('error', end);
  b.on('error', end);
  a.resume();
}
