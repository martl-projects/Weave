import { describe, expect, it } from 'vitest';
import { checkManifest, programPlatforms, releaseProgram } from '@weave/core';
import { people } from './helpers/people.ts';
import { publishRelease } from './helpers/releases.ts';

/*
 * Phil's MycrobiontaFinder (2.11.2026): a website released as a program per platform ("node server.cjs" in an archive
 * each). For a while Weave ran no program from a release, and such a release was refused when published. Since 4.11
 * a release's program runs again, behind a warning its person accepts (programs.test.ts); what is still refused is a
 * release nobody could run: files without a command, or a tag with nothing at all. A description to run by hand
 * stays possible.
 */

const { person } = people('runnable');
const site = { app: 'pilze', name: 'Pilzkarte', version: 1, services: [{ id: 'web', port: 3000, protocol: 'http' }] };
const archive = { 'win32-x64': { name: 'pilze-win-x64.zip', bytes: Buffer.from('a program') } };

describe('releasing a website', () => {
  it('goes through with a program per platform, when the manifest says how to run it', async () => {
    const phil = person('Phil');
    await phil.createProject({ name: 'Pilze' });
    // An archive with start.command (for a checkout): that runs in the unpacked archive too.
    const released = await publishRelease(phil, { project: 'Pilze', repo: 'phil/pilze', tag: 'v0.4.0', manifest: { ...site, start: { command: ['node', 'server.cjs'] } }, files: archive });
    expect(programPlatforms(released)).toEqual(['win32-x64']);
    expect(releaseProgram(released, 'win32-x64')).toMatchObject({ platform: 'win32-x64', asset: { file: 'pilze-win-x64.zip' }, command: ['node', 'server.cjs'] });
    expect(releaseProgram(released, 'linux-x64')).toBeUndefined();
    // Its own command per platform wins; a file that is the program itself runs as it is.
    const own = await publishRelease(phil, { project: 'Pilze', repo: 'phil/pilze', tag: 'v0.4.1', manifest: { ...site, start: { command: ['node', 'server.cjs'], release: { 'win32-x64': ['./pilze.exe', '--serve'] } } }, files: { ...archive, 'linux-x64': { name: 'pilze-linux', bytes: Buffer.from('elf') } } });
    expect(releaseProgram(own, 'win32-x64')?.command).toEqual(['./pilze.exe', '--serve']);
    expect(releaseProgram(own, 'linux-x64')?.command).toEqual(['./pilze-linux']);
    expect((await phil.artifacts('Pilze')).map((a) => a.tag).sort()).toEqual(['v0.4.0', 'v0.4.1']);
  });

  it('is refused when nobody could run it: archives without a command', async () => {
    const phil = person('Phil');
    await phil.createProject({ name: 'Pilze' });
    await expect(publishRelease(phil, { project: 'Pilze', repo: 'phil/pilze', tag: 'v0.4.0', manifest: site, files: archive })).rejects.toThrow(
      /Pilzkarte v0\.4\.0 isn't released: a website release needs a container image \("start\.image"\), WebAssembly \("wasm"\), or a program per platform with a command to run it/,
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

  it('reads start.release as the program per platform, and warns that it runs behind a warning', () => {
    const checked = checkManifest({ ...site, start: { command: ['node', 'server.cjs'], release: { 'win32-x64': ['./pilze.exe'] } } });
    expect(checked.problems).toEqual([]);
    expect(checked.manifest?.start?.release).toEqual({ 'win32-x64': ['./pilze.exe'] });
    expect(checked.warnings).toContainEqual(expect.stringMatching(/runs on people's computers with their rights, and only after a warning/));
    // wasm and file aren't platforms a program is built for.
    expect(checkManifest({ ...site, start: { release: { wasm: ['x'] } } }).problems).toEqual([expect.stringMatching(/"start\.release" names platforms like win32-x64/)]);
    // With an image too, the container runs and no warning is due.
    expect(checkManifest({ ...site, start: { image: 'ghcr.io/phil/pilze', release: { 'win32-x64': ['./pilze.exe'] } } }).warnings).not.toContainEqual(expect.stringMatching(/after a warning/));
  });
});
