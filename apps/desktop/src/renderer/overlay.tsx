import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import type { ClaudeCodeFollow, MentionInfo, PostInfo, Profile, SessionInfo, SpaceInfo } from '@weave/node/client';
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
function kindOf(p: PostInfo): string {
  const kind = p.type === 'project' ? 'project' : p.type === 'issue' || p.type === 'proposal' ? p.type : (SINGULAR[p.board ?? ''] ?? 'post');
  return p.space && p.type !== 'project' ? `${kind} in ${spaceLabel(p.space)}` : kind;
}

/** Who pointed to it: an agent's weave_show, or a link in a Claude Code session. */
function source(m: MentionInfo): string {
  if (m.source === 'agent') return m.agent ? `${m.agent} showed it` : 'shown';
  return `in Claude Code${m.session?.folder ? ` · ${m.session.folder}` : ''}`;
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
function CurrentItem({ post, since, ctx }: { post: PostInfo; since: string; ctx: Context }) {
  return (
    <section className="panel-current" data-post={post.id}>
      <div className="stack-state now">Now · {kindOf(post)} · since {ago(since)}</div>
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

/** A session: its current item in full, then (on request) the rest of its stack and what was mentioned there. */
function SessionView({ session, mentions, ctx }: { session: SessionInfo; mentions: MentionInfo[]; ctx: Context }) {
  const [open, setOpen] = useState<'stack' | 'mentions'>();
  const [top, ...waiting] = session.stack;
  const here = mentions.filter((m) => m.session?.id === session.id);
  const flip = (which: 'stack' | 'mentions') => setOpen((o) => (o === which ? undefined : which));
  return (
    <>
      {top && !('missing' in top.post) ? (
        <CurrentItem post={top.post} since={top.since} ctx={ctx} />
      ) : (
        <p className="empty">{top ? "This session is on a post you can't see here." : 'No work item on this session. Ctrl+click a post in Weave to bring one here.'}</p>
      )}
      <div className="panel-toggles">
        <button className={open === 'stack' ? 'active' : ''} disabled={!waiting.length} onClick={() => flip('stack')}>
          Stack ({waiting.length} waiting)
        </button>
        <button className={open === 'mentions' ? 'active' : ''} disabled={!here.length} onClick={() => flip('mentions')}>
          Mentions ({here.length})
        </button>
      </div>
      {open === 'stack' && (
        <ul className="panel-lines">
          {waiting.map((entry, i) => (
            <Line key={`${entry.post.id}-${i}`} post={entry.post} note={`waiting since ${ago(entry.since)}`} />
          ))}
        </ul>
      )}
      {open === 'mentions' && (
        <ul className="panel-lines">
          {here.map((m) => (
            <Line key={m.id} post={m.post} note={`${source(m)} · ${ago(m.time)}${m.note ? ` · “${m.note}”` : ''}`} />
          ))}
        </ul>
      )}
    </>
  );
}

/** The sessions pane: sessions with work items and the ones active lately, what each is on; pick one to see it. */
function SessionsPane({ focused, onPick }: { focused?: string; onPick(id: string): void }) {
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
  const [follow, setFollow] = useState<ClaudeCodeFollow>();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [focused, setFocused] = useState<string>();
  const [ctx, setCtx] = useState<Context>();
  const [pane, setPane] = useState<'session' | 'sessions'>('session');
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
    void api<ClaudeCodeFollow>('claudeCode').then(setFollow, () => {});
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
  const toggleFollow = async () => {
    const next = await attempt(() => api<ClaudeCodeFollow>('followClaudeCode', { on: !follow?.on }));
    if (next) setFollow(next);
  };
  const pick = (id: string) => {
    setPinned(id === focused ? '' : id);
    setPane('session');
  };
  return (
    <div className="window mentions-window" onClickCapture={openInWeave}>
      <div className="title-bar mentions-drag">
        <div className="title-bar-text">Weave · {pane === 'sessions' ? 'Sessions' : (session?.title ?? 'Session')}</div>
        <div className="title-bar-controls">
          <button aria-label="Close" onClick={() => window.close()} />
        </div>
      </div>
      <div className="window-body mentions-body">
        <div className="panel-bar">
          <button className={pane === 'sessions' ? 'active' : ''} onClick={() => setPane(pane === 'sessions' ? 'session' : 'sessions')}>
            {pane === 'sessions' ? '← Back' : 'Sessions'}
          </button>
          {pane === 'session' && (
            <span className="panel-bar-what">
              {session ? (
                <>
                  <b>{session.title ?? 'Untitled session'}</b> {folderName(session.folder) ? `· ${folderName(session.folder)}` : ''}
                  {pinned ? (
                    <button className="link" onClick={() => setPinned('')} title="Follow the session open in the Claude app again">
                      follow Claude
                    </button>
                  ) : (
                    <span className="muted"> · open in Claude</span>
                  )}
                </>
              ) : (
                <span className="muted">No session</span>
              )}
            </span>
          )}
        </div>
        <div className="mentions-scroll">
          {pane === 'sessions' ? (
            <SessionsPane focused={focused} onPick={pick} />
          ) : session && ctx ? (
            <SessionView session={session} mentions={mentions} ctx={ctx} />
          ) : (
            <p className="empty">
              {follow?.on
                ? 'Switch to a session in the Claude app, or pick one under Sessions: the work item it is on shows here.'
                : 'Turn on Follow Claude Code: this panel then follows the session you look at in the Claude app and shows the work item it is on.'}
            </p>
          )}
        </div>
        <div className="panel-foot">
          <input id="follow-claude-code" type="checkbox" checked={!!follow?.on} onChange={() => void toggleFollow()} disabled={!follow} />
          <label htmlFor="follow-claude-code" title={follow ? `Reads the agent's answers in ${follow.dir} and the Claude app's log, on this computer only` : undefined}>
            Follow Claude Code{follow && !follow.found ? ' (not found)' : ''}
          </label>
          <span className="grow" />
          <button onClick={() => void bridge.show()}>Open Weave</button>
        </div>
      </div>
    </div>
  );
}
