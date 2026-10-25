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

describe('your workers and your driver', () => {
  it('hands items only to available sessions that take their project, and remembers what each finished last', async () => {
    const martin = person('Martin');
    await martin.setupDesk({ folder: join(mkdtempSync(join(tmpdir(), 'weave-sessions-desk-')), 'Desk') });
    const weave = await martin.createProject({ name: 'Weave' });
    await martin.createProject({ name: 'Garden' });
    const fix = await martin.submit({ space: 'Weave', board: 'issues', title: 'Fix the login' });
    const plant = await martin.submit({ space: 'Garden', board: 'ideas', title: 'Plant tomatoes' });
    const desk = (await martin.desk())!;
    const [setup] = await martin.posts({ space: desk.space.id, board: 'ideas' });

    // Nobody has a job yet.
    expect(await martin.workers({ post: fix.id })).toEqual([]);
    await expect(martin.assign({ post: fix.id, session: { id: 'w1' } })).rejects.toThrow(/available worker/);

    // A worker for Weave (available once it gets the job), one for anything, one resting, and the driver.
    const w1 = await martin.setSessionRole({ session: { id: 'w1', folder: 'C:\\code\\weave' }, role: 'worker', projects: ['Weave'] });
    expect(w1).toMatchObject({ role: 'worker', available: true, projects: [{ id: weave.id, name: 'Weave' }] });
    await martin.setSessionRole({ session: { id: 'any' }, role: 'worker' });
    await martin.setSessionRole({ session: { id: 'resting' }, role: 'worker', available: false });
    await martin.setSessionRole({ session: { id: 'd1', host: 'local_d1' }, role: 'driver' });
    expect((await martin.desk())!.driver).toMatchObject({ id: 'd1', host: 'local_d1' });

    const ids = async (post: string) => (await martin.workers({ post })).map((w) => w.id).sort();
    expect(await ids(fix.id)).toEqual(['any', 'd1', 'w1']);
    expect(await ids(plant.id)).toEqual(['any', 'd1']);
    await expect(martin.assign({ post: plant.id, session: { id: 'w1' } })).rejects.toThrow(/available worker/);
    await expect(martin.assign({ post: fix.id, session: { id: 'resting' } })).rejects.toThrow();

    // The driver hands out work: on top of the worker's stack; busy workers come after idle ones.
    const busy = await martin.assign({ post: fix.id, session: { id: 'w1' } });
    expect(busy.stack.map((s) => s.post.id)).toEqual([fix.id]);
    expect((await martin.workers({ post: fix.id })).at(-1)!.id).toBe('w1');
    const done = await martin.doneWith({ session: { id: 'w1' } });
    expect(done).toMatchObject({ stack: [], role: 'worker', available: true, last: { post: { id: fix.id, title: 'Fix the login' } } });

    // A new driver: the old one goes back to work; the desk follows.
    await martin.setSessionRole({ session: { id: 'd2' }, role: 'driver' });
    expect((await martin.session({ id: 'd1' })).role).toBe('worker');
    expect((await martin.desk())!.driver).toMatchObject({ id: 'd2' });
    expect((await martin.workTarget({ post: setup.id })).session).toMatchObject({ id: 'd2' });
    // No job: not handed anything, and no longer the desk's driver.
    await martin.setSessionRole({ session: { id: 'd2' }, role: null });
    expect((await martin.session({ id: 'd2' })).role).toBeUndefined();
    expect((await martin.desk())!.driver).toBeUndefined();
    expect(await ids(fix.id)).toEqual(['any', 'd1', 'w1']);
  });
});
