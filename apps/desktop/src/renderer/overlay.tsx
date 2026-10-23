import { useEffect, useState } from 'react';
import type { ClaudeCodeFollow, MentionInfo, SessionInfo } from '@weave/node/client';
import { ago, api, bridge, onItem, plain, shortDid } from './lib.ts';
import { attempt, Sprite } from './ui.tsx';

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

const open = (m: MentionInfo) => attempt(() => api('openInApp', { what: 'post', post: m.post.id }));

function MentionCard({ mention }: { mention: MentionInfo }) {
  const p = mention.post;
  const text = plain(p.text);
  const where = [p.by.agent ? `u/${p.by.name ?? shortDid(p.by.did)} · ${p.by.agent}` : `u/${p.by.name ?? shortDid(p.by.did)}`, p.issue?.status].filter(Boolean).join(' · ');
  return (
    <li className="mention">
      <div className="mention-line">
        Mentioned {what(p)}
        <span className="mention-when">
          {source(mention)} · {ago(mention.time)}
        </span>
      </div>
      {mention.note && <div className="mention-note">“{mention.note}”</div>}
      <a
        className="post-embed-card"
        href="#"
        title="Open in Weave"
        onClick={(e) => {
          e.preventDefault();
          void open(mention);
        }}
      >
        <span className="post-embed-thumb">
          <Sprite seed={p.type === 'project' && p.space ? p.space.id : p.id} size={40} />
        </span>
        <span className="post-embed-body">
          <span className="post-embed-where">{where}</span>
          <b className="post-embed-title">{p.title}</b>
          {text && <span className="post-embed-text">{text.length > 160 ? `${text.slice(0, 160)}…` : text}</span>}
          <span className="post-embed-meta">
            ▲ {p.score} · {p.chat} in chat
          </span>
        </span>
      </a>
    </li>
  );
}

type StackEntry = SessionInfo['stack'][number];

/** One work item on the session's stack: the top one is Now, the others wait. */
function StackCard({ entry, now }: { entry: StackEntry; now: boolean }) {
  const p = entry.post;
  if ('missing' in p) return <li className="stack-item missing">A post you can't see here</li>;
  return (
    <li className={`stack-item${now ? ' now' : ''}`}>
      <span className="stack-state">{now ? 'Now' : 'Waiting'}</span>
      <a
        className="post-embed-card"
        href="#"
        title="Open in Weave"
        onClick={(e) => {
          e.preventDefault();
          void attempt(() => api('openInApp', { what: 'post', post: p.id }));
        }}
      >
        <span className="post-embed-body">
          <span className="post-embed-where">
            {[p.type === 'issue' ? 'issue' : (p.board ?? 'post'), p.space ? `${p.space.kind} ${p.space.name}` : '', p.issue?.status].filter(Boolean).join(' · ')}
          </span>
          <b className="post-embed-title">{p.title}</b>
          {p.prompt && now && <span className="post-embed-text">{p.prompt.length > 200 ? `${p.prompt.slice(0, 200)}…` : p.prompt}</span>}
          <span className="post-embed-meta">since {ago(entry.since)}</span>
        </span>
      </a>
    </li>
  );
}

/** The session you're looking at in the Claude app: its name, folder and work items. */
function SessionSection({ session }: { session: SessionInfo }) {
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
            <StackCard key={'id' in entry.post ? entry.post.id : i} entry={entry} now={i === 0} />
          ))}
        </ul>
      )}
    </section>
  );
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
  useEffect(() => {
    const refresh = () => void api<SessionInfo | null>('focusedSession').then(setSession, () => {});
    void api<MentionInfo[]>('mentions').then(setMentions, () => {});
    void api<ClaudeCodeFollow>('claudeCode').then(setFollow, () => {});
    refresh();
    return onItem((item) => {
      if (item?.kind === 'weave.mention') setMentions((list) => [item.body as unknown as MentionInfo, ...list.filter((m) => m.id !== item.id)].slice(0, 100));
      else if (item?.kind === 'weave.focus') setSession(item.body as unknown as SessionInfo | null);
      // A stack may have changed (they're your own sealed events): look again.
      else if (!item || item.scope !== 'live') refresh();
    });
  }, []);
  const here = session ? mentions.filter((m) => m.session?.id === session.id) : [];
  const elsewhere = session ? mentions.filter((m) => m.session?.id !== session.id) : mentions;
  const toggle = async () => {
    const next = await attempt(() => api<ClaudeCodeFollow>('followClaudeCode', { on: !follow?.on }));
    if (next) setFollow(next);
  };
  return (
    <div className="window mentions-window">
      <div className="title-bar mentions-drag">
        <div className="title-bar-text">Weave · {session ? 'Session' : 'Mentions'}</div>
        <div className="title-bar-controls">
          <button aria-label="Close" onClick={() => window.close()} />
        </div>
      </div>
      <div className="window-body mentions-body">
        <label className="mentions-follow" title={follow ? `Reads the agent's answers in ${follow.dir}, on this computer only, for links to posts` : undefined}>
          <input type="checkbox" checked={!!follow?.on} onChange={() => void toggle()} disabled={!follow} />
          <span>Follow Claude Code{follow && !follow.found ? ' (not found on this computer)' : ''}</span>
        </label>
        <div className="mentions-scroll">
          {session && <SessionSection session={session} />}
          {here.length > 0 && (
            <>
              <h4 className="panel-heading">Mentioned in this session</h4>
              <ul className="mentions">
                {here.map((m) => (
                  <MentionCard key={m.id} mention={m} />
                ))}
              </ul>
            </>
          )}
          {elsewhere.length === 0 && here.length === 0 ? (
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
                  {elsewhere.map((m) => (
                    <MentionCard key={m.id} mention={m} />
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
