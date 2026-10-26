import { type StoredSpace } from './spacestore.ts';
import { type AppAsset, type AppImage, type AppInstall, type AppManifest, type Artifact, artifactsOf, b64u, type Box, boxTo, compareVersions, createSubKey, delegation, type Did, type Entry, type EventFields, formatVersion, type Inner, isRepoName, type Json, KIND_APP, KIND_ROOM, KIND_SERVICE_IN, KIND_SERVICE_PROFILE, KIND_SERVICE_REQUEST, KIND_SERVICE_RESULT, mayAct, openBox, parseContract, parseManifest, parsePages, parseVersion, profilesOf, randomBytes, reposOf, requestsOf, revocation, type Room, type RoomPages, roomsOf, sealFor, SERVICE_PREFIX, type ServiceContract, serviceName, servicePermissions, serviceReads, servicesIn as servicesInSpace, showOpen, type SpaceKind, type SpaceState, startCommand, type WeaveRecord } from '@weave/core';
import { LiveRooms, portOpen } from './live.ts';
import { Payments } from './payments.ts';
import { Badges } from './badges.ts';
import { type AgentKey, createAndSaveAgent, saveAgent } from './keystore.ts';
import { type Actor, type AppEnv, type AppPerson, type ArtifactInfo, type FeedItem, type HostedRoomInfo, type Notice, type RoomChatMessage, type RoomInfo, type ServiceGate, type ServiceInfo, type ServiceProfileInfo, type ServiceRequestInfo, type UpdateInfo } from './backend.ts';
import { ManagedKeys } from './managed.ts';
import { roomKeyPair, SwarmNode } from '@weave/net';
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { machinePolicy } from './machine.ts';
import { GitHub, type ReleaseAsset } from './github.ts';
import { AppApiError, type AppApiServer, sameToken, startAppApi } from './appapi.ts';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join as joinPath, resolve as resolvePath } from 'node:path';
import { guessPlatform, platformKey, saveVerified, tagFolder, unpack } from './appinstall.ts';
import { writeJson } from './home.ts';
import { imageDigest, imageLocation } from './registry.ts';
import { readSecretJson, writeSecretJson } from './vault.ts';
import { launchFingerprint } from './applaunch.ts';
import { type WeaveNode, type Decoded, NODE_PREFIX, type RoomHandler, type StoredArtifact, type StoredRoom, UPDATE_SOURCE } from './node.ts';

/*
 * Services (v0.20): code run under keys of their own, with exactly their
 * contract's rights; artifacts (a project's releases, fetched pinned and run
 * as services); rooms offered by the room service; containers, updates and the
 * API apps and services ask Weave through. It sees the node's internals only
 * through ServicesCore.
 */



/** A GitHub sign-in waiting for its code, or why the last one failed. */
/** An app being installed from its release, or why that failed. */
interface InstallJob {
  progress?: { state: 'downloading' | 'unpacking'; done: number; total?: number };
  error?: string;
}

/** An event as this node can read it, before names are resolved. */
/** A service handed to an always-on node (the body of a handover, sealed to yourself). */
interface Handover {
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
  builtin?: 'room';
  hosted?: Record<string, StoredRoom>;
  approved?: string[];
}

/** A service as this node keeps it: sealed in services.json, with its settings and the token of its API. */
interface StoredService {
  name: string;
  description: string;
  icon?: string;
  contract: ServiceContract;
  /** Space ids it was added to. */
  spaces: string[];
  command?: string[];
  settings: Record<string, string>;
  token: string;
  enabled: boolean;
  /** Settings given per space: space id → name → value (it reads them from its API). */
  spaceSettings?: Record<string, Record<string, string>>;
  /** A service Weave ships, run by the node itself: the room service. */
  builtin?: 'room';
  /** The room service's rooms: room id → room, kept across restarts. */
  hosted?: Record<string, StoredRoom>;
  /** What you approved its rooms to run: fingerprints of a release's command, or of a command in a folder. */
  approved?: string[];
}

/**
 * Sealed to yourself, by one of your computers: a service for one of your always-on nodes. Its configuration in the
 * clear for your devices; its key and settings in a box only that node opens. Later ones change or remove it.
 */
const KIND_SERVICE_HANDOVER = 'weave.service.handover';

/** A promise that gives up after `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timed out')), ms).unref())]);
}

/** What Services needs of the node's internals, and nothing more (the node builds it in its constructor). */
export interface ServicesCore {
  project(ref: string): StoredSpace;
  agentMay(name: string, kind: string): void;
  maintainerState(project: StoredSpace): SpaceState;
  state(space: StoredSpace): SpaceState;
  entries(space: StoredSpace): Entry[];
  readonly spaces: Map<string, StoredSpace>;
  githubAuth(): { token: string; login: string } | undefined;
  readonly live: LiveRooms;
  spaceName(space: StoredSpace): string;
  readonly payments: Payments;
  readonly badges: Badges;
  readonly isLinkedNode: boolean;
  agentName(signer: Did, author: Did): string | undefined;
  selfSecret(): Uint8Array;
  readonly agents: AgentKey[];
  readonly liveListeners: Set<(notice?: Notice) => void>;
  space(ref: string, kind?: SpaceKind): StoredSpace;
  readonly managed: ManagedKeys;
  actor(author: Did, signer: Did): Actor;
  readonly swarm: SwarmNode | undefined;
  decodeAll(): Decoded[];
  sealForSelf(inner: Inner): EventFields;
  setAgents(agents: AgentKey[]): void;
  toItem(decoded: Decoded): FeedItem;
  decode(event: WeaveRecord): Decoded | undefined;
  find(ref: string, kinds: string[]): Decoded & { id: string };
}

export class Services {
  private readonly node: WeaveNode;
  private readonly core: ServicesCore;

  constructor(node: WeaveNode, core: ServicesCore) {
    this.node = node;
    this.core = core;
  }

  // ---------------------------------------------------------------- rooms and shared apps

  async projectApp(ref: string): Promise<AppManifest | null> {
    return this.app(this.core.project(ref)) ?? null;
  }

  async publishApp(input: { project: string; manifest: unknown; as?: string }): Promise<AppManifest> {
    if (input.as) this.core.agentMay(input.as, KIND_APP);
    const project = this.core.project(input.project);
    this.core.maintainerState(project);
    let manifest = parseManifest(input.manifest);
    // weave.app.json usually doesn't list the release files ("weave app release" adds them): keep the ones published.
    const before = this.app(project)?.install;
    if (before?.assets && !manifest.install?.assets) manifest = { ...manifest, install: { ...before, ...(manifest.install?.steps ? { steps: manifest.install.steps } : {}) } };
    await this.node.publish({ kind: KIND_APP, body: manifest as unknown as Json, space: project.id, as: input.as });
    return manifest;
  }

  // ---------------------------------------------------------------- apps in containers (Weave and Docker)

  /** Whether Docker answers on this computer: asked at most every 30 seconds. */
  dockerSeen?: { at: number; up: boolean };

  dockerUp(): boolean {
    if (this.dockerSeen && Date.now() - this.dockerSeen.at < 30_000) return this.dockerSeen.up;
    const [program, ...first] = this.node.containerSetup.docker;
    const probe = spawnSync(program, [...first, 'version', '--format', '{{.Server.Version}}'], { encoding: 'utf8', timeout: 8000, windowsHide: true });
    const up = probe.status === 0 && !!probe.stdout.trim();
    this.dockerSeen = { at: Date.now(), up };
    return up;
  }

  /** The release's image, when it has one and Docker runs here. */
  containerOf(app: AppManifest | undefined): AppImage | undefined {
    const image = app?.install?.image;
    return image && app?.start?.image && this.dockerUp() ? image : undefined;
  }

  dockerRun(container: string, app: AppManifest, names: string[]): string[] {
    const image = app.install!.image!;
    const linux = process.platform === 'linux';
    const network = linux ? ['--network', 'host'] : app.services.flatMap((s) => ['-p', `127.0.0.1:${s.port}:${s.port}${s.protocol === 'tcp' ? '/tcp' : ''}`]);
    return [
      ...this.node.containerSetup.docker,
      'run',
      '--rm',
      '--name',
      container,
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

  /** Whether you may point the app at a release, and where releases come from (the app's repository, or the project's one linked repository). */
  releaseInfo(project: StoredSpace, app: AppManifest): { canRelease: boolean; repo?: string } {
    const state = this.core.state(project);
    const linked = reposOf(this.core.entries(project), (did) => mayAct(state, did, 'curate').ok);
    const repo = app.install?.github ?? (linked.length === 1 ? linked[0].repo : undefined);
    return { canRelease: mayAct(state, this.node.identity.author, 'curate').ok, ...(repo ? { repo } : {}) };
  }

  // ---------------------------------------------------------------- updates

  async updateCheck(input: { current: string }): Promise<UpdateInfo> {
    const current = parseVersion(String(input?.current ?? ''));
    if (!current) throw new Error(`"${input?.current}" isn't a version like 0.3.0`);
    // A company's IT rolls out versions itself (managed settings): no prompts.
    if (machinePolicy().updates === false) return { current: input.current } as UpdateInfo;
    const source = { ...UPDATE_SOURCE, ...(this.node.config.updates ?? {}) };
    const found: NonNullable<UpdateInfo['latest']>[] = [];

    // Release posts in the Weave project, signed by its maintainers: every member has them, no sign-in needed.
    const project = this.core.spaces.get(source.project);
    if (project?.kind === 'project') {
      const maintainers = this.core.state(project).maintainers;
      for (const post of await this.node.posts({ space: project.id, board: 'releases' })) {
        const version = /^weave\b/i.test(post.title) ? parseVersion(post.title) : undefined;
        if (!version || !maintainers.has(post.by.did)) continue;
        found.push({ version: formatVersion(version), ...(post.link ? { url: post.link } : {}), post: `weave:post:${post.id}`, notes: post.text.slice(0, 4000), published: post.time, source: 'weave' });
      }
    }
    // The repository's releases, with your GitHub sign-in if you have one (the repository may be private).
    try {
      const auth = this.core.githubAuth();
      const releases = await withTimeout(new GitHub(auth?.token ?? '', this.node.githubSetup.fetch).releases(source.repo), 8000);
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
    const project = this.core.project(ref);
    const app = this.app(project);
    const repo = app ? this.releaseInfo(project, app).repo : undefined;
    if (!repo) throw new Error(`${project.name} has no GitHub repository to take releases from: link one in its settings`);
    const auth = this.core.githubAuth();
    const client = new GitHub(auth?.token ?? '', this.node.githubSetup.fetch);
    const [releases, releaseWorkflow] = await Promise.all([client.releases(repo), client.hasReleaseWorkflow(repo)]);
    return { repo, releases, ...(releaseWorkflow !== undefined ? { releaseWorkflow } : {}) };
  }

  // ---------------------------------------------------------------- app API

  /**
   * What a room's handler needs to ask Weave who its players are: Weave passes it to handlers it starts; for one
   * that runs by itself (a room on a port), `weave room env` prints it.
   */
  async roomEnv(ref: string): Promise<AppEnv> {
    const { room } = this.roomById(ref);
    const hosted = room.agent ? this.localServiceByKey(room.agent)?.hosted?.[room.id] : undefined;
    if (!hosted) throw new Error(`"${room.name}" isn't a room your room service runs here`);
    const api = await this.startAppApi();
    return { WEAVE_API: `http://127.0.0.1:${api.port}`, WEAVE_TOKEN: hosted.token, WEAVE_PROJECT: hosted.project, WEAVE_ROOM: hosted.id };
  }

  /** The port of the app API once it runs (services get it as WEAVE_API). */
  appApiPort?: number;

  startAppApi(): Promise<AppApiServer> {
    this.appApi ??= startAppApi(
      (token) => this.appScope(token),
      (scope, route, params) => this.appAnswer(scope, route, params),
    ).then((api) => {
      this.appApiPort = api.port;
      return api;
    });
    return this.appApi;
  }

  /** Whose a token is: a project's app (the project id), or a service running here ("service:<name>"). */
  appScope(token: string): string | undefined {
    const services = this.storedServices().filter((s) => s.enabled);
    const service = services.find((s) => sameToken(s.token, token));
    if (service) return `service:${service.name}`;
    // A room's handler: its room only.
    const room = services.flatMap((s) => Object.values(s.hosted ?? {})).find((r) => sameToken(r.token, token));
    return room && `room:${room.id}`;
  }

  /**
   * The space a service asks the app API about: the room a connection came through (who), the one it names
   * (?project=), or its only one. Never a space it wasn't added to.
   */
  serviceAppSpace(name: string, route: string, params: URLSearchParams): string {
    const stored = this.storedServices().find((s) => s.name === name && s.enabled);
    if (!stored) throw new AppApiError(401, 'unauthorized');
    if (route === '/v1/who') {
      const did = this.serviceKey(name).did;
      const found = this.core.live.personOnPort(Number(params.get('port')));
      const room = found && this.allRooms().find((r) => r.room.id === found.room && r.room.agent === did);
      if (!room) throw new AppApiError(404, 'not a connection through one of this service’s rooms');
      return room.project.id;
    }
    const mine = stored.spaces.filter((id) => this.core.spaces.has(id));
    const asked = params.get('project');
    if (asked) {
      const id = mine.find((s) => s === asked || this.core.spaceName(this.core.spaces.get(s)!).toLowerCase() === asked.toLowerCase());
      if (!id) throw new AppApiError(404, `"${asked}" isn't one of the spaces ${name} was added to`);
      return id;
    }
    if (mine.length === 1) return mine[0];
    throw new Error(mine.length ? `${name} runs in ${mine.length} spaces: say which (?project=<id>)` : `${name} wasn't added to any space yet`);
  }

  appAnswer(scope: string, route: string, params: URLSearchParams): unknown {
    const service = scope.startsWith('service:') ? scope.slice('service:'.length) : undefined;
    const hosted = scope.startsWith('room:') ? this.storedServices().flatMap((s) => Object.values(s.hosted ?? {})).find((r) => r.id === scope.slice('room:'.length)) : undefined;
    if (scope.startsWith('room:') && !hosted) throw new AppApiError(401, 'unauthorized');
    const projectId = hosted ? hosted.project : service ? this.serviceAppSpace(service, route, params) : scope;
    const project = this.core.spaces.get(projectId);
    if (!project) throw new AppApiError(404, 'this project is no longer here');
    const me = this.node.identity.author;
    if (route === '/v1/me') return this.appPerson(project, me);
    if (route === '/v1/who') {
      const port = Number(params.get('port'));
      if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error('port: the remote port of the connection (a number)');
      const found = this.core.live.personOnPort(port);
      const room = found && this.allRooms().find((r) => r.room.id === found.room && r.project.id === projectId && (!hosted || r.room.id === hosted.id));
      if (!found || !room) throw new AppApiError(404, hosted ? 'not a connection through this room' : 'not a connection through one of this project’s rooms');
      return { ...this.appPerson(project, found.person), room: { id: room.room.id, name: room.room.name } };
    }
    if (route === '/v1/project') {
      // A service sees its own rooms only, and the settings it was given for this space.
      const agent = service ? this.serviceKey(service).did : undefined;
      const rooms = this.allRooms().filter((r) => r.project.id === projectId && r.room.open && r.room.host === me && this.core.live.isHosting(r.room.id) && (!agent || r.room.agent === agent) && (!hosted || r.room.id === hosted.id));
      return {
        id: project.id,
        name: project.name,
        ...(service ? { service, settings: this.storedServices().find((s) => s.name === service)?.spaceSettings?.[projectId] ?? {} } : {}),
        host: { did: me, name: this.node.nameOf(me) },
        rooms: rooms.map(({ room }) => ({ id: room.id, name: room.name, people: this.core.live.peers(room.id).map((did) => this.appPerson(project, did)) })),
        groups: this.appGroups(project).map(({ space, state }) => ({ id: space.id, name: space.name, ...(state.tier ? { tier: true } : {}) })),
      };
    }
    if (route === '/v1/access') {
      const did = params.get('did') ?? '';
      if (!did.startsWith('did:')) throw new Error('did: whose access to look up');
      const groups = this.appGroups(project);
      const group = params.get('group');
      const asked = group ? groups.filter(({ space }) => space.id === group || space.name.toLowerCase() === group.toLowerCase()) : groups;
      if (group && asked.length === 0) throw new AppApiError(404, `no group "${group}" here: only the project's groups and the host's own groups and tiers`);
      return {
        ...this.appPerson(project, did as Did),
        groups: asked.filter(({ state }) => state.members.has(did as Did)).map(({ space, state }) => ({ id: space.id, name: space.name, ...(state.tier ? { tier: true } : {}) })),
      };
    }
    if (route === '/v1/tickets') {
      const did = params.get('did') ?? '';
      if (!did.startsWith('did:')) throw new Error('did: whose tickets to look up');
      const now = new Date(this.node.clock());
      return this.core.payments.allShows()
        .filter((s) => s.project === projectId && s.host === this.node.identity.author)
        .flatMap((s) => (this.core.payments.ticketRecords(s.id).some((r) => r.holder === did) ? [{ show: s.id, name: s.name, ...(s.room ? { room: s.room } : {}), starts: s.starts, ends: s.ends, open: showOpen(s, now), cancelled: s.cancelled }] : []));
    }
    if (route === '/v1/badges') {
      const did = params.get('did') ?? '';
      if (!did.startsWith('did:')) throw new Error('did: whose badges to look up');
      const { series, badges } = this.core.badges.allBadges();
      const ours = new Map(series.filter((s) => s.project?.id === projectId && s.project.checked && !s.broken).map((s) => [s.id, s]));
      return badges
        .filter((b) => b.holder === did && !b.invalid && ours.has(b.series))
        .map((b) => {
          const s = ours.get(b.series)!;
          return { id: b.id, series: { id: s.id, name: s.name, symbol: s.symbol, ...(s.image ? { image: s.image } : {}), ...(s.limit ? { limit: s.limit } : {}) }, n: b.n, issuer: { did: b.issuer, name: this.node.nameOf(b.issuer) }, note: b.note, ...(b.ref ? { ref: b.ref } : {}), ...(b.personal?.published ? { personal: b.personal.published } : {}), time: b.time };
        });
    }
    throw new AppApiError(404, `no route ${route}`);
  }

  /**
   * X-Weave-Person for a room's http service (Weave and Docker): who this player is, as the app API would say,
   * the room, and the time, signed with the app's own token (HMAC-SHA256), which only Weave and the app know.
   * Only for apps Weave gave a token (it started them, or weave app env): otherwise nobody could check it.
   */
  personHeader(room: Room, person: Did): string | undefined {
    if (this.roomService(room)?.protocol !== 'http') return undefined;
    const found = this.allRooms().find((r) => r.room.id === room.id);
    // A service's room is vouched for with the service's own token, which its process has.
    const token = room.agent ? this.localServiceByKey(room.agent)?.hosted?.[room.id]?.token : undefined;
    if (!found || !token) return undefined;
    const payload = Buffer.from(JSON.stringify({ ...this.appPerson(found.project, person), room: { id: room.id, name: room.name }, t: Math.floor(this.node.clock() / 1000) })).toString('base64url');
    return `${payload}.${createHmac('sha256', token).update(payload).digest('base64url')}`;
  }

  /** A person as an app sees them: who they are and their place in the project. */
  appPerson(project: StoredSpace, did: Did): AppPerson {
    const state = this.core.state(project);
    const name = this.node.nameOf(did);
    return {
      did,
      ...(name ? { name } : {}),
      host: did === this.node.identity.author,
      member: state.members.has(did) || did === this.node.identity.author,
      maintainer: state.maintainers.has(did),
    };
  }

  /** Groups an app may ask about: the ones invited into the project, and the host's own groups and tiers. Nothing else of the host's. */
  appGroups(project: StoredSpace): Array<{ space: StoredSpace; state: SpaceState }> {
    const invited = new Set(this.core.state(project).groups.keys());
    const out: Array<{ space: StoredSpace; state: SpaceState }> = [];
    for (const space of this.core.spaces.values()) {
      if (space.kind !== 'group') continue;
      const state = this.core.state(space);
      if (invited.has(space.id) || state.founder === this.node.identity.author) out.push({ space, state });
    }
    return out;
  }

  // ---------------------------------------------------------------- fetching a release

  /** Download a release file into dir/<tag>, refuse it unless it matches the fingerprint published, unpack it: its folder. */
  async fetchRelease(dir: string, app: AppManifest, release: { github: string; tag: string; asset: AppAsset }, job: InstallJob): Promise<string> {
    mkdirSync(dir, { recursive: true });
    const auth = this.core.githubAuth();
    const client = new GitHub(auth?.token ?? '', this.node.githubSetup.fetch);
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
    return root;
  }

  async releaseApp(input: { project: string; tag: string; repo?: string; assets?: Record<string, string>; as?: string }): Promise<AppManifest> {
    if (input.as) this.core.agentMay(input.as, KIND_APP);
    const project = this.core.project(input.project);
    const state = this.core.maintainerState(project);
    const published = this.app(project);
    const linked = reposOf(this.core.entries(project), (did) => mayAct(state, did, 'curate').ok);
    const repo = input.repo?.trim() || published?.install?.github || (linked.length === 1 ? linked[0].repo : '');
    if (!isRepoName(repo)) throw new Error(linked.length > 1 ? `${project.name} has several repositories: say which one` : 'which repository holds the release? (owner/name)');
    const auth = this.core.githubAuth();
    const client = new GitHub(auth?.token ?? '', this.node.githubSetup.fetch);
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
      const found = await imageDigest(ref, tags, { fetch: this.node.containerSetup.fetch, ...(credentials ? { credentials } : {}) });
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
    const own = this.node.config.githubApp?.slug;
    const { app: _app, ...before } = { ...published?.install, ...app.install };
    const { image: _image, assets: _assets, ...kept } = before as AppInstall;
    const manifest = parseManifest({ ...app, install: { ...kept, github: repo, tag: release.tag, ...(Object.keys(assets).length ? { assets } : {}), ...(image ? { image } : {}), ...(own ? { app: own } : {}) } });
    await this.node.publish({ kind: KIND_APP, body: manifest as unknown as Json, space: project.id, as: input.as });
    return manifest;
  }

  async rooms(ref?: string): Promise<RoomInfo[]> {
    const only = ref ? this.core.project(ref).id : undefined;
    // Rooms come from room services (rooms hosts announced themselves, before them, are left out).
    const rooms = this.allRooms().filter(({ room, project }) => room.open && !!room.agent && (!only || project.id === only));
    return Promise.all(rooms.map(({ room, project }) => this.roomInfo(room, project)));
  }

  async endRoom(ref: string): Promise<void> {
    const { room, project } = this.roomById(ref);
    if (room.host !== this.node.identity.author || !room.agent) throw new Error('only the person whose room service offers a room ends it');
    // A room of the room service: its handler stops, the room closes. On an always-on node: handed over as a change.
    const service = this.localServiceByKey(room.agent);
    if (service?.hosted?.[room.id]) return this.closeHostedRooms(service.name, (r) => r.id !== room.id);
    const away = this.core.isLinkedNode ? undefined : [...this.handedOver().values()].find((h) => h.did === room.agent);
    if (away?.hosted?.[room.id]) {
      const { [room.id]: _gone, ...hosted } = away.hosted;
      return this.changeNodeService(away, { hosted });
    }
    throw new Error(`${this.core.agentName(room.agent, room.host) ?? 'a service'} offers "${room.name}": end it on the device it runs on`);
  }

  async joinRoom(ref: string): Promise<RoomInfo> {
    const { room, project } = this.roomById(ref);
    if (!room.open) throw new Error('this room has ended');
    if (this.hostedHere(room)) return this.roomInfo(room, project);
    if (!this.mayJoin(room, this.node.identity.author)) throw new Error(room.show || room.groups ? "this room is for a show's ticket holders, while it's on (weave shows), or for members of its tiers" : "you're not invited to this room");
    await this.core.live.join(room, room.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'room');
    return this.roomInfo(room, project);
  }

  async leaveRoom(ref: string): Promise<void> {
    await this.core.live.leave(this.roomById(ref).room.id);
  }

  async roomChat(ref: string): Promise<RoomChatMessage[]> {
    const { room } = this.roomById(ref);
    return this.core.live.chat(room.id).map((m) => ({ id: m.id, by: { did: m.from, name: this.node.nameOf(m.from) ?? m.name }, text: m.text, time: m.time, mine: m.from === this.node.identity.author }));
  }

  async sayInRoom(input: { room: string; text: string }): Promise<void> {
    if (!input.text?.trim()) throw new Error('a message needs text');
    this.core.live.say(this.roomById(input.room).room.id, input.text);
  }

  /** Where a room's app is reached on this computer while we're in the room: the same port its address (RoomInfo.url) has. */
  roomPort(roomId: string): number | undefined {
    const found = this.allRooms().find((r) => r.room.id === roomId && r.room.open);
    if (!found) return undefined;
    if (found.room.host !== this.node.identity.author) return this.core.live.localPort(roomId);
    return this.core.live.isHosting(roomId) ? this.roomService(found.room)?.port : undefined;
  }

  /** A room's key seed, from our own secret: the host can reopen its rooms after a restart. */
  roomSeed(roomId: string): Uint8Array {
    return createHash('sha256').update('weave/room-seed/v1').update(this.core.selfSecret()).update(roomId).digest();
  }

  /** The latest app manifest a maintainer published in a project. */
  app(project: StoredSpace): AppManifest | undefined {
    const state = this.core.state(project);
    let app: AppManifest | undefined;
    for (const e of this.core.entries(project)) {
      if (e.kind !== KIND_APP || !mayAct(state, e.event.author, 'curate').ok) continue;
      try {
        app = parseManifest(e.body);
      } catch {
        // a malformed manifest is ignored; the previous one stays
      }
    }
    return app;
  }

  allRooms(): Array<{ room: Room; project: StoredSpace }> {
    const out: Array<{ room: Room; project: StoredSpace }> = [];
    for (const project of this.core.spaces.values()) {
      if (project.kind !== 'project') continue;
      for (const room of roomsOf(this.core.entries(project))) out.push({ room, project });
    }
    return out;
  }

  roomById(ref: string): { room: Room; project: StoredSpace } {
    const matches = this.allRooms().filter(({ room }) => room.id === ref || room.id.startsWith(ref) || room.name.toLowerCase() === ref.toLowerCase());
    if (matches.length === 0) throw new Error(`no room "${ref}"`);
    const open = matches.filter((m) => m.room.open);
    if (open.length > 1) throw new Error(`several rooms match "${ref}": use its id`);
    return open[0] ?? matches[0];
  }

  /** Participants of the room's project who are invited (or everyone, by default); the host always. */
  mayJoin(room: Room, person: Did): boolean {
    if (person === room.host) return true;
    const found = this.allRooms().find((r) => r.room.id === room.id);
    if (!found || !this.core.state(found.project).members.has(person)) return false;
    if (room.show || room.groups?.length) {
      // A ticketed room: a ticket while the show is on (the host checks its own records, a guest its ticket)…
      const show = room.show ? this.core.payments.allShows().find((s) => s.id === room.show && s.host === room.host) : undefined;
      const ticket =
        !!show &&
        showOpen(show, new Date(this.node.clock())) &&
        (person === this.node.identity.author ? this.core.payments.myTickets().some((t) => t.show === show.id && t.host === show.host) : show.host === this.node.identity.author && this.core.payments.ticketRecords(show.id).some((r) => r.holder === person));
      // …or an active membership in one of its groups (a tier).
      const member = (room.groups ?? []).some((id) => this.activeMember(id, person));
      if (!ticket && !member) return false;
    }
    return room.invite === 'participants' || room.invite.includes(person);
  }

  /** Whether someone is in a group right now (a tier's grant not run out). */
  activeMember(groupId: string, person: Did): boolean {
    const group = this.core.spaces.get(groupId);
    const member = group && this.core.state(group).members.get(person);
    return !!member && (!member.until || member.until > new Date(this.node.clock()).toISOString());
  }

  /** Whether this node hosts a room: one of a room service running here. */
  hostedHere(room: Room): boolean {
    return room.host === this.node.identity.author && !!room.agent && !!this.localServiceByKey(room.agent)?.hosted?.[room.id];
  }

  localServiceByKey(did: Did): StoredService | undefined {
    return this.storedServices().find((s) => this.core.agents.find((a) => a.name === s.name)?.did === did);
  }

  /** What a room's clients reach on this computer: its handler's port, where the room service runs. */
  roomService(room: Room) {
    const port = room.agent ? this.localServiceByKey(room.agent)?.hosted?.[room.id]?.port : undefined;
    return port ? { id: 'room', port, protocol: 'http' as const } : undefined;
  }

  /** A room, offered by a room service: hosted where that service runs, joined like any room everywhere else (also on your own computers). */
  async roomInfo(room: Room, project: StoredSpace): Promise<RoomInfo> {
    const me = this.node.identity.author;
    const here = this.hostedHere(room);
    const service = here ? this.roomService(room) : undefined;
    const joined = here ? this.core.live.isHosting(room.id) : this.core.live.isJoined(room.id);
    const ready = here ? !!service && (await portOpen(service.port)) : this.core.live.appReady(room.id);
    const localPort = this.core.live.localPort(room.id);
    const slug = room.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'room';
    const side = here ? room.pages?.host : room.pages?.joiner;
    const path = side?.path ?? '/';
    const url = here ? (service && ready ? `http://localhost:${service.port}${path}` : undefined) : localPort && ready ? `http://${slug}.weave.localhost:${localPort}${path}` : undefined;
    const name = this.core.agentName(room.agent!, room.host);
    return {
      id: room.id,
      project: { id: project.id, kind: 'project', name: project.name },
      name: room.name,
      host: { did: room.host, name: this.node.nameOf(room.host) },
      offeredBy: { did: room.agent!, ...(name ? { name } : {}) },
      mine: here,
      open: room.open,
      mayJoin: this.mayJoin(room, me),
      ...(room.show ? { show: room.show } : {}),
      ...(room.groups?.length ? { groups: room.groups.map((id) => ({ id, name: this.core.spaces.get(id)?.name })) } : {}),
      joined,
      connected: this.core.live.connected(room.id),
      peers: joined ? this.core.live.peers(room.id).map((did) => ({ did, name: this.node.nameOf(did) })) : [],
      service: { id: 'room', label: side?.label ?? (here ? 'Open' : 'Play'), ready },
      ...(url ? { url } : {}),
      time: room.time,
    };
  }

  /** Tell watchers something changed that isn't an event; with a notice, it may also show as a notification. */
  emitLive(notice?: Notice): void {
    for (const listener of this.core.liveListeners) listener(notice);
  }

  // ---------------------------------------------------------------- services: code you run under keys of their own

  /** The app API (see appapi.ts), started when a room's handler or a service first needs it. */
  appApi?: Promise<AppApiServer>;

  /** The API apps and services ask Weave through closes, unless services still running ask it (their WEAVE_API; close stops them first). */
  async closeAppApi(): Promise<void> {
    if (this.serviceProcs.size || this.roomProcs.size) return;
    const appApi = this.appApi;
    this.appApi = undefined;
    this.appApiPort = undefined;
    await (await appApi?.catch(() => undefined))?.close();
  }

  get servicesFile(): string {
    return joinPath(this.node.home.dir, 'services.json');
  }

  /** The services this node runs, as kept (sealed, with their settings and tokens). */
  storedServices(): StoredService[] {
    return readSecretJson<StoredService[]>(this.node.home, this.servicesFile) ?? [];
  }

  saveServices(list: StoredService[]): void {
    writeSecretJson(this.node.home, this.servicesFile, list);
  }

  storedService(name: string): StoredService {
    const found = this.storedServices().find((s) => s.name === name);
    if (!found) throw new Error(`this node runs no service "${name}"`);
    return found;
  }

  serviceKey(name: string): AgentKey {
    const key = this.core.agents.find((a) => a.name === name);
    if (!key) throw new Error(`the key of service "${name}" is missing on this node`);
    return key;
  }

  /** The spaces a service may be added to: groups, projects and communities you're in (never direct chats). */
  serviceSpaces(refs: string[]): string[] {
    return [...new Set(refs.map((ref) => {
      const space = this.core.space(ref);
      if (space.kind === 'direct') throw new Error('services work in groups, projects and communities, not in direct chats');
      return space.id;
    }))];
  }

  /** Tell the spaces a service joined or left, so their members see it (and can ask it). */
  announceService(did: Did, before: string[], after: string[]): void {
    for (const id of after.filter((s) => !before.includes(s))) if (this.core.spaces.has(id)) this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(this.core.spaces.get(id)!), { kind: KIND_SERVICE_IN, body: { service: did, on: true } }));
    for (const id of before.filter((s) => !after.includes(s))) if (this.core.spaces.has(id)) this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(this.core.spaces.get(id)!), { kind: KIND_SERVICE_IN, body: { service: did, on: false } }));
  }

  async servicesIn(ref: string): Promise<ServiceProfileInfo[]> {
    const space = this.core.space(ref);
    const here = new Set(servicesInSpace(this.core.entries(space), (service, author) => this.isServiceKey(service, author)));
    return (await this.serviceProfiles()).filter((p) => here.has(p.did));
  }

  serviceInfo(stored: StoredService): ServiceInfo {
    return {
      name: stored.name,
      did: this.serviceKey(stored.name).did,
      description: stored.description,
      ...(stored.icon ? { icon: stored.icon } : {}),
      contract: stored.contract,
      spaces: stored.spaces.flatMap((id) => {
        const space = this.core.spaces.get(id);
        const given = Object.keys(stored.spaceSettings?.[id] ?? {}).sort();
        return space ? [{ id, kind: space.kind, name: this.core.spaceName(space), ...(given.length ? { settings: given } : {}) }] : [];
      }),
      ...(stored.command ? { command: stored.command } : {}),
      ...(stored.builtin ? { builtin: stored.builtin, rooms: Object.values(stored.hosted ?? {}).map((r) => this.hostedRoomInfo(r)) } : {}),
      settings: Object.keys(stored.settings).sort(),
      enabled: stored.enabled,
      running: stored.builtin ? stored.enabled : this.serviceProcs.has(stored.name),
    };
  }

  // Artifacts: a project's releases. A room runs one as its handler, pinned to it, in any project of yours.

  async artifacts(ref: string): Promise<ArtifactInfo[]> {
    const project = this.core.project(ref);
    return artifactsOf(this.core.entries(project), this.core.state(project).maintainers).map((a) => {
      const runs = this.artifactRuns(a.manifest);
      return {
        id: a.id,
        project: { id: project.id, kind: 'project', name: this.core.spaceName(project) },
        tag: a.tag,
        app: a.manifest.app,
        name: a.manifest.name,
        released: this.core.actor(a.author, a.signer as Did),
        time: a.time,
        room: !!this.artifactWeb(a.manifest),
        settings: a.manifest.env ?? [],
        ...(runs ? { runs, command: this.artifactCommand('room', a.manifest) } : {}),
      };
    });
  }

  /** One release of a project: the one with this tag, or the latest. */
  artifact(ref: string, tag?: string): { project: StoredSpace; artifact: Artifact } {
    const project = this.core.project(ref);
    const all = artifactsOf(this.core.entries(project), this.core.state(project).maintainers);
    const artifact = tag ? all.find((a) => a.tag === tag) : all[0];
    if (!artifact) throw new Error(tag ? `${project.name} has no release ${tag}${all.length ? ` (its releases: ${all.slice(0, 5).map((a) => a.tag).join(', ')})` : ''}` : `${project.name} has released nothing to run yet (weave app release)`);
    return { project, artifact };
  }

  /** How an artifact runs here: its container when it has one and Docker runs, else its release file for this platform. */
  artifactRuns(app: AppManifest): 'release' | 'container' | undefined {
    if (this.containerOf(app)) return 'container';
    return app.install?.assets?.[platformKey()] && startCommand(app, platformKey(), true) ? 'release' : undefined;
  }

  /** Its web page, if it has one: what a room's clients reach. */
  artifactWeb(app: AppManifest): AppManifest['services'][number] | undefined {
    return app.services.find((s) => s.protocol === 'http');
  }

  /** What running it here runs (for the approval): the release build's command, or its container (one per room). */
  artifactCommand(container: string, app: AppManifest): string[] | undefined {
    const runs = this.artifactRuns(app);
    if (runs === 'container') return this.dockerRun(`weave-room-${container}`, app, [...(app.env ?? []).map((e) => e.name), 'WEAVE_API', 'WEAVE_TOKEN', 'WEAVE_PROJECT', 'WEAVE_ROOM', 'PORT']);
    return runs === 'release' ? startCommand(app, platformKey(), true) : undefined;
  }

  /** Settings checked against what's allowed: an artifact's own, or any variable-like name for a command. */
  checkSettings(app: AppManifest | undefined, settings: Record<string, string | null>): void {
    for (const key of Object.keys(settings)) {
      if (app) {
        if (!(app.env ?? []).some((e) => e.name === key)) throw new Error(`${app.name} doesn't ask for ${key}${app.env?.length ? ` (it asks for ${app.env.map((e) => e.name).join(', ')})` : ''}`);
      } else if (!/^[A-Z_][A-Z0-9_]{0,63}$/.test(key) || key.startsWith('WEAVE_') || key === 'PORT') throw new Error(`a setting is named like an environment variable (A-Z, 0-9, _), not starting with WEAVE_: ${key}`);
    }
  }

  // The room service: a service Weave ships. In each project it's added to, it opens rooms, each answered by a
  // handler: an artifact (a project's release, fetched and checked), a command, or something already running.

  /**
   * Open a room: in a project the room service was added to, answered by its handler. Running code (an artifact's
   * release, a command) needs `approve` once per release or command; a handler already running needs nothing.
   */
  async openRoom(input: { service?: string; project: string; name: string; artifact?: { project: string; tag?: string }; command?: string[]; folder?: string; port?: number; settings?: Record<string, string>; approve?: boolean; invite?: string[]; show?: string; groups?: string[]; pages?: RoomPages }): Promise<RoomInfo> {
    const service = this.roomServiceFor(input.service);
    const project = this.core.project(input.project);
    if (!service.spaces.includes(project.id)) throw new Error(`${service.name} isn't in ${project.name}: add it there first`);
    const name = input.name?.trim().slice(0, 60);
    if (!name) throw new Error('a room has a name');
    const command = input.command?.filter((part) => typeof part === 'string' && part.length);
    if (input.artifact && command?.length) throw new Error('a room runs an artifact or a command, not both');
    if (service.away && command?.length) throw new Error(`${service.name} runs on ${this.nodeKey(service.away.node).name}: a room there runs a project's release, or something already running there, not a program of this computer`);
    let handler: RoomHandler;
    let port: number;
    let approved: string | undefined;
    if (input.artifact) {
      const found = this.artifact(input.artifact.project, input.artifact.tag);
      const { id, tag, manifest } = found.artifact;
      const web = this.artifactWeb(manifest);
      if (!web) throw new Error(`${manifest.name} has no web page (an http service in its weave.app.json): nothing for a room to reach`);
      port = web.port;
      const run = this.artifactCommand('x', manifest);
      if (!run) throw new Error(`${manifest.name} ${tag} has no release file for this computer (${platformKey()})${manifest.install?.image ? ", and Docker isn't running here" : ''}`);
      approved = launchFingerprint(this.artifactCommand('room', manifest)!, id);
      if (!input.approve && !(service.approved ?? []).includes(approved)) throw new Error(`approve it first: Weave would run "${run.join(' ')}" from ${manifest.name} ${tag}, released in ${found.project.name}`);
      handler = { artifact: { project: found.project.id, id, tag, manifest } };
      this.checkSettings(manifest, input.settings ?? {});
      const missing = (manifest.env ?? []).filter((e) => !e.optional && !input.settings?.[e.name]);
      if (missing.length) throw new Error(`${manifest.name} needs ${missing.map((e) => e.label).join(', ')} (--setting ${missing[0].name}=…)`);
    } else if (command?.length) {
      const folder = input.folder ? resolvePath(input.folder) : undefined;
      if (!folder || !existsSync(folder)) throw new Error('a command runs in a folder: say which (an existing one)');
      port = this.roomPortOf(input.port);
      approved = launchFingerprint(command, folder);
      if (!input.approve && !(service.approved ?? []).includes(approved)) throw new Error(`approve it first: Weave would run "${command.join(' ')}" in ${folder}`);
      handler = { command, folder };
      this.checkSettings(undefined, input.settings ?? {});
    } else {
      // Something already running: Weave only lets the room's clients reach it.
      port = this.roomPortOf(input.port);
      handler = { address: true };
      if (input.settings && Object.keys(input.settings).length) throw new Error('settings go to a handler Weave starts: this one runs by itself');
    }
    // Who may join: every participant, or these people, a show's ticket holders (while it's on), members of tiers.
    const invite = input.invite?.length ? input.invite.map((who) => this.node.resolve(who)) : ('participants' as const);
    const show = input.show ? this.core.payments.showRef(input.show) : undefined;
    if (show && show.host !== this.node.identity.author) throw new Error(`only ${this.node.nameOf(show.host) ?? 'its host'} opens rooms for ${show.name}: they let ticket holders in`);
    const groups = (input.groups ?? []).map((ref) => {
      const group = this.core.space(ref);
      if (group.kind !== 'group') throw new Error(`${group.name} is a ${group.kind}, not a group or tier`);
      if (!this.core.state(project).groups.has(group.id)) throw new Error(`${group.name} isn't invited into ${project.name}: invite it first (its members then take part)`);
      return group.id;
    });
    // Ports answer on one device: rooms there can't share one.
    const busy = service.away ? Object.values(service.hosted) : this.storedServices().flatMap((s) => Object.values(s.hosted ?? {}));
    const taken = busy.find((r) => r.port === port);
    if (taken) throw new Error(`port ${port} already answers the room "${taken.name}": end it first${'artifact' in handler ? ` (${handler.artifact.manifest.name} always listens on ${port})` : ', or use another port'}`);
    const access = { ...(invite !== 'participants' ? { invite } : {}), ...(show ? { show: show.id } : {}), ...(groups.length ? { groups } : {}) };
    // The pages each side opens: the release's own (its manifest's open), or as given.
    const web = 'artifact' in handler ? this.artifactWeb(handler.artifact.manifest) : undefined;
    const pages = parsePages(web ? web.open : input.pages);
    const room: StoredRoom = {
      id: b64u.encode(randomBytes(12)),
      project: project.id,
      name,
      handler,
      port,
      settings: Object.fromEntries(Object.entries(input.settings ?? {}).map(([k, v]) => [k, String(v)])),
      token: b64u.encode(randomBytes(24)),
      ...(Object.keys(access).length ? { access } : {}),
      ...(pages ? { pages } : {}),
    };
    const approvals = approved && !service.approved.includes(approved) ? [...service.approved, approved] : service.approved;
    if (service.away) {
      // Its key is on the always-on node: the room goes there, sealed to yourself, and the node announces and runs it.
      this.changeNodeService(service.away, { hosted: { ...service.hosted, [room.id]: room }, approved: approvals });
      return {
        id: room.id,
        project: { id: project.id, kind: 'project', name: project.name },
        name,
        host: { did: this.node.identity.author, name: this.node.nameOf(this.node.identity.author) },
        offeredBy: { did: service.away.did, name: service.name },
        mine: false,
        open: false,
        mayJoin: true,
        joined: false,
        connected: false,
        peers: [],
        time: new Date(this.node.clock()).toISOString(),
      };
    }
    this.saveServices(this.storedServices().map((s) => (s.name === service.name ? { ...s, hosted: { ...(s.hosted ?? {}), [room.id]: room }, approved: approvals } : s)));
    const announced = this.announceRoom(service.name, room)!;
    if (this.serviceApi) await this.startAppApi();
    this.startRoom(service.name, room.id);
    this.emitLive();
    return this.roomInfo(announced, project);
  }

  /** A room of the room service, announced under its key (so everyone sees whose service offers it), and hosted here. */
  announceRoom(serviceName: string, room: StoredRoom): Room | undefined {
    const project = this.core.spaces.get(room.project);
    if (!project) return undefined;
    const key = this.serviceKey(serviceName);
    const known = roomsOf(this.core.entries(project)).find((r) => r.id === room.id);
    if (!known?.open) {
      const roomKey = roomKeyPair(this.roomSeed(room.id)).publicKey.toString('hex');
      const a = room.access ?? {};
      this.node.replica.write(
        key,
        sealFor(this.core.managed.cipher(project), { kind: KIND_ROOM, body: { room: room.id, name: room.name, service: 'room', key: roomKey, invite: a.invite ?? 'participants', ...(a.show ? { show: a.show } : {}), ...(a.groups?.length ? { groups: a.groups } : {}), ...(room.pages ? { pages: room.pages as unknown as Json } : {}), agent: key.did, open: true } }),
      );
    }
    const announced = this.roomById(room.id).room;
    // Hosting finds the network in the background: the room is announced already.
    if (this.core.swarm) void this.core.live.host(announced).catch(() => {});
    return announced;
  }

  /** A port a room's clients may reach: one a handler listens on, on this computer. */
  roomPortOf(port: unknown): number {
    const n = Number(port);
    if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error('which port does it listen on (on this computer)?');
    return n;
  }

  /** Your room service: the one named, or your only one; here, or on one of your always-on nodes (`away`). */
  roomServiceFor(name?: string): { name: string; spaces: string[]; approved: string[]; hosted: Record<string, StoredRoom>; away?: Handover } {
    const here = this.storedServices()
      .filter((s) => s.builtin === 'room')
      .map((s) => ({ name: s.name, spaces: s.spaces, approved: s.approved ?? [], hosted: s.hosted ?? {}, enabled: s.enabled, away: undefined as Handover | undefined }));
    const away = this.core.isLinkedNode ? [] : [...this.handedOver().values()].filter((h) => h.builtin === 'room').map((h) => ({ name: h.service, spaces: h.spaces, approved: h.approved ?? [], hosted: h.hosted ?? {}, enabled: h.enabled !== false, away: h as Handover | undefined }));
    const all = [...here, ...away];
    const found = name ? all.find((s) => s.name === name) : all.length === 1 ? all[0] : undefined;
    if (!found) throw new Error(name ? `"${name}" isn't one of your room services` : all.length ? `you have several room services: say which (${all.map((s) => s.name).join(', ')})` : 'add the room service first (weave service add room --builtin room)');
    if (!found.enabled) throw new Error(`${found.name} is stopped: start it first`);
    return found;
  }

  /** A room the room service runs, as its service lists it: its handler and how it's doing. */
  hostedRoomInfo(r: StoredRoom, here = true): HostedRoomInfo {
    const project = this.core.spaces.get(r.project);
    const job = this.roomInstalls.get(r.id);
    const h = r.handler;
    let handler: HostedRoomInfo['handler'];
    if ('artifact' in h) {
      const from = this.core.spaces.get(h.artifact.project);
      const latest = from ? artifactsOf(this.core.entries(from), this.core.state(from).maintainers)[0] : undefined;
      handler = {
        kind: 'artifact',
        artifact: { project: { id: h.artifact.project, ...(from ? { name: this.core.spaceName(from) } : {}) }, tag: h.artifact.tag, app: h.artifact.manifest.app, name: h.artifact.manifest.name, ...(latest && latest.id !== h.artifact.id && latest.tag !== h.artifact.tag ? { latest: latest.tag } : {}) },
        command: this.artifactCommand(r.id, h.artifact.manifest) ?? [],
      };
    } else if ('command' in h) handler = { kind: 'command', command: h.command, folder: h.folder };
    else handler = { kind: 'address' };
    return {
      id: r.id,
      project: { id: r.project, kind: 'project', name: project ? this.core.spaceName(project) : r.project },
      name: r.name,
      port: r.port,
      handler,
      settings: Object.keys(r.settings).sort(),
      running: here && ('address' in h || this.roomProcs.has(r.id)),
      ...(job?.progress ? { progress: { ...job.progress } } : {}),
      ...(job?.error ? { error: job.error } : {}),
    };
  }

  /** Fetch a room's release where it isn't here yet (checked against its fingerprints), then start its handler. */
  startRoom(serviceName: string, roomId: string): void {
    const stored = this.storedServices().find((s) => s.name === serviceName);
    const room = stored?.hosted?.[roomId];
    if (!stored?.enabled || !room) return;
    if (!('artifact' in room.handler)) return this.runRoomHandler(stored, room);
    const a = room.handler.artifact;
    const dir = joinPath(this.node.home.dir, 'services', stored.name, 'artifacts', a.project);
    const folder = joinPath(dir, tagFolder(a.tag));
    if (this.artifactRuns(a.manifest) === 'container' || existsSync(folder)) return this.runRoomHandler(stored, room);
    if (this.roomInstalls.get(roomId)?.progress) return;
    const asset = a.manifest.install?.assets?.[platformKey()];
    if (!asset || !a.manifest.install?.github) {
      this.roomInstalls.set(roomId, { error: `${a.manifest.name} ${a.tag} has no release file for this computer (${platformKey()})` });
      return;
    }
    const job: InstallJob = { progress: { state: 'downloading', done: 0, ...(asset.size ? { total: asset.size } : {}) } };
    this.roomInstalls.set(roomId, job);
    // Rooms with the same release share its folder: fetched once.
    const fetched = (this.fetching.get(folder) ?? this.fetchRelease(dir, a.manifest, { github: a.manifest.install.github, tag: a.tag, asset }, job).then(() => undefined)).finally(() => this.fetching.delete(folder));
    this.fetching.set(folder, fetched);
    const done = fetched.then(
      () => {
        this.roomInstalls.delete(roomId);
        const now = this.storedServices().find((s) => s.name === serviceName);
        if (now?.hosted?.[roomId]) this.runRoomHandler(now, now.hosted[roomId]);
      },
      (error: Error) => void this.roomInstalls.set(roomId, { error: error.message }),
    );
    this.roomInstalling.set(roomId, done.finally(() => this.emitLive()));
  }

  roomInstalls = new Map<string, InstallJob>();
  roomInstalling = new Map<string, Promise<void>>();
  fetching = new Map<string, Promise<void>>();

  /** Resolves when fetching a room's release ends (for tests and the CLI). */
  async roomReady(ref: string): Promise<RoomInfo> {
    const { room, project } = this.roomById(ref);
    await this.roomInstalling.get(room.id);
    return this.roomInfo(room, project);
  }

  /** The release folder of a room's artifact, the one Weave fetched. */
  artifactFolder(service: string, a: StoredArtifact): string {
    const dir = joinPath(this.node.home.dir, 'services', service, 'artifacts', a.project, tagFolder(a.tag));
    // The release unpacks into one folder, usually: that one.
    const entries = existsSync(dir) ? readdirSync(dir).filter((e) => !e.startsWith('.')) : [];
    return entries.length === 1 && statSync(joinPath(dir, entries[0])).isDirectory() ? joinPath(dir, entries[0]) : dir;
  }

  /** Start a room's handler: its process gets the room's port, its settings, and the app API for its room only. */
  runRoomHandler(stored: StoredService, room: StoredRoom): void {
    if (!this.serviceApi || !this.appApiPort || this.roomProcs.has(room.id) || 'address' in room.handler) return;
    const h = room.handler;
    const container = 'artifact' in h && this.artifactRuns(h.artifact.manifest) === 'container' ? `weave-room-${room.id.toLowerCase().replace(/[^a-z0-9_.-]/g, '-')}` : undefined;
    let command: string[];
    let cwd: string;
    if ('artifact' in h) {
      const run = this.artifactCommand(container ? room.id.toLowerCase().replace(/[^a-z0-9_.-]/g, '-') : 'room', h.artifact.manifest);
      if (!run || !(stored.approved ?? []).includes(launchFingerprint(this.artifactCommand('room', h.artifact.manifest)!, h.artifact.id))) return void this.roomInstalls.set(room.id, { error: 'approve what it runs first' });
      cwd = container ? joinPath(this.node.home.dir, 'services', stored.name) : this.artifactFolder(stored.name, h.artifact);
      // A program in the release's folder ("./band-ab"): Windows wouldn't look there by itself.
      const [named, ...args] = run;
      command = [!container && !isAbsolute(named) && existsSync(joinPath(cwd, named)) ? joinPath(cwd, named) : named, ...args];
    } else {
      if (!(stored.approved ?? []).includes(launchFingerprint(h.command, h.folder))) return void this.roomInstalls.set(room.id, { error: 'approve its command first' });
      cwd = h.folder;
      const [named, ...args] = h.command;
      command = [!isAbsolute(named) && existsSync(joinPath(cwd, named)) ? joinPath(cwd, named) : named, ...args];
    }
    const dir = joinPath(this.node.home.dir, 'services', stored.name, 'rooms', room.id);
    mkdirSync(dir, { recursive: true });
    mkdirSync(cwd, { recursive: true });
    const host = container && process.platform !== 'linux' ? 'host.docker.internal' : '127.0.0.1';
    if (container) {
      // One left from before (a crash, a stop that didn't reach Docker) would block the name.
      const [docker, ...first] = this.node.containerSetup.docker;
      spawnSync(docker, [...first, 'rm', '-f', container], { windowsHide: true, timeout: 20_000 });
    }
    const log = createWriteStream(joinPath(dir, 'room.log'), { flags: 'a' });
    const [program, ...args] = command;
    const child = spawn(program, args, {
      cwd,
      // Its settings, its port, and the app API for its room (who is who); nothing of the daemon's own environment. Weave's own variables last.
      env: { PATH: process.env.PATH ?? '', SYSTEMROOT: process.env.SYSTEMROOT ?? '', HOME: dir, ...room.settings, PORT: String(room.port), WEAVE_API: `http://${host}:${this.appApiPort}`, WEAVE_TOKEN: room.token, WEAVE_PROJECT: room.project, WEAVE_ROOM: room.id },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    child.stdout?.pipe(log);
    child.stderr?.pipe(log);
    const entry = { child, stopping: false, ...(container ? { container } : {}) };
    this.roomProcs.set(room.id, entry);
    child.on('error', (error) => log.write(`weave: couldn't start the room's handler: ${error.message}\n`));
    child.on('exit', (code) => {
      log.write(`weave: the handler exited (${code})\n`);
      log.end();
      if (this.roomProcs.get(room.id) === entry) this.roomProcs.delete(room.id);
      if (entry.stopping) return;
      // Crashed: start again, waiting longer each time.
      const restarts = this.serviceRestarts.get(`room:${room.id}`) ?? { count: 0 };
      const wait = [1000, 5000, 30_000, 60_000][Math.min(restarts.count, 3)];
      restarts.count++;
      restarts.timer = setTimeout(() => this.startRoom(stored.name, room.id), wait);
      restarts.timer.unref?.();
      this.serviceRestarts.set(`room:${room.id}`, restarts);
    });
  }

  stopRoomHandler(roomId: string): void {
    const restarts = this.serviceRestarts.get(`room:${roomId}`);
    if (restarts?.timer) clearTimeout(restarts.timer);
    this.serviceRestarts.delete(`room:${roomId}`);
    const entry = this.roomProcs.get(roomId);
    if (!entry) return;
    entry.stopping = true;
    if (entry.container) {
      const [docker, ...first] = this.node.containerSetup.docker;
      spawnSync(docker, [...first, 'stop', '-t', '5', entry.container], { windowsHide: true, timeout: 20_000 });
    }
    entry.child.kill();
    this.roomProcs.delete(roomId);
  }

  roomProcs = new Map<string, { child: ChildProcess; stopping: boolean; container?: string }>();

  /** End rooms the room service runs (all of them, or those in projects it left): handler stopped, room closed for everyone. */
  async closeHostedRooms(name: string, keep: (room: StoredRoom) => boolean = () => false): Promise<void> {
    const stored = this.storedServices().find((s) => s.name === name);
    const key = this.core.agents.find((a) => a.name === name);
    if (!stored?.hosted || !key) return;
    const gone = Object.values(stored.hosted).filter((r) => !keep(r));
    for (const room of gone) {
      this.stopRoomHandler(room.id);
      await this.closeServiceRoom(key, room.project, room.id);
    }
    if (gone.length) this.saveServices(this.storedServices().map((s) => (s.name === name ? { ...s, hosted: Object.fromEntries(Object.entries(s.hosted ?? {}).filter(([id]) => !gone.some((g) => g.id === id))) } : s)));
    this.emitLive();
  }

  /** The profile everyone sees: signed by the service's own key, public. */
  publishServiceProfile(stored: StoredService): void {
    this.node.replica.write(this.serviceKey(stored.name), { kind: KIND_SERVICE_PROFILE, body: { name: stored.name, description: stored.description, ...(stored.icon ? { icon: stored.icon } : {}), ...(stored.builtin ? { builtin: stored.builtin } : {}), contract: stored.contract as unknown as Json } });
  }

  /**
   * A service: code under a key of its own, in the spaces you add it to, running a command. Or one Weave ships
   * (`builtin: 'room'`): the node runs it itself, and it gets its contract from Weave.
   */
  async addService(input: { name?: string; description?: string; icon?: string; contract?: ServiceContract; spaces?: string[]; command?: string[]; node?: string; builtin?: 'room' }): Promise<ServiceInfo> {
    if (this.core.isLinkedNode) throw new Error("an always-on node can't issue keys: add the service on one of your computers, with --node for this one");
    const command = input.command?.filter((part) => typeof part === 'string' && part.length);
    const builtin = input.builtin === 'room' ? ('room' as const) : undefined;
    if (builtin && command?.length) throw new Error('the room service runs in Weave: its rooms say what they run');
    const name = serviceName(input.name ?? builtin);
    if (!name) throw new Error('a service name is lowercase letters, digits and dashes (up to 40)');
    if (this.core.agents.some((a) => a.name === name)) throw new Error(`you already have an agent or service named "${name}"`);
    // The room service writes rooms and nothing else; it reads only what's addressed to it.
    const contract = parseContract(builtin ? { reads: 'addressed', writes: [], room: true, version: '1.0' } : input.contract);
    if (!contract) throw new Error('a contract says what the service reads (addressed, space, or {kinds: [...]}), which kinds it writes, and its version (like 1.0)');
    if (input.node) {
      if (this.handedOver().has(name)) throw new Error(`you already have a service named "${name}"`);
      return this.addNodeService(name, contract, { ...input, ...(builtin ? { builtin, description: input.description ?? 'Rooms: a way to join in with the project’s participants' } : {}) }, command);
    }
    const stored: StoredService = {
      name,
      description: input.description?.trim().slice(0, 1000) ?? (builtin ? 'Rooms: a way to join in with the project’s participants' : ''),
      ...(input.icon?.startsWith('wblob:') ? { icon: input.icon } : {}),
      contract,
      spaces: this.serviceSpaces(input.spaces ?? []),
      ...(command?.length ? { command } : {}),
      ...(builtin ? { builtin } : {}),
      settings: {},
      token: b64u.encode(randomBytes(24)),
      enabled: true,
    };
    // Its own key, with exactly its contract's rights; named so that everyone knows it's a service.
    const permissions = servicePermissions(contract);
    const key = createAndSaveAgent(this.node.home, this.node.identity.author, name, permissions);
    this.node.replica.write(this.node.identity, delegation(key.did, 'agent', permissions, `${SERVICE_PREFIX}${name}`));
    this.core.agents.push(key);
    this.saveServices([...this.storedServices(), stored]);
    this.publishServiceProfile(stored);
    this.announceService(key.did, [], stored.spaces);
    // Services start once the app API runs (it gives them WEAVE_API).
    if (this.serviceApi) await this.startAppApi();
    this.startService(stored);
    return this.serviceInfo(this.storedService(name));
  }

  async services(): Promise<ServiceInfo[]> {
    const here = this.storedServices().map((s) => this.serviceInfo(s));
    // On a computer: also those it handed to always-on nodes (the node lists them as its own).
    const away = this.core.isLinkedNode ? [] : [...this.handedOver().values()].map((h) => this.handoverInfo(h));
    return [...here, ...away];
  }

  // Services on always-on nodes: made on a computer, handed over sealed, run there.

  /** Your always-on nodes' keys, by name or key. */
  nodeKey(ref: string): { did: Did; name: string } {
    const nodes = this.node.replica.authority.grantsOf(this.node.identity.author).filter((g) => g.role === 'agent' && g.name?.startsWith(NODE_PREFIX) && g.revokedAfter === undefined);
    const found = nodes.find((g) => g.subject === ref || g.name === ref || g.name === `${NODE_PREFIX}${ref}`);
    if (!found) throw new Error(`you have no always-on node "${ref}"${nodes.length ? ` (yours: ${nodes.map((g) => g.name!.slice(NODE_PREFIX.length)).join(', ')})` : ''}`);
    return { did: found.subject, name: found.name!.slice(NODE_PREFIX.length) };
  }

  /** The latest handover of each service still on a node (removed ones left out), as your devices read them. */
  handedOver(): Map<string, Handover> {
    const latest = new Map<string, Handover>();
    for (const d of this.core.decodeAll().filter((x) => x.private && x.inner.kind === KIND_SERVICE_HANDOVER).sort((a, b) => a.event.time.localeCompare(b.event.time))) {
      const body = d.inner.body as unknown as Handover;
      if (typeof body?.service !== 'string') continue;
      if (body.removed) latest.delete(body.service);
      else latest.set(body.service, { ...body, id: d.id });
    }
    return latest;
  }

  handoverInfo(h: Handover): ServiceInfo {
    return {
      name: h.service,
      did: h.did,
      description: h.description ?? '',
      ...(h.icon ? { icon: h.icon } : {}),
      contract: h.contract,
      spaces: h.spaces.flatMap((id) => {
        const space = this.core.spaces.get(id);
        return space ? [{ id, kind: space.kind, name: this.core.spaceName(space) }] : [];
      }),
      ...(h.command ? { command: h.command } : {}),
      ...(h.builtin ? { builtin: h.builtin, rooms: Object.values(h.hosted ?? {}).map((r) => this.hostedRoomInfo(r, false)) } : {}),
      settings: h.settingNames ?? [],
      enabled: h.enabled !== false,
      running: false,
      node: { did: h.node, name: this.nodeKey(h.node).name },
    };
  }

  async addNodeService(name: string, contract: ServiceContract, input: { description?: string; icon?: string; spaces?: string[]; node?: string; builtin?: 'room' }, command?: string[]): Promise<ServiceInfo> {
    const node = this.nodeKey(input.node!);
    const key = createSubKey(this.node.identity.author);
    const permissions = servicePermissions(contract);
    this.node.replica.write(this.node.identity, delegation(key.did, 'agent', permissions, `${SERVICE_PREFIX}${name}`));
    const description = input.description?.trim().slice(0, 1000) ?? '';
    const icon = input.icon?.startsWith('wblob:') ? input.icon : undefined;
    // The profile, signed by the service's own key, before the key leaves this computer for good.
    this.node.replica.write(key, { kind: KIND_SERVICE_PROFILE, body: { name, description, ...(icon ? { icon } : {}), ...(input.builtin ? { builtin: input.builtin } : {}), contract: contract as unknown as Json } });
    const handover: Omit<Handover, 'id'> = {
      service: name,
      node: node.did,
      did: key.did,
      contract,
      description,
      ...(icon ? { icon } : {}),
      spaces: this.serviceSpaces(input.spaces ?? []),
      ...(command?.length ? { command } : {}),
      ...(input.builtin ? { builtin: input.builtin, hosted: {}, approved: [] } : {}),
      enabled: true,
      settingNames: [],
      box: boxTo(node.did, { secretKey: b64u.encode(key.keys.secretKey), publicKey: b64u.encode(key.keys.publicKey), settings: {} }) as unknown as Json,
    };
    this.node.replica.write(this.node.identity, this.core.sealForSelf({ kind: KIND_SERVICE_HANDOVER, body: handover as unknown as Json }));
    this.announceService(key.did, [], handover.spaces);
    return this.handoverInfo({ ...handover, id: '' });
  }

  /** A change to a service on a node: a new handover; settings travel as changes, boxed for that node only. */
  changeNodeService(before: Handover, change: { spaces?: string[]; command?: string[] | null; settings?: Record<string, string | null>; enabled?: boolean; description?: string; removed?: true; hosted?: Record<string, StoredRoom>; approved?: string[] }): void {
    const { id: _id, box: _box, command: _command, ...rest } = before;
    const command = change.command === null ? undefined : (change.command ?? before.command);
    const names = new Set(before.settingNames ?? []);
    for (const [key, value] of Object.entries(change.settings ?? {})) {
      if (!/^[A-Z_][A-Z0-9_]{0,63}$/.test(key) || key.startsWith('WEAVE_')) throw new Error(`a setting is named like an environment variable (A-Z, 0-9, _), not starting with WEAVE_: ${key}`);
      if (value === null) names.delete(key);
      else names.add(key);
    }
    const spaces = change.spaces ? this.serviceSpaces(change.spaces) : before.spaces;
    // The room service's rooms: only in projects it's in, none while it's off.
    const hosted = before.builtin ? Object.fromEntries(Object.entries(change.hosted ?? before.hosted ?? {}).filter(([, r]) => spaces.includes(r.project) && change.enabled !== false)) : undefined;
    const after: Omit<Handover, 'id'> = {
      ...rest,
      spaces,
      ...(command?.length ? { command } : {}),
      ...(change.enabled !== undefined ? { enabled: change.enabled } : {}),
      ...(change.description !== undefined ? { description: change.description.trim().slice(0, 1000) } : {}),
      settingNames: [...names].sort(),
      ...(change.settings && Object.keys(change.settings).length ? { box: boxTo(before.node, { settings: change.settings }) as unknown as Json } : {}),
      ...(change.removed ? { removed: true as const } : {}),
      ...(hosted ? { hosted } : {}),
      ...(change.approved ? { approved: change.approved } : {}),
    };
    this.node.replica.write(this.node.identity, this.core.sealForSelf({ kind: KIND_SERVICE_HANDOVER, body: after as unknown as Json }));
    this.announceService(before.did, before.spaces, change.removed ? [] : after.spaces);
  }

  /** On an always-on node: take over the services handed to it, change them, or let them go. Each handover once. */
  async takeHandovers(): Promise<number> {
    if (!this.core.isLinkedNode) return 0;
    const appliedFile = joinPath(this.node.home.dir, 'handovers.json');
    const applied = new Set<string>(existsSync(appliedFile) ? (JSON.parse(readFileSync(appliedFile, 'utf8')) as string[]) : []);
    const mine = this.core.decodeAll()
      .filter((d) => d.private && d.inner.kind === KIND_SERVICE_HANDOVER && !applied.has(d.id) && (d.inner.body as { node?: unknown } | null)?.node === this.node.identity.did)
      .sort((a, b) => a.event.time.localeCompare(b.event.time));
    let changed = 0;
    for (const d of mine) {
      applied.add(d.id);
      const h = d.inner.body as unknown as Handover;
      const opened = h.box ? this.openHandoverBox(h.box) : undefined;
      const list = this.storedServices();
      const before = list.find((s) => s.name === h.service);
      if (h.removed) {
        if (!before) continue;
        // Its rooms end first, signed with its key, before the key goes.
        await this.closeHostedRooms(h.service);
        this.stopService(h.service);
        this.core.setAgents(this.core.agents.filter((a) => a.name !== h.service));
        rmSync(joinPath(this.node.home.agents, `${h.service}.json`), { force: true });
        this.saveServices(list.filter((s) => s.name !== h.service));
        changed++;
        continue;
      }
      if (!before) {
        // New here: its key comes in the box.
        if (typeof opened?.secretKey !== 'string' || typeof opened.publicKey !== 'string') continue;
        const key: AgentKey = { author: this.node.identity.author, did: h.did, keys: { secretKey: b64u.decode(opened.secretKey), publicKey: b64u.decode(opened.publicKey) }, name: h.service, permissions: servicePermissions(h.contract) };
        saveAgent(this.node.home, key);
        this.core.setAgents([...this.core.agents.filter((a) => a.name !== h.service), key]);
      }
      const settings = { ...(before?.settings ?? {}) };
      for (const [name, value] of Object.entries((opened?.settings ?? {}) as Record<string, string | null>)) {
        if (value === null) delete settings[name];
        else settings[name] = String(value);
      }
      const stored: StoredService = {
        name: h.service,
        description: h.description ?? '',
        ...(h.icon ? { icon: h.icon } : {}),
        contract: h.contract,
        spaces: h.spaces,
        ...(h.command?.length ? { command: h.command } : {}),
        ...(h.builtin ? { builtin: h.builtin, approved: h.approved ?? [] } : {}),
        settings,
        token: before?.token ?? b64u.encode(randomBytes(24)),
        enabled: h.enabled !== false,
      };
      // The room service: rooms gone from the handover end here; new ones are announced and run here.
      const rooms = h.builtin && stored.enabled ? (h.hosted ?? {}) : {};
      await this.closeHostedRooms(h.service, (r) => !!rooms[r.id]);
      this.saveServices([...this.storedServices().filter((s) => s.name !== h.service), { ...stored, ...(h.builtin ? { hosted: { ...(this.storedServices().find((s) => s.name === h.service)?.hosted ?? {}), ...rooms } } : {}) }]);
      if (h.builtin) {
        if (this.serviceApi) await this.startAppApi();
        for (const room of Object.values(rooms)) {
          this.announceRoom(h.service, room);
          this.startRoom(h.service, room.id);
        }
      } else {
        this.stopService(h.service);
        this.startService(this.storedService(h.service));
      }
      changed++;
    }
    if (mine.length) writeFileSync(appliedFile, JSON.stringify([...applied]));
    return changed;
  }

  openHandoverBox(box: Json): { secretKey?: unknown; publicKey?: unknown; settings?: unknown } | undefined {
    try {
      return openBox(this.node.identity.keys.secretKey, this.node.identity.keys.publicKey, box as unknown as Box) as { secretKey?: unknown; publicKey?: unknown; settings?: unknown };
    } catch {
      return undefined;
    }
  }

  /** Change a service: its spaces, settings (once, or per space: `spaceSettings`, by space), command, or whether it runs. */
  async setService(input: { name: string; spaces?: string[]; command?: string[] | null; settings?: Record<string, string | null>; spaceSettings?: Record<string, Record<string, string | null>>; enabled?: boolean; description?: string }): Promise<ServiceInfo> {
    const away = this.core.isLinkedNode ? undefined : this.handedOver().get(input.name);
    if (away && !this.storedServices().some((s) => s.name === input.name)) {
      if (input.spaceSettings) throw new Error('per-space settings work on this computer for now: always-on nodes come next');
      this.changeNodeService(away, input);
      return this.handoverInfo(this.handedOver().get(input.name)!);
    }
    const before = this.storedService(input.name);
    if (before.builtin && input.command) throw new Error(`${before.name} runs in Weave: its rooms say what they run`);
    const settings = { ...before.settings };
    this.checkSettings(undefined, input.settings ?? {});
    for (const [key, value] of Object.entries(input.settings ?? {})) {
      if (value === null) delete settings[key];
      else settings[key] = String(value);
    }
    const spaces = input.spaces ? this.serviceSpaces(input.spaces) : before.spaces;
    // Per-space settings: only for spaces it's in; a space it leaves takes its settings along.
    const spaceSettings: Record<string, Record<string, string>> = Object.fromEntries(Object.entries(before.spaceSettings ?? {}).filter(([id]) => spaces.includes(id)));
    for (const [ref, given] of Object.entries(input.spaceSettings ?? {})) {
      const id = this.core.space(ref).id;
      if (!spaces.includes(id)) throw new Error(`${before.name} isn't in ${this.core.space(ref).name}: add it there first`);
      this.checkSettings(undefined, given);
      const mine = { ...(spaceSettings[id] ?? {}) };
      for (const [key, value] of Object.entries(given)) {
        if (value === null) delete mine[key];
        else mine[key] = String(value).slice(0, 4096);
      }
      if (Object.keys(mine).length) spaceSettings[id] = mine;
      else delete spaceSettings[id];
    }
    const command = input.command === null ? undefined : input.command !== undefined ? input.command.filter((part) => typeof part === 'string' && part.length) : before.command;
    const { command: _command, spaceSettings: _spaceSettings, ...rest } = before;
    const after: StoredService = {
      ...rest,
      spaces,
      ...(command?.length ? { command } : {}),
      settings,
      ...(Object.keys(spaceSettings).length ? { spaceSettings } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.description !== undefined ? { description: input.description.trim().slice(0, 1000) } : {}),
    };
    this.saveServices(this.storedServices().map((s) => (s.name === after.name ? after : s)));
    if (after.description !== before.description) this.publishServiceProfile(after);
    if (!this.core.isLinkedNode) this.announceService(this.serviceKey(after.name).did, before.spaces, after.spaces);
    // Turned off, its rooms end; out of a project, its rooms there end.
    if (before.enabled && !after.enabled) await this.closeHostedRooms(after.name);
    else await this.closeHostedRooms(after.name, (room) => after.spaces.includes(room.project));
    if (after.builtin) {
      if (this.serviceApi) await this.startAppApi();
      for (const id of Object.keys(this.storedService(after.name).hosted ?? {})) this.startRoom(after.name, id);
      return this.serviceInfo(this.storedService(after.name));
    }
    // Settings and commands take effect on a fresh start.
    this.stopService(after.name);
    if (this.serviceApi) await this.startAppApi();
    this.startService(after);
    return this.serviceInfo(this.storedService(after.name));
  }

  async removeService(name: string): Promise<void> {
    const away = this.core.isLinkedNode ? undefined : this.handedOver().get(name);
    if (away && !this.storedServices().some((s) => s.name === name)) {
      // Its key was issued here: revoked here, and the node lets it go.
      this.node.replica.write(this.node.identity, revocation(away.did, this.node.replica.number(away.did)));
      this.changeNodeService(away, { removed: true });
      return;
    }
    const stored = this.storedService(name);
    await this.closeHostedRooms(name);
    this.stopService(name);
    const key = this.serviceKey(name);
    this.announceService(key.did, stored.spaces, []);
    // Everything it signs from now on counts nowhere.
    this.node.replica.write(this.node.identity, revocation(key.did, this.node.replica.number(key.did)));
    this.core.setAgents(this.core.agents.filter((a) => a.name !== name));
    rmSync(joinPath(this.node.home.agents, `${name}.json`), { force: true });
    this.saveServices(this.storedServices().filter((s) => s.name !== stored.name));
  }

  /** Whether a key is a service of that person: an agent key they named service:… */
  isServiceKey(signer: string, author: Did): boolean {
    const grant = this.node.replica.authority.grant(signer as Did);
    return !!grant && grant.role === 'agent' && grant.author === author && !!grant.name?.startsWith(SERVICE_PREFIX) && grant.revokedAfter === undefined;
  }

  async serviceProfiles(): Promise<ServiceProfileInfo[]> {
    const events = this.node.replica.events((e) => e.kind === KIND_SERVICE_PROFILE);
    return profilesOf(events, (signer, author) => this.isServiceKey(signer, author)).map((p) => ({
      did: p.did,
      person: this.core.actor(p.person, p.person),
      name: p.name,
      description: p.description,
      ...(p.icon ? { icon: p.icon } : {}),
      ...(p.builtin ? { builtin: p.builtin } : {}),
      contract: p.contract,
      time: p.time,
    }));
  }

  /** A service by its key, or by "person/name" or its name when that's unique among the profiles known here. */
  async serviceDid(ref: string): Promise<Did> {
    const profiles = await this.serviceProfiles();
    const byKey = profiles.find((p) => p.did === ref);
    if (byKey) return byKey.did;
    const [person, name] = ref.includes('/') ? ref.split('/', 2) : [undefined, ref];
    const matches = profiles.filter((p) => p.name === name && (!person || p.person.name === person || p.person.did === person));
    if (matches.length === 1) return matches[0].did;
    throw new Error(matches.length ? `several services are named "${ref}": say whose (person/name)` : `no service "${ref}" is known here`);
  }

  async askService(input: { space: string; service: string; text: string; data?: Json; as?: string }): Promise<ServiceRequestInfo> {
    const to = await this.serviceDid(input.service);
    const text = input.text?.trim() ?? '';
    if (!text && input.data === undefined) throw new Error('ask with some text or data');
    const item = await this.node.publish({ kind: KIND_SERVICE_REQUEST, body: { to, ...(text ? { text } : {}), ...(input.data !== undefined ? { data: input.data } : {}) }, space: input.space, as: input.as });
    return (await this.serviceRequests({ space: item.space?.id ?? input.space })).find((r) => r.id === item.id)!;
  }

  async serviceRequests(input: { space: string; service?: string }): Promise<ServiceRequestInfo[]> {
    const space = this.core.space(input.space);
    const entries = this.core.entries(space);
    const to = input.service ? await this.serviceDid(input.service) : undefined;
    const results = entries.filter((e) => e.kind === KIND_SERVICE_RESULT);
    return requestsOf(entries, to).map((r) => ({
      id: r.id,
      to: this.core.actor(this.node.replica.authority.grant(r.to)?.author ?? r.to, r.to),
      from: this.core.actor(r.from, r.from),
      text: r.text,
      ...(r.data !== undefined ? { data: r.data as Json } : {}),
      time: r.time,
      // Only the service it was for answers it.
      results: results
        .filter((e) => (e.body as { request?: unknown } | null)?.request === r.id && e.event.signer === r.to)
        .map((e) => {
          const body = (e.body ?? {}) as Record<string, Json>;
          return { id: e.id, text: typeof body.text === 'string' ? body.text : '', ...(body.data !== undefined ? { data: body.data } : {}), ...(typeof body.error === 'string' ? { error: body.error } : {}), time: e.event.time };
        }),
    }));
  }

  /**
   * What a service sees: in the spaces it was added to, requests addressed to it, and what its contract reads.
   * Never private data, never other spaces.
   */
  serviceSees(stored: StoredService, did: Did, d: Decoded): boolean {
    if (d.private || !d.space || !stored.spaces.includes(d.space.id)) return false;
    if (d.inner.kind === KIND_SERVICE_REQUEST) return (d.inner.body as { to?: unknown } | null)?.to === did;
    return serviceReads(stored.contract, d.inner.kind);
  }

  /** The gate a service's token opens on the local API, or undefined for any other token. */
  serviceGate(token: string): ServiceGate | undefined {
    const given = Buffer.from(token);
    const stored = this.storedServices().find((s) => {
      const expected = Buffer.from(s.token);
      return expected.length === given.length && timingSafeEqual(expected, given);
    });
    if (!stored || !stored.enabled) return undefined;
    const name = stored.name;
    const key = this.serviceKey(name);
    const current = () => this.storedService(name);
    const inSpace = (ref: string) => {
      const space = this.core.space(ref);
      if (!current().spaces.includes(space.id)) throw new Error(`service "${name}" wasn't added to ${space.name}`);
      return space;
    };
    return {
      me: () => ({
        name,
        did: key.did,
        person: this.node.identity.author,
        contract: current().contract,
        spaces: this.serviceInfo(current()).spaces.map(({ id, kind, name: spaceName }) => ({ id, kind, name: spaceName, settings: current().spaceSettings?.[id] ?? {} })),
      }),
      events: (since) =>
        this.core.decodeAll()
          .filter((d) => (!since || d.event.time > since) && this.serviceSees(current(), key.did, d))
          .sort((a, b) => a.event.time.localeCompare(b.event.time))
          .map((d) => this.core.toItem(d)),
      watch: async (onItem, signal) => {
        const unsubscribe = this.node.replica.onAppend((event) => {
          const decoded = this.core.decode(event);
          if (decoded && this.serviceSees(current(), key.did, decoded)) onItem(this.core.toItem(decoded));
        });
        await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
        unsubscribe();
      },
      publish: async ({ space, kind, body }) => {
        const target = inSpace(space);
        if (kind === KIND_SERVICE_REQUEST) throw new Error('a service answers requests; it doesn\'t send them');
        return this.node.publish({ kind, body: body ?? null, space: target.id, as: name });
      },
      answer: async ({ request, text, data, error }) => {
        const found = this.core.find(request, [KIND_SERVICE_REQUEST]);
        if (!found.space || (found.inner.body as { to?: unknown } | null)?.to !== key.did) throw new Error('that request isn\'t addressed to this service');
        inSpace(found.space.id);
        return this.node.publish({ kind: KIND_SERVICE_RESULT, body: { request: found.id, ...(text ? { text: String(text).slice(0, 4000) } : {}), ...(data !== undefined ? { data } : {}), ...(error ? { error: String(error).slice(0, 1000) } : {}) }, space: found.space.id, as: name });
      },
    };
  }

  async closeServiceRoom(key: AgentKey, projectId: string, roomId: string): Promise<void> {
    await this.core.live.stopHosting(roomId);
    const project = this.core.spaces.get(projectId);
    if (project) this.node.replica.write(key, sealFor(this.core.managed.cipher(project), { kind: KIND_ROOM, body: { room: roomId, agent: key.did, open: false } }));
  }

  // Running services: one process each, started with the address of the local API and its own token.

  serviceProcs = new Map<string, { child: ChildProcess; stopping: boolean }>();
  serviceRestarts = new Map<string, { count: number; timer?: ReturnType<typeof setTimeout> }>();
  serviceApi?: string;

  /** Start the enabled services and the room service's rooms, now that the local API is up (the daemon calls this). */
  runServices(api: { port: number }): void {
    this.serviceApi = `http://127.0.0.1:${api.port}/v1/service`;
    void this.startAppApi().then(() => {
      for (const stored of this.storedServices()) {
        this.startService(stored);
        for (const id of Object.keys(stored.hosted ?? {})) this.startRoom(stored.name, id);
      }
    });
  }

  startService(stored: StoredService): void {
    if (!this.serviceApi || !this.appApiPort || !stored.enabled || !stored.command?.length || this.serviceProcs.has(stored.name)) return;
    const dir = joinPath(this.node.home.dir, 'services', stored.name);
    mkdirSync(dir, { recursive: true });
    const log = createWriteStream(joinPath(dir, 'service.log'), { flags: 'a' });
    const project = stored.spaces.filter((id) => this.core.spaces.get(id)?.kind === 'project');
    const [command, ...args] = stored.command;
    const child = spawn(command, args, {
      cwd: dir,
      // Its settings, Weave's app API (who is who, as apps ask it; WEAVE_TOKEN also checks X-Weave-Person) and its
      // service API; nothing of the daemon's own environment it doesn't need. Weave's own variables last.
      env: {
        PATH: process.env.PATH ?? '',
        SYSTEMROOT: process.env.SYSTEMROOT ?? '',
        HOME: dir,
        ...stored.settings,
        WEAVE_API: `http://127.0.0.1:${this.appApiPort}`,
        WEAVE_TOKEN: stored.token,
        ...(project.length === 1 ? { WEAVE_PROJECT: project[0] } : {}),
        WEAVE_SERVICE: stored.name,
        WEAVE_SERVICE_API: this.serviceApi,
        WEAVE_SERVICE_TOKEN: stored.token,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    child.stdout?.pipe(log);
    child.stderr?.pipe(log);
    const entry = { child, stopping: false };
    this.serviceProcs.set(stored.name, entry);
    child.on('error', (error) => log.write(`weave: couldn't start ${stored.name}: ${error.message}\n`));
    child.on('exit', (code) => {
      log.write(`weave: ${stored.name} exited (${code})\n`);
      log.end();
      if (this.serviceProcs.get(stored.name) === entry) this.serviceProcs.delete(stored.name);
      if (entry.stopping) return;
      // Crashed: start again, waiting longer each time.
      const restarts = this.serviceRestarts.get(stored.name) ?? { count: 0 };
      const wait = [1000, 5000, 30_000, 60_000][Math.min(restarts.count, 3)];
      restarts.count++;
      restarts.timer = setTimeout(() => {
        const now = this.storedServices().find((s) => s.name === stored.name);
        if (now) this.startService(now);
      }, wait);
      restarts.timer.unref?.();
      this.serviceRestarts.set(stored.name, restarts);
    });
  }

  stopService(name: string): void {
    const restarts = this.serviceRestarts.get(name);
    if (restarts?.timer) clearTimeout(restarts.timer);
    this.serviceRestarts.delete(name);
    const entry = this.serviceProcs.get(name);
    if (!entry) return;
    entry.stopping = true;
    entry.child.kill();
    this.serviceProcs.delete(name);
  }

  stopServiceProcesses(): void {
    for (const id of [...this.roomProcs.keys(), ...[...this.serviceRestarts.keys()].filter((k) => k.startsWith('room:')).map((k) => k.slice('room:'.length))]) this.stopRoomHandler(id);
    for (const name of [...this.serviceProcs.keys(), ...this.serviceRestarts.keys()]) this.stopService(name);
  }
}
