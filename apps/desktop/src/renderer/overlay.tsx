import { useEffect, useState } from 'react';
import type { ClaudeCodeFollow, MentionInfo } from '@weave/node/client';
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

/**
 * The Mentions panel: a small window that stays on top beside your work (Claude
 * Code), showing the posts your agents point to, as they do. A card opens the
 * post in Weave. Nothing here is posted anywhere.
 */
export function MentionsPanel() {
  const [mentions, setMentions] = useState<MentionInfo[]>([]);
  const [follow, setFollow] = useState<ClaudeCodeFollow>();
  useEffect(() => {
    void api<MentionInfo[]>('mentions').then(setMentions, () => {});
    void api<ClaudeCodeFollow>('claudeCode').then(setFollow, () => {});
    return onItem((item) => {
      if (item?.kind === 'weave.mention') setMentions((list) => [item.body as unknown as MentionInfo, ...list.filter((m) => m.id !== item.id)].slice(0, 100));
    });
  }, []);
  const toggle = async () => {
    const next = await attempt(() => api<ClaudeCodeFollow>('followClaudeCode', { on: !follow?.on }));
    if (next) setFollow(next);
  };
  return (
    <div className="window mentions-window">
      <div className="title-bar mentions-drag">
        <div className="title-bar-text">Weave · Mentions</div>
        <div className="title-bar-controls">
          <button aria-label="Close" onClick={() => window.close()} />
        </div>
      </div>
      <div className="window-body mentions-body">
        <label className="mentions-follow" title={follow ? `Reads the agent's answers in ${follow.dir}, on this computer only, for links to posts` : undefined}>
          <input type="checkbox" checked={!!follow?.on} onChange={() => void toggle()} disabled={!follow} />
          <span>Follow Claude Code{follow && !follow.found ? ' (not found on this computer)' : ''}</span>
        </label>
        {mentions.length === 0 ? (
          <p className="empty">
            Posts your agents point to show up here: the ones they pass to weave_show, and, while Follow Claude Code is on, every Weave link they write in a Claude Code session.
          </p>
        ) : (
          <ul className="mentions">
            {mentions.map((m) => (
              <MentionCard key={m.id} mention={m} />
            ))}
          </ul>
        )}
        <button className="mentions-weave" onClick={() => void bridge.show()}>
          Open Weave
        </button>
      </div>
    </div>
  );
}
