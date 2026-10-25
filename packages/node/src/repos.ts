import { type DeviceCode } from './github.ts';
import { type Access, accountsOf, boardsOf, type Did, type Entry, type EventFields, githubProofText, type Inner, isLogin, isRepoName, type Json, KIND_GITHUB_ACCOUNT, KIND_GITHUB_ADDED, KIND_GITHUB_PUBLIC, KIND_GITHUB_REPO, mayAct, planSync, readersOf, reposOf, type SpaceKind, type SpaceState } from '@weave/core';
import { type StoredSpace } from './spacestore.ts';
import { type Actor, type GitHubInfo, type Profile, type RepoInfo, type SpaceRepos } from './backend.ts';
import { join as joinPath } from 'node:path';
import { readSecretJson, writeSecretJson } from './vault.ts';
import { DEFAULT_GITHUB_APP, finishDeviceFlow, GitHub, type GitHubApp, githubInstallUrl, lookUpGitHubApp, startDeviceFlow } from './github.ts';
import { saveConfig } from './config.ts';
import { rmSync } from 'node:fs';
import { type WeaveNode, personalRepo } from './node.ts';

/*
 * GitHub repositories that follow a space: the node's GitHub sign-in, linking a
 * repository to a group, tier or project (those who manage it), members giving
 * their GitHub account, and keeping read access in step with membership. It
 * sees the node's internals only through ReposCore.
 */



interface GitHubLogin {
  code?: DeviceCode;
  error?: string;
  cancel: AbortController;
}

/** What Repos needs of the node's internals, and nothing more (the node builds it in its constructor). */
export interface ReposCore {
  space(ref: string, kind?: SpaceKind): StoredSpace;
  state(space: StoredSpace): SpaceState;
  entries(space: StoredSpace): Entry[];
  actor(author: Did, signer: Did): Actor;
  agentMay(name: string, kind: string): void;
  access(space: StoredSpace, state: SpaceState, entries: Entry[]): Access;
  readonly spaces: Map<string, StoredSpace>;
  selfBodies(kind: string): Array<Record<string, unknown>>;
  sealForSelf(inner: Inner): EventFields;
}

export class Repos {
  private readonly node: WeaveNode;
  private readonly core: ReposCore;

  constructor(node: WeaveNode, core: ReposCore) {
    this.node = node;
    this.core = core;
  }

  // ---------------------------------------------------------------- GitHub: repos that follow a space

  githubLogin?: GitHubLogin;
  /** Repos this node keeps in step (lowercase owner/name): when each was last synced, what it looked like then, and any problem. */
  githubSynced = new Map<string, { at: number; shape: string; problem?: string }>();

  get githubFile(): string {
    return joinPath(this.node.home.dir, 'github.json');
  }

  /** The GitHub sign-in on this device (kept in the home, never in a log). */
  githubAuth(): { token: string; login: string } | undefined {
    const saved = readSecretJson<{ token?: string; login?: string }>(this.node.home, this.githubFile);
    return saved?.token && saved.login ? { token: saved.token, login: saved.login } : undefined;
  }

  /** The GitHub App this node signs in through: your own, or Weave Connect. */
  githubApp(): GitHubApp {
    return this.node.config.githubApp ?? { ...DEFAULT_GITHUB_APP, clientId: this.node.githubSetup.clientId };
  }

  async github(): Promise<GitHubInfo> {
    const auth = this.githubAuth();
    const login = this.githubLogin;
    const app = this.githubApp();
    return {
      available: !!app.clientId,
      installUrl: githubInstallUrl(app.slug),
      app: { name: app.name, slug: app.slug, owner: app.owner, url: `https://github.com/apps/${app.slug}`, own: !!this.node.config.githubApp },
      ...(auth ? { login: auth.login } : {}),
      ...(login?.code ? { pending: { userCode: login.code.userCode, verificationUri: login.code.verificationUri, expires: login.code.expiresAt } } : {}),
      ...(login?.error ? { error: login.error } : {}),
    };
  }

  async setGithubApp(link: string | null): Promise<GitHubInfo> {
    const app = link?.trim() ? await lookUpGitHubApp(link, this.node.githubSetup.fetch) : undefined;
    const before = this.githubApp().clientId;
    const { githubApp: _old, ...rest } = this.node.config;
    this.node.config = app && app.clientId !== DEFAULT_GITHUB_APP.clientId ? { ...rest, githubApp: app } : rest;
    saveConfig(this.node.home, this.node.config);
    // A sign-in belongs to the app it went through.
    if (this.githubApp().clientId !== before) await this.disconnectGithub();
    return this.github();
  }

  async connectGithub(): Promise<GitHubInfo> {
    const { fetch: fetchImpl, sleep } = this.node.githubSetup;
    const { clientId } = this.githubApp();
    this.githubLogin?.cancel.abort();
    const cancel = new AbortController();
    const code = await startDeviceFlow(clientId, fetchImpl);
    const login: GitHubLogin = { code, cancel };
    this.githubLogin = login;
    // Wait for the person to enter the code on GitHub, in the background; github() tells how it went.
    void finishDeviceFlow(clientId, code, fetchImpl, cancel.signal, sleep)
      .then(async (token) => {
        const user = await new GitHub(token, fetchImpl).user();
        writeSecretJson(this.node.home, this.githubFile, { token, login: user.login, id: user.id, connected: new Date(this.node.clock()).toISOString() });
        this.githubSynced.clear();
        if (this.githubLogin === login) this.githubLogin = undefined;
      })
      .catch((error: Error) => {
        if (this.githubLogin === login) this.githubLogin = cancel.signal.aborted ? undefined : { error: error.message, cancel };
      });
    return this.github();
  }

  async disconnectGithub(): Promise<GitHubInfo> {
    this.githubLogin?.cancel.abort();
    this.githubLogin = undefined;
    rmSync(this.githubFile, { force: true });
    return this.github();
  }

  /** Repositories known to belong to an organization (a person's are asked again: they may have moved). */
  organizationRepos = new Set<string>();

  async ownedByOrganization(client: GitHub, repo: string): Promise<boolean> {
    if (this.organizationRepos.has(repo.toLowerCase())) return true;
    const organization = (await client.owner(repo)) === 'Organization';
    if (organization) this.organizationRepos.add(repo.toLowerCase());
    return organization;
  }

  async githubRepos(): Promise<string[]> {
    const auth = this.githubAuth();
    if (!auth) throw new Error('connect GitHub first (Keys & devices → Linked accounts, or "weave github connect")');
    return new GitHub(auth.token, this.node.githubSetup.fetch).repos();
  }

  async spaceRepos(ref: string): Promise<SpaceRepos> {
    const space = this.core.space(ref);
    if (space.kind === 'direct') throw new Error('direct chats have no repositories');
    const state = this.core.state(space);
    const entries = this.core.entries(space);
    const me = this.node.identity.author;
    const repos = reposOf(entries, (did) => mayAct(state, did, 'manage').ok);
    const accounts = accountsOf(entries);
    const out: SpaceRepos = {
      repos: repos.map((r): RepoInfo => {
        const synced = r.by === me ? this.githubSynced.get(r.repo.toLowerCase()) : undefined;
        return {
          repo: r.repo,
          url: `https://github.com/${r.repo}`,
          ...(r.board ? { board: r.board } : {}),
          by: this.core.actor(r.by, r.by),
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
      const wanted = new Set(mine.flatMap((r) => this.repoReaders(space, state, entries, r.board)));
      wanted.delete(me);
      out.missing = [...wanted].filter((did) => !accounts.has(did)).map((did) => this.core.actor(did, did));
      out.accounts = [...accounts].filter(([did]) => wanted.has(did)).map(([did, login]) => ({ who: this.core.actor(did, did), login }));
    }
    return out;
  }

  async linkRepo(input: { space: string; repo: string; board?: string; on: boolean; as?: string }): Promise<SpaceRepos> {
    if (input.as) this.core.agentMay(input.as, KIND_GITHUB_REPO);
    const space = this.core.space(input.space);
    if (space.kind === 'direct') throw new Error('direct chats have no repositories');
    const state = this.core.state(space);
    if (!mayAct(state, this.node.identity.author, 'manage').ok) throw new Error(`only the ${space.kind === 'group' ? 'owner' : space.kind === 'community' ? 'moderators' : 'maintainers'} of ${space.name} can link repositories`);
    const repo = input.repo.trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '');
    if (!isRepoName(repo)) throw new Error('a repository looks like owner/name');
    const body: Record<string, Json> = { repo, on: input.on };
    if (input.on) {
      const board = input.board?.trim();
      if (board) {
        if (space.kind !== 'project') throw new Error('only projects have boards');
        if (!boardsOf('project', this.core.entries(space), state.maintainers).some((b) => b.name === board)) throw new Error(`${space.name} has no board "${board}"`);
        body.board = board;
      }
      const match = (await this.githubRepos()).find((r) => r.toLowerCase() === repo.toLowerCase());
      if (!match) throw new Error(`the Weave app can't manage ${repo}: install it on that repository on GitHub (you need to be its admin)`);
      // Members get read access; a person's repositories only have collaborators who can write.
      if (!(await this.ownedByOrganization(new GitHub(this.githubAuth()!.token, this.node.githubSetup.fetch), match))) throw new Error(personalRepo(match));
      body.repo = match;
    }
    await this.node.publish({ kind: KIND_GITHUB_REPO, body, space: space.id, as: input.as });
    this.githubSynced.delete(repo.toLowerCase());
    await this.syncGithub();
    return this.spaceRepos(space.id);
  }

  async shareGithub(input: { space: string; on: boolean; as?: string }): Promise<SpaceRepos> {
    if (input.as) this.core.agentMay(input.as, KIND_GITHUB_ACCOUNT);
    const space = this.core.space(input.space);
    if (space.kind === 'direct') throw new Error('direct chats have no repositories');
    if (!this.core.state(space).members.has(this.node.identity.author)) throw new Error(`you are not a member of ${space.name}`);
    const auth = input.on ? this.githubAuth() : undefined;
    if (input.on && !auth) throw new Error('connect GitHub first, so Weave knows your account');
    await this.node.publish({ kind: KIND_GITHUB_ACCOUNT, body: auth ? { login: auth.login, on: true } : { on: false }, space: space.id, as: input.as });
    return this.spaceRepos(space.id);
  }

  async showGithubOnHub(input: { on: boolean }): Promise<Profile> {
    const me = this.node.identity.author;
    const before = this.hubGithub(me);
    if (!input.on) {
      if (before) this.node.replica.write(this.node.identity, { kind: KIND_GITHUB_PUBLIC, body: { on: false } });
      return this.node.profile();
    }
    const auth = this.githubAuth();
    if (!auth) throw new Error('connect GitHub first');
    // The proof: a public gist of this account naming this did. Made once, kept while the account stays the same.
    let gist = before && before.login.toLowerCase() === auth.login.toLowerCase() ? before.gist : undefined;
    if (!gist) gist = (await new GitHub(auth.token, this.node.githubSetup.fetch).createGist('Weave', 'weave.md', githubProofText(me, auth.login))).id;
    if (before?.gist === gist) return this.node.profile();
    this.node.replica.write(this.node.identity, { kind: KIND_GITHUB_PUBLIC, body: { login: auth.login, gist, on: true } });
    return this.node.profile();
  }

  /** The GitHub account someone shows on their hub (latest word), not checked yet. */
  hubGithub(did: Did): { login: string; gist: string } | undefined {
    const last = this.node.replica.events((e) => e.author === did && e.kind === KIND_GITHUB_PUBLIC).sort((a, b) => a.time.localeCompare(b.time)).at(-1);
    const body = (last?.body ?? {}) as Record<string, unknown>;
    if (!last || body.on === false || !isLogin(body.login) || typeof body.gist !== 'string' || !/^[A-Za-z0-9]{1,64}$/.test(body.gist)) return undefined;
    return { login: body.login, gist: body.gist };
  }

  /** Who a repo linked to a space should include: its members, or in a project the readers of one board. */
  repoReaders(space: StoredSpace, state: SpaceState, entries: Entry[], board?: string): Did[] {
    if (!board || space.kind !== 'project') return [...state.members.keys()];
    return readersOf(board, state, this.core.access(space, state, entries));
  }

  /**
   * Bring the repos this person linked in step with their spaces: invite
   * members who gave their GitHub account, take access away from those Weave
   * added who left (or whose repo was unlinked). Each repo at most every few
   * minutes unless something changed; without a GitHub sign-in it waits.
   */
  async syncGithub(): Promise<number> {
    const auth = this.githubAuth();
    const me = this.node.identity.author;
    // Every repo this person linked, with everyone it should include.
    const wanted = new Map<string, { repo: string; logins: Set<string> }>();
    for (const space of this.core.spaces.values()) {
      if (space.kind === 'direct') continue;
      const state = this.core.state(space);
      if (!mayAct(state, me, 'manage').ok) continue;
      const entries = this.core.entries(space);
      const links = reposOf(entries, (did) => mayAct(state, did, 'manage').ok).filter((r) => r.by === me);
      if (!links.length) continue;
      const accounts = accountsOf(entries);
      for (const link of links) {
        const key = link.repo.toLowerCase();
        const entry = wanted.get(key) ?? { repo: link.repo, logins: new Set<string>() };
        for (const did of this.repoReaders(space, state, entries, link.board)) if (did !== me && accounts.has(did)) entry.logins.add(accounts.get(did)!.toLowerCase());
        wanted.set(key, entry);
      }
    }
    // Who Weave gave access, per repo: the latest word per repo and login.
    const added = new Map<string, { repo: string; people: Map<string, boolean> }>();
    for (const b of this.core.selfBodies(KIND_GITHUB_ADDED)) {
      if (!isRepoName(b.repo) || typeof b.login !== 'string') continue;
      const key = b.repo.toLowerCase();
      if (!added.has(key)) added.set(key, { repo: b.repo, people: new Map() });
      added.get(key)!.people.set(b.login.toLowerCase(), b.on === true);
    }
    const repos = new Set([...wanted.keys(), ...[...added].filter(([, a]) => [...a.people.values()].some(Boolean)).map(([key]) => key)]);
    const now = this.node.clock();
    let changed = 0;
    for (const key of repos) {
      const repo = wanted.get(key)?.repo ?? added.get(key)!.repo;
      const want = wanted.get(key)?.logins ?? new Set<string>();
      if (auth) want.delete(auth.login.toLowerCase());
      const gave = [...(added.get(key)?.people ?? [])].filter(([, on]) => on).map(([login]) => login);
      const shape = JSON.stringify([[...want].sort(), gave.sort()]);
      const last = this.githubSynced.get(key);
      if (last && last.shape === shape && now - last.at < (last.problem ? 60_000 : 10 * 60_000)) continue;
      if (!auth) {
        this.githubSynced.set(key, { at: now, shape, problem: 'not connected to GitHub on this device' });
        continue;
      }
      try {
        const client = new GitHub(auth.token, this.node.githubSetup.fetch);
        const plan = planSync(want, await client.access(repo), gave);
        // Linked before Weave checked: a person's repository can't take read-only collaborators (GitHub refuses with 422).
        // Nobody new is invited there; what Weave gave is still taken back.
        const personal = plan.invite.length > 0 && !(await this.ownedByOrganization(client, repo));
        if (personal) plan.invite = [];
        for (const login of plan.invite) {
          await client.invite(repo, login);
          this.node.replica.write(this.node.identity, this.core.sealForSelf({ kind: KIND_GITHUB_ADDED, body: { repo, login, on: true } }));
          changed++;
        }
        for (const { login, invitation } of plan.remove) {
          await client.remove(repo, login, invitation);
          this.node.replica.write(this.node.identity, this.core.sealForSelf({ kind: KIND_GITHUB_ADDED, body: { repo, login, on: false } }));
          changed++;
        }
        const after = [...gave.filter((l) => !plan.remove.some((r) => r.login === l)), ...plan.invite].sort();
        this.githubSynced.set(key, { at: now, shape: personal ? shape : JSON.stringify([[...want].sort(), after]), ...(personal ? { problem: personalRepo(repo) } : {}) });
      } catch (error) {
        this.githubSynced.set(key, { at: now, shape, problem: (error as Error).message });
      }
    }
    return changed;
  }
}
