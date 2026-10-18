import { request as httpRequest } from 'node:http';
import type { Choice, IssueStatus } from '@weave/core';
import type {
  Actor,
  AgentInfo,
  Backend,
  ChannelInfo,
  EdgeInput,
  FeedItem,
  FeedQuery,
  GroupInfo,
  InGroup,
  IssueInfo,
  MemberInfo,
  MessageInfo,
  Profile,
  ProfileInput,
  ProposalInfo,
  PublishInput,
  ReplyInfo,
  Social,
  Status,
  ThreadInfo,
  Whoami,
} from './backend.ts';
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
    if (query.group) params.set('group', query.group);
    if (query.author) params.set('author', query.author);
    if (query.publicOnly) params.set('public', '1');
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

  createGroup(name: string): Promise<GroupInfo> {
    return this.#request('POST', '/groups', { name });
  }

  groups(): Promise<GroupInfo[]> {
    return this.#request('GET', '/groups');
  }

  async invite(group: string, hours?: number): Promise<string> {
    return (await this.#request<{ invite: string }>('POST', '/groups/invite', { group, hours })).invite;
  }

  joinGroup(invite: string): Promise<GroupInfo> {
    return this.#request('POST', '/groups/join', { invite });
  }

  members(group: string): Promise<MemberInfo[]> {
    return this.#request('GET', `/groups/members?${new URLSearchParams({ group })}`);
  }

  async removeMember(group: string, who: string): Promise<void> {
    await this.#request('POST', '/groups/remove', { group, who });
  }

  async setEdge(input: EdgeInput): Promise<void> {
    await this.#request('POST', '/edges', input);
  }

  social(): Promise<Social> {
    return this.#request('GET', '/social');
  }

  profile(who?: string): Promise<Profile> {
    return this.#request('GET', `/profile${who ? `?${new URLSearchParams({ who })}` : ''}`);
  }

  setProfile(input: ProfileInput): Promise<Profile> {
    return this.#request('POST', '/profile', input);
  }

  directory(): Promise<Profile[]> {
    return this.#request('GET', '/directory');
  }

  threads(group: string): Promise<ThreadInfo[]> {
    return this.#request('GET', `/threads?${new URLSearchParams({ group })}`);
  }

  startThread(input: InGroup & { title: string; text?: string }): Promise<ThreadInfo> {
    return this.#request('POST', '/threads', input);
  }

  reply(input: { target: string; text: string; as?: string }): Promise<ReplyInfo> {
    return this.#request('POST', '/replies', input);
  }

  channels(group: string): Promise<ChannelInfo[]> {
    return this.#request('GET', `/channels?${new URLSearchParams({ group })}`);
  }

  createChannel(input: InGroup & { name: string; topic?: string }): Promise<ChannelInfo> {
    return this.#request('POST', '/channels', input);
  }

  messages(group: string, options: { channel?: string; limit?: number } = {}): Promise<MessageInfo[]> {
    const params = new URLSearchParams({ group });
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.channel) params.set('channel', options.channel);
    return this.#request('GET', `/messages?${params}`);
  }

  say(input: InGroup & { text: string; channel?: string; replyTo?: string }): Promise<MessageInfo> {
    return this.#request('POST', '/messages', input);
  }

  async react(input: { target: string; emoji: string; on?: boolean; as?: string }): Promise<void> {
    await this.#request('POST', '/reactions', input);
  }

  issues(group: string): Promise<IssueInfo[]> {
    return this.#request('GET', `/issues?${new URLSearchParams({ group })}`);
  }

  openIssue(input: InGroup & { title: string; text?: string; labels?: string[] }): Promise<IssueInfo> {
    return this.#request('POST', '/issues', input);
  }

  claimIssue(input: { issue: string; as?: string }): Promise<IssueInfo> {
    return this.#request('POST', '/issues/claim', input);
  }

  setIssueStatus(input: { issue: string; status: IssueStatus; as?: string }): Promise<IssueInfo> {
    return this.#request('POST', '/issues/status', input);
  }

  proposals(group: string): Promise<ProposalInfo[]> {
    return this.#request('GET', `/proposals?${new URLSearchParams({ group })}`);
  }

  propose(input: InGroup & { title: string; text?: string; hours?: number; quorum?: number }): Promise<ProposalInfo> {
    return this.#request('POST', '/proposals', input);
  }

  vote(input: { proposal: string; choice: Choice; as?: string }): Promise<ProposalInfo> {
    return this.#request('POST', '/votes', input);
  }

  async delegateVote(input: { group: string; who?: string }): Promise<void> {
    await this.#request('POST', '/votes/delegate', input);
  }

  votingDelegate(group: string): Promise<Actor | null> {
    return this.#request('GET', `/votes/delegate?${new URLSearchParams({ group })}`);
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
