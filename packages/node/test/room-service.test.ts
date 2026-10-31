import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { startApi } from '../src/api.ts';
import { closeOpenStores, WeaveNode } from '../src/index.ts';
import { dockerRunning, testImage } from './helpers/docker.ts';
import { publishRelease } from './helpers/releases.ts';
import { readSecretJson, writeSecretJson } from '../src/vault.ts';

/*
 * The website service: a service Weave ships. Added to a project, it makes ports of this device reachable there,
 * any number, and starts nothing. A service with a web page serves it (a release's manifest says so, and the runtime
 * tells the website service); a program of yours gets a website by its port.
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

/** A web app: a server on PORT that says which version it is and what the app API tells it about its project. */
const serverCode = (version: string) => `const http = require('node:http');
http.createServer(async (req, res) => {
  const r = await fetch(process.env.WEAVE_API + '/v1/project', { headers: { authorization: 'Bearer ' + process.env.WEAVE_TOKEN } });
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ version: ${JSON.stringify(version)}, status: r.status, project: await r.json(), service: process.env.WEAVE_SERVICE, key: process.env.API_KEY ?? null }));
}).listen(Number(process.env.PORT), '127.0.0.1');
`;

/** The release's image: a container running that server (by its ref@digest), and the manifest pinning it. */
function horsesRelease(version: string, racePort: number) {
  const image = testImage('ghcr.io/martl/horses', version);
  const file = join(tempDir('weave-artifact-'), 'server.cjs');
  writeFileSync(file, serverCode(version));
  const manifest = { app: 'horses', name: 'Horse race', version: 1, services: [{ port: racePort }], start: { image: image.ref }, install: { image }, env: [{ name: 'API_KEY', label: 'API key', secret: true, optional: true }] };
  return { manifest, script: { [`${image.ref}@${image.digest}`]: file } };
}

function person(name: string): WeaveNode {
  const node = WeaveNode.init(name, tempDir('weave-room-service-'));
  nodes.push(node);
  return node;
}

const syncAll = (all: WeaveNode[]) => {
  for (let round = 0; round < 2; round++) for (const from of all) for (const to of all) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
};

/** A service's token, as its process gets it (kept sealed on the node). */
const tokenOf = (node: WeaveNode, name: string) => readSecretJson<Array<{ name: string; token: string }>>(node.home, join(node.home.dir, 'services.json'))!.find((s) => s.name === name)!.token;

type Answer = { version: string; status: number; project: { id?: string; name?: string; rooms?: unknown[] }; service: string; key: string | null };
const getJson = async (port: number) => (await fetch(`http://127.0.0.1:${port}/`)).json() as Promise<Answer>;
const answers = (port: number) => vi.waitFor(() => getJson(port), { timeout: 15_000, interval: 200 });

describe('the website service', { timeout: 60_000 }, () => {
  it('makes ports reachable in its projects: services serve their web pages, and programs of yours get a website by port', async () => {
    const racePort = await freePort();
    const { manifest, script } = horsesRelease('v1.0', racePort);

    const martl = person('martl');
    const lena = person('Lena');
    const docker = tempDir('weave-room-docker-');
    dockerRunning(lena, docker, script);
    await martl.createProject({ name: 'Horses' });
    await lena.joinSpace(await martl.invite('Horses'));
    await publishRelease(martl, { project: 'Horses', tag: 'v1.0', repo: 'martl/horses', manifest });
    syncAll([martl, lena]);
    await lena.createProject({ name: 'Party' });

    // Lena adds Weave's website service to Party: it reads nothing, writes websites, and says it's the one Weave ships.
    const service = await lena.addService({ builtin: 'website', spaces: ['Party'] });
    expect(service).toMatchObject({ name: 'website', builtin: 'website', contract: { reads: 'nothing', writes: [], website: true }, websites: [] });
    // It takes no requests: its key may sign its profile and its websites, not even answers.
    expect(lena.replica.authority.grant(service.did)?.permissions.sort()).toEqual(['weave.room', 'weave.room.*', 'weave.service.profile']);
    expect((await lena.servicesIn('Party')).map((p) => [p.name, p.builtin])).toEqual([['website', 'website']]);
    await expect(lena.addService({ name: 'other', builtin: 'website', command: ['node', 'x.js'] })).rejects.toThrow(/runs in Weave/);

    const api = await startApi(lena, 0, { service: (token) => lena.serviceGate(token) });
    try {
      lena.runServices({ port: api.port });

      // Something of hers already running: the website service starts nothing, it only makes the port reachable.
      const boardPort = await freePort();
      const board = createHttpServer((_, res) => res.end('board')).listen(boardPort, '127.0.0.1');
      try {
        await expect(lena.openWebsite({ project: 'Horses', name: 'Board', port: boardPort })).rejects.toThrow(/website isn't in Horses/);
        const opened = await lena.openWebsite({ project: 'Party', name: 'Board', port: boardPort });
        // Said in the project's chat, as a card to join it; unless she'd rather not.
        expect((await lena.messages('Party')).filter((m) => m.announce)).toMatchObject([{ text: 'opened Board: come and join', announce: { kind: 'website', id: opened.id } }]);
        expect(opened).toMatchObject({ name: 'Board', mine: true, offeredBy: { name: 'website' }, open: true });

        // martl's release, installed as a service in Party (approved first): a web app without a contract reads and
        // writes nothing, and serves its web page.
        await expect(lena.addService({ artifact: { project: 'Horses' }, spaces: ['Party'] })).rejects.toThrow(/approve it first: Weave would run "[^"]* run [^"]*ghcr\.io\/martl\/horses@sha256:[0-9a-f]{64}" from Horse race v1\.0, released in Horses/);
        const horses = await lena.addService({ artifact: { project: 'Horses' }, spaces: ['Party'], settings: { API_KEY: 'k-123' }, approve: true });
        expect(horses).toMatchObject({ name: 'horses', contract: { reads: 'nothing', writes: [], website: true } });
        await lena.serviceReady('horses');
        // The runtime started it with its port and settings, and the website service serves it in Party.
        const first = await answers(racePort);
        expect(first).toMatchObject({ version: 'v1.0', status: 200, service: 'horses', key: 'k-123', project: { name: 'Party' } });
        const sites = async () => ((await lena.services()).find((s) => s.name === 'website')!.websites ?? []).map((r) => [r.name, r.project.name, r.handler.kind === 'service' ? r.handler.service : r.handler.kind, r.running]).sort();
        await vi.waitFor(async () => expect(await sites()).toEqual([['Board', 'Party', 'address', true], ['Horse race', 'Party', 'horses', true]]), { timeout: 10_000, interval: 200 });
        expect((await lena.websites('Party')).filter((r) => r.offeredBy).map((r) => r.name).sort()).toEqual(['Board', 'Horse race']);

        // Its port answers that website: another can't take it.
        await expect(lena.openWebsite({ project: 'Party', name: 'Race 2', port: racePort })).rejects.toThrow(new RegExp(`port ${racePort} already answers the website "Horse race"`));

        // Stopped, its website ends; started again, the same website comes back, from the same image.
        const before = (await lena.websites('Party')).find((r) => r.name === 'Horse race')!.id;
        await lena.setService({ name: 'horses', enabled: false });
        expect(await sites()).toEqual([['Board', 'Party', 'address', true]]);
        await vi.waitFor(async () => expect(await getJson(racePort).then(() => 'up', () => 'down')).toBe('down'), { timeout: 10_000, interval: 200 });
        await lena.setService({ name: 'horses', enabled: true });
        await lena.serviceReady('horses');
        await answers(racePort);
        await vi.waitFor(async () => expect(await sites()).toEqual([['Board', 'Party', 'address', true], ['Horse race', 'Party', 'horses', true]]), { timeout: 10_000, interval: 200 });
        expect(readFileSync(join(docker, 'docker.log'), 'utf8').match(/^run .*ghcr\.io\/martl\/horses@/gm)).toHaveLength(2);

        // In a project without a website service it serves nothing there, and says why; once one comes, it does.
        await lena.setService({ name: 'horses', spaces: ['Party', 'Horses'] });
        await lena.serviceReady('horses');
        await vi.waitFor(async () => expect((await lena.services()).find((s) => s.name === 'horses')!.artifact?.error).toMatch(/p\/Horses has no website service on this device/), { timeout: 10_000, interval: 200 });
        await lena.setService({ name: 'website', spaces: ['Party', 'Horses'] });
        await vi.waitFor(async () => expect((await sites()).map(([name, project]) => `${name} in ${project}`)).toEqual(['Board in Party', 'Horse race in Horses', 'Horse race in Party']), { timeout: 10_000, interval: 200 });

        // A service serves websites only when its contract says so.
        const quiet = await lena.addService({ name: 'quiet', contract: { reads: 'nothing', writes: [], version: '1.0' }, spaces: ['Party'] });
        await expect(lena.serviceGate(tokenOf(lena, quiet.name))!.serve({ space: 'Party', port: boardPort })).rejects.toThrow(/doesn't serve websites in its contract/);

        // The website service leaves Party: all websites there end.
        await lena.setService({ name: 'website', spaces: ['Horses'] });
        expect((await lena.websites('Party')).filter((r) => r.offeredBy)).toEqual([]);
        expect((await sites()).map(([name, project]) => `${name} in ${project}`)).toEqual(['Horse race in Horses']);
      } finally {
        board.close();
      }
    } finally {
      await lena.removeService('horses').catch(() => {});
      await lena.removeService('website').catch(() => {});
      await api.close();
    }
  });
});

describe('websites from Weave 0.20', { timeout: 60_000 }, () => {
  it('keeps a release running at the same website, run by the website service; a command is yours to start now', async () => {
    const racePort = await freePort();
    const { manifest, script } = horsesRelease('v1.0', racePort);
    const martl = person('martl');
    const lena = person('Lena');
    const docker = tempDir('weave-room-docker-');
    dockerRunning(lena, docker, script);
    await martl.createProject({ name: 'Horses' });
    await lena.joinSpace(await martl.invite('Horses'));
    const released = await publishRelease(martl, { project: 'Horses', tag: 'v1.0', repo: 'martl/horses', manifest });
    syncAll([martl, lena]);
    const party = await lena.createProject({ name: 'Party' });
    await lena.addService({ builtin: 'website', spaces: ['Party'] });
    const [artifact] = await lena.artifacts('Horses');

    // As Weave 0.20 left them: one website ran martl's release, one a command of Lena's.
    const file = join(lena.home.dir, 'services.json');
    const stored = readSecretJson<Array<Record<string, unknown>>>(lena.home, file)!;
    const old = {
      raceRoom0020: { id: 'raceRoom0020', project: party.id, name: 'Race night', handler: { artifact: { project: artifact.project.id, id: artifact.id, tag: 'v1.0', manifest: released } }, port: racePort, settings: { API_KEY: 'k-020' }, token: 'old-token-race' },
      quizRoom0020: { id: 'quizRoom0020', project: party.id, name: 'Quiz', handler: { command: ['node', 'quiz.js'], folder: 'C:\\games\\quiz' }, port: 4321, settings: {}, token: 'old-token-quiz' },
    };
    writeSecretJson(lena.home, file, stored.map((s) => (s.name === 'website' ? { ...s, hosted: old, approved: ['an-old-fingerprint'] } : s)));

    const api = await startApi(lena, 0, { service: (token) => lena.serviceGate(token) });
    lena.runServices({ port: api.port });
    try {
      // The release runs again, with the setting it had, and serves the same website: the website service runs it, no
      // service of its own (no key, not listed).
      const sites = async () => (await lena.services()).find((s) => s.name === 'website')!.websites!;
      await vi.waitFor(async () => expect((await sites()).find((r) => r.id === 'raceRoom0020')).toMatchObject({ name: 'Race night', handler: { kind: 'service', service: 'Horse race v1.0' }, running: true }), { timeout: 10_000, interval: 200 });
      expect((await lena.services()).map((s) => s.name)).toEqual(['website']);
      expect((await lena.whoami()).agents.some((a) => a.name === 'horses')).toBe(false);
      await lena.serviceReady('horses');
      expect(await answers(racePort)).toMatchObject({ version: 'v1.0', service: 'horses', key: 'k-020' });
      // The command's website stays at its port, and says Lena starts it now.
      expect((await sites()).find((r) => r.id === 'quizRoom0020')).toMatchObject({ name: 'Quiz', port: 4321, handler: { kind: 'address' }, note: expect.stringMatching(/no longer starts "node quiz\.js" in C:\\games\\quiz[^]*start it yourself/) });
      // Nothing of the old shape is left.
      const after = readSecretJson<Array<{ name: string; hosted?: Record<string, Record<string, unknown>> }>>(lena.home, file)!.find((s) => s.name === 'website')!;
      expect(Object.values(after.hosted ?? {}).some((r) => 'handler' in r || 'settings' in r)).toBe(false);
      expect(Object.keys(after.hosted ?? {}).sort()).toEqual(['quizRoom0020', 'raceRoom0020']);
    } finally {
      await lena.closeWebsite('raceRoom0020').catch(() => {});
      await api.close();
    }
  });
});
