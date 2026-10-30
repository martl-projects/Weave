import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { closeOpenStores, WeaveNode } from '../src/index.ts';
import { publishRelease } from './helpers/releases.ts';

/*
 * A project's artifacts: any number of them, each a line of releases from its own source. Nothing ties a project to
 * one ("its app"): releasing asks which, or takes a new source as a new one.
 */

const dirs: string[] = [];
const nodes: WeaveNode[] = [];
afterAll(async () => {
  for (const node of nodes) await node.close().catch(() => {});
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

describe("a project's artifacts", () => {
  it('are any number, each from its own source; releasing asks which', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'weave-lines-'));
    dirs.push(dir);
    const martl = WeaveNode.init('martl', dir);
    nodes.push(martl);
    await martl.createProject({ name: 'Weave' });
    const file = { name: 'x.wasm', bytes: Buffer.from('x') };
    await publishRelease(martl, { project: 'Weave', repo: 'martl/weave-github', tag: 'v1', manifest: { app: 'github-access', name: 'GitHub access', service: { reads: 'addressed', writes: [], version: '1.0' }, wasm: { component: 'x.wasm' } }, files: { wasm: file } });
    await publishRelease(martl, { project: 'Weave', repo: 'martl/weave-websites', tag: 'v2', manifest: { app: 'websites', name: 'Websites', service: { reads: 'addressed', writes: [], websites: 'host', version: '1.0' }, wasm: { component: 'x.wasm' } }, files: { wasm: file } });
    expect(await martl.artifactLines('Weave')).toEqual([
      { id: 'github-access', name: 'GitHub access', kind: 'service', source: { provider: 'github', ref: 'martl/weave-github' }, tag: 'v1' },
      { id: 'websites', name: 'Websites', kind: 'service', source: { provider: 'github', ref: 'martl/weave-websites' }, tag: 'v2' },
    ]);
    expect((await martl.artifacts('Weave')).map((a) => [a.name, a.tag]).sort()).toEqual([['GitHub access', 'v1'], ['Websites', 'v2']]);

    // Releasing asks which, with several; one named (or its source) goes to the project's provider with its own source.
    await expect(martl.releaseArtifact({ project: 'Weave', tag: 'v3' })).rejects.toThrow(/which of Weave's artifacts\? \(github-access, from martl\/weave-github; websites, from martl\/weave-websites\), or a new source/);
    await expect(martl.releaseArtifact({ project: 'Weave', tag: 'v3', artifact: 'nope' })).rejects.toThrow(/Weave has no artifact nope \(its artifacts: github-access, websites\)/);
    await expect(martl.releaseArtifact({ project: 'Weave', tag: 'v3', artifact: 'websites' })).rejects.toThrow(/has no service that publishes releases from github/);
    // The way it was called before: a repository says which.
    await expect(martl.releaseApp({ project: 'Weave', tag: 'v3', repo: 'martl/weave-github' })).rejects.toThrow(/has no service that publishes releases from github/);
  });
});
