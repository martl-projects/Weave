import type { GumroadLink } from '@weave/core';
import type { AppManifest, AppSetting, BoardType, Choice, Did, IssueStatus, Json, PostSort, SaveMode, SpaceKind } from '@weave/core';

export type { AppManifest } from '@weave/core';
import type { Theme } from './theme.ts';
export { TEXT_LIMITS } from '@weave/core/limits';

/** An event as shown to people and agents: decrypted where possible, with resolved names. */
export interface FeedItem {
  id: string;
  time: string;
  kind: string;
  scope: string;
  body: Json;
  author: Did;
  authorName?: string;
  signer: Did;
  /** Set when an agent or device signed for the author. */
  signerName?: string;
  seq: number;
  /** Set for events inside a group or project. */
  space?: SpaceRef;
  /** Set for events only you can read (private follows, blocks, mutes). */
  private?: true;
  /** Live events only: set when the event is worth a notification for you. */
  notice?: Notice;
}

/**
 * Why a live event concerns you, ready to show as a notification.
 * messages: direct messages, @mentions, replies to you or in your posts ·
 * requests: co-author requests, people asking to join or for a tier ·
 * activity: new posts, issues and proposals in your projects.
 */
export interface Notice {
  type: 'dm' | 'mention' | 'reply' | 'coauthor' | 'knock' | 'membership' | 'post' | 'issue' | 'proposal' | 'permission';
  category: NoticeCategory;
  title: string;
  text: string;
  /** Where it leads: the Inbox, a space's channel, or a post (by id). */
  open: { inbox?: true; space?: SpaceRef; channel?: string; post?: string };
}

export type NoticeCategory = 'messages' | 'requests' | 'activity';

export interface SpaceRef {
  id: string;
  kind: SpaceKind;
  name: string;
}

/** An agent harness on this computer (Claude Code, Codex…) and whether it knows about Weave. */
export interface HarnessInfo {
  id: string;
  name: string;
  /** The agent it acts as here. */
  agent: string;
  /** Its MCP config file. */
  file: string;
  /** Weave's entry there: none, this installation's, or another (an old or different setup). */
  state: 'none' | 'ours' | 'other';
  /** What to do so it notices a change. */
  restart: string;
}

export interface AgentInfo {
  name: string;
  did: Did;
  permissions: string[];
}

export interface Whoami {
  /** The person: your identifier, which stays the same when keys change. */
  did: Did;
  name?: string;
  agents: AgentInfo[];
  /** The key this node signs with: this device's key (for old identities, the identifier itself). */
  signer: Did;
}

/** Your identity's keys as the network sees them. */
export interface IdentityInfo {
  did: Did;
  /** Protected by a recovery kit, with a pre-committed next root key. False for identities made before that existed. */
  recoverable: boolean;
  /** How many times the root key was rotated. */
  rotations: number;
  /** The key people encrypt to when writing to you. */
  encryptionKey: Did;
  /** This device's key. */
  device: Did;
  /** Your keys that were seen signing in two places at once: possibly stolen. */
  forks: Did[];
}

/** One of your device or agent keys. */
export interface KeyInfo {
  did: Did;
  role: 'device' | 'agent';
  name?: string;
  /** The key this node signs with. */
  current: boolean;
  /** Revoked: events after this seq are void. */
  revokedAfter?: number;
  /** Events it signed, and when the latest says it was signed. */
  events: number;
  lastTime?: string;
  forked: boolean;
  /** For agents whose key this node holds: the kinds it may sign (updateAgent changes them). */
  permissions?: string[];
}

export interface Status {
  did: Did;
  name?: string;
  online: boolean;
  topics: string[];
  groups: number;
  projects: number;
  communities: number;
  peers: number;
  logs: number;
  events: number;
  pending: number;
}

export interface PublishInput {
  kind: string;
  body?: Json;
  /** Group, project or community (name or id); the event is encrypted for its members. */
  space?: string;
  /** Agent name to sign with instead of the root identity. */
  as?: string;
}

export interface FeedQuery {
  limit?: number;
  kinds?: string[];
  /** Group or project (name or id): only its events. */
  space?: string;
  /** Only events by this person (name or did:key). */
  author?: string;
  /** Only public events. */
  publicOnly?: boolean;
}

/** A group, project or community this node belongs to. */
export interface SpaceInfo extends SpaceRef {
  /** Projects: the icon from the project's page (wblob: reference), if it has one. */
  icon?: string;
  founder: Did;
  founderName?: string;
  members: number;
  epoch: number;
  /** Joined with a link that needs the inviter's OK: asked, not let in yet. */
  waiting?: true;
  /** Closed by its owner or maintainers: kept, read-only. */
  closed?: true;
  /** You unfollowed it: off your Home, and no notifications about its new posts (only you know). */
  hiddenFromHome?: true;
}

export interface GitHubInfo {
  /** This copy of Weave knows the Weave GitHub app (it has its client ID). */
  available: boolean;
  /** Where to install the app on repositories, so they can be linked. */
  installUrl: string;
  /** The GitHub App you sign in through, who owns it, and whether it's your own choice (not Weave Connect). */
  app: { name: string; slug: string; owner: string; url: string; own: boolean };
  /** Who you're signed in as on this device. */
  login?: string;
  /** A sign-in waiting for you to enter the code on GitHub. */
  pending?: { userCode: string; verificationUri: string; expires: string };
  /** Why the last sign-in didn't work. */
  error?: string;
}

export interface RepoInfo {
  /** owner/name */
  repo: string;
  url: string;
  /** Only readers of this board, not the whole project. */
  board?: string;
  /** Who linked it; their node invites and removes people. */
  by: Actor;
  /** You linked it: your GitHub sign-in keeps it in step. */
  mine?: true;
  /** For your own: when it was last brought in step, and what went wrong if it didn't. */
  synced?: string;
  problem?: string;
}

export interface SpaceRepos {
  repos: RepoInfo[];
  /** You may link repos here (owner or maintainer). */
  canLink: boolean;
  /** The GitHub account you gave this space. */
  shared?: string;
  /** For whoever linked a repo: people it should include who haven't given their GitHub account. */
  missing?: Actor[];
  /** For whoever linked a repo: members and the accounts they gave. */
  accounts?: Array<{ who: Actor; login: string }>;
}

/** What to say when someone acts as an agent this node doesn't have (often an MCP server started with an old --as). */
export const noAgent = (name: string, agents: string[]): string =>
  `this node has no agent named "${name}"${agents.length ? ` (its agents: ${agents.join(', ')})` : ' (it has no agents yet)'}. ` +
  `Create it with: weave agent add ${name} --can weave.post,weave.reply` +
  (agents.length ? `, or act as ${agents.length === 1 ? 'it' : 'one of them'}: start the MCP server with --as ${agents[0]}` : '');

export const PROJECT_STATUSES = ['idea', 'active', 'paused', 'shipped', 'archived'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export interface ProjectPage {
  /** Shown as the page's heading; the project's name when empty. */
  title: string;
  /** One or two lines under the title, on the hero card. */
  subtitle: string;
  /** The page itself: Markdown, which may contain HTML (sanitized when shown) and images (wblob: references). */
  body: string;
  /** Square image (wblob: reference) for the hero card and lists. */
  icon?: string;
  /** Wide image (wblob: reference) behind the hero card. */
  banner?: string;
  /** Short text for shares and older clients: the subtitle, or the start of the body. */
  description: string;
  status: ProjectStatus;
  /** Shown to everyone: in the maintainers' spaces and on the public website. */
  public: boolean;
}

export interface ProjectInfo extends SpaceInfo {
  kind: 'project';
  page: ProjectPage;
  maintainers: Actor[];
  /** Groups invited as a whole, and whether their newcomers are admitted automatically. */
  groups: Array<{ id: string; name: string; auto: boolean }>;
  /** You may invite, admit, remove and change the page. */
  maintainer: boolean;
  /** The project as a post: its score, chat size and your saves. */
  post?: PostInfo;
}

/** A project shown publicly on someone's hub. */
export interface PublicProject {
  id: string;
  name: string;
  description: string;
  /** The page's icon (wblob: reference), if it has one. */
  icon?: string;
  status: ProjectStatus;
  time: string;
}

export interface CommunityInfo extends SpaceInfo {
  kind: 'community';
  description: string;
  moderators: Actor[];
  /** You may pin posts, remove members and appoint moderators. */
  moderator: boolean;
}

/** A board of posts inside a project (or the one board of a community). */
export interface BoardInfo {
  name: string;
  title: string;
  /** posts: ordinary posts · issues: the issue tracker · proposals: formal votes. */
  type: BoardType;
  /** The order the maintainers chose; readers may sort differently. */
  sort: PostSort;
  position: number;
  /** Pinned post ids, in order. */
  pinned: string[];
  count: number;
  /** Time of the latest post or chat message in the board. */
  active?: string;
  /** Who may read and write, when the maintainers limited it (otherwise everyone in the project). */
  access: { read?: GranteeInfo[]; write?: GranteeInfo[] };
  /** You may post, vote and chat here. */
  canWrite: boolean;
  /** Projects: you follow this board, so its posts come to your Home and notify you (releases and showcase by default). */
  following?: boolean;
}

/** A person or group a board is open to. */
export interface GranteeInfo {
  person?: Did;
  group?: string;
  name?: string;
}

/** Someone who asked to join with a link that needs your OK. */
export interface KnockInfo {
  id: string;
  space: SpaceRef;
  did: Did;
  name?: string;
  note: string;
  time: string;
  /** Board rights the link gives. */
  access: Array<{ board: string; read?: boolean; write?: boolean }>;
}

/** Options for an invite link. */
export interface InviteOptions {
  /** The link only lets people ask; you let each one in (they get no keys until then). */
  accept?: boolean;
  /** Board rights the link gives, by board name or title (projects). */
  access?: Array<{ board: string; read?: boolean; write?: boolean }>;
}

/**
 * Something shown as a post: a post in a community or a project's board, an
 * issue, a proposal, a public post, or a whole project (whose id is the id of
 * the event that created it).
 */
export interface PostInfo {
  id: string;
  short: string;
  /**
   * Its web address, clickable anywhere: http://weave.localhost:7710/weave~NqgQ/ideas/aq1i/title.
   * Every Weave serves it on its own computer, so it opens for whoever can see the post.
   */
  url: string;
  type: 'post' | 'project' | 'issue' | 'proposal';
  /** Where it lives; undefined for public posts. */
  space?: SpaceRef;
  board?: string;
  by: Actor;
  title: string;
  text: string;
  link?: string;
  /** An attached image (wblob: reference), shown as the post's thumbnail. */
  image?: string;
  /** As a work item: what a session should do with it (its starting prompt). */
  prompt?: string;
  time: string;
  /** When its author last edited it. */
  edited?: string;
  /**
   * Co-authors: people and agents the post names. Everyone sees the confirmed
   * ones; its author also sees who was asked and who declined.
   */
  coauthors?: Array<Actor & { state: 'asked' | 'confirmed' | 'declined' }>;
  /** Latest activity: the post or its chat. */
  active: string;
  score: number;
  /** Your upvote: 1, -1 or 0. */
  myVote: number;
  /** Messages in its chat. */
  chat: number;
  /** Pinned in its board by the maintainers or moderators. */
  pinned: boolean;
  /** You saved it, or pinned it to the top of your home. */
  saved?: SaveMode;
  /** For projects and shared projects. */
  project?: { id: string; name: string; description: string; status: string; icon?: string; participants?: number; member: boolean };
  /** For shared posts: where the original lives, and whether you can open it. */
  share?: { space?: SpaceRef; post: string; member: boolean };
  issue?: { status: IssueStatus; labels: string[]; assignee?: Actor };
  proposal?: ProposalInfo;
}

/** Where Home's posts come from. */
export const HOME_SOURCES = ['all', 'communities', 'projects', 'mine', 'friends', 'following'] as const;
export type HomeSource = (typeof HOME_SOURCES)[number];

export interface PostsQuery {
  /** A project or community; without one, your home: communities, projects and shares from people you follow. */
  space?: string;
  board?: string;
  sort?: PostSort;
  /** Only posts you saved or pinned. */
  saved?: boolean;
  /**
   * Home only: all (minus spaces you hid from Home), communities, projects (all you're in),
   * mine (projects you own or maintain), friends (projects your friends own, and ones they share),
   * following (public posts of people you follow).
   */
  from?: HomeSource;
  limit?: number;
}

/** A membership tier a creator offers. */
export interface TierInfo {
  /** The tier's group id. */
  id: string;
  creator: Person;
  name: string;
  /** Per month, in cents (minor units). 0 = free. */
  price: number;
  currency: string;
  description: string;
  benefits: string[];
  position: number;
  /** Accepting new members. */
  open: boolean;
  /** Requests are granted automatically, without asking the creator (for free tiers). */
  auto: boolean;
  /** Sold through Gumroad: buy there, then send the license key from the receipt. */
  gumroad?: GumroadLink;
  /** You offer this tier. */
  mine: boolean;
  /** For the creator: how many active members it has. */
  members?: number;
  /** Your own membership, if you have or had one. */
  membership?: { until: string; active: boolean };
  /** You asked to join and haven't been answered yet. */
  requested?: boolean;
}

/** Someone asking to join one of your tiers. */
export interface MembershipRequestInfo {
  id: string;
  tier: { id: string; name: string };
  did: Did;
  name?: string;
  note: string;
  time: string;
  /**
   * For tiers sold through Gumroad: the license key they sent and what Gumroad
   * said (`ok` is missing until it was checked). Valid keys are let in automatically.
   */
  license?: { key: string; ok?: boolean; reason?: string; email?: string };
}

/** A post naming you (or one of your agents) as co-author, waiting for your answer. */
/** Where an agent asks the Weave app to take its person: a space, its Link a repository dialog, or the Inbox. */
export interface AppOpen {
  what: 'link-repo' | 'space' | 'inbox' | 'post';
  space?: SpaceRef;
  /** For post: the post to show. */
  post?: { id: string; title: string };
  /** For link-repo: the repository to have chosen (owner/name). */
  repo?: string;
}

/**
 * A post an agent pointed you to: shown with weave_show, or written as a link in
 * a Claude Code session Weave follows. Kept on this computer only, for the
 * Mentions panel; never signed or sent anywhere.
 */
export interface MentionInfo {
  id: string;
  time: string;
  post: Pick<PostInfo, 'id' | 'url' | 'title' | 'type' | 'text' | 'board' | 'space' | 'by' | 'issue' | 'chat' | 'score'>;
  /** weave_show by an agent, or a link in a Claude Code session. */
  source: 'agent' | 'claude-code';
  /** The agent that showed it (weave_show). */
  agent?: string;
  /** For claude-code: the session, and the folder it works in. */
  session?: { id: string; folder?: string };
  /** What the agent said about it (weave_show). */
  note?: string;
}

/** A session, as a tool or the app names it: its provider (default claude-code) and id, plus what's known about it. */
export interface SessionRef {
  provider?: string;
  id: string;
  /** The provider's other id for it, e.g. the Claude app's local_… id. */
  host?: string;
  folder?: string;
}

/** A work item on a session's stack. */
export type StackPost = Pick<PostInfo, 'id' | 'url' | 'title' | 'type' | 'board' | 'space' | 'issue' | 'prompt'>;

/**
 * An agent session and its stack of work items: the top one is what it's on
 * now, the ones below wait for it. Kept sealed to you, on all your devices.
 */
export interface SessionInfo {
  provider: string;
  id: string;
  host?: string;
  folder?: string;
  /** Its name with the provider (the Claude app's sidebar title), when known. */
  title?: string;
  /** Top first. A post you can no longer see is listed by id only. */
  stack: Array<{ post: StackPost | { id: string; missing: true }; since: string }>;
  /** When its stack last changed. */
  time: string;
}

/** Whether Weave follows your Claude Code sessions for links to posts. */
export interface ClaudeCodeFollow {
  on: boolean;
  /** Where Claude Code keeps its transcripts here, and whether it exists. */
  dir: string;
  found: boolean;
}

/** One of your agents asking to sign more kinds of events; you allow or decline it in the Inbox. */
export interface PermissionRequest {
  id: string;
  agent: string;
  /** The kinds it asks for (only those it doesn't have yet). */
  kinds: string[];
  /** What it wants to do with them, in its words. */
  reason: string;
  time: string;
  state: 'pending' | 'allowed' | 'declined';
}

export interface CoauthorRequest {
  post: { id: string; short: string; title: string; space?: SpaceRef };
  by: Actor;
  /** Set when it names your agent rather than you. */
  agent?: string;
  time: string;
}

/** A live room in a project: a host shares the project's app, players use it through a tunnel. */
/** How a project's app reaches the app API on the host's computer (see appapi.ts): set in its environment when Weave starts it. */
export interface AppEnv {
  WEAVE_API: string;
  WEAVE_TOKEN: string;
  WEAVE_PROJECT: string;
}

/** A person as the app API shows them to an app. */
export interface AppPerson {
  did: Did;
  name?: string;
  /** The host: whoever runs the app on this computer. */
  host: boolean;
  member: boolean;
  maintainer: boolean;
}

/** Starting the project's app on this computer (see the manifest's start.command). */
export interface AppLaunchInfo {
  /** The command from the manifest, if it has one. */
  command?: string[];
  hint?: string;
  /** This computer's copy of the app, if chosen. */
  folder?: string;
  /** You approved this command for this folder. */
  approved: boolean;
  running: boolean;
  started?: string;
  /** `stopped`: on request, not by itself. */
  exit?: { code: number | null; time: string; stopped?: true };
  /** The app's last lines of output. */
  log: string[];
  /** Settings the app asks hosts for (an API key…), and whether this computer has a value; values never leave this computer. */
  settings?: Array<AppSetting & { set: boolean }>;
  /** You may point the app at a GitHub release (a maintainer), and the repository its releases come from. */
  release?: { canRelease: boolean; repo?: string };
  /** Getting the app: its release, the file for this computer, and steps for an agent. */
  install?: {
    /** The release's tag. */
    version?: string;
    /** owner/name on GitHub. */
    repo?: string;
    /** The release file for this computer, if there is one. */
    asset?: { file: string; size?: number };
    /** This computer, as manifests name platforms (win32-x64…). */
    platform: string;
    /** The version Weave installed here (when the app folder is that install). */
    installed?: string;
    /** An install going on now. */
    progress?: { state: 'downloading' | 'unpacking'; done: number; total?: number };
    /** Why the last install failed. */
    error?: string;
    /** For an agent, installing it by hand. */
    steps?: string[];
    /** The GitHub App the release downloads through, when it isn't the one you sign in with. */
    otherApp?: string;
    /** What the installed release build starts with on this computer. */
    command?: string[];
  };
}

export interface RoomInfo {
  id: string;
  project: SpaceRef;
  name: string;
  host: Person;
  /** You host it. */
  mine: boolean;
  open: boolean;
  /** You are invited (every participant, or named people). */
  mayJoin: boolean;
  /** You joined it (players) or are hosting it right now (host). */
  joined: boolean;
  /** Players: accepted by the host. Host: listening for players. */
  connected: boolean;
  /** Who is in it right now, as far as you can see (only once you're in). */
  peers: Person[];
  app?: { app: string; name: string; startHint?: string; canLaunch?: boolean };
  /** The shared service, the label of your ▶ button, and (host) whether the app answers on its port. */
  service?: { id: string; label: string; ready: boolean };
  /** What ▶ opens, once there is something to open. */
  url?: string;
  time: string;
}

/** A message in a room's chat: never stored, gone when the room ends. */
export interface RoomChatMessage {
  id: string;
  by: Person;
  text: string;
  time: string;
  mine: boolean;
}

/** A direct chat with a friend. */
export interface ChatInfo {
  /** The chat as a space: use its id with messages, say and react. */
  space: SpaceInfo;
  peer: Person;
  /** Still friends; if not, the chat is read-only. */
  friend: boolean;
  last?: { text: string; time: string; mine: boolean };
}

/** Someone a project's maintainers are asked about. */
export interface Admission {
  project: SpaceRef;
  did: Did;
  name?: string;
  group: SpaceRef;
  /** join: they joined an invited group · leave: they left the group they came through. */
  change: 'join' | 'leave';
}

export interface MemberInfo {
  did: Did;
  name?: string;
  invitedBy?: Did;
  invitedByName?: string;
  /** Project participants who came in through a group. */
  via?: SpaceRef;
  maintainer?: true;
  since: string;
  /** Time of their latest event in the space. */
  lastActive?: string;
  /** Names of their agents seen acting in the space. */
  agents: string[];
}

export interface Person {
  did: Did;
  name?: string;
}

/** Someone's hub (their profile page) as this node sees it. */
export interface Profile {
  did: Did;
  name?: string;
  theme: Theme;
  me: boolean;
  /** I follow them. */
  following: boolean;
  /** They follow me. */
  followsMe: boolean;
  blocked: boolean;
  muted: boolean;
  /** In your address book (added by contact link). */
  contact: boolean;
  /** Number of public posts. */
  posts: number;
  /** Projects they show publicly. */
  projects: PublicProject[];
  /** The GitHub account they show on their hub. */
  github?: HubGitHub;
}

export interface HubGitHub {
  login: string;
  url: string;
  /** A gist of that account names their did. False when it doesn't (then it isn't shown); undefined when GitHub couldn't be asked. */
  verified?: boolean;
}

export interface ProfileInput {
  name?: string;
  theme?: Partial<Theme>;
}

/** Who did something: the person, and the agent if one acted for them. */
export interface Actor {
  did: Did;
  name?: string;
  agent?: string;
}

export interface ReactionInfo {
  emoji: string;
  count: number;
  /** You (or one of your agents) reacted with this. */
  mine: boolean;
  /** Display names of who reacted, agents as "Martin · forge". */
  by: string[];
}

export interface ChannelInfo {
  name: string;
  topic: string;
  last?: string;
}

export interface ReplyInfo {
  id: string;
  by: Actor;
  text: string;
  time: string;
}

export interface ThreadInfo {
  id: string;
  /** First characters of the id; enough to refer to it in the CLI. */
  short: string;
  by: Actor;
  title: string;
  text: string;
  time: string;
  active: string;
  replies: ReplyInfo[];
}

export interface MessageInfo {
  id: string;
  short: string;
  by: Actor;
  text: string;
  time: string;
  channel: string;
  /** The message this one answers, if it is still known. */
  replyTo?: { id: string; by: Actor; text: string };
  reactions: ReactionInfo[];
}

export interface IssueInfo {
  id: string;
  short: string;
  by: Actor;
  title: string;
  text: string;
  labels: string[];
  status: IssueStatus;
  assignee?: Actor;
  time: string;
  replies: ReplyInfo[];
}

export interface ProposalInfo {
  id: string;
  short: string;
  by: Actor;
  title: string;
  text: string;
  deadline: string;
  time: string;
  yes: number;
  no: number;
  abstain: number;
  voted: number;
  eligible: number;
  quorum: number;
  quorumReached: boolean;
  closed: boolean;
  passed: boolean;
  /** How your vote counts: directly, or through the participant you delegated to. */
  myVote?: { choice: Choice; via?: Actor };
  replies: ReplyInfo[];
}

/** Anything you can say in a group or project: where, and optionally an agent to sign with. */
export interface InSpace {
  space: string;
  as?: string;
}

/** Work that only happens in projects. */
export interface InProject {
  project: string;
  as?: string;
}

export interface Social {
  following: Person[];
  followers: Person[];
  friends: Person[];
  blocked: Person[];
  muted: Person[];
}

export type Edge = 'follow' | 'block' | 'mute';

export interface EdgeInput {
  edge: Edge;
  /** A did:key or a known profile name. */
  who: string;
  on: boolean;
  /** Seal the edge so only your own nodes can read it. Default: public for follow, private for block and mute. */
  private?: boolean;
}

/**
 * What the CLI, the desktop app and agents can do with a node. Implemented
 * locally by WeaveNode and remotely, over the daemon's HTTP API, by ApiClient.
 *
 * A group is a collection of people with its own chat. A project is something
 * being built: participants (people and whole groups) chat, discuss, vote and
 * work on issues, and maintainers decide who takes part.
 */
export interface Backend {
  whoami(): Promise<Whoami>;
  publish(input: PublishInput): Promise<FeedItem>;
  feed(query?: FeedQuery): Promise<FeedItem[]>;
  addAgent(name: string, permissions: string[]): Promise<AgentInfo>;
  join(topic: string): Promise<void>;
  status(): Promise<Status>;
  /** Calls `onItem` for every newly accepted event this node can read, until `signal` aborts. */
  watch(onItem: (item: FeedItem) => void, signal: AbortSignal): Promise<void>;

  // groups and projects
  spaces(kind?: SpaceKind): Promise<SpaceInfo[]>;
  createGroup(name: string): Promise<SpaceInfo>;
  createProject(input: { name: string; description?: string }): Promise<ProjectInfo>;
  /** An invite link for a group (any member) or a project (maintainers), valid for `hours`. */
  invite(space: string, hours?: number, options?: InviteOptions): Promise<string>;
  /** Join with an invite link; with a link that needs the inviter's OK, ask to be let in (`note` goes with the request). */
  joinSpace(invite: string, note?: string): Promise<SpaceInfo>;
  /** People asking to join with your links that need your OK. */
  knocks(): Promise<KnockInfo[]>;
  /** Let someone in (or turn them away) who asked with your link. */
  answerKnock(input: { knock: string; accept: boolean }): Promise<void>;
  /** Maintainers: limit who reads and writes a board, by name or did:key, and groups as "group:<name>"; null opens it to everyone. */
  setBoardAccess(input: { project: string; board: string; read?: string[] | null; write?: string[] | null }): Promise<BoardInfo[]>;
  members(space: string): Promise<MemberInfo[]>;
  /** A pairing code (for a QR code) that lets a phone use this node; valid for ten minutes, once. Needs the node online. */
  pairPhone(): Promise<{ link: string; expires: string }>;
  /** Phones paired with this node, and whether each is connected right now. */
  phones(): Promise<Array<{ key: string; name: string; paired: string; lastSeen?: string }>>;
  /** Unpair a phone: it's disconnected at once and refused from then on. */
  unpairPhone(key: string): Promise<void>;
  /** Follow a project's board, or stop: its posts come to your Home and notify you. Private, like Home visibility. */
  followBoard(input: { project: string; board: string; on: boolean }): Promise<BoardInfo[]>;
  /** Show a community or project on your Home, or not. Private: sealed to you, it follows you to your other devices. */
  setHomeVisibility(input: { space: string; visible: boolean }): Promise<SpaceInfo>;
  /** Leave a group, project or community: you stop receiving it, and its key rotates. The owner hands it over first. */
  leave(space: string): Promise<void>;
  /** The owner makes another member the owner (in projects and communities also a maintainer). */
  handOver(input: { space: string; to: string }): Promise<SpaceInfo>;
  /** Owner (groups) or maintainers: close a space (kept, read-only) or open it again. */
  closeSpace(input: { space: string; closed: boolean }): Promise<SpaceInfo>;
  /** Group founder or project maintainer: remove someone and rotate the key. */
  removeMember(space: string, who: string): Promise<void>;

  // GitHub: repositories that follow a space's membership
  /** Your GitHub sign-in on this device, and a sign-in waiting for its code. */
  github(): Promise<GitHubInfo>;
  /** Start signing in to GitHub: a code to enter on github.com. Ask github() until it's done. */
  connectGithub(): Promise<GitHubInfo>;
  /** Forget the GitHub sign-in on this device. Repos you linked stop following their spaces until you connect again. */
  disconnectGithub(): Promise<GitHubInfo>;
  /** Sign in through your own GitHub App (its page link, https://github.com/apps/<name>), or null for Weave Connect. Signs you out of the other one. */
  setGithubApp(app: string | null): Promise<GitHubInfo>;
  /** Repositories you can link: those the Weave GitHub app is installed on, which you administer. */
  githubRepos(): Promise<string[]>;
  /** A space's repositories, and whether you gave it your GitHub account. */
  spaceRepos(space: string): Promise<SpaceRepos>;
  /** Owner or maintainers: let a repo follow a space (or, in a project, the readers of one board); on: false unlinks it. Uses your GitHub sign-in. */
  linkRepo(input: { space: string; repo: string; board?: string; on: boolean; as?: string }): Promise<SpaceRepos>;
  /** Give a space your GitHub account (the one you're signed in with), so its repos invite you; on: false takes it back. */
  shareGithub(input: { space: string; on: boolean; as?: string }): Promise<SpaceRepos>;
  /** Show the GitHub account you're signed in with on your hub (proven by a public gist naming your did), or (on: false) stop. */
  showGithubOnHub(input: { on: boolean }): Promise<Profile>;

  // communities
  createCommunity(input: { name: string; description?: string }): Promise<CommunityInfo>;
  community(ref: string): Promise<CommunityInfo>;
  /** Moderators: change the description. */
  setCommunity(input: { community: string; description: string }): Promise<CommunityInfo>;
  setModerator(input: { community: string; who: string; on: boolean }): Promise<void>;

  // posts, boards and upvotes
  posts(query?: PostsQuery): Promise<PostInfo[]>;
  /** One post by id (full or short), including projects. */
  post(ref: string): Promise<PostInfo>;
  /** Post into a community or into a project's board; in an issues or proposals board this opens an issue or a proposal. */
  /** `with`: co-authors to name (people by name or did:key, your agents by name, others' as "person·agent"); each confirms before showing. */
  /** prompt: as a work item, what a session should do with it (its starting prompt). */
  submit(input: { space: string; board?: string; title: string; text?: string; link?: string; image?: string; with?: string[]; prompt?: string; as?: string }): Promise<PostInfo>;
  /** Confirm (or decline) being a co-author of a post that names you, or (with `as`) your agent. */
  confirmCoauthor(input: { post: string; on: boolean; as?: string }): Promise<PostInfo>;
  /** Posts that name you or one of your agents as co-author and wait for an answer. */
  coauthorRequests(): Promise<CoauthorRequest[]>;
  /** Agent harnesses installed on this computer, and whether you've been asked once to connect them. */
  harnesses(): Promise<{ offered: boolean; harnesses: HarnessInfo[] }>;
  /**
   * Tell a harness about Weave (on) or take Weave out of it (off): its MCP config gets an entry "weave"
   * running this installation's CLI as the harness's agent, which is created if missing (it may post,
   * reply, chat and react). The file is backed up first. Also marks the offer as answered.
   */
  connectHarness(input: { harness: string; on: boolean }): Promise<{ offered: boolean; harnesses: HarnessInfo[] }>;
  /** Not now: don't offer connecting harnesses again (Keys & devices still can). */
  dismissHarnesses(): Promise<void>;
  /** Change what one of your agents may sign (e.g. add weave.post.coauthor to let it confirm co-authorships). */
  updateAgent(input: { name: string; permissions: string[] }): Promise<AgentInfo>;
  /** An agent asks its person to let it sign more kinds; the request waits in their Inbox (or is already answered). */
  requestPermission(input: { as: string; kinds: string[]; reason?: string }): Promise<PermissionRequest>;
  /** Bring the Weave app on this computer to the front, at a space, its Link a repository dialog or the Inbox: for steps only the person can take. */
  openInApp(input: { what: AppOpen['what']; space?: string; repo?: string; post?: string }): Promise<AppOpen>;
  /** Show posts to your person in Weave's Mentions panel, newest first, with an optional note. Nothing is posted. */
  showPosts(input: { posts: string[]; note?: string; as?: string }): Promise<MentionInfo[]>;
  /** The Mentions panel: posts agents pointed to on this computer, newest first. */
  mentions(): Promise<MentionInfo[]>;
  /** Follow your Claude Code sessions for links to posts (reads the agent's answers in its transcripts, here only), or stop. */
  followClaudeCode(input: { on: boolean }): Promise<ClaudeCodeFollow>;
  claudeCode(): Promise<ClaudeCodeFollow>;
  /** Sessions with work items, the latest changed first. */
  sessions(): Promise<SessionInfo[]>;
  /** The session the Claude app shows right now (while Follow Claude Code is on), with its stack. */
  focusedSession(): Promise<SessionInfo | null>;
  /** One session and its stack (an empty stack if it has none yet). */
  session(input: SessionRef): Promise<SessionInfo>;
  /**
   * Put a work item on top of a session's stack: an existing post, or a new one (`create`, posted in its
   * project or community). Whatever was on top waits below until this one is done.
   */
  workOn(input: { session: SessionRef; post?: string; create?: { space: string; board?: string; title: string; text?: string; prompt?: string }; as?: string }): Promise<SessionInfo>;
  /** Take a work item off a session's stack (the top one if none is named); the next one comes back up. `close` marks an issue done. */
  doneWith(input: { session: SessionRef; post?: string; close?: boolean; as?: string }): Promise<SessionInfo>;
  /** Rearrange a session's stack: these posts first, in this order; `remove` takes posts off. */
  restack(input: { session: SessionRef; posts?: string[]; remove?: string[] }): Promise<SessionInfo>;
  /** Your agents' requests waiting for your answer. */
  permissionRequests(): Promise<PermissionRequest[]>;
  /** Allow (adds the kinds to the agent) or decline an agent's request. */
  answerPermission(input: { id: string; allow: boolean }): Promise<PermissionRequest>;
  /** Your own post: change its title, text, link or image (empty removes a link or image), or name its co-authors anew (`with`, as in submit; [] for none). Leave out what stays. */
  editPost(input: { post: string; title?: string; text?: string; link?: string; image?: string; with?: string[]; prompt?: string; as?: string }): Promise<PostInfo>;
  /** Take a post down: your own, or any in a space you maintain or moderate. It stays in the logs, out of sight. */
  deletePost(input: { post: string; as?: string }): Promise<void>;
  /** 1 up, -1 down, 0 to take your vote back. */
  upvote(input: { target: string; value: number; as?: string }): Promise<PostInfo>;
  /** Save a post for later, pin it to the top of your home, or (null) forget it. Only you can see this. */
  save(input: { target: string; mode: SaveMode | null }): Promise<void>;
  /** Share a post into a community or group you're in; projects can also go to your followers when their page is public. */
  share(input: { post: string; to: string; text?: string }): Promise<PostInfo>;
  boards(space: string): Promise<BoardInfo[]>;
  /** Maintainers: add, rename, re-sort, move (position) or drop (on: false) a board. */
  setBoard(input: { project: string; name: string; title?: string; type?: BoardType; sort?: PostSort; position?: number; on?: boolean }): Promise<BoardInfo[]>;
  /** Maintainers or moderators: pin posts to the top of a board, in this order (empty unpins all). */
  curate(input: { space: string; board?: string; pinned: string[] }): Promise<BoardInfo[]>;

  // projects
  project(ref: string): Promise<ProjectInfo>;
  setProjectPage(input: { project: string; as?: string } & Partial<ProjectPage>): Promise<ProjectInfo>;
  /** Store an image (base64) encrypted; returns its wblob: reference to put in a post or page. */
  putBlob(input: { data: string; type: string }): Promise<string>;
  /** An image by its wblob: reference, from disk or fetched from peers; base64. */
  blob(ref: string): Promise<{ data: string; type: string }>;
  setMaintainer(input: { project: string; who: string; on: boolean }): Promise<void>;
  /** Invite a whole group into a project; its current members take part right away. */
  inviteGroup(input: { project: string; group: string }): Promise<void>;
  /** Stop inviting a group's newcomers; people already in stay. */
  uninviteGroup(input: { project: string; group: string }): Promise<void>;
  /** Admit (or stop admitting) a group's newcomers without asking. */
  setRule(input: { project: string; group: string; auto: boolean }): Promise<void>;
  /** People the maintainers are asked about: newcomers to invited groups, and those who left them. */
  admissions(project?: string): Promise<Admission[]>;
  /** Let a group newcomer in; `always` also admits the group's future newcomers, in every project you maintain that invited it. */
  admit(input: { project: string; who: string; group: string; always?: boolean }): Promise<void>;
  decline(input: { project: string; who: string; group: string }): Promise<void>;

  // people
  setEdge(input: EdgeInput): Promise<void>;
  social(): Promise<Social>;
  /** A person's hub; defaults to your own. */
  profile(who?: string): Promise<Profile>;
  /** Update your name and/or theme. */
  setProfile(input: ProfileInput): Promise<Profile>;
  /** Everyone whose profile this node has seen and everyone in your address book, yourself excluded; `query` matches names and ids. */
  directory(query?: string): Promise<Profile[]>;
  /** Your contact link: your address, to send to people however you like. Holds no keys. */
  contactLink(): Promise<string>;
  /** Add someone by their contact link (or a message containing it): connect to their node, follow them, keep them in your address book. */
  addContact(link: string): Promise<Profile>;

  // identity and keys
  identityInfo(): Promise<IdentityInfo>;
  /** Your devices and agents. */
  keys(): Promise<KeyInfo[]>;
  /**
   * Revoke a device or agent (did or name): its events after `since` (a time; default now) are void.
   * Devices need your recovery words; agents can be revoked from this device. Revoking this device's
   * own key gives this computer a fresh one.
   */
  revokeKey(input: { key: string; since?: string; words?: string }): Promise<KeyInfo[]>;
  /** Rotate to the next root key from your recovery words; with `encryption`, also to a new encryption key. */
  rotateRoot(input: { words: string; encryption?: boolean }): Promise<IdentityInfo>;

  // rooms and shared apps: live, never logged (except the room announcement)
  /** The app a project shares in its rooms, if a maintainer published one. */
  projectApp(project: string): Promise<AppManifest | null>;
  /** Maintainers: publish (or replace) the project's app manifest (the contents of weave.app.json). */
  /** Maintainers: publish the app manifest; `folder` (from the CLI) is remembered as this computer's copy of the app. */
  publishApp(input: { project: string; manifest: unknown; folder?: string; as?: string }): Promise<AppManifest>;
  /** Starting the app here: its command, your folder, whether you approved it, and whether it runs. */
  appLaunch(project: string): Promise<AppLaunchInfo>;
  /**
   * Install (or update) the project's app from its release on GitHub: the file for this computer is
   * downloaded, checked against the SHA-256 in the manifest, and unpacked into Weave's apps folder,
   * which becomes the app's folder. `approve` also approves its start command there. Ask appLaunch for progress.
   */
  installApp(input: { project: string; approve?: boolean }): Promise<AppLaunchInfo>;
  /** Maintainers: point the app's manifest at a release on GitHub (by tag); each file is fingerprinted once. `assets`: platform → file name, when names don't say. */
  releaseApp(input: { project: string; tag: string; repo?: string; assets?: Record<string, string>; as?: string }): Promise<AppManifest>;
  /** The GitHub releases a project's app can be pointed at: its repository's recent ones, newest first. */
  appReleases(project: string): Promise<{ repo: string; releases: Array<{ tag: string; name: string; published?: string; files: number; prerelease: boolean }>; releaseWorkflow?: boolean }>;
  /** Where this computer's copy of the project's app is (it must hold its weave.app.json); "" forgets it. */
  setAppFolder(input: { project: string; folder: string }): Promise<AppLaunchInfo>;
  /** Start the app with the manifest's command in your folder. The first time (and after the command changes), pass approve: true once you've shown the person the command. */
  launchApp(input: { project: string; approve?: boolean }): Promise<AppLaunchInfo>;
  stopApp(project: string): Promise<AppLaunchInfo>;
  /**
   * Fill in one of the settings the app's manifest asks for (value: null clears it). Kept on this computer only,
   * in app-settings.json, and handed to this app alone when Weave starts it; never synced, shown or given to agents.
   */
  setAppSetting(input: { project: string; name: string; value: string | null }): Promise<AppLaunchInfo>;
  /** The app API's address and this project's token, for an app started by hand (Weave sets them itself when it starts the app). Valid until Weave restarts. */
  appEnv(project: string): Promise<AppEnv>;
  /** Rooms in a project (or all your projects); ended ones are left out. */
  rooms(project?: string): Promise<RoomInfo[]>;
  /** Open a room sharing the project's app; `invite` names people, default: every participant. Needs your node online. */
  hostRoom(input: { project: string; name: string; invite?: string[] }): Promise<RoomInfo>;
  endRoom(room: string): Promise<void>;
  /** Join a room: connect to the host and open the local tunnel; RoomInfo.url is what to open. */
  joinRoom(room: string): Promise<RoomInfo>;
  leaveRoom(room: string): Promise<void>;
  roomChat(room: string): Promise<RoomChatMessage[]>;
  sayInRoom(input: { room: string; text: string }): Promise<void>;

  // memberships: tiers offered by creators, Patreon-style; they buy access, never votes
  /** Offer a tier: a group whose members get its chat and every project it's invited into. */
  createTier(input: { name: string; price?: number; currency?: string; description?: string; benefits?: string[]; auto?: boolean; gumroad?: GumroadLink | null }): Promise<TierInfo>;
  /** Change a tier, close it to new members (open: false) or take it off your hub (hidden: true). */
  setTier(input: { tier: string; name?: string; price?: number; currency?: string; description?: string; benefits?: string[]; position?: number; open?: boolean; auto?: boolean; hidden?: boolean; gumroad?: GumroadLink | null }): Promise<TierInfo>;
  /** The tiers someone offers (default: you). */
  tiers(who?: string): Promise<TierInfo[]>;
  /** Ask a creator to let you into a tier; `note` is for them, e.g. how you paid. Only they can read it. */
  /** Ask to join a tier; for tiers sold through Gumroad, send the license key from your receipt and you're in as soon as the creator's node checked it. */
  requestMembership(input: { tier: string; note?: string; license?: string }): Promise<void>;
  /** Requests waiting for you, as a creator. */
  membershipRequests(): Promise<MembershipRequestInfo[]>;
  /** Let someone into a tier (or renew them) for some months; their node gets the tier's keys. */
  grantMembership(input: { tier: string; who: string; months: number }): Promise<TierInfo>;
  declineMembership(input: { tier: string; who: string }): Promise<void>;
  /** Tiers you're a member of, as a supporter. */
  memberships(): Promise<TierInfo[]>;

  // direct chats between friends
  /** Your direct chats: every friend, and anyone you've written to, most recent first. */
  chats(): Promise<ChatInfo[]>;
  /** The direct chat with a friend (someone you follow who follows you back). */
  openChat(who: string): Promise<SpaceInfo>;

  // chat, in channels and in posts
  channels(space: string): Promise<ChannelInfo[]>;
  createChannel(input: InSpace & { name: string; topic?: string }): Promise<ChannelInfo>;
  /** A channel's messages, or with `post` that post's chat (the space is then taken from the post). */
  messages(space: string | undefined, options?: { channel?: string; post?: string; limit?: number }): Promise<MessageInfo[]>;
  say(input: { space?: string; as?: string; text: string; channel?: string; post?: string; replyTo?: string }): Promise<MessageInfo>;
  /** Add (or with on: false remove) an emoji reaction on a message, post, thread, reply, issue or proposal. */
  react(input: { target: string; emoji: string; on?: boolean; as?: string }): Promise<void>;

  // working together, in projects
  threads(project: string): Promise<ThreadInfo[]>;
  startThread(input: InProject & { title: string; text?: string }): Promise<ThreadInfo>;
  /** Reply to a thread, issue or proposal (full or short id); it lands in the same project. */
  reply(input: { target: string; text: string; as?: string }): Promise<ReplyInfo>;
  issues(project: string): Promise<IssueInfo[]>;
  openIssue(input: InProject & { title: string; text?: string; labels?: string[]; board?: string; prompt?: string }): Promise<IssueInfo>;
  claimIssue(input: { issue: string; as?: string }): Promise<IssueInfo>;
  setIssueStatus(input: { issue: string; status: IssueStatus; as?: string }): Promise<IssueInfo>;
  proposals(project: string): Promise<ProposalInfo[]>;
  propose(input: InProject & { title: string; text?: string; hours?: number; quorum?: number; board?: string }): Promise<ProposalInfo>;
  vote(input: { proposal: string; choice: Choice; as?: string }): Promise<ProposalInfo>;
  /** Let someone's votes in this project count for you when you don't vote; `who` undefined clears it. */
  delegateVote(input: { project: string; who?: string }): Promise<void>;
  /** Whose votes count for yours in this project, if anyone's. */
  votingDelegate(project: string): Promise<Actor | null>;
}

/** Backend methods callable over the daemon's API (watch is a separate event stream). */
export type RpcMethod = Exclude<keyof Backend, 'watch'>;

export const RPC_METHODS: readonly RpcMethod[] = [
  'whoami', 'publish', 'feed', 'addAgent', 'updateAgent', 'join', 'status',
  'spaces', 'createGroup', 'createProject', 'invite', 'joinSpace', 'pairPhone', 'phones', 'unpairPhone', 'setHomeVisibility', 'followBoard', 'leave', 'handOver', 'closeSpace', 'knocks', 'answerKnock', 'setBoardAccess', 'members', 'removeMember',
  'github', 'connectGithub', 'disconnectGithub', 'setGithubApp', 'githubRepos', 'spaceRepos', 'linkRepo', 'shareGithub', 'showGithubOnHub',
  'createCommunity', 'community', 'setCommunity', 'setModerator',
  'posts', 'post', 'submit', 'confirmCoauthor', 'coauthorRequests', 'editPost', 'deletePost', 'upvote', 'save', 'share', 'boards', 'setBoard', 'curate',
  'project', 'setProjectPage', 'putBlob', 'blob', 'setMaintainer', 'inviteGroup', 'uninviteGroup', 'setRule', 'admissions', 'admit', 'decline',
  'setEdge', 'social', 'profile', 'setProfile', 'directory', 'contactLink', 'addContact',
  'identityInfo', 'keys', 'revokeKey', 'rotateRoot', 'harnesses', 'connectHarness', 'dismissHarnesses', 'requestPermission', 'permissionRequests', 'answerPermission', 'openInApp', 'showPosts', 'mentions', 'followClaudeCode', 'claudeCode', 'sessions', 'session', 'focusedSession', 'workOn', 'doneWith', 'restack',
  'projectApp', 'publishApp', 'appLaunch', 'setAppFolder', 'installApp', 'releaseApp', 'appReleases', 'launchApp', 'stopApp', 'setAppSetting', 'appEnv', 'rooms', 'hostRoom', 'endRoom', 'joinRoom', 'leaveRoom', 'roomChat', 'sayInRoom',
  'createTier', 'setTier', 'tiers', 'requestMembership', 'membershipRequests', 'grantMembership', 'declineMembership', 'memberships',
  'chats', 'openChat',
  'channels', 'createChannel', 'messages', 'say', 'react',
  'threads', 'startThread', 'reply', 'issues', 'openIssue', 'claimIssue', 'setIssueStatus',
  'proposals', 'propose', 'vote', 'delegateVote', 'votingDelegate',
];
