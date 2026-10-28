import { copyFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startApi } from '../src/api.ts';
import { WeaveNode, closeOpenStores } from '../src/index.ts';
import { digestOf } from '../src/shipped.ts';
import { buildComponent } from './helpers/components.ts';

/*
 * Websites, shipped with Weave (packages/shipped/websites): the website service as a service like any other. It hosts
 * a project's websites (websites: host in its contract) while Weave holds the visitors' connections; it lists them for
 * everyone and lets maintainers close them, through its actions and its panel. It never opens a port itself.
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

const sync = (all: WeaveNode[]) => {
  for (let round = 0; round < 2; round++) for (const from of all) for (const to of all) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
};

let shipped: string;
beforeAll(async () => {
  const source = join(import.meta.dirname, '..', '..', 'shipped', 'websites');
  const component = await buildComponent(join(source, 'src', 'service.js'), 'service');
  shipped = temp('weave-shipped-websites-');
  copyFileSync(component, join(shipped, 'websites.wasm'));
  cpSync(join(source, 'panel'), join(shipped, 'websites-panel'), { recursive: true });
  writeFileSync(join(shipped, 'shipped.json'), JSON.stringify({ websites: { component: 'websites.wasm', digest: digestOf(component), manifest: JSON.parse(readFileSync(join(source, 'weave.app.json'), 'utf8')), panel: 'websites-panel' } }));
}, 180_000);

function person(name: string): WeaveNode {
  const node = WeaveNode.init(name, temp('weave-websites-'));
  node.wasmSetup.shippedDir = shipped;
  nodes.push(node);
  return node;
}

describe('Websites, shipped with Weave', { timeout: 120_000 }, () => {
  it('hosts the project’s websites, lists them for everyone, and lets maintainers close them', async () => {
    const martl = person('martl');
    const lena = person('Lena');
    await martl.createProject({ name: 'Party' });
    await lena.joinSpace(await martl.invite('Party'));
    sync([martl, lena]);
    const api = await startApi(martl, 0, { service: (token) => martl.serviceGate(token) });
    martl.runServices({ port: api.port });
    try {
      const websites = await martl.addService({ shipped: 'websites', spaces: ['Party'] });
      expect(websites.contract).toMatchObject({ websites: 'host', actions: [{ name: 'list', who: 'members' }, { name: 'close', who: 'maintainers' }] });
      await vi.waitFor(async () => expect((await martl.services())[0].running).toBe(true), { timeout: 30_000, interval: 200 });

      // martl opens a website for a program of his: the port is his to open, hosted by the Websites service.
      const game = await martl.openWebsite({ service: 'websites', project: 'Party', name: 'Game night', port: 47123 });
      expect(game.offeredBy?.did).toBe(websites.did);
      sync([martl, lena]);

      const answer = async (node: WeaveNode, text: string, action: string, data?: unknown) => {
        const asked = await node.askService({ space: 'Party', service: websites.did, text, action, ...(data ? { data: data as never } : {}) });
        let got: { text: string; data?: unknown; error?: string } | undefined;
        await vi.waitFor(
          async () => {
            sync([martl, lena]);
            got = (await node.serviceRequests({ space: 'Party', service: websites.did })).find((r) => r.id === asked.id)?.results[0];
            expect(got).toBeDefined();
          },
          { timeout: 30_000, interval: 200 },
        );
        return got!;
      };

      // Everyone sees what's there; its panel is theirs too.
      expect((await answer(lena, 'what is there?', 'list')).data).toMatchObject([{ id: game.id, name: 'Game night', visitors: 'everyone here' }]);
      expect((await lena.servicePanels({ space: 'Party', service: websites.did })).map((p) => [p.name, p.mine])).toEqual([['overview', true]]);
      // Closing is for maintainers: Lena can't, martl can.
      await expect(lena.askService({ space: 'Party', service: websites.did, text: 'close it', action: 'close', data: { id: game.id } })).rejects.toThrow(/only maintainers can close a website/);
      expect((await answer(martl, 'close it', 'close', { id: game.id })).text).toBe('Closed.');
      expect((await answer(lena, 'and now?', 'list')).data).toEqual([]);
    } finally {
      await martl.removeService('websites').catch(() => {});
      await api.close();
    }
  });
});
