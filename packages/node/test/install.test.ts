import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { guessPlatform, platformKey } from '../src/appinstall.ts';
import { WeaveNode, type Fetch } from '../src/index.ts';

const dirs: string[] = [];
afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));
const tempDir = (prefix: string) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
};

/** A release archive like a CI build makes: one folder with the app in it. */
function buildArchive(): Buffer {
  const dir = tempDir('weave-release-');
  mkdirSync(join(dir, 'Gameshow-1.4'));
  writeFileSync(join(dir, 'Gameshow-1.4', 'start.js'), "console.log('gameshow is up')\n");
  const tar = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
  const run = spawnSync(tar, ['-czf', 'Gameshow.tar.gz', 'Gameshow-1.4'], { cwd: dir });
  if (run.status !== 0) throw new Error(`tar failed: ${run.stderr}`);
  return readFileSync(join(dir, 'Gameshow.tar.gz'));
}

/** GitHub as far as releases go: one release whose file can be swapped to test the check. */
class FakeReleases {
  files = new Map<number, { name: string; bytes: Buffer }>();
  downloads = 0;
  fetch: Fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
    if (url.pathname === '/repos/martl/gameshow/releases/tags/v1.4') return json(200, { tag_name: 'v1.4', assets: [...this.files].map(([id, f]) => ({ id, name: f.name, size: f.bytes.length })) });
    const m = url.pathname.match(/^\/repos\/martl\/gameshow\/releases\/assets\/(\d+)$/);
    const file = m && this.files.get(Number(m[1]));
    if (!file) return json(404, { message: 'Not Found' });
    this.downloads++;
    return new Response(new Uint8Array(file.bytes), { status: 200, headers: { 'content-length': String(file.bytes.length) } });
  }) as Fetch;
}

function person(name: string, github: FakeReleases): WeaveNode {
  const node = WeaveNode.init(name, tempDir('weave-install-'));
  node.githubSetup = { clientId: 'Iv1.test', fetch: github.fetch, sleep: async () => {} };
  return node;
}

const syncAll = (nodes: WeaveNode[]) => {
  for (let round = 0; round < 2; round++) for (const from of nodes) for (const to of nodes) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
};

describe('installing a project app from its release', () => {
  it('downloads the file for this computer, checks it, unpacks it, and can start it', async () => {
    const github = new FakeReleases();
    github.files.set(11, { name: 'Gameshow-1.4-mine.tar.gz', bytes: buildArchive() });
    const martl = person('martl', github);
    const lena = person('Lena', github);
    await martl.createProject({ name: 'Gameshow' });
    await lena.joinSpace(await martl.invite('Gameshow'));
    await martl.publishApp({ project: 'Gameshow', manifest: { app: 'gameshow', name: 'Gameshow', services: [{ port: 7777 }], start: { command: ['node', 'start.js'] }, install: { steps: ['git clone, npm ci, npm run build'] } } });

    // The maintainer points the app at the release; each file is fingerprinted once.
    await expect(martl.releaseApp({ project: 'Gameshow', tag: 'v1.4' })).rejects.toThrow(/which repository/);
    const manifest = await martl.releaseApp({ project: 'Gameshow', tag: 'v1.4', repo: 'martl/gameshow', assets: { [platformKey()]: 'Gameshow-1.4-mine.tar.gz' } });
    expect(manifest.install?.assets?.[platformKey()]).toMatchObject({ file: 'Gameshow-1.4-mine.tar.gz', size: github.files.get(11)!.bytes.length });
    expect(manifest.install?.steps).toEqual(['git clone, npm ci, npm run build']);
    // Publishing weave.app.json again keeps the release files.
    await martl.publishApp({ project: 'Gameshow', manifest: { app: 'gameshow', name: 'Gameshow', services: [{ port: 7777 }], start: { command: ['node', 'start.js'] } } });
    expect((await martl.projectApp('Gameshow'))?.install?.tag).toBe('v1.4');
    syncAll([martl, lena]);

    const before = await lena.appLaunch('Gameshow');
    expect(before.install).toMatchObject({ version: 'v1.4', repo: 'martl/gameshow', asset: { file: 'Gameshow-1.4-mine.tar.gz' } });
    expect(before.install?.installed).toBeUndefined();

    await lena.installApp({ project: 'Gameshow', approve: true });
    const after = await lena.installDone('Gameshow');
    expect(after.install?.error).toBeUndefined();
    expect(after.install?.installed).toBe('v1.4');
    expect(after.folder).toBe(join(lena.home.dir, 'apps', (await lena.spaces('project'))[0].id, 'v1.4', 'Gameshow-1.4'));
    expect(JSON.parse(readFileSync(join(after.folder!, 'weave.app.json'), 'utf8')).app).toBe('gameshow');
    expect(after.approved).toBe(true);

    // It starts without asking again: the install showed the command.
    await lena.launchApp({ project: 'Gameshow' });
    await vi.waitFor(async () => expect((await lena.appLaunch('Gameshow')).log).toContain('gameshow is up'), { timeout: 10_000 });
  });

  it("refuses a file that isn't the one the maintainer published", async () => {
    const github = new FakeReleases();
    github.files.set(11, { name: 'Gameshow-1.4-mine.tar.gz', bytes: buildArchive() });
    const martl = person('martl', github);
    await martl.createProject({ name: 'Gameshow' });
    await martl.publishApp({ project: 'Gameshow', manifest: { app: 'gameshow', name: 'Gameshow', services: [{ port: 7777 }] } });
    await martl.releaseApp({ project: 'Gameshow', tag: 'v1.4', repo: 'martl/gameshow', assets: { [platformKey()]: 'Gameshow-1.4-mine.tar.gz' } });

    // Someone swaps the file on GitHub.
    github.files.set(11, { name: 'Gameshow-1.4-mine.tar.gz', bytes: Buffer.from('not the real thing') });
    await martl.setAppFolder({ project: 'Gameshow', folder: '' });
    await martl.installApp({ project: 'Gameshow' });
    const after = await martl.installDone('Gameshow');
    expect(after.install?.error).toMatch(/isn't the one the project published/);
    expect(after.folder).toBeUndefined();
    expect(existsSync(join(martl.home.dir, 'apps', (await martl.spaces('project'))[0].id, 'v1.4'))).toBe(false);
  });

  it("names the maintainer's own GitHub App, and tells members who sign in through another one", async () => {
    const github = new FakeReleases();
    github.files.set(11, { name: 'Gameshow-1.4-mine.tar.gz', bytes: buildArchive() });
    const martl = person('martl', github);
    const lena = person('Lena', github);
    await martl.createProject({ name: 'Gameshow' });
    await lena.joinSpace(await martl.invite('Gameshow'));
    martl.config = { ...martl.config, githubApp: { clientId: 'Iv1.martl', slug: 'martls-app', name: "martl's app", owner: 'martl' } };
    await martl.publishApp({ project: 'Gameshow', manifest: { app: 'gameshow', name: 'Gameshow', services: [{ port: 7777 }] } });
    const manifest = await martl.releaseApp({ project: 'Gameshow', tag: 'v1.4', repo: 'martl/gameshow', assets: { [platformKey()]: 'Gameshow-1.4-mine.tar.gz' } });
    expect(manifest.install?.app).toBe('martls-app');
    syncAll([martl, lena]);
    expect((await lena.appLaunch('Gameshow')).install?.otherApp).toBe('martls-app');
  });

  it('guesses platforms from file names', () => {
    expect(guessPlatform('Gameshow-1.4-win-x64.zip')).toBe('win32-x64');
    expect(guessPlatform('gameshow_1.4_macos_arm64.tar.gz')).toBe('darwin-arm64');
    expect(guessPlatform('gameshow-linux-amd64.tar.gz')).toBe('linux-x64');
    expect(guessPlatform('gameshow-darwin-x64.zip')).toBe('darwin-x64');
    expect(guessPlatform('Gameshow Setup.exe')).toBe('win32-x64');
    expect(guessPlatform('checksums.txt')).toBeUndefined();
  });
});
