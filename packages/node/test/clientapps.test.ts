import { appendFileSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { closeOpenStores, WeaveNode } from '../src/index.ts';
import { buildComponent } from './helpers/components.ts';
import { fetchesFrom, publishRelease, PublicGitHub } from './helpers/releases.ts';

/*
 * Keyvaults and fetchers anyone released: added from a project's release in Keys & devices, beside Weave's own,
 * approved once and pinned to what was released. Nothing they do is Weave's alone.
 */

const dirs: string[] = [];
const nodes: WeaveNode[] = [];
afterAll(async () => {
  for (const node of nodes) await node.close().catch(() => {});
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});
const person = (name: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'weave-clientapps-'));
  dirs.push(dir);
  const node = WeaveNode.init(name, dir);
  nodes.push(node);
  return node;
};
const sync = (all: WeaveNode[]) => {
  for (let round = 0; round < 2; round++) for (const from of all) for (const to of all) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
};

describe('keyvaults and fetchers from releases', { timeout: 300_000 }, () => {
  it("are anyone's: added from a release, approved once, pinned to it", async () => {
    const shipped = join(import.meta.dirname, '..', '..', 'shipped');
    const vault = readFileSync(await buildComponent(join(shipped, 'github-keyvault', 'src', 'service.js'), 'keyvault', { http: true }));
    const fetcher = readFileSync(await buildComponent(join(shipped, 'github-checkout', 'src', 'service.js'), 'fetcher', { http: true }));
    const github = new PublicGitHub().add('acme/vault', 'v1', { name: 'acme-vault.wasm', bytes: vault }).add('acme/fetch', 'v1', { name: 'acme-fetch.wasm', bytes: fetcher });
    const port = await github.serve();
    const martl = person('martl');
    const lena = person('Lena');
    try {
      await fetchesFrom(lena, port);
      await martl.createProject({ name: 'Acme' });
      await lena.joinSpace(await martl.invite('Acme'));
      // Someone else's keyvault (for a platform Weave knows nothing of) and fetcher, released like any artifact.
      await publishRelease(martl, { project: 'Acme', repo: 'acme/vault', tag: 'v1', manifest: { app: 'acme-vault', name: 'Acme vault', keyvault: { platform: 'acme', net: ['api.acme.example'], resources: 'buckets' }, wasm: { component: 'acme-vault.wasm' } }, files: { wasm: { name: 'acme-vault.wasm', bytes: vault } } });
      await publishRelease(martl, { project: 'Acme', repo: 'acme/vault2', tag: 'v1', manifest: { app: 'acme-vault-2', name: 'Acme vault 2', keyvault: { platform: 'acme', net: ['evil.example'] }, wasm: { component: 'acme-vault.wasm' } }, files: { wasm: { name: 'acme-vault.wasm', bytes: vault } } });
      await publishRelease(martl, { project: 'Acme', repo: 'acme/fetch', tag: 'v1', manifest: { app: 'acme-fetch', name: 'Acme fetch', fetcher: { net: ['files.acme.example'] }, wasm: { component: 'acme-fetch.wasm' } }, files: { wasm: { name: 'acme-fetch.wasm', bytes: fetcher } } });
      sync([martl, lena]);
      expect((await lena.artifacts('Acme')).map((a) => [a.name, a.kind]).sort()).toEqual([['Acme fetch', 'fetcher'], ['Acme vault 2', 'keyvault'], ['Acme vault', 'keyvault']]);

      // Approved first: what it would run, as what, reaching where.
      const vaultRelease = (await lena.artifacts('Acme')).find((a) => a.name === 'Acme vault')!;
      await expect(lena.addClientApp({ project: 'Acme', artifact: vaultRelease.id })).rejects.toThrow(/approve it first: Weave would run Acme vault v1, released in Acme, as your keyvault for acme \(it holds your access there\); it reaches api\.acme\.example/);
      const added = await lena.addClientApp({ project: 'Acme', artifact: vaultRelease.id, approve: true });
      expect(added).toMatchObject({ name: 'acme-vault', title: 'Acme vault', platform: 'acme', resources: 'buckets', added: true });
      expect((await lena.keyvaults()).find((k) => k.name === 'acme-vault')).toMatchObject({ added: true, apps: [] });
      // One keyvault per platform: another for acme (anyone's) never stands in quietly.
      const second = (await lena.artifacts('Acme')).find((a) => a.name === 'Acme vault 2')!;
      await expect(lena.addClientApp({ project: 'Acme', artifact: second.id, approve: true })).rejects.toThrow(/you have a keyvault for acme already \(acme-vault\): remove it first/);

      // A fetcher too: for the project it came from.
      const [fetchRelease] = (await lena.artifacts('Acme')).filter((a) => a.kind === 'fetcher');
      expect(await lena.addClientApp({ project: 'Acme', artifact: fetchRelease.id, approve: true })).toMatchObject({ name: 'acme-fetch', added: true, projects: [{ name: 'Acme' }], net: ['files.acme.example'] });

      // Pinned: its component changed on disk after, it doesn't run.
      const file = join(lena.home.dir, 'services', 'client-acme-vault', 'artifacts');
      const wasm = readdirSync(file, { recursive: true }).map(String).find((f) => f.endsWith('acme-vault.wasm'))!;
      appendFileSync(join(file, wasm), 'changed');
      expect((await lena.keyvaults()).find((k) => k.name === 'acme-vault')?.problem).toMatch(/isn't what this Weave ships|acme-vault's component/);

      // Weave's own names are its own: a release can't take one (here, its fetcher's).
      await publishRelease(martl, { project: 'Acme', repo: 'acme/fake', tag: 'v1', manifest: { app: 'github-checkout', name: 'GitHub checkout', fetcher: { net: ['evil.example'] }, wasm: { component: 'acme-fetch.wasm' } }, files: { wasm: { name: 'acme-fetch.wasm', bytes: fetcher } } });
      sync([martl, lena]);
      const fake = (await lena.artifacts('Acme')).find((a) => a.name === 'GitHub checkout')!;
      await expect(lena.addClientApp({ project: 'Acme', artifact: fake.id, approve: true })).rejects.toThrow(/github-checkout is the name of one Weave ships/);

      // Taken out: gone from both.
      await lena.removeClientApp('acme-vault');
      expect((await lena.keyvaults()).some((k) => k.name === 'acme-vault')).toBe(false);
    } finally {
      github.server?.close();
    }
  });
});
