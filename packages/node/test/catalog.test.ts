import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { KIND_CATALOG_ENTRY, SERVICE_LABEL } from '@weave/core';
import { WeaveNode, type Fetch, closeOpenStores } from '../src/index.ts';
import { registry } from './helpers/registry.ts';

/*
 * Catalogs (block 6): a space whose maintainers list Weave services, for its people to install. The catalog only
 * points at an image by its digest: what the service is, runs and may do is read from the image itself.
 */

const dirs: string[] = [];
const nodes: WeaveNode[] = [];
afterAll(async () => {
  for (const node of nodes) await node.close().catch(() => {});
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});
afterEach(() => {
  delete process.env.FAKE_DOCKER_DOWN;
});

function person(name: string, fetchImpl: Fetch): WeaveNode {
  const dir = mkdtempSync(join(tmpdir(), 'weave-catalog-'));
  dirs.push(dir);
  const node = WeaveNode.init(name, dir);
  node.containerSetup = { fetch: fetchImpl, docker: [process.execPath, join(import.meta.dirname, 'helpers', 'fake-docker.mjs')] };
  nodes.push(node);
  return node;
}

const sync = (all: WeaveNode[]) => {
  for (let round = 0; round < 2; round++) for (const from of all) for (const to of all) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
};

describe('catalogs', () => {
  it('lists Weave services for a space to install; what runs comes from the image, not from the catalog', async () => {
    const label = { app: 'quizbot', name: 'Quiz bot', service: { reads: 'addressed', writes: [], version: '1.0' }, env: [{ name: 'QUIZ_KEY', label: 'Quiz key', secret: true }] };
    const fetchImpl = registry({ 'quizbot:1.0': { labels: { [SERVICE_LABEL]: JSON.stringify(label) } } });
    const martl = person('martl', fetchImpl);
    const ola = person('Ola', fetchImpl);
    await martl.createProject({ name: 'Quiz' });
    await martl.releaseService({ project: 'Quiz', image: 'ghcr.io/martl/quizbot:1.0' });
    // The catalog is a community; Ola is in it, not in the project that released the service.
    await martl.createCommunity({ name: 'Market' });
    await ola.joinSpace(await martl.invite('Market'));
    await ola.createProject({ name: 'Club' });
    sync([martl, ola]);

    // Only the space's maintainers list things in it.
    await expect(ola.listInCatalog({ catalog: 'Market', artifact: { project: 'Quiz' } })).rejects.toThrow();
    const listed = await martl.listInCatalog({ catalog: 'Market', artifact: { project: 'Quiz' }, summary: 'Runs quiz nights' });
    expect(listed).toMatchObject({ app: 'quizbot', name: 'Quiz bot', summary: 'Runs quiz nights', origin: { project: { name: 'Quiz' }, tag: '1.0' }, image: { ref: 'ghcr.io/martl/quizbot', packaged: true } });
    sync([martl, ola]);

    // Ola sees it, without the name of a project she isn't in.
    const [entry] = await ola.catalog('Market');
    expect(entry).toMatchObject({ app: 'quizbot', by: { name: 'martl' }, origin: { project: { id: listed.origin.project.id }, tag: '1.0' }, image: { digest: listed.image.digest } });
    expect(entry.origin.project.name).toBeUndefined();
    expect(entry.installed).toBeUndefined();

    // Before installing, her node reads what it is from the image: its contract and settings.
    const preview = await ola.catalogArtifact({ catalog: 'Market', app: 'quizbot' });
    expect(preview).toMatchObject({ name: 'Quiz bot', packaged: true, runs: 'container', applet: { reads: 'addressed' }, settings: [{ name: 'QUIZ_KEY' }] });

    // Installing asks for her yes and its settings, then gives it its own key, in her project.
    await expect(ola.addService({ from: { catalog: 'Market', app: 'quizbot' }, spaces: ['Club'], settings: { QUIZ_KEY: 'k' } })).rejects.toThrow(/approve it first: Weave would run "[^"]*--read-only[^"]*" from Quiz bot 1\.0/);
    await expect(ola.addService({ from: { catalog: 'Market', app: 'quizbot' }, spaces: ['Club'], approve: true })).rejects.toThrow(/needs Quiz key/);
    const quiz = await ola.addService({ from: { catalog: 'Market', app: 'quizbot' }, spaces: ['Club'], settings: { QUIZ_KEY: 'k' }, approve: true });
    expect(quiz).toMatchObject({ name: 'quizbot', contract: { reads: 'addressed' }, artifact: { name: 'Quiz bot', tag: '1.0' } });
    expect((await ola.catalog('Market'))[0].installed).toBe('quizbot');

    // Where it comes from: martl, in the project, checks it; Ola can't.
    sync([martl, ola]);
    expect((await martl.serviceProfiles()).find((p) => p.name === 'quizbot')?.origin).toMatchObject({ kind: 'release', project: { name: 'Quiz' }, checked: 'verified' });
    expect((await ola.serviceProfiles()).find((p) => p.name === 'quizbot')?.origin).toMatchObject({ kind: 'release', checked: 'unknown' });

    // An entry that says it's one thing while its image is another is refused.
    await martl.publish({ kind: KIND_CATALOG_ENTRY, body: { app: 'quizbot2', name: 'Not a quiz bot', origin: { project: listed.origin.project.id, release: listed.origin.release, tag: '1.0' }, image: { ref: listed.image.ref, tag: '1.0', digest: listed.image.digest } }, space: 'Market' });
    sync([martl, ola]);
    await expect(ola.addService({ from: { catalog: 'Market', app: 'quizbot2' }, spaces: ['Club'], approve: true })).rejects.toThrow(/lists "quizbot2", but its image is "quizbot"/);

    // Taken off, it's gone from the catalog; Ola keeps what she installed.
    await martl.unlistFromCatalog({ catalog: 'Market', app: 'quizbot' });
    sync([martl, ola]);
    expect((await ola.catalog('Market')).map((e) => e.app)).toEqual(['quizbot2']);
    expect((await ola.services()).map((s) => s.name)).toEqual(['quizbot']);
    await expect(ola.unlistFromCatalog({ catalog: 'Market', app: 'quizbot2' })).rejects.toThrow(/only the maintainers/);
  });
});
