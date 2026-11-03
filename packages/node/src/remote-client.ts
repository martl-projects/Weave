import { errorFromWire, type ErrorAnswer } from '@weave/core';
import type { DhtSocket } from '@weave/net';
import type { FeedItem, RpcMethod } from './backend.ts';
import { decodePhoneLink } from './phone-link.ts';

/*
 * The phone's side of remote access (see remote.ts): pair with a node from
 * its pairing link, then call it and receive its live events. It only needs
 * a DHT to connect through, so the same code runs in Node (tests, a desktop
 * stand-in) and later in the phone app's worker.
 */

type KeyPair = { publicKey: Buffer; secretKey: Buffer };

/**
 * How long a new connection may stay silent before it counts as stalled. hyperdht sometimes settles on a way to
 * the computer that leads nowhere and only gives up after about 12 s; a fresh attempt usually gets through at once.
 */
const STALL_MS = 4000;
/** Attempts per connection, stalled ones included. */
const ATTEMPTS = 3;

class Stalled extends Error {}

/** Try again when an attempt stalled; any other failure is the answer. */
async function patiently<T>(attempt: () => Promise<T>): Promise<T> {
  for (let n = 1; ; n++) {
    try {
      return await attempt();
    } catch (error) {
      if (!(error instanceof Stalled) || n >= ATTEMPTS) throw error;
    }
  }
}

/** The DHT calls this needs (hyperdht's). */
export interface Dialer {
  connect(publicKey: Buffer, options?: { keyPair?: KeyPair }): DhtSocket;
}

export interface RemoteSession {
  /** Whose node this is. */
  name?: string;
  call<T = unknown>(method: RpcMethod, ...args: unknown[]): Promise<T>;
  onEvent(listener: (item: FeedItem) => void): () => void;
  onClose(listener: () => void): void;
  close(): void;
}

/** A paired node, as the phone remembers it. */
export interface PairedNode {
  /** The node's remote DHT key (hex). */
  node: string;
  name?: string;
  bootstrap?: Array<{ host: string; port: number }>;
}

/** Pair this phone (its key pair) with a node, using the link from the node's QR code. */
export async function pairWith(dht: Dialer, linkText: string, keyPair: KeyPair, phoneName: string): Promise<{ node: PairedNode; session: RemoteSession }> {
  const link = decodePhoneLink(linkText);
  const session = await open(dht, link.node, keyPair, { pair: link.secret, name: phoneName });
  return { node: { node: link.node, ...(session.name ? { name: session.name } : {}), ...(link.bootstrap ? { bootstrap: link.bootstrap } : {}) }, session };
}

/** Connect to a node this phone is paired with. */
export function connectTo(dht: Dialer, node: PairedNode, keyPair: KeyPair): Promise<RemoteSession> {
  return open(dht, node.node, keyPair, { hello: 1 });
}

/** A way into a room, which the computer said yes to: its socket, and what came after that yes (the app's first bytes). */
export interface Tunnel {
  socket: DhtSocket;
  rest: Buffer;
}

/**
 * One connection into a room the computer is in, for one TCP connection of the phone's browser: once the computer
 * says yes, the socket carries that connection's bytes to the room's app. Fails when the computer can't (it closes).
 */
export function openTunnel(dht: Dialer, node: PairedNode, keyPair: KeyPair, roomId: string): Promise<Tunnel> {
  return patiently(() => tunnelOnce(dht, node, keyPair, roomId));
}

function tunnelOnce(dht: Dialer, node: PairedNode, keyPair: KeyPair, roomId: string): Promise<Tunnel> {
  return new Promise((resolve, reject) => {
    const socket = dht.connect(Buffer.from(node.node, 'hex'), { keyPair });
    let got = Buffer.alloc(0);
    const done = () => {
      clearTimeout(stall);
      socket.removeListener('data', ondata);
      socket.removeListener('close', onclose);
      socket.removeListener('error', onerror);
    };
    const give = (error: Error) => {
      done();
      socket.on('error', () => {});
      socket.destroy();
      reject(error);
    };
    const stall = setTimeout(() => give(new Stalled('connection timed out')), STALL_MS);
    const ondata = (chunk: Buffer) => {
      got = Buffer.concat([got, chunk]);
      const end = got.indexOf(10);
      if (end < 0) return got.length > 4096 ? give(new Error('your computer answered something else')) : undefined;
      let yes = false;
      try {
        yes = (JSON.parse(got.subarray(0, end).toString('utf8')) as { tunnel?: unknown }).tunnel === true;
      } catch {
        // not an answer this phone knows
      }
      if (!yes) return give(new Error('your computer answered something else'));
      done();
      socket.pause();
      resolve({ socket, rest: got.subarray(end + 1) });
    };
    const onclose = () => give(new Error("your computer can't reach that room"));
    const onerror = (error: Error) => give(error);
    socket.on('data', ondata);
    socket.on('close', onclose);
    socket.on('error', onerror);
    socket.write(`${JSON.stringify({ tunnel: roomId })}\n`);
  });
}

function open(dht: Dialer, nodeKey: string, keyPair: KeyPair, hello: Record<string, unknown>): Promise<RemoteSession> {
  return patiently(() => openOnce(dht, nodeKey, keyPair, hello));
}

function openOnce(dht: Dialer, nodeKey: string, keyPair: KeyPair, hello: Record<string, unknown>): Promise<RemoteSession> {
  return new Promise((resolve, reject) => {
    const socket = dht.connect(Buffer.from(nodeKey, 'hex'), { keyPair });
    // No answer yet after a while: give this attempt up (the caller tries again).
    const stall = setTimeout(() => {
      if (ready) return;
      reject(new Stalled('connection timed out'));
      socket.destroy();
    }, STALL_MS);
    const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
    const listeners = new Set<(item: FeedItem) => void>();
    const closers = new Set<() => void>();
    let next = 1;
    let ready = false;
    let buffer = '';

    const session: RemoteSession = {
      call: <T>(method: RpcMethod, ...args: unknown[]) =>
        new Promise<T>((ok, fail) => {
          if (socket.destroyed) return fail(new Error('not connected to your computer'));
          const id = next++;
          pending.set(id, { resolve: ok as (value: unknown) => void, reject: fail });
          socket.write(`${JSON.stringify({ id, method, args })}\n`);
        }),
      onEvent(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      onClose: (listener) => void closers.add(listener),
      close: () => socket.destroy(),
    };

    const fail = (error: Error) => {
      clearTimeout(stall);
      if (!ready) reject(error);
      for (const p of pending.values()) p.reject(new Error('the connection to your computer closed'));
      pending.clear();
    };
    socket.on('error', (error: Error) => {
      fail(error);
      socket.destroy();
    });
    socket.on('close', () => {
      fail(new Error("couldn't reach your computer: is Weave running there?"));
      for (const listener of closers) listener();
    });
    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      let end: number;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        let message: Record<string, unknown>;
        try {
          message = JSON.parse(line) as Record<string, unknown>;
        } catch {
          socket.destroy();
          return;
        }
        if (!ready) {
          if (typeof message.error === 'string') {
            reject(new Error(message.error));
            socket.destroy();
            return;
          }
          ready = true;
          clearTimeout(stall);
          if (typeof message.name === 'string') session.name = message.name;
          resolve(session);
        } else if ('event' in message) {
          for (const listener of listeners) listener(message.event as FeedItem);
        } else {
          const call = pending.get(message.id as number);
          if (!call) continue;
          pending.delete(message.id as number);
          // A named error (docs/localization.md, "Texts the daemon writes") is a WeaveError again here.
          if (typeof message.error === 'string') call.reject(errorFromWire(message as Partial<ErrorAnswer>, message.error));
          else call.resolve(message.result);
        }
      }
    });
    socket.write(`${JSON.stringify(hello)}\n`);
  });
}
