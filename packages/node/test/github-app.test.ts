import { createVerify, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { WeaveNode, type Fetch, closeOpenStores } from '../src/index.ts';
import { writeSecretJson } from '../src/vault.ts';

/*
 * The GitHub service with a GitHub App of the person's own (block 7): it keeps linked repositories' access in step
 * with their spaces as that App, with tokens it mints itself. Nobody signs in, and on an always-on node it goes on
 * while the person's computers are off.
 */

const dirs: string[] = [];
const nodes: WeaveNode[] = [];
afterAll(async () => {
  for (const node of nodes) await node.close().catch(() => {});
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'weave-github-app-'));
  dirs.push(dir);
  return dir;
};

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs1', format: 'pem' } });
const APP_ID = '4242';

/** GitHub as far as an App goes: it checks the App's JWT, is installed on the acme organization, and manages its repos. */
class AppGitHub {
  repos = new Map([['acme/site', { collaborators: new Set<string>(), invitations: new Map<number, string>() }]]);
  #next = 1;
  /** Who acted on a repo: the App's installation token, or someone else. */
  actors: string[] = [];
  fetch: Fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const json = (status: number, body?: unknown) => new Response(body === undefined ? '' : JSON.stringify(body), { status });
    const auth = String(new Headers(init?.headers).get('authorization') ?? '').replace('Bearer ', '');
    // As the App: only a JWT signed with its key, for its ID, not expired.
    if (url.pathname.endsWith('/installation') || url.pathname.startsWith('/app/')) {
      const [header, payload, signature] = auth.split('.');
      const claims = JSON.parse(Buffer.from(payload ?? '', 'base64url').toString() || '{}') as { iss?: string; exp?: number };
      const valid = !!signature && createVerify('RSA-SHA256').update(`${header}.${payload}`).verify(publicKey, Buffer.from(signature, 'base64url'));
      if (!valid || claims.iss !== APP_ID || (claims.exp ?? 0) < Date.now() / 1000) return json(401, { message: 'A JSON web token could not be decoded' });
      const installed = url.pathname.match(/^\/repos\/(acme)\/[^/]+\/installation$/);
      if (installed) return json(200, { id: 99 });
      if (url.pathname.endsWith('/installation')) return json(404, { message: 'Not Found' });
      if (url.pathname === '/app/installations/99/access_tokens' && method === 'POST') return json(201, { token: 'ghs_installation99', expires_at: new Date(Date.now() + 3600_000).toISOString() });
      return json(404, { message: 'Not Found' });
    }
    if (auth !== 'ghs_installation99') return json(401, { message: 'Bad credentials' });
    const whole = url.pathname.match(/^\/repos\/([^/]+\/[^/]+)$/);
    if (whole) return this.repos.has(whole[1]) ? json(200, { full_name: whole[1], owner: { type: 'Organization' } }) : json(404, { message: 'Not Found' });
    const m = url.pathname.match(/^\/repos\/([^/]+\/[^/]+)\/(collaborators|invitations)(?:\/([^/]+))?$/);
    const repo = m && this.repos.get(m[1]);
    if (!m || !repo) return json(404, { message: 'Not Found' });
    if (m[2] === 'collaborators' && !m[3]) return json(200, [...repo.collaborators].map((login) => ({ login })));
    if (m[2] === 'invitations' && !m[3]) return json(200, [...repo.invitations].map(([id, login]) => ({ id, invitee: { login } })));
    this.actors.push(`${method} ${m[2]} ${decodeURIComponent(m[3] ?? '')} as the App`);
    if (m[2] === 'collaborators' && method === 'PUT') {
      repo.invitations.set(this.#next++, decodeURIComponent(m[3]));
      return json(201, { id: this.#next });
    }
    if (m[2] === 'invitations' && method === 'DELETE') return json(repo.invitations.delete(Number(m[3])) ? 204 : 404);
    if (m[2] === 'collaborators' && method === 'DELETE') return json(repo.collaborators.delete(decodeURIComponent(m[3])) ? 204 : 404);
    return json(404, { message: 'Not Found' });
  }) as Fetch;
  invited = () => [...this.repos.get('acme/site')!.invitations.values()].sort();
}

function person(name: string, github: AppGitHub, login?: string): WeaveNode {
  const node = WeaveNode.init(name, tempDir());
  node.githubSetup = { clientId: 'Iv1.test', fetch: github.fetch, sleep: async () => {} };
  // A member's GitHub account, as signing in leaves it (they share it with a space; nothing is asked of GitHub).
  if (login) writeSecretJson(node.home, join(node.home.dir, 'github.json'), { token: `gho_${login}`, login });
  nodes.push(node);
  return node;
}

const sync = (all: WeaveNode[]) => {
  for (let round = 0; round < 2; round++) for (const from of all) for (const to of all) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
};

describe('the GitHub service with its own GitHub App', () => {
  it('keeps a linked repository in step as the App, without anyone signing in', async () => {
    const github = new AppGitHub();
    const martl = person('martl', github);
    const lena = person('Lena', github, 'lena-gh');
    await martl.createProject({ name: 'Weave' });
    await lena.joinSpace(await martl.invite('Weave'));
    sync([martl, lena]);

    // The App's ID and key: both, and a real key.
    await expect(martl.addService({ builtin: 'github', spaces: ['Weave'], settings: { GITHUB_APP_ID: APP_ID } })).rejects.toThrow(/takes both its ID/);
    await expect(martl.addService({ builtin: 'github', spaces: ['Weave'], settings: { GITHUB_APP_ID: APP_ID, GITHUB_APP_KEY: 'not a key' } })).rejects.toThrow(/the \.pem file GitHub gave you/);
    await expect(martl.addService({ builtin: 'github', spaces: ['Weave'], settings: { NOT_A_SETTING: 'x' } })).rejects.toThrow(/doesn't ask for NOT_A_SETTING/);
    const service = await martl.addService({ builtin: 'github', spaces: ['Weave'], settings: { GITHUB_APP_ID: APP_ID, GITHUB_APP_KEY: privateKey } });
    expect(service).toMatchObject({ builtin: 'github', settings: ['GITHUB_APP_ID', 'GITHUB_APP_KEY'], contract: { writes: ['weave.github.added'], offers: ['artifact.fetch'] } });

    // martl isn't signed in to GitHub: the App says whether it manages the repository.
    await expect(martl.linkRepo({ space: 'Weave', repo: 'other/thing', on: true })).rejects.toThrow(/your GitHub App isn't installed on other/);
    await martl.linkRepo({ space: 'Weave', repo: 'acme/site', on: true });

    // Lena gives the space her GitHub account; the App invites her, to read.
    await lena.shareGithub({ space: 'Weave', on: true });
    sync([martl, lena]);
    await martl.reconcile();
    expect(github.invited()).toEqual(['lena-gh']);
    expect(github.actors).toEqual(['PUT collaborators lena-gh as the App']);
    // What it gave is recorded under the GitHub service's own key, for martl's devices.
    const record = martl.replica.events().filter((e) => e.signer === service.did && e.author === martl.identity.author).at(-1);
    expect(record).toBeDefined();
    expect((await martl.spaceRepos('Weave')).repos[0]).toMatchObject({ repo: 'acme/site', mine: true });
    expect((await martl.spaceRepos('Weave')).repos[0].problem).toBeUndefined();

    // Lena leaves: the App takes her invitation back.
    await lena.leave('Weave');
    sync([martl, lena]);
    await martl.reconcile();
    expect(github.invited()).toEqual([]);
  });

  it('runs on an always-on node: the node keeps access in step, the computer leaves it to it', async () => {
    const github = new AppGitHub();
    const martl = person('martl', github);
    const lena = person('Lena', github, 'lena-gh');
    await martl.createProject({ name: 'Weave' });
    await lena.joinSpace(await martl.invite('Weave'));
    const boxDir = tempDir();
    const linked = await martl.linkNode({ request: WeaveNode.nodeRequest(boxDir, 'nas') });
    const box = await WeaveNode.completeNodeLink(linked.answer, boxDir);
    box.githubSetup = { clientId: 'Iv1.test', fetch: github.fetch, sleep: async () => {} };
    nodes.push(box);
    sync([martl, box]);
    await box.reconcile();

    // The GitHub service goes to the node, its App key sealed to it.
    await martl.addService({ builtin: 'github', spaces: ['Weave'], node: 'nas', settings: { GITHUB_APP_ID: APP_ID, GITHUB_APP_KEY: privateKey } });
    // Linking needs no sign-in on the computer: the node checks when it syncs.
    await martl.linkRepo({ space: 'Weave', repo: 'acme/site', on: true });
    sync([martl, lena, box]);
    await lena.shareGithub({ space: 'Weave', on: true });
    sync([martl, lena, box]);
    await martl.reconcile();
    expect((await martl.spaceRepos('Weave')).repos[0].problem).toBe('kept in step by the GitHub service on nas');
    expect(github.invited()).toEqual([]);

    // The node takes the service over, and invites Lena as the App.
    await box.reconcile();
    await box.reconcile();
    expect(github.invited()).toEqual(['lena-gh']);
    // martl's computer reads what the node gave (it's their own record), so nobody is invited twice.
    sync([martl, box]);
    await martl.reconcile();
    expect(github.actors).toEqual(['PUT collaborators lena-gh as the App']);
  });
});
