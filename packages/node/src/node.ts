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
/** Every space of ours (but direct chats) and its keys, in our own space, for our always-on nodes (stage 18). */
const KIND_NODE_INDEX = 'weave.node.index';
/** What an always-on node's key may sign: hosting your rooms. Everything else it writes, everyone else drops. */
export const NODE_PERMISSIONS = ['weave.room', 'weave.room.*'];
/** Always-on nodes' keys are named "node:<name>" among your keys. */
const NODE_PREFIX = 'node:';
interface KeepState {
  spaces: Record<string, Did[]>;
  seen: Record<string, string>;
  /** Hash of the last keep index written. */
  index: string;
}


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
const carriedItem = (d: { id: string; event: { author: Did; signer: Did; seq: number; time: string; wire?: unknown }; inner: { kind: string; body: Json; salt?: string }; outer?: Inner }) => ({
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
const CARRIED_STATE = new Set(['weave.project.page', 'weave.app', 'weave.channel', 'weave.curate', 'weave.theme']);

const EDGE_KIND: Record<EdgeInput['edge'], string> = { follow: KIND_FOLLOW, block: KIND_BLOCK, mute: KIND_MUTE };
const DEFAULT_PAGE: ProjectPage = { title: '', subtitle: '', body: '', description: '', status: 'active', public: false };

/**
 * One person's node: their keys, their replica of the logs they know, the
 * groups and projects they belong to, and optionally a live connection to
 * peers. The CLI uses it directly when no daemon runs; the daemon wraps it
 * with networking and the HTTP API.
 */
/** Why a person's repository can't follow a space, and what to do about it. */
const personalRepo = (repo: string) =>
  `${repo} belongs to a personal GitHub account, and those can't give anyone read-only access: GitHub refuses the invitations. Move it to a GitHub organization (free; on GitHub: the repository's Settings → Transfer), install the Weave app there, and link it again`;

/** How an onchain payment is kept among the license records: its transaction hash after this prefix. */
const ONCHAIN_RECORD = 'tx:';

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
    personHeader: (room, person) => this.#personHeader(room, person),
    seed: (roomId) => this.#roomSeed(roomId),
    nameOf: (did) => this.nameOf(did),
    changed: () => this.#emitLive(),
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
  /** Answers to ticket requests for our shows, so each is read once per run (request id → answer). */
  #ticketChecks = new Map<string, { show: string; holder: Did; tx: string; ok: boolean; reason?: string } | 'checking'>();
  /** The chain's answers for paid requests, so each transaction is read once per run (request id → answer). */
  #paymentChecks = new Map<string, PaymentCheck | 'checking'>();
  /** How memberships are made on Gumroad (tests put a fake here). */
  makeGumroadMembership: typeof createGumroadMembership = createGumroadMembership;
  /** How Gumroad gets connected: the Weave application, the browser sign-in and who's connected (tests put fakes here). */
  gumroadSetup = { clientId: GUMROAD_CLIENT_ID, signIn: (clientId: string) => startGumroadSignIn(clientId), account: (token: string) => gumroadAccount(token) };
  /** A Gumroad connection waiting for the person in the browser, or why the last one didn't work. */
  #gumroadLogin?: { signIn?: GumroadSignIn; error?: string };
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
  /**
   * Containers (Weave and Docker): the registry API is reached with `fetch`; `docker` is the Docker command line
   * (WEAVE_DOCKER: a path, or a JSON list of a program and its first arguments). Tests use stand-ins.
   */
  containerSetup: { fetch: Fetch; docker: string[] } = {
    fetch: (...args) => fetch(...args),
    docker: process.env.WEAVE_DOCKER?.trim().startsWith('[') ? (JSON.parse(process.env.WEAVE_DOCKER) as string[]) : [process.env.WEAVE_DOCKER || 'docker'],
  };
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
    roomPort: async (roomId) => this.#roomPort(roomId),
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
      held: this.#held.bind(this),
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
    // A standby server follows the active one and signs nothing: it shares the active one's device key (stage 14).
    if (loadConfig(home).standby) this.#companies.refuseWrites();
    this.blobs = new BlobStore(home.blobs);
    this.config = loadConfig(home);
    this.#agents = loadAgents(home);
    // Secrets read only now and then (tokens, pairings) are sealed right away, not when first needed.
    for (const file of [this.#githubFile, this.#gumroadFile, this.#appSettingsFile, joinPath(home.dir, 'remote.json')]) readSecretJson(home, file);
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
        return this.#expandCarry(d, d.space as StoredSpace | undefined).filter((x) => !this.#forgottenCarried().has(x.id));
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
    for (const series of this.#allBadges().series) {
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
    let changed = (await this.#expireMemberships()) + (await this.#grantAutomatic()) + (await this.#checkContractWallets()) + (await this.#grantPaid()) + (await this.#grantTickets()) + (await this.#renewPaid()) + (await this.#sendQueuedRequests()) + (await this.#syncGithub());
    for (const space of [...this.#spaces.values()]) changed += this.#settleEpochKeys(space);
    changed += await this.#closeProposals();
    for (const space of [...this.#spaces.values()]) changed += this.#closeInvites(space);
    for (const space of [...this.#spaces.values()]) changed += this.#rotateAfterLeaving(space, this.#state(space));
    for (const space of [...this.#spaces.values()]) changed += this.#rotateMonthly(space);
    changed += this.#applyShreds();
    changed += this.#forget();
    changed += this.#release();
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
      this.#writeKeepIndex();
      this.#writeNodeIndex();
    }
    this.#recoverSpaces();
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

  /** Repositories known to belong to an organization (a person's are asked again: they may have moved). */
  #organizationRepos = new Set<string>();

  async #ownedByOrganization(client: GitHub, repo: string): Promise<boolean> {
    if (this.#organizationRepos.has(repo.toLowerCase())) return true;
    const organization = (await client.owner(repo)) === 'Organization';
    if (organization) this.#organizationRepos.add(repo.toLowerCase());
    return organization;
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
    const repos = reposOf(entries, (did) => mayAct(state, did, 'manage').ok);
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
      canLink: mayAct(state, me, 'manage').ok,
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
    if (!mayAct(state, this.identity.author, 'manage').ok) throw new Error(`only the ${space.kind === 'group' ? 'owner' : space.kind === 'community' ? 'moderators' : 'maintainers'} of ${space.name} can link repositories`);
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
      // Members get read access; a person's repositories only have collaborators who can write.
      if (!(await this.#ownedByOrganization(new GitHub(this.#githubAuth()!.token, this.githubSetup.fetch), match))) throw new Error(personalRepo(match));
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
      if (!mayAct(state, me, 'manage').ok) continue;
      const entries = this.#entries(space);
      const links = reposOf(entries, (did) => mayAct(state, did, 'manage').ok).filter((r) => r.by === me);
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
        // Linked before Weave checked: a person's repository can't take read-only collaborators (GitHub refuses with 422).
        // Nobody new is invited there; what Weave gave is still taken back.
        const personal = plan.invite.length > 0 && !(await this.#ownedByOrganization(client, repo));
        if (personal) plan.invite = [];
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
        this.#githubSynced.set(key, { at: now, shape: personal ? shape : JSON.stringify([[...want].sort(), after]), ...(personal ? { problem: personalRepo(repo) } : {}) });
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

  /** The command this computer starts a project's app with: its container when there's one and Docker runs, else its release build's when Weave installed one. */
  #startCommand(project: StoredSpace, app: AppManifest | undefined): string[] | undefined {
    if (this.#containerOf(app)) return this.#containerCommand(project, app!);
    return startCommand(app, platformKey(), !!this.#installed(project.id));
  }

  // ---------------------------------------------------------------- apps in containers (Weave and Docker)

  /** Whether Docker answers on this computer: asked at most every 30 seconds. */
  #dockerSeen?: { at: number; up: boolean };

  #dockerUp(): boolean {
    if (this.#dockerSeen && Date.now() - this.#dockerSeen.at < 30_000) return this.#dockerSeen.up;
    const [program, ...first] = this.containerSetup.docker;
    const probe = spawnSync(program, [...first, 'version', '--format', '{{.Server.Version}}'], { encoding: 'utf8', timeout: 8000, windowsHide: true });
    const up = probe.status === 0 && !!probe.stdout.trim();
    this.#dockerSeen = { at: Date.now(), up };
    return up;
  }

  /** The release's image, when it has one and Docker runs here. */
  #containerOf(app: AppManifest | undefined): AppImage | undefined {
    const image = app?.install?.image;
    return image && app?.start?.image && this.#dockerUp() ? image : undefined;
  }

  /** The container's name: one per project on this computer. */
  #containerName(project: StoredSpace): string {
    return `weave-${project.id.toLowerCase().replace(/[^a-z0-9_.-]/g, '-')}`;
  }

  /**
   * How the app's container runs: by its digest, with only the services' ports (on 127.0.0.1; on Linux in the
   * host's network, so tunnel ports stay as they are), no extra privileges, nothing of the computer mounted, and its
   * settings and Weave's variables by name only (their values come from the environment, not the command line).
   */
  #containerCommand(project: StoredSpace, app: AppManifest): string[] {
    const image = app.install!.image!;
    const linux = process.platform === 'linux';
    const network = linux ? ['--network', 'host'] : app.services.flatMap((s) => ['-p', `127.0.0.1:${s.port}:${s.port}${s.protocol === 'tcp' ? '/tcp' : ''}`]);
    const names = [...(app.env ?? []).map((e) => e.name), 'WEAVE_API', 'WEAVE_TOKEN', 'WEAVE_PROJECT'];
    return [
      ...this.containerSetup.docker,
      'run',
      '--rm',
      '--name',
      this.#containerName(project),
      '--cap-drop',
      'ALL',
      '--cap-add',
      'NET_BIND_SERVICE',
      '--security-opt',
      'no-new-privileges',
      ...(linux ? [] : ['--add-host', 'host.docker.internal:host-gateway']),
      ...network,
      ...names.flatMap((n) => ['-e', n]),
      `${image.ref}@${image.digest}`,
    ];
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
      ...(app?.start?.image && app.install?.image
        ? { container: { image: app.install.image.ref, tag: app.install.image.tag, digest: app.install.image.digest, docker: this.#dockerUp(), active: !!this.#containerOf(app) } }
        : {}),
    };
  }

  /** Whether you may point the app at a release, and where releases come from (the app's repository, or the project's one linked repository). */
  #releaseInfo(project: StoredSpace, app: AppManifest): { canRelease: boolean; repo?: string } {
    const state = this.#state(project);
    const linked = reposOf(this.#entries(project), (did) => mayAct(state, did, 'curate').ok);
    const repo = app.install?.github ?? (linked.length === 1 ? linked[0].repo : undefined);
    return { canRelease: mayAct(state, this.identity.author, 'curate').ok, ...(repo ? { repo } : {}) };
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
    const container = this.#containerOf(app);
    // A container needs no copy of the app: it runs in Weave's own folder for the project.
    const folder = container ? this.#appsDir(project.id) : this.config.appFolders[project.id];
    if (!folder) throw new Error(`choose where ${app.name} is on this computer first (the folder with its weave.app.json)`);
    if (container) mkdirSync(folder, { recursive: true });
    else this.#checkAppFolder(project.id, folder);
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
    const weave = await this.appEnv(project.id);
    if (!container) {
      this.#apps.start(project.id, command, folder, { ...settings, ...weave });
      return this.appLaunch(project.id);
    }
    // In a container, Weave's app API is the host's: reached as host.docker.internal (on Linux the host's network is shared).
    const api = process.platform === 'linux' ? weave.WEAVE_API : weave.WEAVE_API.replace('127.0.0.1', 'host.docker.internal');
    const [docker, ...first] = this.containerSetup.docker;
    const name = this.#containerName(project);
    // One left from before (a crash, a stop that didn't reach Docker) would block the name.
    spawnSync(docker, [...first, 'rm', '-f', name], { windowsHide: true, timeout: 20_000 });
    this.#apps.start(project.id, command, folder, { ...settings, ...weave, WEAVE_API: api }, () => void spawnSync(docker, [...first, 'stop', '-t', '5', name], { windowsHide: true, timeout: 20_000 }));
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
    if (route === '/v1/tickets') {
      const did = params.get('did') ?? '';
      if (!did.startsWith('did:')) throw new Error('did: whose tickets to look up');
      const now = new Date(this.clock());
      return this.#allShows()
        .filter((s) => s.project === projectId && s.host === this.identity.author)
        .flatMap((s) => (this.#ticketRecords(s.id).some((r) => r.holder === did) ? [{ show: s.id, name: s.name, ...(s.room ? { room: s.room } : {}), starts: s.starts, ends: s.ends, open: showOpen(s, now), cancelled: s.cancelled }] : []));
    }
    if (route === '/v1/badges') {
      const did = params.get('did') ?? '';
      if (!did.startsWith('did:')) throw new Error('did: whose badges to look up');
      const { series, badges } = this.#allBadges();
      const ours = new Map(series.filter((s) => s.project?.id === projectId && s.project.checked && !s.broken).map((s) => [s.id, s]));
      return badges
        .filter((b) => b.holder === did && !b.invalid && ours.has(b.series))
        .map((b) => {
          const s = ours.get(b.series)!;
          return { id: b.id, series: { id: s.id, name: s.name, symbol: s.symbol, ...(s.image ? { image: s.image } : {}), ...(s.limit ? { limit: s.limit } : {}) }, n: b.n, issuer: { did: b.issuer, name: this.nameOf(b.issuer) }, note: b.note, ...(b.ref ? { ref: b.ref } : {}), ...(b.personal?.published ? { personal: b.personal.published } : {}), time: b.time };
        });
    }
    throw new AppApiError(404, `no route ${route}`);
  }

  /**
   * X-Weave-Person for a room's http service (Weave and Docker): who this player is, as the app API would say,
   * the room, and the time, signed with the app's own token (HMAC-SHA256), which only Weave and the app know.
   * Only for apps Weave gave a token (it started them, or weave app env): otherwise nobody could check it.
   */
  #personHeader(room: Room, person: Did): string | undefined {
    if (this.#roomService(room)?.protocol !== 'http') return undefined;
    const found = this.#allRooms().find((r) => r.room.id === room.id);
    const token = found && this.#appTokens.get(found.project.id);
    if (!found || !token) return undefined;
    const payload = Buffer.from(JSON.stringify({ ...this.#appPerson(found.project, person), room: { id: room.id, name: room.name }, t: Math.floor(this.clock() / 1000) })).toString('base64url');
    return `${payload}.${createHmac('sha256', token).update(payload).digest('base64url')}`;
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
    const linked = reposOf(this.#entries(project), (did) => mayAct(state, did, 'curate').ok);
    const repo = input.repo?.trim() || published?.install?.github || (linked.length === 1 ? linked[0].repo : '');
    if (!isRepoName(repo)) throw new Error(linked.length > 1 ? `${project.name} has several repositories: say which one` : 'which repository holds the release? (owner/name)');
    const auth = this.#githubAuth();
    const client = new GitHub(auth?.token ?? '', this.githubSetup.fetch);
    const release = await client.release(repo, input.tag.trim());
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
    if (!release.assets.length && !app.start?.image)
      throw new Error(
        `${release.tag} in ${repo} has no build files attached. Weave installs build files from a release; GitHub's source archives don't count. Weave's release workflow attaches them when a tag is pushed (weave app workflow), or attach them to the release on github.com (or name a container image in weave.app.json: start.image)`,
      );
    // The release's container image, pinned by its digest: tagged like the release (v1.2.0, or 1.2.0).
    let image: AppImage | undefined;
    if (app.start?.image) {
      const ref = app.start.image;
      const tags = [...new Set([release.tag, release.tag.replace(/^v(?=\d)/, '')])];
      const credentials = auth && imageLocation(ref).host === 'ghcr.io' ? { user: auth.login, token: auth.token } : undefined;
      const found = await imageDigest(ref, tags, { fetch: this.containerSetup.fetch, ...(credentials ? { credentials } : {}) });
      image = { ref, tag: found.tag, digest: found.digest };
    }
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
    if (!chosen.size && release.assets.length && !image) throw new Error(`no file in ${release.tag} says which computer it's for (win, mac, linux in its name): name them with --asset win32-x64=<file>`);
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
    const { image: _image, assets: _assets, ...kept } = before as AppInstall;
    const manifest = parseManifest({ ...app, install: { ...kept, github: repo, tag: release.tag, ...(Object.keys(assets).length ? { assets } : {}), ...(image ? { image } : {}), ...(own ? { app: own } : {}) } });
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

  async hostRoom(input: { project: string; name: string; invite?: string[]; show?: string; groups?: string[] }): Promise<RoomInfo> {
    const project = this.#project(input.project);
    const app = this.#app(project);
    if (!app) throw new Error(`${project.name} has no app to share yet: a maintainer publishes one with "weave app publish"`);
    if (!this.#swarm) throw new Error('rooms need your node online: keep the app (or "weave daemon") running');
    const id = b64u.encode(randomBytes(12));
    const name = input.name?.trim().slice(0, 60) || `${this.nameOf(this.identity.author) ?? 'Someone'}'s room`;
    const invite = input.invite?.length ? input.invite.map((who) => this.resolve(who)) : 'participants';
    const key = roomKeyPair(this.#roomSeed(id)).publicKey.toString('hex');
    const show = input.show ? this.#showRef(input.show) : undefined;
    if (show && show.host !== this.identity.author) throw new Error(`only ${this.nameOf(show.host) ?? 'its host'} hosts rooms for ${show.name}: they let ticket holders in`);
    const groups = (input.groups ?? []).map((ref) => {
      const group = this.#space(ref);
      if (group.kind !== 'group') throw new Error(`${group.name} is a ${group.kind}, not a group or tier`);
      if (!this.#state(project).groups.has(group.id)) throw new Error(`${group.name} isn't invited into ${project.name}: invite it first (its members then take part)`);
      return group.id;
    });
    this.replica.write(this.identity, sealFor(this.#managed.cipher(project), { kind: KIND_ROOM, body: { room: id, name, service: app.services[0].id, key, invite, ...(show ? { show: show.id } : {}), ...(groups.length ? { groups } : {}), open: true } }));
    const room = this.#roomById(id).room;
    await this.#live.host(room);
    return this.#roomInfo(room, project);
  }

  async endRoom(ref: string): Promise<void> {
    const { room, project } = this.#roomById(ref);
    if (room.host !== this.identity.author) throw new Error('only the host can end a room');
    await this.#live.stopHosting(room.id);
    this.replica.write(this.identity, sealFor(this.#managed.cipher(project), { kind: KIND_ROOM, body: { room: room.id, open: false } }));
  }

  async joinRoom(ref: string): Promise<RoomInfo> {
    const { room, project } = this.#roomById(ref);
    if (!room.open) throw new Error('this room has ended');
    if (room.host === this.identity.author) return this.#roomInfo(room, project);
    if (!this.#mayJoin(room, this.identity.author)) throw new Error(room.show || room.groups ? "this room is for a show's ticket holders, while it's on (weave shows), or for members of its tiers" : "you're not invited to this room");
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

  /** Where a room's app is reached on this computer while we're in the room: the same port its address (RoomInfo.url) has. */
  #roomPort(roomId: string): number | undefined {
    const found = this.#allRooms().find((r) => r.room.id === roomId && r.room.open);
    if (!found) return undefined;
    if (found.room.host !== this.identity.author) return this.#live.localPort(roomId);
    return this.#live.isHosting(roomId) ? this.#roomService(found.room)?.port : undefined;
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
      if (e.kind !== KIND_APP || !mayAct(state, e.event.author, 'curate').ok) continue;
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
    if (room.show || room.groups?.length) {
      // A ticketed room: a ticket while the show is on (the host checks its own records, a guest its ticket)…
      const show = room.show ? this.#allShows().find((s) => s.id === room.show && s.host === room.host) : undefined;
      const ticket =
        !!show &&
        showOpen(show, new Date(this.clock())) &&
        (person === this.identity.author ? this.#myTickets().some((t) => t.show === show.id && t.host === show.host) : show.host === this.identity.author && this.#ticketRecords(show.id).some((r) => r.holder === person));
      // …or an active membership in one of its groups (a tier).
      const member = (room.groups ?? []).some((id) => this.#activeMember(id, person));
      if (!ticket && !member) return false;
    }
    return room.invite === 'participants' || room.invite.includes(person);
  }

  /** Whether someone is in a group right now (a tier's grant not run out). */
  #activeMember(groupId: string, person: Did): boolean {
    const group = this.#spaces.get(groupId);
    const member = group && this.#state(group).members.get(person);
    return !!member && (!member.until || member.until > new Date(this.clock()).toISOString());
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

  // ---------------------------------------------------------------- memberships

  async createTier(input: { name: string; price?: number; currency?: string; description?: string; benefits?: string[]; auto?: boolean; gumroad?: GumroadLink | null; onchain?: OnchainPrice | null }): Promise<TierInfo> {
    const group = await this.#createSpace('group', input.name, { tier: true });
    const position = this.#tierOffers(this.identity.author).length;
    this.#publishTier({ id: group.id, creator: this.identity.author, name: group.name, price: 0, currency: 'EUR', description: '', benefits: [], position, open: true, auto: false, time: '' }, input);
    return this.#tierInfo(this.#tierOffer(group.id, this.identity.author));
  }

  async setTier(input: { tier: string; name?: string; price?: number; currency?: string; description?: string; benefits?: string[]; position?: number; open?: boolean; auto?: boolean; hidden?: boolean; gumroad?: GumroadLink | null; onchain?: OnchainPrice | null }): Promise<TierInfo> {
    const before = this.#tierOffer(input.tier, this.identity.author);
    if (before.creator !== this.identity.author) throw new Error('only its creator can change a tier');
    this.#publishTier(before, input);
    return input.hidden ? { ...this.#tierInfo(before), open: false } : this.#tierInfo(this.#tierOffer(before.id, this.identity.author));
  }

  get #gumroadFile(): string {
    return joinPath(this.home.dir, 'gumroad.json');
  }

  /** The Gumroad connection on this device (kept in the home, never in a log). */
  #gumroadAuth(): { token: string; account: string } | undefined {
    const saved = readSecretJson<{ token?: string; account?: string }>(this.home, this.#gumroadFile);
    return saved?.token ? { token: saved.token, account: saved.account ?? 'your Gumroad account' } : undefined;
  }

  async gumroad(): Promise<GumroadInfo> {
    const auth = this.#gumroadAuth();
    const login = this.#gumroadLogin;
    return {
      available: !!this.gumroadSetup.clientId,
      ...(auth ? { account: auth.account } : {}),
      ...(login?.signIn ? { pending: { url: login.signIn.url } } : {}),
      ...(login?.error ? { error: login.error } : {}),
    };
  }

  async connectGumroad(): Promise<GumroadInfo> {
    this.#gumroadLogin?.signIn?.cancel();
    const signIn = await this.gumroadSetup.signIn(this.gumroadSetup.clientId);
    const login = { signIn };
    this.#gumroadLogin = login;
    // Wait for the person to allow Weave in the browser, in the background; gumroad() tells how it went.
    void signIn.token
      .then(async (token) => {
        const account = await this.gumroadSetup.account(token);
        writeSecretJson(this.home, this.#gumroadFile, { token, account, connected: new Date(this.clock()).toISOString() });
        if (this.#gumroadLogin === login) this.#gumroadLogin = undefined;
      })
      .catch((error: Error) => {
        if (this.#gumroadLogin === login) this.#gumroadLogin = error.message === 'cancelled' ? undefined : { error: error.message };
      });
    return this.gumroad();
  }

  async disconnectGumroad(): Promise<GumroadInfo> {
    this.#gumroadLogin?.signIn?.cancel();
    this.#gumroadLogin = undefined;
    rmSync(this.#gumroadFile, { force: true });
    return this.gumroad();
  }

  async sellTierOnGumroad(input: { tier: string; token?: string }): Promise<{ tier: TierInfo; published: boolean; warning?: string }> {
    const t = this.#tierOffer(input.tier, this.identity.author);
    if (t.creator !== this.identity.author) throw new Error('only its creator can sell a tier');
    const token = input.token?.trim() || this.#gumroadAuth()?.token;
    if (!token) throw new Error('connect Gumroad first (weave gumroad connect), or give an access token');
    const made = await this.makeGumroadMembership(token, { name: t.name, price: t.price, currency: t.currency, description: t.description || undefined });
    const tier = await this.setTier({ tier: t.id, gumroad: made.link, auto: false });
    return { tier, published: made.published, ...(made.warning ? { warning: made.warning } : {}) };
  }

  async tiers(who?: string): Promise<TierInfo[]> {
    return this.#tierOffers(who ? this.resolve(who) : this.identity.author).map((t) => this.#tierInfo(t));
  }

  async requestMembership(input: { tier: string; creator?: string; note?: string; license?: string; payment?: string }): Promise<void> {
    const tier = this.#tierOffer(input.tier, input.creator ? this.resolve(input.creator) : undefined);
    if (tier.creator === this.identity.author) throw new Error("that's your own tier");
    if (!tier.open) throw new Error(`${tier.name} isn't taking new members right now`);
    const license = input.license?.trim();
    if (license && !tier.gumroad) throw new Error(`${tier.name} isn't sold through Gumroad`);
    if (license && !/^[A-Za-z0-9-]{8,100}$/.test(license)) throw new Error('a Gumroad license key looks like XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX');
    const payment = input.payment?.trim().toLowerCase();
    if (payment && !tier.onchain) throw new Error(`${tier.name} isn't paid on chain`);
    if (payment && !isTxHash(payment)) throw new Error("a payment is the transaction's hash: 0x and 64 hex digits");
    if (payment && !this.#wallets().get(this.identity.author)?.verified) throw new Error('link the wallet you paid from first (weave wallet link): that is how the creator knows the payment is yours');
    await this.join(tier.creator); // the creator's node listens on their identity topic
    this.replica.write(
      this.identity,
      membershipRequest(this.#encryptionKeyOf(tier.creator), { tier: tier.id, note: input.note?.trim().slice(0, 500) ?? '', entry: this.#entryPoint(), ...(license ? { license } : {}), ...(payment ? { payment } : {}) }),
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
      const paid = this.#paymentChecks.get(id);
      const paidAnswer = paid && paid !== 'checking' ? { ok: paid.ok, ...(paid.reason ? { reason: paid.reason } : {}), ...(paid.months ? { months: paid.months } : {}) } : {};
      const payment = request.payment ? { payment: { tx: request.payment, ...paidAnswer } } : {};
      out.push({ id, tier: { id: tier.id, name: tier.name }, did: event.author, name: this.nameOf(event.author), note: request.note, time: event.time, ...license, ...payment });
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
    this.replica.write(this.identity, sealFor(this.#managed.cipher(group), { kind: KIND_MEMBERSHIP, body: { member, until } }));
    // New (or returning) members get the tier's keys, posted where their node will look for them.
    if (!current) {
      this.replica.write(this.identity, gift(this.#keysForNewcomers(group), [member], spaceScope(this.#direct(member)), this.#entryPoint(), this.#encryptionKeyOf));
    }
    await this.#answerRequests(group.id, member);
    return this.#tierInfo(this.#tierOffer(group.id, this.identity.author));
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
    let granted = await this.#grantPaidOnchain();
    const sold = new Map(this.#tierOffers(this.identity.author).filter((t) => t.gumroad && t.open).map((t) => [t.id, t]));
    if (!sold.size) return granted;
    for (const request of await this.membershipRequests()) {
      const tier = sold.get(request.tier.id);
      const key = request.license?.key;
      if (!tier?.gumroad || !key || this.#licenseChecks.has(request.id)) continue;
      if (key.startsWith(ONCHAIN_RECORD)) continue;
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
      if (!tier?.gumroad || !group || record.license.startsWith(ONCHAIN_RECORD) || now - Date.parse(record.checked) < 6 * 3600_000) continue;
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
      this.replica.write(this.identity, sealFor(this.#managed.cipher(group), { kind: KIND_MEMBERSHIP, body: { member: record.member, until: grantUntil(new Date(now), 1, until) } }));
      renewed++;
    }
    return renewed;
  }

  /**
   * Let in supporters who paid a tier on chain: the transaction is read once
   * from the chain; it has to pay the tier's address from the supporter's own
   * linked wallet, and counts once. A month per month's price paid (at most 36).
   * Paying again later is a new request with a new transaction.
   */
  async #grantPaidOnchain(): Promise<number> {
    const sold = new Map(this.#tierOffers(this.identity.author).filter((t) => t.onchain && t.open).map((t) => [t.id, t]));
    if (!sold.size) return 0;
    let granted = 0;
    for (const request of await this.membershipRequests()) {
      const tier = sold.get(request.tier.id);
      const tx = request.payment?.tx;
      if (!tier?.onchain || !tx || this.#paymentChecks.has(request.id)) continue;
      const used = this.#licenses().find((l) => l.license === ONCHAIN_RECORD + tx);
      if (used) {
        this.#paymentChecks.set(request.id, { ok: false, reason: `that transaction already let ${this.nameOf(used.member) ?? 'someone'} in` });
        continue;
      }
      this.#paymentChecks.set(request.id, 'checking');
      let check: PaymentCheck;
      try {
        check = await this.checkPayment(tier.onchain, tx);
      } catch {
        this.#paymentChecks.delete(request.id); // offline, or the chain's node down: try again later
        continue;
      }
      // From a wallet they linked, now or before (they may have moved on since paying).
      if (check.ok && this.#walletHistory().get(check.from?.toLowerCase() ?? '') !== request.did) {
        check = { ...check, ok: false, reason: `paid from ${check.from}, which isn't ${request.name ?? 'their'}'s linked wallet` };
      }
      if (!check.ok && /pending/.test(check.reason ?? '')) {
        this.#paymentChecks.delete(request.id); // not mined yet: read it again next round
        continue;
      }
      this.#paymentChecks.set(request.id, check);
      if (!check.ok || !check.months) continue;
      this.#recordLicense(tier.id, request.did, ONCHAIN_RECORD + tx, { ok: true });
      await this.grantMembership({ tier: tier.id, who: request.did, months: check.months });
      granted++;
    }
    return granted;
  }

  #recordLicense(tier: string, member: Did, license: string, check: LicenseCheck): void {
    const body = { tier, member, license, ok: check.ok, ...(check.reason ? { reason: check.reason } : {}), checked: new Date(this.clock()).toISOString() };
    this.replica.write(this.identity, this.#sealForSelf({ kind: KIND_MEMBERSHIP_LICENSE, body }));
  }

  /** The license keys (and transactions, ONCHAIN_RECORD + hash) behind our paid memberships, the latest record per tier and member and key. */
  #licenses(): Array<{ tier: string; member: Did; license: string; ok: boolean; checked: string }> {
    const latest = new Map<string, { tier: string; member: Did; license: string; ok: boolean; checked: string }>();
    for (const b of this.#selfBodies(KIND_MEMBERSHIP_LICENSE)) {
      if (typeof b.tier !== 'string' || !isDid(b.member) || typeof b.license !== 'string') continue;
      // Every transaction is kept: each one counts once, however often its payer pays.
      latest.set(b.license.startsWith(ONCHAIN_RECORD) ? b.license : `${b.tier} ${b.member}`, { tier: b.tier, member: b.member, license: b.license, ok: b.ok === true, checked: typeof b.checked === 'string' ? b.checked : '' });
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
      for (const member of expired) this.replica.write(this.identity, sealFor(this.#managed.cipher(space), { kind: KIND_REMOVE, body: { member, upTo: this.#upTo(member), at: this.#anchor(member, space) } }));
      const remaining = [...state.members.keys()].filter((did) => !expired.includes(did));
      const { fields, epoch, key } = rekey(space, remaining, this.#encryptionKeyOf);
      space.keys[String(epoch)] = key;
      this.#saveSpace(space);
      this.replica.write(this.identity, fields);
      this.#managed.afterRekey(space, epoch, key);
      removed += expired.length;
    }
    return removed;
  }

  #publishTier(before: Tier, patch: { name?: string; price?: number; currency?: string; description?: string; benefits?: string[]; position?: number; open?: boolean; auto?: boolean; hidden?: boolean; gumroad?: GumroadLink | null; onchain?: OnchainPrice | null }): void {
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
    // On chain: a new price, null to remove it, or keep the one before.
    if (patch.onchain) {
      const onchain = parseOnchainPrice(patch.onchain);
      if (!onchain) throw new Error('an onchain price names the chain, the token (0x…), its decimals, the address paid to (0x…) and a whole amount per month');
      body.onchain = onchain as unknown as Json;
    } else if (patch.onchain === undefined && before.onchain) body.onchain = before.onchain as unknown as Json;
    this.replica.write(this.identity, { kind: KIND_TIER, body });
  }

  /** The tiers a creator offers, from their public events. */
  #tierOffers(creator: Did): Tier[] {
    return tiersOf(this.#eventsOf(creator));
  }

  /** A tier anyone offers, by id or name (yours first). */
  /**
   * A tier by id or name, of `creator` if given. Anyone can publish a tier under
   * someone else's id: then the id alone doesn't say whose. It's the tier whose
   * group this node holds with that founder, or else the creator has to be named
   * (the app always does: you join a tier from its creator's hub).
   */
  #tierOffer(ref: string, creator?: Did): Tier {
    const all = tiersOf(this.replica.events((e) => e.kind === KIND_TIER)).filter((t) => !creator || t.creator === creator);
    let match = all.filter((t) => t.id === ref);
    if (!match.length) match = all.filter((t) => t.creator === this.identity.author && t.name.toLowerCase() === ref.toLowerCase());
    if (!match.length) match = all.filter((t) => t.name.toLowerCase() === ref.toLowerCase());
    if (match.length > 1) {
      const founded = match.filter((t) => this.#spaces.get(t.id)?.founder === t.creator);
      if (founded.length === 1) return founded[0];
    }
    if (match.length === 1) return match[0];
    throw new Error(match.length ? `several people offer a tier "${ref}": name its creator (or join from their hub)` : `no tier "${ref}" is known`);
  }

  /** One of your own tiers' groups. */
  #tierGroup(ref: string): StoredSpace {
    const tier = this.#tierOffer(ref, this.identity.author);
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
      ...(tier.onchain ? { onchain: tier.onchain } : {}),
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

  // ---------------------------------------------------------------- badges

  async createBadgeSeries(input: { project: string; name: string; symbol?: string; image?: string; description?: string; limit?: number }): Promise<BadgeSeriesInfo> {
    const project = this.#project(input.project);
    this.#maintainerState(project);
    const limit = input.limit === undefined ? undefined : parseBadgeLimit(input.limit);
    if (input.limit !== undefined && !limit) throw new Error(`a limit is a whole number from 1 to ${BADGE_LIMIT_MAX}`);
    const id = b64u.encode(randomBytes(16));
    this.#publishBadgeSeries(id, { name: input.name, symbol: input.symbol ?? '', image: input.image ?? '', description: input.description ?? '' }, { project: { id: project.id, name: project.name }, ...(limit ? { limit } : {}) });
    return this.#badgeSeriesInfo(this.#badgeSeriesRef(id));
  }

  async setBadgeSeries(input: { series: string; name?: string; symbol?: string; image?: string; description?: string }): Promise<BadgeSeriesInfo> {
    const before = this.#badgeSeriesRef(input.series);
    if (before.issuer !== this.identity.author) throw new Error(`only ${this.nameOf(before.issuer) ?? 'its issuer'} can change ${before.name}`);
    this.#publishBadgeSeries(before.id, { name: input.name ?? before.name, symbol: input.symbol ?? before.symbol, image: input.image ?? before.image ?? '', description: input.description ?? before.description }, {});
    return this.#badgeSeriesInfo(this.#badgeSeriesRef(before.id));
  }

  async badgeSeries(project?: string): Promise<BadgeSeriesInfo[]> {
    const id = project === undefined ? undefined : this.#project(project).id;
    return this.#allBadges()
      .series.filter((s) => !id || s.project?.id === id)
      .sort((a, b) => a.time.localeCompare(b.time))
      .map((s) => this.#badgeSeriesInfo(s));
  }

  async giveBadge(input: { series: string; who: string; note?: string; ref?: string; personal?: string }): Promise<BadgeInfo> {
    const series = this.#badgeSeriesRef(input.series);
    if (series.issuer !== this.identity.author) throw new Error(`only ${this.nameOf(series.issuer) ?? 'its issuer'} can give ${series.name}`);
    if (series.broken) throw new Error(`${series.name} is broken: it has more badges than its limit, or a number twice`);
    if (series.limit && series.given >= series.limit) throw new Error(`all ${series.limit} of ${series.name} are given`);
    const to = this.resolve(input.who);
    const taken = new Set(this.#allBadges().badges.filter((b) => b.series === series.id).map((b) => b.n));
    let n = 1;
    while (taken.has(n)) n++;
    const note = input.note?.trim().slice(0, 500) ?? '';
    const ref = input.ref?.trim().slice(0, 200) ?? '';
    // A personal note: boxed to them (and to us, to read it again); only its hash is public, so they can prove our words if they publish it.
    const text = input.personal?.trim() ?? '';
    if (text.length > BADGE_NOTE_MAX) throw new Error(`a personal note is at most ${BADGE_NOTE_MAX} characters`);
    const salt = b64u.encode(randomBytes(16));
    const personal = text
      ? { hash: badgeNoteHash(text, salt), boxes: [...new Set([to, this.identity.author])].map((did) => boxTo(this.#encryptionKeyOf(did), { text, salt })) as unknown as Json[] }
      : undefined;
    const event = this.replica.write(this.identity, { kind: KIND_BADGE, body: { series: series.id, n, to, ...(note ? { note } : {}), ...(ref ? { ref } : {}), ...(personal ? { personal } : {}) } });
    return this.#badgeInfo(this.#badgeRef(event.id));
  }

  async badges(who?: string): Promise<BadgeInfo[]> {
    const holder = who ? this.resolve(who) : this.identity.author;
    return this.#allBadges()
      .badges.filter((b) => b.holder === holder)
      .sort((a, b) => a.time.localeCompare(b.time))
      .map((b) => this.#badgeInfo(b));
  }

  async transferBadge(input: { badge: string; to: string }): Promise<BadgeInfo> {
    const badge = this.#badgeRef(input.badge);
    if (badge.holder !== this.identity.author) throw new Error("you don't hold that badge");
    if (badge.invalid) throw new Error("that badge isn't valid: its issuer gave more than the limit, or its number twice");
    const to = this.resolve(input.to);
    if (to === this.identity.author) throw new Error('you hold it already');
    this.replica.write(this.identity, { kind: KIND_BADGE_TRANSFER, body: { badge: badge.id, from: badge.head, to } });
    return this.#badgeInfo(this.#badgeRef(badge.id));
  }

  /** Make the personal note on a badge you were given public, or (on: false) take it back. */
  async publishBadgeNote(input: { badge: string; on?: boolean }): Promise<BadgeInfo> {
    const badge = this.#badgeRef(input.badge);
    if (badge.to !== this.identity.author) throw new Error('only the one a badge was given to can publish its personal note');
    if (!badge.personal) throw new Error('that badge has no personal note');
    if (input.on === false) {
      this.replica.write(this.identity, { kind: KIND_BADGE_NOTE, body: { badge: badge.id, on: false } });
    } else {
      const opened = this.#openBadgeNote(badge);
      if (!opened) throw new Error("this node can't open the personal note");
      this.replica.write(this.identity, { kind: KIND_BADGE_NOTE, body: { badge: badge.id, text: opened.text, salt: opened.salt, on: true } });
    }
    return this.#badgeInfo(this.#badgeRef(badge.id));
  }

  /** A badge's personal note, if one of its boxes is ours and it matches the hash its issuer signed. */
  #openBadgeNote(badge: Badge): { text: string; salt: string } | undefined {
    for (const box of badge.personal?.boxes ?? []) {
      const opened = this.#tryOpen((me) => {
        try {
          return openBox(me.keys.secretKey, me.keys.publicKey, box) as { text?: unknown; salt?: unknown };
        } catch {
          return undefined;
        }
      });
      if (typeof opened?.text === 'string' && typeof opened.salt === 'string' && badgeNoteHash(opened.text, opened.salt) === badge.personal!.hash) return { text: opened.text, salt: opened.salt };
    }
    return undefined;
  }

  #publishBadgeSeries(id: string, fields: { name: string; symbol: string; image: string; description: string }, first: { project?: { id: string; name: string }; limit?: number }): void {
    const name = fields.name.trim();
    if (!name || name.length > 40) throw new Error('badge names are 1 to 40 characters');
    const symbol = fields.symbol.trim();
    if (symbol.length > 8) throw new Error('a badge symbol is short: an emoji or two');
    if (fields.image && !parseBlobRef(fields.image)) throw new Error('a badge picture is an uploaded image (wblob: reference)');
    const body: Record<string, Json> = { series: id, name, symbol, description: fields.description.trim().slice(0, 1000) };
    if (fields.image) body.image = fields.image;
    if (first.project) body.project = first.project;
    if (first.limit) body.limit = first.limit;
    this.replica.write(this.identity, { kind: KIND_BADGE_SERIES, body });
  }

  /**
   * Every badge series and badge this node holds the events of, checked against each other.
   * A series counts for a project only if its issuer maintains it: in projects this node is in,
   * one whose issuer doesn't is a false claim and left out with its badges; elsewhere the claim
   * shows as unchecked.
   */
  #allBadges(): { series: BadgeSeries[]; badges: Badge[] } {
    const all = badgesOf(this.replica.events((e) => e.kind === KIND_BADGE_SERIES || e.kind === KIND_BADGE || e.kind === KIND_BADGE_TRANSFER || e.kind === KIND_BADGE_NOTE));
    const claimed = new Set<string>();
    const series = all.series.flatMap((s): BadgeSeries[] => {
      if (!s.project) return [s];
      const project = this.#spaces.get(s.project.id);
      if (project?.kind !== 'project') return [{ ...s, project: { ...s.project, checked: false } }];
      if (mayAct(this.#state(project), s.issuer, 'curate').ok) return [{ ...s, project: { id: project.id, name: project.name, checked: true } }];
      claimed.add(s.id);
      return [];
    });
    return { series, badges: claimed.size ? all.badges.filter((b) => !claimed.has(b.series)) : all.badges };
  }

  /** A series by id, or by name (yours first). */
  #badgeSeriesRef(ref: string): BadgeSeries {
    const all = this.#allBadges().series;
    const byId = all.find((s) => s.id === ref);
    if (byId) return byId;
    const named = all.filter((s) => s.name.toLowerCase() === ref.toLowerCase());
    const mine = named.filter((s) => s.issuer === this.identity.author);
    const match = mine.length ? mine : named;
    if (match.length === 1) return match[0];
    throw new Error(match.length ? `several badges are named "${ref}" — use its id` : `no badge "${ref}" is known`);
  }

  /** A badge by id or the start of it. */
  #badgeRef(ref: string): Badge {
    const all = this.#allBadges().badges;
    const match = all.filter((b) => b.id === ref || (ref.length >= 6 && b.id.startsWith(ref)));
    if (match.length === 1) return match[0];
    throw new Error(match.length ? `several badges start with "${ref}" — use more of its id` : `no badge "${ref}" is known`);
  }

  #personalInfo(badge: Badge): NonNullable<BadgeInfo['personal']> {
    const published = badge.personal?.published;
    const text = published ?? this.#openBadgeNote(badge)?.text;
    return { ...(text !== undefined ? { text } : {}), published: published !== undefined, mayPublish: badge.to === this.identity.author };
  }

  #badgeSeriesInfo(series: BadgeSeries): BadgeSeriesInfo {
    return { ...series, issuer: { did: series.issuer, name: this.nameOf(series.issuer) }, mine: series.issuer === this.identity.author };
  }

  #badgeInfo(badge: Badge): BadgeInfo {
    const series = this.#badgeSeriesRef(badge.series);
    const person = (did: Did) => ({ did, name: this.nameOf(did) });
    return {
      id: badge.id,
      series: { id: series.id, name: series.name, symbol: series.symbol, ...(series.image ? { image: series.image } : {}), ...(series.limit ? { limit: series.limit } : {}), broken: series.broken, ...(series.project ? { project: series.project } : {}) },
      issuer: person(badge.issuer),
      n: badge.n,
      holder: person(badge.holder),
      holders: badge.holders.map(person),
      note: badge.note,
      ...(badge.ref ? { ref: badge.ref } : {}),
      ...(badge.personal ? { personal: this.#personalInfo(badge) } : {}),
      time: badge.time,
      ...(badge.invalid ? { invalid: badge.invalid } : {}),
      ...(badge.contested ? { contested: true as const } : {}),
      mine: badge.holder === this.identity.author,
    };
  }

  // ---------------------------------------------------------------- treasuries

  async walletMessage(address: string): Promise<string> {
    if (!isAddress(address)) throw new Error('a wallet address is 0x and 40 hex digits');
    return walletMessage(this.identity.author, address);
  }

  async linkWallet(input: { address: string; proof?: string }): Promise<WalletInfo | undefined> {
    if (input.address === '') {
      this.replica.write(this.identity, { kind: KIND_WALLET, body: { address: '' } });
      return undefined;
    }
    if (!isAddress(input.address)) throw new Error('a wallet address is 0x and 40 hex digits');
    const address = checksumAddress(input.address);
    if (!input.proof) throw new Error(`sign this with the wallet (personal_sign), then pass the signature as proof:\n${walletMessage(this.identity.author, address)}`);
    // A wallet with a key signs itself; a smart wallet's contract says whether the signature is its own (EIP-1271), on chain.
    let contract = false;
    if (!verifyWalletProof(this.identity.author, address, input.proof)) {
      const answer = await this.callChain(TREASURY_CHAIN.id, contractWalletCheck(this.identity.author, address, input.proof)).catch(() => '');
      if (!contractWalletSaysYes(answer)) throw new Error(`that signature isn't from ${address} (nor does it confirm it as a smart wallet on ${TREASURY_CHAIN.name}) over:\n${walletMessage(this.identity.author, address)}`);
      contract = true;
      this.#recordContractCheck(this.identity.author, address, input.proof, true);
    }
    const before = this.#wallets().get(this.identity.author);
    this.replica.write(this.identity, { kind: KIND_WALLET, body: { chain: `eip155:${TREASURY_CHAIN.id}`, address, proof: input.proof, ...(contract ? { contract: true } : {}) } });
    if (before?.verified && before.address !== address) await this.#movedWallet(before.address, address);
    return this.wallet();
  }

  /**
   * After a new wallet: the old one is retired (people paying it are warned),
   * our tiers paid there now ask for the new one, and the treasuries we
   * maintain that were announced get their new address, the old one retired.
   */
  async #movedWallet(old: string, now: string): Promise<void> {
    this.replica.write(this.identity, { kind: KIND_SAFE_RETIRED, body: { safe: old, successor: now, kind: 'wallet', owners: [], threshold: 1 } });
    for (const tier of this.#tierOffers(this.identity.author)) {
      if (tier.onchain?.to.toLowerCase() === old.toLowerCase()) await this.setTier({ tier: tier.id, onchain: { ...tier.onchain, to: now } });
    }
    const announced = this.#treasuries();
    for (const space of this.#spaces.values()) {
      if ((space.kind !== 'project' && space.kind !== 'community') || !this.#state(space).maintainers.has(this.identity.author) || !announced.has(space.id)) continue;
      await this.announceTreasury(space.id).catch(() => undefined);
    }
  }

  async wallet(who?: string): Promise<WalletInfo | undefined> {
    const owner = who ? this.resolve(who) : this.identity.author;
    const wallet = this.#wallets().get(owner);
    if (!wallet) return undefined;
    return { owner: { did: owner, name: this.nameOf(owner) }, address: wallet.address, verified: wallet.verified, ...(wallet.contract ? { contract: true as const } : {}), time: wallet.time, mine: owner === this.identity.author };
  }

  async treasury(ref: string): Promise<TreasuryInfo> {
    const space = this.#space(ref);
    if (space.kind !== 'project' && space.kind !== 'community') throw new Error(`${space.name} is a ${space.kind}: only projects and communities have a treasury`);
    const state = this.#state(space);
    const wallets = this.#wallets();
    const person = (did: Did) => ({ did, name: this.nameOf(did) });
    const owners: TreasuryInfo['owners'] = [];
    const missing: TreasuryInfo['missing'] = [];
    for (const did of state.maintainers) {
      const wallet = wallets.get(did);
      if (wallet?.verified) owners.push({ person: person(did), address: wallet.address });
      else missing.push(person(did));
    }
    owners.sort((a, b) => a.address.toLowerCase().localeCompare(b.address.toLowerCase()));
    const threshold = treasuryThreshold(owners.length);
    const ownerAddresses = owners.map((o) => o.address);
    const address = owners.length ? safeAddress(ownerAddresses, threshold, treasurySaltNonce(space.id)) : undefined;
    const announced = this.#treasuries();
    const { current, pending } = space.kind === 'project' ? splitOf(this.#entries(space), state.maintainers, new Date(this.clock()), this.#seenAt) : {};
    const splitInfo = (split: Split): SplitInfo => ({ ...split, makers: split.makers.map((m) => ({ person: person(m.did), share: m.share })), by: person(split.by) });
    // A space this node holds pays its treasury as computed here from its maintainers' wallets, never as someone announced it (7iriYk4C).
    const paid = new Map(announced);
    for (const id of [current?.community, WEAVE_FOUNDATION_PROJECT]) {
      const held = id ? this.#spaces.get(id) : undefined;
      if (!id || !held) continue;
      const own = this.#treasuryAddressOf(held);
      if (own) paid.set(id, { space: id, kind: held.kind === 'community' ? 'community' : 'project', address: own, owners: [], threshold: 0, by: this.identity.author, time: '', consistent: true });
      else paid.delete(id);
    }
    const recipients = current
      ? splitRecipients(current, { project: space.id, maintainers: [...state.maintainers], wallets, ...(address ? { treasury: address } : {}), treasuries: paid, ...(WEAVE_FOUNDATION_PROJECT ? { foundation: WEAVE_FOUNDATION_PROJECT } : {}) })
      : undefined;
    const allocations = recipients && splitAllocations(recipients);
    const recipientName = (r: { kind: string; id: string }) => (r.kind === 'person' ? this.nameOf(r.id as Did) : r.kind === 'foundation' ? 'Weave Foundation' : this.#spaces.get(r.id)?.name);
    return {
      project: { id: space.id, name: space.name },
      kind: space.kind,
      chain: { id: TREASURY_CHAIN.id, name: TREASURY_CHAIN.name, explorer: TREASURY_CHAIN.explorer },
      ...(address ? { address } : {}),
      threshold,
      owners,
      missing,
      ...(current ? { split: splitInfo(current) } : {}),
      ...(pending ? { pending: splitInfo(pending) } : {}),
      presets: SPLIT_PRESETS,
      ...(recipients ? { recipients: recipients.map((r) => ({ ...r, name: recipientName(r) })) } : {}),
      ...(allocations ? { allocations } : {}),
      ...(address ? { deploy: safeDeployment(ownerAddresses, threshold, treasurySaltNonce(space.id)) } : {}),
      ...(address && allocations ? { splitDeploy: splitDeployment(allocations, address, splitSalt(space.id)) } : {}),
      announced: !!address && announced.get(space.id)?.address === address,
      retired: [...this.#retired().values()].filter((r) => r.kind === 'treasury' && r.space === space.id).map((r) => ({ address: r.address, successor: r.successor, time: r.time })),
      maintainer: state.maintainers.has(this.identity.author),
    };
  }

  async splitContract(ref: string): Promise<SplitContractInfo> {
    const t = await this.treasury(ref);
    if (t.kind !== 'project') throw new Error(`${t.project.name} is a community: splits are for projects`);
    if (!t.split) throw new Error(`${t.project.name} has no split yet (weave split <preset>)`);
    if (!t.address || !t.allocations) throw new Error(`${t.project.name} has no treasury yet: a maintainer has to link a wallet first`);
    const salt = splitSalt(t.project.id);
    // The factory says where the split is and whether it exists: one read-only call answers both.
    const answer = await this.callChain(t.chain.id, splitDeployedCall(t.allocations, t.address, salt));
    const address = checksumAddress('0x' + answer.slice(26, 66));
    return { chain: t.chain, address, deployed: BigInt('0x' + answer.slice(66, 130)) === 1n, deploy: splitDeployment(t.allocations, t.address, salt), allocations: t.allocations };
  }

  async announceTreasury(ref: string): Promise<TreasuryInfo> {
    const space = this.#space(ref);
    this.#maintainerState(space);
    const treasury = await this.treasury(space.id);
    if (!treasury.address) throw new Error(`${space.name} has no treasury yet: its ${space.kind === 'community' ? 'moderators' : 'maintainers'} need to link a wallet first`);
    if (!treasury.announced) {
      // Its owners changed wallets: the treasury announced before is retired, and says where money goes now.
      const before = this.#treasuries().get(space.id);
      if (before && before.address !== treasury.address) {
        this.replica.write(this.identity, { kind: KIND_SAFE_RETIRED, body: { safe: before.address, successor: treasury.address, kind: 'treasury', space: space.id, owners: before.owners, threshold: before.threshold } });
      }
      this.replica.write(this.identity, { kind: KIND_TREASURY, body: { space: space.id, kind: treasury.kind, address: treasury.address, owners: treasury.owners.map((o) => o.address), threshold: treasury.threshold } });
    }
    return this.treasury(space.id);
  }

  async sweepRetired(ref: string): Promise<Array<{ safe: string; balance: string; proposal?: SafeProposalInfo; deploy: { to: string; data: string } }>> {
    const space = this.#space(ref);
    const current = (await this.treasury(space.id)).address;
    const out: Array<{ safe: string; balance: string; proposal?: SafeProposalInfo; deploy: { to: string; data: string } }> = [];
    for (const retired of this.#retired().values()) {
      if (retired.kind !== 'treasury' || retired.space !== space.id) continue;
      const to = retired.successor || current;
      if (!to) continue;
      const balance = BigInt(await this.callChain(TEST_USDC.chain, { to: TEST_USDC.token, data: erc20BalanceOf(retired.address) }));
      // An old Safe that was never put on chain has to be deployed first, with its old owners, before it can send anything.
      const deploy = safeDeployment(retired.owners, retired.threshold, treasurySaltNonce(space.id));
      if (!balance) {
        out.push({ safe: retired.address, balance: '0', deploy });
        continue;
      }
      const open = this.#allSafeProposals().find((p) => p.safe === retired.address && p.title.startsWith('Move what is left'));
      const proposal = open ? this.#safeProposalInfo(open.id) : await this.proposeSafeTx({ safe: retired.address, tx: { to: TEST_USDC.token, data: erc20Transfer(to, balance) }, title: `Move what is left (${formatUnits(balance, TEST_USDC.decimals)} USDC) to ${to}` });
      out.push({ safe: retired.address, balance: balance.toString(), proposal, deploy });
    }
    return out;
  }

  #retired() {
    const history = this.#walletHistory();
    return retiredOf(this.replica.events((e) => e.kind === KIND_SAFE_RETIRED), (r) => (r.kind === 'wallet' ? history.get(r.address.toLowerCase()) === r.by : !!r.space && this.#manages(r.space, r.by)));
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

  /** Whether someone manages a space we know: outside it, we can't tell, and say no. */
  #manages(spaceId: string, did: Did): boolean {
    const space = this.#spaces.get(spaceId);
    return !!space && mayAct(this.#state(space), did, 'manage').ok;
  }

  async label(input: { target: string; label: 'endorse' | 'block' | ''; reason?: string }): Promise<LabelInfo | undefined> {
    const target = isAddress(input.target) ? labelTarget(input.target) : parseLabelTarget(input.target);
    if (!target) throw new Error("a label's target is an address (0x…) or eip155:<chain id>:<address>");
    if (input.label && input.label !== 'endorse' && input.label !== 'block') throw new Error('a label is endorse or block ("" withdraws yours)');
    const reason = input.reason?.trim().slice(0, 500) ?? '';
    if (input.label === 'block' && !reason) throw new Error('say why you block it: people following your labels see the reason');
    this.replica.write(this.identity, { kind: KIND_LABEL, body: { target, label: input.label, ...(reason ? { reason } : {}) } });
    return (await this.labels({ target, by: [this.identity.author] }))[0];
  }

  async labels(input: { target?: string; by?: string[] } = {}): Promise<LabelInfo[]> {
    const target = input.target ? (isAddress(input.target) ? labelTarget(input.target) : parseLabelTarget(input.target)) : undefined;
    const by = input.by ? new Set(input.by.map((who) => this.resolve(who))) : undefined;
    // Retired addresses are labels too, from their owners: whoever pays them is warned and told where to pay instead.
    const retired = [...this.#retired().values()].map((r) => ({ target: labelTarget(r.address), label: 'retired' as const, reason: r.successor ? `retired: pay ${r.successor} instead` : 'retired', by: r.by, time: r.time }));
    return [...labelsOf(this.replica.events((e) => e.kind === KIND_LABEL)), ...retired]
      .filter((l) => (!target || l.target === target) && (!by || by.has(l.by)))
      .map((l) => ({ ...l, by: { did: l.by, name: this.nameOf(l.by) }, mine: l.by === this.identity.author }));
  }

  async setSplit(input: { project: string; preset?: string; shares?: { makers: number; treasury?: number; community?: number; foundation?: number }; makers?: Array<{ who: string; share: number }>; community?: string }): Promise<TreasuryInfo> {
    const project = this.#project(input.project);
    this.#maintainerState(project);
    const preset = input.shares ? 'custom' : (input.preset ?? 'standard');
    const shares = input.shares ? parseShares(input.shares) : SPLIT_PRESETS[preset];
    if (!shares) throw new Error(input.shares ? 'shares are whole basis points (10000 = 100%) that add up to 10000' : `no preset "${preset}": ${Object.keys(SPLIT_PRESETS).join(', ')}`);
    const makers = (input.makers ?? []).map((m) => ({ did: this.resolve(m.who), share: m.share }));
    if (makers.length && (!makers.every((m) => Number.isInteger(m.share) && m.share > 0) || makers.reduce((sum, m) => sum + m.share, 0) !== 10000)) throw new Error("the makers' shares are whole basis points of their part, adding up to 10000");
    let community: string | undefined;
    if (input.community) {
      const space = this.#space(input.community);
      if (space.kind !== 'community') throw new Error(`${space.name} is not a community`);
      community = space.id;
    }
    const body: Record<string, Json> = { preset, shares: { ...shares } };
    if (makers.length) body.makers = makers;
    if (community) body.community = community;
    await this.publish({ kind: KIND_TREASURY_SPLIT, body, space: project.id });
    // A split names the treasury it pays: announce it, so others can see where the money goes.
    if ((await this.treasury(project.id)).address) return this.announceTreasury(project.id);
    return this.treasury(project.id);
  }

  #wallets() {
    return walletsOf(this.replica.events((e) => e.kind === KIND_WALLET), this.#contractChecked);
  }

  /** What the chain said about smart wallets' signatures (owner, address and proof → ok), from our sealed records. */
  #contractChecks?: Map<string, boolean>;
  #contractChecked = (owner: Did, address: string, proof: string): boolean | undefined => {
    if (!this.#contractChecks) {
      this.#contractChecks = new Map();
      for (const b of this.#selfBodies(KIND_WALLET_CHECKED)) this.#contractChecks.set(`${b.owner} ${String(b.address).toLowerCase()} ${b.proof}`, b.ok === true);
    }
    return this.#contractChecks.get(`${owner} ${address.toLowerCase()} ${proof}`);
  };

  #recordContractCheck(owner: Did, address: string, proof: string, ok: boolean): void {
    this.#contractChecked(owner, address, proof); // loads what's recorded
    this.#contractChecks!.set(`${owner} ${address.toLowerCase()} ${proof}`, ok);
    this.replica.write(this.identity, this.#sealForSelf({ kind: KIND_WALLET_CHECKED, body: { owner, address, proof, ok } }));
  }

  /** Ask the chain about smart wallets others linked that we haven't asked about yet. */
  async #checkContractWallets(): Promise<number> {
    let checked = 0;
    for (const link of contractWalletLinks(this.replica.events((e) => e.kind === KIND_WALLET))) {
      if (this.#contractChecked(link.owner, link.address, link.proof) !== undefined) continue;
      let answer: string;
      try {
        answer = await this.callChain(TREASURY_CHAIN.id, contractWalletCheck(link.owner, link.address, link.proof));
      } catch {
        continue; // offline: ask again next round
      }
      this.#recordContractCheck(link.owner, link.address, link.proof, contractWalletSaysYes(answer));
      checked++;
    }
    return checked;
  }

  #walletHistory() {
    return walletHistoryOf(this.replica.events((e) => e.kind === KIND_WALLET), this.#contractChecked);
  }

  #treasuries() {
    return treasuriesOf(this.replica.events((e) => e.kind === KIND_TREASURY), (space, author) => this.#manages(space, author));
  }

  // ---------------------------------------------------------------- signing a Safe's transactions together

  async proposeSafeTx(input: { safe: string; tx: { to: string; value?: string; data: string; operation?: 0 | 1 }; title: string }): Promise<SafeProposalInfo> {
    const safe = this.#knownSafe(input.safe);
    if (!safe.owners.some((o) => o.did === this.identity.author)) throw new Error(`only the owners of ${safe.label} propose its transactions`);
    // The Safe's next nonce from the chain; a Safe not deployed yet starts at 0.
    const answer = await this.callChain(TREASURY_CHAIN.id, { to: safe.address, data: SAFE_CALLS.nonce });
    const nonce = answer && answer !== '0x' ? Number(BigInt(answer)) : 0;
    const tx = parseSafeTx({ to: input.tx.to, value: input.tx.value ?? '0', data: input.tx.data, operation: input.tx.operation ?? 0, nonce });
    if (!tx) throw new Error('a Safe transaction has a target address, data (0x…) and an operation (0 call, 1 delegatecall)');
    if (tx.operation === 1 && tx.to.toLowerCase() !== MULTI_SEND_CALL_ONLY.toLowerCase()) throw new Error('Weave only proposes delegatecalls to MultiSendCallOnly');
    const id = b64u.encode(randomBytes(12));
    this.replica.write(this.identity, { kind: KIND_SAFE_PROPOSAL, body: { proposal: id, chain: TREASURY_CHAIN.id, safe: safe.address, ...tx, title: input.title.trim().slice(0, 200) } as unknown as Json });
    return this.#safeProposalInfo(id);
  }

  async signSafeTx(input: { proposal: string; signature: string }): Promise<SafeProposalInfo> {
    const proposal = this.#safeProposal(input.proposal);
    const safe = this.#knownSafe(proposal.safe);
    // A wallet signed the typed data or the hash as a message; the signature alone doesn't say which: take the reading that gives an owner.
    const isOwner = (s: { owner: string } | undefined) => !!s && safe.owners.some((o) => o.address.toLowerCase() === s.owner.toLowerCase());
    const signed = [safeSigner(proposal.hash, input.signature.trim()), safeSigner(proposal.hash, asEthSign(input.signature.trim()))].find(isOwner);
    if (!signed) throw new Error(`that isn't a signature of one of ${safe.label}'s owners over ${proposal.hash} (sign the typed data, or the hash as a message)`);
    this.replica.write(this.identity, { kind: KIND_SAFE_SIGNATURE, body: { proposal: proposal.id, hash: proposal.hash, signature: signed.signature } });
    return this.#safeProposalInfo(proposal.id);
  }

  async safeProposals(safe?: string): Promise<SafeProposalInfo[]> {
    const address = safe ? this.#knownSafe(safe).address : undefined;
    return this.#allSafeProposals()
      .filter((p) => !address || p.safe === address)
      .map((p) => this.#safeProposalInfo(p.id));
  }

  /** The Safes this node knows the owners of: the treasuries of its projects and communities, and the shows' Safes. */
  #knownSafes(): Array<{ address: string; label: string; owners: Array<{ did: Did; address: string }>; threshold: number }> {
    const wallets = this.#wallets();
    const history = this.#walletHistory();
    const out: Array<{ address: string; label: string; owners: Array<{ did: Did; address: string }>; threshold: number }> = [];
    const ownersOf = (dids: Iterable<Did>) => [...dids].flatMap((did) => (wallets.get(did)?.verified ? [{ did, address: wallets.get(did)!.address }] : []));
    // Recorded owners: the wallets a Safe was made for, whoever linked them, even if they moved on since.
    const recorded = (addresses: string[]) => addresses.flatMap((address) => (history.get(address.toLowerCase()) ? [{ did: history.get(address.toLowerCase())!, address }] : []));
    for (const space of this.#spaces.values()) {
      if (space.kind !== 'project' && space.kind !== 'community') continue;
      const owners = ownersOf(this.#state(space).maintainers);
      const address = this.#treasuryAddressOf(space);
      if (address) out.push({ address, label: `${space.name}'s treasury`, owners, threshold: treasuryThreshold(owners.length) });
    }
    for (const show of this.#allShows()) {
      if (show.owners) out.push({ address: show.price.to, label: `the Safe of ${show.name}`, owners: recorded(show.owners), threshold: show.threshold ?? treasuryThreshold(show.owners.length) });
      else {
        // Shows from before owners were recorded: their hosts' wallets now.
        const owners = ownersOf(show.hosts);
        if (owners.length === show.hosts.length) out.push({ address: show.price.to, label: `the Safe of ${show.name}`, owners, threshold: treasuryThreshold(owners.length) });
      }
    }
    for (const retired of this.#retired().values()) {
      if (retired.kind !== 'treasury' || out.some((s) => s.address === retired.address)) continue;
      const space = retired.space ? this.#spaces.get(retired.space) : undefined;
      out.push({ address: retired.address, label: `${space?.name ?? 'a'} retired treasury`, owners: recorded(retired.owners), threshold: retired.threshold });
    }
    return out;
  }

  #knownSafe(ref: string): { address: string; label: string; owners: Array<{ did: Did; address: string }>; threshold: number } {
    const found = this.#knownSafes().find((s) => s.address.toLowerCase() === ref.toLowerCase());
    if (!found) throw new Error(`Weave doesn't know whose Safe ${ref} is: only treasuries and shows' Safes it knows the owners of`);
    return found;
  }

  #allSafeProposals() {
    return safeProposalsOf(this.replica.events((e) => e.kind === KIND_SAFE_PROPOSAL || e.kind === KIND_SAFE_SIGNATURE));
  }

  #safeProposal(ref: string) {
    const match = this.#allSafeProposals().filter((p) => p.id === ref || (ref.length >= 6 && p.id.startsWith(ref)));
    if (match.length === 1) return match[0];
    throw new Error(match.length ? `several proposals start with "${ref}"` : `no proposal "${ref}" is known`);
  }

  #safeProposalInfo(id: string): SafeProposalInfo {
    const proposal = this.#safeProposal(id);
    const safe = this.#knownSafes().find((s) => s.address === proposal.safe);
    const owners = safe?.owners ?? [];
    // Only signatures of today's owners count.
    const signatures = proposal.signatures.flatMap((s) => {
      const owner = owners.find((o) => o.address.toLowerCase() === s.owner.toLowerCase());
      return owner ? [{ ...s, person: { did: owner.did, name: this.nameOf(owner.did) } }] : [];
    });
    const threshold = safe?.threshold ?? 1;
    const ready = signatures.length >= threshold;
    return {
      id: proposal.id,
      title: proposal.title,
      safe: { address: proposal.safe, label: safe?.label ?? proposal.safe, threshold },
      chain: proposal.chain,
      tx: proposal.tx,
      hash: proposal.hash,
      typedData: safeTxTypedData(proposal.chain, proposal.safe, proposal.tx),
      by: { did: proposal.by, name: this.nameOf(proposal.by) },
      time: proposal.time,
      signed: signatures.map((s) => ({ person: s.person, owner: s.owner })),
      waiting: owners.filter((o) => !signatures.some((s) => s.owner.toLowerCase() === o.address.toLowerCase())).map((o) => ({ did: o.did, name: this.nameOf(o.did) })),
      ...(ready ? { exec: { to: proposal.safe, data: execTransactionData(proposal.tx, signatures.slice(0, threshold)) } } : {}),
      mine: owners.some((o) => o.did === this.identity.author),
      signedByMe: signatures.some((s) => s.person.did === this.identity.author),
    };
  }

  // ---------------------------------------------------------------- paying from a wallet, without copying anything

  async paymentRequest(input: { tier?: string; creator?: string; show?: string }): Promise<PaymentRequestInfo> {
    const { price, what } = this.#payable(input);
    const wallet = this.#wallets().get(this.identity.author);
    if (!wallet?.verified) throw new Error('link your wallet first (weave wallet link): Weave looks for your payment from it');
    const since = Number(BigInt(await this.chainRpc<string>(price.chain, 'eth_blockNumber', [])));
    return {
      what,
      chain: price.chain,
      token: price.token,
      symbol: price.symbol,
      decimals: price.decimals,
      to: price.to,
      amount: String(price.amount),
      from: wallet.address,
      // EIP-681: phone wallets open this as "send <amount> of the token to <to>", from a QR code.
      uri: `ethereum:${price.token}@${price.chain}/transfer?address=${price.to}&uint256=${price.amount}`,
      // The same as a transaction for a wallet in the browser (eth_sendTransaction).
      tx: { from: wallet.address, to: price.token, data: erc20Transfer(price.to, BigInt(price.amount)), chainId: '0x' + price.chain.toString(16) },
      since,
    };
  }

  async findPayment(input: { tier?: string; creator?: string; show?: string; since: number }): Promise<{ found?: string; checkedTo: number }> {
    const { price } = this.#payable(input);
    // From any wallet we ever linked (we may have moved on), to the address asked for.
    const mine = [...this.#walletHistory()].filter(([, did]) => did === this.identity.author).map(([address]) => '0x' + address.slice(2).padStart(64, '0'));
    if (!mine.length) throw new Error('link your wallet first (weave wallet link)');
    const latest = Number(BigInt(await this.chainRpc<string>(price.chain, 'eth_blockNumber', [])));
    let from = Math.max(0, input.since);
    // Public nodes answer at most a couple of hundred blocks per question: look in steps, a few per call.
    for (let steps = 0; from <= latest && steps < 25; steps++) {
      const to = Math.min(latest, from + 199);
      const logs = await this.chainRpc<Array<{ transactionHash: string; data: string }>>(price.chain, 'eth_getLogs', [
        { address: price.token, topics: [TRANSFER_TOPIC, mine, '0x' + price.to.slice(2).toLowerCase().padStart(64, '0')], fromBlock: '0x' + from.toString(16), toBlock: '0x' + to.toString(16) },
      ]);
      const paid = logs.find((l) => BigInt(l.data) >= BigInt(price.amount));
      if (paid) {
        // Found: send it on, as if its hash had been pasted.
        if (input.tier) await this.requestMembership({ tier: input.tier, ...(input.creator ? { creator: input.creator } : {}), payment: paid.transactionHash });
        else await this.buyTicket({ show: input.show!, ...(input.creator ? { host: input.creator } : {}), payment: paid.transactionHash });
        return { found: paid.transactionHash, checkedTo: to };
      }
      from = to + 1;
    }
    return { checkedTo: from - 1 };
  }

  /** What a tier or show asks to be paid, and where. */
  #payable(input: { tier?: string; creator?: string; show?: string }): { price: OnchainPrice; what: string } {
    if (input.tier) {
      const tier = this.#tierOffer(input.tier, input.creator ? this.resolve(input.creator) : undefined);
      if (!tier.onchain) throw new Error(`${tier.name} isn't paid on chain`);
      return { price: tier.onchain, what: `a month of ${tier.name}` };
    }
    if (input.show) {
      const show = this.#showRef(input.show, input.creator ? this.resolve(input.creator) : undefined);
      return { price: show.price, what: `a ticket to ${show.name}` };
    }
    throw new Error('pay for what? a tier or a show');
  }

  // ---------------------------------------------------------------- ticketed events

  async createShow(input: { name: string; project?: string; room?: string; starts: string; ends: string; price: number; capacity?: number; hosts?: string[]; split?: Array<{ to: string; share: number }> }): Promise<ShowInfo> {
    const id = b64u.encode(randomBytes(16));
    const project = input.project ? this.#project(input.project) : undefined;
    const hosts = [...new Set([this.identity.author, ...(input.hosts ?? []).map((who) => this.resolve(who))])];
    const wallets = this.#wallets();
    const without = hosts.filter((did) => !wallets.get(did)?.verified);
    if (without.length) throw new Error(`every host needs a linked wallet: the show's Safe is theirs (missing: ${without.map((did) => this.nameOf(did) ?? did).join(', ')})`);
    const owners = hosts.map((did) => wallets.get(did)!.address);
    const safe = safeAddress(owners, treasuryThreshold(owners.length), showSaltNonce(id));
    if (!Number.isSafeInteger(input.price) || input.price < 1) throw new Error("a ticket's price is a whole number of the token's smallest unit (1 USDC = 1000000)");
    // Without a split, everything goes to the project's treasury, or else to the host.
    const split = (input.split?.length ? input.split : [{ to: project ? 'project' : this.identity.author, share: 10000 }]).map((part) => ({ to: this.#showRecipient(part.to, project), share: part.share }));
    if (!parseShowSplit(split)) throw new Error('a split names people or addresses with whole basis points adding up to 10000');
    const body: Record<string, Json> = {
      show: id,
      name: input.name.trim().slice(0, 80),
      starts: new Date(input.starts).toISOString(),
      ends: new Date(input.ends).toISOString(),
      price: { chain: TEST_USDC.chain, token: TEST_USDC.token, symbol: TEST_USDC.symbol, decimals: TEST_USDC.decimals, to: safe, amount: input.price },
      hosts,
      // The wallets the Safe is made for: its owners from now on, whatever wallets the hosts link later.
      owners,
      threshold: treasuryThreshold(owners.length),
      split,
    };
    if (!body.name || Number.isNaN(Date.parse(input.starts)) || Number.isNaN(Date.parse(input.ends)) || input.ends <= input.starts) throw new Error('a show has a name, and a start before its end');
    if (project) body.project = project.id;
    if (input.room) body.room = input.room.slice(0, 100);
    if (input.capacity) body.capacity = input.capacity;
    this.replica.write(this.identity, { kind: KIND_SHOW, body });
    return this.#showInfo(this.#showRef(id));
  }

  async cancelShow(ref: string): Promise<ShowInfo> {
    const show = this.#showRef(ref);
    if (show.host !== this.identity.author) throw new Error(`only ${this.nameOf(show.host) ?? 'its host'} can call ${show.name} off`);
    const { id, host: _host, time: _time, cancelled: _cancelled, ...rest } = show;
    this.replica.write(this.identity, { kind: KIND_SHOW, body: { show: id, ...rest, cancelled: true } as unknown as Json });
    return this.#showInfo(this.#showRef(id));
  }

  async shows(project?: string): Promise<ShowInfo[]> {
    const id = project ? this.#project(project).id : undefined;
    return this.#allShows()
      .filter((s) => !id || s.project === id)
      .map((s) => this.#showInfo(s));
  }

  async buyTicket(input: { show: string; host?: string; payment: string }): Promise<void> {
    const show = this.#showRef(input.show, input.host ? this.resolve(input.host) : undefined);
    if (show.cancelled) throw new Error(`${show.name} is called off`);
    if (Date.parse(show.ends) < this.clock()) throw new Error(`${show.name} is over`);
    const payment = input.payment.trim().toLowerCase();
    if (!isTxHash(payment)) throw new Error("a payment is the transaction's hash: 0x and 64 hex digits");
    if (!this.#wallets().get(this.identity.author)?.verified) throw new Error('link the wallet you paid from first (weave wallet link): that is how the host knows the payment is yours');
    await this.join(show.host);
    this.replica.write(this.identity, ticketRequest(this.#encryptionKeyOf(show.host), { show: show.id, payment, entry: this.#entryPoint() }));
  }

  async tickets(ref: string): Promise<TicketInfo[]> {
    const show = this.#showRef(ref);
    const person = (did: Did) => ({ did, name: this.nameOf(did) });
    if (show.host === this.identity.author) {
      const out: TicketInfo[] = this.#ticketRecords(show.id).map((r) => ({ holder: person(r.holder), tx: r.tx, from: r.from, value: r.value, ok: true }));
      for (const [request, answer] of this.#ticketChecks) {
        if (answer === 'checking' || answer.show !== show.id || answer.ok) continue;
        out.push({ holder: person(answer.holder), tx: answer.tx, ok: false, ...(answer.reason ? { reason: answer.reason } : {}), request });
      }
      return out;
    }
    return this.#myTickets()
      .filter((t) => t.show === show.id)
      .map((t) => ({ holder: person(this.identity.author), tx: t.tx, ok: true }));
  }

  async settleShow(input: { show: string; action: 'payout' | 'refund' }): Promise<ShowSettlement> {
    const show = this.#showRef(input.show);
    if (!show.hosts.includes(this.identity.author)) throw new Error(`only the hosts of ${show.name} can settle it`);
    const info = this.#showInfo(show);
    const balance = BigInt(await this.callChain(show.price.chain, { to: show.price.token, data: erc20BalanceOf(info.safe.address) }));
    let calls: Array<{ to: string; data: string }>;
    if (input.action === 'refund') {
      if (show.host !== this.identity.author) throw new Error(`${this.nameOf(show.host) ?? 'its host'} keeps who paid: ask them for the refund`);
      calls = this.#ticketRecords(show.id).map((r) => ({ to: show.price.token, data: erc20Transfer(r.from, BigInt(r.value)) }));
    } else {
      if (show.cancelled) throw new Error(`${show.name} is called off: pay everyone back instead (refund)`);
      if (Date.parse(show.ends) > this.clock()) throw new Error(`${show.name} isn't over yet: pay out after it (${show.ends})`);
      const missing = info.split.filter((p) => !p.address);
      if (missing.length) throw new Error(`no address yet for ${missing.map((p) => p.name ?? p.to).join(', ')}: they need a linked wallet or treasury`);
      calls = payouts(balance, info.split.map((p) => ({ address: p.address!, share: p.share }))).map((p) => ({ to: show.price.token, data: erc20Transfer(p.address, p.amount) }));
    }
    if (!calls.length) throw new Error(input.action === 'refund' ? `nobody has a ticket to ${show.name}: there is nothing to pay back` : `the Safe of ${show.name} holds nothing yet`);
    const total = calls.reduce((sum, c) => sum + BigInt('0x' + c.data.slice(74)), 0n);
    if (total > balance) throw new Error(`the Safe holds ${formatUnits(balance, show.price.decimals)} ${show.price.symbol}, the ${input.action} needs ${formatUnits(total, show.price.decimals)}`);
    const name = `${show.name}: ${input.action === 'refund' ? 'pay everyone back' : 'pay out by the split'}`;
    const multiSend = { to: MULTI_SEND_CALL_ONLY, data: multiSendData(calls), operation: 1 as const };
    const proposal = await this.proposeSafeTx({ safe: info.safe.address, tx: multiSend, title: name });
    return {
      proposal,
      safe: info.safe.address,
      balance: balance.toString(),
      total: total.toString(),
      calls,
      multiSend,
      batch: safeBatch({ chain: show.price.chain, safe: info.safe.address, name, description: `${calls.length} transfer${calls.length === 1 ? '' : 's'} of ${show.price.symbol}, prepared by Weave`, calls }),
    };
  }

  /** Who a split part names: 'project' (its treasury), a person, or an address as it is. */
  #showRecipient(to: string, project?: StoredSpace): string {
    if (to === 'project') {
      if (!project) throw new Error("'project' in a split needs the show to belong to a project");
      return `project:${project.id}`;
    }
    return isAddress(to) ? to : this.resolve(to);
  }

  /** Let in everyone who paid for a ticket to one of our shows: read once on chain, from their own wallet, each transaction once. */
  async #grantTickets(): Promise<number> {
    const mine = new Map(this.#allShows().filter((s) => s.host === this.identity.author).map((s) => [s.id, s]));
    if (!mine.size) return 0;
    const used = new Set(this.#selfBodies(KIND_TICKET_RECORD).map((b) => b.tx));
    let granted = 0;
    for (const event of this.replica.events((e) => e.kind === KIND_TICKET_REQUEST && e.author !== this.identity.author)) {
      if (this.#ticketChecks.has(event.id)) continue;
      const request = this.#tryOpen((me) => openTicketRequest(event, me));
      const show = request && mine.get(request.show);
      if (!request || !show) continue;
      const answer = (ok: boolean, reason?: string) => this.#ticketChecks.set(event.id, { show: show.id, holder: event.author, tx: request.payment, ok, ...(reason ? { reason } : {}) });
      if (used.has(request.payment)) {
        const first = this.#ticketRecords(show.id).find((r) => r.tx === request.payment);
        if (first?.holder !== event.author) answer(false, `that transaction already got ${this.nameOf(first?.holder as Did) ?? 'someone'} in`);
        else answer(true);
        continue;
      }
      if (show.cancelled) {
        answer(false, `${show.name} is called off`);
        continue;
      }
      if (show.capacity && this.#ticketRecords(show.id).length >= show.capacity) {
        answer(false, `all ${show.capacity} tickets are gone`);
        continue;
      }
      this.#ticketChecks.set(event.id, 'checking');
      let check: PaymentCheck;
      try {
        check = await this.checkPayment(show.price, request.payment);
      } catch {
        this.#ticketChecks.delete(event.id); // offline: try again next round
        continue;
      }
      if (!check.ok && /pending/.test(check.reason ?? '')) {
        this.#ticketChecks.delete(event.id);
        continue;
      }
      if (check.ok && this.#walletHistory().get(check.from?.toLowerCase() ?? '') !== event.author) check = { ok: false, reason: `paid from ${check.from}, which isn't ${this.nameOf(event.author) ?? 'their'}'s linked wallet` };
      if (!check.ok) {
        answer(false, check.reason);
        continue;
      }
      // One ticket per price paid; what's paid on top stays in the Safe and is paid back on a refund.
      this.replica.write(this.identity, this.#sealForSelf({ kind: KIND_TICKET_RECORD, body: { show: show.id, holder: event.author, tx: request.payment, from: check.from!, value: check.value! } }));
      this.replica.write(this.identity, ticketFor(this.#encryptionKeyOf(event.author), { show: show.id, tx: request.payment }));
      used.add(request.payment);
      answer(true);
      granted++;
    }
    return granted;
  }

  /** The tickets sold for one of our shows, as we recorded them. */
  #ticketRecords(show: string): Array<{ holder: Did; tx: string; from: string; value: string }> {
    return this.#selfBodies(KIND_TICKET_RECORD)
      .filter((b) => b.show === show && isDid(b.holder) && typeof b.tx === 'string' && typeof b.from === 'string' && typeof b.value === 'string')
      .map((b) => ({ holder: b.holder as Did, tx: b.tx as string, from: b.from as string, value: b.value as string }));
  }

  /** Tickets we hold, from what hosts boxed to us. */
  #myTickets(): Array<{ show: string; tx: string; host: Did }> {
    const out: Array<{ show: string; tx: string; host: Did }> = [];
    for (const event of this.replica.events((e) => e.kind === KIND_TICKET && e.author !== this.identity.author)) {
      const ticket = this.#tryOpen((me) => openTicket(event, me));
      if (ticket) out.push({ ...ticket, host: event.author });
    }
    return out;
  }

  /** A project's or community's treasury address from its maintainers' linked wallets, as treasury() computes it. */
  #treasuryAddressOf(space: StoredSpace): string | undefined {
    const wallets = this.#wallets();
    const owners = [...this.#state(space).maintainers].map((did) => wallets.get(did)).filter((w) => w?.verified).map((w) => w!.address);
    return owners.length ? safeAddress(owners, treasuryThreshold(owners.length), treasurySaltNonce(space.id)) : undefined;
  }

  #allShows(): Show[] {
    return showsOf(this.replica.events((e) => e.kind === KIND_SHOW));
  }

  /** A show by id, or by name (ours first). */
  /** A show by id or name, of `host` if given. Anyone can publish a show under another's id: then ours (as a host) is meant, or the host has to be named. */
  #showRef(ref: string, host?: Did): Show {
    const all = this.#allShows().filter((s) => !host || s.host === host);
    let match = all.filter((s) => s.id === ref);
    if (!match.length) match = all.filter((s) => s.name.toLowerCase() === ref.toLowerCase());
    if (match.length > 1) {
      const ours = match.filter((s) => s.hosts.includes(this.identity.author));
      if (ours.length === 1) return ours[0];
    }
    if (match.length === 1) return match[0];
    throw new Error(match.length ? `several shows "${ref}": name its host` : `no show "${ref}" is known`);
  }

  #showInfo(show: Show): ShowInfo {
    const wallets = this.#wallets();
    const person = (did: Did) => ({ did, name: this.nameOf(did) });
    const owners = show.owners ?? show.hosts.map((did) => wallets.get(did)).filter((w) => w?.verified).map((w) => w!.address);
    const threshold = show.threshold ?? treasuryThreshold(owners.length || 1);
    const treasuries = this.#treasuries();
    const split = show.split.map((part) => {
      if (part.to.startsWith('project:')) {
        const id = part.to.slice('project:'.length);
        const space = this.#spaces.get(id);
        const announced = treasuries.get(id);
        const address = space ? this.#treasuryAddressOf(space) : announced?.consistent ? announced.address : undefined;
        return { to: part.to, name: space?.name ?? 'the project', share: part.share, ...(address ? { address } : {}) };
      }
      if (isDid(part.to)) {
        const wallet = wallets.get(part.to);
        return { to: part.to, name: this.nameOf(part.to), share: part.share, ...(wallet?.verified ? { address: wallet.address } : {}) };
      }
      return { to: part.to, share: part.share, address: part.to };
    });
    const mine = show.host === this.identity.author;
    const ticket = this.#myTickets().find((t) => t.show === show.id && t.host === show.host);
    return {
      id: show.id,
      name: show.name,
      host: person(show.host),
      ...(show.project ? { project: { id: show.project, name: this.#spaces.get(show.project)?.name } } : {}),
      ...(show.room ? { room: show.room } : {}),
      starts: show.starts,
      ends: show.ends,
      price: show.price,
      ...(show.capacity ? { capacity: show.capacity } : {}),
      ...(mine ? { sold: this.#ticketRecords(show.id).length } : {}),
      hosts: show.hosts.map(person),
      split,
      safe: { address: show.price.to, threshold, ...(owners.length === show.hosts.length ? { deploy: safeDeployment(owners, threshold, showSaltNonce(show.id)) } : {}) },
      cancelled: show.cancelled,
      open: showOpen(show, new Date(this.clock())),
      mine,
      ...(ticket ? { ticket: { tx: ticket.tx } } : {}),
    };
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
      const badge = this.#allBadges().badges.find((b) => b.id === (item.kind === KIND_BADGE ? item.id : body.badge));
      if (!badge || badge.invalid || badge.holder !== me) return undefined;
      const series = this.#allBadges().series.find((s) => s.id === badge.series);
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

  // ---------------------------------------------------------------- retention (stage 6.4)

  /** Is a legal hold standing on this space? */
  #held(state: SpaceState): boolean {
    return !!state.hold && Date.parse(state.hold.until) > this.clock();
  }

  async setHold(input: { space: string; until: string; reason?: string }): Promise<SpaceInfo> {
    const space = this.#space(input.space);
    const state = this.#state(space);
    if (!mayAct(state, this.identity.author, 'own').ok) throw new Error(`only the owner of ${space.name} puts it on hold`);
    if (Number.isNaN(Date.parse(input.until))) throw new Error('until is a date, e.g. 2027-12-31');
    this.replica.write(this.identity, sealFor(this.#managed.cipher(space), { kind: KIND_HOLD, body: { until: new Date(input.until).toISOString(), reason: input.reason ?? '' } }));
    return this.#spaceInfo(space);
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
      // A company's spaces are kept by its own archive, never by friends (stage 13).
      ...[...this.#spaces.values()].filter((s) => (s.kind === 'group' || s.kind === 'project') && this.#state(s).members.size <= KEPT_UP_TO && !this.#managed.managedRaw(s).setting).map((space) => ({ scope: spaceScope(space), space })),
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
      this.#invalidateDecoded();
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

  /** Spaces our latest keep index (and, on an always-on node, node index) lists that this node doesn't have. */
  #recoverSpaces(): void {
    const lists = [this.#selfBodies(KIND_KEEP_INDEX).at(-1), ...(this.#isLinkedNode ? [this.#selfBodies(KIND_NODE_INDEX).at(-1)] : [])] as Array<{ spaces?: unknown } | undefined>;
    for (const index of lists) if (Array.isArray(index?.spaces)) this.#adoptSpaces(index.spaces as StoredSpace[]);
  }

  #adoptSpaces(spaces: StoredSpace[]): void {
    for (const space of spaces) {
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
    if (released) this.#invalidateDecoded();
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
          if (record && record.class === 'content' && !record.missing && isWireItemV2(record.wire)) {
            this.replica.store.dropBody(record.wire.e.body as string);
            dropped++;
          } else if (!this.#forgottenCarried().has(id) && this.#carriedIds(space).has(id)) {
            // Restated in a carry (7I92Kk20): a carry is never dropped, so its item is forgotten here, and the next shred leaves it behind.
            this.#forgetCarried(id);
            dropped++;
          }
        }
      }
    }
    if (dropped) this.#invalidateDecoded();
    return dropped;
  }

  /** Items of carries this node forgot by rule: kept in the carry (it can't be dropped), never shown. */
  #forgottenCarriedSet?: Set<string>;
  #forgottenCarried(): Set<string> {
    this.#forgottenCarriedSet ??= new Set(readSecretJson<string[]>(this.home, joinPath(this.home.dir, 'forgotten-carried.json')) ?? []);
    return this.#forgottenCarriedSet;
  }

  #forgetCarried(id: string): void {
    this.#forgottenCarried().add(id);
    writeSecretJson(this.home, joinPath(this.home.dir, 'forgotten-carried.json'), [...this.#forgottenCarried()]);
  }

  /** The ids carries restate in a space. */
  #carriedIds(space: StoredSpace): Set<string> {
    return new Set(this.#decodedIn(space.id).filter((d) => d.carried).map((d) => d.id));
  }

  async setBoardRule(input: { space: string; board: string; keepDays?: number | null; maxMB?: number | null }): Promise<BoardInfo[]> {
    const space = this.#space(input.space);
    if (space.kind !== 'project' && space.kind !== 'community') throw new Error('rules for forgetting are for the boards of projects and communities');
    const state = this.#state(space);
    if (!mayAct(state, this.identity.author, 'curate').ok) throw new Error(`only the ${space.kind === 'project' ? 'maintainers' : 'moderators'} of ${space.name} set how long posts stay`);
    const board = this.#board(space, this.#spacePosts(space).boards, input.board);
    const valid = (v: number | null | undefined, max: number, what: string) => {
      if (v === undefined || v === null) return null;
      if (!Number.isFinite(v) || v <= 0 || v > max) throw new Error(`${what} is a number above 0, at most ${max}`);
      return v;
    };
    const keepDays = valid(input.keepDays, 36_500, 'days to keep');
    const maxMB = valid(input.maxMB, 1_000_000, 'the size limit in MB');
    const floor = this.#companies.companyRetention(space)?.minDays;
    if (floor && keepDays && keepDays < floor) throw new Error(`${space.name} is a company space: it keeps everything at least ${floor} days`);
    this.replica.write(this.identity, sealFor(this.#managed.cipher(space), { kind: KIND_BOARD_RULE, body: { board: board.name, keepDays, maxMB } }));
    return this.boards(space.id);
  }

  async shred(input: { space: string; before: string; dropOlder?: boolean }): Promise<{ epochs: number[]; carried: number }> {
    const space = this.#space(input.space);
    if (space.kind === 'direct') throw new Error('a direct chat has nobody who manages it: there is nothing to shred');
    const state = this.#state(space);
    if (!mayAct(state, this.identity.author, 'manage').ok) throw new Error(`only those who manage ${space.name} shred its old keys`);
    if (this.#held(state)) throw new Error(`${space.name} is on legal hold until ${state.hold!.until.slice(0, 10)}: nothing is shredded`);
    const before = Date.parse(input.before);
    if (Number.isNaN(before)) throw new Error('before is a date, e.g. 2026-09-01');
    const floor = this.#companies.companyRetention(space)?.minDays;
    if (floor && before > this.clock() - floor * DAY_MS)
      throw new Error(`${space.name} is a company space: it keeps everything at least ${floor} days (shred before ${new Date(this.clock() - floor * DAY_MS).toISOString().slice(0, 10)} at the latest)`);
    // An epoch ends when the next one begins; the current one can't be shredded.
    const starts = this.#epochStarts(space);
    const epochs = Object.keys(space.keys).map(Number).sort((a, b) => a - b);
    const ended = epochs.slice(0, -1).filter((e, i) => (starts.get(epochs[i + 1]) ?? '') !== '' && Date.parse(starts.get(epochs[i + 1])!) <= before);
    if (!ended.length) throw new Error(`no key of ${space.name} ended before ${input.before.slice(0, 10)}${epochs.length < 2 ? ': it has had one key all along' : ''}`);
    // A company space's setting is read with the keys alone (see #managedRaw): restated under the current key, or it would go with the old ones.
    const managed = this.#managed.managedRaw(space).setting;
    if (managed) {
      if (space.founder !== this.identity.author) throw new Error(`only the owner of ${space.name} shreds it: it's under a company's key service`);
      const { by: _by, time: _time, ...setting } = managed;
      this.replica.write(this.identity, sealFor(space, { kind: KIND_MANAGED, body: setting as unknown as Json }));
    }
    const { carried, dropped } = this.#carryForward(space, new Set(ended), input.dropOlder ? new Date(before).toISOString() : undefined);
    this.replica.write(this.identity, sealFor(this.#managed.cipher(space), { kind: KIND_SHRED, body: { epochs: ended, dropped } }));
    return { epochs: ended, carried };
  }

  /**
   * Before old keys go: restate under the current key what the space still
   * keeps from those epochs: its control events and latest state, posts its
   * rules keep (and their chat), read-limited boards' with their own key.
   */
  #carryForward(space: StoredSpace, epochs: Set<number>, dropBefore?: string, skip?: Set<string>): { carried: number; dropped: string[] } {
    const posts = this.#spacePosts(space).posts;
    // A company's maximum (stage 11): chat and posts from before it go too, unless they stay for good (pinned, issues, proposals, releases).
    const forever = new Set(posts.filter((p) => p.lifetime && 'forever' in p.lifetime && p.lifetime.forever !== 'no-rule').map((p) => p.id));
    const gone = new Set(posts.filter((p) => (p.lifetime && isDue(p.lifetime, this.clock())) || (dropBefore && p.active < dropBefore && !forever.has(p.id))).map((p) => p.id));
    const around = this.#aroundPosts(this.#entries(space));
    const goneWith = new Set([...gone].flatMap((id) => (around.get(id)?.ids ?? []).map((x) => x.id)));
    // What goes on purpose, by our rules and clock: named in the shred, so other nodes don't carry it forward after all.
    const dropped: string[] = [];
    const items = this.#decodedIn(space.id).filter((d) => {
      const epoch = (d.event.body as { epoch?: unknown } | null)?.epoch;
      const inEpochs = d.carried || (Number.isSafeInteger(epoch) && epochs.has(epoch as number));
      if (!inEpochs || d.inner.kind === KIND_CARRY || skip?.has(d.id)) return false;
      if ((dropBefore && d.inner.kind === KIND_MSG && d.event.time < dropBefore) || gone.has(d.id) || goneWith.has(d.id)) {
        dropped.push(d.id);
        return false;
      }
      return true;
    });
    if (!items.length) return { carried: 0, dropped };
    const byBoard = new Map<string, Decoded[]>();
    for (const d of items) byBoard.set(d.board ?? '', [...(byBoard.get(d.board ?? '') ?? []), d]);
    for (const [board, list] of byBoard) {
      const inner: Inner = { kind: KIND_CARRY, body: { events: list.map(carriedItem) as unknown as Json } };
      const keys = board ? space.boards?.[board] : undefined;
      const latest = keys ? Math.max(...Object.keys(keys).map(Number)) : -1;
      if (board && latest < 0) continue; // a board we can't read: we hold none of it to carry
      this.replica.write(this.identity, sealFor(this.#managed.cipher(space), board ? sealForBoard(space, board, latest, keys![String(latest)], inner) : inner));
    }
    return { carried: items.length, dropped };
  }

  /** Apply the shreds of those who manage our spaces (each once: a shredded key is gone). */
  #applyShreds(): number {
    let applied = 0;
    for (const space of [...this.#spaces.values()]) {
      const state = this.#state(space);
      for (const d of this.#decodedIn(space.id)) {
        if (d.inner.kind !== KIND_SHRED || d.carried || !mayAct(state, d.event.author, 'manage').ok) continue;
        const epochs = (d.inner.body as { epochs?: unknown } | null)?.epochs;
        if (!Array.isArray(epochs)) continue;
        // A company's minimum keeps recent keys, whoever asks to shred them.
        const floor = this.#companies.companyRetention(space)?.minDays;
        const kept = floor ? this.#companies.endedWithin(space, floor) : undefined;
        const live = epochs.filter((e): e is number => Number.isSafeInteger(e) && !!space.keys[String(e)] && !kept?.has(e));
        const dropped = (d.inner.body as { dropped?: unknown } | null)?.dropped;
        if (live.length) {
          this.#applyShred(space, live, Array.isArray(dropped) ? new Set(dropped.filter((x): x is string => typeof x === 'string')) : undefined);
          applied++;
        }
      }
    }
    return applied;
  }

  /** A shred from someone who manages the space: keep what we wrote, then let those keys go, with the bodies sealed with them. */
  #applyShred(space: StoredSpace, epochs: number[], dropped?: Set<string>): void {
    if (this.#held(this.#state(space))) return; // on legal hold: keys stay
    const doomed = new Set(epochs.filter((e) => space.keys[String(e)] && e !== currentEpoch(space)));
    if (!doomed.size) return;
    // Our own work stays with us: restated in our private space first. Not in a company space: there, the company's retention decides (stage 11).
    const company = !!this.#managed.managedRaw(space).setting?.company;
    const mine = company ? [] : this.#decodedIn(space.id).filter((d) => d.event.author === this.identity.author && !d.carried && doomed.has(Number((d.event.body as { epoch?: unknown } | null)?.epoch)));
    if (mine.length) this.replica.write(this.identity, this.#sealForSelf({ kind: KIND_CARRY, body: { space: space.id, events: mine.map(carriedItem) as unknown as Json } }));
    // The shredder's carry restates only what its node held (zLqeyEBC): what we hold of those epochs that no carry under a
    // key that stays restates, and that the shred didn't drop on purpose, we carry forward ourselves before letting go.
    // Anyone may: each item is checked by its author's signature. (A shred from before it named what it dropped: as it says.)
    if (dropped && this.#state(space).members.has(this.identity.author)) {
      const restated = new Set(
        this.#decodedIn(space.id)
          .filter((d) => d.inner.kind === KIND_CARRY && !d.carried && !doomed.has(Number((d.event.body as { epoch?: unknown } | null)?.epoch)))
          .flatMap((d) => this.#expandCarry(d, space).map((x) => x.id)),
      );
      this.#carryForward(space, doomed, undefined, new Set([...restated, ...dropped]));
    }
    const scope = spaceScope(space);
    // Bodies are stored once per hash for every space: drop only this space's own. One counts as ours if it opens with this
    // space's key of that epoch (a copy of another space's body under our scope doesn't), and no event elsewhere points to it.
    const cipher = this.#managed.cipher(space);
    const elsewhere = new Set(this.replica.events((r) => r.scope !== scope && isWireItemV2(r.wire)).map((r) => (r.wire as WireItemV2).e.body as string));
    for (const r of this.replica.events((r) => r.scope === scope && r.class === 'content' && !r.missing)) {
      if (!doomed.has(Number((r.body as { epoch?: unknown } | null)?.epoch)) || !isWireItemV2(r.wire)) continue;
      const hash = r.wire.e.body as string;
      if (elsewhere.has(hash) || !openIn(cipher, r)) continue;
      this.replica.store.dropBody(hash);
    }
    for (const e of doomed) delete space.keys[String(e)];
    space.shredded = [...new Set([...(space.shredded ?? []), ...doomed])];
    this.#saveSpace(space);
  }

  async keepPost(target: string): Promise<PostInfo> {
    const post = await this.post(target);
    const space = post.space && this.#spaces.get(post.space.id);
    if (!space) throw new Error('only posts of projects and communities are forgotten');
    if (post.by.did !== this.identity.author && !mayAct(this.#state(space), this.identity.author, 'curate').ok) throw new Error('its author keeps a post, or those who manage the space');
    this.replica.write(this.identity, sealFor(this.#managed.cipher(space), { kind: KIND_POST_KEEP, body: { target: post.id } }));
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
