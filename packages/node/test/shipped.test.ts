import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startApi } from '../src/api.ts';
import { WeaveNode, closeOpenStores } from '../src/index.ts';
import { digestOf } from '../src/shipped.ts';
import { readSecretJson } from '../src/vault.ts';
import { buildComponent } from './helpers/components.ts';

/*
 * Services Weave ships: a component next to Weave, known by its digest. It runs only as exactly that file, and
 * every member's Weave can tell whether a service claims exactly what their own Weave ships.
 */

const dirs: string[] = [];
const nodes: WeaveNode[] = [];
afterAll(async () => {
  for (const node of nodes) await node.close().catch(() => {});
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});
const temp = (prefix: string) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
};

function person(name: string, shippedDir: string): WeaveNode {
  const node = WeaveNode.init(name, temp('weave-shipped-'));
  node.wasmSetup.shippedDir = shippedDir;
  nodes.push(node);
  return node;
}

const sync = (all: WeaveNode[]) => {
  for (let round = 0; round < 2; round++) for (const from of all) for (const to of all) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
};

const MANIFEST = {
  app: 'ticker',
  name: 'Ticker',
  service: { reads: 'addressed', writes: [], version: '1.0' },
  wasm: { component: 'ticker.wasm', panel: 'panel', panels: [{ name: 'overview', title: 'Overview', who: 'members', page: 'index.html' }, { name: 'admin', title: 'Admin', who: 'maintainers', page: 'admin.html' }] },
  env: [{ name: 'KEY', label: 'Signing key', signing: true, optional: true }],
};

/** A folder of shipped services, as Weave's build makes it. */
function shippedFolder(component: string): string {
  const dir = temp('weave-shipped-dir-');
  copyFileSync(component, join(dir, 'ticker.wasm'));
  mkdirSync(join(dir, 'ticker-panel'));
  writeFileSync(join(dir, 'ticker-panel', 'index.html'), '<h1>Overview</h1>');
  writeFileSync(join(dir, 'ticker-panel', 'admin.html'), '<h1>Admin</h1>');
  writeFileSync(join(dir, 'shipped.json'), JSON.stringify({ ticker: { component: 'ticker.wasm', digest: digestOf(component), manifest: MANIFEST, panel: 'ticker-panel' } }));
  return dir;
}

let component: string;
let other: string;
beforeAll(async () => {
  component = await buildComponent(join(import.meta.dirname, 'helpers', 'wasm-ticker.js'), 'service');
  other = await buildComponent(join(import.meta.dirname, 'helpers', 'wasm-bot.js'), 'service');
}, 180_000);

describe('services Weave ships', { timeout: 120_000 }, () => {
  it('run only as the file Weave ships, and others can tell', async () => {
    const mine = shippedFolder(component);
    const martl = person('martl', mine);
    const lena = person('Lena', shippedFolder(component));
    const kofi = person('Kofi', shippedFolder(other));
    const all = [martl, lena, kofi];
    await martl.createProject({ name: 'Weave' });
    await lena.joinSpace(await martl.invite('Weave'));
    await kofi.joinSpace(await martl.invite('Weave'));
    sync(all);
    const api = await startApi(martl, 0, { service: (token) => martl.serviceGate(token) });
    martl.runServices({ port: api.port });
    try {
      await expect(martl.addService({ shipped: 'nothing', spaces: ['Weave'] })).rejects.toThrow(/ships no service named nothing \(it ships ticker\)/);
      const added = await martl.addService({ shipped: 'ticker', spaces: ['Weave'] });
      expect(added).toMatchObject({ name: 'ticker', contract: { reads: 'addressed' } });
      await vi.waitFor(async () => expect((await martl.services())[0].running).toBe(true), { timeout: 30_000, interval: 200 });
      sync(all);

      // Lena's Weave ships the same component: verified. Kofi's ships another under that name: not the same.
      expect((await lena.servicesIn('Weave'))[0]).toMatchObject({ name: 'ticker', origin: { kind: 'shipped', name: 'ticker', checked: 'verified' }, settings: [{ name: 'KEY', signing: true }] });
      expect((await kofi.servicesIn('Weave'))[0].origin).toEqual({ kind: 'shipped', name: 'ticker', checked: 'other' });

      // Its panels: its own pages, each for whoever may see it, served from each member's own Weave.
      expect((await lena.servicePanels({ space: 'Weave', service: added.did })).map((p) => [p.name, p.who, p.mine])).toEqual([['overview', 'members', true], ['admin', 'maintainers', false]]);
      expect((await martl.servicePanels({ space: 'Weave', service: added.did })).map((p) => p.mine)).toEqual([true, true]);
      expect(await kofi.servicePanels({ space: 'Weave', service: added.did })).toEqual([]);
      const page = await lena.lensFile({ release: 'shipped-ticker', path: 'index.html' });
      expect([page.type, Buffer.from(page.data, 'base64').toString()]).toEqual(['text/html; charset=utf-8', '<h1>Overview</h1>']);
      await expect(lena.lensFile({ release: 'shipped-ticker', path: '../shipped.json' })).rejects.toThrow(/not in ticker's view/);

      // Changed on disk: it doesn't start again, and says why.
      await martl.setService({ name: 'ticker', enabled: false });
      copyFileSync(other, join(mine, 'ticker.wasm'));
      await martl.setService({ name: 'ticker', enabled: true });
      await new Promise((r) => setTimeout(r, 1500));
      const after = (await martl.services())[0];
      expect(after.running).toBe(false);
      expect(JSON.stringify(after)).toMatch(/isn't what this Weave ships/);

      // A new build that asks for no more than was approved (an action more): its contract as it ships. One that asks
      // for more: it keeps what was approved.
      copyFileSync(component, join(mine, 'ticker.wasm'));
      const ship = (service: Record<string, unknown>) => {
        const listed = JSON.parse(readFileSync(join(mine, 'shipped.json'), 'utf8')) as Record<string, { manifest: Record<string, unknown> }>;
        listed.ticker.manifest = { ...listed.ticker.manifest, service };
        writeFileSync(join(mine, 'shipped.json'), JSON.stringify(listed));
      };
      const restart = async () => {
        await martl.setService({ name: 'ticker', enabled: false });
        await martl.setService({ name: 'ticker', enabled: true });
      };
      const ticker = async () => (await martl.services()).find((s) => s.name === 'ticker')!;
      ship({ reads: 'addressed', writes: [], actions: [{ name: 'hello', label: 'Say hello', who: 'members' }], version: '1.0' });
      await restart();
      await vi.waitFor(async () => expect((await ticker()).contract.actions?.map((a) => a.name)).toEqual(['hello']), { timeout: 10_000, interval: 200 });
      ship({ reads: 'addressed', writes: ['weave.post'], actions: [], version: '1.0' });
      await restart();
      await new Promise((r) => setTimeout(r, 1500));
      expect((await ticker()).contract).toMatchObject({ writes: [], actions: [{ name: 'hello' }] });

      // Code from others serves only its own port: never another of this computer (a database's, say).
      copyFileSync(component, join(mine, 'ticker.wasm'));
      const site = (JSON.parse(readFileSync(join(mine, 'shipped.json'), 'utf8')) as Record<string, { manifest: Record<string, unknown> }>).ticker;
      writeFileSync(join(mine, 'shipped.json'), JSON.stringify({ ticker: { ...site, manifest: { ...site.manifest, app: 'paged', service: { reads: 'addressed', writes: [], website: true, version: '1.0' } } } }).replace('"ticker"', '"paged"'));
      const paged = await martl.addService({ shipped: 'paged', spaces: ['Weave'] });
      const token = (readSecretJson(martl.home, join(martl.home.dir, 'services.json')) as Array<{ name: string; token: string }>).find((x) => x.name === paged.name)!.token;
      await expect(martl.serviceGate(token)!.serve({ space: 'Weave', port: 5432 })).rejects.toThrow(/may serve only its own ports, and has none, not 5432/);
      await martl.removeService('paged').catch(() => {});
    } finally {
      await martl.removeService('ticker').catch(() => {});
      await api.close();
    }
  });
});
