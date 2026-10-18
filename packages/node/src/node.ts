import { delegation, eventId, Replica, type Did, type SigningIdentity, type WeaveEvent } from '@weave/core';
import { SwarmNode } from '@weave/net';
import type { AgentInfo, Backend, FeedItem, FeedQuery, PublishInput, Status, Whoami } from './backend.ts';
import { loadConfig, saveConfig, type Config } from './config.ts';
import { FileStore } from './filestore.ts';
import { resolveHome, type Home } from './home.ts';
import { createAndSaveAgent, createAndSaveIdentity, loadAgents, loadIdentity, type AgentKey } from './keystore.ts';

export const KIND_PROFILE = 'weave.profile';

/**
 * One person's node: their keys, their replica of the logs they know, and
 * optionally a live connection to peers. The CLI uses it directly when no
 * daemon is running; the daemon wraps it with networking and the HTTP API.
 */
export class WeaveNode implements Backend {
  readonly home: Home;
  readonly identity: SigningIdentity;
  readonly replica: Replica;
  config: Config;
  #agents: AgentKey[];
  #swarm?: SwarmNode;

  private constructor(home: Home, identity: SigningIdentity) {
    this.home = home;
    this.identity = identity;
    this.replica = new Replica(new FileStore(home.logs));
    this.config = loadConfig(home);
    this.#agents = loadAgents(home);
  }

  static open(dir?: string): WeaveNode {
    const home = resolveHome(dir);
    const identity = loadIdentity(home);
    if (!identity) throw new Error(`no identity in ${home.dir} — run "weave init" first`);
    return new WeaveNode(home, identity);
  }

  /** Create a new identity in an empty home and publish a profile with the given name. */
  static init(name: string, dir?: string): WeaveNode {
    const home = resolveHome(dir);
    createAndSaveIdentity(home);
    const node = WeaveNode.open(home.dir);
    node.replica.append(node.identity, { kind: KIND_PROFILE, body: { name } });
    return node;
  }

  get online(): boolean {
    return this.#swarm !== undefined;
  }

  /** Connect to peers and join all configured topics. */
  async goOnline(): Promise<void> {
    if (this.#swarm) return;
    this.#swarm = new SwarmNode(this.replica, this.config.bootstrap.length ? { bootstrap: this.config.bootstrap } : {});
    // A node always listens on its own identity, so friends can reach it directly.
    await Promise.all([this.identity.author, ...this.config.topics].map((topic) => this.#swarm!.join(topic)));
  }

  async goOffline(): Promise<void> {
    await this.#swarm?.destroy();
    this.#swarm = undefined;
  }

  async whoami(): Promise<Whoami> {
    return { did: this.identity.did, name: this.nameOf(this.identity.did), agents: this.#agents.map(agentInfo) };
  }

  async publish(input: PublishInput): Promise<FeedItem> {
    const signer = input.as ? this.#agents.find((a) => a.name === input.as) : this.identity;
    if (!signer) throw new Error(`no agent named "${input.as}"`);
    const event = this.replica.append(signer, { kind: input.kind, body: input.body ?? null, scope: input.scope });
    return this.toItem(event);
  }

  async feed(query: FeedQuery = {}): Promise<FeedItem[]> {
    const kinds = query.kinds?.length ? new Set(query.kinds) : undefined;
    const events = this.replica.events((e) => !kinds || kinds.has(e.kind));
    return events.slice(-(query.limit ?? 50)).map((e) => this.toItem(e));
  }

  async addAgent(name: string, permissions: string[]): Promise<AgentInfo> {
    const agent = createAndSaveAgent(this.home, this.identity.author, name, permissions);
    this.replica.append(this.identity, delegation(agent.did, 'agent', permissions, name));
    this.#agents.push(agent);
    return agentInfo(agent);
  }

  async join(topic: string): Promise<void> {
    if (!this.config.topics.includes(topic)) {
      this.config = { ...this.config, topics: [...this.config.topics, topic] };
      saveConfig(this.home, this.config);
    }
    await this.#swarm?.join(topic);
  }

  async status(): Promise<Status> {
    const heads = this.replica.heads();
    return {
      did: this.identity.did,
      name: this.nameOf(this.identity.did),
      online: this.online,
      topics: this.config.topics,
      peers: this.#swarm?.sessions.size ?? 0,
      logs: Object.keys(heads).length,
      events: Object.values(heads).reduce((sum, seq) => sum + seq, 0),
      pending: this.replica.pendingCount,
    };
  }

  async watch(onItem: (item: FeedItem) => void, signal: AbortSignal): Promise<void> {
    const unsubscribe = this.replica.onAppend((event) => onItem(this.toItem(event)));
    await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
    unsubscribe();
  }

  /** Display name for an author: the name in their latest profile. */
  nameOf(author: Did): string | undefined {
    let name: string | undefined;
    for (const event of this.replica.store.range(author, 1)) {
      const body = event.body as { name?: unknown } | null;
      if (event.kind === KIND_PROFILE && typeof body?.name === 'string') name = body.name;
    }
    return name;
  }

  toItem(event: WeaveEvent): FeedItem {
    const item: FeedItem = {
      id: eventId(event),
      time: event.time,
      kind: event.kind,
      scope: event.scope,
      body: event.body,
      author: event.author,
      signer: event.signer,
      seq: event.seq,
    };
    const authorName = this.nameOf(event.author);
    if (authorName) item.authorName = authorName;
    if (event.signer !== event.author) {
      const signerName = this.replica.authority.grant(event.signer)?.name;
      if (signerName) item.signerName = signerName;
    }
    return item;
  }
}

const agentInfo = (agent: AgentKey): AgentInfo => ({ name: agent.name, did: agent.did, permissions: agent.permissions });
