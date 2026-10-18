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
  group?: string;
  /** Chat channel, for messages. */
  channel?: string;
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
 * An MCP server that lets an agent harness take part in Weave: read groups,
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
    mySigner = as ? me.agents.find((a) => a.name === as)?.did : me.did;
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
        ...(item.group ? { group: item.group.name } : {}),
        ...(item.kind === 'weave.msg' ? { channel: ((item.body as { channel?: string } | null)?.channel ?? 'general') } : {}),
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
        'New events since the last call: posts, chat messages, discussion threads, replies, issues and proposals from the groups this node belongs to. ' +
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
      description: 'The person this node belongs to, the agent identity you act as (if any) with its permissions, and the groups you can work in.',
      annotations: { readOnlyHint: true },
    },
    run(async () => {
      const [me, groups] = await Promise.all([backend.whoami(), backend.groups()]);
      const agent = as ? me.agents.find((a) => a.name === as) : undefined;
      if (as && !agent) throw new Error(`this node has no agent named "${as}"`);
      return {
        person: { name: me.name, did: me.did },
        actingAs: agent ? { agent: agent.name, did: agent.did, permissions: agent.permissions } : 'the person themself',
        groups: groups.map((g) => ({ id: g.id, name: g.name, members: g.members })),
      };
    }),
  );

  server.registerTool(
    'weave_members',
    { title: 'Group members', description: 'Members of a group and who invited whom.', inputSchema: { group: z.string() }, annotations: { readOnlyHint: true } },
    run(async ({ group }: { group: string }) => backend.members(group)),
  );

  server.registerTool(
    'weave_feed',
    {
      title: 'Recent posts',
      description: 'Recent posts, either public or in one group, oldest first.',
      inputSchema: { group: z.string().optional().describe('Group name or id; omit for everything'), limit: z.number().int().min(1).max(200).optional() },
      annotations: { readOnlyHint: true },
    },
    run(async ({ group, limit }: { group?: string; limit?: number }) =>
      (await backend.feed({ group, kinds: ['weave.post'], limit: limit ?? 30 })).map((i) => ({
        id: i.id,
        by: i.authorName ?? i.author,
        agent: i.signerName,
        group: i.group?.name,
        text: textOf(i.body),
        time: i.time,
      })),
    ),
  );

  server.registerTool(
    'weave_post',
    {
      title: 'Post an update',
      description: 'Publish a post: show progress or results. Inside a group only members can read it; without a group it is public.',
      inputSchema: { text: z.string().min(1), group: z.string().optional() },
    },
    run(async ({ text, group }: { text: string; group?: string }) => backend.publish({ kind: 'weave.post', body: { text }, group, as })),
  );

  // ---------------------------------------------------------------- discussion and chat

  server.registerTool(
    'weave_threads',
    { title: 'Discussions', description: 'Discussion threads in a group with their replies, most recently active first.', inputSchema: { group: z.string() }, annotations: { readOnlyHint: true } },
    run(async ({ group }: { group: string }) => backend.threads(group)),
  );

  server.registerTool(
    'weave_start_thread',
    { title: 'Start a discussion', description: 'Start a discussion thread in a group.', inputSchema: { group: z.string(), title: z.string().min(1), text: z.string().optional() } },
    run(async ({ group, title, text }: { group: string; title: string; text?: string }) => backend.startThread({ group, title, text, as })),
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
      description: 'Recent chat messages in a group, oldest first, with replies and reactions. Omit channel for all channels.',
      inputSchema: { group: z.string(), channel: z.string().optional(), limit: z.number().int().min(1).max(200).optional() },
      annotations: { readOnlyHint: true },
    },
    run(async ({ group, channel, limit }: { group: string; channel?: string; limit?: number }) => backend.messages(group, { channel, limit: limit ?? 50 })),
  );

  server.registerTool(
    'weave_say',
    {
      title: 'Send a chat message',
      description: 'Send a short chat message to a group channel (default "general"), optionally as a reply to a message id.',
      inputSchema: { group: z.string(), text: z.string().min(1), channel: z.string().optional(), reply_to: z.string().min(6).optional() },
    },
    run(async ({ group, text, channel, reply_to }: { group: string; text: string; channel?: string; reply_to?: string }) =>
      backend.say({ group, text, channel, replyTo: reply_to, as }),
    ),
  );

  server.registerTool(
    'weave_channels',
    { title: 'Chat channels', description: 'The chat channels of a group.', inputSchema: { group: z.string() }, annotations: { readOnlyHint: true } },
    run(async ({ group }: { group: string }) => backend.channels(group)),
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
    { title: 'Issues', description: 'Issues in a group with status (open, in-progress, done, closed) and assignee.', inputSchema: { group: z.string() }, annotations: { readOnlyHint: true } },
    run(async ({ group }: { group: string }) => backend.issues(group)),
  );

  server.registerTool(
    'weave_open_issue',
    { title: 'Open an issue', description: 'Open an issue in a group.', inputSchema: { group: z.string(), title: z.string().min(1), text: z.string().optional(), labels: z.array(z.string()).optional() } },
    run(async ({ group, title, text, labels }: { group: string; title: string; text?: string; labels?: string[] }) => backend.openIssue({ group, title, text, labels, as })),
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
      description: 'Proposals in a group with their current tally, quorum and deadline. Agents usually only read these; voting needs the weave.vote permission.',
      inputSchema: { group: z.string() },
      annotations: { readOnlyHint: true },
    },
    run(async ({ group }: { group: string }) => backend.proposals(group)),
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
