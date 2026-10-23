import { useState, type FormEvent } from 'react';
import type { BoardInfo, DeskInfo, PostInfo, RoutineInfo, SpaceInfo } from '@weave/node/client';
import { ago, api, bump, navigate, useApi } from './lib.ts';
import { spaceHref } from './posts.tsx';
import { ask, attempt, AsyncButton, Modal } from './ui.tsx';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS = [1, 2, 3, 4, 5];

/** "Weekdays 08:00", "Mon, Fri 15:00", "Every day 07:30", "At first start". */
export function triggerText(trigger: RoutineInfo['trigger']): string {
  if (trigger.type === 'first-start') return 'At first start';
  const days = trigger.days;
  const which =
    days.length === 7 ? 'Every day' : days.length === 5 && WEEKDAYS.every((d) => days.includes(d)) ? 'Weekdays' : days.length === 2 && days.includes(0) && days.includes(6) ? 'Weekends' : days.map((d) => DAYS[d]).join(', ');
  return `${which} ${trigger.time}`;
}

type Draft = { id?: string; name: string; schedule: boolean; days: number[]; time: string; board: string; title: string; text: string; prompt: string; on: boolean };

const draftOf = (r?: RoutineInfo, boards: BoardInfo[] = []): Draft => ({
  ...(r ? { id: r.id } : {}),
  name: r?.name ?? '',
  schedule: r ? r.trigger.type === 'schedule' : true,
  days: r?.trigger.type === 'schedule' ? r.trigger.days : WEEKDAYS,
  time: r?.trigger.type === 'schedule' ? r.trigger.time : '09:00',
  board: r?.create.board ?? boards.find((b) => b.type === 'posts')?.name ?? 'ideas',
  title: r?.create.title ?? '',
  text: r?.create.text ?? '',
  prompt: r?.create.prompt ?? '',
  on: r?.on ?? true,
});

function RoutineEditor({ project, boards, routine, onClose }: { project: SpaceInfo; boards: BoardInfo[]; routine?: RoutineInfo; onClose(): void }) {
  const [d, setD] = useState<Draft>(() => draftOf(routine, boards));
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const saved = await attempt(
      () =>
        api<RoutineInfo>('setRoutine', {
          space: project.id,
          ...(d.id ? { id: d.id } : {}),
          name: d.name,
          on: d.on,
          trigger: d.schedule ? { type: 'schedule', days: d.days, time: d.time } : { type: 'first-start' },
          create: { board: d.board, title: d.title, ...(d.text ? { text: d.text } : {}), ...(d.prompt ? { prompt: d.prompt } : {}) },
        }),
      d.id ? 'Routine saved' : 'Routine added',
    );
    if (saved) {
      bump();
      onClose();
    }
  };
  return (
    <Modal title={routine ? `Routine: ${routine.name}` : 'New routine'} onClose={onClose} wide>
      <form className="form" onSubmit={save}>
        <div className="field-row-stacked">
          <label htmlFor="routine-name">Name</label>
          <input id="routine-name" required maxLength={100} placeholder="Standup" value={d.name} onChange={(e) => set({ name: e.target.value })} />
        </div>
        <fieldset>
          <legend>When</legend>
          <div className="field-row">
            <input type="radio" id="routine-schedule" name="routine-when" checked={d.schedule} onChange={() => set({ schedule: true })} />
            <label htmlFor="routine-schedule">On these days, at</label>
            <input type="time" aria-label="Time" value={d.time} disabled={!d.schedule} onChange={(e) => set({ time: e.target.value })} />
          </div>
          <div className="field-row routine-days">
            {DAYS.map((name, day) => (
              <span key={day}>
                <input
                  type="checkbox"
                  id={`routine-day-${day}`}
                  disabled={!d.schedule}
                  checked={d.days.includes(day)}
                  onChange={(e) => set({ days: e.target.checked ? [...d.days, day].sort() : d.days.filter((x) => x !== day) })}
                />
                <label htmlFor={`routine-day-${day}`}>{name}</label>
              </span>
            ))}
          </div>
          <div className="field-row">
            <input type="radio" id="routine-first" name="routine-when" checked={!d.schedule} onChange={() => set({ schedule: false })} />
            <label htmlFor="routine-first">Once, at first start (when your desk is set up)</label>
          </div>
        </fieldset>
        <fieldset>
          <legend>Creates</legend>
          <div className="field-row">
            <label htmlFor="routine-board">On the board</label>
            <select id="routine-board" value={d.board} onChange={(e) => set({ board: e.target.value })}>
              {boards.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.title}
                </option>
              ))}
            </select>
          </div>
          <div className="field-row-stacked">
            <label htmlFor="routine-title">Title: {'{date}'} Friday, 23 October 2026 · {'{day}'} 23.10.2026 · {'{weekday}'} Friday</label>
            <input id="routine-title" required maxLength={200} placeholder="Standup {day}" value={d.title} onChange={(e) => set({ title: e.target.value })} />
          </div>
          <div className="field-row-stacked">
            <label htmlFor="routine-text">Text to start from (optional)</label>
            <textarea id="routine-text" rows={3} value={d.text} onChange={(e) => set({ text: e.target.value })} />
          </div>
          <div className="field-row-stacked">
            <label htmlFor="routine-prompt">Starting prompt: what the session should do with it</label>
            <textarea id="routine-prompt" rows={4} maxLength={4000} placeholder="Summarize what I did yesterday and what's planned today, and ask what's blocking me." value={d.prompt} onChange={(e) => set({ prompt: e.target.value })} />
          </div>
        </fieldset>
        <div className="field-row">
          <input type="checkbox" id="routine-on" checked={d.on} onChange={(e) => set({ on: e.target.checked })} />
          <label htmlFor="routine-on">On</label>
        </div>
        <div className="buttons">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="default" disabled={d.schedule && d.days.length === 0}>
            {routine ? 'Save' : 'Add routine'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** A project's routines, in its settings (maintainers): what each creates, when, and when it last ran. */
export function RoutineSettings({ project, boards }: { project: SpaceInfo; boards: BoardInfo[] }) {
  const { data: routines } = useApi(() => api<RoutineInfo[]>('routines', { space: project.id }), [project.id]);
  const [editing, setEditing] = useState<RoutineInfo | 'new'>();
  const run = async (r: RoutineInfo) => {
    const post = await attempt(() => api<PostInfo>('runRoutine', { space: project.id, id: r.id }));
    if (post) {
      bump();
      navigate(`#/post/${post.id}`);
    }
  };
  const toggle = (r: RoutineInfo) => attempt(() => api('setRoutine', { space: project.id, id: r.id, name: r.name, on: !r.on, trigger: r.trigger, create: r.create }).then(bump));
  const remove = async (r: RoutineInfo) => {
    if (await ask(`Remove the routine “${r.name}”? The items it made stay.`, 'Remove')) await attempt(() => api('removeRoutine', { space: project.id, id: r.id }).then(bump), 'Routine removed');
  };
  return (
    <fieldset>
      <legend>Routines</legend>
      <p className="small">Each routine creates a work item when it's time, once per day, with its starting prompt: Ctrl+click the item to work on it in Claude.</p>
      {routines?.map((r) => (
        <div className="field-row routine-row" key={r.id}>
          <input type="checkbox" id={`routine-on-${r.id}`} checked={r.on} onChange={() => void toggle(r)} />
          <label htmlFor={`routine-on-${r.id}`} className="grow">
            <b>{r.name}</b> · {triggerText(r.trigger)} → {r.create.board}: “{r.create.title}”
            <span className="small muted">
              {r.last ? ` · last ${ago(r.last.time)}` : ' · not run yet'}
              {r.next && r.on ? ` · next ${new Date(r.next).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
            </span>
          </label>
          <AsyncButton onClick={() => run(r)}>Run now</AsyncButton>
          <button onClick={() => setEditing(r)}>Edit</button>
          <button onClick={() => void remove(r)}>Remove</button>
        </div>
      ))}
      {routines?.length === 0 && <p className="small">No routines yet.</p>}
      <button onClick={() => setEditing('new')}>New routine…</button>
      {editing && <RoutineEditor project={project} boards={boards.filter((b) => b.type !== 'proposals')} routine={editing === 'new' ? undefined : editing} onClose={() => setEditing(undefined)} />}
    </fieldset>
  );
}

/** Set up your desk: a private project with Journal and Ideas, the folder where your daily driver works, and the first routines. */
export function SetupDeskDialog({ onClose }: { onClose(): void }) {
  const { data: desk } = useApi(() => api<DeskInfo | null>('desk'), []);
  const [folder, setFolder] = useState('');
  const setup = async (e: FormEvent) => {
    e.preventDefault();
    const made = await attempt(() => api<DeskInfo>('setupDesk', folder.trim() ? { folder: folder.trim() } : {}), 'Your desk is set up');
    if (made) {
      bump();
      onClose();
      navigate(spaceHref(made.space));
    }
  };
  return (
    <Modal title={desk ? 'Your desk' : 'Set up your desk'} onClose={onClose}>
      <form className="form" onSubmit={setup}>
        {desk ? (
          <p>
            Your desk is <a href={spaceHref(desk.space)}>{desk.space.name}</a>
            {desk.folder ? <>, and your daily driver works in {desk.folder}</> : null}. Setting it up again only adds what's missing.
          </p>
        ) : (
          <p>
            Your desk is a private project for your journal and ideas, with routines that make work items for you (a journal entry every weekday at 08:00, to start). Your daily driver, a Claude Code session, works in a folder of its own, with a CLAUDE.md describing how you work.
          </p>
        )}
        <div className="field-row-stacked">
          <label htmlFor="desk-folder">The daily driver's folder</label>
          <input id="desk-folder" placeholder={desk?.folder ?? 'Weave Desk, in your user folder'} value={folder} onChange={(e) => setFolder(e.target.value)} />
        </div>
        <div className="buttons">
          <button type="button" onClick={onClose}>
            Close
          </button>
          <button className="default">{desk ? 'Set up again' : 'Set up my desk'}</button>
        </div>
      </form>
    </Modal>
  );
}
