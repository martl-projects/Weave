import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { checkManifest, checkServiceLabel, SERVICE_LABEL } from '@weave/core';
import { startApi } from '../src/api.ts';
import { WeaveNode, type Fetch, closeOpenStores } from '../src/index.ts';
import { publishRelease } from './helpers/releases.ts';
import { imageDigest, imageLocation } from '../src/registry.ts';
import { registry } from './helpers/registry.ts';

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

/**
 * The docker stand-in, told where to write down what it did and which port the app listens on. Weave starts
 * containers with nothing of its own environment (only PATH and the service's settings), so that goes into a
 * wrapper script, not the environment: on Linux the container shares the host's network (no -p to read the port from).
 */
function fakeDocker(node: WeaveNode, dir: string, port: number): void {
  const wrapper = join(dir, 'docker.mjs');
  const env = { FAKE_DOCKER_DIR: dir, FAKE_DOCKER_PORT: String(port) };
  writeFileSync(wrapper, `Object.assign(process.env, ${JSON.stringify(env)});
await import(${JSON.stringify(pathToFileURL(join(import.meta.dirname, 'helpers', 'fake-docker.mjs')).href)});
`);
  node.containerSetup = { ...node.containerSetup, docker: [process.execPath, wrapper] };
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

    // A release with an image and no build files: pinned by digest (as GitHub releases pins it, publishing).
    const released = await publishRelease(martl, { project: 'Gameshow', tag: 'v1.4', repo: 'martl/gameshow', manifest: { ...manifest, install: { image: { ref: 'ghcr.io/martl/gameshow', tag: '1.4', digest: DIGEST } } } });
    expect(released.install?.image).toEqual({ ref: 'ghcr.io/martl/gameshow', tag: '1.4', digest: DIGEST });
    expect(released.install?.assets).toBeUndefined();
    syncAll([martl, lena]);

    // Lena's computer has Docker: installed as a service, the release runs as its container, no copy of it needed.
    const dockerDir = tempDir('weave-fake-docker-');
    fakeDocker(lena, dockerDir, port);
    const [artifact] = await lena.artifacts('Gameshow');
    expect(artifact).toMatchObject({ tag: 'v1.4', runs: 'container' });
    const run = artifact.command!.slice(2);
    expect(run.slice(0, 4)).toEqual(['run', '--rm', '--name', 'weave-service-gameshow']);
    expect(run).toEqual(expect.arrayContaining(['--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '-e', 'SECRET_KEY', '-e', 'WEAVE_API']));
    expect(run.at(-1)).toBe(`ghcr.io/martl/gameshow@${DIGEST}`);
    if (process.platform !== 'linux') expect(run).toEqual(expect.arrayContaining(['-p', `127.0.0.1:${port}:${port}`]));
    else expect(run).toEqual(expect.arrayContaining(['--network', 'host']));

    // Settings by name only: the value never shows in the command.
    const api = await startApi(lena, 0, { service: (token) => lena.serviceGate(token) });
    lena.runServices({ port: api.port });
    await lena.addService({ builtin: 'website', spaces: ['Gameshow'] });
    await expect(lena.addService({ artifact: { project: 'Gameshow' }, spaces: ['Gameshow'], settings: { SECRET_KEY: 's3cret-value' } })).rejects.toThrow(/approve it first/);
    await lena.addService({ artifact: { project: 'Gameshow' }, spaces: ['Gameshow'], settings: { SECRET_KEY: 's3cret-value' }, approve: true });
    expect(JSON.stringify(await lena.services())).not.toContain('s3cret-value');
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
    // It serves its web page as a website of Gameshow.
    await vi.waitFor(async () => expect((await lena.websites('Gameshow')).map((r) => r.name)).toContain(released.name), { timeout: 10_000, interval: 200 });
    // A container left from before was cleared first; stopping the service stops it through Docker, and its website ends.
    expect(readFileSync(join(dockerDir, 'docker.log'), 'utf8')).toMatch(/^rm -f weave-service-gameshow/m);
    await lena.setService({ name: 'gameshow', enabled: false });
    expect(readFileSync(join(dockerDir, 'docker.log'), 'utf8')).toMatch(/^stop -t 5 weave-service-gameshow/m);
    expect((await lena.websites('Gameshow')).filter((r) => r.open)).toEqual([]);
    await api.close();

    // Without Docker, and without a release file, there's nothing to run.
    process.env.FAKE_DOCKER_DOWN = '1';
    const kofi = person('Kofi', fetchImpl);
    await kofi.joinSpace(await martl.invite('Gameshow'));
    syncAll([martl, kofi]);
    expect((await kofi.artifacts('Gameshow'))[0].runs).toBeUndefined();
    await expect(kofi.addService({ artifact: { project: 'Gameshow' }, spaces: ['Gameshow'], approve: true })).rejects.toThrow(/no release file for this computer[^]*Docker isn't running here/);
    for (const node of [martl, lena, kofi]) await node.close();
    expect(existsSync(dockerDir)).toBe(true);
  });

  it('says so when the image is private or missing', async () => {
    const fetchImpl = fakes({}, { privateImage: true });
    await expect(imageDigest('ghcr.io/martl/gameshow', ['v1.4', '1.4'], { fetch: fetchImpl })).rejects.toThrow(/is private[^]*public/);
    await expect(imageDigest('ghcr.io/martl/gameshow', ['v9'], { fetch: fakes({}) })).rejects.toThrow(/no image ghcr.io\/martl\/gameshow tagged v9/);
  });
});

describe('Weave services: images carrying their manifest', { timeout: 60_000 }, () => {
  it('releases one by its image, reads its manifest from the image at its digest, and runs it in the sandbox only', async () => {
    const port = await freePort();
    const label = { app: 'quizbot', name: 'Quiz bot', services: [{ port }], service: { reads: 'addressed', writes: [], version: '1.0' }, env: [{ name: 'QUIZ_KEY', label: 'Quiz key', secret: true, optional: true }] };
    const fetchImpl = registry({ 'quizbot:1.0': { labels: { [SERVICE_LABEL]: JSON.stringify(label) } }, 'quizbot:plain': {} });
    const martl = person('martl', fetchImpl);
    const lena = person('Lena', fetchImpl);
    await martl.createProject({ name: 'Quiz' });
    await lena.joinSpace(await martl.invite('Quiz'));

    // The label has to be there, and say what the service is.
    expect(checkServiceLabel(JSON.stringify({ ...label, start: { command: ['x'] } })).warnings.join()).toMatch(/"start" in the label are ignored/);
    expect(checkServiceLabel(JSON.stringify({ app: 'quizbot', name: 'Quiz bot' })).problems.join()).toMatch(/says what it does/);
    await expect(martl.releaseService({ project: 'Quiz', image: 'ghcr.io/martl/quizbot' })).rejects.toThrow(/its name and tag/);
    await expect(martl.releaseService({ project: 'Quiz', image: 'ghcr.io/martl/quizbot:plain' })).rejects.toThrow(/isn't a Weave service: the image has no "dev.weave.service" label/);
    // A registry serving something else than the digest says is caught.
    const mallory = person('Mallory', registry({ 'quizbot:1.0': { labels: { [SERVICE_LABEL]: JSON.stringify(label) } } }, { tamper: true }));
    await mallory.createProject({ name: 'Quiz' });
    await expect(mallory.releaseService({ project: 'Quiz', image: 'ghcr.io/martl/quizbot:1.0' })).rejects.toThrow(/served something else than sha256:/);

    const released = await martl.releaseService({ project: 'Quiz', image: 'ghcr.io/martl/quizbot:1.0' });
    expect(released).toMatchObject({ app: 'quizbot', name: 'Quiz bot', service: { reads: 'addressed' }, install: { tag: '1.0', image: { ref: 'ghcr.io/martl/quizbot', tag: '1.0', packaged: true } } });
    expect(released.install?.image?.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    syncAll([martl, lena]);

    // Lena's computer has Docker: it runs read-only, limited, with a volume of its own, by its digest.
    const dockerDir = tempDir('weave-fake-docker-');
    fakeDocker(lena, dockerDir, port);
    const [artifact] = await lena.artifacts('Quiz');
    expect(artifact).toMatchObject({ tag: '1.0', packaged: true, runs: 'container', applet: { reads: 'addressed' } });
    const run = artifact.command!.slice(2);
    expect(run).toEqual(expect.arrayContaining(['--read-only', '--memory', '512m', '--pids-limit', '256', '-v', 'weave-service-quizbot:/data', '--cap-drop', 'ALL']));
    expect(run.at(-1)).toBe(`ghcr.io/martl/quizbot@${released.install!.image!.digest}`);

    const api = await startApi(lena, 0, { service: (token) => lena.serviceGate(token) });
    lena.runServices({ port: api.port });
    try {
      await lena.addService({ builtin: 'website', spaces: ['Quiz'] });
      await expect(lena.addService({ artifact: { project: 'Quiz' }, spaces: ['Quiz'] })).rejects.toThrow(/approve it first: Weave would run "[^"]*--read-only[^"]*" from Quiz bot 1\.0/);
      const quiz = await lena.addService({ artifact: { project: 'Quiz' }, spaces: ['Quiz'], approve: true });
      // Its contract, and it serves its web page: both from the image.
      expect(quiz).toMatchObject({ name: 'quizbot', contract: { reads: 'addressed', website: true } });
      await vi.waitFor(async () => expect((await lena.websites('Quiz')).map((r) => r.name)).toContain('Quiz bot'), { timeout: 10_000, interval: 200 });
      // The container answers on its port (the stand-in for Docker serves it).
      expect(await vi.waitFor(async () => ((await (await fetch(`http://127.0.0.1:${port}/`)).json()) as { image: string }).image, { timeout: 15_000, interval: 200 })).toBe(`ghcr.io/martl/quizbot@${released.install!.image!.digest}`);
      await lena.removeService('quizbot');
      expect(readFileSync(join(dockerDir, 'docker.log'), 'utf8')).toMatch(/^stop -t 5 weave-service-quizbot/m);
    } finally {
      await api.close();
    }

    // Without Docker it doesn't run, and says why.
    process.env.FAKE_DOCKER_DOWN = '1';
    const kofi = person('Kofi', fetchImpl);
    await kofi.joinSpace(await martl.invite('Quiz'));
    syncAll([martl, kofi]);
    await expect(kofi.addService({ artifact: { project: 'Quiz' }, spaces: ['Quiz'], approve: true })).rejects.toThrow(/Quiz bot is a Weave service: it runs in a container, and Docker isn't running here/);
    for (const node of [martl, lena, kofi, mallory]) await node.close();
  });
});
