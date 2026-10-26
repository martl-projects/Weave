import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { planSync } from '@weave/core';
import { WeaveNode, type Fetch, closeOpenStores } from '../src/index.ts';

const dirs: string[] = [];
afterAll(() => {
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

/**
 * A stand-in for GitHub: the device sign-in (each code is approved on the
 * second poll), one installation of the Weave app, and repos with
 * collaborators and invitations.
 */
class FakeGitHub {
  repos = new Map<string, { collaborators: Set<string>; invitations: Map<number, string>; owner: 'Organization' | 'User' }>();
  /** Who gets signed in next, per node. */
  #codes = new Map<string, { login: string; polls: number }>();
  #tokens = new Map<string, string>();
  #nextId = 1;
  calls: string[] = [];
  /** The permission each invitation asked for: "repo login" → pull | push. */
  permissions = new Map<string, string>();
  gists = new Map<string, { owner: string; content: string }>();

  /** A repository, owned by an organization unless said otherwise (a person's can't take read-only collaborators). */
  addRepo(name: string, collaborators: string[] = [], owner: 'Organization' | 'User' = 'Organization'): void {
    this.repos.set(name, { collaborators: new Set(collaborators), invitations: new Map(), owner });
  }

  accept(repo: string, login: string): void {
    const r = this.repos.get(repo)!;
    for (const [id, who] of r.invitations) if (who === login) r.invitations.delete(id);
    r.collaborators.add(login);
  }

  invited = (repo: string) => [...this.repos.get(repo)!.invitations.values()].sort();
  collaborators = (repo: string) => [...this.repos.get(repo)!.collaborators].sort();

  /** A fetch for one node, which signs in as `login`. */
  fetchAs(login: string): Fetch {
    return (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? 'GET';
      const json = (status: number, body: unknown) => new Response(body === undefined ? '' : JSON.stringify(body), { status });
      if (url.pathname === '/login/device/code') {
        const code = `device-${this.#nextId++}`;
        this.#codes.set(code, { login, polls: 0 });
        return json(200, { device_code: code, user_code: 'WDJB-MJHT', verification_uri: 'https://github.com/login/device', interval: 5, expires_in: 900 });
      }
      if (url.pathname === '/login/oauth/access_token') {
        const code = this.#codes.get(new URLSearchParams(String(init?.body)).get('device_code')!)!;
        if (code.polls++ === 0) return json(200, { error: 'authorization_pending' });
        const token = `token-${code.login}`;
        this.#tokens.set(token, code.login);
        return json(200, { access_token: token, token_type: 'bearer' });
      }
      if (url.pathname === '/apps/my-weave') return json(200, { slug: 'my-weave', name: 'My Weave', client_id: 'Iv1.mine', owner: { login: 'lena-gh' } });
      if (url.pathname.startsWith('/apps/')) return json(404, { message: 'Not Found' });
      const gist = url.pathname.match(/^\/gists\/(\w+)$/);
      if (gist && method === 'GET') {
        const g = this.gists.get(gist[1]);
        return g ? json(200, { owner: { login: g.owner }, files: { 'weave.md': { content: g.content } } }) : json(404, { message: 'Not Found' });
      }
      const who = this.#tokens.get(String((init?.headers as Record<string, string>).authorization).replace('Bearer ', ''));
      if (!who) return json(401, { message: 'Bad credentials' });
      this.calls.push(`${method} ${url.pathname}`);
      if (url.pathname === '/user') return json(200, { login: who, id: 1 });
      if (url.pathname === '/gists' && method === 'POST') {
        const id = `g${this.#nextId++}`;
        const files = JSON.parse(String(init?.body)).files as Record<string, { content: string }>;
        this.gists.set(id, { owner: who, content: Object.values(files)[0].content });
        return json(201, { id, html_url: `https://gist.github.com/${id}` });
      }
      if (url.pathname === '/user/installations') return json(200, { installations: [{ id: 7 }] });
      if (url.pathname === '/user/installations/7/repositories') return json(200, { repositories: [...this.repos.keys()].filter((r) => r.startsWith(`${who}/`)).map((full_name) => ({ full_name, permissions: { admin: true } })) });
      const whole = url.pathname.match(/^\/repos\/([^/]+\/[^/]+)$/);
      if (whole) return this.repos.has(whole[1]) ? json(200, { full_name: whole[1], owner: { type: this.repos.get(whole[1])!.owner } }) : json(404, { message: 'Not Found' });
      const m = url.pathname.match(/^\/repos\/([^/]+\/[^/]+)\/(collaborators|invitations)(?:\/([^/]+))?$/);
      const repo = m && this.repos.get(m[1]);
      if (!m || !repo || !m[1].startsWith(`${who}/`)) return json(404, { message: 'Not Found' });
      if (m[2] === 'collaborators' && !m[3]) return json(200, [...repo.collaborators].map((login) => ({ login })));
      if (m[2] === 'invitations' && !m[3]) return json(200, [...repo.invitations].map(([id, login]) => ({ id, invitee: { login } })));
      if (m[2] === 'collaborators' && method === 'PUT') {
        // As GitHub does: a person's repository has no read-only collaborators.
        const permission = JSON.parse(String(init?.body ?? '{}')).permission;
        if (repo.owner === 'User' && permission === 'pull') return json(422, { message: 'Validation Failed' });
        repo.invitations.set(this.#nextId++, decodeURIComponent(m[3]));
        this.permissions.set(`${m[1]} ${decodeURIComponent(m[3])}`, permission);
        return json(201, { id: this.#nextId });
      }
      if (m[2] === 'collaborators' && method === 'DELETE') return json(repo.collaborators.delete(decodeURIComponent(m[3])) ? 204 : 404, undefined);
      if (m[2] === 'invitations' && method === 'DELETE') return json(repo.invitations.delete(Number(m[3])) ? 204 : 404, undefined);
      return json(404, { message: 'Not Found' });
    }) as Fetch;
  }
}

function person(name: string, github: FakeGitHub, login: string): WeaveNode {
  const dir = mkdtempSync(join(tmpdir(), 'weave-github-'));
  dirs.push(dir);
  const node = WeaveNode.init(name, dir);
  node.githubSetup = { clientId: 'Iv1.test', fetch: github.fetchAs(login), sleep: async () => {} };
  return node;
}

function syncAll(nodes: WeaveNode[]): void {
  for (let round = 0; round < 2; round++) for (const from of nodes) for (const to of nodes) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
}

async function connect(node: WeaveNode): Promise<string> {
  const started = await node.connectGithub();
  expect(started.pending?.userCode).toBe('WDJB-MJHT');
  await vi.waitFor(async () => expect((await node.github()).login).toBeDefined());
  return (await node.github()).login!;
}

describe('GitHub repos that follow a space', () => {
  it('invites members who give their account, and takes back only what it gave', async () => {
    const github = new FakeGitHub();
    github.addRepo('martl/weave', ['old-friend']);
    const martl = person('martl', github, 'martl');
    const lena = person('Lena', github, 'lena-gh');
    const kofi = person('Kofi', github, 'kofi-gh');
    const all = [martl, lena, kofi];
    await martl.createProject({ name: 'Weave' });
    await lena.joinSpace(await martl.invite('Weave'));
    await kofi.joinSpace(await martl.invite('Weave'));
    syncAll(all);

    expect(await connect(martl)).toBe('martl');
    await expect(lena.linkRepo({ space: 'Weave', repo: 'lena-gh/x', on: true })).rejects.toThrow(/only the maintainers/);
    await expect(martl.linkRepo({ space: 'Weave', repo: 'martl/elsewhere', on: true })).rejects.toThrow(/install it on that repository/);
    await martl.linkRepo({ space: 'Weave', repo: 'https://github.com/martl/weave', on: true });
    syncAll(all);

    // Lena gives her account: martl's node invites her.
    expect(await connect(lena)).toBe('lena-gh');
    expect((await lena.spaceRepos('Weave')).repos.map((r) => [r.repo, r.by.name, r.mine ?? false])).toEqual([['martl/weave', 'martl', false]]);
    await lena.shareGithub({ space: 'Weave', on: true });
    syncAll(all);
    await martl.reconcile();
    expect(github.invited('martl/weave')).toEqual(['lena-gh']);
    github.accept('martl/weave', 'lena-gh');
    const view = await martl.spaceRepos('Weave');
    expect(view.missing?.map((a) => a.name)).toEqual(['Kofi']);
    expect(view.accounts?.map((a) => `${a.who.name}=${a.login}`)).toEqual(['Lena=lena-gh']);
    expect(view.repos[0].problem).toBeUndefined();

    // Kofi too; then he takes it back before accepting: the invitation goes.
    await connect(kofi);
    await kofi.shareGithub({ space: 'Weave', on: true });
    syncAll(all);
    await martl.reconcile();
    expect(github.invited('martl/weave')).toEqual(['kofi-gh']);
    await kofi.shareGithub({ space: 'Weave', on: false });
    syncAll(all);
    await martl.reconcile();
    expect(github.invited('martl/weave')).toEqual([]);

    // Lena is removed from the project: her access goes, the friend added by hand stays.
    await martl.removeMember('Weave', 'Lena');
    await martl.reconcile();
    expect(github.collaborators('martl/weave')).toEqual(['old-friend']);

    // Nothing changed: no more calls to GitHub for a while.
    const before = github.calls.length;
    await martl.reconcile();
    expect(github.calls.length).toBe(before);
  });

  it('follows the readers of one board, and unlinking takes back what it gave', async () => {
    const github = new FakeGitHub();
    github.addRepo('martl/secret');
    const martl = person('martl', github, 'martl');
    const lena = person('Lena', github, 'lena-gh');
    const kofi = person('Kofi', github, 'kofi-gh');
    const all = [martl, lena, kofi];
    await martl.createProject({ name: 'Weave' });
    await lena.joinSpace(await martl.invite('Weave'));
    await kofi.joinSpace(await martl.invite('Weave'));
    syncAll(all);
    await martl.setBoardAccess({ project: 'Weave', board: 'ideas', read: ['Lena'] });
    await Promise.all([connect(martl), connect(lena), connect(kofi)]);
    syncAll(all);
    await lena.shareGithub({ space: 'Weave', on: true });
    await kofi.shareGithub({ space: 'Weave', on: true });
    syncAll(all);

    await expect(martl.linkRepo({ space: 'Weave', repo: 'martl/secret', board: 'nope', on: true })).rejects.toThrow(/no board "nope"/);
    await martl.linkRepo({ space: 'Weave', repo: 'martl/secret', board: 'ideas', on: true });
    expect(github.invited('martl/secret')).toEqual(['lena-gh']);

    await martl.linkRepo({ space: 'Weave', repo: 'martl/secret', on: false });
    expect(github.invited('martl/secret')).toEqual([]);
    expect((await martl.spaceRepos('Weave')).repos).toEqual([]);
  });

  it('shows a GitHub account on the hub only with a gist of that account naming the did', async () => {
    const github = new FakeGitHub();
    const martl = person('martl', github, 'martl');
    const lena = person('Lena', github, 'lena-gh');

    await expect(martl.showGithubOnHub({ on: true })).rejects.toThrow(/connect GitHub first/);
    await connect(martl);
    const mine = await martl.showGithubOnHub({ on: true });
    expect(mine.github).toEqual({ login: 'martl', url: 'https://github.com/martl', verified: true });
    expect(github.gists.size).toBe(1);

    // Others see it, checked against GitHub; showing it again makes no new gist.
    await martl.showGithubOnHub({ on: true });
    expect(github.gists.size).toBe(1);
    martl.replica.events().forEach((e) => lena.replica.ingest(e));
    expect((await lena.profile(martl.identity.author)).github).toMatchObject({ login: 'martl', verified: true });

    // A claim without a matching gist isn't shown.
    await lena.publish({ kind: 'weave.github.public', body: { login: 'martl', gist: [...github.gists.keys()][0], on: true } });
    expect((await lena.profile()).github).toBeUndefined();

    await martl.showGithubOnHub({ on: false });
    martl.replica.events().forEach((e) => lena.replica.ingest(e));
    expect((await lena.profile(martl.identity.author)).github).toBeUndefined();
  });

  it('signs in through your own GitHub App when you choose one, and says whose app it is', async () => {
    const github = new FakeGitHub();
    const lena = person('Lena', github, 'lena-gh');
    expect((await lena.github()).app).toEqual({ name: 'Weave Connect', slug: 'weave-connect', owner: 'martldennl', url: 'https://github.com/apps/weave-connect', own: false });
    await connect(lena);

    await expect(lena.setGithubApp('https://github.com/apps/nobody-here')).rejects.toThrow(/no public app/);
    const mine = await lena.setGithubApp('https://github.com/apps/my-weave');
    expect(mine.app).toMatchObject({ name: 'My Weave', owner: 'lena-gh', own: true });
    expect(mine.installUrl).toBe('https://github.com/apps/my-weave/installations/new');
    // The sign-in went through the other app: it's gone.
    expect(mine.login).toBeUndefined();

    const back = await lena.setGithubApp(null);
    expect(back.app.own).toBe(false);
  });

  it('plans: never re-invites someone who declined, never removes people added by hand', () => {
    const access = { collaborators: new Set(['hand', 'lena']), invited: new Map([['kofi', 9]]) };
    expect(planSync(['Lena', 'kofi', 'new', 'declined'], access, ['lena', 'declined'])).toEqual({ invite: ['new'], remove: [] });
    expect(planSync([], access, ['lena', 'kofi'])).toEqual({ invite: [], remove: [{ login: 'kofi', invitation: 9 }, { login: 'lena' }] });
  });

  it("links a person's repository only on purpose: nobody gets read-only access there", async () => {
    const github = new FakeGitHub();
    github.addRepo('martl/party-game', [], 'User');
    github.addRepo('martl/old-link', [], 'User');
    const martl = person('martl', github, 'martl');
    const nic = person('Nic', github, 'nic-gh');
    await martl.createProject({ name: 'Party' });
    await nic.joinSpace(await martl.invite('Party'));
    syncAll([martl, nic]);
    await connect(martl);
    // Linking a person's repository for reading: refused, saying what to do instead.
    await expect(martl.linkRepo({ space: 'Party', repo: 'martl/party-game', on: true })).rejects.toThrow(/personal GitHub account[^]*access: none[^]*access: write[^]*organization[^]*Transfer/);
    await expect(martl.linkRepo({ space: 'Party', repo: 'martl/party-game', access: 'read', on: true })).rejects.toThrow(/personal GitHub account/);
    expect((await martl.spaceRepos('Party')).repos).toEqual([]);
    expect(await martl.githubRepoOwner('martl/party-game')).toBe('personal');

    // One linked before Weave checked (as an older Weave wrote it): nobody is invited, and it says why instead of a bare 422.
    await martl.publish({ kind: 'weave.github.repo', body: { repo: 'martl/old-link', on: true }, space: 'Party' });
    await connect(nic);
    await nic.shareGithub({ space: 'Party', on: true });
    syncAll([martl, nic]);
    await martl.reconcile();
    expect(github.invited('martl/old-link')).toEqual([]);
    const [old] = (await martl.spaceRepos('Party')).repos;
    expect(old.repo).toBe('martl/old-link');
    expect(old.problem).toMatch(/personal GitHub account[^]*organization/);
    expect(old.problem).not.toMatch(/422/);

    // Moved to an organization, then linked: Nic is invited, read-only.
    github.repos.get('martl/party-game')!.owner = 'Organization';
    await expect(martl.linkRepo({ space: 'Party', repo: 'martl/party-game', access: 'write', writers: ['Nic'], on: true })).rejects.toThrow(/belongs to an organization/);
    await martl.linkRepo({ space: 'Party', repo: 'martl/party-game', on: true });
    syncAll([martl, nic]);
    await martl.reconcile();
    expect(github.invited('martl/party-game')).toEqual(['nic-gh']);
    expect(github.permissions.get('martl/party-game nic-gh')).toBe('pull');
    expect((await martl.spaceRepos('Party')).repos.find((r) => r.repo === 'martl/party-game')?.problem).toBeUndefined();
    for (const node of [martl, nic]) await node.close();
  });

  it("links a person's repository only, or lets people picked one by one write, never through a group", async () => {
    const github = new FakeGitHub();
    github.addRepo('martl/derby', [], 'User');
    const martl = person('martl', github, 'martl');
    const nic = person('Nic', github, 'nic-gh');
    const lena = person('Lena', github, 'lena-gh');
    const all = [martl, nic, lena];
    // Nic is in the project personally; Lena only through the Friends group.
    await martl.createGroup('Friends');
    await lena.joinSpace(await martl.invite('Friends'));
    syncAll(all);
    await martl.createProject({ name: 'Derby' });
    await martl.inviteGroup({ project: 'Derby', group: 'Friends' });
    await nic.joinSpace(await martl.invite('Derby'));
    syncAll(all);
    await connect(martl);
    for (const node of [nic, lena]) {
      await connect(node);
      await node.shareGithub({ space: 'Derby', on: true });
    }
    syncAll(all);

    // Linked only: it shows, and nobody is invited.
    await martl.linkRepo({ space: 'Derby', repo: 'martl/derby', access: 'none', on: true });
    syncAll(all);
    await martl.reconcile();
    expect(github.invited('martl/derby')).toEqual([]);
    expect((await nic.spaceRepos('Derby')).repos.map((r) => [r.repo, r.access, r.forYou ?? false])).toEqual([['martl/derby', 'none', false]]);

    // Write access: only people in personally can be picked, and only they are invited, to write.
    expect((await martl.spaceRepos('Derby')).mayWrite?.map((a) => a.name)).toEqual(['Nic']);
    await expect(martl.linkRepo({ space: 'Derby', repo: 'martl/derby', access: 'write', writers: ['Lena'], on: true })).rejects.toThrow(/Lena can't be picked to write[^]*not through a group or tier/);
    await expect(martl.linkRepo({ space: 'Derby', repo: 'martl/derby', access: 'write', on: true })).rejects.toThrow(/pick the people who may write/);
    await martl.linkRepo({ space: 'Derby', repo: 'martl/derby', access: 'write', writers: ['Nic'], on: true });
    syncAll(all);
    await martl.reconcile();
    expect(github.invited('martl/derby')).toEqual(['nic-gh']);
    expect(github.permissions.get('martl/derby nic-gh')).toBe('push');
    const [seen] = (await nic.spaceRepos('Derby')).repos;
    expect(seen).toMatchObject({ access: 'write', writers: [{ name: 'Nic' }], forYou: true });
    expect((await lena.spaceRepos('Derby')).repos[0].forYou).toBeUndefined();
    // A write link forged by hand naming Lena still doesn't reach her: she came through a group.
    await martl.publish({ kind: 'weave.github.repo', body: { repo: 'martl/derby', access: 'write', writers: [nic.identity.author, lena.identity.author], on: true }, space: 'Derby' });
    await martl.reconcile();
    expect(github.invited('martl/derby')).toEqual(['nic-gh']);

    // Unticking Nic takes his access back.
    github.accept('martl/derby', 'nic-gh');
    await martl.linkRepo({ space: 'Derby', repo: 'martl/derby', access: 'none', on: true });
    await martl.reconcile();
    expect(github.collaborators('martl/derby')).toEqual([]);
    for (const node of all) await node.close();
  });
});
