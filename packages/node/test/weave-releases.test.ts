import { randomBytes } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startApi } from '../src/api.ts';
import { closeOpenStores, WeaveNode } from '../src/index.ts';
import { assembleFile, packFolder, storeFiles, WEAVE_PART } from '../src/weavereleases.ts';
import { buildComponent } from './helpers/components.ts';
import { shareBlobs, shippedWeaveReleases } from './helpers/release.ts';

/*
 * Weave releases (packages/shipped/weave-releases): a maintainer releases a folder without GitHub. Their Weave packs
 * what its weave.app.json names, keeps it as encrypted blobs in the project, and the shipped service publishes the
 * release; every member's Weave fetches the blobs itself, puts the file together and checks it against what the
 * maintainer signed before anything runs.
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

const sync = (all: WeaveNode[]) => {
  for (let round = 0; round < 2; round++) for (const from of all) for (const to of all) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
};

let shipped: string;
let bot: string;
beforeAll(async () => {
  shipped = await shippedWeaveReleases();
  bot = await buildComponent(join(import.meta.dirname, 'helpers', 'wasm-bot.js'), 'service');
}, 300_000);

function person(name: string): WeaveNode {
  const node = WeaveNode.init(name, tempDir('weave-weave-releases-'));
  node.wasmSetup.shippedDir = shipped;
  nodes.push(node);
  return node;
}

/** A bot's folder, as its maintainer has it: weave.app.json, its component, and (to make it big) a site with more in it. */
function botFolder(extra?: Record<string, Uint8Array>): string {
  const folder = tempDir('weave-bot-folder-');
  writeFileSync(join(folder, 'weave.app.json'), JSON.stringify({ app: 'bot', name: 'Bot', service: { reads: 'addressed', writes: [], version: '1.0' }, wasm: { component: 'bot.wasm', ...(extra ? { site: 'site' } : {}) }, env: [{ name: 'GREETING', label: 'Greeting', optional: true }] }));
  cpSync(bot, join(folder, 'bot.wasm'));
  if (extra) mkdirSync(join(folder, 'site'));
  for (const [name, bytes] of Object.entries(extra ?? {})) writeFileSync(join(folder, 'site', name), bytes);
  return folder;
}

describe('Weave releases, shipped with Weave', { timeout: 180_000 }, () => {
  it('releases a folder from Weave: a member installs it as a service, fetched from blobs and checked, and it answers', async () => {
    const martl = person('martl');
    const lena = person('Lena');
    await martl.createProject({ name: 'Bots' });
    await lena.joinSpace(await martl.invite('Bots'));
    sync([martl, lena]);
    const martlApi = await startApi(martl, 0, { service: (token) => martl.serviceGate(token) });
    const lenaApi = await startApi(lena, 0, { service: (token) => lena.serviceGate(token) });
    martl.runServices({ port: martlApi.port });
    lena.runServices({ port: lenaApi.port });
    try {
      // Nothing publishes from Weave in the project yet.
      await expect(martl.releaseArtifact({ project: 'Bots', tag: 'dev-1', from: botFolder() })).rejects.toThrow(/has no service that publishes releases from weave/);
      const provider = await martl.addService({ shipped: 'weave-releases', spaces: ['Bots'] });
      expect(provider.contract).toMatchObject({ reads: 'addressed', writes: ['weave.app'], offers: ['artifact.fetch'], sources: ['weave'] });
      await vi.waitFor(async () => expect((await martl.services())[0].running).toBe(true), { timeout: 30_000, interval: 200 });

      const released = await martl.releaseArtifact({ project: 'Bots', tag: 'dev-1', from: botFolder() });
      const project = (await martl.spaces()).find((s) => s.name === 'Bots')!;
      expect(released).toMatchObject({ app: 'bot', name: 'Bot', install: { tag: 'dev-1', source: { provider: 'weave', ref: project.id }, assets: { wasm: { file: 'bot-wasm.tar.gz', sha256: expect.stringMatching(/^[0-9a-f]{64}$/) } } } });
      const asset = released.install!.assets!.wasm;
      expect(asset.parts).toHaveLength(Math.ceil(asset.size! / WEAVE_PART));
      // Its blobs by hash and key, not as references members' Weave would fetch ahead of time.
      expect(JSON.stringify(released)).not.toContain('wblob:');
      // Published in the project, and offered in its chat.
      const [artifact] = await martl.artifacts('Bots');
      expect(artifact).toMatchObject({ tag: 'dev-1', source: { provider: 'weave', ref: project.id } });
      expect((await martl.messages('Bots')).filter((m) => m.announce)).toMatchObject([{ text: 'Bot dev-1 is available' }]);
      // Its releases, as it lists them.
      expect((await martl.artifactReleases({ project: 'Bots', source: project.id })).releases.map((r) => r.tag)).toEqual(['dev-1']);

      // Lena isn't a maintainer: her Weave doesn't release, and the service wouldn't publish for her.
      sync([martl, lena]);
      await expect(lena.releaseArtifact({ project: 'Bots', tag: 'dev-2', from: botFolder() })).rejects.toThrow(/maintainer/);
      await expect(lena.askService({ space: 'Bots', service: provider.did, text: 'publish', action: 'publish', data: { tag: 'dev-2' } })).rejects.toThrow(/only maintainers/);

      // Lena installs it: her Weave fetches its blobs (here: handed over, the nodes aren't connected) and checks them.
      shareBlobs(martl, lena, released);
      const installed = await lena.addService({ artifact: { project: 'Bots' }, spaces: ['Bots'], approve: true, settings: { GREETING: 'Servus' } });
      await lena.serviceReady(installed.name);
      expect((await lena.services()).find((s) => s.name === 'bot')!.artifact).toMatchObject({ installed: true, deliveredBy: 'Weave, from the project', tag: 'dev-1' });
      sync([martl, lena]);
      await vi.waitFor(async () => expect((await martl.servicesIn('Bots')).find((p) => p.name === 'bot')?.origin).toMatchObject({ kind: 'release', checked: 'verified', tag: 'dev-1' }), { timeout: 10_000, interval: 200 });
      await martl.askService({ space: 'Bots', service: 'Lena/bot', text: 'from Weave?' });
      await vi.waitFor(
        async () => {
          sync([martl, lena]);
          expect((await martl.serviceRequests({ space: 'Bots', service: 'Lena/bot' }))[0].results.map((r) => r.text)).toEqual(['Servus from bot (#1): from Weave?']);
        },
        { timeout: 30_000, interval: 300 },
      );

      // A big one: over 2 MB, split into blobs, and put together again on Lena's node.
      const big = await martl.releaseArtifact({ project: 'Bots', tag: 'dev-2', from: botFolder({ 'noise.bin': randomBytes(3 * 1024 * 1024) }) });
      expect(big.install!.assets!.wasm.size).toBeGreaterThan(asset.size! + 2 * 1024 * 1024);
      expect(big.install!.assets!.wasm.parts!.length).toBe(Math.ceil(big.install!.assets!.wasm.size! / WEAVE_PART));
      expect(big.install!.assets!.wasm.parts!.length).toBeGreaterThan(asset.parts!.length);
      sync([martl, lena]);
      shareBlobs(martl, lena, big);
      await lena.setService({ name: 'bot', artifact: { tag: 'dev-2' }, approve: true });
      await lena.serviceReady('bot');
      expect((await lena.services()).find((s) => s.name === 'bot')!.artifact).toMatchObject({ installed: true, tag: 'dev-2' });

      // Over 32 MB in all: refused before anything is kept or published.
      await expect(martl.releaseArtifact({ project: 'Bots', tag: 'dev-3', from: botFolder({ 'huge.bin': randomBytes(33 * 1024 * 1024) }) })).rejects.toThrow(/at most 32 MB/);
      // And the service refuses one that says it's bigger, whoever's Weave asks.
      const asked = await martl.askService({ space: 'Bots', service: provider.did, text: 'publish dev-4', action: 'publish', data: { tag: 'dev-4', manifest: { app: 'bot', name: 'Bot' }, assets: { wasm: { file: 'bot.tar.gz', sha256: big.install!.assets!.wasm.sha256, size: 40 * 1024 * 1024, parts: big.install!.assets!.wasm.parts! } } } });
      await vi.waitFor(async () => expect((await martl.serviceRequests({ space: 'Bots' })).find((r) => r.id === asked.id)?.results[0]?.error).toMatch(/at most 32 MB/), { timeout: 30_000, interval: 200 });
      expect((await martl.artifacts('Bots')).map((a) => a.tag)).toEqual(['dev-2', 'dev-1']);
    } finally {
      await lena.removeService('bot').catch(() => {});
      await martlApi.close();
      await lenaApi.close();
    }
  });

  it('refuses a release whose blobs were tampered with, or put together in another order', async () => {
    const martl = person('martl');
    const lena = person('Lena');
    lena.blobWait = 2_000;
    await martl.createProject({ name: 'Bots' });
    await lena.joinSpace(await martl.invite('Bots'));
    const packed = packFolder(botFolder({ 'noise.bin': randomBytes(3 * 1024 * 1024) }));
    const stored: Uint8Array[] = [];
    const assets = storeFiles(packed.files, (data) => void stored.push(data));
    const project = (await martl.spaces()).find((s) => s.name === 'Bots')!;
    const manifest = { ...packed.manifest, install: { tag: 'v1', source: { provider: 'weave', ref: project.id }, assets } } as never;
    for (const data of stored) martl.blobs.put(data);
    await martl.publish({ kind: 'weave.app', body: manifest, space: 'Bots' });
    sync([martl, lena]);

    // Put together right, it is the file; in another order, it isn't (its SHA-256).
    const { wasm } = assets;
    const get = (hash: string) => Promise.resolve(martl.blobs.get(hash)!);
    expect((await assembleFile(manifest, wasm, get)).length).toBe(wasm.size);
    await expect(assembleFile(manifest, { ...wasm, parts: [...wasm.parts].reverse() }, get)).rejects.toThrow(/isn't the one the project published/);
    await expect(assembleFile(manifest, { ...wasm, size: wasm.size - 1 }, get)).rejects.toThrow(/bigger than its release says/);

    // On Lena's node, a part that isn't what was stored (same name, other bytes) is refused: nothing installs.
    shareBlobs(martl, lena, manifest);
    const part = wasm.parts[1].hash;
    const bytes = lena.blobs.get(part)!;
    bytes[100] ^= 0xff;
    writeFileSync(join(lena.blobs.dir, part), bytes);
    const api = await startApi(lena, 0, { service: (token) => lena.serviceGate(token) });
    lena.runServices({ port: api.port });
    try {
      await lena.addService({ artifact: { project: 'Bots' }, spaces: ['Bots'], approve: true });
      await lena.serviceReady('bot');
      expect((await lena.services())[0].artifact).toMatchObject({ installed: false, error: expect.stringMatching(/a part of bot-wasm\.tar\.gz couldn't be read/) });
      // And one nobody hands over: it says so, rather than installing anything.
      rmSync(join(lena.blobs.dir, part));
      await lena.removeService('bot');
      await lena.addService({ artifact: { project: 'Bots' }, spaces: ['Bots'], approve: true });
      await lena.serviceReady('bot');
      expect((await lena.services())[0].artifact).toMatchObject({ installed: false, error: expect.stringMatching(/couldn't get that file from anyone online/) });
    } finally {
      await lena.removeService('bot').catch(() => {});
      await api.close();
    }
  });
});
