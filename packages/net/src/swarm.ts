import { sha256 } from '@noble/hashes/sha2.js';
import Hyperswarm, { type Discovery, type HyperswarmOptions } from 'hyperswarm';
import { utf8, type Replica } from '@weave/core';
import type { BlobSource } from './session.ts';
import { PeerSession2, type SpaceAccess } from './session2.ts';

/** How long to unannounce topics when leaving, before leaving anyway. */
const LEAVE_POLITELY_MS = 3000;

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
    for (const discovery of this.#discoveries.values()) discovery.refresh({ client: true, server: true }).catch(() => {});
  }

  /** Announce on and look up a topic; resolves once the announcement is in the DHT. */
  async join(name: string): Promise<void> {
    if (this.#discoveries.has(name)) return;
    const discovery = this.swarm.join(topicFor(name), { server: true, client: true });
    this.#discoveries.set(name, discovery);
    await discovery.flushed();
    // Two nodes joining at the same moment each look before the other has announced;
    // a second look a moment later finds them.
    this.#timers.push(setTimeout(() => discovery.refresh({ client: true, server: true }).catch(() => {}), 1500).unref());
  }

  /** Stop announcing on and looking up a topic. */
  async leave(name: string): Promise<void> {
    if (!this.#discoveries.delete(name)) return;
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
    // Leaving politely unannounces every topic on the DHT, which waits out timeouts when it can't be reached (seconds
    // on Linux): after a few seconds, leave anyway.
    const polite = this.swarm.destroy().then(
      () => false,
      () => false,
    );
    const late = await Promise.race([polite, new Promise<boolean>((resolve) => setTimeout(() => resolve(true), LEAVE_POLITELY_MS).unref())]);
    if (late) await this.swarm.destroy({ force: true });
  }
}
