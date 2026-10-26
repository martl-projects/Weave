import { describe, expect, it } from 'vitest';
import { createIdentity, dueOccurrence, eventId, KIND_ROUTINE, nextRun, renderTitle, Replica, routinesOf, type Entry, type Json, type Routine } from '../src/index.ts';

const journal: Routine = {
  id: 'journal',
  name: 'Journal entry',
  on: true,
  trigger: { type: 'schedule', days: [1, 2, 3, 4, 5], time: '08:00' },
  create: { board: 'journal', title: '{date}' },
  time: '2026-10-01T00:00:00.000Z',
  by: 'did:key:z6Mk' as Routine['by'],
};

describe('routines', () => {
  it('are due on their days once their time has come', () => {
    expect(dueOccurrence(journal, new Date(2026, 9, 23, 7, 59))).toBeUndefined(); // Friday, before 08:00
    expect(dueOccurrence(journal, new Date(2026, 9, 23, 8, 0))).toBe('2026-10-23');
    expect(dueOccurrence(journal, new Date(2026, 9, 23, 22, 30))).toBe('2026-10-23'); // later that day (the computer was off)
    expect(dueOccurrence(journal, new Date(2026, 9, 25, 9, 0))).toBeUndefined(); // Sunday
    expect(dueOccurrence({ ...journal, on: false }, new Date(2026, 9, 23, 9, 0))).toBeUndefined();
    expect(nextRun(journal, new Date(2026, 9, 23, 9, 0))).toEqual(new Date(2026, 9, 26, 8, 0)); // after Friday comes Monday
  });

  it('name their items from a pattern', () => {
    const day = new Date(2026, 9, 23, 8, 0);
    expect(renderTitle('{date}', day)).toBe('Friday, 23 October 2026');
    expect(renderTitle('Day Planning {day}', day)).toBe('Day Planning 23.10.2026');
    expect(renderTitle('{weekday} standup', day)).toBe('Friday standup');
  });

  it("keep the maintainers' latest record per routine, and can be removed", () => {
    const replica = new Replica();
    const me = createIdentity();
    const other = createIdentity();
    const entries: Entry[] = [];
    const record = (who: typeof me, body: Json, time: string) => {
      const event = replica.append(who, { kind: KIND_ROUTINE, body, time });
      entries.push({ id: eventId(event), event, kind: KIND_ROUTINE, body });
    };
    const create = { board: 'journal', title: '{date}', prompt: 'Journal with me.' };
    record(me, { id: 'journal', name: 'Journal entry', trigger: { type: 'schedule', days: [1, 2, 3, 4, 5], time: '08:00' }, create }, '2026-10-20T08:00:00.000Z');
    record(me, { id: 'journal', name: 'Journal entry', trigger: { type: 'schedule', days: [1, 2, 3, 4, 5], time: '07:30' }, create }, '2026-10-21T08:00:00.000Z');
    record(me, { id: 'setup', name: 'Set up your desk', trigger: { type: 'first-start' }, create: { board: 'ideas', title: 'Set up your desk' } }, '2026-10-21T08:00:00.000Z');
    record(me, { id: 'bad', name: 'Bad', trigger: { type: 'schedule', days: [9], time: '25:00' }, create }, '2026-10-21T08:00:00.000Z');
    record(other, { id: 'sneaky', name: 'Not a maintainer', trigger: { type: 'first-start' }, create }, '2026-10-21T08:00:00.000Z');
    record(me, { id: 'setup', removed: true }, '2026-10-22T08:00:00.000Z');
    const routines = routinesOf(entries, new Set([me.author]));
    expect(routines.map((r) => [r.id, r.trigger.type === 'schedule' ? r.trigger.time : r.trigger.type])).toEqual([['journal', '07:30']]);
    expect(routines[0].create).toEqual(create);
  });
});
