import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { startApi } from '../src/api.ts';
import { platformKey } from '../src/appinstall.ts';
import { closeOpenStores, WeaveNode, type Fetch } from '../src/index.ts';

/*
 * The room service (block 4): a service Weave ships. Added to a project, it opens rooms there, any number, each
 * answered by its handler: a project's release (an artifact: fetched, checked, approved once per release), a command
 * (approved), or something already running. Handlers have no key: they only answer the room's clients, and ask the
 * app API about their own room.
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

/** A handler: a web server on PORT that says which version it is and what the app API tells it about its room. */
const serverCode = (version: string) => `const http = require('node:http');
http.createServer(async (req, res) => {
  const r = await fetch(process.env.WEAVE_API + '/v1/project', { headers: { authorization: 'Bearer ' + process.env.WEAVE_TOKEN } });
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ version: ${JSON.stringify(version)}, status: r.status, project: await r.json(), room: process.env.WEAVE_WEBSITE, key: process.env.API_KEY ?? null }));
}).listen(Number(process.env.PORT), '127.0.0.1');
`;

/** A release archive with that server in it. */
function buildArchive(version: string): Buffer {
  const dir = tempDir('weave-artifact-');
  mkdirSync(join(dir, 'Horses'));
  writeFileSync(join(dir, 'Horses', 'server.cjs'), serverCode(version));
  const tar = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
  const run = spawnSync(tar, ['-czf', 'Horses.tar.gz', 'Horses'], { cwd: dir });
  if (run.status !== 0) throw new Error(`tar failed: ${run.stderr}`);
  return readFileSync(join(dir, 'Horses.tar.gz'));
}

/** GitHub as far as releases go: releases by tag, each with its files and weave.app.json. */
class FakeReleases {
  releases = new Map<string, { files: Map<number, { name: string; bytes: Buffer }>; manifest: unknown }>();
  downloads = 0;
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
    this.downloads++;
    return new Response(new Uint8Array(file.bytes), { status: 200, headers: { 'content-length': String(file.bytes.length) } });
  }) as Fetch;
}

function person(name: string, github: FakeReleases): WeaveNode {
  const node = WeaveNode.init(name, tempDir('weave-room-service-'));
  node.githubSetup = { clientId: 'Iv1.test', fetch: github.fetch, sleep: async () => {} };
  nodes.push(node);
  return node;
}

const syncAll = (all: WeaveNode[]) => {
  for (let round = 0; round < 2; round++) for (const from of all) for (const to of all) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
};

type Answer = { version: string; status: number; project: { id?: string; name?: string; rooms?: unknown[] }; room: string; key: string | null };
const getJson = async (port: number) => (await fetch(`http://127.0.0.1:${port}/`)).json() as Promise<Answer>;
const answers = (port: number) => vi.waitFor(() => getJson(port), { timeout: 15_000, interval: 200 });

describe('the room service', { timeout: 60_000 }, () => {
  it('opens rooms in its projects, each answered by an artifact, a command, or something already running', async () => {
    const github = new FakeReleases();
    const racePort = await freePort();
    const manifest = { app: 'horses', name: 'Horse race', version: 1, services: [{ port: racePort }], start: { release: { [platformKey()]: ['node', 'server.cjs'] } }, env: [{ name: 'API_KEY', label: 'API key', secret: true, optional: true }] };
    github.releases.set('v1.0', { files: new Map([[21, { name: `Horses-1.0-${platformKey()}.tar.gz`, bytes: buildArchive('v1.0') }]]), manifest });

    const martl = person('martl', github);
    const lena = person('Lena', github);
    await martl.createProject({ name: 'Horses' });
    await lena.joinSpace(await martl.invite('Horses'));
    await martl.releaseApp({ project: 'Horses', tag: 'v1.0', repo: 'martl/horses', assets: { [platformKey()]: `Horses-1.0-${platformKey()}.tar.gz` } });
    syncAll([martl, lena]);
    await lena.createProject({ name: 'Party' });

    // Lena adds Weave's room service to Party: it writes rooms and nothing else, and says it's the one Weave ships.
    const service = await lena.addService({ builtin: 'website', spaces: ['Party'] });
    expect(service).toMatchObject({ name: 'website', builtin: 'website', contract: { reads: 'addressed', writes: [], website: true }, websites: [] });
    expect((await lena.servicesIn('Party')).map((p) => [p.name, p.builtin])).toEqual([['website', 'website']]);
    await expect(lena.addService({ name: 'other', builtin: 'website', command: ['node', 'x.js'] })).rejects.toThrow(/runs in Weave/);

    const api = await startApi(lena, 0, { service: (token) => lena.serviceGate(token) });
    try {
      lena.runServices({ port: api.port });

      // A room with martl's release as its handler: in a project of the service's, approved first.
      await expect(lena.openWebsite({ project: 'Horses', name: 'Race', artifact: { project: 'Horses' }, approve: true })).rejects.toThrow(/website isn't in Horses/);
      await expect(lena.openWebsite({ project: 'Party', name: 'Race', artifact: { project: 'Horses' } })).rejects.toThrow(/approve it first: Weave would run "node server.cjs" from Horse race v1\.0, released in Horses/);
      const race = await lena.openWebsite({ project: 'Party', name: 'Race', artifact: { project: 'Horses' }, settings: { API_KEY: 'k-123' }, approve: true });
      expect(race).toMatchObject({ name: 'Race', mine: true, offeredBy: { name: 'website' }, open: true });
      await lena.websiteReady(race.id);
      // The handler gets its port, its settings, and the app API for its own room.
      const first = await answers(racePort);
      expect(first).toMatchObject({ version: 'v1.0', status: 200, room: race.id, key: 'k-123', project: { name: 'Party' } });

      // The release listens on its port: a second room with it waits until the first ends.
      await expect(lena.openWebsite({ project: 'Party', name: 'Race 2', artifact: { project: 'Horses' } })).rejects.toThrow(new RegExp(`port ${racePort} already answers the room "Race"`));

      // Something already running: Weave starts nothing and asks for no approval.
      const boardPort = await freePort();
      const board = createHttpServer((_, res) => res.end('board')).listen(boardPort, '127.0.0.1');
      try {
        const opened = await lena.openWebsite({ project: 'Party', name: 'Board', port: boardPort });
        expect(opened).toMatchObject({ name: 'Board', offeredBy: { name: 'website' } });

        // A command in a folder: approved first, then started with its port.
        const folder = tempDir('weave-handler-');
        writeFileSync(join(folder, 'server.cjs'), serverCode('own'));
        const quizPort = await freePort();
        await expect(lena.openWebsite({ project: 'Party', name: 'Quiz', command: ['node', 'server.cjs'], folder, port: quizPort })).rejects.toThrow(/approve it first: Weave would run "node server.cjs" in /);
        const quiz = await lena.openWebsite({ project: 'Party', name: 'Quiz', command: ['node', 'server.cjs'], folder, port: quizPort, approve: true });
        expect(await answers(quizPort)).toMatchObject({ version: 'own', room: quiz.id, project: { name: 'Party' } });

        // Three rooms, one service.
        const listed = (await lena.services()).find((s) => s.name === 'website')!;
        expect(listed.websites!.map((r) => [r.name, r.handler.kind, r.running]).sort()).toEqual([
          ['Board', 'address', true],
          ['Quiz', 'command', true],
          ['Race', 'artifact', true],
        ]);
        expect((await lena.websites('Party')).filter((r) => r.offeredBy).map((r) => r.name).sort()).toEqual(['Board', 'Quiz', 'Race']);

        // Ending a room stops its handler; opening it again runs the approved release without asking (and without fetching it again).
        await lena.closeWebsite(race.id);
        expect((await lena.websites('Party')).some((r) => r.id === race.id)).toBe(false);
        await vi.waitFor(async () => expect(await getJson(racePort).then(() => 'up', () => 'down')).toBe('down'), { timeout: 10_000, interval: 200 });
        const downloads = github.downloads;
        const again = await lena.openWebsite({ project: 'Party', name: 'Race', artifact: { project: 'Horses' } });
        await lena.websiteReady(again.id);
        expect((await answers(racePort)).room).toBe(again.id);
        expect(github.downloads).toBe(downloads);

        // The room service leaves Party: all its rooms there end.
        await lena.setService({ name: 'website', spaces: [] });
        expect((await lena.websites('Party')).filter((r) => r.offeredBy)).toEqual([]);
        expect((await lena.services()).find((s) => s.name === 'website')!.websites).toEqual([]);
      } finally {
        board.close();
      }
    } finally {
      await lena.removeService('website').catch(() => {});
      await api.close();
    }
  });
});
