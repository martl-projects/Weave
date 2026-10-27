import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SERVICE_LABEL } from '@weave/core';
import { startApi } from '../src/api.ts';
import { closeOpenStores, WeaveNode, type Fetch } from '../src/index.ts';
import { untar } from '../src/untar.ts';
import { buildComponent } from './helpers/components.ts';
import { registry } from './helpers/registry.ts';

/*
 * WebAssembly services as releases (W3): an OCI image for wasi/wasm, its manifest in its label, released and listed
 * like any Weave service. Installing it needs no Docker: Weave pulls the image itself (each layer checked against
 * its digest, unpacked strictly) and runs the component, serving its website.
 */

const dirs: string[] = [];
const nodes: WeaveNode[] = [];
const tempDir = (prefix: string) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
};
afterAll(async () => {
  for (const node of nodes) await node.close().catch(() => {});
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});
afterEach(() => {
  delete process.env.FAKE_DOCKER_DOWN;
});

/** The image's one layer: the game's component and its site, as a gzipped tar (made by tar, as builders do). */
let layer: Uint8Array;
beforeAll(async () => {
  const component = await buildComponent(join(import.meta.dirname, 'helpers', 'wasm-game.js'), 'website');
  const dir = tempDir('weave-wasm-image-');
  cpSync(component, join(dir, 'counter.wasm'));
  cpSync(join(import.meta.dirname, 'helpers', 'wasm-site'), join(dir, 'site'), { recursive: true });
  const tar = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
  const out = join(tempDir('weave-wasm-layer-'), 'layer.tar.gz');
  const run = spawnSync(tar, ['-czf', out, '-C', dir, '.']);
  if (run.status !== 0) throw new Error(`tar failed: ${run.stderr}`);
  layer = readFileSync(out);
}, 180_000);

function person(name: string, fetchImpl: Fetch): WeaveNode {
  const node = WeaveNode.init(name, tempDir('weave-wasm-release-'));
  node.containerSetup = { fetch: fetchImpl, docker: [process.execPath, join(import.meta.dirname, 'helpers', 'fake-docker.mjs')] };
  nodes.push(node);
  return node;
}

const sync = (all: WeaveNode[]) => {
  for (let round = 0; round < 2; round++) for (const from of all) for (const to of all) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
};

/** A tar archive by hand: what a layer could hold, including what it shouldn't. */
function tarOf(entries: Array<{ name: string; body?: string; type?: string }>): Buffer {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const body = Buffer.from(entry.body ?? '');
    const header = Buffer.alloc(512);
    header.write(entry.name, 0, 100);
    header.write('0000644\0', 100);
    header.write(`${body.length.toString(8).padStart(11, '0')}\0`, 124);
    header.write(entry.type ?? '0', 156);
    header.write('ustar\0', 257);
    blocks.push(header, body, Buffer.alloc((512 - (body.length % 512)) % 512));
  }
  return Buffer.concat([...blocks, Buffer.alloc(1024)]);
}

describe('WebAssembly services as releases', { timeout: 120_000 }, () => {
  it('unpacks an image layer strictly: inside its folder, files and folders only', () => {
    const into = tempDir('weave-untar-');
    untar(tarOf([{ name: './service.wasm', body: 'wasm' }, { name: '../outside.txt', body: 'escape' }, { name: 'site/../../also-outside.txt', body: 'escape' }, { name: 'link', type: '2' }, { name: 'site/.wh.gone' }, { name: 'site/index.html', body: '<h1>hi</h1>' }]), into);
    expect(readFileSync(join(into, 'service.wasm'), 'utf8')).toBe('wasm');
    expect(readFileSync(join(into, 'site', 'index.html'), 'utf8')).toBe('<h1>hi</h1>');
    expect(existsSync(join(into, '..', 'outside.txt'))).toBe(false);
    expect(existsSync(join(into, 'link'))).toBe(false);
    expect(existsSync(join(into, 'site', '.wh.gone'))).toBe(false);
    expect(() => untar(tarOf([{ name: 'big', body: 'x'.repeat(2000) }]), tempDir('weave-untar-'), 1000)).toThrow(/more than/);
    expect(() => untar(gzipSync(Buffer.from('not a tar')), tempDir('weave-untar-'))).not.toThrow();
  });

  it('is released from its image, listed, and installed without Docker: Weave pulls it and serves its website', async () => {
    const label = { app: 'counter', name: 'Counter', service: { reads: 'nothing', writes: [], website: true, version: '1.0' }, wasm: { component: 'counter.wasm', site: 'site' } };
    const fetchImpl = registry({ 'counter:1.0': { labels: { [SERVICE_LABEL]: JSON.stringify(label) }, wasm: layer } });
    const martl = person('martl', fetchImpl);
    const ola = person('Ola', fetchImpl);
    await martl.createProject({ name: 'Games' });
    const released = await martl.releaseService({ project: 'Games', image: 'ghcr.io/martl/counter:1.0' });
    expect(released).toMatchObject({ app: 'counter', wasm: { component: 'counter.wasm', site: 'site' }, install: { image: { packaged: true } } });
    await martl.createCommunity({ name: 'Market' });
    await martl.listInCatalog({ catalog: 'Market', artifact: { project: 'Games' } });
    await ola.joinSpace(await martl.invite('Market'));
    sync([martl, ola]);

    // Ola's computer has no Docker: it runs anyway, in Weave.
    process.env.FAKE_DOCKER_DOWN = '1';
    const preview = await ola.catalogArtifact({ catalog: 'Market', app: 'counter' });
    expect(preview).toMatchObject({ runs: 'wasm', command: ['counter.wasm (WebAssembly, in Weave)'], website: true });

    await ola.createProject({ name: 'Club' });
    const api = await startApi(ola, 0, { service: (token) => ola.serviceGate(token) });
    ola.runServices({ port: api.port });
    try {
      await ola.addService({ builtin: 'website', spaces: ['Club'] });
      await expect(ola.addService({ from: { catalog: 'Market', app: 'counter' }, spaces: ['Club'] })).rejects.toThrow(/approve it first: Weave would run "counter\.wasm \(WebAssembly, in Weave\)" from Counter 1\.0/);
      const counter = await ola.addService({ from: { catalog: 'Market', app: 'counter' }, spaces: ['Club'], approve: true });
      expect(counter).toMatchObject({ contract: { reads: 'nothing', website: true } });
      await ola.serviceReady('counter');
      expect((await ola.services()).find((s) => s.name === 'counter')!.artifact).toMatchObject({ installed: true, deliveredBy: 'its image, ghcr.io' });

      // Its website, in Ola's project: the page from the image's site folder, and the game.
      const hosted = await vi.waitFor(
        async () => {
          const found = (await ola.websites('Club')).find((r) => r.name === 'Counter' && r.url);
          expect(found).toBeTruthy();
          return found!;
        },
        { timeout: 30_000, interval: 200 },
      );
      const port = Number(new URL(hosted.url!).port);
      expect(await (await fetch(`http://127.0.0.1:${port}/`)).text()).toContain('<h1>Counter</h1>');
      const socket = new WebSocket(`ws://127.0.0.1:${port}/weave/socket`);
      const first = await new Promise<Record<string, unknown>>((resolve) => socket.addEventListener('message', (e) => resolve(JSON.parse(String(e.data)) as Record<string, unknown>), { once: true }));
      expect(first).toEqual({ hello: 'Ola', host: true, member: true, count: 0 });
      socket.close();
      // Nothing went through Docker.
      expect(existsSync(join(ola.home.dir, 'services', 'counter', 'artifacts'))).toBe(true);
    } finally {
      await ola.removeService('counter').catch(() => {});
      await api.close();
    }
  });

  it('is installed from a GitHub release file for wasm too: fingerprinted, fetched, and run in Weave', async () => {
    // The bot's component in a release archive, and GitHub as far as releases go.
    const component = await buildComponent(join(import.meta.dirname, 'helpers', 'wasm-bot.js'), 'service');
    const dir = tempDir('weave-wasm-archive-');
    mkdirSync(join(dir, 'Bot'));
    cpSync(component, join(dir, 'Bot', 'bot.wasm'));
    const tar = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
    if (spawnSync(tar, ['-czf', 'Bot-wasm.tar.gz', 'Bot'], { cwd: dir }).status !== 0) throw new Error('tar failed');
    const archive = readFileSync(join(dir, 'Bot-wasm.tar.gz'));
    const manifest = { app: 'bot', name: 'Bot', service: { reads: 'addressed', writes: [], version: '1.0' }, wasm: { component: 'bot.wasm' } };
    const github = (async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
      if (url.pathname === '/repos/martl/bot/releases/tags/v1.0') return json({ tag_name: 'v1.0', assets: [{ id: 5, name: 'Bot-wasm.tar.gz', size: archive.length }] });
      if (url.pathname === '/repos/martl/bot/contents/weave.app.json') return json({ encoding: 'base64', content: Buffer.from(JSON.stringify(manifest)).toString('base64') });
      if (url.pathname === '/repos/martl/bot/releases/assets/5') return new Response(new Uint8Array(archive), { status: 200, headers: { 'content-length': String(archive.length) } });
      return new Response('{"message":"Not Found"}', { status: 404 });
    }) as Fetch;
    const martl = person('martl', registry({}));
    const lena = person('Lena', registry({}));
    for (const node of [martl, lena]) node.githubSetup = { clientId: 'Iv1.test', fetch: github, sleep: async () => {} };
    await martl.createProject({ name: 'Bots' });
    await lena.joinSpace(await martl.invite('Bots'));
    const released = await martl.releaseApp({ project: 'Bots', tag: 'v1.0', repo: 'martl/bot', assets: { wasm: 'Bot-wasm.tar.gz' } });
    expect(released.install?.assets?.wasm).toMatchObject({ file: 'Bot-wasm.tar.gz', sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    sync([martl, lena]);

    process.env.FAKE_DOCKER_DOWN = '1';
    const api = await startApi(lena, 0, { service: (token) => lena.serviceGate(token) });
    lena.runServices({ port: api.port });
    try {
      await lena.addService({ artifact: { project: 'Bots' }, spaces: ['Bots'], approve: true, settings: {} });
      await lena.serviceReady('bot');
      expect((await lena.services())[0]).toMatchObject({ name: 'bot', artifact: { installed: true } });
      sync([martl, lena]);
      await martl.askService({ space: 'Bots', service: 'Lena/bot', text: 'from a release file?' });
      await vi.waitFor(
        async () => {
          sync([martl, lena]);
          expect((await martl.serviceRequests({ space: 'Bots' }))[0].results.map((r) => r.text)).toEqual(['hi from bot (#1): from a release file?']);
        },
        { timeout: 30_000, interval: 300 },
      );
    } finally {
      await lena.removeService('bot').catch(() => {});
      await api.close();
    }
  });
});
