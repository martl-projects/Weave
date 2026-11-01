import { randomBytes, timingSafeEqual } from 'node:crypto';
import { b64u, errorToWire } from '@weave/core';
import { createConnection } from 'node:net';
import { readLine, roomKeyPair, splice, type DhtServer, type DhtSocket } from '@weave/net';
import type { HyperDHT } from 'hyperswarm';
import type { FeedItem, RpcMethod } from './backend.ts';
import type { Home } from './home.ts';
import { encodePhoneLink } from './phone-link.ts';
import { readSecretJson, writeSecretJson } from './vault.ts';

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
 *   node → phone   {id, result} | {id, error, name?, values?}   a named error's name and values too (docs/localization.md)
 *   node → phone   {event}                  a new event, like the desktop's live updates
 * Calls a phone may not make (keys, agents, starting programs, pairing more
 * phones) are refused. The node signs what the phone posts, with its own key.
 *
 * Playing in a room: a paired phone opens one more connection per TCP
 * connection its browser makes, starting with {tunnel: roomId}, and the node
 * forwards the rest of it to the port the room's app has on this computer:
 * the room's tunnel when this node joined it, the app itself when it hosts
 * it. So the phone reaches only rooms its computer is in, as that person;
 * the room's proof and invitation stay with the computer's node.
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

/**
 * What a phone may call: everyday use of your spaces, listed one by one, so a
 * new method stays off phones until it's added here on purpose. Not on a
 * phone: keys and recovery, data export and backups, agents and their
 * permissions, company and server setup, publishing or running apps, your
 * GitHub account, and pairing phones. A lost phone can be unpaired; what it
 * can't do, it can't do before that either.
 */
/** Methods older phone apps still call by their old names: rooms are websites now. */
const RENAMED: Record<string, RpcMethod> = { rooms: 'websites', joinRoom: 'visitWebsite', leaveRoom: 'leaveWebsite', endRoom: 'closeWebsite', roomChat: 'websiteChat', sayInRoom: 'sayOnWebsite' };

export const PHONE_METHODS: readonly RpcMethod[] = [
  // You and your node
  'whoami', 'status', 'identityInfo', 'keys', 'profile', 'setProfile', 'social', 'setEdge', 'directory', 'find', 'contactLink', 'addContact', 'links', 'company', 'signInStatus', 'agentBlocked', 'harnesses', 'dismissHarnesses', 'permissionRequests', 'updateCheck',
  // Spaces and their members
  'spaces', 'createGroup', 'createProject', 'createCommunity', 'community', 'setCommunity', 'setModerator', 'project', 'setProjectPage', 'setMaintainer', 'invite', 'inviteGroup', 'uninviteGroup', 'joinSpace', 'leave', 'handOver', 'closeSpace', 'setHistory', 'setRule', 'members', 'removeMember', 'admissions', 'admit', 'decline', 'knocks', 'answerKnock', 'audit',
  'createTier', 'setTier', 'tiers', 'requestMembership', 'membershipRequests', 'grantMembership', 'declineMembership', 'memberships',
  // Home, boards and posts
  'feed', 'publish', 'setHomeVisibility', 'followBoard', 'boards', 'setBoard', 'setBoardRule', 'setBoardAccess', 'curate', 'boardView', 'boardAction', 'lensFile', 'servicePanels', 'serviceActions', 'posts', 'post', 'submit', 'editPost', 'deletePost', 'confirmCoauthor', 'coauthorRequests', 'upvote', 'save', 'share', 'putBlob', 'blob',
  'keepPost', 'fading', 'shred', 'fetchOlder', 'keepers',
  // Chat
  'chats', 'openChat', 'channels', 'createChannel', 'messages', 'say', 'deleteMessage', 'react', 'threads', 'startThread', 'reply',
  // Issues and proposals
  'issues', 'openIssue', 'claimIssue', 'setIssueStatus', 'proposals', 'propose', 'vote', 'delegateVote', 'votingDelegate',
  // Rooms and project apps (joining; hosting needs the computer)
  'websites', 'visitWebsite', 'leaveWebsite', 'closeWebsite', 'websiteChat', 'sayOnWebsite', 'projectApp', 'appReleases',
];

export { decodePhoneLink, encodePhoneLink, type PhoneLink } from './phone-link.ts';

const PAIRING_MINUTES = 10;
/** Room for one image (2 MB as base64) in a call. */
const MAX_LINE = 4 * 1024 * 1024;

/** What the remote side needs from its node. */
export interface RemoteHost {
  home(): Home;
  dht(): HyperDHT | undefined;
  bootstrap(): Array<{ host: string; port: number }>;
  /** The person this node belongs to, for the phone to show. */
  name(): string | undefined;
  call(method: RpcMethod, args: unknown[]): Promise<unknown>;
  watch(onItem: (item: FeedItem) => void, signal: AbortSignal): Promise<void>;
  /** The local port a room's app is reached on from this node, while it's in the room (joined or hosting). */
  roomPort(roomId: string): Promise<number | undefined>;
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
  /** Open room tunnels → the phone each belongs to. */
  #tunnels = new Map<DhtSocket, string>();

  constructor(host: RemoteHost) {
    this.#host = host;
  }

  get #file(): string {
    return `${this.#host.home().dir}/remote.json`;
  }

  #load(): RemoteFile {
    const stored = readSecretJson<RemoteFile>(this.#host.home(), this.#file);
    if (stored?.seed) return { seed: stored.seed, phones: stored.phones ?? [] };
    const fresh = { seed: b64u.encode(randomBytes(32)), phones: [] };
    writeSecretJson(this.#host.home(), this.#file, fresh);
    return fresh;
  }

  #save(file: RemoteFile): void {
    writeSecretJson(this.#host.home(), this.#file, file);
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
    for (const socket of this.#tunnels.keys()) socket.destroy();
    this.#tunnels.clear();
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
    for (const [socket, phone] of this.#tunnels) if (phone === key) socket.destroy();
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
    const hello = JSON.parse(line) as { pair?: unknown; name?: unknown; hello?: unknown; tunnel?: unknown };
    if (typeof hello.tunnel === 'string') return this.#tunnel(socket, key, hello.tunnel, rest);
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

  /** A room tunnel from a paired phone: the rest of the connection goes to the room's app, as this computer reaches it. */
  async #tunnel(socket: DhtSocket, phone: string, roomId: string, rest: Buffer): Promise<void> {
    socket.pause();
    const port = this.#isPaired(phone) ? await this.#host.roomPort(roomId).catch(() => undefined) : undefined;
    if (!port || socket.destroyed) return void socket.destroy();
    this.#tunnels.set(socket, phone);
    socket.on('close', () => this.#tunnels.delete(socket));
    // Yes: the phone waits for this before it sends the browser's bytes on (and tries again if it doesn't come).
    send(socket, { tunnel: true });
    const local = createConnection({ host: '127.0.0.1', port });
    local.on('error', () => socket.destroy());
    splice(socket, local, rest);
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
      const method = (RENAMED[String(message.method)] ?? message.method) as RpcMethod;
      if (!PHONE_METHODS.includes(method)) return send(socket, { id, error: `a phone can't do ${String(method)}` });
      // JSON turns undefined arguments into null; turn them back so defaults apply.
      const args = (Array.isArray(message.args) ? message.args : []).map((a) => (a === null ? undefined : a));
      this.#host.call(method, args).then(
        (result) => send(socket, { id, result: result ?? null }),
        (error: Error) => send(socket, { id, ...errorToWire(error) }),
      );
    });
  }
}
