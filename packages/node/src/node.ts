import {
  accessOf,
  canManage as mayManageSpace,
  b64u,
  BLOB_TYPES,
  boardKeyFor,
  boardOfEvents,
  boardOfInner,
  decodeKnock,
  encodeKnock,
  inviteRightsOf,
  isKnockLink,
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
  KIND_CARRY,
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
  KIND_VISITORS,
  parseVisitorRule,
  visitorCounts,
  type VisitorRule,
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
  rekeyCounts,
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
  KIND_ARTIFACT,
  KIND_ACCOUNT,
  accountClaimsOf,
  type AccountClaim,
  accountProofText,
  isPlatform,
  KIND_SERVICE_REQUEST,
  artifactsOf,
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
  postRefsIn,
  dayKey,
  dueOccurrence,
  KIND_ROUTINE,
  nextRun,
  parseCreate,
  parseTrigger,
  renderTitle,
  routinesOf,
  type Routine,
  KIND_SESSION,
  MAX_ABOUT,
  MAX_DESCRIPTION,
  nameProblem,
  pushOnto,
  sameName,
  sessionTitle,
  reorder,
  sessionKey,
  SESSION_ROLES,
  type SessionRole,
  sessionsOf,
  takeOff,
  type SessionRecord,
  type StackItem,
  postTargetOf,
  postUrl,
  personKeyOf,
  personTargetOf,
  personUrl,
  shortPrefixes,
  type PostTarget,
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
  KIND_MARKS_PIN,
  KIND_OFFICIAL,
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
  checkServiceLabel,
  IMAGE_REF,
  SERVICE_LABEL,
  type RoomPages,
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
  type AppSetting,
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
  SERVICE_PREFIX,
  type ServiceContract,
  type Builtin,
  type Pack,
  artifactKindOf,
} from '@weave/core';
import { shippedPacks, SHIPPED_DIR } from './shipped.ts';
import { SwarmNode, type HeldSpace, type KeepAccess, type SpaceAccess } from '@weave/net';
import {
  HOME_SOURCES,
  PROJECT_STATUSES,
  type Actor,
  type Admission,
  type AgentInfo,
  type UpdateInfo,
  type Backend,
  type BoardInfo,
  type BoardViewInfo,
  type ChatInfo,
  type CoauthorRequest,
  type GumroadInfo,
  type HarnessInfo,
  type PermissionRequest,
  type AppOpen,
  type ClaudeCodeFollow,
  type MentionInfo,
  type SessionInfo,
  type SessionRef,
  type WorkTarget,
  type DeskInfo,
  type RoutineInfo,
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
  type Found,
  type FoundKind,
  type ProfileInput,
  type ProjectInfo,
  type ProjectPage,
  type ProjectStatus,
  type ProposalInfo,
  type PublicProject,
  type PublishInput,
  type ReactionInfo,
  type ReplyInfo,
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
  type ServiceSettingsInfo,
  type ShippedServiceInfo,
  type ArtifactInfo,
  type AccountInfo,
  type MyAccountInfo,
  type FetcherInfo,
  type ServiceInfo,
  type WebsiteInfo,
  type KeyvaultInfo,
  type ArtifactLine,
  type AppReleases,
  noAgent,
} from './backend.ts';
import { loadConfig, saveConfig, type Config } from './config.ts';
import { AppLogFollower, recentSessions, TranscriptFollower, transcriptActive, transcriptTitle, type SessionText } from './claudecode.ts';
import { FileStore } from './filestore.ts';
import { openStore, type SqliteStore } from './sqlitestore.ts';
import { readJson, resolveHome, writeJson, type Home } from './home.ts';
import { keystoresHere, moveHomeKey, readSecretJson, vaultOf, writeSecretJson, type Keystore } from './vault.ts';
import { envCredentials, providerFor, type KeyProvider, type ProviderSpec, type VaultCredentials } from './keyproviders.ts';
import { entryState, harnessesIn, writeEntry, type McpLaunch } from './harnesses.ts';
import { guessPlatform } from './appinstall.ts';
import { publicReleases, type Fetch } from './github.ts';
import { createHash, createPublicKey, createVerify, hkdfSync, randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join as joinPath, resolve as resolvePath } from 'node:path';
import { homedir, hostname } from 'node:os';
import { LiveRooms } from './live.ts';
import { createAndSaveAgent, loadAgents, saveAgent, loadEncryptionKeys, loadIdentity, saveDevice, saveEncryptionKeys, type AgentKey, type EncryptionKey } from './keystore.ts';
import { acquireLock } from './lock.ts';
import { emptyDirectory, findPerson, groupsOf, hashToken, newScimToken, scimHandle, startScimServer, tokenMatches, type ScimDirectory, type ScimRequest, type ScimResponse } from './scim.ts';
import { checkAuthority, deviceProof, inspectDevice } from './devices.ts';
import { machinePolicy } from './machine.ts';
import { browserSignIn, claimsOf, delegatedToken, openInBrowser, refreshSignIn, signInNonce, type SignInTokens } from './signin.ts';
import { startConsole } from './console.ts';
import { decodeNodeAnswer, decodeNodeRequest, encodeNodeAnswer, encodeNodeRequest } from './company.ts';
import { imageDigest, imageLabels, imageLocation } from './registry.ts';
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
import { releaseApproval, Runtime } from './runtime.ts';
import { Releases, type ArtifactRef as StoredArtifact } from './artifacts.ts';
import { Fetchers, type FetcherInfo as StoredFetcherInfo } from './fetchers.ts';
import { Keyvaults, type KeyvaultState } from './keyvaults.ts';
import { ClientApps } from './clientapps.ts';
import { Verifiers, type PlatformInfo } from './verifiers.ts';
import { startDeviceSignIn, type DeviceOAuth } from './devicecode.ts';
import type { Grant as ServiceGrant } from './servicesettings.ts';
import type { Registered as ServiceRegistered } from './register.ts';
import { NODE_PREFIX, Services } from './services.ts';
import { Website } from './website.ts';
import { Lenses } from './lenses.ts';
import { Marks } from './marks.ts';
import { Hints, type HeldNotice } from './hints.ts';
import { RemoteAccess } from './remote.ts';
import { checkOnchainPayment, ethCall, rpc, type PaymentChecker } from './onchain.ts';
import { checkGumroadLicense, createGumroadMembership, GUMROAD_CLIENT_ID, gumroadAccount, startGumroadSignIn, type GumroadSignIn, type LicenseCheck, type LicenseChecker } from './gumroad.ts';
import { loadSpaces, removeSpace, saveSpace, type StoredSpace } from './spacestore.ts';
import { KIND_THEME, sanitizeTheme, type Theme } from './theme.ts';

/** What a company account may always sign, whatever its company's policy: itself, its keys, its name, leaving, links (they have their own switch), blocking and muting. */
const ALWAYS_ALLOWED = new Set<string>([KIND_IDENTITY, KIND_ROTATE, 'weave.delegate', 'weave.revoke', KIND_ORG_FREEZE, 'weave.profile', KIND_THEME, KIND_LINK, KIND_LEAVE, KIND_BLOCK, KIND_MUTE, KIND_REKEY]);
/** A company sign-in kept on this computer (sso.json, sealed): the ID token, and where and how to renew it. */
interface Sso {
  idToken: string;
  /** The salt the ID token's nonce was made with for this identity (signInNonce). */
  salt?: string;
  expires?: number;
  refreshToken?: string;
  issuer?: string;
  clientId?: string;
}

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


/** An event as this node can read it, before names are resolved. */
/** A service handed to an always-on node (the body of a handover, sealed to yourself). */
export interface Handover {
  id: string;
  service: string;
  /** The always-on node's key it's for. */
  node: Did;
  /** The service's own key. */
  did: Did;
  contract: ServiceContract;
  description?: string;
  icon?: string;
  spaces: string[];
  command?: string[];
  enabled?: boolean;
  settingNames?: string[];
  /** For the node only: the service's key (when new) and changed settings (null removes one). */
  box?: Json;
  removed?: true;
  /** The room service: its rooms (opened on a computer, run by the node), and what you approved them to run. */
  builtin?: Builtin;
  hosted?: Record<string, StoredRoom>;
  approved?: string[];
  /** An applet: the release it runs (the node fetches it itself). */
  artifact?: StoredArtifact;
}

/** A service as this node keeps it: sealed in services.json, with its settings and the token of its API. */
export interface StoredService {
  name: string;
  /** Launched as a website (launchWebsite): it's there for its website, and goes when that's closed. */
  launched?: true;
  /**
   * The website service that launched it: then it's no service of its own (no key, no profile, not listed), only what
   * runs that website, and that website service signs for it. Before 0.22 a launched website had a key of its own.
   */
  launchedBy?: string;
  description: string;
  icon?: string;
  contract: ServiceContract;
  /** Space ids it was added to. */
  spaces: string[];
  command?: string[];
  /** Its own code as a WebAssembly component: the .wasm file Weave runs itself. */
  wasm?: string;
  /** Its website's files (a WebAssembly service with a website): the folder Weave serves. */
  site?: string;
  /** When it came to this node: what it reads counts from then (a WebAssembly service starts there). */
  since?: string;
  settings: Record<string, string>;
  token: string;
  enabled: boolean;
  /** Settings given per space: space id → name → value (it reads them from its API). */
  spaceSettings?: Record<string, Record<string, string>>;
  /** A service Weave ships, run by the node itself: the room service. */
  builtin?: Builtin;
  /** The room service's rooms: room id → room, kept across restarts. */
  hosted?: Record<string, StoredRoom>;
  /** The settings your own code asks for (a release's come from its manifest): its profile lists them for its spaces' maintainers. */
  asks?: AppSetting[];
  /** Its sign-ins as you (settings it asks for as yours), by name: for every project it's in. */
  grants?: Record<string, ServiceGrant>;
  /** Its apps registered as you (a GitHub App), by name: what it reads of each, and the key Weave signs with. */
  registered?: Record<string, ServiceRegistered>;
  /** One Weave ships (shipped.ts): its name, and the digest it ran last. */
  shipped?: { name: string; digest: string };
  /** What you approved it (or its rooms) to run: fingerprints of a release, or of a command in a folder. */
  approved?: string[];
  /** An applet: the release it runs, pinned (its manifest as released). */
  artifact?: StoredArtifact;
}

/** A website the website service serves: in one of its projects, a port on this device. */
export interface StoredRoom {
  id: string;
  project: string;
  name: string;
  /** What its visitors reach: a port on this device. */
  port: number;
  /** The service on this device that serves it (its process listens on the port), or none: something you run yourself. */
  servedBy?: string;
  /** Its own token, for something you run yourself: its way into the app API (this website only), and the key of X-Weave-Person. */
  token: string;
  /** Who may visit, when not every participant: these people, a show's ticket holders, members of tiers. */
  access?: { invite?: Did[]; show?: string; groups?: string[] };
  /** Which page each side opens (a service's from its manifest). */
  pages?: RoomPages;
  /** Something its host should know: what changed when Weave stopped starting what answers it (0.21). */
  note?: string;
  /** The release it runs, when its service runs one: announced with it. */
  release?: { project: string; id: string; tag: string };
}

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
export async function verifyIdToken(token: string, issuer: string, audience: string): Promise<{ sub: string; email?: string; groups: string[]; nonce?: string }> {
  const [h, b, sig] = token.split('.');
  if (!h || !b || !sig) throw new Error('not a token');
  const header = JSON.parse(Buffer.from(h, 'base64url').toString()) as { alg?: string; kid?: string };
  if (header.alg !== 'RS256') throw new Error(`unsupported token algorithm ${header.alg}`);
  const discovery = (await (await fetch(`${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`)).json()) as { jwks_uri: string };
  const { keys } = (await (await fetch(discovery.jwks_uri)).json()) as { keys: Array<Record<string, unknown> & { kid?: string }> };
  const jwk = keys.find((k) => !header.kid || k.kid === header.kid);
  if (!jwk) throw new Error('unknown signing key');
  if (!createVerify('RSA-SHA256').update(`${h}.${b}`).verify(createPublicKey({ key: jwk as never, format: 'jwk' }), Buffer.from(sig, 'base64url'))) throw new Error('bad signature');
  const claims = JSON.parse(Buffer.from(b, 'base64url').toString()) as { iss?: string; aud?: string | string[]; exp?: number; sub?: string; email?: string; groups?: unknown; nonce?: unknown };
  if (claims.iss !== issuer) throw new Error('wrong issuer');
  if (!(Array.isArray(claims.aud) ? claims.aud : [claims.aud]).includes(audience)) throw new Error('wrong audience');
  if (!claims.exp || claims.exp * 1000 < Date.now()) throw new Error('expired');
  if (!claims.sub) throw new Error('no subject');
  return { sub: claims.sub, ...(claims.email ? { email: claims.email } : {}), groups: Array.isArray(claims.groups) ? claims.groups.filter((g): g is string => typeof g === 'string') : [], ...(typeof claims.nonce === 'string' ? { nonce: claims.nonce } : {}) };
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

/** A space's managed setting and its wrapped company halves, by epoch and by who published them. */
interface ManagedRaw {
  setting?: ManagedSetting;
  parts: Map<number, Map<Did, string>>;
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
const CARRIED_STATE = new Set(['weave.project.page', 'weave.app', 'weave.catalog.entry', 'weave.channel', 'weave.curate', 'weave.theme']);

const EDGE_KIND: Record<EdgeInput['edge'], string> = { follow: KIND_FOLLOW, block: KIND_BLOCK, mute: KIND_MUTE };
const DEFAULT_PAGE: ProjectPage = { title: '', subtitle: '', body: '', description: '', status: 'active', public: false };

/**
 * One person's node: their keys, their replica of the logs they know, the
 * groups and projects they belong to, and optionally a live connection to
 * peers. The CLI uses it directly when no daemon runs; the daemon wraps it
 * with networking and the HTTP API.
 */
/** The routines a new desk starts with. */
const DESK_ROUTINES: Array<{ id: string; name: string; trigger: RoutineInfo['trigger']; create: RoutineInfo['create'] }> = [
  {
    id: 'journal',
    name: 'Journal entry',
    trigger: { type: 'schedule', days: [1, 2, 3, 4, 5], time: '08:00' },
    create: {
      board: 'journal',
      title: '{date}',
      text: '## Plan\n\n- \n\n## Notes\n\n## Done\n',
      prompt:
        "This is today's journal entry, and our planning for the day. Start by reading yesterday's entry, my open work items and what's hot in my projects, then propose a plan for today and keep it in this entry's text (weave_edit_post). Listen and ask while I journal; when something deserves work, create a work item in the project it belongs to, with a clear starting prompt, and tell me where you put it.",
    },
  },
  {
    id: 'setup',
    name: 'Set up your desk',
    trigger: { type: 'first-start' },
    create: {
      board: 'ideas',
      title: 'Set up your desk',
      text: 'Your desk is new: a Journal (one entry per weekday, from the Journal entry routine) and Ideas. Ctrl+click this item to set it up with your daily driver.',
      prompt:
        "Help me set up my Weave desk; this session is my daily driver from now on. If you can, name this session \"Daily driver\" and put it in a sidebar group \"Desk\" in the Claude app. Then look at who I am and my projects (weave_whoami), ask how I like to plan my days, suggest routines that would help (a time for the journal entry, a standup, a backlog check), and write what you learn about how I work into this folder's CLAUDE.md.",
    },
  },
];

/** The CLAUDE.md a new desk folder starts with: who the daily driver works for and how. */
function deskInstructions(person: string, desk: string): string {
  return `# Weave desk

This folder is where my daily driver works: the Claude Code sessions where we
plan, journal and hand out work, with Weave. (Weave wrote this file once; it's
mine now, change it as you learn how I work.)

## Who and where

- I'm ${person}. In Weave you act as my agent; your tools are the weave_* ones.
- My desk is the private project "${desk}": Journal (one entry per weekday) and
  Ideas. My other projects are where the real work lives.

## How we work

- A work item is a Weave post with a starting prompt (what to do with it).
  Your session has a stack of work items (weave_session): the top one is what
  we're on. Items I start from Weave arrive as "Weave work item: …" messages.
- Today's journal entry is our planning: keep the plan in its text, and turn
  what deserves it into work items in the right project, each with a clear
  starting prompt. Say where you put them, as links.
- I keep a pool of worker sessions (weave_workers: what each takes, is on and
  finished last). While planning, hand items to them with weave_assign, only
  to workers that take the item's project, and tell me whom you gave what.
- When something interrupts, put it on top of the stack (weave_work_on); when
  it's done, weave_done, and tell me what we're back to.
- Folders and projects aren't one to one. To start work elsewhere, use a
  folder Weave knows for that project; if none fits, ask me, or ask to create
  one. Never guess a folder you haven't seen used for that project.
- When you mention a post, link it with its url.
`;
}
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
    mayJoin: (room, person) => this.#website.mayJoin(room, person),
    servicePort: (room) => this.#website.roomService(room)?.port,
    personHeader: (room, person) => this.#website.personHeader(room, person),
    seed: (roomId) => this.#website.roomSeed(roomId),
    nameOf: (did) => this.nameOf(did),
    changed: () => this.#emitLive(),
  });
  #liveListeners = new Set<(notice?: Notice) => void>();
  #marksListeners = new Set<() => void>();
  #marksTimer?: ReturnType<typeof setTimeout>;
  #hintsListeners = new Set<() => void>();
  #hintsTimer?: ReturnType<typeof setTimeout>;

  /** Tell watchers what the hint services say may have changed (debounced, as marks are). */
  #hintsChanged(): void {
    if (this.#hintsTimer) return;
    this.#hintsTimer = setTimeout(() => {
      this.#hintsTimer = undefined;
      for (const listener of this.#hintsListeners) listener();
    }, 150);
    this.#hintsTimer.unref?.();
  }

  /** Tell watchers what the mark services say may have changed (debounced: a burst of badge events is one). */
  #marksChanged(): void {
    if (this.#marksTimer) return;
    this.#marksTimer = setTimeout(() => {
      this.#marksTimer = undefined;
      for (const listener of this.#marksListeners) listener();
    }, 150);
    this.#marksTimer.unref?.();
  }
  /** Posts agents pointed to, newest first (the Mentions panel), and who's watching for more. */
  #mentions: MentionInfo[] = [];
  readonly #mentionListeners = new Set<(mention: MentionInfo) => void>();
  /** Claude Code sessions followed for links to posts, while that's on (see followClaudeCode). */
  #follower?: TranscriptFollower;
  /** The Claude app's log, for the session you're looking at, while that's on too. */
  #appLog?: AppLogFollower;
  readonly #focusListeners = new Set<(session: SessionInfo | null) => void>();
  /** A session Ctrl+click or the Sessions page is opening: its item, its job (see expectSession). */
  #expected?: { post?: string; folder?: string; role?: SessionRole; projects?: string[]; until: number };
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
  /** Fetch for GitHub's public API (gists that prove accounts, public releases): tests put a stand-in there. */
  githubSetup: { fetch: Fetch } = { fetch: (...args) => fetch(...args) };
  /**
   * Containers (Weave and Docker): the registry API is reached with `fetch`; `docker` is the Docker command line
   * (WEAVE_DOCKER: a path, or a JSON list of a program and its first arguments). Tests use stand-ins.
   */
  containerSetup: { fetch: Fetch; docker: string[] } = {
    fetch: (...args) => fetch(...args),
    docker: process.env.WEAVE_DOCKER?.trim().startsWith('[') ? (JSON.parse(process.env.WEAVE_DOCKER) as string[]) : [process.env.WEAVE_DOCKER || 'docker'],
  };
  /** How services' sign-ins reach their providers' token pages (tests put a stand-in there). */
  oauthSetup: { fetch: Fetch } = { fetch: (...args) => fetch(...args) };
  /** Tests only: hosts WebAssembly services' requests go to over plain HTTP on this computer, by port. */
  wasmSetup: { testHosts: Record<string, number>; shippedDir?: string } = { testHosts: {} };

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
    roomPort: async (roomId) => this.#website.roomPort(roomId),
  });
  /** What runs code on this node: services and the handlers of its websites (see runtime.ts). */
  #runtime = new Runtime(() => this.containerSetup.docker, () => this.wasmSetup.testHosts);
  /** Releases fetched for services and their websites, checked against their fingerprints (see artifacts.ts). */
  #releases = new Releases(() => joinPath(this.home.dir, 'services'), this.#runtime, () => this.#emitLive(), (a, platform) => this.#services.locateArtifact(a, platform), () => this.githubSetup.fetch, () => this.containerSetup.fetch);
  /** My fetchers (fetchers.ts): client apps that fetch what providers grant me. */
  /** Keyvaults and fetchers I added from releases (clientapps.ts): beside the ones Weave ships, run the same. */
  #clientApps = new ClientApps(() => this.home, () => this.#releases);
  #fetchersMade = (this.#releases.fetchers = new Fetchers(() => this.home, this.#runtime, () => this.wasmSetup.shippedDir, () => this.#clientApps.asShipped('fetcher')));
  /** My keyvaults (keyvaults.ts): my access to platforms, of which my services get only what's derived. */
  #keyvaults = new Keyvaults(() => this.home, this.#runtime, () => this.wasmSetup.shippedDir, () => this.#clientApps.asShipped('keyvault'));
  /** The verifiers of accounts elsewhere (verifiers.ts): client apps this node runs to check them. */
  #verifiers = new Verifiers(() => this.home, this.#runtime, () => this.wasmSetup.shippedDir);
  /** Services: code you run under keys of their own (see services.ts). */
  #services: Services = new Services(WeaveNode.servicesHost(this), () => this.#website);
  /** Websites (rooms) of the room service, and the app API that tells them who is visiting (see website.ts). */
  #website: Website = new Website(WeaveNode.websiteHost(this), () => this.#services);
  /** Boards' client services, run here for this member. */
  #lenses: Lenses = new Lenses(WeaveNode.servicesHost(this), () => this.#services);
  /** Mark services: what shows next to names, from issuers you or a space chose (stage 19). */
  #marks: Marks = new Marks(WeaveNode.servicesHost(this));
  #hints: Hints = new Hints(WeaveNode.servicesHost(this), (since) => this.#heldNotices(since));
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
    // A standby server follows the active one and signs nothing: it shares the active one's device key (stage 14).
    if (loadConfig(home).standby) this.#refuseWrites();
    this.blobs = new BlobStore(home.blobs);
    this.config = loadConfig(home);
    this.#agents = loadAgents(home);
    // Secrets read only now and then (tokens, pairings) are sealed right away, not when first needed.
    // Weave's own GitHub sign-in is gone (services have their own access): its token isn't kept.
    rmSync(joinPath(home.dir, 'github.json'), { force: true });
    for (const file of [this.#gumroadFile, joinPath(home.dir, 'remote.json'), joinPath(home.dir, 'services.json')]) readSecretJson(home, file);
    for (const space of loadSpaces(home)) this.#spaces.set(space.id, space);
    this.#loadHalves();
    // A newer server of this identity took over while we were away: stand down (nQ9JHlUV).
    for (const r of this.replica.events((e) => e.kind === KIND_GENERATION && e.author === this.identity.author)) this.#seeGeneration(r);

    // Pick up keys handed to us — new epochs and whole spaces — now and whenever they arrive.
    const isKeys = (e: WeaveRecord) => canonicalKind(e.kind) === KIND_REKEY || e.kind === KIND_GIFT;
    for (const event of this.replica.events(isKeys)) this.#takeKeys(event);
    this.replica.admit = this.#admit;
    this.replica.onAppend((event) => {
      if (event.kind === KIND_GENERATION && event.author === this.identity.author) this.#seeGeneration(event);
      // When it arrived: where a notice period must not depend on the date its author claims (#seenAt).
      if (event.kind === KIND_SEALED || canonicalKind(event.kind) === KIND_REKEY) this.#arrivals.set(event.id, new Date(this.clock()).toISOString());
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
    node.#saveSso({ idToken, ...(salt ? { salt } : {}), expires: (claimsOf(idToken).exp ?? 0) * 1000, ...(tokens.refreshToken ? { refreshToken: tokens.refreshToken } : {}), ...(enrollment.signIn ?? {}) });
    await node.addContact(encodeContact({ v: 1, did: enrollment.company, name: enrollment.name, entry: enrollment.entry }));
    // The company group is under the company's key service: the join is written once it unlocks (see #continueEnrollment).
    const { invite, proof } = await node.#takeInvite(enrollment.invite);
    writeSecretJson(node.home, node.#enrollFile, { group: enrollment.group, invite, ...(proof ? { proof } : {}), words, idToken, ...(salt ? { salt } : {}) } satisfies Enrolling);
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
    for (const { room } of this.#website.allRooms()) if (room.open && this.#website.hostedHere(room)) await this.#live.host(room).catch(() => {});
    await this.#remote.start().catch((error: Error) => console.error(`weave: phones can't connect: ${error.message}`));
  }

  async goOffline(): Promise<void> {

    // Services still running keep asking it (their WEAVE_API); it closes with them (close stops them first).
    if (!this.#runtime.size) {
      const appApi = this.#website.appApi;
      this.#website.appApi = undefined;
      this.#website.appApiPort = undefined;
      await (await appApi?.catch(() => undefined))?.close();
    }
    await this.#remote.close();
    await this.#live.close();
    await this.#swarm?.destroy();
    this.#swarm = undefined;
  }

  /** Go offline and release the home for other processes. */
  async close(): Promise<void> {
    this.#services.stopServiceProcesses();
    this.#follower?.stop();
    this.#appLog?.stop();
    // Company halves of new keys must be published first: without them, nobody else (and no later run) opens what they sealed.
    await Promise.race([Promise.all([...this.#halves.keys()].map((id) => this.#publishHalf(id))), new Promise((r) => setTimeout(r, 15_000).unref())]);
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
    // An always-on node hosts its person's rooms; everyone else would drop anything else it signed (stage 18).
    if (!input.as && this.#isLinkedNode && !permits(NODE_PERMISSIONS, input.kind)) throw new Error(`this is ${this.nameOf(this.identity.author) ?? 'your'} always-on node: it keeps spaces and hosts rooms, and doesn't post or change anything for them (${input.kind})`);
    // Readers would cut anything longer: refuse instead, so nothing is shortened without the author knowing.
    checkTextFields(input.body);
    let inner: Inner = { kind: input.kind, body: input.body ?? null };
    const space = input.space ? this.#space(input.space) : undefined;
    if (space && space.kind !== 'direct' && this.#state(space).closed) throw new Error(`${space.name} is closed: it's kept as it is, read-only`);
    if (space && input.as) this.#visitorMay(space, signer.did, input.as, input.kind);
    if (space?.kind === 'project') inner = this.#forBoard(space, inner);
    const fields: EventFields = space ? sealFor(await this.#cipherReady(space), inner) : inner;
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
      if (item && this.#marks.reads(item.kind)) this.#marksChanged();
      if (item && this.#hints.reads(item.kind)) this.#hintsChanged();
      if (!item || this.#hiddenAuthors().has(item.author)) return;
      queue = queue.then(async () => {
        const notice = await this.#noticeFor(item).catch(() => undefined);
        // A notice counts (Unread folds them): what the hint services say may have changed.
        if (notice) this.#hintsChanged();
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
    // You switched sessions in the Claude app: the panel follows.
    const onFocus = (session: SessionInfo | null) => onItem({ id: `focus-${Date.now()}`, time: new Date().toISOString(), kind: 'weave.focus', scope: 'live', body: session as unknown as Json, author: me, signer: me, seq: 0 });
    this.#focusListeners.add(onFocus);
    // What the mark services say may have changed: views showing marks ask again (and only then).
    const onMarks = () => onItem({ id: `marks-${Date.now()}`, time: new Date().toISOString(), kind: 'weave.marks', scope: 'live', body: null, author: me, signer: me, seq: 0 });
    this.#marksListeners.add(onMarks);
    // And what the hint services say (unread counts): views showing them ask again.
    const onHints = () => onItem({ id: `hints-${Date.now()}`, time: new Date().toISOString(), kind: 'weave.hints', scope: 'live', body: null, author: me, signer: me, seq: 0 });
    this.#hintsListeners.add(onHints);
    await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
    this.#marksListeners.delete(onMarks);
    this.#hintsListeners.delete(onHints);
    this.#liveListeners.delete(onLive);
    this.#openListeners.delete(onOpen);
    this.#mentionListeners.delete(onMention);
    this.#focusListeners.delete(onFocus);
    unsubscribe();
  }

  // ---------------------------------------------------------------- groups and projects

  async spaces(kind?: SpaceKind): Promise<SpaceInfo[]> {
    return [...this.#spaces.values()].filter((s) => !kind || s.kind === kind).map((s) => this.#spaceInfo(s));
  }

  async createGroup(name: string): Promise<SpaceInfo> {
    return this.#spaceInfo(await this.#createSpace('group', name));
  }

  async createProject(input: { name: string; description?: string; as?: string }): Promise<ProjectInfo> {
    // An agent counts as its person: it may start a project for them, which is theirs, never its own.
    if (input.as) this.#agentMay(input.as, KIND_SPACE_CREATE);
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
    // The space reads the link's public key as its id; the link keeps the secret one (inviteKeys).
    const { invite, key } = inviteKeys();
    const expires = new Date(Date.now() + hours * 3600_000).toISOString();
    const body: Record<string, Json> = { invite, expires, key: true };
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
    return encodeInvite({ v: 2, space: this.#keysForNewcomers(space), invite, key, inviter: this.identity.author, expires, entry: this.#entryPoint(), ...(boardKeys ? { boards: boardKeys } : {}) });
  }

  async joinSpace(text: string, note?: string): Promise<SpaceInfo> {
    if (isKnockLink(text)) return this.#knock(text, note ?? '');
    const { space, invite, proof } = await this.#takeInvite(text);
    this.replica.write(this.identity, sealFor(this.#cipher(space), { kind: KIND_JOIN, body: { invite, ...(proof ? { proof } : {}) } }));
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
    const inside = this.#insideOnly(invite.space.founder);
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
    if (fresh && !canManage(state, this.identity.author)) {
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
    if (events.length) this.replica.write(this.identity, sealFor(this.#cipher(space), { kind: KIND_CARRY, body: { events: events as unknown as Json } }));
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

  /**
   * What agent and service keys signed counts only as far as the space lets them (visitorCounts): in managed
   * spaces only approved keys (stage 9); elsewhere as the space's rule for agents and services says.
   */
  #approvedOnly(decoded: Decoded[]): Decoded[] {
    const states = new Map<string, SpaceState>();
    const of = (space: StoredSpace) => {
      let state = states.get(space.id);
      if (!state) {
        state = spaceState(space.kind, space.founder, decoded.filter((d) => d.space?.id === space.id));
        states.set(space.id, state);
      }
      return state;
    };
    return decoded.filter((d) => {
      const space = d.space as StoredSpace | undefined;
      const grant = space && d.event.signer !== d.event.author ? this.replica.authority.grant(d.event.signer) : undefined;
      if (!space || grant?.role !== 'agent') return true;
      return visitorCounts(of(space), { key: d.event.signer as Did, author: d.event.author, service: !!grant.name?.startsWith(SERVICE_PREFIX) }, canonicalKind(d.inner.kind), !!this.#managedRaw(space).setting);
    });
  }

  /** One new event: does it count, by the space's state as known (see #approvedOnly)? */
  #agentCounts(d: Decoded): boolean {
    const space = d.space as StoredSpace | undefined;
    const grant = space && d.event.signer !== d.event.author ? this.replica.authority.grant(d.event.signer) : undefined;
    if (!space || grant?.role !== 'agent') return true;
    return visitorCounts(this.#state(space), { key: d.event.signer as Did, author: d.event.author, service: !!grant.name?.startsWith(SERVICE_PREFIX) }, canonicalKind(d.inner.kind), !!this.#managedRaw(space).setting);
  }

  /** Before an agent or service of ours signs in a space: refuse what the space wouldn't count, and say why. */
  #visitorMay(space: StoredSpace, key: Did, name: string, kind: string): void {
    const state = this.#state(space);
    const managed = !!this.#managedRaw(space).setting;
    const service = name.startsWith(SERVICE_PREFIX) || this.#services.storedServices().some((s) => s.name === name);
    if (visitorCounts(state, { key, author: this.identity.author, service }, canonicalKind(kind), managed)) return;
    const what = service ? `service "${name}"` : `agent "${name}"`;
    const rule = service ? state.visitors?.services : state.visitors?.agents;
    const ref = `${this.nameOf(this.identity.author) ?? this.identity.author}/${name}`;
    if (rule?.who === 'nobody') throw new Error(`${space.name} doesn't let ${service ? 'services' : 'agents'} act in it: its maintainers decide that`);
    if (managed || rule?.who === 'approved') if (!state.approvedAgents?.has(key)) throw new Error(`${what} isn't approved in ${space.name}: those who manage it can approve it (weave approve-agent "${space.name}" ${ref})`);
    throw new Error(`${space.name} doesn't let ${service ? 'services' : 'agents'} write ${kind} (only ${rule?.kinds?.join(', ')}): its maintainers decide that`);
  }

  /** What people's agents and services may do in a space (those who manage it). Leaving one out keeps it as it is. */
  async setVisitors(input: { space: string; agents?: VisitorRule; services?: VisitorRule }): Promise<SpaceInfo> {
    const space = this.#space(input.space);
    const state = this.#state(space);
    if (space.kind === 'direct') throw new Error('a direct chat has no rules for agents');
    if (!canManage(state, this.identity.author)) throw new Error(`only those who manage ${space.name} decide what agents and services may do there`);
    const agents = input.agents ? parseVisitorRule(input.agents) : state.visitors?.agents;
    const services = input.services ? parseVisitorRule(input.services) : state.visitors?.services;
    if ((input.agents && !agents) || (input.services && !services)) throw new Error('a rule says who: everyone, approved or nobody (and optionally which kinds they may write)');
    this.replica.write(this.identity, sealFor(this.#cipher(space), { kind: KIND_VISITORS, body: { ...(agents ? { agents: agents as unknown as Json } : {}), ...(services ? { services: services as unknown as Json } : {}) } }));
    return this.#spaceInfo(space);
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
    const wrapped = await this.#provider(setting).wrap(kmsPart, context);
    const boxed = boxTo(this.#encryptionKeyOf(space.founder), b64u.encode(companyPart));
    this.replica.write(this.identity, sealFor(this.#cipher(space), { kind: KIND_ESCROW, body: { person: this.identity.author, v: 2, wrapped, boxed: boxed as unknown as Json, nonce: sealed.nonce, ct: sealed.ct } }));
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
      const kmsPart = await this.#provider(state.managed).unwrap(escrow.wrapped, context);
      words = open(escrowKey(kmsPart, b64u.decode(companyPart)), { nonce: escrow.nonce, ct: escrow.ct }, `weave/escrow/v2:${context.space}`) as string;
    } else {
      // Escrows from before v2 went through the key service alone (any employee could open them): leave new ones.
      const dataKey = await this.#provider(state.managed).unwrap(escrow.wrapped, context);
      words = open(dataKey, { nonce: escrow.nonce, ct: escrow.ct }, `weave/escrow/v1:${context.space}`) as string;
    }
    this.replica.write(this.identity, sealFor(this.#cipher(space), { kind: KIND_ESCROW_OPENED, body: { person, ...(request ? { for: request } : {}) } }));
    return request ? encodeRecoveryAnswer(person, boxTo(request, { words }) as unknown as Json) : words;
  }

  async approveAgent(input: { space: string; agent: string; on?: boolean }): Promise<SpaceInfo> {
    const space = this.#space(input.space);
    const state = this.#state(space);
    if (space.kind === 'direct') throw new Error('a direct chat has no rules for agents');
    if (!canManage(state, this.identity.author)) throw new Error(`only those who manage ${space.name} approve agents and services there`);
    this.replica.write(this.identity, sealFor(this.#cipher(space), { kind: KIND_AGENT_APPROVE, body: { agent: this.#agentKey(input.agent), on: input.on !== false } }));
    return this.#spaceInfo(space);
  }

  /** An agent key from `person/agent` (a person's name or id, the agent's name) or the key itself. */
  #agentKey(ref: string): Did {
    if (isDid(ref) && this.replica.authority.grant(ref)?.role === 'agent') return ref;
    const at = ref.lastIndexOf('/');
    if (at > 0) {
      const person = this.resolve(ref.slice(0, at));
      // An agent by its name, or a service by its own (its key is named service:<name>).
      const name = ref.slice(at + 1);
      const grant = this.replica.authority.grantsOf(person).find((g) => g.role === 'agent' && g.revokedAfter === undefined && (g.name === name || g.name === `${SERVICE_PREFIX}${name}`));
      if (grant) return grant.subject;
    }
    throw new Error(`no agent "${ref}": name it as person/agent (e.g. Lena/claude) or by its key`);
  }

  async agentBlocked(agent: string): Promise<Array<{ id: string; name: string }>> {
    const key = this.#agents.find((a) => a.name === agent)?.did;
    if (!key) throw new Error(noAgent(agent, this.#agents.map((a) => a.name)));
    // Where its key doesn't count at all (what it may write there is a matter of kinds).
    return [...this.#spaces.values()]
      .filter((s) => {
        const state = this.#state(s);
        if (state.managed) return !state.approvedAgents?.has(key);
        const who = state.visitors?.agents?.who ?? 'everyone';
        return !canManage(state, this.identity.author) && (who === 'nobody' || (who === 'approved' && !state.approvedAgents?.has(key)));
      })
      .map((s) => ({ id: s.id, name: s.name }));
  }

  /**
   * The rekeys that count in a space (Gr9S4DLf): by someone who managed it as
   * of the rekey (rekeyCounts), for an epoch we hold. Rekeys are in the clear:
   * anyone in the space can write one, dated as they like. Its time is its date,
   * but never later than when it got here.
   */
  #countingRekeys(space: StoredSpace, state: SpaceState = this.#state(space)): Array<{ epoch: number; time: string; seen: string }> {
    const scope = spaceScope(space);
    return this.replica
      .events((r) => canonicalKind(r.kind) === KIND_REKEY && r.scope === scope)
      .flatMap((e) => {
        const epoch = (e.body as { epoch?: unknown } | null)?.epoch;
        if (!Number.isSafeInteger(epoch) || !space.keys[String(epoch)] || !rekeyCounts(state, e)) return [];
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
    const forgets = (space.kind !== 'group' && [...boardRulesOf(this.#entries(space), this.#managers(state), this.#seenAt).values()].some((r) => r.keepDays)) || !!this.#companyRetention(space)?.maxDays;
    if (space.kind === 'direct' || (state.history?.value !== '30d' && !forgets) || !canManage(state, this.identity.author)) return 0;
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
      counts.set(epoch, (counts.get(epoch) ?? false) || rekeyCounts(state, e));
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
      ...(this.#companyVouchedOf(m.did) ? { company: this.nameOf(this.#companyVouchedOf(m.did)!) ?? 'a company' } : {}),
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
    this.replica.write(this.identity, sealFor(this.#cipher(space), { kind: KIND_LEAVE, body: { upTo: this.#upTo(this.identity.author), at: this.#anchor(this.identity.author, space) } }));
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
    this.replica.write(this.identity, sealFor(this.#cipher(space), { kind: KIND_HANDOVER, body: { to, upTo: this.#upTo(this.identity.author), at: this.#anchor(this.identity.author, space) } }));
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
    this.replica.write(this.identity, sealFor(await this.#cipherReady(space), { kind: KIND_REMOVE, body: { member, upTo: this.#upTo(member), at: this.#anchor(member, space) } }));
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
    const target = postTargetOf(ref ?? '');
    if (target) return this.#postAt(target);
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

  async submit(input: { space: string; board?: string; title: string; text?: string; link?: string; image?: string; with?: string[]; prompt?: string; as?: string }): Promise<PostInfo> {
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
    const prompt = input.prompt?.trim();
    if (prompt && prompt.length > TEXT_LIMITS.prompt) throw tooLong('The starting prompt', prompt.length, TEXT_LIMITS.prompt);
    if (prompt) body.prompt = prompt;
    if (space.kind === 'project') {
      const board = this.#board(space, this.#spacePosts(space).boards, input.board ?? 'ideas');
      if (board.type === 'issues') return this.post((await this.openIssue({ project: space.id, title, text: input.text, as: input.as, board: board.name, prompt })).id);
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
    if (!kinds.length) throw new Error('name the kinds to ask for, like weave.app');
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

  async requestHand(input: { as: string; project: string; resources: string[]; platform?: string; reason?: string }): Promise<PermissionRequest> {
    const agent = this.#agents.find((a) => a.name === input.as);
    if (!agent) throw new Error(noAgent(input.as, this.#agents.map((a) => a.name)));
    const platform = input.platform ?? 'github';
    const resources = [...new Set(input.resources.map((r) => String(r).trim()).filter((r) => r && r.length <= 200))].slice(0, 20);
    if (!resources.length) throw new Error('name the repositories, like owner/name');
    const project = this.#project(input.project);
    const vault = this.#keyvaults.forPlatform(platform);
    if (!vault) throw new Error(`your person has no ${platform} keyvault yet: they add one in Keys & devices`);
    const keys = Object.keys(vault.apps);
    if (!keys.length) throw new Error(`your person's ${platform} keyvault has no app yet: they make one in Keys & devices`);
    // The app that reaches them all: asking for what none reaches would be allowed for nothing.
    let app: string | undefined;
    const problems: string[] = [];
    for (const key of keys) {
      try {
        const reach = new Set((await this.#keyvaults.reachable(vault.name, key)).map((r) => r.value.toLowerCase()));
        if (resources.every((r) => reach.has(r.toLowerCase()))) {
          app = key;
          break;
        }
      } catch (e) {
        problems.push((e as Error).message);
      }
    }
    if (!app) throw new Error(`your person's ${platform} App doesn't reach ${resources.join(', ')}${problems.length ? ` (${problems.join('; ')})` : ''}: they install it there on ${platform} first`);
    const handed = new Set(vault.apps[app].handed[project.id] ?? []);
    const now = new Date(this.clock()).toISOString();
    const title = this.#keyvaults.state(vault).title;
    const hand = { keyvault: vault.name, title, platform, app, project: { id: project.id, name: project.name }, resources: resources.filter((r) => !handed.has(r)) };
    if (!hand.resources.length) return { id: '', agent: agent.name, kinds: [], hand: { ...hand, resources }, reason: '', time: now, state: 'allowed' };
    const requests = this.#requests();
    const open = requests.find((r) => r.state === 'pending' && r.agent === agent.name && r.hand?.project.id === project.id && hand.resources.every((x) => r.hand!.resources.includes(x)));
    if (open) return open;
    const request: PermissionRequest = { id: b64u.encode(randomBytes(9)), agent: agent.name, kinds: [], hand, reason: (input.reason ?? '').trim().slice(0, 300), time: now, state: 'pending' };
    writeJson(this.#requestsFile, [...requests.filter((r) => r.state === 'pending'), ...requests.filter((r) => r.state !== 'pending').slice(-20), request]);
    this.#emitLive({
      type: 'permission',
      category: 'requests',
      title: `Your agent ${agent.name} asks for ${hand.resources.length === 1 ? 'a repository' : 'repositories'}`,
      text: `To give ${project.name} ${hand.resources.join(', ')} from your ${title}${request.reason ? `: “${request.reason}”` : ''}`,
      open: { inbox: true },
    });
    return request;
  }

  async openInApp(input: { what: AppOpen['what']; space?: string; repo?: string; post?: string; who?: string }): Promise<AppOpen> {
    if (!['space', 'inbox', 'post', 'person'].includes(input.what)) throw new Error('what is space, inbox, post or person');
    if (input.what === 'person') {
      if (!input.who) throw new Error('say who');
      const did = this.resolve(input.who);
      const name = this.nameOf(did);
      const open: AppOpen = { what: 'person', person: { did, ...(name ? { name } : {}) } };
      for (const listener of this.#openListeners) listener(open);
      return open;
    }
    if (input.what === 'post') {
      if (!input.post) throw new Error('say which post');
      const post = await this.post(input.post);
      const open: AppOpen = { what: 'post', post: { id: post.id, title: post.title }, ...(post.space ? { space: post.space } : {}) };
      for (const listener of this.#openListeners) listener(open);
      return open;
    }
    const space = input.space ? this.#space(input.space) : undefined;
    if (input.what !== 'inbox' && !space) throw new Error('say which space');
    const open: AppOpen = { what: input.what, ...(space ? { space: { id: space.id, kind: space.kind, name: space.name } } : {}) };
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
      this.#appLog?.stop();
      this.#appLog = undefined;
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
    this.#appLog = new AppLogFollower(() => {
      void this.#attachExpected()
        .catch(() => {})
        .then(() => this.focusedSession())
        .then((session) => {
          for (const listener of this.#focusListeners) listener(session);
        });
    });
    this.#appLog.start();
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
      const name = this.#sessionRecords().get(sessionKey('claude-code', said.session))?.name;
      this.#mention(post, { source: 'claude-code', session: { id: said.session, ...(name ? { name } : {}), ...(said.cwd ? { folder: basename(said.cwd) } : {}) } });
    }
  }

  #mention(post: PostInfo, how: Pick<MentionInfo, 'source'> & Partial<Pick<MentionInfo, 'agent' | 'session' | 'note'>>): MentionInfo {
    const mention: MentionInfo = {
      id: `mention-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      time: new Date().toISOString(),
      post,
      ...how,
    };
    this.#mentions = [mention, ...this.#mentions].slice(0, 100);
    for (const listener of this.#mentionListeners) listener(mention);
    return mention;
  }

  // ---------------------------------------------------------------- sessions and their stacks

  async sessions(): Promise<SessionInfo[]> {
    const posts = new Map(this.#allPosts().map((p) => [p.id, p]));
    return [...this.#sessionRecords().values()].sort((a, b) => b.time.localeCompare(a.time)).map((r) => this.#sessionInfo(r, posts));
  }

  async activeSessions(input: { hours?: number } = {}): Promise<SessionInfo[]> {
    const hours = Math.min(Math.max(input.hours ?? 12, 1), 24 * 14);
    const posts = new Map(this.#allPosts().map((p) => [p.id, p]));
    const records = this.#sessionRecords();
    const out = new Map([...records.values()].map((r) => [sessionKey(r.provider, r.id), this.#sessionInfo(r, posts)]));
    for (const recent of recentSessions(Date.now() - hours * 3600 * 1000)) {
      const key = sessionKey('claude-code', recent.id);
      if (out.has(key)) continue;
      out.set(key, this.#sessionInfo({ provider: 'claude-code', id: recent.id, ...(recent.folder ? { folder: recent.folder } : {}), stack: [], time: recent.active }, posts));
    }
    const when = (s: SessionInfo) => s.active ?? s.time;
    return [...out.values()].sort((a, b) => when(b).localeCompare(when(a)));
  }

  async focusedSession(): Promise<SessionInfo | null> {
    const focus = this.#appLog?.current;
    if (!focus) return null;
    // Before the app has said which Claude Code session it is, it's known by the app's id alone.
    return this.session({ provider: 'claude-code', id: focus.id ?? focus.host, host: focus.host });
  }

  async session(input: SessionRef): Promise<SessionInfo> {
    return this.#sessionInfo(this.#sessionRecord(input), new Map(this.#allPosts().map((p) => [p.id, p])));
  }

  async workOn(input: { session: SessionRef; post?: string; create?: { space: string; board?: string; title: string; text?: string; prompt?: string }; as?: string }): Promise<SessionInfo> {
    if (!input.post === !input.create) throw new Error('name a post to work on, or create one (not both)');
    const post = input.post ? await this.post(input.post) : await this.submit({ ...input.create!, as: input.as });
    const record = this.#sessionRecord(input.session);
    // The first session that takes on a desk item becomes your daily driver: the desk's items go to it from then on.
    const desk = this.config.desk;
    if (desk && !desk.driver && post.space?.id === desk.space) {
      this.config = { ...this.config, desk: { ...desk, driver: { provider: record.provider, id: record.id, ...(record.host ? { host: record.host } : {}), ...(record.folder ? { folder: record.folder } : {}) } } };
      saveConfig(this.home, this.config);
    }
    return this.#saveSession({ ...record, stack: pushOnto(record.stack, post.id, new Date().toISOString()) });
  }

  async doneWith(input: { session: SessionRef; post?: string; close?: boolean; as?: string }): Promise<SessionInfo> {
    const record = this.#sessionRecord(input.session);
    const id = input.post ? (await this.post(input.post)).id : record.stack[0]?.post;
    if (!id) throw new Error('this session has no work items');
    if (!record.stack.some((s) => s.post === id)) throw new Error("that post isn't on this session's stack");
    if (input.close) {
      const post = await this.post(id);
      if (post.type === 'issue' && post.issue?.status !== 'done') await this.setIssueStatus({ issue: id, status: 'done', as: input.as });
    }
    const now = new Date().toISOString();
    return this.#saveSession({ ...record, stack: takeOff(record.stack, id, now), last: { post: id, time: now } });
  }

  async restack(input: { session: SessionRef; posts?: string[]; remove?: string[] }): Promise<SessionInfo> {
    const record = this.#sessionRecord(input.session);
    const ids = async (refs: string[] = []) => Promise.all(refs.map(async (ref) => (await this.post(ref)).id));
    const remove = new Set(await ids(input.remove));
    const stack = reorder(record.stack, await ids(input.posts)).filter((s) => !remove.has(s.post));
    return this.#saveSession({ ...record, stack });
  }

  async setSessionRole(input: { session: SessionRef; role?: SessionRole | null; projects?: string[]; available?: boolean }): Promise<SessionInfo> {
    const record = this.#sessionRecord(input.session);
    if (input.role !== undefined && input.role !== null && !SESSION_ROLES.includes(input.role)) throw new Error('a session is your driver or a worker');
    const role = input.role === undefined ? record.role : (input.role ?? undefined);
    const projects = input.projects === undefined ? record.projects : [...new Set(input.projects.map((p) => this.#space(p).id))];
    const available = input.available ?? (input.role && !record.role ? true : record.available);
    const desk = this.config.desk;
    const isDriver = (r: { provider?: string; id: string } | undefined) => !!r && (r.provider ?? 'claude-code') === record.provider && r.id === record.id;
    if (role === 'driver') {
      // One driver: the one before goes back to being a worker.
      for (const other of this.#sessionRecords().values())
        if (other.role === 'driver' && !isDriver(other)) this.#saveSession({ ...other, role: 'worker' });
      if (desk) {
        this.config = { ...this.config, desk: { ...desk, driver: { provider: record.provider, id: record.id, ...(record.host ? { host: record.host } : {}), ...(record.folder ? { folder: record.folder } : {}) } } };
        saveConfig(this.home, this.config);
      }
    } else if (desk?.driver && isDriver(desk.driver)) {
      const { driver: _, ...rest } = desk;
      this.config = { ...this.config, desk: rest };
      saveConfig(this.home, this.config);
    }
    return this.#saveSession({ ...record, role, projects: projects?.length ? projects : undefined, available: role ? !!available : undefined });
  }

  async workers(input: { post?: string; space?: string } = {}): Promise<SessionInfo[]> {
    const space = input.post ? (await this.post(input.post)).space?.id : input.space ? this.#space(input.space).id : undefined;
    const posts = new Map(this.#allPosts().map((p) => [p.id, p]));
    const takes = (r: SessionRecord) =>
      r.role === 'driver' ? r.available !== false || space === this.config.desk?.space : r.role === 'worker' && !!r.available && (!space || !r.projects?.length || r.projects.includes(space));
    const when = (s: SessionInfo) => s.active ?? s.time;
    return [...this.#sessionRecords().values()]
      .filter(takes)
      .map((r) => this.#sessionInfo(r, posts))
      .sort((a, b) => Number(a.stack.length > 0) - Number(b.stack.length > 0) || when(b).localeCompare(when(a)));
  }

  async assign(input: { post: string; session: SessionRef; as?: string }): Promise<SessionInfo> {
    const post = await this.post(input.post);
    const record = this.#sessionRecord(input.session);
    if (!(await this.workers({ post: post.id })).some((w) => w.provider === record.provider && w.id === record.id))
      throw new Error(`that session doesn't take ${post.title} now: it isn't an available worker for its project`);
    return this.workOn({ session: input.session, post: post.id, as: input.as });
  }

  async nameSession(input: { session: SessionRef; name?: string; about?: string; description?: string; rename?: boolean }): Promise<SessionInfo> {
    const record = this.#sessionRecord(input.session);
    const name = input.name?.trim();
    const about = input.about === undefined ? record.about : input.about.trim() || undefined;
    const description = input.description === undefined ? record.description : input.description.trim() || undefined;
    if (about && about.length > MAX_ABOUT) throw new Error(`about is one line, up to ${MAX_ABOUT} characters`);
    if (description && description.length > MAX_DESCRIPTION) throw new Error(`a description is up to ${MAX_DESCRIPTION} characters`);
    if (name === undefined && !record.name) throw new Error('this session has no name yet: name it first (name, with about: one line on what it specializes in)');
    if (name === '' && !input.rename) throw new Error('a session name is permanent');
    if (name && !sameName(name, record.name)) {
      // A name is for good: the session picks it once; from then on only its person changes it.
      if (record.name && !input.rename) throw new Error(`this session is ${record.name}: a name is permanent, only your person renames a session (in Weave's Sessions view)`);
      const taken = this.#takenNames(record);
      const problem = nameProblem(name, taken);
      if (problem) throw new Error(`${problem}; names around you: ${[...new Set(taken.filter((t): t is string => !!t))].sort((a, b) => a.localeCompare(b)).join(', ') || 'none yet'}`);
    }
    return this.#saveSession({ ...record, name: name === '' ? undefined : (name ?? record.name), about, description });
  }

  /** Names a session can't take (except `own`'s): your other sessions', people's around you, your agents' and yours. */
  #takenNames(own: SessionRecord): Array<string | undefined> {
    const names: Array<string | undefined> = [this.nameOf(this.identity.author), ...this.#agents.map((a) => a.name)];
    for (const r of this.#sessionRecords().values()) if (!(r.provider === own.provider && r.id === own.id)) names.push(r.name);
    const people = new Set<Did>(this.#contacts().keys());
    for (const space of this.#spaces.values()) for (const did of this.#state(space).members.keys()) people.add(did);
    for (const did of people) if (did !== this.identity.author) names.push(this.nameOf(did));
    return names;
  }

  // ---------------------------------------------------------------- your desk and its routines

  async desk(): Promise<DeskInfo | null> {
    const desk = this.config.desk;
    const space = desk && this.#spaces.get(desk.space);
    return space ? { space: { id: space.id, kind: space.kind, name: space.name }, ...(desk.folder ? { folder: desk.folder } : {}), ...(desk.driver ? { driver: desk.driver } : {}) } : null;
  }

  /** Where your desk's folder is, or goes by default. */
  async deskFolder(): Promise<string> {
    return this.config.desk?.folder ?? joinPath(homedir(), 'Weave Desk');
  }

  async setupDesk(input: { name?: string; folder?: string } = {}): Promise<DeskInfo> {
    let desk = await this.desk();
    if (!desk) {
      const project = await this.createProject({ name: input.name?.trim() || 'Desk', description: 'My desk: journal, ideas and routines. Private.' });
      await this.setBoard({ project: project.id, name: 'journal', title: 'Journal', type: 'posts', sort: 'new', position: 0 });
      await this.setBoard({ project: project.id, name: 'releases', on: false });
      await this.setBoard({ project: project.id, name: 'proposals', on: false });
      this.config = { ...this.config, desk: { space: project.id } };
      saveConfig(this.home, this.config);
      desk = (await this.desk())!;
      for (const routine of DESK_ROUTINES) await this.setRoutine({ space: project.id, ...routine });
    }
    // The folder where the daily driver works, with its instructions (yours to change: never overwritten).
    // A bare name is a folder in your user folder, not wherever the daemon happens to run.
    const asked = input.folder?.trim();
    const folder = asked ? (isAbsolute(asked) ? resolvePath(asked) : joinPath(homedir(), asked)) : (desk.folder ?? joinPath(homedir(), 'Weave Desk'));
    const previous = desk.folder;
    mkdirSync(folder, { recursive: true });
    const instructions = joinPath(folder, 'CLAUDE.md');
    if (!existsSync(instructions)) writeFileSync(instructions, deskInstructions(this.nameOf(this.identity.author) ?? 'me', desk.space.name));
    // A desk that moved: the old folder isn't suggested for it any more.
    const known = (this.config.spaceFolders?.[desk.space.id] ?? []).filter((f) => f !== previous || f === folder);
    this.config = { ...this.config, desk: { ...this.config.desk, space: desk.space.id, folder }, spaceFolders: { ...this.config.spaceFolders, [desk.space.id]: known } };
    saveConfig(this.home, this.config);
    await this.rememberFolder({ space: desk.space.id, folder });
    // First start: the routines that run once, now.
    for (const routine of (await this.routines({ space: desk.space.id })).filter((r) => r.on && r.trigger.type === 'first-start')) await this.runRoutine({ space: desk.space.id, id: routine.id });
    return (await this.desk())!;
  }

  async routines(input: { space?: string } = {}): Promise<RoutineInfo[]> {
    const space = this.#routineSpace(input.space);
    const posts = this.#spacePosts(space).posts.filter((p) => p.routine);
    const now = new Date();
    return this.#routineRecords(space).map((r) => {
      const last = posts.filter((p) => p.routine!.id === r.id).sort((a, b) => b.time.localeCompare(a.time))[0];
      const next = nextRun(r, now);
      return {
        id: r.id,
        name: r.name,
        on: r.on,
        trigger: r.trigger,
        create: r.create,
        space: { id: space.id, kind: space.kind, name: space.name },
        ...(last ? { last: { post: last.id, occurrence: last.routine!.occurrence, time: last.time } } : {}),
        ...(next ? { next: next.toISOString() } : {}),
      };
    });
  }

  async setRoutine(input: { space?: string; id?: string; name: string; on?: boolean; trigger: RoutineInfo['trigger']; create: RoutineInfo['create'] }): Promise<RoutineInfo> {
    const space = this.#routineSpace(input.space);
    this.#maintainerState(space);
    const name = input.name?.trim();
    if (!name || name.length > 100) throw new Error('a routine needs a name (up to 100 characters)');
    const trigger = parseTrigger(input.trigger);
    if (!trigger) throw new Error('a routine runs on a schedule (days 0-6, Sunday is 0, and a time like 08:00) or at first start');
    const create = parseCreate(input.create);
    if (!create) throw new Error('say what the routine creates: a board and a title pattern ({date}, {day}, {weekday})');
    this.#board(space, this.#spacePosts(space).boards, create.board);
    const id = input.id?.trim() || randomUUID().slice(0, 8);
    this.replica.write(this.identity, sealFor(this.#cipher(space), { kind: KIND_ROUTINE, body: { id, name, on: input.on !== false, trigger, create } as unknown as Json }));
    return (await this.routines({ space: space.id })).find((r) => r.id === id)!;
  }

  async removeRoutine(input: { space?: string; id: string }): Promise<void> {
    const space = this.#routineSpace(input.space);
    this.#maintainerState(space);
    if (!this.#routineRecords(space).some((r) => r.id === input.id)) throw new Error('no such routine');
    this.replica.write(this.identity, sealFor(this.#cipher(space), { kind: KIND_ROUTINE, body: { id: input.id, removed: true } }));
  }

  async runRoutine(input: { space?: string; id: string }): Promise<PostInfo> {
    const space = this.#routineSpace(input.space);
    const routine = this.#routineRecords(space).find((r) => r.id === input.id);
    if (!routine) throw new Error('no such routine');
    const now = new Date();
    return this.#runOccurrence(space, routine, routine.trigger.type === 'first-start' ? 'first-start' : dayKey(now), now);
  }

  /**
   * Create what's due: today's item of every scheduled routine whose time has come and that you made
   * (in a shared project, only its author's Weave runs it). The daemon calls this every minute.
   */
  async tickRoutines(now = new Date()): Promise<PostInfo[]> {
    const made: PostInfo[] = [];
    for (const space of this.#spaces.values()) {
      if (space.kind !== 'project') continue;
      for (const routine of this.#routineRecords(space)) {
        if (routine.by !== this.identity.author) continue;
        const occurrence = dueOccurrence(routine, now);
        if (!occurrence || this.#occurrence(space, routine.id, occurrence)) continue;
        made.push(await this.#runOccurrence(space, routine, occurrence, now));
      }
    }
    return made;
  }

  #routineSpace(ref?: string): StoredSpace {
    const id = ref ?? this.config.desk?.space;
    if (!id) throw new Error('set up your desk first, or say which project');
    const space = this.#space(id);
    if (space.kind !== 'project') throw new Error('routines live in projects');
    return space;
  }

  #routineRecords(space: StoredSpace): Routine[] {
    return routinesOf(this.#entries(space), this.#state(space).maintainers);
  }

  #occurrence(space: StoredSpace, id: string, occurrence: string): PostInfo | undefined {
    return this.#spacePosts(space).posts.find((p) => p.routine?.id === id && p.routine.occurrence === occurrence);
  }

  async #runOccurrence(space: StoredSpace, routine: Routine, occurrence: string, now: Date): Promise<PostInfo> {
    const existing = this.#occurrence(space, routine.id, occurrence);
    if (existing) return existing;
    const { create } = routine;
    const body: Record<string, Json> = { title: renderTitle(create.title, now), text: create.text ?? '', board: create.board, routine: { id: routine.id, occurrence } };
    if (create.prompt) body.prompt = create.prompt;
    const { id } = await this.publish({ kind: KIND_POST, body, space: space.id });
    const post = await this.post(id);
    this.#emitLive({ type: 'routine', category: 'activity', title: routine.name, text: `${post.title} is ready`, open: { post: post.id } });
    return post;
  }

  async expectSession(input: { post?: string; folder?: string; role?: SessionRole; projects?: string[] }): Promise<void> {
    if (input.role !== undefined && !SESSION_ROLES.includes(input.role)) throw new Error('a session is your driver or a worker');
    const post = input.post ? (await this.post(input.post)).id : undefined;
    const projects = input.projects?.map((p) => this.#space(p).id);
    if (!post && !input.role) throw new Error('say what the new session gets: an item, a job or both');
    this.#expected = {
      ...(post ? { post } : {}),
      ...(input.folder ? { folder: input.folder } : {}),
      ...(input.role ? { role: input.role, ...(projects?.length ? { projects } : {}) } : {}),
      until: Date.now() + 15 * 60 * 1000,
    };
  }

  folders(input: { space: string }): Promise<string[]> {
    return Promise.resolve(this.config.spaceFolders?.[this.#space(input.space).id] ?? []);
  }

  /** The session Ctrl+click or the Sessions page opened has shown up in the Claude app, with its id: give it its item and its job. */
  async #attachExpected(): Promise<void> {
    const expected = this.#expected;
    const focus = this.#appLog?.current;
    if (!expected || !focus?.id) return;
    if (Date.now() > expected.until) return void (this.#expected = undefined);
    // Only a session with nothing on it yet: not one you switched to on the way.
    const known = this.#sessionRecords().get(sessionKey('claude-code', focus.id));
    if (known?.stack.length || known?.role) return;
    this.#expected = undefined;
    const session = { provider: 'claude-code', id: focus.id, host: focus.host, ...(expected.folder ? { folder: expected.folder } : {}) };
    if (expected.post) await this.workOn({ session, post: expected.post });
    if (expected.role) await this.setSessionRole({ session, role: expected.role, ...(expected.projects ? { projects: expected.projects } : {}) });
  }

  async workTarget(input: { post: string; session?: SessionRef }): Promise<WorkTarget> {
    const post = await this.post(input.post);
    const records = [...this.#sessionRecords().values()].sort((a, b) => b.time.localeCompare(a.time));
    // The session you picked; else your desk's items go to your daily driver, others to their latest session.
    const driver = this.config.desk?.driver;
    const latest = input.session
      ? this.#sessionRecord(input.session)
      : driver && post.space?.id === this.config.desk?.space
        ? this.#sessionRecord(driver)
        : records.find((r) => r.stack.some((s) => s.post === post.id));
    const posts = new Map(this.#allPosts().map((p) => [p.id, p]));
    // Folders for the item's space: the ones you chose, then the ones its sessions ran in.
    const space = post.space?.id;
    const used = space ? records.filter((r) => r.folder && r.stack.some((s) => posts.get(s.post)?.space?.id === space)).map((r) => r.folder!) : [];
    const folders = [...new Set([...(space ? (this.config.spaceFolders?.[space] ?? []) : []), ...used])];
    const lines = [
      `Weave work item: ${post.title}`,
      post.url,
      '',
      post.prompt ?? "Let's work on this.",
      ...(latest ? [] : ['', `(This is a new session: first put the item on your stack with weave_work_on, post ${post.url}.)`]),
    ];
    return { post, ...(latest ? { session: this.#sessionInfo(latest, posts) } : {}), folders, text: lines.join('\n') };
  }

  async rememberFolder(input: { space: string; folder: string }): Promise<string[]> {
    const space = this.#space(input.space);
    const folder = input.folder?.trim();
    if (!folder || folder.length > 1000) throw new Error('say which folder');
    const list = [folder, ...(this.config.spaceFolders?.[space.id] ?? []).filter((f) => f !== folder)].slice(0, 10);
    this.config = { ...this.config, spaceFolders: { ...this.config.spaceFolders, [space.id]: list } };
    saveConfig(this.home, this.config);
    return list;
  }

  #sessionRecords(): Map<string, SessionRecord> {
    const mine = this.#decodeAll()
      .filter((d) => d.private && d.inner.kind === KIND_SESSION)
      .map((d) => ({ id: d.id, event: d.event, kind: d.inner.kind, body: d.inner.body }));
    return sessionsOf(mine);
  }

  /** A session's record, with what the caller now knows about it (host id, folder) filled in. */
  #sessionRecord(ref: SessionRef): SessionRecord {
    const provider = ref.provider?.trim() || 'claude-code';
    const id = ref.id?.trim();
    if (!id || id.length > 200) throw new Error('say which session (its id)');
    const records = this.#sessionRecords();
    // "Give that to Skala": a name does where no session has that id.
    const known = records.get(sessionKey(provider, id)) ?? [...records.values()].find((r) => r.provider === provider && sameName(r.name, id));
    return {
      provider,
      id: known?.id ?? id,
      ...((ref.host ?? known?.host) ? { host: ref.host ?? known?.host } : {}),
      ...((ref.folder ?? known?.folder) ? { folder: ref.folder ?? known?.folder } : {}),
      ...(known?.title ? { title: known.title } : {}),
      ...(known?.name ? { name: known.name } : {}),
      ...(known?.about ? { about: known.about } : {}),
      ...(known?.description ? { description: known.description } : {}),
      stack: known?.stack ?? [],
      ...(known?.role ? { role: known.role } : {}),
      ...(known?.projects ? { projects: known.projects } : {}),
      ...(known?.available ? { available: true } : {}),
      ...(known?.last ? { last: known.last } : {}),
      time: known?.time ?? new Date().toISOString(),
    };
  }

  #saveSession(record: SessionRecord): SessionInfo {
    const title = (record.provider === 'claude-code' ? transcriptTitle(record.id) : undefined) ?? record.title;
    const body: Record<string, Json> = {
      provider: record.provider,
      id: record.id,
      ...(record.host ? { host: record.host } : {}),
      ...(record.folder ? { folder: record.folder } : {}),
      ...(title ? { title } : {}),
      ...(record.name ? { name: record.name } : {}),
      ...(record.about ? { about: record.about } : {}),
      ...(record.description ? { description: record.description } : {}),
      stack: record.stack.map((s) => ({ post: s.post, since: s.since })),
      ...(record.role ? { role: record.role } : {}),
      ...(record.projects?.length ? { projects: record.projects } : {}),
      ...(record.available ? { available: true } : {}),
      ...(record.last ? { last: { post: record.last.post, time: record.last.time } } : {}),
    };
    const event = this.replica.write(this.identity, this.#sealForSelf({ kind: KIND_SESSION, body }));
    return this.#sessionInfo({ ...record, ...(title ? { title } : {}), time: event.time }, new Map(this.#allPosts().map((p) => [p.id, p])));
  }

  #sessionInfo(record: SessionRecord, posts: Map<string, PostInfo>): SessionInfo {
    const brief = (item: { post: string }): SessionInfo['stack'][number]['post'] => {
      const p = posts.get(item.post);
      return p ?? { id: item.post, missing: true };
    };
    const providerTitle = (record.provider === 'claude-code' ? transcriptTitle(record.id) : undefined) ?? record.title;
    const title = sessionTitle({ ...record, title: providerTitle });
    const active = record.provider === 'claude-code' ? transcriptActive(record.id) : undefined;
    const host = record.host ?? (record.provider === 'claude-code' ? this.#appLog?.hostOf(record.id) : undefined);
    return {
      provider: record.provider,
      id: record.id,
      ...(active ? { active } : {}),
      ...(host ? { host } : {}),
      ...(record.folder ? { folder: record.folder } : {}),
      ...(title ? { title } : {}),
      ...(record.name ? { name: record.name } : {}),
      ...(record.about ? { about: record.about } : {}),
      ...(record.description ? { description: record.description } : {}),
      ...(providerTitle ? { providerTitle } : {}),
      stack: record.stack.map((s) => ({ post: brief(s), since: s.since })),
      ...(record.role ? { role: record.role } : {}),
      ...(record.projects?.length
        ? { projects: record.projects.map((id) => this.#spaces.get(id)).filter((s): s is StoredSpace => !!s).map((s) => ({ id: s.id, kind: s.kind, name: s.name })) }
        : {}),
      ...(record.available ? { available: true } : {}),
      ...(record.last ? { last: { post: brief(record.last), time: record.last.time } } : {}),
      time: record.time,
    };
  }

  async permissionRequests(): Promise<PermissionRequest[]> {
    return this.#requests().filter((r) => r.state === 'pending' && this.#agents.some((a) => a.name === r.agent));
  }

  async answerPermission(input: { id: string; allow: boolean }): Promise<PermissionRequest> {
    const requests = this.#requests();
    const request = requests.find((r) => r.id === input.id);
    if (!request) throw new Error('no such request (it may have been answered already)');
    if (request.state !== 'pending') return request;
    if (input.allow && request.hand) {
      // Added to what the project has from that app: handing replaces it.
      const { keyvault, app, project, resources } = request.hand;
      const had = this.#keyvaults.list().find((k) => k.name === keyvault)?.apps.find((a) => a.key === app)?.handed[project.id] ?? [];
      await this.handKeyvault({ name: keyvault, app, project: project.id, resources: [...new Set([...had, ...resources])] });
    } else if (input.allow) {
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

  async editPost(input: { post: string; title?: string; text?: string; link?: string; image?: string; with?: string[]; prompt?: string; as?: string }): Promise<PostInfo> {
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
    if (input.prompt !== undefined) body.prompt = input.prompt.trim();
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
    const forgetting = boardRulesOf(this.#entries(space), this.#managers(state), this.#seenAt);
    return boards
      .filter((b) => !access || mayUse('read', b.name, me, state, access) || !state.members.has(me))
      .map(({ lens, ...b }) => {
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
          ...(lens ? { lens: { name: lens.name, tag: lens.tag, mode: lens.mode, release: lens.origin.release } } : {}),
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
    // A standby only follows: no duties, no keys, no writes.
    if (this.config.standby) return 0;
    // A promoted server says which generation it is, once: an older one that comes back stands down when it hears.
    const generation = this.config.generation;
    if (generation && !this.replica.events((e) => e.kind === KIND_GENERATION && e.author === this.identity.author && (e.body as { generation?: unknown } | null)?.generation === generation).length) {
      this.replica.write(this.identity, { kind: KIND_GENERATION, body: { generation } });
    }
    this.#prefetchBlobs();
    let changed = (await this.#expireMemberships()) + (await this.#grantAutomatic()) + (await this.#checkContractWallets()) + (await this.#grantPaid()) + (await this.#grantTickets()) + (await this.#renewPaid()) + (await this.#sendQueuedRequests());
    for (const space of [...this.#spaces.values()]) changed += this.#settleEpochKeys(space);
    changed += await this.#closeProposals();
    for (const space of [...this.#spaces.values()]) changed += this.#closeInvites(space);
    for (const space of [...this.#spaces.values()]) changed += this.#rotateAfterLeaving(space, this.#state(space));
    for (const space of [...this.#spaces.values()]) changed += this.#rotateMonthly(space);
    changed += this.#applyShreds();
    changed += this.#forget();
    changed += this.#release();
    changed += await this.#renewSignIn();
    for (const space of [...this.#spaces.values()]) if (this.#state(space).managed) await this.#unlock(space);
    // Company halves of new keys: published (or tried again) before anything else uses them.
    await Promise.all([...this.#halves.keys()].map((id) => this.#publishHalf(id)));
    changed += await this.#attest();
    changed += await this.#applyDirectory();
    changed += await this.#offboard();
    changed += this.#anchorRemovals();
    changed += this.#settleLosses();
    changed += await this.#orgDuties();
    changed += await this.#continueEnrollment();
    // Bookkeeping, not a change to anyone's spaces: the audit to the company's security tools.
    await this.#streamAudit();
    await Promise.all([...this.#halves.keys()].map((id) => this.#publishHalf(id)));
    // Bookkeeping for keepers and always-on nodes, not a change to anyone's spaces. A node does none of its person's.
    if (!this.#isLinkedNode) {
      this.#writeKeepIndex();
      this.#writeNodeIndex();
    }
    this.#recoverSpaces();
    // On an always-on node: services handed over by its person's computers.
    changed += await this.#services.takeHandovers();
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

  // ---------------------------------------------------------------- accounts elsewhere

  /**
   * Who reads a space: its members, or in a project the readers of one of its boards (everyone, for a board nobody
   * limited).
   */
  #readersOf(space: StoredSpace, state: SpaceState, entries: Entry[], board?: string): Did[] {
    if (!board || space.kind !== 'project') return [...state.members.keys()];
    return readersOf(board, state, this.#access(space, state, entries));
  }

  /** The platforms accounts can be proven on here (a verifier checks each), and how. */
  async platforms(): Promise<PlatformInfo[]> {
    return this.#verifiers.platforms();
  }

  /** What a proof of an account must hold (your Weave id), and how to make one on that platform. */
  async accountProof(input: { platform: string }): Promise<{ text: string; howto?: string }> {
    const p = this.#verifiers.platforms().find((x) => x.platform === input.platform);
    if (!p) throw new Error(`nothing here checks accounts on ${input.platform}${this.#verifiers.platforms().length ? ` (only on ${this.#verifiers.platforms().map((x) => x.platform).join(', ')})` : ''}`);
    return { text: accountProofText(this.identity.author), ...(p.howto ? { howto: p.howto } : {}) };
  }

  /**
   * Say an account elsewhere is yours, with its proof (or take it back, on: false): on your hub for everyone, or in a
   * space for its members (whose services may give access by it). Checked here first, by its platform's verifier.
   */
  async linkAccount(input: { platform: string; handle?: string; proof?: string; space?: string; on?: boolean; as?: string }): Promise<AccountInfo[]> {
    if (input.as) this.#agentMay(input.as, KIND_ACCOUNT);
    const space = input.space ? this.#space(input.space) : undefined;
    if (space && (space.kind === 'direct' || !this.#state(space).members.has(this.identity.author))) throw new Error(`you are not a member of ${space.name}`);
    if (!isPlatform(input.platform)) throw new Error('a platform: lowercase letters, digits and dashes, like github');
    let body: Json = { platform: input.platform, on: false };
    if (input.on !== false) {
      const handle = input.handle?.trim().replace(/^@/, '');
      const proof = input.proof?.trim();
      if (!handle || !proof) throw new Error(`your account on ${input.platform}, and where its proof is (weave account proof ${input.platform})`);
      const claim = { platform: input.platform, handle, proof };
      const ok = await this.#verifiers.verify(claim, this.identity.author);
      if (ok === undefined) throw new Error(this.#verifiers.platforms().some((p) => p.platform === input.platform) ? `${input.platform} can't be asked right now: try again in a moment` : `nothing here checks accounts on ${input.platform}`);
      if (!ok) throw new Error(`that proof doesn't hold: it has to be ${handle}'s, on ${input.platform}, and hold "${accountProofText(this.identity.author)}"`);
      body = { ...claim, on: true };
    }
    if (space) await this.publish({ kind: KIND_ACCOUNT, body, space: space.id, as: input.as });
    else this.replica.write(this.identity, { kind: KIND_ACCOUNT, body });
    return this.accounts({ ...(space ? { space: space.id } : {}) });
  }

  /** Proofs its verifier makes, under way: each waits for its sign-in with a code. */
  #proving = new Map<string, Promise<AccountInfo[]>>();

  /**
   * Prove an account elsewhere in one go: a sign-in with a code there (its verifier's), used once for the verifier to
   * make the proof (a secret gist naming you, on GitHub), then forgotten; the account is then yours on your hub, or in
   * a space. finishAccountProof waits for it.
   */
  async startAccountProof(input: { platform: string; space?: string }): Promise<{ id: string; url: string; code: string }> {
    const oauth = this.#verifiers.prover(input.platform);
    if (!oauth?.device) throw new Error(`${input.platform}'s verifier can't make a proof itself: make one by hand (weave account proof ${input.platform})`);
    if (input.space) this.#space(input.space);
    const started = await startDeviceSignIn(oauth as DeviceOAuth, this.oauthSetup.fetch, input.platform);
    const id = b64u.encode(randomBytes(12));
    const done = started.grant
      .then((grant) => this.#verifiers.prove(input.platform, grant.access, this.identity.author))
      .then(({ handle, proof }) => this.linkAccount({ platform: input.platform, handle, proof, ...(input.space ? { space: input.space } : {}) }))
      .finally(() => setTimeout(() => this.#proving.delete(id), 60_000).unref());
    done.catch(() => {});
    this.#proving.set(id, done);
    return { id, url: started.url, code: started.code };
  }

  async finishAccountProof(input: { id: string }): Promise<AccountInfo[]> {
    const proving = this.#proving.get(input.id);
    if (!proving) throw new Error('no proof under way with that id');
    return proving;
  }

  /** Accounts elsewhere people said are theirs: on their hubs (who), or in a space; each checked by its platform's verifier. */
  async accounts(input: { space?: string; who?: string } = {}): Promise<AccountInfo[]> {
    // On hubs: public events, signed by the person. In a space: sealed for its members.
    const claims = input.space ? accountClaimsOf(this.#entries(this.#space(input.space))) : accountClaimsOf(this.replica.events((e) => e.kind === KIND_ACCOUNT).map((e) => ({ kind: e.kind, body: e.body as Json, event: { author: e.author, time: e.time } })));
    const only = input.who ? this.resolve(input.who) : undefined;
    // Each checked by its verifier, all at once (known ones aren't asked again for an hour).
    const all = [...claims].filter(([did]) => !only || did === only).flatMap(([did, mine]) => [...mine.values()].map((claim) => ({ did, claim })));
    return Promise.all(
      all.map(async ({ did, claim }): Promise<AccountInfo> => {
        const verified = await this.#verifiers.verify(claim, did);
        const page = this.#verifiers.page(claim);
        return { who: this.#actor(did, did), platform: claim.platform, handle: claim.handle, proof: claim.proof, ...(page ? { url: page } : {}), ...(verified !== undefined ? { verified } : {}) };
      }),
    );
  }

  async myAccounts(): Promise<MyAccountInfo[]> {
    const me = this.identity.author;
    const byAccount = new Map<string, MyAccountInfo>();
    const said = (claim: AccountClaim | undefined, where: { hub: true } | { space: StoredSpace }) => {
      if (!claim) return;
      const key = JSON.stringify([claim.platform, claim.handle.toLowerCase(), claim.proof]);
      const page = this.#verifiers.page(claim);
      const a = byAccount.get(key) ?? { ...claim, ...(page ? { url: page } : {}), hub: false, spaces: [] };
      if ('hub' in where) a.hub = true;
      else a.spaces.push({ id: where.space.id, kind: where.space.kind, name: where.space.name });
      byAccount.set(key, a);
    };
    for (const claim of accountClaimsOf(this.replica.events((e) => e.kind === KIND_ACCOUNT && e.author === me).map((e) => ({ kind: e.kind, body: e.body as Json, event: { author: e.author, time: e.time } }))).get(me)?.values() ?? []) said(claim, { hub: true });
    for (const space of this.#spaces.values()) {
      if (space.kind === 'direct' || !this.#state(space).members.has(me)) continue;
      for (const claim of accountClaimsOf(this.#entries(space)).get(me)?.values() ?? []) said(claim, { space });
    }
    return Promise.all(
      [...byAccount.values()].map(async (a) => {
        const verified = await this.#verifiers.verify(a, me);
        return { ...a, ...(verified !== undefined ? { verified } : {}) };
      }),
    );
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
    // The accounts elsewhere on their hub, those that hold (a false proof isn't shown at all).
    const accounts = (await this.accounts({ who: did })).filter((a) => a.verified !== false).map(({ platform, handle, url, verified }) => ({ platform, handle, ...(url ? { url } : {}), ...(verified ? { verified } : {}) }));
    return { ...this.#profile(did), ...(accounts.length ? { accounts } : {}) };
  }

  #profile(did: Did): Profile {
    const graph = this.#graph();
    const me = this.identity.author;
    const mine = graph.get(me);
    const name = this.nameOf(did);
    return {
      did,
      name,
      url: personUrl(name, did),
      theme: this.themeOf(did),
      me: did === me,
      following: mine?.following.has(did) ?? false,
      followsMe: graph.get(did)?.following.has(me) ?? false,
      blocked: mine?.blocked.has(did) ?? false,
      muted: mine?.muted.has(did) ?? false,
      contact: this.#contacts().has(did),
      posts: this.replica.events((e) => e.author === did && e.kind === 'weave.post').length,
      projects: this.publicProjectsOf(did),
      ...((claim) => (claim && claim.vouched !== false ? { company: { ...this.#companyOfPerson(did), ...(claim.vouched ? {} : { unconfirmed: true as const }) } } : {}))(this.#companyClaim(did)),
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
    const key = query && personTargetOf(query);
    const q = query?.trim().toLowerCase();
    const profiles = [...authors].map((did) => this.#profile(did));
    return profiles
      .filter((p) => (key ? personKeyOf(p.did).startsWith(key) : !q || (p.name ?? '').toLowerCase().includes(q) || (q.length >= 8 && p.did.toLowerCase().includes(q))))
      .sort((a, b) => (a.name ?? a.did).localeCompare(b.name ?? b.did));
  }

  async find(query: string, limit = 30, only?: FoundKind): Promise<Found[]> {
    const q = query.trim().toLowerCase();
    // How well a name matches: whole name, its start, a word's start, anywhere (lower is better).
    const rank = (text: string | undefined): number => {
      const t = (text ?? '').toLowerCase();
      if (!q) return 3; // after the people you follow
      if (t === q) return 0;
      if (t.startsWith(q)) return 1;
      if (new RegExp(`(^|[^\\p{L}\\p{N}])${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u').test(t)) return 2;
      return t.includes(q) ? 3 : -1;
    };
    const key = personTargetOf(query) ?? (q.length >= 4 ? query.trim() : undefined);
    const found: Array<{ item: Found; rank: number; order: number; time: string }> = [];
    for (const person of only && only !== 'people' ? [] : await this.directory()) {
      // Without a query, the people you'd most likely mean: friends, then those you follow.
      const r = !q ? (person.following && person.followsMe ? 0 : person.following ? 1 : 2) : key && personKeyOf(person.did).startsWith(key) ? 1 : rank(person.name);
      if (r >= 0) found.push({ item: { person }, rank: r, order: 0, time: '' });
    }
    for (const space of this.#spaces.values()) {
      if (space.kind !== 'project' || (only && only !== 'projects')) continue;
      const post = this.#projectPost(space);
      const r = post ? rank(post.title) : -1;
      if (post && r >= 0) found.push({ item: { post }, rank: r, order: 1, time: post.active ?? post.time });
    }
    for (const post of only && only !== 'posts' ? [] : this.#allPosts()) {
      if (post.type === 'project') continue;
      const r = rank(post.title);
      if (r >= 0) found.push({ item: { post }, rank: r, order: 2, time: post.active ?? post.time });
    }
    return found
      .sort((a, b) => a.rank - b.rank || a.order - b.order || b.time.localeCompare(a.time) || (a.item.person?.name ?? '').localeCompare(b.item.person?.name ?? ''))
      .slice(0, Math.max(1, Math.min(limit, 100)))
      .map((f) => f.item);
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

  /** Before artifact lines: a project's one app. Its latest artifact's description now (any number of them). */
  async projectApp(ref: string): Promise<AppManifest | null> {
    return [...this.#lines(this.#project(ref)).values()].at(-1) ?? null;
  }

  /**
   * A project's artifact lines: each artifact it describes and releases (by its id), however many, each from its own
   * source, with its latest description. Nothing ties a project to one.
   */
  async artifactLines(ref: string): Promise<ArtifactLine[]> {
    const project = this.#project(ref);
    const released = artifactsOf(this.#entries(project), this.#state(project).maintainers);
    return [...this.#lines(project).values()].map((m) => {
      const latest = released.find((a) => a.manifest.app === m.app);
      const image = m.install?.image?.ref ?? m.start?.image;
      return { id: m.app, name: m.name, kind: artifactKindOf(m), ...(m.install?.source ? { source: m.install.source } : {}), ...(!m.install?.source && image ? { image } : {}), ...(latest ? { tag: latest.tag } : {}) };
    });
  }

  /** Describe one of a project's artifacts (its weave.app.json): another line, or the next description of one. */
  async publishArtifact(input: { project: string; manifest: unknown; as?: string }): Promise<AppManifest> {
    return this.publishApp(input);
  }

  async publishApp(input: { project: string; manifest: unknown; as?: string }): Promise<AppManifest> {
    if (input.as) this.#agentMay(input.as, KIND_APP);
    const project = this.#project(input.project);
    this.#maintainerState(project);
    let manifest = parseManifest(input.manifest);
    // A description usually doesn't list the release files (releasing adds them): keep those of this artifact's line.
    const before = this.#lines(project).get(manifest.app)?.install;
    if (before?.assets && !manifest.install?.assets) manifest = { ...manifest, install: { ...before, ...(manifest.install?.steps ? { steps: manifest.install.steps } : {}) } };
    await this.publish({ kind: KIND_APP, body: manifest as unknown as Json, space: project.id, as: input.as });
    return manifest;
  }

  // ---------------------------------------------------------------- releases

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
    // The repository's releases, as anyone sees them (a private repository's: its release posts are enough).
    try {
      const releases = await withTimeout(publicReleases(source.repo, this.githubSetup.fetch), 8000);
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

  /**
   * Which of a project's artifact lines a release is of, and where it comes from: the artifact named, the line released
   * from the source given (a new line, if none is), or its only line. Its source's provider, when that's known.
   */
  #releaseLine(project: StoredSpace, input: { artifact?: string; source?: string }): { ref: string; provider?: string; previous?: AppManifest } {
    const lines = [...this.#lines(project).values()];
    const given = input.source?.trim();
    const named = input.artifact ? lines.find((m) => m.app === input.artifact) : undefined;
    if (input.artifact && !named) throw new Error(`${this.#spaceName(project)} has no artifact ${input.artifact}${lines.length ? ` (its artifacts: ${lines.map((m) => m.app).join(', ')})` : ''}`);
    const fromSource = given ? lines.find((m) => m.install?.source?.ref.toLowerCase() === given.toLowerCase()) : undefined;
    const sourced = lines.filter((m) => m.install?.source);
    const previous = named ?? fromSource ?? (!given && sourced.length === 1 ? sourced[0] : undefined);
    if (!given && !previous && sourced.length > 1) throw new Error(`which of ${this.#spaceName(project)}'s artifacts? (${sourced.map((m) => `${m.app}, from ${m.install!.source!.ref}`).join('; ')}), or a new source`);
    const ref = given || previous?.install?.source?.ref || '';
    if (!ref) throw new Error("where does the release come from? (what its provider understands: a repository's owner/name, say)");
    const known = previous?.install?.source;
    return { ref, ...(known && known.ref.toLowerCase() === ref.toLowerCase() ? { provider: known.provider } : {}), ...(previous ? { previous } : {}) };
  }

  /** The releases one of a project's artifacts could publish (or a new source), as its provider sees them, in its words. */
  async artifactReleases(input: { project: string; artifact?: string; source?: string }): Promise<AppReleases> {
    const project = this.#project(input.project);
    const from = this.#releaseLine(project, input);
    return (await this.#services.askProvider(project, 'releases', { source: from.ref }, undefined, from.provider)) as unknown as AppReleases;
  }

  /** Before artifact lines: the releases of a project's one app. */
  async appReleases(ref: string): Promise<AppReleases> {
    return this.artifactReleases({ project: ref });
  }

  // ---------------------------------------------------------------- app API

  // ---------------------------------------------------------------- fetching a release

  /**
   * Publish a GitHub release as the project's artifact (maintainers): asked of the project's provider (github-releases),
   * which reads it, fingerprints its files and publishes it with its own access. Nobody's GitHub sign-in is needed.
   */
  async releaseArtifact(input: { project: string; tag: string; artifact?: string; source?: string; assets?: Record<string, string>; announce?: boolean; as?: string }): Promise<AppManifest> {
    if (input.as) this.#agentMay(input.as, KIND_SERVICE_REQUEST);
    const project = this.#project(input.project);
    this.#maintainerState(project);
    const from = this.#releaseLine(project, input);
    const data = (await this.#services.askProvider(project, 'publish', { source: from.ref, tag: input.tag.trim(), ...(input.assets && Object.keys(input.assets).length ? { assets: input.assets } : {}), ...(from.previous ? { previous: from.previous as unknown as Json } : {}) }, input.as, from.provider)) as { id?: string; manifest?: unknown };
    const manifest = parseManifest(data.manifest);
    // Offered: said in the project's chat, as a card to get it from (unless announce is false).
    if (input.announce !== false && data.id) await this.#announce(project.id, { kind: 'release', id: data.id }, `${manifest.name} ${manifest.install?.tag ?? input.tag} is available`);
    return manifest;
  }

  /** Before artifact lines: releasing a project's app (repo: where from). */
  async releaseApp(input: { project: string; tag: string; repo?: string; artifact?: string; assets?: Record<string, string>; as?: string }): Promise<AppManifest> {
    const { repo, ...rest } = input;
    return this.releaseArtifact({ ...rest, ...(repo ? { source: repo } : {}) });
  }

  async releaseService(input: { project: string; image: string; as?: string }): Promise<AppManifest> {
    if (input.as) this.#agentMay(input.as, KIND_APP);
    const project = this.#project(input.project);
    this.#maintainerState(project);
    const given = input.image.trim();
    const colon = given.lastIndexOf(':');
    const [ref, tag] = colon > given.lastIndexOf('/') ? [given.slice(0, colon), given.slice(colon + 1)] : [given, ''];
    if (!tag || !IMAGE_REF.test(ref)) throw new Error('which image? its name and tag, like ghcr.io/you/service:1.0 (Weave pins the tag to its digest)');
    // A public image: Weave signs in nowhere, and those who install it pull it the same way.
    const options = { fetch: this.containerSetup.fetch };
    const { digest } = await imageDigest(ref, [tag], options);
    const checked = checkServiceLabel((await imageLabels(ref, digest, options))[SERVICE_LABEL]);
    if (!checked.manifest) throw new Error(`${ref}:${tag} isn't a Weave service: ${checked.problems.join('; ')}`);
    const manifest = parseManifest({ ...checked.manifest, start: { image: ref }, install: { tag, image: { ref, tag, digest, packaged: true } } });
    const item = await this.publish({ kind: KIND_APP, body: manifest as unknown as Json, space: project.id, as: input.as });
    await this.#announce(project.id, { kind: 'release', id: item.id }, `${manifest.name} ${tag} is available`);
    return manifest;
  }

  /** A project's artifact lines: the latest description a maintainer published of each artifact (by its id), oldest line first. */
  #lines(project: StoredSpace): Map<string, AppManifest> {
    const state = this.#state(project);
    const lines = new Map<string, AppManifest>();
    for (const e of this.#entries(project)) {
      if (e.kind !== KIND_APP || !state.maintainers.has(e.event.author)) continue;
      try {
        const m = parseManifest(e.body);
        lines.set(m.app, m);
      } catch {
        // a malformed description is ignored; the one before stays
      }
    }
    return lines;
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
    // A service shows by its own name ("martl · files"), like any agent.
    return grant?.role === 'agent' ? grant.name?.replace(SERVICE_PREFIX, '') : undefined;
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
    this.replica.write(this.identity, sealFor(this.#cipher(group), { kind: KIND_MEMBERSHIP, body: { member, until } }));
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
      this.replica.write(this.identity, sealFor(this.#cipher(group), { kind: KIND_MEMBERSHIP, body: { member: record.member, until: grantUntil(new Date(now), 1, until) } }));
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
      for (const member of expired) this.replica.write(this.identity, sealFor(this.#cipher(space), { kind: KIND_REMOVE, body: { member, upTo: this.#upTo(member), at: this.#anchor(member, space) } }));
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
      if (this.#state(project).maintainers.has(s.issuer)) return [{ ...s, project: { id: project.id, name: project.name, checked: true } }];
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
    return !!space && canManage(this.#state(space), did);
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

  async settleShow(input: { show: string; action: 'payout' | 'refund'; split?: Array<{ to: string; share: number }> }): Promise<ShowSettlement> {
    let show = this.#showRef(input.show);
    if (!show.hosts.includes(this.identity.author)) throw new Error(`only the hosts of ${show.name} can settle it`);
    if (input.action === 'payout' && input.split?.length) {
      // Who gets what is decided after the show: the host records it on the show, then pays out by it.
      if (show.host !== this.identity.author) throw new Error(`only ${this.nameOf(show.host) ?? 'its host'} decides how ${show.name} pays out`);
      if (show.cancelled) throw new Error(`${show.name} is called off: pay everyone back instead (refund)`);
      if (Date.parse(show.ends) > this.clock()) throw new Error(`${show.name} isn't over yet: pay out after it (${show.ends})`);
      const project = show.project ? this.#spaces.get(show.project) : undefined;
      const split = input.split.map((part) => ({ to: part.to.startsWith('project:') ? part.to : this.#showRecipient(part.to, project), share: part.share }));
      if (!parseShowSplit(split)) throw new Error('a split names people or addresses with whole basis points adding up to 10000');
      const { id, host: _host, time: _time, ...rest } = show;
      this.replica.write(this.identity, { kind: KIND_SHOW, body: { show: id, ...rest, split } as unknown as Json });
      show = this.#showRef(id);
    }
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
    if (!mine && !(space && space.kind !== 'direct' && this.#state(space).maintainers.has(this.identity.author)))
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

  async openIssue(input: InProject & { title: string; text?: string; labels?: string[]; board?: string; prompt?: string }): Promise<IssueInfo> {
    if (!input.title?.trim()) throw new Error('an issue needs a title');
    const project = this.#project(input.project);
    const body: Record<string, Json> = { title: input.title.trim(), text: input.text ?? '', labels: input.labels ?? [] };
    if (input.board) body.board = input.board;
    if (input.prompt?.trim()) body.prompt = input.prompt.trim();
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
      this.replica.write(this.identity, sealFor(this.#cipher(space), { kind: KIND_INVITE_CLOSE, body: { invite: b.invite, joined } }));
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

  /** A did:key, a person's address (personUrl), or the name of someone whose profile this node has seen or who is in your address book. */
  resolve(who: string): Did {
    if (isDid(who)) return who;
    const key = personTargetOf(who);
    if (key) {
      const known = new Set([this.identity.author, ...this.replica.events((e) => e.kind === KIND_PROFILE).map((e) => e.author), ...this.#contacts().keys()]);
      const found = [...known].filter((did) => personKeyOf(did).startsWith(key));
      if (found.length === 0) throw new Error(`nobody with that address (${key}) is known here yet`);
      if (found.length > 1) throw new Error(`several people start with ${key} — use their did:key`);
      return found[0];
    }
    const matches = new Set<Did>();
    for (const event of this.replica.events((e) => e.kind === KIND_PROFILE)) {
      const name = (event.body as { name?: unknown } | null)?.name;
      if (typeof name === 'string' && name.toLowerCase() === who.toLowerCase()) matches.add(event.author);
    }
    for (const [did, name] of this.#contacts()) if (name?.toLowerCase() === who.toLowerCase()) matches.add(did);
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
  async #noticeFor(item: FeedItem, anyAge = false): Promise<Notice | undefined> {
    const notice = await this.#noticeOf(item, anyAge);
    if (!notice) return undefined;
    // Who and which board, for the rules that say what counts where (see the app's notify.tsx).
    const stored = notice.open.space && this.#spaces.get(notice.open.space.id);
    const board = stored && notice.open.post ? this.#spacePosts(stored).posts.find((p) => p.id === notice.open.post)?.board : undefined;
    return { ...notice, from: item.author, ...(board ? { board } : {}) };
  }

  async #noticeOf(item: FeedItem, anyAge = false): Promise<Notice | undefined> {
    const me = this.identity.author;
    if (item.author === me || item.private || (!anyAge && Date.now() - Date.parse(item.time) > 86_400_000)) return undefined;
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
      // Something live announced (a website opened, a version offered): news for everyone following the project.
      if (body.announce && space.kind === 'project' && !this.#homeHidden().has(space.id)) return { type: 'live', category: 'activity', title: `${who} ${snippet(text('text'))}`, text: where, open };
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

  /** Notices worked out per event (or none), for hint services: an event's notice doesn't change once it's here. */
  #heldNoticeCache = new Map<string, Notice | null>();

  /**
   * The notices for you in the events this node holds since a time (any age, unlike notifications), oldest first:
   * what hint services that read weave.notice fold (Unread counts them).
   */
  async #heldNotices(since: string): Promise<HeldNotice[]> {
    const kinds = new Set([KIND_MSG, KIND_REPLY, KIND_POST, KIND_ISSUE, KIND_PROPOSAL, KIND_KNOCK, KIND_BADGE, KIND_BADGE_TRANSFER, KIND_MEMBERSHIP_REQUEST]);
    const me = this.identity.author;
    const hidden = this.#hiddenAuthors();
    const out: HeldNotice[] = [];
    for (const d of this.#decodeAll()) {
      if (d.private || !kinds.has(d.inner.kind) || d.event.author === me || hidden.has(d.event.author) || d.event.time <= since) continue;
      let notice = this.#heldNoticeCache.get(d.id);
      if (notice === undefined) {
        notice = (await this.#noticeFor(this.#toItem(d), true).catch(() => undefined)) ?? null;
        this.#heldNoticeCache.set(d.id, notice);
      }
      if (notice) out.push({ id: d.id, time: d.event.time, notice });
    }
    return out;
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
    this.replica.write(this.identity, sealFor(this.#cipher(space), { kind: KIND_MAINTAINER, body: { member, on, ...(on ? {} : { upTo: this.#upTo(member), at: this.#anchor(member, space) }) } }));
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
    // A company's node signs in to its key service with a Vault token or an Azure app's secret (or token), from its environment;
    // people sign in with their company account.
    const env = process.env;
    return providerFor(
      setting.provider as unknown as ProviderSpec,
      this.home,
      this.kmsCredentials ?? {
        ...envCredentials(env),
        idToken: () => this.#ssoToken(),
        delegated: (scope) => this.#delegated(scope),
      },
    );
  }

  /** The person's latest company sign-in (stage 6.3); none yet. */
  #ssoToken(): string | undefined {
    return this.#sso()?.idToken;
  }

  /** Access tokens for other resources, issued to this person from their sign-in (stage 14), until they run out. */
  #delegatedTokens = new Map<string, { token: string; until: number }>();

  /** An access token for a resource (Azure Key Vault), as this person: from their sign-in's refresh token. */
  async #delegated(scope: string): Promise<string | undefined> {
    const kept = this.#delegatedTokens.get(scope);
    if (kept && kept.until > Date.now()) return kept.token;
    const sso = this.#sso();
    if (!sso?.refreshToken || !sso.issuer || !sso.clientId) return undefined;
    const fresh = await delegatedToken({ issuer: sso.issuer, clientId: sso.clientId }, sso.refreshToken, scope);
    // Entra may hand out a new refresh token with it: keep the newest.
    if (fresh.refreshToken && fresh.refreshToken !== sso.refreshToken) this.#saveSso({ ...sso, refreshToken: fresh.refreshToken });
    this.#delegatedTokens.set(scope, { token: fresh.accessToken, until: fresh.expires });
    return fresh.accessToken;
  }

  /** The company sign-in kept here (sealed at rest): the ID token, and what renews it (stage 13). */
  #sso(): Sso | undefined {
    return readSecretJson<Sso>(this.home, joinPath(this.home.dir, 'sso.json'));
  }

  #saveSso(sso: Sso): void {
    writeSecretJson(this.home, joinPath(this.home.dir, 'sso.json'), sso);
  }

  #signInProblem?: string;

  /** The company group this company account belongs to (not the company's own node). */
  #myCompanyGroup(): StoredSpace | undefined {
    const here = this.#companyHere();
    return here && here.group.founder !== this.identity.author ? here.group : undefined;
  }

  /**
   * Keep a company account signed in (stage 13): renew the ID token with the
   * refresh token before it runs out, and sign in to the company again before
   * its vouching (24 hours) runs out, so nobody has to.
   */
  async #renewSignIn(): Promise<number> {
    const sso = this.#sso();
    if (!sso?.idToken) return 0;
    const now = this.clock();
    let changed = 0;
    if (sso.refreshToken && sso.issuer && sso.clientId && (sso.expires ?? 0) - now < 10 * 60_000) {
      try {
        const fresh = await refreshSignIn({ issuer: sso.issuer, clientId: sso.clientId }, sso.refreshToken);
        Object.assign(sso, fresh);
        this.#saveSso(sso);
        this.#signInProblem = undefined;
        changed++;
      } catch (error) {
        this.#signInProblem = (error as Error).message;
        return changed;
      }
    }
    const group = this.#myCompanyGroup();
    if (!group || (sso.expires ?? 0) <= now || !this.#state(group).members.has(this.identity.author)) return changed;
    const vouched = this.#attestations(group, group.founder).get(this.identity.author);
    const lastSignIn = this.#decodedIn(group.id).filter((d) => d.inner.kind === KIND_SIGNIN && d.event.author === this.identity.author).at(-1)?.event.time ?? '';
    const soon = new Date(now + 6 * 3_600_000).toISOString();
    const hourAgo = new Date(now - 3_600_000).toISOString();
    if ((!vouched || vouched.until < soon) && lastSignIn < hourAgo) {
      await this.signIn({ space: group.id, idToken: sso.idToken });
      changed++;
    }
    return changed;
  }

  /** Sign in with your company account again, in the browser (when renewing stopped working, or to switch accounts). */
  async companySignIn(): Promise<SignInStatus> {
    const group = this.#myCompanyGroup();
    const here = this.#companyHere();
    const sso = this.#sso();
    const config = sso?.issuer && sso.clientId ? { issuer: sso.issuer, clientId: sso.clientId } : here?.org.signIn;
    if (!group || !config) throw new Error("this isn't a company account, or its company hasn't said where to sign in");
    const tokens = await browserSignIn(config, openInBrowser, { for: this.identity.author, ...(claimsOf(sso?.idToken ?? '').email ? { loginHint: claimsOf(sso!.idToken).email! } : {}) });
    this.#saveSso({ ...tokens, ...config });
    this.#signInProblem = undefined;
    await this.signIn({ space: group.id, idToken: tokens.idToken, ...(tokens.salt ? { salt: tokens.salt } : {}) });
    return this.signInStatus();
  }

  async signInStatus(): Promise<SignInStatus> {
    const here = this.#companyHere();
    const group = this.#myCompanyGroup();
    if (!here || !group) return { company: false };
    const sso = this.#sso();
    const vouched = this.#attestations(group, group.founder).get(this.identity.author);
    const claims = claimsOf(sso?.idToken ?? '');
    return {
      company: true,
      name: this.nameOf(here.group.founder) ?? here.group.name,
      ...(claims.email ? { account: claims.email } : {}),
      ...(sso?.expires ? { tokenUntil: new Date(sso.expires).toISOString() } : {}),
      renews: !!sso?.refreshToken,
      ...(vouched ? { vouchedUntil: vouched.until } : {}),
      ...(this.#signInProblem ? { problem: this.#signInProblem } : {}),
    };
  }

  /** Per space, its managed setting and halves: built once, kept up to date as events come, dropped when its keys change. */
  #rawCache = new Map<string, ManagedRaw>();

  /**
   * A space's managed setting and wrapped company halves, read straight from
   * its events with the Weave half alone (that's how they're sealed): what
   * unlocks a space can't need the space unlocked, nor decoding, which needs
   * this. Kept until the next event arrives.
   */
  #managedRaw(space: StoredSpace): ManagedRaw {
    const kept = this.#rawCache.get(space.id);
    if (kept) return kept;
    const scope = spaceScope(space);
    const out: ManagedRaw = { parts: new Map() };
    for (const r of this.replica.events((e) => e.scope === scope && e.kind === KIND_SEALED && !e.missing)) this.#takeRaw(space, out, r);
    this.#rawCache.set(space.id, out);
    return out;
  }

  /** One event of a space, for its managed setting and halves (only those sealed with the Weave half open here). */
  #takeRaw(space: StoredSpace, into: ManagedRaw, r: WeaveRecord): boolean {
    const inner = openIn(space, r);
    if (!inner || (inner.kind !== KIND_MANAGED && inner.kind !== KIND_KMS)) return false;
    const b = inner.body as Record<string, unknown> | null;
    if (inner.kind === KIND_MANAGED && r.author === space.founder && b?.provider && Number(b.ttlMinutes) > 0 && Number(b.graceHours) >= 0 && (!into.setting || r.time >= into.setting.time))
      into.setting = { provider: b.provider as Json, ttlMinutes: Number(b.ttlMinutes), graceHours: Number(b.graceHours), ...(isDid(b.attestor) ? { attestor: b.attestor } : {}), ...(typeof b.company === 'string' ? { company: b.company } : {}), ...(Number.isSafeInteger(b.from) ? { from: b.from as number } : {}), by: r.author, time: r.time };
    if (inner.kind === KIND_KMS && Number.isSafeInteger(b?.epoch) && typeof b?.wrapped === 'string') {
      // Every author's part kept apart: which counts is decided by whose rekey we seal with (#kmsParts).
      let byAuthor = into.parts.get(b.epoch as number);
      if (!byAuthor) into.parts.set(b.epoch as number, (byAuthor = new Map()));
      if (!byAuthor.has(r.author)) byAuthor.set(r.author, b.wrapped);
    }
    return true;
  }

  /**
   * Each epoch's company half (WUCPqIBs): the one by whoever made the rekey we
   * seal with, else the owner's, else the first. A part from anyone else (any
   * member can seal one with the Weave half) never stands in for it.
   */
  #kmsParts(space: StoredSpace): Map<number, string> {
    const out = new Map<number, string>();
    for (const [epoch, byAuthor] of this.#managedRaw(space).parts) {
      const rekeyer = space.rekeyers?.[String(epoch)];
      const part = rekeyer ? byAuthor.get(rekeyer) : (byAuthor.get(space.founder) ?? byAuthor.values().next().value);
      if (part) out.set(epoch, part);
    }
    return out;
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
    // From which epoch on the company's half is needed (yHsKySEi): the setting says, or (settings from before) the first epoch with one.
    const from = setting.from ?? (parts.size ? Math.min(...parts.keys()) : Infinity);
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
      } else if (!memory && Number(epoch) < from) keys[epoch] = weavePart; // from before the space was managed
      else locked = true;
    }
    if (locked) void this.#unlock(space);
    // The newest epoch locked: it stays the newest, without a key, so writing waits for it (sealFor refuses) instead of using an older one.
    const newest = String(currentEpoch(space));
    if (!(newest in keys)) keys[newest] = undefined as unknown as string;
    return { ...space, keys };
  }

  /** A space's keys to write with: a managed space's newest epoch unlocked first, if it can be (else sealFor refuses to write). */
  async #cipherReady(space: StoredSpace): Promise<StoredSpace> {
    const cipher = this.#cipher(space);
    if (cipher.keys[String(currentEpoch(cipher))]) return cipher;
    await this.#unlock(space);
    return this.#cipher(space);
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
    let problem: string | undefined;
    try {
      const provider = this.#provider(setting);
      const now = this.clock();
      for (const [epoch, wrapped] of this.#kmsParts(space)) {
        const weavePart = space.keys[String(epoch)];
        const kept = this.#managedKeys.get(`${space.id}:${epoch}`);
        if (!weavePart || (kept && kept.until > now)) continue;
        // Each epoch on its own: one that can't be unwrapped doesn't keep the others locked (WUCPqIBs).
        try {
          const kmsPart = await provider.unwrap(wrapped, { space: spaceScope(space), epoch });
          this.#remember(space, setting, epoch, this.#splitKey(space, epoch, weavePart, kmsPart));
          unlocked++;
        } catch (error) {
          problem = `key ${epoch}: ${(error as Error).message}`;
        }
      }
    } catch (error) {
      problem = (error as Error).message;
    }
    if (problem) this.#managedProblems.set(space.id, problem);
    else this.#managedProblems.delete(space.id);
    if (unlocked) this.#decoded = undefined;
    return unlocked;
  }

  /** After a rekey in a managed space: a fresh company half, wrapped by the provider and published. */
  #afterRekey(space: StoredSpace, epoch: number, weavePart: string): void {
    const setting = this.#managedRaw(space).setting;
    if (!setting) return;
    const kmsPart = new Uint8Array(randomBytes(32));
    (space.rekeyers ??= {})[String(epoch)] = this.identity.author;
    this.#saveSpace(space);
    this.#remember(space, setting, epoch, this.#splitKey(space, epoch, weavePart, kmsPart));
    this.#halves.set(`${space.id}:${epoch}`, { space, epoch, kmsPart });
    this.#saveHalves();
    void this.#publishHalf(`${space.id}:${epoch}`);
  }

  /**
   * Halves not published yet, kept on disk (sealed at rest) so that a restart
   * doesn't lose them (AsPMzM8O): without its half nobody else ever reads that
   * epoch, and after the grace not even we.
   */
  #saveHalves(): void {
    const file = joinPath(this.home.dir, 'managed-halves.json');
    const out: Record<string, { space: string; epoch: number; kmsPart: string }> = {};
    for (const [id, h] of this.#halves) out[id] = { space: h.space.id, epoch: h.epoch, kmsPart: b64u.encode(h.kmsPart) };
    writeSecretJson(this.home, file, out);
  }

  #loadHalves(): void {
    const saved = readSecretJson<Record<string, { space: string; epoch: number; kmsPart: string }>>(this.home, joinPath(this.home.dir, 'managed-halves.json')) ?? {};
    for (const [id, h] of Object.entries(saved)) {
      const space = this.#spaces.get(h.space);
      const setting = space && this.#managedRaw(space).setting;
      const weavePart = space?.keys[String(h.epoch)];
      if (!space || !setting || !weavePart) continue;
      const kmsPart = b64u.decode(h.kmsPart);
      this.#halves.set(id, { space, epoch: h.epoch, kmsPart });
      // Ours to read with meanwhile, as before the restart.
      if (!this.#managedKeys.has(id)) this.#remember(space, setting, h.epoch, this.#splitKey(space, h.epoch, weavePart, kmsPart));
    }
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
        this.#saveHalves();
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

  /**
   * The company someone belongs to, as far as this node can tell (MHV79Ro6):
   * the one their identity names, if that company has them in its company
   * group. Anyone can name a company in their identity; only the company puts
   * them in its group. A bare claim counts only for what it costs the claimant
   * (the company may freeze them; its policy holds them).
   */
  #companyVouchedOf(did: Did): Did | undefined {
    const claim = this.#companyClaim(did);
    return claim?.vouched ? claim.org : undefined;
  }

  /** The company someone's identity names, and whether it vouches for them as far as this node sees: yes, no (we hold its group), or can't tell. */
  #companyClaim(did: Did): { org: Did; vouched?: boolean } | undefined {
    const org = this.replica.authority.keys(did).org;
    if (!org) return undefined;
    // A freeze by that company is its word too: it held them.
    if (this.replica.authority.frozen(did)) return { org, vouched: true };
    const groups = [...this.#spaces.values()].filter((s) => s.kind === 'group' && s.founder === org && !!this.#orgOf(s));
    if (!groups.length) return { org };
    return { org, vouched: groups.some((g) => this.#state(g).members.has(did)) };
  }

  async createCompany(input: CreateCompanyInput): Promise<CompanyInfo> {
    if (this.#companyGroups().length) throw new Error('this node already runs a company');
    if (!input.admins?.trim()) throw new Error("name the sign-in group of the company's admins");
    if (!input.issuer || !input.audience) throw new Error("the company's sign-in: its issuer and the audience its tokens name");
    const group = await this.#createSpace('group', input.name);
    this.config = { ...this.config, attestor: { issuer: input.issuer, audience: input.audience, ...(input.hours ? { hours: input.hours } : {}) } };
    saveConfig(this.home, this.config);
    await this.manageSpace({ space: group.id, provider: input.provider as ProviderSpec, ttlMinutes: input.ttlMinutes, graceHours: input.graceHours, attestor: this.identity.author, company: group.id });
    this.replica.write(this.identity, sealFor(this.#cipher(group), { kind: KIND_ORG_SETTINGS, body: { admins: input.admins.trim(), links: true, signIn: { issuer: input.issuer, clientId: input.audience } } }));
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
      ...(org.auditors ? { auditors: org.auditors } : {}),
      ...(org.helpdesk ? { helpdesk: org.helpdesk } : {}),
      links: org.links,
      policy: org.policy,
      retention: org.retention,
      spaceRetention: org.spaceRetention,
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
    const signIn = here.org.signIn ?? (this.config.attestor ? { issuer: this.config.attestor.issuer, clientId: this.config.attestor.audience } : undefined);
    return encodeEnrollment({ v: 1, company, name: this.nameOf(company) ?? here.group.name, group: here.group.id, invite, entry: { topics: [company], bootstrap: this.config.bootstrap }, ...(signIn ? { signIn } : {}) });
  }

  /**
   * An invitation by email (stage 14): a new enrollment link, sent through the company's mail server
   * (WEAVE_SMTP_URL). It points at the console's join page, which opens Weave with the link.
   */
  async inviteByEmail(input: { to: string; by?: string; days?: number }): Promise<{ to: string; joinUrl: string }> {
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(input.to)) throw new Error(`${input.to} isn't an email address`);
    const server = mailServer();
    if (!server) throw new Error("give the company's node its mail server first (WEAVE_SMTP_URL, and WEAVE_SMTP_FROM)");
    const base = this.#console?.url ?? process.env.WEAVE_PUBLIC_URL;
    if (!base) throw new Error('the invitation points at the admin console: turn it on first (weave company console on)');
    const link = await this.enrollLink(input.days ? { days: input.days } : {});
    const joinUrl = `${base.replace(/\/$/, '')}/join#${link}`;
    const company = (await this.company())?.name ?? 'your company';
    await sendMail(server, invitationMail({ to: input.to, company, joinUrl, link, ...(input.by ? { by: input.by } : {}) }));
    return { to: input.to, joinUrl };
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
        // The company's retention, or one project's or group's own (stage 15).
        const forSpace = action.retention?.space ? companySpace(action.retention.space) : undefined;
        const spaceRetention: Record<string, Retention> = { ...org.spaceRetention };
        const retention: Retention = forSpace ? { ...(org.spaceRetention[forSpace.id] ?? {}) } : { ...org.retention };
        for (const key of ['minDays', 'maxDays'] as const) {
          const days = action.retention?.[key];
          if (days === null) delete retention[key];
          else if (days !== undefined) {
            if (!Number.isFinite(days) || days <= 0 || days > 36_500) throw new Error('retention is a number of days above 0');
            retention[key] = days;
          }
        }
        if (retention.minDays && retention.maxDays && retention.minDays > retention.maxDays) throw new Error('the minimum is longer than the maximum');
        if (forSpace) {
          if (retention.minDays || retention.maxDays) spaceRetention[forSpace.id] = retention;
          else delete spaceRetention[forSpace.id];
        }
        const role = (value: string | null | undefined, now: string | undefined) => (value === null ? null : value?.trim() || now || null);
        let deviceCA = org.deviceCA ?? null;
        if (action.deviceCA === null) deviceCA = null;
        else if (action.deviceCA !== undefined) {
          checkAuthority(action.deviceCA);
          deviceCA = action.deviceCA;
        }
        write(KIND_ORG_SETTINGS, {
          admins: action.admins?.trim() || org.admins || null,
          auditors: role(action.auditors, org.auditors),
          helpdesk: role(action.helpdesk, org.helpdesk),
          ...policy,
          retention: (forSpace ? org.retention : retention) as unknown as Json,
          spaceRetention: spaceRetention as unknown as Json,
          deviceCA,
          ...(org.signIn ? { signIn: org.signIn } : {}),
        });
        // Published, so every node holds the company's accounts to it (and counts their links only while allowed).
        // With the last number of each company account's keys it holds: what they sign past it is held to the policy, whatever date it claims.
        if (JSON.stringify(policy) !== JSON.stringify(org.policy)) this.replica.write(this.identity, { kind: KIND_ORG_POLICY, body: { ...policy, from: this.#companyKeysUpTo() } });
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
            this.replica.write(this.identity, sealFor(this.#cipher(space), { kind: KIND_MAINTAINER, body: { member: did, on: false, upTo: this.#upTo(did), at: this.#anchor(did, space) } }));
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
      for (const space of [group, ...this.#companySpaces(group)]) {
        const maxDays = (org.spaceRetention[space.id] ?? org.retention).maxDays;
        if (maxDays) changed += await this.#shredOlder(space, maxDays);
      }
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

  /** A company space's retention, from its company group: its own if the company gave it one (stage 15), else the company's. */
  #companyRetention(space: StoredSpace): Retention | undefined {
    const company = this.#managedRaw(space).setting?.company;
    const group = company ? this.#spaces.get(company) : this.#orgOf(space) ? space : undefined;
    const org = group ? this.#orgOf(group) : undefined;
    return org ? (org.spaceRetention[space.id] ?? org.retention) : undefined;
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
  #policyCache?: Map<Did, CompanyPolicy & { time: string; from?: Map<Did, number> }>;

  /** The last number of every key of this company's accounts that this (the company's) node holds. */
  #companyKeysUpTo(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const signer of this.replica.signers()) {
      const person = this.replica.authority.personOf(signer);
      if (person === this.identity.author || this.replica.authority.keys(person).org !== this.identity.author) continue;
      out[signer] = this.replica.number(signer);
    }
    return out;
  }

  #policies(): Map<Did, CompanyPolicy & { time: string; from?: Map<Did, number> }> {
    if (!this.#policyCache) {
      this.#policyCache = new Map();
      for (const r of this.replica.events((e) => e.kind === KIND_ORG_POLICY && e.scope === 'public')) this.#takePolicy(r);
    }
    return this.#policyCache;
  }

  #takePolicy(r: { author: Did; time: string; body: Json }): void {
    const before = this.#policyCache!.get(r.author);
    const from = (r.body as { from?: unknown } | null)?.from;
    const upTo = from && typeof from === 'object' && !Array.isArray(from) ? new Map(Object.entries(from as Record<string, unknown>).filter((e): e is [Did, number] => isDid(e[0]) && Number.isSafeInteger(e[1]))) : undefined;
    if (!before || before.time <= r.time) this.#policyCache!.set(r.author, { ...readPolicy(r.body), time: r.time, ...(upTo ? { from: upTo } : {}) });
  }

  /** A company account's company policy, if its company published one. */
  #policyOf(person: Did): { org: Did; policy: CompanyPolicy & { time: string; from?: Map<Did, number> } } | undefined {
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
   * when it was published: refused by its own node when writing and by every
   * node when receiving. Leaving, identity and keys are always allowed. "From
   * when" is by number where the policy names them (what each key had signed by
   * then), so backdating doesn't get past it; by time for older policies.
   */
  #policyRefuses(event: { author: Did; signer?: Did; n?: number; space: string; kind: string; time: string }, body: Json | undefined): string | undefined {
    const found = this.#policyOf(event.author);
    if (!found || ALWAYS_ALLOWED.has(event.kind)) return undefined;
    const from = found.policy.from;
    const earlier = from && event.signer && event.n !== undefined ? event.n <= (from.get(event.signer) ?? 0) : event.time < found.policy.time;
    if (earlier) return undefined;
    const { org, policy } = found;
    const who = this.nameOf(org) ?? 'The company';
    const colleague = (did: Did) => did === org || this.#companyVouchedOf(did) === org;
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
      if (policy.chats && other !== org && colleague(other)) return `${who} keeps chats between colleagues in company chats (weave company chat <colleague>)`;
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
    if (pending.idToken && this.#sso()?.idToken !== pending.idToken) this.#saveSso({ ...(this.#sso() ?? {}), idToken: pending.idToken, salt: pending.salt, expires: (claimsOf(pending.idToken).exp ?? 0) * 1000 });
    await this.#unlock(group);
    if (this.#managedProblems.has(group.id)) return 0;
    if (!pending.joined) {
      this.replica.write(this.identity, sealFor(this.#cipher(group), { kind: KIND_JOIN, body: { invite: pending.invite, ...(pending.proof ? { proof: pending.proof } : {}) } }));
      pending.joined = true;
      changed++;
    }
    if (pending.idToken) {
      await this.signIn({ space: group.id, idToken: pending.idToken, ...(pending.salt ? { salt: pending.salt } : {}) });
      delete pending.idToken;
      delete pending.salt;
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
      const claim = this.#companyClaim(other);
      const org = claim && claim.vouched !== false ? claim.org : undefined;
      const space = mine?.space ?? theirs?.space;
      out.push({
        did: other,
        name: this.nameOf(other),
        state: refused ? 'refused' : mine?.on && theirs?.on ? 'linked' : mine?.on ? 'waiting' : 'asked',
        since: [mine?.on ? mine.time : '', theirs?.on ? theirs.time : ''].sort().at(-1)!,
        ...(until ? { until } : {}),
        ...(org ? { company: { did: org, name: this.nameOf(org), ...(claim?.vouched ? {} : { unconfirmed: true as const }) } } : {}),
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
  async setScim(input: { on: boolean; port?: number; invite?: boolean }): Promise<ScimInfo> {
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
    if (input.invite && !mailServer()) throw new Error("to send invitations, give the company's node its mail server (WEAVE_SMTP_URL)");
    this.config = { ...this.config, scim: { port: input.port ?? this.config.scim?.port ?? 7720, ...((input.invite ?? this.config.scim?.invite) ? { invite: true } : {}) } };
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
      ...(this.config.scim?.invite ? { invite: true } : {}),
      users: Object.values(directory.users).map((u) => {
        const did = vouched.get(u.externalId ?? '') ?? vouched.get(u.userName);
        return { userName: u.userName, ...(u.displayName ? { displayName: u.displayName } : {}), active: u.active, groups: groupsOf(directory, u.id), ...(did ? { did, name: this.nameOf(did) } : {}) };
      }),
      groups: Object.values(directory.groups).map((g) => ({ name: g.displayName, members: g.members.length })),
    };
  }

  /** Start what the company's node serves (SCIM, the admin console), as configured. The daemon calls it. */
  async startServices(): Promise<void> {
    if (this.config.standby) return;
    if (this.config.scim) await this.#startScim().catch((error: Error) => console.error(`weave: SCIM couldn't start: ${error.message}`));
    if (this.config.console) await this.#startConsole().catch((error: Error) => console.error(`weave: the admin console couldn't start: ${error.message}`));
  }

  // ---------------------------------------------------------------- services: code you run under keys of their own

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

  /**
   * A backup of this home (stage 14): its files, and a consistent copy of its database, into an empty folder.
   * With the home key in the company's key service it opens only with access to it; otherwise the backup
   * carries what opens it (a file keystore) or opens only on this computer (DPAPI, Keychain): the result says.
   */
  async backup(input: { to: string }): Promise<{ to: string; files: number; bytes: number; keystore: Keystore; note?: string }> {
    const to = resolvePath(input.to);
    if (existsSync(to) && readdirSync(to).length) throw new Error(`${to} isn't empty`);
    mkdirSync(to, { recursive: true });
    let files = 0;
    let bytes = 0;
    const skip = new Set(['weave.db', 'weave.db-wal', 'weave.db-shm', 'node.lock', 'daemon.json']);
    const copy = (from: string, into: string) => {
      for (const entry of readdirSync(from, { withFileTypes: true })) {
        if (skip.has(entry.name) && from === this.home.dir) continue;
        const source = joinPath(from, entry.name);
        const target = joinPath(into, entry.name);
        if (entry.isDirectory()) {
          mkdirSync(target, { recursive: true });
          copy(source, target);
        } else {
          cpSync(source, target);
          files++;
          bytes += statSync(source).size;
        }
      }
    };
    copy(this.home.dir, to);
    if (this.#sqlite) {
      this.#sqlite.snapshot(joinPath(to, 'weave.db'));
      files++;
      bytes += statSync(joinPath(to, 'weave.db')).size;
    }
    const keystore = vaultOf(this.home).keystore;
    const note =
      keystore === 'kms'
        ? undefined
        : keystore === 'file'
          ? "this backup carries the key that opens it (vault.json): keep it as safe as the server, or move the home key to the company's key service"
          : `this backup opens only on this computer, as this user (${keystore})`;
    return { to, files, bytes, keystore, ...(note ? { note } : {}) };
  }

  /** Where this computer can keep the home key (stage 17). */
  async keystores(): Promise<Array<{ keystore: Keystore; name: string; ready: boolean; why?: string; current: boolean }>> {
    const current = vaultOf(this.home).keystore;
    const here = keystoresHere();
    if (!here.some((k) => k.keystore === current)) here.unshift({ keystore: current, name: current, ready: true });
    return here.map((k) => ({ ...k, current: k.keystore === current }));
  }

  /** Keep the home key somewhere else (stage 17): the same key, so nothing else changes. */
  async moveHomeKey(input: { to: 'os' | Exclude<Keystore, 'kms'> }): Promise<{ from: Keystore; to: Keystore }> {
    return moveHomeKey(this.home, input.to);
  }

  async consoleOperatorLink(): Promise<string> {
    if (!this.#console) throw new Error('the admin console is off (weave company console on)');
    return this.#console.operatorLink();
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
    return this.consoleRole(claims) === 'admin';
  }

  /**
   * What the person behind this company sign-in may do in the console (stage 15), by their sign-in groups
   * (the directory's when SCIM is on): admins everything, auditors read everything, the helpdesk sets people up.
   */
  /** Signing nothing: a standby, or a server a newer one took over from. */
  #refuseWrites(): void {
    const refuse = () => {
      throw new Error('this is a standby server: it follows the active one and writes nothing (weave-server promote, once the active one is gone)');
    };
    this.replica.write = refuse;
    this.replica.append = refuse;
    this.replica.append2 = refuse;
  }

  /** A server of this identity of a newer generation than ours: we stand down, as a standby. */
  #seeGeneration(event: { body: Json }): void {
    const generation = (event.body as { generation?: unknown } | null)?.generation;
    if (!Number.isSafeInteger(generation) || (generation as number) <= (this.config.generation ?? 0) || this.config.standby) return;
    this.config = { ...this.config, standby: true };
    saveConfig(this.home, { ...loadConfig(this.home), standby: true });
    this.#refuseWrites();
    console.warn(`weave: a newer server of this identity took over (generation ${generation}): this one is a standby now and writes nothing`);
  }

  /** Is this person (name or did) one of the company's admins, or the company itself? */
  isCompanyAdmin(who: string): boolean {
    const here = this.#companyHere();
    if (!here) return false;
    return this.#isOrgAdmin(here.group, here.org, this.resolve(who));
  }

  consoleRole(claims: { sub: string; email?: string; groups: string[] }): ConsoleRole | undefined {
    const group = this.#companyGroups()[0];
    const org = group ? this.#orgOf(group) : undefined;
    if (!org) return undefined;
    let groups = claims.groups;
    if (this.config.scim) {
      const directory = this.#scimDirectory();
      const { user, deleted } = findPerson(directory, { subject: claims.sub, email: claims.email });
      if (deleted || (user && !user.active)) return undefined;
      if (user) groups = groupsOf(directory, user.id);
    }
    if (org.admins && groups.includes(org.admins)) return 'admin';
    if (org.auditors && groups.includes(org.auditors)) return 'auditor';
    if (org.helpdesk && groups.includes(org.helpdesk)) return 'helpdesk';
    return undefined;
  }

  /**
   * The agents of the company's people, and in which of its projects and groups each may act (stage 15).
   * Agents act in a company space only once whoever manages it approves them: on the company's node, the company.
   */
  async companyAgents(): Promise<CompanyAgentInfo[]> {
    const group = this.#companyGroups()[0];
    if (!group) throw new Error('not a company node');
    const spaces = [group, ...this.#companySpaces(group)];
    const people = new Set<Did>();
    for (const space of spaces) for (const did of this.#state(space).members.keys()) people.add(did);
    const out: CompanyAgentInfo[] = [];
    for (const person of people) {
      for (const grant of this.replica.authority.grantsOf(person)) {
        if (grant.role !== 'agent') continue;
        out.push({
          did: grant.subject,
          name: grant.name ?? 'agent',
          person,
          ...(this.nameOf(person) ? { personName: this.nameOf(person) } : {}),
          spaces: spaces.filter((s) => this.#state(s).members.has(person)).map((s) => ({ id: s.id, name: s.name, approved: !!this.#state(s).approvedAgents?.has(grant.subject) })),
        });
      }
    }
    return out.sort((a, b) => `${a.personName ?? a.person}/${a.name}`.localeCompare(`${b.personName ?? b.person}/${b.name}`));
  }

  /**
   * Each person's company computer as the company last saw it (stage 15): the certificate their sign-in came with,
   * until when it's valid, or why a sign-in wasn't vouched for (no certificate, another authority, expired).
   */
  async companyDevices(): Promise<CompanyDeviceInfo[]> {
    const group = this.#companyGroups()[0];
    if (!group) throw new Error('not a company node');
    const required = !!this.#orgOf(group)?.deviceCA;
    const attested = this.#attestations(group, group.founder);
    const now = new Date(this.clock()).toISOString();
    return [...this.#state(group).members.keys()]
      .filter((did) => did !== group.founder)
      .map((did) => {
        const a = attested.get(did);
        const refused = this.#deviceRefused.get(did) ?? this.#signInRefused.get(did);
        return {
          did,
          ...(this.nameOf(did) ? { name: this.nameOf(did) } : {}),
          required,
          ...(a?.device ? { device: a.device } : {}),
          ...(a ? { vouchedUntil: a.until, vouched: a.until > now } : { vouched: false }),
          ...(refused && (!a || refused.time > a.time) ? { problem: refused.problem, problemTime: refused.time } : {}),
        };
      });
  }

  /** Record what an admin did in the console, in the company's audit. */
  async consoleRecord(what: Record<string, string>, admin: { subject: string; email?: string; role?: string }): Promise<void> {
    const group = this.#companyGroups()[0];
    if (!group) throw new Error('not a company node');
    this.replica.write(this.identity, sealFor(this.#cipher(group), { kind: KIND_ORG_CONSOLE, body: { subject: admin.subject, ...(admin.email ? { email: admin.email } : {}), ...(admin.role ? { role: admin.role } : {}), ...what } }));
  }

  /** An admin in the console: the company does it, recorded with who asked. */
  async consoleAction(action: CompanyAction, admin: { subject: string; email?: string; role?: string }): Promise<CompanyInfo> {
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
      // Someone new in the user management gets their invitation by email, if the company wants that.
      const created = response.status === 201 && req.path.startsWith('/Users') ? (response.body as { active?: boolean; userName?: string; emails?: Array<{ value: string }> }) : undefined;
      const email = created?.active === false ? undefined : (created?.emails?.[0]?.value ?? (created?.userName?.includes('@') ? created.userName : undefined));
      if (email && this.config.scim?.invite)
        void this.inviteByEmail({ to: email })
          .then(() => this.consoleRecord({ action: 'invite', email }, { subject: 'scim' }))
          .catch((error: Error) => console.error(`weave: the invitation to ${email} wasn't sent: ${error.message}`));
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

  async signIn(input: { space: string; idToken: string; salt?: string }): Promise<void> {
    const space = this.#space(input.space);
    const setting = this.#state(space).managed;
    if (!setting?.attestor) throw new Error(`${space.name} has no company sign-in`);
    const sso = this.#sso();
    // A token keeps its salt (a refreshed one too, while the company's sign-in keeps its nonce).
    const salt = input.salt ?? sso?.salt;
    // Kept for the key service too (Vault's JWT auth), sealed at rest.
    this.#saveSso({ ...(sso ?? {}), idToken: input.idToken, salt, expires: (claimsOf(input.idToken).exp ?? 0) * 1000 });
    await this.#unlock(space);
    const device = this.#deviceProof(input.idToken);
    // Who hands it in, and the salt that ties the token to them (0siqvEzB).
    const box = boxTo(this.#encryptionKeyOf(setting.attestor), { idToken: input.idToken, did: this.identity.author, ...(salt ? { salt } : {}), ...(device ? { device: device as unknown as Json } : {}) });
    // A sign-in is what lets the company's key service open its half to us, so it can't wait for it: boxed to the attestor, it goes under the newest key at hand.
    const cipher = await this.#cipherReady(space);
    const athand = { ...cipher, keys: Object.fromEntries(Object.entries(cipher.keys).filter(([, key]) => key)) };
    this.replica.write(this.identity, sealFor(athand, { kind: KIND_SIGNIN, body: { box: box as unknown as Json } }));
  }

  /** Who the attestor vouches for in a space: did → their latest attestation, while it holds or not. */
  /** Sign-ins the company didn't vouch for because of the computer they came from (stage 15): person → why, and when. */
  #deviceRefused = new Map<Did, { problem: string; time: string }>();
  /** Sign-ins the company didn't vouch for because they weren't the identity's own (0siqvEzB): person → why, and when. */
  #signInRefused = new Map<Did, { problem: string; time: string }>();

  #attestations(space: StoredSpace, attestor: Did): Map<Did, { subject: string; email?: string; groups: string[]; until: string; time: string; device?: { subject: string; serial: string; validTo?: string } }> {
    const out = new Map<Did, { subject: string; email?: string; groups: string[]; until: string; time: string; device?: { subject: string; serial: string; validTo?: string } }>();
    // A company space's people are vouched for in the company group (stage 10).
    const company = this.#managedRaw(space).setting?.company;
    for (const d of this.#decodedIn(company && this.#spaces.has(company) ? company : space.id)) {
      if (d.inner.kind !== KIND_ATTEST || d.event.author !== attestor) continue;
      const b = d.inner.body as { did?: unknown; subject?: unknown; email?: unknown; groups?: unknown; until?: unknown; device?: { subject?: unknown; serial?: unknown; validTo?: unknown } } | null;
      if (!isDid(b?.did) || typeof b?.subject !== 'string' || typeof b?.until !== 'string') continue;
      out.set(b.did, { subject: b.subject, ...(typeof b.email === 'string' ? { email: b.email } : {}), groups: Array.isArray(b.groups) ? b.groups.filter((g): g is string => typeof g === 'string') : [], until: b.until, time: d.event.time, ...(typeof b.device?.subject === 'string' && typeof b.device.serial === 'string' ? { device: { subject: b.device.subject, serial: b.device.serial, ...(typeof b.device.validTo === 'string' ? { validTo: b.device.validTo } : {}) } } : {}) });
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
        // The sign-in must be this identity's own (0siqvEzB): colleagues read the sealed sign-ins and could copy a box, and
        // whoever sees a token (the key service takes it too) could hand it in as theirs. The token's nonce names the
        // identity it was asked for; one without (a refreshed token) only renews who it vouched for already.
        const handedIn = opened as { did?: unknown; salt?: unknown };
        const salt = typeof handedIn.salt === 'string' ? handedIn.salt : undefined;
        const bound = !!salt && claims.nonce === signInNonce(d.event.author, salt);
        const renews = attested.get(d.event.author)?.subject === claims.sub;
        const now = new Date(this.clock()).toISOString();
        const taken = [...attested].some(([did, a]) => did !== d.event.author && a.subject === claims.sub && a.until > now);
        const problem =
          handedIn.did !== d.event.author ? 'this sign-in was handed in by someone else'
          : salt && claims.nonce !== undefined && !bound ? 'this sign-in was made for another identity'
          : !bound && !renews ? "this sign-in isn't tied to this identity: sign in from Weave on this computer"
          : taken ? `${claims.email ?? claims.sub} is vouched for as another identity: that one has to lapse or be removed first`
          : undefined;
        if (problem) {
          this.#signInRefused.set(d.event.author, { problem, time: d.event.time });
          continue;
        }
        this.#signInRefused.delete(d.event.author);
        // With SCIM on, the directory decides: deactivated or unknown people aren't vouched for, and its groups count (stage 12).
        let groups = claims.groups;
        if (this.config.scim) {
          const directory = this.#scimDirectory();
          // The directory decides for those it knows: deactivated or deleted aren't vouched for; the rest get its groups.
          // Those it doesn't know yet (before the first provisioning) keep their sign-in's groups.
          const { user, deleted } = findPerson(directory, { subject: claims.sub, email: claims.email });
          if (deleted || (user && !user.active)) continue;
          if (user) groups = groupsOf(directory, user.id);
        }
        // With a device authority, only sign-ins from the company's computers.
        const ca = this.#orgOf(space)?.deviceCA;
        const checked = ca ? inspectDevice((opened as { device?: unknown }).device, ca, d.event.author, opened.idToken, this.clock()) : undefined;
        if (checked && 'problem' in checked) {
          this.#deviceRefused.set(d.event.author, { problem: checked.problem, time: d.event.time });
          continue;
        }
        const device = checked?.device;
        this.#deviceRefused.delete(d.event.author);
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
  /**
   * Two people who took each other's role at once (each removal or demotion
   * not naming the other as seen): as the owner, say which came first, by the
   * order this node got them, so every node ends up alike (H7hk7X9S).
   */
  #settleLosses(): number {
    let settled = 0;
    for (const space of [...this.#spaces.values()]) {
      if (space.founder !== this.identity.author || this.#directs.has(space.id)) continue;
      const state = this.#state(space);
      if (state.founder !== this.identity.author) continue;
      for (const pair of state.unsettled ?? []) {
        this.replica.write(this.identity, sealFor(this.#cipher(space), { kind: KIND_SETTLE, body: pair }));
        settled++;
      }
    }
    return settled;
  }

  /**
   * People removed before removals named what they saw (an anchor, see
   * spaces.ts): whoever manages the space anchors them now, once, by what this
   * node holds of them. What they sign past it counts as after their removal.
   */
  #anchorRemovals(): number {
    let anchored = 0;
    for (const space of [...this.#spaces.values()]) {
      if (this.#directs.has(space.id)) continue;
      const state = this.#state(space);
      if (!canManage(state, this.identity.author) || !state.removed.size) continue;
      for (const did of state.removed.keys()) {
        if (state.left.has(did) || state.members.has(did)) continue;
        const signers = this.replica.signers().filter((s) => this.replica.authority.personOf(s) === did);
        if (!signers.length || signers.every((s) => state.cutoffs?.some((c) => c.signer === s && c.c !== undefined))) continue;
        this.replica.write(this.identity, sealFor(this.#cipher(space), { kind: KIND_REMOVE, body: { member: did, upTo: this.#upTo(did), at: this.#anchor(did, space) } }));
        anchored++;
      }
    }
    return anchored;
  }

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
    this.replica.write(this.identity, sealFor(space, { kind: KIND_MANAGED, body: { provider: setting.provider, ttlMinutes: setting.ttlMinutes, graceHours: setting.graceHours, ...(attestor ? { attestor } : {}), ...(input.company ? { company: input.company } : {}), from: currentEpoch(space) + 1 } }));
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

  /** The space's rules for agents and services as they apply (company spaces: approved only), and who is approved. */
  #visitorsInfo(space: StoredSpace): NonNullable<SpaceInfo['visitors']> {
    const state = this.#state(space);
    const fallback: VisitorRule = { who: state.managed ? 'approved' : 'everyone' };
    return {
      agents: state.visitors?.agents ?? fallback,
      services: state.visitors?.services ?? fallback,
      approved: [...(state.approvedAgents ?? [])].map((did) => {
        const grant = this.replica.authority.grant(did);
        return grant ? `${this.nameOf(grant.author) ?? grant.author}/${(grant.name ?? did.slice(8, 16)).replace(SERVICE_PREFIX, '')}` : did;
      }),
    };
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
      provider: spec.kind === 'vault' ? `Vault at ${spec.address} (${spec.key})` : spec.kind === 'azure' ? `Azure Key Vault ${spec.vault} (${spec.key})` : spec.kind === 'aws' || spec.kind === 'gcp' ? providerFor(spec, this.home, {}).describe().keyRef : spec.kind,
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
      // A company's spaces are kept by its own archive, never by friends (stage 13).
      ...[...this.#spaces.values()].filter((s) => (s.kind === 'group' || s.kind === 'project') && this.#state(s).members.size <= KEPT_UP_TO && !this.#managedRaw(s).setting).map((space) => ({ scope: spaceScope(space), space })),
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
    // Letting them in would need a new key we can't give: someone who manages the project does it.
    if (!canManage(this.#state(project), this.identity.author) && this.#needsFreshKey(project)) return;
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
      if (!space || !rekeyCounts(this.#state(space), event)) return;
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
        .events((e) => e.scope === event.scope && canonicalKind(e.kind) === KIND_REKEY && rekeyCounts(state, e))
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
      ...(space.kind !== 'direct' ? { visitors: this.#visitorsInfo(space) } : {}),
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
    const rules = boardRulesOf(entries, this.#managers(state), this.#seenAt);
    const around = this.#aroundPosts(entries);
    const visible = postsOf(space.kind, entries, state.maintainers).filter((p) => known.has(p.board)); // posts of dropped boards stay in the logs, out of sight
    const ctx = { scores: scoresOf(entries), chats: this.#chats(entries), saves: this.#saves(), entries, prefixes: shortPrefixes(visible.map((p) => p.id)) };
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
    if (dropped) this.#decoded = undefined;
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
    const { carried, dropped } = this.#carryForward(space, new Set(ended), input.dropOlder ? new Date(before).toISOString() : undefined);
    this.replica.write(this.identity, sealFor(this.#cipher(space), { kind: KIND_SHRED, body: { epochs: ended, dropped } }));
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
      this.replica.write(this.identity, sealFor(this.#cipher(space), board ? sealForBoard(space, board, latest, keys![String(latest)], inner) : inner));
    }
    return { carried: items.length, dropped };
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
    const company = !!this.#managedRaw(space).setting?.company;
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
    const cipher = this.#cipher(space);
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
      ...(p.prompt ? { prompt: p.prompt } : {}),
      ...(p.routine ? { routine: p.routine } : {}),
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
    // An approval, or a space's rule for agents and services, decides what they signed counts, earlier events
    // too (nothing is deleted: a looser rule shows them again): decode again (rare).
    if (d.inner.kind === KIND_AGENT_APPROVE || d.inner.kind === KIND_VISITORS) {
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
      ...(m.announce ? { announce: m.announce } : {}),
    };
  }

  /**
   * Announce something live in a project's chat (#general): a website opened, a version offered. A message like any
   * (its text says it), carrying what it's about, so Weave shows it as a card that knows whether it's still on.
   */
  async #announce(project: string, announce: { kind: 'website' | 'release'; id: string }, text: string): Promise<void> {
    try {
      await this.publish({ kind: KIND_MSG, body: { text, announce }, space: project });
    } catch (error) {
      console.error(`weave: couldn't announce it: ${(error as Error).message}`);
    }
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

  // ---------------------------------------------------------------- modules: services and websites

  /** What services.ts reaches of the node: exactly what it uses. */
  static servicesHost(n: WeaveNode) {
    return {
      actor: n.#actor.bind(n),
      get agents() {
        return n.#agents;
      },
      set agents(value) {
        n.#agents = value;
      },
      cipher: n.#cipher.bind(n),
      decode: n.#decode.bind(n),
      decodeAll: n.#decodeAll.bind(n),
      emitLive: n.#emitLive.bind(n),
      entries: n.#entries.bind(n),
      find: n.#find.bind(n),
      marksChanged: n.#marksChanged.bind(n),
      hintsChanged: n.#hintsChanged.bind(n),
      memo: n.#memo.bind(n),
      get home() {
        return n.home;
      },
      get identity() {
        return n.identity;
      },
      get isLinkedNode() {
        return n.#isLinkedNode;
      },
      /** A GitHub client with this node's sign-in (none: public repositories only). */
      /** Fetch for container registries (tests put a stand-in there). */
      registryFetch: () => n.containerSetup.fetch,
      /** Fetch for GitHub (tests put a stand-in there). */
      githubFetch: () => n.githubSetup.fetch,
      /** Fetch for services' sign-ins (tests put a stand-in there). */
      oauthFetch: () => n.oauthSetup.fetch,
      /** Where the services Weave ships are (tests give their own). */
      shippedDir: () => n.wasmSetup.shippedDir,
      /** Hosts a test stands in for (none in use). */
      testHosts: () => n.wasmSetup.testHosts,
      /** The Weave project: where Weave announces itself (and its new versions); its maintainers speak for Weave. */
      weaveProject: () => n.config.updates?.project ?? UPDATE_SOURCE.project,
      clock: () => n.clock(),
      project: n.#project.bind(n),
      publish: n.publish.bind(n),
      get releases() {
        return n.#releases;
      },
      get replica() {
        return n.replica;
      },
      get runtime() {
        return n.#runtime;
      },
      sealForSelf: n.#sealForSelf.bind(n),
      /** The key to seal something to a person with, and opening what was sealed to me. */
      encryptionKeyOf: (person: Did) => n.#encryptionKeyOf(person),
      tryOpen: n.#tryOpen.bind(n),
      space: n.#space.bind(n),
      spaceName: n.#spaceName.bind(n),
      get spaces() {
        return n.#spaces;
      },
      state: n.#state.bind(n),
      toItem: n.#toItem.bind(n),
      /** Accounts elsewhere said in a space, checked. */
      accounts: (space: StoredSpace, platform: string) => n.accounts({ space: space.id }).then((all) => all.filter((a) => a.platform === platform)),
      /** My keyvaults: what my services get access through. */
      keyvaults: () => n.#keyvaults,
      /** Your own account on a platform, proven (on your hub or in any space of yours): its handle. */
      myAccount: (platform: string) => n.myAccounts().then((all) => all.find((a) => a.platform === platform && a.verified)?.handle),
      /** Who reads a board of a project (everyone, for a board nobody limited). */
      boardReaders: (space: StoredSpace, board: string) => n.#readersOf(space, n.#state(space), n.#entries(space), board),
      /** Who reads a space (or one of its boards). */
      readers: (space: StoredSpace, board?: string) => n.#readersOf(space, n.#state(space), n.#entries(space), board),
    };
  }

  /** What website.ts reaches of the node: exactly what it uses. */
  static websiteHost(n: WeaveNode) {
    return {
      agentName: n.#agentName.bind(n),
      get agents() {
        return n.#agents;
      },
      allBadges: n.#allBadges.bind(n),
      allShows: n.#allShows.bind(n),
      cipher: n.#cipher.bind(n),
      get clock() {
        return n.clock;
      },
      emitLive: n.#emitLive.bind(n),
      entries: n.#entries.bind(n),
      get home() {
        return n.home;
      },
      get identity() {
        return n.identity;
      },
      get isLinkedNode() {
        return n.#isLinkedNode;
      },
      get live() {
        return n.#live;
      },
      myTickets: n.#myTickets.bind(n),
      nameOf: n.nameOf.bind(n),
      project: n.#project.bind(n),
      get releases() {
        return n.#releases;
      },
      get replica() {
        return n.replica;
      },
      resolve: n.resolve.bind(n),
      get runtime() {
        return n.#runtime;
      },
      selfSecret: n.#selfSecret.bind(n),
      showRef: n.#showRef.bind(n),
      space: n.#space.bind(n),
      spaceName: n.#spaceName.bind(n),
      get spaces() {
        return n.#spaces;
      },
      state: n.#state.bind(n),
      get swarm() {
        return n.#swarm;
      },
      ticketRecords: n.#ticketRecords.bind(n),
    };
  }

  servicesIn(...args: Parameters<Services['servicesIn']>): ReturnType<Services['servicesIn']> {
    return this.#services.servicesIn(...args);
  }

  async shippedServices(): Promise<ShippedServiceInfo[]> {
    return this.#services.shippedServices();
  }

  serviceSettings(input: { space: string; service: string }): Promise<ServiceSettingsInfo> {
    return this.#services.settings.serviceSettings(input);
  }

  setServiceSetting(input: { space: string; service: string; name: string; value?: string | null; secret?: boolean }): Promise<ServiceSettingsInfo> {
    // Never a sign-in's grant from outside: those come from startServiceSignIn alone.
    return this.#services.settings.setServiceSetting({ space: input.space, service: input.service, name: input.name, value: input.value, secret: input.secret });
  }

  startServiceSignIn(input: { space: string; service: string; name: string }): Promise<{ id: string; url: string }> {
    return this.#services.settings.startSignIn(input);
  }

  finishServiceSignIn(input: { id: string }): Promise<ServiceSettingsInfo> {
    return this.#services.settings.finishSignIn(input);
  }

  artifacts(...args: Parameters<Services['artifacts']>): ReturnType<Services['artifacts']> {
    return this.#services.artifacts(...args);
  }

  catalog(...args: Parameters<Services['catalog']>): ReturnType<Services['catalog']> {
    return this.#services.catalog(...args);
  }

  setBoardLens(...args: Parameters<Lenses['setBoardLens']>): Promise<BoardViewInfo> {
    return this.#lenses.setBoardLens(...args);
  }

  boardView(...args: Parameters<Lenses['boardView']>): Promise<BoardViewInfo> {
    return this.#lenses.boardView(...args);
  }

  boardAction(...args: Parameters<Lenses['boardAction']>): ReturnType<Lenses['boardAction']> {
    return this.#lenses.boardAction(...args);
  }

  lensFile(...args: Parameters<Lenses['lensFile']>): ReturnType<Lenses['lensFile']> {
    return this.#lenses.lensFile(...args);
  }

  marks(...args: Parameters<Marks['marks']>): ReturnType<Marks['marks']> {
    return this.#marks.marks(...args);
  }

  markServices(...args: Parameters<Marks['markServices']>): ReturnType<Marks['markServices']> {
    return this.#marks.markServices(...args);
  }

  addMarks(input: Parameters<Marks['addMarks']>[0]): ReturnType<Marks['addMarks']> {
    if (input.as) this.#agentMay(input.as, KIND_MARKS_PIN);
    return this.#marks.addMarks(input);
  }

  removeMarks(input: Parameters<Marks['removeMarks']>[0]): ReturnType<Marks['removeMarks']> {
    if (input.as) this.#agentMay(input.as, KIND_MARKS_PIN);
    return this.#marks.removeMarks(input);
  }

  setOfficial(input: Parameters<Marks['setOfficial']>[0]): ReturnType<Marks['setOfficial']> {
    if (input.as) this.#agentMay(input.as, KIND_OFFICIAL);
    return this.#marks.setOfficial(input);
  }

  hints(...args: Parameters<Hints['hints']>): ReturnType<Hints['hints']> {
    return this.#hints.hints(...args);
  }

  hintServices(...args: Parameters<Hints['hintServices']>): ReturnType<Hints['hintServices']> {
    return this.#hints.hintServices(...args);
  }

  addHints(input: Parameters<Hints['addHints']>[0]): ReturnType<Hints['addHints']> {
    return this.#hints.addHints(input);
  }

  setHints(input: Parameters<Hints['setHints']>[0]): ReturnType<Hints['setHints']> {
    return this.#hints.setHints(input);
  }

  removeHints(input: Parameters<Hints['removeHints']>[0]): ReturnType<Hints['removeHints']> {
    return this.#hints.removeHints(input);
  }

  seen(input: Parameters<Hints['seen']>[0]): ReturnType<Hints['seen']> {
    return this.#hints.seen(input);
  }

  catalogArtifact(...args: Parameters<Services['catalogArtifact']>): ReturnType<Services['catalogArtifact']> {
    return this.#services.catalogArtifact(...args);
  }

  listInCatalog(...args: Parameters<Services['listInCatalog']>): ReturnType<Services['listInCatalog']> {
    return this.#services.listInCatalog(...args);
  }

  unlistFromCatalog(...args: Parameters<Services['unlistFromCatalog']>): ReturnType<Services['unlistFromCatalog']> {
    return this.#services.unlistFromCatalog(...args);
  }

  addService(...args: Parameters<Services['addService']>): ReturnType<Services['addService']> {
    return this.#services.addService(...args);
  }

  services(...args: Parameters<Services['services']>): ReturnType<Services['services']> {
    return this.#services.services(...args);
  }

  setService(...args: Parameters<Services['setService']>): ReturnType<Services['setService']> {
    return this.#services.setService(...args);
  }

  removeService(...args: Parameters<Services['removeService']>): ReturnType<Services['removeService']> {
    return this.#services.removeService(...args);
  }

  serviceProfiles(...args: Parameters<Services['serviceProfiles']>): ReturnType<Services['serviceProfiles']> {
    return this.#services.serviceProfiles(...args);
  }

  /** Launch a website artifact in a project, and (unless announce is false) say so in its chat. */
  async launchWebsite(input: Parameters<Services['launchWebsite']>[0] & { announce?: boolean }): Promise<ServiceInfo> {
    const { announce, ...rest } = input;
    const service = await this.#services.launchWebsite(rest);
    // Said once its website is there: the announcement names that website, not its website service.
    const project = this.#project(input.project).id;
    if (announce !== false)
      void this.#services.launchedWebsite(service.name).then((room) => (room ? this.#announce(project, { kind: 'website', id: room }, `started ${service.artifact?.name ?? service.name}: come and join`) : undefined)).catch(() => {});
    return service;
  }

  withdrawArtifact(...args: Parameters<Services['withdrawArtifact']>): ReturnType<Services['withdrawArtifact']> {
    return this.#services.withdrawArtifact(...args);
  }

  setArtifactAccess(...args: Parameters<Services['setArtifactAccess']>): ReturnType<Services['setArtifactAccess']> {
    return this.#services.setArtifactAccess(...args);
  }

  async releaseFile(input: { project: string; tag: string; file: string; repo?: string; name?: string; type?: string; as?: string }): Promise<ArtifactInfo> {
    if (input.as) this.#agentMay(input.as, KIND_SERVICE_REQUEST);
    const project = this.#project(input.project);
    this.#maintainerState(project);
    const from = this.#releaseLine(project, input.repo ? { source: input.repo } : {});
    const data = (await this.#services.askProvider(project, 'publish', { source: from.ref, tag: input.tag.trim(), file: input.file, ...(input.name ? { name: input.name } : {}), ...(input.type ? { type: input.type } : {}) }, input.as, from.provider)) as { id?: string };
    const found = (await this.artifacts(project.id)).find((a) => a.id === data.id);
    if (!found) throw new Error(`${input.file} was published, but isn't an artifact of ${project.name} here: is its provider's person a maintainer?`);
    await this.#announce(project.id, { kind: 'release', id: found.id }, `${found.name} ${found.tag} is available`);
    return found;
  }

  async getArtifactFile(input: { project: string; artifact: string }): Promise<{ path: string; by: string }> {
    const project = this.#project(input.project);
    const a = artifactsOf(this.#entries(project), this.#state(project).maintainers).find((x) => x.id === input.artifact);
    if (!a) throw new Error(`${project.name} has no such artifact`);
    if (a.kind !== 'file') throw new Error(`${a.manifest.name} is a ${a.kind.replace('-', ' ')}: something to use, not a file to get`);
    return this.#releases.getFile(joinPath(this.home.dir, 'files', project.id, `${a.manifest.app}-${a.tag.replace(/[^A-Za-z0-9._-]/g, '_')}`), { project: project.id, id: a.id, tag: a.tag, manifest: a.manifest });
  }

  /** My fetchers: client apps that fetch artifacts for me (fetchers.ts). */
  get #fetchers(): Fetchers {
    return this.#releases.fetchers!;
  }

  #fetcherInfo(f: StoredFetcherInfo, added = true): FetcherInfo {
    const projects = f.projects === 'all' ? ('all' as const) : f.projects.flatMap((id) => (this.#spaces.has(id) ? [{ id, name: this.#spaceName(this.#spaces.get(id)!) }] : []));
    return { ...f, projects, added };
  }

  async fetchers(): Promise<FetcherInfo[]> {
    const mine = this.#fetchers.list();
    const more = this.#fetchers.shipped().filter((s) => !mine.some((f) => f.name === s.name));
    return [...mine.map((f) => this.#fetcherInfo(f)), ...more.map((s) => this.#fetcherInfo({ name: s.name, title: s.manifest.name, ...(s.about ? { about: s.about } : {}), digest: s.digest, projects: [], settings: s.manifest.env ?? [], filled: [], net: s.manifest.fetcher?.net ?? [] }, false))];
  }

  #projectIds(projects: string[] | 'all'): string[] | 'all' {
    return projects === 'all' ? 'all' : projects.map((p) => this.#project(p).id);
  }

  async addFetcher(input: { shipped: string; projects: string[] | 'all' }): Promise<FetcherInfo> {
    return this.#fetcherInfo(this.#fetchers.add({ shipped: input.shipped, projects: this.#projectIds(input.projects) }));
  }

  async setFetcher(input: { name: string; projects?: string[] | 'all'; settings?: Record<string, string | null> }): Promise<FetcherInfo> {
    return this.#fetcherInfo(this.#fetchers.set({ name: input.name, ...(input.projects !== undefined ? { projects: this.#projectIds(input.projects) } : {}), ...(input.settings ? { settings: input.settings } : {}) }));
  }

  async removeFetcher(name: string): Promise<void> {
    this.#fetchers.remove(name);
  }

  /** A keyvault as the app shows it: projects by name, and which of my services use it. */
  #keyvaultInfo(k: KeyvaultState, added = true): KeyvaultInfo {
    const ref = (id: string) => ({ id, name: this.#spaces.has(id) ? this.#spaceName(this.#spaces.get(id)!) : id });
    const users = this.#services.storedServices().filter((s) => s.contract.uses?.[k.platform]).map((s) => ({ service: s.name, rights: s.contract.uses![k.platform], projects: s.spaces.filter((id) => this.#spaces.has(id)).map(ref) }));
    const apps = k.apps.map((a) => ({ ...a, handed: Object.entries(a.handed).map(([id, resources]) => ({ project: ref(id), resources })) }));
    return { name: k.name, title: k.title, ...(k.about ? { about: k.about } : {}), platform: k.platform, ...(k.resources ? { resources: k.resources } : {}), settings: k.settings, apps, users, log: k.log.map((l) => ({ ...l, project: ref(l.project) })).reverse(), ...(k.problem ? { problem: k.problem } : {}), added };
  }

  async keyvaults(): Promise<KeyvaultInfo[]> {
    const mine = this.#keyvaults.list();
    const more = this.#keyvaults.shipped().filter((s) => !mine.some((k) => k.name === s.name));
    return [...mine.map((k) => this.#keyvaultInfo(k)), ...more.map((s) => this.#keyvaultInfo({ name: s.name, title: s.manifest.name, ...(s.about ? { about: s.about } : {}), platform: s.manifest.keyvault!.platform, ...(s.manifest.keyvault!.resources ? { resources: s.manifest.keyvault!.resources } : {}), digest: s.digest, settings: s.manifest.env ?? [], apps: [], log: [] }, false))];
  }

  async addKeyvault(input: { shipped: string }): Promise<KeyvaultInfo> {
    // An app made for a service before (its own setting of that name) moves into the keyvault: the service keeps no access.
    const s = this.#keyvaults.shipped().find((x) => x.name === input.shipped);
    const apps = s ? this.#services.settings.takeApps((s.manifest.env ?? []).filter((e) => e.register).map((e) => e.name)) : {};
    return this.#keyvaultInfo(this.#keyvaults.add({ shipped: input.shipped, apps }));
  }

  async removeKeyvault(name: string): Promise<void> {
    this.#keyvaults.remove(name);
  }

  async addClientApp(input: { project: string; artifact?: string; approve?: boolean }): Promise<KeyvaultInfo | FetcherInfo> {
    const { project, artifact } = this.#services.artifact(input.project, input.artifact);
    const kind = artifact.kind === 'keyvault' || artifact.kind === 'fetcher' ? artifact.kind : undefined;
    if (!kind) throw new Error(`${artifact.manifest.name} ${artifact.tag} is a ${artifact.kind}, not a keyvault or fetcher: add it where it goes (a project's services)`);
    const reaches = (artifact.manifest.keyvault?.net ?? artifact.manifest.fetcher?.net ?? []).join(', ') || 'nothing';
    if (!input.approve) throw new Error(`approve it first: Weave would run ${artifact.manifest.name} ${artifact.tag}, released in ${this.#spaceName(project)}, as your ${kind}${kind === 'keyvault' ? ` for ${artifact.manifest.keyvault!.platform} (it holds your access there)` : ''}; it reaches ${reaches} over HTTPS`);
    const taken = new Set([...this.#keyvaults.shipped(), ...this.#fetchers.shipped()].filter((s) => !this.#clientApps.list().some((c) => c.name === s.name)).map((s) => s.name));
    // One keyvault per platform: said before anything is fetched.
    const already = kind === 'keyvault' ? this.#keyvaults.forPlatform(artifact.manifest.keyvault!.platform) : undefined;
    if (already && already.name !== artifact.manifest.app) throw new Error(`you have a keyvault for ${artifact.manifest.keyvault!.platform} already (${already.name}): remove it first to use ${artifact.manifest.name} instead`);
    const added = await this.#clientApps.add({ kind, artifact: { project: project.id, id: artifact.id, tag: artifact.tag, manifest: artifact.manifest }, approved: releaseApproval(artifact), taken });
    if (kind === 'keyvault') return this.#keyvaultInfo(this.#keyvaults.add({ shipped: added.name }));
    return this.#fetcherInfo(this.#fetchers.add({ shipped: added.name, projects: [project.id] }));
  }

  async setupPacks(): Promise<Pack[]> {
    return shippedPacks(this.wasmSetup.shippedDir ?? SHIPPED_DIR);
  }

  async removeClientApp(name: string): Promise<void> {
    const c = this.#clientApps.list().find((x) => x.name === name);
    if (!c) throw new Error(`nothing named ${name} was added from a release here`);
    if (c.kind === 'keyvault' && this.#keyvaults.list().some((k) => k.name === name)) this.#keyvaults.remove(name);
    if (c.kind === 'fetcher' && this.#fetchers.list().some((f) => f.name === name)) this.#fetchers.remove(name);
    this.#clientApps.remove(name);
  }

  /** Make one of a keyvault's apps: for your own account, or (owner) for an organization of yours. */
  async startKeyvaultApp(input: { name: string; setting: string; owner?: string }): Promise<{ id: string; url: string }> {
    const k = this.#keyvaults.list().find((x) => x.name === input.name);
    // Named for whose it is: the account you proved there, else your name here.
    const proven = k ? (await this.myAccounts().catch(() => [])).find((a) => a.platform === k.platform && a.verified)?.handle : undefined;
    return this.#keyvaults.startApp({ ...input, account: proven ?? this.#actor(this.identity.author, this.identity.author).name ?? 'your', fetch: this.oauthSetup.fetch });
  }

  /**
   * Whom you may make one of a keyvault's apps for: your own account there (the one your apps are made for, else the
   * one you proved) and the organizations it shows you're in, less those that have an app of yours already.
   */
  async keyvaultOwners(input: { name: string }): Promise<{ login?: string; owners: Array<{ value: string; note?: string }> }> {
    const k = this.#keyvaults.list().find((x) => x.name === input.name);
    if (!k) throw new Error(`no keyvault ${input.name} here`);
    const made = new Set(k.apps.map((a) => String(a.info['owner.login'] ?? '').toLowerCase()).filter(Boolean));
    const proven = (await this.myAccounts().catch(() => [])).find((a) => a.platform === k.platform && a.verified)?.handle;
    // Your own: the account an app of yours was made for that isn't an organization's, else the one you proved.
    const login = proven ?? k.apps.map((a) => String(a.info['owner.login'] ?? '')).find(Boolean);
    const owners = login ? await this.#keyvaults.owners(input.name, login) : [];
    return { ...(login ? { login } : {}), owners: owners.filter((o) => !made.has(o.value.toLowerCase())) };
  }

  async finishKeyvaultApp(input: { id: string }): Promise<KeyvaultInfo> {
    return this.#keyvaultInfo(await this.#keyvaults.finishApp(input.id));
  }

  async keyvaultReachable(input: { name: string; app?: string }): Promise<Array<{ value: string; note?: string }>> {
    return this.#keyvaults.reachable(input.name, input.app);
  }

  async removeKeyvaultApp(input: { name: string; app: string }): Promise<KeyvaultInfo> {
    const k = this.#keyvaultInfo(this.#keyvaults.removeApp(input));
    for (const u of k.users) this.#services.restartSoon(u.service);
    return k;
  }

  async handKeyvault(input: { name: string; app?: string; project: string; resources: string[] }): Promise<KeyvaultInfo> {
    const k = this.#keyvaultInfo(this.#keyvaults.hand({ name: input.name, ...(input.app ? { app: input.app } : {}), project: this.#project(input.project).id, resources: input.resources }));
    // Its users bring their projects in step with what they're handed now.
    for (const u of k.users) this.#services.restartSoon(u.service);
    return k;
  }

  servicePanels(...args: Parameters<Services['servicePanels']>): ReturnType<Services['servicePanels']> {
    return this.#services.servicePanels(...args);
  }

  serviceLists(...args: Parameters<Services['serviceLists']>): ReturnType<Services['serviceLists']> {
    return this.#services.serviceLists(...args);
  }

  serviceActions(...args: Parameters<Services['serviceActions']>): ReturnType<Services['serviceActions']> {
    return this.#services.serviceActions(...args);
  }

  setServicePolicy(...args: Parameters<Services['setServicePolicy']>): ReturnType<Services['setServicePolicy']> {
    return this.#services.setServicePolicy(...args);
  }

  askService(...args: Parameters<Services['askService']>): ReturnType<Services['askService']> {
    return this.#services.askService(...args);
  }

  serviceRequests(...args: Parameters<Services['serviceRequests']>): ReturnType<Services['serviceRequests']> {
    return this.#services.serviceRequests(...args);
  }

  serviceGate(...args: Parameters<Services['serviceGate']>): ReturnType<Services['serviceGate']> {
    return this.#services.serviceGate(...args);
  }

  runServices(...args: Parameters<Services['runServices']>): ReturnType<Services['runServices']> {
    return this.#services.runServices(...args);
  }

  serviceReady(...args: Parameters<Services['serviceReady']>): ReturnType<Services['serviceReady']> {
    return this.#services.serviceReady(...args);
  }

  websiteEnv(...args: Parameters<Website['websiteEnv']>): ReturnType<Website['websiteEnv']> {
    return this.#website.websiteEnv(...args);
  }

  websites(...args: Parameters<Website['websites']>): ReturnType<Website['websites']> {
    return this.#website.websites(...args);
  }

  closeWebsite(...args: Parameters<Website['closeWebsite']>): ReturnType<Website['closeWebsite']> {
    return this.#website.closeWebsite(...args);
  }

  visitWebsite(...args: Parameters<Website['visitWebsite']>): ReturnType<Website['visitWebsite']> {
    return this.#website.visitWebsite(...args);
  }

  leaveWebsite(...args: Parameters<Website['leaveWebsite']>): ReturnType<Website['leaveWebsite']> {
    return this.#website.leaveWebsite(...args);
  }

  websiteChat(...args: Parameters<Website['websiteChat']>): ReturnType<Website['websiteChat']> {
    return this.#website.websiteChat(...args);
  }

  sayOnWebsite(...args: Parameters<Website['sayOnWebsite']>): ReturnType<Website['sayOnWebsite']> {
    return this.#website.sayOnWebsite(...args);
  }

  /** How long installing waits for a provider's answer (tests shorten it). */
  get locateWait(): number {
    return this.#services.locateWait;
  }

  set locateWait(ms: number) {
    this.#services.locateWait = ms;
  }

  /** Open a website in a project, and (unless announce is false) say so in its chat: people find it there. */
  async openWebsite(input: Parameters<Website['openWebsite']>[0] & { announce?: boolean }): Promise<WebsiteInfo> {
    const { announce, ...rest } = input;
    const site = await this.#website.openWebsite(rest);
    if (announce !== false) await this.#announce(site.project.id, { kind: 'website', id: site.id }, `opened ${site.name}: come and join`);
    return site;
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

/** What services.ts and website.ts reach of the node. */
export type ServicesHost = ReturnType<typeof WeaveNode.servicesHost>;
export type WebsiteHost = ReturnType<typeof WeaveNode.websiteHost>;
