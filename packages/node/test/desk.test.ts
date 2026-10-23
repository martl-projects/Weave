import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { WeaveNode } from '../src/index.ts';

const dirs: string[] = [];
const temp = (prefix: string) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
};
afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe('your desk and its routines', () => {
  it('sets up a private desk with Journal and Ideas, a folder for the daily driver, and the first routines', async () => {
    const martin = WeaveNode.init('Martin', temp('weave-desk-'));
    const folder = join(temp('weave-desk-folder-'), 'Weave Desk');
    expect(await martin.desk()).toBeNull();

    const desk = await martin.setupDesk({ folder });
    expect(desk).toMatchObject({ space: { kind: 'project', name: 'Desk' }, folder });
    expect((await martin.boards(desk.space.id)).map((b) => b.name)).toEqual(['journal', 'ideas', 'issues']);
    expect((await martin.routines()).map((r) => [r.id, r.name, r.trigger.type])).toEqual([
      ['journal', 'Journal entry', 'schedule'],
      ['setup', 'Set up your desk', 'first-start'],
    ]);
    // First start: "Set up your desk" is waiting in Ideas, with its starting prompt.
    const ideas = await martin.posts({ space: desk.space.id, board: 'ideas' });
    expect(ideas.map((p) => [p.title, p.routine])).toEqual([['Set up your desk', { id: 'setup', occurrence: 'first-start' }]]);
    expect(ideas[0].prompt).toMatch(/Help me set up my Weave desk/);
    // The daily driver's instructions, and the folder known for the desk.
    expect(readFileSync(join(folder, 'CLAUDE.md'), 'utf8')).toMatch(/I'm Martin.*\n[\s\S]*private project "Desk"/);
    expect((await martin.workTarget({ post: ideas[0].id })).folders).toEqual([folder]);

    // Again: nothing new, and your CLAUDE.md stays as you left it.
    writeFileSync(join(folder, 'CLAUDE.md'), 'mine now');
    await martin.setupDesk({ folder });
    expect(readFileSync(join(folder, 'CLAUDE.md'), 'utf8')).toBe('mine now');
    expect((await martin.posts({ space: desk.space.id, board: 'ideas' })).length).toBe(1);
    expect((await martin.spaces()).filter((s) => s.kind === 'project').length).toBe(1);
  });

  it('puts a desk folder given by name in your user folder, and forgets the old one when it moves', async () => {
    const home = temp('weave-desk-home-');
    const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    try {
      const martin = WeaveNode.init('Martin', temp('weave-desk-'));
      expect(await martin.deskFolder()).toBe(join(home, 'Weave Desk'));
      const desk = await martin.setupDesk({ folder: 'Desk' });
      expect(desk.folder).toBe(join(home, 'Desk'));
      expect(existsSync(join(home, 'Desk', 'CLAUDE.md'))).toBe(true);
      const moved = await martin.setupDesk({ folder: join(home, 'Elsewhere') });
      expect(moved.folder).toBe(join(home, 'Elsewhere'));
      const [setup] = await martin.posts({ space: desk.space.id, board: 'ideas' });
      expect((await martin.workTarget({ post: setup.id })).folders).toEqual([join(home, 'Elsewhere')]);
    } finally {
      process.env.HOME = saved.HOME;
      process.env.USERPROFILE = saved.USERPROFILE;
    }
  });

  it("creates each day's item once, when its time has come", async () => {
    const martin = WeaveNode.init('Martin', temp('weave-desk-'));
    const desk = await martin.setupDesk({ folder: join(temp('weave-desk-folder-'), 'Desk') });
    const friday = (h: number, m = 0) => new Date(2026, 9, 23, h, m);

    expect(await martin.tickRoutines(friday(7, 59))).toEqual([]);
    const [entry] = await martin.tickRoutines(friday(8, 0));
    expect(entry).toMatchObject({ title: 'Friday, 23 October 2026', board: 'journal', routine: { id: 'journal', occurrence: '2026-10-23' } });
    expect(entry.text).toContain('## Plan');
    expect(entry.prompt).toMatch(/today's journal entry/);
    expect(await martin.tickRoutines(friday(8, 1))).toEqual([]); // once a day
    expect(await martin.tickRoutines(new Date(2026, 9, 25, 9, 0))).toEqual([]); // Sunday
    expect((await martin.routines()).find((r) => r.id === 'journal')).toMatchObject({ last: { post: entry.id, occurrence: '2026-10-23' } });

    // Your own routines: validated, run on demand, once per day.
    const standup = await martin.setRoutine({ name: 'Standup', trigger: { type: 'schedule', days: [1, 2, 3, 4, 5], time: '09:45' }, create: { board: 'ideas', title: 'Standup {day}', prompt: 'Summarize yesterday and today.' } });
    expect(standup.next).toBeDefined();
    const now = await martin.runRoutine({ id: standup.id });
    expect((await martin.runRoutine({ id: standup.id })).id).toBe(now.id);
    await expect(martin.setRoutine({ name: 'Bad', trigger: { type: 'schedule', days: [1], time: '9am' }, create: { board: 'ideas', title: 'x' } })).rejects.toThrow(/schedule/);
    await expect(martin.setRoutine({ name: 'Bad', trigger: { type: 'first-start' }, create: { board: 'nope', title: 'x' } })).rejects.toThrow();
    await martin.setRoutine({ id: standup.id, name: 'Standup', on: false, trigger: { type: 'schedule', days: [1, 2, 3, 4, 5], time: '09:45' }, create: { board: 'ideas', title: 'Standup {day}' } });
    expect(await martin.tickRoutines(new Date(2026, 9, 26, 10, 0))).toMatchObject([{ title: 'Monday, 26 October 2026' }]); // the journal only: Standup is off
    await martin.removeRoutine({ id: standup.id });
    expect((await martin.routines()).map((r) => r.id)).toEqual(['journal', 'setup']);
    expect(existsSync(join(desk.folder!, 'CLAUDE.md'))).toBe(true);
  });
});
