import type { Did } from '@weave/core';
import type { Backend, ChatInfo, FeedItem, PostInfo, RpcMethod } from './backend.ts';
import { allows, areaOfKind, areaOfPost, type AgentScope, type Area } from './agentscope.ts';

/*
 * Agent tokens (`weave agent token <name>`): a bearer token bound to one agent key, for a harness that reaches a node
 * over the network (the agent API, `weave daemon --agent-api`) instead of through its home. A request with one acts as
 * that agent and nothing else: every write is signed by the agent (`as` is set here, whatever the caller sent), its
 * rights are checked as for any agent, and it reads what the agent reads: the person's groups, projects and
 * communities, and their direct chats only for an agent that reads them (one on an always-on node with direct chats
 * on). Nothing that runs the node: keys, devices, services, settings, other agents, links, pairing.
 *
 * A key with a scope (agentscope.ts, set in the app) reaches only the spaces in it, and in each only the areas it may
 * read or write there: a project's issues but not its chat, say. A person in the scope is their direct chat.
 */

/** Who a token speaks for. */
export interface AgentGrant {
  name: string;
  did: Did;
  /** It reads and answers the person's direct chats. */
  directChats: boolean;
  /** The spaces its key may use, with what it may read and write there; none: every space, as before scopes. */
  scope?: AgentScope;
  /** The machine the token was made for. */
  machine?: string;
}

/** Writes: their first argument is an input object; its `as` is the token's agent, always. */
const WRITES = ['publish', 'submit', 'editPost', 'deletePost', 'upvote', 'say', 'deleteMessage', 'react', 'startThread', 'reply', 'openIssue', 'claimIssue', 'setIssueStatus', 'vote', 'requestPermission', 'requestHand'] as const satisfies readonly RpcMethod[];

/** Reads, and storing a file to attach (no event, nothing signed). */
const READS = ['agentBoards', 'whoami', 'feed', 'spaces', 'posts', 'post', 'members', 'boards', 'project', 'threads', 'issues', 'proposals', 'messages', 'channels', 'chats', 'openChat', 'profile', 'imprint', 'tiers', 'blob', 'putBlob', 'putFile', 'agentBlocked'] as const satisfies readonly RpcMethod[];

/** Every method an agent token may call, one by one: a new method stays off until it's added here on purpose. */
export const AGENT_TOKEN_METHODS: readonly RpcMethod[] = [...WRITES, ...READS];

const isWrite = (method: string): boolean => (WRITES as readonly string[]).includes(method);

const directsOff = () => new Error("this agent doesn't read your direct chats");
const outOfScope = (what: string) => new Error(`this agent's key doesn't reach ${what}: give it the space in Weave (Sessions, its frame, Add a space)`);

/** May the grant see a direct chat? With a scope: when the scope names it; without: when the agent reads direct chats. */
const chatVisible = (grant: AgentGrant, space: string | undefined): boolean => (grant.scope ? allows(grant.scope, space, 'chat', 'read') : grant.directChats);

/** Is this feed or live item somewhere the agent doesn't read? */
const itemHidden = (item: Pick<FeedItem, 'kind' | 'space' | 'private'>, grant: AgentGrant): boolean => {
  if (item.private === true) return true;
  if (item.space?.kind === 'direct') return !chatVisible(grant, item.space.id);
  return !!grant.scope && !!item.space && !allows(grant.scope, item.space.id, areaOfKind(item.kind), 'read');
};

/** Is this post somewhere the agent doesn't read? */
const postHidden = (post: Pick<PostInfo, 'type' | 'board' | 'space'> & { private?: true }, grant: AgentGrant): boolean => {
  if (post.private === true) return true;
  if (post.space?.kind === 'direct') return !chatVisible(grant, post.space.id);
  return !!grant.scope && !!post.space && !allows(grant.scope, post.space.id, areaOfPost(post), 'read');
};

/** Which area each write is in; a post's own type decides for writes that name a post. */
const WRITE_AREAS: Partial<Record<(typeof WRITES)[number], Area>> = { say: 'chat', deleteMessage: 'chat', startThread: 'chat', openIssue: 'issues', claimIssue: 'issues', setIssueStatus: 'issues', vote: 'votes', publish: 'posts' };

/**
 * The node as one agent's token sees it: only AGENT_TOKEN_METHODS, writes as that agent, nothing of the person's
 * direct chats unless the agent reads them, and with a scope only its spaces and areas. Returns undefined for a
 * method the token may not call.
 */
export function agentCall(backend: Backend, grant: AgentGrant, method: string, args: unknown[]): Promise<unknown> | undefined {
  if (!AGENT_TOKEN_METHODS.includes(method as RpcMethod)) return undefined;
  const call = (m: RpcMethod, a: unknown[]) => (backend[m] as (...x: unknown[]) => Promise<unknown>).apply(backend, a);
  const scope = grant.scope;
  /** The person's direct chat a reference names (its id, the other person's name or key). */
  const chatOf = async (ref: unknown): Promise<ChatInfo | undefined> => {
    if (typeof ref !== 'string') return undefined;
    const chats = await backend.chats();
    const r = ref.toLowerCase();
    return chats.find((c: ChatInfo) => c.space.id === ref || c.peer.did === ref || c.space.name.toLowerCase() === r || c.peer.name?.toLowerCase() === r);
  };
  /** A group, project or community a reference names, by id or name. */
  const spaceOf = async (ref: unknown): Promise<string | undefined> => {
    if (typeof ref !== 'string') return undefined;
    const spaces = (await backend.spaces()) as Array<{ id: string; name: string }>;
    const r = ref.toLowerCase();
    return (spaces.find((s) => s.id === ref) ?? spaces.find((s) => s.name.toLowerCase() === r))?.id;
  };
  /** Refuse unless the grant reaches this area of the space a reference names (a direct chat's too). */
  const need = async (ref: unknown, area: Area | 'any', how: 'read' | 'write'): Promise<void> => {
    const chat = await chatOf(ref);
    if (chat) {
      if (!chatVisible(grant, chat.space.id) || (scope && how === 'write' && !allows(scope, chat.space.id, 'chat', 'write'))) throw scope ? outOfScope(`your chat with ${chat.peer.name ?? 'this person'}`) : directsOff();
      return;
    }
    if (!scope) return;
    const id = await spaceOf(ref);
    if (!allows(scope, id, area, how)) throw outOfScope(typeof ref === 'string' ? ref : 'that space');
  };
  /** Refuse unless the grant may write to the post a reference names, in its own area (or the one given). */
  const needPost = async (ref: unknown, area?: Area): Promise<void> => {
    if (!scope) return;
    const post = (await call('post', [ref])) as PostInfo;
    if (post.space?.kind === 'direct' ? !allows(scope, post.space.id, 'chat', 'write') : !allows(scope, post.space?.id, area ?? areaOfPost(post), 'write')) throw outOfScope(`"${post.title ?? 'that post'}"`);
  };
  /** A chat message's space, looked for in the spaces whose chat the scope may write. */
  const needMessage = async (ref: unknown): Promise<void> => {
    if (!scope) return;
    for (const space of Object.keys(scope.spaces).filter((s) => allows(scope, s, 'chat', 'write'))) {
      const found = ((await backend.messages(space, { limit: 500 }).catch(() => [])) as Array<{ id: string }>).some((m) => m.id === ref);
      if (found) return;
    }
    throw outOfScope('that message');
  };
  return (async () => {
    if (isWrite(method)) {
      const input: Record<string, unknown> = { ...((args[0] ?? {}) as Record<string, unknown>), as: grant.name };
      const w = method as (typeof WRITES)[number];
      switch (w) {
        case 'submit':
          await need(input.space, input.board === 'issues' ? 'issues' : input.board === 'proposals' ? 'votes' : input.board === 'releases' ? 'releases' : 'posts', 'write');
          break;
        case 'publish':
        case 'say':
        case 'startThread':
        case 'openIssue':
          if (w === 'say' && input.post && scope) await needPost(input.post, 'posts');
          else await need(input.space ?? input.project, WRITE_AREAS[w]!, 'write');
          break;
        case 'requestHand':
          await need(input.project, 'any', 'read');
          break;
        case 'editPost':
        case 'deletePost':
          await needPost(input.post);
          break;
        case 'upvote':
        case 'reply':
          await needPost(input.target, 'posts');
          break;
        case 'claimIssue':
        case 'setIssueStatus':
          await needPost(input.issue, 'issues');
          break;
        case 'vote':
          await needPost(input.proposal, 'votes');
          break;
        case 'react':
          if (scope) await needPost(input.target, 'posts').catch(() => needMessage(input.target));
          break;
        case 'deleteMessage':
          await needMessage(input.message);
          break;
        case 'requestPermission':
          break;
      }
      return call(method as RpcMethod, [input, ...args.slice(1)]);
    }
    switch (method) {
      case 'whoami': {
        const me = await backend.whoami();
        return { ...me, agents: me.agents.filter((a) => a.name === grant.name && a.did === grant.did) };
      }
      case 'feed':
        return ((await call('feed', args)) as FeedItem[]).filter((i) => !itemHidden(i, grant));
      case 'spaces':
        return ((await call('spaces', args)) as Array<{ id: string; kind?: string }>).filter((s) => (s.kind === 'direct' ? chatVisible(grant, s.id) : !scope || allows(scope, s.id, 'any', 'read')));
      case 'posts':
        return ((await call('posts', args)) as PostInfo[]).filter((p) => !postHidden(p, grant));
      case 'post': {
        const post = (await call('post', args)) as PostInfo;
        if (postHidden(post, grant)) throw post.space?.kind === 'direct' && !scope ? directsOff() : outOfScope(`"${post.title ?? 'that post'}"`);
        return post;
      }
      case 'agentBoards':
        return ((await call('agentBoards', args)) as Array<{ space: { id: string } }>).filter((b) => !scope || allows(scope, b.space.id, 'any', 'read'));
      case 'agentBlocked':
        return backend.agentBlocked(grant.name);
      case 'chats':
        return ((await call('chats', args)) as ChatInfo[]).filter((c) => chatVisible(grant, c.space.id));
      case 'openChat': {
        const chat = (await call('openChat', args)) as ChatInfo;
        if (!chatVisible(grant, chat.space.id)) throw scope ? outOfScope(`your chat with ${chat.peer.name ?? 'this person'}`) : directsOff();
        return chat;
      }
      case 'messages':
      case 'channels':
      case 'threads':
        await need(args[0], 'chat', 'read');
        return call(method, args);
      case 'issues':
        await need(args[0], 'issues', 'read');
        return call(method, args);
      case 'proposals':
        await need(args[0], 'votes', 'read');
        return call(method, args);
      case 'members':
      case 'boards':
      case 'project':
        await need(args[0], 'any', 'read');
        return call(method as RpcMethod, args);
      default:
        return call(method as RpcMethod, args);
    }
  })();
}

/** The live stream as the agent sees it. */
export function agentWatch(backend: Backend, grant: AgentGrant, onItem: (item: FeedItem) => void, signal: AbortSignal): Promise<void> {
  return backend.watch((item) => {
    if (!itemHidden(item, grant)) onItem(item);
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
