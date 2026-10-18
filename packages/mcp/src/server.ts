import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Backend, FeedItem } from '@weave/node';

export interface WeaveMcpOptions {
  /** Agent name to sign every write with; its delegated permissions apply. Without it, writes are signed as the person. */
  as?: string;
}

/** A new event, shortened for an agent to read. */
export interface InboxItem {
  id: string;
  short: string;
  kind: string;
  /** The project, group or community it happened in. */
  space?: string;
  /** Chat channel, for messages in a channel. */
  channel?: string;
  /** The post whose chat a message is in. */
  post?: string;
  by: string;
  text: string;
  time: string;
  /** The text mentions this agent as @name. */
  mentionsMe: boolean;
}

const MAX_INBOX = 500;

const textOf = (body: unknown): string => {
  if (typeof body === 'string') return body;
  const b = body as { text?: unknown; title?: unknown } | null;
  return [b?.title, b?.text].filter((x): x is string => typeof x === 'string' && x !== '').join(' — ');
};

/** Where a chat message was said: a channel, or a post's chat. */
const chatPlace = (body: unknown): { channel: string } | { post: string } => {
  const b = body as { channel?: unknown; post?: unknown } | null;
  return typeof b?.post === 'string' ? { post: b.post.slice(0, 8) } : { channel: typeof b?.channel === 'string' ? b.channel : 'general' };
};

const json = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] });

const failure = (error: unknown) => ({ content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }], isError: true });

/** Wraps a tool body so errors come back as tool errors the agent can read. */
const run = <A>(fn: (args: A) => Promise<unknown>) => async (args: A) => {
  try {
    return json(await fn(args));
  } catch (error) {
    return failure(error);
  }
};

/**
 * An MCP server that lets an agent harness take part in Weave: read projects and groups,
 * discussions, chat, issues and votes, write into them, and pick up what's new
 * through an inbox. It talks to a node through the Backend interface, so it
 * works against a running daemon or a node opened directly.
 */
export function createWeaveMcp(backend: Backend, options: WeaveMcpOptions = {}) {
  const as = options.as;
  const server = new McpServer({ name: 'weave', version: '0.0.1' });

  // ---------------------------------------------------------------- inbox
  const inbox: InboxItem[] = [];
  const waiters = new Set<() => void>();
  const watching = new AbortController();
  let mySigner: string | undefined;

  void backend.whoami().then((me) => {
    mySigner = as ? me.agents.find((a) => a.name === as)?.did : me.signer;
  });

  const mentionPattern = as ? new RegExp(`@${as.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i') : undefined;

  backend
    .watch((item: FeedItem) => {
      if (item.signer === mySigner) return; // our own writes are not news
      const text = textOf(item.body);
      if (!text && !item.kind.startsWith('weave.issue')) return;
      inbox.push({
        id: item.id,
        short: item.id.slice(0, 8),
        kind: item.kind,
        ...(item.space ? { space: `${item.space.kind} ${item.space.name}` } : {}),
        ...(item.kind === 'weave.msg' ? chatPlace(item.body) : {}),
        by: `${item.authorName ?? item.author}${item.signerName ? ` (agent ${item.signerName})` : ''}`,
        text,
        time: item.time,
        mentionsMe: mentionPattern ? mentionPattern.test(text) : false,
      });
      if (inbox.length > MAX_INBOX) inbox.splice(0, inbox.length - MAX_INBOX);
      for (const wake of waiters) wake();
    }, watching.signal)
    .catch(() => {});

  server.registerTool(
    'weave_inbox',
    {
      title: 'What is new',
      description:
        'New events since the last call: posts, chat messages (in channels or in a post\'s chat), issues and proposals from the projects, groups and communities this node belongs to. ' +
        'Returned items are removed from the inbox. Use wait_seconds to wait for something to arrive. ' +
        'Items where mentionsMe is true address this agent directly (@name) and usually deserve a reply.',
      inputSchema: {
        mentions_only: z.boolean().optional().describe('Only return items that mention this agent'),
        wait_seconds: z.number().min(0).max(60).optional().describe('Wait up to this long if nothing is new yet'),
      },
    },
    run(async ({ mentions_only, wait_seconds }: { mentions_only?: boolean; wait_seconds?: number }) => {
      const matches = () => inbox.filter((i) => !mentions_only || i.mentionsMe);
      if (matches().length === 0 && wait_seconds) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(done, wait_seconds * 1000);
          function done() {
            clearTimeout(timer);
            waiters.delete(check);
            resolve();
          }
          function check() {
            if (matches().length) done();
          }
          waiters.add(check);
        });
      }
      const taken = matches();
      for (const item of taken) inbox.splice(inbox.indexOf(item), 1);
      return { items: taken, remaining: inbox.length };
    }),
  );

  // ---------------------------------------------------------------- who and where

  server.registerTool(
    'weave_whoami',
    {
      title: 'Who am I',
      description: 'The person this node belongs to, the agent identity you act as (if any) with its permissions, the projects you can work in, and the groups and communities you are in.',
      annotations: { readOnlyHint: true },
    },
    run(async () => {
      const [me, spaces] = await Promise.all([backend.whoami(), backend.spaces()]);
      const agent = as ? me.agents.find((a) => a.name === as) : undefined;
      if (as && !agent) throw new Error(`this node has no agent named "${as}"`);
      return {
        person: { name: me.name, did: me.did },
        actingAs: agent ? { agent: agent.name, did: agent.did, permissions: agent.permissions } : 'the person themself',
        projects: spaces.filter((p) => p.kind === 'project').map((p) => ({ id: p.id, name: p.name, participants: p.members })),
        groups: spaces.filter((g) => g.kind === 'group').map((g) => ({ id: g.id, name: g.name, members: g.members })),
        communities: spaces.filter((c) => c.kind === 'community').map((c) => ({ id: c.id, name: c.name, members: c.members })),
      };
    }),
  );

  server.registerTool(
    'weave_members',
    {
      title: 'Members',
      description: 'Participants of a project (and through which group they came), or members of a group or community.',
      inputSchema: { space: z.string().describe('Project, group or community name or id') },
      annotations: { readOnlyHint: true },
    },
    run(async ({ space }: { space: string }) => backend.members(space)),
  );

  server.registerTool(
    'weave_people',
    {
      title: 'Find people',
      description: 'People this node knows of (profiles seen and the address book), optionally matching a name or did:key, with follow and friend state.',
      inputSchema: { query: z.string().optional() },
      annotations: { readOnlyHint: true },
    },
    run(async ({ query }: { query?: string }) =>
      (await backend.directory(query)).map((p) => ({ name: p.name, did: p.did, following: p.following, followsMe: p.followsMe, friend: p.following && p.followsMe, contact: p.contact }))),
  );

  server.registerTool(
    'weave_project',
    { title: 'Project page', description: "A project's page: description, status, maintainers and invited groups.", inputSchema: { project: z.string() }, annotations: { readOnlyHint: true } },
    run(async ({ project }: { project: string }) => backend.project(project)),
  );

  server.registerTool(
    'weave_feed',
    {
      title: 'Recent posts',
      description: 'Recent posts, either public or in one project or group, oldest first.',
      inputSchema: { space: z.string().optional().describe('Project or group name or id; omit for everything'), limit: z.number().int().min(1).max(200).optional() },
      annotations: { readOnlyHint: true },
    },
    run(async ({ space, limit }: { space?: string; limit?: number }) =>
      (await backend.feed({ space, kinds: ['weave.post'], limit: limit ?? 30 })).map((i) => ({
        id: i.id,
        by: i.authorName ?? i.author,
        agent: i.signerName,
        space: i.space?.name,
        text: textOf(i.body),
        time: i.time,
      })),
    ),
  );

  server.registerTool(
    'weave_post',
    {
      title: 'Post a short update',
      description: 'Publish a short text update without a title. Inside a project or group only its members can read it; without one it is public. For a titled post in a community or a project board, use weave_submit.',
      inputSchema: { text: z.string().min(1), space: z.string().optional().describe('Project or group name or id') },
    },
    run(async ({ text, space }: { text: string; space?: string }) => backend.publish({ kind: 'weave.post', body: { text }, space, as })),
  );

  // ---------------------------------------------------------------- posts and boards

  server.registerTool(
    'weave_posts',
    {
      title: 'Posts',
      description:
        'Posts with score and chat size. In a community, or in a project (optionally one board: releases, ideas, issues, proposals or custom ones). ' +
        'Without a space: the home feed (communities, projects, shares from people followed). Every post has its own chat; read it with weave_read_post.',
      inputSchema: {
        space: z.string().optional().describe('Project or community name or id'),
        board: z.string().optional(),
        sort: z.enum(['hot', 'new', 'top']).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    run(async ({ space, board, sort, limit }: { space?: string; board?: string; sort?: 'hot' | 'new' | 'top'; limit?: number }) => backend.posts({ space, board, sort, limit: limit ?? 30 })),
  );

  server.registerTool(
    'weave_read_post',
    { title: 'Read a post', description: 'A post with its chat. Id or its first 8 characters.', inputSchema: { post: z.string().min(6), limit: z.number().int().min(1).max(200).optional() }, annotations: { readOnlyHint: true } },
    run(async ({ post, limit }: { post: string; limit?: number }) => {
      const p = await backend.post(post);
      const chat = p.space && p.type !== 'project' ? await backend.messages(undefined, { post: p.id, limit: limit ?? 50 }) : [];
      return { ...p, chat };
    }),
  );

  server.registerTool(
    'weave_submit',
    {
      title: 'Submit a post',
      description: "Post into a community, or into a project's board (default: ideas). In an issues board it opens an issue, in a proposals board a proposal.",
      inputSchema: { space: z.string().describe('Project or community name or id'), title: z.string().min(1).max(200), text: z.string().optional(), link: z.string().url().optional(), board: z.string().optional() },
    },
    run(async ({ space, title, text, link, board }: { space: string; title: string; text?: string; link?: string; board?: string }) => backend.submit({ space, board, title, text, link, as })),
  );

  server.registerTool(
    'weave_upvote',
    { title: 'Upvote', description: 'Upvote (1), downvote (-1) or take back your vote (0) on a post. One vote per person.', inputSchema: { post: z.string().min(6), value: z.union([z.literal(1), z.literal(0), z.literal(-1)]) } },
    run(async ({ post, value }: { post: string; value: number }) => backend.upvote({ target: post, value, as })),
  );

  server.registerTool(
    'weave_boards',
    { title: 'Boards', description: "A project's boards (or a community's one board) with post counts and pinned posts.", inputSchema: { space: z.string() }, annotations: { readOnlyHint: true } },
    run(async ({ space }: { space: string }) => backend.boards(space)),
  );

  // ---------------------------------------------------------------- memberships

  server.registerTool(
    'weave_tiers',
    {
      title: 'Membership tiers',
      description: "The membership tiers someone offers (default: the person this node belongs to), with price per month in cents, benefits and, for the creator, member counts. Memberships give access, never votes.",
      inputSchema: { who: z.string().optional().describe('Name or did:key of the creator') },
      annotations: { readOnlyHint: true },
    },
    run(async ({ who }: { who?: string }) => backend.tiers(who)),
  );

  // ---------------------------------------------------------------- direct chats

  server.registerTool(
    'weave_chats',
    {
      title: 'Direct chats',
      description: "The person's direct chats with friends, most recent first. Read one with weave_chat (space = the chat's space id).",
      annotations: { readOnlyHint: true },
    },
    run(async () => (await backend.chats()).map((c) => ({ space: c.space.id, with: c.peer.name ?? c.peer.did, friend: c.friend, last: c.last }))),
  );

  server.registerTool(
    'weave_dm',
    {
      title: 'Message a friend',
      description: 'Send a direct message to a friend (someone the person follows who follows back). Signed as this agent, so the friend sees it came from the agent.',
      inputSchema: { who: z.string().describe('Name or did:key'), text: z.string().min(1), reply_to: z.string().min(6).optional() },
    },
    run(async ({ who, text, reply_to }: { who: string; text: string; reply_to?: string }) => {
      const chat = await backend.openChat(who);
      return backend.say({ space: chat.id, text, replyTo: reply_to, as });
    }),
  );

  // ---------------------------------------------------------------- discussion and chat

  server.registerTool(
    'weave_threads',
    { title: 'Discussions', description: 'Discussion threads in a project with their replies, most recently active first.', inputSchema: { project: z.string() }, annotations: { readOnlyHint: true } },
    run(async ({ project }: { project: string }) => backend.threads(project)),
  );

  server.registerTool(
    'weave_start_thread',
    { title: 'Start a discussion', description: 'Start a discussion thread in a project.', inputSchema: { project: z.string(), title: z.string().min(1), text: z.string().optional() } },
    run(async ({ project, title, text }: { project: string; title: string; text?: string }) => backend.startThread({ project, title, text, as })),
  );

  server.registerTool(
    'weave_reply',
    {
      title: 'Reply',
      description: 'Reply to a discussion thread, an issue or a proposal. The target can be its full id or the first 8 characters.',
      inputSchema: { target: z.string().min(6), text: z.string().min(1) },
    },
    run(async ({ target, text }: { target: string; text: string }) => backend.reply({ target, text, as })),
  );

  server.registerTool(
    'weave_chat',
    {
      title: 'Read chat',
      description: "Recent chat messages, oldest first, with replies and reactions: in a project's, group's or community's channels (omit channel for all), or in one post's chat.",
      inputSchema: {
        space: z.string().optional().describe('Project, group or community name or id'),
        channel: z.string().optional(),
        post: z.string().min(6).optional().describe('Read this post\'s chat instead of a channel'),
        limit: z.number().int().min(1).max(200).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    run(async ({ space, channel, post, limit }: { space?: string; channel?: string; post?: string; limit?: number }) => backend.messages(space, { channel, post, limit: limit ?? 50 })),
  );

  server.registerTool(
    'weave_say',
    {
      title: 'Send a chat message',
      description: 'Send a short chat message to a channel (default "general") of a project, group or community, or into a post\'s chat, optionally as a reply to a message id.',
      inputSchema: {
        space: z.string().optional().describe('Project, group or community name or id'),
        post: z.string().min(6).optional().describe('Talk in this post\'s chat instead of a channel'),
        text: z.string().min(1),
        channel: z.string().optional(),
        reply_to: z.string().min(6).optional(),
      },
    },
    run(async ({ space, post, text, channel, reply_to }: { space?: string; post?: string; text: string; channel?: string; reply_to?: string }) =>
      backend.say({ space, post, text, channel, replyTo: reply_to, as }),
    ),
  );

  server.registerTool(
    'weave_channels',
    { title: 'Chat channels', description: 'The chat channels of a project, group or community.', inputSchema: { space: z.string() }, annotations: { readOnlyHint: true } },
    run(async ({ space }: { space: string }) => backend.channels(space)),
  );

  server.registerTool(
    'weave_react',
    {
      title: 'React with an emoji',
      description: 'React to a message, post, thread, reply, issue or proposal with an emoji, e.g. 👀 when you start on something and ✅ when it is done. Set on to false to take a reaction back.',
      inputSchema: { target: z.string().min(6), emoji: z.string().min(1).max(16), on: z.boolean().optional() },
    },
    run(async ({ target, emoji, on }: { target: string; emoji: string; on?: boolean }) => {
      await backend.react({ target, emoji, on, as });
      return { ok: true };
    }),
  );

  // ---------------------------------------------------------------- issues

  server.registerTool(
    'weave_issues',
    { title: 'Issues', description: 'Issues in a project with status (open, in-progress, done, closed) and assignee.', inputSchema: { project: z.string() }, annotations: { readOnlyHint: true } },
    run(async ({ project }: { project: string }) => backend.issues(project)),
  );

  server.registerTool(
    'weave_open_issue',
    { title: 'Open an issue', description: 'Open an issue in a project.', inputSchema: { project: z.string(), title: z.string().min(1), text: z.string().optional(), labels: z.array(z.string()).optional() } },
    run(async ({ project, title, text, labels }: { project: string; title: string; text?: string; labels?: string[] }) => backend.openIssue({ project, title, text, labels, as })),
  );

  server.registerTool(
    'weave_claim_issue',
    { title: 'Take an issue', description: 'Claim an issue so others know you are working on it. Id or its first 8 characters.', inputSchema: { issue: z.string().min(6) } },
    run(async ({ issue }: { issue: string }) => backend.claimIssue({ issue, as })),
  );

  server.registerTool(
    'weave_set_issue_status',
    {
      title: 'Change issue status',
      description: 'Set an issue to open, in-progress, done or closed.',
      inputSchema: { issue: z.string().min(6), status: z.enum(['open', 'in-progress', 'done', 'closed']) },
    },
    run(async ({ issue, status }: { issue: string; status: 'open' | 'in-progress' | 'done' | 'closed' }) => backend.setIssueStatus({ issue, status, as })),
  );

  // ---------------------------------------------------------------- votes

  server.registerTool(
    'weave_proposals',
    {
      title: 'Proposals',
      description: 'Proposals in a project with their current tally, quorum and deadline. Agents usually only read these; voting needs the weave.vote permission.',
      inputSchema: { project: z.string() },
      annotations: { readOnlyHint: true },
    },
    run(async ({ project }: { project: string }) => backend.proposals(project)),
  );

  server.registerTool(
    'weave_vote',
    {
      title: 'Vote',
      description: 'Vote on a proposal. Only works if the person granted this agent the weave.vote permission.',
      inputSchema: { proposal: z.string().min(6), choice: z.enum(['yes', 'no', 'abstain']) },
    },
    run(async ({ proposal, choice }: { proposal: string; choice: 'yes' | 'no' | 'abstain' }) => backend.vote({ proposal, choice, as })),
  );

  return {
    server,
    /** Stop listening for new events. */
    close() {
      watching.abort();
    },
  };
}
