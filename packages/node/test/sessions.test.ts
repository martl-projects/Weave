import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
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

describe('sessions with permanent names', () => {
  it('lets a session name itself once, uniquely among your sessions and the people around you, and goes by "name · about"', async () => {
    const martin = person('Martin');
    await martin.createProject({ name: 'Weave' });
    await martin.addAgent('claude', ['weave.post']);
    const fix = await martin.submit({ space: 'Weave', board: 'issues', title: 'Fix the login' });

    // Unnamed: the title is whatever the provider says; about alone isn't enough.
    await expect(martin.nameSession({ session: { id: 's1' }, about: 'Reviews' })).rejects.toThrow(/no name yet/);
    const s1 = await martin.nameSession({ session: { id: 's1', folder: 'C:\code\weave' }, name: 'Skala', about: 'Service-, Netzwerk- und Last-Review', description: 'Reviews services, networking and load behaviour on main.' });
    expect(s1).toMatchObject({ id: 's1', name: 'Skala', about: 'Service-, Netzwerk- und Last-Review', title: 'Skala · Service-, Netzwerk- und Last-Review', description: 'Reviews services, networking and load behaviour on main.' });
    expect((await martin.session({ id: 's1' })).title).toBe('Skala · Service-, Netzwerk- und Last-Review');

    // Taken: by another session (any case), by the person, by an agent. Well-formed only.
    await expect(martin.nameSession({ session: { id: 's2' }, name: 'skala' })).rejects.toThrow(/"Skala" is taken; names around you: claude, Martin, Skala/);
    await expect(martin.nameSession({ session: { id: 's2' }, name: 'Martin' })).rejects.toThrow(/"Martin" is taken/);
    await expect(martin.nameSession({ session: { id: 's2' }, name: 'Claude' })).rejects.toThrow(/"claude" is taken/);
    await expect(martin.nameSession({ session: { id: 's2' }, name: 'Skala · free' })).rejects.toThrow(/2 to 24/);
    const s2 = await martin.nameSession({ session: { id: 's2' }, name: 'Shuttle' });
    expect(s2).toMatchObject({ name: 'Shuttle', title: 'Shuttle' });

    // Permanent: the session can't rename itself, nor drop the name; about and description it may change.
    await expect(martin.nameSession({ session: { id: 's1' }, name: 'Skala II' })).rejects.toThrow(/this session is Skala: a name is permanent/);
    await expect(martin.nameSession({ session: { id: 's1' }, name: '' })).rejects.toThrow(/permanent/);
    expect(await martin.nameSession({ session: { id: 's1' }, name: 'Skala', about: 'Reviews' })).toMatchObject({ name: 'Skala', title: 'Skala · Reviews' }); // the same name again is fine
    expect(await martin.nameSession({ session: { id: 's1' }, about: '' })).toMatchObject({ name: 'Skala', title: 'Skala', description: 'Reviews services, networking and load behaviour on main.' });
    // The person renames (from the app), to a free name only.
    await expect(martin.nameSession({ session: { id: 's1' }, name: 'Shuttle', rename: true })).rejects.toThrow(/taken/);
    expect(await martin.nameSession({ session: { id: 's1' }, name: 'Skala II', rename: true })).toMatchObject({ name: 'Skala II', title: 'Skala II' });

    // The name survives everything else that touches the record, and addresses the session: "give that to Skala II".
    await martin.setSessionRole({ session: { id: 's1' }, role: 'worker', projects: ['Weave'] });
    const given = await martin.assign({ post: fix.id, session: { id: 'skala ii' } });
    expect(given).toMatchObject({ id: 's1', name: 'Skala II', role: 'worker', stack: [{ post: { id: fix.id } }] });
    expect((await martin.workers({ post: fix.id })).map((w) => w.title)).toEqual(['Skala II']);
    expect(await martin.doneWith({ session: { id: 'Skala II' } })).toMatchObject({ id: 's1', name: 'Skala II', stack: [] });
    // A fresh id that happens to be nobody's name is a new session, as before.
    expect((await martin.session({ id: 'Heddle' })).name).toBeUndefined();
  });
});

describe('archived and hidden sessions', () => {
  it('leaves sessions archived in the Claude app or hidden in Weave out of the workers, and brings them back', async () => {
    // The Claude app's session files, as it writes them: <account>/<org>/local_<id>.json
    const app = mkdtempSync(join(tmpdir(), 'weave-claude-app-'));
    dirs.push(app);
    const org = join(app, 'account', 'org');
    mkdirSync(org, { recursive: true });
    let tick = Date.now();
    const appSession = (cli: string, isArchived: boolean) => {
      const file = join(org, `local_${cli}.json`);
      writeFileSync(file, JSON.stringify({ sessionId: `local_${cli}`, cliSessionId: cli, isArchived, title: cli }));
      tick += 1000;
      utimesSync(file, new Date(tick), new Date(tick)); // a new mtime, as a real write gives
    };
    const before = process.env.WEAVE_CLAUDE_APP_SESSIONS;
    process.env.WEAVE_CLAUDE_APP_SESSIONS = app;
    const settle = () => new Promise((resolve) => setTimeout(resolve, 1100)); // the app's files are looked at once a second
    try {
      const martin = person('Martin');
      await martin.createProject({ name: 'Weave' });
      const fix = await martin.submit({ space: 'Weave', board: 'issues', title: 'Fix the login' });
      for (const id of ['w1', 'w2']) await martin.setSessionRole({ session: { id }, role: 'worker' });
      await martin.nameSession({ session: { id: 'w1' }, name: 'Skala' });
      const workers = async () => (await martin.workers({ post: fix.id })).map((w) => w.id).sort();
      expect(await workers()).toEqual(['w1', 'w2']);

      // Archived in the Claude app: still a session of yours, marked so, but no worker; unarchived, it's back.
      appSession('w1', true);
      appSession('w2', false);
      await settle();
      expect(await workers()).toEqual(['w2']);
      expect((await martin.sessions()).find((s) => s.id === 'w1')).toMatchObject({ archived: true, name: 'Skala' });
      expect((await martin.sessions()).find((s) => s.id === 'w2')?.archived).toBeUndefined();
      await expect(martin.assign({ post: fix.id, session: { id: 'w1' } })).rejects.toThrow(/doesn't take/);
      await expect(martin.nameSession({ session: { id: 'w3' }, name: 'skala' })).rejects.toThrow(/"Skala" is taken/); // its name stays taken
      appSession('w1', false);
      await settle();
      expect(await workers()).toEqual(['w1', 'w2']);

      // Hidden in Weave: the same, kept in the record through whatever else changes it, until unhidden.
      expect(await martin.hideSession({ session: { id: 'w2' }, hidden: true })).toMatchObject({ id: 'w2', hidden: true, role: 'worker' });
      await martin.workOn({ session: { id: 'w2' }, post: fix.id });
      expect((await martin.session({ id: 'w2' })).hidden).toBe(true);
      expect(await workers()).toEqual(['w1']);
      expect(await martin.hideSession({ session: { id: 'w2' }, hidden: false })).not.toHaveProperty('hidden');
      expect(await workers()).toEqual(['w1', 'w2']);

      // Unhide all brings back every hidden one, and only those.
      await martin.hideSession({ session: { id: 'w1' }, hidden: true });
      await martin.hideSession({ session: { id: 'w2' }, hidden: true });
      expect((await martin.unhideSessions()).map((s) => s.id).sort()).toEqual(['w1', 'w2']);
      expect((await martin.sessions()).filter((s) => s.hidden)).toEqual([]);
      expect(await martin.unhideSessions()).toEqual([]);
    } finally {
      if (before === undefined) delete process.env.WEAVE_CLAUDE_APP_SESSIONS;
      else process.env.WEAVE_CLAUDE_APP_SESSIONS = before;
    }
  });
});
