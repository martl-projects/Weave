/*
 * WebSocket frames (RFC 6455), as a website's tab speaks them to the website over a tunnel (docs/web-stage2.md, step 9):
 * the opening handshake, frames from the tab (masked, as a client's must be), and frames from the website, put back
 * together across chunks and fragments.
 */

export const OP = { continuation: 0, text: 1, binary: 2, close: 8, ping: 9, pong: 10 } as const;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** The upgrade request, and the key the answer has to name. */
export function upgradeRequest(path: string, host: string, protocols: string[], cookie: string | undefined, key: string): Uint8Array {
  const lines = [`GET ${path} HTTP/1.1`, `Host: ${host}`, 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Key: ${key}`, 'Sec-WebSocket-Version: 13', `Origin: ${location.origin}`];
  if (protocols.length) lines.push(`Sec-WebSocket-Protocol: ${protocols.join(', ')}`);
  if (cookie) lines.push(`Cookie: ${cookie}`);
  return encoder.encode(`${lines.join('\r\n')}\r\n\r\n`);
}

/** A frame from the tab: final, masked. */
export function frame(opcode: number, payload: Uint8Array): Uint8Array {
  const length = payload.length;
  const head = length < 126 ? 2 : length < 65536 ? 4 : 10;
  const out = new Uint8Array(head + 4 + length);
  out[0] = 0x80 | opcode;
  if (length < 126) out[1] = 0x80 | length;
  else if (length < 65536) {
    out[1] = 0x80 | 126;
    out[2] = length >> 8;
    out[3] = length & 255;
  } else {
    out[1] = 0x80 | 127;
    new DataView(out.buffer).setBigUint64(2, BigInt(length));
  }
  const mask = crypto.getRandomValues(new Uint8Array(4));
  out.set(mask, head);
  for (let i = 0; i < length; i++) out[head + 4 + i] = payload[i] ^ mask[i % 4];
  return out;
}

export const closeFrame = (code: number, reason: string): Uint8Array => {
  const text = encoder.encode(reason).subarray(0, 123);
  const payload = new Uint8Array(2 + text.length);
  payload[0] = code >> 8;
  payload[1] = code & 255;
  payload.set(text, 2);
  return frame(OP.close, payload);
};

export interface Received {
  opcode: number;
  payload: Uint8Array;
}

/** Frames from the website, as chunks arrive: whole messages out, fragments put together, control frames as they come. */
export class FrameReader {
  #buffer = new Uint8Array(0);
  #fragments: Uint8Array[] = [];
  #fragmentOp = 0;

  push(chunk: Uint8Array): Received[] {
    const all = new Uint8Array(this.#buffer.length + chunk.length);
    all.set(this.#buffer);
    all.set(chunk, this.#buffer.length);
    this.#buffer = all;
    const out: Received[] = [];
    for (;;) {
      const b = this.#buffer;
      if (b.length < 2) break;
      const fin = (b[0] & 0x80) !== 0;
      const opcode = b[0] & 0x0f;
      const masked = (b[1] & 0x80) !== 0;
      let length = b[1] & 0x7f;
      let at = 2;
      if (length === 126) {
        if (b.length < 4) break;
        length = (b[2] << 8) | b[3];
        at = 4;
      } else if (length === 127) {
        if (b.length < 10) break;
        length = Number(new DataView(b.buffer, b.byteOffset).getBigUint64(2));
        at = 10;
      }
      const maskAt = at;
      if (masked) at += 4;
      if (b.length < at + length) break;
      const payload = b.slice(at, at + length);
      if (masked) for (let i = 0; i < payload.length; i++) payload[i] ^= b[maskAt + (i % 4)];
      this.#buffer = b.slice(at + length);
      if (opcode >= 8) out.push({ opcode, payload });
      else if (opcode === OP.continuation) {
        this.#fragments.push(payload);
        if (fin) out.push({ opcode: this.#fragmentOp, payload: join(this.#fragments.splice(0)) });
      } else if (fin) out.push({ opcode, payload });
      else {
        this.#fragmentOp = opcode;
        this.#fragments = [payload];
      }
    }
    return out;
  }
}

const join = (parts: Uint8Array[]): Uint8Array => {
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) all.set(p, (at += p.length) - p.length);
  return all;
};

export const textOf = (bytes: Uint8Array): string => decoder.decode(bytes);
export const bytesOf = (text: string): Uint8Array => encoder.encode(text);

/** The answer to an upgrade, once its head is here: its status, its protocol, and what came after the head. */
export function upgradeAnswer(bytes: Uint8Array): { status: number; protocol: string; headers: Array<[string, string]>; rest: Uint8Array } | undefined {
  for (let i = 0; i + 3 < bytes.length; i++) {
    if (bytes[i] !== 13 || bytes[i + 1] !== 10 || bytes[i + 2] !== 13 || bytes[i + 3] !== 10) continue;
    const [status, ...lines] = decoder.decode(bytes.subarray(0, i)).split('\r\n');
    const headers = lines.flatMap((line) => {
      const at = line.indexOf(':');
      return at > 0 ? [[line.slice(0, at).trim(), line.slice(at + 1).trim()] as [string, string]] : [];
    });
    return { status: Number(/^HTTP\/1\.[01] (\d{3})/.exec(status)?.[1] ?? 0), protocol: headers.find(([n]) => n.toLowerCase() === 'sec-websocket-protocol')?.[1] ?? '', headers, rest: bytes.slice(i + 4) };
  }
  return undefined;
}
