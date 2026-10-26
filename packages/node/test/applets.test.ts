import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { checkManifest } from '@weave/core';
import { startApi } from '../src/api.ts';
import { platformKey } from '../src/appinstall.ts';
import { closeOpenStores, WeaveNode, type Fetch } from '../src/index.ts';

/*
 * Applets (block 5): a release whose manifest declares a contract. Installed, it becomes a service of the installer's
 * own, under its own key with exactly that contract, pinned to the release; a newer one runs only once taken, and one
 * asking for other rights changes the key's grant.
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

/** A bot: it answers every request addressed to it with its version, its greeting setting and the text. */
const botCode = (version: string) => `const api = process.env.WEAVE_SERVICE_API;
const headers = { authorization: 'Bearer ' + process.env.WEAVE_SERVICE_TOKEN, 'content-type': 'application/json' };
const answered = new Set();
async function round() {
  const { result } = await (await fetch(api + '/events', { headers })).json();
  for (const item of result ?? []) {
    if (item.kind !== 'weave.service.request' || answered.has(item.id)) continue;
    answered.add(item.id);
    await fetch(api + '/answer', { method: 'POST', headers, body: JSON.stringify({ request: item.id, text: ${JSON.stringify(version)} + ' ' + process.env.GREETING + ': ' + (item.body?.text ?? '') }) });
  }
}
setInterval(() => round().catch(() => {}), 200);
`;

function buildArchive(version: string): Buffer {
  const dir = tempDir('weave-applet-');
  mkdirSync(join(dir, 'Bot'));
  writeFileSync(join(dir, 'Bot', 'bot.cjs'), botCode(version));
  const tar = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
  const run = spawnSync(tar, ['-czf', 'Bot.tar.gz', 'Bot'], { cwd: dir });
  if (run.status !== 0) throw new Error(`tar failed: ${run.stderr}`);
  return readFileSync(join(dir, 'Bot.tar.gz'));
}

/** GitHub as far as releases go: releases by tag, each with its files and weave.app.json. */
class FakeReleases {
  releases = new Map<string, { files: Map<number, { name: string; bytes: Buffer }>; manifest: unknown }>();
  fetch: Fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
    const tagged = url.pathname.match(/^\/repos\/martl\/bot\/releases\/tags\/(.+)$/);
    if (tagged) {
      const release = this.releases.get(tagged[1]);
      return release ? json(200, { tag_name: tagged[1], assets: [...release.files].map(([id, f]) => ({ id, name: f.name, size: f.bytes.length })) }) : json(404, { message: 'Not Found' });
    }
    if (url.pathname === '/repos/martl/bot/contents/weave.app.json') {
      const release = this.releases.get(url.searchParams.get('ref') ?? '');
      return release ? json(200, { encoding: 'base64', content: Buffer.from(JSON.stringify(release.manifest)).toString('base64') }) : json(404, { message: 'Not Found' });
    }
    const asset = url.pathname.match(/^\/repos\/martl\/bot\/releases\/assets\/(\d+)$/);
    const file = asset && [...this.releases.values()].map((r) => r.files.get(Number(asset[1]))).find(Boolean);
    if (!file) return json(404, { message: 'Not Found' });
    return new Response(new Uint8Array(file.bytes), { status: 200, headers: { 'content-length': String(file.bytes.length) } });
  }) as Fetch;
}

function person(name: string, github: FakeReleases): WeaveNode {
  const node = WeaveNode.init(name, tempDir('weave-applets-home-'));
  node.githubSetup = { clientId: 'Iv1.test', fetch: github.fetch, sleep: async () => {} };
  nodes.push(node);
  return node;
}

const syncAll = (all: WeaveNode[]) => {
  for (let round = 0; round < 2; round++) for (const from of all) for (const to of all) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
};

describe('applets', { timeout: 60_000 }, () => {
  it('reads an applet from its manifest: a contract instead of a web page', () => {
    const applet = checkManifest({ app: 'bot', name: 'Bot', service: { reads: 'addressed', writes: ['weave.post'], version: '1.0' } });
    expect(applet.problems).toEqual([]);
    expect(applet.manifest?.service).toEqual({ reads: 'addressed', writes: ['weave.post'], version: '1.0' });
    expect(checkManifest({ app: 'bot', name: 'Bot' }).problems.join()).toMatch(/an app \(its web page: "services"[^]*or an applet \(its contract: "service"\)/);
    expect(checkManifest({ app: 'bot', name: 'Bot', service: { reads: 'nothing' } }).problems.join()).toMatch(/an applet's contract/);
  });

  it("installs another project's applet as your service, with its contract, pinned to its release", async () => {
    const github = new FakeReleases();
    const manifest = (writes: string[]) => ({
      app: 'echo-bot',
      name: 'Echo bot',
      version: 1,
      service: { reads: 'addressed', writes, version: '1.0' },
      start: { release: { [platformKey()]: ['node', 'bot.cjs'] } },
      env: [{ name: 'GREETING', label: 'Greeting' }],
    });
    github.releases.set('v1.0', { files: new Map([[31, { name: `Bot-1.0-${platformKey()}.tar.gz`, bytes: buildArchive('v1.0') }]]), manifest: manifest([]) });
    const martl = person('martl', github);
    const lena = person('Lena', github);
    await martl.createProject({ name: 'Bots' });
    await lena.joinSpace(await martl.invite('Bots'));
    await martl.releaseApp({ project: 'Bots', tag: 'v1.0', repo: 'martl/bot', assets: { [platformKey()]: `Bot-1.0-${platformKey()}.tar.gz` } });
    syncAll([martl, lena]);

    // Lena sees an applet: a service that reads only what's asked of it.
    const [artifact] = await lena.artifacts('Bots');
    expect(artifact).toMatchObject({ tag: 'v1.0', website: false, applet: { reads: 'addressed', writes: [] }, runs: 'release' });

    // She installs it in her own group: approved first, with its setting.
    await lena.createGroup('Friends');
    const api = await startApi(lena, 0, { service: (token) => lena.serviceGate(token) });
    try {
      lena.runServices({ port: api.port });
      await expect(lena.addService({ artifact: { project: 'Bots' }, spaces: ['Friends'] })).rejects.toThrow(/approve it first: Weave would run "node bot.cjs" from Echo bot v1\.0, released in Bots, as a service that reads only what is asked of it; writes only its answers/);
      await expect(lena.addService({ artifact: { project: 'Bots' }, spaces: ['Friends'], approve: true })).rejects.toThrow(/Echo bot needs Greeting/);
      const bot = await lena.addService({ artifact: { project: 'Bots' }, spaces: ['Friends'], approve: true, settings: { GREETING: 'Hello' } });
      expect(bot).toMatchObject({ name: 'echo-bot', contract: { reads: 'addressed', writes: [], version: '1.0' }, artifact: { tag: 'v1.0', project: { name: 'Bots' } } });
      expect(lena.replica.authority.grant(bot.did)?.permissions.sort()).toEqual(['weave.service.profile', 'weave.service.result']);
      expect((await lena.serviceReady('echo-bot')).artifact).toMatchObject({ installed: true });

      // It answers in Friends, as "Lena · echo-bot".
      await lena.askService({ space: 'Friends', service: bot.did, text: 'are you there?' });
      await vi.waitFor(async () => expect((await lena.serviceRequests({ space: 'Friends' }))[0].results.map((r) => r.text)).toEqual(['v1.0 Hello: are you there?']), { timeout: 15_000, interval: 200 });

      // martl releases v1.1, which also posts. Lena's bot stays on v1.0 until she takes it, and then may post.
      github.releases.set('v1.1', { files: new Map([[32, { name: `Bot-1.1-${platformKey()}.tar.gz`, bytes: buildArchive('v1.1') }]]), manifest: manifest(['weave.post']) });
      await martl.releaseApp({ project: 'Bots', tag: 'v1.1', repo: 'martl/bot', assets: { [platformKey()]: `Bot-1.1-${platformKey()}.tar.gz` } });
      syncAll([martl, lena]);
      expect((await lena.services()).find((s) => s.name === 'echo-bot')?.artifact).toMatchObject({ tag: 'v1.0', latest: 'v1.1' });
      await expect(lena.setService({ name: 'echo-bot', artifact: {} })).rejects.toThrow(/approve it first[^]*writes weave\.post and its answers/);
      const updated = await lena.setService({ name: 'echo-bot', artifact: {}, approve: true });
      expect(updated).toMatchObject({ contract: { writes: ['weave.post'] }, artifact: { tag: 'v1.1' } });
      expect(updated.artifact?.latest).toBeUndefined();
      expect(lena.replica.authority.grant(bot.did)?.permissions).toContain('weave.post');
      await lena.serviceReady('echo-bot');
      await lena.askService({ space: 'Friends', service: bot.did, text: 'and now?' });
      await vi.waitFor(async () => expect((await lena.serviceRequests({ space: 'Friends' })).flatMap((r) => r.results.map((x) => x.text))).toContain('v1.1 Hello: and now?'), { timeout: 15_000, interval: 200 });
    } finally {
      await lena.removeService('echo-bot').catch(() => {});
      await api.close();
    }
  });

  it('installs an applet on an always-on node: approved on the computer, fetched and run by the node, its secret sealed to it', async () => {
    const github = new FakeReleases();
    const manifest = { app: 'echo-bot', name: 'Echo bot', version: 1, service: { reads: 'addressed', writes: [], version: '1.0' }, start: { release: { [platformKey()]: ['node', 'bot.cjs'] } }, env: [{ name: 'GREETING', label: 'Greeting', secret: true }] };
    github.releases.set('v1.0', { files: new Map([[41, { name: `Bot-1.0-${platformKey()}.tar.gz`, bytes: buildArchive('v1.0') }]]), manifest });
    const martl = person('martl', github);
    await martl.createProject({ name: 'Bots' });
    await martl.releaseApp({ project: 'Bots', tag: 'v1.0', repo: 'martl/bot', assets: { [platformKey()]: `Bot-1.0-${platformKey()}.tar.gz` } });
    const boxDir = tempDir('weave-applets-box-');
    const linked = await martl.linkNode({ request: WeaveNode.nodeRequest(boxDir, 'nas') });
    const box = await WeaveNode.completeNodeLink(linked.answer, boxDir);
    box.githubSetup = { clientId: 'Iv1.test', fetch: github.fetch, sleep: async () => {} };
    nodes.push(box);
    syncAll([martl, box]);
    await box.reconcile();

    const bot = await martl.addService({ artifact: { project: 'Bots' }, spaces: ['Bots'], approve: true, settings: { GREETING: 'Hi' }, node: 'nas' });
    expect(bot).toMatchObject({ name: 'echo-bot', node: { name: 'nas' }, artifact: { tag: 'v1.0', installed: false }, settings: ['GREETING'] });
    // The secret went to the node only: it isn't in anything the computer can read.
    expect(JSON.stringify(martl.replica.events().map((e) => martl.itemFor(e)))).not.toContain('"Hi"');

    const api = await startApi(box, 0, { service: (token) => box.serviceGate(token) });
    try {
      box.runServices({ port: api.port });
      syncAll([martl, box]);
      await box.reconcile();
      await vi.waitFor(async () => expect((await box.services())[0]).toMatchObject({ name: 'echo-bot', running: true, artifact: { installed: true } }), { timeout: 15_000, interval: 200 });

      await martl.askService({ space: 'Bots', service: bot.did, text: 'up there?' });
      await vi.waitFor(
        async () => {
          syncAll([martl, box]);
          expect((await martl.serviceRequests({ space: 'Bots' }))[0].results.map((r) => r.text)).toEqual(['v1.0 Hi: up there?']);
        },
        { timeout: 15_000, interval: 300 },
      );
    } finally {
      await martl.removeService('echo-bot').catch(() => {});
      syncAll([martl, box]);
      await box.reconcile();
      await api.close();
    }
  });
});
