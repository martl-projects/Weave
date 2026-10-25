import { useEffect, useState } from 'react';
import type { SessionInfo, SpaceInfo } from '@weave/node/client';
import { Icon } from './icons.tsx';
import { Page } from './views.tsx';
import { ago, api, bridge, bump, useApi } from './lib.ts';
import { attempt, Modal } from './ui.tsx';

export const folderName = (folder?: string) => folder?.split(/[\\/]/).filter(Boolean).pop();

/** Running: the session wrote to its transcript in the last two minutes. */
export const running = (s: SessionInfo) => !!s.active && Date.now() - Date.parse(s.active) < 2 * 60 * 1000;

const ref = (s: SessionInfo) => ({ provider: s.provider, id: s.id });

/** What a session is on now, and what it finished last. */
function Doing({ session }: { session: SessionInfo }) {
  const [top, ...waiting] = session.stack;
  const title = (p: SessionInfo['stack'][number]['post']) => ('missing' in p ? 'a post you can’t see' : p.title);
  return (
    <span className="session-doing">
      {top ? `on: ${title(top.post)}` : 'free'}
      {waiting.length ? ` · ${waiting.length} waiting` : ''}
      {session.last ? ` · last finished: ${title(session.last.post)} (${ago(session.last.time)})` : ''}
    </span>
  );
}

const status = (s: SessionInfo) => (running(s) ? 'running' : s.active ? `active ${ago(s.active)}` : `changed ${ago(s.time)}`);

/** One session: its job, the projects it takes and whether it takes work now. */
function SessionRow({ session, projects }: { session: SessionInfo; projects: SpaceInfo[] }) {
  const set = (change: { role?: 'driver' | 'worker' | null; projects?: string[]; available?: boolean }) =>
    attempt(() => api('setSessionRole', { session: ref(session), ...change }).then(bump));
  const takes = session.projects?.map((p) => p.id) ?? [];
  const toggle = (id: string) => set({ projects: takes.includes(id) ? takes.filter((p) => p !== id) : [...takes, id] });
  const key = `${session.provider}-${session.id}`;
  return (
    <fieldset className={`session-card${session.role ? ` ${session.role}` : ''}${running(session) ? ' running' : ''}`}>
      <div className="session-head">
        <b className="grow">{session.title ?? 'Untitled session'}</b>
        <span className="small">{[folderName(session.folder), status(session)].filter(Boolean).join(' · ')}</span>
        {session.host && bridge.showSession && (
          <button onClick={() => void attempt(() => bridge.showSession!(session.host!))} title="Bring it to the front in the Claude app">
            Open in Claude
          </button>
        )}
      </div>
      <Doing session={session} />
      <div className="session-job">
        <label htmlFor={`role-${key}`}>Job:</label>
        <select id={`role-${key}`} value={session.role ?? ''} onChange={(e) => void set({ role: (e.target.value || null) as 'driver' | 'worker' | null })}>
          <option value="">none</option>
          <option value="worker">Worker</option>
          <option value="driver">Daily driver</option>
        </select>
        {session.role && (
          <>
            <input type="checkbox" id={`available-${key}`} checked={!!session.available} onChange={() => void set({ available: !session.available })} />
            <label htmlFor={`available-${key}`}>Takes new work items</label>
          </>
        )}
      </div>
      {session.role && (
        <details className="session-projects">
          <summary>Projects: {session.projects?.length ? session.projects.map((p) => p.name).join(', ') : 'any'}</summary>
          {projects.map((p) => (
            <div key={p.id}>
              <input type="checkbox" id={`project-${key}-${p.id}`} checked={takes.includes(p.id)} onChange={() => void toggle(p.id)} />
              <label htmlFor={`project-${key}-${p.id}`}>{p.name}</label>
            </div>
          ))}
        </details>
      )}
    </fieldset>
  );
}

/** Your Claude sessions and their jobs: the daily driver, and the workers that take items from the app and from the driver. */
export function SessionsView() {
  const { data: sessions } = useApi(() => api<SessionInfo[]>('activeSessions', { hours: 72 }), []);
  const { data: spaces } = useApi(() => api<SpaceInfo[]>('spaces'), []);
  const projects = (spaces ?? []).filter((s) => s.kind === 'project' && !s.closed);
  const [all, setAll] = useState(false);
  // Sessions with a job first; the others only from the last day, unless you ask for all.
  const list = (sessions ?? []).filter((s) => all || s.role || Date.now() - Date.parse(s.active ?? s.time) < 24 * 3600 * 1000);
  const ordered = [...list.filter((s) => s.role === 'driver'), ...list.filter((s) => s.role === 'worker'), ...list.filter((s) => !s.role)];
  return (
    <Page
      title={
        <>
          <Icon name="code" /> Sessions
        </>
      }
      actions={
        <>
          <input type="checkbox" id="sessions-all" checked={all} onChange={() => setAll((a) => !a)} />
          <label htmlFor="sessions-all">Last 3 days</label>
        </>
      }
    >
      <p className="small">
        Give your Claude Code sessions a job. Your daily driver plans the day and hands work items to your workers; Ctrl+click on an item lets you pick
        one of them. A worker takes items of its projects (or any), while it takes new work items.
      </p>
      {sessions && !ordered.length && <p className="empty">No Claude Code sessions here yet. Turn on Follow Claude Code in the Mentions panel to see them.</p>}
      <div className="sessions">
        {ordered.map((s) => (
          <SessionRow key={`${s.provider}:${s.id}`} session={s} projects={projects} />
        ))}
      </div>
    </Page>
  );
}

// ---------------------------------------------------------------- Ctrl+click: who works on it

export type WorkChoice = { session: { provider: string; id: string } } | { new: true } | { usual: true };

interface Asking {
  title: string;
  workers: SessionInfo[];
  answer(choice: WorkChoice | undefined): void;
}
let showChooser: ((a: Asking) => void) | undefined;

/** Ask whom to give an item: one of your available workers, a new session, or where it was last. Undefined: cancelled. */
export function chooseWorker(title: string, workers: SessionInfo[]): Promise<WorkChoice | undefined> {
  return new Promise((answer) => (showChooser ? showChooser({ title, workers, answer }) : answer({ usual: true })));
}

/** Where chooseWorker() shows its window; mounted once. */
export function WorkerChooser() {
  const [asking, setAsking] = useState<Asking>();
  useEffect(() => {
    showChooser = setAsking;
    return () => {
      showChooser = undefined;
    };
  }, []);
  if (!asking) return null;
  const done = (choice?: WorkChoice) => {
    asking.answer(choice);
    setAsking(undefined);
  };
  return (
    <Modal title={`Work on “${asking.title}”`} onClose={() => done()}>
      <p className="small">Who takes it? It goes on top of that session's stack, and the session opens in Claude with the message in its text box.</p>
      <ul className="worker-list">
        {asking.workers.map((w, i) => (
          <li key={`${w.provider}:${w.id}`}>
            <button className={`worker${i === 0 ? ' default' : ''}`} autoFocus={i === 0} onClick={() => done({ session: ref(w) })} disabled={!w.host}>
              <b>
                {w.title ?? 'Untitled session'}
                {w.role === 'driver' ? ' (daily driver)' : ''}
              </b>
              <span className="small">{[folderName(w.folder), status(w), w.host ? '' : 'not seen in the Claude app yet'].filter(Boolean).join(' · ')}</span>
              <Doing session={w} />
            </button>
          </li>
        ))}
      </ul>
      <div className="buttons">
        <button onClick={() => done()}>Cancel</button>
        <button onClick={() => done({ usual: true })} title="Its latest session, or the daily driver for your desk">
          Where it was last
        </button>
        <button onClick={() => done({ new: true })}>New session…</button>
      </div>
    </Modal>
  );
}
