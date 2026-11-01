import { useState, type FormEvent } from 'react';
import type { BoardInfo, DeskInfo, PostInfo, ProjectInfo, RoutineInfo, SpaceInfo } from '@weave/node/client';
import { Icon } from './icons.tsx';
import { Page } from './views.tsx';
import { ago, api, bridge, bump, navigate, useApi } from './lib.ts';
import { spaceHref } from './posts.tsx';
import { ask, attempt, AsyncButton, Modal } from './ui.tsx';
import { currentTexts, t, T, useTexts } from './texts.tsx';

/** The days of the week, Sunday first (as Date.getDay counts), short, in the reader's language. */
const dayName = (day: number) => new Intl.DateTimeFormat(currentTexts().locale, { weekday: 'short' }).format(new Date(2023, 0, 1 + day));
const WEEKDAYS = [1, 2, 3, 4, 5];

/** "Weekdays 08:00", "Mon, Fri 15:00", "Every day 07:30", "At first start". */
export function triggerText(trigger: RoutineInfo['trigger']): string {
  if (trigger.type === 'first-start') return t('routine.at.first.start');
  const days = trigger.days;
  const which =
    days.length === 7 ? t('routine.every.day') : days.length === 5 && WEEKDAYS.every((d) => days.includes(d)) ? t('routine.weekdays') : days.length === 2 && days.includes(0) && days.includes(6) ? t('routine.weekends') : days.map(dayName).join(', ');
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
  const { t } = useTexts();
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
      t(d.id ? 'routine.saved' : 'routine.added'),
    );
    if (saved) {
      bump();
      onClose();
    }
  };
  return (
    <Modal title={routine ? t('routine.title', { name: routine.name }) : t('routine.new.title')} onClose={onClose} wide>
      <form className="form" onSubmit={save}>
        <div className="field-row-stacked">
          <label htmlFor="routine-name">{t('field.name')}</label>
          <input id="routine-name" required maxLength={100} placeholder={t('routine.name.placeholder')} value={d.name} onChange={(e) => set({ name: e.target.value })} />
        </div>
        <fieldset>
          <legend>{t('routine.when')}</legend>
          <div className="field-row">
            <input type="radio" id="routine-schedule" name="routine-when" checked={d.schedule} onChange={() => set({ schedule: true })} />
            <label htmlFor="routine-schedule">{t('routine.on.days.at')}</label>
            <input type="time" aria-label={t('routine.time')} value={d.time} disabled={!d.schedule} onChange={(e) => set({ time: e.target.value })} />
          </div>
          <div className="field-row routine-days">
            {[0, 1, 2, 3, 4, 5, 6].map((day) => (
              <span key={day}>
                <input
                  type="checkbox"
                  id={`routine-day-${day}`}
                  disabled={!d.schedule}
                  checked={d.days.includes(day)}
                  onChange={(e) => set({ days: e.target.checked ? [...d.days, day].sort() : d.days.filter((x) => x !== day) })}
                />
                <label htmlFor={`routine-day-${day}`}>{dayName(day)}</label>
              </span>
            ))}
          </div>
          <div className="field-row">
            <input type="radio" id="routine-first" name="routine-when" checked={!d.schedule} onChange={() => set({ schedule: false })} />
            <label htmlFor="routine-first">{t('routine.once.first.start')}</label>
          </div>
        </fieldset>
        <fieldset>
          <legend>{t('routine.creates')}</legend>
          <div className="field-row">
            <label htmlFor="routine-board">{t('routine.on.board')}</label>
            <select id="routine-board" value={d.board} onChange={(e) => set({ board: e.target.value })}>
              {boards.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.title}
                </option>
              ))}
            </select>
          </div>
          <div className="field-row-stacked">
            <label htmlFor="routine-title">{t('routine.title.field', { date: '{date}', day: '{day}', weekday: '{weekday}' })}</label>
            <input id="routine-title" required maxLength={200} placeholder={t('routine.title.placeholder')} value={d.title} onChange={(e) => set({ title: e.target.value })} />
          </div>
          <div className="field-row-stacked">
            <label htmlFor="routine-text">{t('routine.text')}</label>
            <textarea id="routine-text" rows={3} value={d.text} onChange={(e) => set({ text: e.target.value })} />
          </div>
          <div className="field-row-stacked">
            <label htmlFor="routine-prompt">{t('routine.prompt')}</label>
            <textarea id="routine-prompt" rows={4} maxLength={4000} placeholder={t('routine.prompt.placeholder')} value={d.prompt} onChange={(e) => set({ prompt: e.target.value })} />
          </div>
        </fieldset>
        <div className="field-row">
          <input type="checkbox" id="routine-on" checked={d.on} onChange={(e) => set({ on: e.target.checked })} />
          <label htmlFor="routine-on">{t('routine.on')}</label>
        </div>
        <div className="buttons">
          <button type="button" onClick={onClose}>
            {t('button.cancel')}
          </button>
          <button className="default" disabled={d.schedule && d.days.length === 0}>
            {t(routine ? 'button.save' : 'routine.add')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** A project's routines (its Routines tab): what each creates, when, and when it last ran; maintainers change them. */
export function RoutineSettings({ project, boards, maintainer = true }: { project: SpaceInfo; boards: BoardInfo[]; maintainer?: boolean }) {
  const { t, locale } = useTexts();
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
    if (await ask(t('routine.remove.ask', { name: r.name }), t('button.remove'))) await attempt(() => api('removeRoutine', { space: project.id, id: r.id }).then(bump), t('routine.removed'));
  };
  return (
    <div className="routines">
      <p className="small">{t('routines.about')}</p>
      {routines?.map((r) => (
        <fieldset className={`routine-card${r.on ? '' : ' off'}`} key={r.id}>
          <div className="routine-head">
            <input type="checkbox" id={`routine-on-${r.id}`} checked={r.on} disabled={!maintainer} onChange={() => void toggle(r)} aria-label={t(r.on ? 'routine.on' : 'routine.off')} />
            <label htmlFor={`routine-on-${r.id}`} className="grow">
              <b>{r.name}</b>
            </label>
            <span className="routine-when">
              <Icon name="clock" /> {triggerText(r.trigger)}
            </span>
          </div>
          <div className="routine-what small">
            {t('routine.creates.in', { title: r.create.title, board: r.create.board })}
            {r.create.prompt ? t('routine.starting.prompt', { prompt: r.create.prompt.length > 140 ? `${r.create.prompt.slice(0, 140)}…` : r.create.prompt }) : null}
          </div>
          <div className="routine-foot">
            <span className="small muted grow">
              {r.last ? <a href={`#/post/${r.last.post}`}>{t('routine.last', { time: r.last.time })}</a> : t('routine.not.run')}
              {r.next && r.on ? t('routine.next', { when: new Date(r.next).toLocaleString(locale, { weekday: 'short', hour: '2-digit', minute: '2-digit' }) }) : ''}
              {!r.on ? t('routine.off.suffix') : ''}
            </span>
            {maintainer && (
              <>
                <AsyncButton onClick={() => run(r)}>{t('routine.run.now')}</AsyncButton>
                <button onClick={() => setEditing(r)}>{t('button.edit')}</button>
                <button onClick={() => void remove(r)}>{t('button.remove')}</button>
              </>
            )}
          </div>
        </fieldset>
      ))}
      {routines?.length === 0 && <p className="empty">{t(maintainer ? 'routines.none.add' : 'routines.none')}</p>}
      {maintainer && (
        <button className="default" onClick={() => setEditing('new')}>
          {t('routines.new')}
        </button>
      )}
      {editing && <RoutineEditor project={project} boards={boards.filter((b) => b.type !== 'proposals')} routine={editing === 'new' ? undefined : editing} onClose={() => setEditing(undefined)} />}
    </div>
  );
}

/** A project's Routines tab. */
export function RoutinesPage({ project }: { project: SpaceInfo }) {
  const { t } = useTexts();
  const { data: info } = useApi(() => api<ProjectInfo>('project', project.id), [project.id]);
  const { data: boards } = useApi(() => api<BoardInfo[]>('boards', project.id), [project.id]);
  return (
    <Page
      title={
        <>
          <Icon name="clock" /> {t('routines.page.title', { project: project.name })}
        </>
      }
    >
      {info && boards ? <RoutineSettings project={project} boards={boards} maintainer={info.maintainer} /> : null}
    </Page>
  );
}

/** Set up your desk: a private project with Journal and Ideas, the folder where your daily driver works, and the first routines. */
export function SetupDeskDialog({ onClose }: { onClose(): void }) {
  const { t } = useTexts();
  const { data: desk } = useApi(() => api<DeskInfo | null>('desk'), []);
  const { data: current } = useApi(() => api<string>('deskFolder'), []);
  const [folder, setFolder] = useState('');
  const choose = async () => {
    const picked = await bridge.pickFolder(t('desk.folder.pick'));
    if (picked) setFolder(picked);
  };
  const setup = async (e: FormEvent) => {
    e.preventDefault();
    const made = await attempt(() => api<DeskInfo>('setupDesk', folder.trim() ? { folder: folder.trim() } : {}), t('desk.set.up'));
    if (made) {
      bump();
      onClose();
      navigate(spaceHref(made.space));
    }
  };
  return (
    <Modal title={t(desk ? 'desk.title' : 'desk.setup.title')} onClose={onClose}>
      <form className="form" onSubmit={setup}>
        {desk ? (
          <p>
            <T name={desk.folder ? 'desk.is.with.folder' : 'desk.is'} values={{ space: <a href={spaceHref(desk.space)}>{desk.space.name}</a>, folder: desk.folder }} />
          </p>
        ) : (
          <p>{t('desk.about')}</p>
        )}
        <div className="field-row-stacked">
          <label htmlFor="desk-folder">{t('desk.folder')}</label>
          <div className="field-row">
            <input id="desk-folder" className="grow" placeholder={current ?? ''} value={folder} onChange={(e) => setFolder(e.target.value)} />
            <button type="button" onClick={() => void choose()}>
              {t('button.choose')}
            </button>
          </div>
        </div>
        <div className="buttons">
          <button type="button" onClick={onClose}>
            {t('button.close')}
          </button>
          <button className="default">{t(desk ? 'desk.setup.again' : 'desk.setup')}</button>
        </div>
      </form>
    </Modal>
  );
}
