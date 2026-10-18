#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import {
  connectDaemon,
  loadConfig,
  parseBootstrap,
  resolveHome,
  saveConfig,
  startDaemon,
  WeaveNode,
  type Actor,
  type Admission,
  type Backend,
  type BoardInfo,
  type CommunityInfo,
  type FeedItem,
  type IssueInfo,
  type MemberInfo,
  type PostInfo,
  type ProjectInfo,
  type ProjectStatus,
  type ProposalInfo,
  type SpaceInfo,
  type ThreadInfo,
  type TierInfo,
} from '@weave/node';

const HELP = `weave — build things together, peer to peer, with your friends and their agents

usage: weave <command> [options]

  init <name>                create your identity; shows your 24 recovery words once
  restore                    set up this computer as another device of your identity, from your recovery words
  whoami                     show your identity and agents
  daemon                     run your node: connect to peers, serve the local API
  status                     node status: peers, groups, projects, communities
  post <text...>             publish a short text post (public unless -p/-g/-r)   [--as <agent>]
  feed                       show recent posts         [-p <project> | -g <group>] [-n <count>] [--all]
  watch                      stream new events (needs a running daemon)  [--as <agent> --mentions]
  mcp                        serve this node to an agent harness over MCP (stdio)  [--as <agent>]
  join <topic>               listen on a DHT topic
  agent add <name>           create a key for an agent [--can <kinds>]  default: weave.post,weave.reply
  agent list                 list your agents
  bootstrap <host:port...>   use these DHT bootstrap nodes (e.g. a local testnet); --clear for defaults

groups — collections of people, with their own chat:
  group create <name>        start a group
  group list                 groups you're in
  group invite <group>       print an invite link (any member)   [--hours <n>]  default: 168
  group join <link>          join with an invite link
  group members <group>      members and who invited them
  group remove <group> <who> remove someone and rotate the key (founder only)

projects — something being built; participants chat, discuss, vote and work on issues:
  project create <name>                  start a project            [--text <description>]
  project list                           projects you take part in
  project show <project>                 page, maintainers, invited groups and rules
  project page <project>                 change the page   [--text <description>] [--status idea|active|paused|shipped|archived] [--public | --private]
  project invite <project>               print an invite link (maintainers)
  project join <link>                    join with an invite link
  project members <project>              participants: who let them in, through which group
  project remove <project> <who>         remove someone and rotate the key (maintainers)
  project maintainer <project> <who>     make someone a maintainer; --off to undo
  project add-group <project> <group>    invite a whole group: its members take part right away
  project drop-group <project> <group>   stop inviting the group's newcomers
  project rule <project> <group>         admit the group's newcomers without asking; --off to ask again
  admissions [project]                   people the maintainers are asked about
  admit <project> <who> <group>          let a group newcomer in   [--always: also its future newcomers, in all your projects with that group]
  decline <project> <who> <group>        turn a group newcomer away

communities — boards of posts that people join, each post with its own chat:
  community create <name>                start a community          [--text <description>]
  community list                         communities you're in
  community show <community>             description and moderators
  community about <community> <text...>  change the description (moderators)
  community invite <community>           print an invite link (any member)
  community join <link>                  join with an invite link
  community members <community>          members and who invited them
  community remove <community> <who>     remove someone and rotate the key (moderators)
  community moderator <community> <who>  make someone a moderator; --off to undo

posts — in a community (-r) or a project's boards (-p); without either, your home:
  posts                      list posts                 [-b <board>] [--sort hot|new|top] [--saved] [-n <count>]
  read <id>                  a post and its chat
  submit <title...>          post something             [-b <board>] [--text <t>] [--link <url>]
                             (in a project's issues or proposals board this opens an issue or a proposal)
  up <id> / down <id> / unvote <id>   upvote, downvote, or take your vote back
  save <id> / unsave <id>    keep a post for later; --pin puts it at the top of your home (only you see this)
  share <id> --to <community|followers>   share a post into a community; public projects also to your followers  [--text <t>]
  boards                     a project's boards
  board add <name>           add a board (maintainers)  [--title <t>] [--type posts|issues|proposals] [--sort hot|new|top] [--position <n>]
  board set <name>           change title, sort or position (maintainers)
  board drop <name>          remove a board; its posts stay in the logs
  pin <id...>                pin posts to the top of a board, in this order (maintainers, moderators)  [-b <board>]; --clear unpins

memberships, Patreon-style (tiers buy access to a tier's chat and the projects it's invited into, never votes):
  tier create <name>         offer a tier                     [--price 5] [--currency EUR] [--text <description>] [--benefit "a,b"]
  tier list [who]            the tiers someone offers (default: yours)
  tier set <tier>            change it                        [--name] [--price] [--text] [--benefit]
  tier open|close|hide <tier>   take new members, stop taking them, or take it off your space
  support <tier>             ask to join a tier               [--text "how I paid"] (only the creator reads it)
  requests                   people asking to join your tiers
  grant <tier> <who>         let them in, or renew            [--months 1]
  decline <tier> <who>       turn a request down
  memberships                tiers you support

direct chats with friends (people you follow who follow you back):
  chats                      your chats, most recent first
  dm <who>                   read your chat with a friend     [-n <count>]
  dm <who> <text...>         send them a message              [--reply <id>]

chat, in a project (-p), group (-g) or community (-r), or in a post (--post <id>):
  chat                       recent messages            [-c <channel>] [-n <count>]
  say <text...>              send a message             [-c <channel>] [--reply <id>]
  channels                   chat channels; add one with: channels add <name> [--text <topic>]
  react <id> <emoji>         react to a message, post, thread or issue; --off to take it back

working together in a project (-p; ids: the first 8 characters are enough):
  thread start <title>       start a discussion         [--text <t>]
  thread list                discussions, most active first
  thread show <id>           a discussion with its replies
  reply <id> <text...>       reply to a thread, issue or proposal
  issue open <title>         open an issue              [--text <t>] [--label a,b]
  issue list                 issues with status and assignee
  issue claim <id>           take an issue on
  issue status <id> <status> open | in-progress | done | closed
  propose <title>            put something to a vote    [--text <t>] [--hours 72] [--quorum <n>]
  proposals                  proposals with their tally
  vote <id> yes|no|abstain   vote (latest vote before the deadline counts)
  delegate <who>             let their vote count for yours when you don't vote; --clear to undo
  (add --as <agent> to sign as one of your agents)

people (<who> is a name you have seen or a did:key):
  follow <who> / unfollow <who>       public unless --private
  block <who> / unblock <who>         private unless --public
  mute <who> / unmute <who>           private unless --public
  people                     following, followers, friends, blocked, muted

keys (recovery words are read from a prompt or stdin, never from the command line):
  keys                       your devices and agents, and whether any key was seen in two places
  revoke <key>               revoke a device (needs your words) or agent: its events after --since are void  [--since <time>]
  rotate                     rotate your root key with your words  [--encryption: also a new encryption key]
  find <text>                search everyone you know of by name or did:key
  contact                    print your contact link, to send via WhatsApp, email, anything (holds no keys)
  add <link>                 add someone by their contact link: connect, follow, keep in your address book

global options:
  --home <dir>   Weave home (default: $WEAVE_HOME or ~/.weave)
  --json         machine-readable output, one JSON value per line
`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    home: { type: 'string' },
    json: { type: 'boolean', default: false },
    as: { type: 'string' },
    kind: { type: 'string' },
    can: { type: 'string' },
    n: { type: 'string', short: 'n' },
    clear: { type: 'boolean', default: false },
    all: { type: 'boolean', default: false },
    mentions: { type: 'boolean', default: false },
    since: { type: 'string' },
    encryption: { type: 'boolean', default: false },
    channel: { type: 'string', short: 'c' },
    reply: { type: 'string' },
    off: { type: 'boolean', default: false },
    always: { type: 'boolean', default: false },
    project: { type: 'string', short: 'p' },
    group: { type: 'string', short: 'g' },
    community: { type: 'string', short: 'r' },
    board: { type: 'string', short: 'b' },
    post: { type: 'string' },
    sort: { type: 'string' },
    saved: { type: 'boolean', default: false },
    pin: { type: 'boolean', default: false },
    link: { type: 'string' },
    to: { type: 'string' },
    title: { type: 'string' },
    type: { type: 'string' },
    position: { type: 'string' },
    hours: { type: 'string' },
    text: { type: 'string' },
    price: { type: 'string' },
    currency: { type: 'string' },
    benefit: { type: 'string' },
    months: { type: 'string' },
    name: { type: 'string' },
    status: { type: 'string' },
    label: { type: 'string' },
    quorum: { type: 'string' },
    private: { type: 'boolean' },
    public: { type: 'boolean' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

const home = resolveHome(values.home);
const [command, ...args] = positionals;

/** The running daemon if there is one; otherwise the node opened directly (offline). */
async function backend(options: { needsDaemon?: boolean } = {}): Promise<Backend> {
  const daemon = await connectDaemon(home);
  if (daemon) return daemon as unknown as Backend;
  if (options.needsDaemon) throw new Error('no daemon running for this home — start one with "weave daemon"');
  return WeaveNode.open(home.dir);
}

function out(value: unknown, text: () => string): void {
  console.log(values.json ? JSON.stringify(value) : text());
}

/** Kinds people read; profile and delegation events are shown with --all or --kind. */
const CONTENT_KINDS = ['weave.post', 'weave.reply'];

const who = (item: FeedItem): string => {
  const author = item.authorName ?? item.author.slice(8, 20);
  return item.signerName ? `${author} · ${item.signerName}` : author;
};

const actor = (a: Actor): string => `${a.name ?? a.did.slice(8, 20)}${a.agent ? ` · ${a.agent}` : ''}`;

function needProject(): string {
  if (!values.project) throw new Error('which project? add -p <project>');
  return values.project;
}

/** Chat works in any space: -p project, -g group or -r community. */
function needSpace(): string {
  const space = values.project ?? values.group ?? values.community;
  if (!space) throw new Error('where? add -p <project>, -g <group> or -r <community>');
  return space;
}

const money = (cents: number, currency: string) => (cents === 0 ? 'free' : `${(cents / 100).toFixed(2)} ${currency}/month`);
const tierLine = (t: TierInfo) => {
  const state = t.mine ? `${t.members ?? 0} member${t.members === 1 ? '' : 's'}${t.open ? '' : ', closed'}` : t.membership ? (t.membership.active ? `member until ${new Date(t.membership.until).toLocaleDateString()}` : 'membership ended') : t.requested ? 'asked to join' : t.open ? 'open' : 'closed';
  return `${t.name.padEnd(20)} ${money(t.price, t.currency).padEnd(18)} ${state}${t.mine ? '' : `  — ${t.creator.name ?? t.creator.did}`}\n${t.description ? `  ${t.description}\n` : ''}${t.benefits.map((b) => `  · ${b}`).join('\n')}`;
};
/** "5" or "5.50" (in the currency's main unit) → cents. */
const cents = (value?: string) => (value === undefined ? undefined : Math.round(Number(value.replace(',', '.')) * 100));
const benefits = (value?: string) => value?.split(',').map((b) => b.trim()).filter(Boolean);

/** The recovery words, numbered in four columns, for writing down. */
const numbered = (words: string) => {
  const list = words.split(' ');
  const rows: string[] = [];
  for (let r = 0; r < 6; r++) rows.push([0, 6, 12, 18].map((c) => `${String(c + r + 1).padStart(2)}. ${list[c + r].padEnd(10)}`).join('  '));
  return rows.map((row) => `  ${row}`).join('\n');
};

/** Recovery words from $WEAVE_RECOVERY_WORDS, a prompt, or stdin; never from arguments, which end up in shell history. */
async function readWords(): Promise<string> {
  if (process.env.WEAVE_RECOVERY_WORDS) return process.env.WEAVE_RECOVERY_WORDS;
  if (process.stdin.isTTY) {
    const prompt = createInterface({ input: process.stdin, output: process.stderr });
    const words = await prompt.question('Your 24 recovery words: ');
    prompt.close();
    return words;
  }
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

const where = (p: PostInfo) => (p.space ? `${{ project: 'p', community: 'r', group: 'g', direct: '@' }[p.space.kind]}/${p.space.name}${p.board && p.space.kind === 'project' ? `/${p.board}` : ''}` : `u/${p.by.name ?? p.by.did.slice(8, 20)}`);
const postLine = (p: PostInfo) => {
  const vote = p.myVote > 0 ? '▲' : p.myVote < 0 ? '▼' : ' ';
  const marks = [p.pinned && 'pinned', p.saved === 'pinned' ? 'on your home' : p.saved, p.issue && `[${p.issue.status}]`, p.proposal && (p.proposal.closed ? (p.proposal.passed ? '[passed]' : '[rejected]') : '[voting]')].filter(Boolean).join(' ');
  return `${p.short}  ${vote}${String(p.score).padStart(3)}  ${p.title}${marks ? `  ${marks}` : ''}
                 ${where(p)} · ${actor(p.by)} · ${p.chat} in chat${p.link ? ` · ${p.link}` : ''}`;
};
const boardLine = (b: BoardInfo) => `${b.name.padEnd(16)} ${b.title.padEnd(16)} ${b.type.padEnd(10)} sorted ${b.sort}, ${b.count} post${b.count === 1 ? '' : 's'}${b.pinned.length ? `, ${b.pinned.length} pinned` : ''}`;
const communityText = (c: CommunityInfo) =>
  [`r/${c.name}`, c.description ? `  ${c.description}` : '', `  moderators: ${c.moderators.map(actor).join(', ')}`, `  ${c.members} member${c.members === 1 ? '' : 's'}`].filter(Boolean).join('\n');

const threadLine = (t: ThreadInfo) => `${t.short}  ${t.title}  — ${actor(t.by)}, ${t.replies.length} repl${t.replies.length === 1 ? 'y' : 'ies'}`;
const issueLine = (i: IssueInfo) =>
  `${i.short}  [${i.status}] ${i.title}${i.labels.length ? ` (${i.labels.join(', ')})` : ''}${i.assignee ? `  → ${actor(i.assignee)}` : ''}`;
const proposalLine = (p: ProposalInfo) => {
  const state = p.closed ? (p.passed ? 'passed' : 'rejected') : `open until ${new Date(p.deadline).toLocaleString()}`;
  const mine = p.myVote ? `, you: ${p.myVote.choice}${p.myVote.via ? ` via ${actor(p.myVote.via)}` : ''}` : '';
  return `${p.short}  ${p.title}\n          yes ${p.yes} · no ${p.no} · abstain ${p.abstain} · ${p.voted}/${p.eligible} voted, quorum ${p.quorum} · ${state}${mine}`;
};
const spaceLine = (s: SpaceInfo) => `${s.name.padEnd(24)} ${s.members} ${s.kind === 'project' ? 'participant' : 'member'}${s.members === 1 ? '' : 's'}, founded by ${s.founderName ?? s.founder}`;
const memberLine = (m: MemberInfo) => {
  const how = m.via ? `via ${m.via.name}, let in by ${m.invitedByName ?? m.invitedBy}` : m.invitedBy ? `invited by ${m.invitedByName ?? m.invitedBy}` : 'founder';
  return `${(m.name ?? m.did).padEnd(24)} ${how}${m.maintainer ? '  (maintainer)' : ''}`;
};
const admissionLine = (a: Admission) =>
  a.change === 'join'
    ? `${a.project.name}: ${a.name ?? a.did} joined ${a.group.name} — weave admit "${a.project.name}" ${a.did} "${a.group.name}"`
    : `${a.project.name}: ${a.name ?? a.did} left ${a.group.name} — weave project remove "${a.project.name}" ${a.did}`;
const projectText = (p: ProjectInfo) =>
  [
    `${p.name}  [${p.page.status}]${p.page.public ? '  public' : ''}`,
    p.page.description ? `  ${p.page.description}` : '',
    `  maintainers: ${p.maintainers.map(actor).join(', ')}`,
    `  groups: ${p.groups.map((g) => `${g.name}${g.auto ? ' (admitted automatically)' : ''}`).join(', ') || '-'}`,
    `  ${p.members} participant${p.members === 1 ? '' : 's'}`,
  ]
    .filter(Boolean)
    .join('\n');

function line(item: FeedItem): string {
  const time = new Date(item.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const body = typeof item.body === 'string' ? item.body : (item.body as { text?: unknown } | null)?.text ?? JSON.stringify(item.body);
  const kind = item.kind === 'weave.post' ? '' : `[${item.kind}] `;
  const place = item.space ? `${{ group: 'g', project: 'p', community: 'r', direct: '@' }[item.space.kind]}/${item.space.name} ` : item.private ? '(private) ' : '';
  return `${time}  ${who(item).padEnd(20)}  ${place}${kind}${body}`;
}

async function main(): Promise<void> {
  if (!command || values.help) return void console.log(HELP);

  switch (command) {
    case 'init': {
      const name = args.join(' ').trim();
      if (!name) throw new Error('usage: weave init <name>');
      const { node, words } = WeaveNode.create(name, home.dir);
      await node.close();
      return out({ did: node.identity.author, name, home: home.dir, words }, () =>
        [
          `created identity for ${name}`,
          `  ${node.identity.author}`,
          `  in ${home.dir}`,
          '',
          'Your recovery words. Write them down on paper now; they are shown only this once:',
          '',
          numbered(words),
          '',
          'They are your identity: with them you set up new devices, replace a stolen key and',
          'rotate your root key. Weave never stores them. Keep them away from this computer, from',
          'chats and from AI agents: whoever has them is you.',
        ].join('\n'),
      );
    }

    case 'restore': {
      const words = await readWords();
      console.error('looking for your identity on the network (keep another device or a friend online)…');
      const node = await WeaveNode.restore(words, home.dir, { online: true });
      const me = await node.whoami();
      await node.close();
      return out(me, () => `this computer is now a device of ${me.name ?? me.did}\n  ${me.did}\n  device key ${me.signer}`);
    }

    case 'keys': {
      const b = await backend();
      const [info, keys] = await Promise.all([b.identityInfo(), b.keys()]);
      return out({ ...info, keys }, () =>
        [
          `${info.did}`,
          `  ${info.recoverable ? `recovery kit: yes · root rotated ${info.rotations} time${info.rotations === 1 ? '' : 's'}` : 'recovery kit: no (made before recovery kits existed; create a new identity to get one)'}`,
          ...(info.forks.length ? [`  ⚠ seen signing in two places (possibly stolen): ${info.forks.join(', ')} — revoke with: weave revoke <key> --since <when you last trusted it>`] : []),
          '',
          ...keys.map((k) => `${k.role.padEnd(7)} ${(k.name ?? '').padEnd(20)} ${k.did}${k.current ? '  (this device)' : ''}${k.revokedAfter !== undefined ? `  revoked after #${k.revokedAfter}` : ''}${k.forked ? '  ⚠ forked' : ''}  ${k.events} event${k.events === 1 ? '' : 's'}`),
        ].join('\n'),
      );
    }

    case 'revoke': {
      const key = args[0];
      if (!key) throw new Error('usage: weave revoke <key or agent name> [--since <time>]');
      const b = await backend();
      const target = (await b.keys()).find((k) => k.did === key || k.name?.toLowerCase() === key.toLowerCase());
      const words = target?.role === 'agent' ? undefined : await readWords();
      const keys = await b.revokeKey({ key, since: values.since, words });
      const done = keys.find((k) => k.did === target?.did);
      return out(keys, () => `revoked ${target?.name ?? key}: its events after #${done?.revokedAfter} are void`);
    }

    case 'rotate': {
      const words = await readWords();
      const info = await (await backend()).rotateRoot({ words, encryption: values.encryption });
      return out(info, () => `rotated your root key (${info.rotations} rotation${info.rotations === 1 ? '' : 's'} so far)${values.encryption ? ' and your encryption key' : ''}; your words still cover the next ones`);
    }

    case 'whoami': {
      const me = await (await backend()).whoami();
      return out(me, () => [`${me.name ?? '(no name)'}  ${me.did}`, ...me.agents.map((a) => `  agent ${a.name}  ${a.did}  can: ${a.permissions.join(', ')}`)].join('\n'));
    }

    case 'daemon': {
      const daemon = await startDaemon(home.dir);
      const status = await daemon.node.status();
      console.log(`weave daemon for ${status.name ?? status.did}`);
      console.log(`  home ${home.dir}\n  api  http://127.0.0.1:${daemon.port}\n  ${status.groups} groups, ${status.projects} projects, ${status.communities} communities`);
      daemon.node.replica.onAppend((event) => {
        if (event.signer === daemon.node.identity.did) return;
        const item = daemon.node.itemFor(event);
        if (item && CONTENT_KINDS.includes(item.kind)) console.log(line(item));
      });
      const shutdown = async () => {
        await daemon.stop();
        process.exit(0);
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
      return new Promise(() => {}); // run until stopped
    }

    case 'status': {
      const s = await (await backend()).status();
      return out(s, () =>
        [
          `${s.name ?? '(no name)'}  ${s.did}`,
          `  ${s.online ? `online, ${s.peers} peer${s.peers === 1 ? '' : 's'}` : 'offline (no daemon running)'}`,
          `  ${s.groups} group${s.groups === 1 ? '' : 's'}, ${s.projects} project${s.projects === 1 ? '' : 's'}, ${s.communities} communit${s.communities === 1 ? 'y' : 'ies'}`,
          `  ${s.events} events in ${s.logs} logs${s.pending ? `, ${s.pending} pending` : ''}`,
        ].join('\n'),
      );
    }

    case 'post': {
      const text = args.join(' ').trim();
      if (!text) throw new Error('usage: weave post <text>');
      const item = await (await backend()).publish({ kind: values.kind ?? 'weave.post', body: { text }, as: values.as, space: values.project ?? values.group ?? values.community });
      return out(item, () => line(item));
    }

    case 'feed': {
      const items = await (await backend()).feed({
        limit: values.n ? Number(values.n) : 20,
        kinds: values.kind?.split(',') ?? (values.all ? undefined : CONTENT_KINDS),
        space: values.project ?? values.group ?? values.community,
      });
      if (values.json) return items.forEach((item) => console.log(JSON.stringify(item)));
      return console.log(items.map(line).join('\n') || '(nothing yet)');
    }

    case 'watch': {
      const client = await backend({ needsDaemon: true });
      const controller = new AbortController();
      process.on('SIGINT', () => controller.abort());
      // --mentions: only items that address the agent (or you) as @name.
      const name = values.as ?? (await client.whoami()).name;
      const mention = name && new RegExp(`@${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      return client.watch((item) => {
        if (values.mentions && !(mention && mention.test(JSON.stringify(item.body)))) return;
        console.log(values.json ? JSON.stringify(item) : line(item));
      }, controller.signal);
    }

    case 'mcp': {
      // stdout belongs to the MCP protocol from here on; messages for people go to stderr.
      // The daemon is the one process writing to the home, and the only way to see what peers send.
      const b = await backend({ needsDaemon: true });
      const { serveStdio } = await import('@weave/mcp');
      return serveStdio(b, { as: values.as });
    }

    case 'join': {
      const [topic] = args;
      if (!topic) throw new Error('usage: weave join <topic>');
      await (await backend()).join(topic);
      return out({ joined: topic }, () => `listening on ${topic}`);
    }

    case 'agent': {
      const [sub, name] = args;
      if (sub === 'add' && name) {
        const permissions = (values.can ?? 'weave.post,weave.reply').split(',').map((p) => p.trim()).filter(Boolean);
        const agent = await (await backend()).addAgent(name, permissions);
        return out(agent, () => `agent ${agent.name} created\n  ${agent.did}\n  can: ${agent.permissions.join(', ')}\n  use it with: weave post --as ${agent.name} "..."`);
      }
      if (sub === 'list') {
        const { agents } = await (await backend()).whoami();
        return out(agents, () => agents.map((a) => `${a.name}  ${a.did}  can: ${a.permissions.join(', ')}`).join('\n') || '(no agents)');
      }
      throw new Error('usage: weave agent add <name> [--can <kinds>] | weave agent list');
    }

    case 'group': {
      const [sub, ref, extra] = args;
      const b = await backend();
      if (sub === 'create' && ref) {
        const g = await b.createGroup(args.slice(1).join(' '));
        return out(g, () => `created group ${g.name}\n  invite people with: weave group invite "${g.name}"`);
      }
      if (sub === 'list') {
        const groups = await b.spaces('group');
        return out(groups, () => groups.map(spaceLine).join('\n') || '(no groups)');
      }
      if (sub === 'invite' && ref) {
        const invite = await b.invite(ref, values.hours ? Number(values.hours) : undefined);
        return out({ invite }, () => `${invite}\n\nShare this link privately: whoever has it can join the group.\nThey join with: weave group join <link>`);
      }
      if (sub === 'join' && ref) {
        const g = await b.joinSpace(ref);
        return out(g, () => `joined ${g.kind} ${g.name} (founded by ${g.founderName ?? g.founder})`);
      }
      if (sub === 'members' && ref) {
        const members = await b.members(ref);
        return out(members, () => members.map(memberLine).join('\n'));
      }
      if (sub === 'remove' && ref && extra) {
        await b.removeMember(ref, extra);
        return out({ removed: extra }, () => `removed ${extra} and rotated the key`);
      }
      throw new Error('usage: weave group create|list|invite|join|members|remove — see "weave --help"');
    }

    case 'project': {
      const [sub, ref, extra] = args;
      const b = await backend();
      switch (sub) {
        case 'create': {
          if (!ref) break;
          const p = await b.createProject({ name: args.slice(1).join(' '), description: values.text });
          return out(p, () => `created project ${p.name}\n  invite people:  weave project invite "${p.name}"\n  invite a group: weave project add-group "${p.name}" <group>`);
        }
        case 'list': {
          const projects = await b.spaces('project');
          return out(projects, () => projects.map(spaceLine).join('\n') || '(no projects)');
        }
        case 'show': {
          if (!ref) break;
          const p = await b.project(ref);
          return out(p, () => projectText(p));
        }
        case 'page': {
          if (!ref) break;
          const isPublic = values.public ? true : values.private ? false : undefined;
          const p = await b.setProjectPage({ project: ref, description: values.text, status: values.status as ProjectStatus | undefined, public: isPublic });
          return out(p, () => projectText(p));
        }
        case 'invite': {
          if (!ref) break;
          const invite = await b.invite(ref, values.hours ? Number(values.hours) : undefined);
          return out({ invite }, () => `${invite}\n\nShare this link privately: whoever has it can join the project.\nThey join with: weave project join <link>`);
        }
        case 'join': {
          if (!ref) break;
          const p = await b.joinSpace(ref);
          return out(p, () => `joined ${p.kind} ${p.name} (founded by ${p.founderName ?? p.founder})`);
        }
        case 'members': {
          if (!ref) break;
          const members = await b.members(ref);
          return out(members, () => members.map(memberLine).join('\n'));
        }
        case 'remove':
          if (!ref || !extra) break;
          await b.removeMember(ref, extra);
          return out({ removed: extra }, () => `removed ${extra} and rotated the project key`);
        case 'maintainer':
          if (!ref || !extra) break;
          await b.setMaintainer({ project: ref, who: extra, on: !values.off });
          return out({ maintainer: extra, on: !values.off }, () => `${extra} is ${values.off ? 'no longer' : 'now'} a maintainer`);
        case 'add-group':
          if (!ref || !extra) break;
          await b.inviteGroup({ project: ref, group: extra });
          return out({ invited: extra }, () => `invited group ${extra}: its members take part now; newcomers will be asked about`);
        case 'drop-group':
          if (!ref || !extra) break;
          await b.uninviteGroup({ project: ref, group: extra });
          return out({ dropped: extra }, () => `${extra}'s newcomers are no longer invited (people already in stay)`);
        case 'rule':
          if (!ref || !extra) break;
          await b.setRule({ project: ref, group: extra, auto: !values.off });
          return out({ group: extra, auto: !values.off }, () => (values.off ? `newcomers of ${extra} will be asked about again` : `newcomers of ${extra} are admitted automatically`));
      }
      throw new Error('usage: weave project create|list|show|page|invite|join|members|remove|maintainer|add-group|drop-group|rule — see "weave --help"');
    }

    case 'community': {
      const [sub, ref, extra] = args;
      const b = await backend();
      switch (sub) {
        case 'create': {
          if (!ref) break;
          const c = await b.createCommunity({ name: args.slice(1).join(' '), description: values.text });
          return out(c, () => `created community r/${c.name}\n  invite people: weave community invite "${c.name}"\n  post:          weave submit "Hello" -r "${c.name}"`);
        }
        case 'list': {
          const list = await b.spaces('community');
          return out(list, () => list.map(spaceLine).join('\n') || '(no communities)');
        }
        case 'show': {
          if (!ref) break;
          const c = await b.community(ref);
          return out(c, () => communityText(c));
        }
        case 'about': {
          if (!ref || !extra) break;
          const c = await b.setCommunity({ community: ref, description: args.slice(2).join(' ') });
          return out(c, () => communityText(c));
        }
        case 'invite': {
          if (!ref) break;
          const invite = await b.invite(ref, values.hours ? Number(values.hours) : undefined);
          return out({ invite }, () => `${invite}\n\nShare this link privately: whoever has it can join the community.\nThey join with: weave community join <link>`);
        }
        case 'join': {
          if (!ref) break;
          const c = await b.joinSpace(ref);
          return out(c, () => `joined ${c.kind} ${c.name} (founded by ${c.founderName ?? c.founder})`);
        }
        case 'members': {
          if (!ref) break;
          const members = await b.members(ref);
          return out(members, () => members.map(memberLine).join('\n'));
        }
        case 'remove':
          if (!ref || !extra) break;
          await b.removeMember(ref, extra);
          return out({ removed: extra }, () => `removed ${extra} and rotated the key`);
        case 'moderator':
          if (!ref || !extra) break;
          await b.setModerator({ community: ref, who: extra, on: !values.off });
          return out({ moderator: extra, on: !values.off }, () => `${extra} is ${values.off ? 'no longer' : 'now'} a moderator`);
      }
      throw new Error('usage: weave community create|list|show|about|invite|join|members|remove|moderator — see "weave --help"');
    }

    case 'posts': {
      const posts = await (await backend()).posts({
        space: values.project ?? values.community,
        board: values.board,
        sort: values.sort as BoardInfo['sort'] | undefined,
        saved: values.saved,
        limit: values.n ? Number(values.n) : 25,
      });
      return out(posts, () => posts.map(postLine).join('\n') || '(no posts yet)');
    }

    case 'read': {
      if (!args[0]) throw new Error('usage: weave read <id>');
      const b = await backend();
      const p = await b.post(args[0]);
      const chat = p.space && p.type !== 'project' ? await b.messages(undefined, { post: p.id, limit: values.n ? Number(values.n) : 30 }) : [];
      return out({ ...p, messages: chat }, () =>
        [
          postLine(p),
          p.text ? `\n${p.text}\n` : '',
          p.project && !p.project.member ? `  (a project you're not in: ${p.project.name} [${p.project.status}] — ask in the chat to be invited)` : '',
          p.type === 'project' ? `  chat in its channels: weave chat -p "${p.title}"` : '',
          ...chat.map((m) => `  ${m.short}  ${actor(m.by).padEnd(20)}  ${m.text}`),
          p.space && p.type !== 'project' ? `\n  talk: weave say --post ${p.short} "..."` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      );
    }

    case 'submit': {
      const title = args.join(' ').trim();
      if (!title) throw new Error('usage: weave submit <title...> -r <community> | -p <project> [-b <board>]');
      const space = values.community ?? values.project;
      if (!space) throw new Error('where? add -r <community> or -p <project> (with -b <board>)');
      const p = await (await backend()).submit({ space, board: values.board, title, text: values.text, link: values.link, as: values.as });
      return out(p, () => postLine(p));
    }

    case 'up':
    case 'down':
    case 'unvote': {
      if (!args[0]) throw new Error(`usage: weave ${command} <id>`);
      const p = await (await backend()).upvote({ target: args[0], value: { up: 1, down: -1, unvote: 0 }[command], as: values.as });
      return out(p, () => postLine(p));
    }

    case 'save':
    case 'unsave': {
      if (!args[0]) throw new Error(`usage: weave ${command} <id>`);
      const mode = command === 'unsave' ? null : values.pin ? 'pinned' : 'saved';
      await (await backend()).save({ target: args[0], mode });
      return out({ target: args[0], mode }, () => (mode === 'pinned' ? 'pinned to the top of your home' : mode ? 'saved' : 'forgotten'));
    }

    case 'share': {
      if (!args[0] || !values.to) throw new Error('usage: weave share <id> --to <community|followers> [--text <t>]');
      const p = await (await backend()).share({ post: args[0], to: values.to, text: values.text });
      return out(p, () => postLine(p));
    }

    case 'boards': {
      const boards = await (await backend()).boards(values.community ?? needProject());
      return out(boards, () => boards.map(boardLine).join('\n'));
    }

    case 'board': {
      const [sub, name] = args;
      if (!['add', 'set', 'drop'].includes(sub) || !name) throw new Error('usage: weave board add|set|drop <name> -p <project>');
      const boards = await (await backend()).setBoard({
        project: needProject(),
        name,
        title: values.title,
        type: values.type as BoardInfo['type'] | undefined,
        sort: values.sort as BoardInfo['sort'] | undefined,
        position: values.position !== undefined ? Number(values.position) : undefined,
        on: sub !== 'drop',
      });
      return out(boards, () => boards.map(boardLine).join('\n'));
    }

    case 'pin': {
      if (!args.length && !values.clear) throw new Error('usage: weave pin <id...> -r <community> | -p <project> -b <board>  (--clear unpins all)');
      const boards = await (await backend()).curate({ space: values.community ?? needProject(), board: values.board, pinned: values.clear ? [] : args });
      return out(boards, () => boards.map(boardLine).join('\n'));
    }

    case 'admissions': {
      const list = await (await backend()).admissions(args[0]);
      return out(list, () => list.map(admissionLine).join('\n') || '(nobody waiting)');
    }

    case 'admit':
    case 'decline': {
      const [project, person, group] = args;
      if (!project || !person || !group) throw new Error(`usage: weave ${command} <project> <who> <group>`);
      const b = await backend();
      if (command === 'admit') await b.admit({ project, who: person, group, always: values.always });
      else await b.decline({ project, who: person, group });
      return out({ [command]: person }, () => (command === 'admit' ? `let ${person} into ${project}${values.always ? ` (and everyone joining ${group} from now on)` : ''}` : `turned ${person} away from ${project}`));
    }

    case 'thread': {
      const [sub, ...rest] = args;
      const b = await backend();
      if (sub === 'start' && rest.length) {
        const t = await b.startThread({ project: needProject(), title: rest.join(' '), text: values.text, as: values.as });
        return out(t, () => threadLine(t));
      }
      if (sub === 'list') {
        const threads = await b.threads(needProject());
        return out(threads, () => threads.map(threadLine).join('\n') || '(no discussions yet)');
      }
      if (sub === 'show' && rest[0]) {
        for (const p of await b.spaces('project')) {
          const t = (await b.threads(p.id)).find((x) => x.id.startsWith(rest[0]));
          if (!t) continue;
          return out(t, () => [`${t.title}  (#${p.name})`, `${actor(t.by)}: ${t.text}`, ...t.replies.map((r) => `  ${actor(r.by)}: ${r.text}`)].join('\n'));
        }
        throw new Error(`no discussion with id ${rest[0]}`);
      }
      throw new Error('usage: weave thread start <title> -p <project> | thread list -p <project> | thread show <id>');
    }

    case 'reply': {
      const [target, ...words] = args;
      if (!target || !words.length) throw new Error('usage: weave reply <id> <text...>');
      const r = await (await backend()).reply({ target, text: words.join(' '), as: values.as });
      return out(r, () => `replied as ${actor(r.by)}`);
    }

    case 'tier': {
      const [sub, ref] = args;
      const b = await backend();
      if (sub === 'create' && ref) {
        const t = await b.createTier({ name: args.slice(1).join(' '), price: cents(values.price), currency: values.currency, description: values.text, benefits: benefits(values.benefit) });
        return out(t, () => `offered ${t.name}\n${tierLine(t)}\n\ninvite it into a project:  weave project add-group <project> "${t.name}"`);
      }
      if (sub === 'list') {
        const tiers = await b.tiers(ref);
        return out(tiers, () => tiers.map(tierLine).join('\n\n') || '(no tiers)');
      }
      if (sub === 'set' && ref) {
        const t = await b.setTier({ tier: ref, name: values.name, price: cents(values.price), currency: values.currency, description: values.text, benefits: benefits(values.benefit) });
        return out(t, () => tierLine(t));
      }
      if ((sub === 'open' || sub === 'close' || sub === 'hide') && ref) {
        const t = await b.setTier({ tier: ref, open: sub === 'open', hidden: sub === 'hide' || undefined });
        return out(t, () => (sub === 'hide' ? `${t.name} is off your space; members keep it until their grants run out` : tierLine(t)));
      }
      throw new Error('usage: weave tier create|list|set|open|close|hide — see "weave --help"');
    }

    case 'support': {
      const tier = args.join(' ').trim();
      if (!tier) throw new Error('usage: weave support <tier id> [--text "how I paid"]');
      await (await backend()).requestMembership({ tier, note: values.text });
      return out({ requested: tier }, () => 'asked to join; the creator decides');
    }

    case 'requests': {
      const list = await (await backend()).membershipRequests();
      return out(list, () => list.map((r) => `${r.tier.name}: ${r.name ?? r.did}${r.note ? ` — "${r.note}"` : ''}\n  weave grant "${r.tier.name}" ${r.did} --months 1`).join('\n') || '(nobody waiting)');
    }

    case 'grant':
    case 'decline': {
      const [tier, person] = args;
      if (!tier || !person) throw new Error(`usage: weave ${command} <tier> <who>${command === 'grant' ? ' [--months 1]' : ''}`);
      const b = await backend();
      if (command === 'grant') {
        const t = await b.grantMembership({ tier, who: person, months: values.months ? Number(values.months) : 1 });
        return out(t, () => `${person} is in ${t.name} (${t.members} member${t.members === 1 ? '' : 's'})`);
      }
      await b.declineMembership({ tier, who: person });
      return out({ declined: person }, () => `turned down ${person}`);
    }

    case 'memberships': {
      const tiers = await (await backend()).memberships();
      return out(tiers, () => tiers.map(tierLine).join('\n\n') || '(you support nobody yet)');
    }

    case 'chats': {
      const chats = await (await backend()).chats();
      return out(chats, () =>
        chats
          .map((c) => `${(c.peer.name ?? c.peer.did).padEnd(20)} ${c.last ? `${c.last.mine ? 'you: ' : ''}${c.last.text.slice(0, 60)}` : '(no messages yet)'}${c.friend ? '' : '  (no longer friends)'}`)
          .join('\n') || '(no friends yet: follow people who follow you back)',
      );
    }

    case 'dm': {
      const [person, ...words] = args;
      if (!person) throw new Error('usage: weave dm <who> [text...]');
      const b = await backend();
      const chat = await b.openChat(person);
      if (words.length) {
        const m = await b.say({ space: chat.id, text: words.join(' '), replyTo: values.reply, as: values.as });
        return out(m, () => `to ${chat.name}: ${m.text}`);
      }
      const messages = await b.messages(chat.id, { limit: values.n ? Number(values.n) : 30 });
      return out(messages, () => messages.map((m) => `${new Date(m.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}  ${m.short}  ${actor(m.by).padEnd(16)}  ${m.text}`).join('\n') || `(no messages with ${chat.name} yet)`);
    }

    case 'chat': {
      const messages = await (await backend()).messages(values.post ? undefined : needSpace(), { channel: values.channel, post: values.post, limit: values.n ? Number(values.n) : 30 });
      return out(messages, () =>
        messages
          .map((m) => {
            const time = new Date(m.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const reply = m.replyTo ? `  ↪ ${actor(m.replyTo.by)}: ${m.replyTo.text.slice(0, 40)}\n` : '';
            const reactions = m.reactions.length ? `  ${m.reactions.map((r) => `${r.emoji}${r.count}`).join(' ')}` : '';
            return `${reply}${time}  ${m.short}  ${actor(m.by).padEnd(20)}  ${values.channel || values.post ? '' : `#${m.channel} `}${m.text}${reactions}`;
          })
          .join('\n') || '(quiet so far)',
      );
    }

    case 'say': {
      const text = args.join(' ').trim();
      if (!text) throw new Error('usage: weave say <text...> -p <project> | -g <group> | -r <community> | --post <id>');
      const m = await (await backend()).say({ space: values.post ? undefined : needSpace(), post: values.post, text, channel: values.channel, replyTo: values.reply, as: values.as });
      return out(m, () => `${actor(m.by)}: ${m.text}`);
    }

    case 'channels': {
      const b = await backend();
      if (args[0] === 'add' && args[1]) {
        const c = await b.createChannel({ space: needSpace(), name: args.slice(1).join(' '), topic: values.text, as: values.as });
        return out(c, () => `created #${c.name}`);
      }
      const channels = await b.channels(needSpace());
      return out(channels, () => channels.map((c) => `#${c.name}${c.topic ? `  — ${c.topic}` : ''}`).join('\n'));
    }

    case 'react': {
      const [target, emoji] = args;
      if (!target || !emoji) throw new Error('usage: weave react <id> <emoji> [--off]');
      await (await backend()).react({ target, emoji, on: !values.off, as: values.as });
      return out({ target, emoji, on: !values.off }, () => (values.off ? `took back ${emoji}` : `reacted ${emoji}`));
    }

    case 'issue': {
      const [sub, ...rest] = args;
      const b = await backend();
      if (sub === 'open' && rest.length) {
        const labels = values.label?.split(',').map((l) => l.trim()).filter(Boolean);
        const i = await b.openIssue({ project: needProject(), title: rest.join(' '), text: values.text, labels, as: values.as });
        return out(i, () => issueLine(i));
      }
      if (sub === 'list') {
        const issues = await b.issues(needProject());
        return out(issues, () => issues.map(issueLine).join('\n') || '(no issues)');
      }
      if (sub === 'claim' && rest[0]) {
        const i = await b.claimIssue({ issue: rest[0], as: values.as });
        return out(i, () => issueLine(i));
      }
      if (sub === 'status' && rest[0] && rest[1]) {
        const i = await b.setIssueStatus({ issue: rest[0], status: rest[1] as IssueInfo['status'], as: values.as });
        return out(i, () => issueLine(i));
      }
      throw new Error('usage: weave issue open|list|claim|status — see "weave --help"');
    }

    case 'propose': {
      const title = args.join(' ').trim();
      if (!title) throw new Error('usage: weave propose <title> -p <project>');
      const p = await (await backend()).propose({
        project: needProject(),
        title,
        text: values.text,
        hours: values.hours ? Number(values.hours) : undefined,
        quorum: values.quorum ? Number(values.quorum) : undefined,
        as: values.as,
      });
      return out(p, () => proposalLine(p));
    }

    case 'proposals': {
      const proposals = await (await backend()).proposals(needProject());
      return out(proposals, () => proposals.map(proposalLine).join('\n') || '(no proposals)');
    }

    case 'vote': {
      const [proposal, choice] = args;
      if (!proposal || !choice) throw new Error('usage: weave vote <id> yes|no|abstain');
      const p = await (await backend()).vote({ proposal, choice: choice as 'yes', as: values.as });
      return out(p, () => proposalLine(p));
    }

    case 'delegate': {
      const person = args.join(' ').trim();
      if (!person && !values.clear) throw new Error('usage: weave delegate <who> -p <project> | --clear');
      await (await backend()).delegateVote({ project: needProject(), who: values.clear ? undefined : person });
      return out({ delegate: values.clear ? null : person }, () => (values.clear ? 'you vote only for yourself now' : `${person}'s votes count for you when you don't vote`));
    }

    case 'follow':
    case 'unfollow':
    case 'block':
    case 'unblock':
    case 'mute':
    case 'unmute': {
      const target = args.join(' ').trim();
      if (!target) throw new Error(`usage: weave ${command} <who>`);
      const on = !command.startsWith('un');
      const edge = command.replace(/^un/, '') as 'follow' | 'block' | 'mute';
      const isPrivate = values.private ? true : values.public ? false : undefined;
      await (await backend()).setEdge({ edge, who: target, on, private: isPrivate });
      const done = { follow: 'following', block: 'blocked', mute: 'muted' }[edge];
      return out({ edge, who: target, on }, () => `${on ? '' : 'no longer '}${done} ${target}`);
    }

    case 'find': {
      const people = await (await backend()).directory(args.join(' '));
      return out(people, () => people.map((p) => `${(p.name ?? '(no name)').padEnd(20)} ${p.did}${p.following && p.followsMe ? '  friend' : p.following ? '  following' : ''}`).join('\n') || '(nobody found — add people with "weave add <contact link>")');
    }

    case 'contact': {
      const link = await (await backend()).contactLink();
      return out({ link }, () => `${link}\n\nSend this to anyone, however you like. They add you with: weave add <link>\nIt is your address, not a key: it lets people find your node and read your public space.`);
    }

    case 'add': {
      const text = args.join(' ').trim();
      if (!text) throw new Error('usage: weave add <contact link>');
      const p = await (await backend()).addContact(text);
      return out(p, () => `added ${p.name ?? p.did} and followed them; their space syncs once your nodes connect (needs a running daemon)`);
    }

    case 'people': {
      const social = await (await backend()).social();
      const list = (people: { did: string; name?: string }[]) => people.map((p) => p.name ?? p.did).join(', ') || '-';
      return out(social, () =>
        [
          `friends    ${list(social.friends)}`,
          `following  ${list(social.following)}`,
          `followers  ${list(social.followers)}`,
          `blocked    ${list(social.blocked)}`,
          `muted      ${list(social.muted)}`,
        ].join('\n'),
      );
    }

    case 'bootstrap': {
      const config = loadConfig(home);
      config.bootstrap = values.clear ? [] : args.map(parseBootstrap);
      if (!values.clear && !config.bootstrap.length) throw new Error('usage: weave bootstrap <host:port...> | --clear');
      saveConfig(home, config);
      return out(config, () => `bootstrap: ${config.bootstrap.map((b) => `${b.host}:${b.port}`).join(', ') || 'public defaults'} (restart the daemon to apply)`);
    }

    default:
      throw new Error(`unknown command "${command}" — see "weave --help"`);
  }
}

main().catch((error: Error) => {
  console.error(`weave: ${error.message}`);
  process.exitCode = 1;
});
