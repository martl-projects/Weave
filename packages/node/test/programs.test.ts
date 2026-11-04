import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { startApi } from '../src/api.ts';
import { platformKey } from '../src/appinstall.ts';
import { closeOpenStores, WeaveNode } from '../src/index.ts';
import { fetchesFrom, publishRelease, PublicGitHub, shippedCheckout } from './helpers/releases.ts';

/*
 * A program from a release (4.11.2026): a release that brings no container image and no WebAssembly, only a program
 * per platform, runs as that program on its person's computer, with their rights. Weave can't contain it, so it runs
 * only after a warning the person accepts in the app, for exactly that release and file: the consent is theirs alone
 * (an agent's or a service's yes isn't one), kept until withdrawn, never carried to another version. The file is
 * checked against the SHA-256 in the signed release before anything of it runs, and the program never starts by
 * itself: not after Weave restarts, not after it exits.
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

/** A web app as a program: a server on PORT that says which version it is and that it runs as itself, in its own folder. */
const serverCode = (version: string) => `const http = require('node:http');
http.createServer((req, res) => {
  if (req.url === '/quit') { res.end('bye'); return setTimeout(() => process.exit(0), 50); }
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ version: ${JSON.stringify(version)}, service: process.env.WEAVE_SERVICE, cwd: process.cwd(), key: process.env.API_KEY ?? null }));
}).listen(Number(process.env.PORT), '127.0.0.1');
`;

/** A release archive with that server in it: Horses/server.cjs. */
function buildArchive(version: string): Buffer {
  const dir = tempDir('weave-program-');
  mkdirSync(join(dir, 'Horses'));
  writeFileSync(join(dir, 'Horses', 'server.cjs'), serverCode(version));
  const tar = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
  const run = spawnSync(tar, ['-czf', 'Horses.tar.gz', 'Horses'], { cwd: dir });
  if (run.status !== 0) throw new Error(`tar failed: ${run.stderr}`);
  return readFileSync(join(dir, 'Horses.tar.gz'));
}

function person(name: string): WeaveNode {
  const node = WeaveNode.init(name, tempDir('weave-programs-home-'));
  nodes.push(node);
  return node;
}

const syncAll = (all: WeaveNode[]) => {
  for (let round = 0; round < 2; round++) for (const from of all) for (const to of all) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
};

type Answer = { version: string; service: string; cwd: string; key: string | null };
const getJson = async (port: number) => (await fetch(`http://127.0.0.1:${port}/`)).json() as Promise<Answer>;
const answers = (port: number) => vi.waitFor(() => getJson(port), { timeout: 20_000, interval: 200 });
const down = (port: number) => vi.waitFor(async () => expect(await getJson(port).then(() => 'up', () => 'down')).toBe('down'), { timeout: 15_000, interval: 200 });

describe('a program from a release', { timeout: 120_000 }, () => {
  it('runs as a website only with its person\'s consent to exactly that release and file, checked against the release, never by itself', async () => {
    process.env.FAKE_DOCKER_DOWN = '1';
    const github = new PublicGitHub();
    const racePort = await freePort();
    const manifest = { app: 'horses', name: 'Horse race', version: 1, services: [{ port: racePort }], start: { command: ['node', 'server.cjs'], release: { [platformKey()]: ['node', 'server.cjs'] } }, env: [{ name: 'API_KEY', label: 'API key', secret: true, optional: true }] };
    const v1 = { name: `Horses-1.0-${platformKey()}.tar.gz`, bytes: buildArchive('v1.0') };
    github.add('martl/horses', 'v1.0', v1);
    // v1.1 as published, and other bytes under the same name where GitHub hands it out: the download must be refused.
    const v11 = { name: `Horses-1.1-${platformKey()}.tar.gz`, bytes: buildArchive('v1.1') };
    github.add('martl/horses', 'v1.1', { name: v11.name, bytes: buildArchive('v1.1-tampered') });
    const githubPort = await github.serve();

    const martl = person('martl');
    const lena = person('Lena');
    await fetchesFrom(lena, githubPort);
    await martl.createProject({ name: 'Horses' });
    await lena.joinSpace(await martl.invite('Horses'));
    await publishRelease(martl, { project: 'Horses', tag: 'v1.0', repo: 'martl/horses', manifest, files: { [platformKey()]: v1 } });
    await publishRelease(martl, { project: 'Horses', tag: 'v1.1', repo: 'martl/horses', manifest, files: { [platformKey()]: v11 } });
    syncAll([martl, lena]);
    await lena.createProject({ name: 'Party' });
    await lena.addService({ builtin: 'website', spaces: ['Party'] });
    const api = await startApi(lena, 0, { service: (token) => lena.serviceGate(token) });
    lena.runServices({ port: api.port });
    try {
      // The releases, as Lena's Weave sees them: programs for this computer, with the file, its hash and what would run.
      const artifacts = await lena.artifacts('Horses');
      const first = artifacts.find((a) => a.tag === 'v1.0')!;
      const second = artifacts.find((a) => a.tag === 'v1.1')!;
      expect(first).toMatchObject({ kind: 'website', runs: 'program', command: ['node', 'server.cjs'], program: { platform: platformKey(), file: v1.name, sha256: createHash('sha256').update(v1.bytes).digest('hex'), size: v1.bytes.length, command: ['node', 'server.cjs'] } });
      expect(first.program!.allowed).toBeUndefined();
      expect(first.program!.consent).not.toBe(second.program!.consent);
      // As a service, it never runs: only a website its person launched.
      await expect(lena.addService({ artifact: { project: 'Horses', tag: 'v1.0' }, spaces: ['Party'], approve: true })).rejects.toThrow(/approve it first|is a program/);

      // Launched without the consent (approve alone, as an agent could say it): refused, and nothing is fetched.
      await expect(lena.launchWebsite({ project: 'Party', artifact: { project: 'Horses', id: first.id }, approve: true })).rejects.toThrow(/would run on this computer with your rights, and Weave can't contain it. Only you can allow that, in the Weave app/);
      expect(github.delivered).toEqual([]);
      expect(await lena.programConsents()).toEqual([]);

      // With it (the warning accepted in the app): the consent is kept, the file fetched and checked, the program runs in its folder.
      const launched = await lena.launchWebsite({ project: 'Party', artifact: { project: 'Horses', id: first.id }, approve: true, consent: true, settings: { API_KEY: 'k-1' } });
      await lena.serviceReady(launched.name);
      const running = await answers(racePort);
      expect(running).toMatchObject({ version: 'v1.0', service: launched.name, key: 'k-1' });
      expect(running.cwd.replace(/\\/g, '/')).toMatch(/\/artifacts\/[^/]+\/v1\.0\/Horses$/);
      expect(github.delivered).toEqual([v1.name]);
      const consents = await lena.programConsents();
      expect(consents).toMatchObject([{ consent: first.program!.consent, project: { name: 'Horses' }, release: first.id, tag: 'v1.0', name: 'Horse race', file: v1.name, running: 1 }]);
      expect((await lena.artifacts('Horses')).find((a) => a.tag === 'v1.0')!.program!.allowed).toBe(consents[0].allowed);
      // The website says what runs it, for whoever runs it; others see only the release.
      const site = await vi.waitFor(
        async () => {
          const found = (await lena.websites('Party')).find((r) => r.name === 'Horse race');
          expect(found).toBeTruthy();
          return found!;
        },
        { timeout: 30_000, interval: 200 },
      );
      expect(site.program).toEqual({ file: v1.name, sha256: first.program!.sha256, consent: first.program!.consent });
      expect(site.from).toMatchObject({ tag: 'v1.0', name: 'Horse race' });
      syncAll([martl, lena]);
      expect((await martl.websites('Horses')).find((r) => r.id === site.id)?.program).toBeUndefined();

      // The same release again: the consent given stands, no new yes needed; a new version asks again.
      const again = await lena.launchWebsite({ project: 'Party', artifact: { project: 'Horses', id: first.id }, approve: true });
      await expect(lena.launchWebsite({ project: 'Party', artifact: { project: 'Horses', id: second.id }, approve: true })).rejects.toThrow(/Only you can allow that/);
      await lena.removeService(again.name);

      // v1.1: the file GitHub hands out isn't the one the release names. Refused before anything is unpacked, nothing runs.
      const tampered = await lena.launchWebsite({ project: 'Party', artifact: { project: 'Horses', id: second.id }, approve: true, consent: true });
      await lena.serviceReady(tampered.name);
      const site2 = (await lena.services()).find((s) => s.name === 'website')!;
      expect(site2.launching).toMatchObject([{ id: tampered.name, tag: 'v1.1', error: expect.stringMatching(/isn't the one the project published \(SHA-256/) }]);
      expect((await lena.websites('Party')).filter((r) => r.name === 'Horse race')).toHaveLength(1);
      await lena.removeService(tampered.name);

      // Exited by itself (a crash goes the same road): not started again; its website says so until it's stopped or launched again.
      await fetch(`http://127.0.0.1:${racePort}/quit`);
      await down(racePort);
      await vi.waitFor(async () => expect((await lena.services()).find((s) => s.name === 'website')!.launching).toMatchObject([{ id: launched.name, error: expect.stringMatching(/Horse race v1\.0 exited: a program isn't started again by itself/) }]), { timeout: 15_000, interval: 200 });
      await new Promise((r) => setTimeout(r, 1500));
      expect(await getJson(racePort).then(() => 'up', () => 'down')).toBe('down');
      // Both consents stand (v1.1's too: the yes was to the release and its hash, and the file that came wasn't it), nothing runs under them.
      expect((await lena.programConsents()).map((c) => [c.tag, c.running]).sort()).toEqual([['v1.0', 0], ['v1.1', 0]]);
      await lena.removeService(launched.name);

      // Withdrawn: what runs under the consent ends, and it's as if the warning was never accepted.
      const third = await lena.launchWebsite({ project: 'Party', artifact: { project: 'Horses', id: first.id }, approve: true });
      await lena.serviceReady(third.name);
      await answers(racePort);
      await lena.withdrawProgramConsent(first.program!.consent);
      await down(racePort);
      expect((await lena.programConsents()).map((c) => c.tag)).toEqual(['v1.1']);
      expect((await lena.websites('Party')).filter((r) => r.name === 'Horse race')).toEqual([]);
      expect((await lena.services()).map((s) => s.name)).toEqual(['website']);
      await expect(lena.launchWebsite({ project: 'Party', artifact: { project: 'Horses', id: first.id }, approve: true })).rejects.toThrow(/Only you can allow that/);
      await expect(lena.withdrawProgramConsent(first.program!.consent)).rejects.toThrow(/no such consent/);
    } finally {
      await api.close();
      github.close();
    }
  });

  it('does not come back by itself after Weave restarts: its website says so, until launched again', async () => {
    process.env.FAKE_DOCKER_DOWN = '1';
    const github = new PublicGitHub();
    const racePort = await freePort();
    const manifest = { app: 'horses', name: 'Horse race', version: 1, services: [{ port: racePort }], start: { release: { [platformKey()]: ['node', 'server.cjs'] } } };
    const v1 = { name: `Horses-1.0-${platformKey()}.tar.gz`, bytes: buildArchive('v1.0') };
    github.add('martl/horses', 'v1.0', v1);
    const githubPort = await github.serve();
    const home = tempDir('weave-programs-restart-');
    const martl = person('martl');
    let lena = WeaveNode.init('Lena', home);
    await fetchesFrom(lena, githubPort);
    await martl.createProject({ name: 'Horses' });
    await lena.joinSpace(await martl.invite('Horses'));
    await publishRelease(martl, { project: 'Horses', tag: 'v1.0', repo: 'martl/horses', manifest, files: { [platformKey()]: v1 } });
    syncAll([martl, lena]);
    await lena.createProject({ name: 'Party' });
    await lena.addService({ builtin: 'website', spaces: ['Party'] });
    let api = await startApi(lena, 0, { service: (token) => lena.serviceGate(token) });
    lena.runServices({ port: api.port });
    const artifact = (await lena.artifacts('Horses'))[0];
    let launched: string;
    try {
      launched = (await lena.launchWebsite({ project: 'Party', artifact: { project: 'Horses', id: artifact.id }, approve: true, consent: true })).name;
      await lena.serviceReady(launched);
      await answers(racePort);
    } finally {
      await api.close();
      await lena.close();
    }
    await down(racePort);

    // Weave starts again: the website is there, off, saying why; the consent stands, so launching it again is one click.
    lena = WeaveNode.open(home);
    nodes.push(lena);
    lena.wasmSetup.shippedDir = await shippedCheckout();
    lena.wasmSetup.testHosts = { 'api.github.com': githubPort, 'objects.githubusercontent.com': githubPort };
    api = await startApi(lena, 0, { service: (token) => lena.serviceGate(token) });
    lena.runServices({ port: api.port });
    try {
      await new Promise((r) => setTimeout(r, 1500));
      expect(await getJson(racePort).then(() => 'up', () => 'down')).toBe('down');
      const site = (await lena.services()).find((s) => s.name === 'website')!;
      expect(site.launching).toMatchObject([{ id: launched!, tag: 'v1.0', error: expect.stringMatching(/Weave restarted: Horse race v1\.0 is a program, and isn't started again by itself/) }]);
      expect((await lena.programConsents()).map((c) => c.running)).toEqual([0]);
      await lena.removeService(launched!);
      const once = await lena.launchWebsite({ project: 'Party', artifact: { project: 'Horses', id: artifact.id }, approve: true });
      await lena.serviceReady(once.name);
      expect((await answers(racePort)).version).toBe('v1.0');
    } finally {
      await api.close();
      github.close();
    }
  });
});
