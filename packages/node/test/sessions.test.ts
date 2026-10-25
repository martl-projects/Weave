import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { closeOpenStores, WeaveNode } from '../src/index.ts';

const dirs: string[] = [];
afterAll(() => {
  closeOpenStores(); // weave.db stays open until then, and Windows won't delete it
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function person(name: string) {
  const dir = mkdtempSync(join(tmpdir(), 'weave-sessions-'));
  dirs.push(dir);
  return WeaveNode.init(name, dir);
}

describe('where to work on an item (Ctrl+click)', () => {
  it("picks the item's latest session, or the folders known for its project, with the message to start", async () => {
    const martin = person('Martin');
    await martin.createProject({ name: 'Weave' });
    const fix = await martin.submit({ space: 'Weave', board: 'issues', title: 'Fix the login', prompt: 'Find why sign-in fails and fix it.' });
    const idea = await martin.submit({ space: 'Weave', board: 'ideas', title: 'Dark mode for the panel' });

    // Nobody has worked on it yet: no session, no folder.
    let target = await martin.workTarget({ post: fix.url });
    expect(target.session).toBeUndefined();
    expect(target.folders).toEqual([]);
    expect(target.text).toBe(`Weave work item: Fix the login\n${fix.url}\n\nFind why sign-in fails and fix it.\n\n(This is a new session: first put the item on your stack with weave_work_on, post ${fix.url}.)`);

    // You chose a folder for the project; a session elsewhere worked on another item of it.
    expect(await martin.rememberFolder({ space: 'Weave', folder: 'C:\\code\\weave' })).toEqual(['C:\\code\\weave']);
    await martin.workOn({ session: { id: 'older', folder: 'C:\\code\\weave-app' }, post: idea.id });
    target = await martin.workTarget({ post: fix.id });
    expect(target.folders).toEqual(['C:\\code\\weave', 'C:\\code\\weave-app']);

    // Two sessions have it: the one that changed last wins, and the message just names the item.
    await martin.workOn({ session: { id: 's1', host: 'local_s1', folder: 'C:\\code\\weave' }, post: fix.id });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await martin.workOn({ session: { id: 's2', host: 'local_s2', folder: 'C:\\code\\weave' }, post: fix.id });
    target = await martin.workTarget({ post: fix.id });
    expect(target.session).toMatchObject({ id: 's2', host: 'local_s2' });
    expect(target.text).toBe(`Weave work item: Fix the login\n${fix.url}\n\nFind why sign-in fails and fix it.`);
    // An item without a starting prompt gets a plain one.
    expect((await martin.workTarget({ post: idea.id })).text).toContain("Let's work on this.");
  });
});
