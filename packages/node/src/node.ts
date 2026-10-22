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
  KIND_HISTORY,
  boardRulesOf,
  isDue,
  isFading,
  KIND_BOARD_RULE,
  KIND_POST_KEEP,
  lifetimeOf,
  overBudget,
  type BoardRule,
  type Lifetime,
  KIND_CARRY,
  KIND_SHRED,
  KIND_MANAGED,
  KIND_KMS,
  KIND_ATTEST,
  KIND_HOLD,
  KIND_AGENT_APPROVE,
  KIND_ESCROW,
  KIND_ESCROW_OPENED,
  KIND_LINK,
  KIND_ORG_CHAT,
  KIND_ORG_CONSOLE,
  KIND_ORG_DONE,
  KIND_ORG_FREEZE,
  KIND_ORG_MAP,
  KIND_ORG_POLICY,
  KIND_ORG_SETTINGS,
  KIND_ORG_START,
  KIND_ORG_REQUEST,
  didFromPublicKey,
  generateKeyPair,
  boxTo,
  openBox,
  type Box,
  KIND_SIGNIN,
  type ManagedSetting,
  HISTORIES,
  epochsToShare,
  type HistorySetting,
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
  classOf,
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
  spaceTopics,
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
  type KeyPair,
  type WeaveEvent,
  type WeaveRecord,
  eventId,
  recordOfV1,
  keepStreamId,
  keepTag,
  keepWrapKey,
  unwrapFromKeeper,
  wrapForKeeper,
  recordOfV2,
  canonicalIdV2,
  isWireItemV2,
  type WireItemV2,
  type EventV2,
  signEventV2,
  KIND_IDENTITY,
  KIND_ROTATE,
  type LogStore,
  checkTextFields,
  KEY_KINDS,
  compareVersions,
  formatVersion,
  parseVersion,
  TEXT_LIMITS,
  tooLong,
} from '@weave/core';
import { roomKeyPair, SwarmNode, type HeldSpace, type KeepAccess, type SpaceAccess } from '@weave/net';
import {
  HOME_SOURCES,
  PROJECT_STATUSES,
  type Actor,
  type Admission,
  type AgentInfo,
  type AppEnv,
  type AppLaunchInfo,
  type AppPerson,
  type UpdateInfo,
  type Backend,
  type BoardInfo,
  type ChatInfo,
  type CoauthorRequest,
  type GitHubInfo,
  type HarnessInfo,
  type PermissionRequest,
  type AppOpen,
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
  type KeepersInfo,
  type AuditLine,
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
  type CompanyInfo,
  type CreateCompanyInput,
  type LinkInfo,
  type ScimInfo,
  type ConsoleInfo,
  type AuditStreamInfo,
  type ExportLine,
  noAgent,
} from './backend.ts';
import { loadConfig, saveConfig, type Config } from './config.ts';
import { FileStore } from './filestore.ts';
import { openStore, type SqliteStore } from './sqlitestore.ts';
import { readJson, resolveHome, writeJson, type Home } from './home.ts';
import { readSecretJson, vaultOf, writeSecretJson } from './vault.ts';
import { providerFor, type KeyProvider, type ProviderSpec, type VaultCredentials } from './keyproviders.ts';
import { entryState, harnessesIn, writeEntry, type McpLaunch } from './harnesses.ts';
import { guessPlatform, platformKey, saveVerified, tagFolder, unpack } from './appinstall.ts';
import { checkGistProof, DEFAULT_GITHUB_APP, finishDeviceFlow, GitHub, GITHUB_CLIENT_ID, githubInstallUrl, lookUpGitHubApp, type GitHubApp, startDeviceFlow, type DeviceCode, type Fetch, type ReleaseAsset } from './github.ts';
import { createHash, createPublicKey, createVerify, hkdfSync } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join as joinPath, resolve as resolvePath } from 'node:path';
import { homedir, hostname } from 'node:os';
import { LiveRooms, portOpen } from './live.ts';
import { createAndSaveAgent, loadAgents, saveAgent, loadEncryptionKeys, loadIdentity, saveDevice, saveEncryptionKeys, type AgentKey, type EncryptionKey } from './keystore.ts';
import { acquireLock } from './lock.ts';
import { emptyDirectory, findPerson, groupsOf, hashToken, newScimToken, scimHandle, startScimServer, tokenMatches, type ScimDirectory, type ScimRequest, type ScimResponse } from './scim.ts';
import { checkAuthority, checkDevice, deviceProof } from './devices.ts';
import { machinePolicy } from './machine.ts';
import { startConsole } from './console.ts';
import { newSink, sendLines, sinkTarget, type AuditSink, type AuditSinkInput, type StreamedLine } from './auditsinks.ts';
import {
  decodeEnrollment,
  decodeRecoveryAnswer,
  decodeRecoveryRequest,
  encodeEnrollment,
  encodeRecoveryAnswer,
  encodeRecoveryRequest,
  nameFromToken,
  orgState,
  readPolicy,
  type CompanyAction,
  type CompanyPolicy,
  type Retention,
  type Enrolling,
  type MapRole,
  type OrgState,
} from './company.ts';
import { BlobStore } from './blobstore.ts';
import { AppProcesses, launchFingerprint } from './applaunch.ts';
import { AppApiError, sameToken, startAppApi, type AppApiServer } from './appapi.ts';
import { RemoteAccess } from './remote.ts';
import { checkGumroadLicense, type LicenseCheck, type LicenseChecker } from './gumroad.ts';
import { loadSpaces, removeSpace, saveSpace, type StoredSpace } from './spacestore.ts';
import { KIND_THEME, sanitizeTheme, type Theme } from './theme.ts';

/** What a company account may always sign, whatever its company's policy: itself, its keys, its name, leaving, links (they have their own switch), blocking and muting. */
const ALWAYS_ALLOWED = new Set<string>([KIND_IDENTITY, KIND_ROTATE, 'weave.delegate', 'weave.revoke', KIND_ORG_FREEZE, 'weave.profile', KIND_THEME, KIND_LINK, KIND_LEAVE, KIND_BLOCK, KIND_MUTE, KIND_REKEY]);
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
  event: WeaveRecord;
  /** Restated in a carry, not decoded from the event itself (see #expandCarry). */
  carried?: true;
  /** The event's id (a re-signed event's old v1 id), as stored. */
  id: string;
  inner: Inner;
  space?: StoredSpace;
  /** For events of a read-limited board: which board (they were sealed with its key). */
  board?: string;
  private?: true;
}

/** The order replica.events() returns: claimed time, then signer, then seq. */
const replicaOrder = (a: WeaveRecord, b: WeaveRecord): number => a.time.localeCompare(b.time) || a.signer.localeCompare(b.signer) || a.seq - b.seq;

/** Stage 4: how long everyone online holds a pulled space's content, how long what you open stays kept, and how many hold each event by share. */
const RECENT_HOLD_MS = 14 * 24 * 3600 * 1000;
/** What you opened (id → when) and the stretches of time you asked members for. */
interface KeptState {
  ids: Record<string, string>;
  ranges: Array<{ space: string; since: string; until: string; at: string }>;
}
const KEEP_READ_MS = 30 * 24 * 3600 * 1000;
const SHARE_HOLDERS = 3;

/** Stage 5: how many keep each small space, up to which size a space is kept, when a keeper counts as gone, and what we keep for others. */
const KEEPERS = 3;
const KEPT_UP_TO = 3;
const KEEPER_GONE_MS = 14 * 24 * 3600 * 1000;
const KEEP_QUOTA = 500 * 1024 * 1024;
const KEEP_STREAM_QUOTA = 50 * 1024 * 1024;
/** Our kept spaces and their keys, in our own space, for recovery. */
const KIND_KEEP_INDEX = 'weave.keep.index';
interface KeepState {
  spaces: Record<string, Did[]>;
  seen: Record<string, string>;
  /** Hash of the last keep index written. */
  index: string;
}

/**
 * An OIDC ID token, checked against its issuer: the signature with the
 * issuer's published keys (RS256), the issuer, the audience, the expiry.
 * Returns its claims, or throws.
 */
export async function verifyIdToken(token: string, issuer: string, audience: string): Promise<{ sub: string; email?: string; groups: string[] }> {
  const [h, b, sig] = token.split('.');
  if (!h || !b || !sig) throw new Error('not a token');
  const header = JSON.parse(Buffer.from(h, 'base64url').toString()) as { alg?: string; kid?: string };
  if (header.alg !== 'RS256') throw new Error(`unsupported token algorithm ${header.alg}`);
  const discovery = (await (await fetch(`${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`)).json()) as { jwks_uri: string };
  const { keys } = (await (await fetch(discovery.jwks_uri)).json()) as { keys: Array<Record<string, unknown> & { kid?: string }> };
  const jwk = keys.find((k) => !header.kid || k.kid === header.kid);
  if (!jwk) throw new Error('unknown signing key');
  if (!createVerify('RSA-SHA256').update(`${h}.${b}`).verify(createPublicKey({ key: jwk as never, format: 'jwk' }), Buffer.from(sig, 'base64url'))) throw new Error('bad signature');
  const claims = JSON.parse(Buffer.from(b, 'base64url').toString()) as { iss?: string; aud?: string | string[]; exp?: number; sub?: string; email?: string; groups?: unknown };
  if (claims.iss !== issuer) throw new Error('wrong issuer');
  if (!(Array.isArray(claims.aud) ? claims.aud : [claims.aud]).includes(audience)) throw new Error('wrong audience');
  if (!claims.exp || claims.exp * 1000 < Date.now()) throw new Error('expired');
  if (!claims.sub) throw new Error('no subject');
  return { sub: claims.sub, ...(claims.email ? { email: claims.email } : {}), groups: Array.isArray(claims.groups) ? claims.groups.filter((g): g is string => typeof g === 'string') : [] };
}

/** Stage 8: live content per author per space and hour, by how far this node trusts them there. */
const DAY_MS = 24 * 3600 * 1000;
const BUDGETS = {
  trusted: { events: 1200, bytes: 10 * 1024 * 1024 },
  member: { events: 300, bytes: 2 * 1024 * 1024 },
  newcomer: { events: 60, bytes: 512 * 1024 },
};

/** For the audit: what an event says, without keys, boxes, wrapped parts or ciphertext. */
const SECRET_FIELDS = new Set(['boxes', 'box', 'wrapped', 'ct', 'nonce', 'key', 'keys', 'secret', 'boards']);
function withoutSecrets(value: Json): Json {
  if (Array.isArray(value)) return value.map(withoutSecrets);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([k]) => !SECRET_FIELDS.has(k)).map(([k, v]) => [k, withoutSecrets(v as Json)]));
  return value;
}

/** An event as a carry restates it: its id, who wrote it when, and what it said. */
const carriedItem = (d: { id: string; event: { author: Did; signer: Did; seq: number; time: string }; inner: { kind: string; body: Json } }) => ({
  id: d.id,
  author: d.event.author,
  signer: d.event.signer,
  seq: d.event.seq,
  time: d.event.time,
  kind: d.inner.kind,
  body: d.inner.body,
});

/** Content kinds that are a space's latest state, restated for newcomers along with its control events (see #carry). */
const CARRIED_STATE = new Set(['weave.project.page', 'weave.app', 'weave.channel', 'weave.curate', 'weave.theme']);

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
  /** The event store, when it is weave.db (closed with the node). */
  #sqlite?: SqliteStore;
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
  /** Bumped whenever the decoded events change (an event added, or a rebuild): what caches of them key on. */
  #decodedRevision = 0;
  /** Bumped when everything is decoded again; per-space caches from before don't count then. */
  #decodedGeneration = 0;
  /** The decoded events of each space, in replica order, kept with #decoded. */
  #bySpace = new Map<string, Decoded[]>();
  /** Bumped when an event of that space is added. */
  #spaceRevision = new Map<string, number>();
  /** Each person's own valid events (see #eventsOf), until they write again or keys change. */
  #personEvents = new Map<Did, WeaveRecord[]>();
  /** Results computed from all decoded events, valid until the decoded events change. */
  #memos = new Map<string, { revision: number; value: unknown }>();
  /** Bumped when a control event of that space is added (members, roles, keys, rules): all that its state depends on. */
  #controlRevision = new Map<string, number>();
  /** Each space's state, valid while generation and control revision hold: chat and posts leave it alone. */
  #stateCache = new Map<string, { key: string; state: SpaceState }>();
  /** Entries and access of each space, valid while generation and space revision hold. */
  #spaceCache = new Map<string, { key: string; entries?: Entry[]; access?: Access; accessFor?: SpaceState }>();
  /** Direct chats, derived (never stored) for everyone whose log this node holds: space id → space and the other person. */
  #directs = new Map<string, { space: StoredSpace; peer: Did }>();
  #directByPeer = new Map<Did, StoredSpace>();
  #contactCache?: { from: number; map: Map<Did, string | undefined> };
  /** Board-key events already looked at, so each box is tried once. */
  #boardKeysSeen = new Set<string>();

  private constructor(home: Home, identity: SigningIdentity) {
    this.home = home;
    this.#identity = identity;
    // Homes from before separate encryption keys use the root key for encryption.
    const stored = loadEncryptionKeys(home);
    this.#encryption = stored.length ? stored : [{ did: identity.did, keys: identity.keys }];
    this.#releaseLock = acquireLock(home);
    this.replica = new Replica(this.#openStore(home));
    this.blobs = new BlobStore(home.blobs);
    this.config = loadConfig(home);
    this.#agents = loadAgents(home);
    // Secrets read only now and then (tokens, pairings) are sealed right away, not when first needed.
    for (const file of [this.#githubFile, this.#appSettingsFile, joinPath(home.dir, 'remote.json')]) readSecretJson(home, file);
    for (const space of loadSpaces(home)) this.#spaces.set(space.id, space);

    // Pick up keys handed to us — new epochs and whole spaces — now and whenever they arrive.
    const isKeys = (e: WeaveRecord) => canonicalKind(e.kind) === KIND_REKEY || e.kind === KIND_GIFT;
    for (const event of this.replica.events(isKeys)) this.#takeKeys(event);
    this.replica.admit = this.#admit;
    this.replica.onAppend((event) => {
      const scoped = event.kind === KIND_SEALED && !event.missing ? (parseScope(event.scope)?.id ?? '') : '';
      const kept = scoped ? this.#rawCache.get(scoped) : undefined;
      const space = scoped ? (this.#spaces.get(scoped) ?? this.#directs.get(scoped)?.space) : undefined;
      // A company half or setting arriving changes which key opens what: decode again.
      if (kept && space && this.#takeRaw(space, kept, event)) this.#decoded = undefined;
      if (isKeys(event)) this.#takeKeys(event);
      this.#decodedAdd(event);
      // A new encryption key (mine or a peer's) adds an epoch to direct chats.
      if (event.kind === KIND_ROTATE) this.#forgetDirects();
      // Key events change whose events count for whom; anything else joins its author's list, in order.
      if (KEY_KINDS.has(event.kind)) this.#personEvents.clear();
      if (event.kind === KIND_ORG_FREEZE) this.#decoded = undefined;
      if (event.kind === KIND_ORG_POLICY && event.scope === 'public' && this.#policyCache) this.#takePolicy(event);
      else this.#personEventsAdd(event);
    });
  }

  /** Open a home. `migrate: false` leaves a home from before v0.4 as it is, for looking at it (and comparing). */
  static open(dir?: string, options: { migrate?: boolean } = {}): WeaveNode {
    const home = resolveHome(dir);
    const identity = loadIdentity(home);
    if (!identity) throw new Error(`no identity in ${home.dir} — run "weave init" first`);
    const node = new WeaveNode(home, identity);
    if (options.migrate !== false) node.#migrate();
    return node;
  }

  /** The key this node signs with: this device's (for old homes, the root key). */
  get identity(): SigningIdentity {
    return this.#identity;
  }

  /** Create a new identity in an empty home and publish a profile with the given name. The recovery words are dropped: for tests and demos. */
  static init(name: string, dir?: string, options: { writeVersion?: 1 | 2 } = {}): WeaveNode {
    return WeaveNode.create(name, dir, options).node;
  }

  /**
   * Create a new identity in an empty home. Returns the 24 recovery words: they
   * are shown once and never stored, and every root and encryption key is
   * derived from them. The root signs the identity record (committing to the
   * next root) and this device's key; after that, only the device key is on disk.
   * `writeVersion: 1` writes as v0.3 did, for tests that need an older home.
   */
  static create(name: string, dir?: string, options: { writeVersion?: 1 | 2; org?: Did } = {}): { node: WeaveNode; words: string } {
    const home = resolveHome(dir);
    if (loadIdentity(home)) throw new Error(`an identity already exists in ${home.dir}`);
    const managed = machinePolicy();
    if (managed.companyOnly && !options.org) throw new Error('this computer is managed by a company: only company accounts are set up here (weave enroll)');
    if (options.org && managed.companies?.length && !managed.companies.includes(options.org)) throw new Error("this computer is managed by another company: its accounts aren't set up here");
    const words = newRecoveryWords();
    const root = recoveryRoot(words, 0);
    const person: SigningIdentity = { author: root.did, did: root.did, keys: root };
    const device = createSubKey(root.did);
    const enc = recoveryEncryptionKey(words, 0);
    saveEncryptionKeys(home, [{ did: enc.did, keys: enc }]);
    saveDevice(home, device);
    const node = WeaveNode.open(home.dir);
    if (options.writeVersion) node.replica.writeVersion = options.writeVersion;
    node.replica.append(person, inception(recoveryRoot(words, 1).did, enc.did, options.org));
    node.replica.append(person, delegation(device.did, 'device', ['*'], deviceName()));
    node.replica.write(node.identity, { kind: KIND_PROFILE, body: { name } });
    return { node, words };
  }

  /**
   * Set up this computer as a new device of an existing identity, from its
   * recovery words. The identity's events must reach this node first (from
   * `events`, or from peers while it waits online), so it knows which root and
   * encryption key are current.
   */
  static async restore(words: string, dir?: string, options: { events?: unknown[]; online?: boolean; timeoutMs?: number } = {}): Promise<WeaveNode> {
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
    const managed = machinePolicy();
    if ((managed.companyOnly && !state.org) || (state.org && managed.companies?.length && !managed.companies.includes(state.org))) {
      await node.close();
      rmSync(joinPath(home.dir, 'keys'), { recursive: true, force: true });
      throw new Error('this computer is managed by a company: only its company accounts are set up here');
    }
    const rootIndex = findRecoveryIndex(clean, state.root, 'root');
    const encIndex = findRecoveryIndex(clean, state.enc, 'enc');
    if (rootIndex === undefined || encIndex === undefined) throw new Error("these words don't match this identity's current keys");
    node.#saveEncryption(Array.from({ length: encIndex + 1 }, (_, i) => recoveryEncryptionKey(clean, i)).map((k) => ({ did: k.did, keys: k })));
    const root = recoveryRoot(clean, rootIndex);
    node.replica.append({ author, did: root.did, keys: root }, delegation(device.did, 'device', ['*'], deviceName()));
    return node;
  }

  /**
   * Set up a company account from an enrollment link (stage 10): a new
   * identity that names the company in its first record, in the company group,
   * signed in with the person's company sign-in. The recovery words are never
   * shown: they're kept sealed here until they're left with the company, then
   * deleted (see #continueEnrollment). The app's bundle isn't applied; the
   * company's starting setup is.
   */
  static async enroll(link: string, dir: string | undefined, options: { idToken: string; name?: string }): Promise<WeaveNode> {
    const enrollment = decodeEnrollment(link);
    const name = options.name?.trim() || nameFromToken(options.idToken) || 'New colleague';
    const { node, words } = WeaveNode.create(name, dir, { org: enrollment.company });
    await node.addContact(encodeContact({ v: 1, did: enrollment.company, name: enrollment.name, entry: enrollment.entry }));
    // The company group is under the company's key service: the join is written once it unlocks (see #continueEnrollment).
    const { invite } = await node.#takeInvite(enrollment.invite);
    writeSecretJson(node.home, node.#enrollFile, { group: enrollment.group, invite, words, idToken: options.idToken } satisfies Enrolling);
    await node.#continueEnrollment();
    return node;
  }

  /** A new computer asks for a company-owned identity's recovery: a key here, kept sealed; the request names it. */
  static recoveryRequest(dir?: string): string {
    const home = resolveHome(dir);
    if (loadIdentity(home)) throw new Error(`an identity already exists in ${home.dir}`);
    const keys = generateKeyPair();
    writeSecretJson(home, joinPath(home.dir, 'recover.json'), { secretKey: b64u.encode(keys.secretKey), publicKey: b64u.encode(keys.publicKey) });
    return encodeRecoveryRequest(didFromPublicKey(keys.publicKey));
  }

  /** Set up this computer from the company's answer to its recovery request: the words open here and are never shown. */
  static async recover(answer: string, dir?: string, options: { events?: unknown[]; online?: boolean; timeoutMs?: number } = {}): Promise<WeaveNode> {
    const home = resolveHome(dir);
    const file = joinPath(home.dir, 'recover.json');
    const kept = readSecretJson<{ secretKey: string; publicKey: string }>(home, file);
    if (!kept) throw new Error('no recovery request on this computer: run weave recover-request first');
    const { box } = decodeRecoveryAnswer(answer);
    let words: string;
    try {
      words = (openBox(b64u.decode(kept.secretKey), b64u.decode(kept.publicKey), box as unknown as Box) as { words: string }).words;
    } catch {
      throw new Error("this answer is for another computer's request");
    }
    const node = await WeaveNode.restore(words, dir, options);
    rmSync(file, { force: true });
    return node;
  }


  get online(): boolean {
    return this.#swarm !== undefined;
  }

  /** Every DHT topic this node listens on: its identity, configured topics, its spaces and their entry points. */
  get topics(): string[] {
    const topics = new Set([this.identity.author, ...this.config.topics]);
    for (const space of this.#spaces.values()) {
      for (const topic of spaceTopics(space)) topics.add(topic);
      for (const topic of space.entry.topics) topics.add(topic);
    }
    for (const friend of this.#friends()) for (const topic of spaceTopics(this.#direct(friend))) topics.add(topic);
    return [...topics];
  }

  /** Connect to peers and join all topics. */
  async goOnline(): Promise<void> {
    if (this.#swarm) return;
    this.#swarm = new SwarmNode(this.replica, this.config.bootstrap.length ? { bootstrap: this.config.bootstrap } : {}, this.blobs, this.sessionAccess());
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
    await this.#scimServer?.close();
    this.#scimServer = undefined;
    await this.#console?.close();
    this.#console = undefined;
    await this.goOffline();
    this.#sqlite?.close();
    this.#releaseLock();
  }

  /** weave.db, taking over an older home's JSON-lines logs once; those logs as they are if that fails. */
  #openStore(home: Home): LogStore {
    try {
      const { store, imported, warning } = openStore(home);
      if (imported) console.error(`weave: moved ${imported} events from logs/ into weave.db (logs/ kept as logs.v1-imported)`);
      if (warning) console.error(`weave: ${warning}`);
      this.#sqlite = store;
      return store;
    } catch (error) {
      console.error(`weave: couldn't open weave.db, using logs/ as before: ${(error as Error).message}`);
      return new FileStore(home.logs);
    }
  }

  async whoami(): Promise<Whoami> {
    const org = this.replica.authority.keys(this.identity.author).org;
    return { did: this.identity.author, name: this.nameOf(this.identity.author), ...(org ? { company: { did: org, name: this.nameOf(org) } } : {}), agents: this.#agents.map(agentInfo), signer: this.identity.did };
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
    if (space && input.as && this.#state(space).managed && !this.#state(space).approvedAgents?.has(signer.did))
      throw new Error(`agent "${input.as}" isn't approved in ${space.name}: those who manage it can approve it (weave approve-agent "${space.name}" ${this.nameOf(this.identity.author) ?? this.identity.author}/${input.as})`);
    if (space?.kind === 'project') inner = this.#forBoard(space, inner);
    const fields: EventFields = space ? sealFor(this.#cipher(space), inner) : inner;
    const event = this.replica.write(signer, fields);
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
    this.replica.write(this.identity, delegation(agent.did, 'agent', permissions, name));
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
    const signers = this.replica.signers();
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
      logs: signers.length,
      events: signers.reduce((sum, signer) => sum + this.replica.number(signer), 0),
      pending: this.replica.pendingCount,
      heldBack: this.#heldBack,
      keystore: vaultOf(this.home).keystore,
      ...(vaultOf(this.home).warning ? { keystoreWarning: vaultOf(this.home).warning } : {}),
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
    await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
    this.#liveListeners.delete(onLive);
    this.#openListeners.delete(onOpen);
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
    if (input.description) this.replica.write(this.identity, sealFor(this.#cipher(project), { kind: KIND_PAGE, body: { ...DEFAULT_PAGE, body: input.description, description: summary(input.description) } }));
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
    this.replica.write(this.identity, sealFor(this.#cipher(space), { kind: KIND_INVITE, body }));
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
    return encodeInvite({ v: 2, space: this.#keysForNewcomers(space), invite, inviter: this.identity.author, expires, entry: this.#entryPoint(), ...(boardKeys ? { boards: boardKeys } : {}) });
  }

  async joinSpace(text: string, note?: string): Promise<SpaceInfo> {
    if (isKnockLink(text)) return this.#knock(text, note ?? '');
    const { space, invite } = await this.#takeInvite(text);
    this.replica.write(this.identity, sealFor(this.#cipher(space), { kind: KIND_JOIN, body: { invite } }));
    return this.#spaceInfo(space);
  }

  /** An invite's space and keys, kept here; the join itself is written by the caller. */
  async #takeInvite(text: string): Promise<{ space: StoredSpace; invite: string }> {
    const invite = decodeInvite(text);
    if (this.#spaces.has(invite.space.id)) throw new Error(`you are already in ${invite.space.name}`);
    const inside = this.#insideOnly(invite.space.founder);
    if (inside) throw new Error(inside);
    this.#adoptBootstrap(invite.entry);
    const space: StoredSpace = { ...invite.space, entry: invite.entry, via: invite.inviter, ...(invite.boards ? { boards: invite.boards } : {}) };
    await this.#addSpace(space);
    return { space, invite: invite.invite };
  }

  /** Ask to be let in with a link that needs the inviter's OK. */
  async #knock(text: string, note: string): Promise<SpaceInfo> {
    const link = decodeKnock(text);
    if (this.#spaces.has(link.space.id)) throw new Error(`you are already in ${link.space.name}`);
    if (link.inviter === this.identity.author) throw new Error("that's your own link");
    this.#adoptBootstrap(link.entry);
    for (const topic of new Set([link.inviter, ...link.entry.topics])) await this.join(topic);
    this.replica.write(this.identity, this.#sealForSelf({ kind: KIND_KNOCK_PENDING, body: { space: link.space.id, inviter: link.inviter } }));
    this.replica.write(this.identity, knockFor(link, note.trim(), this.#entryPoint()));
    return { id: link.space.id, kind: link.space.kind, name: link.space.name, founder: link.space.founder, founderName: this.nameOf(link.space.founder), members: 0, epoch: 0, history: 'all', waiting: true };
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
      this.replica.write(this.identity, sealFor(this.#cipher(space), { kind: KIND_ADMIT, body: { member, invite } }));
      const boardKeys = this.#boardKeysFor(space, rights);
      this.replica.write(this.identity, gift({ ...this.#keysForNewcomers(space), ...(boardKeys ? { boards: boardKeys } : {}) } as typeof space, [member], spaceScope(this.#direct(member)), this.#entryPoint(), this.#encryptionKeyOf));
    }
    this.replica.write(this.identity, this.#sealForSelf({ kind: KIND_KNOCK_HANDLED, body: { knock: id } }));
  }

  /** Knocks with my live links that I haven't answered and whose senders aren't in yet. */
  #openKnocks(): Array<{ id: string; event: WeaveRecord; space: StoredSpace; invite: string; note: string; rights: BoardRight[] }> {
    const handled = new Set(this.#selfBodies(KIND_KNOCK_HANDLED).map((b) => b.knock));
    const out: Array<{ id: string; event: WeaveRecord; space: StoredSpace; invite: string; note: string; rights: BoardRight[] }> = [];
    for (const event of this.replica.events((e) => e.kind === KIND_KNOCK && e.author !== this.identity.author)) {
      const id = event.id;
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
    const { entry: _entry, boards: _boards, via: _via, shredded: _shredded, ...keys } = space;
    return keys;
  }

  /**
   * A space's keys for newcomers, as its history setting allows: every epoch,
   * those of the last 30 days, or (joining) a fresh one made for them. A `30d`
   * space whose key is older than 30 days gets a new one first, so what
   * newcomers read stays near 30 days. Rotating is for those who manage the
   * space (only their new keys count).
   */
  #keysForNewcomers(space: StoredSpace): SpaceKeys {
    const state = this.#state(space);
    const history = state.history?.value ?? 'all';
    const starts = this.#epochStarts(space);
    const current = currentEpoch(space);
    const old = (starts.get(current) ?? '') < new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    // Only a manager's new key counts for the others; a group member inviting hands over what the setting allows without one.
    if (canManage(state, this.identity.author) && (history === 'joining' || (history === '30d' && old))) {
      this.#rotateKey(space);
      starts.set(currentEpoch(space), new Date().toISOString());
    }
    const keys = this.#keysOnly(space);
    const share = new Set(epochsToShare(space, history, starts).map(String));
    if (share.size < Object.keys(keys.keys).length) this.#carry(space, share);
    return { ...keys, keys: Object.fromEntries(Object.entries(keys.keys).filter(([epoch]) => share.has(epoch))) };
  }

  /**
   * Restate under the current key what newcomers need of the epochs they don't
   * get: the space's control events (members, roles, boards, rules, keys of
   * boards) and its latest state (page, app, channels, curation, theme), with
   * their original ids, authors and times.
   */
  #carry(space: StoredSpace, shared: Set<string>): void {
    const events = this.#decodedIn(space.id)
      .filter((d) => (classOf(canonicalKind(d.inner.kind)) === 'control' || CARRIED_STATE.has(d.inner.kind)) && d.inner.kind !== KIND_CARRY && !d.board)
      .filter((d) => !shared.has(String((d.event.body as { epoch?: unknown } | null)?.epoch ?? '')))
      .map(carriedItem);
    if (events.length) this.replica.write(this.identity, sealFor(this.#cipher(space), { kind: KIND_CARRY, body: { events: events as unknown as Json } }));
  }

  /**
   * A carry becomes the events it restates (see #trustedCarries for whose).
   */
  #expandCarry(d: Decoded, space: StoredSpace | undefined = d.space as StoredSpace | undefined): Decoded[] {
    if (d.inner.kind !== KIND_CARRY || !space) return [];
    const items = (d.inner.body as { events?: unknown } | null)?.events;
    if (!Array.isArray(items)) return [];
    const out: Decoded[] = [];
    for (const item of items as Array<Record<string, unknown>>) {
      if (typeof item?.id !== 'string' || !isDid(item.author) || !isDid(item.signer) || typeof item.time !== 'string' || typeof item.kind !== 'string' || !Number.isSafeInteger(item.seq)) continue;
      const event: WeaveRecord = { ...d.event, id: item.id, author: item.author, signer: item.signer, seq: item.seq as number, time: item.time, body: null };
      out.push({ id: item.id, event, inner: { kind: item.kind, body: (item.body ?? null) as Json }, space, carried: true, ...(d.board ? { board: d.board } : {}) });
    }
    return out;
  }

  /**
   * The events restated in the carries we trust: from whoever handed us a
   * space's keys (a newcomer trusts them for the keys already), from someone
   * who manages the space by the state we read ourselves (never by what a
   * carry says), and our own private ones (what we wrote, kept before keys
   * were shredded).
   */
  #trustedCarries(decoded: Decoded[]): Decoded[] {
    const carries = decoded.filter((d) => d.inner.kind === KIND_CARRY);
    if (!carries.length) return [];
    const states = new Map<string, SpaceState>();
    const stateOf = (space: StoredSpace) => {
      let state = states.get(space.id);
      if (!state) {
        state = spaceState(space.kind, space.founder, decoded.filter((d) => d.space?.id === space.id && d.inner.kind !== KIND_CARRY));
        states.set(space.id, state);
      }
      return state;
    };
    return carries.flatMap((d) => {
      if (d.private) {
        // Our own: {space, events} kept in our private space.
        const space = this.#spaces.get(String((d.inner.body as { space?: unknown } | null)?.space ?? ''));
        return d.event.author === this.identity.author && space ? this.#expandCarry(d, space) : [];
      }
      const space = d.space as StoredSpace | undefined;
      if (!space) return [];
      const trusted = d.event.author === space.via || canManage(stateOf(space), d.event.author);
      return trusted ? this.#expandCarry(d, space) : [];
    });
  }

  /** In managed spaces, what agent keys signed counts only if those who manage the space approved them (stage 9). */
  #approvedOnly(decoded: Decoded[]): Decoded[] {
    const approved = new Map<string, Set<Did>>();
    const of = (space: StoredSpace) => {
      let set = approved.get(space.id);
      if (!set) {
        set = spaceState(space.kind, space.founder, decoded.filter((d) => d.space?.id === space.id)).approvedAgents ?? new Set();
        approved.set(space.id, set);
      }
      return set;
    };
    return decoded.filter((d) => {
      const space = d.space as StoredSpace | undefined;
      if (!space || d.event.signer === d.event.author || this.replica.authority.grant(d.event.signer)?.role !== 'agent') return true;
      return !this.#managedRaw(space).setting || of(space).has(d.event.signer);
    });
  }

  /** One new event: does it count, by the space's state as known (see #approvedOnly)? */
  #agentCounts(d: Decoded): boolean {
    const space = d.space as StoredSpace | undefined;
    if (!space || d.event.signer === d.event.author || this.replica.authority.grant(d.event.signer)?.role !== 'agent' || !this.#managedRaw(space).setting) return true;
    return !!this.#state(space).approvedAgents?.has(d.event.signer);
  }

  // ---------------------------------------------------------------- audit (stage 9.3)

  async audit(input: { space: string; since?: string }): Promise<AuditLine[]> {
    const space = this.#space(input.space);
    const since = input.since ? new Date(input.since).toISOString() : '';
    const scope = spaceScope(space);
    const lines: AuditLine[] = [];
    const line = (time: string, kind: string, author: Did, signer: Did, detail: Json, id: string): AuditLine => {
      const agent = this.#agentName(signer, author);
      const name = this.nameOf(author);
      return { id, time, kind, by: author, ...(name ? { byName: name } : {}), signer, ...(agent ? { agent } : {}), detail: withoutSecrets(detail) };
    };
    // Governance: control events, and the company's own (attestations, escrows).
    for (const d of this.#decodedIn(space.id)) {
      // Carried events count: after a shred they are the only record left (decoding counts each once).
      if (d.event.time < since) continue;
      if (classOf(canonicalKind(d.inner.kind)) !== 'control' && d.inner.kind !== KIND_ESCROW_OPENED && d.inner.kind !== KIND_POST_DELETE) continue;
      lines.push(line(d.event.time, d.inner.kind, d.event.author, d.event.signer, d.inner.body, d.id));
    }
    // New keys: who rotated, which epoch (the boxes stay out).
    for (const r of this.replica.events((e) => e.scope === scope && canonicalKind(e.kind) === KIND_REKEY && e.time >= since)) {
      lines.push(line(r.time, KIND_REKEY, r.author, r.signer, { epoch: (r.body as { epoch?: Json } | null)?.epoch ?? null }, r.id));
    }
    return lines.sort((a, b) => a.time.localeCompare(b.time));
  }

  // ---------------------------------------------------------------- escrowed recovery (stage 9.2)

  /** What the key service binds an escrow to: the space and the person. */
  #escrowContext(space: StoredSpace, person: Did) {
    return { space: `${spaceScope(space)}/escrow/${person}`, epoch: 0 };
  }

  async escrowRecovery(input: { space: string; words: string }): Promise<void> {
    const space = this.#space(input.space);
    const setting = this.#state(space).managed;
    if (!setting) throw new Error(`${space.name} isn't a company space: recovery words stay with you`);
    const words = normalizeWords(input.words);
    if (recoveryIdentity(words) !== this.identity.author) throw new Error("these words don't belong to this identity");
    // The words are sealed with a fresh key; only that key goes through the key service (some can wrap only a key's worth).
    const dataKey = new Uint8Array(randomBytes(32));
    const context = this.#escrowContext(space, this.identity.author);
    const sealed = seal(dataKey, words, `weave/escrow/v1:${context.space}`);
    const wrapped = await this.#provider(setting).wrap(dataKey, context);
    this.replica.write(this.identity, sealFor(this.#cipher(space), { kind: KIND_ESCROW, body: { person: this.identity.author, wrapped, nonce: sealed.nonce, ct: sealed.ct } }));
  }

  async openEscrow(input: { space: string; person: string; for?: string }): Promise<string> {
    const space = this.#space(input.space);
    const state = this.#state(space);
    if (!state.managed) throw new Error(`${space.name} isn't a company space`);
    if (!canManage(state, this.identity.author)) throw new Error(`only those who manage ${space.name} open an escrow`);
    const person = this.resolve(input.person);
    const request = input.for ? decodeRecoveryRequest(input.for) : undefined;
    if (!request && this.replica.authority.keys(person).org)
      throw new Error(`${this.nameOf(person) ?? person}'s identity belongs to the company: its words go only to the new computer (there: weave recover-request; here: --for <request>)`);
    const escrow = this.#decodedIn(space.id)
      .filter((d) => d.inner.kind === KIND_ESCROW && d.event.author === person && (d.inner.body as { person?: unknown } | null)?.person === person)
      .at(-1)?.inner.body as { wrapped: string; nonce: string; ct: string } | undefined;
    if (!escrow) throw new Error(`${this.nameOf(person) ?? person} left no recovery words in ${space.name}`);
    const context = this.#escrowContext(space, person);
    const dataKey = await this.#provider(state.managed).unwrap(escrow.wrapped, context);
    const words = open(dataKey, { nonce: escrow.nonce, ct: escrow.ct }, `weave/escrow/v1:${context.space}`) as string;
    this.replica.write(this.identity, sealFor(this.#cipher(space), { kind: KIND_ESCROW_OPENED, body: { person, ...(request ? { for: request } : {}) } }));
    return request ? encodeRecoveryAnswer(person, boxTo(request, { words }) as unknown as Json) : words;
  }

  async approveAgent(input: { space: string; agent: string; on?: boolean }): Promise<SpaceInfo> {
    const space = this.#space(input.space);
    const state = this.#state(space);
    if (!state.managed) throw new Error(`${space.name} isn't a company space: agents act wherever their person lets them`);
    if (!canManage(state, this.identity.author)) throw new Error(`only those who manage ${space.name} approve agents there`);
    this.replica.write(this.identity, sealFor(this.#cipher(space), { kind: KIND_AGENT_APPROVE, body: { agent: this.#agentKey(input.agent), on: input.on !== false } }));
    return this.#spaceInfo(space);
  }

  /** An agent key from `person/agent` (a person's name or id, the agent's name) or the key itself. */
  #agentKey(ref: string): Did {
    if (isDid(ref) && this.replica.authority.grant(ref)?.role === 'agent') return ref;
    const at = ref.lastIndexOf('/');
    if (at > 0) {
      const person = this.resolve(ref.slice(0, at));
      const grant = this.replica.authority.grantsOf(person).find((g) => g.role === 'agent' && g.name === ref.slice(at + 1));
      if (grant) return grant.subject;
    }
    throw new Error(`no agent "${ref}": name it as person/agent (e.g. Lena/claude) or by its key`);
  }

  async agentBlocked(agent: string): Promise<Array<{ id: string; name: string }>> {
    const key = this.#agents.find((a) => a.name === agent)?.did;
    if (!key) throw new Error(noAgent(agent, this.#agents.map((a) => a.name)));
    return [...this.#spaces.values()].filter((s) => this.#state(s).managed && !this.#state(s).approvedAgents?.has(key)).map((s) => ({ id: s.id, name: s.name }));
  }

  /** When each of a space's epochs began: the time of its rekey (the epoch number is in the clear). */
  #epochStarts(space: StoredSpace): Map<number, string> {
    const scope = spaceScope(space);
    const starts = new Map<number, string>();
    for (const e of this.replica.events((r) => canonicalKind(r.kind) === KIND_REKEY && r.scope === scope)) {
      const epoch = (e.body as { epoch?: unknown } | null)?.epoch;
      if (Number.isSafeInteger(epoch) && !starts.has(epoch as number)) starts.set(epoch as number, e.time);
    }
    return starts;
  }

  /** A space whose newcomers read the last 30 days gets a new key once its key is older than that, if we may rotate it. */
  #rotateMonthly(space: StoredSpace): number {
    const state = this.#state(space);
    const forgets = (space.kind !== 'group' && [...boardRulesOf(this.#entries(space), this.#managers(state)).values()].some((r) => r.keepDays)) || !!this.#companyRetention(space)?.maxDays;
    if (space.kind === 'direct' || (state.history?.value !== '30d' && !forgets) || !canManage(state, this.identity.author)) return 0;
    const start = this.#epochStarts(space).get(currentEpoch(space)) ?? '';
    if (start >= new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()) return 0;
    this.#rotateKey(space);
    return 1;
  }

  /** A new key for a space, boxed to everyone in it. */
  #rotateKey(space: StoredSpace): void {
    const { fields, epoch, key } = rekey(space, [...this.#state(space).members.keys()], this.#encryptionKeyOf);
    space.keys[String(epoch)] = key;
    this.#saveSpace(space);
    this.replica.write(this.identity, fields);
    this.#afterRekey(space, epoch, key);
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
    const attested = state.managed?.attestor ? this.#attestations(space, state.managed.attestor) : new Map();
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
      ...(state.managed?.attestor && attested.get(m.did) ? { attested: (({ time: _time, ...a }) => a)(attested.get(m.did)!) } : {}),
      ...(this.replica.authority.keys(m.did).org ? { company: this.nameOf(this.replica.authority.keys(m.did).org!) ?? 'a company' } : {}),
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
    this.replica.write(this.identity, sealFor(this.#cipher(space), { kind: KIND_LEAVE, body: {} }));
    // Our node stops following it: keys gone, topics left. The space's history in the logs stays unreadable here.
    this.#spaces.delete(space.id);
    this.#decoded = undefined;
    removeSpace(this.home, space.id);
    this.#announceNow();
    for (const topic of spaceTopics(space)) await this.#swarm?.leave(topic).catch(() => {});
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
    this.replica.write(this.identity, sealFor(this.#cipher(space), { kind: KIND_HANDOVER, body: { to } }));
    return this.#spaceInfo(space);
  }

  async setHistory(input: { space: string; history: HistorySetting }): Promise<SpaceInfo> {
    const space = this.#space(input.space);
    const state = this.#state(space);
    if (space.kind === 'direct') throw new Error('a direct chat is between two people: there are no newcomers');
    if (!HISTORIES.includes(input.history)) throw new Error('history is all (everything), 30d (the last 30 days) or joining (from their invite on)');
    if (!canManage(state, this.identity.author)) throw new Error(space.kind === 'group' ? `only the owner of ${space.name} decides what newcomers read` : `only the ${space.kind === 'community' ? 'moderators' : 'maintainers'} of ${space.name} decide what newcomers read`);
    if ((state.history?.value ?? 'all') !== input.history) this.replica.write(this.identity, sealFor(this.#cipher(space), { kind: KIND_HISTORY, body: { history: input.history } }));
    return this.#spaceInfo(space);
  }

  async closeSpace(input: { space: string; closed: boolean }): Promise<SpaceInfo> {
    const space = this.#space(input.space);
    const state = this.#state(space);
    if (space.kind === 'direct') throw new Error("a direct chat can't be closed");
    if (!canManage(state, this.identity.author)) throw new Error(space.kind === 'group' ? `only the owner of ${space.name} can close it` : `only the ${space.kind === 'community' ? 'moderators' : 'maintainers'} of ${space.name} can close it`);
    if (!!state.closed === input.closed) return this.#spaceInfo(space);
    this.replica.write(this.identity, sealFor(this.#cipher(space), { kind: KIND_CLOSE, body: { closed: input.closed } }));
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
    this.replica.write(this.identity, fields);
    this.#afterRekey(space, epoch, key);
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
    this.replica.write(this.identity, sealFor(this.#cipher(space), { kind: KIND_REMOVE, body: { member } }));
    const remaining = [...state.members.keys()].filter((did) => did !== member);
    const { fields, epoch, key } = rekey(space, remaining, this.#encryptionKeyOf);
    space.keys[String(epoch)] = key;
    this.#saveSpace(space);
    this.replica.write(this.identity, fields);
    this.#afterRekey(space, epoch, key);
  }

  // ---------------------------------------------------------------- communities

  async createCommunity(input: { name: string; description?: string }): Promise<CommunityInfo> {
    const community = await this.#createSpace('community', input.name);
    if (input.description) this.replica.write(this.identity, sealFor(this.#cipher(community), { kind: KIND_PAGE, body: { description: input.description } }));
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
    this.replica.write(this.identity, sealFor(this.#cipher(community), { kind: KIND_PAGE, body: { description: input.description ?? '' } }));
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
    ref = postRefOf(ref ?? '');
    if (!ref || ref.length < 6) throw new Error('use at least 6 characters of the id');
    const matches = this.#allPosts().filter((p) => p.id.startsWith(ref));
    if (matches.length === 0) throw new Error(`no post found with id ${ref}`);
    if (matches.length > 1) throw new Error(`id ${ref} is ambiguous — use more characters`);
    const space = matches[0].space && this.#spaces.get(matches[0].space.id);
    if (space && this.#pulled(space)) {
      // Opened: kept for 30 days, like anything you read.
      this.#kept.ids[matches[0].id] = new Date(this.clock()).toISOString();
      this.#saveKept();
    }
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
    this.replica.write(this.identity, delegation(agent.did, 'agent', permissions, agent.name));
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

  async openInApp(input: { what: AppOpen['what']; space?: string; repo?: string }): Promise<AppOpen> {
    if (!['link-repo', 'space', 'inbox'].includes(input.what)) throw new Error('what is link-repo, space or inbox');
    const space = input.space ? this.#space(input.space) : undefined;
    if (input.what !== 'inbox' && !space) throw new Error('say which space');
    const repo = input.repo?.trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '');
    if (repo && !isRepoName(repo)) throw new Error('a repository looks like owner/name');
    const open: AppOpen = { what: input.what, ...(space ? { space: { id: space.id, kind: space.kind, name: space.name } } : {}), ...(repo ? { repo } : {}) };
    for (const listener of this.#openListeners) listener(open);
    return open;
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
      .map((d) => ({ id: d.id, event: d.event, kind: d.inner.kind, body: d.inner.body }));
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
    if (!this.#decodeAll().some((d) => d.inner.kind === KIND_POST && d.id === post.id)) throw new Error('only posts can be changed this way; this is an older thread');
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
    this.replica.write(this.identity, this.#sealForSelf({ kind: KIND_SAVE, body: { target: post.id, mode: input.mode } }));
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
    const forgetting = boardRulesOf(this.#entries(space), this.#managers(state));
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
          ...(forgetting.get(b.name) ? { rule: this.#ruleInfo(forgetting.get(b.name)!) } : {}),
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
    this.replica.write(this.identity, sealFor(this.#cipher(project), { kind: KIND_BOARD_ACCESS, body: { board: board.name, read: read as unknown as Json, write: write as unknown as Json } }));
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
    this.replica.write(this.identity, sealFor(this.#cipher(project), { kind: KIND_BOARD, body }));
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
    this.replica.write(this.identity, sealFor(this.#cipher(space), { kind: KIND_CURATE, body: { board: board.name, pinned } }));
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
    this.replica.write(this.identity, sealFor(this.#cipher(project), { kind: KIND_PROJECT_GROUP, body: { group: group.id, name: group.name, on: true } }));
    // Inviting the group is the consent for everyone in it right now.
    const newcomers = [...this.#state(group).members.keys()].filter((did) => !state.members.has(did));
    this.#admitAll(project, group, newcomers);
  }

  async uninviteGroup(input: { project: string; group: string }): Promise<void> {
    const project = this.#project(input.project);
    this.#maintainerState(project);
    const group = this.#knownGroup(project, input.group);
    this.replica.write(this.identity, sealFor(this.#cipher(project), { kind: KIND_PROJECT_GROUP, body: { group: group.id, name: group.name, on: false } }));
  }

  async setRule(input: { project: string; group: string; auto: boolean }): Promise<void> {
    const project = this.#project(input.project);
    this.#maintainerState(project);
    const group = this.#knownGroup(project, input.group);
    this.replica.write(this.identity, sealFor(this.#cipher(project), { kind: KIND_RULE, body: { group: group.id, auto: input.auto } }));
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
          this.replica.write(this.identity, sealFor(this.#cipher(other), { kind: KIND_RULE, body: { group: group.id, auto: true } }));
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
    this.replica.write(this.identity, sealFor(this.#cipher(project), { kind: KIND_DECLINE, body: { member: this.resolve(input.who), via: group.id } }));
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
    for (const space of [...this.#spaces.values()]) changed += this.#rotateMonthly(space);
    changed += this.#applyShreds();
    changed += this.#forget();
    changed += this.#release();
    for (const space of [...this.#spaces.values()]) if (this.#state(space).managed) await this.#unlock(space);
    // Company halves of new keys: published (or tried again) before anything else uses them.
    await Promise.all([...this.#halves.keys()].map((id) => this.#publishHalf(id)));
    changed += await this.#attest();
    changed += await this.#applyDirectory();
    changed += await this.#offboard();
    changed += await this.#orgDuties();
    changed += await this.#continueEnrollment();
    // Bookkeeping, not a change to anyone's spaces: the audit to the company's security tools.
    await this.#streamAudit();
    await Promise.all([...this.#halves.keys()].map((id) => this.#publishHalf(id)));
    // Bookkeeping for keepers, not a change to anyone's spaces.
    this.#writeKeepIndex();
    this.#recoverSpaces();
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
    const saved = readSecretJson<{ token?: string; login?: string }>(this.home, this.#githubFile);
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
        writeSecretJson(this.home, this.#githubFile, { token, login: user.login, id: user.id, connected: new Date(this.clock()).toISOString() });
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
      if (before) this.replica.write(this.identity, { kind: KIND_GITHUB_PUBLIC, body: { on: false } });
      return this.profile();
    }
    const auth = this.#githubAuth();
    if (!auth) throw new Error('connect GitHub first');
    // The proof: a public gist of this account naming this did. Made once, kept while the account stays the same.
    let gist = before && before.login.toLowerCase() === auth.login.toLowerCase() ? before.gist : undefined;
    if (!gist) gist = (await new GitHub(auth.token, this.githubSetup.fetch).createGist('Weave', 'weave.md', githubProofText(me, auth.login))).id;
    if (before?.gist === gist) return this.profile();
    this.replica.write(this.identity, { kind: KIND_GITHUB_PUBLIC, body: { login: auth.login, gist, on: true } });
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
          this.replica.write(this.identity, this.#sealForSelf({ kind: KIND_GITHUB_ADDED, body: { repo, login, on: true } }));
          changed++;
        }
        for (const { login, invitation } of plan.remove) {
          await client.remove(repo, login, invitation);
          this.replica.write(this.identity, this.#sealForSelf({ kind: KIND_GITHUB_ADDED, body: { repo, login, on: false } }));
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
    this.replica.write(this.identity, isPrivate ? this.#sealForSelf(inner) : inner);
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
      ...(this.replica.authority.keys(did).org ? { company: this.#companyOfPerson(did) } : {}),
      links: this.#linksOf(did).filter((l) => l.state === 'linked'),
    };
  }

  async setProfile(input: ProfileInput): Promise<Profile> {
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name || name.length > 40) throw new Error('names are 1 to 40 characters');
      if (name !== this.nameOf(this.identity.author)) this.replica.write(this.identity, { kind: KIND_PROFILE, body: { name } });
    }
    if (input.theme) {
      const theme = sanitizeTheme({ ...this.themeOf(this.identity.author), ...input.theme });
      this.replica.write(this.identity, { kind: KIND_THEME, body: { ...theme } });
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
      this.replica.write(this.identity, this.#sealForSelf({ kind: KIND_CONTACT, body: { did: contact.did, name: contact.name ?? null } }));
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

  // ---------------------------------------------------------------- updates

  async updateCheck(input: { current: string }): Promise<UpdateInfo> {
    const current = parseVersion(String(input?.current ?? ''));
    if (!current) throw new Error(`"${input?.current}" isn't a version like 0.3.0`);
    // A company's IT rolls out versions itself (managed settings): no prompts.
    if (machinePolicy().updates === false) return { current: input.current } as UpdateInfo;
    const source = { ...UPDATE_SOURCE, ...(this.config.updates ?? {}) };
    const found: NonNullable<UpdateInfo['latest']>[] = [];

    // Release posts in the Weave project, signed by its maintainers: every member has them, no sign-in needed.
    const project = this.#spaces.get(source.project);
    if (project?.kind === 'project') {
      const maintainers = this.#state(project).maintainers;
      for (const post of await this.posts({ space: project.id, board: 'releases' })) {
        const version = /^weave\b/i.test(post.title) ? parseVersion(post.title) : undefined;
        if (!version || !maintainers.has(post.by.did)) continue;
        found.push({ version: formatVersion(version), ...(post.link ? { url: post.link } : {}), post: `weave:post:${post.id}`, notes: post.text.slice(0, 4000), published: post.time, source: 'weave' });
      }
    }
    // The repository's releases, with your GitHub sign-in if you have one (the repository may be private).
    try {
      const auth = this.#githubAuth();
      const releases = await withTimeout(new GitHub(auth?.token ?? '', this.githubSetup.fetch).releases(source.repo), 8000);
      for (const r of releases) {
        const version = parseVersion(r.tag);
        if (version) found.push({ version: formatVersion(version), url: `https://github.com/${source.repo}/releases/tag/${encodeURIComponent(r.tag)}`, ...(r.published ? { published: r.published } : {}), source: 'github' });
      }
    } catch {
      // unreachable or private without access: the release posts are enough
    }

    // The newest version; for the same version, the release post (it has the notes) wins.
    const latest = found.sort((a, b) => compareVersions(b.version, a.version) || (a.source === 'weave' ? -1 : 1))[0];
    return { current: formatVersion(current), ...(latest ? { latest } : {}), newer: !!latest && compareVersions(latest.version, current) > 0 };
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
    return readSecretJson<Record<string, Record<string, string>>>(this.home, this.#appSettingsFile) ?? {};
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
    writeSecretJson(this.home, this.#appSettingsFile, all);
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
    this.replica.write(this.identity, sealFor(this.#cipher(project), { kind: KIND_ROOM, body: { room: id, name, service: app.services[0].id, key, invite, open: true } }));
    const room = this.#roomById(id).room;
    await this.#live.host(room);
    return this.#roomInfo(room, project);
  }

  async endRoom(ref: string): Promise<void> {
    const { room, project } = this.#roomById(ref);
    if (room.host !== this.identity.author) throw new Error('only the host can end a room');
    await this.#live.stopHosting(room.id);
    this.replica.write(this.identity, sealFor(this.#cipher(project), { kind: KIND_ROOM, body: { room: room.id, open: false } }));
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
      const head = this.replica.eventsBy(signer).at(-1);
      const held = grant.role === 'agent' ? this.#agents.find((a) => a.did === signer) : undefined;
      out.push({
        did: signer,
        role: grant.role,
        ...(grant.name ? { name: grant.name } : {}),
        current: signer === this.identity.did,
        ...(grant.revokedAfter !== undefined ? { revokedAfter: grant.revokedAfter } : {}),
        events: this.replica.number(signer),
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
    let afterSeq = this.replica.number(key.did);
    if (input.since) {
      const since = Date.parse(input.since);
      if (Number.isNaN(since)) throw new Error('since is a date and time, e.g. 2026-10-17T18:00');
      afterSeq = 0;
      for (const event of this.replica.eventsBy(key.did)) if (Date.parse(event.time) < since) afterSeq = event.seq;
    }
    const ownDevice = key.did === this.identity.did;
    if (key.role === 'agent' && !input.words) {
      if (ownDevice) throw new Error('that is this device');
      this.replica.write(this.identity, revocation(key.did, afterSeq));
    } else {
      if (!input.words) throw new Error('revoking a device needs your recovery words');
      const root = this.#currentRoot(input.words);
      this.replica.write(root, revocation(key.did, afterSeq));
      if (ownDevice) {
        // This computer keeps working with a fresh device key.
        const fresh = createSubKey(me);
        this.replica.write(root, delegation(fresh.did, 'device', ['*'], deviceName()));
        saveDevice(this.home, fresh);
        this.#identity = fresh;
        this.#decoded = undefined;
      }
    }
    return this.keys();
  }

  // ---------------------------------------------------------------- moving to v0.4

  /**
   * The first start of v0.4 on a home from before (docs/v2-stage1.md,
   * "Migration"): copy the home aside, re-sign the history of the keys on this
   * computer as v2 (original times, old ids, same numbers), and tell the
   * groups and projects shared with others that this person moved, for those
   * still on v0.3. A home with no history of its own is new: just marked.
   * Re-signing is one transaction; if it fails, nothing of it stays and the
   * next start tries again.
   */
  #migrate(): void {
    if (this.#migrated()) return;
    const keys = [this.#identity, ...this.#agents].filter((key) => this.replica.authority.grant(key.did));
    const own = (key: SigningIdentity) => this.replica.store.range(key.did, 1).filter((e) => this.replica.authority.check(e).ok);
    if (!keys.some((key) => own(key).length)) return this.#markMigrated();
    const backup = this.#backup();
    let resigned = 0;
    try {
      const resign = () => {
        for (const key of keys) for (const event of own(key)) if (this.#resign(key, event)) resigned++;
      };
      if (this.#sqlite) this.#sqlite.transaction(resign);
      else resign();
    } catch (error) {
      console.error(`weave: moving to v0.4 failed, will try again at the next start (your home is copied to ${backup}): ${(error as Error).message}`);
      return;
    }
    this.#markMigrated();
    this.#decoded = undefined;
    this.#personEvents.clear();
    this.#farewell();
    console.error(`weave: moved to v0.4: ${resigned} events signed again; your home from before is in ${backup}`);
  }

  #migrated(): boolean {
    return this.#sqlite ? !!this.#sqlite.meta('migrated') : existsSync(joinPath(this.home.dir, 'migrated-v0.4'));
  }

  #markMigrated(): void {
    const at = new Date().toISOString();
    if (this.#sqlite) this.#sqlite.setMeta('migrated', at);
    else writeFileSync(joinPath(this.home.dir, 'migrated-v0.4'), at + '\n');
  }

  /** Copy the home next to it (`<home>-backup-v0.3`, or the next free name), the database through SQLite so the copy is whole. */
  #backup(): string {
    let target = `${this.home.dir}-backup-v0.3`;
    for (let i = 2; existsSync(target); i++) target = `${this.home.dir}-backup-v0.3-${i}`;
    cpSync(this.home.dir, target, { recursive: true, filter: (src: string) => !/[\\/](weave\.db(-wal|-shm)?|node\.lock)$/.test(src) });
    this.#sqlite?.backupTo(joinPath(target, 'weave.db'));
    return target;
  }

  /** One v1 event of a key on this computer, signed again as v2: same time, number and body; its old id as `was`. */
  #resign(key: SigningIdentity, event: WeaveEvent): boolean {
    if (event.kind === KIND_IDENTITY || event.kind === KIND_ROTATE || this.replica.store.byNumber(key.did, event.seq)) return false;
    let cls = classOf(event.kind);
    if (event.kind === KIND_SEALED) {
      const inner = this.#decodeInner(recordOfV1(event))?.inner.kind;
      cls = inner ? classOf(canonicalKind(inner)) : 'content';
    }
    // Scopes v2 doesn't know (gifts of v0.3 had their own) go to public, where v0.3 had them anyway.
    const space = /^(public|self|[a-z]+:[A-Za-z0-9_-]{1,64})$/.test(event.scope) ? event.scope : 'public';
    const head = cls === 'control' ? this.replica.store.chainHead(key.did, space) : undefined;
    const signed = signEventV2(key, head, { kind: event.kind, space, body: event.body, time: event.time, n: event.seq, was: eventId(event), class: cls });
    const result = this.replica.ingest({ e: signed.event, ...(signed.body !== undefined ? { b: signed.body } : {}) });
    if (result.status === 'rejected' && result.reason === 'conflicting event (fork)') throw new Error(`event ${event.seq} of ${key.did} clashes with one already signed`);
    return result.status === 'accepted';
  }

  /** For those still on v0.3: a message in each group and project shared with others, the last thing they get from this node. */
  #farewell(): void {
    const text = `I've moved to Weave 0.4, which v0.3 can't talk to. Please update: ${RELEASES_URL}`;
    for (const space of this.#spaces.values()) {
      if (space.kind !== 'group' && space.kind !== 'project') continue;
      if (this.#state(space).members.size < 2) continue;
      this.replica.append(this.#identity, sealFor(this.#cipher(space), { kind: KIND_MSG, body: { text, moved: '0.4' } }));
    }
  }

  async rotateRoot(input: { words: string; encryption?: boolean }): Promise<IdentityInfo> {
    const words = normalizeWords(input.words);
    const me = this.identity.author;
    const state = this.replica.authority.keys(me);
    if (!state.next) throw new Error('this identity was made before recovery kits existed and cannot rotate; create a new identity');
    const index = findRecoveryIndex(words, state.root, 'root');
    if (index === undefined || recoveryIdentity(words) !== me) throw new Error("these words don't belong to this identity");
    const next = recoveryRoot(words, index + 1);
    const retire = this.replica.number(state.root);
    let enc: EncryptionKey | undefined;
    if (input.encryption) {
      const encIndex = findRecoveryIndex(words, state.enc, 'enc') ?? this.#encryption.length - 1;
      const key = recoveryEncryptionKey(words, encIndex + 1);
      enc = { did: key.did, keys: key };
      this.#saveEncryption([...this.#encryption, enc]);
    }
    this.replica.write({ author: me, did: next.did, keys: next }, rotation(recoveryRoot(words, index + 2).did, retire, enc?.did));
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
    this.#forgetDirects();
  }

  /** My encryption key pairs in the order I named them (each one others encrypted to), for direct chats' epochs. */
  #myEncryptionPairs(): KeyPair[] {
    const pairs = this.replica.authority.encryptionKeys(this.identity.author).flatMap((did) => this.#encryption.find((k) => k.did === did)?.keys ?? []);
    return pairs.length ? pairs : [this.#recipient().keys];
  }

  /** Direct chats are derived again (with their new epoch) after an encryption key changed, mine or a peer's. */
  #forgetDirects(): void {
    this.#directs.clear();
    this.#directByPeer.clear();
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
  /** An accepted event of a person whose list is kept: into its place (time, then seq), no rescan. */
  #personEventsAdd(event: WeaveRecord): void {
    const list = this.#personEvents.get(event.author);
    if (!list || event.missing) return;
    if (list.some((e) => e.id === event.id)) return void this.#personEvents.delete(event.author); // re-signed: gather again
    if (this.replica.authority.personOf(event.signer) !== event.author) return void this.#personEvents.delete(event.author);
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const e = list[mid];
      if ((e.time.localeCompare(event.time) || e.seq - event.seq) <= 0) lo = mid + 1;
      else hi = mid;
    }
    list.splice(lo, 0, event);
  }

  #eventsOf(person: Did): WeaveRecord[] {
    const kept = this.#personEvents.get(person);
    if (kept) return kept;
    const authority = this.replica.authority;
    const events: WeaveRecord[] = [];
    for (const signer of this.replica.signers()) {
      if (authority.personOf(signer) !== person) continue;
      for (const event of this.replica.eventsBy(signer)) if (event.author === person && !event.missing) events.push(event);
    }
    events.sort((a, b) => a.time.localeCompare(b.time) || a.seq - b.seq);
    this.#personEvents.set(person, events);
    return events;
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
    this.replica.write(
      this.identity,
      membershipRequest(this.#encryptionKeyOf(tier.creator), { tier: tier.id, note: input.note?.trim().slice(0, 500) ?? '', entry: this.#entryPoint(), ...(license ? { license } : {}) }),
    );
    this.replica.write(this.identity, this.#sealForSelf({ kind: KIND_MEMBERSHIP_PENDING, body: { creator: tier.creator, tier: tier.id } }));
  }

  async membershipRequests(): Promise<MembershipRequestInfo[]> {
    const handled = new Set(this.#selfBodies(KIND_MEMBERSHIP_HANDLED).map((b) => b.request));
    const mine = new Map(this.#tierOffers(this.identity.author).map((t) => [t.id, t]));
    const out: MembershipRequestInfo[] = [];
    for (const event of this.replica.events((e) => e.kind === KIND_MEMBERSHIP_REQUEST && e.author !== this.identity.author)) {
      const id = event.id;
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
    this.replica.write(this.identity, sealFor(this.#cipher(group), { kind: KIND_MEMBERSHIP, body: { member, until } }));
    // New (or returning) members get the tier's keys, posted where their node will look for them.
    if (!current) {
      this.replica.write(this.identity, gift(this.#keysForNewcomers(group), [member], spaceScope(this.#direct(member)), this.#entryPoint(), this.#encryptionKeyOf));
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
      this.replica.write(this.identity, sealFor(this.#cipher(group), { kind: KIND_MEMBERSHIP, body: { member: record.member, until: grantUntil(new Date(now), 1, until) } }));
      renewed++;
    }
    return renewed;
  }

  #recordLicense(tier: string, member: Did, license: string, check: LicenseCheck): void {
    const body = { tier, member, license, ok: check.ok, ...(check.reason ? { reason: check.reason } : {}), checked: new Date(this.clock()).toISOString() };
    this.replica.write(this.identity, this.#sealForSelf({ kind: KIND_MEMBERSHIP_LICENSE, body }));
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
      for (const member of expired) this.replica.write(this.identity, sealFor(this.#cipher(space), { kind: KIND_REMOVE, body: { member } }));
      const remaining = [...state.members.keys()].filter((did) => !expired.includes(did));
      const { fields, epoch, key } = rekey(space, remaining, this.#encryptionKeyOf);
      space.keys[String(epoch)] = key;
      this.#saveSpace(space);
      this.replica.write(this.identity, fields);
      this.#afterRekey(space, epoch, key);
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
    this.replica.write(this.identity, { kind: KIND_TIER, body });
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
        this.replica.write(this.identity, this.#sealForSelf({ kind: KIND_MEMBERSHIP_HANDLED, body: { request: request.id } }));
      }
    }
  }

  /** Bodies of your own self-sealed events of one kind. */
  #selfBodies(kind: string): Array<Record<string, unknown>> {
    return this.#memo(`self:${kind}`, () =>
      this.#decodeAll()
        .filter((d) => d.private && d.inner.kind === kind && d.inner.body && typeof d.inner.body === 'object')
        .map((d) => d.inner.body as Record<string, unknown>),
    );
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
    await Promise.all(spaceTopics(space).map((topic) => this.#swarm?.join(topic)));
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
    if (this.#contactCache?.from !== this.#decodedRevision) {
      const map = new Map<Did, string | undefined>();
      for (const d of decoded) {
        const body = d.inner.body as { did?: unknown; name?: unknown } | null;
        if (d.private && d.inner.kind === KIND_CONTACT && isDid(body?.did)) map.set(body.did, typeof body.name === 'string' ? body.name : undefined);
      }
      this.#contactCache = { from: this.#decodedRevision, map };
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
  itemFor(event: WeaveRecord): FeedItem | undefined {
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
    this.replica.write(this.identity, sealFor(this.#cipher(space), { kind: KIND_MAINTAINER, body: { member, on } }));
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
    const inside = this.#insideOnly();
    if (inside) throw new Error(inside);
    const space: StoredSpace = { ...newSpace(kind, name.trim(), this.identity.author), entry: { topics: [], bootstrap: [] } };
    await this.#addSpace(space);
    this.replica.write(this.identity, sealFor(this.#cipher(space), { kind: KIND_SPACE_CREATE, body: { name: space.name, ...extra } }));
    return space;
  }

  async #addSpace(space: StoredSpace): Promise<void> {
    this.#saveSpace(space);
    if (this.#swarm) await Promise.all([...spaceTopics(space), ...space.entry.topics].map((t) => this.#swarm!.join(t)));
  }

  #saveSpace(space: StoredSpace): void {
    this.#decoded = undefined;
    // New keys may open its setting and halves: read them again.
    this.#rawCache.delete(space.id);
    this.#spaces.set(space.id, space);
    saveSpace(this.home, space);
    // At once: what is written next in this space must not reach anyone who lost it.
    this.#announceNow();
  }

  /**
   * The spaces this node holds, with the keys that prove it to peers (the
   * current epoch's and the one before, so a member who hasn't got a new key
   * yet still meets the others): its spaces, its direct chats, and its own
   * private space, which only its other devices hold.
   */
  #heldSpaces(): HeldSpace[] {
    // Listing may derive new direct chats, which would announce again: not from inside.
    this.#listingSpaces = true;
    try {
      this.#ensureDirects();
    } finally {
      this.#listingSpaces = false;
    }
    const held = (space: SpaceKeys): HeldSpace => ({
      space: spaceScope(space),
      keys: Object.keys(space.keys).map(Number).sort((a, b) => b - a).slice(0, 2).map((epoch) => b64u.decode(space.keys[String(epoch)])),
      ...(this.#spaces.has(space.id) && this.#pulled(space as StoredSpace) ? { pulled: { windowMs: RECENT_HOLD_MS } } : {}),
    });
    return [
      ...[...this.#spaces.values()].map(held),
      ...[...this.#directs.values()].map(({ space }) => held(space)),
      { space: SELF_SCOPE, keys: [selfKey(this.#selfSecret())] },
    ];
  }

  /** Rekey events a peer ahead of us offered: take a key from those signed for a manager of the space, if a box opens for us. */
  #offeredKeys(items: WireItemV2[]): void {
    for (const { e } of items) {
      const record = recordOfV2(canonicalIdV2(e), e);
      if (canonicalKind(record.kind) !== KIND_REKEY || !this.replica.authority.check(record).ok) continue;
      this.#takeKeys(record);
    }
  }

  #announcing = false;
  #listingSpaces = false;

  /** What a sync session asks this node: its spaces, keys offered, bodies it keeps, keepers. For SwarmNode, and tests that link nodes directly. */
  sessionAccess(): SpaceAccess {
    return { spaces: () => this.#heldSpaces(), offerKeys: (items) => this.#offeredKeys(items), wantsBody: (space, id) => this.#wantsBody(space, id), keep: this.#keepAccess };
  }

  // ---------------------------------------------------------------- managed spaces (stage 6)

  /** How this node signs in to key services: a token, or the person's SSO token (see #ssoToken). Set by the app or by tests. */
  kmsCredentials?: VaultCredentials;
  /** Unlocked epoch keys of managed spaces, in memory: `space:epoch` → key, until when. */
  #managedKeys = new Map<string, { key: string; until: number }>();
  /** Unlocks in flight, per space: a second asker waits for the first. */
  #unlocking = new Map<string, Promise<number>>();
  #managedProblems = new Map<string, string>();

  #provider(setting: ManagedSetting): KeyProvider {
    return providerFor(setting.provider as unknown as ProviderSpec, this.home, this.kmsCredentials ?? { ...(process.env.WEAVE_VAULT_TOKEN ? { token: process.env.WEAVE_VAULT_TOKEN } : {}), idToken: () => this.#ssoToken() });
  }

  /** The person's latest company sign-in (stage 6.3); none yet. */
  #ssoToken(): string | undefined {
    return readSecretJson<{ idToken?: string }>(this.home, joinPath(this.home.dir, 'sso.json'))?.idToken;
  }

  /** Per space, its managed setting and halves: built once, kept up to date as events come, dropped when its keys change. */
  #rawCache = new Map<string, { setting?: ManagedSetting; parts: Map<number, string> }>();

  /**
   * A space's managed setting and wrapped company halves, read straight from
   * its events with the Weave half alone (that's how they're sealed): what
   * unlocks a space can't need the space unlocked, nor decoding, which needs
   * this. Kept until the next event arrives.
   */
  #managedRaw(space: StoredSpace): { setting?: ManagedSetting; parts: Map<number, string> } {
    const kept = this.#rawCache.get(space.id);
    if (kept) return kept;
    const scope = spaceScope(space);
    const out: { setting?: ManagedSetting; parts: Map<number, string> } = { parts: new Map() };
    for (const r of this.replica.events((e) => e.scope === scope && e.kind === KIND_SEALED && !e.missing)) this.#takeRaw(space, out, r);
    this.#rawCache.set(space.id, out);
    return out;
  }

  /** One event of a space, for its managed setting and halves (only those sealed with the Weave half open here). */
  #takeRaw(space: StoredSpace, into: { setting?: ManagedSetting; parts: Map<number, string> }, r: WeaveRecord): boolean {
    const inner = openIn(space, r);
    if (!inner || (inner.kind !== KIND_MANAGED && inner.kind !== KIND_KMS)) return false;
    const b = inner.body as Record<string, unknown> | null;
    if (inner.kind === KIND_MANAGED && r.author === space.founder && b?.provider && Number(b.ttlMinutes) > 0 && Number(b.graceHours) >= 0 && (!into.setting || r.time >= into.setting.time))
      into.setting = { provider: b.provider as Json, ttlMinutes: Number(b.ttlMinutes), graceHours: Number(b.graceHours), ...(isDid(b.attestor) ? { attestor: b.attestor } : {}), ...(typeof b.company === 'string' ? { company: b.company } : {}), by: r.author, time: r.time };
    if (inner.kind === KIND_KMS && Number.isSafeInteger(b?.epoch) && typeof b?.wrapped === 'string' && !into.parts.has(b.epoch as number)) into.parts.set(b.epoch as number, b.wrapped);
    return true;
  }

  #kmsParts(space: StoredSpace): Map<number, string> {
    return this.#managedRaw(space).parts;
  }

  /** One epoch's key, from both halves. */
  #splitKey(space: StoredSpace, epoch: number, weavePart: string, kmsPart: Uint8Array): string {
    const info = `weave/managed-epoch/v1:${space.id}:${epoch}`;
    return b64u.encode(new Uint8Array(hkdfSync('sha256', Buffer.concat([b64u.decode(weavePart), kmsPart]), Buffer.alloc(0), info, 32)));
  }

  /** On disk while offline grace allows (sealed at rest): `space:epoch` → key, until. */
  #graceCache(): Record<string, { key: string; until: number }> {
    return readSecretJson<Record<string, { key: string; until: number }>>(this.home, joinPath(this.home.dir, 'managed-keys.json')) ?? {};
  }

  #remember(space: StoredSpace, setting: ManagedSetting, epoch: number, key: string): void {
    const now = this.clock();
    this.#managedKeys.set(`${space.id}:${epoch}`, { key, until: now + setting.ttlMinutes * 60_000 });
    if (setting.graceHours > 0) {
      const cache = this.#graceCache();
      cache[`${space.id}:${epoch}`] = { key, until: now + setting.graceHours * 3_600_000 };
      writeSecretJson(this.home, joinPath(this.home.dir, 'managed-keys.json'), cache);
    }
  }

  /**
   * A space as sealing and opening see it: for a managed space, the epochs
   * with a company half carry the key made of both halves, while unlocked
   * (in memory for the TTL, or on disk within the offline grace); locked ones
   * are left out, so nothing can be read or written with them.
   */
  #cipher(space: StoredSpace): StoredSpace {
    const setting = this.#managedRaw(space).setting;
    if (!setting) return space;
    const parts = this.#kmsParts(space);
    const now = this.clock();
    const grace = parts.size ? this.#graceCache() : {};
    const keys: Record<string, string> = {};
    let locked = false;
    for (const [epoch, weavePart] of Object.entries(space.keys)) {
      const id = `${space.id}:${epoch}`;
      const memory = this.#managedKeys.get(id);
      if (memory && memory.until > now) {
        keys[epoch] = memory.key;
        this.#decodedValidUntil = Math.min(this.#decodedValidUntil, Math.max(memory.until, grace[id]?.until ?? 0));
      } else if (parts.has(Number(epoch))) {
        if (grace[id] && grace[id].until > now) {
          keys[epoch] = grace[id].key;
          this.#decodedValidUntil = Math.min(this.#decodedValidUntil, grace[id].until);
        } else locked = true;
      } else if (!memory) keys[epoch] = weavePart; // from before the space was managed
      else locked = true;
    }
    if (locked) void this.#unlock(space);
    return { ...space, keys };
  }

  /** Unlock the company halves this node doesn't hold (or whose time ran out). */
  async #unlock(space: StoredSpace): Promise<number> {
    const running = this.#unlocking.get(space.id);
    if (running) return running;
    const work = this.#unlockNow(space).finally(() => this.#unlocking.delete(space.id));
    this.#unlocking.set(space.id, work);
    return work;
  }

  /** The earliest time a managed key used by the decoded views runs out: then they decode again, without it. */
  #decodedValidUntil = Infinity;

  async #unlockNow(space: StoredSpace): Promise<number> {
    const setting = this.#managedRaw(space).setting;
    if (!setting) return 0;
    let unlocked = 0;
    try {
      const provider = this.#provider(setting);
      const now = this.clock();
      for (const [epoch, wrapped] of this.#kmsParts(space)) {
        const weavePart = space.keys[String(epoch)];
        const kept = this.#managedKeys.get(`${space.id}:${epoch}`);
        if (!weavePart || (kept && kept.until > now)) continue;
        const kmsPart = await provider.unwrap(wrapped, { space: spaceScope(space), epoch });
        this.#remember(space, setting, epoch, this.#splitKey(space, epoch, weavePart, kmsPart));
        unlocked++;
      }
      this.#managedProblems.delete(space.id);
    } catch (error) {
      this.#managedProblems.set(space.id, (error as Error).message);
    }
    if (unlocked) this.#decoded = undefined;
    return unlocked;
  }

  /** After a rekey in a managed space: a fresh company half, wrapped by the provider and published. */
  #afterRekey(space: StoredSpace, epoch: number, weavePart: string): void {
    const setting = this.#managedRaw(space).setting;
    if (!setting) return;
    const kmsPart = new Uint8Array(randomBytes(32));
    this.#remember(space, setting, epoch, this.#splitKey(space, epoch, weavePart, kmsPart));
    this.#halves.set(`${space.id}:${epoch}`, { space, epoch, kmsPart });
    void this.#publishHalf(`${space.id}:${epoch}`);
  }

  /** Company halves wrapped and published in the background; kept until published, and tried again on reconcile. */
  #halves = new Map<string, { space: StoredSpace; epoch: number; kmsPart: Uint8Array; publishing?: Promise<void> }>();

  #publishHalf(id: string): Promise<void> {
    const half = this.#halves.get(id);
    if (!half) return Promise.resolve();
    half.publishing ??= (async () => {
      const { space, epoch, kmsPart } = half;
      try {
        const setting = this.#managedRaw(space).setting!;
        const wrapped = await this.#provider(setting).wrap(kmsPart, { space: spaceScope(space), epoch });
        this.replica.write(this.identity, sealFor(space, { kind: KIND_KMS, body: { epoch, wrapped } }));
        this.#halves.delete(id);
      } catch (error) {
        this.#managedProblems.set(space.id, `couldn't wrap the new key: ${(error as Error).message}`);
      } finally {
        half.publishing = undefined;
      }
    })();
    return half.publishing;
  }

  // ---------------------------------------------------------------- company accounts (stage 10)

  /** A company group's settings, if it is one: what the company that founded it signed there. */
  #orgOf(group: StoredSpace): OrgState | undefined {
    // Only a group managed as its own company group can be one; that's read without decoding it.
    if (group.kind !== 'group' || this.#managedRaw(group).setting?.company !== group.id) return undefined;
    return this.#memo(`org:${group.id}`, () => orgState(group.founder, this.#decodedIn(group.id)));
  }

  /** The company groups this node runs: it founded them as the company. */
  #companyGroups(): StoredSpace[] {
    return [...this.#spaces.values()].filter((s) => s.kind === 'group' && s.founder === this.identity.author && this.#orgOf(s));
  }

  /** The company this node runs, else the one this person belongs to (their own company's, for a company-owned identity). */
  #companyHere(): { group: StoredSpace; org: OrgState } | undefined {
    const groups = [...this.#spaces.values()].filter((s) => s.kind === 'group');
    const owner = this.replica.authority.keys(this.identity.author).org;
    const order = [this.identity.author, ...(owner ? [owner] : [])];
    for (const founder of [...order, undefined]) {
      for (const group of groups) {
        if (founder !== undefined ? group.founder !== founder : order.includes(group.founder)) continue;
        const org = this.#orgOf(group);
        if (org) return { group, org };
      }
    }
    return undefined;
  }

  /** The company's spaces besides its group: founded by it, vouched for through the group. */
  #companySpaces(group: StoredSpace): StoredSpace[] {
    return [...this.#spaces.values()].filter((s) => s.id !== group.id && s.founder === group.founder && this.#managedRaw(s).setting?.company === group.id);
  }

  /** Who the company vouches for right now, with their sign-in groups. */
  #vouched(group: StoredSpace): Map<Did, { groups: string[] }> {
    const now = new Date(this.clock()).toISOString();
    const out = new Map<Did, { groups: string[] }>();
    for (const [did, a] of this.#attestations(group, group.founder)) if (a.until > now && !this.replica.authority.frozen(did)) out.set(did, { groups: a.groups });
    return out;
  }

  #isOrgAdmin(group: StoredSpace, org: OrgState, did: Did): boolean {
    return did === group.founder || (!!org.admins && !!this.#vouched(group).get(did)?.groups.includes(org.admins));
  }

  #companyOfPerson(did: Did): NonNullable<Profile['company']> {
    const org = this.replica.authority.keys(did).org!;
    return { did: org, name: this.nameOf(org), ...(this.replica.authority.frozen(did) ? { frozen: true as const } : {}) };
  }

  async createCompany(input: CreateCompanyInput): Promise<CompanyInfo> {
    if (this.#companyGroups().length) throw new Error('this node already runs a company');
    if (!input.admins?.trim()) throw new Error("name the sign-in group of the company's admins");
    if (!input.issuer || !input.audience) throw new Error("the company's sign-in: its issuer and the audience its tokens name");
    const group = await this.#createSpace('group', input.name);
    this.config = { ...this.config, attestor: { issuer: input.issuer, audience: input.audience, ...(input.hours ? { hours: input.hours } : {}) } };
    saveConfig(this.home, this.config);
    await this.manageSpace({ space: group.id, provider: input.provider as ProviderSpec, ttlMinutes: input.ttlMinutes, graceHours: input.graceHours, attestor: this.identity.author, company: group.id });
    this.replica.write(this.identity, sealFor(this.#cipher(group), { kind: KIND_ORG_SETTINGS, body: { admins: input.admins.trim(), links: true } }));
    return (await this.company())!;
  }

  async company(): Promise<CompanyInfo | undefined> {
    const here = this.#companyHere();
    if (!here) return undefined;
    const { group, org } = here;
    const name = (id: string) => this.#spaces.get(id)?.name ?? id;
    return {
      did: group.founder,
      name: this.nameOf(group.founder) ?? group.name,
      group: { id: group.id, name: group.name },
      runsHere: group.founder === this.identity.author,
      admin: this.#isOrgAdmin(group, org, this.identity.author),
      ...(org.admins ? { admins: org.admins } : {}),
      links: org.links,
      policy: org.policy,
      retention: org.retention,
      chats: org.chats.map((c) => ({ space: c.space, name: name(c.space), people: c.people.map((d) => this.nameOf(d) ?? d) })),
      maps: org.maps.map((m) => ({ ...m, spaceName: name(m.space) })),
      start: org.start?.contacts ?? [],
      spaces: this.#companySpaces(group).map((s) => ({ id: s.id, kind: s.kind, name: s.name })),
      requests: org.requests.slice(-20).map((r) => {
        const done = org.done.get(r.id);
        return { id: r.id, by: r.by, byName: this.nameOf(r.by), time: r.time, action: r.action.action, done: !!done, ...(done?.error ? { error: done.error } : {}) };
      }),
    };
  }

  async companyAction(action: CompanyAction): Promise<CompanyInfo> {
    const here = this.#companyHere();
    if (!here) throw new Error("you're not in a company");
    const { group, org } = here;
    if (group.founder === this.identity.author) await this.#orgDo(group, action);
    else {
      if (action.action !== 'chat' && !this.#isOrgAdmin(group, org, this.identity.author)) throw new Error(`only ${this.nameOf(group.founder) ?? group.name}'s admins ask the company for that`);
      // Spaces and people as ids where this node knows them; the company resolves the rest.
      const body: Record<string, Json> = { ...(action as unknown as Record<string, Json>) };
      if (typeof body.space === 'string' && action.action !== 'space') body.space = this.#spaces.has(body.space) ? body.space : ([...this.#spaces.values()].find((s) => s.name === body.space)?.id ?? body.space);
      if (typeof body.person === 'string') body.person = this.resolve(body.person);
      if (typeof body.with === 'string') body.with = this.resolve(body.with);
      this.replica.write(this.identity, sealFor(this.#cipher(group), { kind: KIND_ORG_REQUEST, body }));
    }
    return (await this.company())!;
  }

  async enrollLink(input: { days?: number } = {}): Promise<string> {
    const here = this.#companyHere();
    if (!here) throw new Error("you're not in a company: create it on the company's node first (weave company create)");
    if (!this.#isOrgAdmin(here.group, here.org, this.identity.author)) throw new Error('only the company and its admins hand out enrollment links');
    const invite = await this.invite(here.group.id, (input.days ?? 30) * 24);
    const company = here.group.founder;
    return encodeEnrollment({ v: 1, company, name: this.nameOf(company) ?? here.group.name, group: here.group.id, invite, entry: { topics: [company], bootstrap: this.config.bootstrap } });
  }

  /** What the company does, on its own node: for itself, or for an admin who asked. */
  async #orgDo(group: StoredSpace, action: CompanyAction, by: Did = this.identity.author): Promise<void> {
    const write = (kind: string, body: Json) => this.replica.write(this.identity, sealFor(this.#cipher(group), { kind, body }));
    const companySpace = (ref: string) => {
      const space = this.#space(ref);
      if (space.id !== group.id && !this.#companySpaces(group).some((s) => s.id === space.id)) throw new Error(`${space.name} isn't one of the company's spaces`);
      return space;
    };
    switch (action.action) {
      case 'settings': {
        const org = this.#orgOf(group)!;
        const policy = readPolicy(action, org.policy);
        const retention: Retention = { ...org.retention };
        for (const key of ['minDays', 'maxDays'] as const) {
          const days = action.retention?.[key];
          if (days === null) delete retention[key];
          else if (days !== undefined) {
            if (!Number.isFinite(days) || days <= 0 || days > 36_500) throw new Error('retention is a number of days above 0');
            retention[key] = days;
          }
        }
        if (retention.minDays && retention.maxDays && retention.minDays > retention.maxDays) throw new Error('the minimum is longer than the maximum');
        let deviceCA = org.deviceCA ?? null;
        if (action.deviceCA === null) deviceCA = null;
        else if (action.deviceCA !== undefined) {
          checkAuthority(action.deviceCA);
          deviceCA = action.deviceCA;
        }
        write(KIND_ORG_SETTINGS, { admins: action.admins?.trim() || org.admins || null, ...policy, retention: retention as unknown as Json, deviceCA });
        // Published, so every node holds the company's accounts to it (and counts their links only while allowed).
        if (JSON.stringify(policy) !== JSON.stringify(org.policy)) this.replica.write(this.identity, { kind: KIND_ORG_POLICY, body: { ...policy } });
        return;
      }
      case 'chat': {
        if (by === this.identity.author) throw new Error('a company chat is between two colleagues: one of them asks for it');
        const other = this.resolve(action.with);
        const vouched = this.#vouched(group);
        if (!vouched.has(by) || !vouched.has(other) || other === by) throw new Error('company chats are between two colleagues the company vouches for');
        if (this.#orgOf(group)!.chats.some((c) => c.people.includes(by) && c.people.includes(other) && this.#spaces.has(c.space))) return;
        const space = await this.#createSpace('group', `${this.nameOf(by) ?? 'colleague'} & ${this.nameOf(other) ?? 'colleague'}`);
        const setting = this.#managedRaw(group).setting!;
        await this.manageSpace({ space: space.id, provider: setting.provider as unknown as ProviderSpec, ttlMinutes: setting.ttlMinutes, graceHours: setting.graceHours, attestor: this.identity.author, company: group.id });
        write(KIND_ORG_CHAT, { space: space.id, people: [by, other] });
        return;
      }
      case 'map': {
        const space = companySpace(action.space);
        if (space.id === group.id) throw new Error('everyone the company vouches for is in the company group already');
        if (!action.group?.trim()) throw new Error('map a sign-in group');
        write(KIND_ORG_MAP, { group: action.group.trim(), space: space.id, role: action.role === 'maintainer' ? 'maintainer' : 'member', on: action.on !== false });
        return;
      }
      case 'start':
        for (const contact of action.contacts) decodeContact(contact);
        write(KIND_ORG_START, { contacts: action.contacts });
        return;
      case 'space': {
        const space = await this.#createSpace(action.kind === 'group' ? 'group' : 'project', action.name);
        const setting = this.#managedRaw(group).setting!;
        await this.manageSpace({ space: space.id, provider: setting.provider as unknown as ProviderSpec, ttlMinutes: setting.ttlMinutes, graceHours: setting.graceHours, attestor: this.identity.author, company: group.id });
        return;
      }
      case 'hold':
        await this.setHold({ space: companySpace(action.space).id, until: action.until, ...(action.reason ? { reason: action.reason } : {}) });
        return;
      case 'destroy-key':
        await this.destroyCompanyKey(companySpace(action.space).id);
        return;
      case 'freeze':
        await this.#freeze(this.resolve(action.person));
        return;
    }
  }

  /**
   * Freeze a company-owned identity: public, so every node ignores what its
   * keys sign after the numbers seen here (and anything by keys not seen). It
   * leaves the company's spaces; its history stays.
   */
  async #freeze(person: Did): Promise<void> {
    const keys = this.replica.authority.keys(person);
    if (keys.org !== this.identity.author) throw new Error(`${this.nameOf(person) ?? person} isn't an identity this company owns`);
    const signers = new Set<Did>([person, keys.root, ...keys.retired.keys(), ...this.replica.authority.grantsOf(person).map((g) => g.subject)]);
    const last: Record<string, number> = {};
    for (const r of this.replica.events((e) => signers.has(e.signer))) last[r.signer] = Math.max(last[r.signer] ?? 0, r.seq);
    for (const space of [...this.#spaces.values()]) {
      const state = this.#state(space);
      if (space.founder === this.identity.author && state.members.has(person) && canManage(state, this.identity.author)) await this.removeMember(space.id, person);
    }
    this.replica.write(this.identity, { kind: KIND_ORG_FREEZE, body: { person, keys: last } });
  }

  /**
   * On the company's node: answer admins' requests, and keep the company's
   * spaces in line with its sign-in groups: admit and gift keys to those a
   * mapping (or being an admin) puts there, appoint maintainers, and remove
   * those a mapping brought in that no longer belong.
   */
  async #orgDuties(): Promise<number> {
    let changed = 0;
    for (const group of this.#companyGroups()) {
      let org = this.#orgOf(group)!;
      for (const request of org.requests) {
        if (org.done.has(request.id)) continue;
        let error: string | undefined;
        // Anyone the company vouches for may ask for a company chat; everything else is for admins.
        const allowed = request.action.action === 'chat' ? this.#vouched(group).has(request.by) : this.#isOrgAdmin(group, org, request.by);
        if (!allowed) error = request.action.action === 'chat' ? 'company chats are for colleagues the company vouches for' : "only the company's admins ask for that";
        else {
          try {
            await this.#orgDo(group, request.action, request.by);
          } catch (e) {
            error = (e as Error).message;
          }
        }
        this.replica.write(this.identity, sealFor(this.#cipher(group), { kind: KIND_ORG_DONE, body: { request: request.id, ...(error ? { error } : {}) } }));
        changed++;
      }
      org = this.#orgOf(group)!;
      const vouched = this.#vouched(group);
      for (const space of this.#companySpaces(group)) {
        let state = this.#state(space);
        if (state.closed) continue;
        const want = new Map<Did, MapRole>();
        for (const [did, a] of vouched) {
          if (org.admins && a.groups.includes(org.admins) && space.kind === 'project') want.set(did, 'maintainer');
          for (const m of org.maps) if (m.space === space.id && a.groups.includes(m.group) && want.get(did) !== 'maintainer') want.set(did, m.role);
        }
        for (const chat of org.chats) if (chat.space === space.id) for (const did of chat.people) if (vouched.has(did) && !want.has(did)) want.set(did, 'member');
        const newcomers = [...want.keys()].filter((did) => !state.members.has(did));
        if (newcomers.length) {
          for (const member of newcomers) this.replica.write(this.identity, sealFor(this.#cipher(space), { kind: KIND_ADMIT, body: { member, via: group.id } }));
          this.replica.write(this.identity, gift(this.#keysForNewcomers(space), newcomers, spaceScope(group), this.#entryPoint(), this.#encryptionKeyOf));
          changed += newcomers.length;
          state = this.#state(space);
        }
        if (space.kind === 'project') {
          for (const [did, role] of want) {
            if (role !== 'maintainer' || !state.members.has(did) || state.maintainers.has(did)) continue;
            this.replica.write(this.identity, sealFor(this.#cipher(space), { kind: KIND_MAINTAINER, body: { member: did, on: true } }));
            changed++;
          }
          for (const did of state.maintainers) {
            if (did === state.founder || state.members.get(did)?.via !== group.id || want.get(did) === 'maintainer') continue;
            this.replica.write(this.identity, sealFor(this.#cipher(space), { kind: KIND_MAINTAINER, body: { member: did, on: false } }));
            changed++;
          }
          state = this.#state(space);
        }
        for (const member of [...state.members.values()]) {
          if (member.via !== group.id || member.did === this.identity.author || want.has(member.did)) continue;
          await this.removeMember(space.id, member.did);
          changed++;
        }
      }
      if (org.retention.maxDays) for (const space of [group, ...this.#companySpaces(group)]) changed += await this.#shredOlder(space, org.retention.maxDays);
    }
    return changed;
  }

  /** The company's maximum: shred the keys of a company space that ended before it (what rules keep is carried forward first). */
  async #shredOlder(space: StoredSpace, maxDays: number): Promise<number> {
    const state = this.#state(space);
    if (this.#held(state) || !canManage(state, this.identity.author)) return 0;
    const before = new Date(this.clock() - maxDays * DAY_MS).toISOString();
    const starts = this.#epochStarts(space);
    const epochs = Object.keys(space.keys).map(Number).sort((a, b) => a - b);
    if (!epochs.slice(0, -1).some((_, i) => (starts.get(epochs[i + 1]) ?? '') !== '' && starts.get(epochs[i + 1])! <= before)) return 0;
    await this.shred({ space: space.id, before, dropOlder: true });
    return 1;
  }

  /** A company space's retention, from its company group. */
  #companyRetention(space: StoredSpace): Retention | undefined {
    const company = this.#managedRaw(space).setting?.company;
    const group = company ? this.#spaces.get(company) : undefined;
    return group ? this.#orgOf(group)?.retention : undefined;
  }

  /** A space's epochs that ended less than `days` ago (or haven't ended): a company's minimum keeps them. */
  #endedWithin(space: StoredSpace, days: number): Set<number> {
    const since = new Date(this.clock() - days * DAY_MS).toISOString();
    const starts = this.#epochStarts(space);
    const epochs = Object.keys(space.keys).map(Number).sort((a, b) => a - b);
    return new Set(epochs.filter((_, i) => i === epochs.length - 1 || (starts.get(epochs[i + 1]) ?? '9999') > since));
  }

  // ---------------------------------------------------------------- company policy (stage 11)

  /** Companies' published policies, by company. Read once, then kept up to date as policies arrive (it's asked while events are received). */
  #policyCache?: Map<Did, CompanyPolicy & { time: string }>;

  #policies(): Map<Did, CompanyPolicy & { time: string }> {
    if (!this.#policyCache) {
      this.#policyCache = new Map();
      for (const r of this.replica.events((e) => e.kind === KIND_ORG_POLICY && e.scope === 'public')) this.#takePolicy(r);
    }
    return this.#policyCache;
  }

  #takePolicy(r: { author: Did; time: string; body: Json }): void {
    const before = this.#policyCache!.get(r.author);
    if (!before || before.time <= r.time) this.#policyCache!.set(r.author, { ...readPolicy(r.body), time: r.time });
  }

  /** A company account's company policy, if its company published one. */
  #policyOf(person: Did): { org: Did; policy: CompanyPolicy & { time: string } } | undefined {
    const org = this.replica.authority.keys(person).org;
    const policy = org ? this.#policies().get(org) : undefined;
    return org && policy ? { org, policy } : undefined;
  }

  /** For a company account kept to the company's spaces: why it may not go elsewhere. */
  #insideOnly(founder?: Did): string | undefined {
    const own = this.#policyOf(this.identity.author);
    if (!own || own.policy.outside || founder === own.org) return undefined;
    return `${this.nameOf(own.org) ?? 'Your company'}'s accounts stay in the company's spaces`;
  }

  /**
   * What a company account signs against its company's published policy, from
   * the time it was published: refused by its own node when writing and by
   * every node when receiving. Leaving, identity and keys are always allowed.
   */
  #policyRefuses(event: { author: Did; space: string; kind: string; time: string }, body: Json | undefined): string | undefined {
    const found = this.#policyOf(event.author);
    if (!found || event.time < found.policy.time || ALWAYS_ALLOWED.has(event.kind)) return undefined;
    const { org, policy } = found;
    const who = this.nameOf(org) ?? 'The company';
    const colleague = (did: Did) => did === org || this.replica.authority.keys(did).org === org;
    if (event.space === 'public') {
      if (policy.public) return undefined;
      const b = body as { subject?: unknown; on?: unknown } | null | undefined;
      if (event.kind === KIND_FOLLOW && (b?.on === false || (isDid(b?.subject) && colleague(b.subject)))) return undefined;
      return `${who}'s accounts don't post publicly`;
    }
    if (event.space === 'self' || (event as { class?: string }).class === 'control') return undefined;
    const scope = parseScope(event.space);
    if (!scope) return undefined;
    if (scope.kind === 'direct') {
      if (policy.directs === 'off') return `${who}'s accounts don't use direct chats`;
      const direct = this.#directs.get(scope.id);
      const other = !direct ? undefined : event.author === this.identity.author ? direct.peer : direct.peer === event.author ? this.identity.author : undefined;
      if (!other) return undefined;
      if (policy.directs === 'company' && !colleague(other)) return `${who}'s accounts chat directly only with colleagues`;
      if (policy.chats && other !== org && this.replica.authority.keys(other).org === org) return `${who} keeps chats between colleagues in company chats (weave company chat <colleague>)`;
      return undefined;
    }
    if (policy.outside) return undefined;
    const space = this.#spaces.get(scope.id);
    return space && space.founder !== org ? `${who}'s accounts stay in the company's spaces` : undefined;
  }

  get #enrollFile(): string {
    return joinPath(this.home.dir, 'enroll.json');
  }

  /**
   * A new company account's remaining steps, once the company group's events
   * are here: unlock it with the person's sign-in, join, sign in with the
   * attestor, leave the words with the company, the starting setup.
   */
  async #continueEnrollment(): Promise<number> {
    const pending = readSecretJson<Enrolling>(this.home, this.#enrollFile);
    if (!pending) return 0;
    const group = this.#spaces.get(pending.group);
    if (!group || !this.#managedRaw(group).setting?.attestor) return 0;
    let changed = 0;
    if (pending.idToken) writeSecretJson(this.home, joinPath(this.home.dir, 'sso.json'), { idToken: pending.idToken });
    await this.#unlock(group);
    if (this.#managedProblems.has(group.id)) return 0;
    if (!pending.joined) {
      this.replica.write(this.identity, sealFor(this.#cipher(group), { kind: KIND_JOIN, body: { invite: pending.invite } }));
      pending.joined = true;
      changed++;
    }
    if (pending.idToken) {
      await this.signIn({ space: group.id, idToken: pending.idToken });
      delete pending.idToken;
      changed++;
    }
    if (pending.words) {
      await this.escrowRecovery({ space: group.id, words: pending.words });
      delete pending.words;
      changed++;
    }
    const org = this.#orgOf(group);
    if (!pending.started && org) {
      for (const contact of org.start?.contacts ?? []) {
        try {
          await this.addContact(contact);
        } catch {
          // Our own link, or a damaged one: nothing to add.
        }
      }
      pending.started = true;
      changed++;
    }
    if (pending.words || !pending.started) writeSecretJson(this.home, this.#enrollFile, pending);
    else rmSync(this.#enrollFile, { force: true });
    return changed;
  }

  async link(input: { who: string; space?: string; on?: boolean }): Promise<LinkInfo[]> {
    const to = input.who.includes('weave:contact:') ? (await this.addContact(input.who)).did : this.resolve(input.who);
    if (to === this.identity.author) throw new Error("that's this identity");
    const on = input.on !== false;
    if (on && this.replica.authority.keys(this.identity.author).org) {
      const here = this.#companyHere();
      if (here && !here.org.links) throw new Error(`${this.nameOf(here.group.founder) ?? here.group.name} doesn't let its accounts link to others`);
    }
    const fields = { kind: KIND_LINK, body: { to, on } };
    if (input.space) this.replica.write(this.identity, sealFor(this.#cipher(this.#space(input.space)), fields));
    else this.replica.write(this.identity, fields);
    return this.#linksOf(this.identity.author);
  }

  async links(who?: string): Promise<LinkInfo[]> {
    return this.#linksOf(who ? this.resolve(who) : this.identity.author);
  }

  /**
   * Every link statement this node can read (public, or sealed into its
   * spaces), the latest per direction; companies' public word on links; and
   * when companies froze their identities. Built once per change of what's
   * decoded: profiles ask for it person by person.
   */
  #linkIndex(): { said: Map<string, { on: boolean; time: string; space?: string }>; others: Map<Did, Set<Did>>; policy: Map<Did, boolean>; frozenAt: Map<Did, string> } {
    return this.#memo('links', () => {
      const said = new Map<string, { on: boolean; time: string; space?: string }>();
      const others = new Map<Did, Set<Did>>();
      const policy = new Map<Did, boolean>();
      const frozenAt = new Map<Did, string>();
      for (const d of this.#decodeAll()) {
        const b = d.inner.body as Record<string, unknown> | null;
        if (d.inner.kind === KIND_LINK && isDid(b?.to) && b.to !== d.event.author) {
          const [from, to] = [d.event.author, b.to];
          const before = said.get(`${from} ${to}`);
          if (!before || before.time <= d.event.time) said.set(`${from} ${to}`, { on: b.on !== false, time: d.event.time, ...(d.space ? { space: d.space.id } : {}) });
          for (const [x, y] of [[from, to], [to, from]] as const) {
            const set = others.get(x) ?? new Set<Did>();
            others.set(x, set.add(y));
          }
        } else if (d.inner.kind === KIND_ORG_POLICY && !d.space && typeof b?.links === 'boolean') policy.set(d.event.author, b.links);
        else if (d.inner.kind === KIND_ORG_FREEZE && isDid(b?.person) && !frozenAt.has(b.person) && this.replica.authority.keys(b.person).org === d.event.author) frozenAt.set(b.person, d.event.time);
      }
      return { said, others, policy, frozenAt };
    });
  }

  /** A person's links, where either side says so (see #linkIndex). */
  #linksOf(did: Did): LinkInfo[] {
    const { said, others, policy, frozenAt } = this.#linkIndex();
    const out: LinkInfo[] = [];
    for (const other of others.get(did) ?? []) {
      const mine = said.get(`${did} ${other}`);
      const theirs = said.get(`${other} ${did}`);
      if (!mine?.on && !theirs?.on) continue;
      // A company that said no: its identities' links don't count (it does allow them unless it said so).
      const refused = [did, other].some((x) => {
        const org = this.replica.authority.keys(x).org;
        return !!org && policy.get(org) === false;
      });
      const until = [did, other].map((x) => (this.replica.authority.frozen(x) ? frozenAt.get(x) : undefined)).filter((t): t is string => !!t).sort()[0];
      const org = this.replica.authority.keys(other).org;
      const space = mine?.space ?? theirs?.space;
      out.push({
        did: other,
        name: this.nameOf(other),
        state: refused ? 'refused' : mine?.on && theirs?.on ? 'linked' : mine?.on ? 'waiting' : 'asked',
        since: [mine?.on ? mine.time : '', theirs?.on ? theirs.time : ''].sort().at(-1)!,
        ...(until ? { until } : {}),
        ...(org ? { company: { did: org, name: this.nameOf(org) } } : {}),
        ...(space ? { space: this.#spaces.get(space)?.name ?? space } : {}),
      });
    }
    return out.sort((a, b) => a.since.localeCompare(b.since));
  }

  // ---------------------------------------------------------------- the audit in security tools, and exports (stage 12)

  get #sinksFile(): string {
    return joinPath(this.home.dir, 'audit-streams.json');
  }

  /** Sinks (secrets included: sealed at rest), what each was sent (line id → time), and their last problems. */
  #sinks(): { sinks: AuditSink[]; sent: Record<string, Record<string, string>>; problems: Record<string, string> } {
    return readSecretJson(this.home, this.#sinksFile) ?? { sinks: [], sent: {}, problems: {} };
  }

  async addAuditStream(input: AuditSinkInput): Promise<AuditStreamInfo[]> {
    if (!this.#companyGroups().length) throw new Error("the audit streams from the company's own node");
    const state = this.#sinks();
    state.sinks.push(newSink(input));
    writeSecretJson(this.home, this.#sinksFile, state);
    await this.#streamAudit();
    return this.auditStreams();
  }

  async removeAuditStream(id: string): Promise<AuditStreamInfo[]> {
    const state = this.#sinks();
    if (!state.sinks.some((s) => s.id === id)) throw new Error(`no audit stream ${id}`);
    state.sinks = state.sinks.filter((s) => s.id !== id);
    delete state.sent[id];
    delete state.problems[id];
    writeSecretJson(this.home, this.#sinksFile, state);
    return this.auditStreams();
  }

  async auditStreams(): Promise<AuditStreamInfo[]> {
    const state = this.#sinks();
    return state.sinks.map((s) => {
      const sent = Object.values(state.sent[s.id] ?? {});
      return { id: s.id, kind: s.kind, target: sinkTarget(s), sent: sent.length, ...(sent.length ? { lastSent: sent.sort().at(-1) } : {}), ...(state.problems[s.id] ? { problem: state.problems[s.id] } : {}) };
    });
  }

  #streaming?: Promise<number>;

  /** Send each sink the company's audit lines of the last 31 days it hasn't had yet; what fails is sent next time. */
  #streamAudit(): Promise<number> {
    this.#streaming ??= (async () => {
      try {
        const state = this.#sinks();
        if (!state.sinks.length) return 0;
        const since = new Date(this.clock() - 31 * DAY_MS).toISOString();
        const lines: StreamedLine[] = [];
        for (const group of this.#companyGroups()) {
          for (const space of [group, ...this.#companySpaces(group)]) {
            for (const l of await this.audit({ space: space.id, since })) lines.push({ ...l, space: { id: space.id, name: space.name } });
          }
        }
        lines.sort((a, b) => a.time.localeCompare(b.time));
        let sent = 0;
        for (const sink of state.sinks) {
          const had = (state.sent[sink.id] ??= {});
          for (const [id, time] of Object.entries(had)) if (time < since) delete had[id];
          const fresh = lines.filter((l) => l.id && !had[l.id]);
          try {
            for (let i = 0; i < fresh.length; i += 500) {
              const batch = fresh.slice(i, i + 500);
              await sendLines(sink, batch);
              for (const l of batch) had[l.id!] = l.time;
              sent += batch.length;
            }
            delete state.problems[sink.id];
          } catch (error) {
            state.problems[sink.id] = (error as Error).message;
          }
        }
        writeSecretJson(this.home, this.#sinksFile, state);
        return sent;
      } finally {
        this.#streaming = undefined;
      }
    })();
    return this.#streaming;
  }

  async exportSpace(input: { space: string; since?: string; until?: string }): Promise<ExportLine[]> {
    const space = this.#space(input.space);
    const state = this.#state(space);
    if (!canManage(state, this.identity.author)) throw new Error(`only those who manage ${space.name} export it`);
    const since = input.since ? new Date(input.since).toISOString() : '';
    const until = input.until ? new Date(input.until).toISOString() : '9999';
    const decoded = this.#decodedIn(space.id);
    const deleted = new Map<string, string>();
    const edited = new Map<string, string[]>();
    for (const d of decoded) {
      const target = (d.inner.body as { target?: unknown } | null)?.target;
      if (typeof target !== 'string') continue;
      if (d.inner.kind === KIND_POST_DELETE && !deleted.has(target)) deleted.set(target, d.event.time);
      if (d.inner.kind === KIND_POST_EDIT) edited.set(target, [...(edited.get(target) ?? []), d.event.time]);
    }
    return decoded
      .filter((d) => d.event.time >= since && d.event.time <= until && d.inner.kind !== KIND_CARRY)
      .map((d) => {
        const agent = this.#agentName(d.event.signer, d.event.author);
        const name = this.nameOf(d.event.author);
        return {
          id: d.id,
          time: d.event.time,
          kind: d.inner.kind,
          by: d.event.author,
          ...(name ? { byName: name } : {}),
          signer: d.event.signer,
          ...(agent ? { agent } : {}),
          body: withoutSecrets(d.inner.body),
          ...(deleted.has(d.id) ? { deleted: deleted.get(d.id) } : {}),
          ...(edited.has(d.id) ? { edited: edited.get(d.id) } : {}),
        };
      });
  }

  // ---------------------------------------------------------------- SCIM and devices (stage 12)

  /** For tests and service setups: this computer's device certificate and key (PEM), instead of the managed settings' files. */
  deviceCredentials?: { cert: string; key: string };

  #deviceProof(idToken: string): unknown {
    let creds = this.deviceCredentials;
    const managed = machinePolicy();
    if (!creds && managed.deviceCert && managed.deviceKey) {
      try {
        creds = { cert: readFileSync(managed.deviceCert, 'utf8'), key: readFileSync(managed.deviceKey, 'utf8') };
      } catch {
        creds = undefined;
      }
    }
    return creds ? deviceProof(creds.cert, creds.key, this.identity.author, idToken) : undefined;
  }

  get #scimFile(): string {
    return joinPath(this.home.dir, 'scim.json');
  }

  #scimDirectory(): ScimDirectory {
    return readSecretJson<ScimDirectory>(this.home, this.#scimFile) ?? emptyDirectory();
  }

  #scimServer?: { port: number; close(): Promise<void> };
  /** Directory changes, one after another. */
  #scimWork: Promise<unknown> = Promise.resolve();

  /** On the company's node: serve SCIM for the company's user management (a new token each time), or stop. */
  async setScim(input: { on: boolean; port?: number }): Promise<ScimInfo> {
    if (!this.#companyGroups().length) throw new Error("SCIM runs on the company's own node (weave company create)");
    if (!input.on) {
      const { scim: _scim, ...rest } = this.config;
      this.config = rest;
      saveConfig(this.home, this.config);
      await this.#scimServer?.close();
      this.#scimServer = undefined;
      return this.scim();
    }
    const token = newScimToken();
    writeSecretJson(this.home, this.#scimFile, { ...this.#scimDirectory(), tokenHash: hashToken(token) });
    this.config = { ...this.config, scim: { port: input.port ?? this.config.scim?.port ?? 7720 } };
    saveConfig(this.home, this.config);
    await this.#startScim();
    return { ...(await this.scim()), token };
  }

  async scim(): Promise<ScimInfo> {
    const directory = this.#scimDirectory();
    const vouched = new Map<string, Did>();
    for (const group of this.#companyGroups()) for (const [did, a] of this.#attestations(group, this.identity.author)) vouched.set(a.subject, did);
    return {
      on: !!this.config.scim,
      ...(this.#scimServer ? { port: this.#scimServer.port } : {}),
      users: Object.values(directory.users).map((u) => {
        const did = vouched.get(u.externalId ?? '') ?? vouched.get(u.userName);
        return { userName: u.userName, ...(u.displayName ? { displayName: u.displayName } : {}), active: u.active, groups: groupsOf(directory, u.id), ...(did ? { did, name: this.nameOf(did) } : {}) };
      }),
      groups: Object.values(directory.groups).map((g) => ({ name: g.displayName, members: g.members.length })),
    };
  }

  /** Start what the company's node serves (SCIM, the admin console), as configured. The daemon calls it. */
  async startServices(): Promise<void> {
    if (this.config.scim) await this.#startScim().catch((error: Error) => console.error(`weave: SCIM couldn't start: ${error.message}`));
    if (this.config.console) await this.#startConsole().catch((error: Error) => console.error(`weave: the admin console couldn't start: ${error.message}`));
  }

  // ---------------------------------------------------------------- the admin console (stage 12)

  #console?: { port: number; url: string; operatorLink(): string; close(): Promise<void> };

  get #consoleFile(): string {
    return joinPath(this.home.dir, 'console.json');
  }

  /** On the company's node: serve the admin console (or stop). Admins sign in with the company's sign-in through the app registration `clientId`. */
  async setConsole(input: { on: boolean; port?: number; url?: string; clientId?: string; clientSecret?: string }): Promise<ConsoleInfo> {
    if (!this.#companyGroups().length || !this.config.attestor) throw new Error("the admin console runs on the company's own node (weave company create)");
    if (!input.on) {
      const { console: _console, ...rest } = this.config;
      this.config = rest;
      saveConfig(this.home, this.config);
      await this.#console?.close();
      this.#console = undefined;
      return this.consoleInfo();
    }
    const clientId = input.clientId ?? this.config.console?.clientId;
    if (!clientId) throw new Error("name the console's app registration with the company's sign-in (its client id)");
    if (input.clientSecret) writeSecretJson(this.home, this.#consoleFile, { clientSecret: input.clientSecret });
    this.config = { ...this.config, console: { port: input.port ?? this.config.console?.port ?? 7730, clientId, ...((input.url ?? this.config.console?.url) ? { url: input.url ?? this.config.console?.url } : {}) } };
    saveConfig(this.home, this.config);
    await this.#startConsole();
    return { ...(await this.consoleInfo()), operatorLink: this.#console!.operatorLink() };
  }

  async consoleInfo(): Promise<ConsoleInfo> {
    return { on: !!this.#console, ...(this.#console ? { url: this.#console.url, port: this.#console.port } : {}), ...(this.config.console?.clientId ? { clientId: this.config.console.clientId } : {}) };
  }

  async #startConsole(): Promise<void> {
    await this.#console?.close();
    const c = this.config.console!;
    const secret = readSecretJson<{ clientSecret?: string }>(this.home, this.#consoleFile)?.clientSecret;
    this.#console = await startConsole(this, { port: c.port, ...(c.url ? { url: c.url } : {}), issuer: this.config.attestor!.issuer, clientId: c.clientId!, ...(secret ? { clientSecret: secret } : {}) });
  }

  /** Is the person behind this company sign-in one of the company's admins (by the directory's groups when SCIM is on)? */
  consoleAdmin(claims: { sub: string; email?: string; groups: string[] }): boolean {
    const group = this.#companyGroups()[0];
    const admins = group ? this.#orgOf(group)?.admins : undefined;
    if (!admins) return false;
    let groups = claims.groups;
    if (this.config.scim) {
      const directory = this.#scimDirectory();
      const { user } = findPerson(directory, { subject: claims.sub, email: claims.email });
      if (!user?.active) return false;
      groups = groupsOf(directory, user.id);
    }
    return groups.includes(admins);
  }

  /** Record what an admin did in the console, in the company's audit. */
  async consoleRecord(what: Record<string, string>, admin: { subject: string; email?: string }): Promise<void> {
    const group = this.#companyGroups()[0];
    if (!group) throw new Error('not a company node');
    this.replica.write(this.identity, sealFor(this.#cipher(group), { kind: KIND_ORG_CONSOLE, body: { subject: admin.subject, ...(admin.email ? { email: admin.email } : {}), ...what } }));
  }

  /** An admin in the console: the company does it, recorded with who asked. */
  async consoleAction(action: CompanyAction, admin: { subject: string; email?: string }): Promise<CompanyInfo> {
    const group = this.#companyGroups()[0];
    if (!group) throw new Error('not a company node');
    const what: Record<string, string> = { action: action.action };
    for (const key of ['space', 'person', 'group', 'name', 'kind'] as const) {
      const value = (action as Record<string, unknown>)[key];
      if (typeof value === 'string') what[key] = value;
    }
    await this.consoleRecord(what, admin);
    await this.#orgDo(group, action);
    return (await this.company())!;
  }

  async #startScim(): Promise<void> {
    await this.#scimServer?.close();
    this.#scimServer = await startScimServer(this.config.scim!.port, (req, auth) => this.scimRequest(req, auth));
  }

  /** One request from the company's user management. Changes take effect at once. */
  async scimRequest(req: ScimRequest, authorization: string | undefined): Promise<ScimResponse> {
    const run = this.#scimWork.then(async () => {
      const directory = this.#scimDirectory();
      if (!tokenMatches(directory, authorization)) return { status: 401, body: { schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'], status: '401', detail: 'wrong or missing bearer token' } };
      const response = scimHandle(directory, req);
      if (response.changed) {
        writeSecretJson(this.home, this.#scimFile, directory);
        await this.#applyDirectory();
      }
      return response;
    });
    this.#scimWork = run.catch(() => undefined);
    return run;
  }

  /**
   * The directory as it stands, applied to everyone the company vouches for:
   * deactivated or deleted people aren't vouched for any more (and are removed
   * from the company's spaces at once; deleted company-owned identities are
   * frozen); everyone else gets the directory's groups. People the directory
   * doesn't know yet are left as they are.
   */
  async #applyDirectory(): Promise<number> {
    if (!this.config.scim) return 0;
    const directory = this.#scimDirectory();
    const now = new Date(this.clock()).toISOString();
    let changed = 0;
    for (const group of this.#companyGroups()) {
      for (const [did, a] of this.#attestations(group, this.identity.author)) {
        if (a.until <= now) continue;
        const found = findPerson(directory, { subject: a.subject, email: a.email });
        const vouch = (groups: string[], until: string) =>
          this.replica.write(this.identity, sealFor(this.#cipher(group), { kind: KIND_ATTEST, body: { did, subject: a.subject, ...(a.email ? { email: a.email } : {}), groups, until } }));
        if (found.deleted || (found.user && !found.user.active)) {
          vouch(a.groups, now);
          if (found.deleted && this.replica.authority.keys(did).org === this.identity.author && !this.replica.authority.frozen(did)) await this.#freeze(did);
          changed++;
        } else if (found.user) {
          const groups = groupsOf(directory, found.user.id);
          if (groups.join('\n') !== [...a.groups].sort().join('\n')) {
            vouch(groups, a.until);
            changed++;
          }
        }
      }
    }
    if (changed) {
      await this.#offboard();
      await this.#orgDuties();
    }
    return changed;
  }

  // ---------------------------------------------------------------- budgets (stage 8)

  #heldBack = 0;
  /** Off for tools that load whole histories as if live (the benchmark). */
  budgets = true;

  /**
   * An author's budget for live content in a space, as this node sees them
   * (docs/v2-stage8.md): no limit for those who manage it (and ourselves); a
   * lot for long-time members and our friends; less for newer members; little
   * for strangers.
   */
  #budgetOf(author: Did, scope: string): { events: number; bytes: number } | undefined {
    if (author === this.identity.author) return undefined;
    const now = this.clock();
    const friend = this.#friends().includes(author);
    const id = parseScope(scope)?.id;
    const space = id ? this.#spaces.get(id) : undefined;
    if (space) {
      const state = this.#state(space);
      if (this.#managers(state).has(author)) return undefined;
      const since = Date.parse(state.members.get(author)?.since ?? '') || now;
      if (friend || now - since >= 30 * DAY_MS) return BUDGETS.trusted;
      if (now - since >= DAY_MS) return BUDGETS.member;
      return BUDGETS.newcomer;
    }
    // Direct chats: between two people; public: friends, or strangers.
    if (id && this.#directs.has(id)) return undefined;
    return friend ? BUDGETS.trusted : BUDGETS.newcomer;
  }

  /** Over budget? Counted from what this node holds of the author's live content in that space (the last hour). */
  #admit = (event: EventV2, body: Json | undefined): string | undefined => {
    const refused = this.#policyRefuses(event, body);
    if (refused) return refused;
    if (!this.budgets || event.class !== 'content') return undefined; // control is never held back: nothing may block a rekey
    const hourAgo = this.clock() - 3_600_000;
    if (Date.parse(event.time) < hourAgo) return undefined; // history, not live
    const budget = this.#budgetOf(event.author, event.space);
    if (!budget) return undefined;
    let events = 1;
    let bytes = body === undefined ? 0 : JSON.stringify(body).length;
    for (const { event: e } of this.replica.store.inSpace2(event.space, new Date(hourAgo).toISOString())) {
      if (e.author !== event.author || e.class !== 'content') continue;
      events++;
      const held = this.replica.store.body(e.body);
      if (held !== undefined) bytes += JSON.stringify(held).length;
    }
    if (events <= budget.events && bytes <= budget.bytes) return undefined;
    this.#heldBack++;
    return 'over budget';
  };

  // ---------------------------------------------------------------- retention (stage 6.4)

  /** Is a legal hold standing on this space? */
  #held(state: SpaceState): boolean {
    return !!state.hold && Date.parse(state.hold.until) > this.clock();
  }

  async setHold(input: { space: string; until: string; reason?: string }): Promise<SpaceInfo> {
    const space = this.#space(input.space);
    const state = this.#state(space);
    if (state.founder !== this.identity.author) throw new Error(`only the owner of ${space.name} puts it on hold`);
    if (Number.isNaN(Date.parse(input.until))) throw new Error('until is a date, e.g. 2027-12-31');
    this.replica.write(this.identity, sealFor(this.#cipher(space), { kind: KIND_HOLD, body: { until: new Date(input.until).toISOString(), reason: input.reason ?? '' } }));
    return this.#spaceInfo(space);
  }

  // ---------------------------------------------------------------- SSO (stage 6.3)

  async signIn(input: { space: string; idToken: string }): Promise<void> {
    const space = this.#space(input.space);
    const setting = this.#state(space).managed;
    if (!setting?.attestor) throw new Error(`${space.name} has no company sign-in`);
    // Kept for the key service too (Vault's JWT auth), sealed at rest.
    writeSecretJson(this.home, joinPath(this.home.dir, 'sso.json'), { idToken: input.idToken });
    await this.#unlock(space);
    const device = this.#deviceProof(input.idToken);
    const box = boxTo(this.#encryptionKeyOf(setting.attestor), { idToken: input.idToken, ...(device ? { device: device as unknown as Json } : {}) });
    this.replica.write(this.identity, sealFor(this.#cipher(space), { kind: KIND_SIGNIN, body: { box: box as unknown as Json } }));
  }

  /** Who the attestor vouches for in a space: did → their latest attestation, while it holds or not. */
  #attestations(space: StoredSpace, attestor: Did): Map<Did, { subject: string; email?: string; groups: string[]; until: string; time: string; device?: { subject: string; serial: string } }> {
    const out = new Map<Did, { subject: string; email?: string; groups: string[]; until: string; time: string; device?: { subject: string; serial: string } }>();
    // A company space's people are vouched for in the company group (stage 10).
    const company = this.#managedRaw(space).setting?.company;
    for (const d of this.#decodedIn(company && this.#spaces.has(company) ? company : space.id)) {
      if (d.inner.kind !== KIND_ATTEST || d.event.author !== attestor) continue;
      const b = d.inner.body as { did?: unknown; subject?: unknown; email?: unknown; groups?: unknown; until?: unknown; device?: { subject?: unknown; serial?: unknown } } | null;
      if (!isDid(b?.did) || typeof b?.subject !== 'string' || typeof b?.until !== 'string') continue;
      out.set(b.did, { subject: b.subject, ...(typeof b.email === 'string' ? { email: b.email } : {}), groups: Array.isArray(b.groups) ? b.groups.filter((g): g is string => typeof g === 'string') : [], until: b.until, time: d.event.time, ...(typeof b.device?.subject === 'string' && typeof b.device.serial === 'string' ? { device: { subject: b.device.subject, serial: b.device.serial } } : {}) });
    }
    return out;
  }

  /** As a company's attestor: check new sign-ins with the OIDC provider and vouch for those that hold. */
  async #attest(): Promise<number> {
    const config = this.config.attestor;
    if (!config) return 0;
    let made = 0;
    for (const space of [...this.#spaces.values()]) {
      const setting = this.#state(space).managed;
      if (setting?.attestor !== this.identity.author) continue;
      const attested = this.#attestations(space, this.identity.author);
      for (const d of this.#decodedIn(space.id)) {
        if (d.inner.kind !== KIND_SIGNIN || (attested.get(d.event.author)?.time ?? '') >= d.event.time) continue;
        const box = (d.inner.body as { box?: unknown } | null)?.box;
        const opened = box ? this.#tryOpen((me) => openBox(me.keys.secretKey, me.keys.publicKey, box as unknown as Box) as { idToken?: unknown }) : undefined;
        if (typeof opened?.idToken !== 'string') continue;
        const claims = await verifyIdToken(opened.idToken, config.issuer, config.audience).catch(() => undefined);
        if (!claims) continue;
        // With SCIM on, the directory decides: deactivated or unknown people aren't vouched for, and its groups count (stage 12).
        let groups = claims.groups;
        if (this.config.scim) {
          const directory = this.#scimDirectory();
          const { user } = findPerson(directory, { subject: claims.sub, email: claims.email });
          if (!user?.active) continue;
          groups = groupsOf(directory, user.id);
        }
        // With a device authority, only sign-ins from the company's computers.
        const ca = this.#orgOf(space)?.deviceCA;
        const device = ca ? checkDevice((opened as { device?: unknown }).device, ca, d.event.author, opened.idToken, this.clock()) : undefined;
        if (ca && !device) continue;
        const until = new Date(this.clock() + (config.hours ?? 24) * 3_600_000).toISOString();
        this.replica.write(this.identity, sealFor(this.#cipher(space), { kind: KIND_ATTEST, body: { did: d.event.author, subject: claims.sub, ...(claims.email ? { email: claims.email } : {}), groups, until, ...(device ? { device } : {}) } }));
        attested.set(d.event.author, { subject: claims.sub, groups, until, time: new Date().toISOString() });
        made++;
      }
    }
    return made;
  }

  /**
   * In a space with an attestor: people the company no longer vouches for are
   * removed (with a new key), by whoever manages the space. Newcomers get an
   * hour to sign in.
   */
  async #offboard(): Promise<number> {
    let removed = 0;
    const now = new Date(this.clock()).toISOString();
    const hourAgo = new Date(this.clock() - 3_600_000).toISOString();
    for (const space of [...this.#spaces.values()]) {
      const state = this.#state(space);
      const attestor = state.managed?.attestor;
      if (!attestor || !canManage(state, this.identity.author)) continue;
      const attested = this.#attestations(space, attestor);
      for (const [did, member] of state.members) {
        if (did === state.founder || did === attestor || did === this.identity.author) continue;
        // Newcomers get an hour to sign in; someone the company stopped vouching for goes at once.
        const attestation = attested.get(did);
        if (attestation ? attestation.until > now : member.since > hourAgo) continue;
        await this.removeMember(space.id, did);
        removed++;
      }
    }
    return removed;
  }

  async manageSpace(input: { space: string; provider: ProviderSpec; ttlMinutes?: number; graceHours?: number; attestor?: string; company?: string }): Promise<SpaceInfo> {
    const space = this.#space(input.space);
    const state = this.#state(space);
    if (space.kind === 'direct') throw new Error('a direct chat belongs to two people, not a company');
    if (state.founder !== this.identity.author) throw new Error(`only the owner of ${space.name} puts its keys under a company's key service`);
    const setting: ManagedSetting = { provider: input.provider as unknown as Json, ttlMinutes: input.ttlMinutes ?? 15, graceHours: input.graceHours ?? 8, by: this.identity.author, time: new Date().toISOString() };
    // Check the provider works before anything depends on it.
    const probe = new Uint8Array(randomBytes(32));
    const back = await this.#provider(setting).unwrap(await this.#provider(setting).wrap(probe, { space: spaceScope(space), epoch: -1 }), { space: spaceScope(space), epoch: -1 });
    if (b64u.encode(back) !== b64u.encode(probe)) throw new Error('the key service gave back something else');
    const attestor = input.attestor ? this.resolve(input.attestor) : undefined;
    this.replica.write(this.identity, sealFor(space, { kind: KIND_MANAGED, body: { provider: setting.provider, ttlMinutes: setting.ttlMinutes, graceHours: setting.graceHours, ...(attestor ? { attestor } : {}), ...(input.company ? { company: input.company } : {}) } }));
    // From the next key on, half of it is the company's.
    this.#rotateKey(space);
    return this.#spaceInfo(space);
  }

  async unlockSpace(ref: string): Promise<SpaceInfo> {
    const space = this.#space(ref);
    await this.#unlock(space);
    const problem = this.#managedProblems.get(space.id);
    if (problem) throw new Error(problem);
    return this.#spaceInfo(space);
  }

  async destroyCompanyKey(ref: string): Promise<void> {
    const space = this.#space(ref);
    const state = this.#state(space);
    if (!state.managed) throw new Error(`${space.name} isn't under a company's key service`);
    if (state.founder !== this.identity.author) throw new Error(`only the owner of ${space.name} destroys its company key`);
    if (this.#held(state)) throw new Error(`${space.name} is on legal hold until ${state.hold!.until.slice(0, 10)}: its company key stays`);
    await this.#provider(state.managed).destroy();
    for (const id of [...this.#managedKeys.keys()]) if (id.startsWith(`${space.id}:`)) this.#managedKeys.delete(id);
    const cache = this.#graceCache();
    for (const id of Object.keys(cache)) if (id.startsWith(`${space.id}:`)) delete cache[id];
    writeSecretJson(this.home, joinPath(this.home.dir, 'managed-keys.json'), cache);
    this.#decoded = undefined;
  }

  #managedInfo(space: StoredSpace, setting: ManagedSetting): NonNullable<SpaceInfo['managed']> {
    const spec = setting.provider as unknown as ProviderSpec;
    const current = this.#cipher(space).keys[String(currentEpoch(space))] !== undefined;
    const problem = this.#managedProblems.get(space.id);
    return {
      agents: [...(this.#state(space).approvedAgents ?? [])].map((did) => {
        const grant = this.replica.authority.grant(did);
        return grant ? `${this.nameOf(grant.author) ?? grant.author}/${grant.name ?? did.slice(8, 16)}` : did;
      }),
      provider: spec.kind === 'vault' ? `Vault at ${spec.address} (${spec.key})` : spec.kind === 'azure' ? `Azure Key Vault ${spec.vault} (${spec.key})` : spec.kind,
      unlocked: current,
      ttlMinutes: setting.ttlMinutes,
      graceHours: setting.graceHours,
      ...(setting.attestor ? { attestor: setting.attestor } : {}),
      ...(problem ? { problem } : {}),
    };
  }

  // ---------------------------------------------------------------- keepers (stage 5)

  #keepState?: KeepState;

  /** Who keeps which of our spaces, and when we last saw each keeper (sealed at rest). */
  get #keeping(): KeepState {
    if (!this.#keepState) {
      const stored = readSecretJson<KeepState>(this.home, joinPath(this.home.dir, 'keepers.json'));
      this.#keepState = { spaces: stored?.spaces ?? {}, seen: stored?.seen ?? {}, index: stored?.index ?? '' };
    }
    return this.#keepState;
  }

  #saveKeeping(): void {
    writeSecretJson(this.home, joinPath(this.home.dir, 'keepers.json'), this.#keeping);
  }

  /** The spaces keepers keep for us: our own space, direct chats, and groups and projects of 3 people or fewer. */
  #keptSpaces(): Array<{ scope: string; space?: StoredSpace; peer?: Did }> {
    this.#ensureDirects();
    return [
      { scope: SELF_SCOPE },
      ...[...this.#directs.values()].map(({ space, peer }) => ({ scope: spaceScope(space), space, peer })),
      ...[...this.#spaces.values()].filter((s) => (s.kind === 'group' || s.kind === 'project') && this.#state(s).members.size <= KEPT_UP_TO).map((space) => ({ scope: spaceScope(space), space })),
    ];
  }

  /** Which friend is at the other end of a connection: the one whose direct chat it shares. */
  #friendOn(shared: ReadonlySet<string>): Did | undefined {
    for (const scope of shared) {
      if (!scope.startsWith('direct:')) continue;
      const peer = this.#directs.get(scope.slice('direct:'.length))?.peer;
      if (peer && this.#friends().includes(peer)) return peer;
    }
    return undefined;
  }

  /** The keepers of a kept space: chosen at random among friends (never the other one of a direct chat), replaced when not seen for 14 days. */
  #keepersOf(scope: string, peer?: Did): Did[] {
    const state = this.#keeping;
    const now = this.clock();
    const stale = (did: Did) => now - Date.parse(state.seen[did] ?? new Date(now).toISOString()) > KEEPER_GONE_MS;
    const friends = this.#friends().filter((f) => f !== peer);
    let keepers = (state.spaces[scope] ?? []).filter((k) => friends.includes(k) && !stale(k));
    const candidates = friends.filter((f) => !keepers.includes(f) && !stale(f));
    while (keepers.length < KEEPERS && candidates.length) keepers.push(candidates.splice(Math.floor(Math.random() * candidates.length), 1)[0]);
    if (JSON.stringify(keepers) !== JSON.stringify(state.spaces[scope] ?? [])) {
      for (const k of keepers) state.seen[k] ??= new Date(now).toISOString();
      state.spaces[scope] = keepers;
      this.#saveKeeping();
    }
    return keepers;
  }

  /** A space's events as keepers get them, by tag. */
  #keepItems(scope: string): Map<string, WeaveRecord> {
    const key = keepWrapKey(this.#selfSecret(), scope);
    return new Map(this.replica.events((r) => r.scope === scope).map((r) => [keepTag(key, r.id), r]));
  }

  #keepAccess: KeepAccess = {
    streams: (shared) => {
      const friend = this.#friendOn(shared);
      if (!friend) return [];
      this.#keeping.seen[friend] = new Date(this.clock()).toISOString();
      return this.#keptSpaces().map(({ scope, peer }) => ({
        id: keepStreamId(this.#selfSecret(), scope, friend),
        tags: [...this.#keepItems(scope).keys()],
        keeper: this.#keepersOf(scope, peer).includes(friend),
      }));
    },
    wrapped: (id, tags) => {
      const found = this.#streamScope(id);
      if (!found) return [];
      const key = keepWrapKey(this.#selfSecret(), found);
      const items = this.#keepItems(found);
      return tags.flatMap((tag) => {
        const record = items.get(tag);
        return record ? [{ tag, data: wrapForKeeper(key, record.wire as unknown as Json) }] : [];
      });
    },
    take: (id, items) => {
      const found = this.#streamScope(id);
      if (!found) return;
      const key = keepWrapKey(this.#selfSecret(), found);
      for (const { data } of items) {
        const wire = unwrapFromKeeper(key, data);
        if (wire !== undefined) this.replica.ingest(wire);
      }
      // What came back may be our keep index: take the spaces it lists.
      this.#decoded = undefined;
      this.#recoverSpaces();
    },
    accepts: (shared, id, bytes) => !!this.#friendOn(shared) && this.replica.store.keepBytes() + bytes <= KEEP_QUOTA && this.replica.store.keepBytes(id) + bytes <= KEEP_STREAM_QUOTA,
  };

  /** The kept space a stream of ours is, whichever friend keeps it. */
  #streamScope(id: string): string | undefined {
    const friends = this.#friends();
    for (const { scope } of this.#keptSpaces()) for (const friend of friends) if (keepStreamId(this.#selfSecret(), scope, friend) === id) return scope;
    return undefined;
  }

  /**
   * Our keep index, in our own space: the kept spaces and their keys, so that
   * after losing everything, our self stream brings them back. Written when it
   * changes.
   */
  #writeKeepIndex(): number {
    const spaces = this.#keptSpaces().flatMap(({ space }) => (space && !this.#directs.has(space.id) ? [space] : []));
    const body = { spaces: spaces.map((s) => ({ ...this.#keysOnly(s), ...(s.boards ? { boards: s.boards } : {}), ...(s.shredded ? { shredded: s.shredded } : {}) })) };
    const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    if (hash === this.#keeping.index) return 0;
    this.replica.write(this.identity, this.#sealForSelf({ kind: KIND_KEEP_INDEX, body: body as unknown as Json }));
    this.#keeping.index = hash;
    this.#saveKeeping();
    return 1;
  }

  /** Spaces our latest keep index lists that this node doesn't have (after restoring from the recovery words). */
  #recoverSpaces(): void {
    const index = this.#selfBodies(KIND_KEEP_INDEX).at(-1) as { spaces?: unknown } | undefined;
    if (!Array.isArray(index?.spaces)) return;
    for (const space of index.spaces as StoredSpace[]) {
      if (!space || typeof space.id !== 'string' || this.#spaces.has(space.id)) continue;
      void this.#addSpace({ ...space, entry: { topics: [this.identity.author], bootstrap: [] } });
    }
  }

  async keepers(): Promise<KeepersInfo> {
    return {
      spaces: this.#keptSpaces().map(({ scope, space, peer }) => ({
        space: space ? { id: space.id, kind: space.kind, name: this.#spaceName(space) } : { id: SELF_SCOPE, kind: 'group' as const, name: 'your own space' },
        keepers: this.#keepersOf(scope, peer).map((k) => this.#actor(k, k)),
      })),
      forOthers: this.replica.store.keepBytes(),
      quota: KEEP_QUOTA,
    };
  }

  // ---------------------------------------------------------------- who holds what (stage 4)

  /** Above this many members, a community's or project's content is held by its members between them. */
  pulledAbove = 12;

  /** Is this space held by its members between them (and not ours: owners hold all of theirs)? */
  #pulled(space: StoredSpace, state = this.#state(space)): boolean {
    return (space.kind === 'community' || space.kind === 'project') && state.members.size > this.pulledAbove && state.founder !== this.identity.author && !this.config.archive && !this.#held(state);
  }

  /** The 3 members who hold an event by share: the lowest H(id ‖ member). Nobody coordinates, everyone computes the same. */
  #share(id: string, members: Did[]): Did[] {
    const rank = (did: Did) => createHash('sha256').update(`weave/share/v1:${id}:${did}`).digest('hex');
    return [...members].sort((a, b) => rank(a).localeCompare(rank(b))).slice(0, SHARE_HOLDERS);
  }

  #keptState?: KeptState;

  /** What this node keeps because its person opened or asked for it (sealed at rest: it says what they read). */
  get #kept() {
    if (!this.#keptState) {
      const stored = readSecretJson<KeptState>(this.home, joinPath(this.home.dir, 'kept.json'));
      this.#keptState = { ids: stored?.ids ?? {}, ranges: stored?.ranges ?? [] };
    }
    return this.#keptState;
  }

  #saveKept(): void {
    const since = new Date(this.clock() - KEEP_READ_MS).toISOString();
    const kept = this.#kept;
    for (const [id, at] of Object.entries(kept.ids)) if (at < since) delete kept.ids[id];
    kept.ranges = kept.ranges.filter((r) => r.at >= since);
    writeSecretJson(this.home, joinPath(this.home.dir, 'kept.json'), kept);
  }

  /** Opened or asked for in the last 30 days. */
  #isKept(space: StoredSpace, id: string, time: string): boolean {
    const since = new Date(this.clock() - KEEP_READ_MS).toISOString();
    const kept = this.#kept;
    if ((kept.ids[id] ?? '') >= since) return true;
    return kept.ranges.some((r) => r.space === space.id && r.at >= since && time >= r.since && time < r.until);
  }

  /** In a pulled space: do we keep this event's body? Our share, or something we keep. */
  #wantsBody(scope: string, id: string): boolean {
    const space = this.#spaces.get(parseScope(scope)?.id ?? '');
    if (!space) return true;
    const state = this.#state(space);
    if (!this.#pulled(space, state)) return true;
    return this.#share(id, [...state.members.keys()]).includes(this.identity.author) || (this.#kept.ids[id] ?? '') >= new Date(this.clock() - KEEP_READ_MS).toISOString();
  }

  async fetchOlder(input: { space: string; before?: string }): Promise<{ since: string; until: string }> {
    const space = this.#space(input.space);
    const oldest = this.#decodedIn(space.id).reduce((a, d) => (d.event.time < a ? d.event.time : a), new Date(this.clock()).toISOString());
    const until = input.before ?? oldest;
    if (Number.isNaN(Date.parse(until))) throw new Error('before is a date, e.g. 2026-09-01');
    const since = new Date(Date.parse(until) - KEEP_READ_MS).toISOString();
    this.#kept.ranges.push({ space: space.id, since, until, at: new Date(this.clock()).toISOString() });
    this.#saveKept();
    this.#swarm?.fetchRange(spaceScope(space), since, until);
    return { since, until };
  }

  /**
   * In pulled spaces: let go of the bodies we don't hold (see docs/v2-stage4.md):
   * not recent, not ours, not kept (upvoted, saved, opened, followed board),
   * not core (pinned, issues, proposals, releases, the page), not our share.
   * The envelopes stay, and the bodies can be fetched again.
   */
  #release(): number {
    const me = this.identity.author;
    const recent = new Date(this.clock() - RECENT_HOLD_MS).toISOString();
    let released = 0;
    for (const space of [...this.#spaces.values()]) {
      const state = this.#state(space);
      if (!this.#pulled(space, state)) continue;
      const members = [...state.members.keys()];
      const posts = new Map(this.#spacePosts(space).posts.map((p) => [p.id, p]));
      const held = (p: PostInfo) =>
        p.by.did === me ||
        (!!p.lifetime && 'forever' in p.lifetime && p.lifetime.forever !== 'no-rule') ||
        p.pinned ||
        p.active >= recent ||
        p.myVote === 1 ||
        !!p.saved ||
        (space.kind === 'project' && !!p.board && this.#follows(space.id, p.board)) ||
        this.#isKept(space, p.id, p.time) ||
        this.#share(p.id, members).includes(me);
      for (const d of this.#decodedIn(space.id)) {
        if (d.carried || d.event.author === me || d.event.class !== 'content' || CARRIED_STATE.has(d.inner.kind)) continue;
        const body = d.inner.body as { post?: unknown; target?: unknown } | null;
        const anchor = posts.get(d.id) ?? posts.get(String(body?.post ?? body?.target ?? ''));
        const keep = anchor ? held(anchor) : d.event.time >= recent || this.#isKept(space, d.id, d.event.time);
        if (keep || this.#share(d.id, members).includes(me)) continue;
        if (!isWireItemV2(d.event.wire) || d.event.missing) continue;
        this.replica.store.releaseBody(d.event.wire.e.body as string);
        released++;
      }
    }
    if (released) this.#decoded = undefined;
    return released;
  }

  /** Roughly who holds a post of a pulled space: an estimate from what every node knows. */
  #heldBy(p: PostInfo, members: Did[], recent: boolean): NonNullable<PostInfo['heldBy']> {
    const share = this.#share(p.id, members).filter((d) => d !== p.by.did).length;
    const upvoters = Math.max(0, p.score);
    return { about: recent ? members.length : 1 + share + upvoters, author: true, share, upvoters, recent, here: true };
  }

  /** Tell peers which spaces this node holds, right away (a key changed), and join the right meeting points soon. */
  #announceNow(): void {
    if (!this.#swarm || this.#listingSpaces) return;
    this.#swarm.announce();
    this.#announceSoon();
  }

  /** Tell peers which spaces this node holds, once the current change is done. */
  #announceSoon(): void {
    if (!this.#swarm || this.#announcing) return;
    this.#announcing = true;
    setImmediate(() => {
      this.#announcing = false;
      this.#swarm?.announce();
      this.#refreshTopics();
    });
  }

  /** Join the meeting points this node should be at now, and leave those it shouldn't (a space's key moved on, or it left). */
  #refreshTopics(): void {
    const swarm = this.#swarm;
    if (!swarm) return;
    const wanted = new Set(this.topics);
    for (const topic of wanted) if (!swarm.joined.includes(topic)) swarm.join(topic).catch(() => {});
    for (const topic of swarm.joined) if (!wanted.has(topic)) swarm.leave(topic).catch(() => {});
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
    for (const member of dids) this.replica.write(this.identity, sealFor(this.#cipher(project), { kind: KIND_ADMIT, body: { member, via: group.id } }));
    this.replica.write(this.identity, gift(this.#keysForNewcomers(project), dids, spaceScope(group), this.#entryPoint(), this.#encryptionKeyOf));
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
  #takeKeys(event: WeaveRecord): void {
    if (canonicalKind(event.kind) === KIND_REKEY) {
      const space = this.#spaces.get(parseScope(event.scope)?.id ?? '');
      if (!space || !canManage(this.#state(space), event.author)) return;
      const opened = this.#tryOpen((me) => openRekey(event, me));
      if (opened && !space.keys[String(opened.epoch)] && !space.shredded?.includes(opened.epoch)) {
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
      for (const [epoch, key] of Object.entries(opened.space.keys)) if (!known.keys[epoch] && !known.shredded?.includes(Number(epoch))) (known.keys[epoch] = key), (added = true);
      for (const [board, epochs] of Object.entries((opened.space as StoredSpace).boards ?? {})) {
        for (const [epoch, key] of Object.entries(epochs)) if (!known.boards?.[board]?.[epoch]) (((known.boards ??= {})[board] ??= {})[epoch] = key), (added = true);
      }
      if (added) this.#saveSpace(known);
      return;
    }
    void this.#addSpace({ ...opened.space, entry: opened.entry, via: event.author });
  }

  #state(space: StoredSpace): SpaceState {
    const direct = this.#directs.get(space.id);
    if (direct) {
      // Two people, no membership events: the key itself says who is in.
      const member = (did: Did): [Did, Member] => [did, { did, since: '' }];
      return { kind: 'direct', founder: space.founder, members: new Map([member(this.identity.author), member(direct.peer)]), removed: new Map(), maintainers: new Set(), groups: new Map(), declined: new Map(), left: new Set() };
    }
    this.#decodeAll();
    const key = `${this.#decodedGeneration}:${this.#controlRevision.get(space.id) ?? 0}`;
    const kept = this.#stateCache.get(space.id);
    if (kept?.key === key) return kept.state;
    const state = spaceState(space.kind, space.founder, this.#decodedIn(space.id));
    this.#stateCache.set(space.id, { key, state });
    return state;
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
      history: state.history?.value ?? 'all',
      ...(state.managed ? { managed: this.#managedInfo(space, state.managed) } : {}),
      ...(this.#held(state) ? { hold: { until: state.hold!.until, reason: state.hold!.reason } } : {}),
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
      space = { ...directSpace({ author: this.identity.author, keys: this.#myEncryptionPairs() }, peer, this.replica.authority.encryptionKeys(peer)), entry: { topics: [peer], bootstrap: [] } };
      this.#directByPeer.set(peer, space);
      this.#directs.set(space.id, { space, peer });
      this.#announceSoon();
    }
    return space;
  }

  /** Derive the direct chats with everyone whose log we hold (people, not their agents' keys). */
  #ensureDirects(): void {
    for (const signer of this.replica.signers()) this.#ensureDirectFor(signer);
  }

  #ensureDirectFor(signer: Did): void {
    const person = this.replica.authority.personOf(signer);
    if (person !== this.identity.author && !this.#directByPeer.has(person) && !this.replica.authority.grant(person)) this.#direct(person);
  }

  // ---------------------------------------------------------------- internals: posts

  /** Your saves, from your self-sealed events. */
  #saves(): Map<string, SaveMode> {
    return this.#memo('saves', () => {
      const mine = this.#decodeAll()
        .filter((d) => d.private && d.inner.kind === KIND_SAVE)
        .map((d) => ({ id: d.id, event: d.event, kind: d.inner.kind, body: d.inner.body }));
      return savesOf(mine);
    });
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
    const ctx = { scores: scoresOf(entries), chats: this.#chats(entries), saves: this.#saves(), entries };
    const rules = boardRulesOf(entries, this.#managers(state));
    const around = this.#aroundPosts(entries);
    const visible = postsOf(space.kind, entries, state.maintainers).filter((p) => known.has(p.board)); // posts of dropped boards stay in the logs, out of sight
    const minDays = this.#companyRetention(space)?.minDays;
    // Each author's share of each board with a rule: their bytes against an even split (stage 8).
    const overuse = new Map<string, number>();
    for (const board of rules.keys()) {
      const mine = new Map<Did, number>();
      for (const p of visible.filter((x) => x.board === board)) mine.set(p.author, (mine.get(p.author) ?? 0) + p.title.length + p.text.length);
      const total = [...mine.values()].reduce((a, b) => a + b, 0);
      for (const [author, bytes] of mine) if (total && mine.size > 1) overuse.set(`${board} ${author}`, bytes / (total / mine.size));
    }
    const posts = visible
      .map((p) => {
        const info = this.#postInfo(p, space, ctx);
        if (pinned.has(p.id)) info.pinned = true;
        const near = around.get(p.id);
        const active = near && near.last > info.active ? near.last : info.active;
        const permanent = p.type !== 'post' || (space.kind === 'project' && p.board === 'releases');
        info.lifetime = lifetimeOf({ active, upvotes: ctx.scores.get(p.id)?.up ?? 0, rule: rules.get(p.board), pinned: info.pinned, permanent, overuse: overuse.get(`${p.board} ${p.author}`), ...(minDays ? { minDays } : {}) });
        if (p.author === this.identity.author || state.founder === this.identity.author) info.lifetime.yours = true;
        const issue = issues.get(p.id);
        if (issue) info.issue = { status: issue.status, labels: issue.labels, ...(issue.assignee ? { assignee: this.#actor(issue.assignee.author, issue.assignee.signer) } : {}) };
        const proposal = proposals.get(p.id);
        if (proposal) info.proposal = this.#proposalInfo(proposal);
        return info;
      });
    if (this.#pulled(space, state)) {
      const members = [...state.members.keys()];
      const recent = new Date(this.clock() - RECENT_HOLD_MS).toISOString();
      for (const p of posts) p.heldBy = this.#heldBy(p, members, p.active >= recent);
    }
    // A board over its size: the posts that would go soonest go now.
    for (const [board, rule] of rules) {
      const inBoard = posts.filter((p) => p.board === board).map((p) => ({ id: p.id, lifetime: p.lifetime!, bytes: (around.get(p.id)?.bytes ?? 0) + JSON.stringify(p.text).length + p.title.length, overuse: overuse.get(`${board} ${p.by.did}`) }));
      const full = overBudget(inBoard, rule, this.clock());
      for (const post of posts) if (full.has(post.id)) post.lifetime = { until: new Date(this.clock()).toISOString(), upvotes: 0, addedDays: 0, full: true, ...(post.lifetime?.yours ? { yours: true as const } : {}) };
    }
    return { posts, boards };
  }

  #ruleInfo(rule: BoardRule): NonNullable<BoardInfo['rule']> {
    return { keepDays: rule.keepDays, maxMB: rule.maxMB, by: this.#actor(rule.by, rule.by), time: rule.time };
  }

  /** Who manages a space's rules: its maintainers or moderators, and its owner. */
  #managers(state: SpaceState): Set<Did> {
    return new Set([...state.maintainers, state.founder]);
  }

  /** Per post, what goes with it: its last activity (edits, chat, upvotes, keep), its size, and the events to forget with it. */
  #aroundPosts(entries: Entry[]): Map<string, { last: string; bytes: number; ids: Array<{ id: string; author: Did }> }> {
    const out = new Map<string, { last: string; bytes: number; ids: Array<{ id: string; author: Did }> }>();
    for (const e of entries) {
      const body = e.body as { post?: unknown; target?: unknown } | null;
      const post = typeof body?.post === 'string' ? body.post : typeof body?.target === 'string' ? body.target : undefined;
      if (!post) continue;
      const near = out.get(post) ?? { last: '', bytes: 0, ids: [] };
      if (e.event.time > near.last) near.last = e.event.time;
      near.bytes += JSON.stringify(e.body).length;
      near.ids.push({ id: e.id, author: e.event.author });
      out.set(post, near);
    }
    return out;
  }

  /**
   * Forget what the rules say is due: drop the bodies of those posts and of
   * what goes with them (edits, chat, upvotes), and remember that, so they
   * aren't fetched again. Never what we wrote, never in spaces we own.
   */
  #forget(): number {
    const me = this.identity.author;
    let dropped = 0;
    for (const space of [...this.#spaces.values()]) {
      if (space.kind !== 'project' && space.kind !== 'community') continue;
      const state = this.#state(space);
      if (state.founder === me || this.config.archive || this.#held(state)) continue;
      const due = this.#spacePosts(space).posts.filter((p) => p.lifetime && isDue(p.lifetime, this.clock()) && p.by.did !== me);
      if (!due.length) continue;
      const around = this.#aroundPosts(this.#entries(space));
      for (const post of due) {
        for (const { id, author } of [{ id: post.id, author: post.by.did as Did }, ...(around.get(post.id)?.ids ?? [])]) {
          if (author === me) continue;
          const record = this.replica.record2(id);
          if (!record || record.class !== 'content' || record.missing || !isWireItemV2(record.wire)) continue;
          this.replica.store.dropBody(record.wire.e.body as string);
          dropped++;
        }
      }
    }
    if (dropped) this.#decoded = undefined;
    return dropped;
  }

  async setBoardRule(input: { space: string; board: string; keepDays?: number | null; maxMB?: number | null }): Promise<BoardInfo[]> {
    const space = this.#space(input.space);
    if (space.kind !== 'project' && space.kind !== 'community') throw new Error('rules for forgetting are for the boards of projects and communities');
    const state = this.#state(space);
    if (!this.#managers(state).has(this.identity.author)) throw new Error(`only the ${space.kind === 'project' ? 'maintainers' : 'moderators'} of ${space.name} set how long posts stay`);
    const board = this.#board(space, this.#spacePosts(space).boards, input.board);
    const valid = (v: number | null | undefined, max: number, what: string) => {
      if (v === undefined || v === null) return null;
      if (!Number.isFinite(v) || v <= 0 || v > max) throw new Error(`${what} is a number above 0, at most ${max}`);
      return v;
    };
    const keepDays = valid(input.keepDays, 36_500, 'days to keep');
    const maxMB = valid(input.maxMB, 1_000_000, 'the size limit in MB');
    const floor = this.#companyRetention(space)?.minDays;
    if (floor && keepDays && keepDays < floor) throw new Error(`${space.name} is a company space: it keeps everything at least ${floor} days`);
    this.replica.write(this.identity, sealFor(this.#cipher(space), { kind: KIND_BOARD_RULE, body: { board: board.name, keepDays, maxMB } }));
    return this.boards(space.id);
  }

  async shred(input: { space: string; before: string; dropOlder?: boolean }): Promise<{ epochs: number[]; carried: number }> {
    const space = this.#space(input.space);
    if (space.kind === 'direct') throw new Error('a direct chat has nobody who manages it: there is nothing to shred');
    const state = this.#state(space);
    if (!canManage(state, this.identity.author)) throw new Error(`only those who manage ${space.name} shred its old keys`);
    if (this.#held(state)) throw new Error(`${space.name} is on legal hold until ${state.hold!.until.slice(0, 10)}: nothing is shredded`);
    const before = Date.parse(input.before);
    if (Number.isNaN(before)) throw new Error('before is a date, e.g. 2026-09-01');
    const floor = this.#companyRetention(space)?.minDays;
    if (floor && before > this.clock() - floor * DAY_MS)
      throw new Error(`${space.name} is a company space: it keeps everything at least ${floor} days (shred before ${new Date(this.clock() - floor * DAY_MS).toISOString().slice(0, 10)} at the latest)`);
    // An epoch ends when the next one begins; the current one can't be shredded.
    const starts = this.#epochStarts(space);
    const epochs = Object.keys(space.keys).map(Number).sort((a, b) => a - b);
    const ended = epochs.slice(0, -1).filter((e, i) => (starts.get(epochs[i + 1]) ?? '') !== '' && Date.parse(starts.get(epochs[i + 1])!) <= before);
    if (!ended.length) throw new Error(`no key of ${space.name} ended before ${input.before.slice(0, 10)}${epochs.length < 2 ? ': it has had one key all along' : ''}`);
    // A company space's setting is read with the keys alone (see #managedRaw): restated under the current key, or it would go with the old ones.
    const managed = this.#managedRaw(space).setting;
    if (managed) {
      if (space.founder !== this.identity.author) throw new Error(`only the owner of ${space.name} shreds it: it's under a company's key service`);
      const { by: _by, time: _time, ...setting } = managed;
      this.replica.write(this.identity, sealFor(space, { kind: KIND_MANAGED, body: setting as unknown as Json }));
    }
    const carried = this.#carryForward(space, new Set(ended), input.dropOlder ? new Date(before).toISOString() : undefined);
    this.replica.write(this.identity, sealFor(this.#cipher(space), { kind: KIND_SHRED, body: { epochs: ended } }));
    return { epochs: ended, carried };
  }

  /**
   * Before old keys go: restate under the current key what the space still
   * keeps from those epochs: its control events and latest state, posts its
   * rules keep (and their chat), read-limited boards' with their own key.
   */
  #carryForward(space: StoredSpace, epochs: Set<number>, dropBefore?: string): number {
    const posts = this.#spacePosts(space).posts;
    // A company's maximum (stage 11): chat and posts from before it go too, unless they stay for good (pinned, issues, proposals, releases).
    const forever = new Set(posts.filter((p) => p.lifetime && 'forever' in p.lifetime && p.lifetime.forever !== 'no-rule').map((p) => p.id));
    const gone = new Set(posts.filter((p) => (p.lifetime && isDue(p.lifetime, this.clock())) || (dropBefore && p.active < dropBefore && !forever.has(p.id))).map((p) => p.id));
    const around = this.#aroundPosts(this.#entries(space));
    const goneWith = new Set([...gone].flatMap((id) => (around.get(id)?.ids ?? []).map((x) => x.id)));
    const items = this.#decodedIn(space.id).filter((d) => {
      const epoch = (d.event.body as { epoch?: unknown } | null)?.epoch;
      const inEpochs = d.carried || (Number.isSafeInteger(epoch) && epochs.has(epoch as number));
      if (dropBefore && d.inner.kind === KIND_MSG && d.event.time < dropBefore) return false;
      return inEpochs && d.inner.kind !== KIND_CARRY && !gone.has(d.id) && !goneWith.has(d.id);
    });
    const byBoard = new Map<string, Decoded[]>();
    for (const d of items) byBoard.set(d.board ?? '', [...(byBoard.get(d.board ?? '') ?? []), d]);
    for (const [board, list] of byBoard) {
      const inner: Inner = { kind: KIND_CARRY, body: { events: list.map(carriedItem) as unknown as Json } };
      const keys = board ? space.boards?.[board] : undefined;
      const latest = keys ? Math.max(...Object.keys(keys).map(Number)) : -1;
      if (board && latest < 0) continue; // a board we can't read: we hold none of it to carry
      this.replica.write(this.identity, sealFor(this.#cipher(space), board ? sealForBoard(space, board, latest, keys![String(latest)], inner) : inner));
    }
    return items.length;
  }

  /** Apply the shreds of those who manage our spaces (each once: a shredded key is gone). */
  #applyShreds(): number {
    let applied = 0;
    for (const space of [...this.#spaces.values()]) {
      const state = this.#state(space);
      for (const d of this.#decodedIn(space.id)) {
        if (d.inner.kind !== KIND_SHRED || d.carried || !canManage(state, d.event.author)) continue;
        const epochs = (d.inner.body as { epochs?: unknown } | null)?.epochs;
        if (!Array.isArray(epochs)) continue;
        // A company's minimum keeps recent keys, whoever asks to shred them.
        const floor = this.#companyRetention(space)?.minDays;
        const kept = floor ? this.#endedWithin(space, floor) : undefined;
        const live = epochs.filter((e): e is number => Number.isSafeInteger(e) && !!space.keys[String(e)] && !kept?.has(e));
        if (live.length) {
          this.#applyShred(space, live);
          applied++;
        }
      }
    }
    return applied;
  }

  /** A shred from someone who manages the space: keep what we wrote, then let those keys go, with the bodies sealed with them. */
  #applyShred(space: StoredSpace, epochs: number[]): void {
    if (this.#held(this.#state(space))) return; // on legal hold: keys stay
    const doomed = new Set(epochs.filter((e) => space.keys[String(e)] && e !== currentEpoch(space)));
    if (!doomed.size) return;
    // Our own work stays with us: restated in our private space first. Not in a company space: there, the company's retention decides (stage 11).
    const company = !!this.#managedRaw(space).setting?.company;
    const mine = company ? [] : this.#decodedIn(space.id).filter((d) => d.event.author === this.identity.author && !d.carried && doomed.has(Number((d.event.body as { epoch?: unknown } | null)?.epoch)));
    if (mine.length) this.replica.write(this.identity, this.#sealForSelf({ kind: KIND_CARRY, body: { space: space.id, events: mine.map(carriedItem) as unknown as Json } }));
    const scope = spaceScope(space);
    for (const r of this.replica.events((r) => r.scope === scope && r.class === 'content' && !r.missing)) {
      if (doomed.has(Number((r.body as { epoch?: unknown } | null)?.epoch)) && isWireItemV2(r.wire)) this.replica.store.dropBody(r.wire.e.body as string);
    }
    for (const e of doomed) delete space.keys[String(e)];
    space.shredded = [...new Set([...(space.shredded ?? []), ...doomed])];
    this.#saveSpace(space);
  }

  async keepPost(target: string): Promise<PostInfo> {
    const post = await this.post(target);
    const space = post.space && this.#spaces.get(post.space.id);
    if (!space) throw new Error('only posts of projects and communities are forgotten');
    if (post.by.did !== this.identity.author && !this.#managers(this.#state(space)).has(this.identity.author)) throw new Error('its author keeps a post, or those who manage the space');
    this.replica.write(this.identity, sealFor(this.#cipher(space), { kind: KIND_POST_KEEP, body: { target: post.id } }));
    return this.post(post.id);
  }

  async fading(): Promise<PostInfo[]> {
    const me = this.identity.author;
    return [...this.#spaces.values()]
      .filter((s) => s.kind === 'project' || s.kind === 'community')
      .flatMap((s) => this.#spacePosts(s).posts)
      .filter((p) => p.by.did === me && p.lifetime && isFading(p.lifetime, this.clock()))
      .sort((a, b) => ((a.lifetime as { until: string }).until).localeCompare((b.lifetime as { until: string }).until));
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

  #postInfo(p: Post, space: StoredSpace | undefined, ctx: { scores: Map<string, Score>; chats: Map<string, { count: number; last: string }>; saves: Map<string, SaveMode>; entries?: Entry[] }): PostInfo {
    const score = ctx.scores.get(p.id);
    const chat = ctx.chats.get(p.id);
    const saved = ctx.saves.get(p.id);
    const info: PostInfo = {
      id: p.id,
      short: p.id.slice(0, 8),
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
      .map((d) => ({ id: d.id, event: d.event, kind: d.inner.kind, body: d.inner.body }));
    const ctx = { scores: scoresOf(entries), chats: new Map(), saves: this.#saves(), entries };
    return postsOf(undefined, entries)
      .filter((p) => (p.author === this.identity.author || following.has(p.author)) && !hidden.has(p.author))
      .map((p) => this.#postInfo(p, undefined, ctx));
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
    this.replica.write(this.identity, this.#sealForSelf({ kind: KIND_HOME_HIDDEN, body: { space: space.id, hidden: !input.visible } }));
    return this.#spaceInfo(space);
  }

  async followBoard(input: { project: string; board: string; on: boolean }): Promise<BoardInfo[]> {
    const project = this.#project(input.project);
    const board = this.#board(project, this.#spacePosts(project).boards, input.board);
    if (this.#follows(project.id, board.name) !== input.on) {
      this.replica.write(this.identity, this.#sealForSelf({ kind: KIND_BOARD_FOLLOW, body: { space: project.id, board: board.name, on: input.on } }));
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
    return { kind: KIND_SEALED, scope: SELF_SCOPE, class: classOf(inner.kind), body: seal(key, inner as unknown as Json, `weave/self/v1:${this.identity.author}`) };
  }

  #decode(event: WeaveRecord): Decoded | undefined {
    const decoded = this.#decodeInner(event);
    return decoded && { ...decoded, id: event.id };
  }

  #decodeInner(event: WeaveRecord): Omit<Decoded, 'id'> | undefined {
    if (canonicalKind(event.kind) === KIND_REKEY || event.kind === KIND_GIFT) return undefined; // key plumbing, not content
    if (event.missing) return undefined; // decoded when its body comes
    if (event.kind !== KIND_SEALED) return { event, inner: { kind: event.kind, body: event.body } };

    let decoded: Omit<Decoded, 'id'> | undefined;
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
      // The setting and the company halves are sealed with the Weave half alone; nothing else counts that way in a managed space.
      const raw = space ? openIn(space, event) : undefined;
      const inner = space && (openIn(this.#cipher(space), event) ?? (raw && (raw.kind === KIND_KMS || raw.kind === KIND_MANAGED) ? raw : undefined));
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
    // The farewell a node leaves for v0.3 peers when it moves to v0.4: not for v0.4 eyes.
    if (decoded.inner.kind === KIND_MSG && (decoded.inner.body as { moved?: unknown } | null)?.moved !== undefined) return undefined;
    return decoded;
  }

  #decodeAll(): Decoded[] {
    // A managed key used for these views ran out: decode again without it.
    if (this.#decoded && this.clock() >= this.#decodedValidUntil) this.#decoded = undefined;
    if (!this.#decoded) this.#decodedValidUntil = Infinity;
    // Board keys arrive inside the project: taking one makes more events readable, so decode again.
    for (let round = 0; round < 4; round++) {
      if (!this.#decoded) {
        this.#ensureDirects();
        const plain = this.replica.events().flatMap((event) => {
          const d = this.#decode(event);
          return d ? [d] : [];
        });
        const decoded = this.#approvedOnly([...plain.filter((d) => d.inner.kind !== KIND_CARRY), ...this.#trustedCarries(plain)]);
        // What a carry restates and we can read ourselves counts once, as read.
        // (and restated by several carries, once).
        const read = new Set(decoded.filter((d) => !d.carried).map((d) => d.id));
        this.#decoded = decoded.filter((d) => !d.carried || (!read.has(d.id) && (read.add(d.id), true))).sort((a, b) => replicaOrder(a.event, b.event));
        this.#decodedRevision++;
        this.#decodedGeneration++;
        this.#bySpace.clear();
        this.#spaceCache.clear();
        this.#stateCache.clear();
        for (const d of this.#decoded) {
          if (!d.space) continue;
          const list = this.#bySpace.get(d.space.id);
          if (list) list.push(d);
          else this.#bySpace.set(d.space.id, [d]);
        }
      }
      if (!this.#takeBoardKeys(this.#decoded)) break;
    }
    return this.#decoded!;
  }

  /**
   * A new event: decode just it and put it in its place (replica order: time,
   * signer, seq). Events that change keys or rights make everything decode
   * again instead, the next time it's needed (they are rare): key events change
   * which signers count, and new space or board keys (taken before this runs)
   * have already dropped the decoded events.
   */
  #decodedAdd(event: WeaveRecord): void {
    const decoded = this.#decoded;
    if (!decoded) return;
    // A v2 event standing for a v1 event already decoded (same id, re-signed): decode again, so it replaces it (rare).
    if (isWireItemV2(event.wire) && event.wire.e.was && decoded.some((x) => x.id === event.id)) {
      this.#decoded = undefined;
      return;
    }
    if (KEY_KINDS.has(event.kind)) {
      this.#decoded = undefined;
      return;
    }
    this.#ensureDirectFor(event.signer);
    const d = this.#decode(event);
    if (!d || !this.#agentCounts(d)) return;
    // An approval makes an agent's earlier events count: decode again (rare).
    if (d.inner.kind === KIND_AGENT_APPROVE) {
      this.#decoded = undefined;
      return;
    }
    // A carry restates many events at their own times: decode everything again (they are rare).
    if (d.inner.kind === KIND_CARRY) {
      this.#decoded = undefined;
      return;
    }
    if (d.inner.kind === KIND_SHRED)
      setImmediate(() => {
        try {
          this.#applyShreds();
        } catch {
          // closed in the meantime: the next start applies it
        }
      });
    let lo = 0;
    let hi = decoded.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (replicaOrder(decoded[mid].event, event) <= 0) lo = mid + 1;
      else hi = mid;
    }
    decoded.splice(lo, 0, d);
    this.#decodedRevision++;
    if (d.space) {
      const id = d.space.id;
      const list = this.#bySpace.get(id) ?? [];
      let a = 0;
      let b = list.length;
      while (a < b) {
        const mid = (a + b) >>> 1;
        if (replicaOrder(list[mid].event, event) <= 0) a = mid + 1;
        else b = mid;
      }
      list.splice(a, 0, d);
      this.#bySpace.set(id, list);
      this.#spaceRevision.set(id, (this.#spaceRevision.get(id) ?? 0) + 1);
      if (classOf(canonicalKind(d.inner.kind)) === 'control') this.#controlRevision.set(id, (this.#controlRevision.get(id) ?? 0) + 1);
    }
    // A board key for us makes more events readable: that drops the decoded events (see #takeBoardKeys).
    if (d.inner.kind === KIND_BOARD_KEY) this.#takeBoardKeys([d]);
  }

  /** A result computed from all decoded events, kept until they change. Callers must not change what it returns. */
  #memo<T>(name: string, compute: () => T): T {
    this.#decodeAll();
    const hit = this.#memos.get(name);
    if (hit && hit.revision === this.#decodedRevision) return hit.value as T;
    const value = compute();
    this.#memos.set(name, { revision: this.#decodedRevision, value });
    return value;
  }

  /** The decoded events of one space, in replica order. */
  #decodedIn(spaceId: string): Decoded[] {
    this.#decodeAll();
    return this.#bySpace.get(spaceId) ?? [];
  }

  /** The cache slot of a space, emptied when the space's events or everything decoded changed. */
  #cacheFor(spaceId: string): { key: string; entries?: Entry[]; access?: Access; accessFor?: SpaceState } {
    this.#decodeAll();
    const key = `${this.#decodedGeneration}:${this.#spaceRevision.get(spaceId) ?? 0}`;
    let slot = this.#spaceCache.get(spaceId);
    if (slot?.key !== key) {
      slot = { key };
      this.#spaceCache.set(spaceId, slot);
    }
    return slot;
  }

  /** For tests: the ids of the decoded events, as kept up to date or (rebuild) decoded from scratch. */
  _decodedIds(rebuild = false): string[] {
    if (rebuild) this.#decoded = undefined;
    return this.#decodeAll().map((d) => d.id);
  }

  /** Keep board keys boxed to us; true if any was new (then everything is decoded again). */
  #takeBoardKeys(decoded: Decoded[]): boolean {
    const changed = new Set<StoredSpace>();
    for (const d of decoded) {
      if (d.inner.kind !== KIND_BOARD_KEY || d.space?.kind !== 'project') continue;
      const id = d.id;
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
    return this.#memo('graph', () => {
      const edges: EdgeEvent[] = this.#decodeAll()
        .filter((d) => (EDGE_KINDS as readonly string[]).includes(d.inner.kind))
        .map((d) => ({ author: d.event.author, kind: d.inner.kind, body: d.inner.body, time: d.event.time, signer: d.event.signer, seq: d.event.seq }));
      return socialGraph(edges);
    });
  }

  /** Authors I blocked or muted: their events are left out of feeds. */
  #hiddenAuthors(): Set<Did> {
    return this.#memo('hidden', () => {
      const mine = this.#graph().get(this.identity.author);
      return new Set([...(mine?.blocked ?? []), ...(mine?.muted ?? [])]);
    });
  }

  /**
   * Your own events are always shown to you: after joining offline, your node
   * can't confirm your membership until it has synced the founder's events.
   */
  #mine = (event: WeaveRecord): boolean => event.author === this.identity.author;

  /** A space's readable events from members, as entries for the collaboration functions. */
  #entries(space: StoredSpace): Entry[] {
    const slot = this.#cacheFor(space.id);
    if (slot.entries) return slot.entries;
    const state = this.#state(space);
    const entries = this.#decodedIn(space.id)
      .filter((d) => this.#mine(d.event) || visibleIn(state, d.event, d.inner))
      .map((d) => ({ id: d.id, event: d.event, kind: d.inner.kind, body: d.inner.body }));
    return (slot.entries = space.kind === 'project' ? this.#writable(space, state, entries) : entries);
  }

  // ---------------------------------------------------------------- internals: board access

  #access(space: StoredSpace, state: SpaceState, entries: Entry[]): Access {
    // Cached only for the space's own state and entries (callers sometimes pass others).
    const slot = this.#cacheFor(space.id);
    if (slot.access && slot.accessFor === state && slot.entries === entries) return slot.access;
    const access = accessOf(entries, state, inviteRightsOf(entries, state));
    if (slot.entries === entries) Object.assign(slot, { access, accessFor: state });
    return access;
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
        this.replica.write(this.identity, sealFor(this.#cipher(project), { kind: KIND_ROSTER, body: { group: id, members: roster } }));
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
        this.replica.write(this.identity, sealFor(this.#cipher(project), boardKeyFor(project, board, epoch, key, readers, this.#encryptionKeyOf)));
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
        this.replica.write(this.identity, sealFor(this.#cipher(project), boardKeyFor(project, board, epoch, key, missing, this.#encryptionKeyOf)));
        changed++;
      }
    }
    return changed;
  }

  /** An event by full id or a unique prefix (at least 6 characters), limited to some kinds. */
  #find(ref: string, kinds: string[]): Decoded & { id: string } {
    if (!ref || ref.length < 6) throw new Error('use at least 6 characters of the id');
    const matches = this.#decodeAll().filter((d) => kinds.includes(d.inner.kind) && d.id.startsWith(ref));
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
      id: event.id,
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

/** Where new Weave versions are announced: release posts in the Weave project, and its repository. */
const UPDATE_SOURCE = { project: 'NqgQwm_P6I0gtnQDnZKURw', repo: 'martldennl/Weave' };
/** Where the farewell to v0.3 peers sends them. */
const RELEASES_URL = `https://github.com/${UPDATE_SOURCE.repo}/releases/latest`;

/** A promise that gives up after `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timed out')), ms).unref())]);
}

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
