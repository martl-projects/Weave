#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { parseArgs } from 'node:util';
import {
  connectDaemon,
  followDaemon,
  checkManifest,
  MANIFEST_EXAMPLE,
  MANIFEST_RULES,
  releaseWorkflow,
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
  type Bundle,
  type CommunityInfo,
  type FeedItem,
  type GitHubInfo,
  type SpaceRepos,
  type IssueInfo,
  type MemberInfo,
  type PostInfo,
  type PostsQuery,
  type ProjectInfo,
  type ProjectStatus,
  type ProposalInfo,
  type AppLaunchInfo,
  type KnockInfo,
  type SpaceInfo,
  type ThreadInfo,
  type TierInfo,
  type RoomInfo,
  SqliteStore,
} from '@weave/node';

/** Set when this file is bundled into the desktop app (see apps/desktop/package.ts). */
declare const WEAVE_VERSION: string | undefined;
/** This package's version, kept in step with every Weave release. */
const VERSION =
  typeof WEAVE_VERSION === 'string' ? WEAVE_VERSION : (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;

const HELP = `weave ${VERSION} — build things together, peer to peer, with your friends and their agents

usage: weave <command> [options]

  init <name>                create your identity; shows your 24 recovery words once, and applies
                             weave.bundle.json (contacts and free tiers the app ships with) unless --bare
  restore                    set up this computer as another device of your identity, from your recovery words
  whoami                     show your identity and agents
  daemon                     run your node: connect to peers, serve the local API
  status                     node status: peers, groups, projects, communities
  update                     is there a newer Weave? (release posts in the Weave project, and GitHub)
  export <dir>               write every log out as JSON lines (a backup, or for going back to an older Weave)
  post <text...>             publish a short text post (public unless -p/-g/-r)   [--as <agent>]
  feed                       show recent posts         [-p <project> | -g <group>] [-n <count>] [--all]
  watch                      stream new events (needs a running daemon)  [--as <agent> --mentions]
  mcp                        serve this node to an agent harness over MCP (stdio)  [--as <agent>]
  join <topic>               listen on a DHT topic
  agent add <name>           create a key for an agent [--can <kinds>]  default: weave.post,weave.reply
  agent can <name> <kinds>   change what an agent may sign, e.g. weave.post,weave.post.coauthor
  agent list                 list your agents
  bootstrap <host:port...>   use these DHT bootstrap nodes (e.g. a local testnet); --clear for defaults

groups — collections of people, with their own chat:
  group create <name>        start a group
  group list                 groups you're in
  group invite <group>       print an invite link (any member)   [--hours <n>]  default: 168
                             [--accept: the link only lets people ask; you let each one in]
  group join <link>          join with an invite link
  group members <group>      members and who invited them
  group remove <group> <who> remove someone and rotate the key (founder only)

projects — something being built; participants chat, discuss, vote and work on issues:
  project create <name>                  start a project            [--text <description>]
  project list                           projects you take part in
  project show <project>                 page, maintainers, invited groups and rules
  project page <project>                 change the page   [--title <t>] [--subtitle <t>] [--text <markdown> | --file <page.md>]
                                                           [--icon <image>] [--banner <image>] ("" removes one)
                                                           [--status idea|active|paused|shipped|archived] [--public | --private]
  app folder [path] -p <project>         where this computer's copy of the app is (default: here)
  app start|stop|status -p <project>     run the manifest's start command (asks you once), stop it, see its output
  image <file>                           upload an image; prints its wblob: reference for Markdown: ![alt](wblob:…)
  project invite <project>               print an invite link (maintainers)  [--hours <n>] [--accept]
                                         [--read-board <b,…>] [--write-board <b,…>]: board rights the link gives
  project join <link>                    join with an invite link (or ask to, with an --accept link)  [--text <note>]
  project members <project>              participants: who let them in, through which group
  project remove <project> <who>         remove someone and rotate the key (maintainers)
  project maintainer <project> <who>     make someone a maintainer; --off to undo
  project add-group <project> <group>    invite a whole group: its members take part right away
  project drop-group <project> <group>   stop inviting the group's newcomers
  project rule <project> <group>         admit the group's newcomers without asking; --off to ask again
  leave <space>                          leave a group, project or community (its key rotates without you)
  hand-over <space> <who>                make someone else the owner (needed before the owner leaves)
  close <space> / reopen <space>         close a space (kept, read-only) or open it again (owner, maintainers)
  history <space> [all|30d|joining]      what newcomers read: everything, the last 30 days, or from their invite on
  rule <space> <board> <days|off> [MB]   how long posts stay after their last activity (maintainers, moderators)
  keep <post> / fading                   start a post's time again / your posts others will forget soon
  shred <space> <date>                   carry forward what the rules keep, then everyone deletes the keys that ended before date
  older <space> [before]                 ask the members of a big space for the month before (what they hold)
  admissions [project]                   people the maintainers are asked about
  knocks                                 people asking to join with your --accept links
  let-in <id> / turn-away <id>           answer someone who asked
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

github — repositories that follow a group, tier or project (members who give their account get read access):
  github                     your GitHub sign-in on this device
  github connect             sign in to GitHub with a code (through the Weave GitHub app)
  github disconnect          forget the sign-in on this device
  github app <link>|default  sign in through your own GitHub App (https://github.com/apps/…) instead of Weave Connect
  github repos               repositories you can link (the app is installed on them and you're admin)
  github hub [off]           show your GitHub account on your hub (proven by a public gist); hub off to stop
  github share <space>       give a space your GitHub account, so its repos invite you; unshare to take it back
  repo list <space>          a space's repositories
  repo link <space> <owner/name>     owner or maintainers: let the repo follow the space   [-b <board>: only its readers]
  repo unlink <space> <owner/name>   stop it (access Weave gave is taken back)

posts — in a community (-r) or a project's boards (-p); without either, your home:
  posts                      list posts                 [-b <board>] [--sort hot|new|top] [--saved] [-n <count>]
                             on your home: [--from all|communities|projects|mine|friends|following]
  home hide <space> / home show <space>   leave a community or project off your home (only you know)
  read <id|link>             a post and its chat (and its weave:post: link to send)
  submit <title...>          post something             [-b <board>] [--text <t>] [--link <url>] [--image <file>]
                             [--with <who,…>]: co-authors (people, your agents, or person·agent); each confirms first
  coauthor <id> yes|no       confirm (or decline) being named as co-author  [--as <agent>] for your agent
  coauthors                  posts waiting for your answer as co-author
                             (in a project's issues or proposals board this opens an issue or a proposal)
  edit <id>                  change your post           [--title <t>] [--text <t>] [--link <url>] [--image <file>] ("" removes a link or image)
  delete <id>                take a post down: yours, or any where you moderate (it stays in the logs)
  up <id> / down <id> / unvote <id>   upvote, downvote, or take your vote back
  save <id> / unsave <id>    keep a post for later; --pin puts it at the top of your home (only you see this)
  share <id> --to <community|followers>   share a post into a community; public projects also to your followers  [--text <t>]
  boards                     a project's boards
  board add <name>           add a board (maintainers)  [--title <t>] [--type posts|issues|proposals] [--sort hot|new|top] [--position <n>]
  board set <name>           change title, sort or position (maintainers)
  board drop <name>          remove a board; its posts stay in the logs
  board follow <name>        bring a board's posts to your Home and notify you (releases and showcase by default); unfollow stops
  board access <name>        who may read and write (maintainers)  [--read <who,…>] [--write <who,…>]
                             people by name or did:key, groups as group:<name>; "everyone" opens it again,
                             "" leaves only the maintainers
  pin <id...>                pin posts to the top of a board, in this order (maintainers, moderators)  [-b <board>]; --clear unpins

memberships, Patreon-style (tiers buy access to a tier's chat and the projects it's invited into, never votes):
  tier create <name>         offer a tier                     [--price 5] [--currency EUR] [--text <description>] [--benefit "a,b"] [--auto: let people in without asking]
  tier list [who]            the tiers someone offers (default: yours)
  tier set <tier>            change it                        [--name] [--price] [--text] [--benefit]
                             sell it through Gumroad: --gumroad <product page> --gumroad-product <id> [--gumroad-variant <tier>]
                             (license keys on; your node lets buyers in and renews monthly); --gumroad off stops
  tier open|close|hide <tier>   take new members, stop taking them, or take it off your hub
  support <tier>             ask to join a tier               [--text "how I paid"] [--license <key from your Gumroad receipt>]
  requests                   people asking to join your tiers
  grant <tier> <who>         let them in, or renew            [--months 1]
  decline <tier> <who>       turn a request down
  memberships                tiers you support

rooms: share a project's app live with its participants (needs a running daemon):
  app publish -p <project>   publish the project's app from weave.app.json (maintainers)  [--file <path>]
  app show -p <project>      the project's app: ports it shares, buttons
  app install -p <project>   download its release for this computer, check it, unpack it, and use it (asks first)
  app check [file]           check a weave.app.json (default: here), every problem at once
  app set <NAME> -p <p>      fill in a setting the app asks for (an API key…), typed, kept on this computer only
  app unset <NAME> -p <p>    remove it again
  app env -p <project>       WEAVE_API, WEAVE_TOKEN and WEAVE_PROJECT for an app you start yourself (@weave/sdk reads them)
  app example                an annotated weave.app.json and its rules
  app workflow <app> <entry> a GitHub Actions workflow that builds standalone programs and releases them on each version tag
  app release <tag> -p <p>   point the app at a GitHub release (maintainers): reads weave.app.json at the tag, fingerprints each file
                             [--repo owner/name] [--asset win32-x64=<file> …] when names don't say the platform
  rooms [-p <project>]       open rooms
  room host <name> -p <p>    open a room sharing the project's app  [--invite a,b: only these people]
  room join <room>           join: prints the address to open
  room leave|end <room>      leave a room, or end the one you host
  room chat <room>           the room's chat (never stored)
  room say <room> <text...>  say something in it

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
    bare: { type: 'boolean', default: false },
    file: { type: 'string' },
    invite: { type: 'string' },
    auto: { type: 'boolean' },
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
    with: { type: 'string' },
    asset: { type: 'string', multiple: true },
    repo: { type: 'string' },
    from: { type: 'string' },
    accept: { type: 'boolean', default: false },
    'read-board': { type: 'string' },
    'write-board': { type: 'string' },
    read: { type: 'string' },
    write: { type: 'string' },
    subtitle: { type: 'string' },
    icon: { type: 'string' },
    image: { type: 'string' },
    banner: { type: 'string' },
    type: { type: 'string' },
    position: { type: 'string' },
    hours: { type: 'string' },
    text: { type: 'string' },
    price: { type: 'string' },
    currency: { type: 'string' },
    benefit: { type: 'string' },
    gumroad: { type: 'string' },
    'gumroad-product': { type: 'string' },
    'gumroad-variant': { type: 'string' },
    license: { type: 'string' },
    months: { type: 'string' },
    name: { type: 'string' },
    status: { type: 'string' },
    label: { type: 'string' },
    quorum: { type: 'string' },
    private: { type: 'boolean' },
    public: { type: 'boolean' },
    help: { type: 'boolean', short: 'h', default: false },
    version: { type: 'boolean', short: 'v', default: false },
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
  const gumroad = t.gumroad ? `\n  sold on Gumroad: ${t.gumroad.url}${t.gumroad.variant ? ` (${t.gumroad.variant})` : ''}${t.mine ? '' : ` — then: weave support ${t.id} --license <key>`}` : '';
  return `${t.name.padEnd(20)} ${money(t.price, t.currency).padEnd(18)} ${state}${t.mine ? '' : `  — ${t.creator.name ?? t.creator.did}`}\n${t.description ? `  ${t.description}\n` : ''}${t.benefits.map((b) => `  · ${b}`).join('\n')}${gumroad}`;
};

/** --gumroad options as a tier's Gumroad link: undefined leaves it, null removes it. */
function gumroadLink(): TierInfo['gumroad'] | null {
  if (values.gumroad === undefined) return undefined;
  if (values.gumroad === 'off') return null;
  if (!values['gumroad-product']) throw new Error('add the product id: --gumroad-product <id> (from the product in Gumroad)');
  return { url: values.gumroad, product: values['gumroad-product'], ...(values['gumroad-variant'] ? { variant: values['gumroad-variant'] } : {}) };
}
/** "5" or "5.50" (in the currency's main unit) → cents. */
const cents = (value?: string) => (value === undefined ? undefined : Math.round(Number(value.replace(',', '.')) * 100));
const benefits = (value?: string) => value?.split(',').map((b) => b.trim()).filter(Boolean);

const launchText = (l: AppLaunchInfo) =>
  [
    l.command ? `start command: ${l.command.join(' ')}${l.approved ? ' (approved)' : ''}` : `no start command${l.hint ? `; start it yourself: ${l.hint}` : ''}`,
    `folder: ${l.folder ?? '(not chosen: weave app folder <path> -p <project>)'}`,
    l.running ? `running since ${new Date(l.started!).toLocaleTimeString()}` : l.exit ? (l.exit.stopped ? 'stopped' : `exited by itself (code ${l.exit.code ?? '-'})`) : 'not running',
    ...(l.install ? [installText(l.install)] : []),
    ...(l.settings?.length ? [`settings (kept on this computer):\n${l.settings.map((x) => `  ${x.name.padEnd(22)} ${x.set ? '✓ set' : x.optional ? '– not set (optional)' : '✗ not set: weave app set ' + x.name} · ${x.label}`).join('\n')}`] : []),
  ].join('\n');

const installText = (i: NonNullable<AppLaunchInfo['install']>) =>
  [
    i.version ? `release: ${i.version}${i.repo ? ` from github.com/${i.repo}` : ''}${i.asset ? ` · ${i.asset.file}${i.asset.size ? ` (${Math.round(i.asset.size / 1e6)} MB)` : ''}` : ` · no file for ${i.platform}`}` : '',
    i.command && !i.installed ? `the installed build starts with: ${i.command.join(' ')}` : '',
    i.installed ? `installed here: ${i.installed}${i.version && i.installed !== i.version ? ` (update: weave app install)` : ''}` : i.asset ? 'not installed here (weave app install)' : '',
    i.error ? `last install failed: ${i.error}` : '',
    i.steps ? `steps for installing by hand:\n${i.steps.map((x, n) => `  ${n + 1}. ${x}`).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n');

/** A line typed without showing it (for secrets), from a terminal only. */
async function askHidden(question: string): Promise<string> {
  if (!process.stdin.isTTY) throw new Error('run this in a terminal: it asks you to type the value (it never goes on the command line, where it would end up in your shell history)');
  process.stdout.write(question);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  let value = '';
  try {
    return await new Promise<string>((resolve, reject) => {
      const onData = (chunk: Buffer) => {
        for (const ch of chunk.toString('utf8')) {
          if (ch === '\r' || ch === '\n') return (process.stdin.off('data', onData), resolve(value));
          if (ch === '\u0003') return (process.stdin.off('data', onData), reject(new Error('cancelled')));
          if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
          else value += ch;
        }
      };
      process.stdin.on('data', onData);
    });
  } finally {
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdout.write('\n');
  }
}

/** One line from the terminal, for questions only a person should answer. */
async function askLine(question: string): Promise<string> {
  if (!process.stdin.isTTY) throw new Error('run this in a terminal: it asks you to approve the command');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

const IMAGE_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };

/** Upload an image file; returns its wblob: reference. */
async function uploadImage(b: Backend, path: string): Promise<string> {
  const type = IMAGE_TYPES[path.split('.').pop()?.toLowerCase() ?? ''];
  if (!type) throw new Error(`images are ${Object.keys(IMAGE_TYPES).join(', ')} files`);
  return b.putBlob({ data: readFileSync(path).toString('base64'), type });
}

/** The contacts and free tiers this copy of Weave ships with: weave.bundle.json next to the packaged program, or at the repository root. */
function readBundle(): Bundle | undefined {
  const file = [join(import.meta.dirname, 'weave.bundle.json'), join(import.meta.dirname, '..', '..', '..', 'weave.bundle.json')].find(existsSync);
  return file ? (JSON.parse(readFileSync(file, 'utf8')) as Bundle) : undefined;
}

const roomLine = (r: RoomInfo) => {
  const who = r.mine ? 'you host it' : `hosted by ${r.host.name ?? r.host.did}`;
  const state = r.joined ? (r.connected ? `${r.peers.length} in it` : 'connecting…') : r.mayJoin ? 'join with: weave room join ' + r.id.slice(0, 8) : 'not invited';
  return `${r.id.slice(0, 8)}  ${r.name}  · p/${r.project.name} · ${who} · ${state}${r.url ? `\n          ${r.service?.label ?? 'open'}: ${r.url}` : ''}`;
};

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
  const coauthors = p.coauthors?.length ? ` with ${p.coauthors.map((c) => `${actor(c)}${c.state === 'confirmed' ? ' ✓' : c.state === 'declined' ? ' (declined)' : ' (asked)'}`).join(', ')}` : '';
  return `${p.short}  ${vote}${String(p.score).padStart(3)}  ${p.title}${marks ? `  ${marks}` : ''}
                 ${where(p)} · ${actor(p.by)}${coauthors} · ${p.chat} in chat${p.link ? ` · ${p.link}` : ''}`;
};
const grantees = (list: BoardInfo['access']['read']) => (list?.length ? list.map((g) => (g.group ? `group:${g.name ?? g.group}` : (g.name ?? g.person))).join(', ') : 'maintainers only');
const boardLine = (b: BoardInfo) =>
  `${b.name.padEnd(16)} ${b.title.padEnd(16)} ${b.type.padEnd(10)} sorted ${b.sort}, ${b.count} post${b.count === 1 ? '' : 's'}${b.pinned.length ? `, ${b.pinned.length} pinned` : ''}${b.following ? ', following' : ''}` +
  (b.access.read ? `\n${''.padEnd(17)}read: ${grantees(b.access.read)}` : '') +
  (b.access.write ? `\n${''.padEnd(17)}write: ${grantees(b.access.write)}${b.canWrite ? '' : ' (not you)'}` : '');
const knockLine = (k: KnockInfo) =>
  `${k.id.slice(0, 8)}  ${k.name ?? k.did} asks to join ${k.space.kind} ${k.space.name}${k.note ? `: "${k.note}"` : ''}${k.access.length ? `  (link gives ${k.access.map((r) => `${r.write ? 'write' : 'read'} ${r.board}`).join(', ')})` : ''}\n          weave let-in ${k.id.slice(0, 8)}  ·  weave turn-away ${k.id.slice(0, 8)}`;

/** Board rights from --read-board and --write-board (writing includes reading). */
function boardRights(): Array<{ board: string; read?: boolean; write?: boolean }> {
  const split = (v?: string) => (v ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const write = split(values['write-board']);
  return [...split(values['read-board']).filter((b) => !write.includes(b)).map((board) => ({ board, read: true })), ...write.map((board) => ({ board, read: true, write: true }))];
}

const inviteLink = (b: Backend, ref: string) => b.invite(ref, values.hours ? Number(values.hours) : undefined, { accept: values.accept, access: boardRights() });

const inviteText = (link: string, kind: string) =>
  link.startsWith('weave:knock:')
    ? `${link}\n\nWhoever has this link can ask to join the ${kind}; you let each one in (weave knocks).\nThey ask with: weave ${kind} join <link> [--text "a note"]`
    : `${link}\n\nShare this link privately: whoever has it can join the ${kind}.\nThey join with: weave ${kind} join <link>`;

const joinedText = (s: SpaceInfo) =>
  s.waiting ? `asked to join ${s.kind} ${s.name}: you're in once the person who sent the link lets you in` : `joined ${s.kind} ${s.name} (founded by ${s.founderName ?? s.founder})`;
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
    `${p.page.title || p.name}  [${p.page.status}]${p.page.public ? '  public' : ''}${p.page.title && p.page.title !== p.name ? `  (p/${p.name})` : ''}`,
    p.page.subtitle ? `  ${p.page.subtitle}` : '',
    p.page.body ? `\n${p.page.body.split('\n').map((l) => `  ${l}`).join('\n')}\n` : '',
    p.page.icon || p.page.banner ? `  images: ${[p.page.icon && 'icon', p.page.banner && 'banner'].filter(Boolean).join(', ')}` : '',
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
  if (values.version) return void console.log(VERSION);
  if (!command || values.help) return void console.log(HELP);

  switch (command) {
    case 'init': {
      const name = args.join(' ').trim();
      if (!name) throw new Error('usage: weave init <name>');
      const { node, words } = WeaveNode.create(name, home.dir);
      const bundle = values.bare ? undefined : readBundle();
      if (bundle) await node.applyBundle(bundle);
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

    case 'export': {
      const target = args[0];
      if (!target) throw new Error('usage: weave export <dir>');
      const db = join(home.dir, 'weave.db');
      if (!existsSync(db)) throw new Error(`${home.dir} has no weave.db yet: its logs are already JSON lines, in ${home.logs}`);
      // Read-only: works while the daemon is running.
      const store = new SqliteStore(db, { readOnly: true });
      try {
        const done = store.exportJsonl(resolvePath(process.env.INIT_CWD ?? process.cwd(), target));
        return out(done, () => `wrote ${done.events} events in ${done.files} logs to ${target}`);
      } finally {
        store.close();
      }
    }

    case 'update': {
      const u = await (await backend()).updateCheck({ current: VERSION });
      return out(u, () => {
        const l = u.latest;
        if (!l) return `Weave ${u.current}; no release found (are you in the Weave project?)`;
        if (!u.newer) return `Weave ${u.current} is the newest version`;
        return [`Weave ${l.version} is available (you have ${u.current})`, l.url ? `  get it: ${l.url}` : '', l.post ? `  release post: ${l.post}` : ''].filter(Boolean).join('\n');
      });
    }

    case 'status': {
      const s = await (await backend()).status();
      return out(s, () =>
        [
          `${s.name ?? '(no name)'}  ${s.did}`,
          `  ${s.online ? `online, ${s.peers} peer${s.peers === 1 ? '' : 's'}` : 'offline (no daemon running)'}`,
          `  ${s.groups} group${s.groups === 1 ? '' : 's'}, ${s.projects} project${s.projects === 1 ? '' : 's'}, ${s.communities} communit${s.communities === 1 ? 'y' : 'ies'}`,
          `  ${s.events} events in ${s.logs} logs${s.pending ? `, ${s.pending} pending` : ''}`,
          `  keys protected by ${{ dpapi: 'Windows (DPAPI)', keychain: 'the macOS Keychain', 'secret-service': 'the Secret Service', file: 'nothing' }[s.keystore]}`,
          ...(s.keystoreWarning ? [`  warning: ${s.keystoreWarning}`] : []),
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
      // Follow it rather than pin it: it may start later, or restart on another port.
      const b = followDaemon(home);
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
      if (sub === 'can' && name && args[2]) {
        const agent = await (await backend()).updateAgent({ name, permissions: args[2].split(',') });
        return out(agent, () => `agent ${agent.name} can now: ${agent.permissions.join(', ')}`);
      }
      throw new Error('usage: weave agent add <name> [--can <kinds>] | weave agent can <name> <kinds> | weave agent list');
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
        const invite = await inviteLink(b, ref);
        return out({ invite }, () => inviteText(invite, 'group'));
      }
      if (sub === 'join' && ref) {
        const g = await b.joinSpace(ref, values.text);
        return out(g, () => joinedText(g));
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
          const body = values.file !== undefined ? readFileSync(values.file, 'utf8') : values.text;
          const image = async (path?: string) => (path === undefined ? undefined : path === '' ? '' : uploadImage(b, path));
          const p = await b.setProjectPage({
            project: ref,
            title: values.title,
            subtitle: values.subtitle,
            body,
            icon: await image(values.icon),
            banner: await image(values.banner),
            status: values.status as ProjectStatus | undefined,
            public: isPublic,
          });
          return out(p, () => projectText(p));
        }
        case 'invite': {
          if (!ref) break;
          const invite = await inviteLink(b, ref);
          return out({ invite }, () => inviteText(invite, 'project'));
        }
        case 'join': {
          if (!ref) break;
          const p = await b.joinSpace(ref, values.text);
          return out(p, () => joinedText(p));
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
          const invite = await inviteLink(b, ref);
          return out({ invite }, () => inviteText(invite, 'community'));
        }
        case 'join': {
          if (!ref) break;
          const c = await b.joinSpace(ref, values.text);
          return out(c, () => joinedText(c));
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
        from: values.from as PostsQuery['from'],
        limit: values.n ? Number(values.n) : 25,
      });
      return out(posts, () => posts.map(postLine).join('\n') || '(no posts yet)');
    }

    case 'github': {
      const [sub, ref] = args;
      const b = await backend();
      const status = (g: GitHubInfo) =>
        `${g.login ? `signed in to GitHub as ${g.login}` : g.available ? 'not signed in to GitHub (weave github connect)' : "this copy of Weave can't reach GitHub yet (no GitHub app client ID)"}
through the GitHub App ${g.app.name} (${g.app.url}), owned by ${g.app.owner}${g.app.own ? ', your own choice' : ''}`;
      if (!sub) {
        const g = await b.github();
        return out(g, () => status(g));
      }
      if (sub === 'connect') {
        const started = await b.connectGithub();
        console.error(`Open ${started.pending!.verificationUri} and enter the code  ${started.pending!.userCode}`);
        for (;;) {
          await new Promise((r) => setTimeout(r, 2000));
          const g = await b.github();
          if (g.error) throw new Error(g.error);
          if (!g.pending && g.login) return out(g, () => status(g));
        }
      }
      if (sub === 'app') {
        const g = await b.setGithubApp(!ref || ref === 'default' ? null : ref);
        return out(g, () => `${status(g)}
(sign in again: weave github connect)`);
      }
      if (sub === 'disconnect') {
        const g = await b.disconnectGithub();
        return out(g, () => 'GitHub sign-in forgotten on this device');
      }
      if (sub === 'repos') {
        const repos = await b.githubRepos();
        return out(repos, () => repos.join('\n') || '(none: install the Weave GitHub app on a repository you administer)');
      }
      if (sub === 'hub') {
        const off = ref === 'off';
        const p = await b.showGithubOnHub({ on: !off });
        return out(p, () => (p.github ? `your hub shows GitHub ${p.github.login} (${p.github.url})` : 'your hub no longer shows GitHub'));
      }
      if ((sub === 'share' || sub === 'unshare') && ref) {
        const r = await b.shareGithub({ space: ref, on: sub === 'share' });
        return out(r, () => (r.shared ? `${ref} knows your GitHub account ${r.shared}` : `${ref} no longer has your GitHub account`));
      }
      throw new Error('usage: weave github [connect|disconnect|app <link>|default|repos|hub [off]|share <space>|unshare <space>]');
    }

    case 'repo': {
      const [sub, ref, repo] = args;
      const b = await backend();
      const show = (r: SpaceRepos) =>
        [
          ...r.repos.map((x) => `${x.repo}${x.board ? ` (readers of ${x.board})` : ''}  linked by ${actor(x.by)}${x.problem ? `  — ${x.problem}` : ''}`),
          r.repos.length ? '' : '(no repositories)',
          r.shared ? `you gave it your GitHub account ${r.shared}` : r.repos.length ? 'you haven\'t given it your GitHub account (weave github share)' : '',
          r.missing?.length ? `without a GitHub account here: ${r.missing.map(actor).join(', ')}` : '',
        ]
          .filter(Boolean)
          .join('\n');
      if (sub === 'list' && ref) {
        const r = await b.spaceRepos(ref);
        return out(r, () => show(r));
      }
      if ((sub === 'link' || sub === 'unlink') && ref && repo) {
        const r = await b.linkRepo({ space: ref, repo, board: values.board, on: sub === 'link' });
        return out(r, () => show(r));
      }
      throw new Error('usage: weave repo list <space> | repo link <space> <owner/name> [-b <board>] | repo unlink <space> <owner/name>');
    }

    case 'home': {
      const [sub, ref] = args;
      if (!['hide', 'show'].includes(sub) || !ref) throw new Error('usage: weave home hide|show <community|project>');
      const s = await (await backend()).setHomeVisibility({ space: ref, visible: sub === 'show' });
      return out(s, () => (s.hiddenFromHome ? `${s.name} is off your home (still in your sidebar)` : `${s.name} shows on your home`));
    }

    case 'read': {
      if (!args[0]) throw new Error('usage: weave read <id or weave:post: link>');
      const b = await backend();
      const p = await b.post(args[0]);
      const chat = p.space && p.type !== 'project' ? await b.messages(undefined, { post: p.id, limit: values.n ? Number(values.n) : 30 }) : [];
      return out({ ...p, messages: chat }, () =>
        [
          postLine(p),
          p.text ? `\n${p.text}\n` : '',
          `  link: weave:post:${p.id}`,
          p.project && !p.project.member ? `  (a project you're not in: ${p.project.name} [${p.project.status}] — ask in the chat to be invited)` : '',
          p.type === 'project' ? `  chat in its channels: weave chat -p "${p.title}"` : '',
          ...chat.map((m) => `  ${m.short}  ${actor(m.by).padEnd(20)}  ${m.text}`),
          p.space && p.type !== 'project' ? `\n  talk: weave say --post ${p.short} "..."` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      );
    }

    case 'coauthor': {
      const [ref, answer] = args;
      if (!ref || !['yes', 'no'].includes(answer)) throw new Error('usage: weave coauthor <post id> yes|no [--as <agent>]');
      const p = await (await backend()).confirmCoauthor({ post: ref, on: answer === 'yes', as: values.as });
      return out(p, () => postLine(p));
    }

    case 'coauthors': {
      const list = await (await backend()).coauthorRequests();
      return out(list, () =>
        list.map((r) => `${r.post.short}  ${r.post.title}  — ${actor(r.by)} names ${r.agent ? `your agent ${r.agent}` : 'you'} as co-author\n          weave coauthor ${r.post.short} yes${r.agent ? ` --as ${r.agent}` : ''}  ·  weave coauthor ${r.post.short} no${r.agent ? ` --as ${r.agent}` : ''}`).join('\n') || '(nothing to answer)',
      );
    }

    case 'submit': {
      const title = args.join(' ').trim();
      if (!title) throw new Error('usage: weave submit <title...> -r <community> | -p <project> [-b <board>]');
      const space = values.community ?? values.project;
      if (!space) throw new Error('where? add -r <community> or -p <project> (with -b <board>)');
      const b = await backend();
      const image = values.image ? await uploadImage(b, values.image) : undefined;
      const coauthors = values.with?.split(',').map((w) => w.trim()).filter(Boolean);
      const p = await b.submit({ space, board: values.board, title, text: values.text, link: values.link, image, with: coauthors, as: values.as });
      return out(p, () => postLine(p));
    }

    case 'edit': {
      if (!args[0]) throw new Error('usage: weave edit <id> [--title <t>] [--text <t>] [--link <url>] [--with <who,…> ("" for none)]');
      const b = await backend();
      const image = values.image === undefined ? undefined : values.image === '' ? '' : await uploadImage(b, values.image);
      const coauthors = values.with === undefined ? undefined : values.with.split(',').map((w) => w.trim()).filter(Boolean);
      const p = await b.editPost({ post: args[0], title: values.title, text: values.text, link: values.link, image, with: coauthors, as: values.as });
      return out(p, () => `edited
${postLine(p)}`);
    }

    case 'delete': {
      if (!args[0]) throw new Error('usage: weave delete <id>');
      await (await backend()).deletePost({ post: args[0], as: values.as });
      return out({ deleted: args[0] }, () => 'deleted: out of sight for everyone; it stays in the logs');
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
      if (sub === 'access' && name) {
        const list = (value?: string) => (value === undefined ? undefined : value.trim() === 'everyone' ? null : value.split(',').map((w) => w.trim()).filter(Boolean));
        const boards = await (await backend()).setBoardAccess({ project: needProject(), board: name, read: list(values.read), write: list(values.write) });
        return out(boards, () => boards.map(boardLine).join('\n'));
      }
      if ((sub === 'follow' || sub === 'unfollow') && name) {
        const boards = await (await backend()).followBoard({ project: needProject(), board: name, on: sub === 'follow' });
        return out(boards, () => boards.map(boardLine).join('\n'));
      }
      if (!['add', 'set', 'drop'].includes(sub) || !name) throw new Error('usage: weave board add|set|drop|access|follow|unfollow <name> -p <project>');
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

    case 'leave': {
      if (!args[0]) throw new Error('usage: weave leave <group|project|community>');
      await (await backend()).leave(args[0]);
      return out({ left: args[0] }, () => `left ${args[0]}: you no longer receive it, and its key rotates without you`);
    }

    case 'hand-over': {
      const [space, to] = args;
      if (!space || !to) throw new Error('usage: weave hand-over <space> <who>');
      const s = await (await backend()).handOver({ space, to });
      return out(s, () => `${s.name} now belongs to ${s.founderName ?? s.founder}`);
    }

    case 'close':
    case 'reopen': {
      if (!args[0]) throw new Error(`usage: weave ${command} <space>`);
      const s = await (await backend()).closeSpace({ space: args[0], closed: command === 'close' });
      return out(s, () => (s.closed ? `closed ${s.name}: kept as it is, read-only (weave reopen to undo)` : `${s.name} is open again`));
    }

    case 'rule': {
      const [space, board, keep, mb] = args;
      if (!space || !board || !keep) throw new Error('usage: weave rule <space> <board> <days | off> [max MB]');
      const days = keep === 'off' ? null : Number(keep);
      const boards = await (await backend()).setBoardRule({ space, board, keepDays: days, maxMB: mb ? Number(mb) : null });
      const b = boards.find((x) => x.name === board || x.title === board)!;
      return out(b, () =>
        b.rule
          ? `posts in ${b.title} stay ${b.rule.keepDays ? `${b.rule.keepDays} days after their last activity, longer with upvotes` : 'for good'}${b.rule.maxMB ? `, up to ${b.rule.maxMB} MB in all` : ''} (from 14 days after now at the earliest)`
          : `posts in ${b.title} stay for good`,
      );
    }

    case 'shred': {
      const [space, before] = args;
      if (!space || !before) throw new Error('usage: weave shred <space> <date>   (the keys that ended before that date)');
      const r = await (await backend()).shred({ space, before });
      return out(r, () => `carried ${r.carried} events forward; everyone in ${space} deletes ${r.epochs.length === 1 ? 'one old key' : `${r.epochs.length} old keys`}, so every copy of what was sealed with ${r.epochs.length === 1 ? 'it' : 'them'} becomes unreadable`);
    }

    case 'older': {
      if (!args[0]) throw new Error('usage: weave older <space> [before]');
      const r = await (await backend()).fetchOlder({ space: args[0], ...(args[1] ? { before: args[1] } : {}) });
      return out(r, () => `asked the members of ${args[0]} for ${r.since.slice(0, 10)} to ${r.until.slice(0, 10)}: what they hold comes in while you're online`);
    }

    case 'keep': {
      if (!args[0]) throw new Error('usage: weave keep <post>');
      const p = await (await backend()).keepPost(args[0]);
      return out(p, () => `kept ${p.title}${p.lifetime && 'until' in p.lifetime ? `: it stays until ${p.lifetime.until.slice(0, 10)}` : ''}`);
    }

    case 'fading': {
      const posts = await (await backend()).fading();
      return out(posts, () => (posts.length ? posts.map((p) => `${p.short}  ${p.title}  (${p.space?.name}, forgotten ${(p.lifetime as { until: string }).until.slice(0, 10)}: weave keep ${p.short})`).join('\n') : 'nothing of yours is going to be forgotten soon'));
    }

    case 'history': {
      if (!args[0]) throw new Error('usage: weave history <space> [all | 30d | joining]');
      const b = await backend();
      const s = args[1] ? await b.setHistory({ space: args[0], history: args[1] as SpaceInfo['history'] }) : (await b.spaces()).find((x) => x.name === args[0] || x.id === args[0]);
      if (!s) throw new Error(`no space ${args[0]}`);
      const says: Record<SpaceInfo['history'], string> = { all: 'everything', '30d': 'the last 30 days', joining: 'only what comes after their invite' };
      return out(s, () => `newcomers to ${s.name} read ${says[s.history]}`);
    }

    case 'knocks': {
      const knocks = await (await backend()).knocks();
      return out(knocks, () => knocks.map(knockLine).join('\n') || '(nobody asking)');
    }

    case 'let-in':
    case 'turn-away': {
      if (!args[0]) throw new Error(`usage: weave ${command} <id>`);
      await (await backend()).answerKnock({ knock: args[0], accept: command === 'let-in' });
      return out({ [command]: args[0] }, () => (command === 'let-in' ? 'let them in: their node gets the keys when it next meets yours' : 'turned them away'));
    }

    case 'admissions': {
      const list = await (await backend()).admissions(args[0]);
      return out(list, () => list.map(admissionLine).join('\n') || '(nobody waiting)');
    }

    case 'admit':
    case 'decline': {
      const [project, person, group] = args;
      // decline <tier> <who>: turn a membership request down (no group named).
      if (command === 'decline' && project && person && !group) {
        await (await backend()).declineMembership({ tier: project, who: person });
        return out({ declined: person }, () => `turned down ${person}`);
      }
      if (!project || !person || !group) throw new Error(`usage: weave ${command} <project> <who> <group>${command === 'decline' ? ', or weave decline <tier> <who>' : ''}`);
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
        const t = await b.createTier({ name: args.slice(1).join(' '), price: cents(values.price), currency: values.currency, description: values.text, benefits: benefits(values.benefit), auto: values.auto, gumroad: gumroadLink() ?? undefined });
        return out(t, () => `offered ${t.name}\n${tierLine(t)}\n\ninvite it into a project:  weave project add-group <project> "${t.name}"`);
      }
      if (sub === 'list') {
        const tiers = await b.tiers(ref);
        return out(tiers, () => tiers.map(tierLine).join('\n\n') || '(no tiers)');
      }
      if (sub === 'set' && ref) {
        const t = await b.setTier({ tier: ref, name: values.name, price: cents(values.price), currency: values.currency, description: values.text, benefits: benefits(values.benefit), auto: values.auto, gumroad: gumroadLink() });
        return out(t, () => tierLine(t));
      }
      if ((sub === 'open' || sub === 'close' || sub === 'hide') && ref) {
        const t = await b.setTier({ tier: ref, open: sub === 'open', hidden: sub === 'hide' || undefined });
        return out(t, () => (sub === 'hide' ? `${t.name} is off your hub; members keep it until their grants run out` : tierLine(t)));
      }
      throw new Error('usage: weave tier create|list|set|open|close|hide — see "weave --help"');
    }

    case 'support': {
      const tier = args.join(' ').trim();
      if (!tier) throw new Error('usage: weave support <tier id> [--text "how I paid"]');
      await (await backend()).requestMembership({ tier, note: values.text, license: values.license });
      return out({ requested: tier }, () => (values.license ? "sent your license key: you're in once the creator's node has checked it with Gumroad" : 'asked to join; the creator decides'));
    }

    case 'requests': {
      const list = await (await backend()).membershipRequests();
      const license = (r: (typeof list)[number]) =>
        r.license ? `\n  Gumroad license ${r.license.key.slice(0, 8)}…: ${r.license.ok === undefined ? 'checking' : r.license.ok ? 'valid' : `not let in: ${r.license.reason}`}${r.license.email ? ` (${r.license.email})` : ''}` : '';
      return out(list, () => list.map((r) => `${r.tier.name}: ${r.name ?? r.did}${r.note ? ` — "${r.note}"` : ''}${license(r)}\n  weave grant "${r.tier.name}" ${r.did} --months 1`).join('\n') || '(nobody waiting)');
    }

    case 'grant': {
      const [tier, person] = args;
      if (!tier || !person) throw new Error(`usage: weave ${command} <tier> <who> [--months 1]`);
      const t = await (await backend()).grantMembership({ tier, who: person, months: values.months ? Number(values.months) : 1 });
      return out(t, () => `${person} is in ${t.name} (${t.members} member${t.members === 1 ? '' : 's'})`);
    }

    case 'memberships': {
      const tiers = await (await backend()).memberships();
      return out(tiers, () => tiers.map(tierLine).join('\n\n') || '(you support nobody yet)');
    }

    case 'app': {
      const [sub] = args;
      const b = await backend();
      if (sub === 'publish') {
        const file = resolvePath(process.env.INIT_CWD ?? process.cwd(), values.file ?? 'weave.app.json');
        if (!existsSync(file)) throw new Error(`no app manifest at ${file}`);
        const app = await b.publishApp({ project: needProject(), manifest: JSON.parse(readFileSync(file, 'utf8')), folder: dirname(file) });
        return out(app, () => `published ${app.name} (${app.app}) in ${values.project}\n${app.services.map((s) => `  shares port ${s.port} (${s.protocol})${s.open?.joiner ? ` · players open ${s.open.joiner.path}` : ''}`).join('\n')}`);
      }
      if (sub === 'show') {
        const app = await b.projectApp(needProject());
        return out(app, () => (app ? `${app.name} (${app.app})\n${app.services.map((s) => `  ${s.id}: port ${s.port} (${s.protocol})${s.open?.host ? ` · host: ${s.open.host.label} ${s.open.host.path}` : ''}${s.open?.joiner ? ` · players: ${s.open.joiner.label} ${s.open.joiner.path}` : ''}`).join('\n')}${app.start ? `\n  start: ${app.start.hint}` : ''}` : '(no app published)'));
      }
      if (sub === 'folder') {
        const info = await b.setAppFolder({ project: needProject(), folder: args[1] === undefined ? (process.env.INIT_CWD ?? process.cwd()) : args[1] && resolvePath(process.env.INIT_CWD ?? process.cwd(), args[1]) });
        return out(info, () => launchText(info));
      }
      if (sub === 'install') {
        const project = needProject();
        const info = await b.appLaunch(project);
        const i = info.install;
        if (!i?.asset) throw new Error(`no release file for this computer${i ? ` (${i.platform})` : ''}${i?.steps ? `; install it by hand:\n${i.steps.map((x, n) => `  ${n + 1}. ${x}`).join('\n')}` : ''}`);
        const answer = await askLine(`Install ${i.version} from github.com/${i.repo}: ${i.asset.file}${i.asset.size ? ` (${Math.round(i.asset.size / 1e6)} MB)` : ''}, checked against its published SHA-256.${info.command ? `\nIt then starts with: ${info.command.join(' ')}` : ''}\nInstall${info.command ? ' and approve that command' : ''}? [y/N] `);
        if (!/^y(es)?$/i.test(answer.trim())) throw new Error('not installed');
        await b.installApp({ project, approve: true });
        let last = '';
        for (;;) {
          await new Promise((r) => setTimeout(r, 500));
          const now = await b.appLaunch(project);
          const p = now.install?.progress;
          if (!p) {
            if (now.install?.error) throw new Error(now.install.error);
            return out(now, () => `installed ${now.install?.installed} in ${now.folder}\n${launchText(now)}`);
          }
          const line = `${p.state} ${Math.round(p.done / 1e6)}${p.total ? ` of ${Math.round(p.total / 1e6)}` : ''} MB`;
          if (line !== last) console.error(line);
          last = line;
        }
      }
      if (sub === 'check') {
        const file = resolvePath(process.env.INIT_CWD ?? process.cwd(), args[1] ?? values.file ?? 'weave.app.json');
        if (!existsSync(file)) throw new Error(`no manifest at ${file}: weave app check --example shows one`);
        let input: unknown;
        try {
          input = JSON.parse(readFileSync(file, 'utf8'));
        } catch (error) {
          throw new Error(`${file} isn't valid JSON: ${(error as Error).message}`);
        }
        const checked = checkManifest(input);
        out(checked, () =>
          [
            checked.problems.length ? `${checked.problems.length} problem${checked.problems.length === 1 ? '' : 's'}:\n${checked.problems.map((p) => `  ✗ ${p}`).join('\n')}` : `${file}: fine`,
            checked.warnings.length ? `worth a look:\n${checked.warnings.map((w) => `  ! ${w}`).join('\n')}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
        );
        if (checked.problems.length) process.exitCode = 1;
        return;
      }
      if (sub === 'set' && args[1]) {
        const project = needProject();
        const setting = (await b.appLaunch(project)).settings?.find((x) => x.name === args[1]);
        if (!setting) throw new Error(`the app doesn't ask for ${args[1]}: weave app status -p ${project} lists its settings`);
        const value = setting.secret ? await askHidden(`${setting.label} (not shown): `) : await askLine(`${setting.label}: `);
        const info = await b.setAppSetting({ project, name: setting.name, value });
        return out(info.settings, () => `${setting.label} ${value.trim() ? 'saved on this computer' : 'not changed (empty)'}; ${info.settings?.filter((x) => !x.optional && !x.set).length ? 'still missing: ' + info.settings.filter((x) => !x.optional && !x.set).map((x) => x.name).join(', ') : 'the app has what it needs'}`);
      }
      if (sub === 'unset' && args[1]) {
        const info = await b.setAppSetting({ project: needProject(), name: args[1], value: null });
        return out(info.settings, () => `${args[1]} removed from this computer`);
      }
      if (sub === 'env') {
        const env = await b.appEnv(needProject());
        const line = ([k, v]: [string, string]) => (process.platform === 'win32' ? `$env:${k}='${v}'` : `export ${k}='${v}'`);
        return out(env, () => [...Object.entries(env).map(line), '# set these where you start the app; they last until Weave restarts'].join('\n'));
      }
      if (sub === 'example') {
        return out({ rules: MANIFEST_RULES, example: MANIFEST_EXAMPLE }, () => `${JSON.stringify(MANIFEST_EXAMPLE, null, 2)}\n\n${MANIFEST_RULES.map((r) => `- ${r}`).join('\n')}`);
      }
      if (sub === 'workflow' && args[1] && args[2]) {
        const w = releaseWorkflow(args[1], args[2]);
        return out(w, () => `# ${w.file}\n${w.content}\n# weave.app.json: "start": { …, "release": ${JSON.stringify(w.startRelease)} }\n${w.notes.map((n) => `# - ${n}`).join('\n')}`);
      }
      if (sub === 'release' && args[1]) {
        const assets = Object.fromEntries((values.asset ?? []).map((a) => a.split('=')).filter((kv) => kv.length === 2));
        const app = await b.releaseApp({ project: needProject(), tag: args[1], repo: values.repo, assets });
        return out(app, () => `${app.name} now installs ${app.install?.tag} from github.com/${app.install?.github}:\n${Object.entries(app.install?.assets ?? {}).map(([platform, a]) => `  ${platform.padEnd(13)} ${a.file}  sha256 ${a.sha256.slice(0, 16)}…`).join('\n')}`);
      }
      if (sub === 'start') {
        const project = needProject();
        let info = await b.appLaunch(project);
        if (info.command && info.folder && !info.approved) {
          const answer = await askLine(`Weave will run this on your computer:\n  ${info.command.join(' ')}\n  in ${info.folder}\nRun it? [y/N] `);
          if (!/^y(es)?$/i.test(answer.trim())) throw new Error('not started');
        }
        info = await b.launchApp({ project, approve: true });
        return out(info, () => launchText(info));
      }
      if (sub === 'stop' || sub === 'status') {
        const info = sub === 'stop' ? await b.stopApp(needProject()) : await b.appLaunch(needProject());
        return out(info, () => `${launchText(info)}${info.log.length ? `\n\n${info.log.slice(-20).join('\n')}` : ''}`);
      }
      throw new Error('usage: weave app publish|show|check|set <NAME>|unset <NAME>|env|example|workflow|folder|install|release <tag>|start|stop|status -p <project>');
    }

    case 'rooms': {
      const rooms = await (await backend()).rooms(values.project);
      return out(rooms, () => rooms.map(roomLine).join('\n') || '(no open rooms)');
    }

    case 'room': {
      const [sub, ref, ...words] = args;
      const b = await backend({ needsDaemon: sub !== 'chat' });
      if (sub === 'host' && ref) {
        const r = await b.hostRoom({ project: needProject(), name: [ref, ...words].join(' '), invite: values.invite?.split(',').map((w) => w.trim()).filter(Boolean) });
        return out(r, () => `${roomLine(r)}${r.service?.ready ? '' : `\n  start the app first${r.app?.startHint ? `: ${r.app.startHint}` : ''}`}`);
      }
      if (sub === 'join' && ref) {
        await b.joinRoom(ref);
        let r: RoomInfo | undefined;
        for (let i = 0; i < 100 && !r?.url; i++) {
          r = (await b.rooms()).find((x) => x.id.startsWith(ref) || x.name.toLowerCase() === ref.toLowerCase());
          if (!r?.url) await new Promise((resolve) => setTimeout(resolve, 300));
        }
        return out(r, () => (r?.url ? `joined ${r.name}: open ${r.url}\n(the tunnel stays open until you leave: weave room leave "${r.name}")` : 'joined, but the host is not reachable yet; try "weave rooms" in a moment'));
      }
      if ((sub === 'leave' || sub === 'end') && ref) {
        await (sub === 'end' ? b.endRoom(ref) : b.leaveRoom(ref));
        return out({ [sub]: ref }, () => (sub === 'end' ? 'room ended' : 'left the room'));
      }
      if (sub === 'chat' && ref) {
        const messages = await b.roomChat(ref);
        return out(messages, () => messages.map((m) => `${new Date(m.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}  ${(m.by.name ?? m.by.did).padEnd(16)}  ${m.text}`).join('\n') || '(quiet; room chats are never stored)');
      }
      if (sub === 'say' && ref && words.length) {
        await b.sayInRoom({ room: ref, text: words.join(' ') });
        return out({ said: words.join(' ') }, () => 'said');
      }
      throw new Error('usage: weave room host|join|leave|end|chat|say — see "weave --help"');
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
      return out(p, () => `added ${p.name ?? p.did} and followed them; their hub syncs once your nodes connect (needs a running daemon)`);
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

    case 'image': {
      if (!args[0]) throw new Error('usage: weave image <file>');
      const ref = await uploadImage(await backend(), args[0]);
      return out({ ref }, () => `${ref}\n\nUse it in a post or page: ![description](${ref})`);
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
