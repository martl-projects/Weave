import { request as httpRequest } from 'node:http';
import { RPC_METHODS, type Backend, type FeedItem, type RpcMethod } from './backend.ts';
import { readJson, type Home } from './home.ts';

export interface DaemonInfo {
  pid: number;
  port: number;
  token: string;
}

// Every Backend method is available on an ApiClient (provided by the proxy below).
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ApiClient extends Omit<Backend, 'watch'> {}

/** Talks to a running daemon over its local HTTP API. */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ApiClient {
  readonly base: string;
  readonly #token: string;

  constructor(port: number, token: string) {
    this.base = `http://127.0.0.1:${port}/v1`;
    this.#token = token;
    return new Proxy(this, {
      get(target, prop) {
        if (typeof prop === 'string' && RPC_METHODS.includes(prop as RpcMethod)) return (...args: unknown[]) => target.call(prop as RpcMethod, args);
        // Bound to the real object: private fields aren't reachable through the proxy.
        const value = Reflect.get(target, prop, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }

  /** Call one Backend method on the daemon. One-off request without keep-alive, so a CLI process can exit right after it. */
  call<T = unknown>(method: RpcMethod, args: unknown[]): Promise<T> {
    const payload = JSON.stringify({ method, args });
    return new Promise((resolve, reject) => {
      const req = httpRequest(
        `${this.base}/rpc`,
        {
          method: 'POST',
          agent: false,
          headers: { authorization: `Bearer ${this.#token}`, 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) },
        },
        (res) => {
          let text = '';
          res.setEncoding('utf8');
          res.on('data', (chunk: string) => (text += chunk));
          res.on('end', () => {
            try {
              const data = JSON.parse(text) as { result?: T; error?: string };
              if ((res.statusCode ?? 500) >= 400) reject(new Error(data.error ?? `daemon answered ${res.statusCode}`));
              else resolve(data.result as T);
            } catch (error) {
              reject(error);
            }
          });
        },
      );
      req.on('error', reject);
      req.end(payload);
    });
  }

  async watch(onItem: (item: FeedItem) => void, signal: AbortSignal): Promise<void> {
    let res: Response;
    try {
      res = await fetch(`${this.base}/watch`, { headers: { authorization: `Bearer ${this.#token}` }, signal });
    } catch (error) {
      if (signal.aborted) return;
      throw error;
    }
    if (!res.ok || !res.body) throw new Error(`watch failed: ${res.status}`);
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for await (const chunk of res.body) {
        buffer += decoder.decode(chunk, { stream: true });
        let end: number;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const data = block.split('\n').find((line) => line.startsWith('data: '));
          if (data) onItem(JSON.parse(data.slice(6)) as FeedItem);
        }
      }
    } catch (error) {
      if (!signal.aborted) throw error;
    }
  }
}

/** A client for the daemon running on this home, or undefined if none answers. */
export async function connectDaemon(home: Home): Promise<ApiClient | undefined> {
  const info = readJson<DaemonInfo>(home.daemon);
  if (!info) return undefined;
  const client = new ApiClient(info.port, info.token);
  try {
    await Promise.race([client.status(), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500).unref())]);
    return client;
  } catch {
    return undefined; // stale daemon.json from a daemon that is gone
  }
}
