import { request as httpRequest } from 'node:http';
import type { AgentInfo, Backend, FeedItem, FeedQuery, PublishInput, Status, Whoami } from './backend.ts';
import { readJson, type Home } from './home.ts';

export interface DaemonInfo {
  pid: number;
  port: number;
  token: string;
}

/** Talks to a running daemon over its local HTTP API. */
export class ApiClient implements Backend {
  readonly base: string;
  readonly #token: string;

  constructor(port: number, token: string) {
    this.base = `http://127.0.0.1:${port}/v1`;
    this.#token = token;
  }

  /** One-off request without keep-alive, so a CLI process can exit right after it. */
  #request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    return new Promise((resolve, reject) => {
      const req = httpRequest(
        this.base + path,
        {
          method,
          agent: false,
          headers: {
            authorization: `Bearer ${this.#token}`,
            ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
          },
        },
        (res) => {
          let text = '';
          res.setEncoding('utf8');
          res.on('data', (chunk: string) => (text += chunk));
          res.on('end', () => {
            try {
              const data = JSON.parse(text) as T & { error?: string };
              if ((res.statusCode ?? 500) >= 400) reject(new Error(data.error ?? `daemon answered ${res.statusCode}`));
              else resolve(data);
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

  whoami(): Promise<Whoami> {
    return this.#request('GET', '/whoami');
  }

  status(): Promise<Status> {
    return this.#request('GET', '/status');
  }

  feed(query: FeedQuery = {}): Promise<FeedItem[]> {
    const params = new URLSearchParams();
    if (query.limit !== undefined) params.set('limit', String(query.limit));
    if (query.kinds?.length) params.set('kinds', query.kinds.join(','));
    return this.#request('GET', `/feed?${params}`);
  }

  publish(input: PublishInput): Promise<FeedItem> {
    return this.#request('POST', '/publish', input);
  }

  addAgent(name: string, permissions: string[]): Promise<AgentInfo> {
    return this.#request('POST', '/agents', { name, permissions });
  }

  async join(topic: string): Promise<void> {
    await this.#request('POST', '/join', { topic });
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
