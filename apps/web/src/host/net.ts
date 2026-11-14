import { b64u, blobHash, createIdentity, type Did, type Replica, type SigningIdentity } from '@weave/core';
import { authKey, StorageClient, type BlobSource, type HeldByNode, type PeerSession2, type SpaceAccess, type TextSocket } from '@weave/net/browser';

export * from '@weave/net/browser';

/*
 * In place of @weave/net: the node's SwarmNode, with the storage node for a network. A browser is on no DHT: it has one
 * connection, to the storage node, which meets the peers for it. What SwarmNode joins, the storage node joins, by hashes
 * of the keys only (docs/web-stage2.md).
 *
 * After `sync` a connection is a session and takes no more requests, so a change to what is held goes over a second,
 * short connection. A connection that drops is made again.
 */

export interface StorageLink {
  url: string;
  /** An invitation, for the first time. */
  invite?: string;
  /** The account: read and kept by the Worker. */
  account(): SigningIdentity | undefined;
  keepAccount(account: SigningIdentity): void;
  /** After the storage node took a new list: what else goes with it (the boxes). */
  afterHold?(client: StorageClient): Promise<void>;
  /** What the connection is doing, for the page. */
  status?(state: 'connecting' | 'connected' | 'offline', detail?: string): void;
}

let link: StorageLink | undefined;
let current: SwarmNode | undefined;

/** What goes with the list changed (a way in): hand it on, though the list is the same. */
export const handOnAgain = (): void => current?.again();

/** The storage node this node goes online through. */
export const useStorage = (storage: StorageLink): void => void (link = storage);

export const accountRecord = (account: SigningIdentity) => ({ did: account.did, publicKey: b64u.encode(account.keys.publicKey), secretKey: b64u.encode(account.keys.secretKey) });
export const accountOf = (record: { did: Did; publicKey: string; secretKey: string }): SigningIdentity => ({ author: record.did, did: record.did, keys: { publicKey: b64u.decode(record.publicKey), secretKey: b64u.decode(record.secretKey) } });

export function socketTo(url: string): Promise<TextSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener('error', () => reject(new Error(`no connection to ${url}`)));
    ws.addEventListener('open', () =>
      resolve({
        send: (text) => ws.send(text),
        close: () => ws.close(),
        onMessage: (handle) => ws.addEventListener('message', (e) => handle(String(e.data))),
        onClose: (handle) => ws.addEventListener('close', () => handle()),
      }),
    );
  });
}

/** Something of this account's at its storage node, over a short connection of its own, signed in. */
export async function withStorage<T>(ask: (client: StorageClient) => Promise<T>): Promise<T> {
  const account = link?.account();
  if (!link || !account) throw new Error('not connected to a storage node yet');
  const client = await StorageClient.connect(await socketTo(link.url));
  try {
    await client.signIn(account);
    return await ask(client);
  } finally {
    client.close();
  }
}

/** A ticket for the storage node's relay, for a website's tab (docs/web-stage2.md, step 9). */
export const relayTicket = (hours?: number): Promise<string> => withStorage((client) => client.relayTicket(hours));

/** The node's blob store, as far as this uses it. */
type Blobs = BlobSource & { put(data: Uint8Array): string };

const RETRY_MS = 3000;
/** Several changes in a row are one new list. */
const SETTLE_MS = 150;

export class SwarmNode {
  readonly replica: Replica;
  readonly sessions = new Set<PeerSession2>();
  readonly swarm = { dht: undefined };
  readonly #access: SpaceAccess;
  /** Topics joined; the value says whether to be found there. */
  readonly #topics = new Map<string, boolean>();
  #closed = false;
  #settling?: ReturnType<typeof setTimeout>;
  #retry?: ReturnType<typeof setTimeout>;
  #sent = '';

  /** Blobs made here while not connected: they go when it connects. */
  readonly #toSend = new Map<string, Uint8Array>();
  readonly #blobs?: Blobs;

  constructor(replica: Replica, _options: unknown, blobs?: Blobs, access: SpaceAccess = { spaces: () => [] }) {
    this.replica = replica;
    this.#access = access;
    this.#blobs = blobs;
    current = this;
    if (blobs) {
      // Nobody can ask a closed tab for a picture: what's made here goes to the storage node at once. What came from it doesn't go back.
      const put = blobs.put.bind(blobs);
      blobs.put = (data) => {
        const hash = blobHash(data);
        const made = !blobs.wanted().includes(hash);
        put(data);
        if (made) this.#send(hash, data);
        return hash;
      };
    }
    this.#retry = setTimeout(() => {
      this.#retry = undefined;
      void this.#connect();
    }, SETTLE_MS);
  }

  /**
   * What the storage node should hold: the auth keys of every space, and the topics to be at. It joins all of them as
   * one list, so they travel on the first entry. Someone else's meeting point it only looks up, as this node would.
   */
  #held(): HeldByNode[] {
    const held: HeldByNode[] = this.#access.spaces().map((s) => ({ space: s.space, auths: s.keys.map((key) => (s.blind ? key : authKey(key))), topics: [], ...(s.proof ? { proof: true as const } : {}) }));
    if (held.length) {
      held[0].topics = [...this.#topics].filter(([, announce]) => announce).map(([topic]) => topic);
      held[0].looks = [...this.#topics].filter(([, announce]) => !announce).map(([topic]) => topic);
    }
    return held;
  }

  async #signedIn(socket: TextSocket): Promise<StorageClient> {
    const client = await StorageClient.connect(socket);
    const account = link!.account();
    if (account) {
      await client.signIn(account);
      return client;
    }
    if (!link!.invite) throw new Error('this browser has no account at its storage node, and no invitation');
    const fresh = createIdentity();
    await client.register(fresh, link!.invite);
    link!.keepAccount(fresh);
    return client;
  }

  async #connect(): Promise<void> {
    if (this.#closed || !link) return;
    link.status?.('connecting');
    let socket: TextSocket | undefined;
    try {
      let open = true;
      socket = await socketTo(link.url);
      const dropped = (): void => {
        if (!open) return;
        open = false;
        for (const session of this.sessions) session.close();
        this.sessions.clear();
        this.#later();
      };
      socket.onClose(dropped);
      const client = await this.#signedIn(socket);
      const held = this.#held();
      await client.hold(held);
      await link.afterHold?.(client);
      this.#sent = JSON.stringify(held);
      const session = await client.sync(this.replica, this.#access, this.#blobs);
      this.sessions.add(session);
      for (const [hash, data] of this.#toSend) session.pushBlob(hash, data);
      this.#toSend.clear();
      link.status?.('connected');
      this.#changed();
    } catch (error) {
      this.#later((error as Error).message);
      socket?.close();
    }
  }

  #later(why?: string): void {
    if (this.#closed) return;
    link?.status?.('offline', why);
    if (this.#retry) return;
    this.#retry = setTimeout(() => {
      this.#retry = undefined;
      void this.#connect();
    }, RETRY_MS);
  }

  #send(hash: string, data: Uint8Array): void {
    const [session] = this.sessions;
    if (session) session.pushBlob(hash, data);
    else this.#toSend.set(hash, data);
  }

  again(): void {
    this.#sent = '';
    this.#changed();
  }

  /** The list changed: hand it on, once it has settled. */
  #changed(): void {
    if (this.#settling) clearTimeout(this.#settling);
    this.#settling = setTimeout(() => void this.#handOn(), SETTLE_MS);
  }

  async #handOn(): Promise<void> {
    if (this.#closed || !link || !this.sessions.size) return;
    const held = this.#held();
    const text = JSON.stringify(held);
    if (text === this.#sent) return;
    try {
      const socket = await socketTo(link.url);
      const client = await this.#signedIn(socket);
      await client.hold(held);
      await link.afterHold?.(client);
      this.#sent = text;
      client.close();
    } catch (error) {
      link.status?.('offline', (error as Error).message);
    }
  }

  async join(name: string, options: { announce?: boolean } = {}): Promise<void> {
    this.#topics.set(name, options.announce !== false);
    this.#changed();
  }

  async leave(name: string): Promise<void> {
    this.#topics.delete(name);
    this.#changed();
  }

  get joined(): string[] {
    return [...this.#topics.keys()];
  }

  announce(): void {
    for (const session of this.sessions) session.announce();
    this.#changed();
  }

  fetchRange(space: string, since: string, until: string): void {
    for (const session of this.sessions) session.fetchRange(space, since, until);
  }

  want(hashes: string[]): void {
    for (const session of this.sessions) session.want(hashes);
  }

  async destroy(): Promise<void> {
    this.#closed = true;
    clearTimeout(this.#settling);
    clearTimeout(this.#retry);
    for (const session of this.sessions) session.close();
  }
}

/** Rooms' tunnels go through the DHT (step 9). */
const noRooms = (): never => {
  throw new Error("rooms aren't there in a browser yet");
};
export const readLine = noRooms;
export const roomKeyPair = noRooms;
export const splice = noRooms;

/** A storage node's: a browser is on no DHT. */
export const sharedDht = (): never => {
  throw new Error("a browser is on no DHT: it goes through its storage node");
};
