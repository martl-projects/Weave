import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

/*
 * The server side of WebSockets (RFC 6455), as far as a website's players need it: text messages both ways, pings
 * answered, closing either way. What Weave holds for a WebAssembly website's players (Runtime.startWasm), so the
 * component only handles what they say. A message larger than MAX_MESSAGE ends the connection.
 */

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
export const MAX_MESSAGE = 1024 * 1024;

export interface WebSocketConnection {
  send(text: string): void;
  close(): void;
}

/** Accept an upgrade request as a WebSocket: false (and nothing sent) when it isn't one. */
export function acceptWebSocket(req: IncomingMessage, socket: Duplex, head: Buffer, on: { message(text: string): void; close(): void }): WebSocketConnection | undefined {
  const key = req.headers['sec-websocket-key'];
  if (req.headers.upgrade?.toLowerCase() !== 'websocket' || typeof key !== 'string') return undefined;
  const accept = createHash('sha1').update(key + GUID).digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  let open = true;
  let buffer: Buffer = head.length ? Buffer.from(head) : Buffer.alloc(0);
  let pieces: Buffer[] = [];
  const frame = (opcode: number, payload: Buffer) => {
    const length = payload.length;
    let header: Buffer;
    if (length < 126) header = Buffer.from([0x80 | opcode, length]);
    else if (length < 65536) header = Buffer.from([0x80 | opcode, 126, length >> 8, length & 255]);
    else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(length), 2);
    }
    socket.write(Buffer.concat([header, payload]));
  };
  const end = () => {
    if (!open) return;
    open = false;
    socket.end();
    on.close();
  };
  const read = () => {
    while (open && buffer.length >= 2) {
      const fin = (buffer[0] & 0x80) !== 0;
      const opcode = buffer[0] & 0x0f;
      const masked = (buffer[1] & 0x80) !== 0;
      let length = buffer[1] & 0x7f;
      let at = 2;
      if (length === 126) {
        if (buffer.length < 4) return;
        length = buffer.readUInt16BE(2);
        at = 4;
      } else if (length === 127) {
        if (buffer.length < 10) return;
        const big = buffer.readBigUInt64BE(2);
        if (big > BigInt(MAX_MESSAGE)) return end();
        length = Number(big);
        at = 10;
      }
      // Browsers always mask what they send; anything else isn't a browser's WebSocket.
      if (!masked || length > MAX_MESSAGE) return end();
      if (buffer.length < at + 4 + length) return;
      const mask = buffer.subarray(at, at + 4);
      const payload = Buffer.from(buffer.subarray(at + 4, at + 4 + length));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
      buffer = buffer.subarray(at + 4 + length);
      if (opcode === 8) {
        frame(8, Buffer.alloc(0));
        return end();
      }
      if (opcode === 9) {
        frame(10, payload);
        continue;
      }
      if (opcode === 10) continue;
      // Text, binary (read as text), or a continuation of either.
      pieces.push(payload);
      if (pieces.reduce((n, p) => n + p.length, 0) > MAX_MESSAGE) return end();
      if (fin) {
        const text = Buffer.concat(pieces).toString('utf8');
        pieces = [];
        on.message(text);
      }
    }
  };
  socket.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    read();
  });
  // The player's side closing (end) is the end: the socket would otherwise stay half open.
  socket.on('end', end);
  socket.on('close', end);
  socket.on('error', end);
  read();
  return {
    send: (text) => {
      if (open) frame(1, Buffer.from(text, 'utf8'));
    },
    close: () => {
      if (!open) return;
      frame(8, Buffer.alloc(0));
      end();
    },
  };
}
