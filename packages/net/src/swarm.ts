import { sha256 } from '@noble/hashes/sha2.js';
import Hyperswarm, { type HyperswarmOptions } from 'hyperswarm';
import { utf8, type Replica } from '@weave/core';
import { PeerSession } from './session.ts';

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

  constructor(replica: Replica, options: HyperswarmOptions = {}) {
    this.replica = replica;
    this.swarm = new Hyperswarm(options);
    this.swarm.on('connection', (socket) => {
      const session = new PeerSession(replica, socket);
      this.sessions.add(session);
      socket.on('close', () => this.sessions.delete(session));
    });
  }

  /** Announce on and look up a topic; resolves once the announcement is in the DHT. */
  async join(name: string): Promise<void> {
    await this.swarm.join(topicFor(name), { server: true, client: true }).flushed();
  }

  async destroy(): Promise<void> {
    for (const session of this.sessions) session.close();
    await this.swarm.destroy();
  }
}
