import { spawnSync } from 'node:child_process';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startApi } from '../src/api.ts';
import { platformKey } from '../src/appinstall.ts';
import { closeOpenStores, WeaveNode, type Fetch } from '../src/index.ts';
import { digestOf } from '../src/shipped.ts';
import { writeSecretJson } from '../src/vault.ts';
import { buildComponent } from './helpers/components.ts';

/*
 * GitHub releases, the first service Weave ships (packages/shipped/github-releases): a WebAssembly component that hands
 * a project's private release files to its participants, with a token or its person's GitHub App (whose key Weave
 * signs with for it), reaching api.github.com only, and only for releases the project's maintainers published.
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

function buildArchive(): Buffer {
  const dir = tempDir('weave-releases-artifact-');
  mkdirSync(join(dir, 'Bot'));
  writeFileSync(join(dir, 'Bot', 'bot.cjs'), 'setInterval(() => {}, 1000);\n');
  const tar = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
  const run = spawnSync(tar, ['-czf', 'Bot.tar.gz', 'Bot'], { cwd: dir });
  if (run.status !== 0) throw new Error(`tar failed: ${run.stderr}`);
  return readFileSync(join(dir, 'Bot.tar.gz'));
}

const APP_ID = '424242';
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const APP_KEY = keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

/** GitHub with a private repository: a token or the App's installation sees it; its file store hands files out. */
class PrivateGitHub {
  bytes = buildArchive();
  manifest = { app: 'bot', name: 'Bot', version: 1, services: [], service: { reads: 'addressed', writes: [], version: '1.0' }, start: { release: { [platformKey()]: ['node', 'bot.cjs'] } } };
  delivered = 0;
  /** Who reached the repository: the token, or the App. */
  seen: string[] = [];
  fetch: Fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
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
    if (auth !== 'gho_martl' && auth !== 'ghs_app9') return json(404, { message: 'Not Found' });
    this.seen.push(auth === 'ghs_app9' ? 'app' : 'token');
    if (url.pathname === '/repos/martl/bot/releases/tags/v1.0') return json(200, { tag_name: 'v1.0', assets: [{ id: 21, name: `Bot-${platformKey()}.tar.gz`, size: this.bytes.length }] });
    if (url.pathname === '/repos/martl/bot/contents/weave.app.json') return json(200, { encoding: 'base64', content: Buffer.from(JSON.stringify(this.manifest)).toString('base64') });
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
      const answer = await this.fetch(`https://api.github.com${req.url}`, { method: req.method, headers, redirect: 'manual', ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) });
      res.writeHead(answer.status, Object.fromEntries(answer.headers));
      res.end(Buffer.from(await answer.arrayBuffer()));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    return { port: (server.address() as { port: number }).port, close: () => server.close() };
  }
}

function person(name: string, github: PrivateGitHub, shipped: string): WeaveNode {
  const node = WeaveNode.init(name, tempDir('weave-github-releases-'));
  node.githubSetup = { clientId: 'Iv1.test', fetch: github.fetch, sleep: async () => {} };
  node.wasmSetup.shippedDir = shipped;
  nodes.push(node);
  return node;
}

const sync = (all: WeaveNode[]) => {
  for (let round = 0; round < 2; round++) for (const from of all) for (const to of all) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
};

/** Weave's shipped services, as its build makes them: github-releases, built from its source. */
let shipped: string;
beforeAll(async () => {
  const source = join(import.meta.dirname, '..', '..', 'shipped', 'github-releases');
  const component = await buildComponent(join(source, 'src', 'service.js'), 'service', { http: true });
  shipped = tempDir('weave-shipped-');
  copyFileSync(component, join(shipped, 'github-releases.wasm'));
  writeFileSync(join(shipped, 'shipped.json'), JSON.stringify({ 'github-releases': { component: 'github-releases.wasm', digest: digestOf(component), manifest: JSON.parse(readFileSync(join(source, 'weave.app.json'), 'utf8')) } }));
}, 180_000);

describe('GitHub releases, shipped with Weave', { timeout: 120_000 }, () => {
  it("hands a private repository's release to participants: with a token, or as the person's App", async () => {
    const github = new PrivateGitHub();
    const server = await github.serve();
    const martl = person('martl', github, shipped);
    const lena = person('Lena', github, shipped);
    writeSecretJson(martl.home, join(martl.home.dir, 'github.json'), { token: 'gho_martl', login: 'martl' });
    await martl.createProject({ name: 'Bot' });
    await lena.joinSpace(await martl.invite('Bot'));
    await martl.releaseApp({ project: 'Bot', tag: 'v1.0', repo: 'martl/bot' });
    sync([martl, lena]);
    martl.wasmSetup.testHosts = { 'api.github.com': server.port };
    const martlApi = await startApi(martl, 0, { service: (token) => martl.serviceGate(token) });
    const lenaApi = await startApi(lena, 0, { service: (token) => lena.serviceGate(token) });
    martl.runServices({ port: martlApi.port });
    lena.runServices({ port: lenaApi.port });
    lena.locateWait = 20_000;
    const syncing = setInterval(() => sync([martl, lena]), 100);
    try {
      // martl adds it, its token kept in the project for its maintainers.
      const provider = await martl.addService({ shipped: 'github-releases', spaces: ['Bot'], settingsIn: 'Bot', settings: { GITHUB_TOKEN: 'gho_martl' } });
      expect(provider.contract).toMatchObject({ reads: 'addressed', writes: [], offers: ['artifact.fetch'], net: ['api.github.com'] });
      await vi.waitFor(async () => expect((await martl.services())[0].running).toBe(true), { timeout: 30_000, interval: 200 });
      await vi.waitFor(async () => expect((await lena.servicesIn('Bot')).map((p) => [p.name, p.origin])).toEqual([['github-releases', { kind: 'shipped', name: 'github-releases', checked: 'verified' }]]), { timeout: 10_000, interval: 100 });

      // Lena installs the release: her node asks it, and fetches the file at the address it hands out.
      await lena.addService({ artifact: { project: 'Bot' }, spaces: ['Bot'], approve: true });
      await lena.serviceReady('bot');
      const installed = (await lena.services()).find((s) => s.name === 'bot')!;
      expect(installed.artifact?.error).toBeUndefined();
      expect(installed.artifact).toMatchObject({ installed: true, deliveredBy: 'github-releases (martl)' });
      expect(github.delivered).toBe(1);
      expect(github.seen).toContain('token');

      // Only releases its maintainers published, only its protocol.
      const wrong = await lena.askService({ space: 'Bot', service: provider.did, text: 'that one', data: { protocol: 'artifact.fetch', artifact: 'not-a-release', platform: platformKey() } });
      const other = await lena.askService({ space: 'Bot', service: provider.did, text: 'hi', data: { protocol: 'chat' } });
      await vi.waitFor(async () => {
        const all = await lena.serviceRequests({ space: 'Bot', service: provider.did });
        expect(all.find((r) => r.id === wrong.id)?.results[0]?.error).toMatch(/no such release in this project/);
        expect(all.find((r) => r.id === other.id)?.results[0]?.error).toMatch(/answers artifact\.fetch only/);
      }, { timeout: 20_000, interval: 200 });

      // Only maintainers may get it now: Lena's fetch is refused before the service sees it, and she doesn't see it.
      const release = ((await lena.serviceRequests({ space: 'Bot', service: provider.did }))[0].data as { artifact: string }).artifact;
      await expect(lena.setArtifactAccess({ project: 'Bot', artifact: release, who: 'maintainers' })).rejects.toThrow(/only the maintainers/);
      const narrowed = await martl.setArtifactAccess({ project: 'Bot', artifact: release, who: 'maintainers' });
      expect(narrowed[0]).toMatchObject({ who: 'maintainers', mine: true });
      await vi.waitFor(async () => expect((await lena.artifacts('Bot'))[0]).toMatchObject({ who: 'maintainers', mine: false }), { timeout: 10_000, interval: 100 });
      const refused = await lena.askService({ space: 'Bot', service: provider.did, text: 'mine?', data: { protocol: 'artifact.fetch', artifact: release, platform: platformKey() } });
      await vi.waitFor(async () => expect((await lena.serviceRequests({ space: 'Bot', service: provider.did })).find((r) => r.id === refused.id)?.results[0]?.error).toMatch(/only maintainers may get that in Bot/), { timeout: 20_000, interval: 200 });
      await martl.setArtifactAccess({ project: 'Bot', artifact: release, who: null });

      // As martl's own GitHub App instead: Weave signs its JWT, the key never reaching the component.
      await martl.setServiceSetting({ space: 'Bot', service: provider.did, name: 'GITHUB_TOKEN', value: null });
      await martl.setServiceSetting({ space: 'Bot', service: provider.did, name: 'GITHUB_APP_ID', value: APP_ID });
      await martl.setServiceSetting({ space: 'Bot', service: provider.did, name: 'GITHUB_APP_KEY', value: APP_KEY });
      expect((await martl.serviceSettings({ space: 'Bot', service: provider.did })).settings.find((s) => s.name === 'GITHUB_APP_KEY')).toMatchObject({ secret: true });
      github.seen = [];
      await vi.waitFor(async () => expect((await martl.services())[0].running).toBe(true), { timeout: 30_000, interval: 200 });
      const again = await lena.askService({ space: 'Bot', service: provider.did, text: 'again', data: { protocol: 'artifact.fetch', artifact: release, platform: platformKey() } });
      await vi.waitFor(async () => {
        const answer = (await lena.serviceRequests({ space: 'Bot', service: provider.did })).find((r) => r.id === again.id)?.results[0];
        expect(answer?.error).toBeUndefined();
        expect(answer?.data).toMatchObject({ url: expect.stringMatching(/^https:\/\/objects\.githubusercontent\.com\//) });
      }, { timeout: 30_000, interval: 300 });
      expect(github.seen).toEqual(['app', 'app']);
    } finally {
      clearInterval(syncing);
      await martl.removeService('github-releases').catch(() => {});
      await lena.removeService('bot').catch(() => {});
      await martlApi.close();
      await lenaApi.close();
      server.close();
    }
  });
});
