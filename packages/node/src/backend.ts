import type { CompanyAction, CompanyPolicy } from './company.ts';
import type { AuditSinkInput } from './auditsinks.ts';
import type { Builtin, GumroadLink, OnchainPrice, VisitorRule } from '@weave/core';
import type { AppImage, AppManifest, AppSetting, RoomPages, BoardType, Choice, Did, HistorySetting, IssueStatus, Json, Lifetime, PostSort, RepoAccess, SaveMode, ServiceContract, SpaceKind } from '@weave/core';

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
  type: 'dm' | 'mention' | 'reply' | 'coauthor' | 'knock' | 'membership' | 'post' | 'issue' | 'proposal' | 'permission' | 'badge' | 'routine';
  category: NoticeCategory;
  title: string;
  text: string;
  /** Where it leads: the Inbox, a space's channel, a post (by id), or someone's hub. */
  open: { inbox?: true; space?: SpaceRef; channel?: string; post?: string; hub?: Did };
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
  /** A company-owned identity: the company that holds it. */
  company?: { did: Did; name?: string };
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
  /** Events this node held back since it started: their authors were over their budget in that space (stage 8). */
  heldBack: number;
  /** Where this home's keys are protected: the OS keystore (dpapi, keychain, secret-service), hardware (tpm, secure-enclave, yubikey), the company's key service, or nowhere (file). */
  keystore: KeystoreKind;
  /** Said when the keys aren't protected by the operating system. */
  keystoreWarning?: string;
}

/** Where a home's key is kept (stage 2, 14, 17). */
export type KeystoreKind = 'dpapi' | 'keychain' | 'secret-service' | 'file' | 'kms' | 'tpm' | 'secure-enclave' | 'yubikey';

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
  /** What newcomers get to read: everything (all), the last 30 days (30d), or from their invite on (joining). */
  history: HistorySetting;
  /** A legal hold: nothing in it is shredded or forgotten until then. */
  hold?: { until: string; reason: string };
  /** A company's key service holds half of its keys: which one, and whether this computer has them unlocked; the agents approved there. */
  managed?: { agents: string[]; provider: string; unlocked: boolean; ttlMinutes: number; graceHours: number; attestor?: Did; problem?: string };
  /** You unfollowed it: off your Home, and no notifications about its new posts (only you know). */
  hiddenFromHome?: true;
  /** What people's agents and services may do here, as those who manage it set it, and the keys they approved (person/name). */
  visitors?: { agents: VisitorRule; services: VisitorRule; approved: string[] };
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

export interface GumroadInfo {
  /** This copy of Weave knows the Weave application on Gumroad (it has its client ID), so it can connect in the browser. */
  available: boolean;
  /** The Gumroad account connected on this device. */
  account?: string;
  /** A connection waiting for the person to allow Weave on Gumroad: open this. */
  pending?: { url: string };
  /** Why the last connection didn't work. */
  error?: string;
}

export interface RepoInfo {
  /** owner/name */
  repo: string;
  url: string;
  /** Only readers of this board, not the whole project. */
  board?: string;
  /** read: members get read access; none: just linked; write: the people picked (writers) can write. */
  access: RepoAccess;
  writers?: Actor[];
  /** It gives you access, once you give the space your GitHub account. */
  forYou?: true;
  /** Who linked it; their node invites and removes people. */
  by: Actor;
  /** You linked it: your GitHub sign-in keeps it in step. */
  mine?: true;
  /** For your own: when it was last brought in step, and what went wrong if it didn't. */
  synced?: string;
  problem?: string;
}

/** A service this node runs (yours): code under a key of its own, with exactly its contract's rights. */
export interface ServiceInfo {
  name: string;
  /** Its own key: what it signs shows as "you · name". */
  did: Did;
  description: string;
  icon?: string;
  contract: ServiceContract;
  /** The spaces it was added to: the only ones it reads and writes in; with the names of the settings given for each. */
  spaces: Array<SpaceRef & { settings?: string[] }>;
  /** What runs it on this node, if anything does (else something else uses its token). */
  command?: string[];
  /** Or its own code as a WebAssembly component, which Weave runs itself, sandboxed: the .wasm file. */
  wasm?: string;
  /** Its website's files, which Weave serves next to its players' connections: the folder. */
  site?: string;
  /** One Weave ships and runs itself: the room service, with the rooms it runs here. */
  builtin?: Builtin;
  websites?: HostedWebsiteInfo[];
  /** An applet: the release it runs, pinned; `latest` when its project released a newer one. */
  artifact?: ServiceArtifactInfo;
  /** The names of its settings (the values stay on this node). */
  settings: string[];
  enabled: boolean;
  running: boolean;
  /** It runs on one of your always-on nodes, not here: its key and settings are there only. */
  node?: { did: Did; name: string };
}

/** A Weave service a catalog lists: where it comes from, its image (what installing it reads the manifest from), and whether it runs here. */
export interface CatalogEntryInfo {
  id: string;
  /** The space that lists it. */
  catalog: SpaceRef;
  app: string;
  name: string;
  summary: string;
  /** The release it comes from, as the entry says (the project's name only if you're in it). */
  origin: { project: { id: string; name?: string }; release: string; tag: string };
  image: AppImage;
  /** The maintainer who listed it. */
  by: Actor;
  time: string;
  /** The service on this node that runs this image, if one does. */
  installed?: string;
}

/** The release an applet runs, and how fetching it went. */
export interface ServiceArtifactInfo {
  project: { id: string; name?: string };
  tag: string;
  app: string;
  name: string;
  latest?: string;
  /** Its files are here, checked against the release's fingerprints (or it runs as a container). */
  installed: boolean;
  /** Who delivered its files here: a provider in its project, or GitHub itself. */
  deliveredBy?: string;
  progress?: { state: 'downloading' | 'unpacking'; done: number; total?: number };
  error?: string;
  /** The settings it asks for. */
  settings: AppSetting[];
}

/** A room the room service runs here: what answers its clients (its handler), and how that's doing. */
export interface HostedWebsiteInfo {
  id: string;
  project: SpaceRef;
  name: string;
  /** Where what answers it listens on this computer. */
  port: number;
  /** What answers it: a service of this device (it serves it), or something you run yourself at the port. */
  handler: { kind: 'service'; service: string } | { kind: 'address' };
  /** Something its host should know (what changed in Weave 0.21). */
  note?: string;
  running: boolean;
  /** Fetching the serving service's release, or why it doesn't run. */
  progress?: { state: 'downloading' | 'unpacking'; done: number; total?: number };
  error?: string;
}

/** A release of a project, as it can be started as a service. */
export interface ArtifactInfo {
  id: string;
  project: SpaceRef;
  tag: string;
  app: string;
  name: string;
  released: Actor;
  time: string;
  /** It has a web page: a website can run it. */
  website: boolean;
  /** An applet: installed, it becomes a service with exactly this contract. */
  applet?: ServiceContract;
  settings: AppSetting[];
  /** A Weave service: an image carrying its manifest, run in the sandbox only. */
  packaged?: true;
  /** How it would run on this node: its release file for this platform, or its container (Docker). */
  runs?: 'release' | 'container';
  /** What starting it here would run (shown before you approve it). */
  command?: string[];
}

/** A service someone runs, as anyone can see it: its public profile. */
export interface ServiceProfileInfo {
  did: Did;
  person: Actor;
  name: string;
  description: string;
  icon?: string;
  builtin?: Builtin;
  contract: ServiceContract;
  /** Where it comes from, as far as this node can tell. */
  origin: ServiceOriginInfo;
  time: string;
}

/**
 * Where a service comes from: Weave itself; a project's release (checked here when the project is known here: the
 * release is there, by a maintainer, running what the profile says; unknown otherwise); or code its person runs
 * without releasing it.
 */
export type ServiceOriginInfo =
  | { kind: 'weave' }
  | { kind: 'release'; project: { id: string; name?: string }; tag: string; release: string; checked: 'verified' | 'unmatched' | 'unknown'; publisher?: Actor; packaged?: true }
  | { kind: 'unreleased' };

/**
 * What a running service may do, through its own token on the node that runs it: who it is, what it reads (only
 * what its contract says, only in its spaces), and signing as itself, only the kinds it may write.
 */
export interface ServiceGate {
  /** Who it is, and its spaces with the settings given for each (its manifest's per-space settings). */
  me(): { name: string; did: Did; person: Did; contract: ServiceContract; spaces: Array<SpaceRef & { settings: Record<string, string> }> };
  /** What it may read, after `since` (an event time), oldest first. */
  events(since?: string): FeedItem[];
  watch(onItem: (item: FeedItem) => void, signal: AbortSignal): Promise<void>;
  publish(input: { space: string; kind: string; body?: Json }): Promise<FeedItem>;
  /** Answer a request addressed to it, in the request's space. */
  answer(input: { request: string; text?: string; data?: Json; error?: string }): Promise<FeedItem>;
  /** Serve a website (its contract says `website`): its process listens on `port`, and the project's website service makes it reachable. */
  serve(input: { space: string; port: number; name?: string; pages?: RoomPages }): Promise<WebsiteInfo>;
}

/** A request to a service in a space, and what the service answered. */
export interface ServiceRequestInfo {
  id: string;
  to: Actor;
  from: Actor;
  text: string;
  data?: Json;
  time: string;
  results: Array<{ id: string; text: string; data?: Json; error?: string; time: string }>;
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
  /** For those who may link: the members who may be picked to write (in personally, not through a group or tier). */
  mayWrite?: Actor[];
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
/** One line of a space's audit (stage 9). */
export interface AuditLine {
  /** The event's id: each line once, wherever it's sent. */
  id?: string;
  time: string;
  kind: string;
  by: Did;
  byName?: string;
  /** The key that signed it (a device or an agent of `by`). */
  signer: Did;
  agent?: string;
  /** What changed, without keys, boxes or wrapped parts. */
  detail: Json;
}

/** Keepers (stage 5): friends who keep a wrapped copy of your small spaces, and what you keep for friends. */
export interface KeepersInfo {
  spaces: Array<{ space: SpaceRef; keepers: Actor[] }>;
  /** Bytes you keep for others, and the most you would. */
  forOthers: number;
  quota: number;
}

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
  /** How long posts stay here, and who set that when; absent: they stay for good. */
  rule?: { keepDays: number | null; maxMB: number | null; by: Actor; time: string };
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
  /** The routine occurrence that made it. */
  routine?: { id: string; occurrence: string };
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
  /**
   * How long it stays (the board's rule, stretched by upvotes), or why it
   * stays for good. Your own posts stay on your devices regardless (yours).
   */
  lifetime?: Lifetime & { yours?: true };
  /**
   * In a space big enough that members hold its content between them (more
   * than 12 members): roughly who holds this post. An estimate from what every
   * node knows: its author, 3 members by share, those who upvoted, everyone
   * online while it's recent; and whether this node holds it.
   */
  heldBy?: { about: number; author: true; share: number; upvoters: number; recent: boolean; here: boolean };
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
  /** Paid on chain: send the amount per month to `to` from your linked wallet, then send the transaction's hash. */
  onchain?: OnchainPrice;
  /** You offer this tier. */
  mine: boolean;
  /** For the creator: how many active members it has. */
  members?: number;
  /** Your own membership, if you have or had one. */
  membership?: { until: string; active: boolean };
  /** You asked to join and haven't been answered yet. */
  requested?: boolean;
}

/** A kind of badge a project gives: lasting recognition, never votes or access. */
export interface BadgeSeriesInfo {
  id: string;
  /** The maintainer who started it and signs its badges. */
  issuer: Person;
  name: string;
  /** A short symbol (an emoji) shown next to the name. */
  symbol: string;
  /** Its picture (wblob: reference), shown next to the holder's name instead of the symbol. */
  image?: string;
  description: string;
  /** How many there can ever be; missing: no limit. Fixed when the series was started. */
  limit?: number;
  /** checked: this node is in the project and its issuer maintains it; false: claimed, this node can't check. */
  project?: { id: string; name: string; checked?: boolean };
  /** Badges given so far. */
  given: number;
  /** The issuer signed more badges than the limit, or one number twice: provable from their own signatures. */
  broken: boolean;
  /** You started it. */
  mine: boolean;
  time: string;
}

/** One badge: number n of its series, signed by the issuer, passed on by its holders. */
export interface BadgeInfo {
  id: string;
  series: { id: string; name: string; symbol: string; image?: string; limit?: number; broken: boolean; project?: { id: string; name: string; checked?: boolean } };
  issuer: Person;
  n: number;
  holder: Person;
  /** Everyone who held it, from the first to today's holder. */
  holders: Person[];
  note: string;
  /** What it's for, e.g. the post an idea came from. */
  ref?: string;
  /**
   * A personal note from the issuer. `text` when it's public, or when you can open it (you were given the
   * badge, or gave it); `mayPublish`: you were given it, so you decide whether everyone reads it.
   */
  personal?: { text?: string; published: boolean; mayPublish: boolean };
  time: string;
  /** Not valid: over the series' limit, or a number the issuer gave twice. */
  invalid?: 'over-limit' | 'duplicate';
  /** A holder passed it on twice from the same point; the earlier transfer counts. */
  contested?: true;
  /** You hold it. */
  mine: boolean;
}

/** A wallet someone linked to their Weave identity: theirs, as the wallet itself signed. */
export interface WalletInfo {
  owner: Person;
  /** The address, with its checksum. */
  address: string;
  /** The wallet signed that it belongs to its owner; only verified wallets own treasuries. */
  verified: boolean;
  /** A smart wallet (a Safe, a Coinbase Smart Wallet): its contract confirmed the signature on chain. */
  contract?: true;
  time: string;
  mine: boolean;
}

/** How a project's income is divided, in basis points (10000 = 100%). */
export interface SplitInfo {
  /** standard, community, solo, free, or custom. */
  preset: string;
  shares: { makers: number; treasury: number; community: number; foundation: number };
  /** How the makers' part is divided; empty: equally among the maintainers. */
  makers: Array<{ person: Person; share: number }>;
  /** The community that gets the community part. */
  community?: string;
  by: Person;
  time: string;
  /** When it counts: a changed split waits a few days, so nobody is surprised by it. */
  from: string;
}

/** Someone a split pays: a person, or the treasury of a project, community or the Weave Foundation. */
export interface RecipientInfo {
  kind: 'person' | 'project' | 'community' | 'foundation';
  /** Their did, or the space's id ('' while the foundation isn't set up). */
  id: string;
  name?: string;
  /** Missing while they have no verified wallet or treasury yet. */
  address?: string;
  /** In millionths of the income (1000000 = 100%). */
  share: number;
  part: 'makers' | 'treasury' | 'community' | 'foundation';
}

/** A project's split contract (0xSplits v2.2, owned by its treasury): pay it, and the money is divided as the split says. */
export interface SplitContractInfo {
  chain: { id: number; name: string; explorer: string };
  /** Where it is, or will be once deployed. */
  address: string;
  deployed: boolean;
  /** The transaction that deploys it; any wallet can send it. */
  deploy: { to: string; data: string };
  allocations: Array<{ address: string; share: number }>;
}

/** A ticketed event, like a live stream with an entry price. Tickets are paid into the show's own Safe (its hosts' wallets own it) until it's over. */
export interface ShowInfo {
  id: string;
  name: string;
  host: Person;
  project?: { id: string; name?: string };
  /** The room it happens in. */
  room?: string;
  starts: string;
  ends: string;
  /** Per ticket; `to` is the show's Safe. */
  price: OnchainPrice;
  capacity?: number;
  /** For the host: tickets sold. */
  sold?: number;
  hosts: Person[];
  /** How the money is paid out after the show; `address` is missing while someone has no wallet or treasury yet. */
  split: Array<{ to: string; name?: string; address?: string; share: number }>;
  safe: { address: string; threshold: number; deploy?: { to: string; data: string } };
  cancelled: boolean;
  /** Tickets let people in right now (from an hour before the start to the end). */
  open: boolean;
  mine: boolean;
  /** Your ticket, if you have one. */
  ticket?: { tx: string };
}

/** A ticket to a show: for its host every one sold (and requests that weren't let in, with the reason), for others their own. */
export interface TicketInfo {
  holder: Person;
  tx: string;
  /** The wallet it was paid from, and how much (smallest unit). */
  from?: string;
  value?: string;
  ok: boolean;
  reason?: string;
  request?: string;
}

/** What the show's Safe has to send to pay out (by the split) or pay back (to everyone who paid). The hosts sign it in their own wallets. */
export interface ShowSettlement {
  safe: string;
  /** What the Safe holds now, and what this sends (smallest unit). */
  balance: string;
  total: string;
  calls: Array<{ to: string; data: string }>;
  /** All of them as one Safe transaction (operation 1: a delegatecall to MultiSendCallOnly). */
  multiSend: { to: string; data: string; operation: number };
  /** The same for the Safe app's Transaction Builder: load it at app.safe.global, check, sign. */
  batch: unknown;
  /** Proposed in Weave: the hosts sign it here, in their wallets. */
  proposal: SafeProposalInfo;
}

/** How to pay a tier or show from your wallet without copying anything: a QR code for a phone wallet, or a transaction for a wallet in the browser. */
export interface PaymentRequestInfo {
  /** What it pays for, e.g. "a month of Editors". */
  what: string;
  chain: number;
  token: string;
  symbol: string;
  decimals: number;
  to: string;
  /** In the token's smallest unit. */
  amount: string;
  /** Your linked wallet: pay from it. */
  from: string;
  /** EIP-681 link (ethereum:…): show it as a QR code for a phone wallet. */
  uri: string;
  /** The same as a transaction for eth_sendTransaction. */
  tx: { from: string; to: string; data: string; chainId: string };
  /** The chain's block when asked: look for the payment from there (findPayment). */
  since: number;
}

/** A transaction for a Safe that its owners sign together in Weave; once enough signed, anyone sends `exec`. */
export interface SafeProposalInfo {
  id: string;
  title: string;
  safe: { address: string; label: string; threshold: number };
  chain: number;
  tx: { to: string; value: string; data: string; operation: 0 | 1; nonce: number };
  /** What owners sign: this hash, as typed data (eth_signTypedData_v4) or as a message. */
  hash: string;
  typedData: unknown;
  by: Person;
  time: string;
  signed: Array<{ person: Person; owner: string }>;
  /** Owners who haven't signed yet. */
  waiting: Person[];
  /** Enough signed: send this transaction (from any wallet) to run it on the Safe. */
  exec?: { to: string; data: string };
  /** You own the Safe (one of your wallets signs for it). */
  mine: boolean;
  signedByMe: boolean;
}

/** What someone thinks of an address or contract: endorse or block, and why; or, from its owners, that it's retired. People choose whose labels they follow. */
export interface LabelInfo {
  /** 'eip155:<chain id>:<address>' */
  target: string;
  label: 'endorse' | 'block' | 'retired';
  reason: string;
  by: Person;
  time: string;
  mine: boolean;
}

/** A project's (or community's) treasury: a Safe its maintainers' wallets own, and how a project's income is split. Weave holds no keys or money. */
export interface TreasuryInfo {
  /** The project or community. */
  project: { id: string; name: string };
  kind: 'project' | 'community';
  chain: { id: number; name: string; explorer: string };
  /** The Safe's address, computed before anything is deployed; missing until a maintainer has a verified wallet. */
  address?: string;
  /** How many of the owners must sign. */
  threshold: number;
  /** Maintainers with a verified wallet: they own the Safe. */
  owners: Array<{ person: Person; address: string }>;
  /** Maintainers without a verified wallet yet: not owners until they link one. */
  missing: Person[];
  split?: SplitInfo;
  /** A changed split, waiting for its notice to pass. */
  pending?: SplitInfo;
  presets: Record<string, { makers: number; treasury: number; community: number; foundation: number }>;
  /** Who the split in force pays, and how much: what flows between people and spaces can be read from. */
  recipients?: RecipientInfo[];
  /** The split contract's allocations (addresses sorted, millionths); parts without an address go to a maker. */
  allocations?: Array<{ address: string; share: number }>;
  /** The transaction that puts the Safe on chain; any wallet can send it, the Safe belongs to its owners alone. */
  deploy?: { to: string; data: string };
  /** The transaction that puts the project's split contract on chain (owned by the treasury): payments to it are divided by `allocations`. */
  splitDeploy?: { to: string; data: string };
  /** Its earlier addresses, retired when owners changed wallets: money still sent there is moved on with sweepRetired. */
  retired: Array<{ address: string; successor: string; time: string }>;
  /** Its latest public announcement has this address: people outside the space can pay it and name it in their splits. */
  announced: boolean;
  /** You maintain (or moderate) it and may change its split. */
  maintainer: boolean;
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
  /**
   * For tiers paid on chain: the transaction they sent and what the chain said
   * (`ok` is missing until it was read). Payments from their linked wallet are let in automatically.
   */
  payment?: { tx: string; ok?: boolean; reason?: string; months?: number };
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
  /** The post as it was when mentioned, shown like on a board. */
  post: PostInfo;
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

/** A work item on a session's stack: the post as it is now, shown like on a board. */
export type StackPost = PostInfo;

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
  /** When the session last did something (its transcript was written), if Weave can tell. */
  active?: string;
}

/** Where to work on an item: its latest session, or the folders known for its project, and the message to start with. */
export interface WorkTarget {
  post: PostInfo;
  /** The latest session with this item on its stack, if any. */
  session?: SessionInfo;
  /** Folders on this computer known for the item's project, most likely first. */
  folders: string[];
  /** The message for the session: the item, its address, and its starting prompt. */
  text: string;
}

/** A routine: a trigger and a work item it creates (see core routines.ts), with when it last and next fires. */
export interface RoutineInfo {
  id: string;
  name: string;
  on: boolean;
  trigger: { type: 'schedule'; days: number[]; time: string } | { type: 'first-start' };
  create: { board: string; title: string; text?: string; prompt?: string };
  space: SpaceRef;
  /** The latest item it made. */
  last?: { post: string; occurrence: string; time: string };
  /** When it next fires (scheduled routines that are on). */
  next?: string;
}

/** Your desk: the private project where your journal, ideas and routines live, and its folder here. */
export interface DeskInfo {
  space: SpaceRef;
  /** The folder on this computer where your daily driver's sessions run. */
  folder?: string;
  /** Your daily driver: the session your desk's items go to (the first one that took one on). */
  driver?: SessionRef;
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
/** The newest Weave version this node knows of, and whether it's newer than the one running. */
export interface UpdateInfo {
  current: string;
  latest?: {
    version: string;
    /** Where to get it: the GitHub release page, or the release post in Weave. */
    url?: string;
    /** The release post, for opening it in Weave. */
    post?: string;
    /** What's new (Markdown). */
    notes?: string;
    published?: string;
    /** weave: a release post signed by a maintainer of the Weave project; github: the repository's releases. */
    source: 'weave' | 'github';
  };
  newer: boolean;
}

/** How a room's handler reaches the app API on this computer (see appapi.ts): set in its environment when Weave starts it. */
export interface AppEnv {
  WEAVE_API: string;
  WEAVE_TOKEN: string;
  WEAVE_PROJECT: string;
  WEAVE_WEBSITE?: string;
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

export interface WebsiteInfo {
  id: string;
  project: SpaceRef;
  name: string;
  host: Person;
  /** A service offers it (its key and name): the room is there while that service runs. */
  offeredBy?: { did: Did; name?: string };
  /** Your room service runs it on this device. */
  mine: boolean;
  open: boolean;
  /** You are invited (every participant, or named people). */
  mayJoin: boolean;
  /** A ticketed room: the show whose ticket holders get in while it's on, and tiers whose members do. */
  show?: string;
  groups?: Array<{ id: string; name?: string }>;
  /** You joined it (players) or are hosting it right now (host). */
  joined: boolean;
  /** Players: accepted by the host. Host: listening for players. */
  connected: boolean;
  /** Who is in it right now, as far as you can see (only once you're in). */
  peers: Person[];
  /** The label of your ▶ button, and (where it runs) whether what answers it answers on its port. */
  service?: { id: string; label: string; ready: boolean };
  /** What ▶ opens, once there is something to open. */
  url?: string;
  time: string;
}

/** A message in a room's chat: never stored, gone when the room ends. */
export interface WebsiteChatMessage {
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
  /** In a space with a company attestor: who the company says they are, until when (and from which company computer). */
  attested?: { subject: string; email?: string; groups: string[]; until: string; device?: { subject: string; serial: string; validTo?: string } };
  /** A company-owned identity: its company's name. */
  company?: string;
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
  /** A company-owned identity: the company that holds it. */
  company?: { did: Did; name?: string; frozen?: true };
  /** Their other identities, where both sides say so. */
  links: LinkInfo[];
}

/** Where the company's node streams its audit (stage 12), without secrets. */
export interface AuditStreamInfo {
  id: string;
  kind: AuditSinkInput['kind'];
  target: string;
  /** Lines sent so far (of the last 31 days). */
  sent: number;
  lastSent?: string;
  problem?: string;
}

/** One event of a space, for a legal search (stage 12). */
export interface ExportLine {
  id: string;
  time: string;
  kind: string;
  by: Did;
  byName?: string;
  signer: Did;
  agent?: string;
  body: Json;
  /** A post deleted (hidden) later, and when. */
  deleted?: string;
  /** A post edited later: the times of its edits. */
  edited?: string[];
}

/** A company account's sign-in (stage 13). */
export interface SignInStatus {
  /** It is a company account. */
  company: boolean;
  name?: string;
  /** The company account it signed in with. */
  account?: string;
  tokenUntil?: string;
  /** It renews by itself (a refresh token). */
  renews?: boolean;
  /** The company vouches for it until then. */
  vouchedUntil?: string;
  problem?: string;
}

/** The admin console (stage 12). */
export interface ConsoleInfo {
  on: boolean;
  url?: string;
  port?: number;
  clientId?: string;
  /** Right after turning it on: a link that lets one person in once, before sign-in is set up. */
  operatorLink?: string;
}

/** The company's SCIM directory (stage 12). */
export interface ScimInfo {
  on: boolean;
  port?: number;
  /** People the user management adds get their invitation by email. */
  invite?: boolean;
  /** Only right after turning it on: the bearer token for the user management's settings. */
  token?: string;
  users: Array<{ userName: string; displayName?: string; active: boolean; groups: string[]; did?: Did; name?: string }>;
  groups: Array<{ name: string; members: number }>;
}

/** One identity's link to another (stage 10). */
export interface LinkInfo {
  did: Did;
  name?: string;
  /** linked: both say so · waiting: only this side so far · asked: only the other side · refused: a company doesn't allow it. */
  state: 'linked' | 'waiting' | 'asked' | 'refused';
  since: string;
  /** When it stopped counting going forward: the company froze one side (it stays as history). */
  until?: string;
  /** The other side is company-owned. */
  company?: { did: Did; name?: string };
  /** Sealed into this space rather than public. */
  space?: string;
}

export interface CreateCompanyInput {
  name: string;
  provider: { kind: 'local' } | { kind: 'vault'; address: string; key: string; mount?: string; jwt?: { mount?: string; role: string } } | { kind: 'azure'; vault: string; key: string; tenant?: string; clientId?: string; authority?: string } | { kind: 'aws'; region: string; key: string; role?: string; endpoint?: string; sts?: string } | { kind: 'gcp'; key: string; workload?: string; endpoint?: string; sts?: string };
  /** The company's sign-in (OIDC): the issuer, and the audience its tokens name. */
  issuer: string;
  audience: string;
  /** The sign-in group whose members administer the company. */
  admins: string;
  hours?: number;
  ttlMinutes?: number;
  graceHours?: number;
}

export interface CompanyInfo {
  did: Did;
  name: string;
  /** The company group: everyone the company vouches for. */
  group: { id: string; name: string };
  /** This node is the company's own. */
  runsHere: boolean;
  /** You administer it (or are it). */
  admin: boolean;
  admins?: string;
  /** Sign-in groups of the console's auditors (read everything) and helpdesk (set people up), stage 15. */
  auditors?: string;
  helpdesk?: string;
  links: boolean;
  /** What the company's accounts may do (published, so every node holds them to it). */
  policy: CompanyPolicy;
  /** How long company spaces keep things, in days. */
  retention: { minDays?: number; maxDays?: number };
  /** Projects and groups with their own retention (stage 15): space id → days. */
  spaceRetention: Record<string, { minDays?: number; maxDays?: number }>;
  /** Company chats between colleagues. */
  chats: Array<{ space: string; name: string; people: string[] }>;
  maps: Array<{ group: string; space: string; spaceName: string; role: 'member' | 'maintainer' }>;
  /** Contacts a new account starts with. */
  start: string[];
  spaces: Array<{ id: string; kind: SpaceKind; name: string }>;
  requests: Array<{ id: string; by: Did; byName?: string; time: string; action: string; done: boolean; error?: string }>;
}

/** What someone may do in the admin console (stage 15). */
export type ConsoleRole = 'admin' | 'auditor' | 'helpdesk';

/** An agent of one of the company's people, and where it may act (stage 15). */
export interface CompanyAgentInfo {
  did: Did;
  name: string;
  person: Did;
  personName?: string;
  spaces: Array<{ id: string; name: string; approved: boolean }>;
}

/** A person's company computer as the company last saw it (stage 15). */
export interface CompanyDeviceInfo {
  did: Did;
  name?: string;
  /** The company vouches only for sign-ins from its computers. */
  required: boolean;
  device?: { subject: string; serial: string; validTo?: string };
  vouched: boolean;
  vouchedUntil?: string;
  /** Why their last sign-in wasn't vouched for. */
  problem?: string;
  problemTime?: string;
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
  /** Maintainers or moderators: how long a board's posts stay after their last activity (keepDays), and how much it may hold (maxMB); null for no limit. */
  setBoardRule(input: { space: string; board: string; keepDays?: number | null; maxMB?: number | null }): Promise<BoardInfo[]>;
  /** The owner: from now on, a company's key service holds half of every key of this space (it rotates the key now). */
  manageSpace(input: {
    space: string;
    provider: { kind: 'local' } | { kind: 'vault'; address: string; key: string; mount?: string; jwt?: { mount?: string; role: string } } | { kind: 'azure'; vault: string; key: string; tenant?: string; clientId?: string; authority?: string } | { kind: 'aws'; region: string; key: string; role?: string; endpoint?: string; sts?: string } | { kind: 'gcp'; key: string; workload?: string; endpoint?: string; sts?: string };
    ttlMinutes?: number;
    graceHours?: number;
    attestor?: string;
    /** A company space: the company group whose attestations count here (stage 10). */
    company?: string;
  }): Promise<SpaceInfo>;
  /** A space's governance, oldest first: who joined, left or was removed, keys, settings, attestations, shreds, escrows opened. No content, no secrets. */
  audit(input: { space: string; since?: string; until?: string }): Promise<AuditLine[]>;
  /** An employee: leave your recovery words with the company (sealed; only its key service opens them). */
  escrowRecovery(input: { space: string; words: string }): Promise<void>;
  /**
   * Those who manage a company space: open an employee's escrowed words (through the key service; it's in the audit).
   * With `for` (a new computer's recovery request), the words are boxed to it and only it opens them: a recovery
   * answer. For a company-owned identity that's the only way.
   */
  openEscrow(input: { space: string; person: string; for?: string }): Promise<string>;
  /** On the company's own node: create the company (its group, under its key service, vouching through its sign-in). */
  createCompany(input: CreateCompanyInput): Promise<CompanyInfo>;
  /** The company this node runs, or the one you belong to. */
  company(): Promise<CompanyInfo | undefined>;
  /** The company does it; an admin asks the company to (it's carried out by the company's node, and in the audit). */
  companyAction(action: CompanyAction): Promise<CompanyInfo>;
  /** The company or an admin: a link that sets up a new company account (default: valid 30 days). */
  enrollLink(input?: { days?: number }): Promise<string>;
  /** Say this identity is also that one (a person, or a contact link); both have to. Public, or sealed into a space. `on: false` ends it. */
  link(input: { who: string; space?: string; on?: boolean }): Promise<LinkInfo[]>;
  /** A person's links to other identities (yours by default), as this node can see them. */
  links(who?: string): Promise<LinkInfo[]>;
  /** On the company's node: send the audit of the company's spaces, as it happens, to the company's security tools. */
  addAuditStream(input: AuditSinkInput): Promise<AuditStreamInfo[]>;
  removeAuditStream(id: string): Promise<AuditStreamInfo[]>;
  auditStreams(): Promise<AuditStreamInfo[]>;
  /** Those who manage a space: everything it holds, as JSON lines, deleted and edited posts included (marked): for legal searches. */
  exportSpace(input: { space: string; since?: string; until?: string }): Promise<ExportLine[]>;
  /** On the company's node: serve SCIM to the company's user management (the token is shown once), or stop. */
  setScim(input: { on: boolean; port?: number; invite?: boolean }): Promise<ScimInfo>;
  /** On the company's node: send a new colleague their invitation by email (stage 14). */
  inviteByEmail(input: { to: string; by?: string; days?: number }): Promise<{ to: string; joinUrl: string }>;
  /** The company's directory as its user management provisioned it. */
  scim(): Promise<ScimInfo>;
  /** A company account: sign in with your company account again, in the browser (stage 13). */
  companySignIn(): Promise<SignInStatus>;
  /** A company account: whether it's signed in, until when, and whether it renews by itself. */
  signInStatus(): Promise<SignInStatus>;
  /** A backup of this home into an empty folder: its files and a consistent copy of its database (stage 14). */
  backup(input: { to: string }): Promise<{ to: string; files: number; bytes: number; keystore: KeystoreKind; note?: string }>;
  /**
   * Answer an always-on node's request (stage 18): its key may host your rooms, and it gets your encryption keys and
   * spaces (but direct chats), boxed to it. The answer goes back to the node (weave node join).
   */
  linkNode(input: { request: string }): Promise<{ answer: string; key: Did; name: string }>;
  /** Where this computer can keep the home key (stage 17): the operating system's keystore and the hardware ones it has. */
  keystores(): Promise<Array<{ keystore: KeystoreKind; name: string; ready: boolean; why?: string; current: boolean }>>;
  /** Keep the home key somewhere else (stage 17): `os` for the operating system's keystore. */
  moveHomeKey(input: { to: 'os' | Exclude<KeystoreKind, 'kms'> }): Promise<{ from: KeystoreKind; to: KeystoreKind }>;
  /** On the company's node: a new one-time link into the admin console, for an operator. */
  consoleOperatorLink(): Promise<string>;
  /** On the company's node: serve the admin console (a web app for the company's admins), or stop. Gives a one-time operator link. */
  setConsole(input: { on: boolean; port?: number; url?: string; clientId?: string; clientSecret?: string }): Promise<ConsoleInfo>;
  consoleInfo(): Promise<ConsoleInfo>;
  /** Those who manage a space: approve an agent or service to act there (person/name, or its key), or no longer. */
  approveAgent(input: { space: string; agent: string; on?: boolean }): Promise<SpaceInfo>;
  /** What people's agents and services may do in a space (those who manage it): who counts, and which kinds they may write. */
  setVisitors(input: { space: string; agents?: VisitorRule; services?: VisitorRule }): Promise<SpaceInfo>;
  /** Company spaces this agent of yours may not see (not approved there). The MCP server keeps them out of its answers. */
  agentBlocked(agent: string): Promise<Array<{ id: string; name: string }>>;
  /** The owner: a legal hold until a date (nothing shredded or forgotten); a past date lifts it. */
  setHold(input: { space: string; until: string; reason?: string }): Promise<SpaceInfo>;
  /** Sign in with your company: hand an OIDC ID token to the space's attestor (and use it for the key service). */
  signIn(input: { space: string; idToken: string }): Promise<void>;
  /** Unlock a managed space's keys with its key service now (they unlock by themselves too). */
  unlockSpace(space: string): Promise<SpaceInfo>;
  /** The owner: destroy the company key: every copy of everything sealed under it becomes unreadable. */
  destroyCompanyKey(space: string): Promise<void>;
  /** Whoever manages the space: carry forward what its rules still keep, then have everyone delete the keys of the epochs that ended before `before`. */
  shred(input: { space: string; before: string }): Promise<{ epochs: number[]; carried: number }>;
  /** "Keep this": counts as activity on the post, so its time starts again (its author, or those who manage the space). */
  keepPost(target: string): Promise<PostInfo>;
  /** Your posts that others will forget within the next 14 days. */
  fading(): Promise<PostInfo[]>;
  /** Your small spaces and who keeps them (stage 5), and what you keep for others. */
  keepers(): Promise<KeepersInfo>;
  /** A space whose members hold its content between them: ask them for the 30 days before `before` (default: before the oldest post held). */
  fetchOlder(input: { space: string; before?: string }): Promise<{ since: string; until: string }>;
  /** Owner (groups) or maintainers: what newcomers get to read (all, 30d, joining). */
  setHistory(input: { space: string; history: HistorySetting }): Promise<SpaceInfo>;
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
  // services: code you run under keys of their own, with exactly the rights their contracts declare
  /** Run a new service on this node: its own key, its contract's rights, in these spaces, started with `command`. */
  /**
   * A service: your code under a key of its own, an applet (a project's release, `artifact`, with the contract its
   * manifest declares; running it needs `approve`), or one Weave ships (`builtin: 'website'`).
   */
  addService(input: { name?: string; description?: string; icon?: string; contract?: ServiceContract; spaces?: string[]; command?: string[]; wasm?: string; site?: string; node?: string; builtin?: Builtin; artifact?: { project: string; tag?: string }; from?: { catalog: string; app: string }; approve?: boolean; settings?: Record<string, string> }): Promise<ServiceInfo>;
  /** A project's releases, newest first: what a room can run. */
  artifacts(project: string): Promise<ArtifactInfo[]>;
  /**
   * A website of your website service in one of its projects, reaching what already answers `port` on this device
   * (services announce their own). Who visits: every participant, or `invite`d people, a `show`'s ticket holders, members of `groups` (tiers).
   */
  openWebsite(input: { service?: string; project: string; name: string; port?: number; invite?: string[]; show?: string; groups?: string[]; pages?: RoomPages }): Promise<WebsiteInfo>;
  /** The services this node runs. */
  services(): Promise<ServiceInfo[]>;
  /** A space's catalog: the Weave services its maintainers list there, newest first. */
  catalog(space: string): Promise<CatalogEntryInfo[]>;
  /** List a Weave service in a catalog (its maintainers): a release of a project you're in. */
  listInCatalog(input: { catalog: string; artifact: { project: string; tag?: string }; summary?: string; as?: string }): Promise<CatalogEntryInfo>;
  /** What installing a catalog entry would run, read from its image (shown before approving it); `released` is who listed it. */
  catalogArtifact(input: { catalog: string; app: string }): Promise<ArtifactInfo>;
  /** Start setting up your own GitHub App for a GitHub service (GitHub's App-manifest flow): the page to open in the browser. */
  githubAppSetup(input: { service?: string; org?: string }): Promise<{ url: string }>;
  /** Take an app off a catalog (its maintainers). */
  unlistFromCatalog(input: { catalog: string; app: string; as?: string }): Promise<void>;
  /** Change a service: its spaces, command, settings (null removes one), whether it runs. */
  /** Change a service; `artifact: {tag}` moves an applet to another release (the latest without a tag), which needs `approve`. */
  setService(input: { name: string; spaces?: string[]; command?: string[] | null; settings?: Record<string, string | null>; spaceSettings?: Record<string, Record<string, string | null>>; enabled?: boolean; description?: string; artifact?: { tag?: string }; approve?: boolean }): Promise<ServiceInfo>;
  /** Stop a service for good: its key is revoked, so nothing it signs counts any more. */
  removeService(name: string): Promise<void>;
  /** Services people run, from their public profiles. */
  serviceProfiles(): Promise<ServiceProfileInfo[]>;
  /** The services in a space: those whose people added them there. */
  servicesIn(space: string): Promise<ServiceProfileInfo[]>;
  /** Ask a service something in a space: a request it reads (it must be in that space). */
  askService(input: { space: string; service: string; text: string; data?: Json; as?: string }): Promise<ServiceRequestInfo>;
  /** Requests to services in a space, with their answers (optionally for one service). */
  serviceRequests(input: { space: string; service?: string }): Promise<ServiceRequestInfo[]>;
  /** Who owns a repository: an organization (members get read access) or a person (link only, or write access for people picked). */
  githubRepoOwner(repo: string): Promise<'organization' | 'personal'>;
  /** A space's repositories, and whether you gave it your GitHub account. */
  spaceRepos(space: string): Promise<SpaceRepos>;
  /** Owner or maintainers: let a repo follow a space (or, in a project, the readers of one board); on: false unlinks it. Uses your GitHub sign-in. */
  /**
   * Let a repository follow a space (on: false unlinks it). An organization's: members get read access. A person's:
   * access none (just linked) or write (writers: people in the space personally, picked one by one).
   */
  linkRepo(input: { space: string; repo: string; board?: string; access?: RepoAccess; writers?: string[]; on: boolean; as?: string }): Promise<SpaceRepos>;
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
  /**
   * The sessions pane: sessions with work items, and the ones that did something in the last `hours`
   * (default 12) even without, the most recently active first.
   */
  activeSessions(input?: { hours?: number }): Promise<SessionInfo[]>;
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
  /** Where to work on an item (Ctrl+click): its latest session or the folders known for its project, and the message to start with. */
  workTarget(input: { post: string }): Promise<WorkTarget>;
  /** Your desk, once it's set up. */
  desk(): Promise<DeskInfo | null>;
  /** Where your desk's folder is, or goes unless you choose another. */
  deskFolder(): Promise<string>;
  /**
   * Set up your desk (once): a private project with Journal and Ideas boards, the folder where your daily
   * driver works (with a CLAUDE.md for it), and the first routines. Running it again changes nothing that exists.
   */
  setupDesk(input: { name?: string; folder?: string }): Promise<DeskInfo>;
  /** A project's routines (your desk's by default). */
  routines(input?: { space?: string }): Promise<RoutineInfo[]>;
  /** Add or change a routine (maintainers). Without an id, a new one. */
  setRoutine(input: { space?: string; id?: string; name: string; on?: boolean; trigger: RoutineInfo['trigger']; create: RoutineInfo['create'] }): Promise<RoutineInfo>;
  removeRoutine(input: { space?: string; id: string }): Promise<void>;
  /** Run a routine now: its item for today (or its first start), unless that exists already. */
  runRoutine(input: { space?: string; id: string }): Promise<PostInfo>;
  /**
   * A new session for this item is about to open in the Claude app (Ctrl+click): the next session you look at
   * there that has no work items yet, within 15 minutes, gets it on its stack once the app says which session it is.
   */
  expectSession(input: { post: string; folder?: string }): Promise<void>;
  /** Remember a folder on this computer for a project (or community), for the next new session there. */
  rememberFolder(input: { space: string; folder: string }): Promise<string[]>;
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
  /** The project's artifact description (its weave.app.json as last published), if a maintainer published one. */
  projectApp(project: string): Promise<AppManifest | null>;
  /** Maintainers: publish (or replace) the project's artifact description (the contents of weave.app.json). */
  publishApp(input: { project: string; manifest: unknown; as?: string }): Promise<AppManifest>;
  /** Maintainers: release an artifact from a release on GitHub (by tag); each file is fingerprinted once. `assets`: platform → file name, when names don't say. */
  releaseApp(input: { project: string; tag: string; repo?: string; assets?: Record<string, string>; as?: string }): Promise<AppManifest>;
  /** Release a Weave service (maintainers): an image, ref:tag, with its manifest in its "dev.weave.service" label; pinned to its digest. */
  releaseService(input: { project: string; image: string; as?: string }): Promise<AppManifest>;
  /** The GitHub releases a project's app can be pointed at: its repository's recent ones, newest first. */
  appReleases(project: string): Promise<{ repo: string; releases: Array<{ tag: string; name: string; published?: string; files: number; prerelease: boolean }>; releaseWorkflow?: boolean }>;
  /**
   * Is there a newer Weave than `current`? Looks at release posts in the Weave project, signed by its
   * maintainers (no GitHub sign-in needed), and at the repository's GitHub releases when it can reach them.
   */
  updateCheck(input: { current: string }): Promise<UpdateInfo>;
  /** The app API's address and a room's token, for its handler when it runs by itself (Weave sets them for handlers it starts). */
  websiteEnv(room: string): Promise<AppEnv>;
  /** Rooms in a project (or all your projects); ended ones are left out. */
  websites(project?: string): Promise<WebsiteInfo[]>;
  closeWebsite(room: string): Promise<void>;
  /** Join a room: connect to the host and open the local tunnel; WebsiteInfo.url is what to open. */
  visitWebsite(room: string): Promise<WebsiteInfo>;
  leaveWebsite(room: string): Promise<void>;
  websiteChat(room: string): Promise<WebsiteChatMessage[]>;
  sayOnWebsite(input: { room: string; text: string }): Promise<void>;

  // memberships: tiers offered by creators, Patreon-style; they buy access, never votes
  /** Offer a tier: a group whose members get its chat and every project it's invited into. */
  createTier(input: { name: string; price?: number; currency?: string; description?: string; benefits?: string[]; auto?: boolean; gumroad?: GumroadLink | null; onchain?: OnchainPrice | null }): Promise<TierInfo>;
  /** Change a tier, close it to new members (open: false) or take it off your hub (hidden: true). */
  setTier(input: { tier: string; name?: string; price?: number; currency?: string; description?: string; benefits?: string[]; position?: number; open?: boolean; auto?: boolean; hidden?: boolean; gumroad?: GumroadLink | null; onchain?: OnchainPrice | null }): Promise<TierInfo>;
  /** Your Gumroad connection on this device, and one waiting for you to allow Weave. */
  gumroad(): Promise<GumroadInfo>;
  /** Start connecting Gumroad: open pending.url, allow Weave there, and ask gumroad() until it's done. */
  connectGumroad(): Promise<GumroadInfo>;
  /** Forget the Gumroad connection on this device. Tiers stay sold there; license keys don't need it. */
  disconnectGumroad(): Promise<GumroadInfo>;
  /**
   * Sell a tier through Gumroad without setting it up there by hand: makes a
   * monthly membership with license keys for it, publishes it and links the
   * tier. Through your Gumroad connection, or an access token (scope
   * edit_products) used once and not kept.
   */
  sellTierOnGumroad(input: { tier: string; token?: string }): Promise<{ tier: TierInfo; published: boolean; warning?: string }>;
  /** The tiers someone offers (default: you). */
  tiers(who?: string): Promise<TierInfo[]>;
  /** Ask a creator to let you into a tier; `note` is for them, e.g. how you paid. Only they can read it. */
  /** Ask to join a tier; for tiers sold through Gumroad, send the license key from your receipt and you're in as soon as the creator's node checked it. */
  requestMembership(input: { tier: string; note?: string; license?: string; payment?: string }): Promise<void>;
  /** Requests waiting for you, as a creator. */
  membershipRequests(): Promise<MembershipRequestInfo[]>;
  /** Let someone into a tier (or renew them) for some months; their node gets the tier's keys. */
  grantMembership(input: { tier: string; who: string; months: number }): Promise<TierInfo>;
  declineMembership(input: { tier: string; who: string }): Promise<void>;
  /** Tiers you're a member of, as a supporter. */
  memberships(): Promise<TierInfo[]>;

  // treasuries: people's own wallets, a Safe per project, and how income is split; Weave holds no keys or money
  /** What a wallet signs (personal_sign) to say it belongs to you. */
  walletMessage(address: string): Promise<string>;
  /** Link your wallet, with its signature over walletMessage(address); address '' unlinks it. */
  linkWallet(input: { address: string; proof?: string }): Promise<WalletInfo | undefined>;
  /** Someone's linked wallet (default: yours). */
  wallet(who?: string): Promise<WalletInfo | undefined>;
  /** A project's or community's treasury: its Safe's address, owners and split. */
  treasury(space: string): Promise<TreasuryInfo>;
  /** The project's split contract: where it is (asked from the chain), whether it exists yet, and how to put it there. */
  splitContract(project: string): Promise<SplitContractInfo>;
  // a Safe's transactions, signed together in Weave: Weave checks every signature and builds the transaction; owners sign in their own wallets
  /** Propose a transaction for a Safe you own with others (a treasury, a show's Safe). */
  proposeSafeTx(input: { safe: string; tx: { to: string; value?: string; data: string; operation?: 0 | 1 }; title: string }): Promise<SafeProposalInfo>;
  /** Add your wallet's signature over a proposal's hash (typed data, or the hash as a message). */
  signSafeTx(input: { proposal: string; signature: string }): Promise<SafeProposalInfo>;
  /** Proposals for the Safes this node knows, or one Safe's. */
  safeProposals(safe?: string): Promise<SafeProposalInfo[]>;

  /** How to pay a tier (a month) or a show (a ticket) from your linked wallet: a QR link and a transaction. */
  paymentRequest(input: { tier?: string; show?: string }): Promise<PaymentRequestInfo>;
  /** Look on chain for that payment from your wallets since a block; found, it is sent on (as if its hash were pasted). */
  findPayment(input: { tier?: string; show?: string; since: number }): Promise<{ found?: string; checkedTo: number }>;

  // ticketed events: paid into the show's Safe, paid out by its split after it, or back if it's called off
  /** Set up a show (you host it; other hosts must have linked wallets too): its Safe holds the ticket money until it's over. */
  createShow(input: { name: string; project?: string; room?: string; starts: string; ends: string; price: number; capacity?: number; hosts?: string[]; split?: Array<{ to: string; share: number }> }): Promise<ShowInfo>;
  /** Call a show off: tickets stop letting people in; pay everyone back with settleShow. */
  cancelShow(show: string): Promise<ShowInfo>;
  /** Shows this node knows, or a project's. */
  shows(project?: string): Promise<ShowInfo[]>;
  /** Ask for a ticket with the transaction that paid it, from your linked wallet; the host's node reads it on chain. */
  buyTicket(input: { show: string; payment: string }): Promise<void>;
  /** For the host: every ticket sold and requests not let in; for others: their own ticket. */
  tickets(show: string): Promise<TicketInfo[]>;
  /**
   * The Safe transaction that pays a show out by its split (after it) or back to everyone who paid.
   * Paying out, its host may give the split then: who gets what is decided after the show, and recorded on the show.
   */
  settleShow(input: { show: string; action: 'payout' | 'refund'; split?: Array<{ to: string; share: number }> }): Promise<ShowSettlement>;
  /** Move what's left on a space's retired treasuries to its treasury now: a proposal per old Safe holding money, for its old owners to sign. */
  sweepRetired(space: string): Promise<Array<{ safe: string; balance: string; proposal?: SafeProposalInfo; deploy: { to: string; data: string } }>>;
  /** Announce a treasury publicly (maintainers or moderators), so people outside it can pay it and name it in their splits. */
  announceTreasury(space: string): Promise<TreasuryInfo>;
  /** Endorse or block an address or contract, saying why; label '' withdraws yours. */
  label(input: { target: string; label: 'endorse' | 'block' | ''; reason?: string }): Promise<LabelInfo | undefined>;
  /** Labels on a target, or all this node knows; `by` limits them to the people you follow for labels. */
  labels(input?: { target?: string; by?: string[] }): Promise<LabelInfo[]>;
  /** Set how a project's income is split (maintainers): a preset, or shares in basis points; the Weave Foundation's part may be 0. */
  setSplit(input: { project: string; preset?: string; shares?: { makers: number; treasury?: number; community?: number; foundation?: number }; makers?: Array<{ who: string; share: number }>; community?: string }): Promise<TreasuryInfo>;

  // badges: lasting recognition from a project, checkable by anyone, never votes or access
  /** Start a kind of badge for a project you maintain; `limit` (how many there can ever be) can never be raised. */
  createBadgeSeries(input: { project: string; name: string; symbol?: string; image?: string; description?: string; limit?: number }): Promise<BadgeSeriesInfo>;
  /** Change a series' name, symbol, picture ('' removes it) or description (never its limit). */
  setBadgeSeries(input: { series: string; name?: string; symbol?: string; image?: string; description?: string }): Promise<BadgeSeriesInfo>;
  /** The badge series of a project, or every one this node knows. */
  badgeSeries(project?: string): Promise<BadgeSeriesInfo[]>;
  /**
   * Give someone the next free badge of one of your series; `ref` is what it's for (e.g. a post). `personal`
   * is a note only they (and you) can read, until they publish it.
   */
  giveBadge(input: { series: string; who: string; note?: string; ref?: string; personal?: string }): Promise<BadgeInfo>;
  /** Make the personal note on a badge you were given public, or (on: false) take it back. */
  publishBadgeNote(input: { badge: string; on?: boolean }): Promise<BadgeInfo>;
  /** The badges someone holds (default: you). */
  badges(who?: string): Promise<BadgeInfo[]>;
  /** Pass a badge you hold on to someone else, e.g. your other account; it keeps its number. */
  transferBadge(input: { badge: string; to: string }): Promise<BadgeInfo>;

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
  /** Take a chat message down: yours, or any in a space you maintain or moderate. */
  deleteMessage(input: { message: string; as?: string }): Promise<void>;
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
  'spaces', 'createGroup', 'createProject', 'invite', 'joinSpace', 'pairPhone', 'phones', 'unpairPhone', 'setHomeVisibility', 'followBoard', 'leave', 'handOver', 'closeSpace', 'setHistory', 'setBoardRule', 'keepPost', 'fading', 'shred', 'fetchOlder', 'keepers', 'manageSpace', 'unlockSpace', 'destroyCompanyKey', 'signIn', 'setHold', 'approveAgent', 'setVisitors', 'agentBlocked', 'escrowRecovery', 'openEscrow', 'createCompany', 'company', 'companyAction', 'enrollLink', 'inviteByEmail', 'link', 'links', 'setScim', 'scim', 'setConsole', 'consoleInfo', 'companySignIn', 'signInStatus', 'consoleOperatorLink', 'backup', 'keystores', 'moveHomeKey', 'linkNode', 'addAuditStream', 'removeAuditStream', 'auditStreams', 'exportSpace', 'audit', 'knocks', 'answerKnock', 'setBoardAccess', 'members', 'removeMember',
  'github', 'connectGithub', 'disconnectGithub', 'setGithubApp', 'githubRepos', 'githubRepoOwner', 'spaceRepos', 'linkRepo',
  'addService', 'artifacts', 'catalog', 'catalogArtifact', 'githubAppSetup', 'listInCatalog', 'unlistFromCatalog', 'openWebsite', 'services', 'setService', 'removeService', 'serviceProfiles', 'servicesIn', 'askService', 'serviceRequests', 'shareGithub', 'showGithubOnHub',
  'createCommunity', 'community', 'setCommunity', 'setModerator',
  'posts', 'post', 'submit', 'confirmCoauthor', 'coauthorRequests', 'editPost', 'deletePost', 'upvote', 'save', 'share', 'boards', 'setBoard', 'curate',
  'project', 'setProjectPage', 'putBlob', 'blob', 'setMaintainer', 'inviteGroup', 'uninviteGroup', 'setRule', 'admissions', 'admit', 'decline',
  'setEdge', 'social', 'profile', 'setProfile', 'directory', 'contactLink', 'addContact',
  'identityInfo', 'keys', 'revokeKey', 'rotateRoot', 'harnesses', 'connectHarness', 'dismissHarnesses', 'requestPermission', 'permissionRequests', 'answerPermission', 'openInApp',
  'showPosts', 'mentions', 'followClaudeCode', 'claudeCode', 'sessions', 'activeSessions', 'session', 'focusedSession', 'workOn', 'doneWith', 'restack', 'workTarget', 'expectSession', 'rememberFolder',
  'desk', 'deskFolder', 'setupDesk', 'routines', 'setRoutine', 'removeRoutine', 'runRoutine',
  'projectApp', 'publishApp', 'releaseApp', 'releaseService', 'appReleases', 'websiteEnv', 'updateCheck', 'websites', 'closeWebsite', 'visitWebsite', 'leaveWebsite', 'websiteChat', 'sayOnWebsite',
  'createTier', 'setTier', 'gumroad', 'connectGumroad', 'disconnectGumroad', 'sellTierOnGumroad', 'tiers', 'requestMembership', 'membershipRequests', 'grantMembership', 'declineMembership', 'memberships',
  'createBadgeSeries', 'setBadgeSeries', 'badgeSeries', 'giveBadge', 'publishBadgeNote', 'badges', 'transferBadge',
  'walletMessage', 'linkWallet', 'wallet', 'treasury', 'splitContract', 'announceTreasury', 'sweepRetired', 'setSplit', 'label', 'labels', 'createShow', 'cancelShow', 'shows', 'buyTicket', 'tickets', 'settleShow', 'proposeSafeTx', 'signSafeTx', 'safeProposals', 'paymentRequest', 'findPayment',
  'chats', 'openChat',
  'channels', 'createChannel', 'messages', 'say', 'deleteMessage', 'react',
  'threads', 'startThread', 'reply', 'issues', 'openIssue', 'claimIssue', 'setIssueStatus',
  'proposals', 'propose', 'vote', 'delegateVote', 'votingDelegate',
];
