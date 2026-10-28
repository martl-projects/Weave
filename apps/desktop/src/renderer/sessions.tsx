import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { ClaudeCodeFollow, SessionInfo, SpaceInfo } from '@weave/node/client';
import { Icon } from './icons.tsx';
import { Page } from './views.tsx';
import { ago, api, bridge, bump, useApi } from './lib.ts';
import { attempt, BlobImage, Modal } from './ui.tsx';

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

type RoleChange = { role?: 'driver' | 'worker' | null; projects?: string[]; available?: boolean };
const setRole = (session: SessionInfo, change: RoleChange) => attempt(() => api('setSessionRole', { session: ref(session), ...change }).then(bump));
const sessionKey = (s: SessionInfo) => `${s.provider}:${s.id}`;
/** The project of the item a session is on. */
const doingIn = (s: SessionInfo) => {
  const top = s.stack[0]?.post;
  return top && !('missing' in top) ? top.space?.id : undefined;
};

/** One session, in two lines: what it is and what it's on, and its job. Its projects are the links on the right. */
function SessionCard({ session, port }: { session: SessionInfo; port: ReactNode }) {
  const key = sessionKey(session).replace(':', '-');
  const [top, ...waiting] = session.stack;
  const title = (p: SessionInfo['stack'][number]['post']) => ('missing' in p ? 'a post you can’t see' : p.title);
  const meta = [folderName(session.folder), !running(session) && status(session), top && `on: ${title(top.post)}`, waiting.length && `${waiting.length} waiting`].filter(Boolean).join(' · ');
  const show = session.host && bridge.showSession ? () => void attempt(() => bridge.showSession!(session.host!)) : undefined;
  return (
    <div className={`session-row${session.role ? ` is-${session.role}` : ''}${running(session) ? ' running' : ''}`}>
      <span className="session-dot" title={running(session) ? 'Running' : status(session)} />
      <div className="session-text">
        {show ? (
          <button className="session-title" onClick={show} title="Open in the Claude app">
            {session.title ?? 'Untitled session'}
          </button>
        ) : (
          <b className="session-title">{session.title ?? 'Untitled session'}</b>
        )}
        <span className="session-meta" title={session.last ? `Last finished: ${title(session.last.post)} (${ago(session.last.time)})` : undefined}>
          {meta || 'free'}
        </span>
      </div>
      <select aria-label="Job" value={session.role ?? ''} onChange={(e) => void setRole(session, { role: (e.target.value || null) as RoleChange['role'] })}>
        <option value="">No job</option>
        <option value="worker">Worker</option>
        <option value="driver">Driver</option>
      </select>
      <input
        type="checkbox"
        id={`available-${key}`}
        checked={!!session.available}
        disabled={!session.role}
        onChange={() => void setRole(session, { available: !session.available })}
        title="Takes new work items"
        aria-label="Takes new work items"
      />
      <label htmlFor={`available-${key}`} title="Takes new work items" />
      {port}
    </div>
  );
}

const ANY = 'any';
const GROUPS = [
  ['driver', 'Daily driver'],
  ['worker', 'Workers'],
  ['', 'Other sessions'],
] as const;

interface Link {
  session: SessionInfo;
  project: string; // a project's id, or ANY
  /** The session is on an item of this project now; 'only' when that's all that links them (no job there). */
  now?: 'also' | 'only';
}

/**
 * Sessions and projects side by side: your Claude sessions on the left, your Weave projects on the right, and a line
 * for each project a session takes work from. Drag from one side's port to the other to link them; click a line to unlink.
 */
function SessionMap({ sessions, projects }: { sessions: SessionInfo[]; projects: SpaceInfo[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<Record<string, { x: number; y: number }>>({});
  const [hover, setHover] = useState<string>();
  // A link being drawn: from a port, to where the pointer is.
  const [hold, setHold] = useState<{ from: string; x: number; y: number; moved: boolean }>();

  // Where every port is, relative to the map; again whenever anything moves.
  const measure = () => {
    const root = box.current;
    if (!root) return;
    const origin = root.getBoundingClientRect();
    const next: Record<string, { x: number; y: number }> = {};
    for (const el of root.querySelectorAll<HTMLElement>('[data-port]')) {
      const r = el.getBoundingClientRect();
      next[el.dataset.port!] = { x: r.left + r.width / 2 - origin.left, y: r.top + r.height / 2 - origin.top };
    }
    setAt((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next));
  };
  useLayoutEffect(measure);
  useEffect(() => {
    const observer = new ResizeObserver(measure);
    if (box.current) for (const el of [box.current, ...box.current.querySelectorAll('.map-side')]) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const links: Link[] = [];
  for (const s of sessions) {
    const doing = doingIn(s);
    const takes = s.role ? (s.projects?.length ? s.projects.map((p) => p.id) : [ANY]) : [];
    for (const p of takes) links.push({ session: s, project: p, ...(doing === p ? { now: 'also' as const } : {}) });
    if (doing && !takes.includes(doing) && projects.some((p) => p.id === doing)) links.push({ session: s, project: doing, now: 'only' });
  }

  const link = (session: SessionInfo, project: string) => {
    const takes = session.role ? (session.projects?.map((p) => p.id) ?? []) : [];
    if (project === ANY) return setRole(session, { role: session.role ?? 'worker', projects: [] });
    if (session.role && takes.includes(project)) return;
    return setRole(session, { role: session.role ?? 'worker', projects: [...takes, project] });
  };
  // Unlinking a session's last project ends its job, so it never quietly takes everything.
  const unlink = (l: Link) => {
    const rest = (l.session.projects?.map((p) => p.id) ?? []).filter((p) => p !== l.project);
    return setRole(l.session, l.project === ANY || !rest.length ? { role: null } : { projects: rest });
  };

  const finish = (target: Element | null) => {
    const to = (target?.closest('[data-end]') as HTMLElement | null)?.dataset.end;
    if (!hold || !to || to.slice(0, 2) === hold.from.slice(0, 2)) return false;
    const [s, p] = hold.from.startsWith('s:') ? [hold.from, to] : [to, hold.from];
    const session = sessions.find((x) => `s:${sessionKey(x)}` === s);
    if (session) void link(session, p.slice(2));
    setHold(undefined);
    return true;
  };
  useEffect(() => {
    if (!hold) return;
    const rel = (e: PointerEvent) => {
      const o = box.current!.getBoundingClientRect();
      return { x: e.clientX - o.left, y: e.clientY - o.top };
    };
    const move = (e: PointerEvent) => setHold((h) => h && { ...h, ...rel(e), moved: h.moved || Math.hypot(rel(e).x - at[h.from]!.x, rel(e).y - at[h.from]!.y) > 6 });
    // Dragged and let go: link it where it landed. Only clicked: keep it until the next click.
    const up = (e: PointerEvent) => {
      if (!finish(document.elementFromPoint(e.clientX, e.clientY)) && hold.moved) setHold(undefined);
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setHold(undefined);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', key);
    };
  });
  const grab = (from: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (hold && finish(e.currentTarget)) return;
    const p = at[from];
    if (p) setHold({ from, x: p.x, y: p.y, moved: false });
  };

  // An elbow: out of the left port, across the gap, into the right port.
  const path = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const mid = (a.x + b.x) / 2;
    const r = Math.min(6, Math.abs(b.y - a.y) / 2, Math.abs(mid - a.x));
    if (r < 1) return `M${a.x},${a.y} L${b.x},${b.y}`;
    const dy = b.y > a.y ? r : -r;
    return `M${a.x},${a.y} H${mid - r} Q${mid},${a.y} ${mid},${a.y + dy} V${b.y - dy} Q${mid},${b.y} ${mid + r},${b.y} H${b.x}`;
  };
  const lit = (l: Link) => !hover || hover === `s:${sessionKey(l.session)}` || hover === `p:${l.project}`;
  const port = (id: string) => <span className={`map-port${hold?.from === id ? ' held' : ''}`} data-port={id} onPointerDown={grab(id)} title="Drag to the other side to link" />;
  const count = (id: string) => links.filter((l) => l.project === id && l.now !== 'only').length;
  const ends = (id: string) => ({
    'data-end': id,
    onPointerEnter: () => setHover(id),
    onPointerLeave: () => setHover(undefined),
    onClick: (e: React.MouseEvent) => void (hold && finish(e.currentTarget)),
  });

  return (
    <div className={`session-map${hold ? ' holding' : ''}`} ref={box}>
      <div className="map-side">
        <div className="map-head">Claude sessions</div>
        {GROUPS.map(([role, heading]) => {
          const group = sessions.filter((s) => (s.role ?? '') === role);
          return (
            group.length > 0 && (
              <div key={role} className="map-group">
                <div className="map-group-head">{heading}</div>
                {group.map((s) => {
                  const id = `s:${sessionKey(s)}`;
                  return (
                    <div key={id} className="map-session" {...ends(id)}>
                      <SessionCard session={s} port={port(id)} />
                    </div>
                  );
                })}
              </div>
            )
          );
        })}
      </div>
      <div className="map-side">
        <div className="map-head">Weave projects</div>
        {[{ id: ANY, name: 'Any project' } as SpaceInfo, ...projects].map((p) => {
          const id = `p:${p.id}`;
          const n = count(p.id);
          return (
            <div key={id} className={`map-project${p.id === ANY ? ' any' : ''}`} {...ends(id)}>
              {port(id)}
              {p.icon ? <BlobImage className="map-icon" src={p.icon} /> : null}
              <span className="grow">{p.name}</span>
              {n > 0 && <span className="small">{n}</span>}
            </div>
          );
        })}
      </div>
      <svg className="map-links" aria-hidden>
        {links.map((l) => {
          const a = at[`s:${sessionKey(l.session)}`];
          const b = at[`p:${l.project}`];
          if (!a || !b) return null;
          const d = path(a, b);
          const cls = ['map-link', l.session.role, l.project === ANY && 'any', l.session.role && !l.session.available && 'paused', l.now && `now-${l.now}`, !lit(l) && 'dim'].filter(Boolean).join(' ');
          return (
            <g key={`${sessionKey(l.session)}>${l.project}${l.now ?? ''}`} className={cls}>
              <path d={d} className="line" />
              {l.now && <circle cx={b.x - 12} cy={b.y} r={3} className="now" />}
              {l.now !== 'only' && (
                <path d={d} className="hit" onClick={() => void unlink(l)}>
                  <title>
                    Unlink: {l.session.title ?? 'this session'} no longer takes work from {l.project === ANY ? 'any project' : projects.find((p) => p.id === l.project)?.name}
                  </title>
                </path>
              )}
            </g>
          );
        })}
        {hold && at[hold.from] && <path className="map-link drawing" d={hold.from.startsWith('s:') ? path(at[hold.from]!, hold) : path(hold, at[hold.from]!)} />}
      </svg>
    </div>
  );
}

/** Your Claude sessions and their jobs: the daily driver, and the workers that take items from the app and from the driver. */
export function SessionsView() {
  const { data: sessions } = useApi(() => api<SessionInfo[]>('activeSessions', { hours: 72 }), []);
  const { data: spaces } = useApi(() => api<SpaceInfo[]>('spaces'), []);
  const projects = (spaces ?? []).filter((s) => s.kind === 'project' && !s.closed);
  const [all, setAll] = useState(false);
  const { data: follow } = useApi(() => api<ClaudeCodeFollow>('claudeCode'), []);
  const toggleFollow = () => attempt(() => api<ClaudeCodeFollow>('followClaudeCode', { on: !follow?.on }).then(bump));
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
          <input type="checkbox" id="follow-claude-code" checked={!!follow?.on} disabled={!follow} onChange={() => void toggleFollow()} />
          <label htmlFor="follow-claude-code" title={follow ? `Reads the agent's answers in ${follow.dir} and the Claude app's log, on this computer only` : undefined}>
            Follow Claude Code{follow && !follow.found ? ' (not found)' : ''}
          </label>
          <input type="checkbox" id="sessions-all" checked={all} onChange={() => setAll((a) => !a)} />
          <label htmlFor="sessions-all">Last 3 days</label>
        </>
      }
    >
      <p className="small">
        Link a session to a project by dragging from one side to the other: it then takes that project's work items, from you (Ctrl+click) and from your
        daily driver. Click a line to unlink. A dot marks the project a session is working in now.
      </p>
      {sessions && !ordered.length ? (
        <p className="empty">No Claude Code sessions here yet. Turn on Follow Claude Code to see them.</p>
      ) : (
        <SessionMap sessions={ordered} projects={projects} />
      )}
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
