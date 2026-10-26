import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { startApi } from '../src/api.ts';
import { platformKey } from '../src/appinstall.ts';
import { closeOpenStores, WeaveNode, type Fetch } from '../src/index.ts';

/*
 * Artifacts as services (block 4): a project releases its app; anyone in it starts that release as a service of
 * their own, pinned to it, in any of their spaces. It runs only as approved, its web page becomes its room, and it
 * reads settings given per space from the app API.
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

const freePort = () =>
  new Promise<number>((resolve) => {
    const server = createServer().listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });

/** A release archive: a web server that says which release it is and what the app API tells it. */
function buildArchive(version: string, port: number): Buffer {
  const dir = tempDir('weave-artifact-');
  mkdirSync(join(dir, 'Horses'));
  writeFileSync(
    join(dir, 'Horses', 'server.cjs'),
    `const http = require('node:http');
http.createServer(async (req, res) => {
  const space = new URL(req.url, 'http://x').searchParams.get('project');
  const r = await fetch(process.env.WEAVE_API + '/v1/project' + (space ? '?project=' + encodeURIComponent(space) : ''), { headers: { authorization: 'Bearer ' + process.env.WEAVE_TOKEN } });
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ version: ${JSON.stringify(version)}, status: r.status, project: await r.json(), service: process.env.WEAVE_SERVICE, key: process.env.API_KEY ?? null, track: process.env.TRACK ?? null }));
}).listen(${port}, '127.0.0.1');
`,
  );
  const tar = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
  const run = spawnSync(tar, ['-czf', 'Horses.tar.gz', 'Horses'], { cwd: dir });
  if (run.status !== 0) throw new Error(`tar failed: ${run.stderr}`);
  return readFileSync(join(dir, 'Horses.tar.gz'));
}

/** GitHub as far as releases go: releases by tag, each with its files and weave.app.json. */
class FakeReleases {
  releases = new Map<string, { files: Map<number, { name: string; bytes: Buffer }>; manifest: unknown }>();
  fetch: Fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
    const tagged = url.pathname.match(/^\/repos\/martl\/horses\/releases\/tags\/(.+)$/);
    if (tagged) {
      const release = this.releases.get(tagged[1]);
      return release ? json(200, { tag_name: tagged[1], assets: [...release.files].map(([id, f]) => ({ id, name: f.name, size: f.bytes.length })) }) : json(404, { message: 'Not Found' });
    }
    if (url.pathname === '/repos/martl/horses/contents/weave.app.json') {
      const release = this.releases.get(url.searchParams.get('ref') ?? '');
      return release ? json(200, { encoding: 'base64', content: Buffer.from(JSON.stringify(release.manifest)).toString('base64') }) : json(404, { message: 'Not Found' });
    }
    const asset = url.pathname.match(/^\/repos\/martl\/horses\/releases\/assets\/(\d+)$/);
    const file = asset && [...this.releases.values()].map((r) => r.files.get(Number(asset[1]))).find(Boolean);
    if (!file) return json(404, { message: 'Not Found' });
    return new Response(new Uint8Array(file.bytes), { status: 200, headers: { 'content-length': String(file.bytes.length) } });
  }) as Fetch;
}

function person(name: string, github: FakeReleases): WeaveNode {
  const node = WeaveNode.init(name, tempDir('weave-artifact-home-'));
  node.githubSetup = { clientId: 'Iv1.test', fetch: github.fetch, sleep: async () => {} };
  nodes.push(node);
  return node;
}

const syncAll = (all: WeaveNode[]) => {
  for (let round = 0; round < 2; round++) for (const from of all) for (const to of all) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
};

const getJson = async (port: number, path = '/') => (await fetch(`http://127.0.0.1:${port}${path}`)).json() as Promise<{ version: string; status: number; project: { id?: string; name?: string; service?: string; settings?: Record<string, string>; error?: string }; service: string; key: string | null; track: string | null }>;

describe('artifacts as services', { timeout: 60_000 }, () => {
  it('starts a release of another project as your service, pinned to it, in your own spaces', async () => {
    const github = new FakeReleases();
    const port = await freePort();
    const manifest = (version: string) => ({
      app: 'horses',
      name: 'Horse race',
      version: 1,
      services: [{ port }],
      start: { release: { [platformKey()]: ['node', 'server.cjs'] } },
      env: [
        { name: 'API_KEY', label: 'API key', secret: true, optional: true },
        { name: 'TRACK', label: 'Track', space: true, optional: true },
      ],
      _v: version,
    });
    github.releases.set('v1.0', { files: new Map([[21, { name: `Horses-1.0-${platformKey()}.tar.gz`, bytes: buildArchive('v1.0', port) }]]), manifest: manifest('v1.0') });

    const martl = person('martl', github);
    const lena = person('Lena', github);
    await martl.createProject({ name: 'Horses' });
    await lena.joinSpace(await martl.invite('Horses'));
    await martl.releaseApp({ project: 'Horses', tag: 'v1.0', repo: 'martl/horses', assets: { [platformKey()]: `Horses-1.0-${platformKey()}.tar.gz` } });
    syncAll([martl, lena]);

    // Lena sees the release as an artifact: it has a web page, and asks for a key once and a track per space.
    const [artifact] = await lena.artifacts('Horses');
    expect(artifact).toMatchObject({ tag: 'v1.0', app: 'horses', name: 'Horse race', room: true, runs: 'release', released: { name: 'martl' } });
    expect(artifact.settings.map((e) => [e.name, !!e.space])).toEqual([['API_KEY', false], ['TRACK', true]]);

    // She runs it in her own project, Party, which martl isn't in. Not before she approves what it runs.
    await lena.createProject({ name: 'Party' });
    await expect(lena.addService({ artifact: { project: 'Horses' }, spaces: ['Party'] })).rejects.toThrow(/approve it first: Weave would run "node server.cjs" from Horse race v1\.0, released in Horses/);
    const api = await startApi(lena, 0, { service: (token) => lena.serviceGate(token) });
    try {
      lena.runServices({ port: api.port });
      const added = await lena.addService({ artifact: { project: 'Horses' }, spaces: ['Party'], approve: true, settings: { API_KEY: 'k-123' } });
      expect(added).toMatchObject({ name: 'horses', contract: { reads: 'addressed', writes: [], room: true }, artifact: { tag: 'v1.0', project: { name: 'Horses' } } });
      await expect(lena.addService({ name: 'other', artifact: { project: 'Horses' }, approve: true, settings: { NOPE: 'x' } })).rejects.toThrow(/doesn't ask for NOPE/);

      // Fetched, checked, started: the app API answers for Party, with its key in the environment.
      expect((await lena.serviceInstalled('horses')).artifact).toMatchObject({ installed: true });
      const first = await vi.waitFor(() => getJson(port), { timeout: 15_000, interval: 200 });
      expect(first).toMatchObject({ version: 'v1.0', status: 200, service: 'horses', key: 'k-123', track: null, project: { name: 'Party', service: 'horses', settings: {} } });

      // Its web page is its room in Party, offered by Lena · horses.
      const room = (await lena.rooms('Party')).find((r) => r.offeredBy);
      expect(room).toMatchObject({ name: 'horses', mine: true, offeredBy: { name: 'horses' }, open: true });

      // A track for Party only: a per-space setting, read from the app API, never from the environment.
      await expect(lena.setService({ name: 'horses', spaceSettings: { Party: { API_KEY: 'x' } } })).rejects.toThrow(/doesn't ask for API_KEY per space/);
      await expect(lena.setService({ name: 'horses', spaceSettings: { Horses: { TRACK: 'x' } } })).rejects.toThrow(/isn't in Horses/);
      const set = await lena.setService({ name: 'horses', spaceSettings: { Party: { TRACK: 'mud' } } });
      expect(set.spaces).toEqual([expect.objectContaining({ name: 'Party', settings: ['TRACK'] })]);
      const second = await vi.waitFor(async () => {
        const answer = await getJson(port);
        expect(answer.project.settings).toEqual({ TRACK: 'mud' });
        return answer;
      }, { timeout: 15_000, interval: 200 });
      expect(second.track).toBeNull();

      // In two spaces, it says which one it asks about.
      await lena.createProject({ name: 'Stable' });
      await lena.setService({ name: 'horses', spaces: ['Party', 'Stable'] });
      await vi.waitFor(async () => expect((await getJson(port)).status).toBe(400), { timeout: 15_000, interval: 200 });
      expect((await getJson(port, '/?project=Stable')).project).toMatchObject({ name: 'Stable', settings: {} });
      expect((await getJson(port, '/?project=Party')).project).toMatchObject({ name: 'Party', settings: { TRACK: 'mud' } });
      expect((await getJson(port, '/?project=Horses')).status).toBe(404);

      // martl releases v1.1: Lena's service stays on v1.0 until she approves the update.
      github.releases.set('v1.1', { files: new Map([[22, { name: `Horses-1.1-${platformKey()}.tar.gz`, bytes: buildArchive('v1.1', port) }]]), manifest: manifest('v1.1') });
      await martl.releaseApp({ project: 'Horses', tag: 'v1.1', repo: 'martl/horses', assets: { [platformKey()]: `Horses-1.1-${platformKey()}.tar.gz` } });
      syncAll([martl, lena]);
      expect((await lena.services()).find((s) => s.name === 'horses')?.artifact).toMatchObject({ tag: 'v1.0', latest: 'v1.1' });
      expect((await getJson(port, '/?project=Party')).version).toBe('v1.0');
      await expect(lena.setService({ name: 'horses', artifact: {} })).rejects.toThrow(/approve it first/);
      await lena.setService({ name: 'horses', artifact: {}, approve: true });
      expect((await lena.serviceInstalled('horses')).artifact).toMatchObject({ tag: 'v1.1', installed: true });
      expect((await lena.services()).find((s) => s.name === 'horses')?.artifact?.latest).toBeUndefined();
      await vi.waitFor(async () => expect((await getJson(port, '/?project=Party')).version).toBe('v1.1'), { timeout: 15_000, interval: 200 });

      // Turned off: the room ends.
      await lena.setService({ name: 'horses', enabled: false });
      expect((await lena.rooms('Party')).find((r) => r.id === room!.id)?.open ?? false).toBe(false);
    } finally {
      await lena.removeService('horses').catch(() => {});
      await api.close();
    }
  });
});
