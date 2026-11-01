import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { TextPackage } from '@weave/core';
import { closeOpenStores, WeaveNode } from '../src/index.ts';

/*
 * A release's texts in other languages (docs/localization.md): published with its manifest by a maintainer, checked
 * against it, and handed out with the artifact. The Pferderennen's manifest and German are the fixture.
 */
const derby = join(import.meta.dirname, '..', '..', 'core', 'test', 'fixtures', 'derby');
const manifest = JSON.parse(readFileSync(join(derby, 'weave.app.json'), 'utf8')) as Record<string, unknown>;
const de = JSON.parse(readFileSync(join(derby, 'weave.texts.de.json'), 'utf8')) as TextPackage;
// A release: its tag and a file, as a provider would fingerprint it.
const released = { ...manifest, install: { tag: 'v1.4.0', source: { provider: 'github', ref: 'martl/derby' }, assets: { 'linux-x64': { file: 'derby.tar.gz', sha256: 'a'.repeat(64), size: 10 } }, access: 'direct', fetcher: 'github-checkout' } };

const dirs: string[] = [];
afterAll(() => {
  closeOpenStores();
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe("a release's texts", () => {
  it('are published with the manifest, checked against it, and come with the artifact', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'weave-apptexts-'));
    dirs.push(dir);
    const martl = WeaveNode.init('martl', dir);
    await martl.createProject({ name: 'Derby' });
    await martl.publishApp({ project: 'Derby', manifest: released, texts: [de] });
    const [artifact] = await martl.artifacts('Derby');
    expect(artifact).toMatchObject({ name: 'Derby', tag: 'v1.4.0' });
    expect(artifact.texts?.map((p) => p.lang)).toEqual(['de']);
    expect(artifact.texts?.[0].names['actions.bet.label']).toBe('Wetten');
  });

  it('refuses a package that is not the manifest\'s, naming what is wrong', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'weave-apptexts-'));
    dirs.push(dir);
    const martl = WeaveNode.init('martl', dir);
    await martl.createProject({ name: 'Derby' });
    const broken = { ...de, names: { ...de.names, 'actions.gallop.label': 'Galopp', 'actions.bet.label': '<b>Wetten</b>' } };
    await expect(martl.publishApp({ project: 'Derby', manifest: released, texts: [broken] })).rejects.toThrow(/weave\.texts\.de\.json: actions\.bet\.label: no markup in a service's text; actions\.gallop\.label: not a text field of this manifest/);
    await expect(martl.publishApp({ project: 'Derby', manifest: released, texts: { lang: 'de' } })).rejects.toThrow(/as a list/);
    // Nothing was published: the artifact isn't there.
    expect(await martl.artifacts('Derby')).toEqual([]);
  });

  it('lets an agent publish the texts only with the permission for them (weave.app.texts), as for everything it signs', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'weave-apptexts-'));
    dirs.push(dir);
    const martl = WeaveNode.init('martl', dir);
    await martl.createProject({ name: 'Derby' });
    await martl.addAgent('forge', ['weave.app']);
    await expect(martl.publishApp({ project: 'Derby', manifest: released, texts: [de], as: 'forge' })).rejects.toThrow(/may not sign weave.app.texts/);
    expect(await martl.artifacts('Derby')).toEqual([]); // nothing half done
    await martl.addAgent('smith', ['weave.app.*']);
    await martl.publishApp({ project: 'Derby', manifest: released, texts: [de], as: 'smith' });
    expect((await martl.artifacts('Derby'))[0].texts?.map((p) => p.lang)).toEqual(['de']);
  });
});
