import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { postScene, SceneImage, SessionAvatar, SessionFigure } from './avatar.tsx';
import type { MentionInfo, PostInfo, Profile, SessionInfo, SpaceInfo } from '@weave/node/client';
import { ago, api, bridge, navigate, onItem } from './lib.ts';
import { focusNow, pick as pickSession, pinnedAway, type Following } from './follow.ts';
import { PostHeader, spaceLabel } from './posts.tsx';
import { attempt, BlobImage } from './ui.tsx';
import { folderName, running } from './sessions.tsx';
import { t, useTexts } from './texts.tsx';

/*
 * The side panel: a small window that stays on top beside your work (Claude
 * Code). It follows the session you're looking at in the Claude app and shows
 * the work item it's on, in full (as Weave shows a post, without its chat).
 * The rest of its stack and the posts agents mentioned are a click away; the
 * sessions pane lists the sessions and what they're on. Nothing here is
 * posted anywhere.
 */

/** Board names say what a post is: "ideas" → an idea (post.kind.<board>). */
const BOARD_KINDS = ['ideas', 'issues', 'proposals', 'releases', 'posts', 'showcase', 'journal'];

/** "idea in p/Weave" */
export function kindOf(p: PostInfo): string {
  const kind = p.type === 'project' ? t('word.project') : p.type === 'issue' || p.type === 'proposal' ? t(`post.kind.${p.type}`) : t(`post.kind.${BOARD_KINDS.includes(p.board ?? '') ? p.board : 'post'}`);
  return p.space && p.type !== 'project' ? t('post.kind.in', { kind, space: spaceLabel(p.space) }) : kind;
}

/** Who pointed to it: an agent's weave_show, or a link in a Claude Code session. */
function source(m: MentionInfo): string {
  if (m.source === 'agent') return m.agent ? t('mention.showed', { agent: m.agent }) : t('mention.shown');
  return t('mention.in.session', { session: m.session?.name ?? 'Claude Code', folder: m.session?.folder ? ` · ${m.session.folder}` : '' });
}

/** What every post needs to know: who you are and your spaces. */
interface Context {
  me: Profile;
  spaces: SpaceInfo[];
}

/** A post in one line, for what isn't current: kind and place, title, and a note. Click opens it in Weave. */
function Line({ post, note }: { post: PostInfo | { id: string; missing: true }; note: ReactNode }) {
  const { t } = useTexts();
  if ('missing' in post)
    return (
      <li className="panel-line muted">
        {t('panel.post.hidden')} {note}
      </li>
    );
  return (
    <li className="panel-line" data-post={post.id} title={t('panel.line.title')}>
      <a href={`#/post/${post.id}`}>{post.title}</a>
      <span className="panel-line-note">
        {kindOf(post)}
        {post.issue ? ` · ${t(`issue.status.${post.issue.status}`)}` : ''} · {note}
      </span>
    </li>
  );
}

/** The work item a session is on, in full: as Weave shows a post, without its chat, and its starting prompt. */
function CurrentItem({ post, ctx }: { post: PostInfo; ctx: Context }) {
  const { t } = useTexts();
  return (
    <section className="panel-current" data-post={post.id}>
      <PostHeader post={post} meDid={ctx.me.did} spaces={ctx.spaces} />
      {post.prompt && (
        <div className="stack-prompt">
          <b>{t('panel.starting.prompt')}</b>
          <p>{post.prompt}</p>
        </div>
      )}
    </section>
  );
}

/**
 * At the top, who works on what at a glance: the session's figure peeking in from the left, and on the right its
 * work item's picture, or without one the person who wrote it (in the post's scene).
 */
function PanelTop({ session, me }: { session: SessionInfo; me: string }) {
  const top = session.stack[0]?.post;
  const post = top && !('missing' in top) ? top : undefined;
  return (
    <div className="panel-top" aria-hidden="true">
      <SessionFigure session={session} person={me} className="panel-top-session" />
      {post?.image ? (
        <BlobImage src={post.image} className="panel-top-post" />
      ) : post ? (
        <SceneImage did={post.by.did} agent={post.by.agent} scene={postScene(post) ?? 'hello'} size={320} className="panel-top-post" />
      ) : (
        <span />
      )}
    </div>
  );
}

/** A session: the item it's on, in full. */
function SessionView({ session, ctx }: { session: SessionInfo; ctx: Context }) {
  const { t } = useTexts();
  const top = session.stack[0];
  return top && !('missing' in top.post) ? <CurrentItem post={top.post} ctx={ctx} /> : <p className="empty">{t(top ? 'panel.on.hidden.post' : 'panel.no.item')}</p>;
}

/** The foldout under Stack: the session (to bring it up in Claude), what waits on its stack, and what was mentioned there. */
function StackFoldout({ session, me, mentions, focused, onFollow, onClose }: { session: SessionInfo; me?: string; mentions: MentionInfo[]; focused: boolean; onFollow(): void; onClose(): void }) {
  const { t } = useTexts();
  const waiting = session.stack.slice(1);
  const here = mentions.filter((m) => m.session?.id === session.id);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="panel-foldout window" onClick={(e) => (e.target as Element).closest('a') && onClose()}>
      <div className="panel-heading">{t('word.session.cap')}</div>
      <div className="panel-foldout-session">
        {me && <SessionAvatar session={session} person={me} size={36} />}
        <span className="grow">
          <b title={session.description}>{session.title ?? t('session.untitled')}</b>
          <span className="panel-line-note">{[folderName(session.folder), focused ? t('panel.open.in.claude') : running(session) ? t('session.running.lc') : session.active ? t('session.active', { time: session.active }) : ''].filter(Boolean).join(' · ')}</span>
          {session.description && <span className="panel-line-note">{session.description}</span>}
        </span>
        {session.host && bridge.showSession && (
          <button onClick={() => void attempt(() => bridge.showSession!(session.host!))} title={t('panel.bring.front')}>
            {t('panel.open.claude')}
          </button>
        )}
        {!focused && (
          <button onClick={onFollow} title={t('panel.follow.title')}>
            {t('panel.follow.claude')}
          </button>
        )}
      </div>
      <div className="panel-heading">{t('panel.stack.waiting', { n: waiting.length })}</div>
      {waiting.length ? (
        <ul className="panel-lines">
          {waiting.map((entry, i) => (
            <Line key={`${entry.post.id}-${i}`} post={entry.post} note={t('panel.waiting.since', { time: entry.since })} />
          ))}
        </ul>
      ) : (
        <p className="empty">{t('panel.nothing.waits')}</p>
      )}
      <div className="panel-heading">{t('panel.mentions', { n: here.length })}</div>
      {here.length ? (
        <ul className="panel-lines">
          {here.map((m) => (
            <Line key={m.id} post={m.post} note={`${source(m)} · ${ago(m.time)}${m.note ? ` · “${m.note}”` : ''}`} />
          ))}
        </ul>
      ) : (
        <p className="empty">{t('panel.no.mentions')}</p>
      )}
    </div>
  );
}

/** The sessions pane: sessions with work items and the ones active lately, what each is on; pick one to see it. */
function SessionsPane({ focused, me, onPick }: { focused?: string; me?: string; onPick(id: string): void }) {
  const { t } = useTexts();
  const [sessions, setSessions] = useState<SessionInfo[]>();
  useEffect(() => {
    const load = () => void api<SessionInfo[]>('activeSessions', { hours: 12 }).then((all) => setSessions(all.filter((s) => !s.archived && !s.hidden)), () => {});
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
  if (!sessions.length) return <p className="empty">{t('panel.no.sessions')}</p>;
  return (
    <ul className="panel-sessions">
      {sessions.map((s) => {
        const [top, ...waiting] = s.stack;
        const state = s.id === focused ? t('panel.open.in.claude') : running(s) ? t('session.running.lc') : s.active ? t('session.active', { time: s.active }) : t('session.changed', { time: s.time });
        return (
          <li key={`${s.provider}:${s.id}`} className={`panel-session${s.id === focused ? ' focused' : ''}${running(s) ? ' running' : ''}`}>
            {me && <SessionAvatar session={s} person={me} size={32} />}
            <button className="link panel-session-pick" onClick={() => onPick(s.id)} title={t('panel.show.here')}>
              <b>
                {s.title ?? t('session.untitled')}
                {s.role && <span className={`role-badge ${s.role}`}>{t(s.role === 'driver' ? 'panel.role.driver' : s.available ? 'panel.role.worker' : 'panel.role.worker.resting')}</span>}
              </b>
              <span className="panel-line-note">{[folderName(s.folder), state].filter(Boolean).join(' · ')}</span>
              <span className="panel-session-now">
                {top ? ('missing' in top.post ? t('panel.on.hidden') : t('session.on', { title: top.post.title })) : t('panel.no.items')}
                {waiting.length ? t('session.waiting', { n: waiting.length }) : ''}
              </span>
            </button>
            {s.host && bridge.showSession && (
              <button onClick={() => void attempt(() => bridge.showSession!(s.host!))} title={t('panel.bring.front')}>
                {t('panel.open.claude')}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The overlay's word to someone new (shown once on a device): where a session's work comes from, and what you see here. */
function Intro({ onDone }: { onDone(): void }) {
  const { t } = useTexts();
  return (
    <section className="panel-intro">
      <b className="panel-intro-title">{t('panel.intro.title')}</b>
      <p>{t('panel.intro.lead')}</p>
      <div className="panel-heading">{t('panel.intro.linked')}</div>
      <p>{t('panel.intro.where')}</p>
      <div className="panel-heading">{t('panel.intro.gives')}</div>
      <ul>
        <li>{t('panel.intro.current')}</li>
        <li>{t('panel.intro.click')}</li>
        <li>{t('panel.intro.keep')}</li>
        <li>{t('panel.intro.lands')}</li>
      </ul>
      <p className="small">{t('panel.intro.switch')}</p>
      <button className="primary" onClick={onDone}>
        {t('panel.intro.ok')}
      </button>
    </section>
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
  const { t } = useTexts();
  const [mentions, setMentions] = useState<MentionInfo[]>([]);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [ctx, setCtx] = useState<Context>();
  const [pane, setPane] = useState<'session' | 'sessions'>('session');
  const [fold, setFold] = useState(false);
  // Which session to show: the one the Claude app shows, or one you picked (#/overlay?session=…) until you switch there (follow.ts).
  const [follow, setFollow] = useState<Following>(() => ({ known: false, pinned: new URLSearchParams(location.hash.split('?')[1] ?? '').get('session') ?? '' }));
  const { focused, pinned } = follow;
  const setPinned = (id: string) => setFollow((f) => ({ ...f, pinned: id }));
  // The first time on this device the panel introduces itself (#/overlay?intro=1), until you've read it.
  const [intro, setIntro] = useState(() => new URLSearchParams(location.hash.split('?')[1] ?? '').get('intro') === '1');
  useEffect(() => {
    void Promise.all([api<Profile>('profile'), api<SpaceInfo[]>('spaces')]).then(([me, spaces]) => setCtx({ me, spaces }), () => {});
  }, []);
  useEffect(() => {
    const refresh = () => {
      void api<SessionInfo | null>('focusedSession').then((s) => {
        setFollow((f) => focusNow(f, s?.id));
        if (!pinned) setSession(s);
      }, () => {});
      if (pinned) void api<SessionInfo>('session', { id: pinned }).then(setSession, () => {});
    };
    void api<MentionInfo[]>('mentions').then(setMentions, () => {});
    refresh();
    return onItem((item) => {
      if (item?.kind === 'weave.mention') setMentions((list) => [item.body as unknown as MentionInfo, ...list.filter((m) => m.id !== item.id)].slice(0, 100));
      else if (item?.kind === 'weave.focus') {
        // A switch in the Claude app ends a pick: pinned becomes '' and this runs again, showing the new one.
        const s = item.body as unknown as SessionInfo | null;
        setFollow((f) => focusNow(f, s?.id));
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
    setFollow((f) => pickSession(f, id));
    setPane('session');
  };
  return (
    <div className="window mentions-window" onClickCapture={openInWeave}>
      <div className="title-bar mentions-drag">
        <button className="panel-nav" onClick={() => setPane(pane === 'sessions' ? 'session' : 'sessions')}>
          {t(pane === 'sessions' ? 'panel.back' : 'nav.sessions')}
        </button>
        <div className="title-bar-text" />
        {pane === 'session' && session && (
          <button className={`panel-nav${fold ? ' active' : ''}`} onClick={() => setFold((f) => !f)} aria-expanded={fold}>
            {session.stack.length > 1 ? t('panel.stack.n', { n: session.stack.length - 1 }) : t('panel.stack')} ▾
          </button>
        )}
        <div className="title-bar-controls">
          <button aria-label={t('window.close')} onClick={() => window.close()} />
        </div>
      </div>
      {pane === 'session' && session && pinnedAway(follow) && (
        <div className="panel-pinned">
          <span className="grow">{t('panel.pinned', { title: session.title ?? t('session.untitled') })}</span>
          <button onClick={() => setPinned('')} title={t('panel.follow.title')}>
            {t('panel.follow.claude')}
          </button>
        </div>
      )}
      {fold && pane === 'session' && session && (
        <StackFoldout session={session} me={ctx?.me.did} mentions={mentions} focused={session.id === focused} onFollow={() => (setPinned(''), setFold(false))} onClose={() => setFold(false)} />
      )}
      <div className="mentions-scroll">
        {intro && <Intro onDone={() => setIntro(false)} />}
        {pane === 'sessions' ? (
          <SessionsPane focused={focused} me={ctx?.me.did} onPick={pick} />
        ) : session && ctx ? (
          <>
            <PanelTop session={session} me={ctx.me.did} />
            <SessionView session={session} ctx={ctx} />
          </>
        ) : (
          <p className="empty">{t('panel.pick.session')}</p>
        )}
      </div>
    </div>
  );
}
