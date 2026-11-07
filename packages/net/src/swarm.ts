import { sha256 } from '@noble/hashes/sha2.js';
import HyperDHT from 'hyperdht';
import Hyperswarm, { type Discovery, type HyperswarmOptions } from 'hyperswarm';
import { utf8, type Replica } from '@weave/core';
import type { BlobSource } from './session.ts';
import { PeerSession2, type SpaceAccess } from './session2.ts';

/** How long leaving the DHT may take before we go anyway. */
const LEAVE_MS = 4000;


/**
 * One DHT node for many swarms: each swarm keeps its own key and its own connections, and they share one UDP socket and
 * one routing table, which are what costs (a storage node has a swarm per account). A swarm destroys the DHT it was
 * given when it's destroyed, so the one handed out here doesn't go that way: `destroy` of the returned pair does.
 */
export function sharedDht(options: { bootstrap?: Array<{ host: string; port: number }> } = {}): { dht: HyperDHT; destroy(): Promise<void> } {
  const dht = new HyperDHT(options);
  const destroy = dht.destroy.bind(dht);
  dht.destroy = async () => {};
  // Every swarm on it listens for network changes.
  (dht as unknown as { setMaxListeners(n: number): void }).setMaxListeners(0);
  return { dht, destroy: () => destroy({ force: true }) };
}

/** 32-byte DHT topic for a name. Hashed, so the DHT never sees the name itself. */
export function topicFor(name: string): Buffer {
  return Buffer.from(sha256(utf8(`weave/topic/v1:${name}`)));
}

/**
 * Connects a Replica to peers over Hyperswarm: DHT discovery, hole punching
 * and Noise-encrypted connections come from Hyperswarm; every connection runs
 * a PeerSession2, which shares a space only with peers that hold it.
 */
export class SwarmNode {
  readonly replica: Replica;
  readonly swarm: Hyperswarm;
  readonly sessions = new Set<PeerSession2>();
  /** Topics joined, by name. */
  #discoveries = new Map<string, Discovery>();
  #timers: Array<ReturnType<typeof setTimeout>> = [];

  constructor(replica: Replica, options: HyperswarmOptions = {}, blobs?: BlobSource, access: SpaceAccess = { spaces: () => [] }) {
    this.replica = replica;
    this.swarm = new Hyperswarm(options);
    this.swarm.on('connection', (socket) => {
      const session = new PeerSession2(replica, socket, { access, blobs });
      this.sessions.add(session);
      socket.on('close', () => this.sessions.delete(session));
    });
    // Look again every 20s while alone, so peers that came up in the meantime are found.
    this.#timers.push(setInterval(() => {
      if (this.sessions.size === 0) this.#refreshAll();
    }, 20_000).unref());
  }

  #refreshAll(): void {
    for (const [name, discovery] of this.#discoveries) discovery.refresh({ client: true, server: !this.#lookOnly.has(name) }).catch(() => {});
  }

  /** Topics only looked up, never announced on. */
  #lookOnly = new Set<string>();

  /**
   * Announce on and look up a topic; resolves once the announcement is in the DHT. `announce: false` only looks:
   * for someone else's meeting point, where announcing would tell whoever looks there where we are.
   */
  async join(name: string, options: { announce?: boolean } = {}): Promise<void> {
    if (this.#discoveries.has(name)) return;
    const server = options.announce !== false;
    if (!server) this.#lookOnly.add(name);
    const discovery = this.swarm.join(topicFor(name), { server, client: true });
    this.#discoveries.set(name, discovery);
    await discovery.flushed();
    // Two nodes joining at the same moment each look before the other has announced;
    // a second look a moment later finds them.
    this.#timers.push(setTimeout(() => discovery.refresh({ client: true, server }).catch(() => {}), 1500).unref());
  }

  /** Stop announcing on and looking up a topic. */
  async leave(name: string): Promise<void> {
    if (!this.#discoveries.delete(name)) return;
    this.#lookOnly.delete(name);
    await this.swarm.leave(topicFor(name));
  }

  /** The topics joined. */
  get joined(): string[] {
    return [...this.#discoveries.keys()];
  }

  /** Tell every connected peer again which spaces this node holds (after joining, leaving or a new key). */
  announce(): void {
    for (const session of this.sessions) session.announce();
  }

  /** Whose public events peers get changed: each session asks again. */
  refreshPublic(): void {
    for (const session of this.sessions) session.refreshPublic();
  }

  /** Ask every peer that shares the space for its content between two times, bodies included. */
  fetchRange(space: string, since: string, until: string): void {
    for (const session of this.sessions) session.fetchRange(space, since, until);
  }

  /** Ask every connected peer for these blobs (new peers are asked when they connect). */
  want(hashes: string[]): void {
    for (const session of this.sessions) session.want(hashes);
  }

  async destroy(): Promise<void> {
    for (const timer of this.#timers) clearTimeout(timer);
    for (const session of this.sessions) session.close();
    // Without unannouncing every topic first: that waits out timeouts when the DHT can't be reached (seconds on
    // Linux), and the announcements expire on their own. And not for ever: a server still starting to listen (the
    // DHT not reached yet, e.g. stopped right after starting without a network) never finishes closing.
    const left = this.swarm.destroy({ force: true }).then(
      () => true,
      () => true,
    );
    const done = await Promise.race([left, new Promise<boolean>((resolve) => setTimeout(() => resolve(false), LEAVE_MS).unref())]);
    if (!done) console.error(`weave: left the DHT without waiting for it (still starting after ${LEAVE_MS / 1000} s)`);
  }
}
