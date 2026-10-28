import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startApi } from '../src/api.ts';
import { closeOpenStores, WeaveNode, type Fetch } from '../src/index.ts';
import { digestOf } from '../src/shipped.ts';
import { buildComponent } from './helpers/components.ts';

/*
 * GitHub access, shipped with Weave (packages/shipped/github-access): keeps a project's linked repositories in step
 * with who is in it, with its own token (an admin's). Linking is Weave's: no GitHub sign-in anywhere. Members who
 * proved their GitHub account get read access, and lose it when they leave.
 */

const dirs: string[] = [];
const nodes: WeaveNode[] = [];
afterAll(async () => {
  for (const node of nodes) await node.close().catch(() => {});
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});
const temp = (prefix: string) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
};
const sync = (all: WeaveNode[]) => {
  for (let round = 0; round < 2; round++) for (const from of all) for (const to of all) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
};

/** GitHub with repositories (an organization's, or a person's), their collaborators and invitations, and gists that prove accounts. */
class OrgGitHub {
  repos = new Map<string, { owner: 'Organization' | 'User'; collaborators: Set<string>; invited: Map<string, { id: number; permission: string }> }>();
  gists = new Map<string, { owner: string; content: string }>();
  calls: string[] = [];
  #next = 1;
  constructor() {
    this.add('acme/site');
  }
  add(repo: string, owner: 'Organization' | 'User' = 'Organization', collaborators: string[] = []): this {
    this.repos.set(repo, { owner, collaborators: new Set(collaborators), invited: new Map() });
    return this;
  }
  /** acme/site's, as most of the test looks at it. */
  get collaborators() {
    return this.repos.get('acme/site')!.collaborators;
  }
  get invited() {
    return this.repos.get('acme/site')!.invited;
  }
  fetch: Fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const json = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status });
    const gist = url.pathname.match(/^\/gists\/(\w+)$/);
    if (gist) {
      const g = this.gists.get(gist[1]);
      return g ? json(200, { owner: { login: g.owner }, files: { 'weave.md': { content: g.content } } }) : json(404, { message: 'Not Found' });
    }
    if (new Headers(init?.headers).get('authorization') !== 'Bearer ghp_admin') return json(404, { message: 'Not Found' });
    this.calls.push(`${method} ${url.pathname}`);
    const m = url.pathname.match(/^\/repos\/([\w-]+\/[\w.-]+)(\/.*)?$/);
    const repo = m ? this.repos.get(m[1]) : undefined;
    if (!m || !repo) return json(404, { message: 'Not Found' });
    const rest = m[2] ?? '';
    if (!rest) return json(200, { full_name: m[1], owner: { login: m[1].split('/')[0], type: repo.owner } });
    if (rest === '/collaborators') return json(200, [...repo.collaborators].map((login) => ({ login })));
    if (rest === '/invitations') return json(200, [...repo.invited].map(([login, i]) => ({ id: i.id, invitee: { login } })));
    const person = rest.match(/^\/collaborators\/([\w-]+)$/);
    if (person && method === 'PUT') {
      const body = JSON.parse(String(init?.body ?? '{}')) as { permission?: string };
      return (repo.invited.set(person[1].toLowerCase(), { id: this.#next++, permission: body.permission ?? 'push' }), json(201, {}));
    }
    if (person && method === 'DELETE') return (repo.collaborators.delete(person[1].toLowerCase()), json(204));
    const invitation = rest.match(/^\/invitations\/(\d+)$/);
    if (invitation && method === 'DELETE') {
      for (const [login, i] of repo.invited) if (i.id === Number(invitation[1])) repo.invited.delete(login);
      return json(204);
    }
    return json(404, { message: 'Not Found' });
  }) as Fetch;

  /** The same GitHub as a server on this computer, for the component. */
  async serve(): Promise<{ port: number; close(): void }> {
    const server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const headers = Object.fromEntries(Object.entries(req.headers).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
      const answer = await this.fetch(`https://api.github.com${req.url}`, { method: req.method, headers, ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) });
      res.writeHead(answer.status, Object.fromEntries(answer.headers));
      res.end(Buffer.from(await answer.arrayBuffer()));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    return { port: (server.address() as { port: number }).port, close: () => server.close() };
  }
}

let shipped: string;
beforeAll(async () => {
  const source = join(import.meta.dirname, '..', '..', 'shipped', 'github-access');
  const component = await buildComponent(join(source, 'src', 'service.js'), 'service', { http: true });
  shipped = temp('weave-shipped-access-');
  copyFileSync(component, join(shipped, 'github-access.wasm'));
  writeFileSync(join(shipped, 'shipped.json'), JSON.stringify({ 'github-access': { component: 'github-access.wasm', digest: digestOf(component), manifest: JSON.parse(readFileSync(join(source, 'weave.app.json'), 'utf8')) } }));
}, 180_000);

describe('GitHub access, shipped with Weave', { timeout: 120_000 }, () => {
  it("gives members who proved their account read access to the project's repository, and takes it back when they leave", async () => {
    const github = new OrgGitHub();
    const server = await github.serve();
    const person = (name: string) => {
      const node = WeaveNode.init(name, temp('weave-access-'));
      node.githubSetup = { ...node.githubSetup, fetch: github.fetch };
      node.wasmSetup.shippedDir = shipped;
      node.wasmSetup.testHosts = { 'api.github.com': server.port };
      nodes.push(node);
      return node;
    };
    const martl = person('martl');
    const lena = person('Lena');
    const kofi = person('Kofi');
    await martl.createProject({ name: 'Site' });
    await lena.joinSpace(await martl.invite('Site'));
    await kofi.joinSpace(await martl.invite('Site'));
    const api = await startApi(martl, 0, { service: (token) => martl.serviceGate(token) });
    martl.runServices({ port: api.port });
    const syncing = setInterval(() => sync([martl, lena, kofi]), 100);
    try {
      // Linking is Weave's, by a maintainer: nobody signs in to GitHub.
      await expect(lena.linkRepo({ space: 'Site', repo: 'acme/site', on: true })).rejects.toThrow(/only the maintainers/);
      await martl.linkRepo({ space: 'Site', repo: 'https://github.com/acme/site', on: true });
      // Lena proved her account with a gist she made herself; Kofi only says it's his.
      github.gists.set('0123456789abcdef01234567', { owner: 'lena-gh', content: `I am lena-gh on GitHub and ${lena.identity.author} on Weave.` });
      await lena.publish({ kind: 'weave.github.account', body: { login: 'lena-gh', gist: '0123456789abcdef01234567', on: true }, space: 'Site' });
      await kofi.publish({ kind: 'weave.github.account', body: { login: 'kofi-gh', on: true }, space: 'Site' });
      sync([martl, lena, kofi]);

      // The service, with an admin's token kept in the project.
      const access = await martl.addService({ shipped: 'github-access', spaces: ['Site'], settingsIn: 'Site', settings: { GITHUB_TOKEN: 'ghp_admin' } });
      expect(access.contract).toMatchObject({ repos: 'access', writes: ['weave.github.added'], net: ['api.github.com'] });
      // Lena is invited (proven); Kofi isn't (unproven, never given anything).
      await vi.waitFor(() => expect([...github.invited.keys()]).toEqual(['lena-gh']), { timeout: 30_000, interval: 200 });
      expect((await martl.spaceRepos('Site')).repos[0]).toMatchObject({ repo: 'acme/site', access: 'read' });
      expect((await martl.spaceRepos('Site')).repos[0].problem).toBeUndefined();

      // Lena accepts on GitHub; then she leaves the project, and the service takes the access back.
      github.invited.delete('lena-gh');
      github.collaborators.add('lena-gh');
      await martl.removeMember('Site', lena.identity.author);
      sync([martl, lena, kofi]);
      // The next round (a change, or its tick): a new account share is a change.
      await kofi.publish({ kind: 'weave.github.account', body: { login: 'kofi-gh', on: true }, space: 'Site' });
      await vi.waitFor(() => expect(github.collaborators.has('lena-gh')).toBe(false), { timeout: 30_000, interval: 200 });
      expect(github.calls).toContain('DELETE /repos/acme/site/collaborators/lena-gh');
    } finally {
      clearInterval(syncing);
      await martl.removeService('github-access').catch(() => {});
      await api.close();
      server.close();
    }
  });

  it("follows a board's readers, takes back only what it gave, and says when a person's repository can't take readers", async () => {
    const github = new OrgGitHub().add('acme/secret', 'Organization', ['old-friend']).add('martl/notes', 'User');
    const server = await github.serve();
    const person = (name: string) => {
      const node = WeaveNode.init(name, temp('weave-access-'));
      node.githubSetup = { ...node.githubSetup, fetch: github.fetch };
      node.wasmSetup.shippedDir = shipped;
      node.wasmSetup.testHosts = { 'api.github.com': server.port };
      nodes.push(node);
      return node;
    };
    const martl = person('martl');
    const lena = person('Lena');
    const kofi = person('Kofi');
    await martl.createProject({ name: 'Lab' });
    await lena.joinSpace(await martl.invite('Lab'));
    await kofi.joinSpace(await martl.invite('Lab'));
    sync([martl, lena, kofi]);
    await martl.setBoardAccess({ project: 'Lab', board: 'ideas', read: ['Lena'] });
    // Both proved their accounts.
    for (const [node, login, gist] of [[lena, 'lena-gh', 'aaaaaaaaaaaaaaaaaaaa'], [kofi, 'kofi-gh', 'bbbbbbbbbbbbbbbbbbbb']] as const) {
      github.gists.set(gist, { owner: login, content: `I am ${login} on GitHub and ${node.identity.author} on Weave.` });
      await node.publish({ kind: 'weave.github.account', body: { login, gist, on: true }, space: 'Lab' });
    }
    sync([martl, lena, kofi]);
    const api = await startApi(martl, 0, { service: (token) => martl.serviceGate(token) });
    martl.runServices({ port: api.port });
    const syncing = setInterval(() => sync([martl, lena, kofi]), 100);
    try {
      await expect(martl.linkRepo({ space: 'Lab', repo: 'acme/secret', board: 'nope', on: true })).rejects.toThrow(/no board "nope"/);
      await martl.linkRepo({ space: 'Lab', repo: 'acme/secret', board: 'ideas', on: true });
      // A person's repository, linked for reading: GitHub can't give read access there, and the service says so.
      await martl.linkRepo({ space: 'Lab', repo: 'martl/notes', on: true });
      await martl.addService({ shipped: 'github-access', spaces: ['Lab'], settingsIn: 'Lab', settings: { GITHUB_TOKEN: 'ghp_admin' } });

      // Only the board's readers: Lena, not Kofi.
      const secret = github.repos.get('acme/secret')!;
      await vi.waitFor(() => expect([...secret.invited.keys()]).toEqual(['lena-gh']), { timeout: 30_000, interval: 200 });
      expect(secret.invited.get('lena-gh')?.permission).toBe('pull');
      await vi.waitFor(async () => expect((await martl.spaceRepos('Lab')).repos.find((r) => r.repo === 'martl/notes')?.problem).toMatch(/belongs to a person/), { timeout: 30_000, interval: 200 });
      expect(github.repos.get('martl/notes')!.invited.size).toBe(0);

      // Unlinked: what it gave goes; the friend added by hand on GitHub stays.
      secret.invited.delete('lena-gh');
      secret.collaborators.add('lena-gh');
      await martl.linkRepo({ space: 'Lab', repo: 'acme/secret', on: false });
      await vi.waitFor(() => expect([...secret.collaborators]).toEqual(['old-friend']), { timeout: 30_000, interval: 200 });
    } finally {
      clearInterval(syncing);
      await martl.removeService('github-access').catch(() => {});
      await api.close();
      server.close();
    }
  });
});
