import { createHash, randomUUID } from 'node:crypto';
import { createConnection, createServer, type Server, type Socket } from 'node:net';
import { b64u, canonicalJson, publicKeyFromDid, sign, utf8, verify, type Did, type Json, type Room, type SigningIdentity } from '@weave/core';
import { readLine, roomKeyPair, splice, type DhtServer, type DhtSocket } from '@weave/net';
import type { HyperDHT } from 'hyperswarm';

/*
 * The live side of rooms: nothing here is ever written to the logs.
 *
 * The host listens on the room's DHT key. Every connection a player opens
 * starts with a proof (who they are, signed by their device key, bound to
 * this very connection); the host drops anyone it can't verify or who isn't
 * invited. A player keeps one control connection (presence and the room
 * chat, relayed by the host) and opens one more connection per TCP connection
 * the app makes (its HTTP requests, WebSockets), each forwarded to the one
 * port the room shares. Players connect only to the host, never to each other.
 * The host also tells players whether its app answers on that port, so they
 * wait for it instead of opening a window onto nothing.
 *
 * Each tunnel reaches the app from its own local port, so the host knows who
 * is behind every connection the app sees (personOnPort): that's how apps
 * learn who their players are, without anything added to their traffic.
 */

export interface RoomMessage {
  id: string;
  from: Did;
  name?: string;
  text: string;
  time: string;
}

interface Proof {
  room: string;
  person: Did;
  signer: Did;
  /** This connection's own DHT public key (hex): a proof can't be replayed on another connection. */
  key: string;
  purpose: 'control' | 'tunnel';
  time: string;
}

/** What the runtime needs from its node. */
export interface LiveHost {
  dht(): HyperDHT | undefined;
  signer(): SigningIdentity;
  /** The person a key signs for, if it may sign for them now. */
  personOf(signer: Did): Did | undefined;
  mayJoin(room: Room, person: Did): boolean;
  /** The port this node's room shares (host side). */
  servicePort(room: Room): number | undefined;
  seed(roomId: string): Uint8Array;
  nameOf(did: Did): string | undefined;
  changed(): void;
}

interface Hosting {
  room: Room;
  server: DhtServer;
  controls: Map<DhtSocket, Did>;
  chat: RoomMessage[];
  /** Whether the app answers on the room's port, as last checked. */
  appReady: boolean;
  watch?: NodeJS.Timeout;
}

interface Joined {
  room: Room;
  control?: DhtSocket;
  tcp: Server;
  port: number;
  chat: RoomMessage[];
  peers: Did[];
  connected: boolean;
  /** Whether the host's app is running; hosts before this was sent only report connections. */
  appReady?: boolean;
}

const MAX_CHAT = 200;
const MAX_LINE = 8_192;
const MAX_CONTROLS = 64;
const APP_CHECK_MS = 2000;

const send = (socket: DhtSocket, message: Record<string, Json>) => socket.write(`${JSON.stringify(message)}\n`);

/** Read newline-separated JSON messages from a stream (after its first line). */
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

export class LiveRooms {
  #host: LiveHost;
  #hosting = new Map<string, Hosting>();
  /** Host side: the local port of each tunnel into the app → who opened it, in which room. */
  #tunnels = new Map<number, { person: Did; room: string; socket: Socket }>();
  #joined = new Map<string, Joined>();

  constructor(host: LiveHost) {
    this.#host = host;
  }

  isHosting = (roomId: string): boolean => this.#hosting.has(roomId);
  isJoined = (roomId: string): boolean => this.#joined.has(roomId);

  /** Who is in a room right now, as this node sees it. */
  peers(roomId: string): Did[] {
    const hosting = this.#hosting.get(roomId);
    if (hosting) return [hosting.room.host, ...new Set(hosting.controls.values())];
    return this.#joined.get(roomId)?.peers ?? [];
  }

  chat(roomId: string): RoomMessage[] {
    return this.#hosting.get(roomId)?.chat ?? this.#joined.get(roomId)?.chat ?? [];
  }

  connected(roomId: string): boolean {
    return this.#hosting.has(roomId) || !!this.#joined.get(roomId)?.connected;
  }

  /** Player side: connected, and the host's app answers (as far as the host says). */
  appReady(roomId: string): boolean {
    const joined = this.#joined.get(roomId);
    return !!joined?.connected && joined.appReady !== false;
  }

  /** Host side: who is behind the app's connection from this local port, if it came through one of our rooms. */
  personOnPort(port: number): { person: Did; room: string } | undefined {
    const tunnel = this.#tunnels.get(port);
    return tunnel && this.#hosting.has(tunnel.room) ? { person: tunnel.person, room: tunnel.room } : undefined;
  }

  localPort(roomId: string): number | undefined {
    return this.#joined.get(roomId)?.port;
  }

  // ---------------------------------------------------------------- host side

  async host(room: Room): Promise<void> {
    if (this.#hosting.has(room.id)) return;
    const dht = this.#need();
    const server = dht.createServer();
    const hosting: Hosting = { room, server, controls: new Map(), chat: [], appReady: false };
    server.on('connection', (socket) => void this.#accept(hosting, socket).catch(() => socket.destroy()));
    await server.listen(roomKeyPair(this.#host.seed(room.id)));
    await this.#checkApp(hosting);
    hosting.watch = setInterval(() => void this.#checkApp(hosting), APP_CHECK_MS).unref();
    this.#hosting.set(room.id, hosting);
    this.#host.changed();
  }

  async stopHosting(roomId: string): Promise<void> {
    const hosting = this.#hosting.get(roomId);
    if (!hosting) return;
    this.#hosting.delete(roomId);
    clearInterval(hosting.watch);
    for (const socket of hosting.controls.keys()) socket.destroy();
    await hosting.server.close().catch(() => {});
    this.#host.changed();
  }

  async #accept(hosting: Hosting, socket: DhtSocket): Promise<void> {
    socket.on('error', () => socket.destroy());
    const { line, rest } = await readLine(socket);
    const person = this.#verify(hosting.room, socket, line);
    if (!person) return void socket.destroy();
    const proof = JSON.parse(line).proof as Proof;
    if (proof.purpose === 'tunnel') {
      const port = this.#host.servicePort(hosting.room);
      if (!port) return void socket.destroy();
      const local = createConnection({ host: '127.0.0.1', port });
      local.on('error', () => socket.destroy());
      // Registered before splice, so it runs before any bytes reach the app (and the app could ask who sent them).
      local.once('connect', () => {
        const at = local.localPort;
        if (!at) return;
        this.#tunnels.set(at, { person, room: hosting.room.id, socket: local });
        local.once('close', () => {
          if (this.#tunnels.get(at)?.socket === local) this.#tunnels.delete(at);
        });
      });
      splice(socket, local, rest);
      return;
    }
    if (hosting.controls.size >= MAX_CONTROLS) return void socket.destroy();
    hosting.controls.set(socket, person);
    socket.on('close', () => {
      hosting.controls.delete(socket);
      this.#broadcastState(hosting);
      this.#host.changed();
    });
    onLines(socket, rest, (message) => {
      if (message.type === 'say' && typeof message.text === 'string') this.#post(hosting, person, message.text);
    });
    send(socket, { type: 'state', peers: this.peers(hosting.room.id), chat: hosting.chat.slice(-50) as unknown as Json, appReady: hosting.appReady });
    this.#broadcastState(hosting);
    this.#host.changed();
  }

  #verify(room: Room, socket: DhtSocket, line: string): Did | undefined {
    try {
      const { proof, sig } = JSON.parse(line) as { proof: Proof; sig: string };
      if (!proof || proof.room !== room.id || proof.key !== socket.remotePublicKey.toString('hex')) return undefined;
      if (!verify(b64u.decode(sig), utf8(canonicalJson(proof as unknown as Json)), publicKeyFromDid(proof.signer))) return undefined;
      const person = this.#host.personOf(proof.signer);
      if (person !== proof.person || !this.#host.mayJoin(room, person)) return undefined;
      return person;
    } catch {
      return undefined;
    }
  }

  #post(hosting: Hosting, from: Did, text: string): void {
    const clean = text.trim().slice(0, 2000);
    if (!clean) return;
    const message: RoomMessage = { id: randomUUID(), from, name: this.#host.nameOf(from), text: clean, time: new Date().toISOString() };
    hosting.chat.push(message);
    if (hosting.chat.length > MAX_CHAT) hosting.chat.splice(0, hosting.chat.length - MAX_CHAT);
    for (const socket of hosting.controls.keys()) send(socket, { type: 'chat', message: message as unknown as Json });
    this.#host.changed();
  }

  /** Tell players when the app starts or stops answering on the room's port. */
  async #checkApp(hosting: Hosting): Promise<void> {
    const port = this.#host.servicePort(hosting.room);
    const ready = !!port && (await portOpen(port));
    if (ready === hosting.appReady) return;
    hosting.appReady = ready;
    for (const socket of hosting.controls.keys()) send(socket, { type: 'app', ready });
    this.#host.changed();
  }

  #broadcastState(hosting: Hosting): void {
    for (const socket of hosting.controls.keys()) send(socket, { type: 'peers', peers: this.peers(hosting.room.id) });
  }

  // ---------------------------------------------------------------- player side

  /** Join a room: a control connection for presence and chat, and a local port that tunnels to the host's app. */
  async join(room: Room, appId: string): Promise<number> {
    const existing = this.#joined.get(room.id);
    if (existing) return existing.port;
    this.#need();
    const tcp = createServer((local) => this.#tunnel(room, local));
    const port = await listenNear(tcp, preferredPort(appId));
    const joined: Joined = { room, tcp, port, chat: [], peers: [], connected: false };
    this.#joined.set(room.id, joined);
    this.#connectControl(joined);
    this.#host.changed();
    return port;
  }

  async leave(roomId: string): Promise<void> {
    const joined = this.#joined.get(roomId);
    if (!joined) return;
    this.#joined.delete(roomId);
    joined.control?.destroy();
    await new Promise<void>((resolve) => joined.tcp.close(() => resolve()));
    this.#host.changed();
  }

  say(roomId: string, text: string): void {
    const hosting = this.#hosting.get(roomId);
    if (hosting) return this.#post(hosting, this.#host.signer().author, text);
    const joined = this.#joined.get(roomId);
    if (!joined?.control || !joined.connected) throw new Error('not connected to this room (yet)');
    send(joined.control, { type: 'say', text: text.slice(0, 2000) });
  }

  #dial(room: Room, purpose: Proof['purpose']): DhtSocket {
    const socket = this.#need().connect(Buffer.from(room.key, 'hex'));
    const me = this.#host.signer();
    const proof: Proof = { room: room.id, person: me.author, signer: me.did, key: socket.publicKey.toString('hex'), purpose, time: new Date().toISOString() };
    const sig = b64u.encode(sign(utf8(canonicalJson(proof as unknown as Json)), me.keys.secretKey));
    socket.write(`${JSON.stringify({ proof, sig })}\n`);
    return socket;
  }

  #connectControl(joined: Joined): void {
    if (!this.#joined.has(joined.room.id)) return;
    const socket = this.#dial(joined.room, 'control');
    joined.control = socket;
    socket.on('error', () => socket.destroy());
    // Connected once the host's first message (the room state) arrives: the host has accepted us.
    socket.on('connect', () => this.#host.changed());
    socket.on('close', () => {
      joined.connected = false;
      this.#host.changed();
      // Keep trying while joined: the host may still be starting, or briefly gone.
      if (this.#joined.get(joined.room.id) === joined) setTimeout(() => this.#connectControl(joined), 3000).unref();
    });
    onLines(socket, Buffer.alloc(0), (message) => {
      if (message.type === 'state') {
        joined.connected = true;
        joined.appReady = typeof message.appReady === 'boolean' ? message.appReady : undefined;
      }
      if (message.type === 'app' && typeof message.ready === 'boolean') joined.appReady = message.ready;
      if (message.type === 'state' || message.type === 'peers') joined.peers = (message.peers as Did[]) ?? [];
      if (message.type === 'state') joined.chat = (message.chat as unknown as RoomMessage[]) ?? [];
      if (message.type === 'chat') {
        joined.chat.push(message.message as unknown as RoomMessage);
        if (joined.chat.length > MAX_CHAT) joined.chat.splice(0, joined.chat.length - MAX_CHAT);
      }
      this.#host.changed();
    });
  }

  #tunnel(room: Room, local: Socket): void {
    local.on('error', () => local.destroy());
    local.pause();
    const remote = this.#dial(room, 'tunnel');
    remote.on('error', () => local.destroy());
    splice(local, remote);
  }

  async close(): Promise<void> {
    for (const id of [...this.#joined.keys()]) await this.leave(id);
    for (const id of [...this.#hosting.keys()]) await this.stopHosting(id);
  }

  #need(): HyperDHT {
    const dht = this.#host.dht();
    if (!dht) throw new Error('rooms need your node online: keep the app (or "weave daemon") running');
    return dht;
  }
}

/** The same local port for an app every time (so its address and saved data stay), from a range of 7000. */
function preferredPort(appId: string): number {
  return 41_000 + (createHash('sha256').update(appId).digest().readUInt16BE(0) % 7000);
}

function listenNear(server: Server, port: number, tries = 20): Promise<number> {
  return new Promise((resolve, reject) => {
    const attempt = (p: number, left: number) => {
      server.once('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE' && left > 0) attempt(p + 1, left - 1);
        else reject(error);
      });
      server.listen(p, '127.0.0.1', () => resolve(p));
    };
    attempt(port, tries);
  });
}

/** Is something answering on this local port? */
export function portOpen(port: number, timeoutMs = 400): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    const done = (open: boolean) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}
