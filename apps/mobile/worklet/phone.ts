import { connectTo, decodePhoneLink, openTunnel, pairWith, type Dialer, type FeedItem, type PairedNode, type RemoteSession, type RpcMethod } from '@weave/node/phone';

/*
 * The phone app's worker: it keeps the phone's key pair and the computer it
 * is paired with, holds the connection to that computer's node (see
 * packages/node/src/remote.ts) and reconnects when it drops. The app's screen
 * (a WebView) talks to it with one JSON message per line:
 *
 *   screen → worker  {id, op: 'state'}                    → {paired, name?, connected}
 *                    {id, op: 'pair', link, phoneName}    → {name?}
 *                    {id, op: 'call', method, args}       → the node's answer
 *                    {id, op: 'forget'}                   unpair on this side
 *                    {id, op: 'openRoom', room, url}      → the room's app on this phone (a local address)
 *                    {op: 'wake'}                         the app is in front again
 *   worker → screen  {id, result} | {id, error}
 *                    {event}                              the node's live events
 *                    {connected}                          the connection came or went
 *
 * Rooms: the computer joins a room and reaches its app on a local port (the
 * room's url). For the phone's browser the worker listens on a local port of
 * its own, and sends each connection made to it through its own encrypted
 * connection to the computer, which passes it on to that port (remote.ts).
 *
 * The native side sends {op: 'start', dir} first: where the worker may keep
 * its file. This file only decides; main.ts gives it a DHT, storage and the
 * line transport, so tests run it in Node.
 */

type KeyPair = { publicKey: Buffer; secretKey: Buffer };

/** A connection's two directions, Node's or Bare's streams alike. */
export interface Pipe {
  pipe(destination: Pipe): unknown;
  write(data: Buffer): unknown;
  on(event: 'error' | 'close', listener: () => void): unknown;
  destroy(): void;
}

/** A local TCP server on 127.0.0.1. */
export interface Listener {
  port: number;
  close(): void;
}

/** What the phone remembers, in its app's private storage. */
export interface Saved {
  publicKey: string;
  secretKey: string;
  node?: PairedNode;
}

export interface PhoneDeps {
  /** A DHT to connect through (one with these bootstrap nodes, when the pairing link names some). */
  dht(bootstrap?: PairedNode['bootstrap']): Dialer;
  newKeyPair(): KeyPair;
  load(dir: string): Saved | undefined;
  save(dir: string, saved: Saved): void;
  send(message: unknown): void;
  /** Listen on 127.0.0.1, on this port if it's free (else any). */
  listen(port: number, onConnection: (socket: Pipe) => void): Promise<Listener>;
}

const RETRY_MS = [1000, 2000, 5000, 10_000, 30_000];
/** How long the first look at the state waits for the computer, so the app opens connected when it can. */
const STATE_WAIT_MS = 15_000;

export class Phone {
  #deps: PhoneDeps;
  #dir?: string;
  #saved?: Saved;
  #session?: RemoteSession;
  #connecting?: Promise<RemoteSession>;
  #retries = 0;
  #retry?: ReturnType<typeof setTimeout>;
  /** The local port of each room this phone has opened, by room id. */
  #rooms = new Map<string, Promise<Listener>>();
  /** The browser's connections to them, open now. */
  #open = new Set<Pipe>();

  constructor(deps: PhoneDeps) {
    this.#deps = deps;
  }

  /** Handle one message from the screen or the native side. */
  async handle(message: { id?: number; op?: string; [key: string]: unknown }): Promise<void> {
    const { id, op } = message;
    try {
      const result = await this.#do(op, message);
      if (id !== undefined) this.#deps.send({ id, result: result ?? null });
    } catch (error) {
      if (id !== undefined) this.#deps.send({ id, error: error instanceof Error ? error.message : String(error) });
    }
  }

  close(): void {
    this.#drop();
    this.#closeRooms();
  }

  #closeRooms(): void {
    for (const listener of this.#rooms.values()) void listener.then((l) => l.close(), () => {});
    this.#rooms.clear();
    for (const socket of this.#open) socket.destroy();
  }

  /** Close the connection without trying again. */
  #drop(): void {
    clearTimeout(this.#retry);
    this.#retry = undefined;
    const session = this.#session;
    this.#session = undefined;
    session?.close();
  }

  async #do(op: unknown, message: Record<string, unknown>): Promise<unknown> {
    if (op === 'start') {
      this.#dir = String(message.dir);
      this.#saved = this.#deps.load(this.#dir);
      if (!this.#saved) {
        const keys = this.#deps.newKeyPair();
        this.#saved = { publicKey: keys.publicKey.toString('hex'), secretKey: keys.secretKey.toString('hex') };
        this.#deps.save(this.#dir, this.#saved);
      }
      if (this.#saved.node) void this.#connect().catch(() => {});
      return;
    }
    const saved = this.#saved;
    if (!saved) throw new Error('the worker has not started');
    switch (op) {
      case 'state': {
        if (saved.node && !this.#session) await Promise.race([this.#connect().catch(() => {}), new Promise((r) => setTimeout(r, STATE_WAIT_MS))]);
        return { paired: !!saved.node, ...(saved.node?.name ? { name: saved.node.name } : {}), connected: !!this.#session };
      }
      case 'pair': {
        const link = String(message.link);
        const { node, session } = await pairWith(this.#deps.dht(decodePhoneLink(link).bootstrap), link, this.#keyPair(), String(message.phoneName || 'Phone'));
        this.#drop();
        saved.node = node;
        this.#deps.save(this.#dir!, saved);
        this.#adopt(session);
        return { ...(node.name ? { name: node.name } : {}) };
      }
      case 'call': {
        const session = await this.#connect();
        return session.call(message.method as RpcMethod, ...((message.args as unknown[]) ?? []));
      }
      case 'forget': {
        delete saved.node;
        this.#deps.save(this.#dir!, saved);
        this.#drop();
        this.#closeRooms();
        return;
      }
      case 'openRoom': {
        const room = String(message.room);
        // The computer's address of the room's app: its port (so the app's origin stays the same) and the path to open.
        const at = /^https?:\/\/[^/:]+(?::(\d+))?(\/.*)?$/.exec(String(message.url ?? ''));
        if (!room || !at) throw new Error("this room's app has no address yet");
        await this.#connect();
        let listening = this.#rooms.get(room);
        if (!listening) {
          listening = this.#deps.listen(Number(at[1] ?? 0), (local) => this.#tunnel(room, local));
          this.#rooms.set(room, listening);
          listening.catch(() => this.#rooms.delete(room));
        }
        return `http://127.0.0.1:${(await listening).port}${at[2] ?? '/'}`;
      }
      case 'wake': {
        // Back in front: try at once instead of waiting for the next retry.
        this.#retries = 0;
        if (saved.node && !this.#session) void this.#connect().catch(() => {});
        return;
      }
      default:
        throw new Error(`unknown request: ${String(op)}`);
    }
  }

  /** One connection of the phone's browser, through to the room's app on the computer. */
  #tunnel(room: string, local: Pipe): void {
    const node = this.#saved?.node;
    if (!node) return local.destroy();
    this.#open.add(local);
    let remote: Pipe | undefined;
    const end = () => {
      this.#open.delete(local);
      local.destroy();
      remote?.destroy();
    };
    local.on('error', end);
    local.on('close', end);
    // What the browser sends meanwhile waits in the local socket until the computer has said yes.
    openTunnel(this.#deps.dht(node.bootstrap), node, this.#keyPair(), room).then(
      ({ socket, rest }) => {
        remote = socket as unknown as Pipe;
        if (!this.#open.has(local)) return remote.destroy();
        remote.on('error', end);
        remote.on('close', end);
        if (rest.length) local.write(rest);
        local.pipe(remote);
        remote.pipe(local);
      },
      end,
    );
  }

  #keyPair(): KeyPair {
    return { publicKey: Buffer.from(this.#saved!.publicKey, 'hex'), secretKey: Buffer.from(this.#saved!.secretKey, 'hex') };
  }

  /** The open session, or a new one; one attempt at a time. */
  #connect(): Promise<RemoteSession> {
    if (this.#session) return Promise.resolve(this.#session);
    const node = this.#saved?.node;
    if (!node) return Promise.reject(new Error('this phone is not paired with a computer'));
    this.#connecting ??= connectTo(this.#deps.dht(node.bootstrap), node, this.#keyPair()).then(
      (session) => {
        this.#connecting = undefined;
        this.#adopt(session);
        return session;
      },
      (error: Error) => {
        this.#connecting = undefined;
        this.#later();
        throw error;
      },
    );
    return this.#connecting;
  }

  #adopt(session: RemoteSession): void {
    clearTimeout(this.#retry);
    this.#retry = undefined;
    this.#retries = 0;
    this.#session = session;
    session.onEvent((event: FeedItem) => this.#deps.send({ event }));
    session.onClose(() => {
      if (this.#session !== session) return;
      this.#session = undefined;
      this.#deps.send({ connected: false });
      this.#later();
    });
    this.#deps.send({ connected: true });
  }

  /** Try again after a while, longer each time, while the phone is still paired. */
  #later(): void {
    if (this.#retry || !this.#saved?.node) return;
    const wait = RETRY_MS[Math.min(this.#retries++, RETRY_MS.length - 1)];
    this.#retry = setTimeout(() => {
      this.#retry = undefined;
      void this.#connect().catch(() => {});
    }, wait);
  }
}
