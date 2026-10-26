import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { checkManifest } from '@weave/core';
import { startApi } from '../src/api.ts';
import { WeaveNode, type Fetch, closeOpenStores } from '../src/index.ts';
import { imageDigest, imageLocation } from '../src/registry.ts';

/*
 * Apps from a container image (Weave and Docker). The registry and Docker are stand-ins: the registry speaks the
 * distribution API with its bearer-token sign-in, and test/helpers/fake-docker.mjs plays the docker command line.
 */

const dirs: string[] = [];
const tempDir = (prefix: string) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
};
afterAll(() => {
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});
afterEach(() => {
  delete process.env.FAKE_DOCKER_DOWN;
  delete process.env.FAKE_DOCKER_DIR;
  delete process.env.FAKE_DOCKER_PORT;
});

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
  });

const DIGEST = `sha256:${'ab'.repeat(32)}`;

/** GitHub (the release, weave.app.json at its tag) and ghcr.io (the image, behind a pull token). */
function fakes(manifest: unknown, options: { privateImage?: boolean } = {}): Fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });
    if (url.host === 'api.github.com') {
      if (url.pathname === '/repos/martl/gameshow/releases/tags/v1.4') return json(200, { tag_name: 'v1.4', assets: [] });
      if (url.pathname === '/repos/martl/gameshow/contents/weave.app.json') return json(200, { encoding: 'base64', content: Buffer.from(JSON.stringify(manifest)).toString('base64') });
      return json(404, { message: 'Not Found' });
    }
    if (url.host === 'ghcr.io' && url.pathname === '/token') return json(200, { token: url.searchParams.get('scope') === 'repository:martl/gameshow:pull' ? 'anonymous-pull' : 'other' });
    if (url.host === 'ghcr.io' && url.pathname.startsWith('/v2/martl/gameshow/manifests/')) {
      const auth = new Headers(init?.headers).get('authorization');
      if (auth !== 'Bearer anonymous-pull' || options.privateImage)
        return json(401, { errors: [{ code: 'UNAUTHORIZED' }] }, { 'www-authenticate': 'Bearer realm="https://ghcr.io/token",service="ghcr.io",scope="repository:martl/gameshow:pull"' });
      // Released as 1.4 (without the v): Weave tries both.
      if (url.pathname.endsWith('/1.4')) return json(200, { schemaVersion: 2 }, { 'docker-content-digest': DIGEST });
      return json(404, { errors: [{ code: 'MANIFEST_UNKNOWN' }] });
    }
    return json(404, { message: 'Not Found' });
  }) as Fetch;
}

function person(name: string, fetchImpl: Fetch): WeaveNode {
  const node = WeaveNode.init(name, tempDir('weave-container-'));
  node.githubSetup = { clientId: 'Iv1.test', fetch: fetchImpl, sleep: async () => {} };
  node.containerSetup = { fetch: fetchImpl, docker: [process.execPath, join(import.meta.dirname, 'helpers', 'fake-docker.mjs')] };
  return node;
}

const syncAll = (nodes: WeaveNode[]) => {
  for (let round = 0; round < 2; round++) for (const from of nodes) for (const to of nodes) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
};

describe('releases from a container image', { timeout: 60_000 }, () => {
  it('reads start.image: without tag or digest', () => {
    const base = { app: 'gameshow', services: [{ port: 3000 }] };
    expect(checkManifest({ ...base, start: { image: 'ghcr.io/martl/gameshow' } }).manifest?.start?.image).toBe('ghcr.io/martl/gameshow');
    expect(checkManifest({ ...base, start: { image: 'ghcr.io/martl/gameshow:latest' } }).problems.join()).toMatch(/without tag or digest/);
    expect(checkManifest({ ...base, start: { image: 'ghcr.io/martl/gameshow@sha256:00' } }).problems.join()).toMatch(/without tag or digest/);
    expect(checkManifest({ ...base, start: { image: 'Not An Image' } }).problems.join()).toMatch(/isn't an image name/);
    expect(imageLocation('nginx')).toEqual({ host: 'registry-1.docker.io', path: 'library/nginx' });
    expect(imageLocation('martl/gameshow')).toEqual({ host: 'registry-1.docker.io', path: 'martl/gameshow' });
    expect(imageLocation('localhost:5000/game')).toEqual({ host: 'localhost:5000', path: 'game' });
  });

  it('pins the release image by its digest, and runs it sealed off with only its ports and settings', async () => {
    const port = await freePort();
    const manifest = { app: 'gameshow', name: 'Gameshow', services: [{ id: 'show', port }], start: { image: 'ghcr.io/martl/gameshow', command: ['node', 'server.js'] }, env: [{ name: 'SECRET_KEY', label: 'Secret', secret: true }] };
    const fetchImpl = fakes(manifest);
    const martl = person('martl', fetchImpl);
    const lena = person('Lena', fetchImpl);
    await martl.createProject({ name: 'Gameshow' });
    await lena.joinSpace(await martl.invite('Gameshow'));

    // A release with an image and no build files: pinned by digest.
    const released = await martl.releaseApp({ project: 'Gameshow', tag: 'v1.4', repo: 'martl/gameshow' });
    expect(released.install?.image).toEqual({ ref: 'ghcr.io/martl/gameshow', tag: '1.4', digest: DIGEST });
    expect(released.install?.assets).toBeUndefined();
    syncAll([martl, lena]);

    // Lena's computer has Docker: a room of hers runs the release's container, no copy of it needed.
    const dockerDir = tempDir('weave-fake-docker-');
    process.env.FAKE_DOCKER_DIR = dockerDir;
    // On Linux the container shares the host's network (no -p): the stand-in needs to know the app's port.
    process.env.FAKE_DOCKER_PORT = String(port);
    const [artifact] = await lena.artifacts('Gameshow');
    expect(artifact).toMatchObject({ tag: 'v1.4', runs: 'container' });
    const run = artifact.command!.slice(2);
    expect(run.slice(0, 4)).toEqual(['run', '--rm', '--name', expect.stringMatching(/^weave-room-/)]);
    expect(run).toEqual(expect.arrayContaining(['--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '-e', 'SECRET_KEY', '-e', 'WEAVE_API']));
    expect(run.at(-1)).toBe(`ghcr.io/martl/gameshow@${DIGEST}`);
    if (process.platform !== 'linux') expect(run).toEqual(expect.arrayContaining(['-p', `127.0.0.1:${port}:${port}`]));
    else expect(run).toEqual(expect.arrayContaining(['--network', 'host']));

    // Settings by name only: the value never shows in the command.
    const api = await startApi(lena, 0, { service: (token) => lena.serviceGate(token) });
    lena.runServices({ port: api.port });
    await lena.addService({ builtin: 'room', spaces: ['Gameshow'] });
    await expect(lena.openRoom({ project: 'Gameshow', name: 'Show', artifact: { project: 'Gameshow' }, settings: { SECRET_KEY: 's3cret-value' } })).rejects.toThrow(/approve it first/);
    const room = await lena.openRoom({ project: 'Gameshow', name: 'Show', artifact: { project: 'Gameshow' }, settings: { SECRET_KEY: 's3cret-value' }, approve: true });
    expect(JSON.stringify((await lena.services())[0].rooms)).not.toContain('s3cret-value');
    const answer = await vi.waitFor(
      async () => {
        const res = await fetch(`http://127.0.0.1:${port}/`);
        return (await res.json()) as { image: string; env: Record<string, string | null> };
      },
      { timeout: 15_000, interval: 200 },
    );
    expect(answer.image).toBe(`ghcr.io/martl/gameshow@${DIGEST}`);
    expect(answer.env.SECRET_KEY).toBe('s3cret-value');
    expect(answer.env.WEAVE_TOKEN).toBeTruthy();
    expect(answer.env.WEAVE_API).toMatch(process.platform === 'linux' ? /^http:\/\/127\.0\.0\.1:\d+$/ : /^http:\/\/host\.docker\.internal:\d+$/);
    // A container left from before was cleared first; ending the room stops it through Docker.
    expect(readFileSync(join(dockerDir, 'docker.log'), 'utf8')).toMatch(/^rm -f weave-room-/m);
    await lena.endRoom(room.id);
    expect(readFileSync(join(dockerDir, 'docker.log'), 'utf8')).toMatch(/^stop -t 5 weave-room-/m);
    await api.close();

    // Without Docker, and without a release file, there's nothing for a room to run.
    process.env.FAKE_DOCKER_DOWN = '1';
    const kofi = person('Kofi', fetchImpl);
    await kofi.joinSpace(await martl.invite('Gameshow'));
    syncAll([martl, kofi]);
    expect((await kofi.artifacts('Gameshow'))[0].runs).toBeUndefined();
    await kofi.addService({ builtin: 'room', spaces: ['Gameshow'] });
    await expect(kofi.openRoom({ project: 'Gameshow', name: 'Show', artifact: { project: 'Gameshow' }, approve: true })).rejects.toThrow(/no release file for this computer[^]*Docker isn't running here/);
    for (const node of [martl, lena, kofi]) await node.close();
    expect(existsSync(dockerDir)).toBe(true);
  });

  it('says so when the image is private or missing', async () => {
    const fetchImpl = fakes({}, { privateImage: true });
    await expect(imageDigest('ghcr.io/martl/gameshow', ['v1.4', '1.4'], { fetch: fetchImpl })).rejects.toThrow(/is private[^]*public/);
    await expect(imageDigest('ghcr.io/martl/gameshow', ['v9'], { fetch: fakes({}) })).rejects.toThrow(/no image ghcr.io\/martl\/gameshow tagged v9/);
  });
});
