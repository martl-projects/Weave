import type { StoredSpace } from './spacestore.ts';

/*
 * The ports: what the node's kernel asks of its host, and nothing more
 * (docs/node-split.md, step 8). On a computer the node builds them over the
 * home directory (spacestore.ts, vault.ts) and Hyperswarm; a browser builds
 * them over OPFS and a WebSocket relay. The kernel imports no node:* module
 * and nothing that does: everything host-bound comes through these.
 */

/** The spaces this node joined, with their keys: one record each, kept at rest. */
export interface SpaceStorage {
  load(): StoredSpace[];
  save(space: StoredSpace): void;
  remove(id: string): void;
}

/** Small JSON records kept sealed at rest (what the OS keystore or the home key protects), by file name. */
export interface SecretStorage {
  read<T>(name: string): T | undefined;
  write(name: string, value: unknown): void;
}

/** The network as the kernel sees it: meeting points to be at, and peers to ask for what's missing (SwarmNode is one). */
export interface Network {
  /** The meeting points this node is at. */
  readonly joined: string[];
  join(topic: string, options?: { announce?: boolean }): Promise<void>;
  leave(topic: string): Promise<void>;
  /** Tell peers which spaces this node holds, and where it is found. */
  announce(): void;
  /** Ask whoever is online for these blobs. */
  want(hashes: string[]): void;
  /** Ask for a space's events in a time range (older history on request). */
  fetchRange(space: string, since: string, until: string): void;
}

/** Time, as the node measures it: tests set it. */
export type Clock = () => number;
