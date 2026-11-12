/*
 * HTTP/1.1 over one tunnel connection, as a website's tab asks its host (docs/web-stage2.md, step 9): one request, its
 * answer read to its end by Content-Length or chunks, then the connection closed from here. Keep-alive is asked for, so
 * the website doesn't close first: a host from before 11.11.2026 cut an answer off when the website closed after it.
 */

export interface Asked {
  method: string;
  /** Path and query. */
  url: string;
  headers: Array<[string, string]>;
  body?: ArrayBuffer;
}

export interface Answered {
  status: number;
  statusText: string;
  headers: Array<[string, string]>;
  body: ArrayBuffer;
  /** The website closes the connection after this answer (Connection: close). */
  closes?: boolean;
}

/** What a Duplex of the relay's is, as far as this uses it. */
export interface Tunnel {
  write(data: Uint8Array | string): unknown;
  end(): unknown;
  destroy(): unknown;
  on(event: 'data', listener: (chunk: Uint8Array) => void): unknown;
  on(event: 'end' | 'close', listener: () => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  off(event: string, listener: (...args: never[]) => void): unknown;
}

/** Headers that are about this hop, or that the tab sets itself. */
const HOP = new Set(['keep-alive', 'proxy-connection', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'host', 'content-length', 'accept-encoding']);
/** Not handed on from the page, set here: this hop's own. */
const OWN = new Set([...HOP, 'connection']);

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function requestBytes(asked: Asked, host: string): Uint8Array {
  const body = asked.body ? new Uint8Array(asked.body) : undefined;
  const lines = [`${asked.method} ${asked.url} HTTP/1.1`, `Host: ${host}`, 'Connection: keep-alive', 'Accept-Encoding: identity'];
  for (const [name, value] of asked.headers) if (!OWN.has(name.toLowerCase()) && !/[\r\n]/.test(name + value)) lines.push(`${name}: ${value}`);
  if (body || !['GET', 'HEAD'].includes(asked.method)) lines.push(`Content-Length: ${body?.length ?? 0}`);
  const head = encoder.encode(`${lines.join('\r\n')}\r\n\r\n`);
  if (!body) return head;
  const all = new Uint8Array(head.length + body.length);
  all.set(head);
  all.set(body, head.length);
  return all;
}

const concat = (a: Uint8Array, b: Uint8Array) => {
  const all = new Uint8Array(a.length + b.length);
  all.set(a);
  all.set(b, a.length);
  return all;
};

const indexOf = (bytes: Uint8Array, needle: number[], from = 0): number => {
  outer: for (let i = from; i <= bytes.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
};
const CRLF = [13, 10];
const CRLFCRLF = [13, 10, 13, 10];

/**
 * An answer, once all of it is here: undefined while more is to come. `ended`: the connection ended, so whatever came is
 * all there is (an answer without a length).
 */
export function parseAnswer(bytes: Uint8Array, method: string, ended: boolean): Answered | undefined {
  const headEnd = indexOf(bytes, CRLFCRLF);
  if (headEnd < 0) {
    if (ended) throw new Error('the website answered with no HTTP');
    return undefined;
  }
  const [statusLine, ...lines] = decoder.decode(bytes.subarray(0, headEnd)).split('\r\n');
  const status = /^HTTP\/1\.[01] (\d{3}) ?(.*)$/.exec(statusLine);
  if (!status) throw new Error('the website answered with no HTTP');
  const headers: Array<[string, string]> = lines.flatMap((line) => {
    const at = line.indexOf(':');
    return at > 0 ? [[line.slice(0, at).trim(), line.slice(at + 1).trim()] as [string, string]] : [];
  });
  const header = (name: string) => headers.find(([n]) => n.toLowerCase() === name)?.[1];
  const code = Number(status[1]);
  const rest = bytes.subarray(headEnd + 4);
  const done = (body: Uint8Array): Answered => ({ status: code, statusText: status[2], headers: headers.filter(([n]) => !OWN.has(n.toLowerCase())), body: body.slice().buffer, ...(/close/i.test(header('connection') ?? '') ? { closes: true } : {}) });
  if (method === 'HEAD' || code === 204 || code === 304 || (code >= 100 && code < 200)) return done(new Uint8Array(0));
  if (/chunked/i.test(header('transfer-encoding') ?? '')) {
    let at = 0;
    let body = new Uint8Array(0);
    for (;;) {
      const line = indexOf(rest, CRLF, at);
      if (line < 0) return ended ? done(body) : undefined;
      const size = parseInt(decoder.decode(rest.subarray(at, line)).split(';')[0], 16);
      if (Number.isNaN(size)) throw new Error('the website sent broken chunks');
      if (size === 0) return done(body);
      if (rest.length < line + 2 + size + 2) return ended ? done(body) : undefined;
      body = concat(body, rest.subarray(line + 2, line + 2 + size));
      at = line + 2 + size + 2;
    }
  }
  const length = header('content-length');
  if (length !== undefined) {
    const n = Number(length);
    return rest.length >= n ? done(rest.subarray(0, n)) : ended ? done(rest) : undefined;
  }
  return ended ? done(rest) : undefined;
}

/** Ask a website one thing over a tunnel just opened (its first line written already). */
/** An answer's head: what comes before its body. */
export interface Head {
  status: number;
  statusText: string;
  headers: Array<[string, string]>;
  /** The website closes the connection after this answer (Connection: close). */
  closes?: boolean;
}

/**
 * Ask a website one thing over a tunnel (its first line written already, maybe asked before), its answer as it comes:
 * the head, then the body piece by piece (Content-Length, chunks taken apart, or to the end of the connection), so a
 * stream (Server-Sent Events, a long download) reaches the page as it's sent. Resolves at the answer's end; `reusable`:
 * it came whole on a connection the website keeps open, so the next request can go over it, otherwise it's closed here.
 * The wait for the head is limited; a body may take as long as it takes.
 */
export function stream(tunnel: Tunnel, asked: Asked, host: string, on: { head(head: Head): void; data(bytes: Uint8Array): void }, timeoutMs = 60_000): Promise<{ reusable: boolean }> {
  return new Promise((resolve, reject) => {
    let bytes = new Uint8Array(0);
    let head: Head | undefined;
    let mode: 'none' | 'length' | 'chunked' | 'close' = 'close';
    let left = 0;
    let settled = false;
    const timer = setTimeout(() => finish(new Error('the website took too long')), timeoutMs);
    const finish = (error?: Error, reusable = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      tunnel.off('data', onData);
      tunnel.off('end', onEnd);
      tunnel.off('close', onEnd);
      tunnel.off('error', onError);
      if (!reusable) tunnel.destroy();
      if (error) reject(error);
      else resolve({ reusable });
    };
    const done = () => finish(undefined, !head?.closes && bytes.length === 0);
    const body = () => {
      if (mode === 'none') return done();
      if (mode === 'close') {
        if (bytes.length) on.data(bytes);
        bytes = new Uint8Array(0);
        return;
      }
      if (mode === 'length') {
        const piece = bytes.subarray(0, left);
        if (piece.length) on.data(piece.slice());
        left -= piece.length;
        bytes = bytes.slice(piece.length);
        if (left === 0) done();
        return;
      }
      // Chunked: as many whole chunks as are here; the rest waits for more.
      for (;;) {
        const line = indexOf(bytes, CRLF);
        if (line < 0) return;
        const size = parseInt(decoder.decode(bytes.subarray(0, line)).split(';')[0], 16);
        if (Number.isNaN(size)) return finish(new Error('the website sent broken chunks'));
        if (size === 0) {
          // The last chunk, and its empty trailer if it's here: then the connection is clean for the next request.
          const trailerEnd = indexOf(bytes, CRLFCRLF, line);
          bytes = trailerEnd === line ? bytes.slice(line + 4) : bytes.slice(line + 2);
          return finish(undefined, trailerEnd === line && bytes.length === 0 && !head?.closes);
        }
        if (bytes.length < line + 2 + size + 2) return;
        on.data(bytes.slice(line + 2, line + 2 + size));
        bytes = bytes.slice(line + 2 + size + 2);
      }
    };
    const onData = (chunk: Uint8Array) => {
      bytes = concat(bytes, chunk);
      if (!head) {
        const headEnd = indexOf(bytes, CRLFCRLF);
        if (headEnd < 0) return;
        const [statusLine, ...lines] = decoder.decode(bytes.subarray(0, headEnd)).split('\r\n');
        const status = /^HTTP\/1\.[01] (\d{3}) ?(.*)$/.exec(statusLine);
        if (!status) return finish(new Error('the website answered with no HTTP'));
        const headers: Array<[string, string]> = lines.flatMap((line) => {
          const at = line.indexOf(':');
          return at > 0 ? [[line.slice(0, at).trim(), line.slice(at + 1).trim()] as [string, string]] : [];
        });
        const header = (name: string) => headers.find(([n]) => n.toLowerCase() === name)?.[1];
        const code = Number(status[1]);
        clearTimeout(timer);
        head = { status: code, statusText: status[2], headers: headers.filter(([n]) => !OWN.has(n.toLowerCase())), ...(/close/i.test(header('connection') ?? '') ? { closes: true } : {}) };
        bytes = bytes.slice(headEnd + 4);
        if (asked.method === 'HEAD' || code === 204 || code === 304 || (code >= 100 && code < 200)) mode = 'none';
        else if (/chunked/i.test(header('transfer-encoding') ?? '')) mode = 'chunked';
        else if (header('content-length') !== undefined) (mode = 'length'), (left = Number(header('content-length')));
        else mode = 'close';
        on.head(head);
      }
      body();
    };
    const onEnd = () => (head ? finish(undefined, false) : finish(new Error('the website closed before answering')));
    const onError = (error: Error) => (head ? finish(undefined, false) : finish(error));
    tunnel.on('data', onData);
    tunnel.on('end', onEnd);
    tunnel.on('close', onEnd);
    tunnel.on('error', onError);
    tunnel.write(requestBytes(asked, host));
  });
}

/**
 * Ask a website one thing, and its whole answer (built on stream): `reusable` as there.
 */
export async function ask(tunnel: Tunnel, asked: Asked, host: string, timeoutMs = 60_000): Promise<{ answer: Answered; reusable: boolean }> {
  let head: Head | undefined;
  const parts: Uint8Array[] = [];
  const { reusable } = await stream(tunnel, asked, host, { head: (h) => (head = h), data: (bytes) => parts.push(bytes) }, timeoutMs);
  const body = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) (body.set(p, at), (at += p.length));
  return { answer: { ...head!, body: body.buffer }, reusable };
}

/**
 * Cookies, kept by the tab: an answer a service worker makes can't set any, so what the website sets is kept here and
 * sent with what goes to it. Names and values only, for this website's tab while it's open.
 */
export class CookieJar {
  readonly #cookies = new Map<string, string>();

  take(headers: Array<[string, string]>): void {
    for (const [name, value] of headers) {
      if (name.toLowerCase() !== 'set-cookie') continue;
      const [pair, ...attributes] = value.split(';');
      const at = pair.indexOf('=');
      if (at <= 0) continue;
      const key = pair.slice(0, at).trim();
      const expired = attributes.some((a) => /^\s*max-age\s*=\s*(0|-)/i.test(a) || (/^\s*expires\s*=/i.test(a) && Date.parse(a.split('=').slice(1).join('=')) < Date.now()));
      if (expired) this.#cookies.delete(key);
      else this.#cookies.set(key, pair.slice(at + 1).trim());
    }
  }

  header(): string | undefined {
    return this.#cookies.size ? [...this.#cookies].map(([k, v]) => `${k}=${v}`).join('; ') : undefined;
  }
}
