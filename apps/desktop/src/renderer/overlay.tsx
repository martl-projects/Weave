import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { SessionAvatar } from './avatar.tsx';
import type { MentionInfo, PostInfo, Profile, SessionInfo, SpaceInfo } from '@weave/node/client';
import { ago, api, bridge, navigate, onItem } from './lib.ts';
import { PostHeader, spaceLabel } from './posts.tsx';
import { attempt } from './ui.tsx';
import { folderName, running } from './sessions.tsx';

/*
 * The side panel: a small window that stays on top beside your work (Claude
 * Code). It follows the session you're looking at in the Claude app and shows
 * the work item it's on, in full (as Weave shows a post, without its chat).
 * The rest of its stack and the posts agents mentioned are a click away; the
 * sessions pane lists the sessions and what they're on. Nothing here is
 * posted anywhere.
 */

/** Board names say what a post is: "ideas" → an idea. */
const SINGULAR: Record<string, string> = { ideas: 'idea', issues: 'issue', proposals: 'proposal', releases: 'release', posts: 'post', showcase: 'showcase post', journal: 'journal entry' };

/** "idea in p/Weave" */
export function kindOf(p: PostInfo): string {
  const kind = p.type === 'project' ? 'project' : p.type === 'issue' || p.type === 'proposal' ? p.type : (SINGULAR[p.board ?? ''] ?? 'post');
  return p.space && p.type !== 'project' ? `${kind} in ${spaceLabel(p.space)}` : kind;
}

/** Who pointed to it: an agent's weave_show, or a link in a Claude Code session. */
function source(m: MentionInfo): string {
  if (m.source === 'agent') return m.agent ? `${m.agent} showed it` : 'shown';
  return `in ${m.session?.name ?? 'Claude Code'}${m.session?.folder ? ` · ${m.session.folder}` : ''}`;
}


/** What every post needs to know: who you are and your spaces. */
interface Context {
  me: Profile;
  spaces: SpaceInfo[];
}

/** A post in one line, for what isn't current: kind and place, title, and a note. Click opens it in Weave. */
function Line({ post, note }: { post: PostInfo | { id: string; missing: true }; note: ReactNode }) {
  if ('missing' in post) return <li className="panel-line muted">A post you can't see here · {note}</li>;
  return (
    <li className="panel-line" data-post={post.id} title="Click: open in Weave · Ctrl+click: work on it in Claude">
      <a href={`#/post/${post.id}`}>{post.title}</a>
      <span className="panel-line-note">
        {kindOf(post)}
        {post.issue ? ` · ${post.issue.status}` : ''} · {note}
      </span>
    </li>
  );
}

/** The work item a session is on, in full: as Weave shows a post, without its chat, and its starting prompt. */
function CurrentItem({ post, ctx }: { post: PostInfo; ctx: Context }) {
  return (
    <section className="panel-current" data-post={post.id}>
      <PostHeader post={post} meDid={ctx.me.did} spaces={ctx.spaces} />
      {post.prompt && (
        <div className="stack-prompt">
          <b>Starting prompt</b>
          <p>{post.prompt}</p>
        </div>
      )}
    </section>
  );
}

/** A session: the item it's on, in full. */
function SessionView({ session, ctx }: { session: SessionInfo; ctx: Context }) {
  const top = session.stack[0];
  return top && !('missing' in top.post) ? (
    <CurrentItem post={top.post} ctx={ctx} />
  ) : (
    <p className="empty">{top ? "This session is on a post you can't see here." : 'No work item on this session. Ctrl+click a post in Weave to bring one here.'}</p>
  );
}

/** The foldout under Stack: the session (to bring it up in Claude), what waits on its stack, and what was mentioned there. */
function StackFoldout({ session, me, mentions, focused, onFollow, onClose }: { session: SessionInfo; me?: string; mentions: MentionInfo[]; focused: boolean; onFollow(): void; onClose(): void }) {
  const waiting = session.stack.slice(1);
  const here = mentions.filter((m) => m.session?.id === session.id);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="panel-foldout window" onClick={(e) => (e.target as Element).closest('a') && onClose()}>
      <div className="panel-heading">Session</div>
      <div className="panel-foldout-session">
        {me && <SessionAvatar session={session} person={me} size={36} />}
        <span className="grow">
          <b title={session.description}>{session.title ?? 'Untitled session'}</b>
          <span className="panel-line-note">
            {[folderName(session.folder), focused ? 'open in Claude' : running(session) ? 'running' : session.active ? `active ${ago(session.active)}` : ''].filter(Boolean).join(' · ')}
          </span>
          {session.description && <span className="panel-line-note">{session.description}</span>}
        </span>
        {session.host && bridge.showSession && (
          <button onClick={() => void attempt(() => bridge.showSession!(session.host!))} title="Bring it to the front in the Claude app">
            Open in Claude
          </button>
        )}
        {!focused && (
          <button onClick={onFollow} title="Show the session open in the Claude app again">
            Follow Claude
          </button>
        )}
      </div>
      <div className="panel-heading">Stack ({waiting.length} waiting)</div>
      {waiting.length ? (
        <ul className="panel-lines">
          {waiting.map((entry, i) => (
            <Line key={`${entry.post.id}-${i}`} post={entry.post} note={`waiting since ${ago(entry.since)}`} />
          ))}
        </ul>
      ) : (
        <p className="empty">Nothing waits below this item.</p>
      )}
      <div className="panel-heading">Mentions ({here.length})</div>
      {here.length ? (
        <ul className="panel-lines">
          {here.map((m) => (
            <Line key={m.id} post={m.post} note={`${source(m)} · ${ago(m.time)}${m.note ? ` · “${m.note}”` : ''}`} />
          ))}
        </ul>
      ) : (
        <p className="empty">No posts mentioned in this session yet.</p>
      )}
    </div>
  );
}

/** The sessions pane: sessions with work items and the ones active lately, what each is on; pick one to see it. */
function SessionsPane({ focused, me, onPick }: { focused?: string; me?: string; onPick(id: string): void }) {
  const [sessions, setSessions] = useState<SessionInfo[]>();
  useEffect(() => {
    const load = () => void api<SessionInfo[]>('activeSessions', { hours: 12 }).then(setSessions, () => {});
    load();
    const timer = setInterval(load, 15_000);
    const off = onItem((item) => {
      if (!item || item.scope !== 'live' || item.kind === 'weave.focus') load();
    });
    return () => {
      clearInterval(timer);
      off();
    };
  }, []);
  if (!sessions) return null;
  if (!sessions.length) return <p className="empty">No Claude Code sessions in the last 12 hours.</p>;
  return (
    <ul className="panel-sessions">
      {sessions.map((s) => {
        const [top, ...waiting] = s.stack;
        const state = s.id === focused ? 'open in Claude' : running(s) ? 'running' : s.active ? `active ${ago(s.active)}` : `changed ${ago(s.time)}`;
        return (
          <li key={`${s.provider}:${s.id}`} className={`panel-session${s.id === focused ? ' focused' : ''}${running(s) ? ' running' : ''}`}>
            {me && <SessionAvatar session={s} person={me} size={32} />}
            <button className="link panel-session-pick" onClick={() => onPick(s.id)} title="Show this session here">
              <b>
                {s.title ?? 'Untitled session'}
                {s.role && <span className={`role-badge ${s.role}`}>{s.role === 'driver' ? 'driver' : s.available ? 'worker' : 'worker, resting'}</span>}
              </b>
              <span className="panel-line-note">
                {[folderName(s.folder), state].filter(Boolean).join(' · ')}
              </span>
              <span className="panel-session-now">{top ? ('missing' in top.post ? 'on a post you can’t see' : `on: ${top.post.title}`) : 'no work items'}{waiting.length ? ` · ${waiting.length} waiting` : ''}</span>
            </button>
            {s.host && bridge.showSession && (
              <button onClick={() => void attempt(() => bridge.showSession!(s.host!))} title="Bring it to the front in the Claude app">
                Open in Claude
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Links in the panel open in Weave's main window, not in the panel. */
function openInWeave(event: MouseEvent): void {
  const link = (event.target as Element).closest?.('a[href^="#/"]');
  if (!link || event.ctrlKey || event.metaKey) return;
  event.preventDefault();
  const route = link.getAttribute('href')!;
  if (bridge.route) void bridge.route(route);
  else navigate(route);
}

export function MentionsPanel() {
  const [mentions, setMentions] = useState<MentionInfo[]>([]);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [focused, setFocused] = useState<string>();
  const [ctx, setCtx] = useState<Context>();
  const [pane, setPane] = useState<'session' | 'sessions'>('session');
  const [fold, setFold] = useState(false);
  // Which session to show: the one the Claude app shows (''), or one you picked (#/overlay?session=…).
  const [pinned, setPinned] = useState(() => new URLSearchParams(location.hash.split('?')[1] ?? '').get('session') ?? '');
  useEffect(() => {
    void Promise.all([api<Profile>('profile'), api<SpaceInfo[]>('spaces')]).then(([me, spaces]) => setCtx({ me, spaces }), () => {});
  }, []);
  useEffect(() => {
    const refresh = () => {
      void api<SessionInfo | null>('focusedSession').then((s) => {
        setFocused(s?.id);
        if (!pinned) setSession(s);
      }, () => {});
      if (pinned) void api<SessionInfo>('session', { id: pinned }).then(setSession, () => {});
    };
    void api<MentionInfo[]>('mentions').then(setMentions, () => {});
    refresh();
    return onItem((item) => {
      if (item?.kind === 'weave.mention') setMentions((list) => [item.body as unknown as MentionInfo, ...list.filter((m) => m.id !== item.id)].slice(0, 100));
      else if (item?.kind === 'weave.focus') {
        const s = item.body as unknown as SessionInfo | null;
        setFocused(s?.id);
        if (!pinned) setSession(s);
      }
      // A stack or a post may have changed: look again.
      else if (!item || item.scope !== 'live') refresh();
    });
  }, [pinned]);
  // Ctrl+click on a work item: show the session it went to.
  useEffect(
    () =>
      bridge.onPanelSession?.((id) => {
        setPinned(id);
        setPane('session');
      }),
    [],
  );
  // Picking the session open in Claude follows the Claude app again.
  const pick = (id: string) => {
    setPinned(id === focused ? '' : id);
    setPane('session');
  };
  return (
    <div className="window mentions-window" onClickCapture={openInWeave}>
      <div className="title-bar mentions-drag">
        <button className="panel-nav" onClick={() => setPane(pane === 'sessions' ? 'session' : 'sessions')}>
          {pane === 'sessions' ? '← Back' : 'Sessions'}
        </button>
        <div className="title-bar-text" />
        {pane === 'session' && session && (
          <button className={`panel-nav${fold ? ' active' : ''}`} onClick={() => setFold((f) => !f)} aria-expanded={fold}>
            Stack{session.stack.length > 1 ? ` (${session.stack.length - 1})` : ''} ▾
          </button>
        )}
        <div className="title-bar-controls">
          <button aria-label="Close" onClick={() => window.close()} />
        </div>
      </div>
      {fold && pane === 'session' && session && (
        <StackFoldout session={session} me={ctx?.me.did} mentions={mentions} focused={session.id === focused} onFollow={() => (setPinned(''), setFold(false))} onClose={() => setFold(false)} />
      )}
      <div className="mentions-scroll">
        {pane === 'sessions' ? (
          <SessionsPane focused={focused} me={ctx?.me.did} onPick={pick} />
        ) : session && ctx ? (
          <SessionView session={session} ctx={ctx} />
        ) : (
          <p className="empty">Switch to a session in the Claude app, or pick one under Sessions: the work item it is on shows here. (Weave follows the Claude app once Follow Claude Code is on, on its Sessions page.)</p>
        )}
      </div>
    </div>
  );
}
