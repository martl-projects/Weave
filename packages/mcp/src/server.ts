import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readFileSync, statSync } from 'node:fs';
import { extname } from 'node:path';
import { z } from 'zod';
import { checkManifest, MANIFEST_EXAMPLE, MANIFEST_RULES, noAgent, releaseWorkflow, type Backend, type FeedItem } from '@weave/node';

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

/** Set when this file is bundled into the desktop app (see apps/desktop/package.ts). */
declare const WEAVE_VERSION: string | undefined;
/** This package's version, kept in step with every Weave release. */
const VERSION =
  typeof WEAVE_VERSION === 'string' ? WEAVE_VERSION : (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;

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

const failure = (error: unknown) => {
  const message = (error as Error).message;
  // A refusal for lack of a permission: say how to ask for it, instead of leaving it there.
  const kind = /may not sign (\S+?)[;:,]?(?:\s|$)/.exec(message)?.[1];
  const hint = kind ? ` You can ask your person for it: weave_request_permission with kinds ["${kind}"] and a short reason; they allow it with one click in the Weave app's Inbox.` : '';
  return { content: [{ type: 'text' as const, text: `Error: ${message}${hint}` }], isError: true };
};

/** Wraps a tool body so errors come back as tool errors the agent can read. */
const run = <A>(fn: (args: A) => Promise<unknown>) => async (args: A) => {
  try {
    return json(await fn(args));
  } catch (error) {
    return failure(error);
  }
};

/**
 * What every harness is told about Weave when it connects: what it is, how
 * the agent acts, and the flows that need the person (things only they can
 * do, like approving a GitHub sign-in on github.com).
 */
export const INSTRUCTIONS = `Weave is a peer-to-peer place where people and their agents build things together: groups and tiers (chat), projects (boards of posts, issues, proposals, a page, an app) and communities. You act as one of the person's agents: everything you write is signed with your own key and shows as "person · agent". Start with weave_whoami.

Permissions: your person decides which kinds you may sign (weave_whoami lists yours). Before a task, work out every kind it needs and ask for the ones you lack in one weave_request_permission, saying what for (for example linking a repository and releasing its app: weave.github.repo and weave.app together). Your person allows it with one click in the Weave app. Then go on. Don't look for ways around it.

GitHub repositories that follow a space (repo access for members):
1. weave_github shows the sign-in. If not signed in, call weave_github_connect: it returns a code. Ask your person to open the link and enter the code on github.com (only they can), then check weave_github again.
2. The GitHub App (named in weave_github) must be installed on the repository: weave_github_repos lists the ones it can manage. If the repository is missing, only your person can add it, on github.com: call weave_open_in_app with what "link-repo", the space and the repository. Weave comes to the front with Link a repository open, the repository chosen and the link to add it on GitHub ("Only select repositories"); they can link it right there.
3. Or link it yourself with weave_link_repo (needs weave.github.repo): to a group, tier or project (owners and maintainers only; in a project optionally only the readers of one board). Members then give the space their GitHub account (weave_share_github, or in the app) and get read access; leaving takes it back.

A project's app, installed by hosts with one click (prefer this to asking hosts to install Node.js or build anything):
1. The repository holds weave.app.json (app, name, services, start). Writing or changing one, call weave_app_manifest first for the rules and an example, and again with your file to check it (every problem at once) before committing. For JavaScript or TypeScript apps, weave_release_workflow gives a GitHub Actions workflow that builds a standalone program per platform on every pushed version tag and publishes the GitHub release; add it, and add its start.release to weave.app.json.
2. Commit, push, tag (v0.1.0) and push the tag. Weave installs from a GitHub release with build files attached: a tag alone isn't a release, and GitHub's automatic source archives don't count. The workflow makes that release from the tag in a few minutes; without such a workflow, someone has to create the release and attach the builds on github.com.
3. weave_app_release with the tag: Weave reads weave.app.json from the repository at that tag and fingerprints each release file. Hosts then install it from the project's Live tab. (weave_app_publish publishes a weave.app.json from this computer instead, without release files.)
Installing and starting the app happen on each host's own computer and need them to confirm; you can't do that for them.
Settings like an API key: name them in weave.app.json under env ({name, label, secret, optional, hint}); never write a value into the manifest or the repository, and never ask for or handle one yourself: your person types it under Live (or weave app set), it stays on their computer, and Weave hands it to the app when it starts it.
Who is who in the app: players reach it from 127.0.0.1, so on its own it can't tell them apart (nor the host from a player who types /host). With @weave/sdk the app asks Weave: weave.who(req) gives the person behind a connection (did, name, host, member, maintainer), weave.access(did, {group}) whether they're in one of the project's groups or the host's tiers. Prefer it to name forms and secret host pages; weave_app_manifest has the details.

A project's page is what people see first: a hero card with an icon, a banner, the title and a subtitle, and below it the page itself (Markdown, with images). weave_project shows it; weave_set_project_page changes it (needs weave.project.page, and weave.project.public while the page is public). Images go up with weave_upload_image first, which gives a wblob: reference for icon, banner, or ![](…) in the body. There are no store-style capsules or screenshot fields: put screenshots in the body. See weave_set_project_page for sizes.

Releases: weave_app_releases lists the repository's releases and how many files each has. weave_app_release can wait for a release the workflow is still building. Your person can also pick a release themselves in the project's Live tab ("Use a GitHub release…").

Things only the person does: approving GitHub sign-ins and app installs on github.com, installing and starting apps on their computer, recovery words and keys. Tell them clearly what to do and why.`;

/**
 * The node as an agent sees it: company spaces it isn't approved in (stage 9)
 * stay out of everything it reads, and tools aimed at them are refused.
 */
export function agentView(backend: Backend, as: string): Backend {
  let blocked: { at: number; list: Array<{ id: string; name: string }> } | undefined;
  const blockedNow = async () => {
    if (!blocked || Date.now() - blocked.at > 5000) blocked = { at: Date.now(), list: await backend.agentBlocked(as).catch(() => []) };
    return blocked.list;
  };
  type Shape = { space?: { id?: string }; scope?: unknown; kind?: unknown; id?: unknown };
  const spaceOf = (x: unknown): string | undefined => {
    const v = x as Shape | null;
    if (!v || typeof v !== 'object') return undefined;
    if (typeof v.space?.id === 'string') return v.space.id;
    if (typeof v.scope === 'string' && v.scope.includes(':')) return v.scope.slice(v.scope.indexOf(':') + 1);
    if ((v.kind === 'project' || v.kind === 'group' || v.kind === 'community') && typeof v.id === 'string') return v.id;
    return undefined;
  };
  const hidden = (list: Array<{ id: string }>, x: unknown) => list.some((b) => b.id === spaceOf(x));
  const aimed = (list: Array<{ id: string; name: string }>, v: unknown) => typeof v === 'string' && list.some((b) => b.id === v || b.name === v);
  const refuse = () => {
    throw new Error(`agent "${as}" isn't approved in that company space: those who manage it can approve it`);
  };
  return new Proxy(backend, {
    get(target, prop) {
      const value = (target as unknown as Record<string | symbol, unknown>)[prop];
      if (typeof value !== 'function') return value;
      const fn = value as (...args: unknown[]) => unknown;
      if (prop === 'agentBlocked' || prop === 'whoami') return fn.bind(target);
      if (prop === 'watch')
        return (onItem: (item: FeedItem) => void, signal: AbortSignal) =>
          fn.call(target, (item: FeedItem) => void blockedNow().then((list) => !hidden(list, item) && onItem(item)), signal);
      return async (...args: unknown[]) => {
        const list = await blockedNow();
        for (const a of args) {
          if (aimed(list, a)) refuse();
          if (a && typeof a === 'object') for (const k of ['space', 'project', 'community', 'group']) if (aimed(list, (a as Record<string, unknown>)[k])) refuse();
        }
        const out = await fn.apply(target, args);
        if (Array.isArray(out)) return out.filter((x) => !hidden(list, x));
        if (hidden(list, out)) refuse();
        return out;
      };
    },
  });
}

/**
 * An MCP server that lets an agent harness take part in Weave: read projects and groups,
 * discussions, chat, issues and votes, write into them, and pick up what's new
 * through an inbox. It talks to a node through the Backend interface, so it
 * works against a running daemon or a node opened directly.
 */
export function createWeaveMcp(node: Backend, options: WeaveMcpOptions = {}) {
  const as = options.as;
  const backend = as ? agentView(node, as) : node;
  const server = new McpServer({ name: 'weave', version: VERSION }, { instructions: INSTRUCTIONS });

  // ---------------------------------------------------------------- inbox
  const inbox: InboxItem[] = [];
  const waiters = new Set<() => void>();
  const watching = new AbortController();
  let mySigner: string | undefined;

  // Who "we" are, to leave our own writes out of the inbox; asked again until the node answers.
  const findSigner = () =>
    backend.whoami().then(
      (me) => void (mySigner = as ? me.agents.find((a) => a.name === as)?.did : me.signer),
      () => void setTimeout(findSigner, 5000),
    );
  void findSigner();

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
      if (as && !agent) throw new Error(noAgent(as, me.agents.map((a) => a.name)));
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
    { title: 'Read a post', description: 'A post with its chat. Id, its first 8 characters, or a weave:post: link.', inputSchema: { post: z.string().min(6), limit: z.number().int().min(1).max(200).optional() }, annotations: { readOnlyHint: true } },
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
    'weave_edit_post',
    {
      title: 'Edit a post',
      description: 'Change the title, text or link of your own post (an empty link removes it). Leave out what stays the same. Everyone sees it marked as edited.',
      inputSchema: { post: z.string().min(6), title: z.string().min(1).max(200).optional(), text: z.string().optional(), link: z.union([z.string().url(), z.literal('')]).optional() },
    },
    run(async ({ post, title, text, link }: { post: string; title?: string; text?: string; link?: string }) => backend.editPost({ post, title, text, link, as })),
  );

  server.registerTool(
    'weave_delete_post',
    {
      title: 'Delete a post',
      description: 'Take down your own post, or one in a space you maintain or moderate. It disappears for everyone but stays in the logs.',
      inputSchema: { post: z.string().min(6) },
      annotations: { destructiveHint: true },
    },
    run(async ({ post }: { post: string }) => backend.deletePost({ post, as })),
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

  // ---------------------------------------------------------------- asking for permissions

  server.registerTool(
    'weave_request_permission',
    {
      title: 'Ask for a permission',
      description:
        "Ask your person to let you sign more kinds of events (like weave.github.repo to link repositories, weave.app to publish apps, weave.vote to vote). The request waits in their Weave Inbox, where they allow or decline it; check weave_whoami afterwards. Say what you want to do with it.",
      inputSchema: { kinds: z.array(z.string()).min(1).max(10), reason: z.string().max(300).describe('What for, in one sentence') },
    },
    run(async ({ kinds, reason }: { kinds: string[]; reason: string }) => {
      if (!as) throw new Error('you act as the person themself, who may sign everything already');
      const request = await backend.requestPermission({ as, kinds, reason });
      return request.state === 'allowed'
        ? { ...request, note: 'You have these already.' }
        : { ...request, note: "Waiting in your person's Weave Inbox. Tell them what you asked for and why; check weave_whoami once they answer." };
    }),
  );

  server.registerTool(
    'weave_open_in_app',
    {
      title: 'Open Weave for your person',
      description:
        "Bring the Weave app on your person's computer to the front, for a step only they can take: 'link-repo' opens a space's settings with Link a repository, the repository already chosen (and, if Weave can't manage it yet, the link to add it on GitHub); 'space' opens a space; 'inbox' opens the Inbox. Tell them what to do there.",
      inputSchema: { what: z.enum(['link-repo', 'space', 'inbox']), space: z.string().optional().describe('Group, tier or project name or id'), repo: z.string().optional().describe('For link-repo: owner/name') },
    },
    run(async ({ what, space, repo }: { what: 'link-repo' | 'space' | 'inbox'; space?: string; repo?: string }) => ({
      ...(await backend.openInApp({ what, space, repo })),
      note: 'Weave is coming to the front on their computer (if the app is open). Tell your person what to do there.',
    })),
  );

  // ---------------------------------------------------------------- project pages

  const IMAGE_TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };

  server.registerTool(
    'weave_upload_image',
    {
      title: 'Upload an image',
      description:
        "Store an image from this computer in Weave (encrypted; members fetch it from each other) and get its wblob: reference, for a project's icon or banner or for ![](wblob:…) in a page or post. PNG, JPEG, WebP or GIF, at most 2 MB: scale big images down first (icons 512×512, banners about 1800×600, page images up to 1600 wide).",
      inputSchema: { file: z.string().describe('Path to the image') },
    },
    run(async ({ file }: { file: string }) => {
      const type = IMAGE_TYPES[extname(file).toLowerCase()];
      if (!type) throw new Error('images are .png, .jpg, .webp or .gif');
      const size = statSync(file).size;
      if (size > 2 * 1024 * 1024) throw new Error(`${file} is ${(size / 1024 / 1024).toFixed(1)} MB; images are at most 2 MB: scale it down (icons 512×512, banners about 1800×600)`);
      const ref = await backend.putBlob({ data: readFileSync(file).toString('base64'), type });
      return { ref, use: `icon or banner: "${ref}"; in Markdown: ![description](${ref})` };
    }),
  );

  server.registerTool(
    'weave_set_project_page',
    {
      title: "Change a project's page",
      description: [
        "Maintainers: the project's page, what people see first. Leave out what stays; an empty icon or banner removes it.",
        'title: the heading (the project name when empty). subtitle: one or two lines on the hero card.',
        'body: the page itself, Markdown; images as ![description](wblob:…) from weave_upload_image, up to 1600 px wide; screenshots and art go here.',
        'icon: square, 512×512 is plenty; shown at 88 px on the hero card and small in lists and hubs.',
        'banner: wide, about 3:1 (like 1800×600); shown behind the title, darkened and cropped to fit, so keep the important part in the middle and no text in it.',
        'status: idea, active, paused, shipped or archived. public: true shows title, subtitle, icon and status on your person\'s hub to everyone; the body stays among members.',
        'Needs weave.project.page (and weave.project.public while the page is public).',
      ].join(' '),
      inputSchema: {
        project: z.string(),
        title: z.string().max(100).optional(),
        subtitle: z.string().max(300).optional(),
        body: z.string().optional(),
        icon: z.string().optional().describe('wblob: reference, or "" to remove'),
        banner: z.string().optional().describe('wblob: reference, or "" to remove'),
        status: z.enum(['idea', 'active', 'paused', 'shipped', 'archived']).optional(),
        public: z.boolean().optional(),
      },
    },
    run(async (input: { project: string; title?: string; subtitle?: string; body?: string; icon?: string; banner?: string; status?: 'idea' | 'active' | 'paused' | 'shipped' | 'archived'; public?: boolean }) =>
      (await backend.setProjectPage({ ...input, as })).page,
    ),
  );

  // ---------------------------------------------------------------- GitHub and project apps

  server.registerTool(
    'weave_github',
    {
      title: 'GitHub sign-in',
      description: "Whether this node is signed in to GitHub (and as whom), a sign-in waiting for its code, the GitHub App it signs in through with its owner, and where to install that app on repositories.",
      annotations: { readOnlyHint: true },
    },
    run(async () => backend.github()),
  );

  server.registerTool(
    'weave_github_connect',
    {
      title: 'Start a GitHub sign-in',
      description: 'Starts signing this node in to GitHub. Returns a code and a link: your person enters the code on github.com (only they can). Then check weave_github until it shows the login.',
    },
    run(async () => {
      const g = await backend.connectGithub();
      return { ...g, tellYourPerson: g.pending ? `Open ${g.pending.verificationUri} and enter the code ${g.pending.userCode} to let Weave use your GitHub account.` : undefined };
    }),
  );

  server.registerTool(
    'weave_github_repos',
    {
      title: 'Repositories Weave can manage',
      description: 'Repositories the GitHub App is installed on that the signed-in person administers: the ones that can be linked. A missing one needs the app installed on it (installUrl in weave_github).',
      annotations: { readOnlyHint: true },
    },
    run(async () => backend.githubRepos()),
  );

  server.registerTool(
    'weave_space_repos',
    {
      title: "A space's repositories",
      description: 'Repositories linked to a group, tier or project, who linked them, whether you gave it your GitHub account, and (for whoever linked them) members who have not yet.',
      inputSchema: { space: z.string().describe('Group, tier or project name or id') },
      annotations: { readOnlyHint: true },
    },
    run(async ({ space }: { space: string }) => backend.spaceRepos(space)),
  );

  server.registerTool(
    'weave_link_repo',
    {
      title: 'Link a repository',
      description:
        'Owners and maintainers: let a GitHub repository follow a group, tier or project (on: false unlinks it and takes back access Weave gave). Members who give the space their GitHub account get read access. Needs the weave.github.repo permission, a GitHub sign-in and the app installed on the repository.',
      inputSchema: { space: z.string(), repo: z.string().describe('owner/name or its github.com link'), board: z.string().optional().describe('In a project: only the readers of this board'), on: z.boolean().default(true) },
    },
    run(async ({ space, repo, board, on }: { space: string; repo: string; board?: string; on: boolean }) => backend.linkRepo({ space, repo, board, on, as })),
  );

  server.registerTool(
    'weave_share_github',
    {
      title: 'Give a space your GitHub account',
      description: "Give a space the GitHub account this node is signed in with, so its linked repositories invite it (on: false takes it back). Needs the weave.github.account permission.",
      inputSchema: { space: z.string(), on: z.boolean().default(true) },
    },
    run(async ({ space, on }: { space: string; on: boolean }) => backend.shareGithub({ space, on, as })),
  );

  server.registerTool(
    'weave_app_publish',
    {
      title: "Publish a project's app",
      description:
        "Maintainers: publish (or replace) a project's app manifest from its weave.app.json on this computer: the app's id and name, the ports a room may share, and start.command. Release files set by weave_app_release are kept. Needs the weave.app permission.",
      inputSchema: { project: z.string(), file: z.string().describe('Path to weave.app.json') },
    },
    run(async ({ project, file }: { project: string; file: string }) => backend.publishApp({ project, manifest: JSON.parse(readFileSync(file, 'utf8')), as })),
  );

  server.registerTool(
    'weave_app_manifest',
    {
      title: "A project app's manifest: rules, example, check",
      description:
        "weave.app.json describes a project's app: its id and name, the ports a room shares (services, with the pages host and joiners open), and how to start it (start.command for checkouts, start.release for release builds). Without arguments: the rules and an annotated example. With file (a path) or manifest (the JSON): every problem at once, warnings, and the manifest as Weave reads it. Writes nothing.",
      inputSchema: { file: z.string().optional().describe('Path to a weave.app.json'), manifest: z.unknown().optional().describe('The manifest itself') },
      annotations: { readOnlyHint: true },
    },
    run(async ({ file, manifest }: { file?: string; manifest?: unknown }) => {
      if (file === undefined && manifest === undefined) return { rules: MANIFEST_RULES, example: MANIFEST_EXAMPLE };
      let input = manifest;
      if (file !== undefined) {
        try {
          input = JSON.parse(readFileSync(file, 'utf8'));
        } catch (error) {
          return { ok: false, problems: [`${file} isn't readable JSON: ${(error as Error).message}`], warnings: [] };
        }
      }
      const checked = checkManifest(input);
      return { ok: checked.problems.length === 0, ...checked, ...(checked.problems.length ? { rules: MANIFEST_RULES } : {}) };
    }),
  );

  server.registerTool(
    'weave_release_workflow',
    {
      title: 'A release workflow for a project app',
      description:
        "A GitHub Actions workflow that, on every pushed version tag, builds a JavaScript or TypeScript app as a standalone program for Windows, macOS and Linux (no Node.js needed by hosts) and publishes the GitHub release. Returns the file to add, the start.release to put in weave.app.json, and notes to check (files must be read relative to process.cwd()). Writes nothing itself.",
      inputSchema: { app: z.string().describe('The app id from weave.app.json'), entry: z.string().describe('The file the app starts from, like server.js') },
      annotations: { readOnlyHint: true },
    },
    run(async ({ app, entry }: { app: string; entry: string }) => releaseWorkflow(app, entry)),
  );

  server.registerTool(
    'weave_app_releases',
    {
      title: "A project app's GitHub releases",
      description: "The releases of the project's repository, newest first, with how many files each has (a release workflow attaches them last). Use it to see whether a pushed tag has become a release yet.",
      inputSchema: { project: z.string() },
      annotations: { readOnlyHint: true },
    },
    run(async ({ project }: { project: string }) => backend.appReleases(project)),
  );

  server.registerTool(
    'weave_app_release',
    {
      title: "Point a project's app at a GitHub release",
      description:
        "Maintainers: after a release exists on GitHub, point the project's app at it by tag. Weave reads weave.app.json from the repository at that tag (so the release carries its own manifest) and downloads each file once to fingerprint it (SHA-256); hosts then install it from the project's Live tab. Files are matched to platforms by name (win, mac, linux; x64, arm64), or give assets like {\"win32-x64\": \"Gameshow-win.zip\"}. Needs the weave.app permission.",
      inputSchema: {
        project: z.string(),
        tag: z.string().describe('The release tag, like v1.4'),
        repo: z.string().optional().describe("owner/name; default: the project's linked repository"),
        assets: z.record(z.string(), z.string()).optional(),
        wait: z.number().min(0).max(20).optional().describe('Minutes to wait for the release and its files, while a workflow builds it'),
      },
    },
    run(async ({ project, tag, repo, assets, wait }: { project: string; tag: string; repo?: string; assets?: Record<string, string>; wait?: number }) => {
      // A pushed tag becomes a release with files a few minutes later, if a workflow makes it: look every 30 seconds.
      const until = Date.now() + (wait ?? 0) * 60_000;
      if (wait) {
        const now = await backend.appReleases(project).catch(() => undefined);
        if (now && !now.releases.some((r) => r.tag === tag) && now.releaseWorkflow === false)
          throw new Error(
            `${now.repo} has no workflow that turns a pushed tag into a release, so waiting won't help: a tag alone isn't a release. Add Weave's release workflow (weave_release_workflow) and push the tag again, or ask your person to create the release with build files on github.com.`,
          );
      }
      while (Date.now() < until) {
        const ready = await backend.appReleases(project).then(
          (r) => r.releases.some((x) => x.tag === tag && x.files > 0),
          () => false,
        );
        if (ready) break;
        await new Promise((resolve) => setTimeout(resolve, Math.min(30_000, Math.max(0, until - Date.now()))));
      }
      return backend.releaseApp({ project, tag, repo, assets, as });
    }),
  );

  return {
    server,
    /** Stop listening for new events. */
    close() {
      watching.abort();
    },
  };
}
