import { describe, expect, it } from 'vitest';
import { createIdentity, eventId, KIND_SESSION, pushOnto, reorder, Replica, sessionsOf, takeOff, type Entry, type Json } from '../src/index.ts';

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
});
