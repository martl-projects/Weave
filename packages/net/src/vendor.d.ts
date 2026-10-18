// Minimal typings for the Holepunch modules we use; they ship without TypeScript types.

declare module 'hyperswarm' {
  import type { Duplex } from 'node:stream';

  export interface PeerInfo {
    publicKey: Buffer;
  }

  export interface Discovery {
    flushed(): Promise<void>;
    destroy(): Promise<void>;
  }

  export interface HyperswarmOptions {
    bootstrap?: Array<{ host: string; port: number }>;
    keyPair?: { publicKey: Buffer; secretKey: Buffer };
  }

  export default class Hyperswarm {
    constructor(options?: HyperswarmOptions);
    keyPair: { publicKey: Buffer };
    connections: Set<Duplex>;
    join(topic: Buffer, options?: { server?: boolean; client?: boolean }): Discovery;
    leave(topic: Buffer): Promise<void>;
    flush(): Promise<void>;
    destroy(): Promise<void>;
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
