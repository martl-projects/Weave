import { sha256 } from '@noble/hashes/sha2.js';
import Hyperswarm, { type Discovery, type HyperswarmOptions } from 'hyperswarm';
import { utf8, type Replica } from '@weave/core';
import { PeerSession, type BlobSource } from './session.ts';

/** 32-byte DHT topic for a name. Hashed, so the DHT never sees the name itself. */
export function topicFor(name: string): Buffer {
  return Buffer.from(sha256(utf8(`weave/topic/v1:${name}`)));
}

/**
 * Connects a Replica to peers over Hyperswarm: DHT discovery, hole punching
 * and Noise-encrypted connections come from Hyperswarm; every connection runs
 * a PeerSession.
 */
export class SwarmNode {
  readonly replica: Replica;
  readonly swarm: Hyperswarm;
  readonly sessions = new Set<PeerSession>();
  #discoveries = new Set<Discovery>();
  #timers: Array<ReturnType<typeof setTimeout>> = [];

  constructor(replica: Replica, options: HyperswarmOptions = {}, blobs?: BlobSource) {
    this.replica = replica;
    this.swarm = new Hyperswarm(options);
    this.swarm.on('connection', (socket) => {
      const session = new PeerSession(replica, socket, blobs);
      this.sessions.add(session);
      socket.on('close', () => this.sessions.delete(session));
    });
    // Look again every 20s while alone, so peers that came up in the meantime are found.
    this.#timers.push(setInterval(() => {
      if (this.sessions.size === 0) this.#refreshAll();
    }, 20_000).unref());
  }

  #refreshAll(): void {
    for (const discovery of this.#discoveries) discovery.refresh({ client: true, server: true }).catch(() => {});
  }

  /** Announce on and look up a topic; resolves once the announcement is in the DHT. */
  async join(name: string): Promise<void> {
    const discovery = this.swarm.join(topicFor(name), { server: true, client: true });
    this.#discoveries.add(discovery);
    await discovery.flushed();
    // Two nodes joining at the same moment each look before the other has announced;
    // a second look a moment later finds them.
    this.#timers.push(setTimeout(() => discovery.refresh({ client: true, server: true }).catch(() => {}), 1500).unref());
  }

  /** Ask every connected peer for these blobs (new peers are asked when they connect). */
  want(hashes: string[]): void {
    for (const session of this.sessions) session.want(hashes);
  }

  async destroy(): Promise<void> {
    for (const timer of this.#timers) clearTimeout(timer);
    for (const session of this.sessions) session.close();
    await this.swarm.destroy();
  }
}
