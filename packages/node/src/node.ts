import {
  mayDo,
  mayDoAt,
  b64u,
  attachmentOf,
  KIND_KNOCK,
  KIND_KNOCK_PENDING,
  type RevokedHead,
  KIND_ORG_FREEZE,
  KIND_ORG_POLICY,
  didFromPublicKey,
  generateKeyPair,
  boxTo,
  openBox,
  type Box,
  createSubKey,
  canonicalKind,
  classOf,
  delegation,
  encodeContact,
  findRecoveryIndex,
  inception,
  KIND_APP,
  KIND_SERVICE_REQUEST,
  artifactsOf,
  KIND_CONTACT,
  KIND_GIFT,
  KIND_INVITE,
  KIND_INVITE_CLOSE,
  KIND_ISSUE,
  KIND_MEMBERSHIP_REQUEST,
  KIND_MSG,
  KIND_POST,
  postTargetOf,
  shortPrefixes,
  type PostTarget,
  KIND_PROPOSAL,
  KIND_REKEY,
  KIND_REPLY,
  KIND_SEALED,
  KIND_THREAD,
  walletMessage,
  KIND_BADGE,
  KIND_BADGE_TRANSFER,
  KIND_MARKS_PIN,
  KIND_OFFICIAL,
  messagesOf,
  newRecoveryWords,
  normalizeWords,
  blobHash,
  open,
  parseManifest,
  type RoomPages,
  parseScope,
  permits,
  randomBytes,
  recoveryEncryptionKey,
  recoveryIdentity,
  recoveryRoot,
  revocation,
  rotation,
  Replica,
  seal,
  sealFor,
  spaceScope,
  spaceTopics,
  visibleIn,
  type AppSetting,
  type Did,
  type EventFields,
  type Inner,
  type Recipient,
  type Json,
  type Sealed,
  type SigningIdentity,
  type SpaceState,
  type KeyPair,
  type WeaveEvent,
  type WeaveRecord,
  eventId,
  recordOfV1,
  isWireItemV2,
  type WireItemV2,
  signEventV2,
  KIND_IDENTITY,
  KIND_ROTATE,
  type LogStore,
  checkTextFields,
  KEY_KINDS,
  SERVICE_PREFIX,
  type ServiceContract,
  type Builtin,
  type Pack,
  unrunnableRelease,
  isLanguageSetting,
  LANGUAGES,
  type LanguageSetting,
} from '@weave/core';
import { WeaveError } from '@weave/core';
import { shippedPacks, SHIPPED_DIR } from './shipped.ts';
import { SwarmNode, type SpaceAccess } from '@weave/net';
import { Onboarding } from './onboard.ts';
import {
  noAgentError,
  type AgentInfo,
  type Backend,
  type BoardInfo,
  type BoardViewInfo,
  type ChatInfo,
  type FeedItem,
  type IdentityInfo,
  type KeyInfo,
  type FeedQuery,
  type Person,
  type Notice,
  type PostInfo,
  type PublishInput,
  type SpaceInfo,
  type Whoami,
  type ServiceSettingsInfo,
  type ShippedServiceInfo,
  type ArtifactInfo,
  type ReachInfo,
  type FetcherInfo,
  type ServiceInfo,
  type BackupInfo,
  type WebsiteInfo,
  type KeyvaultInfo,
  type Preferences,
} from './backend.ts';
import { loadConfig, saveConfig, type Config } from './config.ts';
import { FileStore } from './filestore.ts';
import { openStore, type SqliteStore } from './sqlitestore.ts';
import { resolveHome, type Home } from './home.ts';
import { moveHomeKey, readSecretJson, writeSecretJson } from './vault.ts';
import { type Fetch } from './github.ts';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join as joinPath, resolve as resolvePath } from 'node:path';
import { backupKey, readBackup, readBackupHead, writeBackup, type BackupHead } from './backupfile.ts';
import { hostname } from 'node:os';
import { LiveRooms } from './live.ts';
import { loadAgents, saveAgent, loadEncryptionKeys, loadIdentity, saveDevice, saveEncryptionKeys, type AgentKey, type EncryptionKey } from './keystore.ts';
import { acquireLock } from './lock.ts';
import { machinePolicy } from './machine.ts';
import { browserSignIn, claimsOf, openInBrowser, signInNonce, type SignInTokens } from './signin.ts';
import { decodeNodeAnswer, decodeNodeRequest, encodeNodeAnswer, encodeNodeRequest } from './company.ts';
import {
  decodeEnrollment,
  decodeRecoveryAnswer,
  encodeRecoveryRequest,
  nameFromToken,
  type Enrolling,
} from './company.ts';
import { BlobStore } from './blobstore.ts';
import { releaseApproval, Runtime } from './runtime.ts';
import { fileAssetOf, Releases, type ArtifactRef as StoredArtifact, type InstallJob } from './artifacts.ts';
import { Updates } from './update.ts';
import { Fetchers, type FetcherInfo as StoredFetcherInfo } from './fetchers.ts';
import { Keyvaults, type ForgottenApp, type KeyvaultState } from './keyvaults.ts';
import { ClientApps } from './clientapps.ts';
import { Verifiers } from './verifiers.ts';
import type { Grant as ServiceGrant } from './servicesettings.ts';
import type { Registered as ServiceRegistered } from './register.ts';
import { NODE_PREFIX, Services } from './services.ts';
import { BROWSER_PREFIX, browserLinkUrl, linkToken, sealLink } from './browserlink.ts';

/** An identity's current root and encryption keys (currentKeys), what a browser's box holds instead of the words. */
export interface RecoveredKeys {
  author: Did;
  root: SigningIdentity['keys'] & { did: Did };
  enc: Array<SigningIdentity['keys'] & { did: Did }>;
}

/** What a linked browser gets (linkBrowser), sealed for it. */
export interface BrowserHandover {
  person: Did;
  name: string | null;
  secretKey: string;
  publicKey: string;
  encryption: Array<{ did: Did; publicKey: string; secretKey: string }>;
  events: unknown[];
  spaces: StoredSpace[];
}
import { Website } from './website.ts';
import { Lenses } from './lenses.ts';
import { Marks } from './marks.ts';
import { Hints, type HeldNotice } from './hints.ts';
import { RemoteAccess } from './remote.ts';
import { loadSpaces, removeSpace, saveSpace, type StoredSpace } from './spacestore.ts';
import { ManagedKeys, type ManagedCore } from './managed.ts';
import { KIND_NODE_INDEX } from './shared.ts';
import { Companies, KIND_GENERATION, type CompaniesCore } from './companies.ts';
import { Payments, type PaymentsCore } from './payments.ts';
import { Holding, type HoldingCore } from './holding.ts';
import { Forgetting, type RetentionCore } from './retention.ts';
import { Sessions, type SessionsCore } from './sessions.ts';
import { Content, type ContentCore } from './content.ts';
import { People, type PeopleCore } from './people.ts';
import { Apps, type AppsCore } from './apps.ts';
import { Kernel, type KernelCore } from './kernel.ts';
import { Membership, type MembershipCore } from './membership.ts';
import type { SpaceStorage } from './ports.ts';
import { startDeviceSignIn } from './devicecode.ts';
import { KIND_PROFILE, meetTopic, meetSecretOf } from './shared.ts';


/** A space you don't want on Home, sealed to yourself; the latest per space counts. */
export const KIND_HOME_HIDDEN = 'weave.home.hidden';
/** Sealed to yourself: {space, board, on}. You follow a project's board: its posts come to Home and notify you. */
export const KIND_BOARD_FOLLOW = 'weave.board.follow';
/** Boards you follow until you say otherwise: the announcement-style ones. */
export const FOLLOWED_BOARDS = ['releases', 'showcase'];


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
  /** Launched for some only: who may visit the website it serves (see StoredRoom.access). */
  access?: StoredRoom['access'];
  description: string;
  icon?: string;
  contract: ServiceContract;
  /** Space ids it was added to. */
  spaces: string[];
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
  /** The settings one Weave ships asks for, as it ships it (a release's come from its manifest): its profile lists them for its spaces' maintainers. */
  asks?: AppSetting[];
  /** Its sign-ins as you (settings it asks for as yours), by name: for every project it's in. */
  grants?: Record<string, ServiceGrant>;
  /** Its apps registered as you (a GitHub App), by name: what it reads of each, and the key Weave signs with. */
  registered?: Record<string, ServiceRegistered>;
  /** One Weave ships (shipped.ts): its name, and the digest it ran last. */
  shipped?: { name: string; digest: string };
  /** What you approved it (or its rooms) to run: fingerprints of a release. */
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

/** What an always-on node's key may sign: hosting your rooms. Everything else it writes, everyone else drops. */
export const NODE_PERMISSIONS = ['weave.room', 'weave.room.*'];







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
  // Sessions (sessions.ts): the node delegates.

  get harnessHome() {
    return this.#sessions.harnessHome;
  }

  set harnessHome(value) {
    this.#sessions.harnessHome = value;
  }

  get mcpLaunch() {
    return this.#sessions.mcpLaunch;
  }

  set mcpLaunch(value) {
    this.#sessions.mcpLaunch = value;
  }

  harnesses(...args: Parameters<Sessions['harnesses']>): ReturnType<Sessions['harnesses']> {
    return this.#sessions.harnesses(...args);
  }

  repairHarnesses(...args: Parameters<Sessions['repairHarnesses']>): ReturnType<Sessions['repairHarnesses']> {
    return this.#sessions.repairHarnesses(...args);
  }

  connectHarness(...args: Parameters<Sessions['connectHarness']>): ReturnType<Sessions['connectHarness']> {
    return this.#sessions.connectHarness(...args);
  }

  dismissHarnesses(...args: Parameters<Sessions['dismissHarnesses']>): ReturnType<Sessions['dismissHarnesses']> {
    return this.#sessions.dismissHarnesses(...args);
  }

  addAgent(...args: Parameters<Sessions['addAgent']>): ReturnType<Sessions['addAgent']> {
    return this.#sessions.addAgent(...args);
  }

  join(...args: Parameters<Sessions['join']>): ReturnType<Sessions['join']> {
    return this.#sessions.join(...args);
  }

  status(...args: Parameters<Sessions['status']>): ReturnType<Sessions['status']> {
    return this.#sessions.status(...args);
  }

  get shippedMissing() {
    return this.#sessions.shippedMissing;
  }

  watch(...args: Parameters<Sessions['watch']>): ReturnType<Sessions['watch']> {
    return this.#sessions.watch(...args);
  }

  requestPermission(...args: Parameters<Sessions['requestPermission']>): ReturnType<Sessions['requestPermission']> {
    return this.#sessions.requestPermission(...args);
  }

  requestHand(...args: Parameters<Sessions['requestHand']>): ReturnType<Sessions['requestHand']> {
    return this.#sessions.requestHand(...args);
  }

  openInApp(...args: Parameters<Sessions['openInApp']>): ReturnType<Sessions['openInApp']> {
    return this.#sessions.openInApp(...args);
  }

  showPosts(...args: Parameters<Sessions['showPosts']>): ReturnType<Sessions['showPosts']> {
    return this.#sessions.showPosts(...args);
  }

  mentions(...args: Parameters<Sessions['mentions']>): ReturnType<Sessions['mentions']> {
    return this.#sessions.mentions(...args);
  }

  followClaudeCode(...args: Parameters<Sessions['followClaudeCode']>): ReturnType<Sessions['followClaudeCode']> {
    return this.#sessions.followClaudeCode(...args);
  }

  claudeCode(...args: Parameters<Sessions['claudeCode']>): ReturnType<Sessions['claudeCode']> {
    return this.#sessions.claudeCode(...args);
  }

  startFollowing(...args: Parameters<Sessions['startFollowing']>): ReturnType<Sessions['startFollowing']> {
    return this.#sessions.startFollowing(...args);
  }

  sessions(...args: Parameters<Sessions['sessions']>): ReturnType<Sessions['sessions']> {
    return this.#sessions.sessions(...args);
  }

  activeSessions(...args: Parameters<Sessions['activeSessions']>): ReturnType<Sessions['activeSessions']> {
    return this.#sessions.activeSessions(...args);
  }

  focusedSession(...args: Parameters<Sessions['focusedSession']>): ReturnType<Sessions['focusedSession']> {
    return this.#sessions.focusedSession(...args);
  }

  session(...args: Parameters<Sessions['session']>): ReturnType<Sessions['session']> {
    return this.#sessions.session(...args);
  }

  workOn(...args: Parameters<Sessions['workOn']>): ReturnType<Sessions['workOn']> {
    return this.#sessions.workOn(...args);
  }

  doneWith(...args: Parameters<Sessions['doneWith']>): ReturnType<Sessions['doneWith']> {
    return this.#sessions.doneWith(...args);
  }

  restack(...args: Parameters<Sessions['restack']>): ReturnType<Sessions['restack']> {
    return this.#sessions.restack(...args);
  }

  setSessionRole(...args: Parameters<Sessions['setSessionRole']>): ReturnType<Sessions['setSessionRole']> {
    return this.#sessions.setSessionRole(...args);
  }

  workers(...args: Parameters<Sessions['workers']>): ReturnType<Sessions['workers']> {
    return this.#sessions.workers(...args);
  }

  hideSession(...args: Parameters<Sessions['hideSession']>): ReturnType<Sessions['hideSession']> {
    return this.#sessions.hideSession(...args);
  }

  unhideSessions(...args: Parameters<Sessions['unhideSessions']>): ReturnType<Sessions['unhideSessions']> {
    return this.#sessions.unhideSessions(...args);
  }

  assign(...args: Parameters<Sessions['assign']>): ReturnType<Sessions['assign']> {
    return this.#sessions.assign(...args);
  }

  nameSession(...args: Parameters<Sessions['nameSession']>): ReturnType<Sessions['nameSession']> {
    return this.#sessions.nameSession(...args);
  }

  setSessionAvatar(...args: Parameters<Sessions['setSessionAvatar']>): ReturnType<Sessions['setSessionAvatar']> {
    return this.#sessions.setSessionAvatar(...args);
  }

  desk(...args: Parameters<Sessions['desk']>): ReturnType<Sessions['desk']> {
    return this.#sessions.desk(...args);
  }

  deskFolder(...args: Parameters<Sessions['deskFolder']>): ReturnType<Sessions['deskFolder']> {
    return this.#sessions.deskFolder(...args);
  }

  setupDesk(...args: Parameters<Sessions['setupDesk']>): ReturnType<Sessions['setupDesk']> {
    return this.#sessions.setupDesk(...args);
  }

  routines(...args: Parameters<Sessions['routines']>): ReturnType<Sessions['routines']> {
    return this.#sessions.routines(...args);
  }

  setRoutine(...args: Parameters<Sessions['setRoutine']>): ReturnType<Sessions['setRoutine']> {
    return this.#sessions.setRoutine(...args);
  }

  removeRoutine(...args: Parameters<Sessions['removeRoutine']>): ReturnType<Sessions['removeRoutine']> {
    return this.#sessions.removeRoutine(...args);
  }

  runRoutine(...args: Parameters<Sessions['runRoutine']>): ReturnType<Sessions['runRoutine']> {
    return this.#sessions.runRoutine(...args);
  }

  tickRoutines(...args: Parameters<Sessions['tickRoutines']>): ReturnType<Sessions['tickRoutines']> {
    return this.#sessions.tickRoutines(...args);
  }

  expectSession(...args: Parameters<Sessions['expectSession']>): ReturnType<Sessions['expectSession']> {
    return this.#sessions.expectSession(...args);
  }

  folders(...args: Parameters<Sessions['folders']>): ReturnType<Sessions['folders']> {
    return this.#sessions.folders(...args);
  }

  workTarget(...args: Parameters<Sessions['workTarget']>): ReturnType<Sessions['workTarget']> {
    return this.#sessions.workTarget(...args);
  }

  rememberFolder(...args: Parameters<Sessions['rememberFolder']>): ReturnType<Sessions['rememberFolder']> {
    return this.#sessions.rememberFolder(...args);
  }

  permissionRequests(...args: Parameters<Sessions['permissionRequests']>): ReturnType<Sessions['permissionRequests']> {
    return this.#sessions.permissionRequests(...args);
  }

  answerPermission(...args: Parameters<Sessions['answerPermission']>): ReturnType<Sessions['answerPermission']> {
    return this.#sessions.answerPermission(...args);
  }

  // Payments (payments.ts): the node delegates.

  get checkLicense() {
    return this.#payments.checkLicense;
  }

  set checkLicense(value) {
    this.#payments.checkLicense = value;
  }

  get checkPayment() {
    return this.#payments.checkPayment;
  }

  set checkPayment(value) {
    this.#payments.checkPayment = value;
  }

  get callChain() {
    return this.#payments.callChain;
  }

  set callChain(value) {
    this.#payments.callChain = value;
  }

  get chainRpc() {
    return this.#payments.chainRpc;
  }

  set chainRpc(value) {
    this.#payments.chainRpc = value;
  }

  get makeGumroadMembership() {
    return this.#payments.makeGumroadMembership;
  }

  set makeGumroadMembership(value) {
    this.#payments.makeGumroadMembership = value;
  }

  get gumroadSetup() {
    return this.#payments.gumroadSetup;
  }

  set gumroadSetup(value) {
    this.#payments.gumroadSetup = value;
  }

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

  createBadgeSeries(...args: Parameters<Payments['createBadgeSeries']>): ReturnType<Payments['createBadgeSeries']> {
    return this.#payments.createBadgeSeries(...args);
  }

  setBadgeSeries(...args: Parameters<Payments['setBadgeSeries']>): ReturnType<Payments['setBadgeSeries']> {
    return this.#payments.setBadgeSeries(...args);
  }

  badgeSeries(...args: Parameters<Payments['badgeSeries']>): ReturnType<Payments['badgeSeries']> {
    return this.#payments.badgeSeries(...args);
  }

  giveBadge(...args: Parameters<Payments['giveBadge']>): ReturnType<Payments['giveBadge']> {
    return this.#payments.giveBadge(...args);
  }

  badges(...args: Parameters<Payments['badges']>): ReturnType<Payments['badges']> {
    return this.#payments.badges(...args);
  }

  transferBadge(...args: Parameters<Payments['transferBadge']>): ReturnType<Payments['transferBadge']> {
    return this.#payments.transferBadge(...args);
  }

  publishBadgeNote(...args: Parameters<Payments['publishBadgeNote']>): ReturnType<Payments['publishBadgeNote']> {
    return this.#payments.publishBadgeNote(...args);
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
  /** Weave's own updates (update.ts): new versions of the app, fetched like any release file, for the app to install. */
  #updates = new Updates(() => joinPath(this.home.dir, 'updates'), () => this.#releases, () => this.#emitLive());
  /** My fetchers (fetchers.ts): client apps that fetch what providers grant me. */
  /** Keyvaults and fetchers I added from releases (clientapps.ts): beside the ones Weave ships, run the same. */
  #clientApps = new ClientApps(() => this.home, () => this.#releases);
  #fetchersMade = (this.#releases.fetchers = new Fetchers(() => this.home, this.#runtime, () => this.wasmSetup.shippedDir, () => this.#clientApps.asShipped('fetcher')));
  /** My keyvaults (keyvaults.ts): my access to platforms, of which my services get only what's derived. */
  #keyvaults = new Keyvaults(() => this.home, this.#runtime, () => this.wasmSetup.shippedDir, () => this.#clientApps.asShipped('keyvault'));
  /** The verifiers of accounts elsewhere (verifiers.ts): client apps this node runs to check them. */
  #verifiers = new Verifiers(() => this.home, this.#runtime, () => this.wasmSetup.shippedDir);
  /** Services: code you run under keys of their own (see services.ts). */
  /** The company key service: halves, unlocking, sealing and opening with both halves (managed.ts). */
  /** The spaces' files in the home: the port the kernel and membership save through (ports.ts). */
  readonly #spaceStorage: SpaceStorage = { load: () => loadSpaces(this.home), save: (space) => saveSpace(this.home, space), remove: (id) => removeSpace(this.home, id) };
  /** The kernel: spaces, keys, decoding, state, the reading layer, board access (kernel.ts). Built first: the modules bind to it. */
  #kernel: Kernel = new Kernel(this, WeaveNode.kernelCore(this));
  #managed: ManagedKeys = new ManagedKeys(this, WeaveNode.managedCore(this));
  /** Money: tiers, badges, treasuries, Safes, wallets and tickets (payments.ts). */
  #payments: Payments = new Payments(this, WeaveNode.paymentsCore(this));
  /** Who holds what: pulled spaces, the copies friends hold from before, older history on request, budgets (holding.ts). */
  #holding: Holding = new Holding(this, WeaveNode.holdingCore(this));
  /** Retention: legal holds, forgetting by rule, keeping posts, shredding old keys (retention.ts). */
  #retention: Forgetting = new Forgetting(this, WeaveNode.retentionCore(this));
  /** Agents, their harnesses and permissions, sessions and their stacks, mentions, the desk (sessions.ts). */
  #sessions: Sessions = new Sessions(this, WeaveNode.sessionsCore(this));
  /** Content: posts, boards, pages, images, chat, issues, proposals (content.ts). */
  #content: Content = new Content(this, WeaveNode.contentCore(this));
  /** People: profiles, names, the social graph, avatars, accounts elsewhere (people.ts). */
  #people: People = new People(this, WeaveNode.peopleCore(this));
  /** Onboarding links: making them, following them, and following back who comes in with one (onboard.ts). */
  #onboarding: Onboarding = new Onboarding(this, {
    sealForSelf: (kind, body) => void this.replica.write(this.identity, this.#kernel.sealForSelf({ kind, body })),
    selfBodies: (kind) => this.#selfBodies(kind),
    writeIn: (space, kind, body) => {
      const stored = this.#kernel.space(space);
      this.replica.write(this.identity, sealFor(this.#managed.cipher(stored), { kind, body }));
    },
    bodiesIn: (space, kind) => {
      const stored = this.#spaces.get(space);
      return stored ? this.#kernel.decodedIn(stored.id).filter((d) => d.inner.kind === kind && d.inner.body && typeof d.inner.body === 'object').map((d) => ({ author: d.event.author, body: d.inner.body as Record<string, unknown> })) : [];
    },
    boxFor: (key, value) => boxTo(key, value) as unknown as Json,
    encryptionKey: () => this.#encryptionKeyOf(this.identity.author),
    openBox: (box) =>
      this.#tryOpen((me) => {
        try {
          return openBox(me.keys.secretKey, me.keys.publicKey, box as unknown as Parameters<typeof openBox>[2]);
        } catch {
          return undefined;
        }
      }),
  });
  #followBackTimer: ReturnType<typeof setTimeout> | undefined;
  /** A project's app and artifacts, releases and release lines, this installation's updates (apps.ts). */
  #apps: Apps = new Apps(this, WeaveNode.appsCore(this));
  /** Membership: spaces, invites and knocks, who is in, admissions (membership.ts). */
  #membership: Membership = new Membership(this, WeaveNode.membershipCore(this));
  /** Company accounts: their group and spaces, sign-in, attestor, policy, escrow, audit, SCIM, console (companies.ts). */
  #companies: Companies = new Companies(this, WeaveNode.companiesCore(this));
  #services: Services = new Services(WeaveNode.servicesHost(this), () => this.#website);
  /** Websites (rooms) of the room service, and the app API that tells them who is visiting (see website.ts). */
  #website: Website = new Website(WeaveNode.websiteHost(this), () => this.#services);
  /** Boards' client services, run here for this member. */
  #lenses: Lenses = new Lenses(WeaveNode.servicesHost(this), () => this.#services);
  /** Mark services: what shows next to names, from issuers you or a space chose (stage 19). */
  #marks: Marks = new Marks(WeaveNode.servicesHost(this));
  #hints: Hints = new Hints(WeaveNode.servicesHost(this), (since) => this.#heldNotices(since));
  // Kernel (kernel.ts): the node delegates.

  sessionAccess(...args: Parameters<Kernel['sessionAccess']>): ReturnType<Kernel['sessionAccess']> {
    return this.#kernel.sessionAccess(...args);
  }

  setSpacePhoto(...args: Parameters<Kernel['setSpacePhoto']>): ReturnType<Kernel['setSpacePhoto']> {
    return this.#kernel.setSpacePhoto(...args);
  }

  _decodedIds(...args: Parameters<Kernel['_decodedIds']>): ReturnType<Kernel['_decodedIds']> {
    return this.#kernel._decodedIds(...args);
  }


  private constructor(home: Home, identity: SigningIdentity) {
    this.home = home;
    this.#identity = identity;
    // Homes from before separate encryption keys use the root key for encryption.
    const stored = loadEncryptionKeys(home);
    this.#encryption = stored.length ? stored : [{ did: identity.did, keys: identity.keys }];
    this.#releaseLock = acquireLock(home);
    this.replica = new Replica(this.#openStore(home));
    // A standby server follows the active one and signs nothing: it shares the active one's device key (stage 14).
    if (loadConfig(home).standby) this.#companies.refuseWrites();
    this.blobs = new BlobStore(home.blobs);
    this.config = loadConfig(home);
    this.#agents = loadAgents(home);
    // Secrets read only now and then (tokens, pairings) are sealed right away, not when first needed.
    // Weave's own GitHub sign-in is gone (services have their own access): its token isn't kept.
    rmSync(joinPath(home.dir, 'github.json'), { force: true });
    for (const file of [this.#payments.gumroadFile, joinPath(home.dir, 'remote.json'), joinPath(home.dir, 'services.json')]) readSecretJson(home, file);
    for (const space of loadSpaces(home)) this.#spaces.set(space.id, space);
    this.#managed.loadHalves();
    // A newer server of this identity took over while we were away: stand down (nQ9JHlUV).
    for (const r of this.replica.events((e) => e.kind === KIND_GENERATION && e.author === this.identity.author)) this.#companies.seeGeneration(r);

    // Pick up keys handed to us — new epochs and whole spaces — now and whenever they arrive.
    const isKeys = (e: WeaveRecord) => canonicalKind(e.kind) === KIND_REKEY || e.kind === KIND_GIFT;
    for (const event of this.replica.events(isKeys)) this.#kernel.takeKeys(event);
    this.replica.admit = this.#holding.admit;
    this.replica.onAppend((event) => {
      if (event.kind === KIND_GENERATION && event.author === this.identity.author) this.#companies.seeGeneration(event);
      // When it arrived: where a notice period must not depend on the date its author claims (#seenAt).
      if (event.kind === KIND_SEALED || canonicalKind(event.kind) === KIND_REKEY) this.#arrivals.set(event.id, new Date(this.clock()).toISOString());
      const scoped = event.kind === KIND_SEALED && !event.missing ? (parseScope(event.scope)?.id ?? '') : '';
      const kept = scoped ? this.#managed.rawCache.get(scoped) : undefined;
      const space = scoped ? (this.#spaces.get(scoped) ?? this.#kernel.directs.get(scoped)?.space) : undefined;
      // A company half or setting arriving changes which key opens what: decode again.
      if (kept && space && this.#managed.takeRaw(space, kept, event)) this.#kernel.invalidateDecoded();
      if (isKeys(event)) this.#kernel.takeKeys(event);
      this.#kernel.decodedAdd(event);
      // Someone may have come in with one of our friendly onboarding links: follow them back, after the batch.
      if (scoped && this.#onboarding.watched().has(scoped)) this.#scheduleFollowBack();
      // A new encryption key (mine or a peer's) adds an epoch to direct chats.
      if (event.kind === KIND_ROTATE) this.#forgetDirects();
      // Key events change whose events count for whom; anything else joins its author's list, in order.
      if (KEY_KINDS.has(event.kind)) this.#kernel.personEvents.clear();
      if (event.kind === KIND_ORG_FREEZE) this.#kernel.invalidateDecoded();
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
    if (options.migrate !== false) {
      node.#migrate();
      node.#moveToProtocol3();
    }
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
  /**
   * A device from the identity's current keys, not its words (a browser's box, docs/web-stage2.md): its own device key,
   * signed by that root. Whoever has these keys has today's root and no more: rotating with the words, which stay on
   * paper, shuts them out again. A root rotated since says so, and the words have to come in.
   */
  static async restoreFromKeys(keys: RecoveredKeys, dir?: string, options: { events?: unknown[] } = {}): Promise<WeaveNode> {
    const home = resolveHome(dir);
    if (loadIdentity(home)) throw new Error(`an identity already exists in ${home.dir}`);
    const device = createSubKey(keys.author);
    saveEncryptionKeys(home, keys.enc.map((k) => ({ did: k.did, keys: k })));
    saveDevice(home, device);
    const node = WeaveNode.open(home.dir);
    for (const event of options.events ?? []) node.replica.ingest(event);
    const state = node.replica.authority.keys(keys.author);
    if (!state.next || state.root !== keys.root.did) {
      await node.close();
      throw new Error('these keys are out of date: your account rotated its keys since. Come in with your 24 words');
    }
    node.replica.append({ author: keys.author, did: keys.root.did, keys: keys.root }, delegation(device.did, 'device', ['*'], deviceName()));
    return node;
  }

  /** This identity's current keys, from its words: what a browser keeps instead of them (restoreFromKeys). */
  currentKeys(words: string): RecoveredKeys {
    const clean = normalizeWords(words);
    const author = this.identity.author;
    if (recoveryIdentity(clean) !== author) throw new Error("these words aren't this account's");
    const state = this.replica.authority.keys(author);
    const rootIndex = findRecoveryIndex(clean, state.root, 'root');
    const encIndex = findRecoveryIndex(clean, state.enc, 'enc');
    if (rootIndex === undefined || encIndex === undefined) throw new Error("these words don't match this identity's current keys");
    return { author, root: recoveryRoot(clean, rootIndex), enc: Array.from({ length: encIndex + 1 }, (_, i) => recoveryEncryptionKey(clean, i)) };
  }

  /** `beforeOnline`: what has to be set up for this node before it goes looking (a browser's storage node, which needs the node). */
  static async restore(words: string, dir?: string, options: { events?: unknown[]; online?: boolean; timeoutMs?: number; beforeOnline?: (node: WeaveNode) => void } = {}): Promise<WeaveNode> {
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
      options.beforeOnline?.(node);
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
    const { invite, proof } = await node.#membership.takeInvite(enrollment.invite);
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
    // Who you are (and what you're called) and who signs for you: the node checks its own key against them from the
    // start. Your public side whole: each key's events form a chain, and one taken out leaves the rest waiting for it
    // (martl's door node, 2.11.2026: his device's tiers and gifts sat between his delegations). And from before v0.4,
    // the v1 originals that the v2 events restate (`was`), first: without them a node takes none of those.
    const payload = {
      person: me,
      name: this.nameOf(me) ?? null,
      encryption: this.#encryption.map((k) => ({ did: k.did, publicKey: b64u.encode(k.keys.publicKey), secretKey: b64u.encode(k.keys.secretKey) })),
      events: [
        ...Object.keys(this.replica.heads())
          .filter((signer) => this.replica.authority.personOf(signer as Did) === me)
          .flatMap((signer) => this.replica.store.range(signer as Did, 1)),
        ...this.replica.events().filter((e) => e.author === me && e.scope === 'public'),
      ] as unknown as Json[],
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
    for (const space of payload.spaces) if (space?.id && !node.#spaces.has(space.id)) await node.#kernel.addSpace({ ...space, entry: { topics: [person], bootstrap: [] } });
    await node.join(person);
    rmSync(file, { force: true });
    return node;
  }

  /**
   * Link a browser (docs/web-stage2.md), on one of your computers: it gets a key of its own that may sign everything a
   * person does day to day (an agent's role, so it can't add devices, delegate or rotate: that takes your recovery words),
   * your encryption keys and your spaces. That goes sealed to the storage node at `url`, and the link it gives back opens
   * it there, once, within 15 minutes. Revoke it like an always-on node, in Keys & devices.
   */
  async linkBrowser(input: { url: string; storage?: string; name?: string }): Promise<{ link: string; name: string; key: Did }> {
    const me = this.identity.author;
    const mine = this.replica.authority.grant(this.identity.did);
    if (this.identity.did !== me && mine?.role !== 'device') throw new Error('link browsers from one of your own computers');
    // The page the link opens, and the storage node it uses: the same origin, unless the page comes from elsewhere.
    const url = new URL(input.url);
    const storage = new URL(input.storage ?? input.url);
    for (const at of [url, storage]) if (at.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(at.hostname)) throw new Error('a storage node is reached over https');
    const name = (input.name ?? '').trim().replace(/\s+/g, '-').slice(0, 32) || 'web';
    const keys = generateKeyPair();
    const key = didFromPublicKey(keys.publicKey);
    const secret = randomBytes(32);
    // The key first, then everything a node of yours needs, as an always-on node gets it (linkNode).
    this.replica.write(this.identity, delegation(key, 'agent', ['*'], `${BROWSER_PREFIX}${name}`));
    this.#writeNodeIndex(true);
    const handover = {
      person: me,
      name: this.nameOf(me) ?? null,
      secretKey: b64u.encode(keys.secretKey),
      publicKey: b64u.encode(keys.publicKey),
      encryption: this.#encryption.map((k) => ({ did: k.did, publicKey: b64u.encode(k.keys.publicKey), secretKey: b64u.encode(k.keys.secretKey) })),
      events: [
        ...Object.keys(this.replica.heads())
          .filter((signer) => this.replica.authority.personOf(signer as Did) === me)
          .flatMap((signer) => this.replica.store.range(signer as Did, 1)),
        ...this.replica.events().filter((e) => e.author === me && e.scope === 'public'),
      ] as unknown as Json[],
      spaces: this.#nodeSpaces() as unknown as Json[],
    };
    const res = await fetch(`${storage.origin}/link/${linkToken(secret)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: sealLink(secret, handover as unknown as Json) });
    if (!res.ok) {
      // Nothing reached the browser: its key goes again.
      this.replica.write(this.identity, revocation(key, 0));
      throw new Error(res.status === 429 ? 'too many browser links from here this hour: try again later' : `the storage node didn't take it (${res.status})`);
    }
    return { link: browserLinkUrl(url.origin, secret), name, key };
  }

  /** Set up a browser's home from a link's handover (linkBrowser): the person, with the key it was given. */
  static async fromBrowserLink(handover: BrowserHandover, dir: string): Promise<WeaveNode> {
    const home = resolveHome(dir);
    if (loadIdentity(home)) throw new Error(`an identity already exists in ${home.dir}`);
    const keys = { publicKey: b64u.decode(handover.publicKey), secretKey: b64u.decode(handover.secretKey) };
    saveEncryptionKeys(home, handover.encryption.map((k) => ({ did: k.did, keys: { publicKey: b64u.decode(k.publicKey), secretKey: b64u.decode(k.secretKey) } })));
    saveDevice(home, { author: handover.person, did: didFromPublicKey(keys.publicKey), keys });
    const node = WeaveNode.open(home.dir);
    for (const event of handover.events) node.replica.ingest(event);
    if (node.replica.authority.grant(node.identity.did)?.author !== handover.person) {
      await node.close();
      throw new Error("the link doesn't vouch for this browser's key: link it again");
    }
    for (const space of handover.spaces) if (space?.id && !node.#spaces.has(space.id)) await node.#kernel.addSpace({ ...space, entry: { topics: [handover.person], bootstrap: [] } });
    return node;
  }

  /** This node is a browser linked to its person's computers: it signs with the key one of them gave it. */
  get #isLinkedBrowser(): boolean {
    return this.replica.authority.grant(this.identity.did)?.name?.startsWith(BROWSER_PREFIX) === true;
  }

  /** This node is someone's always-on node (stage 18): it signs with a node key, not a device's. */
  get #isLinkedNode(): boolean {
    return this.replica.authority.grant(this.identity.did)?.name?.startsWith(NODE_PREFIX) === true;
  }

  /** Our spaces for our always-on nodes: all but direct chats, with their keys. */
  #nodeSpaces(): unknown[] {
    return [...this.#spaces.values()]
      .filter((s) => s.kind !== 'direct' && !this.#kernel.directs.has(s.id))
      .map((s) => ({ ...this.#kernel.keysOnly(s), ...(s.boards ? { boards: s.boards } : {}), ...(s.shredded ? { shredded: s.shredded } : {}) }));
  }

  /**
   * Written by our devices: every space of ours, with its keys, so each of our devices has them all (a computer, a
   * browser, an always-on node). When it changes. A device that has none yet writes none while another's lists some:
   * its empty list would be the latest, and hide the one it takes its spaces from.
   */
  #writeNodeIndex(force = false): number {
    if (this.#isLinkedNode || this.#isLinkedBrowser) return 0;
    const spaces = this.#nodeSpaces();
    if (!spaces.length && this.#nodeIndexHash === undefined && this.#selfBodies(KIND_NODE_INDEX).length) return 0;
    const body = { spaces };
    const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    if (!force && hash === this.#nodeIndexHash) return 0;
    this.replica.write(this.identity, this.#kernel.sealForSelf({ kind: KIND_NODE_INDEX, body: body as unknown as Json }));
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

  /**
   * Every DHT topic this node listens on: its meeting point, configured topics, its spaces and their entry points.
   * Never its DID: that's public, and would tell anyone where this computer is.
   */
  get topics(): string[] {
    const topics = new Set([meetTopic(this.#meetSecret()), ...(this.#frontDoor() ? [meetTopic(this.#doorSecret())] : []), ...this.config.topics]);
    for (const space of this.#spaces.values()) {
      for (const topic of this.#meetingTopics(space)) topics.add(topic);
      for (const topic of space.entry.topics) topics.add(topic);
    }
    for (const friend of this.#kernel.friends()) for (const topic of spaceTopics(this.#kernel.direct(friend), 0)) topics.add(topic);
    return [...topics];
  }

  /**
   * A space's meeting points this node is found at: those of every key only people still in it were given (made after
   * everyone who left or was removed had gone, and not boxed to them), and always its current key and the one before.
   * So a member who missed several new keys (offline for a while, an older Weave) still finds the others, and nobody
   * who left finds them past the key that followed.
   */
  #meetingTopics(space: StoredSpace): string[] {
    const state = this.#kernel.state(space);
    const gone = [...state.removed];
    if (space.kind === 'direct' || !gone.length) return spaceTopics(space, 0);
    const scope = spaceScope(space);
    const safe = new Map<number, boolean>();
    for (const e of this.replica.events((r) => canonicalKind(r.kind) === KIND_REKEY && r.scope === scope)) {
      const body = e.body as { epoch?: unknown; boxes?: Record<string, unknown> } | null;
      const epoch = body?.epoch;
      if (!Number.isSafeInteger(epoch) || !space.keys[String(epoch)] || !mayDoAt(state, e, 'manage').ok) continue;
      const seen = this.#seenAt(e);
      const time = e.time < seen ? e.time : seen;
      const ok = gone.every(([did, at]) => time > at && !body?.boxes?.[did]);
      safe.set(epoch as number, (safe.get(epoch as number) ?? true) && ok);
    }
    // From the newest key down, as long as each is one only those still here hold.
    let since = Infinity;
    for (const epoch of Object.keys(space.keys).map(Number).sort((a, b) => b - a)) {
      if (!safe.get(epoch)) break;
      since = epoch;
    }
    return spaceTopics(space, since);
  }

  /**
   * A topic only looked up, never announced on: someone else's meeting point (or, from a link made before meeting
   * points, their DID). Announcing there would tell whoever looks where we are, and that we know them.
   */
  #looksOnly(topic: string): boolean {
    return (topic.startsWith('meet:') || topic.startsWith('did:')) && topic !== meetTopic(this.#meetSecret()) && !(this.#frontDoor() && topic === meetTopic(this.#doorSecret()));
  }

  /** Connect to peers and join all topics. */
  async goOnline(): Promise<void> {
    if (this.#swarm) return;
    this.#swarm = new SwarmNode(this.replica, this.config.bootstrap.length ? { bootstrap: this.config.bootstrap } : {}, this.blobs, this.sessionAccess());
    await Promise.all(this.topics.map((topic) => this.#swarm!.join(topic, { announce: !this.#looksOnly(topic) })));
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
    this.#sessions.follower?.stop();
    this.#sessions.appLog?.stop();
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
    if (!signer) throw noAgentError(input.as!, this.#agents.map((a) => a.name));
    if (input.as) this.#agentMay(input.as, input.kind);
    // An always-on node hosts its person's rooms; everyone else would drop anything else it signed (stage 18).
    if (!input.as && this.#isLinkedNode && !permits(NODE_PERMISSIONS, input.kind)) throw new Error(`this is ${this.nameOf(this.identity.author) ?? 'your'} always-on node: it keeps spaces and hosts rooms, and doesn't post or change anything for them (${input.kind})`);
    // Readers would cut anything longer: refuse instead, so nothing is shortened without the author knowing.
    checkTextFields(input.body);
    // A release of a website or service that Weave couldn't run: refused, whoever publishes it (a person, an agent, a
    // project's release service), before it sits in the project as something nobody can start.
    if (canonicalKind(input.kind) === KIND_APP) {
      const problem = unrunnableRelease(parseManifest(input.body));
      if (problem) throw new Error(problem);
    }
    let inner: Inner = { kind: input.kind, body: input.body ?? null };
    const space = input.space ? this.#kernel.space(input.space) : undefined;
    if (space && space.kind !== 'direct' && this.#kernel.state(space).closed) throw new WeaveError('daemon.space.closed', { space: space.name }, `${space.name} is closed: it's kept as it is, read-only`);
    if (space && input.as) this.#kernel.visitorMay(space, signer.did, input.as, input.kind);
    if (space?.kind === 'project') inner = this.#kernel.forBoard(space, inner);
    const fields: EventFields = space ? sealFor(await this.#managed.cipherReady(space), inner) : inner;
    const event = this.replica.write(signer, fields);
    return this.itemFor(event)!;
  }

  /** An agent may sign this kind, or an error saying how its person allows it. */
  #agentMay(name: string, kind: string): void {
    const agent = this.#agents.find((a) => a.name === name);
    if (!agent) throw noAgentError(name, this.#agents.map((a) => a.name));
    if (!permits(agent.permissions, kind)) throw new WeaveError('daemon.agent.may.not.sign', { agent: name, kind }, `agent "${name}" may not sign ${kind}; its person can allow it in Keys & devices in the Weave app, or with: weave agent can ${name} ${[...agent.permissions, kind].join(',')}`);
  }

  async feed(query: FeedQuery = {}): Promise<FeedItem[]> {
    const kinds = query.kinds?.length ? new Set(query.kinds) : undefined;
    const onlySpace = query.space ? this.#kernel.space(query.space) : undefined;
    const onlyAuthor = query.author ? this.resolve(query.author) : undefined;
    const hidden = this.#kernel.hiddenAuthors();
    const states = new Map<string, SpaceState>();

    // The last `limit` that match (0: all), from the end: items are made only for those, not for the whole history.
    const limit = query.limit ?? 50;
    const max = limit > 0 ? limit : Infinity;
    const items: FeedItem[] = [];
    const all = this.#kernel.decodeAll();
    for (let i = all.length - 1; i >= 0 && items.length < max; i--) {
      const decoded = all[i];
      if (onlySpace && decoded.space?.id !== onlySpace.id) continue;
      if (onlyAuthor && decoded.event.author !== onlyAuthor) continue;
      if (query.publicOnly && (decoded.space || decoded.private)) continue;
      if (kinds && !kinds.has(decoded.inner.kind)) continue;
      if (hidden.has(decoded.event.author)) continue;
      if (decoded.space) {
        if (!states.has(decoded.space.id)) states.set(decoded.space.id, this.#kernel.state(decoded.space));
        if (!this.#kernel.mine(decoded.event) && !visibleIn(states.get(decoded.space.id)!, decoded.event, decoded.inner)) continue;
      }
      items.push(this.#kernel.toItem(decoded));
    }
    return items.reverse();
  }

  // Membership (membership.ts): the node delegates.

  spaces(...args: Parameters<Membership['spaces']>): ReturnType<Membership['spaces']> {
    return this.#membership.spaces(...args);
  }

  createGroup(...args: Parameters<Membership['createGroup']>): ReturnType<Membership['createGroup']> {
    return this.#membership.createGroup(...args);
  }

  createProject(...args: Parameters<Membership['createProject']>): ReturnType<Membership['createProject']> {
    return this.#membership.createProject(...args);
  }

  invite(...args: Parameters<Membership['invite']>): ReturnType<Membership['invite']> {
    return this.#membership.invite(...args);
  }

  #scheduleFollowBack(): void {
    clearTimeout(this.#followBackTimer);
    this.#followBackTimer = setTimeout(() => void this.#onboarding.followBack().catch(() => {}), 200);
    this.#followBackTimer.unref?.();
  }

  createOnboardLink(...args: Parameters<Onboarding['create']>): ReturnType<Onboarding['create']> {
    return this.#onboarding.create(...args);
  }

  onboardLinks(): ReturnType<Onboarding['list']> {
    return this.#onboarding.list();
  }

  revokeOnboardLink(code: string): ReturnType<Onboarding['revoke']> {
    return this.#onboarding.revoke(code);
  }

  lookAtOnboardLink(link: string, storage?: string): ReturnType<Onboarding['look']> {
    return this.#onboarding.look(link, storage);
  }

  followOnboardLink(link: string, storage?: string, options?: { counted?: boolean }): ReturnType<Onboarding['follow']> {
    return this.#onboarding.follow(link, storage, options);
  }

  /** Your quick starts: links you followed or made, to their project and game. */
  async playLinks(): Promise<ReturnType<Onboarding['playLinks']>> {
    return this.#onboarding.playLinks();
  }

  async removePlayLink(code: string): Promise<void> {
    this.#onboarding.removePlayLink(code);
  }

  /** Follow back who came in with your friendly onboarding links (also done by itself as they arrive). */
  followBackOnboarded(): Promise<number> {
    return this.#onboarding.followBack();
  }

  closeInvite(...args: Parameters<Membership['closeInvite']>): ReturnType<Membership['closeInvite']> {
    return this.#membership.closeInvite(...args);
  }

  joinSpace(...args: Parameters<Membership['joinSpace']>): ReturnType<Membership['joinSpace']> {
    return this.#membership.joinSpace(...args);
  }

  lookAtInvite(...args: Parameters<Membership['lookAtInvite']>): ReturnType<Membership['lookAtInvite']> {
    return this.#membership.lookAtInvite(...args);
  }

  knocks(...args: Parameters<Membership['knocks']>): ReturnType<Membership['knocks']> {
    return this.#membership.knocks(...args);
  }

  answerKnock(...args: Parameters<Membership['answerKnock']>): ReturnType<Membership['answerKnock']> {
    return this.#membership.answerKnock(...args);
  }

  setVisitors(...args: Parameters<Membership['setVisitors']>): ReturnType<Membership['setVisitors']> {
    return this.#membership.setVisitors(...args);
  }

  approveAgent(...args: Parameters<Membership['approveAgent']>): ReturnType<Membership['approveAgent']> {
    return this.#membership.approveAgent(...args);
  }

  agentBlocked(...args: Parameters<Membership['agentBlocked']>): ReturnType<Membership['agentBlocked']> {
    return this.#membership.agentBlocked(...args);
  }

  members(...args: Parameters<Membership['members']>): ReturnType<Membership['members']> {
    return this.#membership.members(...args);
  }

  leave(...args: Parameters<Membership['leave']>): ReturnType<Membership['leave']> {
    return this.#membership.leave(...args);
  }

  handOver(...args: Parameters<Membership['handOver']>): ReturnType<Membership['handOver']> {
    return this.#membership.handOver(...args);
  }

  setHistory(...args: Parameters<Membership['setHistory']>): ReturnType<Membership['setHistory']> {
    return this.#membership.setHistory(...args);
  }

  closeSpace(...args: Parameters<Membership['closeSpace']>): ReturnType<Membership['closeSpace']> {
    return this.#membership.closeSpace(...args);
  }

  removeMember(...args: Parameters<Membership['removeMember']>): ReturnType<Membership['removeMember']> {
    return this.#membership.removeMember(...args);
  }

  createCommunity(...args: Parameters<Membership['createCommunity']>): ReturnType<Membership['createCommunity']> {
    return this.#membership.createCommunity(...args);
  }

  community(...args: Parameters<Membership['community']>): ReturnType<Membership['community']> {
    return this.#membership.community(...args);
  }

  setCommunity(...args: Parameters<Membership['setCommunity']>): ReturnType<Membership['setCommunity']> {
    return this.#membership.setCommunity(...args);
  }

  setModerator(...args: Parameters<Membership['setModerator']>): ReturnType<Membership['setModerator']> {
    return this.#membership.setModerator(...args);
  }

  setMaintainer(...args: Parameters<Membership['setMaintainer']>): ReturnType<Membership['setMaintainer']> {
    return this.#membership.setMaintainer(...args);
  }

  inviteGroup(...args: Parameters<Membership['inviteGroup']>): ReturnType<Membership['inviteGroup']> {
    return this.#membership.inviteGroup(...args);
  }

  uninviteGroup(...args: Parameters<Membership['uninviteGroup']>): ReturnType<Membership['uninviteGroup']> {
    return this.#membership.uninviteGroup(...args);
  }

  setRule(...args: Parameters<Membership['setRule']>): ReturnType<Membership['setRule']> {
    return this.#membership.setRule(...args);
  }

  admissions(...args: Parameters<Membership['admissions']>): ReturnType<Membership['admissions']> {
    return this.#membership.admissions(...args);
  }

  admit(...args: Parameters<Membership['admit']>): ReturnType<Membership['admit']> {
    return this.#membership.admit(...args);
  }

  decline(...args: Parameters<Membership['decline']>): ReturnType<Membership['decline']> {
    return this.#membership.decline(...args);
  }


  // Companies (companies.ts): the node delegates.

  audit(...args: Parameters<Companies['audit']>): ReturnType<Companies['audit']> {
    return this.#companies.audit(...args);
  }

  escrowRecovery(...args: Parameters<Companies['escrowRecovery']>): ReturnType<Companies['escrowRecovery']> {
    return this.#companies.escrowRecovery(...args);
  }

  openEscrow(...args: Parameters<Companies['openEscrow']>): ReturnType<Companies['openEscrow']> {
    return this.#companies.openEscrow(...args);
  }

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

  get deviceCredentials() {
    return this.#companies.deviceCredentials;
  }

  set deviceCredentials(value) {
    this.#companies.deviceCredentials = value;
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

  /**
   * Save this person's Weave as one encrypted file (backupfile.ts): everything this node holds (events as they
   * travel, the keys of its spaces, its attachments), sealed with a key from their recovery words. `to` is a folder
   * (the file gets a name with the date) or the file itself. The file alone opens nothing; the words and the file
   * bring it all back on a new computer (restoreBackup), with nobody else involved.
   */
  async saveBackup(input: { to: string }): Promise<BackupInfo> {
    const me = this.identity.author;
    const state = this.replica.authority.keys(me);
    if (state.org) throw new WeaveError('daemon.backup.company', {}, "a company account has no recovery words of its own: its company keeps its data, and backs it up");
    if (!state.next) throw new WeaveError('daemon.backup.no.words', {}, 'this identity was made before recovery words existed: there is nothing to open a backup with');
    if (!input.to?.trim()) throw new Error('say where to save it: a folder, or a file ending in .weavebackup');
    const created = new Date(this.clock()).toISOString();
    const name = this.nameOf(me);
    const target = resolvePath(input.to.trim());
    const isFile = /\.weavebackup$/i.test(target);
    const dir = isFile ? dirname(target) : target;
    mkdirSync(dir, { recursive: true });
    const slug = (name ?? 'weave').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'weave';
    const file = isFile ? target : joinPath(dir, `weave-backup-${slug}-${created.slice(0, 10)}.weavebackup`);
    const spaces = loadSpaces(this.home);
    const records = this.replica.events();
    const blobs = existsSync(this.home.blobs) ? readdirSync(this.home.blobs).filter((f) => /^[A-Za-z0-9_-]{20,}$/.test(f)) : [];
    const head: BackupHead = { v: 1, author: me, ...(name ? { name } : {}), created, events: records.length, spaces: spaces.length };
    const home = this.home;
    function* lines(): Generator<string> {
      yield JSON.stringify({ spaces });
      for (const r of records) yield JSON.stringify({ event: r.wire });
      for (const hash of blobs) yield JSON.stringify({ blob: hash, data: readFileSync(joinPath(home.blobs, hash)).toString('base64') });
    }
    const bytes = writeBackup(file, backupKey(this.#selfSecret()), head, lines());
    this.config = { ...this.config, lastBackup: created };
    saveConfig(this.home, this.config);
    return { file, bytes, events: records.length, spaces: spaces.length, attachments: blobs.length, created };
  }

  /**
   * A new computer from the recovery words and a backup file: the identity, its spaces with their keys, and
   * everything the backup holds, with no peer and no network. The words must be the ones the backup was made
   * with: they are its key. Nothing is set up here unless the file opens.
   */
  static async restoreBackup(words: string, file: string, dir?: string): Promise<WeaveNode> {
    const clean = normalizeWords(words);
    const path = resolvePath(file);
    if (!existsSync(path)) throw new Error(`there is no file ${path}`);
    const head = readBackupHead(path);
    if (head.author !== recoveryIdentity(clean)) throw new Error('this backup belongs to another identity than these recovery words');
    const key = backupKey(recoveryEncryptionKey(clean, 0).secretKey);
    // Opened whole before anything is set up: a file that doesn't open leaves this computer as it was.
    const spaces: StoredSpace[] = [];
    const events: unknown[] = [];
    for (const line of readBackup(path, key)) {
      const item = JSON.parse(line) as { spaces?: StoredSpace[]; event?: unknown; blob?: string };
      if (Array.isArray(item.spaces)) spaces.push(...item.spaces);
      else if (item.event !== undefined) events.push(item.event);
    }
    const node = await WeaveNode.restore(clean, dir, { events });
    // Once more: what waited for something that came later in the file.
    for (const event of events) node.replica.ingest(event);
    for (const space of spaces) if (space && typeof space.id === 'string' && !node.#spaces.has(space.id)) await node.#kernel.addSpace(space);
    // Attachments, straight from the file to the blob store (they can be large: never all in memory).
    for (const line of readBackup(path, key)) {
      if (!line.startsWith('{"blob"')) continue;
      const item = JSON.parse(line) as { blob: string; data: string };
      const data = Buffer.from(item.data, 'base64');
      if (blobHash(data) === item.blob) node.blobs.put(data);
    }
    node.#kernel.invalidateDecoded();
    node.config = { ...node.config, lastBackup: head.created };
    saveConfig(node.home, node.config);
    return node;
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





  // Content (content.ts): the node delegates.

  posts(...args: Parameters<Content['posts']>): ReturnType<Content['posts']> {
    return this.#content.posts(...args);
  }

  post(...args: Parameters<Content['post']>): ReturnType<Content['post']> {
    return this.#content.post(...args);
  }

  submit(...args: Parameters<Content['submit']>): ReturnType<Content['submit']> {
    return this.#content.submit(...args);
  }

  confirmCoauthor(...args: Parameters<Content['confirmCoauthor']>): ReturnType<Content['confirmCoauthor']> {
    return this.#content.confirmCoauthor(...args);
  }

  coauthorRequests(...args: Parameters<Content['coauthorRequests']>): ReturnType<Content['coauthorRequests']> {
    return this.#content.coauthorRequests(...args);
  }

  editPost(...args: Parameters<Content['editPost']>): ReturnType<Content['editPost']> {
    return this.#content.editPost(...args);
  }

  deletePost(...args: Parameters<Content['deletePost']>): ReturnType<Content['deletePost']> {
    return this.#content.deletePost(...args);
  }

  upvote(...args: Parameters<Content['upvote']>): ReturnType<Content['upvote']> {
    return this.#content.upvote(...args);
  }

  save(...args: Parameters<Content['save']>): ReturnType<Content['save']> {
    return this.#content.save(...args);
  }

  share(...args: Parameters<Content['share']>): ReturnType<Content['share']> {
    return this.#content.share(...args);
  }

  boards(...args: Parameters<Content['boards']>): ReturnType<Content['boards']> {
    return this.#content.boards(...args);
  }

  setBoardAccess(...args: Parameters<Content['setBoardAccess']>): ReturnType<Content['setBoardAccess']> {
    return this.#content.setBoardAccess(...args);
  }

  setBoard(...args: Parameters<Content['setBoard']>): ReturnType<Content['setBoard']> {
    return this.#content.setBoard(...args);
  }

  curate(...args: Parameters<Content['curate']>): ReturnType<Content['curate']> {
    return this.#content.curate(...args);
  }

  project(...args: Parameters<Content['project']>): ReturnType<Content['project']> {
    return this.#content.project(...args);
  }

  setProjectPage(...args: Parameters<Content['setProjectPage']>): ReturnType<Content['setProjectPage']> {
    return this.#content.setProjectPage(...args);
  }

  putBlob(...args: Parameters<Content['putBlob']>): ReturnType<Content['putBlob']> {
    return this.#content.putBlob(...args);
  }

  putFile(...args: Parameters<Content['putFile']>): ReturnType<Content['putFile']> {
    return this.#content.putFile(...args);
  }

  blob(...args: Parameters<Content['blob']>): ReturnType<Content['blob']> {
    return this.#content.blob(...args);
  }

  channels(...args: Parameters<Content['channels']>): ReturnType<Content['channels']> {
    return this.#content.channels(...args);
  }

  createChannel(...args: Parameters<Content['createChannel']>): ReturnType<Content['createChannel']> {
    return this.#content.createChannel(...args);
  }

  messages(...args: Parameters<Content['messages']>): ReturnType<Content['messages']> {
    return this.#content.messages(...args);
  }

  say(...args: Parameters<Content['say']>): ReturnType<Content['say']> {
    return this.#content.say(...args);
  }

  deleteMessage(...args: Parameters<Content['deleteMessage']>): ReturnType<Content['deleteMessage']> {
    return this.#content.deleteMessage(...args);
  }

  react(...args: Parameters<Content['react']>): ReturnType<Content['react']> {
    return this.#content.react(...args);
  }

  threads(...args: Parameters<Content['threads']>): ReturnType<Content['threads']> {
    return this.#content.threads(...args);
  }

  startThread(...args: Parameters<Content['startThread']>): ReturnType<Content['startThread']> {
    return this.#content.startThread(...args);
  }

  reply(...args: Parameters<Content['reply']>): ReturnType<Content['reply']> {
    return this.#content.reply(...args);
  }

  issues(...args: Parameters<Content['issues']>): ReturnType<Content['issues']> {
    return this.#content.issues(...args);
  }

  openIssue(...args: Parameters<Content['openIssue']>): ReturnType<Content['openIssue']> {
    return this.#content.openIssue(...args);
  }

  claimIssue(...args: Parameters<Content['claimIssue']>): ReturnType<Content['claimIssue']> {
    return this.#content.claimIssue(...args);
  }

  setIssueStatus(...args: Parameters<Content['setIssueStatus']>): ReturnType<Content['setIssueStatus']> {
    return this.#content.setIssueStatus(...args);
  }

  proposals(...args: Parameters<Content['proposals']>): ReturnType<Content['proposals']> {
    return this.#content.proposals(...args);
  }

  propose(...args: Parameters<Content['propose']>): ReturnType<Content['propose']> {
    return this.#content.propose(...args);
  }

  vote(...args: Parameters<Content['vote']>): ReturnType<Content['vote']> {
    return this.#content.vote(...args);
  }

  delegateVote(...args: Parameters<Content['delegateVote']>): ReturnType<Content['delegateVote']> {
    return this.#content.delegateVote(...args);
  }

  votingDelegate(...args: Parameters<Content['votingDelegate']>): ReturnType<Content['votingDelegate']> {
    return this.#content.votingDelegate(...args);
  }

  async updateAgent(input: { name: string; permissions: string[] }): Promise<AgentInfo> {
    const agent = this.#agents.find((a) => a.name === input.name);
    if (!agent) throw new WeaveError('daemon.agent.none', { name: input.name }, `no agent named "${input.name}"`);
    const permissions = [...new Set(input.permissions.map((p) => p.trim()).filter(Boolean))];
    if (permissions.includes('*')) throw new WeaveError('daemon.agent.all.permissions', undefined, "agents can't get every permission: name the kinds they may sign");
    this.replica.write(this.identity, delegation(agent.did, 'agent', permissions, agent.name));
    agent.permissions = permissions;
    saveAgent(this.home, agent);
    return agentInfo(agent);
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
    this.#content.prefetchBlobs();
    let changed = (await this.#payments.expireMemberships()) + (await this.#payments.grantAutomatic()) + (await this.#payments.checkContractWallets()) + (await this.#payments.grantPaid()) + (await this.#payments.grantTickets()) + (await this.#payments.renewPaid()) + (await this.#payments.sendQueuedRequests()) + this.#people.tellContacts();
    for (const space of [...this.#spaces.values()]) changed += this.#kernel.settleEpochKeys(space);
    changed += await this.#content.closeProposals();
    for (const space of [...this.#spaces.values()]) changed += this.#closeInvites(space);
    for (const space of [...this.#spaces.values()]) changed += this.#kernel.rotateAfterLeaving(space, this.#kernel.state(space));
    for (const space of [...this.#spaces.values()]) changed += this.#kernel.handMissedKeys(space, this.#kernel.state(space));
    for (const space of [...this.#spaces.values()]) changed += this.#kernel.recarry(space, this.#kernel.state(space));
    for (const space of [...this.#spaces.values()]) changed += this.#kernel.rotateMonthly(space);
    changed += this.#retention.applyShreds();
    changed += this.#retention.forget();
    changed += this.#holding.release();
    this.#holding.purgeKept();
    changed += await this.#companies.renewSignIn();
    for (const space of [...this.#spaces.values()]) if (this.#kernel.state(space).managed) await this.#managed.unlock(space);
    // Company halves of new keys: published (or tried again) before anything else uses them.
    await Promise.all([...this.#managed.halves.keys()].map((id) => this.#managed.publishHalf(id)));
    changed += await this.#companies.attest();
    changed += await this.#companies.applyDirectory();
    changed += await this.#companies.offboard();
    changed += this.#kernel.anchorRemovals();
    changed += this.#kernel.settleLosses();
    changed += await this.#companies.orgDuties();
    changed += await this.#companies.continueEnrollment();
    // Bookkeeping, not a change to anyone's spaces: the audit to the company's security tools.
    await this.#companies.streamAudit();
    await Promise.all([...this.#managed.halves.keys()].map((id) => this.#managed.publishHalf(id)));
    // Bookkeeping for our own devices, not a change to anyone's spaces. What the lists name comes here first, so the list
    // this device writes after has it too, rather than hiding it. A node writes none of its person's.
    this.#holding.recoverSpaces();
    if (!this.#isLinkedNode) {
      this.#holding.writeKeepIndex();
      this.#writeNodeIndex();
    }
    // On an always-on node: services handed over by its person's computers.
    changed += await this.#services.takeHandovers();
    for (const project of [...this.#spaces.values()].filter((s) => s.kind === 'project')) {
      const state = this.#kernel.state(project);
      if (!state.members.has(this.identity.author)) continue;
      changed += await this.#kernel.reconcileBoards(project);
      const joins = new Map<string, Did[]>();
      for (const change of this.#kernel.changes(project, state)) {
        if (!state.groups.get(change.group.id)?.auto) continue;
        if (change.change === 'join') joins.set(change.group.id, [...(joins.get(change.group.id) ?? []), change.did]);
        else if (mayDo(state, this.identity.author, 'remove').ok) {
          await this.removeMember(project.id, change.did);
          changed++;
        }
      }
      for (const [groupId, dids] of joins) {
        this.#kernel.admitAll(project, this.#spaces.get(groupId)!, dids);
        changed += dids.length;
      }
    }
    return changed;
  }

  // People (people.ts): the node delegates.

  platforms(...args: Parameters<People['platforms']>): ReturnType<People['platforms']> {
    return this.#people.platforms(...args);
  }

  accountProof(...args: Parameters<People['accountProof']>): ReturnType<People['accountProof']> {
    return this.#people.accountProof(...args);
  }

  linkAccount(...args: Parameters<People['linkAccount']>): ReturnType<People['linkAccount']> {
    return this.#people.linkAccount(...args);
  }

  startAccountProof(...args: Parameters<People['startAccountProof']>): ReturnType<People['startAccountProof']> {
    return this.#people.startAccountProof(...args);
  }

  finishAccountProof(...args: Parameters<People['finishAccountProof']>): ReturnType<People['finishAccountProof']> {
    return this.#people.finishAccountProof(...args);
  }

  accounts(...args: Parameters<People['accounts']>): ReturnType<People['accounts']> {
    return this.#people.accounts(...args);
  }

  myAccounts(...args: Parameters<People['myAccounts']>): ReturnType<People['myAccounts']> {
    return this.#people.myAccounts(...args);
  }

  setEdge(...args: Parameters<People['setEdge']>): ReturnType<People['setEdge']> {
    return this.#people.setEdge(...args);
  }

  social(...args: Parameters<People['social']>): ReturnType<People['social']> {
    return this.#people.social(...args);
  }

  profile(...args: Parameters<People['profile']>): ReturnType<People['profile']> {
    return this.#people.profile(...args);
  }

  setProfile(...args: Parameters<People['setProfile']>): ReturnType<People['setProfile']> {
    return this.#people.setProfile(...args);
  }

  imprint(...args: Parameters<People['imprint']>): ReturnType<People['imprint']> {
    return this.#people.imprint(...args);
  }

  setImprint(...args: Parameters<People['setImprint']>): ReturnType<People['setImprint']> {
    return this.#people.setImprint(...args);
  }

  directory(...args: Parameters<People['directory']>): ReturnType<People['directory']> {
    return this.#people.directory(...args);
  }

  find(...args: Parameters<People['find']>): ReturnType<People['find']> {
    return this.#people.find(...args);
  }

  contactLink(...args: Parameters<People['contactLink']>): ReturnType<People['contactLink']> {
    return this.#people.contactLink(...args);
  }

  addContact(...args: Parameters<People['addContact']>): ReturnType<People['addContact']> {
    return this.#people.addContact(...args);
  }

  avatarOf(...args: Parameters<People['avatarOf']>): ReturnType<People['avatarOf']> {
    return this.#people.avatarOf(...args);
  }

  avatars(...args: Parameters<People['avatars']>): ReturnType<People['avatars']> {
    return this.#people.avatars(...args);
  }

  themeOf(...args: Parameters<People['themeOf']>): ReturnType<People['themeOf']> {
    return this.#people.themeOf(...args);
  }

  publicProjectsOf(...args: Parameters<People['publicProjectsOf']>): ReturnType<People['publicProjectsOf']> {
    return this.#people.publicProjectsOf(...args);
  }

  resolve(...args: Parameters<People['resolve']>): ReturnType<People['resolve']> {
    return this.#people.resolve(...args);
  }

  nameOf(...args: Parameters<People['nameOf']>): ReturnType<People['nameOf']> {
    return this.#people.nameOf(...args);
  }

  // Apps (apps.ts): the node delegates.

  projectApp(...args: Parameters<Apps['projectApp']>): ReturnType<Apps['projectApp']> {
    return this.#apps.projectApp(...args);
  }

  artifactLines(...args: Parameters<Apps['artifactLines']>): ReturnType<Apps['artifactLines']> {
    return this.#apps.artifactLines(...args);
  }

  publishArtifact(...args: Parameters<Apps['publishArtifact']>): ReturnType<Apps['publishArtifact']> {
    return this.#apps.publishArtifact(...args);
  }

  publishApp(...args: Parameters<Apps['publishApp']>): ReturnType<Apps['publishApp']> {
    return this.#apps.publishApp(...args);
  }

  updateCheck(...args: Parameters<Apps['updateCheck']>): ReturnType<Apps['updateCheck']> {
    return this.#apps.updateCheck(...args);
  }

  updateFetch(...args: Parameters<Apps['updateFetch']>): ReturnType<Apps['updateFetch']> {
    return this.#apps.updateFetch(...args);
  }

  updateState(...args: Parameters<Apps['updateState']>): ReturnType<Apps['updateState']> {
    return this.#apps.updateState(...args);
  }

  updateReady(...args: Parameters<Apps['updateReady']>): ReturnType<Apps['updateReady']> {
    return this.#apps.updateReady(...args);
  }

  updateSettings(...args: Parameters<Apps['updateSettings']>): ReturnType<Apps['updateSettings']> {
    return this.#apps.updateSettings(...args);
  }

  artifactReleases(...args: Parameters<Apps['artifactReleases']>): ReturnType<Apps['artifactReleases']> {
    return this.#apps.artifactReleases(...args);
  }

  appReleases(...args: Parameters<Apps['appReleases']>): ReturnType<Apps['appReleases']> {
    return this.#apps.appReleases(...args);
  }

  releaseArtifact(...args: Parameters<Apps['releaseArtifact']>): ReturnType<Apps['releaseArtifact']> {
    return this.#apps.releaseArtifact(...args);
  }

  releaseApp(...args: Parameters<Apps['releaseApp']>): ReturnType<Apps['releaseApp']> {
    return this.#apps.releaseApp(...args);
  }

  releaseService(...args: Parameters<Apps['releaseService']>): ReturnType<Apps['releaseService']> {
    return this.#apps.releaseService(...args);
  }


  /**
   * Who reaches this computer: people you know (with your link, or a space or a chat you share), or anyone who finds
   * it (and then sees everything public it holds); and whether you have a front door (an always-on node).
   */
  async reach(): Promise<ReachInfo> {
    const door = this.replica.authority.grantsOf(this.identity.author).some((g) => g.name?.startsWith(NODE_PREFIX) && g.revokedAfter === undefined);
    return { anyone: this.config.firewall === false, door };
  }

  async setReach(input: { anyone: boolean }): Promise<ReachInfo> {
    const { firewall: _firewall, ...rest } = this.config;
    this.config = { ...rest, ...(input.anyone ? { firewall: false as const } : {}) };
    saveConfig(this.home, this.config);
    return this.reach();
  }

  async preferences(): Promise<Preferences> {
    return this.config.language ? { language: this.config.language } : {};
  }

  /** The UI's language on this computer: a shipped one, or "system" to follow the computer's. */
  async setPreferences(input: { language?: LanguageSetting }): Promise<Preferences> {
    if (input.language !== undefined && !isLanguageSetting(input.language)) throw new Error(`not a language Weave has: ${String(input.language)} (${LANGUAGES.join(', ')}, or system)`);
    const { language: _language, ...rest } = this.config;
    this.config = { ...rest, ...(input.language && input.language !== 'system' ? { language: input.language } : {}) };
    saveConfig(this.home, this.config);
    return this.preferences();
  }

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
        this.#kernel.invalidateDecoded();
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
    this.#kernel.invalidateDecoded();
    this.#kernel.personEvents.clear();
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
      const inner = this.#kernel.decodeInner(recordOfV1(event))?.inner.kind;
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
      if (this.#kernel.state(space).members.size < 2) continue;
      this.replica.append(this.#identity, sealFor(this.#managed.cipher(space), { kind: KIND_MSG, body: { text, moved: '0.4' } }));
    }
  }

  // ---------------------------------------------------------------- moving to protocol 3

  /** The farewells this node wrote for peers on protocol 2, by space: their ids, kept in the home so a restart serves them again. */
  #farewellIds?: Record<string, string>;

  /**
   * The first start on protocol 3 (the review before the first public release;
   * see @weave/net WIRE_VERSION): a message in each group and project shared
   * with others, for those still on protocol 2, signed in the shape they read
   * (no ih, no cs: fields their nodes reject). It's the one thing an older peer
   * gets from a session (SpaceAccess.farewells); nodes on protocol 3 hide it.
   * Written once; a space whose key is locked right now is tried again at the
   * next start.
   */
  #moveToProtocol3(): void {
    const file = joinPath(this.home.dir, 'protocol-3.json');
    if (existsSync(file)) {
      try {
        this.#farewellIds = (JSON.parse(readFileSync(file, 'utf8')) as { farewells?: Record<string, string> }).farewells ?? {};
      } catch {
        this.#farewellIds = {};
      }
      return;
    }
    const farewells: Record<string, string> = {};
    const text = `I've moved to a newer Weave, which this version can't talk to. Please update: ${RELEASES_URL}`;
    let locked = false;
    for (const space of this.#spaces.values()) {
      if (space.kind !== 'group' && space.kind !== 'project') continue;
      if (this.#kernel.state(space).members.size < 2) continue;
      try {
        farewells[space.id] = this.replica.write(this.identity, sealFor(this.#managed.cipher(space), { kind: KIND_MSG, body: { text, moved: 3 } }, { legacy: true })).id;
      } catch {
        locked = true;
      }
    }
    this.#farewellIds = farewells;
    if (!locked) writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), farewells }, null, 2) + '\n');
  }

  /** This node's farewells to peers on protocol 2, as wire items, for the sessions. */
  #farewells(): WireItemV2[] {
    return Object.values(this.#farewellIds ?? {}).flatMap((id) => {
      const record = this.replica.record2(id);
      return record && isWireItemV2(record.wire) ? [record.wire] : [];
    });
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
    this.#kernel.invalidateDecoded();
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
    this.#kernel.invalidateDecoded();
    this.#forgetDirects();
  }

  /** My encryption key pairs in the order I named them (each one others encrypted to), for direct chats' epochs. */
  #myEncryptionPairs(): KeyPair[] {
    const pairs = this.replica.authority.encryptionKeys(this.identity.author).flatMap((did) => this.#encryption.find((k) => k.did === did)?.keys ?? []);
    return pairs.length ? pairs : [this.#recipient().keys];
  }

  /** Direct chats are derived again (with their new epoch) after an encryption key changed, mine or a peer's. */
  #forgetDirects(): void {
    this.#kernel.directs.clear();
    this.#kernel.directByPeer.clear();
    this.#kernel.invalidateDecoded();
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

  /** My meeting point's secret, carried by my links: from my self secret, so the same on all my devices and for good. */
  #doorSecret(): Uint8Array {
    return new Uint8Array(createHash('sha256').update('weave/meet/door/v1').update(this.#selfSecret()).digest());
  }

  /** This node is a front door: an always-on node, unless its config says otherwise; any other only if it says so. */
  #frontDoor(): boolean {
    return this.config.frontDoor ?? this.#isLinkedNode;
  }

  #meetSecret(): Uint8Array {
    return new Uint8Array(createHash('sha256').update('weave/meet/v1').update(this.#selfSecret()).digest());
  }

  /** The meeting points of others we were given links to: our contacts', the spaces' we were invited to, and those we knocked at. */
  #theirMeets(): Uint8Array[] {
    const secrets = new Map<string, Uint8Array>();
    const add = (entry: { meet?: unknown } | undefined) => {
      const secret = meetSecretOf(entry);
      if (secret) secrets.set(b64u.encode(secret), secret);
    };
    for (const body of this.#selfBodies(KIND_CONTACT)) add(body);
    for (const body of this.#selfBodies(KIND_KNOCK_PENDING)) add(body);
    for (const space of this.#spaces.values()) add(space.entry);
    secrets.delete(b64u.encode(this.#meetSecret()));
    return [...secrets.values()];
  }

  /**
   * A person's own events, from every key that signs for them (root keys and
   * devices; agents too), valid ones only, oldest first.
   */
  /** An accepted event of a person whose list is kept: into its place (time, then seq), no rescan. */
  #personEventsAdd(event: WeaveRecord): void {
    const list = this.#kernel.personEvents.get(event.author);
    if (!list || event.missing) return;
    if (list.some((e) => e.id === event.id)) return void this.#kernel.personEvents.delete(event.author); // re-signed: gather again
    if (this.replica.authority.personOf(event.signer) !== event.author) return void this.#kernel.personEvents.delete(event.author);
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
    const kept = this.#kernel.personEvents.get(person);
    if (kept) return kept;
    const authority = this.replica.authority;
    const events: WeaveRecord[] = [];
    for (const signer of this.replica.signers()) {
      if (authority.personOf(signer) !== person) continue;
      for (const event of this.replica.eventsBy(signer)) if (event.author === person && !event.missing) events.push(event);
    }
    events.sort((a, b) => a.time.localeCompare(b.time) || a.seq - b.seq);
    this.#kernel.personEvents.set(person, events);
    return events;
  }

  /** An agent's name, if this signer is one of the author's agents (devices sign as the person). */
  #agentName(signer: Did, author: Did): string | undefined {
    if (signer === author) return undefined;
    const grant = this.replica.authority.grant(signer);
    // A service shows by its own name ("martl · files"), like any agent.
    // A linked browser is the person themselves, on the web.
    return grant?.role === 'agent' && !grant.name?.startsWith(BROWSER_PREFIX) ? grant.name?.replace(SERVICE_PREFIX, '') : undefined;
  }

  /** Bodies of your own self-sealed events of one kind. */
  #selfBodies(kind: string): Array<Record<string, unknown>> {
    return this.#kernel.memo(`self:${kind}`, () =>
      this.#kernel.decodeAll()
        .filter((d) => d.private && d.inner.kind === kind && d.inner.body && typeof d.inner.body === 'object')
        .map((d) => d.inner.body as Record<string, unknown>),
    );
  }

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

  // ---------------------------------------------------------------- direct chats between friends

  async chats(): Promise<ChatInfo[]> {
    const friends = new Set(this.#kernel.friends());
    this.#kernel.decodeAll();
    const chats: ChatInfo[] = [];
    for (const { space, peer } of this.#kernel.directs.values()) {
      const messages = messagesOf(this.#kernel.entries(space));
      const friend = friends.has(peer);
      const wrote = messages.some((m) => m.author === this.identity.author);
      if (!friend && !wrote) continue; // only friends can start a chat with you
      const last = messages.at(-1);
      chats.push({
        space: this.#kernel.spaceInfo(space),
        peer: { did: peer, name: this.nameOf(peer) },
        friend,
        ...(last ? { last: { text: (last.text || (last.file ? `📎 ${last.file.name}` : '')).slice(0, 140), time: last.time, mine: last.author === this.identity.author } } : {}),
      });
    }
    return chats.sort((a, b) => (b.last?.time ?? '').localeCompare(a.last?.time ?? '') || (a.peer.name ?? a.peer.did).localeCompare(b.peer.name ?? b.peer.did));
  }

  async openChat(who: string): Promise<SpaceInfo> {
    const peer = this.resolve(who);
    if (peer === this.identity.author) throw new Error('that is you');
    if (!this.#kernel.friends().includes(peer)) throw new Error(`you can chat with friends: people you follow who follow you back. ${this.nameOf(peer) ?? who} isn't one yet`);
    const space = this.#kernel.direct(peer);
    await Promise.all(spaceTopics(space, 0).map((topic) => this.#swarm?.join(topic)));
    return this.#kernel.spaceInfo(space);
  }


  /**
   * Close our invites that expired, naming who came in with each: later joins
   * with them don't count, whatever date they claim. Also our links from before
   * protocol 3, which have no key of their own (xQ0as76W): anyone in the space
   * could read their id and cite it, so they close as soon as this node runs
   * protocol 3, whoever came in with them staying in.
   */
  #closeInvites(space: StoredSpace): number {
    if (space.kind === 'direct') return 0;
    const now = new Date(this.clock()).toISOString();
    const decoded = this.#kernel.decodedIn(space.id);
    const closed = new Set(decoded.filter((d) => d.inner.kind === KIND_INVITE_CLOSE && d.event.author === this.identity.author).map((d) => (d.inner.body as { invite?: unknown } | null)?.invite));
    let n = 0;
    for (const d of decoded) {
      if (canonicalKind(d.inner.kind) !== KIND_INVITE || d.event.author !== this.identity.author) continue;
      const b = (d.inner.body ?? {}) as { invite?: unknown; expires?: unknown; key?: unknown };
      if (typeof b.invite !== 'string' || typeof b.expires !== 'string' || (b.expires > now && b.key === true) || closed.has(b.invite)) continue;
      const state = this.#kernel.state(space);
      const joined = [...state.members.values()].filter((m) => m.invite === b.invite).map((m) => m.did);
      this.replica.write(this.identity, sealFor(this.#managed.cipher(space), { kind: KIND_INVITE_CLOSE, body: { invite: b.invite, joined } }));
      closed.add(b.invite);
      n++;
    }
    return n;
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
    const board = stored && notice.open.post ? this.#kernel.spacePosts(stored).posts.find((p) => p.id === notice.open.post)?.board : undefined;
    return { ...notice, from: item.author, ...(board ? { board } : {}) };
  }

  async #noticeOf(item: FeedItem, anyAge = false): Promise<Notice | undefined> {
    const me = this.identity.author;
    if (item.author === me || item.private || (!anyAge && Date.now() - Date.parse(item.time) > 86_400_000)) return undefined;
    const body = (item.body && typeof item.body === 'object' && !Array.isArray(item.body) ? item.body : {}) as Record<string, Json>;
    const text = (key: string) => (typeof body[key] === 'string' ? (body[key] as string) : '');
    // What a message says: its text, or the file it brings.
    const said = () => text('text') || (attachmentOf(body) ? `📎 ${attachmentOf(body)!.name}` : '');
    const snippet = (value: string) => value.replace(/!\[[^\]]*\]\([^)]*\)/g, '[image]').replace(/weave:(?:invite|knock):[A-Za-z0-9_-]+/g, '[invite link]').replace(/\s+/g, ' ').trim().slice(0, 140);
    const who = item.authorName ?? this.nameOf(item.author) ?? 'Someone';
    const space = item.space;
    const where = space ? `${{ project: 'p/', community: 'r/', group: 'g/', direct: '@' }[space.kind]}${space.name}` : '';
    const POSTS = [KIND_POST, KIND_THREAD, KIND_ISSUE, KIND_PROPOSAL];
    const lookup = (id: Json | undefined, kinds: string[]) => {
      if (typeof id !== 'string') return undefined;
      try {
        const found = this.#kernel.find(id, kinds);
        const title = (found.inner.body as Record<string, Json> | null)?.title;
        return { id: found.id, author: found.event.author, title: typeof title === 'string' ? title : '' };
      } catch {
        return undefined;
      }
    };

    if (item.kind === KIND_MSG && space) {
      if (space.kind === 'direct') return { type: 'dm', category: 'messages', title: who, text: snippet(said()), name: 'daemon.notice.dm', values: { who }, open: { space } };
      const post = lookup(body.post, POSTS);
      const channel = text('channel') || 'general';
      const open = post ? { space, post: post.id } : { space, channel };
      const place = post ? `“${post.title}”` : `${where} #${channel}`;
      // Something live announced (a website opened, a version offered): news for everyone following the project.
      if (body.announce && space.kind === 'project' && !this.#homeHidden().has(space.id)) return { type: 'live', category: 'activity', title: `${who} ${snippet(said())}`, text: where, name: 'daemon.notice.live', values: { who, said: snippet(said()) }, open };
      const name = this.nameOf(me)?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (name && new RegExp(`@${name}(?![\\w-])`, 'i').test(text('text')))
        return { type: 'mention', category: 'messages', title: `${who} mentioned you in ${place}`, text: snippet(said()), name: 'daemon.notice.mention', values: { who, place }, open };
      if (lookup(body.replyTo, [KIND_MSG, KIND_REPLY])?.author === me) return { type: 'reply', category: 'messages', title: `${who} replied to you in ${place}`, text: snippet(said()), name: 'daemon.notice.reply', values: { who, place }, open };
      if (post?.author === me) return { type: 'reply', category: 'messages', title: `${who} in your post ${place}`, text: snippet(said()), name: 'daemon.notice.reply.post', values: { who, place }, open };
      return undefined;
    }
    if (item.kind === KIND_REPLY && space) {
      const target = lookup(body.target, POSTS);
      if (target?.author === me) return { type: 'reply', category: 'messages', title: `${who} replied to “${target.title}”`, text: snippet(text('text')), name: 'daemon.notice.reply.title', values: { who, title: target.title }, open: { space, post: target.id } };
      return undefined;
    }
    if (item.kind === KIND_POST || item.kind === KIND_ISSUE || item.kind === KIND_PROPOSAL) {
      const mine = new Set<string>([me, ...this.#agents.map((a) => a.did)]);
      const named = Array.isArray(body.with) ? body.with : [];
      const title = text('title') || snippet(text('text'));
      if (named.some((d) => typeof d === 'string' && mine.has(d))) return { type: 'coauthor', category: 'requests', title: `${who} named you as co-author`, text: title, name: 'daemon.notice.coauthor', values: { who }, open: { inbox: true } };
      // Unfollowed (off Home): no news from it. Followed communities tell you about every new post.
      if (!space || !title || this.#homeHidden().has(space.id)) return undefined;
      if (space.kind === 'community') return { type: 'post', category: 'activity', title: `New post in ${where}`, text: `${who}: ${title}`, name: 'daemon.notice.new', values: { type: 'post', where, who, title }, open: { space, post: item.id } };
      if (space.kind !== 'project') return undefined;
      const stored = this.#spaces.get(space.id);
      const board = stored && this.#kernel.spacePosts(stored).posts.find((p) => p.id === item.id)?.board;
      if (!board || !this.#follows(space.id, board)) return undefined;
      const type = item.kind === KIND_ISSUE ? 'issue' : item.kind === KIND_PROPOSAL ? 'proposal' : 'post';
      return { type, category: 'activity', title: `New ${type} in ${where}`, text: `${who}: ${title}`, name: 'daemon.notice.new', values: { type, where, who, title }, open: { space, post: item.id } };
    }
    if (item.kind === KIND_KNOCK) {
      const knock = (await this.knocks()).find((k) => k.id === item.id);
      if (knock) return { type: 'knock', category: 'requests', title: `${knock.name ?? who} asks to join ${knock.space.name}`, text: snippet(knock.note), name: 'daemon.notice.knock', values: { who: knock.name ?? who, space: knock.space.name }, open: { inbox: true } };
    }
    // A badge given or passed on to you: it shows on your hub, with its personal note if it has one.
    if ((item.kind === KIND_BADGE || item.kind === KIND_BADGE_TRANSFER) && body.to === me) {
      const badge = this.#payments.allBadges().badges.find((b) => b.id === (item.kind === KIND_BADGE ? item.id : body.badge));
      if (!badge || badge.invalid || badge.holder !== me) return undefined;
      const series = this.#payments.allBadges().series.find((s) => s.id === badge.series);
      if (!series || series.broken) return undefined;
      const name = `${series.symbol ? `${series.symbol} ` : ''}${series.name} #${badge.n}${series.limit ? ` of ${series.limit}` : ''}`;
      const text = item.kind === KIND_BADGE ? [badge.note ? `“${badge.note}”` : '', badge.personal ? 'With a personal note for you.' : ''].filter(Boolean).join(' ') : '';
      return {
        type: 'badge',
        category: 'activity',
        title: item.kind === KIND_BADGE ? `${who} gave you ${name}` : `${who} passed ${name} on to you`,
        text: snippet(text),
        name: item.kind === KIND_BADGE ? 'daemon.notice.badge.given' : 'daemon.notice.badge.passed',
        values: { who, badge: name, hasNote: badge.note ? 'yes' : 'no', note: snippet(badge.note ?? ''), personal: badge.personal ? 'yes' : 'no' },
        open: { hub: me },
      };
    }
    if (item.kind === KIND_MEMBERSHIP_REQUEST) {
      const request = (await this.membershipRequests()).find((r) => r.id === item.id);
      if (request) return { type: 'membership', category: 'requests', title: `${request.name ?? who} asks for ${request.tier.name}`, text: snippet(request.note), name: 'daemon.notice.membership', values: { who: request.name ?? who, tier: request.tier.name }, open: { inbox: true } };
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
    const hidden = this.#kernel.hiddenAuthors();
    const out: HeldNotice[] = [];
    for (const d of this.#kernel.decodeAll()) {
      if (d.private || !kinds.has(d.inner.kind) || d.event.author === me || hidden.has(d.event.author) || d.event.time <= since) continue;
      let notice = this.#heldNoticeCache.get(d.id);
      if (notice === undefined) {
        notice = (await this.#noticeFor(this.#kernel.toItem(d), true).catch(() => undefined)) ?? null;
        this.#heldNoticeCache.set(d.id, notice);
      }
      if (notice) out.push({ id: d.id, time: d.event.time, notice });
    }
    return out;
  }

  /** The event as this node can read it, or undefined if it can't (someone else's space or private data). */
  itemFor(event: WeaveRecord): FeedItem | undefined {
    const decoded = this.#kernel.decode(event);
    return decoded && this.#kernel.toItem(decoded);
  }


  // ManagedKeys (managed.ts): the node delegates.

  get kmsCredentials() {
    return this.#managed.kmsCredentials;
  }

  set kmsCredentials(value) {
    this.#managed.kmsCredentials = value;
  }

  manageSpace(...args: Parameters<ManagedKeys['manageSpace']>): ReturnType<ManagedKeys['manageSpace']> {
    return this.#managed.manageSpace(...args);
  }

  unlockSpace(...args: Parameters<ManagedKeys['unlockSpace']>): ReturnType<ManagedKeys['unlockSpace']> {
    return this.#managed.unlockSpace(...args);
  }

  destroyCompanyKey(...args: Parameters<ManagedKeys['destroyCompanyKey']>): ReturnType<ManagedKeys['destroyCompanyKey']> {
    return this.#managed.destroyCompanyKey(...args);
  }





  // Holding (holding.ts): the node delegates.

  get budgets() {
    return this.#holding.budgets;
  }

  set budgets(value) {
    this.#holding.budgets = value;
  }

  keepers(...args: Parameters<Holding['keepers']>): ReturnType<Holding['keepers']> {
    return this.#holding.keepers(...args);
  }

  letCopiesGo(...args: Parameters<Holding['letCopiesGo']>): ReturnType<Holding['letCopiesGo']> {
    return this.#holding.letCopiesGo(...args);
  }

  dropKept(...args: Parameters<Holding['dropKept']>): ReturnType<Holding['dropKept']> {
    return this.#holding.dropKept(...args);
  }

  get pulledAbove() {
    return this.#holding.pulledAbove;
  }

  set pulledAbove(value) {
    this.#holding.pulledAbove = value;
  }

  fetchOlder(...args: Parameters<Holding['fetchOlder']>): ReturnType<Holding['fetchOlder']> {
    return this.#holding.fetchOlder(...args);
  }

  // Forgetting (retention.ts): the node delegates.

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
    const space = this.#kernel.space(input.space);
    if (space.kind !== 'community' && space.kind !== 'project') throw new Error('only communities and projects are on Home');
    if (this.#homeHidden().has(space.id) === !input.visible) return this.#kernel.spaceInfo(space);
    this.replica.write(this.identity, this.#kernel.sealForSelf({ kind: KIND_HOME_HIDDEN, body: { space: space.id, hidden: !input.visible } }));
    return this.#kernel.spaceInfo(space);
  }

  async followBoard(input: { project: string; board: string; on: boolean }): Promise<BoardInfo[]> {
    const project = this.#kernel.project(input.project);
    const board = this.#kernel.board(project, this.#kernel.spacePosts(project).boards, input.board);
    if (this.#follows(project.id, board.name) !== input.on) {
      this.replica.write(this.identity, this.#kernel.sealForSelf({ kind: KIND_BOARD_FOLLOW, body: { space: project.id, board: board.name, on: input.on } }));
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
    const boardPosts = [...this.#spaces.values()].filter((s) => s.kind === 'project').flatMap((s) => this.#kernel.spacePosts(s).posts);
    // Posts of followed boards are on Home too: each post once.
    return [...new Map([...this.#kernel.homePosts(), ...boardPosts].map((p) => [p.id, p])).values()];
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
    if (matches.length === 0) throw new WeaveError('daemon.post.not.found.address', undefined, `no post found at that address (it may be in a project or community you're not in)`);
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

  // ---------------------------------------------------------------- modules: services and websites

  /** What services.ts reaches of the node: exactly what it uses. */
  /** What membership sees of the node, and nothing more (membership.ts). */
  static membershipCore(n: WeaveNode): MembershipCore {
    return {
      agentMay: n.#agentMay.bind(n),
      agentName: n.#agentName.bind(n),
      get agents() {
        return n.#agents;
      },
      get companies() {
        return n.#companies;
      },
      get encryptionKeyOf() {
        return n.#encryptionKeyOf;
      },
      get kernel() {
        return n.#kernel;
      },
      get managed() {
        return n.#managed;
      },
      selfBodies: n.#selfBodies.bind(n),
      get spaces() {
        return n.#spaces;
      },
      get spaceStorage() {
        return n.#spaceStorage;
      },
      get network() {
        return n.#swarm;
      },
      tryOpen: n.#tryOpen.bind(n),
    };
  }

  /** What the kernel sees of the node: the modules, and the host through its ports (kernel.ts). */
  static kernelCore(n: WeaveNode): KernelCore {
    return {
      agentMay: n.#agentMay.bind(n),
      agentName: n.#agentName.bind(n),
      boardFollows: n.#boardFollows.bind(n),
      get companies() {
        return n.#companies;
      },
      get content() {
        return n.#content;
      },
      doorSecret: n.#doorSecret.bind(n),
      get encryptionKeyOf() {
        return n.#encryptionKeyOf;
      },
      farewells: n.#farewells.bind(n),
      follows: n.#follows.bind(n),
      frontDoor: n.#frontDoor.bind(n),
      get holding() {
        return n.#holding;
      },
      homeHidden: n.#homeHidden.bind(n),
      looksOnly: n.#looksOnly.bind(n),
      get managed() {
        return n.#managed;
      },
      meetSecret: n.#meetSecret.bind(n),
      meetingTopics: n.#meetingTopics.bind(n),
      myEncryptionPairs: n.#myEncryptionPairs.bind(n),
      get people() {
        return n.#people;
      },
      prefix: n.#prefix.bind(n),
      get retention() {
        return n.#retention;
      },
      get seenAt() {
        return n.#seenAt;
      },
      selfBodies: n.#selfBodies.bind(n),
      selfSecret: n.#selfSecret.bind(n),
      get services() {
        return n.#services;
      },
      get spaces() {
        return n.#spaces;
      },
      get network() {
        return n.#swarm;
      },
      theirMeets: n.#theirMeets.bind(n),
      tryOpen: n.#tryOpen.bind(n),
      get spaceStorage() {
        return n.#spaceStorage;
      },
      saveConfig: () => saveConfig(n.home, n.config),
    };
  }

  /** What company accounts see of the node, and nothing more (companies.ts). */
  static companiesCore(n: WeaveNode): CompaniesCore {
    return {
      agentName: n.#agentName.bind(n),
      anchor: n.#kernel.anchor.bind(n.#kernel),
      createSpace: n.#kernel.createSpace.bind(n.#kernel),
      decodeAll: n.#kernel.decodeAll.bind(n.#kernel),
      decodedIn: n.#kernel.decodedIn.bind(n.#kernel),
      get directs() {
        return n.#kernel.directs;
      },
      get encryptionKeyOf() {
        return n.#encryptionKeyOf;
      },
      entryPoint: n.#kernel.entryPoint.bind(n.#kernel),
      epochStarts: n.#kernel.epochStarts.bind(n.#kernel),
      // Lazily: retention is built after this module.
      held: (state) => n.#retention.held(state),
      keysForNewcomers: n.#kernel.keysForNewcomers.bind(n.#kernel),
      get managed() {
        return n.#managed;
      },
      memo: n.#kernel.memo.bind(n.#kernel),
      space: n.#kernel.space.bind(n.#kernel),
      get spaces() {
        return n.#spaces;
      },
      get sqlite() {
        return n.#sqlite;
      },
      state: n.#kernel.state.bind(n.#kernel),
      tryOpen: n.#tryOpen.bind(n),
      upTo: n.#kernel.upTo.bind(n.#kernel),
    };
  }

  /** What apps and releases see of the node, and nothing more (apps.ts). */
  static appsCore(n: WeaveNode): AppsCore {
    return {
      agentMay: n.#agentMay.bind(n),
      announce: n.#kernel.announce.bind(n.#kernel),
      entries: n.#kernel.entries.bind(n.#kernel),
      get fetchers() {
        return n.#fetchers;
      },
      maintainerState: n.#kernel.maintainerState.bind(n.#kernel),
      project: n.#kernel.project.bind(n.#kernel),
      get services() {
        return n.#services;
      },
      spaceName: n.#kernel.spaceName.bind(n.#kernel),
      get spaces() {
        return n.#spaces;
      },
      state: n.#kernel.state.bind(n.#kernel),
      get updates() {
        return n.#updates;
      },
    };
  }

  /** What content sees of the node, and nothing more (content.ts). */
  static contentCore(n: WeaveNode): ContentCore {
    return {
      access: n.#kernel.access.bind(n.#kernel),
      actor: n.#kernel.actor.bind(n.#kernel),
      agentMay: n.#agentMay.bind(n),
      get agents() {
        return n.#agents;
      },
      allPosts: n.#allPosts.bind(n),
      board: n.#kernel.board.bind(n.#kernel),
      chatOf: n.#chatOf.bind(n),
      decodeAll: n.#kernel.decodeAll.bind(n.#kernel),
      get directs() {
        return n.#kernel.directs;
      },
      entries: n.#kernel.entries.bind(n.#kernel),
      find: n.#kernel.find.bind(n.#kernel),
      follows: n.#follows.bind(n),
      friends: n.#kernel.friends.bind(n.#kernel),
      get holding() {
        return n.#holding;
      },
      homePosts: n.#kernel.homePosts.bind(n.#kernel),
      issueById: n.#kernel.issueById.bind(n.#kernel),
      issueInfo: n.#kernel.issueInfo.bind(n.#kernel),
      knownGroup: n.#kernel.knownGroup.bind(n.#kernel),
      maintainerState: n.#kernel.maintainerState.bind(n.#kernel),
      get managed() {
        return n.#managed;
      },
      managers: n.#kernel.managers.bind(n.#kernel),
      messageInfo: n.#kernel.messageInfo.bind(n.#kernel),
      page: n.#kernel.page.bind(n.#kernel),
      get payments() {
        return n.#payments;
      },
      postAt: n.#postAt.bind(n),
      get prefetched() {
        return n.#prefetched;
      },
      project: n.#kernel.project.bind(n.#kernel),
      projectPost: n.#kernel.projectPost.bind(n.#kernel),
      proposalInfo: n.#kernel.proposalInfo.bind(n.#kernel),
      reconcileBoards: n.#kernel.reconcileBoards.bind(n.#kernel),
      ruleInfo: n.#kernel.ruleInfo.bind(n.#kernel),
      sealForSelf: n.#kernel.sealForSelf.bind(n.#kernel),
      get seenAt() {
        return n.#seenAt;
      },
      get sessions() {
        return n.#sessions;
      },
      space: n.#kernel.space.bind(n.#kernel),
      spaceInfo: n.#kernel.spaceInfo.bind(n.#kernel),
      spacePosts: n.#kernel.spacePosts.bind(n.#kernel),
      get spaces() {
        return n.#spaces;
      },
      state: n.#kernel.state.bind(n.#kernel),
      get swarm() {
        return n.#swarm;
      },
      threadInfo: n.#kernel.threadInfo.bind(n.#kernel),
      voters: n.#kernel.voters.bind(n.#kernel),
    };
  }

  /** What people see of the node, and nothing more (people.ts). */
  static peopleCore(n: WeaveNode): PeopleCore {
    return {
      access: n.#kernel.access.bind(n.#kernel),
      actor: n.#kernel.actor.bind(n.#kernel),
      adoptBootstrap: n.#kernel.adoptBootstrap.bind(n.#kernel),
      agentMay: n.#agentMay.bind(n),
      get agents() {
        return n.#agents;
      },
      allPosts: n.#allPosts.bind(n),
      get companies() {
        return n.#companies;
      },
      get contactCache() {
        return n.#kernel.contactCache;
      },
      setContactCache: (value) => {
        n.#kernel.contactCache = value;
      },
      decodeAll: n.#kernel.decodeAll.bind(n.#kernel),
      decodedIn: n.#kernel.decodedIn.bind(n.#kernel),
      deviceSignIn: startDeviceSignIn,
      get decodedRevision() {
        return n.#kernel.decodedRevision;
      },
      direct: n.#kernel.direct.bind(n.#kernel),
      doorSecret: n.#doorSecret.bind(n),
      entries: n.#kernel.entries.bind(n.#kernel),
      entryPoint: n.#kernel.entryPoint.bind(n.#kernel),
      eventsOf: n.#eventsOf.bind(n),
      graph: n.#kernel.graph.bind(n.#kernel),
      get managed() {
        return n.#managed;
      },
      projectPost: n.#kernel.projectPost.bind(n.#kernel),
      sealForSelf: n.#kernel.sealForSelf.bind(n.#kernel),
      selfBodies: n.#selfBodies.bind(n),
      space: n.#kernel.space.bind(n.#kernel),
      get spaces() {
        return n.#spaces;
      },
      state: n.#kernel.state.bind(n.#kernel),
      get verifiers() {
        return n.#verifiers;
      },
    };
  }

  /** What agents and sessions see of the node, and nothing more (sessions.ts). */
  static sessionsCore(n: WeaveNode): SessionsCore {
    return {
      get agents() {
        return n.#agents;
      },
      allPosts: n.#allPosts.bind(n),
      board: n.#kernel.board.bind(n.#kernel),
      // Lazily: people are built after sessions.
      contacts: () => n.#people.contacts(),
      decodeAll: n.#kernel.decodeAll.bind(n.#kernel),
      emitLive: n.#emitLive.bind(n),
      entries: n.#kernel.entries.bind(n.#kernel),
      hiddenAuthors: n.#kernel.hiddenAuthors.bind(n.#kernel),
      get hints() {
        return n.#hints;
      },
      hintsChanged: n.#hintsChanged.bind(n),
      get hintsListeners() {
        return n.#hintsListeners;
      },
      get holding() {
        return n.#holding;
      },
      get keyvaults() {
        return n.#keyvaults;
      },
      get liveListeners() {
        return n.#liveListeners;
      },
      looksOnly: n.#looksOnly.bind(n),
      maintainerState: n.#kernel.maintainerState.bind(n.#kernel),
      get managed() {
        return n.#managed;
      },
      get marks() {
        return n.#marks;
      },
      marksChanged: n.#marksChanged.bind(n),
      get marksListeners() {
        return n.#marksListeners;
      },
      noticeFor: n.#noticeFor.bind(n),
      postAt: n.#postAt.bind(n),
      project: n.#kernel.project.bind(n.#kernel),
      sealForSelf: n.#kernel.sealForSelf.bind(n.#kernel),
      space: n.#kernel.space.bind(n.#kernel),
      spacePosts: n.#kernel.spacePosts.bind(n.#kernel),
      get spaces() {
        return n.#spaces;
      },
      state: n.#kernel.state.bind(n.#kernel),
      get swarm() {
        return n.#swarm;
      },
    };
  }

  /** What retention sees of the node, and nothing more (retention.ts). */
  static retentionCore(n: WeaveNode): RetentionCore {
    return {
      aroundPosts: n.#kernel.aroundPosts.bind(n.#kernel),
      board: n.#kernel.board.bind(n.#kernel),
      get companies() {
        return n.#companies;
      },
      decodeAll: n.#kernel.decodeAll.bind(n.#kernel),
      invalidateDecoded: () => {
        n.#kernel.invalidateDecoded();
      },
      decodedIn: n.#kernel.decodedIn.bind(n.#kernel),
      entries: n.#kernel.entries.bind(n.#kernel),
      epochStarts: n.#kernel.epochStarts.bind(n.#kernel),
      expandCarry: n.#kernel.expandCarry.bind(n.#kernel),
      get managed() {
        return n.#managed;
      },
      get payments() {
        return n.#payments;
      },
      saveSpace: n.#kernel.saveSpace.bind(n.#kernel),
      sealForSelf: n.#kernel.sealForSelf.bind(n.#kernel),
      space: n.#kernel.space.bind(n.#kernel),
      spaceInfo: n.#kernel.spaceInfo.bind(n.#kernel),
      spacePosts: n.#kernel.spacePosts.bind(n.#kernel),
      get spaces() {
        return n.#spaces;
      },
      state: n.#kernel.state.bind(n.#kernel),
    };
  }

  /** What holding sees of the node, and nothing more (holding.ts). */
  static holdingCore(n: WeaveNode): HoldingCore {
    return {
      actor: n.#kernel.actor.bind(n.#kernel),
      addSpace: n.#kernel.addSpace.bind(n.#kernel),
      get companies() {
        return n.#companies;
      },
      invalidateDecoded: () => {
        n.#kernel.invalidateDecoded();
      },
      decodedIn: n.#kernel.decodedIn.bind(n.#kernel),
      get directs() {
        return n.#kernel.directs;
      },
      ensureDirects: n.#kernel.ensureDirects.bind(n.#kernel),
      follows: n.#follows.bind(n),
      friends: n.#kernel.friends.bind(n.#kernel),
      // Lazily: retention is built after this module.
      held: (state) => n.#retention.held(state),
      resolve: (who) => n.resolve(who),
      get isLinkedNode() {
        return n.#isLinkedNode;
      },
      get readsNodeIndex() {
        return n.#isLinkedNode || n.#isLinkedBrowser;
      },
      keysOnly: n.#kernel.keysOnly.bind(n.#kernel),
      get managed() {
        return n.#managed;
      },
      managers: n.#kernel.managers.bind(n.#kernel),
      sealForSelf: n.#kernel.sealForSelf.bind(n.#kernel),
      selfBodies: n.#selfBodies.bind(n),
      selfSecret: n.#selfSecret.bind(n),
      space: n.#kernel.space.bind(n.#kernel),
      spaceName: n.#kernel.spaceName.bind(n.#kernel),
      spacePosts: n.#kernel.spacePosts.bind(n.#kernel),
      get spaces() {
        return n.#spaces;
      },
      state: n.#kernel.state.bind(n.#kernel),
      get swarm() {
        return n.#swarm;
      },
    };
  }

  /** What money sees of the node, and nothing more (payments.ts). */
  static paymentsCore(n: WeaveNode): PaymentsCore {
    return {
      anchor: n.#kernel.anchor.bind(n.#kernel),
      createSpace: n.#kernel.createSpace.bind(n.#kernel),
      direct: n.#kernel.direct.bind(n.#kernel),
      get encryptionKeyOf() {
        return n.#encryptionKeyOf;
      },
      entries: n.#kernel.entries.bind(n.#kernel),
      entryPoint: n.#kernel.entryPoint.bind(n.#kernel),
      eventsOf: n.#eventsOf.bind(n),
      keysForNewcomers: n.#kernel.keysForNewcomers.bind(n.#kernel),
      maintainerState: n.#kernel.maintainerState.bind(n.#kernel),
      get managed() {
        return n.#managed;
      },
      project: n.#kernel.project.bind(n.#kernel),
      saveSpace: n.#kernel.saveSpace.bind(n.#kernel),
      sealForSelf: n.#kernel.sealForSelf.bind(n.#kernel),
      get seenAt() {
        return n.#seenAt;
      },
      selfBodies: n.#selfBodies.bind(n),
      space: n.#kernel.space.bind(n.#kernel),
      get spaces() {
        return n.#spaces;
      },
      state: n.#kernel.state.bind(n.#kernel),
      tryOpen: n.#tryOpen.bind(n),
      upTo: n.#kernel.upTo.bind(n.#kernel),
    };
  }

  /** What the key service sees of the node, and nothing more (managed.ts). */
  static managedCore(n: WeaveNode): ManagedCore {
    return {
      invalidateDecoded: () => {
        n.#kernel.invalidateDecoded();
      },
      // Lazily: the key service is built before company accounts are.
      delegated: (scope) => n.#companies.delegated(scope),
      // Lazily: retention is built after this module.
      held: (state) => n.#retention.held(state),
      rotateKey: n.#kernel.rotateKey.bind(n.#kernel),
      saveSpace: n.#kernel.saveSpace.bind(n.#kernel),
      space: n.#kernel.space.bind(n.#kernel),
      spaceInfo: n.#kernel.spaceInfo.bind(n.#kernel),
      get spaces() {
        return n.#spaces;
      },
      ssoToken: () => n.#companies.ssoToken(),
      state: n.#kernel.state.bind(n.#kernel),
    };
  }

  static servicesHost(n: WeaveNode) {
    return {
      actor: n.#kernel.actor.bind(n.#kernel),
      get agents() {
        return n.#agents;
      },
      set agents(value) {
        n.#agents = value;
      },
      cipher: n.#managed.cipher.bind(n.#managed),
      decode: n.#kernel.decode.bind(n.#kernel),
      decodeAll: n.#kernel.decodeAll.bind(n.#kernel),
      emitLive: n.#emitLive.bind(n),
      entries: n.#kernel.entries.bind(n.#kernel),
      find: n.#kernel.find.bind(n.#kernel),
      marksChanged: n.#marksChanged.bind(n),
      hintsChanged: n.#hintsChanged.bind(n),
      memo: n.#kernel.memo.bind(n.#kernel),
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
      project: n.#kernel.project.bind(n.#kernel),
      publish: n.publish.bind(n),
      get releases() {
        return n.#releases;
      },
      /** Blobs kept here, and asking peers for those that aren't (a release from Weave's files). */
      get blobs() {
        return n.blobs;
      },
      wantBlobs: (hashes: string[]) => n.#swarm?.want(hashes),
      get replica() {
        return n.replica;
      },
      get runtime() {
        return n.#runtime;
      },
      sealForSelf: n.#kernel.sealForSelf.bind(n.#kernel),
      /** The key to seal something to a person with, and opening what was sealed to me. */
      encryptionKeyOf: (person: Did) => n.#encryptionKeyOf(person),
      tryOpen: n.#tryOpen.bind(n),
      space: n.#kernel.space.bind(n.#kernel),
      spaceName: n.#kernel.spaceName.bind(n.#kernel),
      get spaces() {
        return n.#spaces;
      },
      state: n.#kernel.state.bind(n.#kernel),
      toItem: n.#kernel.toItem.bind(n.#kernel),
      /** Accounts elsewhere said in a space, checked. */
      accounts: (space: StoredSpace, platform: string) => n.accounts({ space: space.id }).then((all) => all.filter((a) => a.platform === platform)),
      /** My keyvaults: what my services get access through. */
      keyvaults: () => n.#keyvaults,
      /** Your own account on a platform, proven (on your hub or in any space of yours): its handle. */
      myAccount: (platform: string) => n.myAccounts().then((all) => all.find((a) => a.platform === platform && a.verified)?.handle),
      /** Who reads a board of a project (everyone, for a board nobody limited). */
      boardReaders: (space: StoredSpace, board: string) => n.#kernel.readersOf(space, n.#kernel.state(space), n.#kernel.entries(space), board),
      /** Who reads a space (or one of its boards). */
      readers: (space: StoredSpace, board?: string) => n.#kernel.readersOf(space, n.#kernel.state(space), n.#kernel.entries(space), board),
    };
  }

  /** What website.ts reaches of the node: exactly what it uses. */
  static websiteHost(n: WeaveNode) {
    return {
      agentName: n.#agentName.bind(n),
      get agents() {
        return n.#agents;
      },
      allBadges: n.#payments.allBadges.bind(n.#payments),
      allShows: n.#payments.allShows.bind(n.#payments),
      cipher: n.#managed.cipher.bind(n.#managed),
      get clock() {
        return n.clock;
      },
      emitLive: n.#emitLive.bind(n),
      entries: n.#kernel.entries.bind(n.#kernel),
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
      myTickets: n.#payments.myTickets.bind(n.#payments),
      nameOf: n.nameOf.bind(n),
      project: n.#kernel.project.bind(n.#kernel),
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
      showRef: n.#payments.showRef.bind(n.#payments),
      space: n.#kernel.space.bind(n.#kernel),
      spaceName: n.#kernel.spaceName.bind(n.#kernel),
      get spaces() {
        return n.#spaces;
      },
      state: n.#kernel.state.bind(n.#kernel),
      get swarm() {
        return n.#swarm;
      },
      ticketRecords: n.#payments.ticketRecords.bind(n.#payments),
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
    const project = this.#kernel.project(input.project).id;
    if (announce !== false)
      void this.#services.launchedWebsite(service.name).then((room) => (room ? this.#kernel.announce(project, { kind: 'website', id: room }, `started ${service.artifact?.name ?? service.name}: come and join`) : undefined)).catch(() => {});
    return service;
  }

  programConsents(...args: Parameters<Services['programConsents']>): ReturnType<Services['programConsents']> {
    return this.#services.programConsents(...args);
  }

  withdrawProgramConsent(...args: Parameters<Services['withdrawProgramConsent']>): ReturnType<Services['withdrawProgramConsent']> {
    return this.#services.withdrawProgramConsent(...args);
  }

  withdrawArtifact(...args: Parameters<Services['withdrawArtifact']>): ReturnType<Services['withdrawArtifact']> {
    return this.#services.withdrawArtifact(...args);
  }

  setArtifactAccess(...args: Parameters<Services['setArtifactAccess']>): ReturnType<Services['setArtifactAccess']> {
    return this.#services.setArtifactAccess(...args);
  }

  async releaseFile(input: { project: string; tag: string; file: string; repo?: string; name?: string; type?: string; as?: string }): Promise<ArtifactInfo> {
    if (input.as) this.#agentMay(input.as, KIND_SERVICE_REQUEST);
    const project = this.#kernel.project(input.project);
    this.#kernel.maintainerState(project);
    const from = this.#apps.releaseLine(project, input.repo ? { source: input.repo } : {});
    const data = (await this.#services.askProvider(project, 'publish', { source: from.ref, tag: input.tag.trim(), file: input.file, ...(input.name ? { name: input.name } : {}), ...(input.type ? { type: input.type } : {}) }, input.as, from.provider)) as { id?: string };
    const found = (await this.artifacts(project.id)).find((a) => a.id === data.id);
    if (!found) throw new Error(`${input.file} was published, but isn't an artifact of ${project.name} here: is its provider's person a maintainer?`);
    await this.#kernel.announce(project.id, { kind: 'release', id: found.id }, `${found.name} ${found.tag} is available`);
    return found;
  }

  async getArtifactFile(input: { project: string; artifact: string }): Promise<{ path: string; by: string }> {
    const project = this.#kernel.project(input.project);
    const a = artifactsOf(this.#kernel.entries(project), this.#kernel.state(project).maintainers).find((x) => x.id === input.artifact);
    if (!a) throw new Error(`${project.name} has no such artifact`);
    if (a.kind !== 'file') throw new Error(`${a.manifest.name} is a ${a.kind.replace('-', ' ')}: something to use, not a file to get`);
    // How far it got, for the app to show while it waits (artifactFileJob); gone once the file is here.
    const job = `file:${project.id}:${a.id}`;
    const size = fileAssetOf(a.manifest)?.size;
    const progress = { state: 'downloading' as const, done: 0, ...(size ? { total: size } : {}) };
    this.#releases.jobs.set(job, { progress });
    try {
      const got = await this.#releases.getFile(joinPath(this.home.dir, 'files', project.id, `${a.manifest.app}-${a.tag.replace(/[^A-Za-z0-9._-]/g, '_')}`), { project: project.id, id: a.id, tag: a.tag, manifest: a.manifest }, (n) => void (progress.done += n));
      this.#releases.jobs.delete(job);
      return got;
    } catch (error) {
      this.#releases.jobs.set(job, { error: (error as Error).message });
      throw error;
    }
  }

  async artifactFileJob(input: { project: string; artifact: string }): Promise<InstallJob | undefined> {
    return this.#releases.jobs.get(`file:${this.#kernel.project(input.project).id}:${input.artifact}`);
  }

  /** My fetchers: client apps that fetch artifacts for me (fetchers.ts). */
  get #fetchers(): Fetchers {
    return this.#releases.fetchers!;
  }

  #fetcherInfo(f: StoredFetcherInfo, added = true): FetcherInfo {
    const projects = f.projects === 'all' ? ('all' as const) : f.projects.flatMap((id) => (this.#spaces.has(id) ? [{ id, name: this.#kernel.spaceName(this.#spaces.get(id)!) }] : []));
    return { ...f, projects, added };
  }

  async fetchers(): Promise<FetcherInfo[]> {
    const mine = this.#fetchers.list();
    const more = this.#fetchers.shipped().filter((s) => !mine.some((f) => f.name === s.name));
    return [...mine.map((f) => this.#fetcherInfo(f)), ...more.map((s) => this.#fetcherInfo({ name: s.name, title: s.manifest.name, ...(s.about ? { about: s.about } : {}), digest: s.digest, projects: [], settings: s.manifest.env ?? [], filled: [], net: s.manifest.fetcher?.net ?? [] }, false))];
  }

  #projectIds(projects: string[] | 'all'): string[] | 'all' {
    return projects === 'all' ? 'all' : projects.map((p) => this.#kernel.project(p).id);
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
    const ref = (id: string) => ({ id, name: this.#spaces.has(id) ? this.#kernel.spaceName(this.#spaces.get(id)!) : id });
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

  /** Remove a keyvault: its apps uninstalled first, and where to delete each on its platform. */
  async removeKeyvault(name: string): Promise<{ forgotten: ForgottenApp[] }> {
    return { forgotten: await this.#keyvaults.remove(name) };
  }

  async addClientApp(input: { project: string; artifact?: string; approve?: boolean }): Promise<KeyvaultInfo | FetcherInfo> {
    const { project, artifact } = this.#services.artifact(input.project, input.artifact);
    const kind = artifact.kind === 'keyvault' || artifact.kind === 'fetcher' ? artifact.kind : undefined;
    if (!kind) throw new Error(`${artifact.manifest.name} ${artifact.tag} is a ${artifact.kind}, not a keyvault or fetcher: add it where it goes (a project's services)`);
    const reaches = (artifact.manifest.keyvault?.net ?? artifact.manifest.fetcher?.net ?? []).join(', ') || 'nothing';
    if (!input.approve) throw new Error(`approve it first: Weave would run ${artifact.manifest.name} ${artifact.tag}, released in ${this.#kernel.spaceName(project)}, as your ${kind}${kind === 'keyvault' ? ` for ${artifact.manifest.keyvault!.platform} (it holds your access there)` : ''}; it reaches ${reaches} over HTTPS`);
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
    if (c.kind === 'keyvault' && this.#keyvaults.list().some((k) => k.name === name)) await this.#keyvaults.remove(name);
    if (c.kind === 'fetcher' && this.#fetchers.list().some((f) => f.name === name)) this.#fetchers.remove(name);
    this.#clientApps.remove(name);
  }

  /** Make one of a keyvault's apps: for your own account, or (owner) for an organization of yours. */
  async startKeyvaultApp(input: { name: string; setting: string; owner?: string }): Promise<{ id: string; url: string }> {
    const k = this.#keyvaults.list().find((x) => x.name === input.name);
    // Named for whose it is: the account you proved there, else your name here.
    const proven = k ? (await this.myAccounts().catch(() => [])).find((a) => a.platform === k.platform && a.verified)?.handle : undefined;
    return this.#keyvaults.startApp({ ...input, account: proven ?? this.#kernel.actor(this.identity.author, this.identity.author).name ?? 'your', fetch: this.oauthSetup.fetch });
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

  async removeKeyvaultApp(input: { name: string; app: string }): Promise<KeyvaultInfo & { forgotten: ForgottenApp }> {
    const { state, forgotten } = await this.#keyvaults.removeApp(input);
    const k = this.#keyvaultInfo(state);
    for (const u of k.users) this.#services.restartSoon(u.service);
    return { ...k, forgotten };
  }

  async handKeyvault(input: { name: string; app?: string; project: string; resources: string[] }): Promise<KeyvaultInfo> {
    const k = this.#keyvaultInfo(this.#keyvaults.hand({ name: input.name, ...(input.app ? { app: input.app } : {}), project: this.#kernel.project(input.project).id, resources: input.resources }));
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

  websitePass(...args: Parameters<Website['websitePass']>): ReturnType<Website['websitePass']> {
    return this.#website.websitePass(...args);
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

  /** How long installing a release from Weave waits for each of its blobs (tests shorten it). */
  get blobWait(): number {
    return this.#services.blobWait;
  }

  set blobWait(ms: number) {
    this.#services.blobWait = ms;
  }

  /** Open a website in a project, and (unless announce is false) say so in its chat: people find it there. */
  async openWebsite(input: Parameters<Website['openWebsite']>[0] & { announce?: boolean }): Promise<WebsiteInfo> {
    const { announce, ...rest } = input;
    const site = await this.#website.openWebsite(rest);
    if (announce !== false) await this.#kernel.announce(site.project.id, { kind: 'website', id: site.id }, `opened ${site.name}: come and join`);
    return site;
  }
}

export const agentInfo = (agent: AgentKey): AgentInfo => ({ name: agent.name, did: agent.did, permissions: agent.permissions });

/** This computer's name, for naming its device key. */
const deviceName = (): string => hostname().slice(0, 40) || 'device';


/** Where new Weave versions are announced: release posts in the Weave project, and its repository. */
export const UPDATE_SOURCE = { project: 'NqgQwm_P6I0gtnQDnZKURw', repo: 'martl-projects/Weave', artifact: 'weave-desktop' };
/** Where the farewell to v0.3 peers sends them. */
const RELEASES_URL = `https://github.com/${UPDATE_SOURCE.repo}/releases/latest`;

/** Contacts and free tiers an app ships with for newcomers (see weave.bundle.json). */
export interface Bundle {
  contacts?: string[];
  tiers?: Array<{ tier: string; creator: Did; note?: string }>;
}


/** What services.ts and website.ts reach of the node. */
export type ServicesHost = ReturnType<typeof WeaveNode.servicesHost>;
export type WebsiteHost = ReturnType<typeof WeaveNode.websiteHost>;
