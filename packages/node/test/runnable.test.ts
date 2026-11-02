import { describe, expect, it } from 'vitest';
import { people } from './helpers/people.ts';
import { publishRelease } from './helpers/releases.ts';

/*
 * Phil's MycrobiontaFinder (2.11.2026): a website released as a program per platform ("node server.cjs" in an archive
 * each). Weave never runs a program from a release, so nobody could start it, and only a warning had said so. Now
 * such a release is refused when it's published; a description to run by hand stays possible.
 */

const { person } = people('runnable');
const site = { app: 'pilze', name: 'Pilzkarte', version: 1, services: [{ id: 'web', port: 3000, protocol: 'http' }] };
const archive = { 'win32-x64': { name: 'pilze-win-x64.zip', bytes: Buffer.from('a program') } };

describe('releasing a website', () => {
  it('is refused when it brings programs but no container image and no WebAssembly', async () => {
    const phil = person('Phil');
    await phil.createProject({ name: 'Pilze' });
    await expect(publishRelease(phil, { project: 'Pilze', repo: 'phil/pilze', tag: 'v0.4.0', manifest: { ...site, start: { command: ['node', 'server.cjs'] } }, files: archive })).rejects.toThrow(
      /Pilzkarte v0\.4\.0 isn't released: a website release needs a container image \("start\.image"\) or WebAssembly \("wasm"\)/,
    );
    expect(await phil.artifacts('Pilze')).toEqual([]);
  });

  it('goes through with a container image, or as a description to run by hand', async () => {
    const phil = person('Phil');
    await phil.createProject({ name: 'Pilze' });
    await phil.publishApp({ project: 'Pilze', manifest: { ...site, start: { command: ['node', 'server.cjs'], hint: 'node server.cjs' } } });
    await publishRelease(phil, { project: 'Pilze', repo: 'phil/pilze', tag: 'v0.5.0', manifest: { ...site, start: { image: 'ghcr.io/phil/pilze' }, install: { image: { ref: 'ghcr.io/phil/pilze', tag: 'v0.5.0', digest: `sha256:${'ab'.repeat(32)}` } } } });
    expect((await phil.artifacts('Pilze')).map((a) => a.tag)).toContain('v0.5.0');
  });
});
