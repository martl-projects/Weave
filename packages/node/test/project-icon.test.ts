import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { WeaveNode, closeOpenStores } from '../src/index.ts';

const dirs: string[] = [];
afterAll(() => {
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function person(name: string): WeaveNode {
  const dir = mkdtempSync(join(tmpdir(), 'weave-project-icon-'));
  dirs.push(dir);
  return WeaveNode.init(name, dir);
}

function syncAll(nodes: WeaveNode[]): void {
  for (let round = 0; round < 2; round++) for (const from of nodes) for (const to of nodes) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
}

const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe("a project's icon", () => {
  it('pictures the project wherever it shows: sidebar, Home, shares and hubs', async () => {
    const martl = person('martl');
    const lena = person('Lena');
    await martl.createProject({ name: 'Weave' });
    await martl.createCommunity({ name: 'Synths' });
    await lena.joinSpace(await martl.invite('Synths'));
    const icon = await martl.putBlob({ data: PIXEL, type: 'image/png' });
    await martl.setProjectPage({ project: 'Weave', icon, public: true });

    expect((await martl.spaces('project'))[0].icon).toBe(icon);
    expect((await martl.posts({})).find((p) => p.type === 'project')?.project?.icon).toBe(icon);
    expect(martl.publicProjectsOf(martl.identity.author)[0].icon).toBe(icon);

    // Shared into a community: Lena isn't in the project, and still sees its icon.
    const project = (await martl.posts({})).find((p) => p.type === 'project')!;
    await martl.share({ post: project.id, to: 'Synths' });
    syncAll([martl, lena]);
    const shared = (await lena.posts({ space: 'Synths' }))[0];
    expect(shared.project).toMatchObject({ name: 'Weave', icon, member: false });

    // No icon: nothing to show but the sprite.
    await martl.setProjectPage({ project: 'Weave', icon: '' });
    expect((await martl.spaces('project'))[0]).not.toHaveProperty('icon');
  });
});
