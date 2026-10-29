import { describe, expect, it } from 'vitest';
import { createIdentity, eventId, KIND_SESSION, nameProblem, pushOnto, reorder, Replica, sessionsOf, sessionTitle, takeOff, type Entry, type Json } from '../src/index.ts';

describe('session stacks', () => {
  it('puts new work on top and brings interrupted work back when it is done', () => {
    let stack = pushOnto([], 'journal', 't1');
    stack = pushOnto(stack, 'standup', 't2'); // Standup interrupts the journal
    expect(stack.map((s) => s.post)).toEqual(['standup', 'journal']);
    stack = pushOnto(stack, 'hotfix', 't3');
    expect(stack.map((s) => s.post)).toEqual(['hotfix', 'standup', 'journal']);
    stack = takeOff(stack, undefined, 't4'); // hotfix done: back to standup, current from now
    expect(stack).toEqual([
      { post: 'standup', since: 't4' },
      { post: 'journal', since: 't1' },
    ]);
    stack = takeOff(stack, 'journal', 't5'); // something below can go too; the top stays as it was
    expect(stack).toEqual([{ post: 'standup', since: 't4' }]);
    stack = pushOnto(pushOnto(stack, 'journal', 't6'), 'standup', 't7'); // already on it: moves up, once
    expect(stack.map((s) => s.post)).toEqual(['standup', 'journal']);
    expect(reorder(pushOnto(stack, 'ideas', 't8'), ['journal']).map((s) => s.post)).toEqual(['journal', 'ideas', 'standup']);
  });

  it('keeps the latest record per session', () => {
    const replica = new Replica();
    const me = createIdentity();
    const entries: Entry[] = [];
    const record = (body: Json, time: string) => {
      const event = replica.append(me, { kind: KIND_SESSION, body, time });
      entries.push({ id: eventId(event), event, kind: KIND_SESSION, body });
    };
    record({ provider: 'claude-code', id: 's1', folder: 'C:\\desk', stack: [{ post: 'journal', since: 't1' }] }, '2026-10-23T08:00:00.000Z');
    record({ provider: 'claude-code', id: 's1', folder: 'C:\\desk', title: 'Day planning', stack: [{ post: 'standup', since: 't2' }, { post: 'journal', since: 't1' }] }, '2026-10-23T09:45:00.000Z');
    record({ provider: 'claude-code', id: 's2', stack: [] }, '2026-10-23T09:00:00.000Z');
    record({ id: 'no-provider', stack: [] }, '2026-10-23T09:00:00.000Z');
    const sessions = sessionsOf(entries);
    expect([...sessions.keys()]).toEqual(['claude-code:s1', 'claude-code:s2']);
    expect(sessions.get('claude-code:s1')).toMatchObject({ title: 'Day planning', folder: 'C:\\desk', stack: [{ post: 'standup' }, { post: 'journal' }] });
  });

  it('keeps a session’s permanent name and what it is about, and titles it "name · about"', () => {
    const replica = new Replica();
    const me = createIdentity();
    const entries: Entry[] = [];
    const record = (body: Json, time: string) => {
      const event = replica.append(me, { kind: KIND_SESSION, body, time });
      entries.push({ id: eventId(event), event, kind: KIND_SESSION, body });
    };
    record({ provider: 'claude-code', id: 's1', title: 'Weave naming feature', stack: [] }, '2026-10-29T08:00:00.000Z');
    record({ provider: 'claude-code', id: 's1', title: 'Weave naming feature', name: 'Skala', about: 'Service-, Netzwerk- und Last-Review', description: 'Reviews services, networking and load behaviour on main.', stack: [] }, '2026-10-29T08:01:00.000Z');
    const s1 = sessionsOf(entries).get('claude-code:s1')!;
    expect(s1).toMatchObject({ name: 'Skala', about: 'Service-, Netzwerk- und Last-Review', description: 'Reviews services, networking and load behaviour on main.', title: 'Weave naming feature' });
    expect(sessionTitle(s1)).toBe('Skala · Service-, Netzwerk- und Last-Review');
    expect(sessionTitle({ name: 'Skala' })).toBe('Skala');
    expect(sessionTitle({ title: 'Weave naming feature' })).toBe('Weave naming feature'); // unnamed: the provider's title
    expect(sessionTitle({})).toBeUndefined();
  });

  it('takes short pronounceable names that nobody around has', () => {
    const taken = ['Skala', 'martl', 'Phil', undefined];
    expect(nameProblem('Shuttle', taken)).toBeUndefined();
    expect(nameProblem('Shuttle II', taken)).toBeUndefined();
    expect(nameProblem("O'Neill-2", taken)).toBeUndefined();
    expect(nameProblem('Ärmel', taken)).toBeUndefined();
    expect(nameProblem('skala', taken)).toBe('"Skala" is taken');
    expect(nameProblem(' PHIL ', taken)).toBe('"Phil" is taken');
    expect(nameProblem('S', taken)).toMatch(/2 to 24/);
    expect(nameProblem('2fast', taken)).toMatch(/2 to 24/);
    expect(nameProblem('Skala · free', taken)).toMatch(/2 to 24/);
    expect(nameProblem('a'.repeat(25), taken)).toMatch(/2 to 24/);
    expect(nameProblem('two  spaces', taken)).toMatch(/2 to 24/);
  });
});
