import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { compareVersions, parseVersion } from '@weave/core';
import { WeaveNode, closeOpenStores } from '../src/index.ts';

const dirs: string[] = [];
afterAll(() => {
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function person(name: string): WeaveNode {
  const dir = mkdtempSync(join(tmpdir(), 'weave-update-'));
  dirs.push(dir);
  return WeaveNode.init(name, dir);
}

/** Everyone gets everyone's events, as if they had all been online together. */
function syncAll(nodes: WeaveNode[]): void {
  for (let round = 0; round < 2; round++) for (const from of nodes) for (const to of nodes) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
}

/** A GitHub that answers with these releases, or not at all. */
const githubWith = (tags: string[] | 'down') => async (url: string | URL | Request) => {
  if (tags === 'down') throw new Error('offline');
  if (!String(url).includes('/releases')) return new Response('{}', { status: 404 });
  return new Response(JSON.stringify(tags.map((tag) => ({ tag_name: tag, name: tag, published_at: '2026-10-20T10:00:00Z', draft: false, prerelease: true, assets: [] }))), { status: 200 });
};

describe('versions', () => {
  it('reads and orders version numbers', () => {
    expect(parseVersion('Weave v0.3.0')).toEqual({ major: 0, minor: 3, patch: 0 });
    expect(parseVersion('v1.2.10-beta.2')).toEqual({ major: 1, minor: 2, patch: 10, pre: 'beta.2' });
    expect(parseVersion('no version here')).toBeUndefined();
    expect(compareVersions('0.3.0', '0.10.0')).toBeLessThan(0);
    expect(compareVersions('v1.0.0', '1.0.0-rc.1')).toBeGreaterThan(0);
    expect(compareVersions('0.3.0', 'v0.3.0')).toBe(0);
  });
});

describe('update check', () => {
  it("finds the newest release among the project's release posts by maintainers, and GitHub's", async () => {
    const martl = person('martl');
    const lena = person('Lena');
    const project = await martl.createProject({ name: 'Weave' });
    await lena.joinSpace(await martl.invite('Weave'));
    for (const node of [martl, lena]) {
      node.config = { ...node.config, updates: { project: project.id, repo: 'martldennl/Weave' } };
      node.githubSetup = { ...node.githubSetup, fetch: githubWith('down') };
    }

    // Nothing announced yet.
    expect(await lena.updateCheck({ current: '0.3.0' })).toEqual({ current: '0.3.0', newer: false });

    await martl.submit({ space: 'Weave', board: 'releases', title: 'Weave v0.3.0', text: 'GitHub and apps', link: 'https://github.com/martldennl/Weave/releases/tag/v0.3.0' });
    await martl.submit({ space: 'Weave', board: 'releases', title: 'Weave v0.4.0', text: '**v2** wire format', link: 'https://github.com/martldennl/Weave/releases/tag/v0.4.0' });
    // Not a maintainer: doesn't count, however high the number.
    await lena.submit({ space: 'Weave', board: 'releases', title: 'Weave v9.9.9', text: 'trust me' });
    syncAll([martl, lena]);

    const found = await lena.updateCheck({ current: '0.3.0' });
    expect(found).toMatchObject({ current: '0.3.0', newer: true, latest: { version: '0.4.0', source: 'weave', url: 'https://github.com/martldennl/Weave/releases/tag/v0.4.0', notes: '**v2** wire format' } });
    expect(found.latest?.post).toMatch(/^weave:post:/);
    expect((await lena.updateCheck({ current: '0.4.0' })).newer).toBe(false);

    // GitHub knows a newer tag than any post: it counts too.
    lena.githubSetup = { ...lena.githubSetup, fetch: githubWith(['v0.4.0', 'v0.4.1', 'not-a-version']) };
    expect(await lena.updateCheck({ current: '0.4.0' })).toMatchObject({ newer: true, latest: { version: '0.4.1', source: 'github', url: 'https://github.com/martldennl/Weave/releases/tag/v0.4.1' } });

    await expect(lena.updateCheck({ current: 'banana' })).rejects.toThrow(/isn't a version/);
    for (const node of [martl, lena]) await node.close();
  });
});
