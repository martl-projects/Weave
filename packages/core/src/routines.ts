import type { Json } from './bytes.ts';
import type { Entry } from './collab.ts';
import type { Did } from './keys.ts';
import { TEXT_LIMITS } from './limits.ts';

/*
 * Routines: a trigger and a work item to create when it fires, kept in a
 * project (your desk) by its maintainers. Each occurrence is created once: the
 * post it makes carries `routine: {id, occurrence}` (occurrence: the local date
 * for scheduled ones), so a second device or a restart finds it and doesn't
 * make another.
 *
 *   weave.routine  {id, name, on, trigger, create}   maintainers; the latest per id counts
 *     trigger: {type: 'schedule', days: [0..6] (0 = Sunday), time: 'HH:MM'} | {type: 'first-start'}
 *     create:  {board, title, text?, prompt?}        title: a pattern ({date}, {day}, {weekday})
 */
export const KIND_ROUTINE = 'weave.routine';

export type RoutineTrigger = { type: 'schedule'; days: number[]; time: string } | { type: 'first-start' };

export interface RoutineCreate {
  board: string;
  /** A pattern: {date} "Thursday, 23 October 2026", {day} "23.10.2026", {weekday} "Thursday". */
  title: string;
  /** The body to start from. */
  text?: string;
  /** The starting prompt: what a session should do with the item. */
  prompt?: string;
}

export interface Routine {
  id: string;
  name: string;
  on: boolean;
  trigger: RoutineTrigger;
  create: RoutineCreate;
  /** When it was last changed, and by whom. */
  time: string;
  by: Did;
}

const field = (body: Json, key: string): unknown => (body && typeof body === 'object' && !Array.isArray(body) ? body[key] : undefined);
const str = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max) : '');
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function parseTrigger(value: unknown): RoutineTrigger | undefined {
  const type = field(value as Json, 'type');
  if (type === 'first-start') return { type };
  if (type !== 'schedule') return undefined;
  const time = str(field(value as Json, 'time'), 5);
  const days = field(value as Json, 'days');
  if (!TIME.test(time) || !Array.isArray(days)) return undefined;
  const valid = [...new Set(days.filter((d): d is number => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6))].sort();
  return valid.length ? { type, days: valid, time } : undefined;
}

export function parseCreate(value: unknown): RoutineCreate | undefined {
  const board = str(field(value as Json, 'board'), 40).trim();
  const title = str(field(value as Json, 'title'), TEXT_LIMITS.title).trim();
  if (!board || !title) return undefined;
  const text = str(field(value as Json, 'text'), TEXT_LIMITS.text);
  const prompt = str(field(value as Json, 'prompt'), TEXT_LIMITS.prompt).trim();
  return { board, title, ...(text ? { text } : {}), ...(prompt ? { prompt } : {}) };
}

/** A project's routines: the latest record per id from its maintainers. */
export function routinesOf(entries: Entry[], maintainers: Set<Did>): Routine[] {
  const out = new Map<string, Routine>();
  const sorted = entries.filter((e) => e.kind === KIND_ROUTINE && maintainers.has(e.event.author)).sort((a, b) => a.event.time.localeCompare(b.event.time) || a.event.seq - b.event.seq);
  for (const e of sorted) {
    const id = str(field(e.body, 'id'), 60).trim();
    const name = str(field(e.body, 'name'), 100).trim();
    const trigger = parseTrigger(field(e.body, 'trigger'));
    const create = parseCreate(field(e.body, 'create'));
    if (!id) continue;
    if (field(e.body, 'removed') === true) {
      out.delete(id);
      continue;
    }
    if (!name || !trigger || !create) continue;
    out.set(id, { id, name, on: field(e.body, 'on') !== false, trigger, create, time: e.event.time, by: e.event.author });
  }
  return [...out.values()];
}

/** The local date as an occurrence key: 2026-10-23. */
export const dayKey = (date: Date): string => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** Today's occurrence of a scheduled routine, if it is due (today is one of its days and its time has come). */
export function dueOccurrence(routine: Routine, now: Date): string | undefined {
  if (!routine.on || routine.trigger.type !== 'schedule') return undefined;
  if (!routine.trigger.days.includes(now.getDay())) return undefined;
  const [h, m] = routine.trigger.time.split(':').map(Number);
  return now.getHours() * 60 + now.getMinutes() >= h * 60 + m ? dayKey(now) : undefined;
}

/** The next time a scheduled routine fires, after `now`. */
export function nextRun(routine: Routine, now: Date): Date | undefined {
  if (!routine.on || routine.trigger.type !== 'schedule') return undefined;
  const [h, m] = routine.trigger.time.split(':').map(Number);
  for (let i = 0; i <= 7; i++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, h, m);
    if (routine.trigger.days.includes(day.getDay()) && day > now) return day;
  }
  return undefined;
}

/** A title pattern for a date: {date} "Thursday, 23 October 2026", {day} "23.10.2026", {weekday} "Thursday". */
export function renderTitle(pattern: string, date: Date): string {
  const weekday = date.toLocaleDateString('en-GB', { weekday: 'long' });
  const long = `${weekday}, ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`;
  const day = `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;
  return pattern.replaceAll('{date}', long).replaceAll('{day}', day).replaceAll('{weekday}', weekday).slice(0, TEXT_LIMITS.title);
}
