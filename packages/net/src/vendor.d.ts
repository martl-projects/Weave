// Minimal typings for the Holepunch modules we use; they ship without TypeScript types.

declare module 'hyperswarm' {
  import type { Duplex } from 'node:stream';

  export interface PeerInfo {
    publicKey: Buffer;
  }

  export interface Discovery {
    flushed(): Promise<void>;
    refresh(options?: { client?: boolean; server?: boolean }): Promise<void>;
    destroy(): Promise<void>;
  }

  export interface HyperswarmOptions {
    bootstrap?: Array<{ host: string; port: number }>;
    keyPair?: { publicKey: Buffer; secretKey: Buffer };
    /** A DHT node to use instead of one of its own. Hyperswarm destroys it when it's destroyed. */
    dht?: unknown;
  }

  /** An encrypted, hole-punched connection over the DHT. */
  export interface DhtSocket extends Duplex {
    remotePublicKey: Buffer;
    publicKey: Buffer;
  }

  export interface DhtServer {
    listen(keyPair: { publicKey: Buffer; secretKey: Buffer }): Promise<void>;
    close(): Promise<void>;
    on(event: 'connection', listener: (socket: DhtSocket) => void): this;
  }

  export interface HyperDHT {
    createServer(options?: { firewall?: (remotePublicKey: Buffer) => boolean }, onconnection?: (socket: DhtSocket) => void): DhtServer;
    connect(publicKey: Buffer, options?: { keyPair?: { publicKey: Buffer; secretKey: Buffer } }): DhtSocket;
  }

  export default class Hyperswarm {
    constructor(options?: HyperswarmOptions);
    keyPair: { publicKey: Buffer };
    dht: HyperDHT;
    connections: Set<Duplex>;
    join(topic: Buffer, options?: { server?: boolean; client?: boolean }): Discovery;
    leave(topic: Buffer): Promise<void>;
    flush(): Promise<void>;
    /** force: leave without unannouncing topics first. */
    destroy(options?: { force?: boolean }): Promise<void>;
    on(event: 'connection', listener: (socket: Duplex, info: PeerInfo) => void): this;
  }
}

declare module 'hyperdht/testnet.js' {
  export interface Testnet {
    bootstrap: Array<{ host: string; port: number }>;
    destroy(): Promise<void>;
  }
  export default function createTestnet(size?: number): Promise<Testnet>;
}

declare module 'hyperdht' {
  import type { DhtSocket } from 'hyperswarm';
  export default class HyperDHT {
    constructor(options?: { bootstrap?: Array<{ host: string; port: number }> });
    static keyPair(seed?: Buffer): { publicKey: Buffer; secretKey: Buffer };
    connect(publicKey: Buffer): DhtSocket;
    destroy(options?: { force?: boolean }): Promise<void>;
    /** Ready: bootstrapped, and its address known. */
    ready(): Promise<void>;
  }
}
