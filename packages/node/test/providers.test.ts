import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { startApi } from '../src/api.ts';
import { platformKey } from '../src/appinstall.ts';
import { closeOpenStores, WeaveNode, type Fetch } from '../src/index.ts';
import { writeSecretJson } from '../src/vault.ts';

/*
 * Providers (block 4): services that hand out artifacts, through the artifact.fetch protocol. Weave's GitHub
 * service is the first: run by a maintainer, it hands a project's release files to its participants with the
 * maintainer's GitHub sign-in, so they install releases of a private repository without access to it. Whoever
 * fetches checks the file against what the maintainer released, so it doesn't matter who delivers it.
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

/** A release archive with a small program in it. */
function buildArchive(): Buffer {
  const dir = tempDir('weave-provider-artifact-');
  mkdirSync(join(dir, 'Bot'));
  writeFileSync(join(dir, 'Bot', 'bot.cjs'), 'setInterval(() => {}, 1000);\n');
  const tar = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
  const run = spawnSync(tar, ['-czf', 'Bot.tar.gz', 'Bot'], { cwd: dir });
  if (run.status !== 0) throw new Error(`tar failed: ${run.stderr}`);
  return readFileSync(join(dir, 'Bot.tar.gz'));
}

/** GitHub with a private repository: only martl's token sees it; a file's download address works for a while without one. */
class PrivateGitHub {
  bytes = buildArchive();
  manifest = { app: 'bot', name: 'Bot', version: 1, services: [], service: { reads: 'addressed', writes: [], version: '1.0' }, start: { release: { [platformKey()]: ['node', 'bot.cjs'] } } };
  /** Serve something else at the download address (a provider that can't be trusted). */
  tamper = false;
  /** Files handed out at a download address. */
  delivered = 0;
  fetch: Fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
    if (url.host === 'objects.githubusercontent.com') {
      this.delivered++;
      const bytes = this.tamper ? Buffer.concat([this.bytes, Buffer.from('x')]) : this.bytes;
      return new Response(new Uint8Array(bytes), { status: 200, headers: { 'content-length': String(bytes.length) } });
    }
    const signedIn = new Headers(init?.headers).get('authorization') === 'Bearer gho_martl';
    if (!signedIn) return json(404, { message: 'Not Found' });
    if (url.pathname === '/repos/martl/bot/releases/tags/v1.0') return json(200, { tag_name: 'v1.0', assets: [{ id: 21, name: `Bot-${platformKey()}.tar.gz`, size: this.bytes.length }] });
    if (url.pathname === '/repos/martl/bot/contents/weave.app.json') return json(200, { encoding: 'base64', content: Buffer.from(JSON.stringify(this.manifest)).toString('base64') });
    if (url.pathname === '/repos/martl/bot/releases/assets/21') {
      if (init?.redirect === 'manual') return new Response(null, { status: 302, headers: { location: 'https://objects.githubusercontent.com/github-production-release-asset/21?X-Amz-Signature=abc' } });
      return new Response(new Uint8Array(this.bytes), { status: 200, headers: { 'content-length': String(this.bytes.length) } });
    }
    return json(404, { message: 'Not Found' });
  }) as Fetch;
}

function person(name: string, github: PrivateGitHub): WeaveNode {
  const node = WeaveNode.init(name, tempDir('weave-providers-'));
  node.githubSetup = { clientId: 'Iv1.test', fetch: github.fetch, sleep: async () => {} };
  nodes.push(node);
  return node;
}

const sync = (all: WeaveNode[]) => {
  for (let round = 0; round < 2; round++) for (const from of all) for (const to of all) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
};

describe('providers', { timeout: 60_000 }, () => {
  it("hands a private repository's release to participants through the maintainer's GitHub service, checked against the release", async () => {
    const github = new PrivateGitHub();
    const martl = person('martl', github);
    const lena = person('Lena', github);
    writeSecretJson(martl.home, join(martl.home.dir, 'github.json'), { token: 'gho_martl', login: 'martl' });
    await martl.createProject({ name: 'Bot' });
    await lena.joinSpace(await martl.invite('Bot'));
    await martl.releaseApp({ project: 'Bot', tag: 'v1.0', repo: 'martl/bot' });
    sync([martl, lena]);

    const martlApi = await startApi(martl, 0, { service: (token) => martl.serviceGate(token) });
    const lenaApi = await startApi(lena, 0, { service: (token) => lena.serviceGate(token) });
    martl.runServices({ port: martlApi.port });
    lena.runServices({ port: lenaApi.port });
    lena.locateWait = 10_000;
    // The two nodes reach each other while this runs (the network, in a test).
    const syncing = setInterval(() => sync([martl, lena]), 100);
    try {
      // Without a provider, Lena's node goes to GitHub itself: no access.
      await lena.addService({ artifact: { project: 'Bot' }, spaces: ['Bot'], approve: true });
      await lena.serviceReady('bot');
      expect((await lena.services())[0].artifact?.error).toMatch(/GitHub shows no release v1\.0 in martl\/bot/);

      // martl adds Weave's GitHub service to the project: it offers artifact.fetch, and Lena sees it there.
      const provider = await martl.addService({ builtin: 'github', spaces: ['Bot'] });
      expect(provider).toMatchObject({ name: 'github', builtin: 'github', contract: { reads: 'addressed', writes: [], offers: ['artifact.fetch'] } });
      await vi.waitFor(async () => expect((await lena.servicesIn('Bot')).filter((p) => p.contract.offers).map((p) => [p.name, p.builtin, p.contract.offers])).toEqual([['github', 'github', ['artifact.fetch']]]), { timeout: 5_000, interval: 100 });

      // Started again, Lena's node asks it, and fetches the file at the address it hands out.
      await lena.setService({ name: 'bot', enabled: false });
      await lena.setService({ name: 'bot', enabled: true });
      await lena.serviceReady('bot');
      const installed = (await lena.services()).find((s) => s.name === 'bot')!;
      expect(installed.artifact).toMatchObject({ installed: true });
      expect(installed.artifact?.error).toBeUndefined();
      expect(github.delivered).toBe(1);
      // The request and the answer are in the project, signed by the provider.
      const asked = (await lena.serviceRequests({ space: 'Bot', service: provider.did }))[0];
      expect(asked.data).toEqual({ protocol: 'artifact.fetch', artifact: expect.any(String), platform: platformKey() });
      expect(asked.results[0].data).toMatchObject({ url: expect.stringMatching(/^https:\/\/objects\.githubusercontent\.com\//), file: `Bot-${platformKey()}.tar.gz`, sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });

      // It answers that protocol only, and only for releases of its project.
      const other = await lena.askService({ space: 'Bot', service: provider.did, text: 'hi', data: { protocol: 'chat' } });
      const wrong = await lena.askService({ space: 'Bot', service: provider.did, text: 'that one', data: { protocol: 'artifact.fetch', artifact: 'not-a-release', platform: platformKey() } });
      await vi.waitFor(async () => {
        const all = await lena.serviceRequests({ space: 'Bot', service: provider.did });
        expect(all.find((r) => r.id === other.id)?.results[0]?.error).toMatch(/answers artifact\.fetch only/);
        expect(all.find((r) => r.id === wrong.id)?.results[0]?.error).toMatch(/Bot has no such release/);
      }, { timeout: 5_000, interval: 100 });

      // Who delivers doesn't matter: a file other than the one released is refused.
      github.tamper = true;
      const kofi = person('Kofi', github);
      await kofi.joinSpace(await martl.invite('Bot'));
      sync([martl, lena, kofi]);
      const kofiApi = await startApi(kofi, 0, { service: (token) => kofi.serviceGate(token) });
      kofi.runServices({ port: kofiApi.port });
      kofi.locateWait = 10_000;
      const withKofi = setInterval(() => sync([martl, kofi]), 100);
      try {
        await kofi.addService({ artifact: { project: 'Bot' }, spaces: ['Bot'], approve: true });
        await kofi.serviceReady('bot');
        expect((await kofi.services())[0].artifact).toMatchObject({ installed: false, error: expect.stringMatching(/sha|fingerprint|match/i) });
      } finally {
        clearInterval(withKofi);
        await kofiApi.close();
      }
    } finally {
      clearInterval(syncing);
      await lena.removeService('bot').catch(() => {});
      await martlApi.close();
      await lenaApi.close();
    }
  });
});
