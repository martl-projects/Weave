import {
  accessOf,
  accountsOf,
  canManage as mayManageSpace,
  isLogin,
  isRepoName,
  KIND_GITHUB_ACCOUNT,
  KIND_GITHUB_ADDED,
  KIND_GITHUB_PUBLIC,
  githubProofText,
  KIND_GITHUB_REPO,
  planSync,
  reposOf,
  b64u,
  BLOB_TYPES,
  boardKeyFor,
  boardOfEvents,
  boardOfInner,
  decodeKnock,
  encodeKnock,
  inviteRightsOf,
  isKnockLink,
  isReadLimited,
  keyHolders,
  KIND_BOARD_ACCESS,
  KIND_BOARD_KEY,
  KIND_BOARD_SEALED,
  KIND_KNOCK,
  KIND_KNOCK_HANDLED,
  KIND_KNOCK_PENDING,
  KIND_CLOSE,
  KIND_HANDOVER,
  KIND_LEAVE,
  KIND_ROSTER,
  knockFor,
  mayUse,
  newBoardKey,
  openBoard,
  openBoardKey,
  openKnock,
  readersOf,
  sealForBoard,
  type Access,
  type BoardRight,
  type Grantee,
  blobRefsIn,
  createSubKey,
  decryptBlob,
  encryptBlob,
  parseBlobRef,
  type BlobType,
  boardName,
  boardsOf,
  canManage,
  canonicalKind,
  channelName,
  channelsOf,
  CHOICES,
  COMMUNITY_BOARD,
  currentEpoch,
  decodeContact,
  decodeInvite,
  directSpace,
  DEFAULT_CHANNEL,
  delegation,
  edgeBody,
  EDGE_KINDS,
  encodeContact,
  encodeInvite,
  eventId,
  findRecoveryIndex,
  followersOf,
  friendsOf,
  gift,
  grantUntil,
  isDid,
  ISSUE_STATUSES,
  issuesOf,
  inception,
  KIND_ADMIT,
  KIND_APP,
  KIND_BOARD,
  KIND_CURATE,
  KIND_BLOCK,
  KIND_CHANNEL,
  KIND_CONTACT,
  KIND_DECLINE,
  KIND_FOLLOW,
  KIND_GIFT,
  KIND_INVITE,
  KIND_ISSUE,
  KIND_ISSUE_CLAIM,
  KIND_ISSUE_STATUS,
  KIND_JOIN,
  KIND_MAINTAINER,
  KIND_MEMBERSHIP,
  KIND_MEMBERSHIP_HANDLED,
  KIND_MEMBERSHIP_PENDING,
  KIND_MEMBERSHIP_LICENSE,
  parseGumroadLink,
  type GumroadLink,
  KIND_MEMBERSHIP_REQUEST,
  KIND_MSG,
  KIND_MUTE,
  KIND_POST,
  KIND_POST_DELETE,
  KIND_POST_COAUTHOR,
  coauthorsOf,
  MAX_COAUTHORS,
  postRefOf,
  postRefsIn,
  postTargetOf,
  postUrl,
  shortPrefixes,
  type PostTarget,
  type KeyFacts,
  KIND_POST_EDIT,
  KIND_PROJECT_GROUP,
  KIND_PROPOSAL,
  KIND_REACT,
  KIND_REKEY,
  KIND_REMOVE,
  KIND_REPLY,
  KIND_ROOM,
  KIND_RULE,
  KIND_SAVE,
  KIND_SEALED,
  KIND_SPACE_CREATE,
  KIND_THREAD,
  KIND_TIER,
  KIND_UPVOTE,
  KIND_VOTE,
  KIND_VOTE_DELEGATE,
  membershipRequest,
  messagesOf,
  newRecoveryWords,
  newSpace,
  normalizeWords,
  open,
  openGift,
  openIn,
  openMembershipRequest,
  openRekey,
  parseManifest,
  startCommand,
  type AppAsset,
  parseScope,
  permits,
  POST_SORTS,
  postsOf,
  proposalsOf,
  randomBytes,
  recoveryEncryptionKey,
  recoveryIdentity,
  recoveryRoot,
  rank,
  rekey,
  roomsOf,
  revocation,
  rotation,
  Replica,
  SAVE_MODES,
  savesOf,
  scoresOf,
  seal,
  sealFor,
  selfKey,
  socialGraph,
  spaceScope,
  spaceState,
  spaceTopic,
  threadsOf,
  tiersOf,
  visibleIn,
  type AppManifest,
  type Board,
  type Member,
  type BoardType,
  type Choice,
  type Did,
  type EdgeEvent,
  type Entry,
  type EventFields,
  type Inner,
  type Recipient,
  type Invite,
  type Issue,
  type IssueStatus,
  type Json,
  type Message,
  type Post,
  type PostSort,
  type Proposal,
  type Reaction,
  type Reply,
  type Room,
  type SaveMode,
  type Score,
  type Sealed,
  type SigningIdentity,
  type SpaceKeys,
  type SpaceKind,
  type SpaceState,
  type Tier,
  type Thread,
  type WeaveEvent,
  checkTextFields,
  TEXT_LIMITS,
  tooLong,
} from '@weave/core';
import { roomKeyPair, SwarmNode } from '@weave/net';
import {
  HOME_SOURCES,
  PROJECT_STATUSES,
  type Actor,
  type Admission,
  type AgentInfo,
  type AppEnv,
  type AppLaunchInfo,
  type AppPerson,
  type Backend,
  type BoardInfo,
  type ChatInfo,
  type CoauthorRequest,
  type GitHubInfo,
  type HarnessInfo,
  type PermissionRequest,
  type AppOpen,
  type ClaudeCodeFollow,
  type MentionInfo,
  type HubGitHub,
  type RepoInfo,
  type SpaceRepos,
  type MembershipRequestInfo,
  type ChannelInfo,
  type CommunityInfo,
  type EdgeInput,
  type FeedItem,
  type IdentityInfo,
  type KeyInfo,
  type FeedQuery,
  type HomeSource,
  type GranteeInfo,
  type InviteOptions,
  type KnockInfo,
  type InProject,
  type InSpace,
  type IssueInfo,
  type MemberInfo,
  type MessageInfo,
  type Person,
  type Notice,
  type PostInfo,
  type PostsQuery,
  type Profile,
  type ProfileInput,
  type ProjectInfo,
  type ProjectPage,
  type ProjectStatus,
  type ProposalInfo,
  type PublicProject,
  type PublishInput,
  type ReactionInfo,
  type ReplyInfo,
  type RoomChatMessage,
  type RoomInfo,
  type Social,
  type SpaceInfo,
  type SpaceRef,
  type Status,
  type ThreadInfo,
  type TierInfo,
  type Whoami,
  noAgent,
} from './backend.ts';
import { loadConfig, saveConfig, type Config } from './config.ts';
import { TranscriptFollower, type SessionText } from './claudecode.ts';
import { FileStore } from './filestore.ts';
import { readJson, resolveHome, writeJson, type Home } from './home.ts';
import { entryState, harnessesIn, writeEntry, type McpLaunch } from './harnesses.ts';
import { guessPlatform, platformKey, saveVerified, tagFolder, unpack } from './appinstall.ts';
import { checkGistProof, DEFAULT_GITHUB_APP, finishDeviceFlow, GitHub, GITHUB_CLIENT_ID, githubInstallUrl, lookUpGitHubApp, type GitHubApp, startDeviceFlow, type DeviceCode, type Fetch, type ReleaseAsset } from './github.ts';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { basename, join as joinPath, resolve as resolvePath } from 'node:path';
import { homedir, hostname } from 'node:os';
import { LiveRooms, portOpen } from './live.ts';
import { createAndSaveAgent, loadAgents, saveAgent, loadEncryptionKeys, loadIdentity, saveDevice, saveEncryptionKeys, type AgentKey, type EncryptionKey } from './keystore.ts';
import { acquireLock } from './lock.ts';
import { BlobStore } from './blobstore.ts';
import { AppProcesses, launchFingerprint } from './applaunch.ts';
import { AppApiError, sameToken, startAppApi, type AppApiServer } from './appapi.ts';
import { RemoteAccess } from './remote.ts';
import { checkGumroadLicense, type LicenseCheck, type LicenseChecker } from './gumroad.ts';
import { loadSpaces, removeSpace, saveSpace, type StoredSpace } from './spacestore.ts';
import { KIND_THEME, sanitizeTheme, type Theme } from './theme.ts';

export const KIND_PROFILE = 'weave.profile';
/** A project's page, sealed inside the project; the latest one by a maintainer counts. */
export const KIND_PAGE = 'weave.project.page';
/** A public copy of a project's page, published by a maintainer when the project is public. */
export const KIND_PUBLIC_PROJECT = 'weave.project.public';
/** A space you don't want on Home, sealed to yourself; the latest per space counts. */
export const KIND_HOME_HIDDEN = 'weave.home.hidden';
/** Sealed to yourself: {space, board, on}. You follow a project's board: its posts come to Home and notify you. */
export const KIND_BOARD_FOLLOW = 'weave.board.follow';
/** Boards you follow until you say otherwise: the announcement-style ones. */
export const FOLLOWED_BOARDS = ['releases', 'showcase'];
const SELF_SCOPE = 'self';


/** A GitHub sign-in waiting for its code, or why the last one failed. */
/** An app being installed from its release, or why that failed. */
interface InstallJob {
  progress?: { state: 'downloading' | 'unpacking'; done: number; total?: number };
  error?: string;
}

interface GitHubLogin {
  code?: DeviceCode;
  error?: string;
  cancel: AbortController;
}

/** An event as this node can read it, before names are resolved. */
interface Decoded {
  event: WeaveEvent;
  inner: Inner;
  space?: StoredSpace;
  /** For events of a read-limited board: which board (they were sealed with its key). */
  board?: string;
  private?: true;
}

const EDGE_KIND: Record<EdgeInput['edge'], string> = { follow: KIND_FOLLOW, block: KIND_BLOCK, mute: KIND_MUTE };
const DEFAULT_PAGE: ProjectPage = { title: '', subtitle: '', body: '', description: '', status: 'active', public: false };

/**
 * One person's node: their keys, their replica of the logs they know, the
 * groups and projects they belong to, and optionally a live connection to
 * peers. The CLI uses it directly when no daemon runs; the daemon wraps it
 * with networking and the HTTP API.
 */
export class WeaveNode implements Backend {
  readonly home: Home;
  #identity: SigningIdentity;
  /** This person's encryption keys on this device, oldest first. */
  #encryption: EncryptionKey[];
  readonly replica: Replica;
  config: Config;
  #agents: AgentKey[];
  #spaces = new Map<string, StoredSpace>();
  #swarm?: SwarmNode;
  readonly blobs: BlobStore;
  /** Blob hashes already asked for ahead of time, so each is requested once per run. */
  #prefetched = new Set<string>();
  #releaseLock: () => void;
  #live = new LiveRooms({
    dht: () => this.#swarm?.swarm.dht,
    signer: () => this.identity,
    personOf: (signer) => {
      const person = this.replica.authority.personOf(signer);
      const grant = this.replica.authority.grant(signer);
      return grant && grant.revokedAfter !== undefined ? undefined : person;
    },
    mayJoin: (room, person) => this.#mayJoin(room, person),
    servicePort: (room) => this.#roomService(room)?.port,
    seed: (roomId) => this.#roomSeed(roomId),
    nameOf: (did) => this.nameOf(did),
    changed: () => this.#emitLive(),
  });
  #liveListeners = new Set<(notice?: Notice) => void>();
  /** Posts agents pointed to, newest first (the Mentions panel), and who's watching for more. */
  #mentions: MentionInfo[] = [];
  readonly #mentionListeners = new Set<(mention: MentionInfo) => void>();
  /** Claude Code sessions followed for links to posts, while that's on (see followClaudeCode). */
  #follower?: TranscriptFollower;
  /** Watchers told where the app should take its person (see openInApp). */
  #openListeners = new Set<(open: AppOpen) => void>();
  /** How license keys are checked with Gumroad (tests put a fake here). */
  checkLicense: LicenseChecker = checkGumroadLicense;
  /** Gumroad's answers for requests, so each key is checked once per run (request id → answer). */
  #licenseChecks = new Map<string, LicenseCheck | 'checking'>();
  /** Where harness configs live (your user folder; tests use a temporary one). */
  harnessHome = homedir();
  /** How a harness starts this installation's CLI: this process's own program and script (Electron's Node in the packaged app). */
  mcpLaunch: () => McpLaunch = () => ({
    command: process.execPath,
    args: [resolvePath(process.argv[1] ?? ''), ...(this.home.dir === resolveHome().dir ? [] : ['--home', this.home.dir])],
    env: process.env.ELECTRON_RUN_AS_NODE ? { ELECTRON_RUN_AS_NODE: '1' } : ({} as Record<string, string>),
  });
  /** How this node reaches GitHub (tests put a stand-in here). */
  githubSetup: { clientId: string; fetch: Fetch; sleep: (ms: number) => Promise<unknown> } = { clientId: GITHUB_CLIENT_ID, fetch: (...args) => fetch(...args), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };
  #githubLogin?: GitHubLogin;
  /** Apps being installed (or failed to), by project id. */
  #installs = new Map<string, InstallJob>();
  #installing = new Map<string, Promise<unknown>>();
  /** Repos this node keeps in step (lowercase owner/name): when each was last synced, what it looked like then, and any problem. */
  #githubSynced = new Map<string, { at: number; shape: string; problem?: string }>();
  /** Gist proofs already checked (gist:login:did → answer), so each is asked once per run. */
  #gistProofs = new Map<string, Promise<boolean | undefined>>();
  /** The time, in milliseconds (tests move it forward to reach renewals). */
  clock: () => number = Date.now;
  /** Paired phones using this node remotely (see remote.ts). */
  #remote = new RemoteAccess({
    home: () => this.home,
    dht: () => this.#swarm?.swarm.dht,
    bootstrap: () => this.config.bootstrap,
    name: () => this.nameOf(this.identity.author),
    call: (method, args) => (this[method] as (...a: unknown[]) => Promise<unknown>).apply(this, args),
    watch: (onItem, signal) => this.watch(onItem, signal),
  });
  /** Apps this node started for the person, by project id. */
  #apps = new AppProcesses(() => this.#emitLive());
  /** The app API (see appapi.ts), started when an app first needs it; its tokens, one per project, for this run. */
  #appApi?: Promise<AppApiServer>;
  #appTokens = new Map<string, string>();
  /** Everything this node can read, decrypted once; dropped whenever an event arrives or keys change. */
  #decoded?: Decoded[];
  /** Direct chats, derived (never stored) for everyone whose log this node holds: space id → space and the other person. */
  #directs = new Map<string, { space: StoredSpace; peer: Did }>();
  #directByPeer = new Map<Did, StoredSpace>();
  #contactCache?: { from: Decoded[]; map: Map<Did, string | undefined> };
  /** Board-key events already looked at, so each box is tried once. */
  #boardKeysSeen = new Set<string>();

  private constructor(home: Home, identity: SigningIdentity) {
    this.home = home;
    this.#identity = identity;
    // Homes from before separate encryption keys use the root key for encryption.
    const stored = loadEncryptionKeys(home);
    this.#encryption = stored.length ? stored : [{ did: identity.did, keys: identity.keys }];
    this.#releaseLock = acquireLock(home);
    this.replica = new Replica(new FileStore(home.logs));
    this.blobs = new BlobStore(home.blobs);
    this.config = loadConfig(home);
    this.#agents = loadAgents(home);
    for (const space of loadSpaces(home)) this.#spaces.set(space.id, space);

    // Pick up keys handed to us — new epochs and whole spaces — now and whenever they arrive.
    const isKeys = (e: WeaveEvent) => canonicalKind(e.kind) === KIND_REKEY || e.kind === KIND_GIFT;
    for (const event of this.replica.events(isKeys)) this.#takeKeys(event);
    this.replica.onAppend((event) => {
      this.#decoded = undefined;
      if (isKeys(event)) this.#takeKeys(event);
    });
  }

  static open(dir?: string): WeaveNode {
    const home = resolveHome(dir);
    const identity = loadIdentity(home);
    if (!identity) throw new Error(`no identity in ${home.dir} — run "weave init" first`);
    return new WeaveNode(home, identity);
  }

  /** The key this node signs with: this device's (for old homes, the root key). */
  get identity(): SigningIdentity {
    return this.#identity;
  }

  /** Create a new identity in an empty home and publish a profile with the given name. The recovery words are dropped: for tests and demos. */
  static init(name: string, dir?: string): WeaveNode {
    return WeaveNode.create(name, dir).node;
  }

  /**
   * Create a new identity in an empty home. Returns the 24 recovery words: they
   * are shown once and never stored, and every root and encryption key is
   * derived from them. The root signs the identity record (committing to the
   * next root) and this device's key; after that, only the device key is on disk.
   */
  static create(name: string, dir?: string): { node: WeaveNode; words: string } {
    const home = resolveHome(dir);
    if (loadIdentity(home)) throw new Error(`an identity already exists in ${home.dir}`);
    const words = newRecoveryWords();
    const root = recoveryRoot(words, 0);
    const person: SigningIdentity = { author: root.did, did: root.did, keys: root };
    const device = createSubKey(root.did);
    const enc = recoveryEncryptionKey(words, 0);
    saveEncryptionKeys(home, [{ did: enc.did, keys: enc }]);
    saveDevice(home, device);
    const node = WeaveNode.open(home.dir);
    node.replica.append(person, inception(recoveryRoot(words, 1).did, enc.did));
    node.replica.append(person, delegation(device.did, 'device', ['*'], deviceName()));
    node.replica.append(node.identity, { kind: KIND_PROFILE, body: { name } });
    return { node, words };
  }

  /**
   * Set up this computer as a new device of an existing identity, from its
   * recovery words. The identity's events must reach this node first (from
   * `events`, or from peers while it waits online), so it knows which root and
   * encryption key are current.
   */
  static async restore(words: string, dir?: string, options: { events?: WeaveEvent[]; online?: boolean; timeoutMs?: number } = {}): Promise<WeaveNode> {
    const clean = normalizeWords(words);
    const home = resolveHome(dir);
    if (loadIdentity(home)) throw new Error(`an identity already exists in ${home.dir}`);
    const author = recoveryIdentity(clean);
    const device = createSubKey(author);
    const firstEnc = recoveryEncryptionKey(clean, 0);
    saveEncryptionKeys(home, [{ did: firstEnc.did, keys: firstEnc }]);
    saveDevice(home, device);
    const node = WeaveNode.open(home.dir);
    for (const event of options.events ?? []) node.replica.ingest(event);
    const known = () => !!node.replica.authority.keys(author).next;
    if (!known() && options.online) {
      await node.goOnline();
      await node.join(author);
      const until = Date.now() + (options.timeoutMs ?? 30_000);
      while (!known() && Date.now() < until) await new Promise((r) => setTimeout(r, 250));
    }
    if (!known()) {
      await node.close();
      throw new Error("couldn't find your identity on the network yet: keep another of your devices (or a friend who follows you) online and try again");
    }
    const state = node.replica.authority.keys(author);
    const rootIndex = findRecoveryIndex(clean, state.root, 'root');
    const encIndex = findRecoveryIndex(clean, state.enc, 'enc');
    if (rootIndex === undefined || encIndex === undefined) throw new Error("these words don't match this identity's current keys");
    node.#saveEncryption(Array.from({ length: encIndex + 1 }, (_, i) => recoveryEncryptionKey(clean, i)).map((k) => ({ did: k.did, keys: k })));
    const root = recoveryRoot(clean, rootIndex);
    node.replica.append({ author, did: root.did, keys: root }, delegation(device.did, 'device', ['*'], deviceName()));
    return node;
  }

  get online(): boolean {
    return this.#swarm !== undefined;
  }

  /** Every DHT topic this node listens on: its identity, configured topics, its spaces and their entry points. */
  get topics(): string[] {
    const topics = new Set([this.identity.author, ...this.config.topics]);
    for (const space of this.#spaces.values()) {
      topics.add(spaceTopic(space));
      for (const topic of space.entry.topics) topics.add(topic);
    }
    for (const friend of this.#friends()) topics.add(spaceTopic(this.#direct(friend)));
    return [...topics];
  }

  /** Connect to peers and join all topics. */
  async goOnline(): Promise<void> {
    if (this.#swarm) return;
    this.#swarm = new SwarmNode(this.replica, this.config.bootstrap.length ? { bootstrap: this.config.bootstrap } : {}, this.blobs);
    await Promise.all(this.topics.map((topic) => this.#swarm!.join(topic)));
    // Reopen the rooms we host that are still open (their keys come from our own secret).
    for (const { room } of this.#allRooms()) if (room.open && room.host === this.identity.author) await this.#live.host(room).catch(() => {});
    await this.#remote.start().catch((error: Error) => console.error(`weave: phones can't connect: ${error.message}`));
  }

  async goOffline(): Promise<void> {
    this.#apps.stopAll();
    const appApi = this.#appApi;
    this.#appApi = undefined;
    this.#appTokens.clear();
    await (await appApi?.catch(() => undefined))?.close();
    await this.#remote.close();
    await this.#live.close();
    await this.#swarm?.destroy();
    this.#swarm = undefined;
  }

  /** Go offline and release the home for other processes. */
  async close(): Promise<void> {
    this.#follower?.stop();
    await this.goOffline();
    this.#releaseLock();
  }

  async whoami(): Promise<Whoami> {
    return { did: this.identity.author, name: this.nameOf(this.identity.author), agents: this.#agents.map(agentInfo), signer: this.identity.did };
  }

  async publish(input: PublishInput): Promise<FeedItem> {
    const signer = input.as ? this.#agents.find((a) => a.name === input.as) : this.identity;
    if (!signer) throw new Error(noAgent(input.as!, this.#agents.map((a) => a.name)));
    if (input.as) this.#agentMay(input.as, input.kind);
    // Readers would cut anything longer: refuse instead, so nothing is shortened without the author knowing.
    checkTextFields(input.body);
    let inner: Inner = { kind: input.kind, body: input.body ?? null };
    const space = input.space ? this.#space(input.space) : undefined;
    if (space && space.kind !== 'direct' && this.#state(space).closed) throw new Error(`${space.name} is closed: it's kept as it is, read-only`);
    if (space?.kind === 'project') inner = this.#forBoard(space, inner);
    const fields: EventFields = space ? sealFor(space, inner) : inner;
    const event = this.replica.append(signer, fields);
    return this.itemFor(event)!;
  }

  /** An agent may sign this kind, or an error saying how its person allows it. */
  #agentMay(name: string, kind: string): void {
    const agent = this.#agents.find((a) => a.name === name);
    if (!agent) throw new Error(noAgent(name, this.#agents.map((a) => a.name)));
    if (!permits(agent.permissions, kind)) throw new Error(`agent "${name}" may not sign ${kind}; its person can allow it in Keys & devices in the Weave app, or with: weave agent can ${name} ${[...agent.permissions, kind].join(',')}`);
  }

  async feed(query: FeedQuery = {}): Promise<FeedItem[]> {
    const kinds = query.kinds?.length ? new Set(query.kinds) : undefined;
    const onlySpace = query.space ? this.#space(query.space) : undefined;
    const onlyAuthor = query.author ? this.resolve(query.author) : undefined;
    const hidden = this.#hiddenAuthors();
    const states = new Map<string, SpaceState>();

    const items: FeedItem[] = [];
    for (const decoded of this.#decodeAll()) {
      if (onlySpace && decoded.space?.id !== onlySpace.id) continue;
      if (onlyAuthor && decoded.event.author !== onlyAuthor) continue;
      if (query.publicOnly && (decoded.space || decoded.private)) continue;
      if (kinds && !kinds.has(decoded.inner.kind)) continue;
      if (hidden.has(decoded.event.author)) continue;
      if (decoded.space) {
        if (!states.has(decoded.space.id)) states.set(decoded.space.id, this.#state(decoded.space));
        if (!this.#mine(decoded.event) && !visibleIn(states.get(decoded.space.id)!, decoded.event, decoded.inner)) continue;
      }
      items.push(this.#toItem(decoded));
    }
    return items.slice(-(query.limit ?? 50));
  }

  // ---------------------------------------------------------------- agent harnesses

  /** Harnesses, looked for under harnessHome only (on Windows, Claude Desktop's %APPDATA% too, unless it's a test folder). */
  #harnessList() {
    return harnessesIn(this.harnessHome, process.platform, this.harnessHome === homedir() ? process.env.APPDATA : joinPath(this.harnessHome, 'AppData', 'Roaming'));
  }

  async harnesses(): Promise<{ offered: boolean; harnesses: HarnessInfo[] }> {
    const launch = this.mcpLaunch();
    return {
      offered: this.config.agentsOffered === true,
      harnesses: this.#harnessList()
        .filter((h) => h.found)
        .map((h) => ({ id: h.id, name: h.name, agent: h.agent, file: h.file, state: entryState(h, launch), restart: h.restart })),
    };
  }

  async connectHarness(input: { harness: string; on: boolean }): Promise<{ offered: boolean; harnesses: HarnessInfo[] }> {
    const h = this.#harnessList().find((x) => x.id === input.harness && x.found);
    if (!h) throw new Error(`${input.harness} isn't installed on this computer`);
    // An AppImage runs from a mount that moves every start: an entry pointing there would break.
    if (input.on && process.env.APPIMAGE) throw new Error(`the AppImage can't be started by ${h.name} yet: add Weave from a source checkout (see the README's Agents section)`);
    if (input.on && !this.#agents.some((a) => a.name === h.agent)) await this.addAgent(h.agent, ['weave.post', 'weave.reply', 'weave.msg', 'weave.react']);
    writeEntry(h, input.on ? this.mcpLaunch() : null);
    await this.dismissHarnesses();
    return this.harnesses();
  }

  async dismissHarnesses(): Promise<void> {
    if (this.config.agentsOffered) return;
    this.config = { ...this.config, agentsOffered: true };
    saveConfig(this.home, this.config);
  }

  async addAgent(name: string, permissions: string[]): Promise<AgentInfo> {
    const agent = createAndSaveAgent(this.home, this.identity.author, name, permissions);
    this.replica.append(this.identity, delegation(agent.did, 'agent', permissions, name));
    this.#agents.push(agent);
    return agentInfo(agent);
  }

  async join(topic: string): Promise<void> {
    if (!this.config.topics.includes(topic)) {
      this.config = { ...this.config, topics: [...this.config.topics, topic] };
      saveConfig(this.home, this.config);
    }
    await this.#swarm?.join(topic);
  }

  async status(): Promise<Status> {
    const heads = this.replica.heads();
    const spaces = [...this.#spaces.values()];
    return {
      did: this.identity.author,
      name: this.nameOf(this.identity.author),
      online: this.online,
      topics: this.config.topics,
      groups: spaces.filter((s) => s.kind === 'group').length,
      projects: spaces.filter((s) => s.kind === 'project').length,
      communities: spaces.filter((s) => s.kind === 'community').length,
      peers: this.#swarm?.sessions.size ?? 0,
      logs: Object.keys(heads).length,
      events: Object.values(heads).reduce((sum, seq) => sum + seq, 0),
      pending: this.replica.pendingCount,
    };
  }

  async watch(onItem: (item: FeedItem) => void, signal: AbortSignal): Promise<void> {
    // In order, one at a time: working out a notice may need to read the Inbox.
    let queue = Promise.resolve();
    const unsubscribe = this.replica.onAppend((event) => {
      const item = this.itemFor(event);
      if (!item || this.#hiddenAuthors().has(item.author)) return;
      queue = queue.then(async () => {
        const notice = await this.#noticeFor(item).catch(() => undefined);
        onItem(notice ? { ...item, notice } : item);
      });
    });
    // Rooms change without events (people come and go, room chat): a notice with no content, so views refresh.
    const me = this.identity.author;
    const onLive = (notice?: Notice) => onItem({ id: `live-${Date.now()}`, time: new Date().toISOString(), kind: 'weave.live', scope: 'live', body: null, author: me, signer: me, seq: 0, ...(notice ? { notice } : {}) });
    this.#liveListeners.add(onLive);
    // Not an event either: the app comes to the front there; other watchers see no text and leave it.
    const onOpen = (open: AppOpen) => onItem({ id: `open-${Date.now()}`, time: new Date().toISOString(), kind: 'weave.open', scope: 'live', body: open as unknown as Json, author: me, signer: me, seq: 0 });
    this.#openListeners.add(onOpen);
    // Neither: a post an agent pointed to, for the Mentions panel.
    const onMention = (mention: MentionInfo) => onItem({ id: mention.id, time: mention.time, kind: 'weave.mention', scope: 'live', body: mention as unknown as Json, author: me, signer: me, seq: 0 });
    this.#mentionListeners.add(onMention);
    await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
    this.#liveListeners.delete(onLive);
    this.#openListeners.delete(onOpen);
    this.#mentionListeners.delete(onMention);
    unsubscribe();
  }

  // ---------------------------------------------------------------- groups and projects

  async spaces(kind?: SpaceKind): Promise<SpaceInfo[]> {
    return [...this.#spaces.values()].filter((s) => !kind || s.kind === kind).map((s) => this.#spaceInfo(s));
  }

  async createGroup(name: string): Promise<SpaceInfo> {
    return this.#spaceInfo(await this.#createSpace('group', name));
  }

  async createProject(input: { name: string; description?: string }): Promise<ProjectInfo> {
    const project = await this.#createSpace('project', input.name);
    if (input.description) this.replica.append(this.identity, sealFor(project, { kind: KIND_PAGE, body: { ...DEFAULT_PAGE, body: input.description, description: summary(input.description) } }));
    return this.project(project.id);
  }

  async invite(ref: string, hours = 24 * 7, options: InviteOptions = {}): Promise<string> {
    const space = this.#space(ref);
    const state = this.#state(space);
    if (space.kind === 'direct') throw new Error('a direct chat is between two people; start a group to talk with more');
    if (state.closed) throw new Error(`${space.name} is closed`);
    if (state.tier && state.founder !== this.identity.author) throw new Error(`only ${this.nameOf(state.founder) ?? 'its creator'} lets people into ${space.name}`);
    const allowed = space.kind !== 'project' ? state.members.has(this.identity.author) || this.#mineFounder(space) : state.maintainers.has(this.identity.author);
    if (!allowed) throw new Error(space.kind === 'project' ? 'only maintainers can invite people into a project' : `you are not a member of ${space.name}`);
    if (options.access?.length && space.kind !== 'project') throw new Error('board rights are for projects');
    const boards = space.kind === 'project' ? this.#spacePosts(space).boards : [];
    const access: BoardRight[] = (options.access ?? []).map((r) => ({ board: this.#board(space, boards, r.board).name, ...(r.read ? { read: true } : {}), ...(r.write ? { write: true } : {}) }));
    const invite = b64u.encode(randomBytes(12));
    const expires = new Date(Date.now() + hours * 3600_000).toISOString();
    const body: Record<string, Json> = { invite, expires };
    if (access.length) body.access = access as unknown as Json;
    if (options.accept) body.accept = true;
    this.replica.append(this.identity, sealFor(space, { kind: KIND_INVITE, body }));
    if (options.accept) {
      return encodeKnock({
        v: 1,
        space: { kind: space.kind, id: space.id, name: space.name, founder: space.founder },
        invite,
        inviter: this.identity.author,
        enc: this.#encryptionKeyOf(this.identity.author),
        expires,
        entry: this.#entryPoint(),
      });
    }
    const boardKeys = this.#boardKeysFor(space, access);
    return encodeInvite({ v: 2, space: this.#keysOnly(space), invite, inviter: this.identity.author, expires, entry: this.#entryPoint(), ...(boardKeys ? { boards: boardKeys } : {}) });
  }

  async joinSpace(text: string, note?: string): Promise<SpaceInfo> {
    if (isKnockLink(text)) return this.#knock(text, note ?? '');
    const invite = decodeInvite(text);
    if (this.#spaces.has(invite.space.id)) throw new Error(`you are already in ${invite.space.name}`);
    this.#adoptBootstrap(invite.entry);
    const space: StoredSpace = { ...invite.space, entry: invite.entry, ...(invite.boards ? { boards: invite.boards } : {}) };
    await this.#addSpace(space);
    this.replica.append(this.identity, sealFor(space, { kind: KIND_JOIN, body: { invite: invite.invite } }));
    return this.#spaceInfo(space);
  }

  /** Ask to be let in with a link that needs the inviter's OK. */
  async #knock(text: string, note: string): Promise<SpaceInfo> {
    const link = decodeKnock(text);
    if (this.#spaces.has(link.space.id)) throw new Error(`you are already in ${link.space.name}`);
    if (link.inviter === this.identity.author) throw new Error("that's your own link");
    this.#adoptBootstrap(link.entry);
    for (const topic of new Set([link.inviter, ...link.entry.topics])) await this.join(topic);
    this.replica.append(this.identity, this.#sealForSelf({ kind: KIND_KNOCK_PENDING, body: { space: link.space.id, inviter: link.inviter } }));
    this.replica.append(this.identity, knockFor(link, note.trim(), this.#entryPoint()));
    return { id: link.space.id, kind: link.space.kind, name: link.space.name, founder: link.space.founder, founderName: this.nameOf(link.space.founder), members: 0, epoch: 0, waiting: true };
  }

  async knocks(): Promise<KnockInfo[]> {
    return this.#openKnocks().map(({ id, event, space, note, rights }) => ({
      id,
      space: { id: space.id, kind: space.kind, name: space.name },
      did: event.author,
      name: this.nameOf(event.author),
      note,
      time: event.time,
      access: rights,
    }));
  }

  async answerKnock(input: { knock: string; accept: boolean }): Promise<void> {
    const matches = this.#openKnocks().filter((k) => k.id.startsWith(input.knock));
    if (matches.length !== 1) throw new Error(matches.length ? 'that id is ambiguous — use more characters' : 'no such request (maybe already answered)');
    const { id, event, space, invite, rights } = matches[0];
    if (input.accept) {
      const member = event.author;
      this.replica.append(this.identity, sealFor(space, { kind: KIND_ADMIT, body: { member, invite } }));
      const boardKeys = this.#boardKeysFor(space, rights);
      this.replica.append(this.identity, gift({ ...this.#keysOnly(space), ...(boardKeys ? { boards: boardKeys } : {}) } as typeof space, [member], 'gift', this.#entryPoint(), this.#encryptionKeyOf));
    }
    this.replica.append(this.identity, this.#sealForSelf({ kind: KIND_KNOCK_HANDLED, body: { knock: id } }));
  }

  /** Knocks with my live links that I haven't answered and whose senders aren't in yet. */
  #openKnocks(): Array<{ id: string; event: WeaveEvent; space: StoredSpace; invite: string; note: string; rights: BoardRight[] }> {
    const handled = new Set(this.#selfBodies(KIND_KNOCK_HANDLED).map((b) => b.knock));
    const out: Array<{ id: string; event: WeaveEvent; space: StoredSpace; invite: string; note: string; rights: BoardRight[] }> = [];
    for (const event of this.replica.events((e) => e.kind === KIND_KNOCK && e.author !== this.identity.author)) {
      const id = eventId(event);
      if (handled.has(id)) continue;
      const opened = this.#tryOpen((me) => openKnock(event, me));
      const space = opened && this.#spaces.get(opened.space);
      if (!opened || !space) continue;
      const state = this.#state(space);
      if (state.members.has(event.author)) continue;
      const entries = this.#entries(space);
      const live = entries.some((e) => e.kind === KIND_INVITE && e.event.author === this.identity.author && (e.body as { invite?: unknown; expires?: unknown; accept?: unknown })?.invite === opened.invite && (e.body as { accept?: unknown }).accept === true && String((e.body as { expires?: unknown }).expires) >= new Date().toISOString());
      if (!live) continue;
      out.push({ id, event, space, invite: opened.invite, note: opened.note, rights: inviteRightsOf(entries, state).get(opened.invite) ?? [] });
    }
    return out.sort((x, y) => x.event.time.localeCompare(y.event.time));
  }

  /** A space's keys as shared with a newcomer: never the board keys (those go only to their readers). */
  #keysOnly(space: StoredSpace): SpaceKeys {
    const { entry: _entry, boards: _boards, ...keys } = space;
    return keys;
  }

  /** Keys of the read-limited boards that these rights open, to hand over with an invite. */
  #boardKeysFor(space: StoredSpace, rights: BoardRight[]): Record<string, Record<string, string>> | undefined {
    const out: Record<string, Record<string, string>> = {};
    for (const r of rights) if ((r.read || r.write) && space.boards?.[r.board]) out[r.board] = { ...space.boards[r.board] };
    return Object.keys(out).length ? out : undefined;
  }

  async members(ref: string): Promise<MemberInfo[]> {
    const space = this.#space(ref);
    const state = this.#state(space);
    const lastActive = new Map<Did, string>();
    const agents = new Map<Did, Set<string>>();
    for (const entry of this.#entries(space)) {
      const { author, signer, time } = entry.event;
      if (time > (lastActive.get(author) ?? '')) lastActive.set(author, time);
      const agent = this.#agentName(signer, author);
      if (agent) agents.set(author, (agents.get(author) ?? new Set()).add(agent));
    }
    return [...state.members.values()].map((m) => ({
      did: m.did,
      name: this.nameOf(m.did),
      since: m.since,
      ...(m.invitedBy ? { invitedBy: m.invitedBy, invitedByName: this.nameOf(m.invitedBy) } : {}),
      ...(m.via ? { via: this.#groupRef(m.via, state) } : {}),
      ...(space.kind === 'project' && state.maintainers.has(m.did) ? { maintainer: true as const } : {}),
      ...(lastActive.has(m.did) ? { lastActive: lastActive.get(m.did) } : {}),
      agents: [...(agents.get(m.did) ?? [])],
    }));
  }

  async leave(ref: string): Promise<void> {
    const space = this.#space(ref);
    if (space.kind === 'direct') throw new Error('a direct chat has no leaving; unfollow or block the person instead');
    const state = this.#state(space);
    if (state.founder === this.identity.author) {
      const others = [...state.members.keys()].filter((did) => did !== this.identity.author);
      throw new Error(others.length ? `you own ${space.name}: hand it over to someone first` : `you're the only one in ${space.name}: close it instead`);
    }
    this.replica.append(this.identity, sealFor(space, { kind: KIND_LEAVE, body: {} }));
    // Our node stops following it: keys gone, topics left. The space's history in the logs stays unreadable here.
    this.#spaces.delete(space.id);
    this.#decoded = undefined;
    removeSpace(this.home, space.id);
    for (const topic of [spaceTopic(space)]) await this.#swarm?.leave(topic).catch(() => {});
  }

  async handOver(input: { space: string; to: string }): Promise<SpaceInfo> {
    const space = this.#space(input.space);
    const state = this.#state(space);
    if (space.kind === 'direct') throw new Error('a direct chat has no owner');
    if (state.founder !== this.identity.author) throw new Error(`only the owner, ${this.nameOf(state.founder) ?? 'someone else'}, can hand ${space.name} over`);
    if (state.tier) throw new Error("a membership tier stays with its creator; take it off your hub instead");
    const to = this.resolve(input.to);
    if (to === this.identity.author) throw new Error("that's you");
    if (!state.members.has(to)) throw new Error(`${input.to} isn't in ${space.name}`);
    this.replica.append(this.identity, sealFor(space, { kind: KIND_HANDOVER, body: { to } }));
    return this.#spaceInfo(space);
  }

  async closeSpace(input: { space: string; closed: boolean }): Promise<SpaceInfo> {
    const space = this.#space(input.space);
    const state = this.#state(space);
    if (space.kind === 'direct') throw new Error("a direct chat can't be closed");
    if (!canManage(state, this.identity.author)) throw new Error(space.kind === 'group' ? `only the owner of ${space.name} can close it` : `only the ${space.kind === 'community' ? 'moderators' : 'maintainers'} of ${space.name} can close it`);
    if (!!state.closed === input.closed) return this.#spaceInfo(space);
    this.replica.append(this.identity, sealFor(space, { kind: KIND_CLOSE, body: { closed: input.closed } }));
    return this.#spaceInfo(space);
  }

  /** After people leave, a node that may rotate the key does: they can't read what comes next. */
  #rotateAfterLeaving(space: StoredSpace, state: SpaceState): number {
    if (space.kind === 'direct' || !canManage(state, this.identity.author) || !state.left.size) return 0;
    const lastLeft = [...state.left].map((did) => state.removed.get(did) ?? '').reduce((a, b) => (b > a ? b : a), '');
    const scope = spaceScope(space);
    const lastRekey = this.replica.events((e) => canonicalKind(e.kind) === KIND_REKEY && e.scope === scope).reduce((a, e) => (e.time > a ? e.time : a), '');
    if (lastLeft <= lastRekey) return 0;
    const { fields, epoch, key } = rekey(space, [...state.members.keys()], this.#encryptionKeyOf);
    space.keys[String(epoch)] = key;
    this.#saveSpace(space);
    this.replica.append(this.identity, fields);
    return 1;
  }

  async removeMember(ref: string, who: string): Promise<void> {
    const space = this.#space(ref);
    const state = this.#state(space);
    if (!canManage(state, this.identity.author)) {
      throw new Error({ project: 'only maintainers can remove people from a project', community: 'only moderators can remove people from a community', group: 'only the group founder can remove members', direct: 'nobody can be removed from a direct chat' }[space.kind]);
    }
    const member = this.resolve(who);
    if (!state.members.has(member)) throw new Error(`${who} is not in ${space.name}`);
    if (member === state.founder) throw new Error(`the owner can't be removed from ${space.name}`);
    this.replica.append(this.identity, sealFor(space, { kind: KIND_REMOVE, body: { member } }));
    const remaining = [...state.members.keys()].filter((did) => did !== member);
    const { fields, epoch, key } = rekey(space, remaining, this.#encryptionKeyOf);
    space.keys[String(epoch)] = key;
    this.#saveSpace(space);
    this.replica.append(this.identity, fields);
  }

  // ---------------------------------------------------------------- communities

  async createCommunity(input: { name: string; description?: string }): Promise<CommunityInfo> {
    const community = await this.#createSpace('community', input.name);
    if (input.description) this.replica.append(this.identity, sealFor(community, { kind: KIND_PAGE, body: { description: input.description } }));
    return this.community(community.id);
  }

  async community(ref: string): Promise<CommunityInfo> {
    const community = this.#space(ref, 'community');
    const state = this.#state(community);
    return {
      ...this.#spaceInfo(community),
      kind: 'community',
      description: this.#page(community, state).description,
      moderators: [...state.maintainers].map((did) => this.#actor(did, did)),
      moderator: state.maintainers.has(this.identity.author),
    };
  }

  async setCommunity(input: { community: string; description: string }): Promise<CommunityInfo> {
    const community = this.#space(input.community, 'community');
    this.#maintainerState(community);
    this.replica.append(this.identity, sealFor(community, { kind: KIND_PAGE, body: { description: input.description ?? '' } }));
    return this.community(community.id);
  }

  async setModerator(input: { community: string; who: string; on: boolean }): Promise<void> {
    this.#appoint(this.#space(input.community, 'community'), input.who, input.on);
  }

  // ---------------------------------------------------------------- posts, boards and upvotes

  async posts(query: PostsQuery = {}): Promise<PostInfo[]> {
    const sort = query.sort ?? 'hot';
    if (!POST_SORTS.includes(sort)) throw new Error(`sort by ${POST_SORTS.join(', ')}`);
    let posts: PostInfo[];
    let pinned: string[] = [];
    if (query.space) {
      const space = this.#space(query.space);
      if (space.kind === 'group') throw new Error(`${space.name} is a group: groups have chat, posts live in projects and communities`);
      const { posts: all, boards } = this.#spacePosts(space);
      const board = query.board ? this.#board(space, boards, query.board) : undefined;
      posts = board ? all.filter((p) => p.board === board.name) : all;
      pinned = board?.pinned ?? boards.flatMap((b) => b.pinned);
      if (board && !query.sort) return rank(posts, board.sort, pinned).slice(0, query.limit ?? 200);
    } else if (query.saved) {
      posts = this.#allPosts().filter((p) => p.saved);
    } else {
      const from = query.from ?? 'all';
      if (!HOME_SOURCES.includes(from)) throw new Error(`show posts from ${HOME_SOURCES.join(', ')}`);
      posts = this.#homePosts(from);
      pinned = posts.filter((p) => p.saved === 'pinned').map((p) => p.id);
    }
    if (query.saved) posts = posts.filter((p) => p.saved);
    return rank(posts, sort, pinned).slice(0, query.limit ?? 200);
  }

  async post(ref: string): Promise<PostInfo> {
    const target = postTargetOf(ref ?? '');
    if (target) return this.#postAt(target);
    ref = postRefOf(ref ?? '');
    if (!ref || ref.length < 6) throw new Error('use at least 6 characters of the id');
    const matches = this.#allPosts().filter((p) => p.id.startsWith(ref));
    if (matches.length === 0) throw new Error(`no post found with id ${ref}`);
    if (matches.length > 1) throw new Error(`id ${ref} is ambiguous — use more characters`);
    return matches[0];
  }

  async submit(input: { space: string; board?: string; title: string; text?: string; link?: string; image?: string; with?: string[]; as?: string }): Promise<PostInfo> {
    const title = input.title?.trim();
    if (!title) throw new Error('a post needs a title');
    if (title.length > TEXT_LIMITS.title) throw tooLong('The title', title.length, TEXT_LIMITS.title);
    const link = input.link?.trim();
    if (link && !/^https?:\/\//.test(link)) throw new Error('links start with http:// or https://');
    const image = input.image?.trim();
    if (image && !parseBlobRef(image)) throw new Error('attach an uploaded image (a wblob: reference)');
    const space = this.#space(input.space);
    if (space.kind === 'group') throw new Error(`${space.name} is a group: groups have chat, posts live in projects and communities`);
    const body: Record<string, Json> = { title, text: input.text ?? '' };
    if (link) body.link = link;
    if (image) body.image = image;
    if (input.with?.length) body.with = this.#coauthorList(space, input.with);
    if (space.kind === 'project') {
      const board = this.#board(space, this.#spacePosts(space).boards, input.board ?? 'ideas');
      if (board.type === 'issues') return this.post((await this.openIssue({ project: space.id, title, text: input.text, as: input.as, board: board.name })).id);
      if (board.type === 'proposals') return this.post((await this.propose({ project: space.id, title, text: input.text, as: input.as, board: board.name })).id);
      body.board = board.name;
    }
    const { id } = await this.publish({ kind: KIND_POST, body, space: space.id, as: input.as });
    return this.post(id);
  }

  async confirmCoauthor(input: { post: string; on: boolean; as?: string }): Promise<PostInfo> {
    const post = await this.post(input.post);
    const agent = input.as ? this.#agents.find((a) => a.name === input.as) : undefined;
    if (input.as && !agent) throw new Error(noAgent(input.as, this.#agents.map((a) => a.name)));
    const me = agent?.did ?? this.identity.author;
    const named = this.#namedIn(post.id);
    if (!named) throw new Error("that post doesn't name any co-authors");
    if (!named.includes(me) && !named.some((did) => this.replica.authority.personOf(did) === this.identity.author && !agent)) {
      throw new Error(agent ? `that post doesn't name ${agent.name} as a co-author` : "that post doesn't name you as a co-author");
    }
    await this.publish({ kind: KIND_POST_COAUTHOR, body: { target: post.id, on: input.on }, space: post.space?.id, as: input.as });
    return this.post(post.id);
  }

  async coauthorRequests(): Promise<CoauthorRequest[]> {
    const me = this.identity.author;
    const mine = new Map(this.#agents.map((a) => [a.did, a.name]));
    const out: CoauthorRequest[] = [];
    for (const { posts, entries, space } of this.#postSources()) {
      for (const p of posts) {
        if (!p.with || p.author === me) continue;
        for (const c of coauthorsOf(p, entries, this.#keyFacts)) {
          if (c.state !== 'asked' || (c.did !== me && !mine.has(c.did))) continue;
          out.push({
            post: { id: p.id, short: p.id.slice(0, 8), title: p.title, ...(space ? { space: { id: space.id, kind: space.kind, name: space.name } } : {}) },
            by: this.#actor(p.author, p.signer),
            ...(mine.has(c.did) ? { agent: mine.get(c.did)! } : {}),
            time: p.time,
          });
        }
      }
    }
    return out.sort((a, b) => b.time.localeCompare(a.time));
  }

  async updateAgent(input: { name: string; permissions: string[] }): Promise<AgentInfo> {
    const agent = this.#agents.find((a) => a.name === input.name);
    if (!agent) throw new Error(`no agent named "${input.name}"`);
    const permissions = [...new Set(input.permissions.map((p) => p.trim()).filter(Boolean))];
    if (permissions.includes('*')) throw new Error("agents can't get every permission: name the kinds they may sign");
    this.replica.append(this.identity, delegation(agent.did, 'agent', permissions, agent.name));
    agent.permissions = permissions;
    saveAgent(this.home, agent);
    return agentInfo(agent);
  }

  // ---------------------------------------------------------------- agents asking for more

  get #requestsFile(): string {
    return joinPath(this.home.dir, 'agent-requests.json');
  }

  #requests(): PermissionRequest[] {
    return readJson<PermissionRequest[]>(this.#requestsFile) ?? [];
  }

  async requestPermission(input: { as: string; kinds: string[]; reason?: string }): Promise<PermissionRequest> {
    const agent = this.#agents.find((a) => a.name === input.as);
    if (!agent) throw new Error(noAgent(input.as, this.#agents.map((a) => a.name)));
    const kinds = [...new Set(input.kinds.map((k) => k.trim()))].filter((k) => /^weave\.[a-z0-9.*-]{1,60}$/.test(k));
    if (!kinds.length) throw new Error('name the kinds to ask for, like weave.github.repo');
    const missing = kinds.filter((k) => !permits(agent.permissions, k));
    const now = new Date(this.clock()).toISOString();
    if (!missing.length) return { id: '', agent: agent.name, kinds, reason: '', time: now, state: 'allowed' };
    const requests = this.#requests();
    // Asking again for the same while waiting doesn't make a second request.
    const open = requests.find((r) => r.state === 'pending' && r.agent === agent.name && missing.every((k) => r.kinds.includes(k)));
    if (open) return open;
    const request: PermissionRequest = { id: b64u.encode(randomBytes(9)), agent: agent.name, kinds: missing, reason: (input.reason ?? '').trim().slice(0, 300), time: now, state: 'pending' };
    // Keep what's pending, and the last few answers.
    writeJson(this.#requestsFile, [...requests.filter((r) => r.state === 'pending'), ...requests.filter((r) => r.state !== 'pending').slice(-20), request]);
    this.#emitLive({
      type: 'permission',
      category: 'requests',
      title: `Your agent ${agent.name} asks for a permission`,
      text: `To sign ${missing.join(', ')}${request.reason ? `: “${request.reason}”` : ''}`,
      open: { inbox: true },
    });
    return request;
  }

  async openInApp(input: { what: AppOpen['what']; space?: string; repo?: string; post?: string }): Promise<AppOpen> {
    if (!['link-repo', 'space', 'inbox', 'post'].includes(input.what)) throw new Error('what is link-repo, space, inbox or post');
    if (input.what === 'post') {
      if (!input.post) throw new Error('say which post');
      const post = await this.post(input.post);
      const open: AppOpen = { what: 'post', post: { id: post.id, title: post.title }, ...(post.space ? { space: post.space } : {}) };
      for (const listener of this.#openListeners) listener(open);
      return open;
    }
    const space = input.space ? this.#space(input.space) : undefined;
    if (input.what !== 'inbox' && !space) throw new Error('say which space');
    const repo = input.repo?.trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '');
    if (repo && !isRepoName(repo)) throw new Error('a repository looks like owner/name');
    const open: AppOpen = { what: input.what, ...(space ? { space: { id: space.id, kind: space.kind, name: space.name } } : {}), ...(repo ? { repo } : {}) };
    for (const listener of this.#openListeners) listener(open);
    return open;
  }

  async showPosts(input: { posts: string[]; note?: string; as?: string }): Promise<MentionInfo[]> {
    if (input.as && !this.#agents.some((a) => a.name === input.as)) throw new Error(noAgent(input.as, this.#agents.map((a) => a.name)));
    if (!input.posts?.length) throw new Error('say which posts to show');
    const note = input.note?.trim().slice(0, 500) || undefined;
    const shown: MentionInfo[] = [];
    for (const ref of input.posts.slice(0, 20)) {
      const post = await this.post(ref);
      shown.push(this.#mention(post, { source: 'agent', ...(input.as ? { agent: input.as } : {}), ...(note ? { note } : {}) }));
    }
    return shown;
  }

  async mentions(): Promise<MentionInfo[]> {
    return this.#mentions;
  }

  async followClaudeCode(input: { on: boolean }): Promise<ClaudeCodeFollow> {
    this.config = { ...this.config, followClaudeCode: input.on || undefined };
    saveConfig(this.home, this.config);
    if (input.on) this.startFollowing();
    else {
      this.#follower?.stop();
      this.#follower = undefined;
    }
    return this.claudeCode();
  }

  async claudeCode(): Promise<ClaudeCodeFollow> {
    const follower = this.#follower ?? new TranscriptFollower(() => {});
    return { on: !!this.config.followClaudeCode, dir: follower.dir, found: existsSync(follower.dir) };
  }

  /** Follow Claude Code sessions if the person turned that on (the daemon calls this when it starts). */
  startFollowing(): void {
    if (!this.config.followClaudeCode || this.#follower?.running) return;
    this.#follower = new TranscriptFollower((said) => this.#mentionsIn(said));
    this.#follower.start();
  }

  /** Links to posts in what an agent said in a Claude Code session: each post once per session and hour. */
  #mentionsIn(said: SessionText): void {
    for (const ref of postRefsIn(said.text)) {
      let post: PostInfo;
      try {
        post = postTargetOf(ref) ? this.#postAt(postTargetOf(ref)!) : this.#allPosts().find((p) => p.id.startsWith(ref))!;
      } catch {
        continue; // not a post you can see here
      }
      if (!post) continue;
      const hour = Date.now() - 60 * 60 * 1000;
      if (this.#mentions.some((m) => m.post.id === post.id && m.session?.id === said.session && Date.parse(m.time) > hour)) continue;
      this.#mention(post, { source: 'claude-code', session: { id: said.session, ...(said.cwd ? { folder: basename(said.cwd) } : {}) } });
    }
  }

  #mention(post: PostInfo, how: Pick<MentionInfo, 'source'> & Partial<Pick<MentionInfo, 'agent' | 'session' | 'note'>>): MentionInfo {
    const { id, url, title, type, text, board, space, by, issue, chat, score } = post;
    const mention: MentionInfo = {
      id: `mention-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      time: new Date().toISOString(),
      post: { id, url, title, type, text: text.slice(0, 600), ...(board ? { board } : {}), ...(space ? { space } : {}), by, ...(issue ? { issue } : {}), chat, score },
      ...how,
    };
    this.#mentions = [mention, ...this.#mentions].slice(0, 100);
    for (const listener of this.#mentionListeners) listener(mention);
    return mention;
  }

  async permissionRequests(): Promise<PermissionRequest[]> {
    return this.#requests().filter((r) => r.state === 'pending' && this.#agents.some((a) => a.name === r.agent));
  }

  async answerPermission(input: { id: string; allow: boolean }): Promise<PermissionRequest> {
    const requests = this.#requests();
    const request = requests.find((r) => r.id === input.id);
    if (!request) throw new Error('no such request (it may have been answered already)');
    if (request.state !== 'pending') return request;
    if (input.allow) {
      const agent = this.#agents.find((a) => a.name === request.agent);
      if (!agent) throw new Error(`the agent ${request.agent} is gone`);
      await this.updateAgent({ name: agent.name, permissions: [...agent.permissions, ...request.kinds] });
    }
    request.state = input.allow ? 'allowed' : 'declined';
    writeJson(this.#requestsFile, requests);
    this.#emitLive();
    return request;
  }

  /** What co-authorship needs to know about keys. */
  #keyFacts: KeyFacts = {
    personOf: (key) => this.replica.authority.personOf(key),
    isAgent: (key) => this.replica.authority.grant(key)?.role === 'agent',
  };

  /** A co-author by name, did:key, your agent's name, or someone's agent as "person·agent". */
  /** Co-authors to name in a space: resolved, each one a member who can confirm. */
  #coauthorList(space: StoredSpace, refs: string[]): Did[] {
    if (refs.length > MAX_COAUTHORS) throw new Error(`name at most ${MAX_COAUTHORS} co-authors`);
    const state = this.#state(space);
    const named = [...new Set(refs.map((ref) => this.#resolveCoauthor(ref)))];
    for (const did of named) {
      const person = this.replica.authority.personOf(did);
      if (!state.members.has(person)) throw new Error(`${this.nameOf(person) ?? did} isn't in ${space.name}, so they can't confirm`);
    }
    return named;
  }

  #resolveCoauthor(ref: string): Did {
    const text = ref.trim();
    if (isDid(text)) return text;
    const split = /^(.+?)\s*[·/]\s*([a-z0-9-]+)$/.exec(text);
    if (split) {
      const person = this.resolve(split[1]);
      const grant = this.replica.authority.grantsOf(person).find((g) => g.role === 'agent' && g.name === split[2] && g.revokedAfter === undefined);
      if (!grant) throw new Error(`${split[1]} has no agent named "${split[2]}"`);
      return grant.subject;
    }
    const mine = this.#agents.find((a) => a.name === text);
    return mine ? mine.did : this.resolve(text);
  }

  /** A key as an actor: an agent shows with its person. */
  #keyActor(did: Did) {
    const grant = this.replica.authority.grant(did);
    if (grant?.role === 'agent') return { did: grant.author, ...(this.nameOf(grant.author) ? { name: this.nameOf(grant.author) } : {}), ...(grant.name ? { agent: grant.name } : {}) };
    return { did, ...(this.nameOf(did) ? { name: this.nameOf(did) } : {}) };
  }

  /** The co-authors a post names, wherever it is. */
  #namedIn(postId: string): Did[] | undefined {
    for (const { posts } of this.#postSources()) {
      const post = posts.find((p) => p.id === postId);
      if (post) return post.with;
    }
    return undefined;
  }

  /** Every post this node can read, with the entries around it: per project and community, and the public ones. */
  #postSources(): Array<{ posts: Post[]; entries: Entry[]; space?: StoredSpace }> {
    const out: Array<{ posts: Post[]; entries: Entry[]; space?: StoredSpace }> = [];
    for (const space of this.#spaces.values()) {
      if (space.kind !== 'project' && space.kind !== 'community') continue;
      const entries = this.#entries(space);
      out.push({ posts: postsOf(space.kind, entries, this.#state(space).maintainers), entries, space });
    }
    const entries = this.#decodeAll()
      .filter((d) => !d.space && !d.private)
      .map((d) => ({ id: eventId(d.event), event: d.event, kind: d.inner.kind, body: d.inner.body }));
    out.push({ posts: postsOf(undefined, entries), entries });
    return out;
  }

  async editPost(input: { post: string; title?: string; text?: string; link?: string; image?: string; with?: string[]; as?: string }): Promise<PostInfo> {
    const post = await this.#ownPost(input.post, 'edit');
    const body: Record<string, Json> = { target: post.id };
    if (input.title !== undefined) {
      const title = input.title.trim();
      if (!title) throw new Error('a post needs a title');
      if (title.length > TEXT_LIMITS.title) throw tooLong('The title', title.length, TEXT_LIMITS.title);
      body.title = title;
    }
    if (input.text !== undefined) body.text = input.text;
    if (input.link !== undefined) {
      const link = input.link.trim();
      if (link && !/^https?:\/\//.test(link)) throw new Error('links start with http:// or https://');
      body.link = link;
    }
    if (input.image !== undefined) {
      const image = input.image.trim();
      if (image && !parseBlobRef(image)) throw new Error('attach an uploaded image (a wblob: reference)');
      body.image = image;
    }
    if (input.with !== undefined) {
      const space = post.space && this.#spaces.get(post.space.id);
      if (!space) throw new Error("co-authors are named in the space a post is in, and you aren't in it");
      body.with = this.#coauthorList(space, input.with);
    }
    if (Object.keys(body).length === 1) throw new Error('nothing to change: give a new title, text, link, image or co-authors');
    await this.publish({ kind: KIND_POST_EDIT, body, space: post.space?.id, as: input.as });
    return this.post(post.id);
  }

  async deletePost(input: { post: string; as?: string }): Promise<void> {
    const post = await this.#ownPost(input.post, 'delete');
    await this.publish({ kind: KIND_POST_DELETE, body: { target: post.id }, space: post.space?.id, as: input.as });
  }

  /** A post you may edit (yours) or delete (yours, or any in a space you maintain or moderate). */
  async #ownPost(ref: string, action: 'edit' | 'delete'): Promise<PostInfo> {
    const post = await this.post(ref);
    if (post.type !== 'post') throw new Error(`only posts can be changed this way; this is a ${post.type}`);
    // Old ideas threads show up as posts too, but are weave.thread events.
    if (!this.#decodeAll().some((d) => d.inner.kind === KIND_POST && eventId(d.event) === post.id)) throw new Error('only posts can be changed this way; this is an older thread');
    if (post.by.did === this.identity.author) return post;
    const space = post.space && this.#spaces.get(post.space.id);
    if (action === 'delete' && space && this.#state(space).maintainers.has(this.identity.author)) return post;
    throw new Error(action === 'edit' ? 'only its author can edit a post' : `only its author${space ? ` or the ${space.kind === 'community' ? 'moderators' : 'maintainers'}` : ''} can delete a post`);
  }

  async upvote(input: { target: string; value: number; as?: string }): Promise<PostInfo> {
    if (![1, 0, -1].includes(input.value)) throw new Error('upvote with 1, -1, or 0 to take it back');
    const post = await this.post(input.target);
    await this.publish({ kind: KIND_UPVOTE, body: { target: post.id, value: input.value }, space: post.space?.id, as: input.as });
    return this.post(post.id);
  }

  async save(input: { target: string; mode: SaveMode | null }): Promise<void> {
    if (input.mode !== null && !SAVE_MODES.includes(input.mode)) throw new Error(`save as ${SAVE_MODES.join(' or ')}, or null to forget`);
    const post = await this.post(input.target);
    this.replica.append(this.identity, this.#sealForSelf({ kind: KIND_SAVE, body: { target: post.id, mode: input.mode } }));
  }

  async share(input: { post: string; to: string; text?: string }): Promise<PostInfo> {
    const post = await this.post(input.post);
    const project = post.project ? { id: post.project.id, name: post.project.name, description: post.project.description, status: post.project.status, ...(post.project.icon ? { icon: post.project.icon } : {}) } : undefined;
    const text = input.text?.trim() || post.text;
    if (input.to === 'followers') {
      const page = project && this.#spaces.has(project.id) ? this.#page(this.#spaces.get(project.id)!, this.#state(this.#spaces.get(project.id)!)) : undefined;
      if (!project || !page?.public) throw new Error('only projects with a public page can be shared with your followers; share other posts into a community');
      const { id } = await this.publish({ kind: KIND_POST, body: { title: post.title, text, share: { post: post.id, project } } });
      return this.post(id);
    }
    const target = this.#space(input.to);
    if (target.kind !== 'community') throw new Error(`share into a community (or "followers"); ${target.name} is a ${target.kind}`);
    const share: Record<string, Json> = { post: post.id, ...(post.space ? { space: { ...post.space } } : {}), ...(project ? { project } : {}) };
    const body: Record<string, Json> = { title: post.title, text, share };
    if (post.link) body.link = post.link;
    if (post.image) body.image = post.image;
    const { id } = await this.publish({ kind: KIND_POST, body, space: target.id });
    return this.post(id);
  }

  async boards(ref: string): Promise<BoardInfo[]> {
    const space = this.#space(ref);
    const { posts, boards } = this.#spacePosts(space);
    const state = this.#state(space);
    const access = space.kind === 'project' ? this.#access(space, state, this.#entries(space)) : undefined;
    const me = this.identity.author;
    return boards
      .filter((b) => !access || mayUse('read', b.name, me, state, access) || !state.members.has(me))
      .map((b) => {
        const inBoard = posts.filter((p) => p.board === b.name);
        const active = inBoard.reduce<string | undefined>((latest, p) => (!latest || p.active > latest ? p.active : latest), undefined);
        const rules = access?.rules.get(b.name);
        const info = (list?: Grantee[]) => list?.map((g) => this.#granteeInfo(g, state));
        return {
          ...b,
          count: inBoard.length,
          ...(active ? { active } : {}),
          access: { ...(rules?.read ? { read: info(rules.read) } : {}), ...(rules?.write ? { write: info(rules.write) } : {}) },
          canWrite: !access || !rules?.write || mayUse('write', b.name, me, state, access),
          ...(space.kind === 'project' ? { following: this.#follows(space.id, b.name) } : {}),
        };
      });
  }

  async setBoardAccess(input: { project: string; board: string; read?: string[] | null; write?: string[] | null }): Promise<BoardInfo[]> {
    const project = this.#project(input.project);
    const state = this.#maintainerState(project);
    const board = this.#board(project, this.#spacePosts(project).boards, input.board);
    const before = this.#access(project, state, this.#entries(project)).rules.get(board.name) ?? {};
    const grantees = (list: string[] | null | undefined, keep?: Grantee[]): Grantee[] | null => {
      if (list === null) return null;
      if (list === undefined) return keep ?? null;
      return list.map((ref) => {
        if (ref.startsWith('group:')) return { group: this.#knownGroup(project, ref.slice(6)).id };
        const did = this.resolve(ref);
        if (!state.members.has(did)) throw new Error(`${ref} isn't in ${project.name}`);
        return { person: did };
      });
    };
    const read = grantees(input.read, before.read);
    const write = grantees(input.write, before.write);
    this.replica.append(this.identity, sealFor(project, { kind: KIND_BOARD_ACCESS, body: { board: board.name, read: read as unknown as Json, write: write as unknown as Json } }));
    await this.#reconcileBoards(project);
    return this.boards(project.id);
  }

  #granteeInfo(g: Grantee, state: SpaceState): GranteeInfo {
    if ('person' in g) return { person: g.person, ...(this.nameOf(g.person) ? { name: this.nameOf(g.person) } : {}) };
    return { group: g.group, name: this.#spaces.get(g.group)?.name ?? state.groups.get(g.group)?.name ?? 'group' };
  }

  async setBoard(input: { project: string; name: string; title?: string; type?: BoardType; sort?: PostSort; position?: number; on?: boolean }): Promise<BoardInfo[]> {
    const project = this.#project(input.project);
    this.#maintainerState(project);
    const name = boardName(input.name);
    if (!name) throw new Error('board names use letters, digits and dashes');
    if (input.sort !== undefined && !POST_SORTS.includes(input.sort)) throw new Error(`sort by ${POST_SORTS.join(', ')}`);
    const body: Record<string, Json> = { name };
    const isNew = !(await this.boards(project.id)).some((b) => b.name === name);
    const title = input.title ?? (isNew ? input.name : undefined);
    if (title !== undefined) body.title = title.trim().slice(0, 40);
    if (input.type !== undefined) body.type = input.type;
    if (input.sort !== undefined) body.sort = input.sort;
    if (input.position !== undefined) body.position = input.position;
    if (input.on === false) body.on = false;
    this.replica.append(this.identity, sealFor(project, { kind: KIND_BOARD, body }));
    return this.boards(project.id);
  }

  async curate(input: { space: string; board?: string; pinned: string[] }): Promise<BoardInfo[]> {
    const space = this.#space(input.space);
    this.#maintainerState(space);
    const { posts, boards } = this.#spacePosts(space);
    const board = this.#board(space, boards, input.board ?? (space.kind === 'community' ? COMMUNITY_BOARD : ''));
    const pinned = (input.pinned ?? []).map((ref) => {
      const match = posts.filter((p) => p.board === board.name && p.id.startsWith(ref));
      if (match.length !== 1) throw new Error(`no single post ${ref} in ${board.title}`);
      return match[0].id;
    });
    this.replica.append(this.identity, sealFor(space, { kind: KIND_CURATE, body: { board: board.name, pinned } }));
    return this.boards(space.id);
  }

  // ---------------------------------------------------------------- projects

  async project(ref: string): Promise<ProjectInfo> {
    const project = this.#project(ref);
    const state = this.#state(project);
    const post = this.#projectPost(project);
    return {
      ...this.#spaceInfo(project),
      kind: 'project',
      page: this.#page(project, state),
      maintainers: [...state.maintainers].map((did) => this.#actor(did, did)),
      groups: [...state.groups.values()].map((g) => ({ id: g.id, name: this.#spaces.get(g.id)?.name ?? g.name, auto: g.auto })),
      maintainer: state.maintainers.has(this.identity.author),
      ...(post ? { post } : {}),
    };
  }

  async setProjectPage(input: { project: string; as?: string } & Partial<ProjectPage>): Promise<ProjectInfo> {
    const project = this.#project(input.project);
    const state = this.#maintainerState(project);
    if (input.as) this.#agentMay(input.as, KIND_PAGE);
    if (input.status !== undefined && !PROJECT_STATUSES.includes(input.status)) throw new Error(`status is one of ${PROJECT_STATUSES.join(', ')}`);
    for (const image of [input.icon, input.banner]) if (image && !parseBlobRef(image)) throw new Error('icons and banners are uploaded images (wblob: references)');
    const before = this.#page(project, state);
    // Older callers set only the description: that is the body.
    const pageBody = input.body ?? (input.description !== undefined && input.subtitle === undefined ? input.description : before.body);
    const subtitle = (input.subtitle ?? before.subtitle).trim();
    const pageTitle = (input.title ?? before.title).trim();
    if (pageBody.length > TEXT_LIMITS.page) throw tooLong('The page', pageBody.length, TEXT_LIMITS.page);
    if (subtitle.length > TEXT_LIMITS.pageSubtitle) throw tooLong('The subtitle', subtitle.length, TEXT_LIMITS.pageSubtitle);
    if (pageTitle.length > TEXT_LIMITS.pageTitle) throw tooLong('The title', pageTitle.length, TEXT_LIMITS.pageTitle);
    // An empty string removes an image; undefined keeps it.
    const icon = input.icon === undefined ? before.icon : input.icon || undefined;
    const banner = input.banner === undefined ? before.banner : input.banner || undefined;
    const page: ProjectPage = {
      title: pageTitle,
      subtitle,
      body: pageBody,
      ...(icon ? { icon } : {}),
      ...(banner ? { banner } : {}),
      description: subtitle || summary(pageBody),
      status: input.status ?? before.status,
      public: input.public ?? before.public,
    };
    if (input.as && (page.public || before.public)) this.#agentMay(input.as, KIND_PUBLIC_PROJECT);
    await this.publish({ kind: KIND_PAGE, body: { ...page }, space: project.id, as: input.as });
    // Public projects keep a public copy of their page; making it private publishes a withdrawal.
    if (page.public || before.public) {
      const body: Record<string, Json> = page.public
        ? { project: project.id, name: project.name, title: page.title, subtitle: page.subtitle, ...(page.icon ? { icon: page.icon } : {}), description: page.description, status: page.status, public: true }
        : { project: project.id, public: false };
      await this.publish({ kind: KIND_PUBLIC_PROJECT, body, as: input.as });
    }
    return this.project(project.id);
  }

  // ---------------------------------------------------------------- images

  async putBlob(input: { data: string; type: string }): Promise<string> {
    if (!BLOB_TYPES.includes(input.type as BlobType)) throw new Error(`images are ${BLOB_TYPES.map((t) => t.slice(6).toUpperCase()).join(', ')}`);
    const { data, ref } = encryptBlob(new Uint8Array(Buffer.from(input.data, 'base64')), input.type as BlobType);
    this.blobs.put(data);
    return `wblob:${ref.hash}.${ref.key}`;
  }

  async blob(text: string): Promise<{ data: string; type: string }> {
    const ref = parseBlobRef(text);
    if (!ref) throw new Error('not an image reference');
    const stored = await this.blobs.fetch(ref.hash, (hashes) => this.#swarm?.want(hashes));
    const { bytes, type } = decryptBlob(stored, ref.key);
    return { data: Buffer.from(bytes).toString('base64'), type };
  }

  /** Ask peers ahead of time for images in what we can read, so they show at once and we can pass them on. */
  #prefetchBlobs(): void {
    if (!this.#swarm) return;
    const missing: string[] = [];
    for (const d of this.#decodeAll()) {
      if (!d.space) continue;
      for (const ref of blobRefsIn(JSON.stringify(d.inner.body ?? ''))) {
        if (this.#prefetched.has(ref.hash) || this.blobs.has(ref.hash)) continue;
        this.#prefetched.add(ref.hash);
        missing.push(ref.hash);
      }
    }
    for (const hash of missing.slice(0, 64)) {
      this.blobs.fetch(hash, (hashes) => this.#swarm?.want(hashes), 120_000).catch(() => this.#prefetched.delete(hash));
    }
  }

  async setMaintainer(input: { project: string; who: string; on: boolean }): Promise<void> {
    this.#appoint(this.#project(input.project), input.who, input.on);
  }

  async inviteGroup(input: { project: string; group: string }): Promise<void> {
    const project = this.#project(input.project);
    const state = this.#maintainerState(project);
    const group = this.#space(input.group, 'group');
    this.replica.append(this.identity, sealFor(project, { kind: KIND_PROJECT_GROUP, body: { group: group.id, name: group.name, on: true } }));
    // Inviting the group is the consent for everyone in it right now.
    const newcomers = [...this.#state(group).members.keys()].filter((did) => !state.members.has(did));
    this.#admitAll(project, group, newcomers);
  }

  async uninviteGroup(input: { project: string; group: string }): Promise<void> {
    const project = this.#project(input.project);
    this.#maintainerState(project);
    const group = this.#knownGroup(project, input.group);
    this.replica.append(this.identity, sealFor(project, { kind: KIND_PROJECT_GROUP, body: { group: group.id, name: group.name, on: false } }));
  }

  async setRule(input: { project: string; group: string; auto: boolean }): Promise<void> {
    const project = this.#project(input.project);
    this.#maintainerState(project);
    const group = this.#knownGroup(project, input.group);
    this.replica.append(this.identity, sealFor(project, { kind: KIND_RULE, body: { group: group.id, auto: input.auto } }));
  }

  async admissions(ref?: string): Promise<Admission[]> {
    const projects = ref ? [this.#project(ref)] : [...this.#spaces.values()].filter((s) => s.kind === 'project');
    const out: Admission[] = [];
    for (const project of projects) {
      const state = this.#state(project);
      if (!state.maintainers.has(this.identity.author)) continue;
      for (const change of this.#changes(project, state)) out.push(change);
    }
    return out;
  }

  async admit(input: { project: string; who: string; group: string; always?: boolean }): Promise<void> {
    const project = this.#project(input.project);
    const state = this.#maintainerState(project);
    const group = this.#space(input.group, 'group');
    if (!state.groups.has(group.id)) throw new Error(`${group.name} is not invited to ${project.name}`);
    // "Allow for all projects with this group": a standing rule in every project we maintain that invited it.
    if (input.always) {
      for (const other of [...this.#spaces.values()].filter((s) => s.kind === 'project')) {
        const otherState = this.#state(other);
        if (otherState.maintainers.has(this.identity.author) && otherState.groups.has(group.id) && !otherState.groups.get(group.id)!.auto) {
          this.replica.append(this.identity, sealFor(other, { kind: KIND_RULE, body: { group: group.id, auto: true } }));
        }
      }
    }
    const did = this.resolve(input.who);
    if (!state.members.has(did)) this.#admitAll(project, group, [did]);
  }

  async decline(input: { project: string; who: string; group: string }): Promise<void> {
    const project = this.#project(input.project);
    this.#maintainerState(project);
    const group = this.#knownGroup(project, input.group);
    this.replica.append(this.identity, sealFor(project, { kind: KIND_DECLINE, body: { member: this.resolve(input.who), via: group.id } }));
  }

  /**
   * Carry out standing rules: admit newcomers of auto-admitted groups (any
   * participant may), and remove those who left them (maintainers only).
   * The daemon calls this whenever new events arrive. Returns how many people
   * were admitted or removed.
   */
  async reconcile(): Promise<number> {
    this.#prefetchBlobs();
    let changed = (await this.#expireMemberships()) + (await this.#grantAutomatic()) + (await this.#grantPaid()) + (await this.#renewPaid()) + (await this.#sendQueuedRequests()) + (await this.#syncGithub());
    for (const space of [...this.#spaces.values()]) changed += this.#rotateAfterLeaving(space, this.#state(space));
    for (const project of [...this.#spaces.values()].filter((s) => s.kind === 'project')) {
      const state = this.#state(project);
      if (!state.members.has(this.identity.author)) continue;
      changed += await this.#reconcileBoards(project);
      const joins = new Map<string, Did[]>();
      for (const change of this.#changes(project, state)) {
        if (!state.groups.get(change.group.id)?.auto) continue;
        if (change.change === 'join') joins.set(change.group.id, [...(joins.get(change.group.id) ?? []), change.did]);
        else if (state.maintainers.has(this.identity.author)) {
          await this.removeMember(project.id, change.did);
          changed++;
        }
      }
      for (const [groupId, dids] of joins) {
        this.#admitAll(project, this.#spaces.get(groupId)!, dids);
        changed += dids.length;
      }
    }
    return changed;
  }

  // ---------------------------------------------------------------- GitHub: repos that follow a space

  get #githubFile(): string {
    return joinPath(this.home.dir, 'github.json');
  }

  /** The GitHub sign-in on this device (kept in the home, never in a log). */
  #githubAuth(): { token: string; login: string } | undefined {
    const saved = readJson<{ token?: string; login?: string }>(this.#githubFile);
    return saved?.token && saved.login ? { token: saved.token, login: saved.login } : undefined;
  }

  /** The GitHub App this node signs in through: your own, or Weave Connect. */
  #githubApp(): GitHubApp {
    return this.config.githubApp ?? { ...DEFAULT_GITHUB_APP, clientId: this.githubSetup.clientId };
  }

  async github(): Promise<GitHubInfo> {
    const auth = this.#githubAuth();
    const login = this.#githubLogin;
    const app = this.#githubApp();
    return {
      available: !!app.clientId,
      installUrl: githubInstallUrl(app.slug),
      app: { name: app.name, slug: app.slug, owner: app.owner, url: `https://github.com/apps/${app.slug}`, own: !!this.config.githubApp },
      ...(auth ? { login: auth.login } : {}),
      ...(login?.code ? { pending: { userCode: login.code.userCode, verificationUri: login.code.verificationUri, expires: login.code.expiresAt } } : {}),
      ...(login?.error ? { error: login.error } : {}),
    };
  }

  async setGithubApp(link: string | null): Promise<GitHubInfo> {
    const app = link?.trim() ? await lookUpGitHubApp(link, this.githubSetup.fetch) : undefined;
    const before = this.#githubApp().clientId;
    const { githubApp: _old, ...rest } = this.config;
    this.config = app && app.clientId !== DEFAULT_GITHUB_APP.clientId ? { ...rest, githubApp: app } : rest;
    saveConfig(this.home, this.config);
    // A sign-in belongs to the app it went through.
    if (this.#githubApp().clientId !== before) await this.disconnectGithub();
    return this.github();
  }

  async connectGithub(): Promise<GitHubInfo> {
    const { fetch: fetchImpl, sleep } = this.githubSetup;
    const { clientId } = this.#githubApp();
    this.#githubLogin?.cancel.abort();
    const cancel = new AbortController();
    const code = await startDeviceFlow(clientId, fetchImpl);
    const login: GitHubLogin = { code, cancel };
    this.#githubLogin = login;
    // Wait for the person to enter the code on GitHub, in the background; github() tells how it went.
    void finishDeviceFlow(clientId, code, fetchImpl, cancel.signal, sleep)
      .then(async (token) => {
        const user = await new GitHub(token, fetchImpl).user();
        writeJson(this.#githubFile, { token, login: user.login, id: user.id, connected: new Date(this.clock()).toISOString() });
        this.#githubSynced.clear();
        if (this.#githubLogin === login) this.#githubLogin = undefined;
      })
      .catch((error: Error) => {
        if (this.#githubLogin === login) this.#githubLogin = cancel.signal.aborted ? undefined : { error: error.message, cancel };
      });
    return this.github();
  }

  async disconnectGithub(): Promise<GitHubInfo> {
    this.#githubLogin?.cancel.abort();
    this.#githubLogin = undefined;
    rmSync(this.#githubFile, { force: true });
    return this.github();
  }

  async githubRepos(): Promise<string[]> {
    const auth = this.#githubAuth();
    if (!auth) throw new Error('connect GitHub first (Keys & devices → Linked accounts, or "weave github connect")');
    return new GitHub(auth.token, this.githubSetup.fetch).repos();
  }

  async spaceRepos(ref: string): Promise<SpaceRepos> {
    const space = this.#space(ref);
    if (space.kind === 'direct') throw new Error('direct chats have no repositories');
    const state = this.#state(space);
    const entries = this.#entries(space);
    const me = this.identity.author;
    const repos = reposOf(entries, (did) => mayManageSpace(state, did));
    const accounts = accountsOf(entries);
    const out: SpaceRepos = {
      repos: repos.map((r): RepoInfo => {
        const synced = r.by === me ? this.#githubSynced.get(r.repo.toLowerCase()) : undefined;
        return {
          repo: r.repo,
          url: `https://github.com/${r.repo}`,
          ...(r.board ? { board: r.board } : {}),
          by: this.#actor(r.by, r.by),
          ...(r.by === me ? { mine: true as const } : {}),
          ...(synced ? { synced: new Date(synced.at).toISOString() } : {}),
          ...(synced?.problem ? { problem: synced.problem } : {}),
        };
      }),
      canLink: mayManageSpace(state, me),
      ...(accounts.has(me) ? { shared: accounts.get(me)! } : {}),
    };
    const mine = repos.filter((r) => r.by === me);
    if (mine.length) {
      const wanted = new Set(mine.flatMap((r) => this.#repoReaders(space, state, entries, r.board)));
      wanted.delete(me);
      out.missing = [...wanted].filter((did) => !accounts.has(did)).map((did) => this.#actor(did, did));
      out.accounts = [...accounts].filter(([did]) => wanted.has(did)).map(([did, login]) => ({ who: this.#actor(did, did), login }));
    }
    return out;
  }

  async linkRepo(input: { space: string; repo: string; board?: string; on: boolean; as?: string }): Promise<SpaceRepos> {
    if (input.as) this.#agentMay(input.as, KIND_GITHUB_REPO);
    const space = this.#space(input.space);
    if (space.kind === 'direct') throw new Error('direct chats have no repositories');
    const state = this.#state(space);
    if (!mayManageSpace(state, this.identity.author)) throw new Error(`only the ${space.kind === 'group' ? 'owner' : space.kind === 'community' ? 'moderators' : 'maintainers'} of ${space.name} can link repositories`);
    const repo = input.repo.trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '');
    if (!isRepoName(repo)) throw new Error('a repository looks like owner/name');
    const body: Record<string, Json> = { repo, on: input.on };
    if (input.on) {
      const board = input.board?.trim();
      if (board) {
        if (space.kind !== 'project') throw new Error('only projects have boards');
        if (!boardsOf('project', this.#entries(space), state.maintainers).some((b) => b.name === board)) throw new Error(`${space.name} has no board "${board}"`);
        body.board = board;
      }
      const match = (await this.githubRepos()).find((r) => r.toLowerCase() === repo.toLowerCase());
      if (!match) throw new Error(`the Weave app can't manage ${repo}: install it on that repository on GitHub (you need to be its admin)`);
      body.repo = match;
    }
    await this.publish({ kind: KIND_GITHUB_REPO, body, space: space.id, as: input.as });
    this.#githubSynced.delete(repo.toLowerCase());
    await this.#syncGithub();
    return this.spaceRepos(space.id);
  }

  async shareGithub(input: { space: string; on: boolean; as?: string }): Promise<SpaceRepos> {
    if (input.as) this.#agentMay(input.as, KIND_GITHUB_ACCOUNT);
    const space = this.#space(input.space);
    if (space.kind === 'direct') throw new Error('direct chats have no repositories');
    if (!this.#state(space).members.has(this.identity.author)) throw new Error(`you are not a member of ${space.name}`);
    const auth = input.on ? this.#githubAuth() : undefined;
    if (input.on && !auth) throw new Error('connect GitHub first, so Weave knows your account');
    await this.publish({ kind: KIND_GITHUB_ACCOUNT, body: auth ? { login: auth.login, on: true } : { on: false }, space: space.id, as: input.as });
    return this.spaceRepos(space.id);
  }

  async showGithubOnHub(input: { on: boolean }): Promise<Profile> {
    const me = this.identity.author;
    const before = this.#hubGithub(me);
    if (!input.on) {
      if (before) this.replica.append(this.identity, { kind: KIND_GITHUB_PUBLIC, body: { on: false } });
      return this.profile();
    }
    const auth = this.#githubAuth();
    if (!auth) throw new Error('connect GitHub first');
    // The proof: a public gist of this account naming this did. Made once, kept while the account stays the same.
    let gist = before && before.login.toLowerCase() === auth.login.toLowerCase() ? before.gist : undefined;
    if (!gist) gist = (await new GitHub(auth.token, this.githubSetup.fetch).createGist('Weave', 'weave.md', githubProofText(me, auth.login))).id;
    if (before?.gist === gist) return this.profile();
    this.replica.append(this.identity, { kind: KIND_GITHUB_PUBLIC, body: { login: auth.login, gist, on: true } });
    return this.profile();
  }

  /** The GitHub account someone shows on their hub (latest word), not checked yet. */
  #hubGithub(did: Did): { login: string; gist: string } | undefined {
    const last = this.replica.events((e) => e.author === did && e.kind === KIND_GITHUB_PUBLIC).sort((a, b) => a.time.localeCompare(b.time)).at(-1);
    const body = (last?.body ?? {}) as Record<string, unknown>;
    if (!last || body.on === false || !isLogin(body.login) || typeof body.gist !== 'string' || !/^[A-Za-z0-9]{1,64}$/.test(body.gist)) return undefined;
    return { login: body.login, gist: body.gist };
  }

  /** Who a repo linked to a space should include: its members, or in a project the readers of one board. */
  #repoReaders(space: StoredSpace, state: SpaceState, entries: Entry[], board?: string): Did[] {
    if (!board || space.kind !== 'project') return [...state.members.keys()];
    return readersOf(board, state, this.#access(space, state, entries));
  }

  /**
   * Bring the repos this person linked in step with their spaces: invite
   * members who gave their GitHub account, take access away from those Weave
   * added who left (or whose repo was unlinked). Each repo at most every few
   * minutes unless something changed; without a GitHub sign-in it waits.
   */
  async #syncGithub(): Promise<number> {
    const auth = this.#githubAuth();
    const me = this.identity.author;
    // Every repo this person linked, with everyone it should include.
    const wanted = new Map<string, { repo: string; logins: Set<string> }>();
    for (const space of this.#spaces.values()) {
      if (space.kind === 'direct') continue;
      const state = this.#state(space);
      if (!mayManageSpace(state, me)) continue;
      const entries = this.#entries(space);
      const links = reposOf(entries, (did) => mayManageSpace(state, did)).filter((r) => r.by === me);
      if (!links.length) continue;
      const accounts = accountsOf(entries);
      for (const link of links) {
        const key = link.repo.toLowerCase();
        const entry = wanted.get(key) ?? { repo: link.repo, logins: new Set<string>() };
        for (const did of this.#repoReaders(space, state, entries, link.board)) if (did !== me && accounts.has(did)) entry.logins.add(accounts.get(did)!.toLowerCase());
        wanted.set(key, entry);
      }
    }
    // Who Weave gave access, per repo: the latest word per repo and login.
    const added = new Map<string, { repo: string; people: Map<string, boolean> }>();
    for (const b of this.#selfBodies(KIND_GITHUB_ADDED)) {
      if (!isRepoName(b.repo) || typeof b.login !== 'string') continue;
      const key = b.repo.toLowerCase();
      if (!added.has(key)) added.set(key, { repo: b.repo, people: new Map() });
      added.get(key)!.people.set(b.login.toLowerCase(), b.on === true);
    }
    const repos = new Set([...wanted.keys(), ...[...added].filter(([, a]) => [...a.people.values()].some(Boolean)).map(([key]) => key)]);
    const now = this.clock();
    let changed = 0;
    for (const key of repos) {
      const repo = wanted.get(key)?.repo ?? added.get(key)!.repo;
      const want = wanted.get(key)?.logins ?? new Set<string>();
      if (auth) want.delete(auth.login.toLowerCase());
      const gave = [...(added.get(key)?.people ?? [])].filter(([, on]) => on).map(([login]) => login);
      const shape = JSON.stringify([[...want].sort(), gave.sort()]);
      const last = this.#githubSynced.get(key);
      if (last && last.shape === shape && now - last.at < (last.problem ? 60_000 : 10 * 60_000)) continue;
      if (!auth) {
        this.#githubSynced.set(key, { at: now, shape, problem: 'not connected to GitHub on this device' });
        continue;
      }
      try {
        const client = new GitHub(auth.token, this.githubSetup.fetch);
        const plan = planSync(want, await client.access(repo), gave);
        for (const login of plan.invite) {
          await client.invite(repo, login);
          this.replica.append(this.identity, this.#sealForSelf({ kind: KIND_GITHUB_ADDED, body: { repo, login, on: true } }));
          changed++;
        }
        for (const { login, invitation } of plan.remove) {
          await client.remove(repo, login, invitation);
          this.replica.append(this.identity, this.#sealForSelf({ kind: KIND_GITHUB_ADDED, body: { repo, login, on: false } }));
          changed++;
        }
        const after = [...gave.filter((l) => !plan.remove.some((r) => r.login === l)), ...plan.invite].sort();
        this.#githubSynced.set(key, { at: now, shape: JSON.stringify([[...want].sort(), after]) });
      } catch (error) {
        this.#githubSynced.set(key, { at: now, shape, problem: (error as Error).message });
      }
    }
    return changed;
  }

  // ---------------------------------------------------------------- people

  async setEdge(input: EdgeInput): Promise<void> {
    const subject = this.resolve(input.who);
    if (subject === this.identity.author) throw new Error('that is you');
    const inner: Inner = { kind: EDGE_KIND[input.edge], body: edgeBody(subject, input.on) };
    const isPrivate = input.private ?? input.edge !== 'follow';
    this.replica.append(this.identity, isPrivate ? this.#sealForSelf(inner) : inner);
  }

  async social(): Promise<Social> {
    const graph = this.#graph();
    const me = this.identity.author;
    const mine = graph.get(me);
    const people = (dids: Iterable<Did>): Person[] => [...dids].map((did) => ({ did, name: this.nameOf(did) }));
    return {
      following: people(mine?.following ?? []),
      followers: people(followersOf(graph, me)),
      friends: people(friendsOf(graph, me)),
      blocked: people(mine?.blocked ?? []),
      muted: people(mine?.muted ?? []),
    };
  }

  async profile(who?: string): Promise<Profile> {
    const did = who ? this.resolve(who) : this.identity.author;
    const github = this.#hubGithub(did);
    if (github) {
      // Check the proof (once per run) before showing it; a false proof isn't shown at all.
      const key = `${github.gist}:${github.login}:${did}`;
      if (!this.#gistProofs.has(key)) this.#gistProofs.set(key, checkGistProof(github.gist, github.login, did, this.githubSetup.fetch));
      const verified = await this.#gistProofs.get(key)!;
      if (verified === undefined) this.#gistProofs.delete(key); // GitHub unreachable: ask again next time
      return { ...this.#profile(did), ...(verified === false ? {} : { github: { login: github.login, url: `https://github.com/${github.login}`, ...(verified ? { verified } : {}) } }) };
    }
    return this.#profile(did);
  }

  #profile(did: Did): Profile {
    const graph = this.#graph();
    const me = this.identity.author;
    const mine = graph.get(me);
    return {
      did,
      name: this.nameOf(did),
      theme: this.themeOf(did),
      me: did === me,
      following: mine?.following.has(did) ?? false,
      followsMe: graph.get(did)?.following.has(me) ?? false,
      blocked: mine?.blocked.has(did) ?? false,
      muted: mine?.muted.has(did) ?? false,
      contact: this.#contacts().has(did),
      posts: this.replica.events((e) => e.author === did && e.kind === 'weave.post').length,
      projects: this.publicProjectsOf(did),
    };
  }

  async setProfile(input: ProfileInput): Promise<Profile> {
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name || name.length > 40) throw new Error('names are 1 to 40 characters');
      if (name !== this.nameOf(this.identity.author)) this.replica.append(this.identity, { kind: KIND_PROFILE, body: { name } });
    }
    if (input.theme) {
      const theme = sanitizeTheme({ ...this.themeOf(this.identity.author), ...input.theme });
      this.replica.append(this.identity, { kind: KIND_THEME, body: { ...theme } });
    }
    return this.profile();
  }

  async directory(query?: string): Promise<Profile[]> {
    const authors = new Set([...this.replica.events((e) => e.kind === KIND_PROFILE).map((e) => e.author), ...this.#contacts().keys()]);
    authors.delete(this.identity.author);
    const q = query?.trim().toLowerCase();
    const profiles = [...authors].map((did) => this.#profile(did));
    return profiles
      .filter((p) => !q || (p.name ?? '').toLowerCase().includes(q) || (q.length >= 8 && p.did.toLowerCase().includes(q)))
      .sort((a, b) => (a.name ?? a.did).localeCompare(b.name ?? b.did));
  }

  async contactLink(): Promise<string> {
    const name = this.nameOf(this.identity.author);
    return encodeContact({ v: 1, did: this.identity.author, ...(name ? { name } : {}), entry: this.#entryPoint() });
  }

  async addContact(link: string): Promise<Profile> {
    const contact = decodeContact(link);
    if (contact.did === this.identity.author) throw new Error("that's your own contact link");
    this.#adoptBootstrap(contact.entry);
    for (const topic of new Set([contact.did, ...contact.entry.topics])) await this.join(topic);
    if (!this.#contacts().has(contact.did)) {
      this.replica.append(this.identity, this.#sealForSelf({ kind: KIND_CONTACT, body: { did: contact.did, name: contact.name ?? null } }));
    }
    if (!(await this.profile(contact.did)).following) await this.setEdge({ edge: 'follow', who: contact.did, on: true });
    return this.profile(contact.did);
  }

  /** A space's theme: the latest theme event its author published. */
  themeOf(author: Did): Theme {
    let theme: unknown;
    for (const event of this.#eventsOf(author)) if (event.kind === KIND_THEME) theme = event.body;
    return sanitizeTheme(theme);
  }

  /** Projects someone shows publicly: their latest public page per project, unless withdrawn. */
  publicProjectsOf(author: Did): PublicProject[] {
    const latest = new Map<string, { body: Record<string, unknown>; time: string }>();
    for (const event of this.#eventsOf(author)) {
      const body = event.body as Record<string, unknown> | null;
      if (event.kind === KIND_PUBLIC_PROJECT && typeof body?.project === 'string') latest.set(body.project, { body, time: event.time });
    }
    return [...latest.values()]
      .filter(({ body }) => body.public === true && typeof body.name === 'string')
      .map(({ body, time }) => ({
        id: body.project as string,
        name: body.name as string,
        description: typeof body.description === 'string' ? body.description : '',
        ...(parseBlobRef(body.icon) ? { icon: body.icon as string } : {}),
        status: PROJECT_STATUSES.includes(body.status as ProjectStatus) ? (body.status as ProjectStatus) : 'active',
        time,
      }));
  }

  // ---------------------------------------------------------------- rooms and shared apps

  async projectApp(ref: string): Promise<AppManifest | null> {
    return this.#app(this.#project(ref)) ?? null;
  }

  async publishApp(input: { project: string; manifest: unknown; folder?: string; as?: string }): Promise<AppManifest> {
    if (input.as) this.#agentMay(input.as, KIND_APP);
    const project = this.#project(input.project);
    this.#maintainerState(project);
    let manifest = parseManifest(input.manifest);
    // weave.app.json usually doesn't list the release files ("weave app release" adds them): keep the ones published.
    const before = this.#app(project)?.install;
    if (before?.assets && !manifest.install?.assets) manifest = { ...manifest, install: { ...before, ...(manifest.install?.steps ? { steps: manifest.install.steps } : {}) } };
    await this.publish({ kind: KIND_APP, body: manifest as unknown as Json, space: project.id, as: input.as });
    if (input.folder) this.#rememberAppFolder(project.id, input.folder);
    return manifest;
  }

  /** The command this computer starts a project's app with: its release build's when Weave installed one. */
  #startCommand(project: StoredSpace, app: AppManifest | undefined): string[] | undefined {
    return startCommand(app, platformKey(), !!this.#installed(project.id));
  }

  async appLaunch(ref: string): Promise<AppLaunchInfo> {
    const project = this.#project(ref);
    const app = this.#app(project);
    const start = app?.start;
    const command = this.#startCommand(project, app);
    const install = this.#installInfo(project, app);
    const folder = this.config.appFolders[project.id];
    const run = this.#apps.status(project.id);
    return {
      ...(command ? { command } : {}),
      ...(start?.hint ? { hint: start.hint } : {}),
      ...(folder ? { folder } : {}),
      approved: !!command && !!folder && this.config.approvedLaunches[project.id] === launchFingerprint(command, folder),
      running: this.#apps.running(project.id),
      ...(run ? { started: run.started, ...(run.exit ? { exit: run.exit } : {}) } : {}),
      log: run?.log ?? [],
      ...(app?.env ? { settings: app.env.map((e) => ({ ...e, set: !!this.#appSettings()[project.id]?.[e.name] })) } : {}),
      ...(app ? { release: this.#releaseInfo(project, app) } : {}),
      ...(install ? { install } : {}),
    };
  }

  /** Whether you may point the app at a release, and where releases come from (the app's repository, or the project's one linked repository). */
  #releaseInfo(project: StoredSpace, app: AppManifest): { canRelease: boolean; repo?: string } {
    const state = this.#state(project);
    const linked = reposOf(this.#entries(project), (did) => state.maintainers.has(did));
    const repo = app.install?.github ?? (linked.length === 1 ? linked[0].repo : undefined);
    return { canRelease: state.maintainers.has(this.identity.author), ...(repo ? { repo } : {}) };
  }

  async appReleases(ref: string): Promise<{ repo: string; releases: Array<{ tag: string; name: string; published?: string; files: number; prerelease: boolean }>; releaseWorkflow?: boolean }> {
    const project = this.#project(ref);
    const app = this.#app(project);
    const repo = app ? this.#releaseInfo(project, app).repo : undefined;
    if (!repo) throw new Error(`${project.name} has no GitHub repository to take releases from: link one in its settings`);
    const auth = this.#githubAuth();
    const client = new GitHub(auth?.token ?? '', this.githubSetup.fetch);
    const [releases, releaseWorkflow] = await Promise.all([client.releases(repo), client.hasReleaseWorkflow(repo)]);
    return { repo, releases, ...(releaseWorkflow !== undefined ? { releaseWorkflow } : {}) };
  }

  async setAppFolder(input: { project: string; folder: string }): Promise<AppLaunchInfo> {
    const project = this.#project(input.project);
    if (input.folder.trim()) this.#rememberAppFolder(project.id, input.folder.trim());
    else {
      const { [project.id]: _gone, ...rest } = this.config.appFolders;
      this.config = { ...this.config, appFolders: rest };
      saveConfig(this.home, this.config);
    }
    return this.appLaunch(project.id);
  }

  async launchApp(input: { project: string; approve?: boolean }): Promise<AppLaunchInfo> {
    const project = this.#project(input.project);
    const app = this.#app(project);
    const command = this.#startCommand(project, app);
    if (!app || !command) throw new Error(`${project.name}'s app has no start command; start it yourself${app?.start?.hint ? `: ${app.start.hint}` : ''}`);
    const folder = this.config.appFolders[project.id];
    if (!folder) throw new Error(`choose where ${app.name} is on this computer first (the folder with its weave.app.json)`);
    this.#checkAppFolder(project.id, folder);
    const fingerprint = launchFingerprint(command, folder);
    if (this.config.approvedLaunches[project.id] !== fingerprint) {
      if (!input.approve) throw new Error(`approve the command first: Weave would run "${command.join(' ')}" in ${folder}`);
      this.config = { ...this.config, approvedLaunches: { ...this.config.approvedLaunches, [project.id]: fingerprint } };
      saveConfig(this.home, this.config);
    }
    const values = this.#appSettings()[project.id] ?? {};
    const missing = (app.env ?? []).filter((e) => !e.optional && !values[e.name]);
    if (missing.length) throw new Error(`${app.name} needs ${missing.map((e) => e.label).join(', ')} first: fill ${missing.length === 1 ? 'it' : 'them'} in under Live (or weave app set ${missing[0].name} -p ${project.name})`);
    // Only the settings this manifest names, and Weave's own variables last, so a setting can't stand in for them.
    const settings = Object.fromEntries((app.env ?? []).filter((e) => values[e.name]).map((e) => [e.name, values[e.name]]));
    this.#apps.start(project.id, command, folder, { ...settings, ...(await this.appEnv(project.id)) });
    return this.appLaunch(project.id);
  }

  // ---------------------------------------------------------------- app settings

  get #appSettingsFile(): string {
    return joinPath(this.home.dir, 'app-settings.json');
  }

  /** Values hosts typed for their apps' settings: project id → variable → value. This computer only. */
  #appSettings(): Record<string, Record<string, string>> {
    return readJson<Record<string, Record<string, string>>>(this.#appSettingsFile) ?? {};
  }

  async setAppSetting(input: { project: string; name: string; value: string | null }): Promise<AppLaunchInfo> {
    const project = this.#project(input.project);
    const app = this.#app(project);
    const setting = app?.env?.find((e) => e.name === input.name);
    if (!app || !setting) throw new Error(`${app?.name ?? project.name} doesn't ask for ${input.name}${app?.env?.length ? ` (it asks for ${app.env.map((e) => e.name).join(', ')})` : ''}`);
    const value = typeof input.value === 'string' ? input.value.trim() : '';
    if (value.length > 4096 || value.includes('\0')) throw new Error(`${setting.label} is too long`);
    const all = this.#appSettings();
    const mine = { ...(all[project.id] ?? {}) };
    if (value) mine[setting.name] = value;
    else delete mine[setting.name];
    if (Object.keys(mine).length) all[project.id] = mine;
    else delete all[project.id];
    writeJson(this.#appSettingsFile, all);
    this.#emitLive();
    return this.appLaunch(project.id);
  }

  // ---------------------------------------------------------------- app API

  /** What a project's app needs to ask Weave who its players are: Weave passes it when it starts the app; `weave app env` prints it. */
  async appEnv(ref: string): Promise<AppEnv> {
    const project = this.#project(ref);
    this.#appApi ??= startAppApi(
      (token) => [...this.#appTokens].find(([, t]) => sameToken(t, token))?.[0],
      (projectId, route, params) => this.#appAnswer(projectId, route, params),
    );
    const api = await this.#appApi;
    let token = this.#appTokens.get(project.id);
    if (!token) this.#appTokens.set(project.id, (token = b64u.encode(randomBytes(24))));
    return { WEAVE_API: `http://127.0.0.1:${api.port}`, WEAVE_TOKEN: token, WEAVE_PROJECT: project.id };
  }

  #appAnswer(projectId: string, route: string, params: URLSearchParams): unknown {
    const project = this.#spaces.get(projectId);
    if (!project) throw new AppApiError(404, 'this project is no longer here');
    const me = this.identity.author;
    if (route === '/v1/me') return this.#appPerson(project, me);
    if (route === '/v1/who') {
      const port = Number(params.get('port'));
      if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error('port: the remote port of the connection (a number)');
      const found = this.#live.personOnPort(port);
      const room = found && this.#allRooms().find((r) => r.room.id === found.room && r.project.id === projectId);
      if (!found || !room) throw new AppApiError(404, 'not a connection through one of this project’s rooms');
      return { ...this.#appPerson(project, found.person), room: { id: room.room.id, name: room.room.name } };
    }
    if (route === '/v1/project') {
      const rooms = this.#allRooms().filter((r) => r.project.id === projectId && r.room.open && r.room.host === me && this.#live.isHosting(r.room.id));
      return {
        id: project.id,
        name: project.name,
        host: { did: me, name: this.nameOf(me) },
        rooms: rooms.map(({ room }) => ({ id: room.id, name: room.name, people: this.#live.peers(room.id).map((did) => this.#appPerson(project, did)) })),
        groups: this.#appGroups(project).map(({ space, state }) => ({ id: space.id, name: space.name, ...(state.tier ? { tier: true } : {}) })),
      };
    }
    if (route === '/v1/access') {
      const did = params.get('did') ?? '';
      if (!did.startsWith('did:')) throw new Error('did: whose access to look up');
      const groups = this.#appGroups(project);
      const group = params.get('group');
      const asked = group ? groups.filter(({ space }) => space.id === group || space.name.toLowerCase() === group.toLowerCase()) : groups;
      if (group && asked.length === 0) throw new AppApiError(404, `no group "${group}" here: only the project's groups and the host's own groups and tiers`);
      return {
        ...this.#appPerson(project, did as Did),
        groups: asked.filter(({ state }) => state.members.has(did as Did)).map(({ space, state }) => ({ id: space.id, name: space.name, ...(state.tier ? { tier: true } : {}) })),
      };
    }
    throw new AppApiError(404, `no route ${route}`);
  }

  /** A person as an app sees them: who they are and their place in the project. */
  #appPerson(project: StoredSpace, did: Did): AppPerson {
    const state = this.#state(project);
    const name = this.nameOf(did);
    return {
      did,
      ...(name ? { name } : {}),
      host: did === this.identity.author,
      member: state.members.has(did) || did === this.identity.author,
      maintainer: state.maintainers.has(did),
    };
  }

  /** Groups an app may ask about: the ones invited into the project, and the host's own groups and tiers. Nothing else of the host's. */
  #appGroups(project: StoredSpace): Array<{ space: StoredSpace; state: SpaceState }> {
    const invited = new Set(this.#state(project).groups.keys());
    const out: Array<{ space: StoredSpace; state: SpaceState }> = [];
    for (const space of this.#spaces.values()) {
      if (space.kind !== 'group') continue;
      const state = this.#state(space);
      if (invited.has(space.id) || state.founder === this.identity.author) out.push({ space, state });
    }
    return out;
  }

  // ---------------------------------------------------------------- installing the app from its release

  /** Where Weave keeps the apps it installed: apps/<project id>/<tag>. */
  #appsDir(projectId: string): string {
    return joinPath(this.home.dir, 'apps', projectId);
  }

  /** The release Weave installed for a project, while the project's app folder still points into it. */
  #installed(projectId: string): { tag: string; folder: string } | undefined {
    const record = readJson<{ tag?: string; folder?: string }>(joinPath(this.#appsDir(projectId), 'installed.json'));
    return record?.tag && record.folder && this.config.appFolders[projectId] === record.folder ? { tag: record.tag, folder: record.folder } : undefined;
  }

  #installInfo(project: StoredSpace, app: AppManifest | undefined): AppLaunchInfo['install'] {
    const install = app?.install;
    const job = this.#installs.get(project.id);
    if (!install && !job) return undefined;
    const asset = install?.assets?.[platformKey()];
    const installed = this.#installed(project.id);
    return {
      ...(install?.tag ? { version: install.tag } : {}),
      ...(install?.github ? { repo: install.github } : {}),
      ...(asset ? { asset: { file: asset.file, ...(asset.size ? { size: asset.size } : {}) } } : {}),
      platform: platformKey(),
      ...(installed ? { installed: installed.tag } : {}),
      ...(job?.progress ? { progress: { ...job.progress } } : {}),
      ...(job?.error ? { error: job.error } : {}),
      ...(install?.steps ? { steps: install.steps } : {}),
      ...(install?.app && install.app !== this.#githubApp().slug ? { otherApp: install.app } : {}),
      ...(asset && startCommand(app, platformKey(), true) ? { command: startCommand(app, platformKey(), true) } : {}),
    };
  }

  async installApp(input: { project: string; approve?: boolean }): Promise<AppLaunchInfo> {
    const project = this.#project(input.project);
    const app = this.#app(project);
    const install = app?.install;
    const asset = install?.assets?.[platformKey()];
    if (!app || !install?.github || !install.tag || !asset) throw new Error(`${project.name} has no release file for this computer (${platformKey()})${install?.steps ? ': install it by hand or with your agent, following its steps' : ''}`);
    if (install.app && install.app !== this.#githubApp().slug && this.#githubAuth())
      throw new Error(`${app.name}'s releases go through the GitHub App "${install.app}", and you sign in through "${this.#githubApp().slug}": switch to it in Keys & devices → Linked accounts (https://github.com/apps/${install.app})`);
    if (this.#installs.get(project.id)?.progress) throw new Error(`${app.name} is being installed already`);
    if (this.#apps.running(project.id)) throw new Error(`stop ${app.name} first`);
    const job: InstallJob = { progress: { state: 'downloading', done: 0, ...(asset.size ? { total: asset.size } : {}) } };
    this.#installs.set(project.id, job);
    const done = this.#installRelease(project, app, { github: install.github, tag: install.tag, asset }, input.approve === true).then(
      () => this.#installs.delete(project.id),
      (error: Error) => this.#installs.set(project.id, { error: error.message }),
    );
    this.#installing.set(project.id, done.finally(() => this.#emitLive()));
    return this.appLaunch(project.id);
  }

  /** Resolves when the install running for a project ends (for tests and the CLI). */
  async installDone(ref: string): Promise<AppLaunchInfo> {
    const project = this.#project(ref);
    await this.#installing.get(project.id);
    return this.appLaunch(project.id);
  }

  async #installRelease(project: StoredSpace, app: AppManifest, release: { github: string; tag: string; asset: AppAsset }, approve: boolean): Promise<void> {
    const job = this.#installs.get(project.id)!;
    const dir = this.#appsDir(project.id);
    mkdirSync(dir, { recursive: true });
    const auth = this.#githubAuth();
    const client = new GitHub(auth?.token ?? '', this.githubSetup.fetch);
    const found = (await client.release(release.github, release.tag)).assets.find((a) => a.name === release.asset.file);
    if (!found) throw new Error(`the release ${release.tag} on GitHub has no file ${release.asset.file}`);
    const download = await client.download(release.github, found.id);
    const total = release.asset.size ?? download.size ?? found.size;
    job.progress = { state: 'downloading', done: 0, ...(total ? { total } : {}) };
    const file = joinPath(dir, `.download-${release.asset.file}`);
    await saveVerified(download.body, file, release.asset.sha256, (n) => {
      job.progress!.done += n;
    });
    job.progress = { state: 'unpacking', done: job.progress.done, ...(total ? { total } : {}) };
    const target = joinPath(dir, tagFolder(release.tag));
    rmSync(target, { recursive: true, force: true });
    const root = unpack(file, target);
    rmSync(file, { force: true });
    // The folder holds the project's app: say so the way a checkout would, with its manifest.
    if (!existsSync(joinPath(root, 'weave.app.json'))) writeJson(joinPath(root, 'weave.app.json'), app);
    this.#rememberAppFolder(project.id, root);
    const command = startCommand(app, platformKey(), true);
    if (approve && command) this.config = { ...this.config, approvedLaunches: { ...this.config.approvedLaunches, [project.id]: launchFingerprint(command, root) } };
    saveConfig(this.home, this.config);
    writeJson(joinPath(dir, 'installed.json'), { tag: release.tag, folder: root, file: release.asset.file, sha256: release.asset.sha256, installed: new Date(this.clock()).toISOString() });
    // Earlier versions Weave installed go.
    for (const entry of readdirSync(dir)) if (entry !== tagFolder(release.tag) && entry !== 'installed.json' && !entry.startsWith('.')) rmSync(joinPath(dir, entry), { recursive: true, force: true });
  }

  async releaseApp(input: { project: string; tag: string; repo?: string; assets?: Record<string, string>; as?: string }): Promise<AppManifest> {
    if (input.as) this.#agentMay(input.as, KIND_APP);
    const project = this.#project(input.project);
    const state = this.#maintainerState(project);
    const published = this.#app(project);
    const linked = reposOf(this.#entries(project), (did) => state.maintainers.has(did));
    const repo = input.repo?.trim() || published?.install?.github || (linked.length === 1 ? linked[0].repo : '');
    if (!isRepoName(repo)) throw new Error(linked.length > 1 ? `${project.name} has several repositories: say which one` : 'which repository holds the release? (owner/name)');
    const auth = this.#githubAuth();
    const client = new GitHub(auth?.token ?? '', this.githubSetup.fetch);
    const release = await client.release(repo, input.tag.trim());
    if (!release.assets.length)
      throw new Error(
        `${release.tag} in ${repo} has no build files attached. Weave installs build files from a release; GitHub's source archives don't count. Weave's release workflow attaches them when a tag is pushed (weave app workflow), or attach them to the release on github.com`,
      );
    // The release carries its own manifest: weave.app.json at that tag, or (without one) what's published.
    const atTag = await client.fileAt(repo, 'weave.app.json', release.tag);
    let app: AppManifest;
    if (atTag) {
      try {
        app = parseManifest(JSON.parse(atTag));
      } catch (error) {
        throw new Error(`weave.app.json in ${repo} at ${release.tag} isn't right: ${(error as Error).message}`);
      }
      if (published && published.app !== app.app) throw new Error(`${repo} at ${release.tag} holds the app "${app.app}", but ${project.name}'s app is "${published.app}"`);
    } else if (published) app = published;
    else throw new Error(`${repo} has no weave.app.json at ${release.tag}: add one (app, name, services, start), tag again, and release`);
    // Which file is for which platform: as given, or guessed from the names.
    const chosen = new Map<string, ReleaseAsset>();
    if (input.assets && Object.keys(input.assets).length) {
      for (const [platform, name] of Object.entries(input.assets)) {
        const asset = release.assets.find((a) => a.name === name);
        if (!asset) throw new Error(`the release ${release.tag} has no file ${name}`);
        chosen.set(platform, asset);
      }
    } else {
      for (const asset of release.assets) {
        const platform = guessPlatform(asset.name);
        if (platform && !chosen.has(platform)) chosen.set(platform, asset);
      }
    }
    if (!chosen.size) throw new Error(`no file in ${release.tag} says which computer it's for (win, mac, linux in its name): name them with --asset win32-x64=<file>`);
    // Fingerprint each file once, so every host's node can check what it downloads.
    const assets: Record<string, AppAsset> = {};
    for (const [platform, asset] of chosen) {
      const download = await client.download(repo, asset.id);
      const hash = createHash('sha256');
      const reader = download.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        hash.update(value);
      }
      assets[platform] = { file: asset.name, sha256: hash.digest('hex'), size: asset.size };
    }
    // Members download through the app the maintainer uses, when it's their own.
    const own = this.config.githubApp?.slug;
    const { app: _app, ...before } = { ...published?.install, ...app.install };
    const manifest = parseManifest({ ...app, install: { ...before, github: repo, tag: release.tag, assets, ...(own ? { app: own } : {}) } });
    await this.publish({ kind: KIND_APP, body: manifest as unknown as Json, space: project.id, as: input.as });
    return manifest;
  }

  async stopApp(ref: string): Promise<AppLaunchInfo> {
    const project = this.#project(ref);
    this.#apps.stop(project.id);
    await new Promise((resolve) => setTimeout(resolve, 300));
    return this.appLaunch(project.id);
  }

  #rememberAppFolder(projectId: string, folder: string): void {
    const full = resolvePath(folder);
    this.#checkAppFolder(projectId, full);
    this.config = { ...this.config, appFolders: { ...this.config.appFolders, [projectId]: full } };
    saveConfig(this.home, this.config);
  }

  /** The folder must hold this project's app: its weave.app.json with the same app id. */
  #checkAppFolder(projectId: string, folder: string): void {
    const file = joinPath(folder, 'weave.app.json');
    if (!existsSync(file)) throw new Error(`there's no weave.app.json in ${folder}`);
    let local: { app?: unknown };
    try {
      local = JSON.parse(readFileSync(file, 'utf8')) as { app?: unknown };
    } catch {
      throw new Error(`${file} isn't valid JSON`);
    }
    const published = this.#app(this.#project(projectId));
    if (published && local.app !== published.app) throw new Error(`${folder} holds the app "${String(local.app)}", but this project's app is "${published.app}"`);
  }


  async rooms(ref?: string): Promise<RoomInfo[]> {
    const only = ref ? this.#project(ref).id : undefined;
    const rooms = this.#allRooms().filter(({ room, project }) => room.open && (!only || project.id === only));
    return Promise.all(rooms.map(({ room, project }) => this.#roomInfo(room, project)));
  }

  async hostRoom(input: { project: string; name: string; invite?: string[] }): Promise<RoomInfo> {
    const project = this.#project(input.project);
    const app = this.#app(project);
    if (!app) throw new Error(`${project.name} has no app to share yet: a maintainer publishes one with "weave app publish"`);
    if (!this.#swarm) throw new Error('rooms need your node online: keep the app (or "weave daemon") running');
    const id = b64u.encode(randomBytes(12));
    const name = input.name?.trim().slice(0, 60) || `${this.nameOf(this.identity.author) ?? 'Someone'}'s room`;
    const invite = input.invite?.length ? input.invite.map((who) => this.resolve(who)) : 'participants';
    const key = roomKeyPair(this.#roomSeed(id)).publicKey.toString('hex');
    this.replica.append(this.identity, sealFor(project, { kind: KIND_ROOM, body: { room: id, name, service: app.services[0].id, key, invite, open: true } }));
    const room = this.#roomById(id).room;
    await this.#live.host(room);
    return this.#roomInfo(room, project);
  }

  async endRoom(ref: string): Promise<void> {
    const { room, project } = this.#roomById(ref);
    if (room.host !== this.identity.author) throw new Error('only the host can end a room');
    await this.#live.stopHosting(room.id);
    this.replica.append(this.identity, sealFor(project, { kind: KIND_ROOM, body: { room: room.id, open: false } }));
  }

  async joinRoom(ref: string): Promise<RoomInfo> {
    const { room, project } = this.#roomById(ref);
    if (!room.open) throw new Error('this room has ended');
    if (room.host === this.identity.author) return this.#roomInfo(room, project);
    if (!this.#mayJoin(room, this.identity.author)) throw new Error("you're not invited to this room");
    const app = this.#app(project);
    if (!app) throw new Error(`${project.name} has no app`);
    await this.#live.join(room, app.app);
    return this.#roomInfo(room, project);
  }

  async leaveRoom(ref: string): Promise<void> {
    await this.#live.leave(this.#roomById(ref).room.id);
  }

  async roomChat(ref: string): Promise<RoomChatMessage[]> {
    const { room } = this.#roomById(ref);
    return this.#live.chat(room.id).map((m) => ({ id: m.id, by: { did: m.from, name: this.nameOf(m.from) ?? m.name }, text: m.text, time: m.time, mine: m.from === this.identity.author }));
  }

  async sayInRoom(input: { room: string; text: string }): Promise<void> {
    if (!input.text?.trim()) throw new Error('a message needs text');
    this.#live.say(this.#roomById(input.room).room.id, input.text);
  }

  /** A room's key seed, from our own secret: the host can reopen its rooms after a restart. */
  #roomSeed(roomId: string): Uint8Array {
    return createHash('sha256').update('weave/room-seed/v1').update(this.#selfSecret()).update(roomId).digest();
  }

  /** The latest app manifest a maintainer published in a project. */
  #app(project: StoredSpace): AppManifest | undefined {
    const state = this.#state(project);
    let app: AppManifest | undefined;
    for (const e of this.#entries(project)) {
      if (e.kind !== KIND_APP || !state.maintainers.has(e.event.author)) continue;
      try {
        app = parseManifest(e.body);
      } catch {
        // a malformed manifest is ignored; the previous one stays
      }
    }
    return app;
  }

  #allRooms(): Array<{ room: Room; project: StoredSpace }> {
    const out: Array<{ room: Room; project: StoredSpace }> = [];
    for (const project of this.#spaces.values()) {
      if (project.kind !== 'project') continue;
      for (const room of roomsOf(this.#entries(project))) out.push({ room, project });
    }
    return out;
  }

  #roomById(ref: string): { room: Room; project: StoredSpace } {
    const matches = this.#allRooms().filter(({ room }) => room.id === ref || room.id.startsWith(ref) || room.name.toLowerCase() === ref.toLowerCase());
    if (matches.length === 0) throw new Error(`no room "${ref}"`);
    const open = matches.filter((m) => m.room.open);
    if (open.length > 1) throw new Error(`several rooms match "${ref}": use its id`);
    return open[0] ?? matches[0];
  }

  /** Participants of the room's project who are invited (or everyone, by default); the host always. */
  #mayJoin(room: Room, person: Did): boolean {
    if (person === room.host) return true;
    const found = this.#allRooms().find((r) => r.room.id === room.id);
    if (!found || !this.#state(found.project).members.has(person)) return false;
    return room.invite === 'participants' || room.invite.includes(person);
  }

  #roomService(room: Room) {
    const found = this.#allRooms().find((r) => r.room.id === room.id);
    const app = found && this.#app(found.project);
    return app?.services.find((s) => s.id === room.service) ?? app?.services[0];
  }

  async #roomInfo(room: Room, project: StoredSpace): Promise<RoomInfo> {
    const me = this.identity.author;
    const mine = room.host === me;
    const app = this.#app(project);
    const service = app?.services.find((s) => s.id === room.service) ?? app?.services[0];
    const joined = mine ? this.#live.isHosting(room.id) : this.#live.isJoined(room.id);
    const connected = this.#live.connected(room.id);
    const ready = mine ? !!service && (await portOpen(service.port)) : this.#live.appReady(room.id);
    const side = mine ? service?.open?.host : service?.open?.joiner;
    const path = side?.path ?? '/';
    const localPort = this.#live.localPort(room.id);
    const url = mine ? (service && ready ? `http://localhost:${service.port}${path}` : undefined) : localPort && ready && app ? `http://${app.app}.weave.localhost:${localPort}${path}` : undefined;
    return {
      id: room.id,
      project: { id: project.id, kind: 'project', name: project.name },
      name: room.name,
      host: { did: room.host, name: this.nameOf(room.host) },
      mine,
      open: room.open,
      mayJoin: this.#mayJoin(room, me),
      joined,
      connected,
      peers: joined ? this.#live.peers(room.id).map((did) => ({ did, name: this.nameOf(did) })) : [],
      ...(app ? { app: { app: app.app, name: app.name, ...(app.start?.hint ? { startHint: app.start.hint } : {}), ...(app.start?.command || app.start?.release ? { canLaunch: true } : {}) } } : {}),
      ...(service ? { service: { id: service.id, label: side?.label ?? (mine ? 'Open' : 'Play'), ready } } : {}),
      ...(url ? { url } : {}),
      time: room.time,
    };
  }

  /** Tell watchers something changed that isn't an event; with a notice, it may also show as a notification. */
  #emitLive(notice?: Notice): void {
    for (const listener of this.#liveListeners) listener(notice);
  }

  // ---------------------------------------------------------------- identity and keys

  async identityInfo(): Promise<IdentityInfo> {
    const me = this.identity.author;
    const state = this.replica.authority.keys(me);
    const mine = (key: Did) => this.replica.authority.personOf(key) === me;
    return {
      did: me,
      recoverable: !!state.next,
      rotations: state.retired.size,
      encryptionKey: state.enc,
      device: this.identity.did,
      forks: [...this.replica.forks].filter(mine),
    };
  }

  async keys(): Promise<KeyInfo[]> {
    const me = this.identity.author;
    const out: KeyInfo[] = [];
    for (const grant of this.replica.authority.grantsOf(me)) {
      const signer = grant.subject;
      const head = this.replica.store.head(signer);
      const held = grant.role === 'agent' ? this.#agents.find((a) => a.did === signer) : undefined;
      out.push({
        did: signer,
        role: grant.role,
        ...(grant.name ? { name: grant.name } : {}),
        current: signer === this.identity.did,
        ...(grant.revokedAfter !== undefined ? { revokedAfter: grant.revokedAfter } : {}),
        events: head?.seq ?? 0,
        ...(head ? { lastTime: head.time } : {}),
        forked: this.replica.forks.has(signer),
        ...(held ? { permissions: held.permissions } : {}),
      });
    }
    return out.sort((a, b) => Number(b.current) - Number(a.current) || a.role.localeCompare(b.role) || (a.name ?? '').localeCompare(b.name ?? ''));
  }

  async revokeKey(input: { key: string; since?: string; words?: string }): Promise<KeyInfo[]> {
    const me = this.identity.author;
    const all = await this.keys();
    const key = all.find((k) => k.did === input.key) ?? all.find((k) => k.name?.toLowerCase() === input.key.toLowerCase());
    if (!key) throw new Error(`you have no device or agent "${input.key}"`);
    // Everything it signed after `since` becomes void; claimed times can be forged, so we cut at the last event before it.
    let afterSeq = this.replica.store.head(key.did)?.seq ?? 0;
    if (input.since) {
      const since = Date.parse(input.since);
      if (Number.isNaN(since)) throw new Error('since is a date and time, e.g. 2026-10-17T18:00');
      afterSeq = 0;
      for (const event of this.replica.store.range(key.did, 1)) if (Date.parse(event.time) < since) afterSeq = event.seq;
    }
    const ownDevice = key.did === this.identity.did;
    if (key.role === 'agent' && !input.words) {
      if (ownDevice) throw new Error('that is this device');
      this.replica.append(this.identity, revocation(key.did, afterSeq));
    } else {
      if (!input.words) throw new Error('revoking a device needs your recovery words');
      const root = this.#currentRoot(input.words);
      this.replica.append(root, revocation(key.did, afterSeq));
      if (ownDevice) {
        // This computer keeps working with a fresh device key.
        const fresh = createSubKey(me);
        this.replica.append(root, delegation(fresh.did, 'device', ['*'], deviceName()));
        saveDevice(this.home, fresh);
        this.#identity = fresh;
        this.#decoded = undefined;
      }
    }
    return this.keys();
  }

  async rotateRoot(input: { words: string; encryption?: boolean }): Promise<IdentityInfo> {
    const words = normalizeWords(input.words);
    const me = this.identity.author;
    const state = this.replica.authority.keys(me);
    if (!state.next) throw new Error('this identity was made before recovery kits existed and cannot rotate; create a new identity');
    const index = findRecoveryIndex(words, state.root, 'root');
    if (index === undefined || recoveryIdentity(words) !== me) throw new Error("these words don't belong to this identity");
    const next = recoveryRoot(words, index + 1);
    const retire = this.replica.store.head(state.root)?.seq ?? 0;
    let enc: EncryptionKey | undefined;
    if (input.encryption) {
      const encIndex = findRecoveryIndex(words, state.enc, 'enc') ?? this.#encryption.length - 1;
      const key = recoveryEncryptionKey(words, encIndex + 1);
      enc = { did: key.did, keys: key };
      this.#saveEncryption([...this.#encryption, enc]);
    }
    this.replica.append({ author: me, did: next.did, keys: next }, rotation(recoveryRoot(words, index + 2).did, retire, enc?.did));
    this.#decoded = undefined;
    return this.identityInfo();
  }

  /** The current root key, from the recovery words. */
  #currentRoot(words: string): SigningIdentity {
    const clean = normalizeWords(words);
    const me = this.identity.author;
    if (recoveryIdentity(clean) !== me) throw new Error("these words don't belong to this identity");
    const index = findRecoveryIndex(clean, this.replica.authority.keys(me).root, 'root');
    if (index === undefined) throw new Error("these words don't match this identity's current root key");
    const root = recoveryRoot(clean, index);
    return { author: me, did: root.did, keys: root };
  }

  #saveEncryption(keys: EncryptionKey[]): void {
    saveEncryptionKeys(this.home, keys);
    this.#encryption = keys;
    this.#decoded = undefined;
  }

  /** Where to encrypt to when writing to someone: their published encryption key. */
  #encryptionKeyOf = (person: Did): Did => this.replica.authority.encryptionKey(person);

  /** Me, as someone opening what was encrypted to me, with my current encryption key. */
  #recipient(): Recipient {
    const published = this.replica.authority.encryptionKey(this.identity.author);
    const key = this.#encryption.find((k) => k.did === published) ?? this.#encryption.at(-1)!;
    return { author: this.identity.author, keys: key.keys };
  }

  /** Try opening something with each of my encryption keys, newest first. */
  #tryOpen<T>(open: (me: Recipient) => T | undefined): T | undefined {
    for (const key of [...this.#encryption].reverse()) {
      const opened = open({ author: this.identity.author, keys: key.keys });
      if (opened !== undefined) return opened;
    }
    return undefined;
  }

  /** The secret behind my private (self-sealed) data: my first encryption key, so it survives rotations. */
  #selfSecret(): Uint8Array {
    return this.#encryption[0].keys.secretKey;
  }

  /**
   * A person's own events, from every key that signs for them (root keys and
   * devices; agents too), valid ones only, oldest first.
   */
  #eventsOf(person: Did): WeaveEvent[] {
    const authority = this.replica.authority;
    const events: WeaveEvent[] = [];
    for (const signer of this.replica.store.signers()) {
      if (authority.personOf(signer) !== person) continue;
      for (const event of this.replica.store.range(signer, 1)) if (event.author === person && authority.check(event).ok) events.push(event);
    }
    return events.sort((a, b) => a.time.localeCompare(b.time) || a.seq - b.seq);
  }

  /** An agent's name, if this signer is one of the author's agents (devices sign as the person). */
  #agentName(signer: Did, author: Did): string | undefined {
    if (signer === author) return undefined;
    const grant = this.replica.authority.grant(signer);
    return grant?.role === 'agent' ? grant.name : undefined;
  }

  // ---------------------------------------------------------------- memberships

  async createTier(input: { name: string; price?: number; currency?: string; description?: string; benefits?: string[]; auto?: boolean; gumroad?: GumroadLink | null }): Promise<TierInfo> {
    const group = await this.#createSpace('group', input.name, { tier: true });
    const position = this.#tierOffers(this.identity.author).length;
    this.#publishTier({ id: group.id, creator: this.identity.author, name: group.name, price: 0, currency: 'EUR', description: '', benefits: [], position, open: true, auto: false, time: '' }, input);
    return this.#tierInfo(this.#tierOffer(group.id));
  }

  async setTier(input: { tier: string; name?: string; price?: number; currency?: string; description?: string; benefits?: string[]; position?: number; open?: boolean; auto?: boolean; hidden?: boolean; gumroad?: GumroadLink | null }): Promise<TierInfo> {
    const before = this.#tierOffer(input.tier);
    if (before.creator !== this.identity.author) throw new Error('only its creator can change a tier');
    this.#publishTier(before, input);
    return input.hidden ? { ...this.#tierInfo(before), open: false } : this.#tierInfo(this.#tierOffer(before.id));
  }

  async tiers(who?: string): Promise<TierInfo[]> {
    return this.#tierOffers(who ? this.resolve(who) : this.identity.author).map((t) => this.#tierInfo(t));
  }

  async requestMembership(input: { tier: string; note?: string; license?: string }): Promise<void> {
    const tier = this.#tierOffer(input.tier);
    if (tier.creator === this.identity.author) throw new Error("that's your own tier");
    if (!tier.open) throw new Error(`${tier.name} isn't taking new members right now`);
    const license = input.license?.trim();
    if (license && !tier.gumroad) throw new Error(`${tier.name} isn't sold through Gumroad`);
    if (license && !/^[A-Za-z0-9-]{8,100}$/.test(license)) throw new Error('a Gumroad license key looks like XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX');
    await this.join(tier.creator); // the creator's node listens on their identity topic
    this.replica.append(
      this.identity,
      membershipRequest(this.#encryptionKeyOf(tier.creator), { tier: tier.id, note: input.note?.trim().slice(0, 500) ?? '', entry: this.#entryPoint(), ...(license ? { license } : {}) }),
    );
    this.replica.append(this.identity, this.#sealForSelf({ kind: KIND_MEMBERSHIP_PENDING, body: { creator: tier.creator, tier: tier.id } }));
  }

  async membershipRequests(): Promise<MembershipRequestInfo[]> {
    const handled = new Set(this.#selfBodies(KIND_MEMBERSHIP_HANDLED).map((b) => b.request));
    const mine = new Map(this.#tierOffers(this.identity.author).map((t) => [t.id, t]));
    const out: MembershipRequestInfo[] = [];
    for (const event of this.replica.events((e) => e.kind === KIND_MEMBERSHIP_REQUEST && e.author !== this.identity.author)) {
      const id = eventId(event);
      const request = handled.has(id) ? undefined : this.#tryOpen((me) => openMembershipRequest(event, me));
      const tier = request && mine.get(request.tier);
      if (!tier) continue;
      const check = this.#licenseChecks.get(id);
      const answer = check && check !== 'checking' ? { ok: check.ok, ...(check.reason ? { reason: check.reason } : {}), ...(check.email ? { email: check.email } : {}) } : {};
      const license = request.license ? { license: { key: request.license, ...answer } } : {};
      out.push({ id, tier: { id: tier.id, name: tier.name }, did: event.author, name: this.nameOf(event.author), note: request.note, time: event.time, ...license });
    }
    return out.sort((a, b) => a.time.localeCompare(b.time));
  }

  async grantMembership(input: { tier: string; who: string; months: number }): Promise<TierInfo> {
    const months = Math.round(Number(input.months));
    if (!(months >= 1 && (months <= 36 || months === FREE_TIER_MONTHS))) throw new Error('grant 1 to 36 months');
    const group = this.#tierGroup(input.tier);
    const member = this.resolve(input.who);
    if (member === this.identity.author) throw new Error("you're in your own tier already");
    const state = this.#state(group);
    const current = state.members.get(member);
    const until = grantUntil(new Date(), months, current?.until);
    this.replica.append(this.identity, sealFor(group, { kind: KIND_MEMBERSHIP, body: { member, until } }));
    // New (or returning) members get the tier's keys, posted where their node will look for them.
    if (!current) {
      this.replica.append(this.identity, gift(this.#keysOnly(group), [member], 'gift', this.#entryPoint(), this.#encryptionKeyOf));
    }
    await this.#answerRequests(group.id, member);
    return this.#tierInfo(this.#tierOffer(group.id));
  }

  async declineMembership(input: { tier: string; who: string }): Promise<void> {
    const group = this.#tierGroup(input.tier);
    await this.#answerRequests(group.id, this.resolve(input.who));
  }

  async memberships(): Promise<TierInfo[]> {
    const out: TierInfo[] = [];
    for (const space of this.#spaces.values()) {
      if (space.kind !== 'group' || space.founder === this.identity.author || !this.#state(space).tier) continue;
      const offer = this.#tierOffers(space.founder).find((t) => t.id === space.id);
      out.push(this.#tierInfo(offer ?? { id: space.id, creator: space.founder, name: space.name, price: 0, currency: 'EUR', description: '', benefits: [], position: 0, open: false, auto: false, time: '' }));
    }
    return out;
  }

  /**
   * Ask to join a tier as soon as its creator's node has been reached: their
   * tier offer and encryption key must arrive first. Used for the app's bundle,
   * which names a free tier of the person who ships it.
   */
  queueMembershipRequest(input: { tier: string; creator: Did; note?: string }): void {
    if (this.config.pendingMemberships.some((p) => p.tier === input.tier)) return;
    this.config = { ...this.config, pendingMemberships: [...this.config.pendingMemberships, input] };
    saveConfig(this.home, this.config);
  }

  /**
   * What an app ships with for newcomers: contacts to add (and follow) and free
   * tiers to ask to join, typically those of the person who ships the app.
   * Nothing in it is secret.
   */
  async applyBundle(bundle: Bundle): Promise<void> {
    for (const link of bundle.contacts ?? []) await this.addContact(link);
    for (const tier of bundle.tiers ?? []) this.queueMembershipRequest(tier);
    await this.#sendQueuedRequests();
  }

  async #sendQueuedRequests(): Promise<number> {
    let sent = 0;
    for (const pending of this.config.pendingMemberships) {
      const creator = pending.creator as Did;
      const offered = this.#tierOffers(creator).some((t) => t.id === pending.tier);
      const keysKnown = !!this.replica.authority.keys(creator).next || this.#eventsOf(creator).length > 0;
      if (!offered || !keysKnown) continue;
      try {
        if (!(await this.tiers(creator)).find((t) => t.id === pending.tier)?.requested) await this.requestMembership({ tier: pending.tier, note: pending.note });
        sent++;
      } catch {
        // closed tier or similar: drop it, the creator decides by hand
      }
      this.config = { ...this.config, pendingMemberships: this.config.pendingMemberships.filter((p) => p.tier !== pending.tier) };
      saveConfig(this.home, this.config);
    }
    return sent;
  }

  /** Let in everyone asking to join our tiers that admit automatically. */
  async #grantAutomatic(): Promise<number> {
    const auto = new Set(this.#tierOffers(this.identity.author).filter((t) => t.auto && t.open).map((t) => t.id));
    if (!auto.size) return 0;
    let granted = 0;
    for (const request of await this.membershipRequests()) {
      if (!auto.has(request.tier.id)) continue;
      await this.grantMembership({ tier: request.tier.id, who: request.did, months: FREE_TIER_MONTHS });
      granted++;
    }
    return granted;
  }

  /**
   * Let in supporters who bought a tier on Gumroad: their license key is
   * checked once with Gumroad; a paid-up purchase gets a month, and the key is
   * kept (sealed to us) for renewing. A key already used by someone else, or
   * one Gumroad doesn't accept, waits in the Inbox with the reason.
   */
  async #grantPaid(): Promise<number> {
    const sold = new Map(this.#tierOffers(this.identity.author).filter((t) => t.gumroad && t.open).map((t) => [t.id, t]));
    if (!sold.size) return 0;
    let granted = 0;
    for (const request of await this.membershipRequests()) {
      const tier = sold.get(request.tier.id);
      const key = request.license?.key;
      if (!tier?.gumroad || !key || this.#licenseChecks.has(request.id)) continue;
      const holder = this.#licenses().find((l) => l.tier === tier.id && l.license === key && l.member !== request.did);
      if (holder) {
        this.#licenseChecks.set(request.id, { ok: false, reason: `that license key already let ${this.nameOf(holder.member) ?? 'someone else'} in` });
        continue;
      }
      this.#licenseChecks.set(request.id, 'checking');
      let check: LicenseCheck;
      try {
        check = await this.checkLicense(tier.gumroad, key);
      } catch (error) {
        this.#licenseChecks.delete(request.id); // offline or Gumroad down: try again later
        continue;
      }
      this.#licenseChecks.set(request.id, check);
      if (!check.ok) continue;
      this.#recordLicense(tier.id, request.did, key, check);
      await this.grantMembership({ tier: tier.id, who: request.did, months: 1 });
      granted++;
    }
    return granted;
  }

  /**
   * Renew paid memberships: in the last days of a month, check the key with
   * Gumroad again (each key at most every few hours); still paid up, another
   * month. Otherwise the grant simply runs out and the tier key rotates.
   */
  async #renewPaid(): Promise<number> {
    const sold = new Map(this.#tierOffers(this.identity.author).filter((t) => t.gumroad).map((t) => [t.id, t]));
    if (!sold.size) return 0;
    const now = this.clock();
    const soon = new Date(now + 4 * 86400_000).toISOString();
    let renewed = 0;
    for (const record of this.#licenses()) {
      const tier = sold.get(record.tier);
      const group = this.#spaces.get(record.tier);
      if (!tier?.gumroad || !group || now - Date.parse(record.checked) < 6 * 3600_000) continue;
      const until = this.#state(group).members.get(record.member)?.until;
      if (!until || until > soon || until <= new Date(now).toISOString()) continue;
      let check: LicenseCheck;
      try {
        check = await this.checkLicense(tier.gumroad, record.license);
      } catch {
        continue; // offline or Gumroad down: the next round tries again
      }
      this.#recordLicense(record.tier, record.member, record.license, check);
      if (!check.ok) continue;
      this.replica.append(this.identity, sealFor(group, { kind: KIND_MEMBERSHIP, body: { member: record.member, until: grantUntil(new Date(now), 1, until) } }));
      renewed++;
    }
    return renewed;
  }

  #recordLicense(tier: string, member: Did, license: string, check: LicenseCheck): void {
    const body = { tier, member, license, ok: check.ok, ...(check.reason ? { reason: check.reason } : {}), checked: new Date(this.clock()).toISOString() };
    this.replica.append(this.identity, this.#sealForSelf({ kind: KIND_MEMBERSHIP_LICENSE, body }));
  }

  /** The license keys behind our paid memberships, the latest record per tier and member. */
  #licenses(): Array<{ tier: string; member: Did; license: string; ok: boolean; checked: string }> {
    const latest = new Map<string, { tier: string; member: Did; license: string; ok: boolean; checked: string }>();
    for (const b of this.#selfBodies(KIND_MEMBERSHIP_LICENSE)) {
      if (typeof b.tier !== 'string' || !isDid(b.member) || typeof b.license !== 'string') continue;
      latest.set(`${b.tier} ${b.member}`, { tier: b.tier, member: b.member, license: b.license, ok: b.ok === true, checked: typeof b.checked === 'string' ? b.checked : '' });
    }
    return [...latest.values()];
  }

  /** Remove members whose grants ran out from the tiers we offer, with one key rotation per tier. */
  async #expireMemberships(): Promise<number> {
    let removed = 0;
    const now = new Date().toISOString();
    for (const space of this.#spaces.values()) {
      if (space.kind !== 'group' || space.founder !== this.identity.author) continue;
      const state = this.#state(space);
      if (!state.tier) continue;
      const expired = [...state.members.values()].filter((m) => m.until && m.until <= now).map((m) => m.did);
      if (!expired.length) continue;
      for (const member of expired) this.replica.append(this.identity, sealFor(space, { kind: KIND_REMOVE, body: { member } }));
      const remaining = [...state.members.keys()].filter((did) => !expired.includes(did));
      const { fields, epoch, key } = rekey(space, remaining, this.#encryptionKeyOf);
      space.keys[String(epoch)] = key;
      this.#saveSpace(space);
      this.replica.append(this.identity, fields);
      removed += expired.length;
    }
    return removed;
  }

  #publishTier(before: Tier, patch: { name?: string; price?: number; currency?: string; description?: string; benefits?: string[]; position?: number; open?: boolean; auto?: boolean; hidden?: boolean; gumroad?: GumroadLink | null }): void {
    const price = patch.price ?? before.price;
    if (!Number.isInteger(price) || price < 0) throw new Error('the price is a whole number of cents, 0 for free');
    const currency = (patch.currency ?? before.currency).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error('the currency is a three-letter code like EUR');
    const name = (patch.name ?? before.name).trim();
    if (!name || name.length > 40) throw new Error('tier names are 1 to 40 characters');
    const body: Record<string, Json> = {
      tier: before.id,
      name,
      price,
      currency,
      description: (patch.description ?? before.description).slice(0, 2000),
      benefits: (patch.benefits ?? before.benefits).map((b) => b.trim()).filter(Boolean).slice(0, 10),
      position: patch.position ?? before.position,
      open: patch.open ?? before.open,
      auto: patch.auto ?? before.auto,
    };
    if (patch.hidden) body.hidden = true;
    // Gumroad: a new link, null to remove it, or keep the one before.
    if (patch.gumroad) {
      const link = parseGumroadLink(patch.gumroad);
      if (!link) throw new Error('the Gumroad link needs the product id and its page, https://…gumroad.com/l/…');
      body.gumroad = link as unknown as Json;
    } else if (patch.gumroad === undefined && before.gumroad) body.gumroad = before.gumroad as unknown as Json;
    this.replica.append(this.identity, { kind: KIND_TIER, body });
  }

  /** The tiers a creator offers, from their public events. */
  #tierOffers(creator: Did): Tier[] {
    return tiersOf(this.#eventsOf(creator));
  }

  /** A tier anyone offers, by id or name (yours first). */
  #tierOffer(ref: string): Tier {
    const all = tiersOf(this.replica.events((e) => e.kind === KIND_TIER));
    const match = all.find((t) => t.id === ref) ?? all.find((t) => t.creator === this.identity.author && t.name.toLowerCase() === ref.toLowerCase()) ?? all.filter((t) => t.name.toLowerCase() === ref.toLowerCase());
    if (Array.isArray(match)) {
      if (match.length === 1) return match[0];
      throw new Error(match.length ? `several tiers are named "${ref}" — use its id` : `no tier "${ref}" is known`);
    }
    return match;
  }

  /** One of your own tiers' groups. */
  #tierGroup(ref: string): StoredSpace {
    const tier = this.#tierOffer(ref);
    const group = this.#spaces.get(tier.id);
    if (tier.creator !== this.identity.author || !group) throw new Error(`only ${this.nameOf(tier.creator) ?? 'its creator'} can let people into ${tier.name}`);
    return group;
  }

  #tierInfo(tier: Tier): TierInfo {
    const group = this.#spaces.get(tier.id);
    const state = group && this.#state(group);
    const mine = tier.creator === this.identity.author;
    const me = state?.members.get(this.identity.author);
    const now = new Date().toISOString();
    const requested =
      !mine && !me && this.#selfBodies(KIND_MEMBERSHIP_PENDING).some((b) => b.tier === tier.id && b.creator === tier.creator);
    return {
      id: tier.id,
      creator: { did: tier.creator, name: this.nameOf(tier.creator) },
      name: tier.name,
      price: tier.price,
      currency: tier.currency,
      description: tier.description,
      benefits: tier.benefits,
      position: tier.position,
      open: tier.open,
      auto: tier.auto,
      ...(tier.gumroad ? { gumroad: tier.gumroad } : {}),
      mine,
      ...(mine && state ? { members: [...state.members.values()].filter((m) => m.did !== tier.creator && (!m.until || m.until > now)).length } : {}),
      ...(!mine && me?.until ? { membership: { until: me.until, active: me.until > now } } : {}),
      ...(requested ? { requested: true } : {}),
    };
  }

  /** Mark someone's open requests for a tier as answered. */
  async #answerRequests(tier: string, member: Did): Promise<void> {
    for (const request of await this.membershipRequests()) {
      if (request.tier.id === tier && request.did === member) {
        this.replica.append(this.identity, this.#sealForSelf({ kind: KIND_MEMBERSHIP_HANDLED, body: { request: request.id } }));
      }
    }
  }

  /** Bodies of your own self-sealed events of one kind. */
  #selfBodies(kind: string): Array<Record<string, unknown>> {
    return this.#decodeAll()
      .filter((d) => d.private && d.inner.kind === kind && d.inner.body && typeof d.inner.body === 'object')
      .map((d) => d.inner.body as Record<string, unknown>);
  }

  // ---------------------------------------------------------------- direct chats between friends

  async chats(): Promise<ChatInfo[]> {
    const friends = new Set(this.#friends());
    this.#decodeAll();
    const chats: ChatInfo[] = [];
    for (const { space, peer } of this.#directs.values()) {
      const messages = messagesOf(this.#entries(space));
      const friend = friends.has(peer);
      const wrote = messages.some((m) => m.author === this.identity.author);
      if (!friend && !wrote) continue; // only friends can start a chat with you
      const last = messages.at(-1);
      chats.push({
        space: this.#spaceInfo(space),
        peer: { did: peer, name: this.nameOf(peer) },
        friend,
        ...(last ? { last: { text: last.text.slice(0, 140), time: last.time, mine: last.author === this.identity.author } } : {}),
      });
    }
    return chats.sort((a, b) => (b.last?.time ?? '').localeCompare(a.last?.time ?? '') || (a.peer.name ?? a.peer.did).localeCompare(b.peer.name ?? b.peer.did));
  }

  async openChat(who: string): Promise<SpaceInfo> {
    const peer = this.resolve(who);
    if (peer === this.identity.author) throw new Error('that is you');
    if (!this.#friends().includes(peer)) throw new Error(`you can chat with friends: people you follow who follow you back. ${this.nameOf(peer) ?? who} isn't one yet`);
    const space = this.#direct(peer);
    await this.#swarm?.join(spaceTopic(space));
    return this.#spaceInfo(space);
  }

  // ---------------------------------------------------------------- chat

  async channels(ref: string): Promise<ChannelInfo[]> {
    return channelsOf(this.#entries(this.#space(ref)));
  }

  async createChannel(input: InSpace & { name: string; topic?: string }): Promise<ChannelInfo> {
    const name = channelName(input.name);
    if (!name) throw new Error('channel names use letters, digits and dashes');
    if ((await this.channels(input.space)).some((c) => c.name === name)) throw new Error(`#${name} already exists`);
    await this.publish({ kind: KIND_CHANNEL, body: { name, topic: input.topic ?? '' }, space: input.space, as: input.as });
    return (await this.channels(input.space)).find((c) => c.name === name)!;
  }

  async messages(ref: string | undefined, options: { channel?: string; post?: string; limit?: number } = {}): Promise<MessageInfo[]> {
    const chat = options.post ? await this.#chatOf(options.post) : undefined;
    const space = chat?.space ?? this.#space(ref ?? '');
    const entries = this.#entries(space);
    const byId = new Map(messagesOf(entries, {}).concat(chat?.post ? messagesOf(entries, { post: chat.post }) : []).map((m) => [m.id, m]));
    const channel = options.channel ? (channelName(options.channel) ?? DEFAULT_CHANNEL) : undefined;
    return messagesOf(entries, chat?.post ? { post: chat.post } : { channel })
      .slice(-(options.limit ?? 200))
      .map((m) => this.#messageInfo(m, byId));
  }

  async say(input: { space?: string; as?: string; text: string; channel?: string; post?: string; replyTo?: string }): Promise<MessageInfo> {
    const text = input.text?.trim();
    if (!text) throw new Error('a message needs text');
    const body: Record<string, Json> = { text };
    const chat = input.post ? await this.#chatOf(input.post) : undefined;
    const space = chat?.space ?? this.#space(input.space ?? '');
    const peer = this.#directs.get(space.id)?.peer;
    if (peer && !this.#friends().includes(peer)) throw new Error(`${this.nameOf(peer) ?? 'they'} and you aren't friends any more, so this chat is read-only`);
    if (chat?.post) body.post = chat.post;
    else {
      const channel = input.channel ? channelName(input.channel) : undefined;
      if (input.channel && !channel) throw new Error('channel names use letters, digits and dashes');
      if (channel && channel !== DEFAULT_CHANNEL) body.channel = channel;
    }
    if (input.replyTo) body.replyTo = this.#find(input.replyTo, [KIND_MSG, KIND_REPLY]).id;
    const { id } = await this.publish({ kind: KIND_MSG, body, space: space.id, as: input.as });
    return (await this.messages(space.id, chat?.post ? { post: chat.post } : { channel: input.channel })).find((m) => m.id === id)!;
  }

  async react(input: { target: string; emoji: string; on?: boolean; as?: string }): Promise<void> {
    const emoji = input.emoji?.trim();
    if (!emoji || emoji.length > 16) throw new Error('react with one emoji');
    const target = this.#find(input.target, [KIND_MSG, KIND_POST, KIND_THREAD, KIND_REPLY, KIND_ISSUE, KIND_PROPOSAL]);
    await this.publish({ kind: KIND_REACT, body: { target: target.id, emoji, on: input.on ?? true }, space: target.space?.id, as: input.as });
  }

  // ---------------------------------------------------------------- working together, in projects

  async threads(ref: string): Promise<ThreadInfo[]> {
    return threadsOf(this.#entries(this.#project(ref))).map((t) => this.#threadInfo(t));
  }

  async startThread(input: InProject & { title: string; text?: string }): Promise<ThreadInfo> {
    if (!input.title?.trim()) throw new Error('a thread needs a title');
    const project = this.#project(input.project);
    const { id } = await this.publish({ kind: KIND_THREAD, body: { title: input.title.trim(), text: input.text ?? '' }, space: project.id, as: input.as });
    return (await this.threads(project.id)).find((t) => t.id === id)!;
  }

  async reply(input: { target: string; text: string; as?: string }): Promise<ReplyInfo> {
    if (!input.text?.trim()) throw new Error('a reply needs text');
    const target = this.#find(input.target, [KIND_THREAD, KIND_ISSUE, KIND_PROPOSAL]);
    const item = await this.publish({ kind: KIND_REPLY, body: { target: target.id, text: input.text.trim() }, space: target.space?.id, as: input.as });
    return { id: item.id, by: this.#actor(item.author, item.signer), text: input.text.trim(), time: item.time };
  }

  async issues(ref: string): Promise<IssueInfo[]> {
    return issuesOf(this.#entries(this.#project(ref))).map((i) => this.#issueInfo(i));
  }

  async openIssue(input: InProject & { title: string; text?: string; labels?: string[]; board?: string }): Promise<IssueInfo> {
    if (!input.title?.trim()) throw new Error('an issue needs a title');
    const project = this.#project(input.project);
    const body: Record<string, Json> = { title: input.title.trim(), text: input.text ?? '', labels: input.labels ?? [] };
    if (input.board) body.board = input.board;
    const { id } = await this.publish({ kind: KIND_ISSUE, body, space: project.id, as: input.as });
    return (await this.issues(project.id)).find((i) => i.id === id)!;
  }

  async claimIssue(input: { issue: string; as?: string }): Promise<IssueInfo> {
    const issue = this.#find(input.issue, [KIND_ISSUE]);
    await this.publish({ kind: KIND_ISSUE_CLAIM, body: { issue: issue.id }, space: issue.space?.id, as: input.as });
    return this.#issueById(issue);
  }

  async setIssueStatus(input: { issue: string; status: IssueStatus; as?: string }): Promise<IssueInfo> {
    if (!ISSUE_STATUSES.includes(input.status)) throw new Error(`status must be one of ${ISSUE_STATUSES.join(', ')}`);
    const issue = this.#find(input.issue, [KIND_ISSUE]);
    await this.publish({ kind: KIND_ISSUE_STATUS, body: { issue: issue.id, status: input.status }, space: issue.space?.id, as: input.as });
    return this.#issueById(issue);
  }

  async proposals(ref: string): Promise<ProposalInfo[]> {
    const project = this.#project(ref);
    return proposalsOf(this.#entries(project), this.#voters(project)).map((p) => this.#proposalInfo(p));
  }

  async propose(input: InProject & { title: string; text?: string; hours?: number; quorum?: number; board?: string }): Promise<ProposalInfo> {
    if (!input.title?.trim()) throw new Error('a proposal needs a title');
    const project = this.#project(input.project);
    const deadline = new Date(Date.now() + (input.hours ?? 72) * 3600_000).toISOString();
    const body: Record<string, Json> = { title: input.title.trim(), text: input.text ?? '', deadline };
    if (input.quorum) body.quorum = input.quorum;
    if (input.board) body.board = input.board;
    const { id } = await this.publish({ kind: KIND_PROPOSAL, body, space: project.id, as: input.as });
    return (await this.proposals(project.id)).find((p) => p.id === id)!;
  }

  async vote(input: { proposal: string; choice: Choice; as?: string }): Promise<ProposalInfo> {
    if (!CHOICES.includes(input.choice)) throw new Error(`vote ${CHOICES.join(', ')}`);
    const proposal = this.#find(input.proposal, [KIND_PROPOSAL]);
    if (proposal.space?.kind !== 'project') throw new Error('votes happen inside projects');
    await this.publish({ kind: KIND_VOTE, body: { proposal: proposal.id, choice: input.choice }, space: proposal.space.id, as: input.as });
    return (await this.proposals(proposal.space.id)).find((p) => p.id === proposal.id)!;
  }

  async delegateVote(input: { project: string; who?: string }): Promise<void> {
    const project = this.#project(input.project);
    const to = input.who ? this.resolve(input.who) : null;
    if (to === this.identity.author) throw new Error('you cannot delegate to yourself');
    await this.publish({ kind: KIND_VOTE_DELEGATE, body: { to }, space: project.id });
  }

  async votingDelegate(ref: string): Promise<Actor | null> {
    let to: unknown = null;
    for (const entry of this.#entries(this.#project(ref))) {
      if (entry.kind === KIND_VOTE_DELEGATE && entry.event.author === this.identity.author) to = (entry.body as { to?: unknown } | null)?.to ?? null;
    }
    return isDid(to) ? this.#actor(to, to) : null;
  }

  /** A did:key, or the name of someone whose profile this node has seen. */
  resolve(who: string): Did {
    if (isDid(who)) return who;
    const matches = new Set<Did>();
    for (const event of this.replica.events((e) => e.kind === KIND_PROFILE)) {
      const name = (event.body as { name?: unknown } | null)?.name;
      if (typeof name === 'string' && name.toLowerCase() === who.toLowerCase()) matches.add(event.author);
    }
    if (matches.size === 0) throw new Error(`nobody named "${who}" is known yet — use their did:key`);
    if (matches.size > 1) throw new Error(`several people are named "${who}" — use their did:key`);
    return [...matches][0];
  }

  /** Display name for an author: the name in their latest profile, else the one their contact link gave. */
  nameOf(author: Did): string | undefined {
    let name: string | undefined;
    for (const event of this.#eventsOf(author)) {
      const body = event.body as { name?: unknown } | null;
      if (event.kind === KIND_PROFILE && typeof body?.name === 'string') name = body.name;
    }
    return name ?? this.#contacts().get(author);
  }

  /** Your address book: people added by contact link, with the name their link gave. */
  #contacts(): Map<Did, string | undefined> {
    const decoded = this.#decodeAll();
    if (this.#contactCache?.from !== decoded) {
      const map = new Map<Did, string | undefined>();
      for (const d of decoded) {
        const body = d.inner.body as { did?: unknown; name?: unknown } | null;
        if (d.private && d.inner.kind === KIND_CONTACT && isDid(body?.did)) map.set(body.did, typeof body.name === 'string' ? body.name : undefined);
      }
      this.#contactCache = { from: decoded, map };
    }
    return this.#contactCache.map;
  }

  /**
   * Whether a live event deserves a notification for you, and what it says.
   * Your own events (from any of your devices or agents) never do, and
   * neither do older ones arriving while catching up (over a day old).
   */
  async #noticeFor(item: FeedItem): Promise<Notice | undefined> {
    const me = this.identity.author;
    if (item.author === me || item.private || Date.now() - Date.parse(item.time) > 86_400_000) return undefined;
    const body = (item.body && typeof item.body === 'object' && !Array.isArray(item.body) ? item.body : {}) as Record<string, Json>;
    const text = (key: string) => (typeof body[key] === 'string' ? (body[key] as string) : '');
    const snippet = (value: string) => value.replace(/!\[[^\]]*\]\([^)]*\)/g, '[image]').replace(/\s+/g, ' ').trim().slice(0, 140);
    const who = item.authorName ?? this.nameOf(item.author) ?? 'Someone';
    const space = item.space;
    const where = space ? `${{ project: 'p/', community: 'r/', group: 'g/', direct: '@' }[space.kind]}${space.name}` : '';
    const POSTS = [KIND_POST, KIND_THREAD, KIND_ISSUE, KIND_PROPOSAL];
    const lookup = (id: Json | undefined, kinds: string[]) => {
      if (typeof id !== 'string') return undefined;
      try {
        const found = this.#find(id, kinds);
        const title = (found.inner.body as Record<string, Json> | null)?.title;
        return { id: found.id, author: found.event.author, title: typeof title === 'string' ? title : '' };
      } catch {
        return undefined;
      }
    };

    if (item.kind === KIND_MSG && space) {
      if (space.kind === 'direct') return { type: 'dm', category: 'messages', title: who, text: snippet(text('text')), open: { space } };
      const post = lookup(body.post, POSTS);
      const channel = text('channel') || 'general';
      const open = post ? { space, post: post.id } : { space, channel };
      const place = post ? `“${post.title}”` : `${where} #${channel}`;
      const name = this.nameOf(me)?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (name && new RegExp(`@${name}(?![\\w-])`, 'i').test(text('text')))
        return { type: 'mention', category: 'messages', title: `${who} mentioned you in ${place}`, text: snippet(text('text')), open };
      if (lookup(body.replyTo, [KIND_MSG, KIND_REPLY])?.author === me) return { type: 'reply', category: 'messages', title: `${who} replied to you in ${place}`, text: snippet(text('text')), open };
      if (post?.author === me) return { type: 'reply', category: 'messages', title: `${who} in your post ${place}`, text: snippet(text('text')), open };
      return undefined;
    }
    if (item.kind === KIND_REPLY && space) {
      const target = lookup(body.target, POSTS);
      if (target?.author === me) return { type: 'reply', category: 'messages', title: `${who} replied to “${target.title}”`, text: snippet(text('text')), open: { space, post: target.id } };
      return undefined;
    }
    if (item.kind === KIND_POST || item.kind === KIND_ISSUE || item.kind === KIND_PROPOSAL) {
      const mine = new Set<string>([me, ...this.#agents.map((a) => a.did)]);
      const named = Array.isArray(body.with) ? body.with : [];
      const title = text('title') || snippet(text('text'));
      if (named.some((d) => typeof d === 'string' && mine.has(d))) return { type: 'coauthor', category: 'requests', title: `${who} named you as co-author`, text: title, open: { inbox: true } };
      // Unfollowed (off Home): no news from it. Followed communities tell you about every new post.
      if (!space || !title || this.#homeHidden().has(space.id)) return undefined;
      if (space.kind === 'community') return { type: 'post', category: 'activity', title: `New post in ${where}`, text: `${who}: ${title}`, open: { space, post: item.id } };
      if (space.kind !== 'project') return undefined;
      const stored = this.#spaces.get(space.id);
      const board = stored && this.#spacePosts(stored).posts.find((p) => p.id === item.id)?.board;
      if (!board || !this.#follows(space.id, board)) return undefined;
      const type = item.kind === KIND_ISSUE ? 'issue' : item.kind === KIND_PROPOSAL ? 'proposal' : 'post';
      return { type, category: 'activity', title: `New ${type} in ${where}`, text: `${who}: ${title}`, open: { space, post: item.id } };
    }
    if (item.kind === KIND_KNOCK) {
      const knock = (await this.knocks()).find((k) => k.id === item.id);
      if (knock) return { type: 'knock', category: 'requests', title: `${knock.name ?? who} asks to join ${knock.space.name}`, text: snippet(knock.note), open: { inbox: true } };
    }
    if (item.kind === KIND_MEMBERSHIP_REQUEST) {
      const request = (await this.membershipRequests()).find((r) => r.id === item.id);
      if (request) return { type: 'membership', category: 'requests', title: `${request.name ?? who} asks for ${request.tier.name}`, text: snippet(request.note), open: { inbox: true } };
    }
    return undefined;
  }

  /** The event as this node can read it, or undefined if it can't (someone else's space or private data). */
  itemFor(event: WeaveEvent): FeedItem | undefined {
    const decoded = this.#decode(event);
    return decoded && this.#toItem(decoded);
  }

  // ---------------------------------------------------------------- internals: spaces

  /** A space by id or name, optionally of one kind. */
  #space(ref: string, kind?: SpaceKind): StoredSpace {
    const byId = this.#spaces.get(ref) ?? (this.#decodeAll(), this.#directs.get(ref)?.space);
    if (byId && (!kind || byId.kind === kind)) return byId;
    const byName = [...this.#spaces.values()].filter((s) => (!kind || s.kind === kind) && s.name.toLowerCase() === ref.toLowerCase());
    if (byName.length === 1) return byName[0];
    const what = kind ?? 'group, project or community';
    throw new Error(byName.length ? `several ${what}s are named "${ref}" — use its id` : `you are not in a ${what} "${ref}"`);
  }

  #project(ref: string): StoredSpace {
    const space = this.#space(ref);
    if (space.kind !== 'project') throw new Error(`${space.name} is a ${space.kind}; discussions, votes and issues live in projects`);
    return space;
  }

  #maintainerState(project: StoredSpace): SpaceState {
    const state = this.#state(project);
    if (!state.maintainers.has(this.identity.author)) throw new Error(`only ${project.kind === 'community' ? 'moderators' : 'maintainers'} of ${project.name} can do that`);
    return state;
  }

  /** A group invited to a project, by name or id, even if this node isn't in that group. */
  #knownGroup(project: StoredSpace, ref: string): { id: string; name: string } {
    const invited = [...this.#state(project).groups.values()];
    const match = invited.find((g) => g.id === ref) ?? invited.find((g) => (this.#spaces.get(g.id)?.name ?? g.name).toLowerCase() === ref.toLowerCase());
    if (!match) throw new Error(`no group "${ref}" is invited to ${project.name}`);
    return { id: match.id, name: this.#spaces.get(match.id)?.name ?? match.name };
  }

  #groupRef(id: string, state: SpaceState): SpaceRef {
    return { id, kind: 'group', name: this.#spaces.get(id)?.name ?? state.groups.get(id)?.name ?? 'group' };
  }

  #mineFounder = (space: StoredSpace) => space.founder === this.identity.author;

  /** Make someone a maintainer (project) or moderator (community), or drop them. */
  #appoint(space: StoredSpace, who: string, on: boolean): void {
    const state = this.#maintainerState(space);
    const member = this.resolve(who);
    const role = space.kind === 'community' ? 'moderator' : 'maintainer';
    if (on && !state.members.has(member)) throw new Error(`${who} isn't in ${space.name}`);
    if (!on && member === state.founder) throw new Error(`the owner always stays a ${role}`);
    this.replica.append(this.identity, sealFor(space, { kind: KIND_MAINTAINER, body: { member, on } }));
  }

  /** A board of a space, by name or title. */
  #board(space: StoredSpace, boards: Board[], ref: string): Board {
    const name = boardName(ref);
    const board = boards.find((b) => b.name === name) ?? boards.find((b) => b.title.toLowerCase() === ref.trim().toLowerCase());
    if (!board) throw new Error(`${space.name} has no board "${ref}" — it has ${boards.map((b) => b.name).join(', ')}`);
    return board;
  }

  async #createSpace(kind: SpaceKind, name: string, extra: Record<string, Json> = {}): Promise<StoredSpace> {
    if (!name?.trim()) throw new Error(`a ${kind} needs a name`);
    const space: StoredSpace = { ...newSpace(kind, name.trim(), this.identity.author), entry: { topics: [], bootstrap: [] } };
    await this.#addSpace(space);
    this.replica.append(this.identity, sealFor(space, { kind: KIND_SPACE_CREATE, body: { name: space.name, ...extra } }));
    return space;
  }

  async #addSpace(space: StoredSpace): Promise<void> {
    this.#saveSpace(space);
    if (this.#swarm) await Promise.all([spaceTopic(space), ...space.entry.topics].map((t) => this.#swarm!.join(t)));
  }

  #saveSpace(space: StoredSpace): void {
    this.#decoded = undefined;
    this.#spaces.set(space.id, space);
    saveSpace(this.home, space);
  }

  #entryPoint(): Invite['entry'] {
    return { topics: [this.identity.author], bootstrap: this.config.bootstrap };
  }

  /** Someone on a private network (e.g. a local testnet) brings us onto it. */
  #adoptBootstrap(entry: Invite['entry']): void {
    const key = (list: Invite['entry']['bootstrap']) => JSON.stringify(list.map((b) => `${b.host}:${b.port}`).sort());
    if (key(entry.bootstrap) === key(this.config.bootstrap)) return;
    const describe = (list: Invite['entry']['bootstrap']) => (list.length ? `the private network at ${list.map((b) => `${b.host}:${b.port}`).join(', ')}` : 'the public network');
    // A brand-new node may follow its first link onto a private network (handy for test networks):
    // it has nothing there yet to lose. An established node never switches silently.
    const fresh = this.config.bootstrap.length === 0 && this.#spaces.size === 0 && this.#contacts().size === 0 && !(this.#graph().get(this.identity.author)?.following.size);
    if (fresh && entry.bootstrap.length) {
      this.config = { ...this.config, bootstrap: entry.bootstrap };
      saveConfig(this.home, this.config);
      return;
    }
    const fix = entry.bootstrap.length ? `weave bootstrap ${entry.bootstrap.map((b) => `${b.host}:${b.port}`).join(' ')}` : 'weave bootstrap --clear';
    throw new Error(
      `this link comes from ${describe(entry.bootstrap)}, but your node uses ${describe(this.config.bootstrap)}, so you couldn't reach each other. ` +
        `To switch on purpose: "${fix}", restart your node, then use the link again.`,
    );
  }

  /** Record admissions into a project and hand the newcomers its keys through the group they came by. */
  #admitAll(project: StoredSpace, group: StoredSpace, dids: Did[]): void {
    if (!dids.length) return;
    for (const member of dids) this.replica.append(this.identity, sealFor(project, { kind: KIND_ADMIT, body: { member, via: group.id } }));
    this.replica.append(this.identity, gift(this.#keysOnly(project), dids, spaceScope(group), this.#entryPoint(), this.#encryptionKeyOf));
  }

  /** Joins to and departures from a project's invited groups that this node can see (it must be in the group). */
  #changes(project: StoredSpace, state: SpaceState): Admission[] {
    const changes: Admission[] = [];
    const projectRef: SpaceRef = { id: project.id, kind: 'project', name: project.name };
    for (const invited of state.groups.values()) {
      const group = this.#spaces.get(invited.id);
      if (!group) continue;
      const groupMembers = this.#state(group).members;
      const groupRef: SpaceRef = { id: group.id, kind: 'group', name: group.name };
      for (const did of groupMembers.keys()) {
        if (!state.members.has(did) && state.declined.get(did) !== group.id) changes.push({ project: projectRef, did, name: this.nameOf(did), group: groupRef, change: 'join' });
      }
      for (const member of state.members.values()) {
        if (member.via === group.id && !groupMembers.has(member.did) && member.did !== state.founder) {
          changes.push({ project: projectRef, did: member.did, name: this.nameOf(member.did), group: groupRef, change: 'leave' });
        }
      }
    }
    return changes;
  }

  /** New epoch keys from a rekey, or a whole space gifted to us when a project admitted us. */
  #takeKeys(event: WeaveEvent): void {
    if (canonicalKind(event.kind) === KIND_REKEY) {
      const space = this.#spaces.get(parseScope(event.scope)?.id ?? '');
      if (!space || !canManage(this.#state(space), event.author)) return;
      const opened = this.#tryOpen((me) => openRekey(event, me));
      if (opened && !space.keys[String(opened.epoch)]) {
        space.keys[String(opened.epoch)] = opened.key;
        this.#saveSpace(space);
      }
      return;
    }
    const opened = this.#tryOpen((me) => openGift(event, me));
    if (!opened) return;
    // Only accept gifts posted in a group we're in, by someone in that group,
    // or a tier's keys from the creator we asked to join it.
    const via = this.#spaces.get(parseScope(event.scope)?.id ?? '');
    const viaGroup = !!via && via.kind === 'group' && this.#state(via).members.has(event.author);
    const asked = opened.space.kind === 'group' && opened.space.founder === event.author && this.#selfBodies(KIND_MEMBERSHIP_PENDING).some((b) => b.tier === opened.space.id && b.creator === event.author);
    // Or the keys of a space we knocked on, from the person whose link we used.
    const knocked = this.#selfBodies(KIND_KNOCK_PENDING).some((b) => b.space === opened.space.id && b.inviter === event.author);
    if (!viaGroup && !asked && !knocked) return;
    const known = this.#spaces.get(opened.space.id);
    if (known) {
      let added = false;
      for (const [epoch, key] of Object.entries(opened.space.keys)) if (!known.keys[epoch]) (known.keys[epoch] = key), (added = true);
      for (const [board, epochs] of Object.entries((opened.space as StoredSpace).boards ?? {})) {
        for (const [epoch, key] of Object.entries(epochs)) if (!known.boards?.[board]?.[epoch]) (((known.boards ??= {})[board] ??= {})[epoch] = key), (added = true);
      }
      if (added) this.#saveSpace(known);
      return;
    }
    void this.#addSpace({ ...opened.space, entry: opened.entry });
  }

  #state(space: StoredSpace): SpaceState {
    const direct = this.#directs.get(space.id);
    if (direct) {
      // Two people, no membership events: the key itself says who is in.
      const member = (did: Did): [Did, Member] => [did, { did, since: '' }];
      return { kind: 'direct', founder: space.founder, members: new Map([member(this.identity.author), member(direct.peer)]), removed: new Map(), maintainers: new Set(), groups: new Map(), declined: new Map(), left: new Set() };
    }
    const opened = this.#decodeAll().filter((d) => d.space?.id === space.id);
    return spaceState(space.kind, space.founder, opened);
  }

  #page(project: StoredSpace, state: SpaceState): ProjectPage {
    let page = DEFAULT_PAGE;
    for (const d of this.#decodeAll()) {
      if (d.space?.id !== project.id || d.inner.kind !== KIND_PAGE || !state.maintainers.has(d.event.author)) continue;
      const body = (d.inner.body ?? {}) as Record<string, unknown>;
      const text = (key: string, max: number) => (typeof body[key] === 'string' ? (body[key] as string).slice(0, max) : undefined);
      // Pages from before titles and bodies had only a description: it becomes the body.
      const legacy = body.body === undefined && body.subtitle === undefined;
      const subtitle = text('subtitle', 300) ?? '';
      const pageBody = text('body', 100_000) ?? (legacy ? (text('description', 5000) ?? '') : '');
      const icon = parseBlobRef(body.icon) ? (body.icon as string) : undefined;
      const banner = parseBlobRef(body.banner) ? (body.banner as string) : undefined;
      page = {
        title: text('title', 100) ?? '',
        subtitle,
        body: pageBody,
        ...(icon ? { icon } : {}),
        ...(banner ? { banner } : {}),
        description: subtitle || summary(pageBody),
        status: PROJECT_STATUSES.includes(body.status as ProjectStatus) ? (body.status as ProjectStatus) : page.status,
        public: body.public === true,
      };
    }
    return page;
  }

  #spaceInfo(space: StoredSpace): SpaceInfo {
    const state = this.#state(space);
    return {
      id: space.id,
      kind: space.kind,
      name: this.#spaceName(space),
      founder: state.founder,
      founderName: this.nameOf(state.founder),
      members: state.members.size,
      epoch: currentEpoch(space),
      ...(space.kind === 'project' && this.#page(space, state).icon ? { icon: this.#page(space, state).icon } : {}),
      ...(state.closed ? { closed: true as const } : {}),
      ...(this.#homeHidden().has(space.id) ? { hiddenFromHome: true as const } : {}),
    };
  }

  /** A space's name; a direct chat is named after the other person. */
  #spaceName(space: StoredSpace): string {
    const peer = this.#directs.get(space.id)?.peer;
    return peer ? (this.nameOf(peer) ?? `${peer.slice(8, 16)}…`) : space.name;
  }

  /** Friends: people I follow who follow me back. */
  #friends(): Did[] {
    return friendsOf(this.#graph(), this.identity.author);
  }

  /** The direct chat with someone, derived once and remembered for this run. */
  #direct(peer: Did): StoredSpace {
    let space = this.#directByPeer.get(peer);
    if (!space) {
      space = { ...directSpace(this.#recipient(), peer, this.#encryptionKeyOf(peer)), entry: { topics: [peer], bootstrap: [] } };
      this.#directByPeer.set(peer, space);
      this.#directs.set(space.id, { space, peer });
    }
    return space;
  }

  /** Derive the direct chats with everyone whose log we hold (people, not their agents' keys). */
  #ensureDirects(): void {
    for (const signer of Object.keys(this.replica.heads()) as Did[]) {
      const person = this.replica.authority.personOf(signer);
      if (person !== this.identity.author && !this.#directByPeer.has(person) && !this.replica.authority.grant(person)) this.#direct(person);
    }
  }

  // ---------------------------------------------------------------- internals: posts

  /** Your saves, from your self-sealed events. */
  #saves(): Map<string, SaveMode> {
    const mine = this.#decodeAll()
      .filter((d) => d.private && d.inner.kind === KIND_SAVE)
      .map((d) => ({ id: eventId(d.event), event: d.event, kind: d.inner.kind, body: d.inner.body }));
    return savesOf(mine);
  }

  /** How many messages each post's chat has, and when the latest came. */
  #chats(entries: Entry[]): Map<string, { count: number; last: string }> {
    const chats = new Map<string, { count: number; last: string }>();
    for (const e of entries) {
      const body = e.body as { post?: unknown; target?: unknown } | null;
      const post = e.kind === KIND_MSG ? body?.post : e.kind === KIND_REPLY ? body?.target : undefined;
      if (typeof post !== 'string') continue;
      const chat = chats.get(post) ?? { count: 0, last: '' };
      chat.count++;
      if (e.event.time > chat.last) chat.last = e.event.time;
      chats.set(post, chat);
    }
    return chats;
  }

  /** All posts in a project's boards or a community, and its boards. */
  #spacePosts(space: StoredSpace): { posts: PostInfo[]; boards: Board[] } {
    const entries = this.#entries(space);
    const state = this.#state(space);
    const access = space.kind === 'project' ? this.#access(space, state, entries) : undefined;
    const me = this.identity.author;
    // Boards we may not read stay out of sight altogether.
    const boards = boardsOf(space.kind, entries, state.maintainers).filter((b) => !access?.rules.get(b.name)?.read || !state.members.has(me) || mayUse('read', b.name, me, state, access));
    const known = new Set(boards.map((b) => b.name));
    const pinned = new Set(boards.flatMap((b) => b.pinned));
    const issues = new Map(space.kind === 'project' ? issuesOf(entries).map((i) => [i.id, i]) : []);
    const proposals = new Map(space.kind === 'project' ? proposalsOf(entries, this.#voters(space)).map((p) => [p.id, p]) : []);
    const visible = postsOf(space.kind, entries, state.maintainers).filter((p) => known.has(p.board)); // posts of dropped boards stay in the logs, out of sight
    const ctx = { scores: scoresOf(entries), chats: this.#chats(entries), saves: this.#saves(), entries, prefixes: shortPrefixes(visible.map((p) => p.id)) };
    const posts = visible
      .map((p) => {
        const info = this.#postInfo(p, space, ctx);
        if (pinned.has(p.id)) info.pinned = true;
        const issue = issues.get(p.id);
        if (issue) info.issue = { status: issue.status, labels: issue.labels, ...(issue.assignee ? { assignee: this.#actor(issue.assignee.author, issue.assignee.signer) } : {}) };
        const proposal = proposals.get(p.id);
        if (proposal) info.proposal = this.#proposalInfo(proposal);
        return info;
      });
    return { posts, boards };
  }

  /** A project shown as a post: its id is the event that created it. */
  #projectPost(project: StoredSpace): PostInfo | undefined {
    const entries = this.#entries(project);
    const created = entries.find((e) => canonicalKind(e.kind) === KIND_SPACE_CREATE && e.event.author === project.founder);
    if (!created) return undefined;
    const state = this.#state(project);
    const page = this.#page(project, state);
    const score = scoresOf(entries).get(created.id);
    const messages = entries.filter((e) => e.kind === KIND_MSG);
    const active = [created.event.time, ...entries.map((e) => e.event.time)].reduce((a, b) => (b > a ? b : a));
    const saved = this.#saves().get(created.id);
    return {
      id: created.id,
      short: created.id.slice(0, 8),
      url: postUrl({ id: created.id, title: project.name, space: project, project: true }, this.#prefix()),
      type: 'project',
      space: { id: project.id, kind: 'project', name: project.name },
      by: this.#actor(project.founder, project.founder),
      title: project.name,
      text: page.description,
      time: created.event.time,
      active,
      score: score?.score ?? 0,
      myVote: score?.votes.get(this.identity.author) ?? 0,
      chat: messages.length,
      pinned: false,
      ...(saved ? { saved } : {}),
      project: { id: project.id, name: project.name, description: page.description, status: page.status, ...(page.icon ? { icon: page.icon } : {}), participants: state.members.size, member: true },
    };
  }

  #postInfo(p: Post, space: StoredSpace | undefined, ctx: { scores: Map<string, Score>; chats: Map<string, { count: number; last: string }>; saves: Map<string, SaveMode>; entries?: Entry[]; prefixes?: Map<string, string> }): PostInfo {
    const score = ctx.scores.get(p.id);
    const chat = ctx.chats.get(p.id);
    const saved = ctx.saves.get(p.id);
    const info: PostInfo = {
      id: p.id,
      short: p.id.slice(0, 8),
      url: postUrl({ id: p.id, title: p.title, ...(space ? { space, board: p.board } : { author: this.#actor(p.author, p.author).name }) }, this.#prefix(ctx.prefixes)),
      type: p.type,
      ...(space ? { space: { id: space.id, kind: space.kind, name: space.name }, board: p.board } : {}),
      by: this.#actor(p.author, p.signer),
      title: p.title,
      text: p.text,
      ...(p.link ? { link: p.link } : {}),
      ...(p.image ? { image: p.image } : {}),
      time: p.time,
      ...(p.edited ? { edited: p.edited } : {}),
      active: chat && chat.last > p.time ? chat.last : p.time,
      score: score?.score ?? 0,
      myVote: score?.votes.get(this.identity.author) ?? 0,
      chat: chat?.count ?? 0,
      pinned: false,
      ...(saved ? { saved } : {}),
    };
    if (p.with && ctx.entries) {
      // Everyone sees confirmed co-authors; the post's author also sees who was asked and who declined.
      const own = p.author === this.identity.author;
      const coauthors = coauthorsOf(p, ctx.entries, this.#keyFacts)
        .filter((c) => own || c.state === 'confirmed')
        .map((c) => ({ ...this.#keyActor(c.did), state: c.state }));
      if (coauthors.length) info.coauthors = coauthors;
    }
    if (p.share) {
      info.share = { ...(p.share.space ? { space: p.share.space } : {}), post: p.share.post, member: !!p.share.space && this.#spaces.has(p.share.space.id) };
      if (p.share.project) {
        const mine = this.#spaces.get(p.share.project.id);
        const icon = mine ? this.#page(mine, this.#state(mine)).icon : p.share.project.icon;
        info.project = { ...p.share.project, ...(icon ? { icon } : {}), member: !!mine, ...(mine ? { participants: this.#state(mine).members.size } : {}) };
      }
    }
    return info;
  }

  /** Public posts by you and the people you follow, upvoted in public. */
  #publicPosts(): PostInfo[] {
    const following = this.#graph().get(this.identity.author)?.following ?? new Set<Did>();
    const hidden = this.#hiddenAuthors();
    const entries = this.#decodeAll()
      .filter((d) => !d.space && !d.private)
      .map((d) => ({ id: eventId(d.event), event: d.event, kind: d.inner.kind, body: d.inner.body }));
    const posts = postsOf(undefined, entries).filter((p) => (p.author === this.identity.author || following.has(p.author)) && !hidden.has(p.author));
    const ctx = { scores: scoresOf(entries), chats: new Map(), saves: this.#saves(), entries, prefixes: shortPrefixes(posts.map((p) => p.id)) };
    return posts.map((p) => this.#postInfo(p, undefined, ctx));
  }

  /**
   * Home: your communities' posts, your projects, and public posts from people
   * you follow, from all of them or one kind of source. Spaces you hid from
   * Home stay out (pass `from` undefined to get everything, e.g. to look a post up).
   */
  #homePosts(from?: HomeSource): PostInfo[] {
    const me = this.identity.author;
    const hidden = this.#hiddenAuthors();
    const hiddenSpaces = from ? this.#homeHidden() : new Set<string>();
    const friends = from === 'friends' ? new Set(friendsOf(this.#graph(), me)) : new Set<Did>();
    const wants = (kind: 'community' | 'project' | 'public') =>
      !from || from === 'all' || (kind === 'community' ? from === 'communities' : kind === 'project' ? ['projects', 'mine', 'friends'].includes(from) : ['following', 'friends', 'mine'].includes(from));
    const said = this.#boardFollows();
    const posts: PostInfo[] = [];
    for (const space of this.#spaces.values()) {
      if (hiddenSpaces.has(space.id)) continue;
      if (space.kind === 'community' && wants('community')) posts.push(...this.#spacePosts(space).posts);
      if (space.kind === 'project' && wants('project')) {
        const state = this.#state(space);
        if (from === 'mine' && state.founder !== me && !state.maintainers.has(me)) continue;
        if (from === 'friends' && !friends.has(state.founder)) continue;
        const post = this.#projectPost(space);
        if (post) posts.push(post);
        posts.push(...this.#spacePosts(space).posts.filter((p) => p.board && this.#follows(space.id, p.board, said)));
      }
    }
    if (wants('public')) {
      for (const p of this.#publicPosts()) {
        // Shared projects: yours under "mine", your friends' under "friends"; "following" takes every public post.
        if (from === 'mine' && !(p.project && p.by.did === me)) continue;
        if (from === 'friends' && !(p.project && friends.has(p.by.did))) continue;
        // On Home, a share of a project you're in is already there as the project itself.
        if (from && p.project && posts.some((q) => q.type === 'project' && q.space?.id === p.project!.id)) continue;
        posts.push(p);
      }
    }
    return posts.filter((p) => !hidden.has(p.by.did));
  }

  // ---------------------------------------------------------------- phones

  async pairPhone(): Promise<{ link: string; expires: string }> {
    return this.#remote.pair();
  }

  async phones(): Promise<Array<{ key: string; name: string; paired: string; lastSeen?: string }>> {
    return this.#remote.phones();
  }

  async unpairPhone(key: string): Promise<void> {
    this.#remote.unpair(key);
  }

  async setHomeVisibility(input: { space: string; visible: boolean }): Promise<SpaceInfo> {
    const space = this.#space(input.space);
    if (space.kind !== 'community' && space.kind !== 'project') throw new Error('only communities and projects are on Home');
    if (this.#homeHidden().has(space.id) === !input.visible) return this.#spaceInfo(space);
    this.replica.append(this.identity, this.#sealForSelf({ kind: KIND_HOME_HIDDEN, body: { space: space.id, hidden: !input.visible } }));
    return this.#spaceInfo(space);
  }

  async followBoard(input: { project: string; board: string; on: boolean }): Promise<BoardInfo[]> {
    const project = this.#project(input.project);
    const board = this.#board(project, this.#spacePosts(project).boards, input.board);
    if (this.#follows(project.id, board.name) !== input.on) {
      this.replica.append(this.identity, this.#sealForSelf({ kind: KIND_BOARD_FOLLOW, body: { space: project.id, board: board.name, on: input.on } }));
    }
    return this.boards(project.id);
  }

  /** Your say on following boards, as "space/board" → on; the latest counts. */
  #boardFollows(): Map<string, boolean> {
    const said = new Map<string, boolean>();
    for (const b of this.#selfBodies(KIND_BOARD_FOLLOW)) if (typeof b.space === 'string' && typeof b.board === 'string' && typeof b.on === 'boolean') said.set(`${b.space}/${b.board}`, b.on);
    return said;
  }

  /** Whether you follow a project's board: your latest say, or the default (releases and showcase). */
  #follows(space: string, board: string, said = this.#boardFollows()): boolean {
    return said.get(`${space}/${board}`) ?? FOLLOWED_BOARDS.includes(board);
  }

  /** Spaces you hid from Home. */
  #homeHidden(): Set<string> {
    const hidden = new Set<string>();
    for (const b of this.#selfBodies(KIND_HOME_HIDDEN)) {
      if (typeof b.space !== 'string') continue;
      if (b.hidden === false) hidden.delete(b.space);
      else hidden.add(b.space);
    }
    return hidden;
  }

  /** Everything that can be shown as a post, including every board of every project. */
  #allPosts(): PostInfo[] {
    const boardPosts = [...this.#spaces.values()].filter((s) => s.kind === 'project').flatMap((s) => this.#spacePosts(s).posts);
    // Posts of followed boards are on Home too: each post once.
    return [...new Map([...this.#homePosts(), ...boardPosts].map((p) => [p.id, p])).values()];
  }

  /**
   * Short ids for addresses: a post's within its list (`posts`), a space's
   * among your spaces. Anything else keeps 8 characters.
   */
  #prefix(posts?: Map<string, string>): (id: string) => string {
    const spaces = shortPrefixes(this.#spaces.keys());
    return (id) => posts?.get(id) ?? spaces.get(id) ?? id.slice(0, 8);
  }

  /** The post an address points to (see postTargetOf): its project or community by id prefix, then the post. */
  #postAt(target: PostTarget): PostInfo {
    const posts = this.#allPosts().filter((p) =>
      target.public ? !p.space : !!target.space && !!p.space?.id.startsWith(target.space) && (target.post ? p.type !== 'project' : p.type === 'project'),
    );
    const matches = target.post ? posts.filter((p) => p.id.startsWith(target.post!)) : posts;
    if (matches.length === 0) throw new Error(`no post found at that address (it may be in a project or community you're not in)`);
    if (matches.length > 1) throw new Error(`that address fits ${matches.length} posts here: use more characters of the id`);
    return matches[0];
  }

  /** Where a post's chat lives; a project's own chat is its channels. */
  async #chatOf(ref: string): Promise<{ space: StoredSpace; post?: string }> {
    const post = await this.post(ref);
    const space = post.space && this.#spaces.get(post.space.id);
    if (!space) throw new Error('public posts have no chat; share them into a community to talk about them');
    return post.type === 'project' ? { space } : { space, post: post.id };
  }

  // ---------------------------------------------------------------- internals: reading

  #sealForSelf(inner: Inner): EventFields {
    const key = selfKey(this.#selfSecret());
    return { kind: KIND_SEALED, scope: SELF_SCOPE, body: seal(key, inner as unknown as Json, `weave/self/v1:${this.identity.author}`) };
  }

  #decode(event: WeaveEvent): Decoded | undefined {
    if (canonicalKind(event.kind) === KIND_REKEY || event.kind === KIND_GIFT) return undefined; // key plumbing, not content
    if (event.kind !== KIND_SEALED) return { event, inner: { kind: event.kind, body: event.body } };

    let decoded: Decoded | undefined;
    if (event.scope === SELF_SCOPE) {
      if (event.author !== this.identity.author) return undefined;
      try {
        const key = selfKey(this.#selfSecret());
        const inner = open(key, event.body as Sealed, `weave/self/v1:${event.author}`) as unknown as Inner;
        decoded = { event, inner, private: true };
      } catch {
        return undefined;
      }
    } else {
      const scope = parseScope(event.scope);
      let space = this.#spaces.get(scope?.id ?? '') ?? this.#directs.get(scope?.id ?? '')?.space;
      // A direct message from someone new: their chat with us is the one derived from their key.
      if (!space && scope?.kind === 'direct' && event.author !== this.identity.author) {
        const candidate = this.#direct(event.author);
        if (candidate.id === scope.id) space = candidate;
      }
      const inner = space && openIn(space, event);
      if (!inner) return undefined;
      decoded = { event, inner, space };
      // An event of a read-limited board: readable only with that board's key.
      if (inner.kind === KIND_BOARD_SEALED) {
        const opened = space?.kind === 'project' ? openBoard(space, inner, space.boards) : undefined;
        if (!opened) return undefined;
        decoded = { event, inner: { kind: opened.kind, body: opened.body }, space, board: opened.board };
      }
    }
    // A delegated key may carry sealed events, but only of kinds it was granted.
    if (event.signer !== event.author) {
      const grant = this.replica.authority.grant(event.signer);
      if (!grant || !permits(grant.permissions, decoded.inner.kind)) return undefined;
    }
    return decoded;
  }

  #decodeAll(): Decoded[] {
    // Board keys arrive inside the project: taking one makes more events readable, so decode again.
    for (let round = 0; round < 4; round++) {
      if (!this.#decoded) this.#ensureDirects();
      this.#decoded ??= this.replica.events().flatMap((event) => {
        const decoded = this.#decode(event);
        return decoded ? [decoded] : [];
      });
      if (!this.#takeBoardKeys(this.#decoded)) break;
    }
    return this.#decoded!;
  }

  /** Keep board keys boxed to us; true if any was new (then everything is decoded again). */
  #takeBoardKeys(decoded: Decoded[]): boolean {
    const changed = new Set<StoredSpace>();
    for (const d of decoded) {
      if (d.inner.kind !== KIND_BOARD_KEY || d.space?.kind !== 'project') continue;
      const id = eventId(d.event);
      if (this.#boardKeysSeen.has(id)) continue;
      this.#boardKeysSeen.add(id);
      const opened = this.#tryOpen((me) => openBoardKey(d.space!, d.inner, me));
      if (!opened) continue;
      const epochs = ((d.space.boards ??= {})[opened.board] ??= {});
      if (epochs[String(opened.epoch)]) continue;
      epochs[String(opened.epoch)] = opened.key;
      changed.add(d.space);
    }
    for (const space of changed) this.#saveSpace(space);
    return changed.size > 0;
  }

  #graph() {
    const edges: EdgeEvent[] = this.#decodeAll()
      .filter((d) => (EDGE_KINDS as readonly string[]).includes(d.inner.kind))
      .map((d) => ({ author: d.event.author, kind: d.inner.kind, body: d.inner.body, time: d.event.time, signer: d.event.signer, seq: d.event.seq }));
    return socialGraph(edges);
  }

  /** Authors I blocked or muted: their events are left out of feeds. */
  #hiddenAuthors(): Set<Did> {
    const mine = this.#graph().get(this.identity.author);
    return new Set([...(mine?.blocked ?? []), ...(mine?.muted ?? [])]);
  }

  /**
   * Your own events are always shown to you: after joining offline, your node
   * can't confirm your membership until it has synced the founder's events.
   */
  #mine = (event: WeaveEvent): boolean => event.author === this.identity.author;

  /** A space's readable events from members, as entries for the collaboration functions. */
  #entries(space: StoredSpace): Entry[] {
    const state = this.#state(space);
    const entries = this.#decodeAll()
      .filter((d) => d.space?.id === space.id && (this.#mine(d.event) || visibleIn(state, d.event, d.inner)))
      .map((d) => ({ id: eventId(d.event), event: d.event, kind: d.inner.kind, body: d.inner.body }));
    return space.kind === 'project' ? this.#writable(space, state, entries) : entries;
  }

  // ---------------------------------------------------------------- internals: board access

  #access(space: StoredSpace, state: SpaceState, entries: Entry[]): Access {
    return accessOf(entries, state, inviteRightsOf(entries, state));
  }

  /** Where issues and proposals that don't name a board live: the first board of their type. */
  #boardDefaults(state: SpaceState, entries: Entry[]): { issues?: string; proposals?: string } {
    const boards = boardsOf('project', entries, state.maintainers);
    return { issues: boards.find((b) => b.type === 'issues')?.name, proposals: boards.find((b) => b.type === 'proposals')?.name };
  }

  /** Leave out what people wrote in boards they may not write in (everyone's node does the same). */
  #writable(space: StoredSpace, state: SpaceState, entries: Entry[]): Entry[] {
    const access = this.#access(space, state, entries);
    if (![...access.rules.values()].some((r) => r.write)) return entries;
    const boards = boardOfEvents(entries, this.#boardDefaults(state, entries));
    return entries.filter((e) => {
      const board = boards.get(e.id);
      return !board || !access.rules.get(board)?.write || mayUse('write', board, e.event.author, state, access);
    });
  }

  /** Who may vote on each proposal: the people who may write in its board. */
  #voters(project: StoredSpace): (proposal: Entry) => Set<Did> {
    const state = this.#state(project);
    const entries = this.#entries(project);
    const access = this.#access(project, state, entries);
    const boards = boardOfEvents(entries, this.#boardDefaults(state, entries));
    const everyone = new Set(state.members.keys());
    return (proposal) => {
      const board = boards.get(proposal.id);
      return board && access.rules.get(board)?.write ? new Set([...everyone].filter((did) => mayUse('write', board, did, state, access))) : everyone;
    };
  }

  /** Check a new event against its board's rules, and seal it with the board's key if the board is read-limited. */
  #forBoard(space: StoredSpace, inner: Inner): Inner {
    const state = this.#state(space);
    const entries = this.#entries(space);
    const access = this.#access(space, state, entries);
    if (!access.rules.size) return inner;
    const defaults = this.#boardDefaults(state, entries);
    const board = boardOfInner(inner, boardOfEvents(entries, defaults), defaults);
    const rules = board ? access.rules.get(board) : undefined;
    if (!board || !rules) return inner;
    const me = this.identity.author;
    if (rules.write && state.members.has(me) && !mayUse('write', board, me, state, access)) throw new Error(`only some people may write in ${board} of ${space.name}, and you're not one of them`);
    if (!rules.read) return inner;
    const epochs = space.boards?.[board] ?? {};
    const epoch = Math.max(-1, ...Object.keys(epochs).map(Number));
    if (epoch < 0) throw new Error(`you don't have the key for ${board} yet: someone who can read it needs to be online once`);
    return sealForBoard(space, board, epoch, epochs[String(epoch)], inner);
  }

  /**
   * Keep read-limited boards readable by exactly their readers: maintainers
   * publish who of an invited group takes part (others can't see the group),
   * anyone holding a board's key passes it to readers who lack it, and
   * maintainers start a new key when someone may no longer read.
   */
  async #reconcileBoards(project: StoredSpace): Promise<number> {
    const me = this.identity.author;
    let state = this.#state(project);
    if (!state.members.has(me)) return 0;
    let entries = this.#entries(project);
    let access = this.#access(project, state, entries);
    if (!access.rules.size) return 0;
    let changed = 0;
    if (state.maintainers.has(me)) {
      const groups = new Set([...access.rules.values()].flatMap((r) => [...(r.read ?? []), ...(r.write ?? [])]).flatMap((g) => ('group' in g ? [g.group] : [])));
      for (const id of groups) {
        const group = this.#spaces.get(id);
        if (!group) continue;
        const roster = [...this.#state(group).members.keys()].filter((did) => state.members.has(did)).sort();
        const known = [...(access.rosters.get(id) ?? [])].sort();
        if (roster.join() === known.join()) continue;
        this.replica.append(this.identity, sealFor(project, { kind: KIND_ROSTER, body: { group: id, members: roster } }));
        changed++;
      }
      if (changed) {
        state = this.#state(project);
        entries = this.#entries(project);
        access = this.#access(project, state, entries);
      }
    }
    const holders = keyHolders(entries);
    for (const [board, rules] of access.rules) {
      if (!rules.read) continue;
      const readers = readersOf(board, state, access);
      const epochs = holders.get(board);
      const mine = project.boards?.[board] ?? {};
      const newKey = (epoch: number) => {
        const key = newBoardKey();
        ((project.boards ??= {})[board] ??= {})[String(epoch)] = key;
        this.#saveSpace(project);
        this.replica.append(this.identity, sealFor(project, boardKeyFor(project, board, epoch, key, readers, this.#encryptionKeyOf)));
        changed++;
      };
      if (!epochs?.size) {
        if (state.maintainers.has(me) && !Object.keys(mine).length) newKey(0);
        continue;
      }
      const latest = Math.max(...epochs.keys());
      if (!mine[String(latest)]) continue; // the newest key hasn't reached us yet
      // Someone who may no longer read holds the current key: maintainers start a new one.
      if (state.maintainers.has(me) && [...epochs.get(latest)!].some((did) => !readers.includes(did))) newKey(latest + 1);
      // Readers get every key we hold that they lack, older ones too, so they can read the board's history.
      for (const [epoch, holding] of epochs) {
        const key = mine[String(epoch)];
        const missing = key ? readers.filter((did) => !holding.has(did)) : [];
        if (!missing.length) continue;
        this.replica.append(this.identity, sealFor(project, boardKeyFor(project, board, epoch, key, missing, this.#encryptionKeyOf)));
        changed++;
      }
    }
    return changed;
  }

  /** An event by full id or a unique prefix (at least 6 characters), limited to some kinds. */
  #find(ref: string, kinds: string[]): Decoded & { id: string } {
    if (!ref || ref.length < 6) throw new Error('use at least 6 characters of the id');
    const matches = this.#decodeAll()
      .filter((d) => kinds.includes(d.inner.kind))
      .map((d) => ({ ...d, id: eventId(d.event) }))
      .filter((d) => d.id.startsWith(ref));
    if (matches.length === 0) throw new Error(`nothing found with id ${ref}`);
    if (matches.length > 1) throw new Error(`id ${ref} is ambiguous — use more characters`);
    return matches[0];
  }

  async #issueById(issue: Decoded & { id: string }): Promise<IssueInfo> {
    if (issue.space?.kind !== 'project') throw new Error('issues live inside projects');
    return (await this.issues(issue.space.id)).find((i) => i.id === issue.id)!;
  }

  #actor(author: Did, signer: Did): Actor {
    const actor: Actor = { did: author };
    const name = this.nameOf(author);
    if (name) actor.name = name;
    const agent = this.#agentName(signer, author);
    if (agent) actor.agent = agent;
    return actor;
  }

  #reactionInfo = (r: Reaction): ReactionInfo => ({
    emoji: r.emoji,
    count: r.by.length,
    mine: r.by.some((who) => who.author === this.identity.author),
    by: r.by.map((who) => {
      const actor = this.#actor(who.author, who.signer);
      return `${actor.name ?? actor.did.slice(8, 16)}${actor.agent ? ` · ${actor.agent}` : ''}`;
    }),
  });

  #messageInfo(m: Message, byId: Map<string, Message>): MessageInfo {
    const parent = m.replyTo ? byId.get(m.replyTo) : undefined;
    return {
      id: m.id,
      short: m.id.slice(0, 8),
      by: this.#actor(m.author, m.signer),
      text: m.text,
      time: m.time,
      channel: m.channel,
      ...(parent ? { replyTo: { id: parent.id, by: this.#actor(parent.author, parent.signer), text: parent.text.slice(0, 140) } } : {}),
      reactions: m.reactions.map(this.#reactionInfo),
    };
  }

  #replyInfo = (r: Reply): ReplyInfo => ({ id: r.id, by: this.#actor(r.author, r.signer), text: r.text, time: r.time });

  #threadInfo(t: Thread): ThreadInfo {
    return { id: t.id, short: t.id.slice(0, 8), by: this.#actor(t.author, t.signer), title: t.title, text: t.text, time: t.time, active: t.active, replies: t.replies.map(this.#replyInfo) };
  }

  #issueInfo(i: Issue): IssueInfo {
    return {
      id: i.id,
      short: i.id.slice(0, 8),
      by: this.#actor(i.author, i.signer),
      title: i.title,
      text: i.text,
      labels: i.labels,
      status: i.status,
      ...(i.assignee ? { assignee: this.#actor(i.assignee.author, i.assignee.signer) } : {}),
      time: i.time,
      replies: i.replies.map(this.#replyInfo),
    };
  }

  #proposalInfo(p: Proposal): ProposalInfo {
    const { votes, ...t } = p.tally;
    const mine = votes.get(this.identity.author);
    return {
      id: p.id,
      short: p.id.slice(0, 8),
      by: this.#actor(p.author, p.signer),
      title: p.title,
      text: p.text,
      deadline: p.deadline,
      time: p.time,
      ...t,
      ...(mine ? { myVote: { choice: mine.choice, ...(mine.via ? { via: this.#actor(mine.via, mine.via) } : {}) } } : {}),
      replies: p.replies.map(this.#replyInfo),
    };
  }

  #toItem({ event, inner, space, private: isPrivate }: Decoded): FeedItem {
    const item: FeedItem = {
      id: eventId(event),
      time: event.time,
      kind: inner.kind,
      scope: event.scope,
      body: inner.body,
      author: event.author,
      signer: event.signer,
      seq: event.seq,
    };
    const authorName = this.nameOf(event.author);
    if (authorName) item.authorName = authorName;
    const signerName = this.#agentName(event.signer, event.author);
    if (signerName) item.signerName = signerName;
    if (space) item.space = { id: space.id, kind: space.kind, name: this.#spaceName(space) };
    if (isPrivate) item.private = true;
    return item;
  }
}

const agentInfo = (agent: AgentKey): AgentInfo => ({ name: agent.name, did: agent.did, permissions: agent.permissions });

/** This computer's name, for naming its device key. */
const deviceName = (): string => hostname().slice(0, 40) || 'device';

/** Automatic grants (free tiers) don't run out in practice. */
const FREE_TIER_MONTHS = 1200;

/** Contacts and free tiers an app ships with for newcomers (see weave.bundle.json). */
export interface Bundle {
  contacts?: string[];
  tiers?: Array<{ tier: string; creator: Did; note?: string }>;
}

/** The start of a Markdown text as one plain line, for shares and older clients. */
function summary(markdown: string, max = 300): string {
  const plain = markdown
    .replace(/<[^>]*>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#*_>`~|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
}
