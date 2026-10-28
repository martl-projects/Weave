import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { Fetchers } from '../src/fetchers.ts';
import { closeOpenStores, WeaveNode } from '../src/index.ts';
import { digestOf } from '../src/shipped.ts';

/*
 * Fetchers are their person's, for the projects they allow: a company's fetcher, added for its project, is never
 * chosen in another, so it never sees what another project grants.
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

describe('fetchers', () => {
  it('are kept per person, for the projects they allow, with their settings sealed', async () => {
    const shipped = temp('weave-shipped-fetchers-');
    writeFileSync(join(shipped, 'acme-s3.wasm'), 'not really a component');
    const manifest = { app: 'acme-s3', name: 'Acme S3', fetcher: { net: ['s3.acme.example'] }, wasm: { component: 'acme-s3.wasm' }, env: [{ name: 'ACME_KEY', label: 'Your Acme key', secret: true }] };
    writeFileSync(join(shipped, 'shipped.json'), JSON.stringify({ 'acme-s3': { component: 'acme-s3.wasm', digest: digestOf(join(shipped, 'acme-s3.wasm')), manifest } }));
    const julian = WeaveNode.init('Julian', temp('weave-fetchers-'));
    julian.wasmSetup.shippedDir = shipped;
    nodes.push(julian);
    await julian.createProject({ name: 'Acme' });
    await julian.createProject({ name: 'Garden' });

    const added = await julian.addFetcher({ shipped: 'acme-s3', projects: ['Acme'] });
    expect(added).toMatchObject({ name: 'acme-s3', title: 'Acme S3', projects: [{ name: 'Acme' }], net: ['s3.acme.example'], filled: [] });
    // Only the settings it asks for; their values never come back.
    await expect(julian.setFetcher({ name: 'acme-s3', settings: { OTHER: 'x' } })).rejects.toThrow(/asks for no setting OTHER/);
    expect((await julian.setFetcher({ name: 'acme-s3', settings: { ACME_KEY: 'k-123' } })).filled).toEqual(['ACME_KEY']);
    expect(JSON.stringify(await julian.fetchers())).not.toContain('k-123');

    // Chosen in Acme only: Garden's provider naming it finds none there.
    const kept = new Fetchers(() => julian.home, undefined as never, () => shipped);
    const acme = (await julian.spaces()).find((s) => s.name === 'Acme')!.id;
    const garden = (await julian.spaces()).find((s) => s.name === 'Garden')!.id;
    expect(kept.forProject('acme-s3', acme)).toHaveProperty('fetcher');
    expect(kept.forProject('acme-s3', garden)).toEqual({ missing: 'the fetcher Acme S3 (acme-s3) for this project: you added it for others only' });
    expect(kept.forProject(digestOf(join(shipped, 'acme-s3.wasm')), acme)).toHaveProperty('fetcher');
    expect(kept.forProject(`sha256:${'0'.repeat(64)}`, acme)).toMatchObject({ missing: expect.stringMatching(/doesn't ship/) });

    // Allowed everywhere only when its person says so; taken out, it's chosen nowhere.
    expect((await julian.setFetcher({ name: 'acme-s3', projects: 'all' })).projects).toBe('all');
    expect(kept.forProject('acme-s3', garden)).toHaveProperty('fetcher');
    await julian.removeFetcher('acme-s3');
    expect(kept.forProject('acme-s3', acme)).toMatchObject({ missing: expect.stringMatching(/add it for this project/) });
    expect((await julian.fetchers()).map((f) => [f.name, f.added])).toEqual([['acme-s3', false]]);
  });
});
