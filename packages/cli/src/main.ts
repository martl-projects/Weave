#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { hostname } from 'node:os';
import { parseArgs } from 'node:util';
import { contractWords, formatUnits, isAddress, parseUnits, TEST_USDC, type RepoAccess, type ServiceContract } from '@weave/core';
import {
  claudeBundle,
  connectDaemon,
  daemonInfo,
  stopDaemon,
  followDaemon,
  checkManifest,
  MANIFEST_EXAMPLE,
  MANIFEST_RULES,
  KEYSTORE_NAMES,
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
  type CreateCompanyInput,
  type CommunityInfo,
  type FeedItem,
  type GitHubInfo,
  type GumroadInfo,
  type SpaceRepos,
  type SpaceRef,
  type ServiceInfo,
  type HostedWebsiteInfo,
  type IssueInfo,
  type MemberInfo,
  type PostInfo,
  type PostsQuery,
  type ProjectInfo,
  type ProjectStatus,
  type ProposalInfo,
  type KnockInfo,
  type SpaceInfo,
  type ThreadInfo,
  type TierInfo,
  type BadgeInfo,
  type BadgeSeriesInfo,
  type LabelInfo,
  type SafeProposalInfo,
  type ShowInfo,
  type SplitInfo,
  type TreasuryInfo,
  type WalletInfo,
  type WebsiteInfo,
  type LinkInfo,
  SqliteStore,
  machinePolicy,
  openInBrowser,
} from '@weave/node';

/** Set when this file is bundled into the desktop app (see apps/desktop/package.ts). */
declare const WEAVE_VERSION: string | undefined;
/** This package's version, kept in step with every Weave release. */
const VERSION =
  typeof WEAVE_VERSION === 'string' ? WEAVE_VERSION : (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;

const HELP = `weave ${VERSION} — build things together, peer to peer, with your friends and their agents

usage: weave <command> [options]

A <space> is any place you share: a group, a project or a community (by name or id).
A company's own projects and groups are its company spaces.

  init <name>                create your identity; shows your 24 recovery words once, and applies
                             weave.bundle.json (contacts and free tiers the app ships with) unless --bare
  enroll <link> --id-token <token> [--name <name>]
                             set up a company account: the company holds it and its recovery (no words shown)
  recover-request / recover <answer>   a company account on a new computer: ask, then set up from the company's answer
  restore                    set up this computer as another device of your identity, from your recovery words
  whoami                     show your identity and agents
  daemon                     run your node: connect to peers, serve the local API
  daemon stop | restart      stop the running daemon properly (or restart it, e.g. for new code)   [--force: end it hard if it won't]
  status                     node status: peers, groups, projects, communities
  keystore [os|tpm|secure-enclave|yubikey|file]   where this computer keeps the key to your keys (hardware: tpm, secure-enclave, yubikey)
  node pair [name]           on an always-on node (server, NAS, cluster), in an empty home: a request for one of your computers
  node add <request>         on your computer: answer it (the node keeps your spaces and hosts your rooms; weave revoke node:<name> ends it)
  node join <answer>         on the always-on node: finish with the answer, then run weave daemon
  update                     is there a newer Weave? (release posts in the Weave project, and GitHub)
  export <dir>               write every log out as JSON lines (a backup, or for going back to an older Weave)
  post <text...>             publish a short text post (public unless -p/-g/-r)   [--as <agent>]
  feed                       show recent posts         [-p <project> | -g <group>] [-n <count>] [--all]
  watch                      stream new events (needs a running daemon)  [--as <agent> --mentions]
  mcp                        serve this node to an agent harness over MCP (stdio)  [--as <agent>]
  claude-bundle              write weave.mcpb: Weave for the Claude desktop app's chat, as an agent
                             [--as <agent>] [--out <file>] [--open: show Claude's install dialog]
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
  keepers                                your small spaces and the friends who keep them for you
  shred <space> <date>                   carry forward what the rules keep, then everyone deletes the keys that ended before date
  manage <space> vault|azure ...         a company's Vault or Azure Key Vault holds half of every new key (owner)
  unlock <space> / sso <space> <id token>   unlock a company space's keys / sign in with your company
  hold <space> <until> [reason]          legal hold: nothing shredded or forgotten until then (owner)
  destroy-company-key <space>            shred everything under the company key (owner)
  approve-agent <space> <person/agent> [off]  let an agent act in a company space (managers)
  escrow <space> <words> / escrow-open <space> <person> [--for <request>]  leave recovery words with the company / open them (managers)
  company                                your company: settings, mappings, spaces, requests
  company create <name> vault|azure|aws|gcp ... --issuer <url> --audience <id> --admins <sign-in group>   on the company's own node
  company link [--days n]                an enrollment link for new company accounts (the company, admins)
  company invite <email> [--days n]      send a new colleague their invitation (the company's node, with WEAVE_SMTP_URL)
  company map <sign-in group> <space> [maintainer] [--off]   everyone in that sign-in group belongs in that company space
  company space project|group <name> / company start <contact links…> / company admins <group> / company links on|off
  company hold <space> <until> / company destroy-key <space> / company freeze <person>   (admins ask; the company's node does it)
  company policy outside|public|chats on|off / company policy directs all|company|off   what company accounts may do
  company retention <min days|-> [max days|-] [--in <space>]   how long company spaces keep things, at least and at most (--in: that one's own; - - back to the company's)
  company auditors|helpdesk <sign-in group>|-   console roles: auditors read everything, the helpdesk sets people up
  company chat <colleague>               a chat with a colleague, kept by the company
  company scim on [port] [--send-invites] | off   SCIM for your user management (Entra ID, Okta, Google): deactivating someone takes them out at once
  company devices <ca.pem> | off         vouch only for sign-ins from computers with a certificate from your device authority
  company console on [port] --client-id <id> [--url <address>]   the admin console, for admins signing in with their company account
  company stream add webhook|splunk|syslog|sentinel …  /  company stream [remove <id>]   the audit to your security tools, as it happens
  company export <space> [since] [until] everything a company space holds, as JSON lines (legal searches)
  link <person or contact link> [--in <space>] [--off] / links [person]   this identity is also that one (both say so)
  audit <space> [since]                  the space's governance as JSON lines: who changed what, when
  (company nodes: "attestor": {"issuer", "audience"} or "archive": true in config.json)
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
  gumroad                    your Gumroad connection on this device (for tier … --gumroad new)
  gumroad connect            connect Gumroad in the browser (through the Weave application on Gumroad)
  gumroad disconnect         forget the connection on this device
  github                     your GitHub sign-in on this device
  github connect             sign in to GitHub with a code (through the Weave GitHub app)
  github disconnect          forget the sign-in on this device
  github app <link>|default  sign in through your own GitHub App (https://github.com/apps/…) instead of Weave Connect
  github repos               repositories you can link (the app is installed on them and you're admin)
  github hub [off]           show your GitHub account on your hub (proven by a public gist); hub off to stop
  github share <space>       give a space your GitHub account, so its repos invite you; unshare to take it back
  service add <name>         run code under a key of its own, with exactly these rights:
                             --reads addressed|space|<kind,…> --writes <kind,…> [--offers-website] [--contract-version 1.0]
                             [--spaces <space,…>] [--run "<command>"] [--text <description>] [--node <always-on node>: run it there]
  service add room --builtin room   the room service Weave ships: a way to join in with a project's participants
                             [--spaces <project,…>]: where it opens rooms (weave room open)
  service add [<name>] --artifact <project>[@tag]   install an applet: a project's release, as a service with the contract
                             its manifest declares (asks you to approve it)  [--spaces <space,…>] [--setting KEY=VALUE] [--node <always-on node>]
  service artifacts <project>  a project's releases: apps (a room runs them) and applets (installed as services)
  service list               the services this computer runs; service profiles: everyone's you know
  service set <name>         [--spaces <space,…>] [--run "<command>" ("" for none)] [--setting KEY=VALUE (KEY= removes it)] [--text <description>]
                             [--in <space> --setting KEY=VALUE]: a setting for one space only
                             [--update latest|<tag>]: an applet takes another release (asks you to approve it)
  service start|stop <name>  run it or not
  service remove <name>      stop it for good (its key is revoked)
  service ask <service> <text...>  ask a service something in a space (-p/-g/-r); service requests: the requests there and their answers
  repo list <space>          a space's repositories
  repo link <space> <owner/name>     owner or maintainers: let the repo follow the space   [-b <board>: only its readers]
                             a personal repo: --access none (just linked) or --access write --writers <who,…> (picked one by one)
  repo unlink <space> <owner/name>   stop it (access Weave gave is taken back)

posts — in a community (-r) or a project's boards (-p); without either, your home:
  posts                      list posts                 [-b <board>] [--sort hot|new|top] [--saved] [-n <count>]
                             on your home: [--from all|communities|projects|mine|friends|following]
  home hide <space> / home show <space>   leave a community or project off your home (only you know)
  read <id|link>             a post and its chat (and its link to send: http://weave.localhost:7710/…)
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
                             paid on chain (test USDC on Base Sepolia): --usdc 5 per month [--pay-to <address | project: its split contract>]
                             (default: your linked wallet); --usdc off stops it. Payments are checked on chain, then let in
                             sell it through Gumroad: --gumroad new makes the membership there, with license keys,
                             and publishes it (weave gumroad connect first, or GUMROAD_ACCESS_TOKEN; tier create too)
                             or link one you made: --gumroad <product page> --gumroad-product <id> [--gumroad-variant <tier>]
                             your node lets buyers in and renews monthly; --gumroad off stops
  tier open|close|hide <tier>   take new members, stop taking them, or take it off your hub
  support <tier>             ask to join a tier               [--text "how I paid"] [--license <key from your Gumroad receipt>]
                             [--payment <tx hash>: for tiers paid on chain, from your linked wallet]
  requests                   people asking to join your tiers
  grant <tier> <who>         let them in, or renew            [--months 1]
  decline <tier> <who>       turn a request down
  memberships                tiers you support

badges: lasting recognition from a project, signed and checkable by anyone, never votes or access:
  badge create <name> -p <project>   start a kind of badge (maintainers)  [--symbol 🏅] [--image <png/jpg>] [--text <description>]
                             [--limit 20: how many there can ever be, never raised later]
  badge list [-p <project>]  badge series (default: every one this node knows)
  badge set <series>         change it                        [--name] [--symbol] [--image <file>, "" removes it] [--text]
  badge give <series> <who>  give them the next free number   [--text <what for>] [--ref <post id>] [--personal <a note only they read>]
  badge publish <badge>      make the personal note on a badge you were given public; --off to take it back
  badge pass <badge> <who>   pass a badge you hold on, e.g. to your other account; it keeps its number
  badges [who]               the badges someone holds (default: yours)

treasuries: a project's own wallet (a Safe its maintainers own) and how its income is split; Weave holds no keys or money:
  wallet message <address>   what your wallet signs (personal_sign) to show it's yours
  wallet link <address> --proof <signature>   link your wallet; only linked wallets own treasuries
  wallet unlink              unlink it
  wallet [who]               someone's linked wallet (default: yours)
  treasury -p <project>      the project's treasury: its address, owners, split and who it pays  [-r <community> instead]
  treasury announce -p <project>  announce it publicly, so others can pay it and name it in their splits  [-r <community>]
  treasury deploy -p <project>    the transaction that puts the Safe on chain; any wallet can send it
  treasury sweep -p <project>     move what's left on its retired treasuries (after wallets changed) to the treasury now
  treasury split -p <project>     the project's split contract: its address, whether it exists, how to deploy it
  show create <name> --starts <time> --ends <time> --usdc 3   a ticketed show (you host it): tickets go into its own Safe
                             [-p <project>] [--room <id>] [--capacity 50] [--hosts <who>,<who>]
                             [--split Lena=6000,project=4000: basis points, to people, the project's treasury or addresses]
  shows [-p <project>]       shows this node knows: when, price, your ticket
  ticket <show> --payment <tx hash>   ask for a ticket you paid from your linked wallet
  tickets <show>             for the host: every ticket sold, and requests not let in
  show cancel <show>         call it off: tickets stop letting people in
  show settle <show> payout|refund [--split Lena=6000,project=4000] [--file batch.json]   the Safe transaction that pays out (by the split, or one decided now) or back
  safe proposals [address]   transactions waiting for a Safe's owners (treasuries, shows' Safes)
  safe show <proposal> [--file typed.json]   what to sign: the hash, and the typed data for your wallet
  safe sign <proposal> --signature <0x…>     add your wallet's signature (typed data, or the hash signed as a message)
  label <address> endorse|block --text <why>   your label on an address or contract; "" withdraws it
  labels [address]           labels this node knows                     [--from <who>,<who>]
  split <preset> -p <project>  how income is split (maintainers): standard, community, solo or free  [-r <community>]
                             [--shares makers=7000,treasury=1500,community=1400,foundation=100: your own, in basis points]
                             a changed split counts after 7 days; the Weave Foundation's part is a suggestion, 0 is fine

artifacts and rooms: a project's releases, and rooms that run them (needs a running daemon):
  app publish -p <project>   maintainers: publish the project's artifact description from weave.app.json  [--file <path>]
  app show -p <project>      what it describes: its web page's port, how it starts, its settings
  app check [file]           check a weave.app.json (default: here), every problem at once
  app example                an annotated weave.app.json and its rules
  app workflow <app> <entry> a GitHub Actions workflow that builds standalone programs and releases them on each version tag
  app release <tag> -p <p>   point the app at a GitHub release (maintainers): reads weave.app.json at the tag, fingerprints each file
                             [--repo owner/name] [--asset win32-x64=<file> …] when names don't say the platform
  rooms [-p <project>]       open rooms
  room open <name> -p <p>    a room of your room service, answered by: --artifact <project>[@tag] (a release, fetched and
                             checked), --run "<command>" --folder <dir> --port <n>, or just --port <n> (already running)
                             [--setting KEY=VALUE] [--service <room service>]; running code asks you to approve it
                             [--invite a,b: only these people] [--show <show>: only its ticket holders, while it's on] [--tiers <tier>,…: members of these tiers]
  room env <room>            WEAVE_API and the room's token, for what answers it when it runs by itself (@weave/sdk reads them)
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
  unsay <id>                 take a message down: yours, or any where you moderate (it stays in the logs)
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
    out: { type: 'string' },
    open: { type: 'boolean', default: false },
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
    'send-invites': { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
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
    reads: { type: 'string' },
    writes: { type: 'string' },
    'offers-website': { type: 'boolean', default: false },
    'contract-version': { type: 'string' },
    run: { type: 'string' },
    spaces: { type: 'string' },
    setting: { type: 'string', multiple: true },
    node: { type: 'string' },
    artifact: { type: 'string' },
    update: { type: 'string' },
    builtin: { type: 'string' },
    folder: { type: 'string' },
    port: { type: 'string' },
    service: { type: 'string' },
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
    'gumroad-token': { type: 'string' },
    license: { type: 'string' },
    usdc: { type: 'string' },
    show: { type: 'string' },
    tiers: { type: 'string' },
    signature: { type: 'string' },
    starts: { type: 'string' },
    ends: { type: 'string' },
    capacity: { type: 'string' },
    hosts: { type: 'string' },
    split: { type: 'string' },
    room: { type: 'string' },
    'pay-to': { type: 'string' },
    payment: { type: 'string' },
    months: { type: 'string' },
    limit: { type: 'string' },
    proof: { type: 'string' },
    shares: { type: 'string' },
    symbol: { type: 'string' },
    ref: { type: 'string' },
    personal: { type: 'string' },
    access: { type: 'string' },
    writers: { type: 'string' },
    name: { type: 'string' },
    'id-token': { type: 'string' },
    'client-id': { type: 'string' },
    secret: { type: 'string' },
    url: { type: 'string' },
    token: { type: 'string' },
    tenant: { type: 'string' },
    issuer: { type: 'string' },
    audience: { type: 'string' },
    admins: { type: 'string' },
    for: { type: 'string' },
    days: { type: 'string' },
    in: { type: 'string' },
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
/** A release build of this command, or the source (development). */
const BUILD: 'release' | 'dev' = typeof WEAVE_VERSION === 'string' ? 'release' : 'dev';

async function backend(options: { needsDaemon?: boolean } = {}): Promise<Backend> {
  const daemon = await connectDaemon(home);
  if (daemon) {
    // A released command talking to a released daemon of another version: say so (never in development, never acted on).
    const info = daemonInfo(home);
    if (BUILD === 'release' && info?.build === 'release' && info.version && info.version !== VERSION) console.error(`weave: note: the running daemon is Weave ${info.version}, this is ${VERSION} (weave daemon restart)`);
    return daemon as unknown as Backend;
  }
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
const contractLine = (c: ServiceContract) =>
  `reads ${c.reads === 'addressed' ? 'requests to it' : c.reads === 'space' ? 'its whole spaces' : `requests and ${c.reads.kinds.join(', ')}`}; writes ${c.writes.length ? c.writes.join(', ') : 'only its answers'}${c.website ? '; offers a room' : ''}; contract ${c.version}`;

const badgeSeriesLine = (s: BadgeSeriesInfo) => {
  const name = `${s.symbol ? `${s.symbol} ` : ''}${s.name}`;
  const count = s.limit ? `${s.given} of ${s.limit}` : `${s.given} given`;
  const broken = s.broken ? '  BROKEN: more than the limit, or a number twice' : '';
  const where = `${s.project ? `  — ${s.project.name}${s.project.checked === false ? ' (says so; not checked: you are not in it)' : ''}` : ''}${s.mine ? '' : `, by ${s.issuer.name ?? s.issuer.did}`}`;
  return [`${name.padEnd(24)} ${count}${broken}${where}`, `  ${s.id}`, ...(s.description ? [`  ${s.description}`] : [])].join('\n');
};

const percent = (bp: number) => `${(bp / 100).toFixed(bp % 100 ? 2 : 0)}%`;
const walletLine = (w: WalletInfo) => `${w.owner.name ?? w.owner.did}: ${w.address}${w.verified ? '' : '  (not verified: the signature does not match)'}`;
const splitLine = (s: SplitInfo, community?: string) =>
  `${s.preset}: makers ${percent(s.shares.makers)} · treasury ${percent(s.shares.treasury)} · community ${percent(s.shares.community)}${s.shares.community && !community ? ' (no community named: goes to the treasury)' : ''} · Weave Foundation ${percent(s.shares.foundation)}` +
  (s.makers.length ? `\n    makers:${s.makers.map((m) => `${m.person.name ?? m.person.did} ${percent(m.share)}`).join(', ')}` : '');
const treasuryLine = (t: TreasuryInfo) =>
  [
    `${t.project.name} treasury on ${t.chain.name} (test network, no real money)`,
    t.address ? `  address: ${t.address}  (a Safe: ${t.threshold} of ${t.owners.length} must sign)\n  ${t.chain.explorer}/address/${t.address}` : '  no address yet: a maintainer has to link a wallet first (weave wallet link)',
    ...t.owners.map((o) => `  owner: ${o.person.name ?? o.person.did} ${o.address}`),
    ...t.missing.map((p) => `  not an owner yet (no linked wallet): ${p.name ?? p.did}`),
    t.split ? `  split ${splitLine(t.split, t.split.community)}` : '  no split yet (weave split <preset>)',
    ...(t.pending ? [`  from ${t.pending.from.slice(0, 10)}: ${splitLine(t.pending, t.pending.community)}`] : []),
    ...(t.recipients?.length ? ['  pays:', ...t.recipients.map((r) => `    ${percent(r.share / 100)} ${r.name ?? (r.id || r.kind)} (${r.part})${r.address ? ` ${r.address}` : ' (no address yet: stays with a maker on chain)'}`)] : []),
    ...(t.address && !t.announced ? ['  not announced yet: weave treasury announce'] : []),
    ...t.retired.map((r) => `  retired: ${r.address}${r.successor ? ` (now ${r.successor})` : ''}: weave treasury sweep moves what's left there`),
  ].join('\n');
const showLine = (sh: ShowInfo) => {
  const when = `${new Date(sh.starts).toLocaleString()} – ${new Date(sh.ends).toLocaleTimeString()}`;
  const state = sh.cancelled ? 'CALLED OFF' : sh.open ? 'on now' : when;
  const seats = sh.capacity ? ` · ${sh.sold ?? '?'}/${sh.capacity} sold` : sh.sold !== undefined ? ` · ${sh.sold} sold` : '';
  return [
    `${sh.name}  ${formatUnits(sh.price.amount, sh.price.decimals)} ${sh.price.symbol}  ${state}${seats}${sh.mine ? '' : `  — ${sh.host.name ?? sh.host.did}`}`,
    `  ${sh.id}${sh.project ? ` · ${sh.project.name ?? sh.project.id}` : ''}${sh.room ? ` · room ${sh.room}` : ''}`,
    `  Safe ${sh.safe.address} (${sh.safe.threshold} of ${sh.hosts.length} hosts sign): tickets are paid there`,
    `  after it: ${sh.split.map((p) => `${(p.share / 100).toFixed(p.share % 100 ? 2 : 0)}% ${p.name ?? p.to}${p.address ? '' : ' (no address yet)'}`).join(', ')}`,
    ...(sh.ticket ? [`  your ticket: ${sh.ticket.tx.slice(0, 12)}…`] : sh.mine || sh.cancelled ? [] : [`  pay ${formatUnits(sh.price.amount, sh.price.decimals)} ${sh.price.symbol} to the Safe from your linked wallet, then: weave ticket ${sh.id} --payment <tx hash>`]),
  ].join('\n');
};
const safeProposalLine = (pr: SafeProposalInfo) =>
  [
    `${pr.title || '(untitled)'}  ${pr.signed.length}/${pr.safe.threshold} signed${pr.exec ? ' — ready' : ''}`,
    `  ${pr.id} · ${pr.safe.label} ${pr.safe.address} · nonce ${pr.tx.nonce}`,
    `  hash ${pr.hash}`,
    ...(pr.signed.length ? [`  signed: ${pr.signed.map((x) => x.person.name ?? x.person.did).join(', ')}`] : []),
    ...(pr.waiting.length ? [`  waiting for: ${pr.waiting.map((x) => x.name ?? x.did).join(', ')}`] : []),
    ...(pr.exec ? [`  send from any wallet to run it:`, `    to:   ${pr.exec.to}`, `    data: ${pr.exec.data}`] : pr.mine && !pr.signedByMe ? [`  sign: weave safe show ${pr.id} --file typed.json, sign it in your wallet, then weave safe sign ${pr.id} --signature <0x…>`] : []),
  ].join('\n');
const labelLine = (l: LabelInfo) => `${l.label === 'block' ? 'BLOCK  ' : l.label === 'retired' ? 'RETIRED' : 'endorse'} ${l.target} by ${l.by.name ?? l.by.did}${l.reason ? `: ${l.reason}` : ''}`;

const badgeLine = (b: BadgeInfo) => {
  const name = `${b.series.symbol ? `${b.series.symbol} ` : ''}${b.series.name} #${b.n}${b.series.limit ? ` of ${b.series.limit}` : ''}`;
  const problem = b.invalid ? `  NOT VALID (${b.invalid === 'duplicate' ? 'its number was given twice' : 'over the limit'})` : b.contested ? '  contested: passed on twice' : '';
  return [
    `${name}${b.series.project ? `  — ${b.series.project.name}${b.series.project.checked === false ? ' (not checked)' : ''}` : ''}, from ${b.issuer.name ?? b.issuer.did}${problem}`,
    `  ${b.id}`,
    ...(b.note ? [`  "${b.note}"`] : []),
    ...(b.ref ? [`  for ${b.ref}`] : []),
    ...(b.personal ? [b.personal.text !== undefined ? `  personal note${b.personal.published ? ' (public)' : ' (private)'}: "${b.personal.text}"` : '  a personal note, sealed'] : []),
    ...(b.holders.length > 1 ? [`  held by ${b.holders.map((h) => h.name ?? h.did).join(' → ')}`] : []),
  ].join('\n');
};

const tierLine = (t: TierInfo) => {
  const state = t.mine ? `${t.members ?? 0} member${t.members === 1 ? '' : 's'}${t.open ? '' : ', closed'}` : t.membership ? (t.membership.active ? `member until ${new Date(t.membership.until).toLocaleDateString()}` : 'membership ended') : t.requested ? 'asked to join' : t.open ? 'open' : 'closed';
  const gumroad = t.gumroad ? `\n  sold on Gumroad: ${t.gumroad.url}${t.gumroad.variant ? ` (${t.gumroad.variant})` : ''}${t.mine ? '' : ` — then: weave support ${t.id} --license <key>`}` : '';
  const onchain = t.onchain ? `\n  paid on chain: ${formatUnits(t.onchain.amount, t.onchain.decimals)} ${t.onchain.symbol} a month to ${t.onchain.to}${t.mine ? '' : ` — pay from your linked wallet, then: weave support ${t.id} --payment <tx hash>`}` : '';
  return `${t.name.padEnd(20)} ${money(t.price, t.currency).padEnd(18)} ${state}${t.mine ? '' : `  — ${t.creator.name ?? t.creator.did}`}\n${t.description ? `  ${t.description}\n` : ''}${t.benefits.map((b) => `  · ${b}`).join('\n')}${gumroad}${onchain}`;
};

/** --usdc and --pay-to as a tier's onchain price: undefined leaves it, null (--usdc off) removes it. */
async function onchainPrice(b: Backend): Promise<TierInfo['onchain'] | null | undefined> {
  if (values.usdc === undefined) return undefined;
  if (values.usdc === 'off') return null;
  const amount = parseUnits(values.usdc, TEST_USDC.decimals);
  if (!amount) throw new Error('--usdc is an amount per month, like 5 or 2.50');
  const payTo = values['pay-to'];
  let to: string | undefined;
  if (payTo && isAddress(payTo)) to = payTo;
  else if (payTo) to = (await b.splitContract(payTo)).address;
  else to = (await b.wallet())?.address;
  if (!to) throw new Error('where do payments go? link your wallet (weave wallet link), or add --pay-to <address | project>');
  return { chain: TEST_USDC.chain, token: TEST_USDC.token, symbol: TEST_USDC.symbol, decimals: TEST_USDC.decimals, to, amount };
}

/** --gumroad options as a tier's Gumroad link: undefined leaves it (and for "new"), null removes it. */
function gumroadLink(): TierInfo['gumroad'] | null {
  if (values.gumroad === undefined || values.gumroad === 'new') return undefined;
  if (values.gumroad === 'off') return null;
  if (!values['gumroad-product']) throw new Error('add the product id: --gumroad-product <id> (from the product in Gumroad)');
  return { url: values.gumroad, product: values['gumroad-product'], ...(values['gumroad-variant'] ? { variant: values['gumroad-variant'] } : {}) };
}

/**
 * For --gumroad new: an access token given (--gumroad-token, or GUMROAD_ACCESS_TOKEN to keep it out of the
 * shell history), or none to go through the Gumroad connection. Checked before the tier is made.
 */
async function gumroadToken(b: Backend): Promise<string | undefined> {
  const token = values['gumroad-token'] ?? process.env.GUMROAD_ACCESS_TOKEN;
  if (token) return token;
  const g = await b.gumroad();
  if (g.account) return undefined;
  throw new Error(
    g.available
      ? '--gumroad new needs Gumroad connected: weave gumroad connect'
      : '--gumroad new needs a Gumroad access token: set GUMROAD_ACCESS_TOKEN (or --gumroad-token).\n  Gumroad → Settings → Advanced → Applications: create an application, then "Generate access token".',
  );
}

/** --gumroad new: make the membership on Gumroad for the tier, publish it and link the tier to it. */
async function sellOnGumroad(b: Backend, t: TierInfo, token: string | undefined): Promise<{ tier: TierInfo; note: string }> {
  try {
    const sold = await b.sellTierOnGumroad({ tier: t.id, token });
    return { tier: sold.tier, note: sold.published ? `on sale on Gumroad: ${sold.tier.gumroad?.url}` : `made on Gumroad, not published yet: ${sold.warning}` };
  } catch (e) {
    throw new Error(`${(e as Error).message}\n  the tier is there; try again with: weave tier set ${t.id} --gumroad new`);
  }
}
/** "5" or "5.50" (in the currency's main unit) → cents. */
const cents = (value?: string) => (value === undefined ? undefined : Math.round(Number(value.replace(',', '.')) * 100));
const benefits = (value?: string) => value?.split(',').map((b) => b.trim()).filter(Boolean);

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

/** Running someone's code (a release, a command): Weave says what would run, and the person approves it here. */
async function approving<T>(run: (approve: boolean) => Promise<T>): Promise<T> {
  try {
    return await run(false);
  } catch (error) {
    const message = (error as Error).message;
    if (!message.startsWith('approve it first:')) throw error;
    const answer = await askLine(`${message.slice('approve it first: '.length)}.\nRun it? [y/N] `);
    if (!/^y(es)?$/i.test(answer.trim())) throw new Error('not approved: nothing runs');
    return run(true);
  }
}

/** How a room of the room service is doing. */
const hostedLine = (r: HostedWebsiteInfo): string => {
  const h = r.handler;
  const what = h.kind === 'artifact' ? `${h.artifact.name} ${h.artifact.tag}${h.artifact.latest ? ` (${h.artifact.latest} is out)` : ''}` : h.kind === 'command' ? h.command.join(' ') : `port ${r.port}`;
  const state = r.progress ? `fetching (${Math.round((r.progress.done / (r.progress.total || 1)) * 100)}%)` : r.error ? r.error : r.running ? 'running' : 'starting';
  return `${what}, ${state}`;
};

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

/**
 * The contacts and free tiers a new identity starts with: a company's own, placed
 * on the machine by its IT (WEAVE_BUNDLE, or weave.bundle.json in the machine's
 * Weave folder, which updates don't touch), else the one this copy of Weave
 * ships with (next to the packaged program, or at the repository root).
 */
function readBundle(): Bundle | undefined {
  const machine =
    process.platform === 'win32'
      ? join(process.env.ProgramData ?? 'C:\\ProgramData', 'Weave', 'weave.bundle.json')
      : process.platform === 'darwin'
        ? '/Library/Application Support/Weave/weave.bundle.json'
        : '/etc/weave/weave.bundle.json';
  const file = [process.env.WEAVE_BUNDLE, machine, join(import.meta.dirname, 'weave.bundle.json'), join(import.meta.dirname, '..', '..', '..', 'weave.bundle.json')].find((f): f is string => !!f && existsSync(f));
  return file ? (JSON.parse(readFileSync(file, 'utf8')) as Bundle) : undefined;
}

const roomLine = (r: WebsiteInfo) => {
  const who = r.mine ? 'you host it' : `hosted by ${r.host.name ?? r.host.did}`;
  const state = r.joined ? (r.connected ? `${r.peers.length} in it` : 'connecting…') : r.mayJoin ? 'join with: weave room join ' + r.id.slice(0, 8) : 'not invited';
  return `${r.id.slice(0, 8)}  ${r.name}  · p/${r.project.name} · ${who} · ${state}${r.url ? `\n          ${r.service?.label ?? 'open'}: ${r.url}` : ''}`;
};

const linkLines = (links: LinkInfo[]) =>
  links.length
    ? links
        .map((l) => {
          const state = { linked: 'linked', waiting: 'waiting for them', asked: 'they say so; link back to confirm', refused: "a company doesn't allow it" }[l.state];
          return `${(l.name ?? l.did).padEnd(24)} ${state}${l.company ? ` · ${l.company.name ?? 'company'} account` : ''}${l.space ? ` · in ${l.space}` : ''} · since ${l.since.slice(0, 10)}${l.until ? ` until ${l.until.slice(0, 10)}` : ''}`;
        })
        .join('\n')
    : 'no links';

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

/** A key service, as the command line names it (stage 16: AWS KMS and Google Cloud KMS too). */
const PROVIDER_USAGE = [
  'vault <address> <transit key> [jwt role]',
  'azure <key vault url> <key> <tenant> <client id>',
  'aws <region> <key arn|alias/…> <role arn people take on>',
  'gcp <projects/…/cryptoKeys/…> <projects/…/workloadIdentityPools/…/providers/…>',
].join('\n     | ');

function providerArgs(args: string[]): CreateCompanyInput['provider'] | undefined {
  const [kind, a, b, c, d] = args;
  if (kind === 'vault' && a && b) return { kind, address: a, key: b, ...(c ? { jwt: { role: c } } : {}) };
  if (kind === 'azure' && a && b) return { kind, vault: a, key: b, ...(c ? { tenant: c } : {}), ...(d ? { clientId: d } : {}) };
  if (kind === 'aws' && a && b) return { kind, region: a, key: b, ...(c ? { role: c } : {}) };
  if (kind === 'gcp' && a) return { kind, key: a, ...(b ? { workload: b } : {}) };
  return undefined;
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
      if (args[0] === 'stop') {
        const stopped = await stopDaemon(home, { force: !!values.force });
        return out({ stopped }, () => (stopped ? `stopped the daemon for ${home.dir}` : `no daemon running for ${home.dir}`));
      }
      if (args[0] === 'restart') {
        const before = daemonInfo(home);
        await stopDaemon(home, { force: !!values.force });
        // The same program, detached: it outlives this command. Who started it stays as it was.
        spawn(process.execPath, [...process.execArgv, process.argv[1], '--home', home.dir, 'daemon'], {
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
          env: { ...process.env, WEAVE_DAEMON_STARTED_BY: before?.startedBy ?? 'cli' },
        }).unref();
        const started = Date.now();
        while (Date.now() - started < 30_000) {
          if (await connectDaemon(home)) {
            const info = daemonInfo(home);
            return out(info ?? {}, () => `restarted the daemon for ${home.dir} (pid ${info?.pid}, Weave ${info?.version ?? VERSION})`);
          }
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        throw new Error('the daemon did not come back within 30 seconds (start it with weave daemon to see why)');
      }
      if (args[0]) throw new Error('usage: weave daemon [stop|restart] [--force]');
      // A stop asked for while it's still starting (its API is up first) is kept, and done once it can be.
      let stopAsked = false;
      let shutdown = async () => void (stopAsked = true);
      const daemon = await startDaemon(home.dir, { version: VERSION, build: BUILD, startedBy: process.env.WEAVE_DAEMON_STARTED_BY === 'app' ? 'app' : 'cli', onStopRequest: () => void shutdown() });
      const status = await daemon.node.status();
      console.log(`weave daemon for ${status.name ?? status.did}`);
      console.log(`  home ${home.dir}\n  api  http://127.0.0.1:${daemon.port}\n  ${status.groups} groups, ${status.projects} projects, ${status.communities} communities`);
      daemon.node.replica.onAppend((event) => {
        if (event.signer === daemon.node.identity.did) return;
        const item = daemon.node.itemFor(event);
        if (item && CONTENT_KINDS.includes(item.kind)) console.log(line(item));
      });
      shutdown = async () => {
        await daemon.stop();
        process.exit(0);
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
      if (stopAsked) void shutdown();
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
          ...(s.heldBack ? [`  ${s.heldBack} events held back: their authors were over their budget`] : []),
          `  keys protected by ${KEYSTORE_NAMES[s.keystore]}`,
          ...(s.keystoreWarning ? [`  warning: ${s.keystoreWarning}`] : []),
        ].join('\n'),
      );
    }

    case 'node': {
      const [sub, value] = args;
      if (sub === 'pair') {
        const request = WeaveNode.nodeRequest(home.dir, value ?? hostname());
        return out({ request }, () => `On one of your computers, run (or paste it in Weave: Keys & devices → Always-on nodes):\n  weave node add ${request}\nThen here: weave node join <answer>`);
      }
      if (sub === 'add') {
        if (!value) throw new Error('usage: weave node add <request from the node>');
        const linked = await (await backend()).linkNode({ request: value });
        return out(linked, () => `Linked the always-on node "${linked.name}". On the node, run:\n  weave node join ${linked.answer}\nIt can keep your spaces and host your rooms, nothing else. Revoke it any time: weave revoke node:${linked.name}`);
      }
      if (sub === 'join') {
        if (!value) throw new Error('usage: weave node join <answer from your computer>');
        const node = await WeaveNode.completeNodeLink(value, home.dir);
        const spaces = await node.spaces();
        await node.close();
        return out({ spaces: spaces.length }, () => `This is now ${node.nameOf(node.identity.author) ?? 'your'} always-on node, with ${spaces.length} spaces to keep. Start it: weave daemon`);
      }
      throw new Error('usage: weave node pair [name] | node add <request> | node join <answer>');
    }

    case 'keystore': {
      const b = await backend();
      const to = args[0];
      if (!to) {
        const all = await b.keystores();
        return out(all, () =>
          [
            ...all.map((k) => `${k.current ? '*' : ' '} ${k.keystore.padEnd(15)} ${k.name}${k.ready ? '' : `  (not here: ${k.why})`}`),
            '',
            'weave keystore <name> moves the key there. Hardware keeps it on this computer or key only: lose it, and you set Weave up again from your recovery words (or your company does).',
          ].join('\n'),
        );
      }
      if (!['os', 'tpm', 'secure-enclave', 'yubikey', 'file', 'dpapi', 'keychain', 'secret-service'].includes(to)) throw new Error('usage: weave keystore [os|tpm|secure-enclave|yubikey|file]');
      const moved = await b.moveHomeKey({ to: to as 'os' });
      return out(moved, () => (moved.from === moved.to ? `the key is kept by ${KEYSTORE_NAMES[moved.to]} already` : `the key to your keys is now kept by ${KEYSTORE_NAMES[moved.to]} (was ${KEYSTORE_NAMES[moved.from]})`));
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

    case 'claude-bundle': {
      // How Claude starts Weave here: this very program (node with the CLI, or the app's
      // own Node with its bundled CLI), for this home.
      const agent = values.as ?? 'claude';
      const known = (await (await backend()).whoami()).agents.map((a) => a.name);
      if (!known.includes(agent)) throw new Error(`no agent "${agent}" here${known.length ? ` (you have ${known.join(', ')})` : ''}: add one with weave agent add ${agent}`);
      const launch = {
        command: process.execPath,
        args: [resolvePath(process.argv[1]), ...(values.home || process.env.WEAVE_HOME ? ['--home', home.dir] : [])],
        env: (process.versions.electron || process.env.ELECTRON_RUN_AS_NODE ? { ELECTRON_RUN_AS_NODE: '1' } : {}) as Record<string, string>,
      };
      const iconFile = [join(dirname(process.argv[1]), '..', 'icon.png'), join(dirname(process.argv[1]), '..', '..', '..', 'apps', 'desktop', 'assets', 'icon.png')].find((f) => existsSync(f));
      const file = resolvePath(process.env.INIT_CWD ?? process.cwd(), values.out ?? 'weave.mcpb');
      writeFileSync(file, claudeBundle({ agent, launch, version: VERSION, ...(iconFile ? { icon: readFileSync(iconFile) } : {}) }));
      if (values.open) {
        const { spawn } = await import('node:child_process');
        const [command, ...rest] = process.platform === 'win32' ? ['cmd', '/c', 'start', '""', `"${file}"`] : [process.platform === 'darwin' ? 'open' : 'xdg-open', file];
        spawn(command, rest, { detached: true, stdio: 'ignore', windowsVerbatimArguments: process.platform === 'win32' }).unref();
      }
      return out({ file, agent, launch }, () => `wrote ${file}\n  Claude's chat will use Weave as your agent "${agent}". Open the file to install it in the Claude app (Settings → Extensions).`);
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

    case 'gumroad': {
      const [sub] = args;
      const b = await backend();
      const status = (g: GumroadInfo) =>
        g.account ? `Gumroad connected: ${g.account}` : g.available ? 'Gumroad not connected (weave gumroad connect)' : "this copy of Weave can't connect Gumroad (no Gumroad application client ID); use GUMROAD_ACCESS_TOKEN";
      if (!sub) {
        const g = await b.gumroad();
        return out(g, () => status(g));
      }
      if (sub === 'connect') {
        const started = await b.connectGumroad();
        console.error(`Allow Weave on Gumroad in your browser; if it didn't open:\n  ${started.pending!.url}`);
        openInBrowser(started.pending!.url);
        for (;;) {
          await new Promise((r) => setTimeout(r, 1500));
          const g = await b.gumroad();
          if (g.error) throw new Error(g.error);
          if (!g.pending && g.account) return out(g, () => status(g));
        }
      }
      if (sub === 'disconnect') {
        const g = await b.disconnectGumroad();
        return out(g, () => 'Gumroad connection forgotten on this device');
      }
      throw new Error('usage: weave gumroad [connect|disconnect]');
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

    case 'service': {
      const [sub, ref] = args;
      const b = await backend();
      const where = (spaces: SpaceRef[]) => (spaces.length ? spaces.map((s) => s.name).join(', ') : 'no spaces yet');
      const line = (s: ServiceInfo) =>
        [
          `${s.name}  ${s.node ? `on ${s.node.name}${s.enabled ? '' : ', stopped'}` : s.enabled ? (s.builtin ? 'on' : s.running ? 'running' : s.command ? 'starting' : 'no command: something else uses its token') : 'stopped'}  in ${where(s.spaces)}`,
          `  ${s.did}`,
          ...(s.description ? [`  ${s.description}`] : []),
          `  ${contractLine(s.contract)}`,
          ...(s.websites ?? []).map((r) => `  website "${r.name}" in ${r.project.name}: ${hostedLine(r)}`),
          ...(s.artifact ? [`  applet: ${s.artifact.name} ${s.artifact.tag} from ${s.artifact.project.name ?? s.artifact.project.id}${s.artifact.latest ? ` (${s.artifact.latest} is out: weave service set ${s.name} --update latest)` : ''}${s.artifact.progress ? ', fetching' : ''}`] : []),
          ...(s.artifact?.error ? [`  ${s.artifact.error}`] : []),
          ...(s.command ? [`  runs: ${s.command.join(' ')}`] : []),
          ...(s.settings.length ? [`  settings: ${s.settings.join(', ')}`] : []),
          ...s.spaces.filter((x) => x.settings?.length).map((x) => `  settings in ${x.name}: ${x.settings!.join(', ')}`),
        ].join('\n');
      const words = (text: string) => [...text.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
      const list = (text?: string) => text?.split(',').map((x) => x.trim()).filter(Boolean);
      const settingsOf = () =>
        Object.fromEntries((values.setting ?? []).map((s) => {
          const at = s.indexOf('=');
          if (at < 1) throw new Error('a setting is KEY=VALUE (KEY= removes it)');
          return [s.slice(0, at), s.slice(at + 1) || null];
        }));
      if (sub === 'artifacts') {
        const all = await b.artifacts(ref ?? needSpace());
        return out(all, () => all.map((a) => `${a.name} ${a.tag}  released ${a.time.slice(0, 10)} by ${a.released.name ?? a.released.did}${a.applet ? `  (an applet: a service that ${contractWords(a.applet)})` : a.website ? '  (an app: a room runs it)' : ''}\n  ${a.runs ? `runs here as its ${a.runs === 'container' ? 'container' : 'release build'}` : 'nothing for this computer'}${a.settings.length ? `\n  settings: ${a.settings.map((e) => `${e.name}${e.optional ? ' (optional)' : ''}`).join(', ')}` : ''}`).join('\n\n') || '(no releases yet)');
      }
      if (sub === 'add' && values.artifact) {
        const at = values.artifact.lastIndexOf('@');
        const artifact = at > 0 ? { project: values.artifact.slice(0, at), tag: values.artifact.slice(at + 1) } : { project: values.artifact };
        const settings = Object.fromEntries(Object.entries(settingsOf()).filter(([, v]) => v !== null)) as Record<string, string>;
        const s = await approving((approve) => b.addService({ ...(ref ? { name: ref } : {}), ...(values.text ? { description: values.text } : {}), artifact, approve, spaces: list(values.spaces), settings, ...(values.node ? { node: values.node } : {}) }));
        return out(s, () => `${line(s)}\n\nIt signs as you · ${s.name}, with exactly its contract's rights.${s.node ? ` It went to ${s.node.name}, sealed: the node fetches the release and starts it.` : ' It starts once its release is fetched and checked.'}`);
      }
      if (sub === 'add' && values.builtin) {
        if (values.builtin !== 'room') throw new Error('Weave ships one service so far: --builtin room');
        const s = await b.addService({ ...(ref ? { name: ref } : {}), builtin: 'website', ...(values.text ? { description: values.text } : {}), spaces: list(values.spaces) });
        return out(s, () => `${line(s)}\n\nIt signs rooms as you · ${s.name}. Open one: weave room open <name> -p <project> --artifact <project>`);
      }
      if (sub === 'add' && ref) {
        const reads: ServiceContract['reads'] = values.reads === 'addressed' || values.reads === 'space' ? values.reads : values.reads ? { kinds: list(values.reads)! } : 'addressed';
        const contract = { reads, writes: list(values.writes) ?? [], ...(values['offers-website'] ? { website: true } : {}), version: values['contract-version'] ?? '1.0' };
        const s = await b.addService({ name: ref, description: values.text, contract, spaces: list(values.spaces), ...(values.run ? { command: words(values.run) } : {}), ...(values.node ? { node: values.node } : {}) });
        return out(s, () => `${line(s)}\n\nIt signs as you · ${s.name}, with these rights only.${s.node ? ` Its key went to ${s.node.name}, sealed for that node: it starts there once the node has it.` : s.command ? '' : ' Give it a command with --run, or let a process use its token.'}`);
      }
      if (sub === 'list') {
        const all = await b.services();
        return out(all, () => all.map(line).join('\n\n') || '(no services on this computer)');
      }
      if (sub === 'profiles') {
        const all = await b.serviceProfiles();
        return out(all, () => all.map((p) => `${p.person.name ?? p.person.did} · ${p.name}  ${p.description}\n  ${p.did}\n  ${contractLine(p.contract)}`).join('\n\n') || '(no services known)');
      }
      if (sub === 'set' && ref) {
        const settings = settingsOf();
        const given = Object.keys(settings).length ? (values.in ? { spaceSettings: { [values.in]: settings } } : { settings }) : {};
        const update = values.update !== undefined ? { artifact: values.update && values.update !== 'latest' ? { tag: values.update } : {} } : {};
        const s = await approving((approve) =>
          b.setService({ name: ref, ...(values.spaces !== undefined ? { spaces: list(values.spaces) ?? [] } : {}), ...(values.run !== undefined ? { command: values.run ? words(values.run) : null } : {}), ...given, ...update, ...(values.update !== undefined ? { approve } : {}), ...(values.text !== undefined ? { description: values.text } : {}) }),
        );
        return out(s, () => line(s));
      }
      if ((sub === 'start' || sub === 'stop') && ref) {
        const s = await b.setService({ name: ref, enabled: sub === 'start' });
        return out(s, () => line(s));
      }
      if (sub === 'remove' && ref) {
        await b.removeService(ref);
        return out({ removed: ref }, () => `removed ${ref}: its key is revoked, nothing it signs counts any more`);
      }
      if (sub === 'ask' && ref && args.length > 2) {
        const r = await b.askService({ space: needSpace(), service: ref, text: args.slice(2).join(' '), as: values.as });
        return out(r, () => `asked ${r.to.name ?? r.to.did}: ${r.text}\n  ${r.id}`);
      }
      if (sub === 'requests') {
        const all = await b.serviceRequests({ space: needSpace(), ...(ref ? { service: ref } : {}) });
        return out(all, () => all.map((r) => `${r.from.name ?? r.from.did} → ${r.to.name ?? r.to.did}: ${r.text}\n${r.results.map((x) => `  ${x.error ? `error: ${x.error}` : x.text || JSON.stringify(x.data)}`).join('\n') || '  (no answer yet)'}`).join('\n\n') || '(no requests)');
      }
      throw new Error('usage: weave service add|artifacts|list|profiles|set|start|stop|remove|ask|requests — see "weave --help"');
    }

    case 'repo': {
      const [sub, ref, repo] = args;
      const b = await backend();
      const show = (r: SpaceRepos) =>
        [
          ...r.repos.map((x) => `${x.repo}${x.board ? ` (readers of ${x.board})` : ''}${x.access === 'none' ? ' (linked only)' : x.access === 'write' ? ` (can write: ${(x.writers ?? []).map(actor).join(', ')})` : ''}  linked by ${actor(x.by)}${x.problem ? `  — ${x.problem}` : ''}`),
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
        const access = values.access as RepoAccess | undefined;
        const writers = values.writers?.split(',').map((w) => w.trim()).filter(Boolean);
        const r = await b.linkRepo({ space: ref, repo, board: values.board, ...(access ? { access } : {}), ...(writers ? { writers } : {}), on: sub === 'link' });
        return out(r, () => show(r));
      }
      throw new Error('usage: weave repo list <space> | repo link <space> <owner/name> [-b <board>] [--access none|write --writers <who,…>] | repo unlink <space> <owner/name>');
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
          `  link: ${p.url}`,
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

    case 'manage': {
      const [space, ...rest] = args;
      const provider = space ? providerArgs(rest) : undefined;
      if (!space || !provider) throw new Error(`usage: weave manage <space> ${PROVIDER_USAGE}   (the owner; weave sso to sign in)`);
      const s = await (await backend()).manageSpace({ space, provider });
      return out(s, () => `${s.name}: from now on half of every key is held by ${s.managed?.provider}`);
    }

    case 'unlock': {
      if (!args[0]) throw new Error('usage: weave unlock <space>');
      const s = await (await backend()).unlockSpace(args[0]);
      return out(s, () => `${s.name}: ${s.managed?.unlocked ? 'unlocked' : 'still locked'}`);
    }

    case 'sso': {
      const [space, token] = args;
      const b = await backend();
      // No token: sign in with your company account again, in the browser.
      if (!token) {
        if (space) throw new Error('usage: weave sso   (sign in with your company account again)   or   weave sso <space> <id token>');
        console.error('signing in with your company account in the browser…');
        const s = await b.companySignIn();
        return out(s, () => `signed in to ${s.name}${s.account ? ` as ${s.account}` : ''}${s.renews ? '; it renews by itself' : ''}`);
      }
      if (!space) throw new Error('usage: weave sso <space> <id token>');
      await b.signIn({ space, idToken: token });
      return out({ ok: true }, () => `signed in to ${space}: the company's attestor vouches for you once it has checked it`);
    }

    case 'audit': {
      const [space, since] = args;
      if (!space) throw new Error('usage: weave audit <space> [since date]   (JSON lines: who changed what, when; no content, no secrets)');
      const lines = await (await backend()).audit({ space, ...(since ? { since } : {}) });
      return void console.log(lines.map((l) => JSON.stringify(l)).join('\n'));
    }

    case 'escrow': {
      const [space, ...words] = args;
      if (!space || words.length < 12) throw new Error('usage: weave escrow <space> <your recovery words>   (leave them with the company, sealed)');
      await (await backend()).escrowRecovery({ space, words: words.join(' ') });
      return out({ ok: true }, () => `your recovery words are with ${space}: only its key service opens them`);
    }

    case 'escrow-open': {
      const [space, person] = args;
      if (!space || !person) throw new Error('usage: weave escrow-open <space> <person> [--for <recovery request>]   (those who manage it; it is in the audit)');
      const words = await (await backend()).openEscrow({ space, person, ...(values.for ? { for: values.for } : {}) });
      if (values.for) return out({ answer: words }, () => `the answer for ${person}'s new computer (only it opens it; there: weave recover <answer>):\n${words}`);
      return out({ words }, () => `${person}'s recovery words (hand them over safely; set up with weave restore):\n${words}`);
    }

    case 'enroll': {
      // The company's link from the computer's managed settings, unless one is given.
      const link = args[0] ?? machinePolicy().enroll;
      const idToken = values['id-token'] ?? process.env.WEAVE_ID_TOKEN;
      if (!link) throw new Error('usage: weave enroll <enrollment link> [--name <name>]   (signs in with your company account in the browser; or --id-token <token>)');
      const node = await WeaveNode.enroll(link, home.dir, {
        ...(idToken ? { idToken } : {}),
        ...(values.name ? { name: values.name } : {}),
        open: (url) => {
          console.error(`signing in with your company account in the browser… (if it doesn't open: ${url})`);
          openInBrowser(url);
        },
      });
      const me = await node.whoami();
      await node.close();
      return out(me, () =>
        [
          `created a company account for ${me.name} at ${me.company?.name ?? 'the company'}`,
          `  ${me.did}`,
          `  in ${home.dir}`,
          '',
          'The company holds this identity and its recovery: there are no words to write down.',
          'It stays signed in by itself. Start the daemon (weave daemon) to finish joining once the company is reachable.',
        ].join('\n'),
      );
    }

    case 'recover-request': {
      const request = WeaveNode.recoveryRequest(home.dir);
      return out({ request }, () => `give this to your company's admin (they answer with: weave escrow-open <company> <you> --for <request>):\n${request}`);
    }

    case 'recover': {
      if (!args[0]) throw new Error('usage: weave recover <answer from your company>');
      console.error('looking for your identity on the network (keep another device or the company online)…');
      const node = await WeaveNode.recover(args[0], home.dir, { online: true });
      const me = await node.whoami();
      await node.close();
      return out(me, () => `this computer is now a device of ${me.name ?? me.did}\n  ${me.did}\n  device key ${me.signer}`);
    }

    case 'company': {
      const [sub, ...rest] = args;
      const b = await backend();
      const show = (c: Awaited<ReturnType<typeof b.company>>) =>
        out(c ?? null, () => {
          if (!c) return "you're not in a company";
          return [
            `${c.name}${c.runsHere ? ' (this is its node)' : c.admin ? ' (you administer it)' : ''}  · group ${c.group.name}`,
            `  admins: sign-in group ${c.admins ?? '(none)'}${c.auditors ? ` · auditors: ${c.auditors}` : ''}${c.helpdesk ? ` · helpdesk: ${c.helpdesk}` : ''} · linking accounts: ${c.links ? 'allowed' : 'off'}`,
            `  accounts: ${c.policy.outside ? 'may use other spaces' : "only the company's spaces"} · direct chats: ${{ all: 'anyone', company: 'colleagues only', off: 'none' }[c.policy.directs]} · public: ${c.policy.public ? 'yes' : 'no'}${c.policy.chats ? ' · colleagues chat in company chats' : ''}`,
            `  retention: ${c.retention.minDays ? `at least ${c.retention.minDays} days` : 'no minimum'} · ${c.retention.maxDays ? `at most ${c.retention.maxDays} days` : 'no maximum'}`,
            ...Object.entries(c.spaceRetention).map(([id, r]) => `    ${c.spaces.find((s) => s.id === id)?.name ?? (id === c.group.id ? c.group.name : id)}: ${r.minDays ? `at least ${r.minDays} days` : 'no minimum'} · ${r.maxDays ? `at most ${r.maxDays} days` : 'no maximum'}`),
            ...c.chats.map((ch) => `  company chat ${ch.name}`),
            ...(c.spaces.length ? [`  spaces: ${c.spaces.map((s) => `${s.name} (${s.kind})`).join(', ')}`] : []),
            ...c.maps.map((m) => `  ${m.group} → ${m.spaceName}${m.role === 'maintainer' ? ' as maintainers' : ''}`),
            ...(c.start.length ? [`  new accounts start with ${c.start.length} contact${c.start.length === 1 ? '' : 's'}`] : []),
            ...c.requests.map((r) => `  ${r.time.slice(0, 16)} ${r.byName ?? r.by} asked: ${r.action} — ${r.done ? (r.error ? `refused: ${r.error}` : 'done') : 'waiting'}`),
          ].join('\n');
        });
      switch (sub) {
        case undefined:
        case 'show':
          return show(await b.company());
        case 'create': {
          const [name, ...spec] = rest;
          const provider = providerArgs(spec);
          if (!name || !provider || !values.issuer || !values.audience || !values.admins) throw new Error(`usage: weave company create <name> ${PROVIDER_USAGE}\n       --issuer <url> --audience <id> --admins <sign-in group>`);
          return show(await b.createCompany({ name, provider, issuer: values.issuer, audience: values.audience, admins: values.admins }));
        }
        case 'link': {
          const link = await b.enrollLink(values.days ? { days: Number(values.days) } : {});
          return out({ link }, () => `for a new colleague (weave enroll <link> --id-token <their sign-in>):\n${link}`);
        }
        case 'invite': {
          if (!rest[0]) throw new Error('usage: weave company invite <email> [--days n]');
          const sent = await b.inviteByEmail({ to: rest[0], ...(values.days ? { days: Number(values.days) } : {}) });
          return out(sent, () => `sent ${sent.to} their invitation (it opens ${sent.joinUrl.split('#')[0]})`);
        }
        case 'map': {
          const [group, space, role] = rest;
          if (!group || !space) throw new Error('usage: weave company map <sign-in group> <company space> [maintainer] [--off]');
          return show(await b.companyAction({ action: 'map', group, space, role: role === 'maintainer' ? 'maintainer' : 'member', on: !values.off }));
        }
        case 'space': {
          const [kind, ...name] = rest;
          if ((kind !== 'project' && kind !== 'group') || !name.length) throw new Error('usage: weave company space project|group <name>');
          return show(await b.companyAction({ action: 'space', kind, name: name.join(' ') }));
        }
        case 'start':
          return show(await b.companyAction({ action: 'start', contacts: rest }));
        case 'admins':
          if (!rest[0]) throw new Error('usage: weave company admins <sign-in group>');
          return show(await b.companyAction({ action: 'settings', admins: rest[0] }));
        case 'auditors':
        case 'helpdesk':
          if (!rest[0]) throw new Error(`usage: weave company ${sub} <sign-in group>|-   (- for nobody)`);
          return show(await b.companyAction({ action: 'settings', [sub]: rest[0] === '-' ? null : rest[0] }));
        case 'links':
          if (rest[0] !== 'on' && rest[0] !== 'off') throw new Error('usage: weave company links on|off');
          return show(await b.companyAction({ action: 'settings', links: rest[0] === 'on' }));
        case 'policy': {
          const [what, value] = rest;
          const onOff = value === 'on' ? true : value === 'off' ? false : undefined;
          if (what === 'directs' && (value === 'all' || value === 'company' || value === 'off')) return show(await b.companyAction({ action: 'settings', directs: value }));
          if ((what === 'outside' || what === 'public' || what === 'chats') && onOff !== undefined) return show(await b.companyAction({ action: 'settings', [what]: onOff }));
          throw new Error('usage: weave company policy outside on|off   (spaces the company doesn\'t own)\n       weave company policy directs all|company|off\n       weave company policy public on|off\n       weave company policy chats on|off   (colleagues chat in company chats)');
        }
        case 'retention': {
          const days = (v: string | undefined) => (v === undefined ? undefined : v === '-' || v === 'none' ? null : Number(v));
          if (!rest.length) throw new Error('usage: weave company retention <minimum days|-> [maximum days|-] [--in <space>]   (- for none)');
          return show(await b.companyAction({ action: 'settings', retention: { ...(values.in ? { space: values.in } : {}), minDays: days(rest[0]), ...(rest[1] !== undefined ? { maxDays: days(rest[1]) } : {}) } }));
        }
        case 'chat':
          if (!rest[0]) throw new Error('usage: weave company chat <colleague>   (a company chat: the company keeps and archives it)');
          return show(await b.companyAction({ action: 'chat', with: rest.join(' ') }));
        case 'hold': {
          const [space, until, ...reason] = rest;
          if (!space || !until) throw new Error('usage: weave company hold <space> <until date> [reason]');
          return show(await b.companyAction({ action: 'hold', space, until, ...(reason.length ? { reason: reason.join(' ') } : {}) }));
        }
        case 'destroy-key':
          if (!rest[0]) throw new Error('usage: weave company destroy-key <space>');
          return show(await b.companyAction({ action: 'destroy-key', space: rest[0] }));
        case 'freeze':
          if (!rest[0]) throw new Error('usage: weave company freeze <person>   (what their account signs from now on counts nowhere)');
          return show(await b.companyAction({ action: 'freeze', person: rest[0] }));
        case 'devices':
          if (!rest[0]) throw new Error('usage: weave company devices <device authority certificate (PEM file)> | off   (only sign-ins from company computers)');
          return show(await b.companyAction({ action: 'settings', deviceCA: rest[0] === 'off' ? null : readFileSync(rest[0], 'utf8') }));
        case 'scim': {
          const [what, port] = rest;
          if (what === 'on' || what === 'off') {
            const s = await b.setScim({ on: what === 'on', ...(port ? { port: Number(port) } : {}), ...(values['send-invites'] ? { invite: true } : {}) });
            return out(s, () =>
              s.on
                ? `SCIM at http://<this node>:${s.port}/scim/v2\n  bearer token (shown once; put it in your user management's provisioning settings): ${s.token}${s.invite ? '\n  people it adds get their invitation by email' : ''}`
                : 'SCIM is off',
            );
          }
          const s = await b.scim();
          return out(s, () =>
            [s.on ? `SCIM on, port ${s.port}` : 'SCIM off   (weave company scim on [port])', ...s.users.map((u) => `  ${u.userName.padEnd(30)} ${u.active ? 'active     ' : 'deactivated'} ${u.groups.join(', ')}${u.name ? `  → ${u.name}` : ''}`)].join('\n'),
          );
        }
        case 'console': {
          const [what, port] = rest;
          if (what === 'on' || what === 'off') {
            const c = await b.setConsole({ on: what === 'on', ...(port ? { port: Number(port) } : {}), ...(values['client-id'] ? { clientId: values['client-id'] } : {}), ...(values.url ? { url: values.url } : {}), ...(values.secret ? { clientSecret: values.secret } : {}) });
            return out(c, () => (c.on ? `the admin console is at ${c.url} (admins sign in with their company account)\n  one-time operator link, for the first admin: ${c.operatorLink}` : 'the admin console is off'));
          }
          const c = await b.consoleInfo();
          return out(c, () => (c.on ? `the admin console is at ${c.url}` : 'the admin console is off   (weave company console on [port] --client-id <app registration> [--url <public address>] [--secret <client secret>])'));
        }
        case 'stream': {
          const [what, kind, ...more] = rest;
          if (what === 'add') {
            const input =
              kind === 'webhook' && more[0]
                ? { kind, url: more[0], ...(values.token ? { token: values.token } : {}) }
                : kind === 'splunk' && more[0] && values.token
                  ? { kind, url: more[0], token: values.token }
                  : kind === 'syslog' && more[0]
                    ? { kind, host: more[0].split(':')[0], port: Number(more[0].split(':')[1] ?? 514) }
                    : kind === 'sentinel' && more.length === 3 && values.tenant && values['client-id'] && values.secret
                      ? { kind, endpoint: more[0], rule: more[1], stream: more[2], tenant: values.tenant, clientId: values['client-id'], secret: values.secret }
                      : undefined;
            if (!input)
              throw new Error(
                'usage: weave company stream add webhook <url> [--token t]\n       weave company stream add splunk <collector url> --token <HEC token>\n       weave company stream add syslog <host:port>\n       weave company stream add sentinel <endpoint> <rule id> <stream> --tenant t --client-id c --secret s',
              );
            const added = await b.addAuditStream(input as Parameters<typeof b.addAuditStream>[0]);
            return out(added, () => added.map((s) => `${s.id}  ${s.kind.padEnd(8)} ${s.target}  ${s.sent} sent${s.problem ? `  ⚠ ${s.problem}` : ''}`).join('\n'));
          }
          if (what === 'remove' && kind) {
            const left = await b.removeAuditStream(kind);
            return out(left, () => left.map((s) => `${s.id}  ${s.kind}  ${s.target}`).join('\n') || 'no audit streams');
          }
          const list = await b.auditStreams();
          return out(list, () => list.map((s) => `${s.id}  ${s.kind.padEnd(8)} ${s.target}  ${s.sent} sent${s.lastSent ? `, last ${s.lastSent.slice(0, 16)}` : ''}${s.problem ? `  ⚠ ${s.problem}` : ''}`).join('\n') || 'no audit streams   (weave company stream add …)');
        }
        case 'export': {
          const [space, since, until] = rest;
          if (!space) throw new Error('usage: weave company export <space> [since] [until] > space.jsonl   (everything it holds, deleted posts marked: for legal searches)');
          const lines = await b.exportSpace({ space, ...(since ? { since } : {}), ...(until ? { until } : {}) });
          return void console.log(lines.map((l) => JSON.stringify(l)).join('\n'));
        }
        default:
          throw new Error(`unknown: weave company ${sub} (see weave --help)`);
      }
    }

    case 'link': {
      if (!args[0]) throw new Error('usage: weave link <person or contact link> [--in <space>] [--off]');
      const links = await (await backend()).link({ who: args.join(' '), ...(values.in ? { space: values.in } : {}), on: !values.off });
      return out(links, () => linkLines(links));
    }

    case 'links': {
      const links = await (await backend()).links(args[0]);
      return out(links, () => linkLines(links));
    }

    case 'approve-agent': {
      const [space, agent, off] = args;
      if (!space || !agent) throw new Error('usage: weave approve-agent <space> <person/agent> [off]');
      const s = await (await backend()).approveAgent({ space, agent, on: off !== 'off' });
      return out(s, () => `agents approved in ${s.name}: ${s.managed?.agents.join(', ') || 'none'}`);
    }

    case 'hold': {
      const [space, until, ...reason] = args;
      if (!space || !until) throw new Error('usage: weave hold <space> <until date> [reason]   (a past date lifts it)');
      const s = await (await backend()).setHold({ space, until, reason: reason.join(' ') });
      return out(s, () => (s.hold ? `${s.name} is on legal hold until ${s.hold.until.slice(0, 10)}: nothing is shredded or forgotten` : `${s.name} is no longer on hold`));
    }

    case 'destroy-company-key': {
      if (!args[0]) throw new Error('usage: weave destroy-company-key <space>');
      await (await backend()).destroyCompanyKey(args[0]);
      return out({ ok: true }, () => `destroyed: every copy of what ${args[0]}'s company key covered is unreadable now`);
    }

    case 'older': {
      if (!args[0]) throw new Error('usage: weave older <space> [before]');
      const r = await (await backend()).fetchOlder({ space: args[0], ...(args[1] ? { before: args[1] } : {}) });
      return out(r, () => `asked the members of ${args[0]} for ${r.since.slice(0, 10)} to ${r.until.slice(0, 10)}: what they hold comes in while you're online`);
    }

    case 'keepers': {
      const k = await (await backend()).keepers();
      return out(k, () =>
        [
          ...k.spaces.map((s) => `${s.space.name.padEnd(24)} kept by ${s.keepers.length ? s.keepers.map((a) => a.name ?? a.did.slice(8, 16)).join(', ') : 'nobody yet (make friends: people you follow who follow you back)'}`),
          `you keep ${(k.forOthers / 1048576).toFixed(1)} MB for friends (at most ${Math.round(k.quota / 1048576)} MB)`,
        ].join('\n'),
      );
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
        const selling = values.gumroad === 'new';
        const token = selling ? await gumroadToken(b) : undefined;
        let t = await b.createTier({ name: args.slice(1).join(' '), price: cents(values.price), currency: values.currency, description: values.text, benefits: benefits(values.benefit), auto: values.auto, gumroad: gumroadLink() ?? undefined, onchain: (await onchainPrice(b)) ?? undefined });
        const sold = selling ? await sellOnGumroad(b, t, token) : undefined;
        if (sold) t = sold.tier;
        return out(t, () => `offered ${t.name}\n${tierLine(t)}${sold ? `\n${sold.note}` : ''}\n\ninvite it into a project:  weave project add-group <project> "${t.name}"`);
      }
      if (sub === 'list') {
        const tiers = await b.tiers(ref);
        return out(tiers, () => tiers.map(tierLine).join('\n\n') || '(no tiers)');
      }
      if (sub === 'set' && ref) {
        const selling = values.gumroad === 'new';
        const token = selling ? await gumroadToken(b) : undefined;
        let t = await b.setTier({ tier: ref, name: values.name, price: cents(values.price), currency: values.currency, description: values.text, benefits: benefits(values.benefit), auto: values.auto, gumroad: gumroadLink(), onchain: await onchainPrice(b) });
        const sold = selling ? await sellOnGumroad(b, t, token) : undefined;
        if (sold) t = sold.tier;
        return out(t, () => `${tierLine(t)}${sold ? `\n${sold.note}` : ''}`);
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
      await (await backend()).requestMembership({ tier, note: values.text, license: values.license, payment: values.payment });
      return out({ requested: tier }, () => (values.license ? "sent your license key: you're in once the creator's node has checked it with Gumroad" : values.payment ? "sent your payment: you're in once the creator's node has read it on chain" : 'asked to join; the creator decides'));
    }

    case 'requests': {
      const list = await (await backend()).membershipRequests();
      const license = (r: (typeof list)[number]) =>
        r.license ? `\n  Gumroad license ${r.license.key.slice(0, 8)}…: ${r.license.ok === undefined ? 'checking' : r.license.ok ? 'valid' : `not let in: ${r.license.reason}`}${r.license.email ? ` (${r.license.email})` : ''}` : '';
      const payment = (r: (typeof list)[number]) =>
        r.payment ? `\n  paid on chain ${r.payment.tx.slice(0, 10)}…: ${r.payment.ok === undefined ? 'checking' : r.payment.ok ? `valid, ${r.payment.months} month${r.payment.months === 1 ? '' : 's'}` : `not let in: ${r.payment.reason}`}` : '';
      return out(list, () => list.map((r) => `${r.tier.name}: ${r.name ?? r.did}${r.note ? ` — "${r.note}"` : ''}${license(r)}${payment(r)}\n  weave grant "${r.tier.name}" ${r.did} --months 1`).join('\n') || '(nobody waiting)');
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

    case 'badge': {
      const [sub, ref, who] = args;
      const b = await backend();
      if (sub === 'create' && ref) {
        const s = await b.createBadgeSeries({ project: needProject(), name: args.slice(1).join(' '), symbol: values.symbol, image: values.image ? await uploadImage(b, values.image) : undefined, description: values.text, limit: values.limit ? Number(values.limit) : undefined });
        return out(s, () => `started ${badgeSeriesLine(s)}\n\ngive one:  weave badge give "${s.name}" <who>`);
      }
      if (sub === 'list') {
        const list = await b.badgeSeries(values.project);
        return out(list, () => list.map(badgeSeriesLine).join('\n\n') || '(no badges)');
      }
      if (sub === 'set' && ref) {
        const image = values.image === undefined ? undefined : values.image === '' ? '' : await uploadImage(b, values.image);
        const s = await b.setBadgeSeries({ series: ref, name: values.name, symbol: values.symbol, image, description: values.text });
        return out(s, () => badgeSeriesLine(s));
      }
      if (sub === 'give' && ref && who) {
        const badge = await b.giveBadge({ series: ref, who, note: values.text, ref: values.ref, personal: values.personal });
        return out(badge, () => `gave ${badge.holder.name ?? badge.holder.did} ${badgeLine(badge)}`);
      }
      if (sub === 'publish' && ref) {
        const badge = await b.publishBadgeNote({ badge: ref, on: !values.off });
        return out(badge, () => `${values.off ? 'took back the personal note' : 'published the personal note'}: ${badgeLine(badge)}`);
      }
      if (sub === 'pass' && ref && who) {
        const badge = await b.transferBadge({ badge: ref, to: who });
        return out(badge, () => `passed on to ${badge.holder.name ?? badge.holder.did}: ${badgeLine(badge)}`);
      }
      throw new Error('usage: weave badge create|list|set|give|publish|pass — see "weave --help"');
    }

    case 'badges': {
      const list = await (await backend()).badges(args[0]);
      return out(list, () => list.map(badgeLine).join('\n\n') || '(no badges)');
    }

    case 'wallet': {
      const [sub, address] = args;
      const b = await backend();
      if (sub === 'message' && address) {
        const message = await b.walletMessage(address);
        return out({ message }, () => message);
      }
      if (sub === 'link' && address) {
        const wallet = await b.linkWallet({ address, proof: values.proof });
        return out(wallet, () => `linked ${wallet ? walletLine(wallet) : address}`);
      }
      if (sub === 'unlink') {
        await b.linkWallet({ address: '' });
        return out({ unlinked: true }, () => 'unlinked your wallet');
      }
      const wallet = await b.wallet(sub);
      return out(wallet ?? null, () => (wallet ? walletLine(wallet) : '(no linked wallet)'));
    }

    case 'treasury': {
      const b = await backend();
      const space = values.project ?? values.community;
      if (!space) throw new Error('which one? add -p <project> or -r <community>');
      if (args[0] === 'deploy') {
        const t = await b.treasury(space);
        const deploy = t.deploy;
        if (!deploy) throw new Error(`${t.project.name} has no treasury yet: a maintainer has to link a wallet first`);
        return out(deploy, () => `send this from any wallet on ${t.chain.name} to put ${t.address} on chain (it belongs to its owners alone):\n  to:   ${deploy.to}\n  data: ${deploy.data}`);
      }
      if (args[0] === 'sweep') {
        const swept = await b.sweepRetired(space);
        return out(swept, () => swept.map((x) => (x.proposal ? `${x.safe}: ${x.balance} (smallest unit) to move: its old owners sign it (weave safe sign ${x.proposal.id} …)${x.proposal.exec ? ' — ready' : ''}` : `${x.safe}: nothing left there`)).join('\n') || '(no retired treasuries)');
      }
      if (args[0] === 'split') {
        const c = await b.splitContract(space);
        return out(c, () => [`split contract on ${c.chain.name}: ${c.address} (${c.deployed ? 'deployed' : 'not deployed yet'})`, `  ${c.chain.explorer}/address/${c.address}`, ...c.allocations.map((a) => `  ${(a.share / 10000).toFixed(2)}% ${a.address}`), ...(c.deployed ? [] : [`deploy it from any wallet (it belongs to the treasury):`, `  to:   ${c.deploy.to}`, `  data: ${c.deploy.data}`])].join('\n'));
      }
      const t = args[0] === 'announce' ? await b.announceTreasury(space) : await b.treasury(space);
      return out(t, () => treasuryLine(t));
    }

    case 'show': {
      const [sub, ref, action] = args;
      const b = await backend();
      if (sub === 'create' && ref) {
        const price = values.usdc ? parseUnits(values.usdc, TEST_USDC.decimals) : undefined;
        if (!price || !values.starts || !values.ends) throw new Error('usage: weave show create <name> --starts <time> --ends <time> --usdc <price>');
        const split = values.split ? values.split.split(',').map((part) => { const [to, share] = part.split('='); return { to: to.trim(), share: Number(share) }; }) : undefined;
        const sh = await b.createShow({ name: args.slice(1).join(' '), project: values.project, room: values.room, starts: values.starts, ends: values.ends, price, capacity: values.capacity ? Number(values.capacity) : undefined, hosts: values.hosts?.split(','), split });
        return out(sh, () => `set up ${showLine(sh)}\n\nput its Safe on chain when you like (any wallet can send it): weave show safe ${sh.id}`);
      }
      if (sub === 'cancel' && ref) {
        const sh = await b.cancelShow(ref);
        return out(sh, () => `${showLine(sh)}\n\npay everyone back: weave show settle ${sh.id} refund`);
      }
      if (sub === 'safe' && ref) {
        const sh = (await b.shows()).find((x) => x.id === ref || x.name.toLowerCase() === ref.toLowerCase());
        if (!sh?.safe.deploy) throw new Error('no such show, or one of its hosts has no linked wallet');
        const deploy = sh.safe.deploy;
        return out(deploy, () => `send this from any wallet to put ${sh.safe.address} on chain (it belongs to the hosts):\n  to:   ${deploy.to}\n  data: ${deploy.data}`);
      }
      if (sub === 'settle' && ref && (action === 'payout' || action === 'refund')) {
        const settlement = await b.settleShow({ show: ref, action, ...(values.split ? { split: values.split.split(',').map((part) => { const [to, share] = part.split('='); return { to: to.trim(), share: Number(share) }; }) } : {}) });
        if (values.file) writeFileSync(resolvePath(process.env.INIT_CWD ?? process.cwd(), values.file), JSON.stringify(settlement.batch, null, 2));
        return out(settlement, () => [`${action === 'refund' ? 'pay back' : 'pay out'} ${settlement.total} of ${settlement.balance} (smallest unit) from the Safe ${settlement.safe}, in ${settlement.calls.length} transfer${settlement.calls.length === 1 ? '' : 's'}`, values.file ? `wrote ${values.file}: load it in the Safe app's Transaction Builder (app.safe.global), check it, sign it in your wallets` : 'add --file batch.json for the Safe app'].join('\n'));
      }
      throw new Error('usage: weave show create|cancel|safe|settle — see "weave --help"');
    }

    case 'shows': {
      const list = await (await backend()).shows(values.project);
      return out(list, () => list.map(showLine).join('\n\n') || '(no shows)');
    }

    case 'ticket': {
      const show = args.join(' ').trim();
      if (!show || !values.payment) throw new Error('usage: weave ticket <show> --payment <tx hash>');
      await (await backend()).buyTicket({ show, payment: values.payment });
      return out({ requested: show }, () => "sent your payment: you're in once the host's node has read it on chain (weave shows)");
    }

    case 'tickets': {
      const list = await (await backend()).tickets(args.join(' ').trim());
      return out(list, () => list.map((t) => `${t.ok ? 'ticket ' : 'not let in'} ${t.holder.name ?? t.holder.did}  ${t.tx.slice(0, 12)}…${t.reason ? `: ${t.reason}` : ''}`).join('\n') || '(no tickets)');
    }

    case 'safe': {
      const [sub, ref] = args;
      const b = await backend();
      if (sub === 'proposals') {
        const list = await b.safeProposals(ref);
        return out(list, () => list.map(safeProposalLine).join('\n\n') || '(nothing to sign)');
      }
      if (sub === 'show' && ref) {
        const pr = (await b.safeProposals()).find((x) => x.id === ref || x.id.startsWith(ref));
        if (!pr) throw new Error(`no proposal "${ref}" is known`);
        if (values.file) writeFileSync(resolvePath(process.env.INIT_CWD ?? process.cwd(), values.file), JSON.stringify(pr.typedData, null, 2));
        return out(pr, () => `${safeProposalLine(pr)}${values.file ? `\n\nwrote the typed data to ${values.file}: sign it with eth_signTypedData_v4, or sign the hash as a message` : ''}`);
      }
      if (sub === 'sign' && ref && values.signature) {
        const pr = await b.signSafeTx({ proposal: ref, signature: values.signature });
        return out(pr, () => safeProposalLine(pr));
      }
      throw new Error('usage: weave safe proposals|show|sign — see "weave --help"');
    }

    case 'label': {
      const [target, label] = args;
      if (!target || (label !== 'endorse' && label !== 'block' && label !== '')) throw new Error('usage: weave label <address> endorse|block --text <why>');
      const l = await (await backend()).label({ target, label, reason: values.text });
      return out(l ?? null, () => (l ? labelLine(l) : 'withdrawn'));
    }

    case 'labels': {
      const list = await (await backend()).labels({ ...(args[0] ? { target: args[0] } : {}), ...(values.from ? { by: values.from.split(',') } : {}) });
      return out(list, () => list.map(labelLine).join('\n') || '(no labels)');
    }

    case 'split': {
      const shares = values.shares
        ? (Object.fromEntries(values.shares.split(',').map((pair) => { const [key, value] = pair.split('='); return [key.trim(), Number(value)]; })) as { makers: number })
        : undefined;
      const t = await (await backend()).setSplit({ project: needProject(), preset: args[0], shares, community: values.community });
      return out(t, () => treasuryLine(t));
    }

    case 'app': {
      const [sub] = args;
      const b = await backend();
      if (sub === 'publish') {
        const file = resolvePath(process.env.INIT_CWD ?? process.cwd(), values.file ?? 'weave.app.json');
        if (!existsSync(file)) throw new Error(`no app manifest at ${file}`);
        const app = await b.publishApp({ project: needProject(), manifest: JSON.parse(readFileSync(file, 'utf8')) });
        return out(app, () => `published ${app.name} (${app.app}) in ${values.project}\n${app.services.map((s) => `  shares port ${s.port} (${s.protocol})${s.open?.joiner ? ` · players open ${s.open.joiner.path}` : ''}`).join('\n')}`);
      }
      if (sub === 'show') {
        const app = await b.projectApp(needProject());
        return out(app, () => (app ? `${app.name} (${app.app})\n${app.services.map((s) => `  ${s.id}: port ${s.port} (${s.protocol})${s.open?.host ? ` · host: ${s.open.host.label} ${s.open.host.path}` : ''}${s.open?.joiner ? ` · players: ${s.open.joiner.label} ${s.open.joiner.path}` : ''}`).join('\n')}${app.start?.hint ? `\n  start: ${app.start.hint}` : ''}${app.install?.tag ? `\n  release: ${app.install.tag}${app.install.github ? ` (${app.install.github})` : ''}` : ''}${app.install?.image ? `\n  container: ${app.install.image.ref}:${app.install.image.tag} @ ${app.install.image.digest}` : app.start?.image ? `\n  container: ${app.start.image} (pinned at the next weave app release)` : ''}` : '(no app published)'));
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
        return out(app, () => `${app.name} ${app.install?.tag} is released from github.com/${app.install?.github}: rooms can run it\n${Object.entries(app.install?.assets ?? {}).map(([platform, a]) => `  ${platform.padEnd(13)} ${a.file}  sha256 ${a.sha256.slice(0, 16)}…`).join('\n')}`);
      }
      throw new Error('usage: weave app publish|show|check|example|workflow|release <tag> -p <project>');
    }

    case 'rooms': {
      const rooms = await (await backend()).websites(values.project);
      return out(rooms, () => rooms.map(roomLine).join('\n') || '(no open rooms)');
    }

    case 'room': {
      const [sub, ref, ...words] = args;
      const b = await backend({ needsDaemon: sub !== 'chat' });
      if (sub === 'open' && ref) {
        const at = values.artifact ? values.artifact.lastIndexOf('@') : -1;
        const artifact = values.artifact ? (at > 0 ? { project: values.artifact.slice(0, at), tag: values.artifact.slice(at + 1) } : { project: values.artifact }) : undefined;
        const settings = Object.fromEntries((values.setting ?? []).map((s) => {
          const eq = s.indexOf('=');
          if (eq < 1) throw new Error('a setting is KEY=VALUE');
          return [s.slice(0, eq), s.slice(eq + 1)];
        }));
        const command = values.run ? [...values.run.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]) : undefined;
        const r = await approving((approve) =>
          b.openWebsite({
            project: needProject(),
            name: [ref, ...words].join(' '),
            ...(values.service ? { service: values.service } : {}),
            ...(artifact ? { artifact } : {}),
            ...(command ? { command, folder: values.folder ?? process.cwd() } : {}),
            ...(values.port ? { port: Number(values.port) } : {}),
            ...(Object.keys(settings).length ? { settings } : {}),
            invite: values.invite?.split(',').map((w) => w.trim()).filter(Boolean),
            show: values.show,
            groups: values.tiers?.split(',').map((w) => w.trim()).filter(Boolean),
            approve,
          }),
        );
        return out(r, () => `${roomLine(r)}\n  it opens for everyone once its handler answers (weave service list shows how it's doing)`);
      }
      if (sub === 'env' && ref) {
        const env = await b.websiteEnv(ref);
        const line = ([k, v]: [string, string | undefined]) => (process.platform === 'win32' ? `$env:${k}='${v}'` : `export ${k}='${v}'`);
        return out(env, () => [...Object.entries(env).map(line), '# set these where you start what answers the room; they last until Weave restarts'].join('\n'));
      }
      if (sub === 'join' && ref) {
        await b.visitWebsite(ref);
        let r: WebsiteInfo | undefined;
        for (let i = 0; i < 100 && !r?.url; i++) {
          r = (await b.websites()).find((x) => x.id.startsWith(ref) || x.name.toLowerCase() === ref.toLowerCase());
          if (!r?.url) await new Promise((resolve) => setTimeout(resolve, 300));
        }
        return out(r, () => (r?.url ? `joined ${r.name}: open ${r.url}\n(the tunnel stays open until you leave: weave room leave "${r.name}")` : 'joined, but the host is not reachable yet; try "weave rooms" in a moment'));
      }
      if ((sub === 'leave' || sub === 'end') && ref) {
        await (sub === 'end' ? b.closeWebsite(ref) : b.leaveWebsite(ref));
        return out({ [sub]: ref }, () => (sub === 'end' ? 'room ended' : 'left the room'));
      }
      if (sub === 'chat' && ref) {
        const messages = await b.websiteChat(ref);
        return out(messages, () => messages.map((m) => `${new Date(m.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}  ${(m.by.name ?? m.by.did).padEnd(16)}  ${m.text}`).join('\n') || '(quiet; room chats are never stored)');
      }
      if (sub === 'say' && ref && words.length) {
        await b.sayOnWebsite({ room: ref, text: words.join(' ') });
        return out({ said: words.join(' ') }, () => 'said');
      }
      throw new Error('usage: weave room open|join|leave|end|chat|say — see "weave --help"');
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

    case 'unsay': {
      if (!args[0]) throw new Error('usage: weave unsay <id>');
      await (await backend()).deleteMessage({ message: args[0], as: values.as });
      return out({ deleted: args[0] }, () => 'deleted: out of sight for everyone; it stays in the logs');
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
