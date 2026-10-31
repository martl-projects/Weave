import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { compareVersions, parseVersion } from '@weave/core';
import { startApi } from '../src/api.ts';
import { platformKey } from '../src/appinstall.ts';
import { WeaveNode, closeOpenStores } from '../src/index.ts';
import { forgetMachinePolicy } from '../src/machine.ts';
import { PublicGitHub, publishRelease, shippedCheckout } from './helpers/releases.ts';

const dirs: string[] = [];
afterAll(() => {
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function person(name: string): WeaveNode {
  const dir = mkdtempSync(join(tmpdir(), 'weave-update-'));
  dirs.push(dir);
  return WeaveNode.init(name, dir);
}

/** Everyone gets everyone's events, as if they had all been online together. */
function syncAll(nodes: WeaveNode[]): void {
  for (let round = 0; round < 2; round++) for (const from of nodes) for (const to of nodes) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
}

/** A GitHub that answers with these releases, or not at all. */
const githubWith = (tags: string[] | 'down') => async (url: string | URL | Request) => {
  if (tags === 'down') throw new Error('offline');
  if (!String(url).includes('/releases')) return new Response('{}', { status: 404 });
  return new Response(JSON.stringify(tags.map((tag) => ({ tag_name: tag, name: tag, published_at: '2026-10-20T10:00:00Z', draft: false, prerelease: true, assets: [] }))), { status: 200 });
};

describe('versions', () => {
  it('reads and orders version numbers', () => {
    expect(parseVersion('Weave v0.3.0')).toEqual({ major: 0, minor: 3, patch: 0 });
    expect(parseVersion('v1.2.10-beta.2')).toEqual({ major: 1, minor: 2, patch: 10, pre: 'beta.2' });
    expect(parseVersion('no version here')).toBeUndefined();
    expect(compareVersions('0.3.0', '0.10.0')).toBeLessThan(0);
    expect(compareVersions('v1.0.0', '1.0.0-rc.1')).toBeGreaterThan(0);
    expect(compareVersions('0.3.0', 'v0.3.0')).toBe(0);
  });
});

describe('update check', () => {
  it("finds the newest release among the project's release posts by maintainers, and GitHub's", async () => {
    const martl = person('martl');
    const lena = person('Lena');
    const project = await martl.createProject({ name: 'Weave' });
    await lena.joinSpace(await martl.invite('Weave'));
    for (const node of [martl, lena]) {
      node.config = { ...node.config, updates: { project: project.id, repo: 'martldennl/Weave' } };
      node.githubSetup = { ...node.githubSetup, fetch: githubWith('down') };
    }

    // Nothing announced yet.
    expect(await lena.updateCheck({ current: '0.3.0' })).toEqual({ current: '0.3.0', newer: false, auto: true });

    await martl.submit({ space: 'Weave', board: 'releases', title: 'Weave v0.3.0', text: 'GitHub and apps', link: 'https://github.com/martldennl/Weave/releases/tag/v0.3.0' });
    await martl.submit({ space: 'Weave', board: 'releases', title: 'Weave v0.4.0', text: '**v2** wire format', link: 'https://github.com/martldennl/Weave/releases/tag/v0.4.0' });
    // Not a maintainer: doesn't count, however high the number.
    await lena.submit({ space: 'Weave', board: 'releases', title: 'Weave v9.9.9', text: 'trust me' });
    syncAll([martl, lena]);

    const found = await lena.updateCheck({ current: '0.3.0' });
    expect(found).toMatchObject({ current: '0.3.0', newer: true, latest: { version: '0.4.0', source: 'weave', url: 'https://github.com/martldennl/Weave/releases/tag/v0.4.0', notes: '**v2** wire format' } });
    expect(found.latest?.post).toMatch(/^weave:post:/);
    // A post alone: only a download link, nothing the app installs by itself.
    expect(found.latest?.install).toBeUndefined();
    expect((await lena.updateCheck({ current: '0.4.0' })).newer).toBe(false);

    // GitHub knows a newer tag than any post: it counts too.
    lena.githubSetup = { ...lena.githubSetup, fetch: githubWith(['v0.4.0', 'v0.4.1', 'not-a-version']) };
    expect(await lena.updateCheck({ current: '0.4.0' })).toMatchObject({ newer: true, latest: { version: '0.4.1', source: 'github', url: 'https://github.com/martldennl/Weave/releases/tag/v0.4.1' } });

    await expect(lena.updateCheck({ current: 'banana' })).rejects.toThrow(/isn't a version/);
    for (const node of [martl, lena]) await node.close();
  });
});

/*
 * Self-update: the desktop app is the Weave project's artifact (weave-desktop, a file per computer). A maintainer
 * releases each version with the installers' SHA-256 in the signed entry; the node fetches the one for this computer
 * like any release file, refuses it unless it matches, and serves the checked file to the app's electron-updater.
 */
describe('self-update', { timeout: 120_000 }, () => {
  it('fetches the installer a maintainer released, checks it, serves it to the app, and refuses a tampered one', async () => {
    const martl = person('martl');
    const lena = person('Lena');
    const project = await martl.createProject({ name: 'Weave' });
    await lena.joinSpace(await martl.invite('Weave'));
    for (const node of [martl, lena]) {
      node.config = { ...node.config, updates: { project: project.id, repo: 'martldennl/Weave', artifact: 'weave-desktop' } };
      node.githubSetup = { ...node.githubSetup, fetch: githubWith('down') };
    }
    const platform = platformKey();
    const installer = { name: `Weave-0.4.0-${platform}.exe`, bytes: Buffer.from('the installer of Weave 0.4.0, as built') };
    const manifest = { app: 'weave-desktop', name: 'Weave', services: [], file: {} };

    // The release post (the notes), and the release as the project's artifact (the files and their SHA-256).
    await martl.submit({ space: 'Weave', board: 'releases', title: 'Weave v0.4.0: installs itself', text: 'Restart to update.', link: 'https://github.com/martldennl/Weave/releases/tag/v0.4.0' });
    await publishRelease(martl, { project: 'Weave', repo: 'martldennl/Weave', tag: 'v0.4.0', manifest, files: { [platform]: installer } });
    // Not a maintainer: her "release" counts for nothing.
    await lena.publish({ kind: 'weave.app', body: { ...manifest, install: { source: { provider: 'github', ref: 'martldennl/Weave' }, tag: 'v9.9.9', fetcher: 'github-checkout', access: 'direct', assets: { [platform]: { file: 'evil.exe', sha256: 'ab'.repeat(32), size: 3 } } } }, space: project.id });
    syncAll([martl, lena]);

    const found = await lena.updateCheck({ current: '0.3.0' });
    expect(found).toMatchObject({ current: '0.3.0', newer: true, auto: true, latest: { version: '0.4.0', source: 'weave', notes: 'Restart to update.', install: { tag: 'v0.4.0', file: installer.name, sha256: createHash('sha256').update(installer.bytes).digest('hex'), size: installer.bytes.length } } });
    expect(found.ready).toBeUndefined();
    expect((await lena.artifactLines('Weave')).map((l) => [l.id, l.kind, l.tag])).toEqual([['weave-desktop', 'file', 'v0.4.0']]);
    await expect(lena.updateFetch({ version: '0.9.9' })).rejects.toThrow(/no release of Weave 0.9.9 for this computer/);

    // GitHub, on this computer: the release's files, as the fetcher Weave ships gets them (nobody added it: Weave's own updates).
    const github = new PublicGitHub().add('martldennl/Weave', 'v0.4.0', installer);
    const port = await github.serve();
    lena.wasmSetup.shippedDir = await shippedCheckout();
    lena.wasmSetup.testHosts = { ...lena.wasmSetup.testHosts, 'api.github.com': port, 'objects.githubusercontent.com': port };
    expect((await lena.fetchers()).map((f) => [f.name, f.added])).toEqual([['github-checkout', false]]);

    const started = await lena.updateFetch({ version: '0.4.0' });
    expect(started).toMatchObject({ version: '0.4.0', state: 'downloading', total: installer.bytes.length });
    await vi.waitFor(async () => expect((await lena.updateState()).state).toBe('ready'), { timeout: 60_000, interval: 100 });
    const ready = (await lena.updateState()).ready!;
    expect(ready).toMatchObject({ version: '0.4.0', file: installer.name, size: installer.bytes.length, sha512: createHash('sha512').update(installer.bytes).digest('base64') });
    expect(readFileSync(ready.path)).toEqual(installer.bytes);
    expect(ready.by).toMatch(/GitHub checkout/);
    expect(github.delivered).toEqual([installer.name]);
    // Asked again: it's here, nothing is fetched twice; the check reports it.
    expect((await lena.updateFetch({ version: '0.4.0' })).state).toBe('ready');
    expect((await lena.updateCheck({ current: '0.3.0' })).ready).toMatchObject({ version: '0.4.0' });
    expect(await lena.updateReady({ version: '0.4.0' })).toMatchObject({ version: '0.4.0' });
    expect(await lena.updateReady({ version: '0.3.9' })).toBeNull();

    // The daemon serves it to the app's electron-updater: the feed as electron-builder would write it, and the file.
    const api = await startApi(lena, 0);
    try {
      const get = (path: string, token = api.token) => fetch(`http://127.0.0.1:${api.port}/v1/update/0.4.0/${path}`, { headers: { authorization: `Bearer ${token}` } });
      const feed = await (await get('latest.yml')).text();
      expect(feed).toContain('version: 0.4.0\n');
      expect(feed).toContain(`  - url: '${installer.name}'\n    sha512: ${ready.sha512}\n    size: ${installer.bytes.length}\n`);
      expect((await get('latest-mac.yml')).status).toBe(200);
      const file = await get(installer.name);
      expect(file.headers.get('content-length')).toBe(String(installer.bytes.length));
      expect(Buffer.from(await file.arrayBuffer())).toEqual(installer.bytes);
      expect((await get('other.exe')).status).toBe(404);
      expect((await get('latest.yml', 'wrong')).status).toBe(401);
      expect((await fetch(`http://127.0.0.1:${api.port}/v1/update/0.3.9/latest.yml`, { headers: { authorization: `Bearer ${api.token}` } })).status).toBe(404);
    } finally {
      await api.close();
    }

    // A newer release whose file on GitHub isn't what the maintainer fingerprinted: refused, gone, said plainly. The good one stays.
    const genuine = { name: `Weave-0.5.0-${platform}.exe`, bytes: Buffer.from('Weave 0.5.0 as the maintainer built it') };
    await publishRelease(martl, { project: 'Weave', repo: 'martldennl/Weave', tag: 'v0.5.0', manifest, files: { [platform]: genuine } });
    github.add('martldennl/Weave', 'v0.5.0', { name: genuine.name, bytes: Buffer.from('Weave 0.5.0 as somebody swapped it') });
    syncAll([martl, lena]);
    expect((await lena.updateCheck({ current: '0.3.0' })).latest).toMatchObject({ version: '0.5.0', install: { file: genuine.name } });
    await lena.updateFetch({ version: '0.5.0' });
    await vi.waitFor(async () => expect((await lena.updateState()).state).toBe('failed'), { timeout: 60_000, interval: 100 });
    expect((await lena.updateState()).error).toMatch(/isn't the one the project published \(SHA-256 .*, expected .*\): not installed/);
    expect(await lena.updateReady({ version: '0.5.0' })).toBeNull();
    expect(existsSync(join(lena.home.dir, 'updates', '0.5.0'))).toBe(false);
    expect(await lena.updateReady({ version: '0.4.0' })).toMatchObject({ version: '0.4.0' });

    // Running 0.4.0 now: its download is of no use anymore.
    expect((await lena.updateCheck({ current: '0.4.0' })).ready).toBeUndefined();
    expect(await lena.updateReady({ version: '0.4.0' })).toBeNull();

    // The setting: say so, don't download. Managed Updates=false: nothing at all.
    expect(await lena.updateSettings({ auto: false })).toEqual({ auto: false });
    expect((await lena.updateCheck({ current: '0.3.0' })).auto).toBe(false);
    expect(await lena.updateSettings({ auto: true })).toEqual({ auto: true });
    const policy = join(lena.home.dir, 'policy.json');
    writeFileSync(policy, JSON.stringify({ updates: false }));
    process.env.WEAVE_POLICY = policy;
    forgetMachinePolicy();
    try {
      expect(await lena.updateCheck({ current: '0.3.0' })).toEqual({ current: '0.3.0' });
      await expect(lena.updateFetch({ version: '0.5.0' })).rejects.toThrow(/managed settings/);
    } finally {
      delete process.env.WEAVE_POLICY;
      forgetMachinePolicy();
    }

    github.close();
    for (const node of [martl, lena]) await node.close();
  });
});
