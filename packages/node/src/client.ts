import { request as httpRequest } from 'node:http';
import { errorFromWire, type ErrorAnswer } from '@weave/core';
import { RPC_METHODS, type Backend, type FeedItem, type RpcMethod } from './backend.ts';
import { readJson, type Home } from './home.ts';

export interface DaemonInfo {
  pid: number;
  port: number;
  token: string;
  /** Its Weave version, and whether it runs a release build or the source (development). Missing on daemons from before. */
  version?: string;
  build?: 'release' | 'dev';
  /** Started by the app (it may stop and replace it) or by hand (weave daemon: left alone). */
  startedBy?: 'app' | 'cli';
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
              const data = JSON.parse(text) as { result?: T } & Partial<ErrorAnswer>;
              // A named error is a WeaveError again here (docs/localization.md, "Texts the daemon writes").
              if ((res.statusCode ?? 500) >= 400) reject(errorFromWire(data, `daemon answered ${res.statusCode}`));
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

  /** Ask the daemon to stop: it closes the node properly (unpublished keys, the database) and exits. */
  async stop(): Promise<void> {
    const res = await fetch(`${this.base}/stop`, { method: 'POST', headers: { authorization: `Bearer ${this.#token}` } });
    if (!res.ok) throw new Error(res.status === 404 ? 'this daemon is too old to stop on request' : `stop failed: ${res.status}`);
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

/** The daemon can't be reached: gone, restarted elsewhere, or a new token. */
const unreachable = (error: unknown): boolean => {
  const e = error as NodeJS.ErrnoException & { cause?: { code?: string } };
  return ['ECONNREFUSED', 'ECONNRESET', 'EPIPE'].includes(e.code ?? e.cause?.code ?? '') || e.message === 'unauthorized';
};

const notRunning = () => new Error("Weave isn't running on this computer: start the Weave app (or weave daemon), then try again");

/**
 * A Backend that follows this home's daemon, for long-running clients like
 * the MCP server: every call reads daemon.json, so a restarted daemon (new
 * port, new token) is found again, and one that isn't running yet just
 * makes calls fail with a clear message until it is. The event stream
 * reconnects by itself.
 */
export function followDaemon(home: Home): Backend {
  let current: { port: number; token: string; client: ApiClient } | undefined;
  const client = (): ApiClient => {
    const info = readJson<DaemonInfo>(home.daemon);
    if (!info) throw notRunning();
    if (current?.port !== info.port || current.token !== info.token) current = { port: info.port, token: info.token, client: new ApiClient(info.port, info.token) };
    return current.client;
  };
  const call = async (method: RpcMethod, args: unknown[]): Promise<unknown> => {
    try {
      return await client().call(method, args);
    } catch (error) {
      if (!unreachable(error)) throw error;
      // Maybe it restarted just now: read daemon.json again and try once more.
      await new Promise((resolve) => setTimeout(resolve, 300));
      current = undefined;
      try {
        return await client().call(method, args);
      } catch (again) {
        throw unreachable(again) ? notRunning() : again;
      }
    }
  };
  const watch = async (onItem: (item: FeedItem) => void, signal: AbortSignal): Promise<void> => {
    while (!signal.aborted) {
      try {
        await client().watch(onItem, signal);
      } catch {
        // not running, or it went away: look again shortly
      }
      if (signal.aborted) return;
      current = undefined;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  };
  return new Proxy({} as Backend, {
    get(_target, prop) {
      if (prop === 'watch') return watch;
      if (typeof prop === 'string' && RPC_METHODS.includes(prop as RpcMethod)) return (...args: unknown[]) => call(prop as RpcMethod, args);
      return undefined;
    },
  });
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

/** What daemon.json says about this home's daemon (it may be gone; connectDaemon checks). */
export function daemonInfo(home: Home): DaemonInfo | undefined {
  return readJson<DaemonInfo>(home.daemon);
}

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
};

/**
 * Stop this home's daemon properly and wait until it's gone. A daemon that doesn't answer in time (or is too old
 * to stop on request) is ended hard with `force`; otherwise that's an error. Resolves to whether one was running.
 */
export async function stopDaemon(home: Home, options: { timeoutMs?: number; force?: boolean } = {}): Promise<boolean> {
  const info = daemonInfo(home);
  const client = await connectDaemon(home);
  if (!info || !client) return false;
  let asked = true;
  try {
    await client.stop();
  } catch (error) {
    if (!options.force) throw error;
    asked = false;
  }
  const until = Date.now() + (options.timeoutMs ?? 15_000);
  while (asked && alive(info.pid) && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 100));
  if (alive(info.pid)) {
    if (!options.force) throw new Error(`the daemon (pid ${info.pid}) didn't stop within ${Math.round((options.timeoutMs ?? 15_000) / 1000)} s`);
    process.kill(info.pid);
  }
  return true;
}
