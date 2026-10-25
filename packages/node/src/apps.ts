import { type StoredSpace } from './spacestore.ts';
import { type AppAsset, type AppImage, type AppInstall, type AppManifest, b64u, compareVersions, type Did, type Entry, formatVersion, isRepoName, type Json, KIND_APP, KIND_ROOM, mayAct, parseManifest, parseVersion, randomBytes, reposOf, type Room, roomsOf, sealFor, showOpen, type SpaceKind, type SpaceState, startCommand } from '@weave/core';
import { LiveRooms, portOpen } from './live.ts';
import { Payments } from './payments.ts';
import { Badges } from './badges.ts';
import { GitHub, type GitHubApp, type ReleaseAsset } from './github.ts';
import { roomKeyPair, SwarmNode } from '@weave/net';
import { ManagedKeys } from './managed.ts';
import { type AppEnv, type AppLaunchInfo, type AppPerson, type Notice, type RoomChatMessage, type RoomInfo, type UpdateInfo } from './backend.ts';
import { AppProcesses, launchFingerprint } from './applaunch.ts';
import { AppApiError, type AppApiServer, sameToken, startAppApi } from './appapi.ts';
import { guessPlatform, platformKey, saveVerified, tagFolder, unpack } from './appinstall.ts';
import { spawnSync } from 'node:child_process';
import { machinePolicy } from './machine.ts';
import { saveConfig } from './config.ts';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join as joinPath, resolve as resolvePath } from 'node:path';
import { readSecretJson, writeSecretJson } from './vault.ts';
import { createHash, createHmac } from 'node:crypto';
import { readJson, writeJson } from './home.ts';
import { imageDigest, imageLocation } from './registry.ts';
import { type WeaveNode, UPDATE_SOURCE } from './node.ts';

/*
 * A project's app: published by its maintainers, installed from a GitHub
 * release (or run in a container) and started by hosts, the API it asks Weave
 * through (who is who, access), its settings and updates; and live rooms with
 * shared apps. It sees the node's internals only through AppsCore.
 */

/** A GitHub sign-in waiting for its code, or why the last one failed. */
/** An app being installed from its release, or why that failed. */
interface InstallJob {
  progress?: { state: 'downloading' | 'unpacking'; done: number; total?: number };
  error?: string;
}

/** A promise that gives up after `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timed out')), ms).unref())]);
}

/** What Apps needs of the node's internals, and nothing more (the node builds it in its constructor). */
export interface AppsCore {
  project(ref: string): StoredSpace;
  agentMay(name: string, kind: string): void;
  maintainerState(project: StoredSpace): SpaceState;
  state(space: StoredSpace): SpaceState;
  entries(space: StoredSpace): Entry[];
  readonly spaces: Map<string, StoredSpace>;
  githubAuth(): { token: string; login: string } | undefined;
  readonly live: LiveRooms;
  readonly payments: Payments;
  readonly badges: Badges;
  githubApp(): GitHubApp;
  readonly swarm: SwarmNode | undefined;
  space(ref: string, kind?: SpaceKind): StoredSpace;
  readonly managed: ManagedKeys;
  selfSecret(): Uint8Array;
  readonly liveListeners: Set<(notice?: Notice) => void>;
}

export class Apps {
  private readonly node: WeaveNode;
  private readonly core: AppsCore;

  constructor(node: WeaveNode, core: AppsCore) {
    this.node = node;
    this.core = core;
  }

  // ---------------------------------------------------------------- rooms and shared apps

  /** Apps this node started for the person, by project id. */
  apps = new AppProcesses(() => this.emitLive());
  /** The app API (see appapi.ts), started when an app first needs it; its tokens, one per project, for this run. */
  appApi?: Promise<AppApiServer>;
  appTokens = new Map<string, string>();

  /** Apps stop, and the API they ask Weave through closes. */
  async shutdownApps(): Promise<void> {
    this.apps.stopAll();
    const appApi = this.appApi;
    this.appApi = undefined;
    this.appTokens.clear();
    await (await appApi?.catch(() => undefined))?.close();
  }

  /** Apps being installed (or failed to), by project id. */
  installs = new Map<string, InstallJob>();
  installing = new Map<string, Promise<unknown>>();

  async projectApp(ref: string): Promise<AppManifest | null> {
    return this.app(this.core.project(ref)) ?? null;
  }

  async publishApp(input: { project: string; manifest: unknown; folder?: string; as?: string }): Promise<AppManifest> {
    if (input.as) this.core.agentMay(input.as, KIND_APP);
    const project = this.core.project(input.project);
    this.core.maintainerState(project);
    let manifest = parseManifest(input.manifest);
    // weave.app.json usually doesn't list the release files ("weave app release" adds them): keep the ones published.
    const before = this.app(project)?.install;
    if (before?.assets && !manifest.install?.assets) manifest = { ...manifest, install: { ...before, ...(manifest.install?.steps ? { steps: manifest.install.steps } : {}) } };
    await this.node.publish({ kind: KIND_APP, body: manifest as unknown as Json, space: project.id, as: input.as });
    if (input.folder) this.rememberAppFolder(project.id, input.folder);
    return manifest;
  }

  /** The command this computer starts a project's app with: its container when there's one and Docker runs, else its release build's when Weave installed one. */
  startCommand(project: StoredSpace, app: AppManifest | undefined): string[] | undefined {
    if (this.containerOf(app)) return this.containerCommand(project, app!);
    return startCommand(app, platformKey(), !!this.installed(project.id));
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

  /** The container's name: one per project on this computer. */
  containerName(project: StoredSpace): string {
    return `weave-${project.id.toLowerCase().replace(/[^a-z0-9_.-]/g, '-')}`;
  }

  /**
   * How the app's container runs: by its digest, with only the services' ports (on 127.0.0.1; on Linux in the
   * host's network, so tunnel ports stay as they are), no extra privileges, nothing of the computer mounted, and its
   * settings and Weave's variables by name only (their values come from the environment, not the command line).
   */
  containerCommand(project: StoredSpace, app: AppManifest): string[] {
    const image = app.install!.image!;
    const linux = process.platform === 'linux';
    const network = linux ? ['--network', 'host'] : app.services.flatMap((s) => ['-p', `127.0.0.1:${s.port}:${s.port}${s.protocol === 'tcp' ? '/tcp' : ''}`]);
    const names = [...(app.env ?? []).map((e) => e.name), 'WEAVE_API', 'WEAVE_TOKEN', 'WEAVE_PROJECT'];
    return [
      ...this.node.containerSetup.docker,
      'run',
      '--rm',
      '--name',
      this.containerName(project),
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
    const project = this.core.project(ref);
    const app = this.app(project);
    const start = app?.start;
    const command = this.startCommand(project, app);
    const install = this.installInfo(project, app);
    const folder = this.node.config.appFolders[project.id];
    const run = this.apps.status(project.id);
    return {
      ...(command ? { command } : {}),
      ...(start?.hint ? { hint: start.hint } : {}),
      ...(folder ? { folder } : {}),
      approved: !!command && !!folder && this.node.config.approvedLaunches[project.id] === launchFingerprint(command, folder),
      running: this.apps.running(project.id),
      ...(run ? { started: run.started, ...(run.exit ? { exit: run.exit } : {}) } : {}),
      log: run?.log ?? [],
      ...(app?.env ? { settings: app.env.map((e) => ({ ...e, set: !!this.appSettings()[project.id]?.[e.name] })) } : {}),
      ...(app ? { release: this.releaseInfo(project, app) } : {}),
      ...(install ? { install } : {}),
      ...(app?.start?.image && app.install?.image
        ? { container: { image: app.install.image.ref, tag: app.install.image.tag, digest: app.install.image.digest, docker: this.dockerUp(), active: !!this.containerOf(app) } }
        : {}),
    };
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

  async setAppFolder(input: { project: string; folder: string }): Promise<AppLaunchInfo> {
    const project = this.core.project(input.project);
    if (input.folder.trim()) this.rememberAppFolder(project.id, input.folder.trim());
    else {
      const { [project.id]: _gone, ...rest } = this.node.config.appFolders;
      this.node.config = { ...this.node.config, appFolders: rest };
      saveConfig(this.node.home, this.node.config);
    }
    return this.appLaunch(project.id);
  }

  async launchApp(input: { project: string; approve?: boolean }): Promise<AppLaunchInfo> {
    const project = this.core.project(input.project);
    const app = this.app(project);
    const command = this.startCommand(project, app);
    if (!app || !command) throw new Error(`${project.name}'s app has no start command; start it yourself${app?.start?.hint ? `: ${app.start.hint}` : ''}`);
    const container = this.containerOf(app);
    // A container needs no copy of the app: it runs in Weave's own folder for the project.
    const folder = container ? this.appsDir(project.id) : this.node.config.appFolders[project.id];
    if (!folder) throw new Error(`choose where ${app.name} is on this computer first (the folder with its weave.app.json)`);
    if (container) mkdirSync(folder, { recursive: true });
    else this.checkAppFolder(project.id, folder);
    const fingerprint = launchFingerprint(command, folder);
    if (this.node.config.approvedLaunches[project.id] !== fingerprint) {
      if (!input.approve) throw new Error(`approve the command first: Weave would run "${command.join(' ')}" in ${folder}`);
      this.node.config = { ...this.node.config, approvedLaunches: { ...this.node.config.approvedLaunches, [project.id]: fingerprint } };
      saveConfig(this.node.home, this.node.config);
    }
    const values = this.appSettings()[project.id] ?? {};
    const missing = (app.env ?? []).filter((e) => !e.optional && !values[e.name]);
    if (missing.length) throw new Error(`${app.name} needs ${missing.map((e) => e.label).join(', ')} first: fill ${missing.length === 1 ? 'it' : 'them'} in under Live (or weave app set ${missing[0].name} -p ${project.name})`);
    // Only the settings this manifest names, and Weave's own variables last, so a setting can't stand in for them.
    const settings = Object.fromEntries((app.env ?? []).filter((e) => values[e.name]).map((e) => [e.name, values[e.name]]));
    const weave = await this.appEnv(project.id);
    if (!container) {
      this.apps.start(project.id, command, folder, { ...settings, ...weave });
      return this.appLaunch(project.id);
    }
    // In a container, Weave's app API is the host's: reached as host.docker.internal (on Linux the host's network is shared).
    const api = process.platform === 'linux' ? weave.WEAVE_API : weave.WEAVE_API.replace('127.0.0.1', 'host.docker.internal');
    const [docker, ...first] = this.node.containerSetup.docker;
    const name = this.containerName(project);
    // One left from before (a crash, a stop that didn't reach Docker) would block the name.
    spawnSync(docker, [...first, 'rm', '-f', name], { windowsHide: true, timeout: 20_000 });
    this.apps.start(project.id, command, folder, { ...settings, ...weave, WEAVE_API: api }, () => void spawnSync(docker, [...first, 'stop', '-t', '5', name], { windowsHide: true, timeout: 20_000 }));
    return this.appLaunch(project.id);
  }

  // ---------------------------------------------------------------- app settings

  get appSettingsFile(): string {
    return joinPath(this.node.home.dir, 'app-settings.json');
  }

  /** Values hosts typed for their apps' settings: project id → variable → value. This computer only. */
  appSettings(): Record<string, Record<string, string>> {
    return readSecretJson<Record<string, Record<string, string>>>(this.node.home, this.appSettingsFile) ?? {};
  }

  async setAppSetting(input: { project: string; name: string; value: string | null }): Promise<AppLaunchInfo> {
    const project = this.core.project(input.project);
    const app = this.app(project);
    const setting = app?.env?.find((e) => e.name === input.name);
    if (!app || !setting) throw new Error(`${app?.name ?? project.name} doesn't ask for ${input.name}${app?.env?.length ? ` (it asks for ${app.env.map((e) => e.name).join(', ')})` : ''}`);
    const value = typeof input.value === 'string' ? input.value.trim() : '';
    if (value.length > 4096 || value.includes('\0')) throw new Error(`${setting.label} is too long`);
    const all = this.appSettings();
    const mine = { ...(all[project.id] ?? {}) };
    if (value) mine[setting.name] = value;
    else delete mine[setting.name];
    if (Object.keys(mine).length) all[project.id] = mine;
    else delete all[project.id];
    writeSecretJson(this.node.home, this.appSettingsFile, all);
    this.emitLive();
    return this.appLaunch(project.id);
  }

  // ---------------------------------------------------------------- app API

  /** What a project's app needs to ask Weave who its players are: Weave passes it when it starts the app; `weave app env` prints it. */
  async appEnv(ref: string): Promise<AppEnv> {
    const project = this.core.project(ref);
    this.appApi ??= startAppApi(
      (token) => [...this.appTokens].find(([, t]) => sameToken(t, token))?.[0],
      (projectId, route, params) => this.appAnswer(projectId, route, params),
    );
    const api = await this.appApi;
    let token = this.appTokens.get(project.id);
    if (!token) this.appTokens.set(project.id, (token = b64u.encode(randomBytes(24))));
    return { WEAVE_API: `http://127.0.0.1:${api.port}`, WEAVE_TOKEN: token, WEAVE_PROJECT: project.id };
  }

  appAnswer(projectId: string, route: string, params: URLSearchParams): unknown {
    const project = this.core.spaces.get(projectId);
    if (!project) throw new AppApiError(404, 'this project is no longer here');
    const me = this.node.identity.author;
    if (route === '/v1/me') return this.appPerson(project, me);
    if (route === '/v1/who') {
      const port = Number(params.get('port'));
      if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error('port: the remote port of the connection (a number)');
      const found = this.core.live.personOnPort(port);
      const room = found && this.allRooms().find((r) => r.room.id === found.room && r.project.id === projectId);
      if (!found || !room) throw new AppApiError(404, 'not a connection through one of this project’s rooms');
      return { ...this.appPerson(project, found.person), room: { id: room.room.id, name: room.room.name } };
    }
    if (route === '/v1/project') {
      const rooms = this.allRooms().filter((r) => r.project.id === projectId && r.room.open && r.room.host === me && this.core.live.isHosting(r.room.id));
      return {
        id: project.id,
        name: project.name,
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
    const token = found && this.appTokens.get(found.project.id);
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

  // ---------------------------------------------------------------- installing the app from its release

  /** Where Weave keeps the apps it installed: apps/<project id>/<tag>. */
  appsDir(projectId: string): string {
    return joinPath(this.node.home.dir, 'apps', projectId);
  }

  /** The release Weave installed for a project, while the project's app folder still points into it. */
  installed(projectId: string): { tag: string; folder: string } | undefined {
    const record = readJson<{ tag?: string; folder?: string }>(joinPath(this.appsDir(projectId), 'installed.json'));
    return record?.tag && record.folder && this.node.config.appFolders[projectId] === record.folder ? { tag: record.tag, folder: record.folder } : undefined;
  }

  installInfo(project: StoredSpace, app: AppManifest | undefined): AppLaunchInfo['install'] {
    const install = app?.install;
    const job = this.installs.get(project.id);
    if (!install && !job) return undefined;
    const asset = install?.assets?.[platformKey()];
    const installed = this.installed(project.id);
    return {
      ...(install?.tag ? { version: install.tag } : {}),
      ...(install?.github ? { repo: install.github } : {}),
      ...(asset ? { asset: { file: asset.file, ...(asset.size ? { size: asset.size } : {}) } } : {}),
      platform: platformKey(),
      ...(installed ? { installed: installed.tag } : {}),
      ...(job?.progress ? { progress: { ...job.progress } } : {}),
      ...(job?.error ? { error: job.error } : {}),
      ...(install?.steps ? { steps: install.steps } : {}),
      ...(install?.app && install.app !== this.core.githubApp().slug ? { otherApp: install.app } : {}),
      ...(asset && startCommand(app, platformKey(), true) ? { command: startCommand(app, platformKey(), true) } : {}),
    };
  }

  async installApp(input: { project: string; approve?: boolean }): Promise<AppLaunchInfo> {
    const project = this.core.project(input.project);
    const app = this.app(project);
    const install = app?.install;
    const asset = install?.assets?.[platformKey()];
    if (!app || !install?.github || !install.tag || !asset) throw new Error(`${project.name} has no release file for this computer (${platformKey()})${install?.steps ? ': install it by hand or with your agent, following its steps' : ''}`);
    if (install.app && install.app !== this.core.githubApp().slug && this.core.githubAuth())
      throw new Error(`${app.name}'s releases go through the GitHub App "${install.app}", and you sign in through "${this.core.githubApp().slug}": switch to it in Keys & devices → Linked accounts (https://github.com/apps/${install.app})`);
    if (this.installs.get(project.id)?.progress) throw new Error(`${app.name} is being installed already`);
    if (this.apps.running(project.id)) throw new Error(`stop ${app.name} first`);
    const job: InstallJob = { progress: { state: 'downloading', done: 0, ...(asset.size ? { total: asset.size } : {}) } };
    this.installs.set(project.id, job);
    const done = this.installRelease(project, app, { github: install.github, tag: install.tag, asset }, input.approve === true).then(
      () => this.installs.delete(project.id),
      (error: Error) => this.installs.set(project.id, { error: error.message }),
    );
    this.installing.set(project.id, done.finally(() => this.emitLive()));
    return this.appLaunch(project.id);
  }

  /** Resolves when the install running for a project ends (for tests and the CLI). */
  async installDone(ref: string): Promise<AppLaunchInfo> {
    const project = this.core.project(ref);
    await this.installing.get(project.id);
    return this.appLaunch(project.id);
  }

  async installRelease(project: StoredSpace, app: AppManifest, release: { github: string; tag: string; asset: AppAsset }, approve: boolean): Promise<void> {
    const job = this.installs.get(project.id)!;
    const dir = this.appsDir(project.id);
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
    this.rememberAppFolder(project.id, root);
    const command = startCommand(app, platformKey(), true);
    if (approve && command) this.node.config = { ...this.node.config, approvedLaunches: { ...this.node.config.approvedLaunches, [project.id]: launchFingerprint(command, root) } };
    saveConfig(this.node.home, this.node.config);
    writeJson(joinPath(dir, 'installed.json'), { tag: release.tag, folder: root, file: release.asset.file, sha256: release.asset.sha256, installed: new Date(this.node.clock()).toISOString() });
    // Earlier versions Weave installed go.
    for (const entry of readdirSync(dir)) if (entry !== tagFolder(release.tag) && entry !== 'installed.json' && !entry.startsWith('.')) rmSync(joinPath(dir, entry), { recursive: true, force: true });
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

  async stopApp(ref: string): Promise<AppLaunchInfo> {
    const project = this.core.project(ref);
    this.apps.stop(project.id);
    await new Promise((resolve) => setTimeout(resolve, 300));
    return this.appLaunch(project.id);
  }

  rememberAppFolder(projectId: string, folder: string): void {
    const full = resolvePath(folder);
    this.checkAppFolder(projectId, full);
    this.node.config = { ...this.node.config, appFolders: { ...this.node.config.appFolders, [projectId]: full } };
    saveConfig(this.node.home, this.node.config);
  }

  /** The folder must hold this project's app: its weave.app.json with the same app id. */
  checkAppFolder(projectId: string, folder: string): void {
    const file = joinPath(folder, 'weave.app.json');
    if (!existsSync(file)) throw new Error(`there's no weave.app.json in ${folder}`);
    let local: { app?: unknown };
    try {
      local = JSON.parse(readFileSync(file, 'utf8')) as { app?: unknown };
    } catch {
      throw new Error(`${file} isn't valid JSON`);
    }
    const published = this.app(this.core.project(projectId));
    if (published && local.app !== published.app) throw new Error(`${folder} holds the app "${String(local.app)}", but this project's app is "${published.app}"`);
  }

  async rooms(ref?: string): Promise<RoomInfo[]> {
    const only = ref ? this.core.project(ref).id : undefined;
    const rooms = this.allRooms().filter(({ room, project }) => room.open && (!only || project.id === only));
    return Promise.all(rooms.map(({ room, project }) => this.roomInfo(room, project)));
  }

  async hostRoom(input: { project: string; name: string; invite?: string[]; show?: string; groups?: string[] }): Promise<RoomInfo> {
    const project = this.core.project(input.project);
    const app = this.app(project);
    if (!app) throw new Error(`${project.name} has no app to share yet: a maintainer publishes one with "weave app publish"`);
    if (!this.core.swarm) throw new Error('rooms need your node online: keep the app (or "weave daemon") running');
    const id = b64u.encode(randomBytes(12));
    const name = input.name?.trim().slice(0, 60) || `${this.node.nameOf(this.node.identity.author) ?? 'Someone'}'s room`;
    const invite = input.invite?.length ? input.invite.map((who) => this.node.resolve(who)) : 'participants';
    const key = roomKeyPair(this.roomSeed(id)).publicKey.toString('hex');
    const show = input.show ? this.core.payments.showRef(input.show) : undefined;
    if (show && show.host !== this.node.identity.author) throw new Error(`only ${this.node.nameOf(show.host) ?? 'its host'} hosts rooms for ${show.name}: they let ticket holders in`);
    const groups = (input.groups ?? []).map((ref) => {
      const group = this.core.space(ref);
      if (group.kind !== 'group') throw new Error(`${group.name} is a ${group.kind}, not a group or tier`);
      if (!this.core.state(project).groups.has(group.id)) throw new Error(`${group.name} isn't invited into ${project.name}: invite it first (its members then take part)`);
      return group.id;
    });
    this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(project), { kind: KIND_ROOM, body: { room: id, name, service: app.services[0].id, key, invite, ...(show ? { show: show.id } : {}), ...(groups.length ? { groups } : {}), open: true } }));
    const room = this.roomById(id).room;
    await this.core.live.host(room);
    return this.roomInfo(room, project);
  }

  async endRoom(ref: string): Promise<void> {
    const { room, project } = this.roomById(ref);
    if (room.host !== this.node.identity.author) throw new Error('only the host can end a room');
    await this.core.live.stopHosting(room.id);
    this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(project), { kind: KIND_ROOM, body: { room: room.id, open: false } }));
  }

  async joinRoom(ref: string): Promise<RoomInfo> {
    const { room, project } = this.roomById(ref);
    if (!room.open) throw new Error('this room has ended');
    if (room.host === this.node.identity.author) return this.roomInfo(room, project);
    if (!this.mayJoin(room, this.node.identity.author)) throw new Error(room.show || room.groups ? "this room is for a show's ticket holders, while it's on (weave shows), or for members of its tiers" : "you're not invited to this room");
    const app = this.app(project);
    if (!app) throw new Error(`${project.name} has no app`);
    await this.core.live.join(room, app.app);
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

  roomService(room: Room) {
    const found = this.allRooms().find((r) => r.room.id === room.id);
    const app = found && this.app(found.project);
    return app?.services.find((s) => s.id === room.service) ?? app?.services[0];
  }

  async roomInfo(room: Room, project: StoredSpace): Promise<RoomInfo> {
    const me = this.node.identity.author;
    const mine = room.host === me;
    const app = this.app(project);
    const service = app?.services.find((s) => s.id === room.service) ?? app?.services[0];
    const joined = mine ? this.core.live.isHosting(room.id) : this.core.live.isJoined(room.id);
    const connected = this.core.live.connected(room.id);
    const ready = mine ? !!service && (await portOpen(service.port)) : this.core.live.appReady(room.id);
    const side = mine ? service?.open?.host : service?.open?.joiner;
    const path = side?.path ?? '/';
    const localPort = this.core.live.localPort(room.id);
    const url = mine ? (service && ready ? `http://localhost:${service.port}${path}` : undefined) : localPort && ready && app ? `http://${app.app}.weave.localhost:${localPort}${path}` : undefined;
    return {
      id: room.id,
      project: { id: project.id, kind: 'project', name: project.name },
      name: room.name,
      host: { did: room.host, name: this.node.nameOf(room.host) },
      mine,
      open: room.open,
      mayJoin: this.mayJoin(room, me),
      joined,
      connected,
      peers: joined ? this.core.live.peers(room.id).map((did) => ({ did, name: this.node.nameOf(did) })) : [],
      ...(app ? { app: { app: app.app, name: app.name, ...(app.start?.hint ? { startHint: app.start.hint } : {}), ...(app.start?.command || app.start?.release ? { canLaunch: true } : {}) } } : {}),
      ...(service ? { service: { id: service.id, label: side?.label ?? (mine ? 'Open' : 'Play'), ready } } : {}),
      ...(url ? { url } : {}),
      time: room.time,
    };
  }

  /** Tell watchers something changed that isn't an event; with a notice, it may also show as a notification. */
  emitLive(notice?: Notice): void {
    for (const listener of this.core.liveListeners) listener(notice);
  }
}
