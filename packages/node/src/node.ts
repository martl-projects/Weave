import { spawnSync } from 'node:child_process';
import {
  accessOf,
  accountsOf,
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
  mayAct,
  mayActAt,
  KIND_SETTLE,
  joinProof,
  inviteKeys,
  type RevokedHead,
  canonicalJson,
  verifyEventV2,
  isWellFormedV2,
  innerHash,
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
  KIND_INVITE_CLOSE,
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
  parseOnchainPrice,
  erc20BalanceOf,
  TRANSFER_TOPIC,
  asEthSign,
  execTransactionData,
  KIND_SAFE_PROPOSAL,
  KIND_SAFE_SIGNATURE,
  parseSafeTx,
  SAFE_CALLS,
  safeProposalsOf,
  safeSigner,
  safeTxTypedData,
  erc20Transfer,
  formatUnits,
  KIND_SHOW,
  KIND_TICKET,
  KIND_TICKET_RECORD,
  KIND_TICKET_REQUEST,
  MULTI_SEND_CALL_ONLY,
  multiSendData,
  openTicket,
  openTicketRequest,
  parseShowSplit,
  payouts,
  safeBatch,
  showOpen,
  showSaltNonce,
  showsOf,
  TEST_USDC,
  ticketFor,
  ticketRequest,
  type Show,
  isTxHash,
  type OnchainPrice,
  type PaymentCheck,
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
  KIND_PROPOSAL_CLOSE,
  closingUpTo,
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
  badgesOf,
  checksumAddress,
  isAddress,
  KIND_LABEL,
  KIND_SAFE_RETIRED,
  retiredOf,
  walletHistoryOf,
  KIND_TREASURY,
  KIND_TREASURY_SPLIT,
  KIND_WALLET,
  KIND_WALLET_CHECKED,
  contractWalletCheck,
  contractWalletLinks,
  contractWalletSaysYes,
  labelsOf,
  labelTarget,
  parseLabelTarget,
  safeDeployment,
  splitDeployedCall,
  splitDeployment,
  splitSalt,
  splitAllocations,
  splitRecipients,
  treasuriesOf,
  WEAVE_FOUNDATION_PROJECT,
  parseShares,
  safeAddress,
  SPLIT_PRESETS,
  splitOf,
  TREASURY_CHAIN,
  treasurySaltNonce,
  treasuryThreshold,
  verifyWalletProof,
  walletMessage,
  walletsOf,
  type Split,
  BADGE_LIMIT_MAX,
  KIND_BADGE,
  KIND_BADGE_SERIES,
  KIND_BADGE_TRANSFER,
  KIND_BADGE_NOTE,
  BADGE_NOTE_MAX,
  badgeNoteHash,
  parseBadgeLimit,
  type Badge,
  type BadgeSeries,
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
  type AppImage,
  type AppInstall,
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
  type GumroadInfo,
  type HarnessInfo,
  type PermissionRequest,
  type AppOpen,
  type HubGitHub,
  type RepoInfo,
  type SpaceRepos,
  type MembershipRequestInfo,
  type BadgeInfo,
  type BadgeSeriesInfo,
  type LabelInfo,
  type PaymentRequestInfo,
  type SafeProposalInfo,
  type ShowInfo,
  type ShowSettlement,
  type TicketInfo,
  type SplitContractInfo,
  type SplitInfo,
  type TreasuryInfo,
  type WalletInfo,
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
  type CompanyAgentInfo,
  type CompanyDeviceInfo,
  type CompanyInfo,
  type ConsoleRole,
  type CreateCompanyInput,
  type LinkInfo,
  type ScimInfo,
  type ConsoleInfo,
  type SignInStatus,
  type AuditStreamInfo,
  type ExportLine,
  noAgent,
} from './backend.ts';
import { loadConfig, saveConfig, type Config } from './config.ts';
import { FileStore } from './filestore.ts';
import { openStore, type SqliteStore } from './sqlitestore.ts';
import { readJson, resolveHome, writeJson, type Home } from './home.ts';
import { keystoresHere, moveHomeKey, readSecretJson, vaultOf, writeSecretJson, type Keystore } from './vault.ts';
import { envCredentials, providerFor, type KeyProvider, type ProviderSpec, type VaultCredentials } from './keyproviders.ts';
import { entryState, harnessesIn, writeEntry, type McpLaunch } from './harnesses.ts';
import { guessPlatform, platformKey, saveVerified, tagFolder, unpack } from './appinstall.ts';
import { checkGistProof, DEFAULT_GITHUB_APP, finishDeviceFlow, GitHub, GITHUB_CLIENT_ID, githubInstallUrl, lookUpGitHubApp, type GitHubApp, startDeviceFlow, type DeviceCode, type Fetch, type ReleaseAsset } from './github.ts';
import { createHash, createPublicKey, createVerify, hkdfSync, createHmac } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join as joinPath, resolve as resolvePath } from 'node:path';
import { homedir, hostname } from 'node:os';
import { LiveRooms, portOpen } from './live.ts';
import { createAndSaveAgent, loadAgents, saveAgent, loadEncryptionKeys, loadIdentity, saveDevice, saveEncryptionKeys, type AgentKey, type EncryptionKey } from './keystore.ts';
import { acquireLock } from './lock.ts';
import { emptyDirectory, findPerson, groupsOf, hashToken, newScimToken, scimHandle, startScimServer, tokenMatches, type ScimDirectory, type ScimRequest, type ScimResponse } from './scim.ts';
import { checkAuthority, deviceProof, inspectDevice } from './devices.ts';
import { machinePolicy } from './machine.ts';
import { browserSignIn, claimsOf, delegatedToken, openInBrowser, refreshSignIn, signInNonce, type SignInTokens } from './signin.ts';
import { startConsole } from './console.ts';
import { decodeNodeAnswer, decodeNodeRequest, encodeNodeAnswer, encodeNodeRequest } from './company.ts';
import { imageDigest, imageLocation } from './registry.ts';
import { invitationMail, mailServer, sendMail } from './mail.ts';
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
import { checkOnchainPayment, ethCall, rpc, type PaymentChecker } from './onchain.ts';
import { checkGumroadLicense, createGumroadMembership, GUMROAD_CLIENT_ID, gumroadAccount, startGumroadSignIn, type GumroadSignIn, type LicenseCheck, type LicenseChecker } from './gumroad.ts';
import { loadSpaces, removeSpace, saveSpace, type StoredSpace } from './spacestore.ts';
import { ManagedKeys } from './managed.ts';
import { Forgetting, type ForgettingCore } from './retention.ts';
import { Holding, type HoldingCore } from './holding.ts';
import { Repos, type ReposCore } from './repos.ts';
import { Apps, type AppsCore } from './apps.ts';
import { Payments, type PaymentsCore } from './payments.ts';
import { Badges, type BadgesCore } from './badges.ts';
import { Companies, type CompaniesCore } from './companies.ts';
export { verifyIdToken } from './companies.ts';
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
export const SELF_SCOPE = 'self';




/** An event as this node can read it, before names are resolved. */
export interface Decoded {
  event: WeaveRecord;
  /** Restated in a carry, not decoded from the event itself (see #expandCarry). */
  carried?: true;
  /** The event's id (a re-signed event's old v1 id), as stored. */
  id: string;
  inner: Inner;
  space?: StoredSpace;
  /** For events of a read-limited board: which board (they were sealed with its key). */
  board?: string;
  /** For those: what the event sealed, still under the board's key (with its salt), for a carry to restate checkably. */
  outer?: Inner;
  private?: true;
}

/** The order replica.events() returns: claimed time, then signer, then seq. */
const replicaOrder = (a: WeaveRecord, b: WeaveRecord): number => a.time.localeCompare(b.time) || a.signer.localeCompare(b.signer) || a.seq - b.seq;

/** Stage 4: how long everyone online holds a pulled space's content, how long what you open stays kept, and how many hold each event by share. */
export const RECENT_HOLD_MS = 14 * 24 * 3600 * 1000;

/** Every space of ours (but direct chats) and its keys, in our own space, for our always-on nodes (stage 18). */
export const KIND_NODE_INDEX = 'weave.node.index';
/** What an always-on node's key may sign: hosting your rooms. Everything else it writes, everyone else drops. */
export const NODE_PERMISSIONS = ['weave.room', 'weave.room.*'];
/** Always-on nodes' keys are named "node:<name>" among your keys. */
const NODE_PREFIX = 'node:';


/** Stage 8: live content per author per space and hour, by how far this node trusts them there. */
export const DAY_MS = 24 * 3600 * 1000;
const BUDGETS = {
  trusted: { events: 1200, bytes: 10 * 1024 * 1024 },
  member: { events: 300, bytes: 2 * 1024 * 1024 },
  newcomer: { events: 60, bytes: 512 * 1024 },
};

/** For the audit: what an event says, without keys, boxes, wrapped parts or ciphertext. */
const SECRET_FIELDS = new Set(['boxes', 'box', 'wrapped', 'ct', 'nonce', 'key', 'keys', 'secret', 'boards']);
export function withoutSecrets(value: Json): Json {
  if (Array.isArray(value)) return value.map(withoutSecrets);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([k]) => !SECRET_FIELDS.has(k)).map(([k, v]) => [k, withoutSecrets(v as Json)]));
  return value;
}

/** A promoted server's generation (nQ9JHlUV): { generation }. */
const KIND_GENERATION = 'weave.org.generation';

/** An escrow's key: its key service part and its company part, both needed. */
const escrowKey = (kmsPart: Uint8Array, companyPart: Uint8Array): Uint8Array => new Uint8Array(createHash('sha256').update('weave/escrow/v2').update(kmsPart).update(companyPart).digest());

/**
 * An event as a carry restates it: what it said, with its original signed
 * envelope (`e`) and the salt sealed with it, so that anyone can check the
 * restatement against its author's signature (the envelope signs the salted
 * hash of what it sealed, ih) without the key it was sealed with.
 */
export const carriedItem = (d: { id: string; event: { author: Did; signer: Did; seq: number; time: string; wire?: unknown }; inner: { kind: string; body: Json; salt?: string }; outer?: Inner }) => ({
  id: d.id,
  author: d.event.author,
  signer: d.event.signer,
  seq: d.event.seq,
  time: d.event.time,
  kind: d.inner.kind,
  body: d.inner.body,
  ...(isWireItemV2(d.event.wire) ? { e: d.event.wire.e as unknown as Json } : {}),
  // A read-limited board's event sealed its board blob: that's what the envelope signs, so that's what's checked (then opened with the board's key).
  ...(d.outer ? { sealed: { kind: d.outer.kind, body: d.outer.body } as unknown as Json, ...(d.outer.salt ? { salt: d.outer.salt } : {}) } : d.inner.salt ? { salt: d.inner.salt } : {}),
});

/** Content kinds that are a space's latest state, restated for newcomers along with its control events (see #carry). */
export const CARRIED_STATE = new Set(['weave.project.page', 'weave.app', 'weave.channel', 'weave.curate', 'weave.theme']);

const EDGE_KIND: Record<EdgeInput['edge'], string> = { follow: KIND_FOLLOW, block: KIND_BLOCK, mute: KIND_MUTE };
const DEFAULT_PAGE: ProjectPage = { title: '', subtitle: '', body: '', description: '', status: 'active', public: false };

/**
 * One person's node: their keys, their replica of the logs they know, the
 * groups and projects they belong to, and optionally a live connection to
 * peers. The CLI uses it directly when no daemon runs; the daemon wraps it
 * with networking and the HTTP API.
 */
/** Why a person's repository can't follow a space, and what to do about it. */
export const personalRepo = (repo: string) =>
  `${repo} belongs to a personal GitHub account, and those can't give anyone read-only access: GitHub refuses the invitations. Move it to a GitHub organization (free; on GitHub: the repository's Settings → Transfer), install the Weave app there, and link it again`;


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
    mayJoin: (room, person) => this.#appsHere.mayJoin(room, person),
    servicePort: (room) => this.#appsHere.roomService(room)?.port,
    personHeader: (room, person) => this.#appsHere.personHeader(room, person),
    seed: (roomId) => this.#appsHere.roomSeed(roomId),
    nameOf: (did) => this.nameOf(did),
    changed: () => this.#appsHere.emitLive(),
  });
  #liveListeners = new Set<(notice?: Notice) => void>();
  /** Watchers told where the app should take its person (see openInApp). */
  #openListeners = new Set<(open: AppOpen) => void>();
  /** How license keys are checked with Gumroad (tests put a fake here). */
  checkLicense: LicenseChecker = checkGumroadLicense;
  /** How payments on chain are checked (tests put a fake here). */
  checkPayment: PaymentChecker = checkOnchainPayment;
  /** How contracts are read on chain (eth_call; tests put a fake here). */
  callChain: typeof ethCall = ethCall;
  /** Other reads from a chain (block numbers, logs; tests put a fake here). */
  chainRpc: typeof rpc = rpc;
  /** How memberships are made on Gumroad (tests put a fake here). */
  makeGumroadMembership: typeof createGumroadMembership = createGumroadMembership;
  /** How Gumroad gets connected: the Weave application, the browser sign-in and who's connected (tests put fakes here). */
  gumroadSetup = { clientId: GUMROAD_CLIENT_ID, signIn: (clientId: string) => startGumroadSignIn(clientId), account: (token: string) => gumroadAccount(token) };
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
  /**
   * Containers (Weave and Docker): the registry API is reached with `fetch`; `docker` is the Docker command line
   * (WEAVE_DOCKER: a path, or a JSON list of a program and its first arguments). Tests use stand-ins.
   */
  containerSetup: { fetch: Fetch; docker: string[] } = {
    fetch: (...args) => fetch(...args),
    docker: process.env.WEAVE_DOCKER?.trim().startsWith('[') ? (JSON.parse(process.env.WEAVE_DOCKER) as string[]) : [process.env.WEAVE_DOCKER || 'docker'],
  };
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
    roomPort: async (roomId) => this.#appsHere.roomPort(roomId),
  });
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
    // The key service sees the node through this narrow view (managed.ts).
    const node = this;
    this.#managed = new ManagedKeys({
      home,
      replica: this.replica,
      get identity() {
        return node.identity;
      },
      clock: () => this.clock(),
      spaces: this.#spaces,
      state: (space) => this.#state(space),
      saveSpace: (space) => this.#saveSpace(space),
      invalidateDecoded: () => (this.#decoded = undefined),
      validUntil: (t) => (this.#decodedValidUntil = Math.min(this.#decodedValidUntil, t)),
      credentials: () => this.#kmsCredentials(),
    });
    this.#companies = new Companies(this, {
      state: this.#state.bind(this),
      decodedIn: this.#decodedIn.bind(this),
      get managed() {
        return node.#managed;
      },
      memo: this.#memo.bind(this),
      get spaces() {
        return node.#spaces;
      },
      createSpace: this.#createSpace.bind(this),
      space: this.#space.bind(this),
      keysForNewcomers: this.#keysForNewcomers.bind(this),
      entryPoint: this.#entryPoint.bind(this),
      get encryptionKeyOf() {
        return node.#encryptionKeyOf;
      },
      upTo: this.#upTo.bind(this),
      anchor: this.#anchor.bind(this),
      get held() {
        return node.#retention.held.bind(node.#retention);
      },
      epochStarts: this.#epochStarts.bind(this),
      get directs() {
        return node.#directs;
      },
      decodeAll: this.#decodeAll.bind(this),
      agentName: this.#agentName.bind(this),
      get sqlite() {
        return node.#sqlite;
      },
      tryOpen: this.#tryOpen.bind(this),
      rotateKey: this.#rotateKey.bind(this),
      spaceInfo: this.#spaceInfo.bind(this),
      invalidateDecoded: this.#invalidateDecoded.bind(this),
    });
    // More concern modules, each over its own narrow core:
    this.#retention = new Forgetting(this, {
      space: this.#space.bind(this),
      state: this.#state.bind(this),
      get managed() {
        return node.#managed;
      },
      spaceInfo: this.#spaceInfo.bind(this),
      get spaces() {
        return node.#spaces;
      },
      spacePosts: this.#spacePosts.bind(this),
      aroundPosts: this.#aroundPosts.bind(this),
      entries: this.#entries.bind(this),
      invalidateDecoded: this.#invalidateDecoded.bind(this),
      decodedIn: this.#decodedIn.bind(this),
      board: this.#board.bind(this),
      get companies() {
        return node.#companies;
      },
      epochStarts: this.#epochStarts.bind(this),
      sealForSelf: this.#sealForSelf.bind(this),
      expandCarry: this.#expandCarry.bind(this),
      saveSpace: this.#saveSpace.bind(this),
    });
    this.#holding = new Holding(this, {
      ensureDirects: this.#ensureDirects.bind(this),
      get directs() {
        return node.#directs;
      },
      get spaces() {
        return node.#spaces;
      },
      state: this.#state.bind(this),
      get managed() {
        return node.#managed;
      },
      friends: this.#friends.bind(this),
      selfSecret: this.#selfSecret.bind(this),
      invalidateDecoded: this.#invalidateDecoded.bind(this),
      keysOnly: this.#keysOnly.bind(this),
      sealForSelf: this.#sealForSelf.bind(this),
      selfBodies: this.#selfBodies.bind(this),
      get isLinkedNode() {
        return node.#isLinkedNode;
      },
      addSpace: this.#addSpace.bind(this),
      spaceName: this.#spaceName.bind(this),
      actor: this.#actor.bind(this),
      get held() {
        return node.#retention.held.bind(node.#retention);
      },
      space: this.#space.bind(this),
      decodedIn: this.#decodedIn.bind(this),
      get swarm() {
        return node.#swarm;
      },
      spacePosts: this.#spacePosts.bind(this),
      follows: this.#follows.bind(this),
    });
    this.#repos = new Repos(this, {
      space: this.#space.bind(this),
      state: this.#state.bind(this),
      entries: this.#entries.bind(this),
      actor: this.#actor.bind(this),
      agentMay: this.#agentMay.bind(this),
      access: this.#access.bind(this),
      get spaces() {
        return node.#spaces;
      },
      selfBodies: this.#selfBodies.bind(this),
      sealForSelf: this.#sealForSelf.bind(this),
    });
    this.#appsHere = new Apps(this, {
      project: this.#project.bind(this),
      agentMay: this.#agentMay.bind(this),
      maintainerState: this.#maintainerState.bind(this),
      state: this.#state.bind(this),
      entries: this.#entries.bind(this),
      get spaces() {
        return node.#spaces;
      },
      get githubAuth() {
        return node.#repos.githubAuth.bind(node.#repos);
      },
      get live() {
        return node.#live;
      },
      get payments() {
        return node.#payments;
      },
      get badges() {
        return node.#badges;
      },
      get githubApp() {
        return node.#repos.githubApp.bind(node.#repos);
      },
      get swarm() {
        return node.#swarm;
      },
      space: this.#space.bind(this),
      get managed() {
        return node.#managed;
      },
      selfSecret: this.#selfSecret.bind(this),
      get liveListeners() {
        return node.#liveListeners;
      },
    });
    this.#payments = new Payments(this, {
      createSpace: this.#createSpace.bind(this),
      get encryptionKeyOf() {
        return node.#encryptionKeyOf;
      },
      entryPoint: this.#entryPoint.bind(this),
      sealForSelf: this.#sealForSelf.bind(this),
      selfBodies: this.#selfBodies.bind(this),
      tryOpen: this.#tryOpen.bind(this),
      state: this.#state.bind(this),
      get managed() {
        return node.#managed;
      },
      keysForNewcomers: this.#keysForNewcomers.bind(this),
      direct: this.#direct.bind(this),
      get spaces() {
        return node.#spaces;
      },
      eventsOf: this.#eventsOf.bind(this),
      upTo: this.#upTo.bind(this),
      anchor: this.#anchor.bind(this),
      saveSpace: this.#saveSpace.bind(this),
      space: this.#space.bind(this),
      entries: this.#entries.bind(this),
      get seenAt() {
        return node.#seenAt;
      },
      maintainerState: this.#maintainerState.bind(this),
      project: this.#project.bind(this),
    });
    this.#badges = new Badges(this, {
      project: this.#project.bind(this),
      maintainerState: this.#maintainerState.bind(this),
      get encryptionKeyOf() {
        return node.#encryptionKeyOf;
      },
      tryOpen: this.#tryOpen.bind(this),
      get spaces() {
        return node.#spaces;
      },
      state: this.#state.bind(this),
    });
    // A standby server follows the active one and signs nothing: it shares the active one's device key (stage 14).
    if (loadConfig(home).standby) this.#companies.refuseWrites();
    this.blobs = new BlobStore(home.blobs);
    this.config = loadConfig(home);
    this.#agents = loadAgents(home);
    // Secrets read only now and then (tokens, pairings) are sealed right away, not when first needed.
    for (const file of [this.#repos.githubFile, this.#payments.gumroadFile, this.#appsHere.appSettingsFile, joinPath(home.dir, 'remote.json')]) readSecretJson(home, file);
    for (const space of loadSpaces(home)) this.#spaces.set(space.id, space);
    this.#managed.loadHalves();
    // A newer server of this identity took over while we were away: stand down (nQ9JHlUV).
    for (const r of this.replica.events((e) => e.kind === KIND_GENERATION && e.author === this.identity.author)) this.#companies.seeGeneration(r);

    // Pick up keys handed to us — new epochs and whole spaces — now and whenever they arrive.
    const isKeys = (e: WeaveRecord) => canonicalKind(e.kind) === KIND_REKEY || e.kind === KIND_GIFT;
    for (const event of this.replica.events(isKeys)) this.#takeKeys(event);
    this.replica.admit = this.#admit;
    this.replica.onAppend((event) => {
      if (event.kind === KIND_GENERATION && event.author === this.identity.author) this.#companies.seeGeneration(event);
      // When it arrived: where a notice period must not depend on the date its author claims (#seenAt).
      if (event.kind === KIND_SEALED || canonicalKind(event.kind) === KIND_REKEY) this.#arrivals.set(event.id, new Date(this.clock()).toISOString());
      const scoped = event.kind === KIND_SEALED && !event.missing ? (parseScope(event.scope)?.id ?? '') : '';
      const kept = scoped ? this.#managed.rawCache.get(scoped) : undefined;
      const space = scoped ? (this.#spaces.get(scoped) ?? this.#directs.get(scoped)?.space) : undefined;
      // A company half or setting arriving changes which key opens what: decode again.
      if (kept && space && this.#managed.takeRaw(space, kept, event)) this.#invalidateDecoded();
      if (isKeys(event)) this.#takeKeys(event);
      this.#decodedAdd(event);
      // A new encryption key (mine or a peer's) adds an epoch to direct chats.
      if (event.kind === KIND_ROTATE) this.#forgetDirects();
      // Key events change whose events count for whom; anything else joins its author's list, in order.
      if (KEY_KINDS.has(event.kind)) this.#personEvents.clear();
      if (event.kind === KIND_ORG_FREEZE) this.#invalidateDecoded();
      if (event.kind === KIND_ORG_POLICY && event.scope === 'public' && this.#companies.policyCache) this.#companies.takePolicy(event);
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
  static create(name: string, dir?: string, options: { writeVersion?: 1 | 2; org?: Did; words?: string } = {}): { node: WeaveNode; words: string } {
    const home = resolveHome(dir);
    if (loadIdentity(home)) throw new Error(`an identity already exists in ${home.dir}`);
    const managed = machinePolicy();
    if (managed.companyOnly && !options.org) throw new Error('this computer is managed by a company: only company accounts are set up here (weave enroll)');
    if (options.org && managed.companies?.length && !managed.companies.includes(options.org)) throw new Error("this computer is managed by another company: its accounts aren't set up here");
    const words = options.words ?? newRecoveryWords();
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
  static async enroll(link: string, dir: string | undefined, options: { idToken?: string | ((bind: { nonce: string }) => string); name?: string; open?: (url: string) => void | Promise<void> }): Promise<WeaveNode> {
    const enrollment = decodeEnrollment(link);
    // The identity's words first: the sign-in is asked for it (its nonce names it, see signInNonce).
    const fresh = newRecoveryWords();
    const author = recoveryRoot(fresh, 0).did;
    // Without a token: the company's sign-in, in the browser (its refresh token keeps the account signed in).
    let tokens: SignInTokens | undefined;
    if (typeof options.idToken === 'function') {
      const salt = b64u.encode(new Uint8Array(randomBytes(16)));
      tokens = { idToken: options.idToken({ nonce: signInNonce(author, salt) }), salt, expires: 0 };
    } else if (options.idToken) {
      // A token from elsewhere can't name this new identity in its nonce: the company would never vouch for it (0siqvEzB).
      throw new Error("a new company account signs in through the company's sign-in page: run weave enroll <link> without a token");
    } else {
      if (!enrollment.signIn) throw new Error("this enrollment link doesn't say where to sign in: ask your company for a new link");
      tokens = await browserSignIn(enrollment.signIn, options.open ?? openInBrowser, { for: author });
    }
    const { idToken, salt } = tokens;
    const name = options.name?.trim() || nameFromToken(idToken) || 'New colleague';
    const { node, words } = WeaveNode.create(name, dir, { org: enrollment.company, words: fresh });
    node.#companies.saveSso({ idToken, ...(salt ? { salt } : {}), expires: (claimsOf(idToken).exp ?? 0) * 1000, ...(tokens.refreshToken ? { refreshToken: tokens.refreshToken } : {}), ...(enrollment.signIn ?? {}) });
    await node.addContact(encodeContact({ v: 1, did: enrollment.company, name: enrollment.name, entry: enrollment.entry }));
    // The company group is under the company's key service: the join is written once it unlocks (see #continueEnrollment).
    const { invite, proof } = await node.#takeInvite(enrollment.invite);
    writeSecretJson(node.home, node.#companies.enrollFile, { group: enrollment.group, invite, ...(proof ? { proof } : {}), words, idToken, ...(salt ? { salt } : {}) } satisfies Enrolling);
    await node.#companies.continueEnrollment();
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

  /**
   * An always-on node's request (stage 18), made on the server, NAS or cluster in an empty home: a key of its own,
   * kept sealed here. One of your devices answers it (linkNode); then completeNodeLink sets this home up.
   */
  static nodeRequest(dir: string | undefined, name: string): string {
    const home = resolveHome(dir);
    if (loadIdentity(home)) throw new Error(`an identity already exists in ${home.dir}`);
    const clean = name.trim().replace(/\s+/g, '-').slice(0, 32) || 'always-on';
    const keys = generateKeyPair();
    writeSecretJson(home, joinPath(home.dir, 'node-link.json'), { secretKey: b64u.encode(keys.secretKey), publicKey: b64u.encode(keys.publicKey), name: clean });
    return encodeNodeRequest(didFromPublicKey(keys.publicKey), clean);
  }

  /**
   * Answer an always-on node's request (stage 18), on one of your devices: its key may host your rooms and nothing
   * else, and it gets your encryption keys and your spaces (but direct chats) boxed to that key, so it can keep them
   * and host while your computers are off. Revoke it like an agent, in Keys & devices.
   */
  async linkNode(input: { request: string }): Promise<{ answer: string; key: Did; name: string }> {
    const me = this.identity.author;
    const mine = this.replica.authority.grant(this.identity.did);
    if (this.identity.did !== me && mine?.role !== 'device') throw new Error('link always-on nodes from one of your own computers');
    const { key, name } = decodeNodeRequest(input.request);
    if (this.replica.authority.grant(key)) throw new Error('that node is linked already');
    this.replica.write(this.identity, delegation(key, 'agent', NODE_PERMISSIONS, `${NODE_PREFIX}${name}`));
    this.#writeNodeIndex(true);
    // Who you are (and what you're called) and who signs for you: the node checks its own key against them from the start.
    const authority = new Set(['weave.identity', 'weave.rotate', 'weave.delegate', 'weave.revoke', KIND_PROFILE]);
    const payload = {
      person: me,
      name: this.nameOf(me) ?? null,
      encryption: this.#encryption.map((k) => ({ did: k.did, publicKey: b64u.encode(k.keys.publicKey), secretKey: b64u.encode(k.keys.secretKey) })),
      events: this.replica.events().filter((e) => e.author === me && authority.has(canonicalKind(e.kind))) as unknown as Json[],
      spaces: this.#nodeSpaces() as unknown as Json[],
      bootstrap: this.config.bootstrap as unknown as Json,
    };
    return { answer: encodeNodeAnswer(me, boxTo(key, payload as unknown as Json) as unknown as Json), key, name };
  }

  /** Set up this home as your always-on node from a device's answer (stage 18). It keeps everything (archive) and hosts your rooms. */
  static async completeNodeLink(answer: string, dir?: string): Promise<WeaveNode> {
    const home = resolveHome(dir);
    const file = joinPath(home.dir, 'node-link.json');
    const kept = readSecretJson<{ secretKey: string; publicKey: string; name: string }>(home, file);
    if (!kept) throw new Error('no node request in this home: run weave node pair first');
    const { person } = decodeNodeAnswer(answer);
    let payload: { person: Did; encryption: Array<{ did: Did; publicKey: string; secretKey: string }>; events: unknown[]; spaces: StoredSpace[]; bootstrap?: Array<{ host: string; port: number }> };
    try {
      payload = openBox(b64u.decode(kept.secretKey), b64u.decode(kept.publicKey), decodeNodeAnswer(answer).box as unknown as Box) as unknown as typeof payload;
    } catch {
      throw new Error("this answer is for another node's request");
    }
    if (payload.person !== person) throw new Error('node answer is damaged');
    const keys = { publicKey: b64u.decode(kept.publicKey), secretKey: b64u.decode(kept.secretKey) };
    saveEncryptionKeys(home, payload.encryption.map((k) => ({ did: k.did, keys: { publicKey: b64u.decode(k.publicKey), secretKey: b64u.decode(k.secretKey) } })));
    saveDevice(home, { author: person, did: didFromPublicKey(keys.publicKey), keys });
    const config = loadConfig(home);
    saveConfig(home, { ...config, archive: true, ...(payload.bootstrap?.length && !config.bootstrap.length ? { bootstrap: payload.bootstrap } : {}) });
    const node = WeaveNode.open(home.dir);
    for (const event of payload.events) node.replica.ingest(event);
    if (node.replica.authority.grant(node.identity.did)?.author !== person) {
      await node.close();
      throw new Error("the answer doesn't vouch for this node's key: link it again");
    }
    for (const space of payload.spaces) if (space?.id && !node.#spaces.has(space.id)) await node.#addSpace({ ...space, entry: { topics: [person], bootstrap: [] } });
    await node.join(person);
    rmSync(file, { force: true });
    return node;
  }

  /** This node is someone's always-on node (stage 18): it signs with a node key, not a device's. */
  get #isLinkedNode(): boolean {
    return this.replica.authority.grant(this.identity.did)?.name?.startsWith(NODE_PREFIX) === true;
  }

  /** Our spaces for our always-on nodes: all but direct chats, with their keys. */
  #nodeSpaces(): unknown[] {
    return [...this.#spaces.values()]
      .filter((s) => s.kind !== 'direct' && !this.#directs.has(s.id))
      .map((s) => ({ ...this.#keysOnly(s), ...(s.boards ? { boards: s.boards } : {}), ...(s.shredded ? { shredded: s.shredded } : {}) }));
  }

  /** Written by our devices while we have always-on nodes: every space of ours they should keep and host. When it changes. */
  #writeNodeIndex(force = false): number {
    if (this.#isLinkedNode) return 0;
    const me = this.identity.author;
    const linked = this.replica.authority.grantsOf(me).some((g) => g.role === 'agent' && g.name?.startsWith(NODE_PREFIX) && g.revokedAfter === undefined);
    if (!linked) return 0;
    const body = { spaces: this.#nodeSpaces() };
    const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    if (!force && hash === this.#nodeIndexHash) return 0;
    this.replica.write(this.identity, this.#sealForSelf({ kind: KIND_NODE_INDEX, body: body as unknown as Json }));
    this.#nodeIndexHash = hash;
    return 1;
  }

  #nodeIndexHash?: string;

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
    for (const { room } of this.#appsHere.allRooms()) if (room.open && room.host === this.identity.author) await this.#live.host(room).catch(() => {});
    await this.#remote.start().catch((error: Error) => console.error(`weave: phones can't connect: ${error.message}`));
  }

  async goOffline(): Promise<void> {
    await this.#appsHere.shutdownApps();
    await this.#remote.close();
    await this.#live.close();
    await this.#swarm?.destroy();
    this.#swarm = undefined;
  }

  /** Go offline and release the home for other processes. */
  async close(): Promise<void> {
    // Company halves of new keys must be published first: without them, nobody else (and no later run) opens what they sealed.
    await Promise.race([Promise.all([...this.#managed.halves.keys()].map((id) => this.#managed.publishHalf(id))), new Promise((r) => setTimeout(r, 15_000).unref())]);
    await this.#companies.scimServer?.close();
    this.#companies.scimServer = undefined;
    await this.#companies.console?.close();
    this.#companies.console = undefined;
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
    // An always-on node hosts its person's rooms; everyone else would drop anything else it signed (stage 18).
    if (!input.as && this.#isLinkedNode && !permits(NODE_PERMISSIONS, input.kind)) throw new Error(`this is ${this.nameOf(this.identity.author) ?? 'your'} always-on node: it keeps spaces and hosts rooms, and doesn't post or change anything for them (${input.kind})`);
    // Readers would cut anything longer: refuse instead, so nothing is shortened without the author knowing.
    checkTextFields(input.body);
    let inner: Inner = { kind: input.kind, body: input.body ?? null };
    const space = input.space ? this.#space(input.space) : undefined;
    if (space && space.kind !== 'direct' && this.#state(space).closed) throw new Error(`${space.name} is closed: it's kept as it is, read-only`);
    if (space && input.as && this.#state(space).managed && !this.#state(space).approvedAgents?.has(signer.did))
      throw new Error(`agent "${input.as}" isn't approved in ${space.name}: those who manage it can approve it (weave approve-agent "${space.name}" ${this.nameOf(this.identity.author) ?? this.identity.author}/${input.as})`);
    if (space?.kind === 'project') inner = this.#forBoard(space, inner);
    const fields: EventFields = space ? sealFor(await this.#managed.cipherReady(space), inner) : inner;
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
    if (input.description) this.replica.write(this.identity, sealFor(this.#managed.cipher(project), { kind: KIND_PAGE, body: { ...DEFAULT_PAGE, body: input.description, description: summary(input.description) } }));
    return this.project(project.id);
  }

  async invite(ref: string, hours = 24 * 7, options: InviteOptions = {}): Promise<string> {
    const space = this.#space(ref);
    const state = this.#state(space);
    if (space.kind === 'direct') throw new Error('a direct chat is between two people; start a group to talk with more');
    if (state.closed) throw new Error(`${space.name} is closed`);
    if (state.tier && !mayAct(state, this.identity.author, 'invite').ok) throw new Error(`only ${this.nameOf(state.founder) ?? 'its creator'} lets people into ${space.name}`);
    // Our own new space, before its creation is folded in, is ours to invite to.
    const allowed = mayAct(state, this.identity.author, 'invite').ok || (space.kind !== 'project' && this.#mineFounder(space));
    if (!allowed) throw new Error(space.kind === 'project' ? 'only maintainers can invite people into a project' : `you are not a member of ${space.name}`);
    if (options.access?.length && space.kind !== 'project') throw new Error('board rights are for projects');
    const boards = space.kind === 'project' ? this.#spacePosts(space).boards : [];
    const access: BoardRight[] = (options.access ?? []).map((r) => ({ board: this.#board(space, boards, r.board).name, ...(r.read ? { read: true } : {}), ...(r.write ? { write: true } : {}) }));
    // The space reads the link's public key as its id; the link keeps the secret one (inviteKeys).
    const { invite, key } = inviteKeys();
    const expires = new Date(Date.now() + hours * 3600_000).toISOString();
    const body: Record<string, Json> = { invite, expires, key: true };
    if (access.length) body.access = access as unknown as Json;
    if (options.accept) body.accept = true;
    this.replica.write(this.identity, sealFor(this.#managed.cipher(space), { kind: KIND_INVITE, body }));
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
    return encodeInvite({ v: 2, space: this.#keysForNewcomers(space), invite, key, inviter: this.identity.author, expires, entry: this.#entryPoint(), ...(boardKeys ? { boards: boardKeys } : {}) });
  }

  async joinSpace(text: string, note?: string): Promise<SpaceInfo> {
    if (isKnockLink(text)) return this.#knock(text, note ?? '');
    const { space, invite, proof } = await this.#takeInvite(text);
    this.replica.write(this.identity, sealFor(this.#managed.cipher(space), { kind: KIND_JOIN, body: { invite, ...(proof ? { proof } : {}) } }));
    return this.#spaceInfo(space);
  }

  /** An invite's space and keys, kept here; the join itself is written by the caller. */
  async #takeInvite(text: string): Promise<{ space: StoredSpace; invite: string; proof?: string }> {
    const invite = decodeInvite(text);
    const held = this.#spaces.get(invite.space.id);
    if (held) {
      // Removed, and asked back with a new link (_Ak3UUmp): the space as it is now, keys added to the ones we kept.
      const state = this.#state(held);
      if (!state.removed.has(this.identity.author) || state.members.has(this.identity.author)) throw new Error(`you are already in ${invite.space.name}`);
      for (const [epoch, key] of Object.entries(invite.space.keys)) if (!held.keys[epoch]) held.keys[epoch] = key;
      held.via = invite.inviter;
      if (invite.boards) for (const [board, epochs] of Object.entries(invite.boards)) held.boards = { ...held.boards, [board]: { ...held.boards?.[board], ...epochs } };
      this.#saveSpace(held);
      return { space: held, invite: invite.invite, ...(invite.key ? { proof: joinProof(invite.key, spaceScope(held), this.identity.author) } : {}) };
    }
    const inside = this.#companies.insideOnly(invite.space.founder);
    if (inside) throw new Error(inside);
    this.#adoptBootstrap(invite.entry);
    const space: StoredSpace = { ...invite.space, entry: invite.entry, via: invite.inviter, ...(invite.boards ? { boards: invite.boards } : {}) };
    await this.#addSpace(space);
    return { space, invite: invite.invite, ...(invite.key ? { proof: joinProof(invite.key, spaceScope(space), this.identity.author) } : {}) };
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
      this.replica.write(this.identity, sealFor(this.#managed.cipher(space), { kind: KIND_ADMIT, body: { member, invite } }));
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
  /** Does letting someone in now need a fresh key, so they don't read what came before (history joining, or 30d with an older key)? */
  #needsFreshKey(space: StoredSpace, state: SpaceState = this.#state(space)): boolean {
    const history = state.history?.value ?? 'all';
    const start = this.#epochStarts(space).get(currentEpoch(space)) ?? '';
    return history === 'joining' || (history === '30d' && start < new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString());
  }

  #keysForNewcomers(space: StoredSpace): SpaceKeys {
    const state = this.#state(space);
    const history = state.history?.value ?? 'all';
    const starts = this.#epochStarts(space);
    // Only a manager's new key counts for the others (T3a83nLy): when one is needed, nobody else lets people in, or they'd read it all.
    const fresh = this.#needsFreshKey(space, state);
    if (fresh && !mayAct(state, this.identity.author, 'manage').ok) {
      throw new Error(`${space.name} lets newcomers read only from when they come: only those who manage it let people in while that needs a new key`);
    }
    if (fresh) {
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
    if (events.length) this.replica.write(this.identity, sealFor(this.#managed.cipher(space), { kind: KIND_CARRY, body: { events: events as unknown as Json } }));
  }

  /**
   * A carry becomes the events it restates, each checked against its original
   * envelope: signed by its author's key, in this space, sealing exactly what
   * the carry says (ih). Who wrote it and when come from that envelope, never
   * from the carry. Items that can't be checked count only in our own private
   * carries (`unchecked`): anyone else could make them up.
   */
  #expandCarry(d: Decoded, space: StoredSpace | undefined = d.space as StoredSpace | undefined, unchecked = false): Decoded[] {
    if (d.inner.kind !== KIND_CARRY || !space) return [];
    const items = (d.inner.body as { events?: unknown } | null)?.events;
    if (!Array.isArray(items)) return [];
    const scope = spaceScope(space);
    const out: Decoded[] = [];
    for (const item of items as Array<Record<string, unknown>>) {
      if (typeof item?.kind !== 'string') continue;
      const inner = { kind: item.kind, body: (item.body ?? null) as Json };
      const e = item.e;
      // What the envelope signed: the inner itself, or for a read-limited board its sealed blob, which must open (board key) to exactly the inner.
      const sealed = item.sealed as { kind?: unknown; body?: unknown } | undefined;
      const signed = sealed && typeof sealed.kind === 'string' ? { kind: sealed.kind, body: (sealed.body ?? null) as Json } : inner;
      const opened = signed === inner ? undefined : space.kind === 'project' ? openBoard(space, signed, space.boards) : undefined;
      const opensTo = signed === inner || (!!opened && opened.kind === inner.kind && canonicalJson(opened.body) === canonicalJson(inner.body));
      if (isWellFormedV2(e) && typeof item.salt === 'string' && e.kind === KIND_SEALED && e.space === scope && e.ih === innerHash({ ...signed, salt: item.salt }) && opensTo && verifyEventV2(e)) {
        const id = canonicalIdV2(e);
        if (!this.replica.authority.check(recordOfV2(id, e, undefined)).ok) continue;
        const event: WeaveRecord = { ...d.event, id, author: e.author, signer: e.signer, seq: e.n, cseq: e.class === 'control' ? e.seq : undefined, cs: e.class === 'content' ? e.cs : undefined, time: e.time, body: null };
        out.push({ id, event, inner, space, carried: true, ...(d.board ? { board: d.board } : {}) });
        continue;
      }
      if (!unchecked || typeof item.id !== 'string' || !isDid(item.author) || !isDid(item.signer) || typeof item.time !== 'string' || !Number.isSafeInteger(item.seq)) continue;
      const event: WeaveRecord = { ...d.event, id: item.id, author: item.author, signer: item.signer, seq: item.seq as number, cseq: undefined, cs: undefined, time: item.time, body: null };
      out.push({ id: item.id, event, inner, space, carried: true, ...(d.board ? { board: d.board } : {}) });
    }
    return out;
  }

  /**
   * The events restated in carries. Whoever wrote a carry vouches for nothing:
   * every item is checked against its author's own signature (#expandCarry), so
   * a carry from anyone holding the space's key restates only what was really
   * written there. Our own private carries (what we wrote, kept before keys were
   * shredded) count as they are.
   */
  #trustedCarries(decoded: Decoded[]): Decoded[] {
    return decoded
      .filter((d) => d.inner.kind === KIND_CARRY)
      .flatMap((d) => {
        if (d.private) {
          // Our own: {space, events} kept in our private space.
          const space = this.#spaces.get(String((d.inner.body as { space?: unknown } | null)?.space ?? ''));
          return d.event.author === this.identity.author && space ? this.#expandCarry(d, space, true) : [];
        }
        return this.#expandCarry(d, d.space as StoredSpace | undefined).filter((x) => !this.#retention.forgottenCarried().has(x.id));
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
      return !this.#managed.managedRaw(space).setting || of(space).has(d.event.signer);
    });
  }

  /** One new event: does it count, by the space's state as known (see #approvedOnly)? */
  #agentCounts(d: Decoded): boolean {
    const space = d.space as StoredSpace | undefined;
    if (!space || d.event.signer === d.event.author || this.replica.authority.grant(d.event.signer)?.role !== 'agent' || !this.#managed.managedRaw(space).setting) return true;
    return !!this.#state(space).approvedAgents?.has(d.event.signer);
  }

  // ---------------------------------------------------------------- audit (stage 9.3)

  async audit(input: { space: string; since?: string; until?: string }): Promise<AuditLine[]> {
    const space = this.#space(input.space);
    const since = input.since ? new Date(input.since).toISOString() : '';
    // Up to the end of `until` (stage 15): a date alone means that whole day.
    const until = input.until ? (/^\d{4}-\d{2}-\d{2}$/.test(input.until) ? `${input.until}T23:59:59.999Z` : new Date(input.until).toISOString()) : '\uffff';
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
      if (d.event.time < since || d.event.time > until) continue;
      if (classOf(canonicalKind(d.inner.kind)) !== 'control' && d.inner.kind !== KIND_ESCROW_OPENED && d.inner.kind !== KIND_POST_DELETE) continue;
      lines.push(line(d.event.time, d.inner.kind, d.event.author, d.event.signer, d.inner.body, d.id));
    }
    // New keys: who rotated, which epoch (the boxes stay out).
    for (const r of this.replica.events((e) => e.scope === scope && canonicalKind(e.kind) === KIND_REKEY && e.time >= since && e.time <= until)) {
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
    // The words are sealed with a fresh key made of two parts (XyMStMvo): one goes through the key service, so opening is in
    // its audit; the other is boxed to the company itself (the space's owner). A key service context is no access rule:
    // every employee may decrypt with it, so its part alone must not be enough. Only the company opens an escrow.
    const kmsPart = new Uint8Array(randomBytes(32));
    const companyPart = new Uint8Array(randomBytes(32));
    const context = this.#escrowContext(space, this.identity.author);
    const sealed = seal(escrowKey(kmsPart, companyPart), words, `weave/escrow/v2:${context.space}`);
    const wrapped = await this.#managed.provider(setting).wrap(kmsPart, context);
    const boxed = boxTo(this.#encryptionKeyOf(space.founder), b64u.encode(companyPart));
    this.replica.write(this.identity, sealFor(this.#managed.cipher(space), { kind: KIND_ESCROW, body: { person: this.identity.author, v: 2, wrapped, boxed: boxed as unknown as Json, nonce: sealed.nonce, ct: sealed.ct } }));
  }

  async openEscrow(input: { space: string; person: string; for?: string }): Promise<string> {
    const space = this.#space(input.space);
    const state = this.#state(space);
    if (!state.managed) throw new Error(`${space.name} isn't a company space`);
    if (!mayAct(state, this.identity.author, 'manage').ok) throw new Error(`only those who manage ${space.name} open an escrow`);
    const person = this.resolve(input.person);
    const request = input.for ? decodeRecoveryRequest(input.for) : undefined;
    if (!request && this.replica.authority.keys(person).org)
      throw new Error(`${this.nameOf(person) ?? person}'s identity belongs to the company: its words go only to the new computer (there: weave recover-request; here: --for <request>)`);
    const escrow = this.#decodedIn(space.id)
      .filter((d) => d.inner.kind === KIND_ESCROW && d.event.author === person && (d.inner.body as { person?: unknown } | null)?.person === person)
      .at(-1)?.inner.body as { v?: number; wrapped: string; boxed?: Box; nonce: string; ct: string } | undefined;
    if (!escrow) throw new Error(`${this.nameOf(person) ?? person} left no recovery words in ${space.name}`);
    const context = this.#escrowContext(space, person);
    let words: string;
    if (escrow.v === 2) {
      // The company's part first: without it, the key service's part opens nothing, and isn't asked.
      const companyPart = escrow.boxed && this.#tryOpen((me) => {
        try {
          return openBox(me.keys.secretKey, me.keys.publicKey, escrow.boxed!) as string;
        } catch {
          return undefined;
        }
      });
      if (typeof companyPart !== 'string') throw new Error(`only ${this.nameOf(space.founder) ?? 'the company'} opens recovery words: ask through the company's admin console`);
      const kmsPart = await this.#managed.provider(state.managed).unwrap(escrow.wrapped, context);
      words = open(escrowKey(kmsPart, b64u.decode(companyPart)), { nonce: escrow.nonce, ct: escrow.ct }, `weave/escrow/v2:${context.space}`) as string;
    } else {
      // Escrows from before v2 went through the key service alone (any employee could open them): leave new ones.
      const dataKey = await this.#managed.provider(state.managed).unwrap(escrow.wrapped, context);
      words = open(dataKey, { nonce: escrow.nonce, ct: escrow.ct }, `weave/escrow/v1:${context.space}`) as string;
    }
    this.replica.write(this.identity, sealFor(this.#managed.cipher(space), { kind: KIND_ESCROW_OPENED, body: { person, ...(request ? { for: request } : {}) } }));
    return request ? encodeRecoveryAnswer(person, boxTo(request, { words }) as unknown as Json) : words;
  }

  async approveAgent(input: { space: string; agent: string; on?: boolean }): Promise<SpaceInfo> {
    const space = this.#space(input.space);
    const state = this.#state(space);
    if (!state.managed) throw new Error(`${space.name} isn't a company space: agents act wherever their person lets them`);
    if (!mayAct(state, this.identity.author, 'manage').ok) throw new Error(`only those who manage ${space.name} approve agents there`);
    this.replica.write(this.identity, sealFor(this.#managed.cipher(space), { kind: KIND_AGENT_APPROVE, body: { agent: this.#agentKey(input.agent), on: input.on !== false } }));
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

  /**
   * The rekeys that count in a space (Gr9S4DLf): by someone who managed it as
   * of the rekey (mayActAt 'manage'), for an epoch we hold. Rekeys are in the clear:
   * anyone in the space can write one, dated as they like. Its time is its date,
   * but never later than when it got here.
   */
  #countingRekeys(space: StoredSpace, state: SpaceState = this.#state(space)): Array<{ epoch: number; time: string; seen: string }> {
    const scope = spaceScope(space);
    return this.replica
      .events((r) => canonicalKind(r.kind) === KIND_REKEY && r.scope === scope)
      .flatMap((e) => {
        const epoch = (e.body as { epoch?: unknown } | null)?.epoch;
        if (!Number.isSafeInteger(epoch) || !space.keys[String(epoch)] || !mayActAt(state, e, 'manage').ok) return [];
        const seen = this.#seenAt(e);
        return [{ epoch: epoch as number, time: e.time < seen ? e.time : seen, seen }];
      });
  }

  /** When each of a space's epochs began: the earliest rekey to it that counts (the epoch number is in the clear). */
  #epochStarts(space: StoredSpace): Map<number, string> {
    const starts = new Map<number, string>();
    for (const r of this.#countingRekeys(space)) if (!(starts.get(r.epoch)! <= r.time)) starts.set(r.epoch, r.time);
    return starts;
  }

  /** A space whose newcomers read the last 30 days gets a new key once its key is older than that, if we may rotate it. */
  #rotateMonthly(space: StoredSpace): number {
    const state = this.#state(space);
    const forgets = (space.kind !== 'group' && [...boardRulesOf(this.#entries(space), this.#managers(state), this.#seenAt).values()].some((r) => r.keepDays)) || !!this.#companies.companyRetention(space)?.maxDays;
    if (space.kind === 'direct' || (state.history?.value !== '30d' && !forgets) || !mayAct(state, this.identity.author, 'manage').ok) return 0;
    const start = this.#epochStarts(space).get(currentEpoch(space)) ?? '';
    if (start >= new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()) return 0;
    this.#rotateKey(space);
    return 1;
  }

  /**
   * Keys from rekeys that don't count after all (their author had lost the role
   * by then, as a demotion or removal made at the same time shows): kept to read
   * what was sealed with them, never used to seal. Whoever took one before
   * hearing of the loss falls back to the key everyone else seals with.
   */
  #settleEpochKeys(space: StoredSpace): number {
    if (space.kind === 'direct') return 0;
    const state = this.#state(space);
    if (!state.cutoffs?.some((c) => c.managed)) return 0;
    const scope = spaceScope(space);
    const counts = new Map<string, boolean>();
    for (const e of this.replica.events((x) => x.scope === scope && canonicalKind(x.kind) === KIND_REKEY)) {
      const opened = this.#tryOpen((me) => openRekey(e, me));
      if (!opened) continue;
      const epoch = String(opened.epoch);
      counts.set(epoch, (counts.get(epoch) ?? false) || mayActAt(state, e, 'manage').ok);
    }
    let moved = 0;
    for (const [epoch, ok] of counts) {
      if (ok || !space.keys[epoch]) continue;
      (space.alternates ??= {})[epoch] = [...new Set([...(space.alternates[epoch] ?? []), space.keys[epoch]])];
      delete space.keys[epoch];
      moved++;
    }
    if (moved) this.#saveSpace(space);
    return moved;
  }

  /** A new key for a space, boxed to everyone in it. */
  #rotateKey(space: StoredSpace): void {
    const { fields, epoch, key } = rekey(space, [...this.#state(space).members.keys()], this.#encryptionKeyOf);
    space.keys[String(epoch)] = key;
    this.#saveSpace(space);
    this.replica.write(this.identity, fields);
    this.#managed.afterRekey(space, epoch, key);
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
    const attested = state.managed?.attestor ? this.#companies.attestations(space, state.managed.attestor) : new Map();
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
      ...(this.#companies.companyVouchedOf(m.did) ? { company: this.nameOf(this.#companies.companyVouchedOf(m.did)!) ?? 'a company' } : {}),
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
    this.replica.write(this.identity, sealFor(this.#managed.cipher(space), { kind: KIND_LEAVE, body: { upTo: this.#upTo(this.identity.author), at: this.#anchor(this.identity.author, space) } }));
    // Our node stops following it: keys gone, topics left. The space's history in the logs stays unreadable here.
    this.#spaces.delete(space.id);
    this.#invalidateDecoded();
    removeSpace(this.home, space.id);
    this.#announceNow();
    for (const topic of spaceTopics(space)) await this.#swarm?.leave(topic).catch(() => {});
  }

  async handOver(input: { space: string; to: string }): Promise<SpaceInfo> {
    const space = this.#space(input.space);
    const state = this.#state(space);
    if (space.kind === 'direct') throw new Error('a direct chat has no owner');
    if (!mayAct(state, this.identity.author, 'own').ok) throw new Error(`only the owner, ${this.nameOf(state.founder) ?? 'someone else'}, can hand ${space.name} over`);
    if (state.tier) throw new Error("a membership tier stays with its creator; take it off your hub instead");
    const to = this.resolve(input.to);
    if (to === this.identity.author) throw new Error("that's you");
    if (!state.members.has(to)) throw new Error(`${input.to} isn't in ${space.name}`);
    this.replica.write(this.identity, sealFor(this.#managed.cipher(space), { kind: KIND_HANDOVER, body: { to, upTo: this.#upTo(this.identity.author), at: this.#anchor(this.identity.author, space) } }));
    return this.#spaceInfo(space);
  }

  async setHistory(input: { space: string; history: HistorySetting }): Promise<SpaceInfo> {
    const space = this.#space(input.space);
    const state = this.#state(space);
    if (space.kind === 'direct') throw new Error('a direct chat is between two people: there are no newcomers');
    if (!HISTORIES.includes(input.history)) throw new Error('history is all (everything), 30d (the last 30 days) or joining (from their invite on)');
    if (!mayAct(state, this.identity.author, 'manage').ok) throw new Error(space.kind === 'group' ? `only the owner of ${space.name} decides what newcomers read` : `only the ${space.kind === 'community' ? 'moderators' : 'maintainers'} of ${space.name} decide what newcomers read`);
    if ((state.history?.value ?? 'all') !== input.history) this.replica.write(this.identity, sealFor(this.#managed.cipher(space), { kind: KIND_HISTORY, body: { history: input.history } }));
    return this.#spaceInfo(space);
  }

  async closeSpace(input: { space: string; closed: boolean }): Promise<SpaceInfo> {
    const space = this.#space(input.space);
    const state = this.#state(space);
    if (space.kind === 'direct') throw new Error("a direct chat can't be closed");
    if (!mayAct(state, this.identity.author, 'manage').ok) throw new Error(space.kind === 'group' ? `only the owner of ${space.name} can close it` : `only the ${space.kind === 'community' ? 'moderators' : 'maintainers'} of ${space.name} can close it`);
    if (!!state.closed === input.closed) return this.#spaceInfo(space);
    this.replica.write(this.identity, sealFor(this.#managed.cipher(space), { kind: KIND_CLOSE, body: { closed: input.closed } }));
    return this.#spaceInfo(space);
  }

  /** After people leave, a node that may rotate the key does: they can't read what comes next. */
  #rotateAfterLeaving(space: StoredSpace, state: SpaceState): number {
    if (space.kind === 'direct' || !mayAct(state, this.identity.author, 'manage').ok || !state.left.size) return 0;
    // A leave and a rekey after it, by their dates (never later than they got here) and by when they got here: a
    // leaver can date their leave early, but not make it arrive early; and only rekeys that count count (Gr9S4DLf).
    const latest = (times: string[]) => times.reduce((a, b) => (b > a ? b : a), '');
    const leaves = this.#decodedIn(space.id)
      .filter((d) => canonicalKind(d.inner.kind) === KIND_LEAVE && state.left.has(d.event.author))
      .map((d) => {
        const seen = this.#seenAt(d.event);
        return { time: d.event.time < seen ? d.event.time : seen, seen };
      });
    const rekeys = this.#countingRekeys(space, state);
    if (latest(leaves.map((l) => l.time)) <= latest(rekeys.map((r) => r.time)) && latest(leaves.map((l) => l.seen)) <= latest(rekeys.map((r) => r.seen))) return 0;
    const { fields, epoch, key } = rekey(space, [...state.members.keys()], this.#encryptionKeyOf);
    space.keys[String(epoch)] = key;
    this.#saveSpace(space);
    this.replica.write(this.identity, fields);
    this.#managed.afterRekey(space, epoch, key);
    return 1;
  }

  async removeMember(ref: string, who: string): Promise<void> {
    const space = this.#space(ref);
    const state = this.#state(space);
    if (!mayAct(state, this.identity.author, 'manage').ok) {
      throw new Error({ project: 'only maintainers can remove people from a project', community: 'only moderators can remove people from a community', group: 'only the group founder can remove members', direct: 'nobody can be removed from a direct chat' }[space.kind]);
    }
    const member = this.resolve(who);
    if (!state.members.has(member)) throw new Error(`${who} is not in ${space.name}`);
    if (member === state.founder) throw new Error(`the owner can't be removed from ${space.name}`);
    this.replica.write(this.identity, sealFor(await this.#managed.cipherReady(space), { kind: KIND_REMOVE, body: { member, upTo: this.#upTo(member), at: this.#anchor(member, space) } }));
    const remaining = [...state.members.keys()].filter((did) => did !== member);
    const { fields, epoch, key } = rekey(space, remaining, this.#encryptionKeyOf);
    space.keys[String(epoch)] = key;
    this.#saveSpace(space);
    this.replica.write(this.identity, fields);
    this.#managed.afterRekey(space, epoch, key);
  }

  // ---------------------------------------------------------------- communities

  async createCommunity(input: { name: string; description?: string }): Promise<CommunityInfo> {
    const community = await this.#createSpace('community', input.name);
    if (input.description) this.replica.write(this.identity, sealFor(this.#managed.cipher(community), { kind: KIND_PAGE, body: { description: input.description } }));
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
    this.replica.write(this.identity, sealFor(this.#managed.cipher(community), { kind: KIND_PAGE, body: { description: input.description ?? '' } }));
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
    if (space && this.#holding.pulled(space)) {
      // Opened: kept for 30 days, like anything you read.
      this.#holding.kept.ids[matches[0].id] = new Date(this.clock()).toISOString();
      this.#holding.saveKept();
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
    this.#appsHere.emitLive({
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
    this.#appsHere.emitLive();
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
    if (action === 'delete' && space && mayAct(this.#state(space), this.identity.author, 'curate').ok) return post;
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
    const forgetting = boardRulesOf(this.#entries(space), this.#managers(state), this.#seenAt);
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
    this.replica.write(this.identity, sealFor(this.#managed.cipher(project), { kind: KIND_BOARD_ACCESS, body: { board: board.name, read: read as unknown as Json, write: write as unknown as Json } }));
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
    this.replica.write(this.identity, sealFor(this.#managed.cipher(project), { kind: KIND_BOARD, body }));
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
    this.replica.write(this.identity, sealFor(this.#managed.cipher(space), { kind: KIND_CURATE, body: { board: board.name, pinned } }));
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
    // Badge pictures are public: holders show them next to their name.
    for (const series of this.#badges.allBadges().series) {
      const ref = parseBlobRef(series.image);
      if (!ref || this.#prefetched.has(ref.hash) || this.blobs.has(ref.hash)) continue;
      this.#prefetched.add(ref.hash);
      missing.push(ref.hash);
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
    this.replica.write(this.identity, sealFor(this.#managed.cipher(project), { kind: KIND_PROJECT_GROUP, body: { group: group.id, name: group.name, on: true } }));
    // Inviting the group is the consent for everyone in it right now.
    const newcomers = [...this.#state(group).members.keys()].filter((did) => !state.members.has(did));
    this.#admitAll(project, group, newcomers);
  }

  async uninviteGroup(input: { project: string; group: string }): Promise<void> {
    const project = this.#project(input.project);
    this.#maintainerState(project);
    const group = this.#knownGroup(project, input.group);
    this.replica.write(this.identity, sealFor(this.#managed.cipher(project), { kind: KIND_PROJECT_GROUP, body: { group: group.id, name: group.name, on: false } }));
  }

  async setRule(input: { project: string; group: string; auto: boolean }): Promise<void> {
    const project = this.#project(input.project);
    this.#maintainerState(project);
    const group = this.#knownGroup(project, input.group);
    this.replica.write(this.identity, sealFor(this.#managed.cipher(project), { kind: KIND_RULE, body: { group: group.id, auto: input.auto } }));
  }

  async admissions(ref?: string): Promise<Admission[]> {
    const projects = ref ? [this.#project(ref)] : [...this.#spaces.values()].filter((s) => s.kind === 'project');
    const out: Admission[] = [];
    for (const project of projects) {
      const state = this.#state(project);
      if (!mayAct(state, this.identity.author, 'group').ok) continue;
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
        if (mayAct(otherState, this.identity.author, 'group').ok && otherState.groups.has(group.id) && !otherState.groups.get(group.id)!.auto) {
          this.replica.write(this.identity, sealFor(this.#managed.cipher(other), { kind: KIND_RULE, body: { group: group.id, auto: true } }));
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
    this.replica.write(this.identity, sealFor(this.#managed.cipher(project), { kind: KIND_DECLINE, body: { member: this.resolve(input.who), via: group.id } }));
  }

  /**
   * Carry out standing rules: admit newcomers of auto-admitted groups (any
   * participant may), and remove those who left them (maintainers only).
   * The daemon calls this whenever new events arrive. Returns how many people
   * were admitted or removed.
   */
  async reconcile(): Promise<number> {
    // A standby only follows: no duties, no keys, no writes.
    if (this.config.standby) return 0;
    // A promoted server says which generation it is, once: an older one that comes back stands down when it hears.
    const generation = this.config.generation;
    if (generation && !this.replica.events((e) => e.kind === KIND_GENERATION && e.author === this.identity.author && (e.body as { generation?: unknown } | null)?.generation === generation).length) {
      this.replica.write(this.identity, { kind: KIND_GENERATION, body: { generation } });
    }
    this.#prefetchBlobs();
    let changed = (await this.#payments.expireMemberships()) + (await this.#payments.grantAutomatic()) + (await this.#payments.checkContractWallets()) + (await this.#payments.grantPaid()) + (await this.#payments.grantTickets()) + (await this.#payments.renewPaid()) + (await this.#payments.sendQueuedRequests()) + (await this.#repos.syncGithub());
    for (const space of [...this.#spaces.values()]) changed += this.#settleEpochKeys(space);
    changed += await this.#closeProposals();
    for (const space of [...this.#spaces.values()]) changed += this.#closeInvites(space);
    for (const space of [...this.#spaces.values()]) changed += this.#rotateAfterLeaving(space, this.#state(space));
    for (const space of [...this.#spaces.values()]) changed += this.#rotateMonthly(space);
    changed += this.#retention.applyShreds();
    changed += this.#retention.forget();
    changed += this.#holding.release();
    changed += await this.#companies.renewSignIn();
    for (const space of [...this.#spaces.values()]) if (this.#state(space).managed) await this.#managed.unlock(space);
    // Company halves of new keys: published (or tried again) before anything else uses them.
    await Promise.all([...this.#managed.halves.keys()].map((id) => this.#managed.publishHalf(id)));
    changed += await this.#companies.attest();
    changed += await this.#companies.applyDirectory();
    changed += await this.#companies.offboard();
    changed += this.#companies.anchorRemovals();
    changed += this.#companies.settleLosses();
    changed += await this.#companies.orgDuties();
    changed += await this.#companies.continueEnrollment();
    // Bookkeeping, not a change to anyone's spaces: the audit to the company's security tools.
    await this.#companies.streamAudit();
    await Promise.all([...this.#managed.halves.keys()].map((id) => this.#managed.publishHalf(id)));
    // Bookkeeping for keepers and always-on nodes, not a change to anyone's spaces. A node does none of its person's.
    if (!this.#isLinkedNode) {
      this.#holding.writeKeepIndex();
      this.#writeNodeIndex();
    }
    this.#holding.recoverSpaces();
    for (const project of [...this.#spaces.values()].filter((s) => s.kind === 'project')) {
      const state = this.#state(project);
      if (!state.members.has(this.identity.author)) continue;
      changed += await this.#reconcileBoards(project);
      const joins = new Map<string, Did[]>();
      for (const change of this.#changes(project, state)) {
        if (!state.groups.get(change.group.id)?.auto) continue;
        if (change.change === 'join') joins.set(change.group.id, [...(joins.get(change.group.id) ?? []), change.did]);
        else if (mayAct(state, this.identity.author, 'remove').ok) {
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

  // GitHub repositories that follow a space: sign-in, linking, members' read access: repos.ts (Repos). The node delegates.

  github(...args: Parameters<Repos['github']>): ReturnType<Repos['github']> {
    return this.#repos.github(...args);
  }

  setGithubApp(...args: Parameters<Repos['setGithubApp']>): ReturnType<Repos['setGithubApp']> {
    return this.#repos.setGithubApp(...args);
  }

  connectGithub(...args: Parameters<Repos['connectGithub']>): ReturnType<Repos['connectGithub']> {
    return this.#repos.connectGithub(...args);
  }

  disconnectGithub(...args: Parameters<Repos['disconnectGithub']>): ReturnType<Repos['disconnectGithub']> {
    return this.#repos.disconnectGithub(...args);
  }

  githubRepos(...args: Parameters<Repos['githubRepos']>): ReturnType<Repos['githubRepos']> {
    return this.#repos.githubRepos(...args);
  }

  spaceRepos(...args: Parameters<Repos['spaceRepos']>): ReturnType<Repos['spaceRepos']> {
    return this.#repos.spaceRepos(...args);
  }

  linkRepo(...args: Parameters<Repos['linkRepo']>): ReturnType<Repos['linkRepo']> {
    return this.#repos.linkRepo(...args);
  }

  shareGithub(...args: Parameters<Repos['shareGithub']>): ReturnType<Repos['shareGithub']> {
    return this.#repos.shareGithub(...args);
  }

  showGithubOnHub(...args: Parameters<Repos['showGithubOnHub']>): ReturnType<Repos['showGithubOnHub']> {
    return this.#repos.showGithubOnHub(...args);
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
    const github = this.#repos.hubGithub(did);
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
      ...((claim) => (claim && claim.vouched !== false ? { company: { ...this.#companies.companyOfPerson(did), ...(claim.vouched ? {} : { unconfirmed: true as const }) } } : {}))(this.#companies.companyClaim(did)),
      links: this.#companies.linksOf(did).filter((l) => l.state === 'linked'),
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

  // A project's app, installed and run by hosts, its API, settings and updates, and live rooms: apps.ts (Apps). The node delegates.

  projectApp(...args: Parameters<Apps['projectApp']>): ReturnType<Apps['projectApp']> {
    return this.#appsHere.projectApp(...args);
  }

  publishApp(...args: Parameters<Apps['publishApp']>): ReturnType<Apps['publishApp']> {
    return this.#appsHere.publishApp(...args);
  }

  appLaunch(...args: Parameters<Apps['appLaunch']>): ReturnType<Apps['appLaunch']> {
    return this.#appsHere.appLaunch(...args);
  }

  updateCheck(...args: Parameters<Apps['updateCheck']>): ReturnType<Apps['updateCheck']> {
    return this.#appsHere.updateCheck(...args);
  }

  appReleases(...args: Parameters<Apps['appReleases']>): ReturnType<Apps['appReleases']> {
    return this.#appsHere.appReleases(...args);
  }

  setAppFolder(...args: Parameters<Apps['setAppFolder']>): ReturnType<Apps['setAppFolder']> {
    return this.#appsHere.setAppFolder(...args);
  }

  launchApp(...args: Parameters<Apps['launchApp']>): ReturnType<Apps['launchApp']> {
    return this.#appsHere.launchApp(...args);
  }

  setAppSetting(...args: Parameters<Apps['setAppSetting']>): ReturnType<Apps['setAppSetting']> {
    return this.#appsHere.setAppSetting(...args);
  }

  appEnv(...args: Parameters<Apps['appEnv']>): ReturnType<Apps['appEnv']> {
    return this.#appsHere.appEnv(...args);
  }

  installApp(...args: Parameters<Apps['installApp']>): ReturnType<Apps['installApp']> {
    return this.#appsHere.installApp(...args);
  }

  installDone(...args: Parameters<Apps['installDone']>): ReturnType<Apps['installDone']> {
    return this.#appsHere.installDone(...args);
  }

  releaseApp(...args: Parameters<Apps['releaseApp']>): ReturnType<Apps['releaseApp']> {
    return this.#appsHere.releaseApp(...args);
  }

  stopApp(...args: Parameters<Apps['stopApp']>): ReturnType<Apps['stopApp']> {
    return this.#appsHere.stopApp(...args);
  }

  rooms(...args: Parameters<Apps['rooms']>): ReturnType<Apps['rooms']> {
    return this.#appsHere.rooms(...args);
  }

  hostRoom(...args: Parameters<Apps['hostRoom']>): ReturnType<Apps['hostRoom']> {
    return this.#appsHere.hostRoom(...args);
  }

  endRoom(...args: Parameters<Apps['endRoom']>): ReturnType<Apps['endRoom']> {
    return this.#appsHere.endRoom(...args);
  }

  joinRoom(...args: Parameters<Apps['joinRoom']>): ReturnType<Apps['joinRoom']> {
    return this.#appsHere.joinRoom(...args);
  }

  leaveRoom(...args: Parameters<Apps['leaveRoom']>): ReturnType<Apps['leaveRoom']> {
    return this.#appsHere.leaveRoom(...args);
  }

  roomChat(...args: Parameters<Apps['roomChat']>): ReturnType<Apps['roomChat']> {
    return this.#appsHere.roomChat(...args);
  }

  sayInRoom(...args: Parameters<Apps['sayInRoom']>): ReturnType<Apps['sayInRoom']> {
    return this.#appsHere.sayInRoom(...args);
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
    // Where we saw it, per space, up to that number (KgmsMa_g): numbers it left unused elsewhere can't be filled in later.
    const heads: Record<string, RevokedHead> = {};
    for (const { event } of this.replica.store.range2(key.did)) {
      if (event.n > afterSeq) continue;
      const head = (heads[event.space] ??= { c: 0, s: 0 });
      if (event.class === 'control') head.c = Math.max(head.c, event.seq);
      else if (event.cs !== undefined) (head.s = Math.max(head.s, event.cs)), (head.f = Math.min(head.f ?? Infinity, event.n));
    }
    const ownDevice = key.did === this.identity.did;
    if (key.role === 'agent' && !input.words) {
      if (ownDevice) throw new Error('that is this device');
      this.replica.write(this.identity, revocation(key.did, afterSeq, heads));
    } else {
      if (!input.words) throw new Error('revoking a device needs your recovery words');
      const root = this.#currentRoot(input.words);
      this.replica.write(root, revocation(key.did, afterSeq, heads));
      if (ownDevice) {
        // This computer keeps working with a fresh device key.
        const fresh = createSubKey(me);
        this.replica.write(root, delegation(fresh.did, 'device', ['*'], deviceName()));
        saveDevice(this.home, fresh);
        this.#identity = fresh;
        this.#invalidateDecoded();
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
    this.#invalidateDecoded();
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
      this.replica.append(this.#identity, sealFor(this.#managed.cipher(space), { kind: KIND_MSG, body: { text, moved: '0.4' } }));
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
    this.#invalidateDecoded();
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
    this.#invalidateDecoded();
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
    this.#invalidateDecoded();
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

  // Paid memberships, wallets, treasuries, Safe transactions and ticketed shows: payments.ts (Payments). The node delegates.

  createTier(...args: Parameters<Payments['createTier']>): ReturnType<Payments['createTier']> {
    return this.#payments.createTier(...args);
  }

  setTier(...args: Parameters<Payments['setTier']>): ReturnType<Payments['setTier']> {
    return this.#payments.setTier(...args);
  }

  gumroad(...args: Parameters<Payments['gumroad']>): ReturnType<Payments['gumroad']> {
    return this.#payments.gumroad(...args);
  }

  connectGumroad(...args: Parameters<Payments['connectGumroad']>): ReturnType<Payments['connectGumroad']> {
    return this.#payments.connectGumroad(...args);
  }

  disconnectGumroad(...args: Parameters<Payments['disconnectGumroad']>): ReturnType<Payments['disconnectGumroad']> {
    return this.#payments.disconnectGumroad(...args);
  }

  sellTierOnGumroad(...args: Parameters<Payments['sellTierOnGumroad']>): ReturnType<Payments['sellTierOnGumroad']> {
    return this.#payments.sellTierOnGumroad(...args);
  }

  tiers(...args: Parameters<Payments['tiers']>): ReturnType<Payments['tiers']> {
    return this.#payments.tiers(...args);
  }

  requestMembership(...args: Parameters<Payments['requestMembership']>): ReturnType<Payments['requestMembership']> {
    return this.#payments.requestMembership(...args);
  }

  membershipRequests(...args: Parameters<Payments['membershipRequests']>): ReturnType<Payments['membershipRequests']> {
    return this.#payments.membershipRequests(...args);
  }

  grantMembership(...args: Parameters<Payments['grantMembership']>): ReturnType<Payments['grantMembership']> {
    return this.#payments.grantMembership(...args);
  }

  declineMembership(...args: Parameters<Payments['declineMembership']>): ReturnType<Payments['declineMembership']> {
    return this.#payments.declineMembership(...args);
  }

  memberships(...args: Parameters<Payments['memberships']>): ReturnType<Payments['memberships']> {
    return this.#payments.memberships(...args);
  }

  queueMembershipRequest(...args: Parameters<Payments['queueMembershipRequest']>): ReturnType<Payments['queueMembershipRequest']> {
    return this.#payments.queueMembershipRequest(...args);
  }

  applyBundle(...args: Parameters<Payments['applyBundle']>): ReturnType<Payments['applyBundle']> {
    return this.#payments.applyBundle(...args);
  }

  walletMessage(...args: Parameters<Payments['walletMessage']>): ReturnType<Payments['walletMessage']> {
    return this.#payments.walletMessage(...args);
  }

  linkWallet(...args: Parameters<Payments['linkWallet']>): ReturnType<Payments['linkWallet']> {
    return this.#payments.linkWallet(...args);
  }

  wallet(...args: Parameters<Payments['wallet']>): ReturnType<Payments['wallet']> {
    return this.#payments.wallet(...args);
  }

  treasury(...args: Parameters<Payments['treasury']>): ReturnType<Payments['treasury']> {
    return this.#payments.treasury(...args);
  }

  splitContract(...args: Parameters<Payments['splitContract']>): ReturnType<Payments['splitContract']> {
    return this.#payments.splitContract(...args);
  }

  announceTreasury(...args: Parameters<Payments['announceTreasury']>): ReturnType<Payments['announceTreasury']> {
    return this.#payments.announceTreasury(...args);
  }

  sweepRetired(...args: Parameters<Payments['sweepRetired']>): ReturnType<Payments['sweepRetired']> {
    return this.#payments.sweepRetired(...args);
  }

  label(...args: Parameters<Payments['label']>): ReturnType<Payments['label']> {
    return this.#payments.label(...args);
  }

  labels(...args: Parameters<Payments['labels']>): ReturnType<Payments['labels']> {
    return this.#payments.labels(...args);
  }

  setSplit(...args: Parameters<Payments['setSplit']>): ReturnType<Payments['setSplit']> {
    return this.#payments.setSplit(...args);
  }

  proposeSafeTx(...args: Parameters<Payments['proposeSafeTx']>): ReturnType<Payments['proposeSafeTx']> {
    return this.#payments.proposeSafeTx(...args);
  }

  signSafeTx(...args: Parameters<Payments['signSafeTx']>): ReturnType<Payments['signSafeTx']> {
    return this.#payments.signSafeTx(...args);
  }

  safeProposals(...args: Parameters<Payments['safeProposals']>): ReturnType<Payments['safeProposals']> {
    return this.#payments.safeProposals(...args);
  }

  paymentRequest(...args: Parameters<Payments['paymentRequest']>): ReturnType<Payments['paymentRequest']> {
    return this.#payments.paymentRequest(...args);
  }

  findPayment(...args: Parameters<Payments['findPayment']>): ReturnType<Payments['findPayment']> {
    return this.#payments.findPayment(...args);
  }

  createShow(...args: Parameters<Payments['createShow']>): ReturnType<Payments['createShow']> {
    return this.#payments.createShow(...args);
  }

  cancelShow(...args: Parameters<Payments['cancelShow']>): ReturnType<Payments['cancelShow']> {
    return this.#payments.cancelShow(...args);
  }

  shows(...args: Parameters<Payments['shows']>): ReturnType<Payments['shows']> {
    return this.#payments.shows(...args);
  }

  buyTicket(...args: Parameters<Payments['buyTicket']>): ReturnType<Payments['buyTicket']> {
    return this.#payments.buyTicket(...args);
  }

  tickets(...args: Parameters<Payments['tickets']>): ReturnType<Payments['tickets']> {
    return this.#payments.tickets(...args);
  }

  settleShow(...args: Parameters<Payments['settleShow']>): ReturnType<Payments['settleShow']> {
    return this.#payments.settleShow(...args);
  }

  // Badges: series, badges given, transferred, notes: badges.ts (Badges). The node delegates.

  createBadgeSeries(...args: Parameters<Badges['createBadgeSeries']>): ReturnType<Badges['createBadgeSeries']> {
    return this.#badges.createBadgeSeries(...args);
  }

  setBadgeSeries(...args: Parameters<Badges['setBadgeSeries']>): ReturnType<Badges['setBadgeSeries']> {
    return this.#badges.setBadgeSeries(...args);
  }

  badgeSeries(...args: Parameters<Badges['badgeSeries']>): ReturnType<Badges['badgeSeries']> {
    return this.#badges.badgeSeries(...args);
  }

  giveBadge(...args: Parameters<Badges['giveBadge']>): ReturnType<Badges['giveBadge']> {
    return this.#badges.giveBadge(...args);
  }

  badges(...args: Parameters<Badges['badges']>): ReturnType<Badges['badges']> {
    return this.#badges.badges(...args);
  }

  transferBadge(...args: Parameters<Badges['transferBadge']>): ReturnType<Badges['transferBadge']> {
    return this.#badges.transferBadge(...args);
  }

  publishBadgeNote(...args: Parameters<Badges['publishBadgeNote']>): ReturnType<Badges['publishBadgeNote']> {
    return this.#badges.publishBadgeNote(...args);
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
    const maintainers = this.#state(space).maintainers;
    const byId = new Map(messagesOf(entries, {}, maintainers).concat(chat?.post ? messagesOf(entries, { post: chat.post }, maintainers) : []).map((m) => [m.id, m]));
    const channel = options.channel ? (channelName(options.channel) ?? DEFAULT_CHANNEL) : undefined;
    return messagesOf(entries, chat?.post ? { post: chat.post } : { channel }, maintainers)
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

  /** Take a chat message down: yours, or any in a space you maintain or moderate. It stays in the logs, out of sight. */
  async deleteMessage(input: { message: string; as?: string }): Promise<void> {
    const message = this.#find(input.message, [KIND_MSG, KIND_REPLY]);
    const space = message.space && this.#spaces.get(message.space.id);
    const mine = message.event.author === this.identity.author;
    if (!mine && !(space && mayAct(this.#state(space), this.identity.author, 'curate').ok))
      throw new Error(`only its author${space && space.kind !== 'direct' ? ` or the ${space.kind === 'community' ? 'moderators' : space.kind === 'project' ? 'maintainers' : 'owner'}` : ''} can delete a message`);
    await this.publish({ kind: KIND_POST_DELETE, body: { target: message.id }, space: space?.id, as: input.as });
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

  /** Close our invites that expired, naming who came in with each: later joins with them don't count, whatever date they claim. */
  #closeInvites(space: StoredSpace): number {
    if (space.kind === 'direct') return 0;
    const now = new Date(this.clock()).toISOString();
    const decoded = this.#decodedIn(space.id);
    const closed = new Set(decoded.filter((d) => d.inner.kind === KIND_INVITE_CLOSE && d.event.author === this.identity.author).map((d) => (d.inner.body as { invite?: unknown } | null)?.invite));
    let n = 0;
    for (const d of decoded) {
      if (canonicalKind(d.inner.kind) !== KIND_INVITE || d.event.author !== this.identity.author) continue;
      const b = (d.inner.body ?? {}) as { invite?: unknown; expires?: unknown };
      if (typeof b.invite !== 'string' || typeof b.expires !== 'string' || b.expires > now || closed.has(b.invite)) continue;
      const state = this.#state(space);
      const joined = [...state.members.values()].filter((m) => m.invite === b.invite).map((m) => m.did);
      this.replica.write(this.identity, sealFor(this.#managed.cipher(space), { kind: KIND_INVITE_CLOSE, body: { invite: b.invite, joined } }));
      closed.add(b.invite);
      n++;
    }
    return n;
  }

  /**
   * Close our proposals whose deadline passed: name the last number of each
   * voting key we hold, so votes signed later don't count, whatever date they
   * claim. Votes still on their way when we close don't count either.
   */
  async #closeProposals(): Promise<number> {
    const now = new Date(this.clock()).toISOString();
    let closed = 0;
    for (const space of [...this.#spaces.values()]) {
      if (space.kind !== 'project') continue;
      const entries = this.#entries(space);
      for (const p of entries) {
        if (p.kind !== KIND_PROPOSAL || p.event.author !== this.identity.author) continue;
        const deadline = typeof (p.body as { deadline?: unknown } | null)?.deadline === 'string' ? (p.body as { deadline: string }).deadline : '';
        if (!deadline || deadline > now) continue;
        if (entries.some((e) => e.kind === KIND_PROPOSAL_CLOSE && e.event.author === this.identity.author && (e.body as { proposal?: unknown } | null)?.proposal === p.id)) continue;
        await this.publish({ kind: KIND_PROPOSAL_CLOSE, body: { proposal: p.id, upTo: closingUpTo(p, entries) }, space: space.id });
        closed++;
      }
    }
    return closed;
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
    // A badge given or passed on to you: it shows on your hub, with its personal note if it has one.
    if ((item.kind === KIND_BADGE || item.kind === KIND_BADGE_TRANSFER) && body.to === me) {
      const badge = this.#badges.allBadges().badges.find((b) => b.id === (item.kind === KIND_BADGE ? item.id : body.badge));
      if (!badge || badge.invalid || badge.holder !== me) return undefined;
      const series = this.#badges.allBadges().series.find((s) => s.id === badge.series);
      if (!series || series.broken) return undefined;
      const name = `${series.symbol ? `${series.symbol} ` : ''}${series.name} #${badge.n}${series.limit ? ` of ${series.limit}` : ''}`;
      const text = item.kind === KIND_BADGE ? [badge.note ? `“${badge.note}”` : '', badge.personal ? 'With a personal note for you.' : ''].filter(Boolean).join(' ') : '';
      return { type: 'badge', category: 'activity', title: item.kind === KIND_BADGE ? `${who} gave you ${name}` : `${who} passed ${name} on to you`, text: snippet(text), open: { hub: me } };
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

  /** Bodies of your own self-sealed events of one kind. */
  #selfBodies(kind: string): Array<Record<string, unknown>> {
    return this.#memo(`self:${kind}`, () =>
      this.#decodeAll()
        .filter((d) => d.private && d.inner.kind === kind && d.inner.body && typeof d.inner.body === 'object')
        .map((d) => d.inner.body as Record<string, unknown>),
    );
  }

  /** When sealed events arrived in this run. */
  #arrivals = new Map<string, string>();
  /**
   * When this node first saw an event, kept in the home once a notice period
   * asks: where it must not depend on the date its author claims. Events from
   * before this run count from when they're first asked about: later, never sooner.
   */
  #seen?: Record<string, string>;
  #seenAt = (entry: { id: string }): string => {
    const file = joinPath(this.home.dir, 'seen.json');
    this.#seen ??= readSecretJson<Record<string, string>>(this.home, file) ?? {};
    let at = this.#seen[entry.id];
    if (!at) {
      at = this.#seen[entry.id] = this.#arrivals.get(entry.id) ?? new Date(this.clock()).toISOString();
      writeSecretJson(this.home, file, this.#seen);
    }
    return at;
  };

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
    if (!mayAct(state, this.identity.author, 'curate').ok) throw new Error(`only ${project.kind === 'community' ? 'moderators' : 'maintainers'} of ${project.name} can do that`);
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
    this.replica.write(this.identity, sealFor(this.#managed.cipher(space), { kind: KIND_MAINTAINER, body: { member, on, ...(on ? {} : { upTo: this.#upTo(member), at: this.#anchor(member, space) }) } }));
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
    const inside = this.#companies.insideOnly();
    if (inside) throw new Error(inside);
    const space: StoredSpace = { ...newSpace(kind, name.trim(), this.identity.author), entry: { topics: [], bootstrap: [] } };
    await this.#addSpace(space);
    this.replica.write(this.identity, sealFor(this.#managed.cipher(space), { kind: KIND_SPACE_CREATE, body: { name: space.name, ...extra } }));
    return space;
  }

  async #addSpace(space: StoredSpace): Promise<void> {
    this.#saveSpace(space);
    if (this.#swarm) await Promise.all([...spaceTopics(space), ...space.entry.topics].map((t) => this.#swarm!.join(t)));
  }

  #saveSpace(space: StoredSpace): void {
    this.#invalidateDecoded();
    // New keys may open its setting and halves: read them again.
    this.#managed.rawCache.delete(space.id);
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
      ...(this.#spaces.has(space.id) && this.#holding.pulled(space as StoredSpace) ? { pulled: { windowMs: RECENT_HOLD_MS } } : {}),
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
    return { spaces: () => this.#heldSpaces(), offerKeys: (items) => this.#offeredKeys(items), wantsBody: (space, id) => this.#holding.wantsBody(space, id), keep: this.#holding.keepAccess };
  }

  // ---------------------------------------------------------------- managed spaces (stage 6)

  /** How this node signs in to key services: a token, or the person's SSO token (see #ssoToken). Set by the app or by tests. */
  kmsCredentials?: VaultCredentials;
  /** Above this many members, a community's or project's content is held by its members between them. */
  pulledAbove = 12;
  /** For tests and service setups: this computer's device certificate and key (PEM), instead of the managed settings' files. */
  deviceCredentials?: { cert: string; key: string };
  // Company accounts, their sign-in, policy, audit streams, SCIM, the admin console: companies.ts (Companies). The node delegates.

  companySignIn(...args: Parameters<Companies['companySignIn']>): ReturnType<Companies['companySignIn']> {
    return this.#companies.companySignIn(...args);
  }

  signInStatus(...args: Parameters<Companies['signInStatus']>): ReturnType<Companies['signInStatus']> {
    return this.#companies.signInStatus(...args);
  }

  createCompany(...args: Parameters<Companies['createCompany']>): ReturnType<Companies['createCompany']> {
    return this.#companies.createCompany(...args);
  }

  company(...args: Parameters<Companies['company']>): ReturnType<Companies['company']> {
    return this.#companies.company(...args);
  }

  companyAction(...args: Parameters<Companies['companyAction']>): ReturnType<Companies['companyAction']> {
    return this.#companies.companyAction(...args);
  }

  enrollLink(...args: Parameters<Companies['enrollLink']>): ReturnType<Companies['enrollLink']> {
    return this.#companies.enrollLink(...args);
  }

  inviteByEmail(...args: Parameters<Companies['inviteByEmail']>): ReturnType<Companies['inviteByEmail']> {
    return this.#companies.inviteByEmail(...args);
  }

  link(...args: Parameters<Companies['link']>): ReturnType<Companies['link']> {
    return this.#companies.link(...args);
  }

  links(...args: Parameters<Companies['links']>): ReturnType<Companies['links']> {
    return this.#companies.links(...args);
  }

  addAuditStream(...args: Parameters<Companies['addAuditStream']>): ReturnType<Companies['addAuditStream']> {
    return this.#companies.addAuditStream(...args);
  }

  removeAuditStream(...args: Parameters<Companies['removeAuditStream']>): ReturnType<Companies['removeAuditStream']> {
    return this.#companies.removeAuditStream(...args);
  }

  auditStreams(...args: Parameters<Companies['auditStreams']>): ReturnType<Companies['auditStreams']> {
    return this.#companies.auditStreams(...args);
  }

  exportSpace(...args: Parameters<Companies['exportSpace']>): ReturnType<Companies['exportSpace']> {
    return this.#companies.exportSpace(...args);
  }

  setScim(...args: Parameters<Companies['setScim']>): ReturnType<Companies['setScim']> {
    return this.#companies.setScim(...args);
  }

  scim(...args: Parameters<Companies['scim']>): ReturnType<Companies['scim']> {
    return this.#companies.scim(...args);
  }

  startServices(...args: Parameters<Companies['startServices']>): ReturnType<Companies['startServices']> {
    return this.#companies.startServices(...args);
  }

  setConsole(...args: Parameters<Companies['setConsole']>): ReturnType<Companies['setConsole']> {
    return this.#companies.setConsole(...args);
  }

  backup(...args: Parameters<Companies['backup']>): ReturnType<Companies['backup']> {
    return this.#companies.backup(...args);
  }

  keystores(...args: Parameters<Companies['keystores']>): ReturnType<Companies['keystores']> {
    return this.#companies.keystores(...args);
  }

  moveHomeKey(...args: Parameters<Companies['moveHomeKey']>): ReturnType<Companies['moveHomeKey']> {
    return this.#companies.moveHomeKey(...args);
  }

  consoleOperatorLink(...args: Parameters<Companies['consoleOperatorLink']>): ReturnType<Companies['consoleOperatorLink']> {
    return this.#companies.consoleOperatorLink(...args);
  }

  consoleInfo(...args: Parameters<Companies['consoleInfo']>): ReturnType<Companies['consoleInfo']> {
    return this.#companies.consoleInfo(...args);
  }

  consoleAdmin(...args: Parameters<Companies['consoleAdmin']>): ReturnType<Companies['consoleAdmin']> {
    return this.#companies.consoleAdmin(...args);
  }

  isCompanyAdmin(...args: Parameters<Companies['isCompanyAdmin']>): ReturnType<Companies['isCompanyAdmin']> {
    return this.#companies.isCompanyAdmin(...args);
  }

  consoleRole(...args: Parameters<Companies['consoleRole']>): ReturnType<Companies['consoleRole']> {
    return this.#companies.consoleRole(...args);
  }

  companyAgents(...args: Parameters<Companies['companyAgents']>): ReturnType<Companies['companyAgents']> {
    return this.#companies.companyAgents(...args);
  }

  companyDevices(...args: Parameters<Companies['companyDevices']>): ReturnType<Companies['companyDevices']> {
    return this.#companies.companyDevices(...args);
  }

  consoleRecord(...args: Parameters<Companies['consoleRecord']>): ReturnType<Companies['consoleRecord']> {
    return this.#companies.consoleRecord(...args);
  }

  consoleAction(...args: Parameters<Companies['consoleAction']>): ReturnType<Companies['consoleAction']> {
    return this.#companies.consoleAction(...args);
  }

  scimRequest(...args: Parameters<Companies['scimRequest']>): ReturnType<Companies['scimRequest']> {
    return this.#companies.scimRequest(...args);
  }

  signIn(...args: Parameters<Companies['signIn']>): ReturnType<Companies['signIn']> {
    return this.#companies.signIn(...args);
  }

  manageSpace(...args: Parameters<Companies['manageSpace']>): ReturnType<Companies['manageSpace']> {
    return this.#companies.manageSpace(...args);
  }

  unlockSpace(...args: Parameters<Companies['unlockSpace']>): ReturnType<Companies['unlockSpace']> {
    return this.#companies.unlockSpace(...args);
  }

  destroyCompanyKey(...args: Parameters<Companies['destroyCompanyKey']>): ReturnType<Companies['destroyCompanyKey']> {
    return this.#companies.destroyCompanyKey(...args);
  }

  /** The earliest time a managed key used by the decoded views runs out: then they decode again, without it. */
  #decodedValidUntil = Infinity;

  /**
   * The company key service: company halves, unlocking, and the keys sealing
   * and opening see (managed.ts). The node gives it a narrow view of itself.
   */
  #managed!: ManagedKeys;

  /** Company accounts, their sign-in, policy, audit streams, SCIM, the admin console (companies.ts). */
  #companies!: Companies;
  // (further concern modules)

  /** Retention: holds, forgetting by rule, shredding old keys and carrying forward what stays (retention.ts). */
  #retention!: Forgetting;

  /** Who holds what: keepers for friends and spaces, members sharing a big space's content, fetching and letting go of bodies (holding.ts). */
  #holding!: Holding;

  /** GitHub repositories that follow a space: sign-in, linking, members' read access (repos.ts). */
  #repos!: Repos;

  /** A project's app, installed and run by hosts, its API, settings and updates, and live rooms (apps.ts). */
  #appsHere!: Apps;

  /** Paid memberships, wallets, treasuries, Safe transactions and ticketed shows (payments.ts). */
  #payments!: Payments;

  /** Badges: series, badges given, transferred, notes (badges.ts). */
  #badges!: Badges;

  /** Decoded views go stale (keys came or went, bodies were dropped): decode again when next asked. */
  #invalidateDecoded(): void {
    this.#decoded = undefined;
  }

  /** How the key service signs in: a token set by the app or a test, else from the environment, or the person's company sign-in. */
  #kmsCredentials(): VaultCredentials {
    return this.kmsCredentials ?? { ...envCredentials(process.env), idToken: () => this.#companies.ssoToken(), delegated: (scope) => this.#companies.delegated(scope) };
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
      if (mayAct(state, author, 'curate').ok) return undefined;
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
    const refused = this.#companies.policyRefuses(event, body);
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

  // Retention: holds, forgetting by rule, shredding old keys and carrying forward what stays: retention.ts (Forgetting). The node delegates.

  setHold(...args: Parameters<Forgetting['setHold']>): ReturnType<Forgetting['setHold']> {
    return this.#retention.setHold(...args);
  }

  setBoardRule(...args: Parameters<Forgetting['setBoardRule']>): ReturnType<Forgetting['setBoardRule']> {
    return this.#retention.setBoardRule(...args);
  }

  shred(...args: Parameters<Forgetting['shred']>): ReturnType<Forgetting['shred']> {
    return this.#retention.shred(...args);
  }

  keepPost(...args: Parameters<Forgetting['keepPost']>): ReturnType<Forgetting['keepPost']> {
    return this.#retention.keepPost(...args);
  }

  fading(...args: Parameters<Forgetting['fading']>): ReturnType<Forgetting['fading']> {
    return this.#retention.fading(...args);
  }

  // Who holds what: keepers for friends and spaces, members sharing a big space's content, fetching and letting go of bodies: holding.ts (Holding). The node delegates.

  keepers(...args: Parameters<Holding['keepers']>): ReturnType<Holding['keepers']> {
    return this.#holding.keepers(...args);
  }

  fetchOlder(...args: Parameters<Holding['fetchOlder']>): ReturnType<Holding['fetchOlder']> {
    return this.#holding.fetchOlder(...args);
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
    // Letting them in would need a new key we can't give: someone who manages the project does it.
    if (!mayAct(this.#state(project), this.identity.author, 'manage').ok && this.#needsFreshKey(project)) return;
    for (const member of dids) this.replica.write(this.identity, sealFor(this.#managed.cipher(project), { kind: KIND_ADMIT, body: { member, via: group.id } }));
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
        // Someone removed from the project stays out, whatever groups they're in (unless they left on their own).
        const removed = state.removed.has(did) && !state.left.has(did);
        if (!state.members.has(did) && !removed && state.declined.get(did) !== group.id) changes.push({ project: projectRef, did, name: this.nameOf(did), group: groupRef, change: 'join' });
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
      // Judged by whether its author managed the space when they made it, not today (a member back after a handover still takes it).
      if (!space || !mayActAt(this.#state(space), event, 'manage').ok) return;
      const opened = this.#tryOpen((me) => openRekey(event, me));
      if (!opened || space.shredded?.includes(opened.epoch)) return;
      const epoch = String(opened.epoch);
      if (!space.keys[epoch]) {
        space.keys[epoch] = opened.key;
        (space.rekeyers ??= {})[epoch] = event.author;
        this.#saveSpace(space);
        return;
      }
      if (space.keys[epoch] === opened.key || space.alternates?.[epoch]?.includes(opened.key)) return;
      // Two managers rekeyed at once: keep every key of the epoch, and all seal with the one from the rekey with the lowest id.
      const state = this.#state(space);
      const all = this.replica
        .events((e) => e.scope === event.scope && canonicalKind(e.kind) === KIND_REKEY && mayActAt(state, e, 'manage').ok)
        .flatMap((e) => {
          const o = this.#tryOpen((me) => openRekey(e, me));
          return o && String(o.epoch) === epoch ? [{ id: e.id, key: o.key, author: e.author }] : [];
        })
        .sort((a, b) => a.id.localeCompare(b.id));
      const keys = [...new Set([...all.map((k) => k.key), space.keys[epoch], ...(space.alternates?.[epoch] ?? [])])];
      space.keys[epoch] = all[0]?.key ?? space.keys[epoch];
      if (all[0]) (space.rekeyers ??= {})[epoch] = all[0].author;
      (space.alternates ??= {})[epoch] = keys.filter((k) => k !== space.keys[epoch]);
      this.#saveSpace(space);
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
      // For a space we hold, a gifted key counts only if it opens something sealed with it there (8R9bN-yO): anyone in a
      // group with us can gift, and a made-up key for an epoch to come would keep the real one out.
      for (const [epoch, key] of Object.entries(opened.space.keys)) {
        if (!known.keys[epoch] && !known.shredded?.includes(Number(epoch)) && this.#opensSomething(known, epoch, key)) (known.keys[epoch] = key), (added = true);
      }
      for (const [board, epochs] of Object.entries((opened.space as StoredSpace).boards ?? {})) {
        for (const [epoch, key] of Object.entries(epochs)) if (!known.boards?.[board]?.[epoch] && this.#opensSomething(known, epoch, key, board)) (((known.boards ??= {})[board] ??= {})[epoch] = key), (added = true);
      }
      if (added) this.#saveSpace(known);
      return;
    }
    void this.#addSpace({ ...opened.space, entry: opened.entry, via: event.author });
  }

  /** Does a key we're handed open something sealed with it in this space (an epoch's events, or a board's)? */
  #opensSomething(space: StoredSpace, epoch: string, key: string, board?: string): boolean {
    const scope = spaceScope(space);
    const withKey = { ...space, keys: { ...space.keys, [epoch]: key } };
    for (const e of this.replica.events((r) => r.kind === KIND_SEALED && r.scope === scope && !r.missing)) {
      if (board === undefined) {
        if ((e.body as { epoch?: unknown } | null)?.epoch === Number(epoch) && openIn(withKey, e)) return true;
        continue;
      }
      const inner = openIn(space, e);
      const b = inner?.body as { board?: unknown; epoch?: unknown } | null | undefined;
      if (inner?.kind === KIND_BOARD_SEALED && b?.board === board && b.epoch === Number(epoch) && openBoard(space, inner, { [board]: { [epoch]: key } })) return true;
    }
    return false;
  }

  #anchor(person: Did, space: StoredSpace): Record<string, { c: number; s: number; n: number }> {
    // In the space itself, each key's control head and last content (see Anchor in spaces.ts): numbered there without gaps.
    const scope = spaceScope(space);
    const out: Record<string, { c: number; s: number; n: number }> = {};
    for (const signer of this.replica.signers()) {
      if (this.replica.authority.personOf(signer) !== person) continue;
      const n = this.replica.number(signer);
      if (n > 0) out[signer] = { c: this.replica.store.chainHead(signer, scope)?.seq ?? 0, s: this.replica.store.contentCount(signer, scope), n };
    }
    return out;
  }

  /**
   * The last number of each of a person's keys (devices, agents) this node
   * holds: what a removal, demotion, leave or handover names as counting before
   * it. Whatever those keys sign numbered past it counts as after, whatever date
   * it claims (Julian's backdating issue).
   */
  #upTo(person: Did): Record<string, number> {
    const out: Record<string, number> = {};
    for (const signer of this.replica.signers()) {
      if (this.replica.authority.personOf(signer) !== person) continue;
      const n = this.replica.number(signer);
      if (n > 0) out[signer] = n;
    }
    return out;
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
    const state = spaceState(space.kind, space.founder, this.#decodedIn(space.id), { arrival: (e) => this.replica.arrival((e as { id?: string }).id ?? '') });
    this.#stateCache.set(space.id, { key, state });
    return state;
  }

  #page(project: StoredSpace, state: SpaceState): ProjectPage {
    let page = DEFAULT_PAGE;
    for (const d of this.#decodeAll()) {
      if (d.space?.id !== project.id || d.inner.kind !== KIND_PAGE || !mayAct(state, d.event.author, 'curate').ok) continue;
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
      ...(state.managed ? { managed: this.#companies.managedInfo(space, state.managed) } : {}),
      ...(this.#retention.held(state) ? { hold: { until: state.hold!.until, reason: state.hold!.reason } } : {}),
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
    const rules = boardRulesOf(entries, this.#managers(state), this.#seenAt);
    const around = this.#aroundPosts(entries);
    const visible = postsOf(space.kind, entries, state.maintainers).filter((p) => known.has(p.board)); // posts of dropped boards stay in the logs, out of sight
    const minDays = this.#companies.companyRetention(space)?.minDays;
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
    if (this.#holding.pulled(space, state)) {
      const members = [...state.members.keys()];
      const recent = new Date(this.clock() - RECENT_HOLD_MS).toISOString();
      for (const p of posts) p.heldBy = this.#holding.heldBy(p, members, p.active >= recent);
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

  /** Those who may curate a space (mayAct 'curate': its maintainers or moderators, and its owner), as a set for rules that take one. */
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
      const inner = space && (openIn(this.#managed.cipher(space), event) ?? (raw && (raw.kind === KIND_KMS || raw.kind === KIND_MANAGED) ? raw : undefined));
      if (!inner) return undefined;
      decoded = { event, inner, space };
      // An event of a read-limited board: readable only with that board's key.
      if (inner.kind === KIND_BOARD_SEALED) {
        const opened = space?.kind === 'project' ? openBoard(space, inner, space.boards) : undefined;
        if (!opened) return undefined;
        decoded = { event, inner: { kind: opened.kind, body: opened.body }, space, board: opened.board, outer: inner };
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
    if (this.#decoded && this.clock() >= this.#decodedValidUntil) this.#invalidateDecoded();
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
      this.#invalidateDecoded();
      return;
    }
    if (KEY_KINDS.has(event.kind)) {
      this.#invalidateDecoded();
      return;
    }
    this.#ensureDirectFor(event.signer);
    const d = this.#decode(event);
    if (!d || !this.#agentCounts(d)) return;
    // An approval makes an agent's earlier events count: decode again (rare).
    if (d.inner.kind === KIND_AGENT_APPROVE) {
      this.#invalidateDecoded();
      return;
    }
    // A carry restates many events at their own times: decode everything again (they are rare).
    if (d.inner.kind === KIND_CARRY) {
      this.#invalidateDecoded();
      return;
    }
    if (d.inner.kind === KIND_SHRED)
      setImmediate(() => {
        try {
          this.#retention.applyShreds();
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
    if (rebuild) this.#invalidateDecoded();
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
        this.replica.write(this.identity, sealFor(this.#managed.cipher(project), { kind: KIND_ROSTER, body: { group: id, members: roster } }));
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
        this.replica.write(this.identity, sealFor(this.#managed.cipher(project), boardKeyFor(project, board, epoch, key, readers, this.#encryptionKeyOf)));
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
        this.replica.write(this.identity, sealFor(this.#managed.cipher(project), boardKeyFor(project, board, epoch, key, missing, this.#encryptionKeyOf)));
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


/** Where new Weave versions are announced: release posts in the Weave project, and its repository. */
export const UPDATE_SOURCE = { project: 'NqgQwm_P6I0gtnQDnZKURw', repo: 'martldennl/Weave' };
/** Where the farewell to v0.3 peers sends them. */
const RELEASES_URL = `https://github.com/${UPDATE_SOURCE.repo}/releases/latest`;



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
