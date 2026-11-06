import { sha256 } from '@noble/hashes/sha2.js';
import { b64u, ephemeralKeys, sharedSecret, utf8 } from '@weave/core';
import type { PeerStream } from './session2.ts';

/*
 * A peer connection over a WebSocket (Weave Web, docs/web-stage2.md): what Hyperswarm's secret stream gives a
 * PeerSession2 on the DHT, for a browser that can't be on the DHT and talks to its storage node.
 *
 * A session needs a handshake hash: it binds a space's tags to this one connection, so a tag seen on one can't be
 * replayed on another. A page can't read TLS's, so both ends agree on their own first:
 *   {weave: 'ws/1', key}   each end's fresh X25519 key, one frame each way
 *   hash = SHA-256("weave/ws/v1" ‖ shared secret ‖ initiator's key ‖ responder's key)
 * Whoever sits in between has a different hash on each side, so the tags it sees are worth nothing on the other.
 * Keeping what's said private is left to the TLS around it (wss) and to the seals on the events inside.
 *
 * Runs in a browser: nothing from node:*. After the hello, a frame is any piece of the session's text, so a long
 * message goes as several frames, under what the WebSocket on the other end takes.
 */

/** The largest frame, in characters: at most three bytes each, under the server's MAX_MESSAGE (1 MB). */
export const MAX_FRAME_TEXT = 256 * 1024;
const HELLO_MS = 10_000;

/** A WebSocket as this needs it: the browser's and websocket.ts's fit behind it. */
export interface TextSocket {
  send(text: string): void;
  close(): void;
  /** Called once, with what to do with each text message. What arrived before is the carrier's to hold or hand on. */
  onMessage(handle: (text: string) => void): void;
  onClose(handle: () => void): void;
}

class WsPeerStream implements PeerStream {
  readonly handshakeHash: Uint8Array;
  readonly isInitiator: boolean;
  #socket: TextSocket;
  #data: Array<(chunk: string) => void> = [];
  #closed: Array<() => void> = [];
  #early: string[] = [];
  #open = true;

  constructor(socket: TextSocket, handshakeHash: Uint8Array, isInitiator: boolean) {
    this.#socket = socket;
    this.handshakeHash = handshakeHash;
    this.isInitiator = isInitiator;
  }

  on(event: string, listener: (...args: any[]) => void): void {
    if (event === 'data') {
      this.#data.push(listener);
      // As on any stream, what's waiting comes after this turn: a session is still being set up as it listens.
      queueMicrotask(() => {
        for (const text of this.#early.splice(0)) this.receive(text);
      });
    } else if (event === 'close') this.#closed.push(listener);
  }

  write(text: string): void {
    if (!this.#open) return;
    for (let at = 0; at < text.length; ) {
      let end = Math.min(at + MAX_FRAME_TEXT, text.length);
      // Never between the two halves of a character: a frame is encoded on its own.
      if (end < text.length && (text.charCodeAt(end - 1) & 0xfc00) === 0xd800) end--;
      this.#socket.send(text.slice(at, end));
      at = end;
    }
  }

  destroy(): void {
    if (!this.#open) return;
    this.#socket.close();
    this.ended();
  }

  receive(text: string): void {
    if (!this.#data.length) this.#early.push(text);
    else for (const listen of this.#data) listen(text);
  }

  ended(): void {
    if (!this.#open) return;
    this.#open = false;
    for (const listen of this.#closed) listen();
  }
}

/** Agree on a connection over a socket just opened, as the end that dialled (`initiator`) or the end that answered. */
export function wsPeerStream(socket: TextSocket, initiator: boolean): Promise<WsPeerStream> {
  const mine = ephemeralKeys();
  return new Promise((resolve, reject) => {
    let stream: WsPeerStream | undefined;
    const fail = (why: string) => {
      clearTimeout(timer);
      reject(new Error(why)); // first: closing calls back here, and the first reason is the one
      socket.close();
    };
    const timer = setTimeout(() => fail('no hello on the connection'), HELLO_MS);
    socket.onClose(() => {
      if (stream) stream.ended();
      else fail('the connection closed before its hello');
    });
    socket.onMessage((text) => {
      if (stream) return stream.receive(text);
      try {
        const hello = JSON.parse(text) as { weave?: unknown; key?: unknown };
        if (hello.weave !== 'ws/1' || typeof hello.key !== 'string') return fail('not a Weave connection');
        const theirs = b64u.decode(hello.key);
        if (theirs.length !== 32 || b64u.encode(theirs) === b64u.encode(mine.publicKey)) return fail('not a Weave connection');
        const [first, second] = initiator ? [mine.publicKey, theirs] : [theirs, mine.publicKey];
        const hash = sha256(new Uint8Array([...utf8('weave/ws/v1'), ...sharedSecret(mine.secretKey, theirs), ...first, ...second]));
        clearTimeout(timer);
        stream = new WsPeerStream(socket, hash, initiator);
        resolve(stream);
      } catch {
        fail('not a Weave connection');
      }
    });
    socket.send(JSON.stringify({ weave: 'ws/1', key: b64u.encode(mine.publicKey) }));
  });
}
