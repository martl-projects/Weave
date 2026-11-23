import type { Did } from '@weave/core';
import type { Backend, ChatInfo, FeedItem, RpcMethod } from './backend.ts';

/*
 * Agent tokens (`weave agent token <name>`): a bearer token bound to one agent key, for a harness that reaches a node
 * over the network (the agent API, `weave daemon --agent-api`) instead of through its home. A request with one acts as
 * that agent and nothing else: every write is signed by the agent (`as` is set here, whatever the caller sent), its
 * rights are checked as for any agent, and it reads what the agent reads: the person's groups, projects and
 * communities, and their direct chats only for an agent that reads them (one on an always-on node with direct chats
 * on). Nothing that runs the node: keys, devices, services, settings, other agents, links, pairing.
 */

/** Who a token speaks for. */
export interface AgentGrant {
  name: string;
  did: Did;
  /** It reads and answers the person's direct chats. */
  directChats: boolean;
}

/** Writes: their first argument is an input object; its `as` is the token's agent, always. */
const WRITES = ['publish', 'submit', 'editPost', 'deletePost', 'upvote', 'say', 'deleteMessage', 'react', 'startThread', 'reply', 'openIssue', 'claimIssue', 'setIssueStatus', 'vote', 'requestPermission', 'requestHand'] as const satisfies readonly RpcMethod[];

/** Reads, and storing a file to attach (no event, nothing signed). */
const READS = ['agentBoards', 'whoami', 'feed', 'spaces', 'posts', 'post', 'members', 'boards', 'project', 'threads', 'issues', 'proposals', 'messages', 'channels', 'chats', 'openChat', 'profile', 'imprint', 'tiers', 'blob', 'putBlob', 'putFile', 'agentBlocked'] as const satisfies readonly RpcMethod[];

/** Every method an agent token may call, one by one: a new method stays off until it's added here on purpose. */
export const AGENT_TOKEN_METHODS: readonly RpcMethod[] = [...WRITES, ...READS];

const isWrite = (method: string): boolean => (WRITES as readonly string[]).includes(method);

const directsOff = () => new Error("this agent doesn't read your direct chats");

/** Is this item somewhere the agent doesn't read: a direct chat (without the option), or sealed to the person alone? */
const hidden = (item: { space?: { kind?: string }; private?: true }, grant: AgentGrant): boolean => item.private === true || (item.space?.kind === 'direct' && !grant.directChats);

/**
 * The node as one agent's token sees it: only AGENT_TOKEN_METHODS, writes as that agent, and nothing of the person's
 * direct chats unless the agent reads them. Returns undefined for a method the token may not call.
 */
export function agentCall(backend: Backend, grant: AgentGrant, method: string, args: unknown[]): Promise<unknown> | undefined {
  if (!AGENT_TOKEN_METHODS.includes(method as RpcMethod)) return undefined;
  const call = (m: RpcMethod, a: unknown[]) => (backend[m] as (...x: unknown[]) => Promise<unknown>).apply(backend, a);
  /** A space reference that names one of the person's direct chats (its id, the other person's name or key). */
  const isChat = async (ref: unknown): Promise<boolean> => {
    if (typeof ref !== 'string') return false;
    const chats = await backend.chats();
    const r = ref.toLowerCase();
    return chats.some((c: ChatInfo) => c.space.id === ref || c.peer.did === ref || c.space.name.toLowerCase() === r || c.peer.name?.toLowerCase() === r);
  };
  return (async () => {
    if (isWrite(method)) {
      const input: Record<string, unknown> = { ...((args[0] ?? {}) as Record<string, unknown>), as: grant.name };
      if (!grant.directChats && (await isChat(input.space))) throw directsOff();
      return call(method as RpcMethod, [input, ...args.slice(1)]);
    }
    switch (method) {
      case 'whoami': {
        const me = await backend.whoami();
        return { ...me, agents: me.agents.filter((a) => a.name === grant.name && a.did === grant.did) };
      }
      case 'feed':
        return ((await call('feed', args)) as FeedItem[]).filter((i) => !hidden(i, grant));
      case 'spaces':
        return ((await call('spaces', args)) as Array<{ kind?: string }>).filter((s) => grant.directChats || s.kind !== 'direct');
      case 'posts':
        return ((await call('posts', args)) as Array<{ space?: { kind?: string } }>).filter((p) => !hidden(p, grant));
      case 'post': {
        const post = (await call('post', args)) as { space?: { kind?: string } };
        if (hidden(post, grant)) throw directsOff();
        return post;
      }
      case 'agentBlocked':
        return backend.agentBlocked(grant.name);
      case 'chats':
        return grant.directChats ? call('chats', args) : [];
      case 'openChat':
        if (!grant.directChats) throw directsOff();
        return call('openChat', args);
      case 'messages':
      case 'channels':
        if (!grant.directChats && (await isChat(args[0]))) throw directsOff();
        return call(method, args);
      default:
        return call(method as RpcMethod, args);
    }
  })();
}

/** The live stream as the agent sees it. */
export function agentWatch(backend: Backend, grant: AgentGrant, onItem: (item: FeedItem) => void, signal: AbortSignal): Promise<void> {
  return backend.watch((item) => {
    if (!hidden(item, grant)) onItem(item);
  }, signal);
}

/**
 * A Backend as one of the agents this node holds sees it (`mcp --as`, `watch --as` on the node itself): on an always-on
 * node, an agent without the direct-chats option sees nothing of the person's direct chats, while the node opens them
 * for another agent that has it. Everything else passes through. Elsewhere (whoami names no option) nothing changes.
 */
export function agentReads(backend: Backend, name: string): Backend {
  let grant: Promise<AgentGrant | undefined> | undefined;
  const scoped = () =>
    (grant ??= backend.whoami().then((me) => {
      const agent = me.agents.find((a) => a.name === name);
      // Only a node says whether its agents read direct chats: there, one that doesn't sees none.
      return agent && agent.directChats === false ? { name, did: agent.did, directChats: false } : undefined;
    }).catch((error: unknown) => {
      grant = undefined;
      throw error;
    }));
  const call = (m: RpcMethod, a: unknown[]) => (backend[m] as (...x: unknown[]) => Promise<unknown>).apply(backend, a);
  const READ_FILTERED = new Set(['feed', 'spaces', 'posts', 'post', 'chats', 'openChat', 'messages', 'channels', 'say', 'react', 'deleteMessage']);
  return new Proxy(backend, {
    get(target, prop) {
      if (prop === 'watch')
        return async (onItem: (item: FeedItem) => void, signal: AbortSignal) => {
          const g = await scoped();
          return g ? target.watch((item) => void (directHidden(item, g) ? undefined : onItem(item)), signal) : target.watch(onItem, signal);
        };
      if (typeof prop === 'string' && READ_FILTERED.has(prop))
        return async (...args: unknown[]) => {
          const g = await scoped();
          if (!g) return call(prop as RpcMethod, args);
          return directsFiltered(backend, g, prop, args, call);
        };
      // Bound to the node itself: its private fields aren't reachable through the proxy.
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/** In a direct chat, for an agent that doesn't read them. */
const directHidden = (item: { space?: { kind?: string } }, grant: AgentGrant): boolean => item.space?.kind === 'direct' && !grant.directChats;

/** The reads (and chat writes) that touch direct chats, for an agent that doesn't read them. */
async function directsFiltered(backend: Backend, grant: AgentGrant, method: string, args: unknown[], call: (m: RpcMethod, a: unknown[]) => Promise<unknown>): Promise<unknown> {
  const isChat = async (ref: unknown): Promise<boolean> => {
    if (typeof ref !== 'string') return false;
    const chats = await backend.chats();
    const r = ref.toLowerCase();
    return chats.some((c: ChatInfo) => c.space.id === ref || c.peer.did === ref || c.space.name.toLowerCase() === r || c.peer.name?.toLowerCase() === r);
  };
  switch (method) {
    case 'feed':
      return ((await call('feed', args)) as FeedItem[]).filter((i) => !directHidden(i, grant));
    case 'spaces':
      return ((await call('spaces', args)) as Array<{ kind?: string }>).filter((sp) => sp.kind !== 'direct');
    case 'posts':
      return ((await call('posts', args)) as Array<{ space?: { kind?: string } }>).filter((p) => !directHidden(p, grant));
    case 'post': {
      const post = (await call('post', args)) as { space?: { kind?: string } };
      if (directHidden(post, grant)) throw directsOff();
      return post;
    }
    case 'chats':
      return [];
    case 'openChat':
      throw directsOff();
    case 'messages':
    case 'channels':
      if (await isChat(args[0])) throw directsOff();
      return call(method, args);
    default: {
      // say, react, deleteMessage: not into a direct chat.
      const input = (args[0] ?? {}) as { space?: unknown };
      if (await isChat(input.space)) throw directsOff();
      return call(method as RpcMethod, args);
    }
  }
}
