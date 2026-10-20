import { randomBytes, timingSafeEqual } from 'node:crypto';
import { b64u, canonicalJson, utf8, type Json } from '@weave/core';
import { readLine, roomKeyPair, type DhtServer, type DhtSocket } from '@weave/net';
import type { HyperDHT } from 'hyperswarm';
import { RPC_METHODS, type FeedItem, type RpcMethod } from './backend.ts';
import { readJson, writeJson, type Home } from './home.ts';

/*
 * Remote access for paired phones: the companion app on a phone uses this
 * node (the desktop, later a helper) over an encrypted Hyperswarm connection,
 * with no server in between. The node listens on a DHT key of its own; a
 * phone connects with its own key pair, and the Noise handshake proves both
 * keys, so a connection from a paired phone's key is that phone.
 *
 * Pairing: the desktop shows a link (as a QR code) with the node's key and a
 * one-time secret, valid for ten minutes. The phone connects and sends the
 * secret with its name; from then on its key is paired until it's unpaired.
 * Unknown keys are refused during the handshake, before any data flows,
 * except while a pairing link is open.
 *
 * Then one JSON message per line:
 *   phone → node   {id, method, args}       a call, as the desktop app makes them
 *   node → phone   {id, result} | {id, error}
 *   node → phone   {event}                  a new event, like the desktop's live updates
 * Calls a phone may not make (keys, agents, starting programs, pairing more
 * phones) are refused. The node signs what the phone posts, with its own key.
 */

export interface PairedPhone {
  /** The phone's connection key (hex). */
  key: string;
  name: string;
  paired: string;
  lastSeen?: string;
}

export interface PairingOffer {
  /** What the QR code holds: weave:phone:… */
  link: string;
  expires: string;
}

/** What a phone may call: what the desktop app may, minus key management, agents, local programs and phone pairing. */
export const PHONE_METHODS: readonly RpcMethod[] = RPC_METHODS.filter(
  (m) => !['addAgent', 'join', 'revokeKey', 'rotateRoot', 'setAppFolder', 'installApp', 'launchApp', 'stopApp', 'pairPhone', 'phones', 'unpairPhone'].includes(m),
);

/** What a pairing link carries. */
export interface PhoneLink {
  v: 1;
  /** The node's remote DHT key (hex). */
  node: string;
  secret: string;
  expires: string;
  /** Whose node it is, for the phone to show. */
  name?: string;
  /** DHT bootstrap nodes, when the node isn't on the public network (tests). */
  bootstrap?: Array<{ host: string; port: number }>;
}

const PREFIX = 'weave:phone:';
const PAIRING_MINUTES = 10;
/** Room for one image (2 MB as base64) in a call. */
const MAX_LINE = 4 * 1024 * 1024;

export const encodePhoneLink = (link: PhoneLink): string => PREFIX + b64u.encode(utf8(canonicalJson(link as unknown as Json)));

export function decodePhoneLink(text: string): PhoneLink {
  const trimmed = text.trim();
  if (!trimmed.startsWith(PREFIX)) throw new Error('not a Weave pairing code');
  let link: PhoneLink;
  try {
    link = JSON.parse(new TextDecoder().decode(b64u.decode(trimmed.slice(PREFIX.length))));
  } catch {
    throw new Error('the pairing code is damaged');
  }
  if (link?.v !== 1 || !/^[0-9a-f]{64}$/.test(link.node ?? '') || typeof link.secret !== 'string') throw new Error('the pairing code is damaged or from a newer Weave');
  if (Date.parse(link.expires) < Date.now()) throw new Error('the pairing code has expired: show a new one on your computer');
  return link;
}

/** What the remote side needs from its node. */
export interface RemoteHost {
  home(): Home;
  dht(): HyperDHT | undefined;
  bootstrap(): Array<{ host: string; port: number }>;
  /** The person this node belongs to, for the phone to show. */
  name(): string | undefined;
  call(method: RpcMethod, args: unknown[]): Promise<unknown>;
  watch(onItem: (item: FeedItem) => void, signal: AbortSignal): Promise<void>;
}

interface RemoteFile {
  /** Seed of the node's remote DHT key: stays the same across restarts, so phones find it again. */
  seed: string;
  phones: PairedPhone[];
}

/** Read newline-separated JSON messages from a stream, after its first line. */
function onLines(socket: DhtSocket, rest: Buffer, handle: (message: Record<string, unknown>) => void): void {
  let buffer = rest.toString('utf8');
  const drain = () => {
    let end: number;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      try {
        handle(JSON.parse(line) as Record<string, unknown>);
      } catch {
        socket.destroy();
        return;
      }
    }
    if (buffer.length > MAX_LINE) socket.destroy();
  };
  socket.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
    drain();
  });
  drain();
  socket.resume();
}

const send = (socket: DhtSocket, message: unknown) => {
  if (!socket.destroyed) socket.write(`${JSON.stringify(message)}\n`);
};

export class RemoteAccess {
  #host: RemoteHost;
  #server?: DhtServer;
  #offers = new Map<string, string>(); // secret → expires
  #sessions = new Map<DhtSocket, { phone: string; stop: AbortController }>();

  constructor(host: RemoteHost) {
    this.#host = host;
  }

  get #file(): string {
    return `${this.#host.home().dir}/remote.json`;
  }

  #load(): RemoteFile {
    const stored = readJson<RemoteFile>(this.#file);
    if (stored?.seed) return { seed: stored.seed, phones: stored.phones ?? [] };
    const fresh = { seed: b64u.encode(randomBytes(32)), phones: [] };
    writeJson(this.#file, fresh);
    return fresh;
  }

  #save(file: RemoteFile): void {
    writeJson(this.#file, file);
  }

  #keyPair() {
    return roomKeyPair(b64u.decode(this.#load().seed));
  }

  /** Listen for phones. Called once the node is online. */
  async start(): Promise<void> {
    if (this.#server) return;
    const dht = this.#host.dht();
    if (!dht) throw new Error('remote access needs the node online');
    // Refused during the handshake: keys that aren't paired, unless a pairing link is open.
    const server = dht.createServer({ firewall: (remote) => !this.#isPaired(remote.toString('hex')) && !this.#pairingOpen() });
    server.on('connection', (socket) => void this.#accept(socket).catch(() => socket.destroy()));
    await server.listen(this.#keyPair());
    this.#server = server;
  }

  async close(): Promise<void> {
    for (const [socket, session] of this.#sessions) {
      session.stop.abort();
      socket.destroy();
    }
    this.#sessions.clear();
    await this.#server?.close();
    this.#server = undefined;
  }

  /** A pairing link for a new phone, valid for ten minutes and once. */
  pair(): PairingOffer {
    if (!this.#server) throw new Error("pairing a phone needs your node online: keep Weave running (it's starting up, try again in a moment)");
    const secret = b64u.encode(randomBytes(24));
    const expires = new Date(Date.now() + PAIRING_MINUTES * 60_000).toISOString();
    this.#offers.set(secret, expires);
    const name = this.#host.name();
    const bootstrap = this.#host.bootstrap();
    const link = encodePhoneLink({ v: 1, node: this.#keyPair().publicKey.toString('hex'), secret, expires, ...(name ? { name } : {}), ...(bootstrap.length ? { bootstrap } : {}) });
    return { link, expires };
  }

  phones(): PairedPhone[] {
    const live = new Set([...this.#sessions.values()].map((s) => s.phone));
    return this.#load().phones.map((p) => ({ ...p, ...(live.has(p.key) ? { lastSeen: new Date().toISOString() } : {}) }));
  }

  /** Unpair a phone: it's disconnected at once and refused from then on. */
  unpair(key: string): void {
    const file = this.#load();
    if (!file.phones.some((p) => p.key === key)) throw new Error('no phone with that key is paired');
    this.#save({ ...file, phones: file.phones.filter((p) => p.key !== key) });
    for (const [socket, session] of this.#sessions) {
      if (session.phone !== key) continue;
      session.stop.abort();
      socket.destroy();
      this.#sessions.delete(socket);
    }
  }

  #isPaired(key: string): boolean {
    return this.#load().phones.some((p) => p.key === key);
  }

  #pairingOpen(): boolean {
    const now = new Date().toISOString();
    for (const [secret, expires] of this.#offers) if (expires < now) this.#offers.delete(secret);
    return this.#offers.size > 0;
  }

  async #accept(socket: DhtSocket): Promise<void> {
    socket.on('error', () => socket.destroy());
    const key = socket.remotePublicKey.toString('hex');
    const { line, rest } = await readLine(socket, 4096);
    const hello = JSON.parse(line) as { pair?: unknown; name?: unknown; hello?: unknown };
    if (typeof hello.pair === 'string') {
      const expires = this.#takeOffer(hello.pair);
      if (!expires) {
        send(socket, { error: 'that pairing code is no longer valid: show a new one on your computer' });
        return void socket.end();
      }
      const file = this.#load();
      const name = typeof hello.name === 'string' && hello.name.trim() ? hello.name.trim().slice(0, 60) : 'Phone';
      this.#save({ ...file, phones: [...file.phones.filter((p) => p.key !== key), { key, name, paired: new Date().toISOString() }] });
      send(socket, { paired: true, name: this.#host.name() ?? null });
    } else if (!this.#isPaired(key)) {
      send(socket, { error: 'this phone is not paired (any more): pair it again on your computer' });
      return void socket.end();
    } else {
      send(socket, { hello: true, name: this.#host.name() ?? null });
    }
    this.#serve(socket, key, rest);
  }

  /** Use up a pairing secret (compared in constant time); its expiry if it was valid. */
  #takeOffer(given: string): string | undefined {
    this.#pairingOpen(); // drop expired ones
    for (const [secret, expires] of this.#offers) {
      const a = Buffer.from(secret);
      const b = Buffer.from(given);
      if (a.length === b.length && timingSafeEqual(a, b)) {
        this.#offers.delete(secret);
        return expires;
      }
    }
    return undefined;
  }

  #serve(socket: DhtSocket, phone: string, rest: Buffer): void {
    const stop = new AbortController();
    this.#sessions.set(socket, { phone, stop });
    socket.on('close', () => {
      stop.abort();
      this.#sessions.delete(socket);
    });
    void this.#host.watch((item) => send(socket, { event: item }), stop.signal).catch(() => {});
    onLines(socket, rest, (message) => {
      const id = message.id;
      const method = message.method as RpcMethod;
      if (!PHONE_METHODS.includes(method)) return send(socket, { id, error: `a phone can't do ${String(method)}` });
      // JSON turns undefined arguments into null; turn them back so defaults apply.
      const args = (Array.isArray(message.args) ? message.args : []).map((a) => (a === null ? undefined : a));
      this.#host.call(method, args).then(
        (result) => send(socket, { id, result: result ?? null }),
        (error: Error) => send(socket, { id, error: error.message }),
      );
    });
  }
}
