import { spawnSync } from 'node:child_process';
import { createHash, createVerify, generateKeyPairSync } from 'node:crypto';
import { cpSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startApi } from '../src/api.ts';
import { closeOpenStores, WeaveNode, type Fetch } from '../src/index.ts';
import { digestOf } from '../src/shipped.ts';
import { pinnedRelease } from '../../shipped/pinned.ts';
import { buildComponent } from './helpers/components.ts';

/*
 * GitHub releases, the first service Weave ships (martl-projects/weave-github-releases, pinned): a WebAssembly component that hands
 * a project's private release files to its participants, with a token or its person's GitHub App (whose key Weave
 * signs with for it), reaching api.github.com only, and only for releases the project's maintainers published. What it
 * grants is sealed to the asker, and their own fetcher (github-checkout, a client app of theirs) fetches with it.
 */

const dirs: string[] = [];
const nodes: WeaveNode[] = [];
afterAll(async () => {
  for (const node of nodes) await node.close().catch(() => {});
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});
const tempDir = (prefix: string) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
};

/** The release file: a WebAssembly bot (Weave runs no programs from releases), as an archive for the platform "wasm". */
let botArchive: Buffer;
async function buildArchive(): Promise<Buffer> {
  const dir = tempDir('weave-releases-artifact-');
  mkdirSync(join(dir, 'Bot'));
  cpSync(await buildComponent(join(import.meta.dirname, 'helpers', 'wasm-bot.js'), 'service'), join(dir, 'Bot', 'bot.wasm'));
  const tar = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
  const run = spawnSync(tar, ['-czf', 'Bot.tar.gz', 'Bot'], { cwd: dir });
  if (run.status !== 0) throw new Error(`tar failed: ${run.stderr}`);
  return readFileSync(join(dir, 'Bot.tar.gz'));
}

const APP_ID = '424242';
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const APP_KEY = keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

/** GitHub with a private repository (or a public one): a token or the App's installation sees it; its file store hands files out. */
class PrivateGitHub {
  /** A public repository: anyone sees it, without a token. */
  public = false;
  bytes = botArchive;
  guide = Buffer.from('%PDF-1.4 the guide\n');
  manifest = { app: 'bot', name: 'Bot für Grüße', version: 1, services: [], service: { reads: 'addressed', writes: [], version: '1.0' }, wasm: { component: 'bot.wasm' } };
  delivered = 0;
  /** Who reached the repository: the token, or the App. */
  seen: string[] = [];
  fetch: Fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
    if (url.host === 'objects.githubusercontent.com' && url.pathname.endsWith('/22')) return new Response(new Uint8Array(this.guide), { status: 200 });
    if (url.host === 'objects.githubusercontent.com') {
      this.delivered++;
      return new Response(new Uint8Array(this.bytes), { status: 200, headers: { 'content-length': String(this.bytes.length) } });
    }
    const auth = new Headers(init?.headers).get('authorization')?.replace('Bearer ', '') ?? '';
    // As the App: a JWT its key signed, for its ID.
    if (url.pathname === '/repos/martl/bot/installation' || url.pathname.startsWith('/app/')) {
      const [header, payload, signature] = auth.split('.');
      const claims = JSON.parse(Buffer.from(payload ?? '', 'base64url').toString() || '{}') as { iss?: string };
      const valid = !!signature && createVerify('RSA-SHA256').update(`${header}.${payload}`).verify(keys.publicKey, Buffer.from(signature, 'base64url'));
      if (!valid || claims.iss !== APP_ID) return json(401, { message: 'A JSON web token could not be decoded' });
      if (url.pathname === '/repos/martl/bot/installation') return json(200, { id: 9 });
      if (url.pathname === '/app/installations/9/access_tokens' && init?.method === 'POST') return json(201, { token: 'ghs_app9', expires_at: new Date(Date.now() + 3600_000).toISOString() });
      return json(404, { message: 'Not Found' });
    }
    if (auth !== 'gho_martl' && auth !== 'ghs_app9' && auth !== 'gho_lena' && !this.public) return json(404, { message: 'Not Found' });
    this.seen.push(auth === 'ghs_app9' ? 'app' : auth === 'gho_lena' ? 'lena' : auth ? 'token' : 'anyone');
    if (url.pathname === '/repos/martl/bot') return json(200, { full_name: 'martl/bot', private: !this.public });
    if (url.pathname === '/repos/martl/bot/releases') return json(200, [{ tag_name: 'v1.0', name: 'v1.0', draft: false, prerelease: false, assets: [{}, {}] }]);
    if (url.pathname === '/repos/martl/bot/releases/tags/v1.0') return json(200, { tag_name: 'v1.0', assets: [{ id: 21, name: 'Bot-wasm.tar.gz', size: this.bytes.length }, { id: 22, name: 'Guide.pdf', size: this.guide.length }] });
    if (url.pathname === '/repos/martl/bot/releases/assets/22') {
      if (init?.redirect === 'manual') return new Response(null, { status: 302, headers: { location: 'https://objects.githubusercontent.com/github-production-release-asset/22' } });
      return new Response(new Uint8Array(this.guide), { status: 200 });
    }
    if (url.pathname === '/repos/martl/bot/contents/weave.app.json' && url.searchParams.get('ref') === 'v1.0') return json(200, { encoding: 'base64', content: Buffer.from(JSON.stringify(this.manifest)).toString('base64') });
    if (url.pathname === '/repos/martl/bot/releases/assets/21') {
      if (init?.redirect === 'manual') return new Response(null, { status: 302, headers: { location: 'https://objects.githubusercontent.com/github-production-release-asset/21?X-Amz-Signature=abc' } });
      return new Response(new Uint8Array(this.bytes), { status: 200 });
    }
    return json(404, { message: 'Not Found' });
  }) as Fetch;

  /** The same GitHub as a server on this computer, for the component (it reaches api.github.com, mapped here). */
  async serve(): Promise<{ port: number; close(): void }> {
    const server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const headers = Object.fromEntries(Object.entries(req.headers).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
      const host = req.url?.startsWith('/github-production-release-asset/') ? 'objects.githubusercontent.com' : 'api.github.com';
      const answer = await this.fetch(`https://${host}${req.url}`, { method: req.method, headers, redirect: 'manual', ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) });
      res.writeHead(answer.status, Object.fromEntries(answer.headers));
      res.end(Buffer.from(await answer.arrayBuffer()));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    return { port: (server.address() as { port: number }).port, close: () => server.close() };
  }
}

function person(name: string, github: PrivateGitHub, shipped: string): WeaveNode {
  const node = WeaveNode.init(name, tempDir('weave-github-releases-'));
  node.githubSetup = { fetch: github.fetch };
  node.wasmSetup.shippedDir = shipped;
  nodes.push(node);
  return node;
}

const sync = (all: WeaveNode[]) => {
  for (let round = 0; round < 2; round++) for (const from of all) for (const to of all) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
};

/** Weave's shipped services, as its build makes them: github-releases and its fetcher, built from their source. */
let shipped: string;
beforeAll(async () => {
  botArchive = await buildArchive();
  shipped = tempDir('weave-shipped-');
  const listed: Record<string, unknown> = {};
  for (const name of ['github-releases', 'github-checkout']) {
    // As Weave ships it: its repository's pinned release (packages/shipped/pinned.json).
    const source = await pinnedRelease(name);
    const component = join(source, `${name}.wasm`);
    copyFileSync(component, join(shipped, `${name}.wasm`));
    listed[name] = { component: `${name}.wasm`, digest: digestOf(component), manifest: JSON.parse(readFileSync(join(source, 'weave.app.json'), 'utf8')) };
  }
  writeFileSync(join(shipped, 'shipped.json'), JSON.stringify(listed));
}, 300_000);

describe('GitHub releases, shipped with Weave', { timeout: 120_000 }, () => {
  it("hands a private repository's release to participants: with a token, or as the person's App", async () => {
    const github = new PrivateGitHub();
    const server = await github.serve();
    const martl = person('martl', github, shipped);
    const lena = person('Lena', github, shipped);
    const ben = person('Ben', github, shipped);
    await martl.createProject({ name: 'Bot' });
    await lena.joinSpace(await martl.invite('Bot'));
    await ben.joinSpace(await martl.invite('Bot'));
    sync([martl, lena, ben]);
    martl.wasmSetup.testHosts = { 'api.github.com': server.port, 'objects.githubusercontent.com': server.port };
    lena.wasmSetup.testHosts = { 'api.github.com': server.port, 'objects.githubusercontent.com': server.port };
    const martlApi = await startApi(martl, 0, { service: (token) => martl.serviceGate(token) });
    const lenaApi = await startApi(lena, 0, { service: (token) => lena.serviceGate(token) });
    martl.runServices({ port: martlApi.port });
    lena.runServices({ port: lenaApi.port });
    lena.locateWait = 20_000;
    // Not too often: three nodes ingesting everything starve the fetcher's worker of the thread its writes need.
    const syncing = setInterval(() => sync([martl, lena, ben]), 400);
    try {
      // martl adds it, its token kept in the project for its maintainers.
      const provider = await martl.addService({ shipped: 'github-releases', spaces: ['Bot'], settingsIn: 'Bot', settings: { GITHUB_TOKEN: 'gho_martl' } });
      expect(provider.contract).toMatchObject({ reads: 'addressed', writes: ['weave.app', 'weave.artifact'], offers: ['artifact.fetch'], fetcher: 'github-checkout', net: ['api.github.com'] });
      // Its fetcher is a client app, nobody's service: not in the catalog of services, not addable as one.
      expect((await martl.shippedServices()).map((s) => s.name)).toEqual(['github-releases']);
      await expect(martl.addService({ shipped: 'github-checkout', spaces: ['Bot'] })).rejects.toThrow(/is a fetcher/);
      await vi.waitFor(async () => expect((await martl.services())[0].running).toBe(true), { timeout: 30_000, interval: 200 });
      await vi.waitFor(async () => expect((await lena.servicesIn('Bot')).map((p) => [p.name, p.origin])).toEqual([['github-releases', { kind: 'shipped', name: 'github-releases', checked: 'verified' }]]), { timeout: 10_000, interval: 100 });

      // martl publishes v1.0: the service reads it with its own token and fingerprints its files. Nobody signs in to GitHub.
      await expect(lena.releaseApp({ project: 'Bot', tag: 'v1.0', repo: 'martl/bot' })).rejects.toThrow(/maintainer/);
      const published = await martl.releaseApp({ project: 'Bot', tag: 'v1.0', repo: 'martl/bot' });
      expect(published.install).toMatchObject({ source: { provider: 'github', ref: 'martl/bot' }, fetcher: 'github-checkout', tag: 'v1.0', access: 'grant', assets: { wasm: { file: 'Bot-wasm.tar.gz', sha256: createHash('sha256').update(github.bytes).digest('hex'), size: github.bytes.length } } });
      // Its manifest as written, UTF-8 (not read as Latin-1).
      expect(published.name).toBe('Bot für Grüße');
      expect(((await martl.releaseApp({ project: 'Bot', tag: 'v9', repo: 'martl/bot' }).catch((e: Error) => e)) as Error).message).toMatch(/github-releases \(martl\): GitHub shows no release v9/);
      expect((await martl.appReleases('Bot')).releases.map((r) => r.tag)).toEqual(['v1.0']);
      // Offered, and said in the project's chat: a message carrying the release, which Weave shows as a card to get it.
      const [offered] = await martl.artifacts('Bot');
      expect((await martl.messages('Bot')).filter((m) => m.announce)).toMatchObject([{ text: `${published.name} v1.0 is available`, announce: { kind: 'release', id: offered.id } }]);
      github.delivered = 0;

      // Lena adds the fetcher it names, for this project only: hers, not the project's.
      expect((await lena.fetchers()).map((f) => [f.name, f.added])).toEqual([['github-checkout', false]]);
      const fetcher = await lena.addFetcher({ shipped: 'github-checkout', projects: ['Bot'] });
      expect(fetcher).toMatchObject({ name: 'github-checkout', projects: [{ name: 'Bot' }], net: ['api.github.com', '*.githubusercontent.com'], added: true });

      // Lena installs the release: her node asks it, and her fetcher fetches with what it grants.
      await lena.addService({ artifact: { project: 'Bot' }, spaces: ['Bot'], approve: true });
      await lena.serviceReady('bot');
      const installed = (await lena.services()).find((s) => s.name === 'bot')!;
      expect(installed.artifact?.error).toBeUndefined();
      expect(installed.artifact).toMatchObject({ installed: true, deliveredBy: 'GitHub checkout, with what github-releases (martl) granted' });
      expect(github.delivered).toBe(1);
      expect(github.seen).toContain('token');

      // A file of the same release, handed out as the project's artifact: something to get, never to run.
      const guide = await martl.releaseFile({ project: 'Bot', tag: 'v1.0', file: 'Guide.pdf', name: 'Guide', type: 'application/pdf' });
      expect(guide).toMatchObject({ kind: 'file', name: 'Guide', tag: 'v1.0', source: { provider: 'github', ref: 'martl/bot' }, file: { name: 'Guide.pdf', size: github.guide.length }, type: 'application/pdf' });
      await vi.waitFor(async () => expect((await lena.artifacts('Bot')).map((a) => [a.name, a.kind]).sort()).toEqual([['Bot für Grüße', 'service'], ['Guide', 'file']]), { timeout: 10_000, interval: 100 });
      await expect(lena.getArtifactFile({ project: 'Bot', artifact: (await lena.artifacts('Bot')).find((a) => a.kind === 'service')!.id })).rejects.toThrow(/not a file to get/);
      const got = await lena.getArtifactFile({ project: 'Bot', artifact: guide.id });
      expect(readFileSync(got.path, 'utf8')).toBe('%PDF-1.4 the guide\n');
      expect(got.by).toBe('GitHub checkout, with what github-releases (martl) granted');
      // Got again: it's here, and still what was released.
      expect((await lena.getArtifactFile({ project: 'Bot', artifact: guide.id })).path).toBe(got.path);

      // The grant is Lena's (and martl's, whose service it is): Ben sees that it was answered, not what.
      const granted = (await lena.serviceRequests({ space: 'Bot', service: provider.did })).find((q) => q.text.startsWith('Bot '))!;
      expect(granted.results[0].data).toMatchObject({ repo: 'martl/bot', tag: 'v1.0', url: expect.stringMatching(/^https:\/\/objects\.githubusercontent\.com\//) });
      expect((await martl.serviceRequests({ space: 'Bot', service: provider.did })).find((q) => q.id === granted.id)!.results[0].data).toMatchObject({ repo: 'martl/bot' });
      await vi.waitFor(async () => expect((await ben.serviceRequests({ space: 'Bot', service: provider.did })).find((q) => q.id === granted.id)?.results[0]).toMatchObject({ text: '', private: true }), { timeout: 10_000, interval: 100 });
      expect((await ben.serviceRequests({ space: 'Bot', service: provider.did })).find((q) => q.id === granted.id)!.results[0].data).toBeUndefined();

      // Only releases its maintainers published, only its protocol.
      const wrong = await lena.askService({ space: 'Bot', service: provider.did, text: 'that one', data: { protocol: 'artifact.fetch', artifact: 'not-a-release', platform: 'wasm' } });
      const other = await lena.askService({ space: 'Bot', service: provider.did, text: 'hi', data: { protocol: 'chat' } });
      await vi.waitFor(async () => {
        const all = await lena.serviceRequests({ space: 'Bot', service: provider.did });
        expect(all.find((r) => r.id === wrong.id)?.results[0]?.error).toMatch(/no such release in this project/);
        expect(all.find((r) => r.id === other.id)?.results[0]?.error).toMatch(/answers artifact\.fetch, publish and releases only/);
      }, { timeout: 20_000, interval: 200 });

      // Only maintainers may get it now: Lena's fetch is refused before the service sees it, and she doesn't see it.
      const release = (granted.data as { artifact: string }).artifact;
      await expect(lena.setArtifactAccess({ project: 'Bot', artifact: release, who: 'maintainers' })).rejects.toThrow(/only the maintainers/);
      const narrowed = await martl.setArtifactAccess({ project: 'Bot', artifact: release, who: 'maintainers' });
      expect(narrowed.find((a) => a.id === release)).toMatchObject({ who: 'maintainers', mine: true });
      await vi.waitFor(async () => expect((await lena.artifacts('Bot')).find((a) => a.id === release)).toMatchObject({ who: 'maintainers', mine: false }), { timeout: 10_000, interval: 100 });
      const refused = await lena.askService({ space: 'Bot', service: provider.did, text: 'mine?', data: { protocol: 'artifact.fetch', artifact: release, platform: 'wasm' } });
      await vi.waitFor(async () => expect((await lena.serviceRequests({ space: 'Bot', service: provider.did })).find((r) => r.id === refused.id)?.results[0]?.error).toMatch(/only maintainers may get that in Bot/), { timeout: 20_000, interval: 200 });
      await martl.setArtifactAccess({ project: 'Bot', artifact: release, who: null });

      // Closed code without access of its own: it grants nothing, and never leaves it to the asker's own access.
      await martl.setServiceSetting({ space: 'Bot', service: provider.did, name: 'GITHUB_TOKEN', value: null });
      await vi.waitFor(async () => expect((await martl.services())[0].running).toBe(true), { timeout: 30_000, interval: 200 });
      const theirs = await lena.askService({ space: 'Bot', service: provider.did, text: 'yours?', data: { protocol: 'artifact.fetch', artifact: release, platform: 'wasm' } });
      await vi.waitFor(async () => expect((await lena.serviceRequests({ space: 'Bot', service: provider.did })).find((r) => r.id === theirs.id)?.results[0]?.error).toMatch(/no GitHub access for martl\/bot/), { timeout: 20_000, interval: 200 });

      // As martl's own GitHub App instead: Weave signs its JWT, the key never reaching the component.
      await martl.setServiceSetting({ space: 'Bot', service: provider.did, name: 'GITHUB_APP_ID', value: APP_ID });
      await martl.setServiceSetting({ space: 'Bot', service: provider.did, name: 'GITHUB_APP_KEY', value: APP_KEY });
      expect((await martl.serviceSettings({ space: 'Bot', service: provider.did })).settings.find((s) => s.name === 'GITHUB_APP_KEY')).toMatchObject({ secret: true });
      github.seen = [];
      await vi.waitFor(async () => expect((await martl.services())[0].running).toBe(true), { timeout: 30_000, interval: 200 });
      const again = await lena.askService({ space: 'Bot', service: provider.did, text: 'again', data: { protocol: 'artifact.fetch', artifact: release, platform: 'wasm' } });
      await vi.waitFor(async () => {
        const answer = (await lena.serviceRequests({ space: 'Bot', service: provider.did })).find((r) => r.id === again.id)?.results[0];
        expect(answer?.error).toBeUndefined();
        expect(answer?.data).toMatchObject({ url: expect.stringMatching(/^https:\/\/objects\.githubusercontent\.com\//) });
      }, { timeout: 30_000, interval: 300 });
      expect(github.seen).toEqual(['app', 'app']);

      // Withdrawn by a maintainer (only): no longer listed, nor handed out.
      await expect(lena.withdrawArtifact({ project: 'Bot', artifact: release })).rejects.toThrow(/only the maintainers of Bot withdraw/);
      expect((await martl.withdrawArtifact({ project: 'Bot', artifact: release })).some((a) => a.id === release)).toBe(false);
      await vi.waitFor(async () => expect((await lena.artifacts('Bot')).some((a) => a.id === release)).toBe(false), { timeout: 10_000, interval: 100 });
      const gone = await lena.askService({ space: 'Bot', service: provider.did, text: 'still?', data: { protocol: 'artifact.fetch', artifact: release, platform: 'wasm' } });
      await vi.waitFor(async () => expect((await lena.serviceRequests({ space: 'Bot', service: provider.did })).find((r) => r.id === gone.id)?.results[0]?.error).toMatch(/no such release in this project/), { timeout: 20_000, interval: 200 });
    } finally {
      clearInterval(syncing);
      await martl.removeService('github-releases').catch(() => {});
      await lena.removeService('bot').catch(() => {});
      await martlApi.close();
      await lenaApi.close();
      server.close();
    }
  });

  it('hands out a public repository\'s release directly: the fetcher gets it while the service is off', async () => {
    const github = new PrivateGitHub();
    github.public = true;
    const server = await github.serve();
    const martl = person('martl', github, shipped);
    const lena = person('Lena', github, shipped);
    await martl.createProject({ name: 'Open' });
    await lena.joinSpace(await martl.invite('Open'));
    martl.wasmSetup.testHosts = { 'api.github.com': server.port, 'objects.githubusercontent.com': server.port };
    lena.wasmSetup.testHosts = { 'api.github.com': server.port, 'objects.githubusercontent.com': server.port };
    const api = await startApi(martl, 0, { service: (token) => martl.serviceGate(token) });
    const lenaApi = await startApi(lena, 0, { service: (token) => lena.serviceGate(token) });
    martl.runServices({ port: api.port });
    lena.runServices({ port: lenaApi.port });
    const syncing = setInterval(() => sync([martl, lena]), 100);
    try {
      // No token at all: the repository is public.
      await martl.addService({ shipped: 'github-releases', spaces: ['Open'] });
      await vi.waitFor(async () => expect((await martl.services())[0].running).toBe(true), { timeout: 30_000, interval: 200 });
      const published = await martl.releaseApp({ project: 'Open', tag: 'v1.0', repo: 'martl/bot' });
      expect(published.install?.access).toBe('direct');
      // The service goes off: Lena gets it anyway, her fetcher straight from GitHub.
      await martl.setService({ name: 'github-releases', enabled: false });
      await lena.addFetcher({ shipped: 'github-checkout', projects: ['Open'] });
      github.delivered = 0;
      await vi.waitFor(async () => expect(await lena.artifacts('Open')).toHaveLength(1), { timeout: 10_000, interval: 100 });
      await lena.addService({ artifact: { project: 'Open' }, spaces: ['Open'], approve: true });
      await lena.serviceReady('bot');
      const direct = (await lena.services()).find((s) => s.name === 'bot')?.artifact;
      expect(direct?.error).toBeUndefined();
      expect(direct).toMatchObject({ installed: true, deliveredBy: 'GitHub checkout, from github, directly' });
      expect(github.delivered).toBe(1);
      expect((await lena.serviceRequests({ space: 'Open' })).filter((r) => r.from.did === lena.identity.author)).toEqual([]);
    } finally {
      clearInterval(syncing);
      await martl.removeService('github-releases').catch(() => {});
      await lena.removeService('bot').catch(() => {});
      await api.close();
      await lenaApi.close();
      server.close();
    }
  });
});
