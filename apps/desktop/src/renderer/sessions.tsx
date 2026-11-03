import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { SessionAvatar } from './avatar.tsx';
import { SessionAvatarEditor } from './avatar-editor.tsx';
import type { ClaudeCodeFollow, Profile, SessionInfo, SpaceInfo } from '@weave/node/client';
import { Icon } from './icons.tsx';
import { Page } from './views.tsx';
import { ago, api, bridge, bump, useApi } from './lib.ts';
import { attempt, BlobImage, Modal } from './ui.tsx';
import { t, useTexts } from './texts.tsx';

export const folderName = (folder?: string) => folder?.split(/[\\/]/).filter(Boolean).pop();

/** Running: the session wrote to its transcript in the last two minutes. */
export const running = (s: SessionInfo) => !!s.active && Date.now() - Date.parse(s.active) < 2 * 60 * 1000;

const ref = (s: SessionInfo) => ({ provider: s.provider, id: s.id });

const postTitle = (p: SessionInfo['stack'][number]['post']) => ('missing' in p ? t('session.post.hidden') : p.title);

/** What a session is on now, and what it finished last. */
function Doing({ session }: { session: SessionInfo }) {
  const { t } = useTexts();
  const [top, ...waiting] = session.stack;
  return (
    <span className="session-doing">
      {top ? t('session.on', { title: postTitle(top.post) }) : t('session.free')}
      {waiting.length ? t('session.waiting', { n: waiting.length }) : ''}
      {session.last ? t('session.last.finished', { title: postTitle(session.last.post), time: session.last.time }) : ''}
    </span>
  );
}

const status = (s: SessionInfo) => (running(s) ? t('session.running.lc') : s.active ? t('session.active', { time: s.active }) : t('session.changed', { time: s.time }));

type RoleChange = { role?: 'driver' | 'worker' | null; projects?: string[]; available?: boolean };
const setRole = (session: SessionInfo, change: RoleChange) => attempt(() => api('setSessionRole', { session: ref(session), ...change }).then(bump));
const hide = (session: SessionInfo, hidden: boolean) => attempt(() => api('hideSession', { session: ref(session), hidden }).then(bump));
/** Out of sight: archived in its harness (the Claude app), or hidden here. */
const away = (s: SessionInfo) => !!(s.archived || s.hidden);
const sessionKey = (s: SessionInfo) => `${s.provider}:${s.id}`;
/** The project of the item a session is on. */
const doingIn = (s: SessionInfo) => {
  const top = s.stack[0]?.post;
  return top && !('missing' in top) ? top.space?.id : undefined;
};

/** One session, in two lines: what it is and what it's on, and its job. Its projects are the links on the right. */
function SessionCard({ session, port }: { session: SessionInfo; port: ReactNode }) {
  const { t } = useTexts();
  const key = sessionKey(session).replace(':', '-');
  const [top, ...waiting] = session.stack;
  const meta = [folderName(session.folder), !running(session) && status(session), top && t('session.on', { title: postTitle(top.post) }), waiting.length && t('session.waiting.n', { n: waiting.length })].filter(Boolean).join(' · ');
  const show = session.host && bridge.showSession ? () => void attempt(() => bridge.showSession!(session.host!)) : undefined;
  const [naming, setNaming] = useState(false);
  const [dressing, setDressing] = useState(false);
  const { data: me } = useApi(() => api<Profile>('profile'), []);
  // A named session's title is its own; the Claude app's title is the note under it.
  const about = [session.description, session.name && session.providerTitle && session.providerTitle !== session.title ? t('session.in.claude', { title: session.providerTitle }) : ''].filter(Boolean).join('\n');
  return (
    <div className={`session-row${session.role ? ` is-${session.role}` : ''}${running(session) ? ' running' : ''}`}>
      <span className="session-dot" title={running(session) ? t('session.running') : status(session)} />
      {me && (
        <button className="link session-face" onClick={() => setDressing(true)} title={t('session.avatar.change')} aria-label={t('word.avatar')}>
          <SessionAvatar session={session} person={me.did} size={28} />
        </button>
      )}
      {dressing && me && <SessionAvatarEditor session={session} me={me} onClose={() => setDressing(false)} />}
      <div className="session-text">
        {show ? (
          <button className="session-title" onClick={show} title={about || t('session.open.claude')}>
            {session.title ?? t('session.untitled')}
          </button>
        ) : (
          <b className="session-title" title={about || undefined}>
            {session.title ?? t('session.untitled')}
          </b>
        )}
        <span className="session-meta" title={session.last ? t('session.last.finished.title', { title: postTitle(session.last.post), time: session.last.time }) : undefined}>
          {meta || t('session.free')}
        </span>
      </div>
      <button className="link session-name" onClick={() => setNaming(true)} title={session.name ? t('session.rename.title', { name: session.name }) : t('session.name.this')} aria-label={t('field.name')}>
        <Icon name="pencil" />
      </button>
      {naming && <NameSession session={session} onClose={() => setNaming(false)} />}
      <button className="link session-hide" onClick={() => void hide(session, true)} title={t('session.hide.title')} aria-label={t('session.hide')}>
        <Icon name="eyeOff" />
      </button>
      <select aria-label={t('session.job')} value={session.role ?? ''} onChange={(e) => void setRole(session, { role: (e.target.value || null) as RoleChange['role'] })}>
        <option value="">{t('session.job.none')}</option>
        <option value="worker">{t('session.job.worker')}</option>
        <option value="driver">{t('session.job.driver')}</option>
      </select>
      <input
        type="checkbox"
        id={`available-${key}`}
        checked={!!session.available}
        disabled={!session.role}
        onChange={() => void setRole(session, { available: !session.available })}
        title={t('session.takes.items')}
        aria-label={t('session.takes.items')}
      />
      <label htmlFor={`available-${key}`} title={t('session.takes.items')} />
      {port}
    </div>
  );
}

const ANY = 'any';
/** Inside a group: the driver first, then the workers, then the rest. */
const ROLES = ['driver', 'worker', ''] as const;
/** Groups that aren't a project of the Weave column. */
const SEVERAL = 'several';
const NONE = 'none';
/** The harnesses sessions come from, by provider; Claude Code is one of them (others, like Codex or a local model, can follow). */
const HARNESSES: Record<string, string> = { 'claude-code': 'Claude Code' };
const harnessName = (provider: string) => HARNESSES[provider] ?? provider;

interface Link {
  session: SessionInfo;
  project: string; // a project's id, or ANY
  /** The session is on an item of this project now; 'only' when that's all that links them (no job there). */
  now?: 'also' | 'only';
}

/**
 * Sessions and projects side by side: your agents' sessions on the left (a section per harness: Claude Code, later others), your Weave projects on the right, and a line
 * for each project a session takes work from. Drag from one side's port to the other to link them; click a line to unlink.
 */
function SessionMap({ sessions, projects, onNew }: { sessions: SessionInfo[]; projects: SpaceInfo[]; onNew?(project?: string): void }) {
  const { t } = useTexts();
  const box = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<Record<string, { x: number; y: number }>>({});
  const [hover, setHover] = useState<string>();
  // A link being drawn: from a port, to where the pointer is.
  const [hold, setHold] = useState<{ from: string; x: number; y: number; moved: boolean }>();

  // Sessions grouped by the project they take: exactly one (shown on the right), any, several, or none.
  const shown = new Set(projects.map((p) => p.id));
  const groupOf = (s: SessionInfo): string => {
    if (!s.role) return NONE;
    const takes = s.projects ?? [];
    if (!takes.length) return ANY;
    return takes.length === 1 ? (shown.has(takes[0]!.id) ? takes[0]!.id : NONE) : SEVERAL;
  };
  const column = [ANY, ...projects.map((p) => p.id)];
  const used = new Set(sessions.map(groupOf));
  // Projects with sessions first, in the column's order, each beside its group; the others after them, packed.
  const rows = [...column.filter((id) => used.has(id)), ...column.filter((id) => !used.has(id))];
  // The groups on the left in the same order; several and none at the end, or first when the driver is in one of them.
  const driverGroup = sessions.find((s) => s.role === 'driver');
  const lead = driverGroup && [SEVERAL, NONE].includes(groupOf(driverGroup)) ? [groupOf(driverGroup)] : [];
  const groups = [...new Set([...lead, ...column, SEVERAL, NONE])].filter((g) => used.has(g));
  const groupName = (g: string) => (g === ANY ? t('session.any.project') : g === SEVERAL ? t('session.group.several') : g === NONE ? t('session.group.none') : projects.find((p) => p.id === g)?.name);

  // How far down each project on the right goes so it sits centred beside its group of sessions.
  const [push, setPush] = useState<Record<string, number>>({});
  const arrange = () => {
    const root = box.current;
    const side = root?.querySelectorAll<HTMLElement>('.map-side')[1];
    if (!root || !side) return;
    const top = root.getBoundingClientRect().top;
    const spans = new Map<string, { top: number; bottom: number }>();
    for (const el of root.querySelectorAll<HTMLElement>('[data-group]')) {
      const r = el.getBoundingClientRect();
      const was = spans.get(el.dataset.group!);
      spans.set(el.dataset.group!, { top: Math.min(was?.top ?? Infinity, r.top - top), bottom: Math.max(was?.bottom ?? -Infinity, r.bottom - top) });
    }
    const gap = parseFloat(getComputedStyle(side).rowGap) || 0;
    const head = side.querySelector('.map-head')!.getBoundingClientRect();
    let cursor = head.bottom - top + gap;
    const next: Record<string, number> = {};
    for (const el of side.querySelectorAll<HTMLElement>('[data-row]')) {
      const h = el.getBoundingClientRect().height;
      const span = spans.get(el.dataset.row!);
      const at = span ? Math.max(cursor, (span.top + span.bottom) / 2 - h / 2) : cursor;
      if (at > cursor + 0.5) next[el.dataset.row!] = Math.round(at - cursor);
      cursor = at + h + gap;
    }
    setPush((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next));
  };

  // Where every port is, relative to the map; again whenever anything moves.
  const measure = () => {
    arrange();
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
    // A project dropped on New session: a new session for it.
    if (to === 'n:new') {
      if (!hold.from.startsWith('p:')) return false;
      onNew?.(hold.from === `p:${ANY}` ? undefined : hold.from.slice(2));
      setHold(undefined);
      return true;
    }
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
  // One section per harness: Claude Code first (it's where new sessions start), then any other sessions come from.
  const harnesses = [...new Set([...(onNew ? ['claude-code'] : []), ...sessions.map((s) => s.provider)])].sort((a, b) => Number(b === 'claude-code') - Number(a === 'claude-code') || harnessName(a).localeCompare(harnessName(b)));
  const lit = (l: Link) => !hover || hover === `s:${sessionKey(l.session)}` || hover === `p:${l.project}`;
  const port = (id: string) => <span className={`map-port${hold?.from === id ? ' held' : ''}`} data-port={id} onPointerDown={grab(id)} title={t('session.drag.link')} />;
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
        <div className="map-head">{t('sessions.agent.sessions')}</div>
        {harnesses.map((provider) => {
          const mine = sessions.filter((s) => s.provider === provider);
          return (
            <section key={provider} className="map-harness">
              <div className="map-harness-head">
                <span className="grow">{harnessName(provider)}</span>
                {mine.length > 0 && <span className="small">{mine.length}</span>}
              </div>
              {groups.map((g) => {
                const group = ROLES.flatMap((role) => mine.filter((s) => groupOf(s) === g && (s.role ?? '') === role));
                return (
                  group.length > 0 && (
                    <div key={g} className="map-group" data-group={g}>
                      <div className="map-group-head">{groupName(g)}</div>
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
              {onNew && provider === 'claude-code' && (
                <div className="map-session map-new" {...ends('n:new')} onClick={(e) => void (hold ? finish(e.currentTarget) : onNew())}>
                  <div className="session-row">
                    <span className="session-plus">+</span>
                    <div className="session-text">
                      <b className="session-title">{t('session.new.claude')}</b>
                      <span className="session-meta">{t('session.new.hint')}</span>
                    </div>
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>
      <div className="map-side">
        <div className="map-head">{t('sessions.weave.projects')}</div>
        {rows.map((row) => {
          const p = row === ANY ? ({ id: ANY, name: t('session.any.project') } as SpaceInfo) : projects.find((x) => x.id === row)!;
          const id = `p:${p.id}`;
          const n = count(p.id);
          return (
            <div key={id} className={`map-project${p.id === ANY ? ' any' : ''}`} data-row={p.id} style={push[p.id] ? { marginTop: push[p.id] } : undefined} {...ends(id)}>
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
                  <title>{t('session.unlink', { session: l.session.title ?? t('session.this'), project: l.project === ANY ? t('session.any.project.lc') : projects.find((p) => p.id === l.project)?.name })}</title>
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
  const { t } = useTexts();
  const { data: sessions } = useApi(() => api<SessionInfo[]>('activeSessions', { hours: 72 }), []);
  const { data: spaces } = useApi(() => api<SpaceInfo[]>('spaces'), []);
  const projects = (spaces ?? []).filter((s) => s.kind === 'project' && !s.closed);
  const [all, setAll] = useState(false);
  const { data: follow } = useApi(() => api<ClaudeCodeFollow>('claudeCode'), []);
  const toggleFollow = () => attempt(() => api<ClaudeCodeFollow>('followClaudeCode', { on: !follow?.on }).then(bump));
  // Show the overlay: whether the side panel comes up beside Claude Code, on this device (only in the app).
  const [overlay, setOverlay] = useState<boolean>();
  useEffect(() => void bridge.overlay?.().then(setOverlay, () => {}), []);
  const toggleOverlay = () => attempt(() => bridge.overlay!(!overlay).then(setOverlay));
  // The New session dialog, for a project or any.
  const [starting, setStarting] = useState<{ project?: string }>();
  // Sessions with a job first; the others only from the last day, unless you ask for all. Archived and hidden ones wait folded at the bottom.
  const list = (sessions ?? []).filter((s) => !away(s) && (all || s.role || Date.now() - Date.parse(s.active ?? s.time) < 24 * 3600 * 1000));
  const gone = (sessions ?? []).filter(away);
  const ordered = [...list.filter((s) => s.role === 'driver'), ...list.filter((s) => s.role === 'worker'), ...list.filter((s) => !s.role)];
  return (
    <Page
      title={
        <>
          <Icon name="code" /> {t('nav.sessions')}
        </>
      }
      actions={
        <>
          <span className="info-tip" tabIndex={0} aria-label={t('sessions.how.linking')}>
            <Icon name="info" />
            <span className="info-pop small" role="tooltip">
              {t('sessions.how.linking.text')}
            </span>
          </span>
          <input type="checkbox" id="follow-claude-code" checked={!!follow?.on} disabled={!follow} onChange={() => void toggleFollow()} />
          <label htmlFor="follow-claude-code" title={follow ? t('sessions.follow.title', { dir: follow.dir }) : undefined}>
            {t('sessions.follow')}
            {follow && !follow.found ? t('sessions.follow.not.found') : ''}
          </label>
          {bridge.overlay && (
            <>
              <input type="checkbox" id="show-overlay" checked={!!overlay} disabled={overlay === undefined} onChange={() => void toggleOverlay()} />
              <label htmlFor="show-overlay" title={t('sessions.overlay.title')}>
                {t('sessions.overlay')}
              </label>
            </>
          )}
          <input type="checkbox" id="sessions-all" checked={all} onChange={() => setAll((a) => !a)} />
          <label htmlFor="sessions-all">{t('sessions.last.days')}</label>
        </>
      }
    >
      {sessions && !ordered.length && <p className="empty">{t('sessions.none')}</p>}
      {(ordered.length > 0 || bridge.newSession) && <SessionMap sessions={ordered} projects={projects} onNew={bridge.newSession ? (project) => setStarting({ project }) : undefined} />}
      {gone.length > 0 && <AwaySessions sessions={gone} />}
      {starting && <NewSession project={starting.project} projects={projects} following={!!follow?.on} onClose={() => setStarting(undefined)} />}
    </Page>
  );
}

/** Sessions out of sight, folded: those you archived in the Claude app (unarchive them there) and those you hid here. */
function AwaySessions({ sessions }: { sessions: SessionInfo[] }) {
  const { t } = useTexts();
  const hidden = sessions.filter((s) => s.hidden);
  return (
    <details className="sessions-away">
      <summary>{t('sessions.away', { n: sessions.length })}</summary>
      {hidden.length > 1 && (
        <div className="buttons">
          <button onClick={() => void attempt(() => api('unhideSessions').then(bump))}>{t('sessions.unhide.all')}</button>
        </div>
      )}
      <ul className="sessions-away-list">
        {sessions.map((s) => (
          <li key={sessionKey(s)}>
            <span className="grow">
              <b>{s.title ?? t('session.untitled')}</b>{' '}
              <span className="small muted">{[folderName(s.folder), s.hidden && t('session.hidden'), s.archived && t('session.archived')].filter(Boolean).join(' · ')}</span>
            </span>
            {s.hidden && <button onClick={() => void hide(s, false)}>{t('session.unhide')}</button>}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Name a session (a session names itself once; here you rename it), and say what it is about. */
function NameSession({ session, onClose }: { session: SessionInfo; onClose(): void }) {
  const { t } = useTexts();
  const [name, setName] = useState(session.name ?? '');
  const [about, setAbout] = useState(session.about ?? '');
  const [description, setDescription] = useState(session.description ?? '');
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const saved = await attempt(() => api('nameSession', { session: ref(session), name: name.trim(), about, description, rename: true }));
    setBusy(false);
    if (saved) {
      bump();
      onClose();
    }
  };
  return (
    <Modal title={session.name ? t('session.rename', { name: session.name }) : t('session.name.this')} onClose={onClose}>
      <form className="form" onSubmit={(e) => void save(e)}>
        <p className="small">{t('session.name.about', { now: session.providerTitle ? t('session.name.now', { title: session.providerTitle }) : '' })}</p>
        <div className="field-row-stacked">
          <label htmlFor="session-name">{t('session.name.field')}</label>
          <input id="session-name" required minLength={2} maxLength={24} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field-row-stacked">
          <label htmlFor="session-about">{t('session.about.field')}</label>
          <input id="session-about" maxLength={100} value={about} onChange={(e) => setAbout(e.target.value)} />
        </div>
        <div className="field-row-stacked">
          <label htmlFor="session-description">{t('session.description.field')}</label>
          <textarea id="session-description" rows={3} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="buttons">
          <button type="button" onClick={onClose}>
            {t('button.cancel')}
          </button>
          <button className="default" disabled={busy || name.trim().length < 2}>
            {t('button.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Start a Claude Code session in a folder, with a job: it takes work from the project (or any) once the Claude app says which session it is. */
function NewSession({ project: initial, projects, following, onClose }: { project?: string; projects: SpaceInfo[]; following: boolean; onClose(): void }) {
  const { t } = useTexts();
  const [project, setProject] = useState(initial ?? '');
  const [folder, setFolder] = useState('');
  const [role, setRole] = useState<'worker' | 'driver' | ''>('worker');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  // The folder you last worked on the project in, unless you typed one.
  const [suggested, setSuggested] = useState('');
  useEffect(() => {
    let live = true;
    void (project ? api<string[]>('folders', { space: project }) : Promise.resolve([])).then((list) => {
      if (!live) return;
      setFolder((f) => (f && f !== suggested ? f : (list[0] ?? '')));
      setSuggested(list[0] ?? '');
    });
    return () => {
      live = false;
    };
  }, [project]);
  const choose = async () => {
    const picked = await bridge.pickFolder(t('session.folder.pick'));
    if (picked) setFolder(picked);
  };
  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await attempt(() => bridge.newSession!({ folder: folder.trim(), ...(role ? { role } : {}), projects: project ? [project] : [], text }));
    setBusy(false);
    if (ok !== undefined) onClose();
  };
  return (
    <Modal title={t('session.new.title')} onClose={onClose}>
      <form className="form" onSubmit={(e) => void start(e)}>
        <div className="field-row-stacked">
          <label htmlFor="new-session-project">{t('session.project')}</label>
          <select id="new-session-project" value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="">{t('session.any.project')}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field-row-stacked">
          <label htmlFor="new-session-folder">{t('session.folder')}</label>
          <div className="field-row">
            <input id="new-session-folder" className="grow" required value={folder} onChange={(e) => setFolder(e.target.value)} />
            <button type="button" onClick={() => void choose()}>
              {t('button.choose')}
            </button>
          </div>
        </div>
        <div className="field-row-stacked">
          <label htmlFor="new-session-role">{t('session.job')}</label>
          <select id="new-session-role" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
            <option value="worker">{t('session.job.worker')}</option>
            <option value="driver">{t('session.job.daily.driver')}</option>
            <option value="">{t('session.job.none')}</option>
          </select>
        </div>
        <div className="field-row-stacked">
          <label htmlFor="new-session-text">{t('session.first.message')}</label>
          <textarea id="new-session-text" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        {role && !following && <p className="small">{t('session.follow.first')}</p>}
        <div className="buttons">
          <button type="button" onClick={onClose}>
            {t('button.cancel')}
          </button>
          <button className="default" disabled={busy || !folder.trim()}>
            {t('session.start')}
          </button>
        </div>
      </form>
    </Modal>
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
  const { t } = useTexts();
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
    <Modal title={t('work.on.title', { title: asking.title })} onClose={() => done()}>
      <p className="small">{t('work.who.takes')}</p>
      <ul className="worker-list">
        {asking.workers.map((w, i) => (
          <li key={`${w.provider}:${w.id}`}>
            <button className={`worker${i === 0 ? ' default' : ''}`} autoFocus={i === 0} onClick={() => done({ session: ref(w) })} disabled={!w.host}>
              <b>
                {w.title ?? t('session.untitled')}
                {w.role === 'driver' ? t('session.daily.driver.suffix') : ''}
              </b>
              <span className="small">{[folderName(w.folder), status(w), w.host ? '' : t('session.not.seen')].filter(Boolean).join(' · ')}</span>
              <Doing session={w} />
            </button>
          </li>
        ))}
      </ul>
      <div className="buttons">
        <button onClick={() => done()}>{t('button.cancel')}</button>
        <button onClick={() => done({ usual: true })} title={t('work.where.last.title')}>
          {t('work.where.last')}
        </button>
        <button onClick={() => done({ new: true })}>{t('work.new.session')}</button>
      </div>
    </Modal>
  );
}
