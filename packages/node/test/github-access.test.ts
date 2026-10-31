import { generateKeyPairSync, verify as cryptoVerify } from 'node:crypto';
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
 * Accounts elsewhere and GitHub access, shipped with Weave: people prove a GitHub account is theirs with a gist naming
 * their Weave id (github-verify, a verifier every Weave runs itself); GitHub access (packages/shipped/github-access)
 * links a project's repositories through its own actions and keeps them in step with who is in it, with its own token.
 * Weave knows nothing of GitHub: it says who reads a space and whose accounts hold.
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
  /** The GitHub App made with a manifest (martl's): its public key, and the repositories it's installed on. */
  app?: { publicKey: string; installed: Set<string>; manifest: Record<string, unknown> };
  calls: string[] = [];
  /** What each installation token was asked for: its repositories and permissions. */
  mints: Array<{ repositories?: string[]; permissions?: Record<string, string> }> = [];
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
    // A sign-in for a gist: who it is, and the gist it makes.
    if (new Headers(init?.headers).get('authorization') === 'Bearer gho-gist') {
      if (url.pathname === '/user') return json(200, { login: 'martl' });
      if (url.pathname === '/gists' && method === 'POST') {
        const id = `${'e'.repeat(19)}${this.#next++}`;
        this.gists.set(id, { owner: 'martl', content: Object.values((JSON.parse(String(init?.body)) as { files: Record<string, { content: string }> }).files)[0].content });
        return json(201, { id, html_url: `https://gist.github.com/martl/${id}` });
      }
    }
    // The App manifest flow: the code GitHub sent back becomes the App (its key only ever in this answer).
    if (method === 'POST' && /^\/app-manifests\/[\w-]+\/conversions$/.test(url.pathname)) {
      const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      this.app = { publicKey: publicKey.export({ type: 'spki', format: 'pem' }) as string, installed: new Set(), manifest: {} };
      return json(201, { id: 42, slug: 'weave-access-t', html_url: 'https://github.com/apps/weave-access-t', owner: { login: 'martl' }, pem: privateKey.export({ type: 'pkcs1', format: 'pem' }), client_secret: 'shh-client', webhook_secret: null });
    }
    const auth = new Headers(init?.headers).get('authorization') ?? '';
    // The App itself: a JWT Weave signed with its key (checked here), for its installations.
    const jwt = auth.match(/^Bearer ([\w-]+)\.([\w-]+)\.([\w-]+)$/);
    if (jwt && this.app) {
      const ok = cryptoVerify('sha256', Buffer.from(`${jwt[1]}.${jwt[2]}`), this.app.publicKey, Buffer.from(jwt[3], 'base64url'));
      if (!ok || JSON.parse(Buffer.from(jwt[2], 'base64url').toString()).iss !== '42') return json(401, { message: 'Bad credentials' });
      this.calls.push(`${method} ${url.pathname} (app)`);
      if (url.pathname === '/app/installations') return json(200, this.app.installed.size ? [{ id: 7 }] : []);
      if (url.pathname === '/app/installations/7/access_tokens' && method === 'POST') return (this.mints.push(JSON.parse(String(init?.body ?? '{}'))), json(201, { token: 'ghs_inst', expires_at: new Date(Date.now() + 3600_000).toISOString() }));
      const at = url.pathname.match(/^\/repos\/([\w-]+\/[\w.-]+)\/installation$/);
      return at && this.app.installed.has(at[1]) ? json(200, { id: 7 }) : json(404, { message: 'Not Found' });
    }
    // An installation's token: the repositories the App is installed on, and nothing else.
    if (auth === 'Bearer ghs_inst') {
      if (url.pathname === '/installation/repositories') return json(200, { repositories: [...this.repos].filter(([n]) => this.app?.installed.has(n)).map(([full_name, r]) => ({ full_name, private: full_name !== 'acme/site', owner: { type: r.owner } })) });
      const at = url.pathname.match(/^\/repos\/([\w-]+\/[\w.-]+)/);
      if (!at || !this.app?.installed.has(at[1])) return json(404, { message: 'Not Found' });
    } else if (auth !== 'Bearer ghp_admin') return json(404, { message: 'Not Found' });
    this.calls.push(`${method} ${url.pathname}`);
    // Whose sign-in it is, and what it reaches.
    if (url.pathname === '/user') return json(200, { login: 'martl' });
    if (url.pathname === '/user/repos') return json(200, [...this.repos].map(([full_name, r]) => ({ full_name, private: full_name !== 'acme/site', owner: { type: r.owner }, permissions: { admin: true } })));
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
  shipped = temp('weave-shipped-access-');
  const listed: Record<string, unknown> = {};
  for (const [name, world] of [['github-access', 'service'], ['github-verify', 'verifier'], ['github-keyvault', 'keyvault']] as const) {
    const source = join(import.meta.dirname, '..', '..', 'shipped', name);
    const component = await buildComponent(join(source, 'src', 'service.js'), world, { http: true });
    copyFileSync(component, join(shipped, `${name}.wasm`));
    listed[name] = { component: `${name}.wasm`, digest: digestOf(component), manifest: JSON.parse(readFileSync(join(source, 'weave.app.json'), 'utf8')) };
  }
  writeFileSync(join(shipped, 'shipped.json'), JSON.stringify(listed));
}, 300_000);

/** People on this GitHub, with its verifier and services running here. */
async function people(github: OrgGitHub, ...names: string[]) {
  const server = await github.serve();
  const nodes_ = names.map((name) => {
    const node = WeaveNode.init(name, temp('weave-access-'));
    node.wasmSetup.shippedDir = shipped;
    node.wasmSetup.testHosts = { 'api.github.com': server.port };
    nodes.push(node);
    return node;
  });
  return { server, nodes: nodes_ };
}

/** A gist of that account holding someone's Weave id. */
const gistFor = (github: OrgGitHub, id: string, login: string, node: WeaveNode) => github.gists.set(id, { owner: login, content: `Hi! My Weave id: ${node.identity.author}` });

describe('accounts elsewhere', { timeout: 120_000 }, () => {
  it('are proven by a proof that names you, checked by each Weave itself, on a hub or in a space', async () => {
    const github = new OrgGitHub();
    const { server, nodes: [martl, lena] } = await people(github, 'martl', 'Lena');
    try {
      expect((await martl.platforms()).map((p) => [p.platform, p.verifier])).toEqual([['github', 'github-verify']]);
      expect((await martl.accountProof({ platform: 'github' })).text).toBe(`My Weave id: ${martl.identity.author}`);
      await expect(martl.accountProof({ platform: 'x' })).rejects.toThrow(/nothing here checks accounts on x/);

      // A gist of someone else's, or one that doesn't name martl: refused.
      github.gists.set('aaaaaaaaaaaaaaaaaaaa', { owner: 'lena-gh', content: `My Weave id: ${martl.identity.author}` });
      await expect(martl.linkAccount({ platform: 'github', handle: 'martl', proof: 'https://gist.github.com/lena-gh/aaaaaaaaaaaaaaaaaaaa' })).rejects.toThrow(/proof doesn't hold/);
      github.gists.set('bbbbbbbbbbbbbbbbbbbb', { owner: 'martl', content: 'something else' });
      await expect(martl.linkAccount({ platform: 'github', handle: 'martl', proof: 'bbbbbbbbbbbbbbbbbbbb' })).rejects.toThrow(/proof doesn't hold/);

      // On his hub: everyone sees it, each Weave checking it itself.
      gistFor(github, 'cccccccccccccccccccc', 'martl', martl);
      await martl.linkAccount({ platform: 'github', handle: 'martl', proof: 'https://gist.github.com/martl/cccccccccccccccccccc' });
      expect((await martl.profile()).accounts).toEqual([{ platform: 'github', handle: 'martl', url: 'https://github.com/martl', verified: true }]);
      sync([martl, lena]);
      expect((await lena.profile(martl.identity.author)).accounts).toMatchObject([{ handle: 'martl', verified: true }]);
      // The gist goes: no longer his, once it's checked again (a new Weave asks).
      github.gists.delete('cccccccccccccccccccc');
      const fresh = (await people(github, 'Ola')).nodes[0];
      sync([martl, fresh]);
      expect((await fresh.profile(martl.identity.author)).accounts).toBeUndefined();

      // In one go instead: a code entered on GitHub, and the verifier makes the gist itself (scope gist); the sign-in is forgotten.
      martl.oauthSetup.fetch = async (url) => {
        const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
        return String(url).endsWith('/device/code') ? json({ device_code: 'd-9', user_code: 'ABCD-EFGH', verification_uri: 'https://github.com/login/device', interval: 0.01 }) : json({ access_token: 'gho-gist', scope: 'gist' });
      };
      // Its look, too, is its verifier's: Weave knows no platform.
      expect((await martl.platforms())[0]).toMatchObject({ platform: 'github', prove: true, icon: 'github' });
      const started = await martl.startAccountProof({ platform: 'github' });
      expect(started).toMatchObject({ code: 'ABCD-EFGH', url: 'https://github.com/login/device' });
      const proven = await martl.finishAccountProof({ id: started.id });
      expect(proven).toMatchObject([{ platform: 'github', handle: 'martl', verified: true }]);
      expect([...github.gists.values()].at(-1)).toEqual({ owner: 'martl', content: `My Weave id: ${martl.identity.author}
` });
      expect(JSON.stringify(martl.replica.events())).not.toContain('gho-gist');

      // Proven once, shown where he says: his hub, and a project he picks (its members, its services).
      await martl.createProject({ name: 'Mine' });
      const [made] = await martl.myAccounts();
      await martl.linkAccount({ platform: 'github', handle: made.handle, proof: made.proof, space: 'Mine' });
      expect(await martl.myAccounts()).toMatchObject([{ platform: 'github', handle: 'martl', verified: true, hub: true, spaces: [{ name: 'Mine' }] }]);

      // Taken back: gone from the hub, still in the project.
      await martl.linkAccount({ platform: 'github', on: false });
      expect(await martl.myAccounts()).toMatchObject([{ hub: false, spaces: [{ name: 'Mine' }] }]);
      expect((await martl.profile()).accounts).toBeUndefined();
    } finally {
      server.close();
    }
  });
});

describe('GitHub access, shipped with Weave', { timeout: 300_000 }, () => {
  it("gives members who shared a proven account access to the repositories chosen, and takes it back when they leave", async () => {
    const github = new OrgGitHub().add('acme/secret', 'Organization', ['old-friend']).add('martl/notes', 'User');
    const { server, nodes: [martl, lena, kofi] } = await people(github, 'martl', 'Lena', 'Kofi');
    await martl.createProject({ name: 'Site' });
    await martl.createProject({ name: 'Docs' });
    await lena.joinSpace(await martl.invite('Site'));
    await kofi.joinSpace(await martl.invite('Site'));
    await lena.joinSpace(await martl.invite('Docs'));
    sync([martl, lena, kofi]);
    await martl.setBoardAccess({ project: 'Site', board: 'ideas', read: ['Lena', 'Kofi'] });
    const api = await startApi(martl, 0, { service: (token) => martl.serviceGate(token) });
    martl.runServices({ port: api.port });
    // Not too often: each round copies every event, and the services' calls wait for it.
    const syncing = setInterval(() => sync([martl, lena, kofi]), 300);
    const ask = async (node: WeaveNode, service: string, action: string, data?: unknown, space = 'Site') => {
      const asked = await node.askService({ space, service, text: action, action, ...(data ? { data: data as never } : {}) });
      let got: { text: string; data?: unknown; error?: string } | undefined;
      await vi.waitFor(async () => {
        got = (await node.serviceRequests({ space, service })).find((r) => r.id === asked.id)?.results[0];
        expect(got, `${action} in ${space}`).toBeDefined();
        // It answers one thing at a time: a request may wait for a round with GitHub (slow here, next to the syncing).
      }, { timeout: 90_000, interval: 200 });
      return got!;
    };
    try {
      // Weave's own GitHub service is gone: these do what it did.
      await expect(martl.addService({ builtin: 'github', spaces: ['Site'] })).rejects.toThrow(/GitHub service is gone: add GitHub releases .* and GitHub access/);
      // A verifier is nobody's service.
      await expect(martl.addService({ shipped: 'github-verify', spaces: ['Site'] })).rejects.toThrow(/is a verifier/);

      // The service holds no GitHub access: its contract says what it uses of martl's GitHub keyvault.
      const access = await martl.addService({ shipped: 'github-access', spaces: ['Site', 'Docs'] });
      expect(access.contract).toMatchObject({ reads: { kinds: ['weave.account'] }, writes: ['github.added'], net: ['api.github.com'], uses: { github: { administration: 'write', metadata: 'read' } } });
      await vi.waitFor(async () => expect((await martl.services())[0].running).toBe(true), { timeout: 30_000, interval: 200 });
      sync([martl, lena, kofi]);
      expect((await martl.serviceSettings({ space: 'Site', service: access.did })).asks).toEqual([]);

      // His keyvault: in Keys & devices, his alone. He makes his GitHub App there (GitHub's App manifest flow): a page
      // here sends its manifest on to GitHub, he creates it there, GitHub comes back with a code, and the App is his.
      expect((await martl.keyvaults()).map((k) => [k.name, k.platform, k.added])).toEqual([['github-keyvault', 'github', false]]);
      await martl.addKeyvault({ shipped: 'github-keyvault' });
      martl.oauthSetup.fetch = github.fetch;
      const making = await martl.startKeyvaultApp({ name: 'github-keyvault', setting: 'GITHUB_APP' });
      const page = await (await fetch(making.url)).text();
      const unescape = (text: string) => text.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      const action = new URL(unescape(page.match(/action="([^"]+)"/)![1]));
      const sent = JSON.parse(unescape(page.match(/name="manifest" value="([^"]+)"/)![1])) as { name: string; redirect_url: string; default_permissions: unknown };
      expect(action.origin + action.pathname).toBe('https://github.com/settings/apps/new');
      expect(sent).toMatchObject({ default_permissions: { administration: 'write', contents: 'read', metadata: 'read' }, public: false });
      // Named for whose it is: his name here (he proved no GitHub account).
      expect(sent.name).toBe("martl's Weave connect");
      const back = await fetch(`${sent.redirect_url}?code=c-1&state=${action.searchParams.get('state')}`, { redirect: 'manual' });
      // On to installing it.
      expect([back.status, back.headers.get('location')]).toEqual([302, 'https://github.com/apps/weave-access-t/installations/new']);
      const vault = await martl.finishKeyvaultApp({ id: making.id });
      expect(vault.apps).toEqual([{ key: '42', setting: 'GITHUB_APP', info: { id: 42, slug: 'weave-access-t', html_url: 'https://github.com/apps/weave-access-t', 'owner.login': 'martl' }, next: 'https://github.com/apps/weave-access-t/installations/new', handed: [] }]);
      expect(JSON.stringify(await martl.keyvaults())).not.toMatch(/PRIVATE KEY|shh-client/);
      expect(vault.users).toEqual([{ service: 'github-access', rights: { administration: 'write', metadata: 'read' }, projects: [{ id: expect.any(String), name: 'Site' }, { id: expect.any(String), name: 'Docs' }] }]);
      // An organization's repositories need an app made for it: made on its page, named for it, beside his own.
      const forOrg = await martl.startKeyvaultApp({ name: 'github-keyvault', setting: 'GITHUB_APP', owner: 'acme' });
      const orgPage = await (await fetch(forOrg.url)).text();
      expect(new URL(unescape(orgPage.match(/action="([^"]+)"/)![1])).pathname).toBe('/organizations/acme/settings/apps/new');
      expect(JSON.parse(unescape(orgPage.match(/name="manifest" value="([^"]+)"/)![1])).name).toBe("acme's Weave connect");
      await expect(martl.startKeyvaultApp({ name: 'github-keyvault', setting: 'GITHUB_APP', owner: 'acme/../x' })).rejects.toThrow(/an organization is named by its name there/);
      // Not installed anywhere yet; then on all three.
      await expect(martl.keyvaultReachable({ name: 'github-keyvault' })).rejects.toThrow(/isn't installed on any repository yet/);
      github.app!.installed = new Set(['acme/site', 'acme/secret', 'martl/notes']);
      expect(await martl.keyvaultReachable({ name: 'github-keyvault' })).toEqual([{ value: 'acme/site' }, { value: 'acme/secret', note: 'private' }, { value: 'martl/notes', note: "private · a person's" }]);
      // Only he hands anything of his to a project: nobody else has his keyvault (Kofi, even as Site's maintainer).
      await martl.setMaintainer({ project: 'Site', who: kofi.identity.author, on: true });
      sync([martl, lena, kofi]);
      await expect(kofi.handKeyvault({ name: 'github-keyvault', project: 'Site', resources: ['martl/notes'] })).rejects.toThrow(/no keyvault github-keyvault here/);
      await martl.setMaintainer({ project: 'Site', who: kofi.identity.author, on: false });
      sync([martl, lena, kofi]);
      const choose = async (space: string, repos: string[]) => {
        await martl.handKeyvault({ name: 'github-keyvault', project: space, resources: repos });
        sync([martl, lena, kofi]);
      };
      await choose('Site', ['acme/site', 'acme/secret']);
      // What it hands which project is the app's own (a keyvault may hold several apps).
      expect((await martl.keyvaults())[0].apps[0].handed).toEqual([{ project: { id: expect.any(String), name: 'Site' }, resources: ['acme/site', 'acme/secret'] }]);

      // Lena proves her GitHub account and shares it with Site; Kofi only says it's his (no proof, so nothing to check).
      gistFor(github, '0123456789abcdef01234567', 'lena-gh', lena);
      await lena.linkAccount({ platform: 'github', handle: 'lena-gh', proof: '0123456789abcdef01234567', space: 'Site' });
      await kofi.publish({ kind: 'weave.account', body: { platform: 'github', handle: 'kofi-gh', proof: 'ffffffffffffffffffff', on: true }, space: 'Site' });
      await vi.waitFor(async () => expect((await martl.accounts({ space: 'Site' })).map((a) => [a.who.name, a.handle, a.verified])).toEqual([['Lena', 'lena-gh', true], ['Kofi', 'kofi-gh', false]]), { timeout: 10_000, interval: 200 });

      // Members get read access to both (an organization's); Kofi to none.
      await vi.waitFor(() => {
        expect([...github.invited.keys()]).toEqual(['lena-gh']);
        expect([...github.repos.get('acme/secret')!.invited.keys()]).toEqual(['lena-gh']);
      }, { timeout: 60_000, interval: 200 });
      expect(github.invited.get('lena-gh')?.permission).toBe('pull');
      // Its list, the same as every service's: + (offering more) is martl's alone, whose repositories they are; the trash
      // can (declining) is maintainers'; getting access, everyone's.
      expect(await martl.serviceLists({ space: 'Site', service: access.did })).toMatchObject([{ name: 'repos', list: 'offers', add: { hand: 'github', mine: true }, remove: { action: 'decline', mine: true }, use: { account: 'github', mine: true }, covers: ['accept'] }]);
      expect(await lena.serviceLists({ space: 'Site', service: access.did })).toMatchObject([{ add: { mine: false }, remove: { mine: false }, use: { mine: true } }]);
      // Its list, as Weave shows it: each repository offered, and that she has access.
      expect((await ask(lena, access.did, 'offers')).data).toMatchObject([{ id: 'acme/site', url: 'https://github.com/acme/site', detail: 'members get read access · 1 given so far', done: '✓ You have access' }, { id: 'acme/secret', done: '✓ You have access' }]);
      // Each token cut to one repository and the service's rights, and logged in his keyvault.
      expect(github.mints).toContainEqual({ repositories: ['site'], permissions: { administration: 'write', metadata: 'read' } });
      expect(github.mints.filter((m) => m.repositories).every((m) => m.repositories!.length === 1 && JSON.stringify(m.permissions) === JSON.stringify({ administration: 'write', metadata: 'read' }))).toBe(true);
      expect((await martl.keyvaults())[0].log[0]).toMatchObject({ service: 'github-access', project: { name: 'Site' }, rights: { administration: 'write', metadata: 'read' } });
      expect(((await ask(kofi, access.did, 'offers')).data as Array<{ done?: string }>).some((i) => i.done)).toBe(false);
      expect(((await ask(martl, access.did, 'offers')).data as Array<{ done?: string }>).map((i) => i.done)).toEqual(['Yours', 'Yours']);

      // A person's repository too: members write there (GitHub has no read-only collaborators for it).
      await choose('Site', ['acme/site', 'acme/secret', 'martl/notes']);
      await vi.waitFor(() => expect(github.repos.get('martl/notes')!.invited.get('lena-gh')?.permission).toBe('push'), { timeout: 60_000, interval: 200 });

      // She accepts; then acme/secret isn't chosen any more: what it gave goes, the friend added by hand stays.
      const secret = github.repos.get('acme/secret')!;
      secret.invited.delete('lena-gh');
      secret.collaborators.add('lena-gh');
      github.invited.delete('lena-gh');
      github.collaborators.add('lena-gh');
      await choose('Site', ['acme/site']);
      await vi.waitFor(() => expect([...secret.collaborators]).toEqual(['old-friend']), { timeout: 60_000, interval: 200 });
      await vi.waitFor(() => expect(github.repos.get('martl/notes')!.invited.size).toBe(0), { timeout: 60_000, interval: 200 });

      // Docs gets acme/site too, and Lena shares her account there: a repository with any number of projects. She
      // leaves Site, and keeps her access by Docs.
      await lena.linkAccount({ platform: 'github', handle: 'lena-gh', proof: '0123456789abcdef01234567', space: 'Docs' });
      await choose('Docs', ['acme/site']);
      await vi.waitFor(async () => expect((await ask(lena, access.did, 'offers', undefined, 'Docs')).data).toMatchObject([{ id: 'acme/site' }]), { timeout: 90_000, interval: 500 });
      const rounds = () => github.calls.filter((c) => c === 'GET /repos/acme/site/collaborators').length;
      await martl.removeMember('Site', lena.identity.author);
      sync([martl, lena, kofi]);
      const before = rounds();
      await kofi.linkAccount({ platform: 'github', on: false, space: 'Site' });
      // A round after Kofi's change, through (it would take hers back after reading the invitations).
      await vi.waitFor(() => expect(rounds()).toBeGreaterThan(before), { timeout: 60_000, interval: 200 });
      await vi.waitFor(() => expect(github.calls.filter((c) => c === 'GET /repos/acme/site/invitations').length).toBe(rounds()), { timeout: 60_000, interval: 200 });
      expect(github.collaborators.has('lena-gh')).toBe(true);

      // Docs' maintainers decline it there (only members can't): hers goes, and it shows as declined, to accept again.
      await expect(lena.askService({ space: 'Docs', service: access.did, text: 'decline', action: 'decline', data: { id: 'acme/site' } })).rejects.toThrow(/only maintainers/);
      await ask(martl, access.did, 'decline', { id: 'acme/site' }, 'Docs');
      sync([martl, lena, kofi]);
      expect((await ask(martl, access.did, 'offers', undefined, 'Docs')).data).toMatchObject([{ id: 'acme/site', detail: 'Declined in this project', use: false, remove: false, more: [{ action: 'accept' }] }]);
      await vi.waitFor(() => expect(github.collaborators.has('lena-gh')).toBe(false), { timeout: 60_000, interval: 200 });
      expect(github.calls).toContain('DELETE /repos/acme/site/collaborators/lena-gh');
    } finally {
      clearInterval(syncing);
      await martl.removeService('github-access').catch(() => {});
      await api.close();
      server.close();
    }
  });
});
