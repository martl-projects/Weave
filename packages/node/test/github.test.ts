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
  gists = new Map<string, { owner: string; content: string; public?: boolean }>();

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
        const id = (this.#nextId++).toString(16).padStart(32, '0');
        const files = JSON.parse(String(init?.body)).files as Record<string, { content: string }>;
        this.gists.set(id, { owner: who, content: Object.values(files)[0].content, public: JSON.parse(String(init?.body)).public === true });
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
  node.githubSetup = { ...node.githubSetup, fetch: github.fetchAs(login) };
  return node;
}

function syncAll(nodes: WeaveNode[]): void {
  for (let round = 0; round < 2; round++) for (const from of nodes) for (const to of nodes) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
}


describe('GitHub repos that follow a space', () => {
  it('shows a GitHub account on the hub only with a gist of that account naming the did', async () => {
    const github = new FakeGitHub();
    const martl = person('martl', github, 'martl');
    const lena = person('Lena', github, 'lena-gh');

    // Nobody signs in: martl makes the gist himself, holding the line Weave gives him, and pastes its address.
    await expect(martl.showGithubOnHub({ on: true })).rejects.toThrow(/a gist of yours that proves it/);
    const { text } = await martl.githubProof({ login: 'martl' });
    github.gists.set('aaaaaaaaaaaaaaaaaaaa', { owner: 'lena-gh', content: text });
    await expect(martl.showGithubOnHub({ on: true, login: 'martl', gist: 'https://gist.github.com/lena-gh/aaaaaaaaaaaaaaaaaaaa' })).rejects.toThrow(/has to belong to martl/);
    github.gists.set('bbbbbbbbbbbbbbbbbbbb', { owner: 'martl', content: 'something else' });
    await expect(martl.showGithubOnHub({ on: true, login: 'martl', gist: 'bbbbbbbbbbbbbbbbbbbb' })).rejects.toThrow(/doesn't prove it/);
    github.gists.set('cccccccccccccccccccc', { owner: 'martl', content: text });
    const mine = await martl.showGithubOnHub({ on: true, login: 'martl', gist: 'https://gist.github.com/martl/cccccccccccccccccccc' });
    expect(mine.github).toEqual({ login: 'martl', url: 'https://github.com/martl', verified: true });

    // Others see it, checked against GitHub.
    martl.replica.events().forEach((e) => lena.replica.ingest(e));
    expect((await lena.profile(martl.identity.author)).github).toMatchObject({ login: 'martl', verified: true });

    // A claim without a matching gist isn't shown.
    await lena.publish({ kind: 'weave.github.public', body: { login: 'martl', gist: [...github.gists.keys()][0], on: true } });
    expect((await lena.profile()).github).toBeUndefined();

    await martl.showGithubOnHub({ on: false });
    martl.replica.events().forEach((e) => lena.replica.ingest(e));
    expect((await lena.profile(martl.identity.author)).github).toBeUndefined();
  });

  it('plans: never re-invites someone who declined, never removes people added by hand', () => {
    const access = { collaborators: new Set(['hand', 'lena']), invited: new Map([['kofi', 9]]) };
    expect(planSync(['Lena', 'kofi', 'new', 'declined'], access, ['lena', 'declined'])).toEqual({ invite: ['new'], remove: [] });
    expect(planSync([], access, ['lena', 'kofi'])).toEqual({ invite: [], remove: [{ login: 'kofi', invitation: 9 }, { login: 'lena' }] });
  });

});
