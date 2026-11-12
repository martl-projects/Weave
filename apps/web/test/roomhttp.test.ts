import { describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import { ask, CookieJar, parseAnswer, requestBytes } from '../src/rooms/http.ts';

/* HTTP/1.1 as a website's tab speaks it over a tunnel (src/rooms/http.ts). */

const bytes = (text: string) => new TextEncoder().encode(text);
const text = (buffer: ArrayBuffer) => new TextDecoder().decode(buffer);

describe("a website's tab, speaking HTTP over a tunnel", () => {
  it('asks with keep-alive and no compression, and without the hop headers of the page', () => {
    const request = new TextDecoder().decode(requestBytes({ method: 'POST', url: '/vote?x=1', headers: [['Content-Type', 'text/plain'], ['Host', 'evil'], ['Connection', 'close'], ['X-Bad', 'a\r\nInjected: 1']], body: bytes('yes').buffer as ArrayBuffer }, 'saturday.weave-rooms.net'));
    expect(request).toBe('POST /vote?x=1 HTTP/1.1\r\nHost: saturday.weave-rooms.net\r\nConnection: keep-alive\r\nAccept-Encoding: identity\r\nContent-Type: text/plain\r\nContent-Length: 3\r\n\r\nyes');
  });

  it('reads an answer by its length, and waits while some is missing', () => {
    const answer = 'HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: 5\r\nConnection: keep-alive\r\n\r\nhello';
    expect(parseAnswer(bytes(answer.slice(0, -2)), 'GET', false)).toBeUndefined();
    const done = parseAnswer(bytes(answer), 'GET', false)!;
    expect(done.status).toBe(200);
    expect(text(done.body)).toBe('hello');
    expect(done.headers).toEqual([['Content-Type', 'text/html']]);
  });

  it('puts chunks together', () => {
    const answer = 'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nhello\r\n6\r\n world\r\n0\r\n\r\n';
    expect(parseAnswer(bytes(answer.slice(0, 40)), 'GET', false)).toBeUndefined();
    expect(text(parseAnswer(bytes(answer), 'GET', false)!.body)).toBe('hello world');
  });

  it('takes what came as all of it when the connection ends without a length', () => {
    expect(parseAnswer(bytes('HTTP/1.1 200 OK\r\n\r\nuntil the end'), 'GET', false)).toBeUndefined();
    expect(text(parseAnswer(bytes('HTTP/1.1 200 OK\r\n\r\nuntil the end'), 'GET', true)!.body)).toBe('until the end');
    expect(parseAnswer(bytes('HTTP/1.1 304 Not Modified\r\nETag: x\r\n\r\n'), 'GET', false)!.status).toBe(304);
    expect(() => parseAnswer(bytes('garbage\r\n\r\n'), 'GET', true)).toThrow(/no HTTP/);
  });

  it('keeps a tunnel for the next request when the website keeps it open, and closes it when the website says close', async () => {
    const tunnel = Object.assign(new EventEmitter(), { written: [] as string[], destroyed: false, write(data: Uint8Array) { this.written.push(new TextDecoder().decode(data)); }, end() {}, destroy() { this.destroyed = true; } });
    const answerWith = (text: string) => setTimeout(() => tunnel.emit('data', bytes(text)), 5);
    answerWith('HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok');
    const first = await ask(tunnel as never, { method: 'GET', url: '/a', headers: [] }, 'site');
    expect(first.reusable).toBe(true);
    expect(tunnel.destroyed).toBe(false);
    expect(tunnel.listenerCount('data')).toBe(0);
    answerWith('HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nno');
    const second = await ask(tunnel as never, { method: 'GET', url: '/b', headers: [] }, 'site');
    expect(text(second.answer.body)).toBe('no');
    expect(second.reusable).toBe(false);
    expect(tunnel.destroyed).toBe(true);
    expect(tunnel.written.map((w) => w.split('\r\n')[0])).toEqual(['GET /a HTTP/1.1', 'GET /b HTTP/1.1']);
  });

  it('keeps the cookies a website sets, and forgets expired ones', () => {
    const jar = new CookieJar();
    jar.take([['Set-Cookie', 'session=abc; Path=/; HttpOnly'], ['Set-Cookie', 'theme=dark'], ['Content-Type', 'text/html']]);
    expect(jar.header()).toBe('session=abc; theme=dark');
    jar.take([['Set-Cookie', 'theme=; Max-Age=0']]);
    expect(jar.header()).toBe('session=abc');
  });
});
