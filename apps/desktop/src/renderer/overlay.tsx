import { useEffect, useState, type MouseEvent } from 'react';
import type { ClaudeCodeFollow, MentionInfo, Profile, SessionInfo, SpaceInfo } from '@weave/node/client';
import { ago, api, bridge, navigate, onItem } from './lib.ts';
import { PostRow } from './posts.tsx';
import { attempt } from './ui.tsx';

/** Board names say what a post is: "ideas" → an idea. */
const SINGULAR: Record<string, string> = { ideas: 'idea', issues: 'issue', proposals: 'proposal', releases: 'release', posts: 'post', showcase: 'showcase post' };

/** "idea “KMS System” in project “Weave”" */
function what(p: MentionInfo['post']): string {
  const kind = p.type === 'project' ? 'project' : p.type === 'issue' || p.type === 'proposal' ? p.type : (SINGULAR[p.board ?? ''] ?? (p.board ? `post in ${p.board}` : 'post'));
  if (p.type === 'project' || !p.space) return `${kind} “${p.title}”`;
  return `${kind} “${p.title}” in ${p.space.kind} “${p.space.name}”`;
}

/** Who pointed to it: an agent's weave_show, or a link in a Claude Code session. */
function source(m: MentionInfo): string {
  if (m.source === 'agent') return m.agent ? `${m.agent} showed it` : 'shown';
  return `in Claude Code${m.session?.folder ? ` · ${m.session.folder}` : ''}`;
}

/** What every post row needs to know: who you are and your spaces. */
interface Context {
  me: Profile;
  spaces: SpaceInfo[];
}

function MentionCard({ mention, ctx }: { mention: MentionInfo; ctx: Context }) {
  return (
    <li className="mention">
      <div className="mention-line">
        Mentioned {what(mention.post)}
        <span className="mention-when">
          {source(mention)} · {ago(mention.time)}
        </span>
      </div>
      {mention.note && <div className="mention-note">“{mention.note}”</div>}
      <PostRow post={mention.post} meDid={ctx.me.did} spaces={ctx.spaces} />
    </li>
  );
}

type StackEntry = SessionInfo['stack'][number];

/** One work item on the session's stack, shown like on a board: the top one is Now, the others wait. */
function StackCard({ entry, now, ctx }: { entry: StackEntry; now: boolean; ctx: Context }) {
  const p = entry.post;
  if ('missing' in p) return <li className="stack-item missing">A post you can't see here</li>;
  return (
    <li className={`stack-item${now ? ' now' : ''}`}>
      <span className="stack-state">
        {now ? 'Now' : 'Waiting'} · since {ago(entry.since)}
      </span>
      <PostRow post={p} meDid={ctx.me.did} spaces={ctx.spaces} />
      {now && p.prompt && <p className="stack-prompt">{p.prompt.length > 300 ? `${p.prompt.slice(0, 300)}…` : p.prompt}</p>}
    </li>
  );
}

/** The session you're looking at in the Claude app: its name, folder and work items. */
function SessionSection({ session, ctx }: { session: SessionInfo; ctx: Context }) {
  const folder = session.folder?.split(/[\\/]/).filter(Boolean).pop();
  return (
    <section className="panel-session">
      <div className="panel-session-head">
        <b>{session.title ?? 'Untitled session'}</b>
        {folder && <span className="mention-when">in {folder}</span>}
      </div>
      {session.stack.length === 0 ? (
        <p className="mention-when">No work items on this session.</p>
      ) : (
        <ul className="mentions">
          {session.stack.map((entry, i) => (
            <StackCard key={'missing' in entry.post ? `${entry.post.id}-${i}` : entry.post.id} entry={entry} now={i === 0} ctx={ctx} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Links in the panel open in Weave's main window, not in the panel. */
function openInWeave(event: MouseEvent): void {
  const link = (event.target as Element).closest?.('a[href^="#/"]');
  if (!link) return;
  event.preventDefault();
  const route = link.getAttribute('href')!;
  if (bridge.route) void bridge.route(route);
  else navigate(route);
}

/**
 * The side panel: a small window that stays on top beside your work (Claude
 * Code). It follows the session you're looking at in the Claude app and shows
 * its work items, then the posts agents point to. A card opens the post in
 * Weave. Nothing here is posted anywhere.
 */
export function MentionsPanel() {
  const [mentions, setMentions] = useState<MentionInfo[]>([]);
  const [follow, setFollow] = useState<ClaudeCodeFollow>();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [ctx, setCtx] = useState<Context>();
  // Which session to show: the one the Claude app shows (''), or one you picked (#/overlay?session=…).
  const [pinned, setPinned] = useState(() => new URLSearchParams(location.hash.split('?')[1] ?? '').get('session') ?? '');
  const [recent, setRecent] = useState<SessionInfo[]>([]);
  useEffect(() => {
    void Promise.all([api<Profile>('profile'), api<SpaceInfo[]>('spaces')]).then(([me, spaces]) => setCtx({ me, spaces }), () => {});
  }, []);
  useEffect(() => {
    const refresh = () => {
      void api<SessionInfo[]>('sessions').then(setRecent, () => {});
      void (pinned ? api<SessionInfo>('session', { id: pinned }) : api<SessionInfo | null>('focusedSession')).then(setSession, () => {});
    };
    void api<MentionInfo[]>('mentions').then(setMentions, () => {});
    void api<ClaudeCodeFollow>('claudeCode').then(setFollow, () => {});
    refresh();
    return onItem((item) => {
      if (item?.kind === 'weave.mention') setMentions((list) => [item.body as unknown as MentionInfo, ...list.filter((m) => m.id !== item.id)].slice(0, 100));
      else if (item?.kind === 'weave.focus') {
        if (!pinned) setSession(item.body as unknown as SessionInfo | null);
      }
      // A stack may have changed (they're your own sealed events): look again.
      else if (!item || item.scope !== 'live') refresh();
    });
  }, [pinned]);
  const here = session ? mentions.filter((m) => m.session?.id === session.id) : [];
  const elsewhere = session ? mentions.filter((m) => m.session?.id !== session.id) : mentions;
  const toggle = async () => {
    const next = await attempt(() => api<ClaudeCodeFollow>('followClaudeCode', { on: !follow?.on }));
    if (next) setFollow(next);
  };
  return (
    <div className="window mentions-window" onClickCapture={openInWeave}>
      <div className="title-bar mentions-drag">
        <div className="title-bar-text">Weave · {session ? 'Session' : 'Mentions'}</div>
        <div className="title-bar-controls">
          <button aria-label="Close" onClick={() => window.close()} />
        </div>
      </div>
      <div className="window-body mentions-body">
        <select className="panel-pick" value={pinned} onChange={(e) => setPinned(e.target.value)} aria-label="Which session">
          <option value="">The session open in the Claude app</option>
          {recent.map((r) => (
            <option key={`${r.provider}:${r.id}`} value={r.id}>
              {r.title ?? r.id.slice(0, 8)} ({r.stack.length})
            </option>
          ))}
        </select>
        <div className="mentions-follow" title={follow ? `Reads the agent's answers in ${follow.dir} and the Claude app's log, on this computer only` : undefined}>
          <input id="follow-claude-code" type="checkbox" checked={!!follow?.on} onChange={() => void toggle()} disabled={!follow} />
          <label htmlFor="follow-claude-code">Follow Claude Code{follow && !follow.found ? ' (not found on this computer)' : ''}</label>
        </div>
        <div className="mentions-scroll">
          {session && ctx && <SessionSection session={session} ctx={ctx} />}
          {here.length > 0 && (
            <>
              <h4 className="panel-heading">Mentioned in this session</h4>
              <ul className="mentions">
                {ctx &&
                  here.map((m) => (
                    <MentionCard key={m.id} mention={m} ctx={ctx} />
                  ))}
              </ul>
            </>
          )}
          {elsewhere.length === 0 && here.length === 0 && !session?.stack.length ? (
            <p className="empty">
              {follow?.on
                ? 'Switch to a session in the Claude app: its work items show here. Posts your agents point to (weave_show, or Weave links in their answers) show up too.'
                : 'Turn on Follow Claude Code: this panel then follows the session you look at in the Claude app, with its work items, and collects the posts your agents point to.'}
            </p>
          ) : (
            elsewhere.length > 0 && (
              <>
                {session && <h4 className="panel-heading">Elsewhere</h4>}
                <ul className="mentions">
                  {ctx &&
                    elsewhere.map((m) => (
                      <MentionCard key={m.id} mention={m} ctx={ctx} />
                    ))}
                </ul>
              </>
            )
          )}
        </div>
        <button className="mentions-weave" onClick={() => void bridge.show()}>
          Open Weave
        </button>
      </div>
    </div>
  );
}
